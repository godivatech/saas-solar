import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuthContext } from "@/contexts/auth-context";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { sanitizeFormData } from "../../../../shared/utils/form-sanitizer";
import { locationService } from "@/lib/location-service";
import { capturePhotoWithOverlay } from "@/lib/photo-overlay-utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
// Select components removed - no longer needed for simplified attendance
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MapPin, Camera, Wifi, WifiOff, Loader2, CheckCircle, AlertTriangle, Timer, Clock, RefreshCw } from "lucide-react";

interface EnterpriseAttendanceCheckInProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function EnterpriseAttendanceCheckIn({ isOpen, onClose, onSuccess }: EnterpriseAttendanceCheckInProps) {
  const { user } = useAuthContext();
  const { location, error: locationError, isLoading: locationLoading, getCurrentLocation } = useGeolocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // locationService is imported as singleton

  // Simplified form states
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);

  // Location states
  const [currentAddress, setCurrentAddress] = useState<string>("");
  const [isLocationRefreshing, setIsLocationRefreshing] = useState(false);
  const [isAddressLoading, setIsAddressLoading] = useState(false);

  // Validation state
  const [policyErrors, setPolicyErrors] = useState<string[]>([]);

  // Camera states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Network status
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Check if user has blocking leave today (for frontend UX)
  const { data: todayLeaveStatus } = useQuery({
    queryKey: ['/api/leave/today-status'],
    queryFn: async () => {
      const response = await apiRequest('/api/leave/today-status', 'GET');
      if (!response.ok) return { hasBlockingLeave: false };
      return response.json();
    },
    enabled: isOpen && !!user, // Only fetch when dialog is open
    staleTime: 60000, // Cache for 1 minute
  });

  const hasBlockingLeave = todayLeaveStatus?.hasBlockingLeave || false;

  // Simple location status display
  const getLocationStatus = () => {
    if (locationError) return { text: "Location Error", color: "destructive" as const };
    if (locationLoading) return { text: "Getting Location...", color: "secondary" as const };
    if (!location) return { text: "Location Required", color: "outline" as const };

    return {
      text: "Location Ready",
      color: "default" as const
    };
  };

  const locationStatus = getLocationStatus();

  // Track last geocoded location to avoid redundant API calls
  const lastGeocodedLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  // Fetch address from location using Google Maps API (with caching)
  const fetchLocationAddress = async () => {
    if (!location) return;

    // Check if we've already geocoded a very similar location (within 50m)
    if (lastGeocodedLocationRef.current) {
      const distance = Math.sqrt(
        Math.pow((location.latitude - lastGeocodedLocationRef.current.lat) * 111000, 2) +
        Math.pow((location.longitude - lastGeocodedLocationRef.current.lng) * 111000, 2)
      );

      // If location hasn't changed significantly, skip API call
      if (distance < 50 && currentAddress) {
        console.log('Location change too small (<50m), reusing cached address');
        return;
      }
    }

    setIsAddressLoading(true);
    try {
      // Direct Google Maps reverse geocoding for accurate address
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || import.meta.env.GOOGLE_MAPS_API_KEY;

      if (apiKey) {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${location.latitude},${location.longitude}&key=${apiKey}`
        );

        if (response.ok) {
          const data = await response.json();
          if (data.results && data.results.length > 0) {
            const address = data.results[0].formatted_address;
            setCurrentAddress(address);
            // Cache this location to avoid redundant calls
            lastGeocodedLocationRef.current = { lat: location.latitude, lng: location.longitude };
            console.log('Google Maps address resolved:', address);
            return;
          }
        }
      }

      // Fallback to coordinates if Google Maps API unavailable
      setCurrentAddress(`${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`);
      console.log('Using coordinate fallback for address');
    } catch (error) {
      console.error('Failed to fetch address:', error);
      setCurrentAddress(`${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`);
    } finally {
      setIsAddressLoading(false);
    }
  };

  // Fetch address when location changes (only if significantly different)
  useEffect(() => {
    if (location && !isAddressLoading) {
      // Only fetch if we don't have an address yet, or location changed significantly
      if (!currentAddress) {
        fetchLocationAddress();
      } else if (lastGeocodedLocationRef.current) {
        const distance = Math.sqrt(
          Math.pow((location.latitude - lastGeocodedLocationRef.current.lat) * 111000, 2) +
          Math.pow((location.longitude - lastGeocodedLocationRef.current.lng) * 111000, 2)
        );
        if (distance >= 50) {
          fetchLocationAddress();
        }
      }
    }
  }, [location]);

  // Network status monitoring
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch department policies when dialog opens
  useEffect(() => {
    if (isOpen && user?.department) {
      fetchDepartmentPolicies();
    }
  }, [isOpen, user?.department]);

  // Auto-fetch location when dialog opens
  useEffect(() => {
    if (isOpen && !location && !isLocationRefreshing) {
      refreshLocation();
    }
  }, [isOpen]);

  const fetchDepartmentPolicies = async () => {
    try {
      const response = await apiRequest(`/api/departments/${user?.department}/timing`, 'GET');
      if (response.ok) {
        const policies = await response.json();
        console.log('CHECK_IN: Department policies fetched:', {
          department: user?.department,
          fullPolicies: policies
        });
        // Policies fetched but not stored since we're using simplified attendance
      }
    } catch (error) {
      console.error('Failed to fetch department policies:', error);
    }
  };

  // Simplified form validation - only require location and photo
  const validateForm = () => {
    const errors: string[] = [];

    if (!location) {
      errors.push('Location access required for check-in');
    }

    if (!capturedPhoto) {
      errors.push('Selfie photo required for attendance verification');
    }

    return { isValid: errors.length === 0, errors };
  };

  // Real-time validation
  useEffect(() => {
    const validation = validateForm();
    setPolicyErrors(validation.errors);
  }, [location, capturedPhoto]);

  const isFormValid = () => {
    return validateForm().isValid;
  };

  // Enhanced location refresh with immediate address fetch
  const refreshLocation = async () => {
    setIsLocationRefreshing(true);
    setCurrentAddress("");
    try {
      console.log('FRONTEND: Refreshing location and address...');
      await getCurrentLocation();
      console.log('FRONTEND: Location refreshed successfully');

      toast({
        title: "Location Updated",
        description: "Getting your current address...",
        variant: "default",
      });
    } catch (error) {
      console.error('FRONTEND: Location refresh failed:', error);
      toast({
        title: "Location Refresh Failed",
        description: "Unable to get current location. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLocationRefreshing(false);
    }
  };

  // Enhanced check-in mutation with enterprise validation and photo upload
  const checkInMutation = useMutation({
    mutationFn: async (explicitLocation?: any) => {
      const activeLocation = explicitLocation || location;

      if (!user?.uid || !activeLocation) {
        throw new Error('Location data not available');
      }

      // Ensure we have captured photo
      if (!capturedPhoto) {
        throw new Error('Selfie photo is required for attendance');
      }

      // Prepare request data
      let photoUploadUrl = undefined;

      // Upload photo to Cloudinary
      if (capturedPhoto) {
        console.log('FRONTEND: Uploading photo to Cloudinary...');

        try {
          const uploadResponse = await apiRequest('/api/attendance/upload-photo', 'POST', {
            imageData: capturedPhoto,
            userId: user.uid,
            attendanceType: 'office'
          });

          if (!uploadResponse.ok) {
            throw new Error('Photo upload failed');
          }

          const uploadResult = await uploadResponse.json();
          photoUploadUrl = uploadResult.url;

          console.log('FRONTEND: Photo uploaded successfully:', photoUploadUrl);

          toast({
            title: "Photo Uploaded",
            description: "Photo uploaded to cloud storage successfully",
            variant: "default",
          });
        } catch (uploadError) {
          console.error('FRONTEND: Photo upload failed:', uploadError);
          toast({
            title: "Photo Upload Failed",
            description: "Unable to upload photo. Please try again.",
            variant: "destructive",
          });
          throw new Error('Photo upload failed. Please try again.');
        }
      }

      // Device detection for attendance context
      const deviceInfo = {
        type: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? 'mobile' as const : 'desktop' as const,
        userAgent: navigator.userAgent,
        locationCapability: activeLocation.accuracy <= 10 ? 'excellent' as const : activeLocation.accuracy <= 50 ? 'good' as const : 'limited' as const
      };

      const requestData = sanitizeFormData({
        userId: user.uid,
        latitude: activeLocation.latitude,
        longitude: activeLocation.longitude,
        accuracy: activeLocation.accuracy,
        attendanceType: 'office',
        imageUrl: photoUploadUrl,
        deviceInfo
      }, []);

      console.log('FRONTEND: Sending simplified check-in request');
      console.log('Location data:', {
        latitude: activeLocation.latitude,
        longitude: activeLocation.longitude,
        accuracy: activeLocation.accuracy,
        hasPhoto: !!photoUploadUrl,
        address: currentAddress
      });

      const response = await apiRequest('/api/attendance/check-in', 'POST', requestData);

      if (!response.ok) {
        const errorData = await response.json();
        // Extract the message from backend response
        const errorMessage = errorData.message || errorData.error || `${response.status}: ${response.statusText}`;
        console.log('FRONTEND: Check-in error from backend:', errorMessage);
        throw new Error(errorMessage);
      }

      const result = await response.json();

      return result;
    },
    onSuccess: (data) => {
      console.log('FRONTEND: Check-in successful with enterprise validation');
      console.log('Location validation:', data.location?.validation);

      const validationType = data.location?.validation?.type || 'standard';
      const confidence = data.location?.validation?.confidence || 0;
      const indoorDetection = data.location?.validation?.indoorDetection ? ' (Indoor GPS)' : '';

      toast({
        title: "Check in successfully",
        variant: "default",
      });

      // Reset form
      setCapturedPhoto(null);
      setCurrentAddress("");


      // Cleanup camera
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
        setIsCameraActive(false);
      }

      // Invalidate queries to refresh attendance data
      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey[0];
          if (typeof queryKey === 'string') {
            return queryKey.includes('/api/attendance') || queryKey.includes('/api/activity-logs');
          }
          return false;
        }
      });

      onSuccess();
      onClose();
    },
    onError: (error: Error) => {
      console.log('FRONTEND: Check-in failed -', error.message);

      toast({
        title: "Check-in Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Camera functions
  const startCamera = async () => {
    try {
      console.log('CAMERA: Starting camera for attendance photo...');

      // Check for camera support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera not supported on this device');
      }

      // Enhanced video constraints for better compatibility
      const constraints = {
        video: {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          facingMode: 'user' // Front-facing camera
        },
        audio: false
      };

      console.log('CAMERA: Requesting camera access with constraints:', constraints);

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      console.log('CAMERA: Stream obtained:', {
        id: mediaStream.id,
        active: mediaStream.active,
        tracks: mediaStream.getTracks().length,
        videoTracks: mediaStream.getVideoTracks().length
      });

      // Check if video tracks are available
      const videoTracks = mediaStream.getVideoTracks();
      if (videoTracks.length === 0) {
        throw new Error('No video tracks found in stream');
      }

      setStream(mediaStream);
      setIsCameraActive(true);
      setIsVideoReady(false);

      // Video element should now be available since it's always rendered
      if (videoRef.current) {
        const video = videoRef.current;
        console.log('CAMERA: Video element found, setting up...');

        // Set essential video properties
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.controls = false;

        // Assign the stream to the video element
        console.log('CAMERA: Assigning stream to video element');
        video.srcObject = mediaStream;

        // Force play
        setTimeout(async () => {
          try {
            await video.play();
            console.log('CAMERA: Video play successful');
          } catch (playError) {
            console.warn('CAMERA: Auto-play failed, but stream should still be visible:', playError);
          }
        }, 100);

        console.log('CAMERA: Video setup complete');
      } else {
        console.error('CAMERA: Video ref is null!');
        toast({
          title: "Camera Error",
          description: "Camera display not available. Please try again.",
          variant: "destructive",
        });
        setIsCameraActive(false);
      }

    } catch (error) {
      console.error('CAMERA: Access failed:', error);
      setIsCameraActive(false);
      setIsVideoReady(false);

      let errorMessage = "Unable to access camera. ";
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage += "Please allow camera permissions and try again.";
        } else if (error.name === 'NotFoundError') {
          errorMessage += "No camera found on this device.";
        } else if (error.name === 'NotReadableError') {
          errorMessage += "Camera is being used by another application.";
        } else {
          errorMessage += error.message;
        }
      }

      toast({
        title: "Camera Access Failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      console.log('CAMERA: Capturing photo...', {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        readyState: video.readyState
      });

      if (video.videoWidth > 0 && video.videoHeight > 0) {
        // Use the new overlay utility to capture photo with timestamp and location
        const photoDataUrl = capturePhotoWithOverlay(video, canvas, {
          timestamp: new Date(),
          location: location ? {
            latitude: location.latitude,
            longitude: location.longitude,
            address: currentAddress || `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`,
            accuracy: location.accuracy
          } : undefined,
          overlayType: 'checkin'
        });

        if (photoDataUrl) {
          setCapturedPhoto(photoDataUrl);

          console.log('CAMERA: Photo captured successfully with overlay, size:', photoDataUrl.length);

          // Stop camera after capture
          if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
            setIsCameraActive(false);
          }

          toast({
            title: "Photo Captured",
            description: "Check-in photo captured with timestamp and location",
            variant: "default",
          });
        } else {
          console.error('CAMERA: Failed to capture photo with overlay');
          toast({
            title: "Capture Failed",
            description: "Failed to process photo. Please try again.",
            variant: "destructive",
          });
        }
      } else {
        console.error('CAMERA: Video not ready for capture');
        toast({
          title: "Capture Failed",
          description: "Please wait for camera to load completely before capturing",
          variant: "destructive",
        });
      }
    } else {
      console.error('CAMERA: Video or canvas element not available');
      toast({
        title: "Capture Failed",
        description: "Camera not properly initialized",
        variant: "destructive",
      });
    }
  };

  const resetPhoto = () => {
    console.log('CAMERA: Resetting photo and stopping camera...');
    setCapturedPhoto(null);
    setIsVideoReady(false);

    if (videoRef.current) {
      const video = videoRef.current;

      // Remove event listeners
      video.removeEventListener('canplay', () => { });
      video.removeEventListener('loadedmetadata', () => { });
      video.removeEventListener('playing', () => { });
      video.removeEventListener('error', () => { });

      // Clear video source
      video.srcObject = null;
      video.load();
    }

    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
        console.log('CAMERA: Stopped track:', track.kind);
      });
      setStream(null);
    }
    setIsCameraActive(false);
  };



  // Enhanced submit handler
  const handleSubmit = async () => {
    if (!isOnline) {
      toast({
        title: "No Internet Connection",
        description: "Please check your internet connection and try again.",
        variant: "destructive",
      });
      return;
    }

    let activeLocation = location;

    // Auto-fetch location if missing
    if (!activeLocation) {
      setIsLocationRefreshing(true);
      try {
        activeLocation = await getCurrentLocation();
      } catch (error) {
        console.error('Auto location fetch failed:', error);
      } finally {
        setIsLocationRefreshing(false);
      }
    }

    if (!activeLocation) {
      toast({
        title: "Location Required",
        description: "Please enable location services and try again.",
        variant: "destructive",
      });
      return;
    }

    checkInMutation.mutate(activeLocation);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] md:max-w-md max-h-[85vh] md:max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Check In
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Leave Warning - Show if user has blocking leave */}
          {hasBlockingLeave && (
            <Alert className="border-orange-200 bg-orange-50">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-900">
                <div className="font-semibold mb-1">You are on approved leave today</div>
                <div className="text-sm">
                  You have approved{" "}
                  {todayLeaveStatus?.leaveType === 'casual_leave' ? 'casual leave' : 'unpaid leave'}
                  {todayLeaveStatus?.leaveDetails?.startDate && todayLeaveStatus?.leaveDetails?.endDate && (
                    <span>
                      {" from "}
                      {new Date(todayLeaveStatus.leaveDetails.startDate).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short'
                      })}
                      {" to "}
                      {new Date(todayLeaveStatus.leaveDetails.endDate).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short'
                      })}
                    </span>
                  )}
                  . Attendance marking is disabled. Contact HR if this is a mistake.
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Network Status */}
          <div className="flex items-center gap-2 text-sm">
            {isOnline ? (
              <>
                <Wifi className="h-4 w-4 text-green-600" />
                <span>Online</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-red-600" />
                <span>Offline</span>
              </>
            )}
          </div>

          {/* Simplified Location Display */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Current Location
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant={locationStatus.color as any}>
                  {locationStatus.text}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshLocation}
                  disabled={isLocationRefreshing}
                >
                  {isLocationRefreshing ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      Getting...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Get Location
                    </>
                  )}
                </Button>
              </div>

              {/* Simplified Address Display */}
              {location && (
                <div className="space-y-2">
                  {isAddressLoading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Getting address...</span>
                    </div>
                  ) : currentAddress ? (
                    <div className="text-sm text-gray-900 bg-gray-50 p-2 rounded border">
                      {currentAddress}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-600">
                      {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                    </div>
                  )}
                </div>
              )}

              {locationError && (
                <div className="space-y-3">
                  <div className="text-sm text-red-600 bg-red-50 p-3 rounded border border-red-200">
                    {locationError.message}
                  </div>

                  {/* Mobile-responsive help instructions */}
                  <div className="text-xs text-muted-foreground space-y-2">
                    <p className="font-medium">To enable location access:</p>
                    {/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? (
                      <ul className="list-disc list-inside space-y-1 pl-2">
                        <li>Go to your device Settings → Privacy → Location Services</li>
                        <li>Turn on Location Services for your browser app</li>
                        <li>Allow location access when prompted</li>
                        <li>Try the "Get Location" button above</li>
                      </ul>
                    ) : (
                      <ul className="list-disc list-inside space-y-1 pl-2">
                        <li>Click the location/lock icon in your browser's address bar</li>
                        <li>Select "Allow" for location permissions</li>
                        <li>Ensure WiFi or internet connection is stable</li>
                        <li>Try the "Get Location" button above</li>
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>



          {/* Simplified Selfie Photo Capture */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Camera className="h-4 w-4" />
                Selfie Photo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!capturedPhoto && !isCameraActive && (
                <Button onClick={startCamera} variant="outline" className="w-full">
                  <Camera className="h-4 w-4 mr-2" />
                  Take Selfie
                </Button>
              )}

              {/* Camera view */}
              <div className="space-y-2" style={{ display: isCameraActive ? 'block' : 'none' }}>
                <div className="relative bg-black rounded border overflow-hidden">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-64 object-cover"
                    style={{
                      transform: 'scaleX(-1)',
                      minHeight: '16rem',
                      backgroundColor: '#000'
                    }}
                    onCanPlay={() => setIsVideoReady(true)}
                    onLoadedData={() => setIsVideoReady(true)}
                    onPlaying={() => setIsVideoReady(true)}
                    onLoadedMetadata={() => setIsVideoReady(true)}
                  />
                  <div className="absolute top-2 left-2 bg-red-500 text-white text-xs px-2 py-1 rounded">
                    LIVE
                  </div>
                  {!isVideoReady && isCameraActive && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white text-sm">
                      <div className="text-center">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                        <div>Loading camera...</div>
                      </div>
                    </div>
                  )}
                </div>
                {isCameraActive && (
                  <div className="flex gap-2">
                    <Button onClick={capturePhoto} className="flex-1" disabled={!isVideoReady}>
                      <Camera className="h-4 w-4 mr-2" />
                      Capture
                    </Button>
                    <Button onClick={resetPhoto} variant="outline">
                      Cancel
                    </Button>
                  </div>
                )}
              </div>

              {capturedPhoto && (
                <div className="space-y-2">
                  <img src={capturedPhoto} alt="Captured selfie" className="w-full rounded border" />
                  <Button onClick={resetPhoto} variant="outline" className="w-full">
                    Retake Photo
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Requirements Status */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Requirements:</div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                {location ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                )}
                <span>Current location</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                {capturedPhoto ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                )}
                <span>Selfie photo</span>
              </div>
            </div>
          </div>

          {/* Validation Feedback */}
          {policyErrors.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  <div className="font-medium">Please complete:</div>
                  {policyErrors.map((error, index) => (
                    <div key={index} className="text-sm">• {error}</div>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}



          {/* Submit Button with Context-Aware Messaging */}
          <Button
            onClick={handleSubmit}
            className="w-full"
            disabled={
              (!capturedPhoto) ||
              checkInMutation.isPending ||
              hasBlockingLeave ||
              !isOnline ||
              (isLocationRefreshing && !location)
            }
          >
            {checkInMutation.isPending || isLocationRefreshing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isLocationRefreshing ? "Getting Location..." : "Checking In..."}
              </>
            ) : hasBlockingLeave ? (
              <>
                <AlertTriangle className="h-4 w-4 mr-2" />
                Check-in Disabled (On Leave)
              </>
            ) : (
              <>
                <Timer className="h-4 w-4 mr-2" />
                Check In Now
              </>
            )}
          </Button>

          {!isOnline && (
            <div className="text-center text-sm text-red-600">
              Internet connection required for check-in
            </div>
          )}

          {/* Ready Status */}
          {isFormValid() && (
            <div className="text-xs text-green-600 text-center p-2 bg-green-50 rounded">
              Ready to check in! Your attendance will be recorded with current location and time.
            </div>
          )}
        </div>

        {/* Hidden canvas for photo capture */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </DialogContent>
    </Dialog>
  );
}
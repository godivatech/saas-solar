import { useState, useRef, useEffect } from "react";
import { useAuthContext } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Camera, MapPin, Clock, AlertTriangle, CheckCircle, XCircle,
  Loader2, Timer, Zap, Wifi, WifiOff, RefreshCw
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
// Removed deprecated formatTime imports - using TimeDisplay component instead
import { TimeDisplay } from "@/components/time/time-display";

interface AttendanceCheckOutProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentAttendance: any;
  departmentTiming?: any;
}


export function AttendanceCheckOut({
  isOpen,
  onClose,
  onSuccess,
  currentAttendance,
  departmentTiming
}: AttendanceCheckOutProps) {
  const { user } = useAuthContext();
  const { toast } = useToast();

  // Form states
  const [reason, setReason] = useState("");
  const [otReason, setOtReason] = useState("");
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Simple location state
  const [location, setLocation] = useState<{ latitude: number, longitude: number } | null>(null);
  const [locationAddress, setLocationAddress] = useState<string | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Track last geocoded location to avoid redundant API calls
  const lastGeocodedLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  // Camera states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Network status
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // FIXED: Simplified overtime detection - let server handle calculations
  const calculateOvertimeInfo = () => {
    if (!currentAttendance?.checkInTime || !departmentTiming) {
      return { hasOvertime: false, overtimeHours: 0, overtimeMinutes: 0, requiresPhoto: false };
    }

    const checkInTime = new Date(currentAttendance.checkInTime);
    const currentTime = new Date();
    const workingMinutes = Math.floor((currentTime.getTime() - checkInTime.getTime()) / (1000 * 60));

    // Parse department checkout time for basic UI display
    const checkOutTimeStr = departmentTiming.checkOutTime || "6:00 PM";
    const currentTimeMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

    // Simple time parsing for UI estimation only
    let departmentCheckoutMinutes = 18 * 60; // Default 6:00 PM
    const timeMatch = checkOutTimeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (timeMatch) {
      let [, hours, minutes, period] = timeMatch;
      let hour24 = parseInt(hours);
      if (period.toUpperCase() === 'PM' && hour24 !== 12) hour24 += 12;
      if (period.toUpperCase() === 'AM' && hour24 === 12) hour24 = 0;
      departmentCheckoutMinutes = hour24 * 60 + parseInt(minutes);
    }

    // FIXED: Early arrival + late departure overtime calculation
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Parse department schedule times
    const parseTime12Hour = (timeStr: string): Date => {
      const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (!timeMatch) {
        const fallback = new Date(today);
        fallback.setHours(timeStr.includes('out') ? 18 : 9, 0, 0, 0);
        return fallback;
      }

      let [, hours, minutes, period] = timeMatch;
      let hour24 = parseInt(hours);
      if (period.toUpperCase() === 'PM' && hour24 !== 12) hour24 += 12;
      if (period.toUpperCase() === 'AM' && hour24 === 12) hour24 = 0;

      const date = new Date(today);
      date.setHours(hour24, parseInt(minutes), 0, 0);
      return date;
    };

    const departCheckIn = parseTime12Hour(departmentTiming.checkInTime);
    const departCheckOut = parseTime12Hour(departmentTiming.checkOutTime);

    // Calculate early arrival + late departure overtime
    let overtimeMinutes = 0;

    // Early arrival overtime
    if (checkInTime < departCheckIn) {
      overtimeMinutes += Math.floor((departCheckIn.getTime() - checkInTime.getTime()) / (1000 * 60));
    }

    // Late departure overtime
    if (currentTime > departCheckOut) {
      overtimeMinutes += Math.floor((currentTime.getTime() - departCheckOut.getTime()) / (1000 * 60));
    }

    const hasOvertime = overtimeMinutes > 0;
    const totalWorkingMinutes = Math.floor((currentTime.getTime() - checkInTime.getTime()) / (1000 * 60));
    const overtimeThreshold = departmentTiming.overtimeThresholdMinutes || 30;
    const requiresPhoto = overtimeMinutes >= overtimeThreshold;

    return {
      hasOvertime,
      overtimeHours: Math.floor(overtimeMinutes / 60),
      overtimeMinutes: overtimeMinutes % 60,
      totalWorkingHours: Math.floor(workingMinutes / 60),
      totalWorkingMinutes: workingMinutes % 60,
      departmentWorkingHours: departmentTiming.workingHours,
      departmentOvertimeThreshold: overtimeThreshold,
      requiresPhoto,
      workingMinutesTotal: workingMinutes
    };
  };

  const overtimeInfo = calculateOvertimeInfo();

  // Calculate early checkout info (simplified - no policy enforcement)
  const calculateEarlyCheckoutInfo = () => {
    if (!currentAttendance?.checkInTime || !departmentTiming) {
      return { isEarlyCheckout: false, earlyMinutes: 0 };
    }

    const checkInTime = new Date(currentAttendance.checkInTime);
    const currentTime = new Date();
    const workingMinutes = Math.floor((currentTime.getTime() - checkInTime.getTime()) / (1000 * 60));
    const workingHours = workingMinutes / 60;
    const expectedHours = departmentTiming.workingHours || 8;

    const isEarlyCheckout = workingHours < expectedHours;
    const earlyMinutes = isEarlyCheckout ? Math.floor((expectedHours - workingHours) * 60) : 0;

    return {
      isEarlyCheckout,
      earlyMinutes,
      workingHours: Number(workingHours.toFixed(1)),
      expectedHours
    };
  };

  const earlyCheckoutInfo = calculateEarlyCheckoutInfo();

  // Overtime warning for any work beyond department checkout time
  const getOvertimeWarning = () => {
    if (!overtimeInfo.hasOvertime) return null;

    const overtimeTotal = overtimeInfo.overtimeMinutes + (overtimeInfo.overtimeHours * 60);

    return {
      type: 'overtime_detected',
      message: `Working ${overtimeTotal} minutes beyond department checkout time. Photo and reason required for overtime verification.`
    };
  };

  const overtimeWarning = getOvertimeWarning();

  useEffect(() => {
    const handleOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);

    return () => {
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
    };
  }, []);

  // Cleanup camera stream on component unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
        setIsCameraActive(false);
      }
    };
  }, [stream]);

  // Cleanup on modal close
  useEffect(() => {
    if (!isOpen && stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setIsCameraActive(false);
    }
  }, [isOpen, stream]);

  // Simple location fetching with Google Maps API (with caching)
  const getCurrentLocationWithAddress = async () => {
    setIsLoadingLocation(true);
    setLocationError(null);

    try {
      // Get user's coordinates
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocation is not supported'));
          return;
        }

        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
          }
        );
      });

      const { latitude, longitude } = position.coords;

      // Check if location changed significantly (>50m) before updating
      if (lastGeocodedLocationRef.current) {
        const distance = Math.sqrt(
          Math.pow((latitude - lastGeocodedLocationRef.current.lat) * 111000, 2) +
          Math.pow((longitude - lastGeocodedLocationRef.current.lng) * 111000, 2)
        );

        if (distance < 50 && locationAddress) {
          console.log('Location change too small (<50m), reusing cached address');
          setLocation({ latitude, longitude });
          setIsLoadingLocation(false);
          return;
        }
      }

      setLocation({ latitude, longitude });

      // Get readable address using Google Maps API
      try {
        const response = await apiRequest(`/api/reverse-geocode?lat=${latitude}&lng=${longitude}`);
        const data = await response.json();

        if (data.address) {
          setLocationAddress(data.address);
          lastGeocodedLocationRef.current = { lat: latitude, lng: longitude };
        } else {
          setLocationAddress(`Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
        }
      } catch (addressError) {
        console.error('Address lookup failed:', addressError);
        setLocationAddress(`Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
      }

    } catch (error: any) {
      console.error('Location error:', error);
      let errorMessage = 'Unable to get location';

      if (error.code === 1) {
        errorMessage = 'Location access denied. Please allow location access and try again.';
      } else if (error.code === 2) {
        errorMessage = 'Location unavailable. Please check your GPS and internet connection.';
      } else if (error.code === 3) {
        errorMessage = 'Location request timed out. Please try again.';
      }

      setLocationError(errorMessage);
    } finally {
      setIsLoadingLocation(false);
    }
  };

  // Auto-fetch location when modal opens
  useEffect(() => {
    if (isOpen) {
      getCurrentLocationWithAddress();
    }
  }, [isOpen]);

  // Camera functions
  const startCamera = async () => {
    try {
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

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Check if video tracks are available
      const videoTracks = mediaStream.getVideoTracks();
      if (videoTracks.length === 0) {
        throw new Error('No video tracks found in stream');
      }

      setStream(mediaStream);
      setIsCameraActive(true);

      if (videoRef.current) {
        const video = videoRef.current;

        // Clear any existing content and reset state
        video.srcObject = null;
        video.load();

        // Set essential video properties
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.controls = false;

        // Assign the stream
        video.srcObject = mediaStream;

        // Force play
        setTimeout(async () => {
          try {
            await video.play();
          } catch (playError) {
            console.warn('Auto-play failed, but stream should still be visible:', playError);
          }
        }, 100);
      }
    } catch (error) {
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
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const photoData = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedPhoto(photoData);
        stopCamera();
      }
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraActive(false);
  };

  const resetForm = () => {
    setCapturedPhoto(null);
    stopCamera();
  };

  // Simplified validation - only require location and photo
  const validateForm = (): string | null => {
    if (!location) return "Location access is required for check-out";
    if (!navigator.onLine) return "Internet connection is required";
    if (!capturedPhoto) return "Selfie photo is required for checkout verification";

    return null;
  };

  const handleSubmit = async () => {
    // Auto-fetch location if missing
    if (!location) {
      setIsLoadingLocation(true);
      try {
        await getCurrentLocationWithAddress();
      } catch (error) {
        console.error('Auto location fetch failed:', error);
      } finally {
        setIsLoadingLocation(false);
      }
    }

    const validationError = validateForm();
    if (validationError) {
      toast({
        title: "Validation Error",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      let photoUploadUrl = undefined;

      // Upload photo to Cloudinary
      if (capturedPhoto) {
        try {
          const uploadResponse = await apiRequest('/api/attendance/upload-photo', 'POST', {
            imageData: capturedPhoto,
            userId: user?.uid,
            attendanceType: 'checkout'
          });

          const uploadData = await uploadResponse.json();

          if (uploadData.success) {
            photoUploadUrl = uploadData.url;
          } else {
            throw new Error('Photo upload failed');
          }
        } catch (uploadError) {
          toast({
            title: "Photo Upload Failed",
            description: "Unable to upload checkout photo. Please try again.",
            variant: "destructive",
          });
          return;
        }
      }

      // Submit simplified check-out with photo URL
      const checkOutData = {
        userId: user?.uid,
        latitude: location!.latitude,
        longitude: location!.longitude,
        imageUrl: photoUploadUrl, // Use uploaded Cloudinary URL
      };

      // Get Firebase auth token
      const auth = await import('firebase/auth');
      const currentUser = auth.getAuth().currentUser;
      if (!currentUser) {
        throw new Error('User not authenticated');
      }
      const token = await currentUser.getIdToken();

      const response = await fetch('/api/attendance/check-out', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(checkOutData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to check out');
      }

      const responseData = await response.json();

      toast({
        title: "Check-out Successful",
        description: `Work session completed${overtimeInfo.hasOvertime ? ' with overtime recorded' : ''}`,
      });

      resetForm();
      onSuccess();
      onClose();

    } catch (error: any) {
      toast({
        title: "Check-out Failed",
        description: error.message || "Failed to record check-out",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] md:max-w-2xl max-h-[85vh] md:max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            Check Out from Work
          </DialogTitle>
          <DialogDescription>
            Complete your work session. Overtime verification may be required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Department Timing Info */}
          {departmentTiming && (
            <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
              <CardContent className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                  <div>
                    <div className="text-xs text-muted-foreground">Check-in Time</div>
                    <div className="text-sm font-semibold text-green-600"><TimeDisplay time={departmentTiming.checkInTime} format12Hour={true} /></div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Check-out Time</div>
                    <div className="text-sm font-semibold text-red-600"><TimeDisplay time={departmentTiming.checkOutTime} format12Hour={true} /></div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Working Hours</div>
                    <div className="text-sm font-semibold text-blue-600">{departmentTiming.workingHours}h</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">OT Threshold</div>
                    <div className="text-sm font-semibold text-orange-600">{departmentTiming.overtimeThresholdMinutes}m</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Work Summary */}
          <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Check-in Time:</span>
                  <span className="text-sm">
                    {currentAttendance?.checkInTime
                      ? <TimeDisplay time={currentAttendance.checkInTime} format12Hour={true} />
                      : 'Not available'
                    }
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Current Time:</span>
                  <span className="text-sm"><TimeDisplay time={new Date()} format12Hour={true} /></span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Total Working Time:</span>
                  <span className="text-sm font-semibold">
                    {overtimeInfo.totalWorkingHours}h {overtimeInfo.totalWorkingMinutes}m
                  </span>
                </div>
                {departmentTiming && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Standard Hours:</span>
                    <span className="text-sm">{departmentTiming.workingHours}h</span>
                  </div>
                )}
                {overtimeInfo.hasOvertime && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-orange-600">Overtime:</span>
                    <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                      <Zap className="h-3 w-3 mr-1" />
                      {overtimeInfo.overtimeHours}h {overtimeInfo.overtimeMinutes}m OT
                    </Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>



          {/* Simplified Location Display */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Location
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {location ? (
                <div className="space-y-2">
                  <div className="text-sm text-green-600 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Location captured
                  </div>
                  {isLoadingLocation ? (
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Getting address...
                    </div>
                  ) : locationAddress ? (
                    <div className="text-xs text-gray-700 bg-gray-50 p-2 rounded border">
                      📍 {locationAddress}
                    </div>
                  ) : null}
                </div>
              ) : isLoadingLocation ? (
                <div className="text-sm text-gray-500 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Getting location...
                </div>
              ) : locationError ? (
                <div className="space-y-2">
                  <div className="text-sm text-red-600 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Location Error
                  </div>
                  <div className="text-xs text-red-700 bg-red-50 p-2 rounded border">
                    {locationError}
                  </div>
                  <Button
                    onClick={getCurrentLocationWithAddress}
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    <RefreshCw className="h-3 w-3 mr-2" />
                    Try Again
                  </Button>
                </div>
              ) : (
                <div className="text-sm text-gray-500 flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Waiting for location...
                </div>
              )}
            </CardContent>
          </Card>

          {/* Simplified Selfie Photo Capture */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Camera className="h-4 w-4" />
                Checkout Selfie
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
                  />
                  <div className="absolute top-2 left-2 bg-red-500 text-white text-xs px-2 py-1 rounded">
                    LIVE
                  </div>
                </div>
                {isCameraActive && (
                  <div className="flex gap-2">
                    <Button onClick={capturePhoto} className="flex-1">
                      <Camera className="h-4 w-4 mr-2" />
                      Capture
                    </Button>
                    <Button onClick={stopCamera} variant="outline">
                      Cancel
                    </Button>
                  </div>
                )}
              </div>

              {capturedPhoto && (
                <div className="space-y-2">
                  <img src={capturedPhoto} alt="Checkout selfie" className="w-full rounded border" />
                  <Button onClick={() => setCapturedPhoto(null)} variant="outline" className="w-full">
                    Retake Photo
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>


        </div>

        <DialogFooter>
          <Button onClick={onClose} variant="outline" disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              isSubmitting ||
              !navigator.onLine ||
              !capturedPhoto ||
              (isLoadingLocation && !location)
            }
            className="bg-red-600 hover:bg-red-700"
          >
            {isSubmitting || isLoadingLocation ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isLoadingLocation ? 'Getting Location...' : 'Checking Out...'}
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Check Out
              </>
            )}
          </Button>
        </DialogFooter>

        {/* Hidden canvas for photo capture */}
        <canvas ref={canvasRef} className="hidden" />
      </DialogContent>
    </Dialog>
  );
}
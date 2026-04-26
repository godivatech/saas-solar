import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthContext } from "@/contexts/auth-context";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { sanitizeFormData } from "../../../../shared/utils/form-sanitizer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Clock, Camera, MapPin, Zap, Loader2, CheckCircle, AlertTriangle, RefreshCw } from "lucide-react";

interface ManualOTStartProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  otType?: 'early_arrival' | 'late_departure' | 'weekend' | 'holiday';
}

export function ManualOTStart({ isOpen, onClose, onSuccess, otType }: ManualOTStartProps) {
  const { user } = useAuthContext();
  const { location, error: locationError, isLoading: locationLoading, getCurrentLocation } = useGeolocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form states
  const [reason, setReason] = useState("");
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [currentAddress, setCurrentAddress] = useState<string>("");
  const [isAddressLoading, setIsAddressLoading] = useState(false);

  // Camera states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Status states
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get location status
  const getLocationStatus = () => {
    if (locationError) return { text: "Location Error", color: "destructive" as const };
    if (locationLoading) return { text: "Getting Location...", color: "secondary" as const };
    if (!location) return { text: "Location Required", color: "outline" as const };
    return { text: "Location Ready", color: "default" as const };
  };

  const locationStatus = getLocationStatus();

  // Fetch address from location using Google Maps API
  const fetchLocationAddress = async () => {
    if (!location) return;

    setIsAddressLoading(true);
    try {
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
            return;
          }
        }
      }

      // Fallback to coordinates
      setCurrentAddress(`${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`);
    } catch (error) {
      console.error('Failed to fetch address:', error);
      setCurrentAddress(`${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`);
    } finally {
      setIsAddressLoading(false);
    }
  };

  // Fetch address when location changes
  useEffect(() => {
    if (location && !currentAddress && !isAddressLoading) {
      fetchLocationAddress();
    }
  }, [location]);

  // Start camera
  const startCamera = async () => {
    try {
      setIsCameraActive(true);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
          setIsVideoReady(true);
          videoRef.current?.play();
        };
      }
    } catch (error) {
      console.error('Camera access error:', error);
      toast({
        title: "Camera Error",
        description: "Unable to access camera. Please check permissions.",
        variant: "destructive",
      });
      setIsCameraActive(false);
    }
  };

  // Capture photo
  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        const photoData = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedPhoto(photoData);
        stopCamera();
      }
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraActive(false);
    setIsVideoReady(false);
  };

  // Upload photo to Cloudinary
  const uploadPhoto = async (photoData: string): Promise<string> => {
    const response = await apiRequest('/api/attendance/upload-photo', 'POST', {
      imageData: photoData,
      userId: user?.uid,
      attendanceType: 'ot_start'
    });

    if (!response.ok) {
      throw new Error('Failed to upload photo');
    }

    const result = await response.json();
    return result.url;
  };

  // Start OT mutation
  const startOTMutation = useMutation({
    mutationFn: async () => {
      if (!user?.uid || !location || !capturedPhoto) {
        console.error('FRONTEND: Missing required data:', {
          hasUser: !!user?.uid,
          hasLocation: !!location,
          hasPhoto: !!capturedPhoto
        });
        throw new Error('Missing required data');
      }

      console.log('FRONTEND: Starting OT process...');

      // Upload photo first
      console.log('FRONTEND: Uploading photo...');
      const imageUrl = await uploadPhoto(capturedPhoto);
      console.log('FRONTEND: Photo uploaded successfully:', imageUrl);

      // Start OT session
      const requestData = {
        userId: user.uid,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        imageUrl,
        address: currentAddress,
        reason: reason.trim() || undefined
      };

      console.log('FRONTEND: Sending OT start request:', requestData);

      // ✅ MIGRATED: Use new OT session endpoint (writes to otSessions[] array)
      const response = await apiRequest('/api/ot/sessions/start', 'POST', requestData);

      console.log('FRONTEND: OT start response status:', response.status);

      if (!response.ok) {
        const error = await response.json();
        console.error('FRONTEND: OT start failed:', error);
        throw new Error(error.message || 'Failed to start OT session');
      }

      const result = await response.json();
      console.log('FRONTEND: OT start successful:', result);
      return result;
    },
    onSuccess: (data) => {
      toast({
        title: "OT Session Started",
        description: data.message,
      });

      // Invalidate attendance queries
      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey[0];
          return typeof queryKey === 'string' &&
            (queryKey.includes('/api/attendance') || queryKey.includes('/api/ot/status') || queryKey.includes('/api/ot/reports'));
        }
      });

      onSuccess();
      onClose();
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Start OT",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    }
  });

  // Reset form
  const resetForm = () => {
    setReason("");
    setCapturedPhoto(null);
    setCurrentAddress("");
    stopCamera();
  };

  // Handle form submission
  const handleSubmit = () => {
    if (!location) {
      toast({
        title: "Location Required",
        description: "Please enable location access to start OT",
        variant: "destructive",
      });
      return;
    }

    if (!capturedPhoto) {
      toast({
        title: "Photo Required",
        description: "Please take a selfie to start OT",
        variant: "destructive",
      });
      return;
    }

    startOTMutation.mutate();
  };

  // Get OT type display
  const getOTTypeDisplay = () => {
    switch (otType) {
      case 'early_arrival': return { text: 'Early Arrival OT', color: 'blue' };
      case 'late_departure': return { text: 'Late Departure OT', color: 'orange' };
      case 'weekend': return { text: 'Weekend OT', color: 'purple' };
      case 'holiday': return { text: 'Holiday OT', color: 'green' };
      default: return { text: 'Manual OT', color: 'default' };
    }
  };

  const otTypeDisplay = getOTTypeDisplay();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-orange-500" />
            Start Overtime Session
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* OT Type Badge */}
          <div className="flex justify-center">
            <Badge variant="outline" className="px-3 py-1">
              <Clock className="h-4 w-4 mr-1" />
              {otTypeDisplay.text}
            </Badge>
          </div>

          {/* Location Status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Location Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Badge variant={locationStatus.color}>
                  {locationStatus.text}
                </Badge>
                {!location && !locationLoading && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={getCurrentLocation}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Retry
                  </Button>
                )}
              </div>

              {currentAddress && (
                <div className="mt-2 text-sm text-muted-foreground">
                  {isAddressLoading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Getting address...
                    </div>
                  ) : (
                    currentAddress
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Camera Section */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Camera className="h-4 w-4" />
                Selfie Required
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!isCameraActive && !capturedPhoto && (
                <Button
                  variant="outline"
                  onClick={startCamera}
                  className="w-full"
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Take Selfie
                </Button>
              )}

              {isCameraActive && (
                <div className="space-y-2">
                  <video
                    ref={videoRef}
                    className="w-full rounded-lg"
                    autoPlay
                    playsInline
                    muted
                  />
                  <canvas ref={canvasRef} className="hidden" />

                  {isVideoReady && (
                    <div className="flex gap-2">
                      <Button onClick={capturePhoto} className="flex-1">
                        <Camera className="h-4 w-4 mr-2" />
                        Capture
                      </Button>
                      <Button variant="outline" onClick={stopCamera}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {capturedPhoto && (
                <div className="space-y-2">
                  <img
                    src={capturedPhoto}
                    alt="Captured selfie"
                    className="w-full rounded-lg"
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCapturedPhoto(null);
                      startCamera();
                    }}
                    className="w-full"
                  >
                    Retake Photo
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Reason (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (Optional)</Label>
            <Textarea
              id="reason"
              placeholder="Enter reason for overtime..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>

          {/* Submit Button */}
          <div className="flex gap-2 pt-4">
            <Button
              onClick={handleSubmit}
              disabled={!location || !capturedPhoto || startOTMutation.isPending}
              className="flex-1"
            >
              {startOTMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Starting OT...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Start OT Session
                </>
              )}
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
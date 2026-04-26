/**
 * Simple Checkout Modal - Clean Implementation
 * Handles attendance checkout with location verification and photo capture
 */

import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { sanitizeFormData } from "../../../../shared/utils/form-sanitizer";
import {
  MapPin,
  Camera,
  CheckCircle,
  User,
  AlertTriangle,
  RotateCcw,
  X,
  Loader2,
  Clock
} from "lucide-react";

interface SmartUnifiedCheckoutProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  currentAttendance: any;
}

interface LocationData {
  latitude: number;
  longitude: number;
  address: string;
  accuracy: number;
}

export function SmartUnifiedCheckout({ isOpen, onClose, onSuccess, currentAttendance }: SmartUnifiedCheckoutProps) {
  // Core states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reason, setReason] = useState('');

  // Location states
  const [location, setLocation] = useState<LocationData | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Photo states
  const [photo, setPhoto] = useState<string | null>(null);
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setReason('');
      setLocation(null);
      setPhoto(null);
      setLocationError(null);
      setIsCapturingPhoto(false);

      // Auto-detect location when modal opens
      detectLocation();
    } else {
      // Cleanup camera stream
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
    }
  }, [isOpen]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Location Detection
  const detectLocation = async () => {
    setIsLoadingLocation(true);
    setLocationError(null);

    try {
      if (!navigator.geolocation) {
        throw new Error('Location services not supported');
      }

      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
        );
      });

      const { latitude, longitude, accuracy } = position.coords;

      // Reverse geocode to get address
      let address = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

      try {
        // Try to get Google Maps API key from environment
        const googleMapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

        if (googleMapsKey) {
          const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${googleMapsKey}`;
          const geocodeResponse = await fetch(geocodeUrl);
          const geocodeData = await geocodeResponse.json();

          if (geocodeData.results?.[0]?.formatted_address) {
            address = geocodeData.results[0].formatted_address;
          }
        } else {
          // Fallback: try to get API key from backend
          try {
            const keyResponse = await apiRequest('/api/google-maps-key', 'GET');
            if (keyResponse.ok) {
              const { apiKey } = await keyResponse.json();
              const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`;
              const geocodeResponse = await fetch(geocodeUrl);
              const geocodeData = await geocodeResponse.json();

              if (geocodeData.results?.[0]?.formatted_address) {
                address = geocodeData.results[0].formatted_address;
              }
            }
          } catch (error) {
            console.warn('Could not get API key from backend:', error);
          }
        }
      } catch (error) {
        console.warn('Address lookup failed:', error);
      }

      setLocation({ latitude, longitude, address, accuracy });

      toast({
        title: "Location Captured",
        description: "Your checkout location has been detected",
      });

    } catch (error: any) {
      const errorMessage = error.code === 1
        ? "Location access denied. Please enable location services and try again."
        : "Unable to detect location. Please try again.";

      setLocationError(errorMessage);
      toast({
        title: "Location Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoadingLocation(false);
    }
  };

  // Camera Functions
  const startCamera = async () => {
    setIsCapturingPhoto(true);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
      }
    } catch (error) {
      console.error('Camera error:', error);
      setIsCapturingPhoto(false);
      toast({
        title: "Camera Error",
        description: "Unable to access camera. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Set canvas size to video size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    context.drawImage(video, 0, 0);

    // Add timestamp overlay
    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    context.fillRect(0, canvas.height - 80, canvas.width, 80);

    context.fillStyle = 'white';
    context.font = '14px Arial';
    context.fillText(
      `Checkout: ${new Date().toLocaleString()}`,
      10,
      canvas.height - 50
    );

    if (location) {
      // Handle long addresses by wrapping text
      const maxWidth = canvas.width - 20;
      const words = location.address.split(' ');
      let line = '';
      let lineHeight = 14;
      let y = canvas.height - 30;

      let isFirstLine = true;

      for (let word of words) {
        const testLine = line + word + ' ';
        const metrics = context.measureText(testLine);

        if (metrics.width > maxWidth && line !== '') {
          const prefix = isFirstLine ? 'Location: ' : '';
          context.fillText(`${prefix}${line.trim()}`, 10, y);
          line = word + ' ';
          y += lineHeight;
          isFirstLine = false;
        } else {
          line = testLine;
        }
      }

      if (line.trim()) {
        const prefix = isFirstLine ? 'Location: ' : '';
        context.fillText(`${prefix}${line.trim()}`, 10, y);
      }
    }

    // Convert to base64
    const photoDataUrl = canvas.toDataURL('image/jpeg', 0.8);
    setPhoto(photoDataUrl);

    // Stop camera
    stopCamera();

    toast({
      title: "Photo Captured",
      description: "Checkout verification photo taken successfully",
    });
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCapturingPhoto(false);
  };

  const retakePhoto = () => {
    setPhoto(null);
    startCamera();
  };

  // Submit checkout
  const checkoutMutation = useMutation({
    mutationFn: async () => {
      if (!location) {
        throw new Error('Location is required for checkout');
      }

      if (!photo) {
        throw new Error('Verification photo is required');
      }

      setIsSubmitting(true);

      try {
        // Upload photo first
        let photoUrl = null;
        const uploadResponse = await apiRequest('/api/attendance/upload-photo', 'POST', {
          imageData: photo,
          userId: currentAttendance.userId,
          attendanceType: 'checkout_verification'
        });

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload verification photo');
        }

        const uploadResult = await uploadResponse.json();
        photoUrl = uploadResult.url;

        // Submit checkout using the employee check-out endpoint
        const checkoutData = {
          userId: currentAttendance.userId,
          latitude: location.latitude,
          longitude: location.longitude,
          imageUrl: photoUrl,
          reason: reason.trim() || undefined
        };

        const response = await apiRequest('/api/attendance/check-out', 'POST', checkoutData);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Checkout failed');
        }

        return response.json();
      } finally {
        setIsSubmitting(false);
      }
    },
    onSuccess: () => {
      toast({
        title: "Checkout Successful",
        description: "You have successfully checked out for the day",
      });

      // Refresh attendance data
      queryClient.invalidateQueries({ queryKey: ['/api/attendance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/attendance/today'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ot/status'] });

      onSuccess?.();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Checkout Failed",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = () => {
    if (!location) {
      toast({
        title: "Location Required",
        description: "Please allow location access for checkout",
        variant: "destructive",
      });
      return;
    }

    if (!photo) {
      toast({
        title: "Photo Required",
        description: "Please take a verification photo for checkout",
        variant: "destructive",
      });
      return;
    }

    checkoutMutation.mutate();
  };

  const canSubmit = location && photo && reason.trim().length >= 10 && !isSubmitting;

  if (!currentAttendance) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Checkout from Work
          </DialogTitle>
          <DialogDescription>
            Complete your attendance checkout with location and photo verification
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Today's Work Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Today's Work</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Check-in:</span>
                <span>{new Date(currentAttendance.checkInTime).toLocaleTimeString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Duration:</span>
                <span>
                  {(() => {
                    const checkInTime = new Date(currentAttendance.checkInTime);
                    const currentTime = new Date();
                    const diffMs = currentTime.getTime() - checkInTime.getTime();
                    const hours = Math.floor(diffMs / (1000 * 60 * 60));
                    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
                  })()}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Location Verification */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Checkout Location
                {location && <CheckCircle className="h-4 w-4 text-green-600" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoadingLocation ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Detecting location...
                </div>
              ) : location ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">Location captured</span>
                  </div>
                  <div className="text-xs text-muted-foreground break-words">
                    {location.address}
                  </div>
                </div>
              ) : locationError ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <span className="text-sm font-medium text-red-600">Location error</span>
                  </div>
                  <div className="text-xs text-red-600">{locationError}</div>
                  <Button onClick={detectLocation} size="sm" variant="outline" className="w-full">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Try Again
                  </Button>
                </div>
              ) : (
                <Button onClick={detectLocation} variant="outline" className="w-full">
                  <MapPin className="h-4 w-4 mr-2" />
                  Get Location
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Photo Verification */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Camera className="h-4 w-4" />
                Verification Photo
                {photo && <CheckCircle className="h-4 w-4 text-green-600" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {isCapturingPhoto ? (
                <div className="space-y-3">
                  <div className="relative bg-black rounded overflow-hidden">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-48 object-cover"
                      style={{ transform: 'scaleX(-1)' }}
                    />
                    <div className="absolute top-2 left-2 bg-red-500 text-white text-xs px-2 py-1 rounded">
                      LIVE
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={capturePhoto} className="flex-1">
                      <Camera className="h-4 w-4 mr-2" />
                      Capture
                    </Button>
                    <Button onClick={stopCamera} variant="outline">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : photo ? (
                <div className="space-y-3">
                  <div className="relative">
                    <img
                      src={photo}
                      alt="Checkout verification"
                      className="w-full h-32 object-cover rounded border"
                    />
                    <Button
                      onClick={retakePhoto}
                      size="sm"
                      variant="outline"
                      className="absolute top-2 right-2"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">Photo captured</span>
                  </div>
                </div>
              ) : (
                <Button onClick={startCamera} variant="outline" className="w-full">
                  <Camera className="h-4 w-4 mr-2" />
                  Take Selfie
                </Button>
              )}
              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </CardContent>
          </Card>

          {/* Checkout Reason */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Checkout Reason <span className="text-red-600">*</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Textarea
                placeholder="Provide a detailed reason for checkout (minimum 10 characters)..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                className={reason.trim().length > 0 && reason.trim().length < 10 ? "border-red-300" : ""}
              />
              <div className="flex justify-between items-center mt-1 text-xs">
                <span className={reason.trim().length < 10 ? "text-red-500" : "text-green-600"}>
                  {reason.trim().length < 10
                    ? `Minimum 10 characters required (${10 - reason.trim().length} more needed)`
                    : "✓ Requirement met"
                  }
                </span>
                <span className="text-muted-foreground">
                  {reason.length}/500
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Submit Button */}
        <div className="flex gap-2 pt-4">
          <Button onClick={onClose} variant="outline" disabled={isSubmitting} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 bg-red-600 hover:bg-red-700"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Checking Out...
              </>
            ) : (
              <>
                <Clock className="h-4 w-4 mr-2" />
                Complete Checkout
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
/**
 * Site Visit Photo Upload Component
 * Allows adding photos to an ongoing site visit
 */

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { sanitizeFormData } from "../../../../shared/utils/form-sanitizer";
import { 
  Camera, 
  Upload,
  X,
  CheckCircle,
  RotateCcw
} from "lucide-react";
import { capturePhotoWithOverlay, PhotoOverlayOptions } from "@/lib/photo-overlay-utils";

interface PhotoUpload {
  data: string; // base64 data instead of File
  preview: string;
  description: string;
}

interface SiteVisitPhotoUploadProps {
  siteVisitId: string;
}

export function SiteVisitPhotoUpload({ siteVisitId }: SiteVisitPhotoUploadProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [photos, setPhotos] = useState<PhotoUpload[]>([]);
  
  // Camera states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [currentCamera, setCurrentCamera] = useState<'front' | 'back'>('back');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Camera functions
  const startCamera = async () => {
    try {
      console.log('PHOTO_UPLOAD_CAMERA: Starting camera...');
      
      const constraints = {
        video: {
          facingMode: currentCamera === 'front' ? 'user' : 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };
      
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      setIsCameraActive(true);
      setIsVideoReady(false);
      
      if (videoRef.current) {
        const video = videoRef.current;
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.controls = false;
        video.srcObject = mediaStream;
        
        video.onloadedmetadata = () => {
          console.log('PHOTO_UPLOAD_CAMERA: Video metadata loaded');
          setIsVideoReady(true);
        };
        
        setTimeout(async () => {
          try {
            await video.play();
            console.log('PHOTO_UPLOAD_CAMERA: Video play successful');
          } catch (playError) {
            console.warn('PHOTO_UPLOAD_CAMERA: Auto-play failed:', playError);
          }
        }, 100);
      }
      
    } catch (error) {
      console.error('PHOTO_UPLOAD_CAMERA: Access failed:', error);
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
    if (!videoRef.current || !canvasRef.current || !isVideoReady) {
      toast({
        title: "Capture Failed",
        description: "Please wait for camera to load completely",
        variant: "destructive",
      });
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      toast({
        title: "Capture Failed",
        description: "Camera feed not ready. Please wait a moment and try again.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Get current location for the overlay (basic implementation without full location service)
      const getCurrentLocation = async (): Promise<{ latitude: number; longitude: number; address: string; accuracy: number } | undefined> => {
        return new Promise((resolve) => {
          if (!navigator.geolocation) {
            resolve(undefined);
            return;
          }
          
          navigator.geolocation.getCurrentPosition(
            (position) => {
              resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                address: `Lat: ${position.coords.latitude.toFixed(6)}, Lng: ${position.coords.longitude.toFixed(6)}`,
                accuracy: position.coords.accuracy
              });
            },
            () => resolve(undefined),
            { timeout: 5000, enableHighAccuracy: false }
          );
        });
      };

      // Capture location for overlay
      getCurrentLocation().then((location) => {
        // Prepare overlay options with timestamp and location
        const overlayOptions: PhotoOverlayOptions = {
          timestamp: new Date(),
          location,
          overlayType: 'site_visit',
          customLabel: 'Additional Site Photo'
        };

        // Capture photo with overlay using the utility function
        const photoDataUrl = capturePhotoWithOverlay(video, canvas, overlayOptions);
        
        if (!photoDataUrl || photoDataUrl.length < 100) {
          throw new Error('Generated image data too small');
        }
        
        // Add captured photo to the photos array
        setPhotos(prev => [...prev, {
          data: photoDataUrl,
          preview: photoDataUrl,
          description: ''
        }]);
        
        // Stop camera after capture but keep it available for more photos
        stopCamera();
        
        toast({
          title: "Photo Captured",
          description: "Photo added with timestamp and location to your site visit collection",
          variant: "default",
        });
      });
    } catch (error) {
      console.error('PHOTO_UPLOAD_CAMERA: Photo capture error:', error);
      toast({
        title: "Capture Failed",
        description: "Failed to capture photo. Please try again.",
        variant: "destructive",
      });
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraActive(false);
    setIsVideoReady(false);
  };

  const switchCamera = async () => {
    const newCamera = currentCamera === 'front' ? 'back' : 'front';
    setCurrentCamera(newCamera);
    
    if (isCameraActive) {
      stopCamera();
      setTimeout(() => {
        startCamera();
      }, 200);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const updatePhotoDescription = (index: number, description: string) => {
    setPhotos(prev => prev.map((photo, i) => 
      i === index ? { ...photo, description } : photo
    ));
  };

  const uploadPhotosMutation = useMutation({
    mutationFn: async () => {
      // Upload photos to Cloudinary first
      const uploadedPhotos = [];
      
      for (const photo of photos) {
        try {
          const uploadResponse = await apiRequest('/api/attendance/upload-photo', 'POST', {
            imageData: photo.data, // Already base64 encoded from camera capture
            userId: `site_visit_${siteVisitId}`, // Use site visit ID for organization
            attendanceType: 'site_visit_additional'
          });

          if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json();
            throw new Error(errorData.message || 'Photo upload failed');
          }

          const uploadResult = await uploadResponse.json();
          uploadedPhotos.push({
            url: uploadResult.url,
            timestamp: new Date(),
            description: photo.description || 'Site visit photo'
          });
        } catch (error) {
          console.error('Photo upload failed:', error);
          throw error;
        }
      }

      // Add photos to site visit
      return apiRequest(`/api/site-visits/${siteVisitId}/photos`, 'POST', {
        photos: uploadedPhotos
      });
    },
    onSuccess: () => {
      toast({
        title: "Photos Uploaded",
        description: `${photos.length} photo(s) added to site visit`,
      });
      setPhotos([]);
      queryClient.invalidateQueries({ queryKey: ['/api/site-visits'] });
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload photos",
        variant: "destructive",
      });
    },
  });

  const handleUpload = () => {
    if (photos.length === 0) {
      toast({
        title: "No Photos Selected",
        description: "Please select photos to upload",
        variant: "destructive",
      });
      return;
    }

    uploadPhotosMutation.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Add Photos to Visit
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isCameraActive && (
          <div className="space-y-3">
            <Button 
              onClick={startCamera}
              variant="outline"
              className="w-full"
            >
              <Camera className="h-4 w-4 mr-2" />
              Take Photo
            </Button>
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
              <Camera className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Capture photos during your site visit
              </p>
            </div>
          </div>
        )}

        {isCameraActive && (
          <div className="space-y-3">
            <div className="relative">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-64 object-cover rounded-lg bg-black"
              />
              {!isVideoReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                  <div className="text-white text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                    <p className="text-sm">Loading camera...</p>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={switchCamera}
                disabled={!isVideoReady}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Switch to {currentCamera === 'front' ? 'Back' : 'Front'}
              </Button>
              
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={stopCamera}
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button
                  onClick={capturePhoto}
                  disabled={!isVideoReady}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Capture
                </Button>
              </div>
            </div>
          </div>
        )}

        {photos.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {photos.map((photo, index) => (
                <div key={index} className="space-y-2">
                  <div className="relative">
                    <img
                      src={photo.preview}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-32 object-cover rounded-lg"
                    />
                    <Button
                      size="sm"
                      variant="destructive"
                      className="absolute top-2 right-2 h-6 w-6 p-0"
                      onClick={() => removePhoto(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <Textarea
                    placeholder="Photo description (optional)"
                    value={photo.description}
                    onChange={(e) => updatePhotoDescription(index, e.target.value)}
                    rows={2}
                    className="text-sm"
                  />
                </div>
              ))}
            </div>

            <Button
              onClick={handleUpload}
              disabled={uploadPhotosMutation.isPending}
              className="w-full"
            >
              {uploadPhotosMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Uploading...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Upload {photos.length} Photo(s)
                </>
              )}
            </Button>
          </>
        )}

        {/* Hidden canvas for photo capture */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </CardContent>
    </Card>
  );
}
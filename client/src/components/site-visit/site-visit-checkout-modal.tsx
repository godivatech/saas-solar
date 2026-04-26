/**
 * Site Visit Checkout Modal
 * Handles the site visit checkout process with location and photo verification
 */

import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { sanitizeFormData } from "../../../../shared/utils/form-sanitizer";
import { getAuth } from 'firebase/auth';
import {
  MapPin,
  Camera,
  CheckCircle,
  Clock,
  User,
  AlertTriangle,
  RotateCcw,
  X,
  ArrowRight,
  ClipboardList,
  Calendar
} from "lucide-react";
import { EnhancedLocationCapture } from "./enhanced-location-capture";
import { LocationData } from "@/lib/location-service";
import ErrorBoundary from "@/components/error-boundary";
import { capturePhotoWithOverlay, PhotoOverlayOptions } from "@/lib/photo-overlay-utils";

interface SiteVisitCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  siteVisit: any;
}

export function SiteVisitCheckoutModal({ isOpen, onClose, siteVisit }: SiteVisitCheckoutModalProps) {
  const [step, setStep] = useState(1);
  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(null);
  const [locationCaptured, setLocationCaptured] = useState(false);
  const [notes, setNotes] = useState('');
  const [lastErrorMessage, setLastErrorMessage] = useState<string>('');

  // Visit outcome state
  const [visitOutcome, setVisitOutcome] = useState<string>('');
  const [outcomeNotes, setOutcomeNotes] = useState('');
  // const [scheduledFollowUpDate, setScheduledFollowUpDate] = useState<string>(''); // TODO: Implement in future

  // Enhanced photo capture states - Support for multiple photos
  const [capturedPhotos, setCapturedPhotos] = useState<{
    selfie: string | null;
    sitePhotos: string[];
  }>({
    selfie: null,
    sitePhotos: []
  });
  const [currentPhotoType, setCurrentPhotoType] = useState<'selfie' | 'site'>('selfie');

  // Camera states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [currentCamera, setCurrentCamera] = useState<'front' | 'back'>('back');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setCurrentLocation(null);
      setLocationCaptured(false);
      setCapturedPhotos({ selfie: null, sitePhotos: [] });
      setCurrentPhotoType('selfie');
      setNotes('');
      setLastErrorMessage('');
      setIsCameraActive(false);
      setIsVideoReady(false);
      setCurrentCamera('back');

      // Reset visit outcome state
      setVisitOutcome('');
      setOutcomeNotes('');
      // setScheduledFollowUpDate(''); // TODO: Uncomment when implementing follow-up scheduling

      // Stop any existing camera stream on modal open
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
    }
  }, [isOpen]); // Removed stream dependency to prevent form reset on camera start

  // Cleanup camera stream when modal closes or component unmounts
  useEffect(() => {
    if (!isOpen && stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isOpen, stream]);

  const handleLocationCaptured = (location: LocationData) => {
    setCurrentLocation(location);
    setLocationCaptured(true);
  };

  const handleLocationError = (error: string) => {
    if (error !== lastErrorMessage) {
      toast({
        title: "Location Error",
        description: error,
        variant: "destructive",
      });
      setLastErrorMessage(error);
    }
    setLocationCaptured(false);
  };

  // Camera functions with better error handling
  const startCamera = async () => {
    console.log('=== CHECKOUT_CAMERA: START CAMERA CLICKED ===');
    console.log('CHECKOUT_CAMERA: Function called at:', new Date().toISOString());

    // First set camera active state to trigger video element rendering
    setIsCameraActive(true);
    setIsVideoReady(false);

    try {
      console.log('CHECKOUT_CAMERA: Starting camera...');
      console.log('CHECKOUT_CAMERA: Navigator check:', !!navigator.mediaDevices);
      console.log('CHECKOUT_CAMERA: getUserMedia check:', !!navigator.mediaDevices?.getUserMedia);
      console.log('CHECKOUT_CAMERA: Current camera state:', { isCameraActive, isVideoReady });

      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not supported on this device');
      }

      // First, check available devices
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        console.log('CHECKOUT_CAMERA: Available video devices:', videoDevices.length);

        if (videoDevices.length === 0) {
          throw new Error('No camera devices found');
        }
      } catch (deviceError) {
        console.warn('CHECKOUT_CAMERA: Could not enumerate devices:', deviceError);
      }

      // Try with specific constraints first, then fall back to basic ones
      let mediaStream: MediaStream;
      const facingMode = currentCamera === 'front' ? 'user' : 'environment';

      try {
        // Try with preferred constraints
        const preferredConstraints = {
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280, min: 640, max: 1920 },
            height: { ideal: 720, min: 480, max: 1080 }
          },
          audio: false
        };

        console.log('CHECKOUT_CAMERA: Trying preferred constraints:', preferredConstraints);
        mediaStream = await navigator.mediaDevices.getUserMedia(preferredConstraints);
        console.log('CHECKOUT_CAMERA: Preferred constraints SUCCESS');
      } catch (preferredError) {
        console.warn('CHECKOUT_CAMERA: Preferred constraints failed, trying basic:', preferredError);

        try {
          // Fall back to basic constraints
          const basicConstraints = {
            video: {
              facingMode: facingMode
            },
            audio: false
          };

          mediaStream = await navigator.mediaDevices.getUserMedia(basicConstraints);
          console.log('CHECKOUT_CAMERA: Basic constraints SUCCESS');
        } catch (basicError) {
          console.warn('CHECKOUT_CAMERA: Basic constraints failed, trying minimal:', basicError);

          // Last resort - minimal constraints
          const minimalConstraints = {
            video: true,
            audio: false
          };

          mediaStream = await navigator.mediaDevices.getUserMedia(minimalConstraints);
          console.log('CHECKOUT_CAMERA: Minimal constraints SUCCESS');
        }
      }
      console.log('CHECKOUT_CAMERA: MediaStream obtained:', !!mediaStream);
      console.log('CHECKOUT_CAMERA: Stream active:', mediaStream.active);
      console.log('CHECKOUT_CAMERA: Video tracks:', mediaStream.getVideoTracks().length);

      setStream(mediaStream);

      // Wait for video element to be available with retry mechanism
      const setupVideoElement = async (stream: MediaStream, retryCount = 0): Promise<void> => {
        const maxRetries = 10;
        const retryDelay = 200; // 200ms delay between retries

        if (videoRef.current) {
          const video = videoRef.current;
          console.log('CHECKOUT_CAMERA: Setting up video element...');

          // Set video properties
          video.muted = true;
          video.playsInline = true;
          video.autoplay = true;
          video.controls = false;
          video.srcObject = stream;

          // Set up event handlers
          video.onloadedmetadata = () => {
            console.log('CHECKOUT_CAMERA: Video metadata loaded');
            console.log('CHECKOUT_CAMERA: Video dimensions:', video.videoWidth, 'x', video.videoHeight);
            setIsVideoReady(true);
          };

          video.onerror = (error) => {
            console.error('CHECKOUT_CAMERA: Video element error:', error);
          };

          // Attempt to play the video
          setTimeout(async () => {
            try {
              await video.play();
              console.log('CHECKOUT_CAMERA: Video play successful');
            } catch (playError) {
              console.warn('CHECKOUT_CAMERA: Auto-play failed, user interaction may be required:', playError);
              // Don't show error toast for auto-play failures as this is common and expected
            }
          }, 100);
        } else if (retryCount < maxRetries) {
          console.log(`CHECKOUT_CAMERA: Video element not ready, retrying in ${retryDelay}ms (attempt ${retryCount + 1}/${maxRetries})`);
          setTimeout(() => setupVideoElement(stream, retryCount + 1), retryDelay);
        } else {
          console.error('CHECKOUT_CAMERA: Failed to get video element after maximum retries');
          throw new Error('Camera initialization failed - video element not available');
        }
      };

      await setupVideoElement(mediaStream);

    } catch (error) {
      console.error('CHECKOUT_CAMERA: Access failed:', error);
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
        } else if (error.name === 'NotSupportedError') {
          errorMessage += "Camera constraints not supported.";
        } else {
          errorMessage += error.message;
        }
      }

      toast({
        title: "Camera Access Failed",
        description: errorMessage,
        variant: "destructive",
      });

      // Don't throw the error to prevent form reset
      return;
    }
  };

  const capturePhoto = () => {
    console.log('CHECKOUT_CAMERA: Attempting photo capture for:', currentPhotoType);

    if (!videoRef.current || !canvasRef.current) {
      console.error('CHECKOUT_CAMERA: Video or canvas ref not available');
      toast({
        title: "Capture Failed",
        description: "Camera not properly initialized. Please try again.",
        variant: "destructive",
      });
      return;
    }

    if (!isVideoReady) {
      console.error('CHECKOUT_CAMERA: Video not ready');
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
      console.error('CHECKOUT_CAMERA: Video dimensions invalid:', video.videoWidth, 'x', video.videoHeight);
      toast({
        title: "Capture Failed",
        description: "Camera feed not ready. Please wait a moment and try again.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Prepare overlay options with timestamp and location
      const overlayOptions: PhotoOverlayOptions = {
        timestamp: new Date(),
        location: currentLocation ? {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          address: currentLocation.formattedAddress || currentLocation.address || 'Address not available',
          accuracy: currentLocation.accuracy
        } : undefined,
        overlayType: 'site_visit',
        customLabel: currentPhotoType === 'selfie' ? 'Site Visit Checkout' : 'Site Photo Complete'
      };

      // Capture photo with overlay using the utility function
      const photoDataUrl = capturePhotoWithOverlay(video, canvas, overlayOptions);

      if (!photoDataUrl || photoDataUrl.length < 100) {
        throw new Error('Generated image data too small');
      }

      // Update the captured photos state for the current photo type
      if (currentPhotoType === 'selfie') {
        setCapturedPhotos(prev => ({
          ...prev,
          selfie: photoDataUrl
        }));
      } else {
        // For site photos, add to the array
        setCapturedPhotos(prev => ({
          ...prev,
          sitePhotos: [...prev.sitePhotos, photoDataUrl]
        }));
      }

      // Stop camera after successful capture
      stopCamera();

      console.log('CHECKOUT_CAMERA: Photo captured successfully with overlay for', currentPhotoType, 'size:', photoDataUrl.length);

      const photoTypeLabel = currentPhotoType === 'selfie' ? 'Selfie' : 'Site Photo';
      toast({
        title: "Photo Captured",
        description: `${photoTypeLabel} captured successfully with timestamp and location`,
        variant: "default",
      });
    } catch (error) {
      console.error('CHECKOUT_CAMERA: Photo capture error:', error);
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
    console.log('CHECKOUT_CAMERA: Switching camera from', currentCamera);
    const newCamera = currentCamera === 'front' ? 'back' : 'front';
    setCurrentCamera(newCamera);

    if (isCameraActive) {
      stopCamera();
      // Small delay to ensure camera is properly stopped
      setTimeout(() => {
        startCamera();
      }, 300);
    }
  };

  const resetPhoto = (photoType?: 'selfie' | 'site', photoIndex?: number) => {
    if (photoType === 'selfie') {
      setCapturedPhotos(prev => ({
        ...prev,
        selfie: null
      }));
    } else if (photoType === 'site' && photoIndex !== undefined) {
      // Remove specific site photo by index
      setCapturedPhotos(prev => ({
        ...prev,
        sitePhotos: prev.sitePhotos.filter((_, index) => index !== photoIndex)
      }));
    } else if (photoType === 'site') {
      // Clear all site photos
      setCapturedPhotos(prev => ({
        ...prev,
        sitePhotos: []
      }));
    } else {
      // Reset current photo type
      if (currentPhotoType === 'selfie') {
        setCapturedPhotos(prev => ({
          ...prev,
          selfie: null
        }));
      } else {
        setCapturedPhotos(prev => ({
          ...prev,
          sitePhotos: []
        }));
      }
    }
    stopCamera();
  };

  const startCameraForPhoto = async (photoType: 'selfie' | 'site') => {
    try {
      console.log('CHECKOUT_CAMERA: startCameraForPhoto called with photoType:', photoType);
      setCurrentPhotoType(photoType);
      // Set camera orientation based on photo type
      setCurrentCamera(photoType === 'selfie' ? 'front' : 'back');
      console.log('CHECKOUT_CAMERA: Starting camera for', photoType, 'with camera:', photoType === 'selfie' ? 'front' : 'back');
      await startCamera();
    } catch (error) {
      console.error('CHECKOUT_CAMERA: startCameraForPhoto error:', error);
      toast({
        title: "Camera Error",
        description: error instanceof Error ? error.message : "Failed to start camera",
        variant: "destructive",
      });
    }
  };

  const checkoutMutation = useMutation({
    mutationFn: async (data: any) => {
      console.log("=== CHECKOUT MUTATION STARTED ===");
      console.log("Captured photos:", {
        selfie: capturedPhotos.selfie ? 'present' : 'none',
        sitePhotos: capturedPhotos.sitePhotos.length
      });

      // Upload photos to Cloudinary if provided
      let selfiePhotoUrl: string | undefined = undefined;

      // Upload selfie photo
      if (capturedPhotos.selfie) {
        try {
          console.log("Uploading checkout selfie photo via server-side Cloudinary service...");

          // Use different naming for follow-ups vs normal site visits
          const photoPrefix = siteVisit.isFollowUp ? 'followup' : 'sitevisit';
          const uploadResponse = await apiRequest('/api/attendance/upload-photo', 'POST', {
            imageData: capturedPhotos.selfie, // Already base64 encoded
            userId: `${photoPrefix}_checkout_selfie_${Date.now()}`, // Unique ID with follow-up distinction
            attendanceType: `${photoPrefix}_checkout_selfie`
          });

          if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json();
            throw new Error(errorData.message || 'Selfie photo upload failed');
          }

          const uploadResult = await uploadResponse.json();
          selfiePhotoUrl = uploadResult.url;
          console.log("Checkout selfie photo uploaded successfully:", selfiePhotoUrl);
        } catch (error) {
          console.error('Checkout selfie photo upload failed:', error);
          toast({
            title: "Selfie Upload Failed",
            description: error instanceof Error ? error.message : "Could not upload selfie. Please try again.",
            variant: "destructive",
          });
          throw error; // Re-throw to stop the mutation
        }
      }

      // Upload site photos
      const sitePhotoUrls: Array<{
        url: string;
        location: any;
        timestamp: Date;
        description: string;
      }> = [];

      if (capturedPhotos.sitePhotos.length > 0) {
        for (let i = 0; i < capturedPhotos.sitePhotos.length; i++) {
          const sitePhoto = capturedPhotos.sitePhotos[i];
          try {
            console.log(`Uploading checkout site photo ${i + 1}/${capturedPhotos.sitePhotos.length} via server-side Cloudinary service...`);

            // Use different naming for follow-ups vs normal site visits
            const photoPrefix = siteVisit.isFollowUp ? 'followup' : 'sitevisit';
            const uploadResponse = await apiRequest('/api/attendance/upload-photo', 'POST', {
              imageData: sitePhoto, // Already base64 encoded
              userId: `${photoPrefix}_checkout_site_${Date.now()}_${i}`, // Unique ID with follow-up distinction
              attendanceType: `${photoPrefix}_checkout_site`
            });

            if (!uploadResponse.ok) {
              const errorData = await uploadResponse.json();
              throw new Error(errorData.message || `Checkout site photo ${i + 1} upload failed`);
            }

            const uploadResult = await uploadResponse.json();
            sitePhotoUrls.push({
              url: uploadResult.url,
              location: {
                latitude: currentLocation?.latitude || 0,
                longitude: currentLocation?.longitude || 0,
                accuracy: currentLocation?.accuracy,
                address: currentLocation?.formattedAddress || currentLocation?.address || 'Address not available'
              },
              timestamp: new Date(),
              description: `Site photo ${i + 1} captured during checkout`
            });
            console.log(`Checkout site photo ${i + 1} uploaded successfully:`, uploadResult.url);
          } catch (error) {
            console.error(`Checkout site photo ${i + 1} upload failed:`, error);
            toast({
              title: "Site Photo Upload Failed",
              description: error instanceof Error ? error.message : `Could not upload site photo ${i + 1}. Please try again.`,
              variant: "destructive",
            });
            throw error; // Re-throw to stop the mutation
          }
        }
      }

      // Create checkout payload - different formats for site visits vs follow-ups
      const checkoutPayload = {
        status: 'completed',
        siteOutTime: new Date(), // Send as Date object, not ISO string
        siteOutLocation: currentLocation,

        // Add visit outcome data ONLY for regular site visits (NOT for follow-ups)
        ...((!siteVisit.isFollowUp && visitOutcome) && {
          visitOutcome: visitOutcome,
          outcomeNotes: outcomeNotes || undefined,
          outcomeSelectedAt: new Date(),
          outcomeSelectedBy: getAuth().currentUser?.uid,
        }),
        // scheduledFollowUpDate: scheduledFollowUpDate ? new Date(scheduledFollowUpDate) : undefined, // TODO: Implement in future
        ...(selfiePhotoUrl && { siteOutPhotoUrl: selfiePhotoUrl }),
        // Follow-ups expect simple URL arrays, site visits expect complex photo objects
        siteOutPhotos: siteVisit.isFollowUp
          ? sitePhotoUrls.map(photo => photo.url) // Simple URL array for follow-ups
          : sitePhotoUrls, // Complex objects for regular site visits
        notes: notes, // Use 'notes' instead of 'completionNotes'
        updatedAt: new Date()
      };

      console.log("=== FRONTEND CHECKOUT REQUEST ===");
      console.log("Site Visit ID:", siteVisit.id);
      console.log("Is Follow-up:", !!siteVisit.isFollowUp);
      console.log("Checkout payload:", JSON.stringify(checkoutPayload, null, 2));
      console.log("================================");

      // Use different endpoints for regular site visits vs follow-ups
      const endpoint = siteVisit.isFollowUp
        ? `/api/follow-ups/${siteVisit.id}/checkout`
        : `/api/site-visits/${siteVisit.id}`;

      console.log("Using endpoint:", endpoint);

      // Use direct fetch to get raw response for debugging
      const auth = getAuth();
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      const token = await currentUser.getIdToken();

      const sanitizedPayload = sanitizeFormData(checkoutPayload, ['notes', 'remarks', 'description', 'outcomeNotes']);
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify(sanitizedPayload)
      });

      console.log("=== RESPONSE STATUS ===");
      console.log("Response status:", response.status);
      console.log("Response ok:", response.ok);
      console.log("Response headers:", Object.fromEntries(response.headers.entries()));
      console.log("======================");

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response' }));
        console.log("=== CHECKOUT ERROR DETAILS ===");
        console.log("Status code:", response.status);
        console.log("Error data:", errorData);
        console.log("==============================");
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log("=== CHECKOUT SUCCESS ===");
      console.log("Server response:", result);
      console.log("=======================");

      return result;
    },
    onSuccess: () => {
      toast({
        title: "Site Visit Completed",
        description: "Site visit has been successfully completed.",
        variant: "default",
      });
      // Invalidate both site visits and follow-ups queries
      queryClient.invalidateQueries({ queryKey: ['/api/site-visits'] });
      queryClient.invalidateQueries({ queryKey: ['/api/follow-ups'] });
      onClose();
    },
    onError: (error: any) => {
      console.error('Checkout failed:', error);

      // Provide more specific error messages
      let errorMessage = "Could not complete site visit. Please try again.";

      if (error?.message) {
        if (error.message.includes('413') || error.message.includes('Request entity too large')) {
          errorMessage = "Upload failed: Photos are too large. Try taking fewer photos or with lower quality.";
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          errorMessage = "Network error. Please check your connection and try again.";
        } else if (error.message.includes('timeout')) {
          errorMessage = "Upload timeout. Please try again with fewer photos.";
        } else if (error.message.includes('permission') || error.message.includes('access')) {
          errorMessage = "Access denied. Please check your permissions.";
        } else if (error.message.includes('not found')) {
          errorMessage = "Site visit not found. Please refresh the page.";
        } else {
          errorMessage = error.message;
        }
      }

      toast({
        title: "Checkout Failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  });

  const handleSubmit = () => {
    if (!locationCaptured) {
      toast({
        title: "Location Required",
        description: "Please capture your checkout location first.",
        variant: "destructive",
      });
      return;
    }

    checkoutMutation.mutate({});
  };

  const canProceedToStep2 = locationCaptured;
  // Enhanced validation - photos are optional but location is required
  const canCheckout = locationCaptured;

  if (!siteVisit) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-2xl h-[80vh] max-h-[80vh] overflow-y-auto p-2 sm:p-6 flex flex-col">
        <DialogHeader className="text-center sm:text-left flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 justify-center sm:justify-start text-base sm:text-lg">
            <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5" />
            Complete Site Visit
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Complete your site visit by capturing checkout location and photo
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="space-y-2 sm:space-y-3 pb-3">
            {/* Step Indicator */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-0">
              {/* Mobile: Vertical layout with current step highlighted */}
              <div className="flex sm:hidden w-full justify-center">
                <div className={`flex items-center gap-2 ${step >= 1 ? 'text-primary' : 'text-muted-foreground'}`}>
                  <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm ${step >= 1 ? 'bg-primary text-white' : 'bg-muted'}`}>
                    {step}
                  </div>
                  <span className="text-xs sm:text-sm font-medium">
                    {step === 1 && 'Checkout Location'}
                    {step === 2 && 'Photos & Notes'}
                    {step === 3 && !siteVisit.isFollowUp && 'Visit Outcome'}
                    {step === 3 && siteVisit.isFollowUp && 'Review & Submit'}
                  </span>
                </div>
              </div>

              {/* Desktop: Horizontal layout */}
              <div className="hidden sm:flex items-center justify-between w-full">
                <div className={`flex items-center gap-2 ${step >= 1 ? 'text-primary' : 'text-muted-foreground'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-primary text-white' : 'bg-muted'}`}>
                    1
                  </div>
                  <span className="text-sm font-medium">Checkout Location</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className={`flex items-center gap-2 ${step >= 2 ? 'text-primary' : 'text-muted-foreground'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-primary text-white' : 'bg-muted'}`}>
                    2
                  </div>
                  <span className="text-sm font-medium">Photos & Notes</span>
                </div>
                {!siteVisit.isFollowUp && (
                  <>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <div className={`flex items-center gap-2 ${step >= 3 ? 'text-primary' : 'text-muted-foreground'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 3 ? 'bg-primary text-white' : 'bg-muted'}`}>
                        3
                      </div>
                      <span className="text-sm font-medium">Visit Outcome</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Site Visit Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Site Visit Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Purpose:</span>
                  <Badge variant="outline">{siteVisit.visitPurpose}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer:</span>
                  <span className="font-medium">{siteVisit.customer?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Started:</span>
                  <span>{new Date(siteVisit.siteInTime).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Department:</span>
                  <span className="capitalize">{siteVisit.department}</span>
                </div>
              </CardContent>
            </Card>

            {/* Step 1: Location Capture */}
            {step === 1 && (
              <div className="space-y-4">
                <ErrorBoundary>
                  <EnhancedLocationCapture
                    onLocationCaptured={handleLocationCaptured}
                    onLocationError={handleLocationError}
                    title="Site Check-Out Location"
                    description="We need to detect your current location for site check-out"
                    autoDetect={true}
                    required={true}
                    showAddress={true}
                  />
                </ErrorBoundary>

                <div className="flex justify-center sm:justify-end">
                  <Button
                    onClick={() => setStep(2)}
                    disabled={!canProceedToStep2}
                    className="w-full sm:w-auto"
                  >
                    Next: Photos & Notes
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2: Photos & Notes */}
            {step === 2 && (
              <div className="space-y-4">
                {/* Selfie Photo Section */}
                <Card>
                  <CardHeader className="pb-3 sm:pb-6">
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2 justify-center sm:justify-start">
                      <User className="h-4 w-4 sm:h-5 sm:w-5" />
                      Selfie Photo (Required)
                      {capturedPhotos.selfie && <CheckCircle className="h-4 w-4 text-green-600" />}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 sm:space-y-4">
                      {!capturedPhotos.selfie && (!isCameraActive || currentPhotoType !== 'selfie') && (
                        <div className="space-y-3">
                          <Button
                            onClick={() => startCameraForPhoto('selfie')}
                            variant="outline"
                            className="w-full"
                          >
                            <Camera className="h-4 w-4 mr-2" />
                            Take Checkout Selfie
                          </Button>
                          <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 sm:p-8 text-center">
                            <User className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-2 sm:mb-4 text-muted-foreground" />
                            <p className="text-xs sm:text-sm text-muted-foreground">
                              Take a selfie to verify your identity at checkout (Required)
                            </p>
                          </div>
                        </div>
                      )}

                      {isCameraActive && currentPhotoType === 'selfie' && !capturedPhotos.selfie && (
                        <div className="space-y-3">
                          <div className="relative">
                            <video
                              ref={videoRef}
                              autoPlay
                              playsInline
                              muted
                              className="w-full h-48 sm:h-64 object-cover rounded-lg bg-black"
                            />
                            {!isVideoReady && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                                <div className="text-white text-center">
                                  <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-white mx-auto mb-2"></div>
                                  <p className="text-xs sm:text-sm">Loading front camera...</p>
                                </div>
                              </div>
                            )}
                            <Badge className="absolute top-2 left-2 text-xs bg-blue-600">
                              Checkout Selfie
                            </Badge>
                          </div>

                          <div className="flex flex-col sm:flex-row justify-between gap-2 sm:gap-0">
                            <Button
                              variant="outline"
                              onClick={switchCamera}
                              disabled={!isVideoReady}
                              className="w-full sm:w-auto order-2 sm:order-1"
                              size="sm"
                            >
                              <RotateCcw className="h-4 w-4 mr-2" />
                              <span className="hidden sm:inline">Switch to {currentCamera === 'front' ? 'Back' : 'Front'}</span>
                              <span className="sm:hidden">Switch Camera</span>
                            </Button>

                            <div className="flex gap-2 order-1 sm:order-2">
                              <Button
                                variant="destructive"
                                onClick={stopCamera}
                                className="flex-1 sm:flex-none"
                                size="sm"
                              >
                                <X className="h-4 w-4 mr-2" />
                                Cancel
                              </Button>
                              <Button
                                onClick={capturePhoto}
                                disabled={!isVideoReady}
                                className="flex-1 sm:flex-none"
                                size="sm"
                              >
                                <Camera className="h-4 w-4 mr-2" />
                                Take Selfie
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {capturedPhotos.selfie && (
                        <div className="space-y-3">
                          <div className="relative">
                            <img
                              src={capturedPhotos.selfie}
                              alt="Captured checkout selfie"
                              className="w-full h-48 sm:h-64 object-cover rounded-lg"
                            />
                            <Badge className="absolute top-2 right-2 text-xs bg-green-600">
                              Selfie Captured
                            </Badge>
                          </div>
                          <Button
                            variant="outline"
                            onClick={() => resetPhoto('selfie')}
                            className="w-full"
                            size="sm"
                          >
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Retake Selfie
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Site Photos Section */}
                <Card>
                  <CardHeader className="pb-3 sm:pb-6">
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2 justify-center sm:justify-start">
                      <MapPin className="h-4 w-4 sm:h-5 sm:w-5" />
                      Site Completion Photos (Optional)
                      {capturedPhotos.sitePhotos.length > 0 && <Badge variant="default" className="text-xs">{capturedPhotos.sitePhotos.length}</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 sm:space-y-4">
                      {/* Photo Gallery */}
                      {capturedPhotos.sitePhotos.length > 0 && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {capturedPhotos.sitePhotos.map((photo, index) => (
                              <div key={index} className="relative group">
                                <img
                                  src={photo}
                                  alt={`Site completion photo ${index + 1}`}
                                  className="w-full h-20 sm:h-24 object-cover rounded-lg"
                                />
                                <Badge className="absolute top-1 right-1 text-xs bg-green-600">
                                  {index + 1}
                                </Badge>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => resetPhoto('site', index)}
                                  className="absolute bottom-1 right-1 h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>

                          {capturedPhotos.sitePhotos.length < 20 && (
                            <Button
                              onClick={() => startCameraForPhoto('site')}
                              variant="outline"
                              className="w-full"
                              size="sm"
                            >
                              <Camera className="h-4 w-4 mr-2" />
                              Add Another Site Photo ({capturedPhotos.sitePhotos.length}/20)
                            </Button>
                          )}

                          {capturedPhotos.sitePhotos.length >= 20 && (
                            <div className="text-center p-2 bg-muted rounded-lg">
                              <p className="text-xs text-muted-foreground">Maximum 20 photos reached</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Initial capture prompt */}
                      {capturedPhotos.sitePhotos.length === 0 && (!isCameraActive || currentPhotoType !== 'site') && (
                        <div className="space-y-3">
                          <Button
                            onClick={() => startCameraForPhoto('site')}
                            variant="outline"
                            className="w-full"
                          >
                            <Camera className="h-4 w-4 mr-2" />
                            Capture Site Completion Photos
                          </Button>
                          <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 sm:p-8 text-center">
                            <MapPin className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-2 sm:mb-4 text-muted-foreground" />
                            <p className="text-xs sm:text-sm text-muted-foreground">
                              Take photos to document site completion status (up to 20 photos)
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Camera interface */}
                      {isCameraActive && currentPhotoType === 'site' && (
                        <div className="space-y-3">
                          <div className="relative">
                            <video
                              ref={videoRef}
                              autoPlay
                              playsInline
                              muted
                              className="w-full h-48 sm:h-64 object-cover rounded-lg bg-black"
                            />
                            {!isVideoReady && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                                <div className="text-white text-center">
                                  <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-white mx-auto mb-2"></div>
                                  <p className="text-xs sm:text-sm">Loading back camera...</p>
                                </div>
                              </div>
                            )}
                            <Badge className="absolute top-2 left-2 text-xs bg-orange-600">
                              Site Photo {capturedPhotos.sitePhotos.length + 1}/20
                            </Badge>
                          </div>

                          <div className="flex flex-col sm:flex-row justify-between gap-2 sm:gap-0">
                            <Button
                              variant="outline"
                              onClick={switchCamera}
                              disabled={!isVideoReady}
                              className="w-full sm:w-auto order-2 sm:order-1"
                              size="sm"
                            >
                              <RotateCcw className="h-4 w-4 mr-2" />
                              <span className="hidden sm:inline">Switch to {currentCamera === 'front' ? 'Back' : 'Front'}</span>
                              <span className="sm:hidden">Switch Camera</span>
                            </Button>

                            <div className="flex gap-2 order-1 sm:order-2">
                              <Button
                                variant="destructive"
                                onClick={stopCamera}
                                className="flex-1 sm:flex-none"
                                size="sm"
                              >
                                <X className="h-4 w-4 mr-2" />
                                Cancel
                              </Button>
                              <Button
                                onClick={capturePhoto}
                                disabled={!isVideoReady}
                                className="flex-1 sm:flex-none"
                                size="sm"
                              >
                                <Camera className="h-4 w-4 mr-2" />
                                Capture
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Completion Notes */}
                <Card>
                  <CardHeader className="pb-3 sm:pb-6">
                    <CardTitle className="text-base sm:text-lg">Completion Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add any final notes about the site visit completion..."
                      rows={3}
                      className="text-sm min-h-[60px] sm:min-h-[100px]"
                    />
                  </CardContent>
                </Card>

                {/* Summary */}
                <Card>
                  <CardHeader className="pb-3 sm:pb-6">
                    <CardTitle className="text-base sm:text-lg text-center sm:text-left">Checkout Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
                      <span className="text-muted-foreground text-sm">Location:</span>
                      <span className="text-green-600 text-sm">Captured</span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
                      <span className="text-muted-foreground text-sm">Photos:</span>
                      <div className="flex gap-2">
                        <Badge variant={capturedPhotos.selfie ? "default" : "secondary"} className="text-xs">
                          Selfie {capturedPhotos.selfie ? '✓' : '✗'}
                        </Badge>
                        <Badge variant={capturedPhotos.sitePhotos.length > 0 ? "default" : "secondary"} className="text-xs">
                          Site Photos ({capturedPhotos.sitePhotos.length})
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {!capturedPhotos.selfie && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                    <div className="flex items-center gap-2 text-red-700">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-xs sm:text-sm font-medium">Selfie photo required to complete checkout</span>
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 sm:gap-0 sm:justify-between">
                  <Button variant="outline" onClick={() => setStep(1)} className="order-2 sm:order-1 w-full sm:w-auto">
                    Back
                  </Button>
                  <Button
                    onClick={() => siteVisit.isFollowUp ? handleSubmit() : setStep(3)}
                    disabled={!capturedPhotos.selfie}
                    className="order-1 sm:order-2 w-full sm:w-auto"
                  >
                    {siteVisit.isFollowUp ? 'Complete Checkout' : 'Next: Visit Outcome'}
                    {!siteVisit.isFollowUp && <ArrowRight className="h-4 w-4 ml-2" />}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Visit Outcome Selection (Only for regular visits, NOT follow-ups) */}
            {step === 3 && !siteVisit.isFollowUp && (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3 sm:pb-6">
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2 justify-center sm:justify-start">
                      <ClipboardList className="h-4 w-4 sm:h-5 sm:w-5" />
                      Visit Outcome (Required)
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Please classify the outcome of this site visit for business tracking
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Select Visit Outcome</Label>
                        <RadioGroup value={visitOutcome} onValueChange={setVisitOutcome}>
                          {/* Context-aware options for follow-ups vs regular site visits */}
                          {siteVisit.isFollowUp ? (
                            <>
                              {/* Follow-up specific options */}
                              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                <RadioGroupItem value="completed" id="completed" data-testid="radio-completed" />
                                <Label htmlFor="completed" className="flex-1 cursor-pointer">
                                  <div className="flex flex-col">
                                    <span className="font-medium text-green-700">Completed</span>
                                    <span className="text-xs text-muted-foreground">Follow-up work finished successfully</span>
                                  </div>
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                <RadioGroupItem value="on_process" id="on_process" data-testid="radio-on-process" />
                                <Label htmlFor="on_process" className="flex-1 cursor-pointer">
                                  <div className="flex flex-col">
                                    <span className="font-medium text-yellow-700">On Process</span>
                                    <span className="text-xs text-muted-foreground">Follow-up needs more time, schedule another visit</span>
                                  </div>
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                <RadioGroupItem value="cancelled" id="cancelled" data-testid="radio-cancelled" />
                                <Label htmlFor="cancelled" className="flex-1 cursor-pointer">
                                  <div className="flex flex-col">
                                    <span className="font-medium text-red-700">Cancelled</span>
                                    <span className="text-xs text-muted-foreground">Follow-up cancelled or not feasible</span>
                                  </div>
                                </Label>
                              </div>
                            </>
                          ) : (
                            <>
                              {/* Regular site visit options */}
                              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                <RadioGroupItem value="converted" id="converted" data-testid="radio-converted" />
                                <Label htmlFor="converted" className="flex-1 cursor-pointer">
                                  <div className="flex flex-col">
                                    <span className="font-medium text-green-700">Converted</span>
                                    <span className="text-xs text-muted-foreground">Customer agreed, ready for quotation</span>
                                  </div>
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                <RadioGroupItem value="on_process" id="on_process" data-testid="radio-on-process" />
                                <Label htmlFor="on_process" className="flex-1 cursor-pointer">
                                  <div className="flex flex-col">
                                    <span className="font-medium text-yellow-700">On Process</span>
                                    <span className="text-xs text-muted-foreground">Customer needs time, schedule follow-up</span>
                                  </div>
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                <RadioGroupItem value="cancelled" id="cancelled" data-testid="radio-cancelled" />
                                <Label htmlFor="cancelled" className="flex-1 cursor-pointer">
                                  <div className="flex flex-col">
                                    <span className="font-medium text-red-700">Cancelled</span>
                                    <span className="text-xs text-muted-foreground">Customer not interested or not feasible</span>
                                  </div>
                                </Label>
                              </div>
                            </>
                          )}
                        </RadioGroup>
                      </div>



                      {/* Outcome Notes */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Additional Notes (Optional)</Label>
                        <Textarea
                          value={outcomeNotes}
                          onChange={(e) => setOutcomeNotes(e.target.value)}
                          placeholder="Add any specific details about this outcome..."
                          rows={3}
                          className="text-sm"
                          data-testid="textarea-outcome-notes"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {!visitOutcome && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-red-700">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-xs sm:text-sm font-medium">Please select a visit outcome to complete checkout</span>
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 sm:gap-0 sm:justify-between">
                  <Button variant="outline" onClick={() => setStep(2)} className="order-2 sm:order-1 w-full sm:w-auto">
                    Back
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={checkoutMutation.isPending || !visitOutcome}
                    className="flex items-center gap-2 order-1 sm:order-2 w-full sm:w-auto"
                    data-testid="button-complete-checkout"
                  >
                    {checkoutMutation.isPending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span className="hidden sm:inline">Completing...</span>
                        <span className="sm:hidden">Processing...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4" />
                        <span className="hidden sm:inline">Complete Site Visit</span>
                        <span className="sm:hidden">Complete</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Hidden canvas for photo capture */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </DialogContent>
    </Dialog>
  );
}

export default SiteVisitCheckoutModal;
/**
 * Site Visit Start Modal
 * Handles the initial site visit creation workflow
 */

import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { sanitizeFormData } from "@shared/utils/form-sanitizer";
import {
  MapPin,
  Camera,
  AlertTriangle,
  CheckCircle,
  Clock,
  ArrowRight,
  ArrowLeft,
  Users,
  Building,
  Zap,
  RotateCcw,
  X,
  User
} from "lucide-react";
import { TechnicalSiteVisitForm } from "./technical-site-visit-form";
import { MarketingSiteVisitForm } from "./marketing-site-visit-form";
import { AdminSiteVisitForm } from "./admin-site-visit-form";
import { EnhancedLocationCapture } from "./enhanced-location-capture";
import { LocationData } from "@/lib/location-service";
import ErrorBoundary from "@/components/error-boundary";
import CustomerAutocomplete from "@/components/ui/customer-autocomplete";
import { capturePhotoWithOverlay, PhotoOverlayOptions } from "@/lib/photo-overlay-utils";

interface SiteVisitStartModalProps {
  isOpen: boolean;
  onClose: () => void;
  userDepartment: string;
}

const visitPurposes = [
  { value: 'visit', label: 'Site Visit', icon: MapPin },
  { value: 'installation', label: 'Installation', icon: Building },
  { value: 'service', label: 'Service', icon: Zap },
  { value: 'purchase', label: 'Purchase', icon: Users },
  { value: 'eb_office', label: 'EB Office', icon: Building },
  { value: 'amc', label: 'AMC', icon: Clock },
  { value: 'bank', label: 'Bank', icon: Building },
  { value: 'other', label: 'Other', icon: MapPin }
];

const propertyTypes = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'agri', label: 'Agricultural' },
  { value: 'other', label: 'Other' }
];

export function SiteVisitStartModal({ isOpen, onClose, userDepartment }: SiteVisitStartModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const modalContentRef = useRef<HTMLDivElement>(null);
  const modalScrollRef = useRef<HTMLDivElement>(null);
  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(null);
  const [locationCaptured, setLocationCaptured] = useState(false);
  const [lastErrorMessage, setLastErrorMessage] = useState<string>('');

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

  // Duplicate customer tracking
  const [duplicateCustomer, setDuplicateCustomer] = useState<any>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const [formData, setFormData] = useState<{
    visitPurpose: string;
    customer: {
      name: string;
      mobile: string;
      address: string;
      ebServiceNumber: string;
      propertyType: string;
      source?: string;
    };
    notes: string;
    technicalData: any;
    marketingData: any;
    adminData: any;
  }>({
    visitPurpose: '',
    customer: {
      name: '',
      mobile: '',
      address: '',
      ebServiceNumber: '',
      propertyType: '',
      source: '',
    },
    notes: '',
    technicalData: null,
    marketingData: null,
    adminData: null
  });

  // Reset form when modal opens (but not on camera errors)
  useEffect(() => {
    if (isOpen) {
      navigateToStep(1);
      setCurrentLocation(null);
      setLocationCaptured(false);
      setCapturedPhotos({ selfie: null, sitePhotos: [] });
      setCurrentPhotoType('selfie');
      setLastErrorMessage('');
      setIsCameraActive(false);
      setIsVideoReady(false);
      setCurrentCamera('back');
      setDuplicateCustomer(null);

      setFormData({
        visitPurpose: '',
        customer: {
          name: '',
          mobile: '',
          address: '',
          ebServiceNumber: '',
          propertyType: '',
        },
        notes: '',
        technicalData: null,
        marketingData: null,
        adminData: null
      });
    }
  }, [isOpen]);

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
    // Prevent repeated toast messages for the same error
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
    console.log('=== SITE_VISIT_CAMERA: START CAMERA CLICKED ===');
    console.log('SITE_VISIT_CAMERA: Function called at:', new Date().toISOString());

    // First set camera active state to trigger video element rendering
    setIsCameraActive(true);
    setIsVideoReady(false);

    try {
      console.log('SITE_VISIT_CAMERA: Starting camera...');
      console.log('SITE_VISIT_CAMERA: Navigator check:', !!navigator.mediaDevices);
      console.log('SITE_VISIT_CAMERA: getUserMedia check:', !!navigator.mediaDevices?.getUserMedia);
      console.log('SITE_VISIT_CAMERA: Current camera state:', { isCameraActive, isVideoReady });

      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not supported on this device');
      }

      // First, check available devices
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        console.log('SITE_VISIT_CAMERA: Available video devices:', videoDevices.length);

        if (videoDevices.length === 0) {
          throw new Error('No camera devices found');
        }
      } catch (deviceError) {
        console.warn('SITE_VISIT_CAMERA: Could not enumerate devices:', deviceError);
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

        console.log('SITE_VISIT_CAMERA: Trying preferred constraints:', preferredConstraints);
        mediaStream = await navigator.mediaDevices.getUserMedia(preferredConstraints);
        console.log('SITE_VISIT_CAMERA: Preferred constraints SUCCESS');
      } catch (preferredError) {
        console.warn('SITE_VISIT_CAMERA: Preferred constraints failed, trying basic:', preferredError);

        try {
          // Fall back to basic constraints
          const basicConstraints = {
            video: {
              facingMode: facingMode
            },
            audio: false
          };

          mediaStream = await navigator.mediaDevices.getUserMedia(basicConstraints);
          console.log('SITE_VISIT_CAMERA: Basic constraints SUCCESS');
        } catch (basicError) {
          console.warn('SITE_VISIT_CAMERA: Basic constraints failed, trying minimal:', basicError);

          // Last resort - minimal constraints
          const minimalConstraints = {
            video: true,
            audio: false
          };

          mediaStream = await navigator.mediaDevices.getUserMedia(minimalConstraints);
          console.log('SITE_VISIT_CAMERA: Minimal constraints SUCCESS');
        }
      }
      console.log('SITE_VISIT_CAMERA: MediaStream obtained:', !!mediaStream);
      console.log('SITE_VISIT_CAMERA: Stream active:', mediaStream.active);
      console.log('SITE_VISIT_CAMERA: Video tracks:', mediaStream.getVideoTracks().length);

      setStream(mediaStream);

      // Wait for video element to be available with retry mechanism
      const setupVideoElement = async (stream: MediaStream, retryCount = 0): Promise<void> => {
        const maxRetries = 10;
        const retryDelay = 200; // 200ms delay between retries

        if (videoRef.current) {
          const video = videoRef.current;
          console.log('SITE_VISIT_CAMERA: Setting up video element...');

          // Set video properties
          video.muted = true;
          video.playsInline = true;
          video.autoplay = true;
          video.controls = false;

          // Directly set the stream
          video.srcObject = stream;
          console.log('SITE_VISIT_CAMERA: Stream assigned to video element');

          // Immediately mark as ready and try to play
          setIsVideoReady(true);

          try {
            await video.play();
            console.log('SITE_VISIT_CAMERA: Video play successful');
          } catch (playError) {
            console.warn('SITE_VISIT_CAMERA: Auto-play failed:', playError);
            // Still mark as ready - user can click to play if needed
          }

          console.log('SITE_VISIT_CAMERA: Video setup complete');
          return;
        } else if (retryCount < maxRetries) {
          console.log(`SITE_VISIT_CAMERA: Video element not ready, retry ${retryCount + 1}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return setupVideoElement(stream, retryCount + 1);
        } else {
          console.error('SITE_VISIT_CAMERA: Video element not available after max retries');
          throw new Error('Video element not found after waiting');
        }
      };

      await setupVideoElement(mediaStream);

    } catch (error) {
      console.error('SITE_VISIT_CAMERA: Access failed:', error);

      // Clean up on error but don't reset the entire form
      setIsCameraActive(false);
      setIsVideoReady(false);
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }

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
    console.log('SITE_VISIT_CAMERA: Attempting photo capture for:', currentPhotoType);

    if (!videoRef.current || !canvasRef.current) {
      console.error('SITE_VISIT_CAMERA: Video or canvas ref not available');
      toast({
        title: "Capture Failed",
        description: "Camera not properly initialized. Please try again.",
        variant: "destructive",
      });
      return;
    }

    if (!isVideoReady) {
      console.error('SITE_VISIT_CAMERA: Video not ready');
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
      console.error('SITE_VISIT_CAMERA: Video dimensions invalid:', video.videoWidth, 'x', video.videoHeight);
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
        customLabel: currentPhotoType === 'selfie' ? 'Site Visit Check-in' : 'Site Photo'
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

      console.log('SITE_VISIT_CAMERA: Photo captured successfully with overlay for', currentPhotoType, 'size:', photoDataUrl.length);

      const photoTypeLabel = currentPhotoType === 'selfie' ? 'Selfie' : 'Site Photo';
      toast({
        title: "Photo Captured",
        description: `${photoTypeLabel} captured successfully with timestamp and location`,
        variant: "default",
      });
    } catch (error) {
      console.error('SITE_VISIT_CAMERA: Photo capture error:', error);
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
    console.log('SITE_VISIT_CAMERA: Switching camera from', currentCamera);
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

  // Scroll to top helper function
  const scrollToTop = () => {
    // Use the actual scrolling container, not the dialog content
    if (modalScrollRef.current) {
      modalScrollRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    } else if (modalContentRef.current) {
      modalContentRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  };

  // Enhanced step navigation with scroll-to-top
  const navigateToStep = (newStep: number) => {
    setStep(newStep);
    // Add small delay to ensure DOM update before scrolling
    setTimeout(() => {
      scrollToTop();
    }, 50);
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

  const startCameraForPhoto = (photoType: 'selfie' | 'site') => {
    setCurrentPhotoType(photoType);
    // Set camera orientation based on photo type
    setCurrentCamera(photoType === 'selfie' ? 'front' : 'back');
    startCamera();
  };

  const createSiteVisitMutation = useMutation({
    mutationFn: async (data: any) => {
      console.log("=== MUTATION STARTED ===");
      console.log("Input data:", JSON.stringify(data, null, 2));
      console.log("Current location:", currentLocation);
      console.log("Captured photos:", {
        selfie: capturedPhotos.selfie ? 'present' : 'none',
        sitePhotos: capturedPhotos.sitePhotos.length
      });

      // Upload photos to Cloudinary if provided
      let selfiePhotoUrl: string | undefined = undefined;
      let sitePhotoUrl: string | undefined = undefined;

      // Upload selfie photo
      if (capturedPhotos.selfie) {
        try {
          console.log("Uploading selfie photo via server-side Cloudinary service...");

          const uploadResponse = await apiRequest('/api/attendance/upload-photo', 'POST', {
            imageData: capturedPhotos.selfie, // Already base64 encoded
            userId: `site_visit_selfie_${Date.now()}`, // Unique ID for site visit selfie photos
            attendanceType: 'site_visit_selfie'
          });

          if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json();
            throw new Error(errorData.message || 'Selfie photo upload failed');
          }

          const uploadResult = await uploadResponse.json();
          selfiePhotoUrl = uploadResult.url;
          console.log("Selfie photo uploaded successfully:", selfiePhotoUrl);
        } catch (error) {
          console.error('Selfie photo upload failed:', error);
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
            console.log(`Uploading site photo ${i + 1}/${capturedPhotos.sitePhotos.length} via server-side Cloudinary service...`);

            const uploadResponse = await apiRequest('/api/attendance/upload-photo', 'POST', {
              imageData: sitePhoto, // Already base64 encoded
              userId: `site_visit_site_${Date.now()}_${i}`, // Unique ID for each site photo
              attendanceType: 'site_visit_site'
            });

            if (!uploadResponse.ok) {
              const errorData = await uploadResponse.json();
              throw new Error(errorData.message || `Site photo ${i + 1} upload failed`);
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
              description: `Site photo ${i + 1} captured during check-in`
            });
            console.log(`Site photo ${i + 1} uploaded successfully:`, uploadResult.url);
          } catch (error) {
            console.error(`Site photo ${i + 1} upload failed:`, error);
            toast({
              title: "Site Photo Upload Failed",
              description: error instanceof Error ? error.message : `Could not upload site photo ${i + 1}. Please try again.`,
              variant: "destructive",
            });
            throw error; // Re-throw to stop the mutation
          }
        }
      }

      // Create site visit payload matching the schema exactly
      const siteVisitPayload = {
        visitPurpose: data.visitPurpose,
        siteInTime: new Date(), // Send as Date object for consistency with checkout
        siteInLocation: {
          latitude: currentLocation?.latitude || 0,
          longitude: currentLocation?.longitude || 0,
          accuracy: currentLocation?.accuracy,
          address: currentLocation?.formattedAddress || currentLocation?.address || 'Address not available'
        },
        ...(selfiePhotoUrl && { siteInPhotoUrl: selfiePhotoUrl }),
        sitePhotos: sitePhotoUrls,
        customer: {
          ...data.customer,
          ebServiceNumber: data.customer.ebServiceNumber || '',
        },
        status: 'in_progress',
        visitOutcome: 'on_process', // Automatically set new visits to on_process so they appear in the On Process tab
        customerCurrentStatus: 'on_process', // Set matching customerCurrentStatus for frontend filtering
        // Include department-specific data with correct field names
        ...(data.technicalData && { technicalData: data.technicalData }),
        ...(data.marketingData && { marketingData: data.marketingData }),
        ...(data.adminData && { adminData: data.adminData }),
        notes: data.notes || ''
      };

      // Sanitize customer data: convert empty strings to null for optional fields
      const sanitizedPayload = {
        ...siteVisitPayload,
        customer: sanitizeFormData(siteVisitPayload.customer, ['ebServiceNumber', 'address'])
      };

      console.log("=== FRONTEND SITE VISIT PAYLOAD ===");
      console.log("Payload being sent:", JSON.stringify(sanitizedPayload, null, 2));
      console.log("================================");

      try {
        console.log("Making API request to /api/site-visits...");
        const result = await apiRequest('/api/site-visits', 'POST', sanitizedPayload);
        console.log("API request successful:", result);
        return result;
      } catch (error) {
        console.error("API request failed:", error);
        throw error;
      }
    },
    onSuccess: (result) => {
      console.log("=== MUTATION SUCCESS ===");
      console.log("Result:", result);
      toast({
        title: "Site Visit Started",
        description: "Your site visit has been started successfully",
      });
      // Force refetch instead of just invalidating to bypass HTTP cache (304 Not Modified)
      queryClient.refetchQueries({ queryKey: ['/api/site-visits'] });
      queryClient.refetchQueries({ queryKey: ['/api/follow-ups'] });
      queryClient.refetchQueries({ queryKey: ['/api/site-visits/stats'] });
      // Also invalidate customer queries since site visit creation can update customer data
      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey[0];
          if (typeof queryKey === 'string') {
            return queryKey.includes('/api/customers');
          }
          return false;
        }
      });
      onClose();
    },
    onError: (error: any) => {
      console.error("=== MUTATION ERROR ===");
      console.error("Error object:", error);
      console.error("Error message:", error.message);
      console.error("Error response:", error.response);

      // Handle specific error types
      let errorMessage = "Failed to start site visit";

      // Try to parse JSON error message from the server (e.g. "400: {...}")
      if (error.message && error.message.includes('{')) {
        try {
          const jsonStart = error.message.indexOf('{');
          const jsonStr = error.message.substring(jsonStart);
          const parsed = JSON.parse(jsonStr);
          if (parsed.message) {
            errorMessage = parsed.message;
          }
        } catch (e) {
          console.log("Could not parse error message as JSON");
        }
      }

      if (error.message?.includes('413') || error.message?.includes('Request entity too large')) {
        errorMessage = "Upload failed: Photos are too large. Try taking photos with lower quality or reduce the number of photos.";
      } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
        errorMessage = "Network error. Please check your connection and try again.";
      } else if (error.message?.includes('timeout')) {
        errorMessage = "Upload timeout. Please try again with fewer photos.";
      } else if (!errorMessage || errorMessage === "Failed to start site visit") {
        // Fallback to original error message processing if JSON parsing didn't set it
        if (error.message) {
          errorMessage = error.message;
        }
      }

      toast({
        title: "Upload Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    console.log("=== HANDLE SUBMIT STARTED ===");
    console.log("Form data:", JSON.stringify(formData, null, 2));
    console.log("Location captured:", locationCaptured);
    console.log("Current location:", currentLocation);
    console.log("Can proceed to step 4:", canProceedToStep4);
    console.log("Normalized department:", normalizedDepartment);

    if (!locationCaptured || !currentLocation) {
      console.log("Validation failed: Location required");
      toast({
        title: "Location Required",
        description: "Please allow location detection to start a site visit",
        variant: "destructive",
      });
      return;
    }

    if (!formData.visitPurpose || !formData.customer.name || !formData.customer.mobile || !formData.customer.address || !formData.customer.propertyType || !formData.customer.source) {
      console.log("Validation failed: Required fields missing");
      toast({
        title: "Required Fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    // Validate department-specific data
    if (!canProceedToStep4) {
      console.log("Validation failed: Department details required");
      toast({
        title: "Department Details Required",
        description: `Please complete the ${normalizedDepartment} department specific details`,
        variant: "destructive",
      });
      return;
    }

    console.log("All validations passed, calling mutation...");
    createSiteVisitMutation.mutate(formData);
  };

  // Map administration to admin for form logic
  const normalizedDepartment = userDepartment.toLowerCase() === 'administration' ? 'admin' : userDepartment;

  // Enhanced validation functions
  const validateMobileNumber = (mobile: string) => {
    if (!mobile) return { isValid: false, message: "Mobile number is required" };
    if (mobile.length < 10) return { isValid: false, message: "Mobile number must be at least 10 digits" };
    if (mobile.length > 15) return { isValid: false, message: "Mobile number cannot exceed 15 digits" };
    if (!/^\d+$/.test(mobile)) return { isValid: false, message: "Mobile number should contain only digits" };
    return { isValid: true, message: "" };
  };

  const validateCustomerName = (name: string) => {
    if (!name) return { isValid: false, message: "Customer name is required" };
    if (name.length < 2) return { isValid: false, message: "Customer name must be at least 2 characters" };
    return { isValid: true, message: "" };
  };

  const validateAddress = (address: string) => {
    if (!address) return { isValid: false, message: "Address is required" };
    if (address.length < 3) return { isValid: false, message: "Address must be at least 3 characters" };
    return { isValid: true, message: "" };
  };

  // Validation states
  const mobileValidation = validateMobileNumber(formData.customer.mobile);
  const nameValidation = validateCustomerName(formData.customer.name);
  const addressValidation = validateAddress(formData.customer.address);

  const canProceedToStep2 = locationCaptured && formData.visitPurpose;
  const canProceedToStep3 = nameValidation.isValid && mobileValidation.isValid && addressValidation.isValid && formData.customer.propertyType && formData.customer.source;
  const canProceedToStep4 = (normalizedDepartment === 'technical' && formData.technicalData) ||
    (normalizedDepartment === 'marketing' && formData.marketingData) ||
    (normalizedDepartment === 'admin' && formData.adminData);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="w-[95vw] max-w-2xl h-[80vh] max-h-[80vh] overflow-y-auto p-2 sm:p-6 flex flex-col" ref={modalContentRef}>
          <DialogHeader className="text-center sm:text-left flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 justify-center sm:justify-start text-base sm:text-lg">
              <MapPin className="h-4 w-4 sm:h-5 sm:w-5" />
              Start Site Visit
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Follow the steps to start your field site visit for {userDepartment} department
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0" ref={modalScrollRef}>
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
                      {step === 1 && 'Purpose & Location'}
                      {step === 2 && 'Customer Details'}
                      {step === 3 && `${userDepartment.charAt(0).toUpperCase() + userDepartment.slice(1)} Details`}
                      {step === 4 && 'Photo & Confirm'}
                    </span>
                  </div>
                </div>

                {/* Desktop: Horizontal layout */}
                <div className="hidden sm:flex items-center justify-between w-full">
                  <div className={`flex items-center gap-2 ${step >= 1 ? 'text-primary' : 'text-muted-foreground'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-primary text-white' : 'bg-muted'}`}>
                      1
                    </div>
                    <span className="text-sm font-medium hidden lg:block">Purpose & Location</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <div className={`flex items-center gap-2 ${step >= 2 ? 'text-primary' : 'text-muted-foreground'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-primary text-white' : 'bg-muted'}`}>
                      2
                    </div>
                    <span className="text-sm font-medium hidden lg:block">Customer Details</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <div className={`flex items-center gap-2 ${step >= 3 ? 'text-primary' : 'text-muted-foreground'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 3 ? 'bg-primary text-white' : 'bg-muted'}`}>
                      3
                    </div>
                    <span className="text-sm font-medium hidden lg:block">{userDepartment.charAt(0).toUpperCase() + userDepartment.slice(1)} Details</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <div className={`flex items-center gap-2 ${step >= 4 ? 'text-primary' : 'text-muted-foreground'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 4 ? 'bg-primary text-white' : 'bg-muted'}`}>
                      4
                    </div>
                    <span className="text-sm font-medium hidden lg:block">Photo & Confirm</span>
                  </div>
                </div>
              </div>

              {/* Step 1: Purpose Selection & Location */}
              {step === 1 && (
                <div className="space-y-3">
                  <Card>
                    <CardHeader className="pb-3 sm:pb-6">
                      <CardTitle className="text-base sm:text-lg">Visit Purpose</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                        {visitPurposes.map((purpose) => {
                          const Icon = purpose.icon;
                          return (
                            <Card
                              key={purpose.value}
                              className={`cursor-pointer transition-colors hover:bg-accent ${formData.visitPurpose === purpose.value ? 'ring-2 ring-primary bg-accent' : ''
                                }`}
                              onClick={() => setFormData(prev => ({ ...prev, visitPurpose: purpose.value }))}
                            >
                              <CardContent className="p-2 sm:p-4 text-center">
                                <Icon className="h-4 w-4 sm:h-6 sm:w-6 mx-auto mb-1 sm:mb-2" />
                                <p className="text-xs sm:text-sm font-medium line-clamp-2">{purpose.label}</p>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  <EnhancedLocationCapture
                    onLocationCaptured={handleLocationCaptured}
                    onLocationError={handleLocationError}
                    title="Site Check-In Location"
                    description="We need to detect your current location for site check-in"
                    autoDetect={true}
                    required={true}
                    showAddress={true}
                  />

                  <div className="flex justify-center sm:justify-end">
                    <Button
                      onClick={() => navigateToStep(2)}
                      disabled={!canProceedToStep2}
                      className="w-full sm:w-auto"
                    >
                      Next: Customer Details
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 2: Customer Details */}
              {step === 2 && (
                <div className="space-y-3">
                  <Card>
                    <CardHeader className="pb-3 sm:pb-6">
                      <CardTitle className="text-base sm:text-lg">Customer Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 sm:space-y-4">
                      <div>
                        <Label htmlFor="customerName" className="text-sm">Customer Name *</Label>
                        <CustomerAutocomplete
                          value={formData.customer}
                          onChange={(customerData) => setFormData(prev => ({
                            ...prev,
                            customer: { ...prev.customer, ...customerData }
                          }))}
                          onDuplicateDetected={(existingCustomer) => {
                            setDuplicateCustomer(existingCustomer);
                          }}
                          onCustomerSelected={() => {
                            // Clear duplicate warning when customer is deliberately selected from dropdown
                            setDuplicateCustomer(null);
                          }}
                          placeholder="Start typing customer name or phone number..."
                        />
                      </div>

                      <div>
                        <Label htmlFor="customerMobile" className="text-sm">Mobile Number *</Label>
                        <Input
                          id="customerMobile"
                          type="tel"
                          value={formData.customer.mobile}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, '');
                            setFormData(prev => ({
                              ...prev,
                              customer: { ...prev.customer, mobile: value }
                            }));
                          }}
                          maxLength={15}
                          placeholder="Enter 10-digit mobile number"
                          className={`text-sm ${!mobileValidation.isValid && formData.customer.mobile ? 'border-red-500 focus:border-red-500' : ''}`}
                        />
                        {!mobileValidation.isValid && formData.customer.mobile && (
                          <p className="text-red-500 text-xs mt-1">{mobileValidation.message}</p>
                        )}
                        {mobileValidation.isValid && formData.customer.mobile && (
                          <p className="text-green-600 text-xs mt-1">✓ Valid mobile number</p>
                        )}
                      </div>

                      <div>
                        <Label htmlFor="customerAddress" className="text-sm">Address *</Label>
                        <Textarea
                          id="customerAddress"
                          value={formData.customer.address}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            customer: { ...prev.customer, address: e.target.value }
                          }))}
                          placeholder="Enter complete address (minimum 3 characters)"
                          className={`text-sm min-h-[60px] sm:min-h-[80px] ${!addressValidation.isValid && formData.customer.address ? 'border-red-500 focus:border-red-500' : ''}`}
                        />
                        {!addressValidation.isValid && formData.customer.address && (
                          <p className="text-red-500 text-xs mt-1">{addressValidation.message}</p>
                        )}
                        {addressValidation.isValid && formData.customer.address && (
                          <p className="text-green-600 text-xs mt-1">✓ Valid address</p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div>
                          <Label htmlFor="propertyType" className="text-sm">Property Type *</Label>
                          <Select
                            value={formData.customer.propertyType}
                            onValueChange={(value) => setFormData(prev => ({
                              ...prev,
                              customer: { ...prev.customer, propertyType: value }
                            }))}
                          >
                            <SelectTrigger className="text-sm">
                              <SelectValue placeholder="Select property type" />
                            </SelectTrigger>
                            <SelectContent>
                              {propertyTypes.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {userDepartment === 'marketing' && (
                          <div>
                            <Label htmlFor="ebServiceNumber" className="text-sm">EB Service Number</Label>
                            <Input
                              id="ebServiceNumber"
                              value={formData.customer.ebServiceNumber}
                              onChange={(e) => setFormData(prev => ({
                                ...prev,
                                customer: { ...prev.customer, ebServiceNumber: e.target.value }
                              }))}
                              placeholder="Enter EB service number"
                              className="text-sm"
                            />
                          </div>
                        )}
                      </div>

                      <div>
                        <Label htmlFor="source" className="text-sm">Source *</Label>
                        <Input
                          id="source"
                          value={formData.customer.source || ''}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            customer: { ...prev.customer, source: e.target.value }
                          }))}
                          placeholder="Enter source (e.g., referral, advertisement, etc.)"
                          className="text-sm"
                        />
                      </div>

                      <div>
                        <Label htmlFor="notes" className="text-sm">Additional Notes</Label>
                        <Textarea
                          id="notes"
                          value={formData.notes}
                          onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                          placeholder="Any additional notes about the visit"
                          className="text-sm min-h-[60px] sm:min-h-[80px]"
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex flex-col sm:flex-row justify-between gap-3 mt-6">
                    <Button
                      variant="outline"
                      onClick={() => setStep(1)}
                      className="w-full sm:w-auto order-2 sm:order-1 h-10 sm:h-9 text-sm sm:text-base"
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      <span className="hidden sm:inline">Back to Customer Details</span>
                      <span className="sm:hidden">Back</span>
                    </Button>
                    <Button
                      onClick={() => {
                        if (duplicateCustomer) {
                          // Check if there are actual changes to customer data
                          const hasChanges =
                            formData.customer.name !== duplicateCustomer.name ||
                            formData.customer.address !== duplicateCustomer.address ||
                            formData.customer.propertyType !== duplicateCustomer.propertyType;

                          if (hasChanges) {
                            // Show confirmation dialog only if data is changing
                            setShowConfirmDialog(true);
                          } else {
                            // No changes, proceed directly
                            navigateToStep(3);
                          }
                        } else {
                          navigateToStep(3);
                        }
                      }}
                      disabled={!canProceedToStep3}
                      className="w-full sm:w-auto order-1 sm:order-2 h-10 sm:h-9 text-sm sm:text-base"
                      data-testid="button-continue-site-visit"
                    >
                      <span className="hidden sm:inline">Continue to Site Visit</span>
                      <span className="sm:hidden">Continue</span>
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 3: Department-Specific Forms */}
              {step === 3 && (
                <div className="space-y-3">
                  {normalizedDepartment === 'technical' && (
                    <ErrorBoundary>
                      <TechnicalSiteVisitForm
                        onSubmit={(data) => {
                          setFormData(prev => ({ ...prev, technicalData: data, marketingData: null, adminData: null }));
                          navigateToStep(4);
                        }}
                        onBack={() => navigateToStep(2)}
                        isDisabled={false}
                      />
                    </ErrorBoundary>
                  )}

                  {normalizedDepartment === 'marketing' && (
                    <ErrorBoundary>
                      <MarketingSiteVisitForm
                        onSubmit={(data) => {
                          setFormData(prev => ({ ...prev, marketingData: data, technicalData: null, adminData: null }));
                          navigateToStep(4);
                        }}
                        onBack={() => navigateToStep(2)}
                        modalScrollRef={modalScrollRef}
                        isDisabled={false}
                      />
                    </ErrorBoundary>
                  )}

                  {normalizedDepartment === 'admin' && (
                    <ErrorBoundary>
                      <AdminSiteVisitForm
                        onSubmit={(data) => {
                          setFormData(prev => ({ ...prev, adminData: data, technicalData: null, marketingData: null }));
                          navigateToStep(4);
                        }}
                        onBack={() => navigateToStep(2)}
                        isDisabled={false}
                      />
                    </ErrorBoundary>
                  )}
                </div>
              )}

              {/* Step 4: Photo & Confirmation */}
              {step === 4 && (
                <div className="space-y-3">
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
                              Take Selfie
                            </Button>
                            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 sm:p-8 text-center">
                              <User className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-2 sm:mb-4 text-muted-foreground" />
                              <p className="text-xs sm:text-sm text-muted-foreground">
                                Take a selfie to verify your presence at the site (Required)
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
                                Selfie Mode
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
                                alt="Captured selfie"
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
                        Site Photos
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
                                    alt={`Site photo ${index + 1}`}
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
                              Capture Site Photos
                            </Button>
                            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 sm:p-8 text-center">
                              <MapPin className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-2 sm:mb-4 text-muted-foreground" />
                              <p className="text-xs sm:text-sm text-muted-foreground">
                                Take photos of the site or work area (up to 20 photos)
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

                  {/* Summary */}
                  <Card>
                    <CardHeader className="pb-3 sm:pb-6">
                      <CardTitle className="text-base sm:text-lg text-center sm:text-left">Visit Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
                        <span className="text-muted-foreground text-sm">Purpose:</span>
                        <Badge variant="outline" className="w-fit text-xs">{formData.visitPurpose}</Badge>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
                        <span className="text-muted-foreground text-sm">Customer:</span>
                        <span className="font-medium text-sm line-clamp-2">{formData.customer.name}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
                        <span className="text-muted-foreground text-sm">Mobile:</span>
                        <span className="text-sm">{formData.customer.mobile}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
                        <span className="text-muted-foreground text-sm">Property Type:</span>
                        <span className="capitalize text-sm">{formData.customer.propertyType}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
                        <span className="text-muted-foreground text-sm">Location:</span>
                        <span className="text-green-600 text-sm">Acquired</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
                        <span className="text-muted-foreground text-sm">Photos:</span>
                        <div className="flex gap-2">
                          <Badge variant={capturedPhotos.selfie ? "default" : "secondary"} className="text-xs">
                            Selfie {capturedPhotos.selfie ? '✓' : '✗'}
                          </Badge>
                          <Badge variant={capturedPhotos.sitePhotos.length > 0 ? "default" : "secondary"} className="text-xs">
                            Site ({capturedPhotos.sitePhotos.length})
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {!capturedPhotos.selfie && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                      <div className="flex items-center gap-2 text-red-700">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-sm font-medium">Selfie photo required to start site visit</span>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row justify-between gap-2 sm:gap-0">
                    <Button
                      variant="outline"
                      onClick={() => navigateToStep(3)}
                      className="w-full sm:w-auto order-2 sm:order-1"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={!capturedPhotos.selfie || createSiteVisitMutation.isPending}
                      className="w-full sm:w-auto order-1 sm:order-2"
                    >
                      {createSiteVisitMutation.isPending ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          <span className="hidden sm:inline">Starting Visit...</span>
                          <span className="sm:hidden">Starting...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          <span className="hidden sm:inline">Start Site Visit</span>
                          <span className="sm:hidden">Start Visit</span>
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

      {/* Duplicate Customer Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent data-testid="duplicate-customer-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Update Existing Customer?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The mobile number <strong>{formData.customer.mobile}</strong> already belongs to customer <strong>{duplicateCustomer?.name}</strong>.
              <br /><br />
              Creating this site visit will update their information with the new details:
              <ul className="mt-2 space-y-1">
                {formData.customer.name !== duplicateCustomer?.name && (
                  <li>• <strong>Name:</strong> {duplicateCustomer?.name} → <strong>{formData.customer.name}</strong></li>
                )}
                {formData.customer.address !== duplicateCustomer?.address && (
                  <li>• <strong>Address:</strong> {duplicateCustomer?.address || 'None'} → <strong>{formData.customer.address}</strong></li>
                )}
                {formData.customer.propertyType !== duplicateCustomer?.propertyType && (
                  <li>• <strong>Property Type:</strong> {duplicateCustomer?.propertyType || 'None'} → <strong>{formData.customer.propertyType}</strong></li>
                )}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-update">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowConfirmDialog(false);
                navigateToStep(3);
              }}
              data-testid="button-confirm-update"
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              Update "{duplicateCustomer?.name}" and Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
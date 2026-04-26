/**
 * Enhanced Follow-up Site Visit Modal
 * Advanced follow-up system with timeline view and better UX
 */

import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { sanitizeFormData } from "@shared/utils/form-sanitizer";
import { locationService, LocationStatus } from "@/lib/location-service";
import {
  MapPin, Camera, User, Phone, MapPinIcon, Clock, RefreshCw, Upload,
  ArrowRight, History, AlertCircle, CheckCircle, Calendar,
  FileText, Building, Zap, Users, SwitchCamera, RotateCcw, Loader2, X,
  ChevronLeft, ChevronRight, Image
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { capturePhotoWithOverlay, PhotoOverlayOptions } from "@/lib/photo-overlay-utils";

interface SiteVisit {
  id: string;
  customer: {
    name: string;
    mobile: string;
    address: string;
    propertyType: string;
    ebServiceNumber?: string;
  };
  visitPurpose: string;
  department: string;
  siteInTime: string;
  siteOutTime?: string;
  status: string;
  followUpCount?: number;
  isFollowUp?: boolean;
  followUpOf?: string;
  followUpReason?: string;
  notes?: string;
  technicalData?: any;
  marketingData?: any;
  adminData?: any;
}

interface FollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalVisit: SiteVisit | null;
}

const followUpReasons = [
  {
    value: "additional_work_required",
    label: "Additional Work Required",
    description: "More work needed to complete the task",
    icon: Zap,
    color: "bg-orange-100 text-orange-800 border-orange-200"
  },
  {
    value: "issue_resolution",
    label: "Issue Resolution",
    description: "Follow-up to resolve reported issues",
    icon: AlertCircle,
    color: "bg-red-100 text-red-800 border-red-200"
  },
  {
    value: "status_check",
    label: "Status Check",
    description: "Regular check on project progress",
    icon: CheckCircle,
    color: "bg-blue-100 text-blue-800 border-blue-200"
  },
  {
    value: "customer_request",
    label: "Customer Request",
    description: "Follow-up requested by customer",
    icon: User,
    color: "bg-green-100 text-green-800 border-green-200"
  },
  {
    value: "maintenance",
    label: "Maintenance",
    description: "Scheduled maintenance visit",
    icon: Clock,
    color: "bg-purple-100 text-purple-800 border-purple-200"
  },
  {
    value: "other",
    label: "Other",
    description: "Other follow-up requirement",
    icon: FileText,
    color: "bg-gray-100 text-gray-800 border-gray-200"
  }
];

// Follow-up templates for quick creation
const followUpTemplates = {
  technical: [
    { reason: "additional_work_required", description: "Additional technical work required to complete installation." },
    { reason: "issue_resolution", description: "Technical issue reported - need to investigate and resolve." },
    { reason: "maintenance", description: "Scheduled maintenance check for installed system." }
  ],
  marketing: [
    { reason: "customer_request", description: "Customer requested follow-up meeting for project discussion." },
    { reason: "status_check", description: "Follow-up to check project status and customer satisfaction." },
    { reason: "additional_work_required", description: "Additional project requirements identified during initial visit." }
  ],
  admin: [
    { reason: "status_check", description: "Follow-up on bank process or EB office documentation status." },
    { reason: "customer_request", description: "Customer requested update on administrative processes." },
    { reason: "issue_resolution", description: "Administrative issue needs resolution - follow-up required." }
  ]
};

export function FollowUpModal({ isOpen, onClose, originalVisit }: FollowUpModalProps) {
  // Step management for 4-step process
  const [currentStep, setCurrentStep] = useState(1);

  // Location state
  const [locationStatus, setLocationStatus] = useState<LocationStatus>({
    status: 'detecting',
    location: null
  });

  // Photo capture states - Enhanced for selfie and site photos
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

  // Form data
  const [followUpReason, setFollowUpReason] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch visit history for the customer  
  const { data: visitHistory } = useQuery({
    queryKey: ['/api/site-visits/customer-history', originalVisit?.customer.mobile],
    queryFn: async () => {
      if (!originalVisit?.customer.mobile) return [];

      try {
        // Get fresh token from Firebase Auth
        const { getAuth } = await import('firebase/auth');
        const auth = getAuth();
        const currentUser = auth.currentUser;

        if (!currentUser) {
          console.warn('No authenticated user found');
          return [];
        }

        const token = await currentUser.getIdToken(true); // Force refresh

        const response = await fetch(`/api/site-visits/customer-history?mobile=${encodeURIComponent(originalVisit.customer.mobile)}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          console.warn('Customer history fetch failed:', response.status, response.statusText);
          return []; // Return empty array instead of throwing error
        }

        return response.json();
      } catch (error) {
        console.warn('Customer history query failed:', error);
        return [];
      }
    },
    enabled: isOpen && !!originalVisit?.customer.mobile,
    retry: false, // Don't retry failed requests automatically
  });

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen && originalVisit) {
      // Reset form state
      setCurrentStep(1);
      setLocationStatus({ status: 'detecting', location: null });
      setCapturedPhotos({ selfie: null, sitePhotos: [] });
      setCurrentPhotoType('selfie');
      setFollowUpReason("");
      setDescription("");
      setSelectedTemplate("");
      setIsCameraActive(false);
      setIsVideoReady(false);
      setCurrentCamera('back');

      // Auto-detect location
      detectLocation();

      // Stop any existing camera stream on modal open
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
    }
  }, [isOpen, originalVisit]);

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

  const detectLocation = async () => {
    setLocationStatus({ status: 'detecting', location: null });

    try {
      console.log('🔍 Starting location detection for follow-up...');
      const result = await locationService.detectLocation();

      console.log('📍 Location detection result:', result);

      if (result.status === 'granted' && result.location) {
        console.log('✅ Follow-up location detected successfully:', {
          address: result.location.address,
          formattedAddress: result.location.formattedAddress,
          coordinates: `${result.location.latitude}, ${result.location.longitude}`,
          accuracy: result.location.accuracy
        });

        setLocationStatus(result);
      } else {
        console.error('❌ Location detection failed:', result.error);
        setLocationStatus({
          status: result.status,
          location: null,
          error: result.error || 'Location detection failed'
        });
      }
    } catch (error) {
      console.error('❌ Location service error:', error);
      setLocationStatus({
        status: 'error',
        location: null,
        error: 'Location service unavailable'
      });
    }
  };

  // Camera functions with better error handling
  const startCamera = async () => {
    try {
      setIsCameraActive(true);
      setIsVideoReady(false);

      const constraints = {
        video: {
          facingMode: currentCamera === 'front' ? 'user' : 'environment',
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 }
        },
        audio: false
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
          setIsVideoReady(true);
        };
      }
    } catch (error) {
      console.error('Camera access failed:', error);
      toast({
        title: "Camera Error",
        description: "Unable to access camera. Please check permissions.",
        variant: "destructive",
      });
      setIsCameraActive(false);
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

    if (stream) {
      stopCamera();
      setTimeout(() => {
        setCurrentCamera(newCamera);
        startCamera();
      }, 100);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current || !isVideoReady) {
      toast({
        title: "Camera Not Ready",
        description: "Please wait for camera to initialize",
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
      // Prepare overlay options with timestamp and location
      const overlayOptions: PhotoOverlayOptions = {
        timestamp: new Date(),
        location: locationStatus.location ? {
          latitude: locationStatus.location.latitude,
          longitude: locationStatus.location.longitude,
          address: locationStatus.location.formattedAddress || locationStatus.location.address || 'Address not available',
          accuracy: locationStatus.location.accuracy
        } : undefined,
        overlayType: 'site_visit',
        customLabel: currentPhotoType === 'selfie' ? 'Follow-up Visit' : 'Follow-up Photo'
      };

      // Capture photo with overlay using the utility function
      const photoDataUrl = capturePhotoWithOverlay(video, canvas, overlayOptions);

      if (!photoDataUrl || photoDataUrl.length < 100) {
        throw new Error('Generated image data too small');
      }

      // Store the photo based on current type
      if (currentPhotoType === 'selfie') {
        console.log("FOLLOW_UP_CREATE: Storing selfie photo with overlay, length:", photoDataUrl.length);
        setCapturedPhotos(prev => ({ ...prev, selfie: photoDataUrl }));
        setCurrentPhotoType('site'); // Switch to site photo after selfie
      } else {
        console.log("FOLLOW_UP_CREATE: Storing site photo with overlay, length:", photoDataUrl.length);
        setCapturedPhotos(prev => ({
          ...prev,
          sitePhotos: [...prev.sitePhotos, photoDataUrl]
        }));
      }

      // Stop camera after capture
      stopCamera();

      toast({
        title: "Photo Captured",
        description: `${currentPhotoType === 'selfie' ? 'Selfie' : 'Site photo'} captured successfully with timestamp and location`,
      });
    } catch (error) {
      console.error('FOLLOW_UP_CREATE: Photo capture error:', error);
      toast({
        title: "Capture Failed",
        description: "Failed to capture photo. Please try again.",
        variant: "destructive",
      });
    }
  };

  const retakePhoto = (type: 'selfie' | 'site', index?: number) => {
    if (type === 'selfie') {
      setCapturedPhotos(prev => ({ ...prev, selfie: null }));
      setCurrentPhotoType('selfie');
    } else if (index !== undefined) {
      setCapturedPhotos(prev => ({
        ...prev,
        sitePhotos: prev.sitePhotos.filter((_, i) => i !== index)
      }));
      setCurrentPhotoType('site');
    }
    startCamera();
  };

  const addMoreSitePhotos = () => {
    setCurrentPhotoType('site');
    startCamera();
  };

  // Handle template selection
  const handleTemplateSelect = (template: any) => {
    setFollowUpReason(template.reason);
    setDescription(template.description);
    setSelectedTemplate(template.reason);
  };

  // Get department-specific templates
  const getDepartmentTemplates = () => {
    const department = originalVisit?.department as keyof typeof followUpTemplates;
    return followUpTemplates[department] || followUpTemplates.technical;
  };

  // Format visit time for display
  const formatVisitTime = (timeString: string) => {
    const date = new Date(timeString);
    return {
      date: format(date, 'MMM dd, yyyy'),
      time: format(date, 'h:mm a'),
      relative: formatDistanceToNow(date, { addSuffix: true })
    };
  };

  // Handle close with confirmation
  const handleCloseWithConfirmation = () => {
    if (followUpReason || description) {
      if (window.confirm('You have unsaved changes. Are you sure you want to close?')) {
        handleClose();
      }
    } else {
      handleClose();
    }
  };

  const createFollowUpMutation = useMutation({
    mutationFn: async (data: any) => {
      console.log("FOLLOW_UP_CREATE: Starting follow-up creation process...");
      const uploadedPhotos: { selfie?: string; sitePhotos: string[] } = { sitePhotos: [] };

      try {
        console.log("FOLLOW_UP_CREATE: Photo upload starting...");
        console.log("FOLLOW_UP_CREATE: Captured photos state:", {
          hasSelfie: !!capturedPhotos.selfie,
          sitePhotosCount: capturedPhotos.sitePhotos.length
        });

        // Upload selfie if captured (using server-side upload)
        if (capturedPhotos.selfie) {
          console.log("FOLLOW_UP_CREATE: Uploading selfie via server...");

          try {
            // Get fresh token from Firebase Auth
            const { getAuth } = await import('firebase/auth');
            const auth = getAuth();
            const currentUser = auth.currentUser;

            if (currentUser) {
              const token = await currentUser.getIdToken(true);

              const uploadResponse = await fetch('/api/attendance/upload-photo', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  imageData: capturedPhotos.selfie,
                  userId: currentUser.uid,
                  attendanceType: 'follow_up_selfie'
                }),
              });

              if (uploadResponse.ok) {
                const result = await uploadResponse.json();
                uploadedPhotos.selfie = result.url;
                console.log("FOLLOW_UP_CREATE: Selfie uploaded successfully:", result.url);
              } else {
                console.error("FOLLOW_UP_CREATE: Selfie upload failed:", uploadResponse.status, uploadResponse.statusText);
              }
            }
          } catch (error) {
            console.error("FOLLOW_UP_CREATE: Selfie upload error:", error);
          }
        } else {
          console.log("FOLLOW_UP_CREATE: No selfie to upload");
        }

        // Upload site photos if captured (using server-side upload)
        console.log("FOLLOW_UP_CREATE: Starting site photos upload...");
        for (let index = 0; index < capturedPhotos.sitePhotos.length; index++) {
          const sitePhoto = capturedPhotos.sitePhotos[index];
          console.log(`FOLLOW_UP_CREATE: Uploading site photo ${index + 1}/${capturedPhotos.sitePhotos.length}`);

          try {
            // Get fresh token from Firebase Auth
            const { getAuth } = await import('firebase/auth');
            const auth = getAuth();
            const currentUser = auth.currentUser;

            if (currentUser) {
              const token = await currentUser.getIdToken(true);

              const uploadResponse = await fetch('/api/attendance/upload-photo', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  imageData: sitePhoto,
                  userId: currentUser.uid,
                  attendanceType: `follow_up_site_${index + 1}`
                }),
              });

              if (uploadResponse.ok) {
                const result = await uploadResponse.json();
                uploadedPhotos.sitePhotos.push(result.url);
                console.log(`FOLLOW_UP_CREATE: Site photo ${index + 1} uploaded successfully:`, result.url);
              } else {
                console.error(`FOLLOW_UP_CREATE: Site photo ${index + 1} upload failed:`, uploadResponse.status, uploadResponse.statusText);
              }
            }
          } catch (error) {
            console.error(`FOLLOW_UP_CREATE: Site photo ${index + 1} upload error:`, error);
          }
        }

        console.log("FOLLOW_UP_CREATE: Photo upload completed. Final URLs:", {
          selfie: uploadedPhotos.selfie,
          sitePhotosCount: uploadedPhotos.sitePhotos.length,
          sitePhotos: uploadedPhotos.sitePhotos
        });
      } catch (error) {
        console.error('Photo upload failed:', error);
        // Continue without photos rather than failing completely
      }

      // Determine the correct original visit ID
      // If the current visit is itself a follow-up, use its originalVisitId
      // Otherwise, use the current visit's ID as the original
      const actualOriginalVisitId = originalVisit!.isFollowUp && originalVisit!.followUpOf
        ? originalVisit!.followUpOf
        : originalVisit!.id;

      const followUpPayload = {
        originalVisitId: actualOriginalVisitId,
        siteInLocation: locationStatus.location,
        siteInPhotoUrl: uploadedPhotos.selfie, // Keep backward compatibility
        sitePhotos: uploadedPhotos.sitePhotos,
        followUpReason,
        description
      };

      // Sanitize follow-up data: convert empty strings to null for optional fields
      const sanitizedPayload = sanitizeFormData(followUpPayload, ['description', 'siteInPhotoUrl']);

      console.log("FOLLOW_UP_CREATE: Original visit check:", {
        currentVisitId: originalVisit!.id,
        isFollowUp: originalVisit!.isFollowUp,
        followUpOf: originalVisit!.followUpOf,
        actualOriginalVisitId: actualOriginalVisitId
      });

      console.log("FOLLOW_UP_CREATE: Sending payload to server:", sanitizedPayload);

      return apiRequest('/api/site-visits/follow-up', 'POST', sanitizedPayload);
    },
    onSuccess: async () => {
      toast({
        title: "Follow-up Created",
        description: `Follow-up visit started for ${originalVisit?.customer.name}`,
      });


      // Force immediate refetch to show follow-up in timeline
      await queryClient.refetchQueries({ queryKey: ['/api/site-visits'] });
      await queryClient.refetchQueries({ queryKey: ['/api/follow-ups'] });
      await queryClient.refetchQueries({ queryKey: ['/api/site-visits/stats'] });

      handleClose();
    },
    onError: (error: any) => {
      console.error('Follow-up creation failed:', error);
      toast({
        title: "Follow-up Failed",
        description: error.message || "Failed to create follow-up visit",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async () => {
    if (!locationStatus.location) {
      toast({
        title: "Location Required",
        description: "Please allow location access to continue",
        variant: "destructive",
      });
      return;
    }

    if (!followUpReason) {
      toast({
        title: "Reason Required",
        description: "Please select a reason for the follow-up",
        variant: "destructive",
      });
      return;
    }

    if (description.length < 10) {
      toast({
        title: "Description Required",
        description: "Please provide a description of at least 10 characters",
        variant: "destructive",
      });
      return;
    }

    // Log pre-submission state
    console.log("FOLLOW_UP_CREATE: Pre-submission validation passed");
    console.log("FOLLOW_UP_CREATE: Current captured photos state:", {
      hasSelfie: !!capturedPhotos.selfie,
      selfieLength: capturedPhotos.selfie?.length,
      sitePhotosCount: capturedPhotos.sitePhotos.length,
      sitePhotosLengths: capturedPhotos.sitePhotos.map(p => p.length)
    });

    setIsSubmitting(true);
    try {
      await createFollowUpMutation.mutateAsync({});
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step navigation functions
  const nextStep = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const goToStep = (step: number) => {
    if (step >= 1 && step <= 4) {
      setCurrentStep(step);
    }
  };

  // Validation for each step
  const canProceedFromStep = (step: number): boolean => {
    switch (step) {
      case 1: // Follow-up reason
        return !!followUpReason;
      case 2: // Location
        return locationStatus.status === 'granted' && !!locationStatus.location;
      case 3: // Description
        return description.length >= 10;
      case 4: // Photos - at least selfie required
        return !!capturedPhotos.selfie;
      default:
        return false;
    }
  };

  const handleClose = () => {
    setCurrentStep(1);
    setLocationStatus({ status: 'detecting', location: null });
    setCapturedPhotos({ selfie: null, sitePhotos: [] });
    setCurrentPhotoType('selfie');
    setFollowUpReason("");
    setDescription("");
    setIsSubmitting(false);
    setIsCameraActive(false);
    setIsVideoReady(false);
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    onClose();
  };

  if (!originalVisit) return null;

  // Step progress indicator component
  const StepIndicator = ({ step, currentStep, label, isCompleted }: {
    step: number;
    currentStep: number;
    label: string;
    isCompleted: boolean;
  }) => (
    <div className="flex items-center">
      <div className={`
        w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
        ${step === currentStep ? 'bg-blue-600 text-white' :
          isCompleted ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600'}
      `}>
        {isCompleted ? <CheckCircle className="h-4 w-4" /> : step}
      </div>
      <div className={`ml-2 text-sm ${step === currentStep ? 'font-medium' : 'text-muted-foreground'}`}>
        {label}
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleCloseWithConfirmation}>
      <DialogContent className="w-[90vw] max-w-2xl max-h-[85vh] overflow-y-auto overflow-x-hidden p-2 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-blue-600" />
            Follow-up Visit - Step {currentStep} of 4
          </DialogTitle>
        </DialogHeader>

        {/* Step Progress Indicator - Mobile Responsive */}
        <div className="p-2 sm:p-4 bg-gray-50 rounded-lg mb-4 sm:mb-6">
          {/* Mobile: Stack vertically */}
          <div className="flex sm:hidden flex-col space-y-2">
            <div className="flex items-center justify-between">
              <StepIndicator step={currentStep} currentStep={currentStep} label={
                currentStep === 1 ? "Reason" : currentStep === 2 ? "Location" :
                  currentStep === 3 ? "Details" : "Photos"
              } isCompleted={canProceedFromStep(currentStep)} />
              <span className="text-xs text-muted-foreground">Step {currentStep} of 4</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${(currentStep / 4) * 100}%` }}
              />
            </div>
          </div>

          {/* Desktop: Original horizontal layout */}
          <div className="hidden sm:flex items-center justify-between">
            <StepIndicator step={1} currentStep={currentStep} label="Reason" isCompleted={canProceedFromStep(1)} />
            <div className="flex-1 h-px bg-gray-300 mx-2" />
            <StepIndicator step={2} currentStep={currentStep} label="Location" isCompleted={canProceedFromStep(2)} />
            <div className="flex-1 h-px bg-gray-300 mx-2" />
            <StepIndicator step={3} currentStep={currentStep} label="Details" isCompleted={canProceedFromStep(3)} />
            <div className="flex-1 h-px bg-gray-300 mx-2" />
            <StepIndicator step={4} currentStep={currentStep} label="Photos" isCompleted={canProceedFromStep(4)} />
          </div>
        </div>

        <div className="space-y-3 sm:space-y-4">
          {/* Original Visit Info - Always visible */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Original Visit Details</CardTitle>
                <Badge variant="outline">
                  Follow-up #{(originalVisit.followUpCount || 0) + 1}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{originalVisit.customer.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{originalVisit.customer.mobile}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPinIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{originalVisit.customer.address}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {format(new Date(originalVisit.siteInTime), 'MMM dd, yyyy')}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 1: Follow-up Reason */}
          {currentStep === 1 && (
            <div className="space-y-6">
              {/* Visit Timeline */}
              {visitHistory && visitHistory.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <History className="h-5 w-5" />
                      Visit History
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-32">
                      <div className="space-y-2">
                        {visitHistory.map((visit: any, index: number) => (
                          <div key={visit.id} className="flex items-center gap-3 p-2 rounded border">
                            <div className={`w-2 h-2 rounded-full ${visit.status === 'completed' ? 'bg-green-500' :
                              visit.status === 'in_progress' ? 'bg-blue-500' : 'bg-gray-400'
                              }`} />
                            <div className="flex-1">
                              <div className="flex justify-between items-start">
                                <span className="font-medium text-sm">
                                  {visit.isFollowUp ? 'Follow-up' : 'Original'} - {visit.visitPurpose}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {formatVisitTime(visit.siteInTime).relative}
                                </span>
                              </div>
                              {visit.followUpReason && (
                                <span className="text-xs text-muted-foreground">
                                  Reason: {visit.followUpReason.replace('_', ' ')}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {/* Quick Templates */}
              <Card>
                <CardHeader>
                  <CardTitle>Quick Templates</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Select a template to quickly fill follow-up details for {originalVisit.department} department
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-2">
                    {getDepartmentTemplates().map((template) => (
                      <Button
                        key={template.reason}
                        variant={selectedTemplate === template.reason ? "default" : "outline"}
                        className="justify-start h-auto p-3 text-left overflow-hidden"
                        onClick={() => handleTemplateSelect(template)}
                      >
                        <div className="text-left w-full min-w-0">
                          <div className="font-medium truncate">
                            {followUpReasons.find(r => r.value === template.reason)?.label}
                          </div>
                          <div className="text-xs text-muted-foreground overflow-hidden text-ellipsis">
                            {template.description}
                          </div>
                        </div>
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Reason Selection */}
              <Card>
                <CardHeader>
                  <CardTitle>Follow-up Reason</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Select a reason for follow-up *</label>
                    <Select value={followUpReason} onValueChange={setFollowUpReason}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose follow-up reason" />
                      </SelectTrigger>
                      <SelectContent>
                        {followUpReasons.map((reason) => {
                          const IconComponent = reason.icon;
                          return (
                            <SelectItem key={reason.value} value={reason.value}>
                              <div className="flex items-center gap-2">
                                <IconComponent className="h-4 w-4" />
                                <div>
                                  <div className="font-medium">{reason.label}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {reason.description}
                                  </div>
                                </div>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 2: Location Detection */}
          {currentStep === 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Current Location</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={detectLocation}
                    disabled={locationStatus.status === 'detecting'}
                  >
                    <MapPin className="h-4 w-4 mr-2" />
                    {locationStatus.status === 'detecting' ? 'Detecting...' : 'Detect Location'}
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {locationStatus.status === 'detecting' && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Detecting your current location...</span>
                  </div>
                )}

                {locationStatus.status === 'granted' && locationStatus.location && (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600 mt-1 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="font-medium text-sm">Location Detected</p>
                        <p className="text-sm text-muted-foreground">
                          {locationStatus.location.formattedAddress || locationStatus.location.address}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {locationStatus.status === 'denied' && (
                  <div className="flex items-start gap-2 text-red-600">
                    <AlertCircle className="h-4 w-4 mt-1 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Location Access Denied</p>
                      <p className="text-sm">{locationStatus.error}</p>
                    </div>
                  </div>
                )}

                {locationStatus.status === 'error' && (
                  <div className="flex items-start gap-2 text-amber-600">
                    <AlertCircle className="h-4 w-4 mt-1 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Location Error</p>
                      <p className="text-sm">{locationStatus.error}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 3: Description */}
          {currentStep === 3 && (
            <Card>
              <CardHeader>
                <CardTitle>Follow-up Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Description *
                    <span className="text-muted-foreground">
                      ({description.length}/200 characters)
                    </span>
                  </label>
                  <Textarea
                    placeholder="Describe the reason for this follow-up visit in detail..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={200}
                    rows={4}
                    className={description.length < 10 ? "border-red-300" : ""}
                  />
                  {description.length < 10 && description.length > 0 && (
                    <p className="text-xs text-red-600">
                      Description must be at least 10 characters
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Provide detailed information about what needs to be done during this follow-up visit.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Photo Capture */}
          {currentStep === 4 && (
            <div className="space-y-3 sm:space-y-4">
              {!isCameraActive && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Camera className="h-5 w-5" />
                      Photo Documentation
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Capture a selfie and site photos to document your follow-up visit
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col space-y-4">
                      {/* Selfie Section */}
                      <div className="space-y-3">
                        <h4 className="font-medium flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Selfie {!capturedPhotos.selfie && <span className="text-red-500">*</span>}
                        </h4>
                        {!capturedPhotos.selfie ? (
                          <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
                            <Camera className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                            <p className="text-sm text-muted-foreground mb-3">
                              Take a selfie to verify your presence
                            </p>
                            <Button
                              onClick={() => {
                                setCurrentPhotoType('selfie');
                                setCurrentCamera('front');
                                startCamera();
                              }}
                              className="w-full"
                            >
                              <Camera className="h-4 w-4 mr-2" />
                              Take Selfie
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="relative">
                              <img
                                src={capturedPhotos.selfie}
                                alt="Captured selfie"
                                className="w-full h-48 object-cover rounded-lg"
                              />
                              <Button
                                variant="destructive"
                                size="sm"
                                className="absolute top-2 right-2"
                                onClick={() => retakePhoto('selfie')}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            </div>
                            <p className="text-xs text-green-600 text-center">✓ Selfie captured</p>
                          </div>
                        )}
                      </div>

                      {/* Site Photos Section */}
                      <div className="space-y-3">
                        <h4 className="font-medium flex items-center gap-2">
                          <Image className="h-4 w-4" />
                          Site Photos ({capturedPhotos.sitePhotos.length})
                        </h4>
                        {capturedPhotos.sitePhotos.length === 0 ? (
                          <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
                            <Camera className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                            <p className="text-sm text-muted-foreground mb-3">
                              Capture site photos for documentation
                            </p>
                            <Button
                              onClick={() => {
                                setCurrentPhotoType('site');
                                setCurrentCamera('back');
                                startCamera();
                              }}
                              variant="outline"
                              className="w-full"
                            >
                              <Camera className="h-4 w-4 mr-2" />
                              Take Site Photo
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              {capturedPhotos.sitePhotos.map((photo, index) => (
                                <div key={index} className="relative">
                                  <img
                                    src={photo}
                                    alt={`Site photo ${index + 1}`}
                                    className="w-full h-24 object-cover rounded"
                                  />
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    className="absolute top-1 right-1 h-6 w-6 p-0"
                                    onClick={() => retakePhoto('site', index)}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                            {capturedPhotos.sitePhotos.length < 5 && (
                              <Button
                                onClick={addMoreSitePhotos}
                                variant="outline"
                                size="sm"
                                className="w-full"
                              >
                                <Camera className="h-4 w-4 mr-2" />
                                Add More Photos
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Camera Interface */}
              {isCameraActive && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="truncate mr-2">
                        Camera - {currentPhotoType === 'selfie' ? 'Selfie' : 'Site Photo'}
                      </span>
                      <div className="flex gap-1 sm:gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={switchCamera}
                          disabled={!isVideoReady}
                          className="p-2"
                        >
                          <SwitchCamera className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={stopCamera}
                          className="p-2"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="relative bg-black rounded-lg overflow-hidden max-w-full">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-64 object-cover max-w-full"
                        />
                        {!isVideoReady && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                            <Loader2 className="h-8 w-8 animate-spin text-white" />
                          </div>
                        )}
                      </div>

                      <div className="flex justify-center">
                        <Button
                          onClick={capturePhoto}
                          disabled={!isVideoReady}
                          size="lg"
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <Camera className="h-5 w-5 mr-2" />
                          Capture Photo
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Hidden canvas for photo capture */}
              <canvas ref={canvasRef} className="hidden" />
            </div>
          )}

          {/* Navigation Buttons - Mobile Responsive */}
          <div className="pt-4 space-y-3">
            {/* Mobile: Stack vertically with full-width buttons */}
            <div className="flex sm:hidden flex-col gap-2">
              {currentStep < 4 ? (
                <>
                  <Button
                    onClick={nextStep}
                    disabled={!canProceedFromStep(currentStep) || isCameraActive}
                    className="w-full bg-blue-600 hover:bg-blue-700 h-10"
                  >
                    Next Step
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                  {currentStep > 1 && (
                    <Button
                      variant="outline"
                      onClick={prevStep}
                      disabled={isCameraActive}
                      className="w-full h-10"
                    >
                      <ChevronLeft className="h-4 w-4 mr-2" />
                      Previous Step
                    </Button>
                  )}
                  <Button variant="outline" onClick={handleCloseWithConfirmation} className="w-full h-10">
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !canProceedFromStep(4)}
                    className="w-full bg-green-600 hover:bg-green-700 h-10"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Start Follow-up Visit'
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={prevStep}
                    disabled={isCameraActive}
                    className="w-full h-10"
                  >
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Previous Step
                  </Button>
                  <Button variant="outline" onClick={handleCloseWithConfirmation} className="w-full h-10">
                    Cancel
                  </Button>
                </>
              )}
            </div>

            {/* Desktop: Original horizontal layout */}
            <div className="hidden sm:flex justify-between">
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCloseWithConfirmation}>
                  Cancel
                </Button>
                {currentStep > 1 && (
                  <Button
                    variant="outline"
                    onClick={prevStep}
                    disabled={isCameraActive}
                  >
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Previous
                  </Button>
                )}
              </div>

              <div className="flex gap-2">
                {currentStep < 4 ? (
                  <Button
                    onClick={nextStep}
                    disabled={!canProceedFromStep(currentStep) || isCameraActive}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !canProceedFromStep(4)}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating Follow-up...
                      </>
                    ) : (
                      'Start Follow-up Visit'
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
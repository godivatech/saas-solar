import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin, Camera, AlertTriangle, CheckCircle, Clock } from "lucide-react";

interface CheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCheckIn: (data: any) => Promise<void>;
  departmentTiming: any;
  officeLocations: any[];
}

export function CheckInModal({ isOpen, onClose, onCheckIn, departmentTiming, officeLocations }: CheckInModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locationPermission, setLocationPermission] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [locationValidation, setLocationValidation] = useState<any>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    attendanceType: 'office' as 'office' | 'remote' | 'field_work',
    reason: '',
    customerName: ''
  });

  // Request location permission on modal open
  useEffect(() => {
    if (isOpen) {
      requestLocationPermission();
    }
  }, [isOpen]);

  const requestLocationPermission = async () => {
    if (!navigator.geolocation) {
      setLocationPermission('denied');
      return;
    }

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 30000
        });
      });

      setCurrentLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      });
      setLocationPermission('granted');
      
      // Validate location with office geofences
      validateLocation(position.coords);
    } catch (error) {
      console.error('Location permission denied:', error);
      setLocationPermission('denied');
    }
  };

  const validateLocation = async (coords: GeolocationCoordinates) => {
    // Simple distance calculation for validation display
    if (officeLocations.length > 0) {
      const office = officeLocations[0];
      const distance = calculateDistance(
        coords.latitude,
        coords.longitude,
        parseFloat(office.latitude),
        parseFloat(office.longitude)
      );
      
      setLocationValidation({
        isValid: distance <= office.radius,
        distance: Math.round(distance),
        accuracy: coords.accuracy,
        nearestOffice: office.name
      });
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon1-lon2) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  };

  const handlePhotoCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedPhoto(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setPhotoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!currentLocation) {
      alert('Location is required for check-in');
      return;
    }

    setIsSubmitting(true);
    try {
      await onCheckIn({
        ...formData,
        ...currentLocation,
        photo: selectedPhoto
      });
      onClose();
    } catch (error) {
      console.error('Check-in failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getLocationStatusIcon = () => {
    switch (locationPermission) {
      case 'granted':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'denied':
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      default:
        return <Loader2 className="h-4 w-4 animate-spin" />;
    }
  };

  const getLocationStatusMessage = () => {
    switch (locationPermission) {
      case 'granted':
        return locationValidation?.isValid ? 
          `Within office radius (${locationValidation.distance}m from ${locationValidation.nearestOffice})` :
          `Outside office radius (${locationValidation?.distance}m from ${locationValidation?.nearestOffice})`;
      case 'denied':
        return 'Location access denied. Please enable location services.';
      default:
        return 'Requesting location access...';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Check In</DialogTitle>
          <DialogDescription>
            Record your attendance for today
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Location Status */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                {getLocationStatusIcon()}
                Location Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {getLocationStatusMessage()}
              </p>
              {locationValidation && (
                <div className="mt-2">
                  <Badge variant={locationValidation.isValid ? 'default' : 'destructive'}>
                    {locationValidation.isValid ? 'Valid Location' : 'Remote Location'}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Department Timing Info */}
          {departmentTiming && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Department Schedule
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  {departmentTiming.checkInTime} - {departmentTiming.checkOutTime}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Attendance Type Selection */}
          <div className="space-y-2">
            <Label>Attendance Type</Label>
            <Select 
              value={formData.attendanceType} 
              onValueChange={(value: any) => setFormData({...formData, attendanceType: value})}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="office">Office Work</SelectItem>
                <SelectItem value="remote">Remote Work</SelectItem>
                <SelectItem value="field_work">Field Work</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Conditional Fields */}
          {(formData.attendanceType === 'remote' || formData.attendanceType === 'field_work') && (
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea
                value={formData.reason}
                onChange={(e) => setFormData({...formData, reason: e.target.value})}
                placeholder="Explain the reason for remote/field work"
                rows={3}
              />
            </div>
          )}

          {formData.attendanceType === 'field_work' && (
            <div className="space-y-2">
              <Label>Customer Name</Label>
              <Input
                value={formData.customerName}
                onChange={(e) => setFormData({...formData, customerName: e.target.value})}
                placeholder="Enter customer name"
              />
            </div>
          )}

          {/* Photo Capture */}
          <div className="space-y-2">
            <Label>Photo Verification</Label>
            <div className="flex gap-2">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoCapture}
                className="hidden"
                id="photo-input"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById('photo-input')?.click()}
                className="flex-1"
              >
                <Camera className="h-4 w-4 mr-2" />
                {selectedPhoto ? 'Photo Captured' : 'Take Photo'}
              </Button>
            </div>
            {photoPreview && (
              <div className="mt-2">
                <img 
                  src={photoPreview} 
                  alt="Captured photo" 
                  className="w-full h-32 object-cover rounded border"
                />
              </div>
            )}
          </div>

          {/* Submit Button */}
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || locationPermission !== 'granted'}
            className="w-full"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing Check-in...
              </>
            ) : (
              'Check In'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
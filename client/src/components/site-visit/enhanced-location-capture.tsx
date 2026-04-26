/**
 * Enhanced Location Capture Component
 * Provides automatic location detection with reverse geocoding and manual fallback
 */

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  MapPin, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  Loader2,
  Navigation,
  MapIcon
} from "lucide-react";
import { locationService, LocationData, LocationStatus } from "@/lib/location-service";

interface EnhancedLocationCaptureProps {
  onLocationCaptured: (location: LocationData) => void;
  onLocationError?: (error: string) => void;
  autoDetect?: boolean;
  title?: string;
  description?: string;
  required?: boolean;
  showAddress?: boolean;
}

export function EnhancedLocationCapture({
  onLocationCaptured,
  onLocationError,
  autoDetect = true,
  title = "Location Detection",
  description = "We need to detect your current location to proceed",
  required = true,
  showAddress = true
}: EnhancedLocationCaptureProps) {
  const [locationStatus, setLocationStatus] = useState<LocationStatus>({
    status: 'detecting',
    location: null
  });
  const [isDetecting, setIsDetecting] = useState(false);

  // Auto-detect location on component mount
  useEffect(() => {
    if (autoDetect && locationService.isLocationSupported()) {
      handleLocationDetection();
    } else if (!locationService.isLocationSupported()) {
      setLocationStatus({
        status: 'error',
        location: null,
        error: 'Location services are not supported on this device',
        canRetry: false
      });
    }
  }, [autoDetect]);

  // Notify parent when location is captured (only once per status change)
  useEffect(() => {
    if (locationStatus.status === 'granted' && locationStatus.location) {
      onLocationCaptured(locationStatus.location);
    } else if ((locationStatus.status === 'denied' || locationStatus.status === 'error') && locationStatus.error) {
      // Only notify on error if there's a specific error and it's a new error
      onLocationError?.(locationStatus.error);
    }
  }, [locationStatus.status, locationStatus.location, onLocationCaptured, onLocationError]);

  const handleLocationDetection = async () => {
    setIsDetecting(true);
    setLocationStatus({ status: 'detecting', location: null });

    try {
      const result = await locationService.detectLocation();
      setLocationStatus(result);
    } catch (error) {
      setLocationStatus({
        status: 'error',
        location: null,
        error: 'Failed to detect location. Please try again.',
        canRetry: true
      });
    } finally {
      setIsDetecting(false);
    }
  };

  const getStatusIcon = () => {
    switch (locationStatus.status) {
      case 'detecting':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      case 'granted':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'denied':
      case 'error':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      default:
        return <MapPin className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusBadge = () => {
    switch (locationStatus.status) {
      case 'detecting':
        return <Badge variant="outline" className="text-blue-600">Detecting...</Badge>;
      case 'granted':
        return <Badge variant="outline" className="text-green-600">Location Captured</Badge>;
      case 'denied':
        return <Badge variant="outline" className="text-red-600">Access Denied</Badge>;
      case 'error':
        return <Badge variant="outline" className="text-red-600">Error</Badge>;
      default:
        return <Badge variant="outline" className="text-gray-600">Pending</Badge>;
    }
  };

  const formatAccuracy = (accuracy: number) => {
    if (accuracy < 10) return 'Very High';
    if (accuracy < 50) return 'High';
    if (accuracy < 100) return 'Good';
    return 'Low';
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          {getStatusIcon()}
          {title}
          {getStatusBadge()}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Auto-detection status */}
        {locationStatus.status === 'detecting' && (
          <Alert>
            <Navigation className="h-4 w-4" />
            <AlertDescription>
              Getting your GPS location. Mobile devices provide more accurate results due to dedicated GPS chips.
              {/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
                ? ' Please ensure GPS is enabled.' 
                : ' Desktop location uses WiFi/network positioning which may be less precise.'}
            </AlertDescription>
          </Alert>
        )}



        {/* Success state */}
        {locationStatus.status === 'granted' && locationStatus.location && (
          <div className="space-y-3">
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Location successfully detected
              </AlertDescription>
            </Alert>

            {/* Refresh button for successful detection */}
            <div className="flex justify-end">
              <Button
                onClick={handleLocationDetection}
                disabled={isDetecting}
                variant="outline"
                size="sm"
              >
                {isDetecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Get Location
                  </>
                )}
              </Button>
            </div>

            {/* Address display */}
            {showAddress && locationStatus.location.address && (
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-start gap-2">
                  <MapIcon className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-blue-600 font-medium">Detected Address</p>
                    <p className="text-sm text-blue-800">{locationStatus.location.address}</p>
                    {locationStatus.location.formattedAddress && locationStatus.location.formattedAddress !== locationStatus.location.address && (
                      <p className="text-xs text-blue-600 mt-1 opacity-75">
                        {locationStatus.location.formattedAddress}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error state */}
        {(locationStatus.status === 'denied' || locationStatus.status === 'error') && (
          <div className="space-y-3">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {locationStatus.error || 'Failed to detect location'}
              </AlertDescription>
            </Alert>

            {/* Manual retry button */}
            {locationStatus.canRetry && (
              <Button
                onClick={handleLocationDetection}
                disabled={isDetecting}
                variant="outline"
                className="w-full"
              >
                {isDetecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Detecting Location...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Try Again
                  </>
                )}
              </Button>
            )}

            {/* Help text for permission issues */}
            {locationStatus.status === 'denied' && (
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-medium">To enable location access:</p>
                {/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? (
                  <ul className="list-disc list-inside space-y-0.5 pl-2">
                    <li>Go to your device Settings → Privacy → Location Services</li>
                    <li>Turn on Location Services for your browser app</li>
                    <li>Allow location access when prompted</li>
                    <li>Try the "Try Again" button above</li>
                  </ul>
                ) : (
                  <ul className="list-disc list-inside space-y-0.5 pl-2">
                    <li>Click the location/lock icon in your browser's address bar</li>
                    <li>Select "Allow" for location permissions</li>
                    <li>Ensure WiFi or internet connection is stable</li>
                    <li>Try the "Try Again" button above</li>
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {/* Manual detection button for non-auto mode */}
        {!autoDetect && locationStatus.status !== 'granted' && locationStatus.status !== 'detecting' && (
          <Button
            onClick={handleLocationDetection}
            disabled={isDetecting}
            className="w-full"
          >
            {isDetecting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Detecting Location...
              </>
            ) : (
              <>
                <Navigation className="h-4 w-4 mr-2" />
                Detect Current Location
              </>
            )}
          </Button>
        )}

        {/* Required field indicator */}
        {required && locationStatus.status !== 'granted' && (
          <p className="text-xs text-red-600">
            * Location detection is required to proceed
          </p>
        )}
      </CardContent>
    </Card>
  );
}
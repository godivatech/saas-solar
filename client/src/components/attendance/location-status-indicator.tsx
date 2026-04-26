import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { MapPin, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';

interface LocationStatusProps {
  onLocationUpdate?: (location: { latitude: number; longitude: number; accuracy: number }) => void;
  showAccuracy?: boolean;
  className?: string;
}

export function LocationStatusIndicator({ onLocationUpdate, showAccuracy = true, className = "" }: LocationStatusProps) {
  const [locationStatus, setLocationStatus] = useState<'loading' | 'granted' | 'denied' | 'error'>('loading');
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    const getLocation = () => {
      if (!navigator.geolocation) {
        setLocationStatus('error');
        return;
      }

      navigator.permissions?.query({ name: 'geolocation' }).then(permission => {
        if (permission.state === 'denied') {
          setLocationStatus('denied');
          return;
        }
      });

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy: posAccuracy } = position.coords;
          setLocation({ latitude, longitude });
          setAccuracy(posAccuracy);
          setLocationStatus('granted');
          
          if (onLocationUpdate) {
            onLocationUpdate({ latitude, longitude, accuracy: posAccuracy });
          }
        },
        (error) => {
          console.error('Location error:', error);
          if (error.code === error.PERMISSION_DENIED) {
            setLocationStatus('denied');
          } else {
            setLocationStatus('error');
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        }
      );
    };

    getLocation();
  }, [onLocationUpdate]);

  const getStatusDisplay = () => {
    switch (locationStatus) {
      case 'loading':
        return {
          icon: <Loader2 className="h-3 w-3 animate-spin" />,
          text: 'Getting Location...',
          variant: 'secondary' as const,
          color: 'text-blue-600'
        };
      case 'granted':
        return {
          icon: <CheckCircle className="h-3 w-3" />,
          text: accuracy && accuracy < 20 ? 'High Accuracy' : accuracy && accuracy < 100 ? 'Good Accuracy' : 'Location Found',
          variant: 'default' as const,
          color: 'text-green-600'
        };
      case 'denied':
        return {
          icon: <AlertTriangle className="h-3 w-3" />,
          text: 'Location Denied',
          variant: 'destructive' as const,
          color: 'text-red-600'
        };
      case 'error':
        return {
          icon: <MapPin className="h-3 w-3" />,
          text: 'Location Error',
          variant: 'destructive' as const,
          color: 'text-red-600'
        };
    }
  };

  const status = getStatusDisplay();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Badge variant={status.variant} className="flex items-center gap-1">
        <span className={status.color}>{status.icon}</span>
        <span className="text-xs">{status.text}</span>
      </Badge>
      
      {showAccuracy && accuracy && locationStatus === 'granted' && (
        <span className="text-xs text-muted-foreground">
          ±{Math.round(accuracy)}m
        </span>
      )}
      
      {locationStatus === 'denied' && (
        <div className="text-xs text-red-600">
          Enable location in browser settings
        </div>
      )}
    </div>
  );
}
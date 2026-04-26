import { useState, useEffect, useCallback } from 'react';

interface GeolocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
}

interface GeolocationError {
  code: number;
  message: string;
}

interface UseGeolocationReturn {
  location: GeolocationCoordinates | null;
  error: GeolocationError | null;
  isLoading: boolean;
  getCurrentLocation: () => Promise<GeolocationCoordinates>;
  calculateDistance: (lat1: number, lng1: number, lat2: number, lng2: number) => number;
  isWithinRadius: (lat1: number, lng1: number, lat2: number, lng2: number, radius: number, accuracy?: number) => boolean;
}

export function useGeolocation(): UseGeolocationReturn {
  const [location, setLocation] = useState<GeolocationCoordinates | null>(null);
  const [error, setError] = useState<GeolocationError | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Enhanced GPS strategies for enterprise reliability
  const GPS_STRATEGIES = {
    HIGH_ACCURACY: {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000
    },
    NETWORK_FALLBACK: {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 300000
    },
    PASSIVE_FALLBACK: {
      enableHighAccuracy: false,
      timeout: 5000,
      maximumAge: 600000
    }
  };

  // Calculate distance between two coordinates using Haversine formula
  const calculateDistance = useCallback((lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const earthRadiusInMeters = 6371000; // Earth's radius in meters
    
    // Convert degrees to radians
    const toRadians = (degrees: number) => degrees * (Math.PI / 180);
    
    const latRad1 = toRadians(lat1);
    const latRad2 = toRadians(lat2);
    const lonRad1 = toRadians(lng1);
    const lonRad2 = toRadians(lng2);
    
    // Differences
    const dLat = latRad2 - latRad1;
    const dLon = lonRad2 - lonRad1;
    
    // Haversine formula
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(latRad1) * Math.cos(latRad2) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = earthRadiusInMeters * c;
    
    return distance;
  }, []);

  // Check if coordinates are within a radius with accuracy consideration
  const isWithinRadius = useCallback((lat1: number, lng1: number, lat2: number, lng2: number, radius: number, accuracy?: number): boolean => {
    const distance = calculateDistance(lat1, lng1, lat2, lng2);
    
    // If we have accuracy information, adjust the effective radius
    // This accounts for GPS uncertainty
    let effectiveRadius = radius;
    if (accuracy && accuracy > 0) {
      // If accuracy is poor (>100m), be more lenient
      if (accuracy > 100) {
        effectiveRadius = radius + Math.min(accuracy * 0.5, 200); // Add up to 200m buffer for poor accuracy
      } else if (accuracy > 50) {
        effectiveRadius = radius + Math.min(accuracy * 0.3, 100); // Add up to 100m buffer for moderate accuracy
      } else {
        effectiveRadius = radius + 10; // Small buffer for good accuracy
      }
    }
    
    return distance <= effectiveRadius;
  }, [calculateDistance]);

  // Get current location with enhanced accuracy and multiple attempts
  const getCurrentLocation = useCallback((): Promise<GeolocationCoordinates> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const error: GeolocationError = {
          code: 0,
          message: 'Geolocation is not supported by this browser'
        };
        setError(error);
        reject(error);
        return;
      }

      setIsLoading(true);
      setError(null);

      // Strategy 1: High accuracy GPS first
      const highAccuracyOptions: PositionOptions = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0 // Force fresh location
      };

      // Strategy 2: Fallback with network/wifi positioning
      const networkOptions: PositionOptions = {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 30000
      };

      const tryHighAccuracy = () => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            // Enterprise validation - accept any accuracy but log quality
            const coords: GeolocationCoordinates = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              altitude: position.coords.altitude,
              altitudeAccuracy: position.coords.altitudeAccuracy,
              heading: position.coords.heading,
              speed: position.coords.speed
            };

            // Log GPS quality for enterprise monitoring
            console.log(`Enterprise GPS: ${coords.accuracy.toFixed(1)}m accuracy (${coords.accuracy <= 20 ? 'Excellent' : coords.accuracy <= 100 ? 'Good' : coords.accuracy <= 1000 ? 'Fair' : 'Poor'})`);
            
            setLocation(coords);
            setIsLoading(false);
            resolve(coords);
          },
          () => {
            // High accuracy failed, try network positioning
            tryNetworkPositioning();
          },
          highAccuracyOptions
        );
      };

      const tryNetworkPositioning = () => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const coords: GeolocationCoordinates = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              altitude: position.coords.altitude,
              altitudeAccuracy: position.coords.altitudeAccuracy,
              heading: position.coords.heading,
              speed: position.coords.speed
            };
            
            setLocation(coords);
            setIsLoading(false);
            resolve(coords);
          },
          (err) => {
            let message: string;
            switch (err.code) {
              case err.PERMISSION_DENIED:
                message = 'Location access denied. Please enable location permissions in your browser settings.';
                break;
              case err.POSITION_UNAVAILABLE:
                message = 'Location unavailable. Please ensure GPS/location services are enabled.';
                break;
              case err.TIMEOUT:
                message = 'Location request timed out. Please try again or move to an area with better signal.';
                break;
              default:
                message = 'Unable to retrieve location. Please check your device settings.';
                break;
            }

            const error: GeolocationError = {
              code: err.code,
              message
            };
            
            setError(error);
            setIsLoading(false);
            reject(error);
          },
          networkOptions
        );
      };

      // Start with high accuracy GPS
      tryHighAccuracy();
    });
  }, []);

  // Watch position for real-time updates (optional)
  const watchPosition = useCallback(() => {
    if (!navigator.geolocation) {
      setError({
        code: 0,
        message: 'Geolocation is not supported by this browser'
      });
      return null;
    }

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000 // Cache for 30 seconds for real-time updates
    };

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const coords: GeolocationCoordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          altitudeAccuracy: position.coords.altitudeAccuracy,
          heading: position.coords.heading,
          speed: position.coords.speed
        };
        
        setLocation(coords);
        setError(null);
      },
      (err) => {
        let message: string;
        switch (err.code) {
          case err.PERMISSION_DENIED:
            message = 'Location access denied by user';
            break;
          case err.POSITION_UNAVAILABLE:
            message = 'Location information is unavailable';
            break;
          case err.TIMEOUT:
            message = 'Location request timed out';
            break;
          default:
            message = 'An unknown error occurred';
            break;
        }

        setError({
          code: err.code,
          message
        });
      },
      options
    );

    return watchId;
  }, []);

  // Clear watch on unmount
  useEffect(() => {
    return () => {
      // Cleanup any ongoing watch if needed
    };
  }, []);

  return {
    location,
    error,
    isLoading,
    getCurrentLocation,
    calculateDistance,
    isWithinRadius
  };
}
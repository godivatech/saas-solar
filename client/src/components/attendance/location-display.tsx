import React from "react";
import { MapPin } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface LocationDisplayProps {
  latitude?: string;
  longitude?: string;
  className?: string;
}

export function LocationDisplay({ latitude, longitude, className }: LocationDisplayProps) {
  const [address, setAddress] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!latitude || !longitude) return;

    const fetchAddress = async () => {
      setLoading(true);
      try {
        const response = await apiRequest(`/api/reverse-geocode?lat=${latitude}&lng=${longitude}`, 'GET');
        const data = await response.json();
        
        if (data.address) {
          setAddress(data.address);
        } else {
          setAddress(`${parseFloat(latitude).toFixed(4)}, ${parseFloat(longitude).toFixed(4)}`);
        }
      } catch (error) {
        console.error('Error fetching address:', error);
        setAddress(`${parseFloat(latitude).toFixed(4)}, ${parseFloat(longitude).toFixed(4)}`);
      } finally {
        setLoading(false);
      }
    };

    fetchAddress();
  }, [latitude, longitude]);

  if (!latitude || !longitude) {
    return (
      <div className={`flex items-center gap-2 text-gray-400 ${className}`}>
        <MapPin className="h-4 w-4" />
        <span className="text-sm">No location data</span>
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-2 ${className}`}>
      <MapPin className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate" title={address}>
          {loading ? "Loading address..." : address}
        </div>
        {!loading && address && (
          <div className="text-xs text-gray-400 truncate" title={`${latitude}, ${longitude}`}>
            {latitude}, {longitude}
          </div>
        )}
      </div>
    </div>
  );
}
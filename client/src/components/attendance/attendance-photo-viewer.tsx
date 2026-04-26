/**
 * Attendance Photo Viewer Modal
 * High-quality reusable component for viewing check-in and check-out photos
 */

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Camera,
  Download,
  Clock,
  User,
  Loader2,
  AlertCircle
} from "lucide-react";
import { TimeDisplay } from "@/components/time/time-display";

interface AttendancePhotoViewerProps {
  isOpen: boolean;
  onClose: () => void;
  attendanceRecord: {
    id: string;
    userName?: string;
    userDepartment?: string;
    date: string;
    checkInTime?: string;
    checkOutTime?: string;
    checkInImageUrl?: string;
    checkOutImageUrl?: string;
    checkInLatitude?: string;
    checkInLongitude?: string;
    checkOutLatitude?: string;
    checkOutLongitude?: string;
  };
}

interface PhotoCardProps {
  title: string;
  time?: string;
  imageUrl?: string;
  latitude?: string;
  longitude?: string;
  icon: React.ReactNode;
  variant: "check-in" | "check-out";
}

function PhotoCard({ title, time, imageUrl, latitude, longitude, icon, variant }: PhotoCardProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const handleImageLoad = () => {
    setIsLoading(false);
    setHasError(false);
  };

  const handleImageError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  const handleDownload = async () => {
    if (!imageUrl) return;

    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `attendance-${variant}-${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const handleExternalView = () => {
    if (imageUrl) {
      window.open(imageUrl, '_blank');
    }
  };

  const borderColor = variant === "check-in" ? "border-green-200" : "border-red-200";
  const accentColor = variant === "check-in" ? "text-green-600" : "text-red-600";

  return (
    <Card className={`${borderColor} bg-gradient-to-br from-white to-gray-50`}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-full bg-white shadow-sm ${accentColor}`}>
              {icon}
            </div>
            <div>
              <h3 className="font-medium text-sm">{title}</h3>
              {time && (
                <p className="text-xs text-gray-500">
                  <TimeDisplay time={time} format12Hour={true} />
                </p>
              )}
            </div>
          </div>

          {/* Action buttons */}
          {imageUrl && !hasError && (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownload}
                className="h-7 w-7 p-0"
                title="Download photo"
              >
                <Download className="h-3 w-3" />
              </Button>

            </div>
          )}
        </div>

        {/* Photo Display */}
        <div className="relative">
          {!imageUrl ? (
            <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
              <div className="text-center text-gray-500">
                <Camera className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No photo available</p>
              </div>
            </div>
          ) : (
            <div className="relative">
              {/* Loading state */}
              {isLoading && (
                <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              )}

              {/* Error state */}
              {hasError && (
                <div className="aspect-video bg-red-50 rounded-lg flex items-center justify-center border border-red-200">
                  <div className="text-center text-red-500">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                    <p className="text-sm">Failed to load photo</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExternalView}
                      className="mt-2 h-7 text-xs"
                    >
                      Try opening directly
                    </Button>
                  </div>
                </div>
              )}

              {/* Photo */}
              <img
                src={imageUrl}
                alt={`${title} verification photo`}
                className={`w-full rounded-lg shadow-sm hover:shadow-md transition-shadow ${isLoading ? 'hidden' : hasError ? 'hidden' : 'block'
                  }`}
                style={{ aspectRatio: '16/9', objectFit: 'cover' }}
                onLoad={handleImageLoad}
                onError={handleImageError}
              />
            </div>
          )}
        </div>

        {/* Location info */}

      </CardContent>
    </Card>
  );
}

export function AttendancePhotoViewer({ isOpen, onClose, attendanceRecord }: AttendancePhotoViewerProps) {
  const hasCheckInPhoto = !!attendanceRecord.checkInImageUrl;
  const hasCheckOutPhoto = !!attendanceRecord.checkOutImageUrl;
  const hasAnyPhoto = hasCheckInPhoto || hasCheckOutPhoto;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-semibold flex items-center gap-2">
                <Camera className="h-5 w-5" />
                Attendance Photos
              </DialogTitle>
              <div className="mt-1 space-y-1 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <User className="h-3 w-3" />
                  <span>{attendanceRecord.userName || `User ID: ${attendanceRecord.id}`}</span>
                  {attendanceRecord.userDepartment && (
                    <Badge variant="outline" className="text-xs">
                      {attendanceRecord.userDepartment}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  <span>{new Date(attendanceRecord.date).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

          </div>
        </DialogHeader>

        <div className="mt-4">
          {!hasAnyPhoto ? (
            <div className="text-center py-8 text-gray-500">
              <Camera className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No photos available</p>
              <p className="text-sm">This attendance record doesn't have any verification photos.</p>
            </div>
          ) : (
            <div className={`grid gap-4 ${hasCheckInPhoto && hasCheckOutPhoto ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
              {/* Check-in Photo */}
              {hasCheckInPhoto && (
                <PhotoCard
                  title="Check-in Photo"
                  time={attendanceRecord.checkInTime}
                  imageUrl={attendanceRecord.checkInImageUrl}
                  latitude={attendanceRecord.checkInLatitude}
                  longitude={attendanceRecord.checkInLongitude}
                  icon={<Camera className="h-4 w-4" />}
                  variant="check-in"
                />
              )}

              {/* Check-out Photo */}
              {hasCheckOutPhoto && (
                <PhotoCard
                  title="Check-out Photo"
                  time={attendanceRecord.checkOutTime}
                  imageUrl={attendanceRecord.checkOutImageUrl}
                  latitude={attendanceRecord.checkOutLatitude}
                  longitude={attendanceRecord.checkOutLongitude}
                  icon={<Camera className="h-4 w-4" />}
                  variant="check-out"
                />
              )}
            </div>
          )}
        </div>

        {/* Summary footer */}
        {hasAnyPhoto && (
          <div className="mt-4 pt-4 border-t bg-gray-50 -mx-6 -mb-6 px-6 py-4 rounded-b-lg">
            <div className="flex items-center justify-between text-sm text-gray-600">
              <div className="flex items-center gap-4">
                <span>
                  {hasCheckInPhoto && hasCheckOutPhoto
                    ? "Both check-in and check-out photos available"
                    : hasCheckInPhoto
                      ? "Check-in photo available"
                      : "Check-out photo available"
                  }
                </span>
              </div>
              <div className="text-xs">
                Use action buttons to download or view externally
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
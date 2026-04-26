/**
 * Site Visit Details Modal
 * Displays detailed information about a site visit
 */

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  MapPin, X, ChevronLeft, ChevronRight,
  Clock,
  Camera,
  User,
  Phone,
  Building,
  Calendar,
  FileText,
  Zap,
  CheckCircle,
  AlertCircle,
  Eye,
  ExternalLink,
  Battery,
  Flame,
  Waves,
  Droplets,
  CreditCard,
  Wrench,
  Users,
  AlertTriangle,
  TrendingUp,
  CircleX
} from "lucide-react";
import { format } from "date-fns";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

interface SiteVisit {
  id: string;
  userId: string;
  department: 'technical' | 'marketing' | 'admin' | 'operations' | 'hr' | 'sales' | 'housekeeping';
  visitPurpose: string;
  status: 'in_progress' | 'completed' | 'cancelled';
  siteInTime: string | Date;
  siteOutTime?: string | Date;
  // Location tracking fields
  siteInLocation?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    address?: string;
  };
  siteOutLocation?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    address?: string;
  };
  // Photo URLs
  siteInPhotoUrl?: string;
  siteOutPhotoUrl?: string;
  siteOutPhotos?: string[]; // Checkout photos array
  // Customer with location
  customer: {
    name: string;
    mobile: string;
    address: string;
    propertyType?: string;
    ebServiceNumber?: string;
    location?: string; // Additional customer location field
    source?: string; // Source of the customer lead
  };
  // Follow-up system fields
  isFollowUp?: boolean;
  followUpOf?: string;
  hasFollowUps?: boolean;
  followUpCount?: number;
  followUpReason?: string;
  followUpDescription?: string;
  technicalData?: {
    serviceTypes: string[];
    workType: string;
    workingStatus: string;
    pendingRemarks?: string;
    teamMembers: string[];
    description?: string;
  };
  marketingData?: {
    updateRequirements: boolean;
    projectType: string;
    onGridConfig?: any;
    offGridConfig?: any;
    hybridConfig?: any;
    waterHeaterConfig?: any;
    waterPumpConfig?: any;
  };
  adminData?: {
    bankProcess?: any;
    ebProcess?: any;
    purchase?: string;
    driving?: string;
    officialCashTransactions?: string;
    officialPersonalWork?: string;
    others?: string;
  };
  sitePhotos: Array<{
    url: string;
    timestamp: string | Date;
    description?: string;
    location?: { // Photo location data
      latitude: number;
      longitude: number;
      accuracy?: number;
      address?: string;
    };
  }>;
  notes?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  // Additional monitoring fields
  userName?: string;
  userDepartment?: string;
  // Visit outcome fields
  visitOutcome?: 'converted' | 'on_process' | 'cancelled';
  outcomeNotes?: string;
  scheduledFollowUpDate?: string;
  outcomeSelectedAt?: string;
  outcomeSelectedBy?: string;
}

interface SiteVisitDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  siteVisit: SiteVisit | null;
}

export function SiteVisitDetailsModal({ isOpen, onClose, siteVisit }: SiteVisitDetailsModalProps) {
  if (!siteVisit) return null;

  // Separate Lightbox States - Attendance vs Site Photos
  const [attendanceLightboxIndex, setAttendanceLightboxIndex] = useState(-1);
  const [sitePhotosLightboxIndex, setSitePhotosLightboxIndex] = useState(-1);

  // Determine truly unique site photos (filtering out cross-duplicates from check-in/out and deduping)
  const filteredSitePhotos = useMemo(() => {
    if (!siteVisit.sitePhotos) return [];
    const clean = (u: any) => typeof u === 'string' ? u.split('?')[0] : '';

    const excluded = new Set<string>();
    if (siteVisit.siteInPhotoUrl) excluded.add(clean(siteVisit.siteInPhotoUrl));
    if (siteVisit.siteOutPhotoUrl) excluded.add(clean(siteVisit.siteOutPhotoUrl));
    if (siteVisit.siteOutPhotos) siteVisit.siteOutPhotos.forEach(u => excluded.add(clean(u)));

    // Also exclude empty strings
    excluded.delete('');

    const seen = new Set<string>();
    return siteVisit.sitePhotos.filter(p => {
      const url = typeof p === 'string' ? p : p.url;
      if (!url || typeof url !== 'string') return false;

      const c = clean(url);
      if (excluded.has(c) || seen.has(c)) return false;

      seen.add(c);
      return true;
    });
  }, [siteVisit]);

  const uniqueSitePhotosCount = filteredSitePhotos.length;

  // 1. Attendance Photos (Check-in & Check-out ONLY)
  const attendancePhotos = useMemo(() => {
    const photos: string[] = [];
    if (siteVisit.siteInPhotoUrl) photos.push(siteVisit.siteInPhotoUrl);
    if (siteVisit.siteOutPhotoUrl) photos.push(siteVisit.siteOutPhotoUrl);
    return photos;
  }, [siteVisit]);

  // 2. Site Work Photos (Documentation ONLY - excludes attendance)
  const siteWorkPhotos = useMemo(() => {
    const gallery: any[] = [];
    const clean = (u: any) => typeof u === 'string' ? u.split('?')[0] : '';
    const seen = new Set<string>();

    const addUnique = (photo: any) => {
      if (!photo) return;
      const url = typeof photo === 'string' ? photo : photo.url;
      if (!url || typeof url !== 'string') return;

      const cleanUrl = clean(url);
      if (!seen.has(cleanUrl)) {
        seen.add(cleanUrl);
        gallery.push(photo);
      }
    };

    // Site Photos (field photos only - already filtered)
    filteredSitePhotos.forEach(p => addUnique(p));

    // Additional Checkout Photos (if any)
    if (siteVisit.siteOutPhotos) {
      siteVisit.siteOutPhotos.forEach(p => addUnique(p));
    }

    return gallery;
  }, [siteVisit, filteredSitePhotos]);

  // Attendance Lightbox Handlers
  const openAttendanceLightbox = (photoUrl: any) => {
    if (!photoUrl) return;
    const index = attendancePhotos.indexOf(photoUrl);
    setAttendanceLightboxIndex(index >= 0 ? index : 0);
  };

  // Site Photos Lightbox Handlers
  const openSitePhotosLightbox = (photoUrl: any) => {
    if (!photoUrl) return;
    const clean = (u: any) => typeof u === 'string' ? u.split('?')[0] : '';
    const target = clean(photoUrl);
    const index = siteWorkPhotos.findIndex(p => {
      const pUrl = typeof p === 'string' ? p : p.url;
      return clean(pUrl) === target;
    });
    setSitePhotosLightboxIndex(index >= 0 ? index : 0);
  };



  // Helper functions to handle both legacy string values and new array values
  const formatStringOrArray = (value: string | string[] | undefined): string => {
    if (!value) return 'Not specified';
    if (Array.isArray(value)) {
      return value.length > 0 ? value.join(', ').replace(/_/g, ' ').toUpperCase() : 'Not specified';
    }
    return value.replace(/_/g, ' ').toUpperCase();
  };

  const formatStringOrArraySimple = (value: string | string[] | undefined): string => {
    if (!value) return 'Not specified';
    if (Array.isArray(value)) {
      return value.length > 0 ? value.join(', ').toUpperCase() : 'Not specified';
    }
    return value.toUpperCase();
  };

  const formatEarthConnection = (value: string | string[] | undefined): string => {
    if (!value) return 'Not specified';
    if (Array.isArray(value)) {
      if (value.length === 0) return 'Not specified';
      return value.map(v => v === 'ac_dc' ? 'AC/DC' : v.toUpperCase()).join(', ');
    }
    return value === 'ac_dc' ? 'AC/DC' : value.toUpperCase();
  };

  const formatStructureType = (value: string | undefined): string => {
    if (!value) return 'Not specified';
    switch (value) {
      case 'gp_structure': return 'GP Structure';
      case 'mono_rail': return 'Mono Rail';
      case 'gi_structure': return 'GI Structure';
      case 'gi_round_pipe': return 'GI Round Pipe';
      case 'ms_square_pipe': return 'MS Square Pipe';
      default: return value.replace(/_/g, ' ').toUpperCase();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_progress': return 'bg-orange-100 text-orange-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getDepartmentColor = (department: string) => {
    switch (department) {
      case 'technical': return 'bg-blue-100 text-blue-800';
      case 'marketing': return 'bg-purple-100 text-purple-800';
      case 'admin': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getOutcomeColor = (outcome: string) => {
    switch (outcome) {
      case 'converted': return 'bg-green-100 text-green-800 border-green-200';
      case 'on_process': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getOutcomeIcon = (outcome: string) => {
    switch (outcome) {
      case 'converted': return <TrendingUp className="h-4 w-4" />;
      case 'on_process': return <Zap className="h-4 w-4" />;
      case 'cancelled': return <CircleX className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getOutcomeLabel = (outcome: string) => {
    switch (outcome) {
      case 'converted': return 'Converted';
      case 'on_process': return 'On Process';
      case 'cancelled': return 'Cancelled';
      default: return 'Unknown';
    }
  };

  // Helper function to check if follow-up date is overdue
  const isOverdue = (dateString?: string) => {
    if (!dateString) return false;
    const followUpDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    followUpDate.setHours(0, 0, 0, 0);
    return followUpDate < today;
  };

  // Helper function to check if follow-up date is today
  const isToday = (dateString?: string) => {
    if (!dateString) return false;
    const followUpDate = new Date(dateString);
    const today = new Date();
    return followUpDate.toDateString() === today.toDateString();
  };

  const getWorkingStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'pending': return <AlertCircle className="h-4 w-4 text-orange-600" />;
      default: return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const calculateDuration = () => {
    const startTime = new Date(siteVisit.siteInTime);
    const endTime = siteVisit.siteOutTime ? new Date(siteVisit.siteOutTime) : new Date();
    const diffInMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / (1000 * 60));

    if (diffInMinutes < 60) {
      return `${diffInMinutes} minutes`;
    } else {
      const hours = Math.floor(diffInMinutes / 60);
      const minutes = diffInMinutes % 60;
      return `${hours}h ${minutes}m`;
    }
  };

  // Prevent closing the main dialog when lightbox is open


  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className={`w-[95vw] max-w-4xl max-h-[90vh] p-3 sm:p-6 ${attendanceLightboxIndex >= 0 || sitePhotosLightboxIndex >= 0 ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden'}`}>
          <DialogHeader className="space-y-2">
            <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <MapPin className="h-4 w-4 sm:h-5 sm:w-5" />
              Site Visit Details
            </DialogTitle>
            <DialogDescription className="text-sm">
              Complete information about the site visit
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 sm:space-y-6">
            {/* Header Info */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="space-y-2 flex-1">
                <div className="flex flex-wrap gap-1 sm:gap-2">
                  <Badge className={getStatusColor(siteVisit.status)}>
                    {siteVisit.status.replace('_', ' ')}
                  </Badge>
                  <Badge variant="outline" className={getDepartmentColor(siteVisit.department)}>
                    {siteVisit.department}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {siteVisit.visitPurpose}
                  </Badge>
                  {siteVisit.visitOutcome && (
                    <Badge className={getOutcomeColor(siteVisit.visitOutcome)}>
                      {getOutcomeIcon(siteVisit.visitOutcome)}
                      <span className="ml-1">{getOutcomeLabel(siteVisit.visitOutcome)}</span>
                    </Badge>
                  )}
                </div>
                <h2 className="text-lg sm:text-xl lg:text-2xl font-bold break-words">{siteVisit.customer.name}</h2>
              </div>
              <div className="text-left sm:text-right text-xs sm:text-sm text-muted-foreground bg-gray-50 p-2 rounded-lg sm:bg-transparent sm:p-0">
                <p>Visit ID: {siteVisit.id.slice(0, 8)}</p>
                <p>Created: {format(new Date(siteVisit.createdAt || siteVisit.siteInTime), 'PPP')}</p>
              </div>
            </div>

            {/* Visit Outcome Section */}
            {(siteVisit.visitOutcome || siteVisit.scheduledFollowUpDate || siteVisit.outcomeNotes) && (
              <Card className="border-l-4 border-l-blue-500">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
                    Visit Outcome & Follow-up Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {siteVisit.visitOutcome && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Visit Outcome</p>
                      <Badge className={`${getOutcomeColor(siteVisit.visitOutcome)} px-3 py-1`}>
                        {getOutcomeIcon(siteVisit.visitOutcome)}
                        <span className="ml-2 font-medium">{getOutcomeLabel(siteVisit.visitOutcome)}</span>
                      </Badge>
                    </div>
                  )}

                  {siteVisit.scheduledFollowUpDate && (
                    <div className={`p-4 rounded-lg border-l-4 ${isOverdue(siteVisit.scheduledFollowUpDate)
                      ? 'bg-red-50 border-l-red-500 border-red-200'
                      : isToday(siteVisit.scheduledFollowUpDate)
                        ? 'bg-yellow-50 border-l-yellow-500 border-yellow-200'
                        : 'bg-blue-50 border-l-blue-500 border-blue-200'
                      }`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className={`h-4 w-4 ${isOverdue(siteVisit.scheduledFollowUpDate)
                          ? 'text-red-600'
                          : isToday(siteVisit.scheduledFollowUpDate)
                            ? 'text-yellow-600'
                            : 'text-blue-600'
                          }`} />
                        <span className={`font-medium text-sm ${isOverdue(siteVisit.scheduledFollowUpDate)
                          ? 'text-red-700'
                          : isToday(siteVisit.scheduledFollowUpDate)
                            ? 'text-yellow-700'
                            : 'text-blue-700'
                          }`}>
                          {isOverdue(siteVisit.scheduledFollowUpDate) && 'Overdue Follow-up'}
                          {isToday(siteVisit.scheduledFollowUpDate) && 'Follow-up Scheduled Today'}
                          {!isOverdue(siteVisit.scheduledFollowUpDate) && !isToday(siteVisit.scheduledFollowUpDate) && 'Scheduled Follow-up'}
                        </span>
                      </div>
                      <p className={`text-sm ${isOverdue(siteVisit.scheduledFollowUpDate)
                        ? 'text-red-600 font-medium'
                        : isToday(siteVisit.scheduledFollowUpDate)
                          ? 'text-yellow-700 font-medium'
                          : 'text-blue-600'
                        }`}>
                        {format(new Date(siteVisit.scheduledFollowUpDate), 'PPPP')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(siteVisit.scheduledFollowUpDate), 'EEEE, h:mm a')}
                      </p>
                    </div>
                  )}

                  {siteVisit.outcomeNotes && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Outcome Notes</p>
                      <div className="bg-gray-50 p-3 rounded-lg border">
                        <p className="text-sm text-gray-700 leading-relaxed">
                          {siteVisit.outcomeNotes}
                        </p>
                      </div>
                    </div>
                  )}

                  {siteVisit.outcomeSelectedAt && (
                    <div className="pt-2 border-t border-gray-200">
                      <p className="text-xs text-muted-foreground">
                        Outcome selected on {format(new Date(siteVisit.outcomeSelectedAt), 'PPP p')}
                        {siteVisit.outcomeSelectedBy && ` by ${siteVisit.outcomeSelectedBy}`}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Location Tracking Section */}
            {(siteVisit.siteInLocation || siteVisit.siteOutLocation) && (
              <Card className="col-span-1 lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Location Tracking
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {siteVisit.siteInLocation && (
                      <div className="space-y-2">
                        <h4 className="font-medium text-green-700 flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          Check-in Location
                        </h4>
                        <div className="text-sm space-y-1 bg-green-50 p-3 rounded-lg">
                          {siteVisit.siteInLocation.address && (
                            <p><span className="text-muted-foreground">Address:</span> {siteVisit.siteInLocation.address}</p>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={() => window.open(`https://maps.google.com/?q=${siteVisit.siteInLocation!.latitude},${siteVisit.siteInLocation!.longitude}`, '_blank')}
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            View on Maps
                          </Button>
                        </div>
                      </div>
                    )}

                    {siteVisit.siteOutLocation && (
                      <div className="space-y-2">
                        <h4 className="font-medium text-red-700 flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          Check-out Location
                        </h4>
                        <div className="text-sm space-y-1 bg-red-50 p-3 rounded-lg">
                          {siteVisit.siteOutLocation.address && (
                            <p><span className="text-muted-foreground">Address:</span> {siteVisit.siteOutLocation.address}</p>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={() => window.open(`https://maps.google.com/?q=${siteVisit.siteOutLocation!.latitude},${siteVisit.siteOutLocation!.longitude}`, '_blank')}
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            View on Maps
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Follow-up System Section */}
            {(siteVisit.isFollowUp || siteVisit.hasFollowUps || siteVisit.followUpReason) && (
              <Card className="col-span-1 lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Follow-up Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {siteVisit.isFollowUp && (
                      <div className="space-y-2">
                        <h4 className="font-medium text-blue-700">This is a Follow-up Visit</h4>
                        {siteVisit.followUpOf && (
                          <p className="text-sm text-muted-foreground">Original Visit ID: {siteVisit.followUpOf}</p>
                        )}
                        {siteVisit.followUpReason && (
                          <div>
                            <p className="text-sm text-muted-foreground">Reason:</p>
                            <p className="text-sm font-medium">{siteVisit.followUpReason}</p>
                          </div>
                        )}
                        {siteVisit.followUpDescription && (
                          <div>
                            <p className="text-sm text-muted-foreground">Description:</p>
                            <p className="text-sm">{siteVisit.followUpDescription}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {siteVisit.hasFollowUps && (
                      <div className="space-y-2">
                        <h4 className="font-medium text-purple-700">Has Follow-up Visits</h4>
                        {siteVisit.followUpCount && (
                          <p className="text-sm text-muted-foreground">Total Follow-ups: {siteVisit.followUpCount}</p>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {/* Customer Information */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <User className="h-4 w-4 sm:h-5 sm:w-5" />
                    Customer Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{siteVisit.customer.name}</p>
                      <p className="text-xs sm:text-sm text-muted-foreground capitalize">{siteVisit.customer.propertyType} Property</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="break-all">{siteVisit.customer.mobile}</span>
                  </div>

                  <div className="flex items-start gap-2 sm:gap-3">
                    <Building className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
                    <span className="text-xs sm:text-sm break-words">{siteVisit.customer.address}</span>
                  </div>

                  {siteVisit.customer.ebServiceNumber && (
                    <div className="flex items-center gap-2 sm:gap-3">
                      <Zap className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm text-muted-foreground">EB Service Number</p>
                        <p className="font-medium break-all">{siteVisit.customer.ebServiceNumber}</p>
                      </div>
                    </div>
                  )}

                  {siteVisit.customer.location && (
                    <div className="flex items-center gap-2 sm:gap-3">
                      <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm text-muted-foreground">Customer Location</p>
                        <p className="font-medium break-all">{siteVisit.customer.location}</p>
                      </div>
                    </div>
                  )}

                  {siteVisit.customer.source && (
                    <div className="flex items-center gap-2 sm:gap-3">
                      <TrendingUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm text-muted-foreground">Source</p>
                        <p className="font-medium break-all">{siteVisit.customer.source}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Visit Timeline */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
                    Visit Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm text-muted-foreground">Site In Time</p>
                      <p className="font-medium text-xs sm:text-sm break-words">{format(new Date(siteVisit.siteInTime), 'PPP p')}</p>
                    </div>
                  </div>

                  {siteVisit.siteOutTime && (
                    <div className="flex items-center gap-2 sm:gap-3">
                      <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm text-muted-foreground">Site Out Time</p>
                        <p className="font-medium text-xs sm:text-sm break-words">{format(new Date(siteVisit.siteOutTime), 'PPP p')}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 sm:gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm text-muted-foreground">Duration</p>
                      <p className="font-medium">{calculateDuration()}</p>
                    </div>
                  </div>

                  {siteVisit.status === 'in_progress' && (
                    <Badge variant="outline" className="text-orange-600 text-xs">
                      Visit in Progress
                    </Badge>
                  )}
                </CardContent>
              </Card>
            </div>

            {siteVisit.marketingData && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building className="h-5 w-5" />
                    Marketing Project Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Update Requirements</p>
                      <Badge variant={siteVisit.marketingData.updateRequirements ? "default" : "secondary"}>
                        {siteVisit.marketingData.updateRequirements ? "Yes" : "No"}
                      </Badge>
                    </div>

                    {siteVisit.marketingData.projectType && (
                      <div>
                        <p className="text-sm text-muted-foreground">Project Type</p>
                        <Badge variant="outline" className="capitalize">
                          {siteVisit.marketingData.projectType.replace('_', ' ')}
                        </Badge>
                      </div>
                    )}
                  </div>

                  {/* Show message when no detailed project data is available */}
                  {!siteVisit.marketingData.onGridConfig &&
                    !siteVisit.marketingData.offGridConfig &&
                    !siteVisit.marketingData.hybridConfig &&
                    !siteVisit.marketingData.waterHeaterConfig &&
                    !siteVisit.marketingData.waterPumpConfig && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-blue-700 mb-2">
                          <Building className="h-4 w-4" />
                          <span className="font-medium">Project Requirements Update</span>
                        </div>
                        <p className="text-sm text-blue-600">
                          {siteVisit.marketingData.updateRequirements
                            ? "The customer indicated they want to update requirements, but no detailed project configuration was recorded during this visit."
                            : "The customer indicated they do not need to update project requirements at this time."
                          }
                        </p>
                      </div>
                    )}

                  {/* On-Grid Configuration Details */}
                  {siteVisit.marketingData.onGridConfig && (
                    <div className="space-y-3">
                      <Separator />
                      <h4 className="font-medium text-blue-700">On-Grid Solar System Configuration</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-blue-50 p-4 rounded-lg">
                        <div>
                          <p className="text-sm text-muted-foreground">Solar Panel Make</p>
                          <p className="font-medium">{formatStringOrArray(siteVisit.marketingData.onGridConfig.solarPanelMake)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Panel Watts</p>
                          <p className="font-medium">{siteVisit.marketingData.onGridConfig.panelWatts}W</p>
                        </div>
                        {siteVisit.marketingData.onGridConfig.panelType && (
                          <div>
                            <p className="text-sm text-muted-foreground">Panel Type</p>
                            <p className="font-medium capitalize">
                              {siteVisit.marketingData.onGridConfig.panelType === 'bifacial' ? 'Bifacial' :
                                siteVisit.marketingData.onGridConfig.panelType === 'topcon' ? 'Topcon' : 'Mono-PERC'}
                            </p>
                          </div>
                        )}
                        <div>
                          <p className="text-sm text-muted-foreground">Inverter Make</p>
                          <p className="font-medium">{formatStringOrArraySimple(siteVisit.marketingData.onGridConfig.inverterMake)}</p>
                        </div>
                        {siteVisit.marketingData.onGridConfig.inverterKW && (
                          <div>
                            <p className="text-sm text-muted-foreground">Inverter KW</p>
                            <p className="font-medium">{siteVisit.marketingData.onGridConfig.inverterKW} KW</p>
                          </div>
                        )}
                        <div>
                          <p className="text-sm text-muted-foreground">Inverter Phase</p>
                          <p className="font-medium capitalize">{siteVisit.marketingData.onGridConfig.inverterPhase?.replace('_', ' ')}</p>
                        </div>
                        {siteVisit.marketingData.onGridConfig.inverterQty && (
                          <div>
                            <p className="text-sm text-muted-foreground">Inverter Qty</p>
                            <p className="font-medium">{siteVisit.marketingData.onGridConfig.inverterQty} units</p>
                          </div>
                        )}
                        <div>
                          <p className="text-sm text-muted-foreground">Earth Connection</p>
                          <p className="font-medium">{formatEarthConnection(siteVisit.marketingData.onGridConfig.earth)}</p>
                        </div>
                        {(siteVisit.marketingData.onGridConfig.dcrPanelCount > 0 || siteVisit.marketingData.onGridConfig.nonDcrPanelCount > 0) && (
                          <>
                            <div>
                              <p className="text-sm text-muted-foreground">DCR Panel Count</p>
                              <p className="font-medium">{siteVisit.marketingData.onGridConfig.dcrPanelCount || 0} panels</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">NON DCR Panel Count</p>
                              <p className="font-medium">{siteVisit.marketingData.onGridConfig.nonDcrPanelCount || 0} panels</p>
                            </div>
                          </>
                        )}
                        <div>
                          <p className="text-sm text-muted-foreground">Total Panel Count</p>
                          <p className="font-medium">{siteVisit.marketingData.onGridConfig.panelCount} panels</p>
                        </div>
                        {siteVisit.marketingData.onGridConfig.floor && (
                          <div>
                            <p className="text-sm text-muted-foreground">Floor Level</p>
                            <p className="font-medium">
                              {siteVisit.marketingData.onGridConfig.floor === '0' ? 'Ground Floor' :
                                `${siteVisit.marketingData.onGridConfig.floor}${siteVisit.marketingData.onGridConfig.floor === '1' ? 'st' :
                                  siteVisit.marketingData.onGridConfig.floor === '2' ? 'nd' :
                                    siteVisit.marketingData.onGridConfig.floor === '3' ? 'rd' : 'th'
                                } Floor`}
                            </p>
                          </div>
                        )}
                        <div>
                          <p className="text-sm text-muted-foreground">Lightning Arrestor</p>
                          <Badge variant={siteVisit.marketingData.onGridConfig.lightningArrest ? "default" : "secondary"}>
                            {siteVisit.marketingData.onGridConfig.lightningArrest ? "Yes" : "No"}
                          </Badge>
                        </div>
                        {siteVisit.marketingData.onGridConfig.electricalAccessories !== undefined && (
                          <div>
                            <p className="text-sm text-muted-foreground">Electrical Accessories</p>
                            <Badge variant={siteVisit.marketingData.onGridConfig.electricalAccessories ? "default" : "secondary"}>
                              {siteVisit.marketingData.onGridConfig.electricalAccessories ? "Yes" : "No"}
                            </Badge>
                            {siteVisit.marketingData.onGridConfig.electricalAccessories && siteVisit.marketingData.onGridConfig.electricalCount && (
                              <p className="text-sm mt-1">Count: {siteVisit.marketingData.onGridConfig.electricalCount}</p>
                            )}
                          </div>
                        )}
                        <div>
                          <p className="text-sm text-muted-foreground">Project Value</p>
                          <p className="font-medium text-green-600">₹{siteVisit.marketingData.onGridConfig.projectValue?.toLocaleString() || 'TBD'}</p>
                        </div>
                        {siteVisit.marketingData.onGridConfig.others && (
                          <div className="col-span-full">
                            <p className="text-sm text-muted-foreground">Additional Notes</p>
                            <p className="font-medium">{siteVisit.marketingData.onGridConfig.others}</p>
                          </div>
                        )}
                      </div>

                      {/* Structure Configuration */}
                      {(siteVisit.marketingData.onGridConfig.structureType ||
                        siteVisit.marketingData.onGridConfig.gpStructure ||
                        siteVisit.marketingData.onGridConfig.monoRail) && (
                          <div className="space-y-3">
                            <h5 className="font-medium text-blue-600">Structure Configuration</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-blue-25 p-3 rounded-lg border border-blue-200">
                              {siteVisit.marketingData.onGridConfig.structureType && (
                                <div>
                                  <p className="text-sm text-muted-foreground">Structure Type</p>
                                  <p className="font-medium">
                                    {formatStructureType(siteVisit.marketingData.onGridConfig.structureType)}
                                  </p>
                                </div>
                              )}

                              {(siteVisit.marketingData.onGridConfig.structureType === 'gp_structure' ||
                                siteVisit.marketingData.onGridConfig.structureType === 'gi_structure' ||
                                siteVisit.marketingData.onGridConfig.structureType === 'gi_round_pipe' ||
                                siteVisit.marketingData.onGridConfig.structureType === 'ms_square_pipe') &&
                                siteVisit.marketingData.onGridConfig.gpStructure && (
                                  <>
                                    <div>
                                      <p className="text-sm text-muted-foreground">Lower End Height</p>
                                      <p className="font-medium">{siteVisit.marketingData.onGridConfig.gpStructure.lowerEndHeight} ft</p>
                                    </div>
                                    <div>
                                      <p className="text-sm text-muted-foreground">Higher End Height</p>
                                      <p className="font-medium">{siteVisit.marketingData.onGridConfig.gpStructure.higherEndHeight} ft</p>
                                    </div>
                                  </>
                                )}

                              {siteVisit.marketingData.onGridConfig.structureType === 'mono_rail' && siteVisit.marketingData.onGridConfig.monoRail && (
                                <div>
                                  <p className="text-sm text-muted-foreground">Mono Rail Type</p>
                                  <p className="font-medium capitalize">
                                    {siteVisit.marketingData.onGridConfig.monoRail.type === 'mini_rail' ? 'Mini Rail' : 'Long Rail'}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                      {/* Work Scope Configuration */}
                      {(siteVisit.marketingData.onGridConfig.civilWorkScope ||
                        siteVisit.marketingData.onGridConfig.netMeterScope ||
                        siteVisit.marketingData.onGridConfig.electricalWorkScope ||
                        siteVisit.marketingData.onGridConfig.plumbingWorkScope) && (
                          <div className="space-y-3">
                            <h5 className="font-medium text-blue-600">Work Scope</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-blue-25 p-3 rounded-lg border border-blue-200">
                              {siteVisit.marketingData.onGridConfig.civilWorkScope && (
                                <div>
                                  <p className="text-sm text-muted-foreground">Civil Work Scope</p>
                                  <p className="font-medium capitalize">
                                    {siteVisit.marketingData.onGridConfig.civilWorkScope === 'customer_scope' ? 'Customer Scope' : 'Company Scope'}
                                  </p>
                                </div>
                              )}
                              {siteVisit.marketingData.onGridConfig.netMeterScope && (
                                <div>
                                  <p className="text-sm text-muted-foreground">Net Meter Scope</p>
                                  <p className="font-medium capitalize">
                                    {siteVisit.marketingData.onGridConfig.netMeterScope === 'customer_scope' ? 'Customer Scope' : 'Company Scope'}
                                  </p>
                                </div>
                              )}
                              {siteVisit.marketingData.onGridConfig.electricalWorkScope && (
                                <div>
                                  <p className="text-sm text-muted-foreground">Electrical Work Scope</p>
                                  <p className="font-medium capitalize">
                                    {siteVisit.marketingData.onGridConfig.electricalWorkScope === 'customer_scope' ? 'Customer Scope' : 'Company Scope'}
                                  </p>
                                </div>
                              )}
                              {siteVisit.marketingData.onGridConfig.plumbingWorkScope && (
                                <div>
                                  <p className="text-sm text-muted-foreground">Plumbing Work Scope</p>
                                  <p className="font-medium capitalize">
                                    {siteVisit.marketingData.onGridConfig.plumbingWorkScope === 'customer_scope' ? 'Customer Scope' : 'Company Scope'}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                    </div>
                  )}

                  {/* Off-Grid Configuration Details */}
                  {siteVisit.marketingData.offGridConfig && (
                    <div className="space-y-3">
                      <Separator />
                      <h4 className="font-medium text-purple-700">Off-Grid Solar System Configuration</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-purple-50 p-4 rounded-lg">
                        <div>
                          <p className="text-sm text-muted-foreground">Solar Panel Make</p>
                          <p className="font-medium">{formatStringOrArray(siteVisit.marketingData.offGridConfig.solarPanelMake)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Panel Watts</p>
                          <p className="font-medium">{siteVisit.marketingData.offGridConfig.panelWatts}W</p>
                        </div>
                        {siteVisit.marketingData.offGridConfig.panelType && (
                          <div>
                            <p className="text-sm text-muted-foreground">Panel Type</p>
                            <p className="font-medium capitalize">
                              {siteVisit.marketingData.offGridConfig.panelType === 'bifacial' ? 'Bifacial' :
                                siteVisit.marketingData.offGridConfig.panelType === 'topcon' ? 'Topcon' : 'Mono-PERC'}
                            </p>
                          </div>
                        )}
                        <div>
                          <p className="text-sm text-muted-foreground">Inverter Make</p>
                          <p className="font-medium">{formatStringOrArraySimple(siteVisit.marketingData.offGridConfig.inverterMake)}</p>
                        </div>
                        {(siteVisit.marketingData.offGridConfig.inverterKVA || siteVisit.marketingData.offGridConfig.inverterKW) && (
                          <div>
                            <p className="text-sm text-muted-foreground">Inverter KVA</p>
                            <p className="font-medium">{siteVisit.marketingData.offGridConfig.inverterKVA || siteVisit.marketingData.offGridConfig.inverterKW} KVA</p>
                          </div>
                        )}
                        {siteVisit.marketingData.offGridConfig.inverterQty && (
                          <div>
                            <p className="text-sm text-muted-foreground">Inverter Qty</p>
                            <p className="font-medium">{siteVisit.marketingData.offGridConfig.inverterQty} units</p>
                          </div>
                        )}
                        {siteVisit.marketingData.offGridConfig.inverterVolt && (
                          <div>
                            <p className="text-sm text-muted-foreground">Inverter Volt</p>
                            <p className="font-medium">{siteVisit.marketingData.offGridConfig.inverterVolt}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-sm text-muted-foreground">Earth Connection</p>
                          <p className="font-medium">{formatEarthConnection(siteVisit.marketingData.offGridConfig.earth)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Battery Brand</p>
                          <p className="font-medium">{
                            siteVisit.marketingData.offGridConfig.batteryBrand === 'exide' ? 'Exide' :
                              siteVisit.marketingData.offGridConfig.batteryBrand === 'utl' ? 'UTL' :
                                siteVisit.marketingData.offGridConfig.batteryBrand === 'exide_utl' ? 'EXIDE/UTL' :
                                  siteVisit.marketingData.offGridConfig.batteryBrand?.replace('_', ' ').toUpperCase()
                          }</p>
                        </div>
                        {siteVisit.marketingData.offGridConfig.batteryType && (
                          <div>
                            <p className="text-sm text-muted-foreground">Battery Type</p>
                            <p className="font-medium">{siteVisit.marketingData.offGridConfig.batteryType === 'lead_acid' ? 'Lead Acid' : 'Lithium'}</p>
                          </div>
                        )}
                        {siteVisit.marketingData.offGridConfig.batteryAH && (
                          <div>
                            <p className="text-sm text-muted-foreground">Battery AH</p>
                            <p className="font-medium">{siteVisit.marketingData.offGridConfig.batteryAH} AH</p>
                          </div>
                        )}
                        <div>
                          <p className="text-sm text-muted-foreground">Battery Voltage</p>
                          <p className="font-medium">{siteVisit.marketingData.offGridConfig.voltage}V</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Battery Count</p>
                          <p className="font-medium">{siteVisit.marketingData.offGridConfig.batteryCount} batteries</p>
                        </div>
                        {(siteVisit.marketingData.offGridConfig.dcrPanelCount > 0 || siteVisit.marketingData.offGridConfig.nonDcrPanelCount > 0) && (
                          <>
                            <div>
                              <p className="text-sm text-muted-foreground">DCR Panel Count</p>
                              <p className="font-medium">{siteVisit.marketingData.offGridConfig.dcrPanelCount || 0} panels</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">NON DCR Panel Count</p>
                              <p className="font-medium">{siteVisit.marketingData.offGridConfig.nonDcrPanelCount || 0} panels</p>
                            </div>
                          </>
                        )}
                        <div>
                          <p className="text-sm text-muted-foreground">Total Panel Count</p>
                          <p className="font-medium">{siteVisit.marketingData.offGridConfig.panelCount} panels</p>
                        </div>
                        {siteVisit.marketingData.offGridConfig.batteryStands && (
                          <div>
                            <p className="text-sm text-muted-foreground">Battery Stands</p>
                            <p className="font-medium">{siteVisit.marketingData.offGridConfig.batteryStands}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-sm text-muted-foreground">Lightning Arrestor</p>
                          <Badge variant={siteVisit.marketingData.offGridConfig.lightningArrest ? "default" : "secondary"}>
                            {siteVisit.marketingData.offGridConfig.lightningArrest ? "Yes" : "No"}
                          </Badge>
                        </div>
                        {siteVisit.marketingData.offGridConfig.electricalAccessories !== undefined && (
                          <div>
                            <p className="text-sm text-muted-foreground">Electrical Accessories</p>
                            <Badge variant={siteVisit.marketingData.offGridConfig.electricalAccessories ? "default" : "secondary"}>
                              {siteVisit.marketingData.offGridConfig.electricalAccessories ? "Yes" : "No"}
                            </Badge>
                            {siteVisit.marketingData.offGridConfig.electricalAccessories && siteVisit.marketingData.offGridConfig.electricalCount && (
                              <p className="text-sm mt-1">Count: {siteVisit.marketingData.offGridConfig.electricalCount}</p>
                            )}
                          </div>
                        )}
                        <div>
                          <p className="text-sm text-muted-foreground">Project Value</p>
                          <p className="font-medium text-green-600">₹{siteVisit.marketingData.offGridConfig.projectValue?.toLocaleString() || 'TBD'}</p>
                        </div>
                        {siteVisit.marketingData.offGridConfig.amcIncluded !== undefined && (
                          <div>
                            <p className="text-sm text-muted-foreground">Annual Maintenance Contract</p>
                            <Badge variant={siteVisit.marketingData.offGridConfig.amcIncluded ? "default" : "secondary"}>
                              {siteVisit.marketingData.offGridConfig.amcIncluded ? "Included" : "Not Included"}
                            </Badge>
                          </div>
                        )}
                      </div>

                      {/* Structure Configuration */}
                      {(siteVisit.marketingData.offGridConfig.structureType ||
                        siteVisit.marketingData.offGridConfig.gpStructure ||
                        siteVisit.marketingData.offGridConfig.monoRail) && (
                          <div className="space-y-3">
                            <h5 className="font-medium text-purple-600">Structure Configuration</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-purple-25 p-3 rounded-lg border border-purple-200">
                              {siteVisit.marketingData.offGridConfig.structureType && (
                                <div>
                                  <p className="text-sm text-muted-foreground">Structure Type</p>
                                  <p className="font-medium">
                                    {formatStructureType(siteVisit.marketingData.offGridConfig.structureType)}
                                  </p>
                                </div>
                              )}

                              {(siteVisit.marketingData.offGridConfig.structureType === 'gp_structure' ||
                                siteVisit.marketingData.offGridConfig.structureType === 'gi_structure' ||
                                siteVisit.marketingData.offGridConfig.structureType === 'gi_round_pipe' ||
                                siteVisit.marketingData.offGridConfig.structureType === 'ms_square_pipe') &&
                                siteVisit.marketingData.offGridConfig.gpStructure && (
                                  <>
                                    <div>
                                      <p className="text-sm text-muted-foreground">Lower End Height</p>
                                      <p className="font-medium">{siteVisit.marketingData.offGridConfig.gpStructure.lowerEndHeight} ft</p>
                                    </div>
                                    <div>
                                      <p className="text-sm text-muted-foreground">Higher End Height</p>
                                      <p className="font-medium">{siteVisit.marketingData.offGridConfig.gpStructure.higherEndHeight} ft</p>
                                    </div>
                                  </>
                                )}

                              {siteVisit.marketingData.offGridConfig.structureType === 'mono_rail' && siteVisit.marketingData.offGridConfig.monoRail && (
                                <div>
                                  <p className="text-sm text-muted-foreground">Mono Rail Type</p>
                                  <p className="font-medium capitalize">
                                    {siteVisit.marketingData.offGridConfig.monoRail.type === 'mini_rail' ? 'Mini Rail' : 'Long Rail'}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                      {/* Work Scope Configuration */}
                      {siteVisit.marketingData.offGridConfig.civilWorkScope && (
                        <div className="space-y-3">
                          <h5 className="font-medium text-purple-600">Work Scope</h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-purple-25 p-3 rounded-lg border border-purple-200">
                            <div>
                              <p className="text-sm text-muted-foreground">Civil Work Scope</p>
                              <p className="font-medium capitalize">
                                {siteVisit.marketingData.offGridConfig.civilWorkScope === 'customer_scope' ? 'Customer Scope' : 'Company Scope'}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {siteVisit.marketingData.offGridConfig.others && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-2">Additional Notes</p>
                          <p className="text-sm bg-gray-50 p-3 rounded-lg border">{siteVisit.marketingData.offGridConfig.others}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Hybrid Configuration Details */}
                  {siteVisit.marketingData.hybridConfig && (
                    <div className="space-y-3">
                      <Separator />
                      <h4 className="font-medium text-orange-700">Hybrid Solar System Configuration</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-orange-50 p-4 rounded-lg">
                        <div>
                          <p className="text-sm text-muted-foreground">Solar Panel Make</p>
                          <p className="font-medium">{formatStringOrArray(siteVisit.marketingData.hybridConfig.solarPanelMake)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Panel Watts</p>
                          <p className="font-medium">{siteVisit.marketingData.hybridConfig.panelWatts}W</p>
                        </div>
                        {siteVisit.marketingData.hybridConfig.panelType && (
                          <div>
                            <p className="text-sm text-muted-foreground">Panel Type</p>
                            <p className="font-medium capitalize">
                              {siteVisit.marketingData.hybridConfig.panelType === 'bifacial' ? 'Bifacial' :
                                siteVisit.marketingData.hybridConfig.panelType === 'topcon' ? 'Topcon' : 'Mono-PERC'}
                            </p>
                          </div>
                        )}
                        <div>
                          <p className="text-sm text-muted-foreground">Inverter Make</p>
                          <p className="font-medium">{formatStringOrArraySimple(siteVisit.marketingData.hybridConfig.inverterMake)}</p>
                        </div>
                        {(siteVisit.marketingData.hybridConfig.inverterKVA || siteVisit.marketingData.hybridConfig.inverterKW) && (
                          <div>
                            <p className="text-sm text-muted-foreground">Inverter KVA</p>
                            <p className="font-medium">{siteVisit.marketingData.hybridConfig.inverterKVA || siteVisit.marketingData.hybridConfig.inverterKW} KVA</p>
                          </div>
                        )}
                        {siteVisit.marketingData.hybridConfig.inverterQty && (
                          <div>
                            <p className="text-sm text-muted-foreground">Inverter Qty</p>
                            <p className="font-medium">{siteVisit.marketingData.hybridConfig.inverterQty} units</p>
                          </div>
                        )}
                        {siteVisit.marketingData.hybridConfig.inverterVolt && (
                          <div>
                            <p className="text-sm text-muted-foreground">Inverter Volt</p>
                            <p className="font-medium">{siteVisit.marketingData.hybridConfig.inverterVolt}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-sm text-muted-foreground">Earth Connection</p>
                          <p className="font-medium">{formatEarthConnection(siteVisit.marketingData.hybridConfig.earth)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Battery Brand</p>
                          <p className="font-medium">{
                            siteVisit.marketingData.hybridConfig.batteryBrand === 'exide' ? 'Exide' :
                              siteVisit.marketingData.hybridConfig.batteryBrand === 'utl' ? 'UTL' :
                                siteVisit.marketingData.hybridConfig.batteryBrand === 'exide_utl' ? 'EXIDE/UTL' :
                                  siteVisit.marketingData.hybridConfig.batteryBrand?.replace('_', ' ').toUpperCase()
                          }</p>
                        </div>
                        {siteVisit.marketingData.hybridConfig.batteryType && (
                          <div>
                            <p className="text-sm text-muted-foreground">Battery Type</p>
                            <p className="font-medium">{siteVisit.marketingData.hybridConfig.batteryType === 'lead_acid' ? 'Lead Acid' : 'Lithium'}</p>
                          </div>
                        )}
                        {siteVisit.marketingData.hybridConfig.batteryAH && (
                          <div>
                            <p className="text-sm text-muted-foreground">Battery AH</p>
                            <p className="font-medium">{siteVisit.marketingData.hybridConfig.batteryAH} AH</p>
                          </div>
                        )}
                        <div>
                          <p className="text-sm text-muted-foreground">Battery Configuration</p>
                          <p className="font-medium">{siteVisit.marketingData.hybridConfig.batteryCount} × {siteVisit.marketingData.hybridConfig.voltage}V</p>
                        </div>
                        {(siteVisit.marketingData.hybridConfig.dcrPanelCount > 0 || siteVisit.marketingData.hybridConfig.nonDcrPanelCount > 0) && (
                          <>
                            <div>
                              <p className="text-sm text-muted-foreground">DCR Panel Count</p>
                              <p className="font-medium">{siteVisit.marketingData.hybridConfig.dcrPanelCount || 0} panels</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">NON DCR Panel Count</p>
                              <p className="font-medium">{siteVisit.marketingData.hybridConfig.nonDcrPanelCount || 0} panels</p>
                            </div>
                          </>
                        )}
                        <div>
                          <p className="text-sm text-muted-foreground">Total Panel Count</p>
                          <p className="font-medium">{siteVisit.marketingData.hybridConfig.panelCount} panels</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Lightning Arrestor</p>
                          <Badge variant={siteVisit.marketingData.hybridConfig.lightningArrest ? "default" : "secondary"}>
                            {siteVisit.marketingData.hybridConfig.lightningArrest ? "Yes" : "No"}
                          </Badge>
                        </div>
                        {siteVisit.marketingData.hybridConfig.electricalAccessories !== undefined && (
                          <div>
                            <p className="text-sm text-muted-foreground">Electrical Accessories</p>
                            <Badge variant={siteVisit.marketingData.hybridConfig.electricalAccessories ? "default" : "secondary"}>
                              {siteVisit.marketingData.hybridConfig.electricalAccessories ? "Yes" : "No"}
                            </Badge>
                            {siteVisit.marketingData.hybridConfig.electricalAccessories && siteVisit.marketingData.hybridConfig.electricalCount && (
                              <p className="text-sm mt-1">Count: {siteVisit.marketingData.hybridConfig.electricalCount}</p>
                            )}
                          </div>
                        )}
                        <div>
                          <p className="text-sm text-muted-foreground">Project Value</p>
                          <p className="font-medium text-green-600">₹{siteVisit.marketingData.hybridConfig.projectValue?.toLocaleString() || 'TBD'}</p>
                        </div>
                      </div>

                      {/* Structure Configuration */}
                      {(siteVisit.marketingData.hybridConfig.structureType ||
                        siteVisit.marketingData.hybridConfig.gpStructure ||
                        siteVisit.marketingData.hybridConfig.monoRail) && (
                          <div className="space-y-3">
                            <h5 className="font-medium text-orange-600">Structure Configuration</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-orange-25 p-3 rounded-lg border border-orange-200">
                              {siteVisit.marketingData.hybridConfig.structureType && (
                                <div>
                                  <p className="text-sm text-muted-foreground">Structure Type</p>
                                  <p className="font-medium">
                                    {formatStructureType(siteVisit.marketingData.hybridConfig.structureType)}
                                  </p>
                                </div>
                              )}

                              {(siteVisit.marketingData.hybridConfig.structureType === 'gp_structure' ||
                                siteVisit.marketingData.hybridConfig.structureType === 'gi_structure' ||
                                siteVisit.marketingData.hybridConfig.structureType === 'gi_round_pipe' ||
                                siteVisit.marketingData.hybridConfig.structureType === 'ms_square_pipe') &&
                                siteVisit.marketingData.hybridConfig.gpStructure && (
                                  <>
                                    <div>
                                      <p className="text-sm text-muted-foreground">Lower End Height</p>
                                      <p className="font-medium">{siteVisit.marketingData.hybridConfig.gpStructure.lowerEndHeight} ft</p>
                                    </div>
                                    <div>
                                      <p className="text-sm text-muted-foreground">Higher End Height</p>
                                      <p className="font-medium">{siteVisit.marketingData.hybridConfig.gpStructure.higherEndHeight} ft</p>
                                    </div>
                                  </>
                                )}

                              {siteVisit.marketingData.hybridConfig.structureType === 'mono_rail' && siteVisit.marketingData.hybridConfig.monoRail && (
                                <div>
                                  <p className="text-sm text-muted-foreground">Mono Rail Type</p>
                                  <p className="font-medium capitalize">
                                    {siteVisit.marketingData.hybridConfig.monoRail.type === 'mini_rail' ? 'Mini Rail' : 'Long Rail'}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                      {/* Work Scope Configuration */}
                      {(siteVisit.marketingData.hybridConfig.civilWorkScope ||
                        siteVisit.marketingData.hybridConfig.netMeterScope ||
                        siteVisit.marketingData.hybridConfig.electricalWorkScope ||
                        siteVisit.marketingData.hybridConfig.plumbingWorkScope) && (
                          <div className="space-y-3">
                            <h5 className="font-medium text-orange-600">Work Scope</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-orange-25 p-3 rounded-lg border border-orange-200">
                              {siteVisit.marketingData.hybridConfig.civilWorkScope && (
                                <div>
                                  <p className="text-sm text-muted-foreground">Civil Work Scope</p>
                                  <p className="font-medium capitalize">
                                    {siteVisit.marketingData.hybridConfig.civilWorkScope === 'customer_scope' ? 'Customer Scope' : 'Company Scope'}
                                  </p>
                                </div>
                              )}
                              {siteVisit.marketingData.hybridConfig.netMeterScope && (
                                <div>
                                  <p className="text-sm text-muted-foreground">Net Meter Scope</p>
                                  <p className="font-medium capitalize">
                                    {siteVisit.marketingData.hybridConfig.netMeterScope === 'customer_scope' ? 'Customer Scope' : 'Company Scope'}
                                  </p>
                                </div>
                              )}
                              {siteVisit.marketingData.hybridConfig.electricalWorkScope && (
                                <div>
                                  <p className="text-sm text-muted-foreground">Electrical Work Scope</p>
                                  <p className="font-medium capitalize">
                                    {siteVisit.marketingData.hybridConfig.electricalWorkScope === 'customer_scope' ? 'Customer Scope' : 'Company Scope'}
                                  </p>
                                </div>
                              )}
                              {siteVisit.marketingData.hybridConfig.plumbingWorkScope && (
                                <div>
                                  <p className="text-sm text-muted-foreground">Plumbing Work Scope</p>
                                  <p className="font-medium capitalize">
                                    {siteVisit.marketingData.hybridConfig.plumbingWorkScope === 'customer_scope' ? 'Customer Scope' : 'Company Scope'}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                      {siteVisit.marketingData.hybridConfig.others && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-2">Additional Notes</p>
                          <p className="text-sm bg-gray-50 p-3 rounded-lg border">{siteVisit.marketingData.hybridConfig.others}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Water Heater Configuration */}
                  {siteVisit.marketingData.waterHeaterConfig && (
                    <div className="space-y-3">
                      <Separator />
                      <h4 className="font-medium text-red-700">Solar Water Heater Configuration</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-red-50 p-4 rounded-lg">
                        <div>
                          <p className="text-sm text-muted-foreground">Brand</p>
                          <p className="font-medium">{siteVisit.marketingData.waterHeaterConfig.brand?.toUpperCase()}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Capacity</p>
                          <p className="font-medium">{siteVisit.marketingData.waterHeaterConfig.litre} Litres</p>
                        </div>
                        {siteVisit.marketingData.waterHeaterConfig.heatingCoil && (
                          <div>
                            <p className="text-sm text-muted-foreground">Heating Coil</p>
                            <p className="font-medium">{siteVisit.marketingData.waterHeaterConfig.heatingCoil}</p>
                          </div>
                        )}
                        {siteVisit.marketingData.waterHeaterConfig.floor && (
                          <div>
                            <p className="text-sm text-muted-foreground">Floor Level</p>
                            <p className="font-medium">
                              {siteVisit.marketingData.waterHeaterConfig.floor === '0' ? 'Ground Floor' :
                                `${siteVisit.marketingData.waterHeaterConfig.floor}${siteVisit.marketingData.waterHeaterConfig.floor === '1' ? 'st' :
                                  siteVisit.marketingData.waterHeaterConfig.floor === '2' ? 'nd' :
                                    siteVisit.marketingData.waterHeaterConfig.floor === '3' ? 'rd' : 'th'} Floor`}
                            </p>
                          </div>
                        )}
                        <div>
                          <p className="text-sm text-muted-foreground">Project Value</p>
                          <p className="font-medium text-green-600">₹{siteVisit.marketingData.waterHeaterConfig.projectValue?.toLocaleString() || 'TBD'}</p>
                        </div>
                        {siteVisit.marketingData.waterHeaterConfig.qty && (
                          <div>
                            <p className="text-sm text-muted-foreground">Quantity</p>
                            <p className="font-medium">{siteVisit.marketingData.waterHeaterConfig.qty}</p>
                          </div>
                        )}
                        {siteVisit.marketingData.waterHeaterConfig.waterHeaterModel && (
                          <div>
                            <p className="text-sm text-muted-foreground">Water Heater Model</p>
                            <p className="font-medium capitalize">
                              {siteVisit.marketingData.waterHeaterConfig.waterHeaterModel === 'pressurized' ? 'Pressurized' : 'Non-Pressurized'}
                            </p>
                          </div>
                        )}
                        {siteVisit.marketingData.waterHeaterConfig.labourAndTransport && (
                          <div>
                            <p className="text-sm text-muted-foreground">Labour and Transport</p>
                            <p className="font-medium text-green-600">✓ Included</p>
                          </div>
                        )}
                      </div>

                      {/* Work Scope Configuration */}
                      {(siteVisit.marketingData.waterHeaterConfig.plumbingWorkScope ||
                        siteVisit.marketingData.waterHeaterConfig.civilWorkScope) && (
                          <div className="space-y-3">
                            <h5 className="font-medium text-red-600">Work Scope</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-red-25 p-3 rounded-lg border border-red-200">
                              {siteVisit.marketingData.waterHeaterConfig.plumbingWorkScope && (
                                <div>
                                  <p className="text-sm text-muted-foreground">Plumbing Work Scope</p>
                                  <p className="font-medium capitalize">
                                    {siteVisit.marketingData.waterHeaterConfig.plumbingWorkScope === 'customer_scope' ? 'Customer Scope' : 'Company Scope'}
                                  </p>
                                </div>
                              )}
                              {siteVisit.marketingData.waterHeaterConfig.civilWorkScope && (
                                <div>
                                  <p className="text-sm text-muted-foreground">Civil Work Scope</p>
                                  <p className="font-medium capitalize">
                                    {siteVisit.marketingData.waterHeaterConfig.civilWorkScope === 'customer_scope' ? 'Customer Scope' : 'Company Scope'}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                      {siteVisit.marketingData.waterHeaterConfig.others && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-2">Additional Notes</p>
                          <p className="text-sm bg-gray-50 p-3 rounded-lg border">{siteVisit.marketingData.waterHeaterConfig.others}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Water Pump Configuration */}
                  {siteVisit.marketingData.waterPumpConfig && (
                    <div className="space-y-3">
                      <Separator />
                      <h4 className="font-medium text-cyan-700">Solar Water Pump Configuration</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-cyan-50 p-4 rounded-lg">
                        <div>
                          <p className="text-sm text-muted-foreground">Drive HP</p>
                          <p className="font-medium">{siteVisit.marketingData.waterPumpConfig.driveHP || siteVisit.marketingData.waterPumpConfig.hp} HP</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Drive Type</p>
                          <p className="font-medium">{siteVisit.marketingData.waterPumpConfig.drive}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Panel Brand</p>
                          <p className="font-medium">{formatStringOrArray(siteVisit.marketingData.waterPumpConfig.panelBrand)}</p>
                        </div>
                        {siteVisit.marketingData.waterPumpConfig.panelWatts && (
                          <div>
                            <p className="text-sm text-muted-foreground">Panel Watts</p>
                            <p className="font-medium">{siteVisit.marketingData.waterPumpConfig.panelWatts}W</p>
                          </div>
                        )}
                        {siteVisit.marketingData.waterPumpConfig.panelType && (
                          <div>
                            <p className="text-sm text-muted-foreground">Panel Type</p>
                            <p className="font-medium capitalize">
                              {siteVisit.marketingData.waterPumpConfig.panelType === 'bifacial' ? 'Bifacial' :
                                siteVisit.marketingData.waterPumpConfig.panelType === 'topcon' ? 'Topcon' : 'Mono-PERC'}
                            </p>
                          </div>
                        )}
                        {(siteVisit.marketingData.waterPumpConfig.dcrPanelCount > 0 || siteVisit.marketingData.waterPumpConfig.nonDcrPanelCount > 0) && (
                          <>
                            <div>
                              <p className="text-sm text-muted-foreground">DCR Panel Count</p>
                              <p className="font-medium">{siteVisit.marketingData.waterPumpConfig.dcrPanelCount || 0} panels</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">NON DCR Panel Count</p>
                              <p className="font-medium">{siteVisit.marketingData.waterPumpConfig.nonDcrPanelCount || 0} panels</p>
                            </div>
                          </>
                        )}
                        <div>
                          <p className="text-sm text-muted-foreground">Total Panel Count</p>
                          <p className="font-medium">{siteVisit.marketingData.waterPumpConfig.panelCount} panels</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Project Value</p>
                          <p className="font-medium text-green-600">₹{siteVisit.marketingData.waterPumpConfig.projectValue?.toLocaleString() || 'TBD'}</p>
                        </div>
                        {siteVisit.marketingData.waterPumpConfig.qty && (
                          <div>
                            <p className="text-sm text-muted-foreground">Quantity</p>
                            <p className="font-medium">{siteVisit.marketingData.waterPumpConfig.qty}</p>
                          </div>
                        )}
                        {siteVisit.marketingData.waterPumpConfig.lightningArrest && (
                          <div>
                            <p className="text-sm text-muted-foreground">Lightening Arrest</p>
                            <p className="font-medium text-green-600">✓ Included</p>
                          </div>
                        )}
                        {siteVisit.marketingData.waterPumpConfig.electricalAccessories && (
                          <div>
                            <p className="text-sm text-muted-foreground">Electrical Accessories</p>
                            <p className="font-medium text-green-600">✓ Included</p>
                          </div>
                        )}
                        {siteVisit.marketingData.waterPumpConfig.earth && siteVisit.marketingData.waterPumpConfig.earth.length > 0 && (
                          <div>
                            <p className="text-sm text-muted-foreground">Earth Connection</p>
                            <p className="font-medium">{siteVisit.marketingData.waterPumpConfig.earth.map((e: string) => e.toUpperCase()).join(', ')}</p>
                          </div>
                        )}
                        {siteVisit.marketingData.waterPumpConfig.labourAndTransport && (
                          <div>
                            <p className="text-sm text-muted-foreground">Labour and Transport</p>
                            <p className="font-medium text-green-600">✓ Included</p>
                          </div>
                        )}
                      </div>

                      {/* Structure Configuration */}
                      {(siteVisit.marketingData.waterPumpConfig.structureType ||
                        siteVisit.marketingData.waterPumpConfig.gpStructure ||
                        siteVisit.marketingData.waterPumpConfig.monoRail) && (
                          <div className="space-y-3">
                            <h5 className="font-medium text-cyan-600">Structure Configuration</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-cyan-25 p-3 rounded-lg border border-cyan-200">
                              {siteVisit.marketingData.waterPumpConfig.structureType && (
                                <div>
                                  <p className="text-sm text-muted-foreground">Structure Type</p>
                                  <p className="font-medium">
                                    {formatStructureType(siteVisit.marketingData.waterPumpConfig.structureType)}
                                  </p>
                                </div>
                              )}

                              {(siteVisit.marketingData.waterPumpConfig.structureType === 'gp_structure' ||
                                siteVisit.marketingData.waterPumpConfig.structureType === 'gi_structure' ||
                                siteVisit.marketingData.waterPumpConfig.structureType === 'gi_round_pipe' ||
                                siteVisit.marketingData.waterPumpConfig.structureType === 'ms_square_pipe') &&
                                siteVisit.marketingData.waterPumpConfig.gpStructure && (
                                  <>
                                    <div>
                                      <p className="text-sm text-muted-foreground">Lower End Height</p>
                                      <p className="font-medium">{siteVisit.marketingData.waterPumpConfig.gpStructure.lowerEndHeight} ft</p>
                                    </div>
                                    <div>
                                      <p className="text-sm text-muted-foreground">Higher End Height</p>
                                      <p className="font-medium">{siteVisit.marketingData.waterPumpConfig.gpStructure.higherEndHeight} ft</p>
                                    </div>
                                  </>
                                )}

                              {siteVisit.marketingData.waterPumpConfig.structureType === 'mono_rail' && siteVisit.marketingData.waterPumpConfig.monoRail && (
                                <div>
                                  <p className="text-sm text-muted-foreground">Mono Rail Type</p>
                                  <p className="font-medium capitalize">
                                    {siteVisit.marketingData.waterPumpConfig.monoRail.type === 'mini_rail' ? 'Mini Rail' : 'Long Rail'}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                      {/* Work Scope Configuration */}
                      {(siteVisit.marketingData.waterPumpConfig.earthWork || siteVisit.marketingData.waterPumpConfig.plumbingWorkScope ||
                        siteVisit.marketingData.waterPumpConfig.civilWorkScope) && (
                          <div className="space-y-3">
                            <h5 className="font-medium text-cyan-600">Work Scope</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-cyan-25 p-3 rounded-lg border border-cyan-200">
                              {(siteVisit.marketingData.waterPumpConfig.earthWork || siteVisit.marketingData.waterPumpConfig.plumbingWorkScope) && (
                                <div>
                                  <p className="text-sm text-muted-foreground">Earth Work Scope</p>
                                  <p className="font-medium capitalize">
                                    {(siteVisit.marketingData.waterPumpConfig.earthWork || siteVisit.marketingData.waterPumpConfig.plumbingWorkScope) === 'customer_scope' ? 'Customer Scope' : 'Company Scope'}
                                  </p>
                                </div>
                              )}
                              {siteVisit.marketingData.waterPumpConfig.civilWorkScope && (
                                <div>
                                  <p className="text-sm text-muted-foreground">Civil Work Scope</p>
                                  <p className="font-medium capitalize">
                                    {siteVisit.marketingData.waterPumpConfig.civilWorkScope === 'customer_scope' ? 'Customer Scope' : 'Company Scope'}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                      {siteVisit.marketingData.waterPumpConfig.others && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-2">Additional Notes</p>
                          <p className="text-sm bg-gray-50 p-3 rounded-lg border">{siteVisit.marketingData.waterPumpConfig.others}</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {siteVisit.adminData && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Administrative Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Bank Process */}
                  {siteVisit.adminData.bankProcess && (
                    <div className="space-y-3">
                      <h4 className="font-medium text-blue-700 flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        Bank Process Details
                      </h4>
                      <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                        <div className="grid grid-cols-1 gap-3">
                          <div>
                            <p className="text-sm text-muted-foreground">Process Step</p>
                            <p className="font-medium capitalize">{siteVisit.adminData.bankProcess.step.replace(/_/g, ' ')}</p>
                          </div>
                          {siteVisit.adminData.bankProcess.description && (
                            <div>
                              <p className="text-sm text-muted-foreground">Description</p>
                              <p className="text-sm bg-white p-2 rounded border">{siteVisit.adminData.bankProcess.description}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* EB Process */}
                  {siteVisit.adminData.ebProcess && (
                    <div className="space-y-3">
                      <h4 className="font-medium text-yellow-700 flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        EB Office Process Details
                      </h4>
                      <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                        <div className="grid grid-cols-1 gap-3">
                          <div>
                            <p className="text-sm text-muted-foreground">Process Type</p>
                            <p className="font-medium capitalize">{siteVisit.adminData.ebProcess.type.replace(/_/g, ' ')}</p>
                          </div>
                          {siteVisit.adminData.ebProcess.description && (
                            <div>
                              <p className="text-sm text-muted-foreground">Description</p>
                              <p className="text-sm bg-white p-2 rounded border">{siteVisit.adminData.ebProcess.description}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Other Administrative Fields */}
                  {Object.entries(siteVisit.adminData).map(([key, value]) => {
                    if (key === 'bankProcess' || key === 'ebProcess' || !value) return null;

                    const fieldLabels: Record<string, string> = {
                      purchase: 'Purchase Details',
                      driving: 'Driving/Transportation',
                      officialCashTransactions: 'Official Cash Transactions',
                      officialPersonalWork: 'Official Personal Work',
                      others: 'Other Administrative Work'
                    };

                    return (
                      <div key={key} className="space-y-2">
                        <h5 className="font-medium text-gray-700">{fieldLabels[key] || key.replace(/([A-Z])/g, ' $1')}</h5>
                        <div className="bg-gray-50 p-3 rounded-lg border">
                          <p className="text-sm whitespace-pre-wrap break-words">{value as string}</p>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {siteVisit.technicalData && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wrench className="h-5 w-5" />
                    Technical Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Service Types */}
                  {siteVisit.technicalData.serviceTypes && siteVisit.technicalData.serviceTypes.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-medium text-blue-700">Service Types</h4>
                      <div className="flex flex-wrap gap-2">
                        {siteVisit.technicalData.serviceTypes.map((serviceType) => {
                          const serviceLabels: Record<string, string> = {
                            'on_grid': 'On-grid',
                            'off_grid': 'Off-grid',
                            'hybrid': 'Hybrid',
                            'solar_panel': 'Solar Panel',
                            'camera': 'Camera',
                            'water_pump': 'Water Pump',
                            'water_heater': 'Water Heater',
                            'lights_accessories': 'Lights & Accessories',
                            'others': 'Others'
                          };
                          return (
                            <Badge key={serviceType} variant="secondary" className="bg-blue-100 text-blue-800">
                              {serviceLabels[serviceType] || serviceType.replace('_', ' ')}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Work Type and Status */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {siteVisit.technicalData.workType && (
                      <div>
                        <p className="text-sm text-muted-foreground">Type of Work</p>
                        <p className="font-medium capitalize">{siteVisit.technicalData.workType.replace(/_/g, ' ')}</p>
                      </div>
                    )}
                    {siteVisit.technicalData.workingStatus && (
                      <div>
                        <p className="text-sm text-muted-foreground">Working Status</p>
                        <div className="flex items-center gap-2">
                          {siteVisit.technicalData.workingStatus === 'completed' ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          )}
                          <p className="font-medium capitalize">{siteVisit.technicalData.workingStatus}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Pending Remarks */}
                  {siteVisit.technicalData.workingStatus === 'pending' && siteVisit.technicalData.pendingRemarks && (
                    <div className="space-y-2">
                      <h5 className="font-medium text-yellow-700">Pending Work Details</h5>
                      <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                        <p className="text-sm whitespace-pre-wrap break-words">{siteVisit.technicalData.pendingRemarks}</p>
                      </div>
                    </div>
                  )}

                  {/* Team Members */}
                  {siteVisit.technicalData.teamMembers && siteVisit.technicalData.teamMembers.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-medium text-green-700 flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Technical Team Members
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {siteVisit.technicalData.teamMembers.map((member, index) => (
                          <Badge key={index} variant="outline" className="bg-green-50 text-green-800 border-green-200">
                            {member}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Additional Description */}
                  {siteVisit.technicalData.description && (
                    <div className="space-y-2">
                      <h5 className="font-medium text-gray-700">Additional Description</h5>
                      <div className="bg-gray-50 p-3 rounded-lg border">
                        <p className="text-sm whitespace-pre-wrap break-words">{siteVisit.technicalData.description}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Site Photos - Check-in, Check-out, and Additional Photos */}
            {(siteVisit.siteInPhotoUrl || siteVisit.siteOutPhotoUrl || siteVisit.siteOutPhotos?.length || siteVisit.sitePhotos.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Camera className="h-5 w-5" />
                    Site Photos
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">

                  {/* Check-in Photo */}
                  {siteVisit.siteInPhotoUrl && (
                    <div>
                      <h4 className="font-medium text-sm text-green-700 mb-2 flex items-center gap-2">
                        <Camera className="h-4 w-4" />
                        Check-in Photo
                      </h4>
                      <div className="relative inline-block group">
                        <img
                          src={siteVisit.siteInPhotoUrl}
                          alt="Check-in photo"
                          className="w-full h-auto max-h-64 object-contain rounded-lg border transition-transform hover:scale-105 cursor-pointer bg-gray-50"
                          onClick={() => openAttendanceLightbox(siteVisit.siteInPhotoUrl!)}
                        />
                        <Badge className="absolute top-2 right-2 text-xs bg-green-600 text-white">
                          Check-in
                        </Badge>

                        {/* Eye icon overlay for viewing */}
                        <div
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg flex items-center justify-center cursor-pointer"
                          onClick={() => openAttendanceLightbox(siteVisit.siteInPhotoUrl!)}
                        >
                          <Eye className="h-8 w-8 text-white" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Check-out Photo */}
                  {siteVisit.siteOutPhotoUrl && (
                    <div>
                      <h4 className="font-medium text-sm text-red-700 mb-2 flex items-center gap-2">
                        <Camera className="h-4 w-4" />
                        Check-out Photo
                      </h4>
                      <div className="relative inline-block group">
                        <img
                          src={siteVisit.siteOutPhotoUrl}
                          alt="Check-out photo"
                          className="w-full h-auto max-h-64 object-contain rounded-lg border transition-transform hover:scale-105 cursor-pointer bg-gray-50"
                          onClick={() => openAttendanceLightbox(siteVisit.siteOutPhotoUrl!)}
                        />
                        <Badge className="absolute top-2 right-2 text-xs bg-red-600 text-white">
                          Check-out
                        </Badge>

                        {/* Eye icon overlay for viewing */}
                        <div
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg flex items-center justify-center cursor-pointer"
                          onClick={() => openAttendanceLightbox(siteVisit.siteOutPhotoUrl!)}
                        >
                          <Eye className="h-8 w-8 text-white" />
                        </div>
                      </div>
                    </div>
                  )}


                  {/* Site Photos Gallery - Enhanced for Multiple Photos */}
                  {uniqueSitePhotosCount > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-sm text-blue-700 flex items-center gap-2">
                          <Camera className="h-4 w-4" />
                          Site Photos ({uniqueSitePhotosCount}/20)
                        </h4>
                        {uniqueSitePhotosCount > 6 && (
                          <Badge variant="outline" className="text-xs">
                            {uniqueSitePhotosCount > 12 ? 'Comprehensive Documentation' : 'Good Coverage'}
                          </Badge>
                        )}
                      </div>

                      {/* Enhanced Grid Layout for Multiple Photos */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
                        {filteredSitePhotos.map((photo, index) => {
                          // Handle both string URLs (follow-ups) and objects (site visits)
                          const photoUrl = typeof photo === 'string' ? photo : photo.url;
                          const photoTimestamp = typeof photo === 'object' ? photo.timestamp : null;
                          const photoDescription = typeof photo === 'object' ? photo.description : null;
                          const photoLocation = typeof photo === 'object' ? photo.location : null;



                          return (
                            <div key={index} className="space-y-2">
                              <div className="relative group">
                                <img
                                  src={photoUrl}
                                  alt={`Site photo ${index + 1}`}
                                  className="w-full h-28 sm:h-36 object-cover rounded-lg transition-all duration-200 hover:scale-105 cursor-pointer border-2 border-transparent hover:border-blue-300"
                                  onClick={() => openSitePhotosLightbox(photoUrl)}
                                />

                                {/* Photo Number Badge */}
                                <Badge className="absolute top-1 left-1 text-xs bg-blue-600 text-white h-5 w-5 p-0 flex items-center justify-center rounded-full">
                                  {index + 1}
                                </Badge>

                                {/* Hover Overlay - Eye Icon */}
                                <div
                                  className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg flex items-center justify-center cursor-pointer"
                                  onClick={() => openSitePhotosLightbox(photoUrl)}
                                >
                                  <Eye className="h-8 w-8 text-white" />
                                </div>
                              </div>


                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                </CardContent>
              </Card>
            )}

            {/* Notes */}
            {siteVisit.notes && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Notes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap break-words">{siteVisit.notes}</p>
                </CardContent>
              </Card>
            )}

            {/* Actions */}
            <div className="flex justify-end">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Attendance Lightbox - Check-in/out photos ONLY */}
      <Lightbox
        open={attendanceLightboxIndex >= 0}
        close={() => setAttendanceLightboxIndex(-1)}
        slides={attendancePhotos.map(url => ({ src: url }))}
        index={attendanceLightboxIndex >= 0 ? attendanceLightboxIndex : 0}
      />

      {/* Site Photos Lightbox - Documentation photos ONLY */}
      <Lightbox
        open={sitePhotosLightboxIndex >= 0}
        close={() => setSitePhotosLightboxIndex(-1)}
        slides={siteWorkPhotos.map(photo => ({
          src: typeof photo === 'string' ? photo : photo.url
        }))}
        index={sitePhotosLightboxIndex >= 0 ? sitePhotosLightboxIndex : 0}
      />
    </>
  );
}
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthContext } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  MapPin, Search, Download, Eye, Calendar, Clock, Users, Building,
  Camera, FileText, Filter, RefreshCw, TrendingUp, BarChart3,
  CheckCircle, XCircle, AlertTriangle, Navigation, Phone, Mail,
  User, Zap, ChevronDown, History, LogOut, Plus, CircleX
} from "lucide-react";
import { format } from "date-fns";
import { SiteVisitDetailsModal } from "@/components/site-visit/site-visit-details-modal";
import { FollowUpDetailsModal } from "@/components/site-visit/follow-up-details-modal";

interface SiteVisit {
  id: string;
  userId: string;
  department: 'technical' | 'marketing' | 'admin' | 'operations' | 'hr' | 'sales' | 'housekeeping';
  visitPurpose: string;
  siteInTime: Date;
  siteOutTime?: Date;
  status: 'in_progress' | 'completed' | 'cancelled';
  sitePhotos: {
    url: string;
    caption?: string;
    timestamp: Date;
  }[];
  notes?: string;
  userName: string;
  userDepartment: string;
  // Customer data (nested object structure)
  customer: {
    name: string;
    mobile: string;
    address: string;
    propertyType?: string;
    ebServiceNumber?: string;
  };
  // Enhanced follow-up system
  isFollowUp?: boolean;
  followUpOf?: string;
  followUpReason?: string;
  followUpDescription?: string;
  followUpCount?: number;
  hasFollowUps?: boolean;
  // Department-specific data
  technicalData?: any;
  marketingData?: any;
  adminData?: any;
  // Location data
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
  siteInPhotoUrl?: string;
  siteOutPhotoUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
  // Visit outcome fields
  visitOutcome?: 'converted' | 'on_process' | 'cancelled';
  outcomeNotes?: string;
  scheduledFollowUpDate?: string;
  outcomeSelectedAt?: string;
  outcomeSelectedBy?: string;
}

interface CustomerVisitGroup {
  customerMobile: string;
  customerName: string;
  customerAddress: string;
  primaryVisit: SiteVisit;
  followUps: SiteVisit[];
  totalVisits: number;
  latestStatus: string;
  hasActiveVisit: boolean;
  latestActivity: Date;
}

// Outcome helper functions
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
    case 'converted': return <TrendingUp className="h-3 w-3" />;
    case 'on_process': return <Zap className="h-3 w-3" />;
    case 'cancelled': return <CircleX className="h-3 w-3" />;
    default: return <FileText className="h-3 w-3" />;
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

// Customer Visit Group Card Component
interface CustomerVisitGroupCardProps {
  group: CustomerVisitGroup;
  onViewDetails: (visit: SiteVisit) => void;
  onViewFollowUp: (followUpId: string) => void;
}

const CustomerVisitGroupCard = ({ group, onViewDetails, onViewFollowUp }: CustomerVisitGroupCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-3 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div className="flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
              <h3 className="font-semibold text-base sm:text-lg">{group.customerName}</h3>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="capitalize text-xs">{group.primaryVisit.department}</Badge>
                {group.primaryVisit.isFollowUp && (
                  <Badge variant="outline" className="text-xs border-purple-500 text-purple-700">
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Follow-up
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs border-blue-500 text-blue-700">
                  <Users className="h-3 w-3 mr-1" />
                  {group.totalVisits} Visit{group.totalVisits !== 1 ? 's' : ''}
                </Badge>
                {group.followUps.length > 0 && (
                  <Badge variant="outline" className="text-xs border-green-500 text-green-700">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    {group.followUps.length} Follow-up{group.followUps.length !== 1 ? 's' : ''}
                  </Badge>
                )}
                {group.primaryVisit.visitOutcome && (
                  <Badge className={`${getOutcomeColor(group.primaryVisit.visitOutcome)} text-xs`}>
                    {getOutcomeIcon(group.primaryVisit.visitOutcome)}
                    <span className="ml-1">{getOutcomeLabel(group.primaryVisit.visitOutcome)}</span>
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs sm:text-sm text-muted-foreground">
                {group.primaryVisit.isFollowUp ? 'Follow-up:' : 'Latest:'} {group.primaryVisit.visitPurpose || 'Site Visit'}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(group.latestActivity, 'MMM dd, yyyy HH:mm')}
              </p>
              {group.primaryVisit.scheduledFollowUpDate && (
                <div className={`text-xs p-2 rounded-md border-l-2 ${isOverdue(group.primaryVisit.scheduledFollowUpDate)
                  ? 'bg-red-50 border-l-red-500 text-red-700'
                  : isToday(group.primaryVisit.scheduledFollowUpDate)
                    ? 'bg-yellow-50 border-l-yellow-500 text-yellow-700'
                    : 'bg-blue-50 border-l-blue-500 text-blue-700'
                  }`}>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span className="font-medium">
                      {isOverdue(group.primaryVisit.scheduledFollowUpDate) && 'Overdue Follow-up:'}
                      {isToday(group.primaryVisit.scheduledFollowUpDate) && 'Follow-up Today:'}
                      {!isOverdue(group.primaryVisit.scheduledFollowUpDate) && !isToday(group.primaryVisit.scheduledFollowUpDate) && 'Scheduled:'}
                    </span>
                    <span>{format(new Date(group.primaryVisit.scheduledFollowUpDate), 'MMM dd, yyyy')}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Customer & Contact Info */}
        <div className="space-y-3 mb-4">
          <div className="flex items-start gap-2 text-xs sm:text-sm">
            <MapPin className="h-3 w-3 sm:h-4 sm:w-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <span className="font-medium">Address:</span>
              <span className="text-muted-foreground ml-1 break-words">{group.customerAddress}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <Phone className="h-3 w-3 sm:h-4 sm:w-4 text-green-500 flex-shrink-0" />
              <span className="font-medium">Phone:</span>
              <span className="text-muted-foreground">{group.customerMobile}</span>
            </div>
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <Users className="h-3 w-3 sm:h-4 sm:w-4 text-purple-500 flex-shrink-0" />
              <span className="font-medium">Employee:</span>
              <span className="text-muted-foreground">{group.primaryVisit.userName}</span>
            </div>
          </div>
        </div>

        {/* Action buttons and visit timeline toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t">
          <div className="flex flex-wrap items-center gap-2">
            {group.primaryVisit.sitePhotos?.length > 0 && (
              <Badge variant="outline" className="flex items-center gap-1 text-xs">
                <Camera className="h-2 w-2 sm:h-3 sm:w-3" />
                Photos
              </Badge>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            {/* Show expand button if there are multiple visits OR if primary visit has follow-ups */}
            {(group.totalVisits > 1 || (group.primaryVisit.hasFollowUps && group.primaryVisit.followUpCount && group.primaryVisit.followUpCount > 0)) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-xs w-full sm:w-auto"
              >
                <ChevronDown className={`h-3 w-3 mr-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                {isExpanded ? 'Hide' : 'Show'} {group.primaryVisit.hasFollowUps ? 'Follow-ups' : 'All'} ({group.primaryVisit.followUpCount || group.totalVisits})
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto text-xs"
              onClick={() => onViewDetails(group.primaryVisit)}
            >
              <Eye className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
              <span>View Latest</span>
            </Button>
          </div>
        </div>

        {/* Visit Timeline - All Visits with Individual Actions */}
        {isExpanded && (group.totalVisits > 1 || (group.primaryVisit.hasFollowUps && group.primaryVisit.followUpCount && group.primaryVisit.followUpCount > 0)) && (
          <div className="mt-4 pt-4 border-t space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <History className="h-4 w-4" />
              <span>Visit Timeline ({group.primaryVisit.followUpCount || group.totalVisits} visits)</span>
            </div>

            {/* Create chronological list of ALL visits - Latest First */}
            {(() => {
              const allVisits = [group.primaryVisit, ...group.followUps]
                .sort((a, b) => new Date(b.siteInTime || b.createdAt).getTime() - new Date(a.siteInTime || a.createdAt).getTime());

              return (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {allVisits.map((visit, index) => {
                    const isOriginal = !visit.isFollowUp;
                    const visitNumber = index + 1;
                    const isLatest = index === 0; // Latest is first in sorted array

                    return (
                      <div key={visit.id} className={`border rounded-lg p-3 transition-all hover:shadow-sm ${isLatest ? 'bg-blue-50 border-blue-200' : 'bg-gray-50'
                        }`}>
                        {/* Visit Header */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs font-medium">
                              {isOriginal ? `Original Visit` : `Follow-up #${allVisits.length - visitNumber}`}
                            </Badge>
                            <Badge className="text-xs bg-purple-100 text-purple-800">
                              {visit.department}
                            </Badge>
                            {isLatest && (
                              <Badge className="bg-yellow-100 text-yellow-800 text-xs">
                                Latest
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(visit.siteInTime || visit.createdAt), 'MMM dd, HH:mm')}
                          </span>
                        </div>

                        {/* Visit Details */}
                        <div className="text-sm space-y-1 mb-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Purpose:</span>
                            <span>{visit.visitPurpose}</span>
                          </div>

                          {visit.followUpReason && (
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Reason:</span>
                              <span className="capitalize">{visit.followUpReason.replace(/_/g, ' ')}</span>
                            </div>
                          )}

                          {visit.notes && (
                            <div className="flex items-start gap-2">
                              <span className="font-medium">Notes:</span>
                              <span className="text-muted-foreground text-xs">{visit.notes.substring(0, 100)}{visit.notes.length > 100 ? '...' : ''}</span>
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <span className="font-medium">Employee:</span>
                            <span className="text-muted-foreground text-xs">{visit.userName}</span>
                          </div>

                          {/* Timing Info */}
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>Check-in: {format(new Date(visit.siteInTime || visit.createdAt), 'MMM dd, HH:mm')}</span>
                            {visit.siteOutTime && (
                              <span>Check-out: {format(new Date(visit.siteOutTime), 'MMM dd, HH:mm')}</span>
                            )}
                          </div>
                        </div>

                        {/* Individual Visit Actions */}
                        <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              // Check if this is a follow-up visit
                              if (visit.isFollowUp) {
                                onViewFollowUp(visit.id);
                              } else {
                                onViewDetails(visit);
                              }
                            }}
                            className="text-xs h-7 px-3"
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            View Details
                          </Button>

                          {visit.siteInLocation && (
                            <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                              <Navigation className="h-2 w-2" />
                              Located
                            </Badge>
                          )}

                          {visit.sitePhotos?.length > 0 && (
                            <Badge variant="outline" className="flex items-center gap-1 text-xs">
                              <Camera className="h-2 w-2" />
                              {visit.sitePhotos.length} Photos
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default function SiteVisitMonitoring() {
  const { user } = useAuthContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Access control - only master_admin and HR department
  const hasAccess = user?.role === "master_admin" ||
    (user?.department && user.department.toLowerCase() === 'hr');

  // State management
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [followUpFilter, setFollowUpFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grouped" | "individual">("grouped");

  // Force data refresh when filters change
  const refetchData = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/site-visits/monitoring"] });
    refetch();
  };
  const [selectedVisit, setSelectedVisit] = useState<SiteVisit | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [detailsVisit, setDetailsVisit] = useState<SiteVisit | null>(null);
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [selectedFollowUpId, setSelectedFollowUpId] = useState<string>("");

  // Live site visits data with real-time updates
  const { data: siteVisits = [], isLoading, refetch } = useQuery({
    queryKey: ["/api/site-visits/monitoring", statusFilter, departmentFilter, dateFilter, followUpFilter, outcomeFilter],
    queryFn: async () => {
      // Build query params
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
      if (departmentFilter && departmentFilter !== 'all') params.append('department', departmentFilter);
      if (dateFilter) params.append('startDate', dateFilter);

      const queryString = params.toString();
      const url = `/api/site-visits/monitoring${queryString ? `?${queryString}` : ''}`;

      console.log('SITE_VISITS_QUERY_URL:', url);

      const response = await apiRequest(url, 'GET');
      const responseData = await response.json();

      console.log('SITE_VISITS_API_RESPONSE:', responseData);

      // The API returns { data: [...], filters: {}, count: number }
      const visits = responseData.data || responseData || [];

      // Enrich with user information and proper data mapping
      return visits.map((visit: any) => ({
        ...visit,
        siteInTime: new Date(visit.siteInTime),
        siteOutTime: visit.siteOutTime ? new Date(visit.siteOutTime) : null,
        createdAt: visit.createdAt ? new Date(visit.createdAt) : new Date(visit.siteInTime),
        updatedAt: visit.updatedAt ? new Date(visit.updatedAt) : new Date(),
        sitePhotos: visit.sitePhotos?.map((photo: any) => ({
          ...photo,
          timestamp: new Date(photo.timestamp)
        })) || [],
        // Ensure customer data structure is consistent
        customer: visit.customer || {
          name: visit.customerName || 'Unknown Customer',
          mobile: visit.customerPhone || '',
          address: visit.siteAddress || '',
          propertyType: visit.customer?.propertyType || 'unknown'
        }
      }));
    },
    refetchInterval: 15000, // Live updates every 15 seconds
    enabled: !!hasAccess
  });

  // Fetch follow-up visits separately (they're stored in a separate collection)
  const { data: followUpVisits = [], isLoading: isLoadingFollowUps } = useQuery({
    queryKey: ["/api/follow-ups/monitoring", statusFilter, departmentFilter, dateFilter, outcomeFilter],
    queryFn: async () => {
      // For monitoring page, we want to fetch ALL follow-ups
      // Don't apply status/department filters here - we'll filter client-side after grouping
      const url = `/api/follow-ups`;

      console.log('FOLLOW_UPS_QUERY_URL:', url);

      const response = await apiRequest(url, 'GET');
      const responseData = await response.json();

      console.log('FOLLOW_UPS_API_RESPONSE:', responseData);

      // The API returns { data: [...] } format
      const followUps = responseData.data || [];

      // Convert follow-ups to site visit format and mark as follow-ups
      return followUps.map((followUp: any) => ({
        ...followUp,
        id: followUp.id,
        userId: followUp.userId,
        department: followUp.department,
        customer: followUp.customer,
        visitPurpose: `Follow-up: ${followUp.followUpReason?.replace(/_/g, ' ')}`,
        siteInTime: new Date(followUp.siteInTime),
        siteOutTime: followUp.siteOutTime ? new Date(followUp.siteOutTime) : null,
        status: followUp.status,
        notes: followUp.notes || followUp.description,
        isFollowUp: true, // Mark as follow-up
        followUpOf: followUp.originalVisitId,
        followUpReason: followUp.followUpReason,
        createdAt: followUp.createdAt ? new Date(followUp.createdAt) : new Date(followUp.siteInTime),
        updatedAt: followUp.updatedAt ? new Date(followUp.updatedAt) : new Date(),
        sitePhotos: followUp.sitePhotos?.map((photo: any) => ({
          ...photo,
          timestamp: new Date(photo.timestamp)
        })) || [],
        visitOutcome: followUp.visitOutcome,
        scheduledFollowUpDate: followUp.scheduledFollowUpDate,
        outcomeNotes: followUp.outcomeNotes,
        outcomeSelectedAt: followUp.outcomeSelectedAt,
        outcomeSelectedBy: followUp.outcomeSelectedBy,
        userName: followUp.userName || 'Unknown User'
      }));
    },
    refetchInterval: 15000, // Live updates every 15 seconds
    enabled: !!hasAccess
  });

  // Merge site visits and follow-up visits into one array
  const allVisits = [...siteVisits, ...followUpVisits];

  console.log('ALL_VISITS_DEBUG:', {
    siteVisitsCount: siteVisits.length,
    followUpVisitsCount: followUpVisits.length,
    totalVisits: allVisits.length,
    followUpsCount: allVisits.filter((v: any) => v.isFollowUp).length,
    originalVisitsCount: allVisits.filter((v: any) => !v.isFollowUp).length,
    visits: allVisits.map((v: any) => ({
      id: v.id,
      customer: v.customer?.name,
      mobile: v.customer?.mobile,
      isFollowUp: v.isFollowUp
    }))
  });

  // Debug: Log all site visits data to understand the structure (can be removed after testing)
  console.log('SITE_VISITS_RAW_DATA:', allVisits.map((visit: SiteVisit) => ({
    id: visit.id,
    customerName: visit.customer?.name,
    status: visit.status,
    department: visit.department,
    isFollowUp: visit.isFollowUp,
    followUpCount: visit.followUpCount,
    siteInTime: visit.siteInTime,
    siteOutTime: visit.siteOutTime
  })));

  // Enhanced dashboard statistics with follow-up metrics
  const stats = {
    total: allVisits.length,
    inProgress: allVisits.filter((v: SiteVisit) => v.status === 'in_progress').length,
    completed: allVisits.filter((v: SiteVisit) => v.status === 'completed').length,
    today: allVisits.filter((v: SiteVisit) => {
      const today = new Date();
      const visitDate = new Date(v.siteInTime);
      return visitDate.toDateString() === today.toDateString();
    }).length,
    // Enhanced follow-up metrics
    followUps: allVisits.filter((v: SiteVisit) => v.isFollowUp).length,
    originalVisits: allVisits.filter((v: SiteVisit) => !v.isFollowUp).length,
    withFollowUps: allVisits.filter((v: SiteVisit) => v.hasFollowUps).length,
    totalFollowUpCount: allVisits.reduce((sum: number, v: SiteVisit) => sum + (v.followUpCount || 0), 0)
  };

  console.log('SITE_VISITS_STATS:', stats);

  // Group visits by customer function
  const groupVisitsByCustomer = (visits: SiteVisit[]): CustomerVisitGroup[] => {
    if (!visits || !Array.isArray(visits)) {
      return [];
    }

    const groupMap = new Map<string, CustomerVisitGroup>();

    visits.forEach(visit => {
      // Use combination of mobile and customer name for unique grouping
      // This ensures follow-ups with same customer mobile+name are grouped together
      const groupKey = `${visit.customer?.mobile || 'unknown'}_${visit.customer?.name?.toLowerCase() || 'unknown'}`;

      if (!groupMap.has(groupKey)) {
        // Initialize new group with this visit as primary
        groupMap.set(groupKey, {
          customerMobile: visit.customer?.mobile || 'unknown',
          customerName: visit.customer?.name || 'Unknown Customer',
          customerAddress: visit.customer?.address || '',
          primaryVisit: visit,
          followUps: [],
          totalVisits: 1,
          latestStatus: visit.status,
          hasActiveVisit: visit.status === 'in_progress',
          latestActivity: new Date(visit.createdAt || visit.siteInTime)
        });
      } else {
        const group = groupMap.get(groupKey)!;

        // If this visit is newer than current primary, swap them
        const visitTime = new Date(visit.createdAt || visit.siteInTime);
        const primaryTime = new Date(group.primaryVisit.createdAt || group.primaryVisit.siteInTime);

        if (visitTime > primaryTime) {
          // Move current primary to follow-ups and set this as new primary
          group.followUps.unshift(group.primaryVisit);
          group.primaryVisit = visit;
          group.latestActivity = visitTime;
        } else {
          // Add as follow-up (maintain chronological order)
          group.followUps.push(visit);
        }

        group.totalVisits++;

        // Update status to latest active status
        if (visit.status === 'in_progress') {
          group.hasActiveVisit = true;
          group.latestStatus = 'in_progress';
        } else if (group.latestStatus !== 'in_progress') {
          group.latestStatus = visit.status;
        }
      }
    });

    // Sort follow-ups by date (newest first)
    groupMap.forEach(group => {
      group.followUps.sort((a, b) =>
        new Date(b.createdAt || b.siteInTime).getTime() -
        new Date(a.createdAt || a.siteInTime).getTime()
      );
    });

    // Convert to array and sort by latest activity
    return Array.from(groupMap.values()).sort((a, b) =>
      b.latestActivity.getTime() - a.latestActivity.getTime()
    );
  };

  // Enhanced filtered data with follow-up awareness
  const filteredVisits = allVisits.filter((visit: SiteVisit) => {
    const matchesSearch = !searchQuery ||
      visit.customer?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      visit.customer?.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      visit.userName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      visit.followUpReason?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDate = !dateFilter ||
      format(visit.siteInTime, 'yyyy-MM-dd') === dateFilter;

    const matchesDepartment = !departmentFilter || departmentFilter === 'all' ||
      visit.department.toLowerCase() === departmentFilter.toLowerCase();

    const matchesStatus = !statusFilter || statusFilter === 'all' || visit.status === statusFilter;

    const matchesFollowUp = !followUpFilter || followUpFilter === 'all' ||
      (followUpFilter === 'original' && !visit.isFollowUp) ||
      (followUpFilter === 'follow_up' && visit.isFollowUp) ||
      (followUpFilter === 'with_follow_ups' && visit.hasFollowUps);

    const matchesOutcome = !outcomeFilter || outcomeFilter === 'all' ||
      visit.visitOutcome === outcomeFilter;

    return matchesSearch && matchesDate && matchesDepartment && matchesStatus && matchesFollowUp && matchesOutcome;
  });

  // Get grouped data
  const groupedVisits = groupVisitsByCustomer(filteredVisits);

  // Filter grouped visits based on filters
  const filteredGroups = groupedVisits.filter(group => {
    const matchesSearch = !searchQuery ||
      group.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      group.customerAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
      group.primaryVisit.userName?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDate = !dateFilter ||
      format(group.primaryVisit.siteInTime, 'yyyy-MM-dd') === dateFilter;

    const matchesDepartment = !departmentFilter || departmentFilter === 'all' ||
      group.primaryVisit.department.toLowerCase() === departmentFilter.toLowerCase();

    const matchesStatus = !statusFilter || statusFilter === 'all' || group.latestStatus === statusFilter;

    const matchesFollowUp = !followUpFilter || followUpFilter === 'all' ||
      (followUpFilter === 'original' && !group.primaryVisit.isFollowUp) ||
      (followUpFilter === 'follow_up' && group.primaryVisit.isFollowUp) ||
      (followUpFilter === 'with_follow_ups' && group.followUps.length > 0);

    const matchesOutcome = !outcomeFilter || outcomeFilter === 'all' ||
      group.primaryVisit.visitOutcome === outcomeFilter;

    return matchesSearch && matchesDate && matchesDepartment && matchesStatus && matchesFollowUp && matchesOutcome;
  });

  // Export functionality
  const exportSiteVisitsData = async () => {
    try {
      const response = await apiRequest("/api/site-visits/export", 'POST', {
        filters: {
          dateFilter,
          departmentFilter,
          statusFilter,
          outcomeFilter,
          searchQuery
        }
      });

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `site-visits-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Export Successful",
        description: "Site visits data has been downloaded"
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Unable to export data. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Access denied screen
  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="py-10">
            <div className="text-center space-y-4">
              <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
              <h3 className="text-lg font-medium">Access Restricted</h3>
              <p className="text-gray-600">
                This monitoring dashboard is only accessible to Master Administrators and HR Department personnel.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-3 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Site Visit Monitoring</h1>
          <p className="text-sm sm:text-base text-gray-600">Live monitoring and reporting dashboard for all site visits</p>
        </div>
        <div className="flex gap-2">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <Button
              variant={viewMode === "grouped" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("grouped")}
              className="h-8 px-3"
            >
              <Users className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Grouped</span>
            </Button>
            <Button
              variant={viewMode === "individual" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("individual")}
              className="h-8 px-3"
            >
              <FileText className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Individual</span>
            </Button>
          </div>
          <Button onClick={exportSiteVisitsData} variant="outline" size="sm" className="flex-1 sm:flex-initial">
            <Download className="h-4 w-4 mr-2" />
            <span className="hidden xs:inline">Export</span>
          </Button>
        </div>
      </div>

      {/* Enhanced Statistics Cards with Follow-up Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <Card>
          <CardContent className="py-3 sm:py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Total Visits</p>
                <p className="text-lg sm:text-2xl font-bold">{stats.total}</p>
              </div>
              <BarChart3 className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3 sm:py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">In Progress</p>
                <p className="text-lg sm:text-2xl font-bold text-orange-600">{stats.inProgress}</p>
              </div>
              <Clock className="h-6 w-6 sm:h-8 sm:w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3 sm:py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Completed</p>
                <p className="text-lg sm:text-2xl font-bold text-green-600">{stats.completed}</p>
              </div>
              <CheckCircle className="h-6 w-6 sm:h-8 sm:w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3 sm:py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Today</p>
                <p className="text-lg sm:text-2xl font-bold text-purple-600">{stats.today}</p>
              </div>
              <Calendar className="h-6 w-6 sm:h-8 sm:w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3 sm:py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Follow-ups</p>
                <p className="text-lg sm:text-2xl font-bold text-indigo-600">{stats.followUps}</p>
              </div>
              <RefreshCw className="h-6 w-6 sm:h-8 sm:w-8 text-indigo-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3 sm:py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Has Follow-ups</p>
                <p className="text-lg sm:text-2xl font-bold text-teal-600">{stats.withFollowUps}</p>
              </div>
              <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 text-teal-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-3 sm:py-4">
          <div className="space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:gap-4">
            <div className="flex-1 sm:min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by customer, address, or employee..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:flex sm:gap-4">
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="sm:w-40 text-sm"
              />

              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="sm:w-40">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  <SelectItem value="operations">Operations</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="hr">HR</SelectItem>
                  <SelectItem value="marketing">Marketing</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="housekeeping">Housekeeping</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="sm:w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>

              <Select value={followUpFilter} onValueChange={setFollowUpFilter}>
                <SelectTrigger className="sm:w-40">
                  <SelectValue placeholder="Follow-up Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Visits</SelectItem>
                  <SelectItem value="original">Original Visits</SelectItem>
                  <SelectItem value="follow_up">Follow-up Visits</SelectItem>
                  <SelectItem value="with_follow_ups">Has Follow-ups</SelectItem>
                </SelectContent>
              </Select>

              <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
                <SelectTrigger className="sm:w-36">
                  <SelectValue placeholder="Outcome" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Outcomes</SelectItem>
                  <SelectItem value="converted">Converted</SelectItem>
                  <SelectItem value="on_process">On Process</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(searchQuery || dateFilter || (departmentFilter && departmentFilter !== 'all') || (statusFilter && statusFilter !== 'all') || (followUpFilter && followUpFilter !== 'all') || (outcomeFilter && outcomeFilter !== 'all')) && (
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => {
                  setSearchQuery("");
                  setDateFilter("");
                  setDepartmentFilter("all");
                  setStatusFilter("all");
                  setFollowUpFilter("all");
                  setOutcomeFilter("all");
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Site Visits Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Site Visits ({viewMode === "grouped" ? filteredGroups.length : filteredVisits.length} {viewMode === "grouped" ? "customers" : "visits"})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              Loading site visits...
            </div>
          ) : (viewMode === "grouped" ? filteredGroups.length === 0 : filteredVisits.length === 0) ? (
            <div className="text-center py-8 text-gray-500">
              No site visits found matching your criteria
            </div>
          ) : (
            <div className="space-y-4">
              {viewMode === "grouped" ? (
                // Grouped View - Customer Visit Groups
                filteredGroups.map((group) => (
                  <CustomerVisitGroupCard
                    key={group.customerMobile}
                    group={group}
                    onViewDetails={(visit) => {
                      setDetailsVisit(visit);
                      setIsDetailsModalOpen(true);
                    }}
                    onViewFollowUp={(followUpId) => {
                      setSelectedFollowUpId(followUpId);
                      setIsFollowUpModalOpen(true);
                    }}
                  />
                ))
              ) : (
                // Individual View - Group by customer but always show visit timeline
                filteredGroups.map((group) => (
                  <Card key={group.customerMobile} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-3 sm:p-6">
                      {/* Customer Header */}
                      <div className="flex flex-col sm:flex-row sm:items-start sm:items-center gap-3 mb-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-base sm:text-lg">
                            {group.customerName}
                            <span className="text-sm text-muted-foreground font-normal ml-2">
                              ({group.totalVisits} visit{group.totalVisits !== 1 ? 's' : ''})
                            </span>
                          </h3>
                        </div>
                      </div>

                      {/* Customer Contact Info - Compact */}
                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mb-4 pb-3 border-b">
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-green-500" />
                          <span>{group.customerMobile}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <MapPin className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                          <span className="truncate">{group.customerAddress}</span>
                        </div>
                      </div>

                      {/* Visit Timeline - Always expanded in Individual view */}
                      <div className="space-y-2.5">
                        {(() => {
                          const allVisits = [group.primaryVisit, ...group.followUps]
                            .sort((a, b) => new Date(b.siteInTime || b.createdAt).getTime() - new Date(a.siteInTime || a.createdAt).getTime());

                          return allVisits.map((visit, index) => {
                            const isOriginal = !visit.isFollowUp;
                            const isLatest = index === 0;

                            return (
                              <div
                                key={visit.id}
                                className={`border-l-2 pl-3 py-2.5 ${isOriginal ? 'border-l-blue-400 bg-blue-50/50' : 'border-l-purple-400 bg-purple-50/50'
                                  } rounded-r hover:shadow-sm transition-all`}
                              >
                                {/* Visit Header */}
                                <div className="flex items-start justify-between gap-3 mb-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-medium text-muted-foreground">
                                      {format(new Date(visit.siteInTime || visit.createdAt), 'MMM dd, HH:mm')}
                                    </span>
                                    <span className="text-xs text-muted-foreground">•</span>
                                    <Badge variant="outline" className="text-xs h-5">
                                      {isOriginal ? 'Original' : 'Follow-up'}
                                    </Badge>
                                    <Badge className="text-xs h-5 capitalize">
                                      {visit.department}
                                    </Badge>
                                    <Badge
                                      variant={
                                        visit.status === 'completed' ? 'default' :
                                          visit.status === 'in_progress' ? 'secondary' : 'destructive'
                                      }
                                      className="text-xs h-5 capitalize"
                                    >
                                      {visit.status === 'in_progress' ? 'In Progress' : visit.status}
                                    </Badge>
                                    {isLatest && (
                                      <Badge className="bg-yellow-100 text-yellow-800 text-xs h-5">
                                        Latest
                                      </Badge>
                                    )}
                                  </div>
                                </div>

                                {/* Visit Details */}
                                <div className="space-y-1.5 text-xs">
                                  <div className="flex items-start gap-2">
                                    <span className="font-medium min-w-[60px]">Purpose:</span>
                                    <span className="text-muted-foreground">{visit.visitPurpose || 'Site Visit'}</span>
                                  </div>

                                  {visit.followUpReason && (
                                    <div className="flex items-start gap-2">
                                      <span className="font-medium min-w-[60px]">Reason:</span>
                                      <span className="text-purple-600 capitalize">
                                        {visit.followUpReason.replace(/_/g, ' ')}
                                      </span>
                                    </div>
                                  )}

                                  <div className="flex items-center gap-2">
                                    <span className="font-medium min-w-[60px]">Employee:</span>
                                    <span className="text-muted-foreground">{visit.userName || 'Unknown'}</span>
                                  </div>

                                  {visit.siteOutTime && (
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium min-w-[60px]">Check-out:</span>
                                      <span className="text-muted-foreground">
                                        {format(new Date(visit.siteOutTime), 'MMM dd, HH:mm')}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-gray-200">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      if (visit.isFollowUp) {
                                        setSelectedFollowUpId(visit.id);
                                        setIsFollowUpModalOpen(true);
                                      } else {
                                        setDetailsVisit(visit);
                                        setIsDetailsModalOpen(true);
                                      }
                                    }}
                                    className="text-xs h-7"
                                  >
                                    <Eye className="h-3 w-3 mr-1" />
                                    View Details
                                  </Button>

                                  {visit.siteInLocation && (
                                    <Badge variant="secondary" className="flex items-center gap-1 text-xs h-5">
                                      <Navigation className="h-2.5 w-2.5" />
                                      Location
                                    </Badge>
                                  )}

                                  {visit.sitePhotos?.length > 0 && (
                                    <Badge variant="outline" className="flex items-center gap-1 text-xs h-5">
                                      <Camera className="h-2.5 w-2.5" />
                                      {visit.sitePhotos.length} Photo{visit.sitePhotos.length !== 1 ? 's' : ''}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enhanced Site Visit Details Modal */}
      <SiteVisitDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        siteVisit={detailsVisit}
      />

      {/* Follow-up Details Modal */}
      <FollowUpDetailsModal
        isOpen={isFollowUpModalOpen}
        onClose={() => setIsFollowUpModalOpen(false)}
        followUpId={selectedFollowUpId}
      />
    </div>
  );
}
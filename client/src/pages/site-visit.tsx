/**
 * Site Visit Management Page
 * Handles field operations for Technical, Marketing, and Admin departments
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { sanitizeFormData } from "../../../shared/utils/form-sanitizer";
import {
  Plus,
  MapPin,
  Clock,
  Timer,
  Users,
  Activity,
  Camera,
  CheckCircle,
  AlertCircle,
  Eye,
  Edit,
  Trash2,
  LogOut,
  RefreshCw,
  History,
  Filter,
  X,
  TrendingUp,
  CircleX,
  Zap
} from "lucide-react";
import { SiteVisitStartModal } from "@/components/site-visit/site-visit-start-modal";
import { SiteVisitDetailsModal } from "@/components/site-visit/site-visit-details-modal";
import { SiteVisitCheckoutModal } from "@/components/site-visit/site-visit-checkout-modal";
import { FollowUpModal } from "@/components/site-visit/follow-up-modal";
import { FollowUpDetailsModal } from "@/components/site-visit/follow-up-details-modal";
import { QuickActionButtons } from "@/components/site-visit/quick-action-buttons";
import { formatDistanceToNow } from "date-fns";

interface SiteVisit {
  id: string;
  userId: string;
  department: 'technical' | 'marketing' | 'admin';
  visitPurpose: string;
  status: 'in_progress' | 'completed' | 'cancelled';
  siteInTime: string;
  siteOutTime?: string;
  customer: {
    name: string;
    mobile: string;
    address: string;
    propertyType: string;
  };
  technicalData?: any;
  marketingData?: any;
  adminData?: any;
  sitePhotos: Array<{
    url: string;
    timestamp: string;
    description?: string;
  }>;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  isFollowUp?: boolean;
  followUpOf?: string;
  followUpReason?: string;
  followUpCount?: number;
  hasFollowUps?: boolean;
  // Visit outcome fields
  visitOutcome?: 'converted' | 'on_process' | 'cancelled';
  outcomeNotes?: string;
  scheduledFollowUpDate?: string;
  outcomeSelectedAt?: string;
  outcomeSelectedBy?: string;

  // Dynamic Status Management fields
  customerCurrentStatus?: 'converted' | 'on_process' | 'cancelled';
  lastActivityType?: 'initial_visit' | 'follow_up';
  lastActivityDate?: string;
  activeFollowUpId?: string;
}

// Unified Site Visit Types
interface CustomerVisitGroup {
  customerMobile: string;
  customerName: string;
  customerAddress: string;
  primaryVisit: SiteVisit;
  followUps: SiteVisit[];
  totalVisits: number;
  latestStatus: string;
  hasActiveVisit: boolean;
}

// Helper function to get effective customer status with dynamic management support
function getEffectiveCustomerStatus(visit: SiteVisit): 'converted' | 'on_process' | 'cancelled' | undefined {
  // CRITICAL: Prioritize visitOutcome (what backend updates) over customerCurrentStatus
  // This ensures visits move to correct tabs after conversion/cancellation
  return visit.visitOutcome || visit.customerCurrentStatus;
}

// Group visits by customer (mobile + name combination)
function groupVisitsByCustomer(visits: SiteVisit[], preservePriorityOrder = false): CustomerVisitGroup[] {
  if (!visits || !Array.isArray(visits)) {
    return [];
  }

  const groupMap = new Map<string, CustomerVisitGroup>();

  visits.forEach((visit) => {
    // Use combination of mobile and customer name for unique grouping
    // This ensures different customers with same mobile are shown separately
    const groupKey = `${visit.customer.mobile}_${visit.customer.name.toLowerCase()}`;

    if (!groupMap.has(groupKey)) {
      // Initialize new group with this visit as primary
      groupMap.set(groupKey, {
        customerMobile: visit.customer.mobile,
        customerName: visit.customer.name,
        customerAddress: visit.customer.address,
        primaryVisit: visit,
        followUps: [],
        totalVisits: 1,
        latestStatus: visit.status,
        hasActiveVisit: visit.status === 'in_progress'
      });
    } else {
      const group = groupMap.get(groupKey)!;

      // CRITICAL: Keep visit with outcome as primary, don't let follow-ups become primary
      // Follow-ups (without outcome) should never replace a visit with outcome
      const currentPrimaryHasOutcome = !!group.primaryVisit.visitOutcome;
      const newVisitHasOutcome = !!visit.visitOutcome;

      // Determine if we should swap primary
      let shouldSwapPrimary = false;

      if (!currentPrimaryHasOutcome && newVisitHasOutcome) {
        // New visit has outcome but current doesn't -> make new visit primary
        shouldSwapPrimary = true;
      } else if (currentPrimaryHasOutcome && !newVisitHasOutcome) {
        // Current has outcome but new doesn't -> keep current as primary
        shouldSwapPrimary = false;
      } else {
        // Both have outcome or both don't have outcome -> use newest
        const visitTime = new Date(visit.createdAt || visit.siteInTime);
        const primaryTime = new Date(group.primaryVisit.createdAt || group.primaryVisit.siteInTime);
        shouldSwapPrimary = visitTime > primaryTime;
      }

      if (shouldSwapPrimary) {
        // Move current primary to follow-ups and set this as new primary
        group.followUps.unshift(group.primaryVisit);
        group.primaryVisit = visit;
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

  // Convert to array and sort appropriately
  const groupsArray = Array.from(groupMap.values());

  if (preservePriorityOrder) {
    // For priority sorting (On Process tab), sort by earliest follow-up date in group
    return groupsArray.sort((a, b) => {
      const getEarliestFollowUpDate = (group: CustomerVisitGroup) => {
        const allVisits = [group.primaryVisit, ...group.followUps];
        const followUpDates = allVisits
          .map(v => v.scheduledFollowUpDate)
          .filter((d): d is string => Boolean(d))
          .map(d => new Date(d).getTime());
        return followUpDates.length > 0 ? Math.min(...followUpDates) : Infinity;
      };

      const aEarliest = getEarliestFollowUpDate(a);
      const bEarliest = getEarliestFollowUpDate(b);

      // Groups with follow-up dates come first, sorted by earliest date
      if (aEarliest === Infinity && bEarliest === Infinity) return 0;
      if (aEarliest === Infinity) return 1;
      if (bEarliest === Infinity) return -1;
      return aEarliest - bEarliest;
    });
  } else {
    // Default sorting by latest activity
    return groupsArray.sort((a, b) => {
      const aLatest = Math.max(
        new Date(a.primaryVisit.createdAt || a.primaryVisit.siteInTime).getTime(),
        ...a.followUps.map(f => new Date(f.createdAt || f.siteInTime).getTime())
      );
      const bLatest = Math.max(
        new Date(b.primaryVisit.createdAt || b.primaryVisit.siteInTime).getTime(),
        ...b.followUps.map(f => new Date(f.createdAt || f.siteInTime).getTime())
      );
      return bLatest - aLatest;
    });
  }
}

export default function SiteVisitPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [selectedSiteVisit, setSelectedSiteVisit] = useState<SiteVisit | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [isFollowUpDetailsModalOpen, setIsFollowUpDetailsModalOpen] = useState(false);
  const [selectedFollowUpId, setSelectedFollowUpId] = useState<string>("");
  const [activeOutcome, setActiveOutcome] = useState("on_process");
  const [scopeFilter, setScopeFilter] = useState<"my" | "team">("my");

  // Visit outcome filters
  const [outcomeFilter, setOutcomeFilter] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Check if user has access to Site Visit features
  const hasAccess = user?.department && ['technical', 'marketing', 'admin', 'administration'].includes(user.department.toLowerCase());

  // Fetch site visits based on scope and outcome
  const { data: siteVisitsData, isLoading: isLoadingSiteVisits } = useQuery({
    queryKey: ['/api/site-visits', { scope: scopeFilter, outcome: activeOutcome, userId: scopeFilter === 'my' ? user?.uid : undefined, department: scopeFilter === 'team' ? user?.department : undefined }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (scopeFilter === 'my' && user?.uid) {
        params.append('userId', user.uid);
      } else if (scopeFilter === 'team' && user?.department) {
        params.append('department', user.department);
      }
      // Add outcome filter to the API request - use visitOutcome to match backend updates
      if (activeOutcome) {
        params.append('visitOutcome', activeOutcome);
      }
      const response = await apiRequest(`/api/site-visits?${params.toString()}`, 'GET');
      return await response.json();
    },
    enabled: Boolean(hasAccess && ((scopeFilter === 'my' && user?.uid) || (scopeFilter === 'team' && user?.department))),
    refetchInterval: 30000,
  });

  // Fetch follow-ups based on scope and outcome
  const { data: followUpsData, isLoading: isLoadingFollowUps } = useQuery({
    queryKey: ['/api/follow-ups', { scope: scopeFilter, outcome: activeOutcome, userId: scopeFilter === 'my' ? user?.uid : undefined, department: scopeFilter === 'team' ? user?.department : undefined }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (scopeFilter === 'my' && user?.uid) {
        params.append('userId', user.uid);
      } else if (scopeFilter === 'team' && user?.department) {
        params.append('department', user.department);
      }
      // Add outcome filter to the API request for follow-ups too - use visitOutcome to match backend updates
      if (activeOutcome) {
        params.append('visitOutcome', activeOutcome);
      }
      const response = await apiRequest(`/api/follow-ups?${params.toString()}`, 'GET');
      return await response.json();
    },
    enabled: Boolean(hasAccess && ((scopeFilter === 'my' && user?.uid) || (scopeFilter === 'team' && user?.department))),
    refetchInterval: 30000,
  });

  // Refetch function for manual refresh
  const { refetch: refetchData } = useQuery({
    queryKey: ['/api/site-visits', { scope: scopeFilter, outcome: activeOutcome, userId: scopeFilter === 'my' ? user?.uid : undefined, department: scopeFilter === 'team' ? user?.department : undefined }],
    enabled: false, // Disable automatic fetching for this query
  });

  // Fetch site visit statistics
  const { data: stats } = useQuery({
    queryKey: ['/api/site-visits/stats'],
    queryFn: async () => {
      const response = await apiRequest('/api/site-visits/stats', 'GET');
      return await response.json();
    },
    enabled: Boolean(hasAccess),
    refetchInterval: 60000, // Refresh stats every minute
  });

  // Delete site visit mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/site-visits/${id}`, 'DELETE'),
    onSuccess: async () => {
      toast({
        title: "Success",
        description: "Site visit deleted successfully",
      });
      await queryClient.refetchQueries({ queryKey: ['/api/site-visits'] });
      await queryClient.refetchQueries({ queryKey: ['/api/follow-ups'] });
      await queryClient.refetchQueries({ queryKey: ['/api/site-visits/stats'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete site visit",
        variant: "destructive",
      });
    },
  });

  const handleDeleteSiteVisit = (id: string) => {
    if (confirm("Are you sure you want to delete this site visit?")) {
      deleteMutation.mutate(id);
    }
  };

  // Convert follow-ups to site visit format for display
  const convertFollowUpToSiteVisit = (followUp: any): SiteVisit => {
    // Determine customer current status for follow-ups
    // For in-progress follow-ups, they should appear in "on_process" tab
    // For completed follow-ups, use newCustomerStatus or fallback to originalCustomerStatus
    let customerCurrentStatus = followUp.customerCurrentStatus;

    if (!customerCurrentStatus) {
      if (followUp.status === 'in_progress') {
        // In-progress follow-ups should show as "on_process" to appear in the active pipeline
        customerCurrentStatus = 'on_process';
      } else if (followUp.status === 'completed') {
        // Use the new status set during follow-up completion, or fallback to original
        customerCurrentStatus = followUp.newCustomerStatus || followUp.originalCustomerStatus || 'on_process';
      } else {
        // Default fallback
        customerCurrentStatus = 'on_process';
      }
    }

    return {
      id: followUp.id,
      userId: followUp.userId,
      department: followUp.department,
      customer: followUp.customer,
      visitPurpose: `Follow-up: ${followUp.followUpReason?.replace(/_/g, ' ')}`,
      siteInTime: followUp.siteInTime,
      siteOutTime: followUp.siteOutTime,
      status: followUp.status,
      notes: followUp.notes || followUp.description,
      isFollowUp: true,
      followUpOf: followUp.originalVisitId,
      followUpReason: followUp.followUpReason,
      createdAt: followUp.createdAt,
      updatedAt: followUp.updatedAt,
      sitePhotos: followUp.sitePhotos || [],
      // Include outcome fields from follow-up data
      visitOutcome: followUp.visitOutcome,
      scheduledFollowUpDate: followUp.scheduledFollowUpDate,
      outcomeNotes: followUp.outcomeNotes,
      outcomeSelectedAt: followUp.outcomeSelectedAt,
      outcomeSelectedBy: followUp.outcomeSelectedBy,
      // Include dynamic status management fields - use calculated customerCurrentStatus
      customerCurrentStatus: customerCurrentStatus,
      lastActivityType: followUp.lastActivityType,
      lastActivityDate: followUp.lastActivityDate,
      activeFollowUpId: followUp.activeFollowUpId
    };
  };

  // Combine site visits and follow-ups for display
  const combineVisitsAndFollowUps = (visits: any, followUps: any) => {
    const siteVisits = visits?.data || [];
    const followUpVisits = followUps?.data || [];

    const convertedFollowUps = followUpVisits.map(convertFollowUpToSiteVisit);
    const combined = [...siteVisits, ...convertedFollowUps];

    // Sort by creation time (most recent first)
    return combined.sort((a, b) => {
      const aTime = new Date(a.createdAt || a.siteInTime).getTime();
      const bTime = new Date(b.createdAt || b.siteInTime).getTime();
      return bTime - aTime;
    });
  };

  // Filter visit groups based on outcome selection
  const filterVisitGroupsByOutcome = (visitGroups: CustomerVisitGroup[]) => {
    if (!outcomeFilter) return visitGroups;

    return visitGroups.filter(group => {
      // Check if any visit in the group (primary or follow-ups) has the selected outcome
      const allVisitsInGroup = [group.primaryVisit, ...group.followUps];
      return allVisitsInGroup.some(visit => getEffectiveCustomerStatus(visit) === outcomeFilter);
    });
  };

  const handleViewDetails = (siteVisit: SiteVisit) => {
    // Check if this is a follow-up visit stored in the separate collection
    if (siteVisit.isFollowUp && siteVisit.id) {
      // This is a follow-up visit - use the follow-up details modal
      setSelectedFollowUpId(siteVisit.id);
      setIsFollowUpDetailsModalOpen(true);
    } else {
      // This is a regular site visit - use the regular details modal
      setSelectedSiteVisit(siteVisit);
      setIsDetailsModalOpen(true);
    }
  };

  const handleCheckoutSiteVisit = (siteVisit: SiteVisit) => {
    // For follow-ups, we need to use the follow-up checkout endpoint
    if (siteVisit.isFollowUp && siteVisit.id) {
      // Set up for follow-up checkout
      setSelectedFollowUpId(siteVisit.id);
      setSelectedSiteVisit(siteVisit); // Still need this for the checkout modal
      setIsCheckoutModalOpen(true);
    } else {
      // Regular site visit checkout
      setSelectedSiteVisit(siteVisit);
      setIsCheckoutModalOpen(true);
    }
  };

  const handleFollowUpVisit = (siteVisit: SiteVisit) => {
    setSelectedSiteVisit(siteVisit);
    setIsFollowUpModalOpen(true);
  };

  // Follow-up checkout mutation
  const followUpCheckoutMutation = useMutation({
    mutationFn: async ({ followUpId, checkoutData }: { followUpId: string; checkoutData: any }) => {
      const sanitized = sanitizeFormData(checkoutData, ['notes', 'remarks', 'description', 'outcomeNotes']);
      return apiRequest(`/api/follow-ups/${followUpId}/checkout`, 'PATCH', sanitized);
    },
    onSuccess: async () => {
      toast({
        title: "Success",
        description: "Follow-up checkout completed successfully",
      });
      await queryClient.refetchQueries({ queryKey: ['/api/site-visits'] });
      await queryClient.refetchQueries({ queryKey: ['/api/follow-ups'] });
      await queryClient.refetchQueries({ queryKey: ['/api/site-visits/stats'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to checkout follow-up visit",
        variant: "destructive",
      });
    }
  });

  const handleFollowUpCheckout = async (followUpId: string) => {
    try {
      // Fetch the follow-up data to get full details for checkout modal
      const response = await apiRequest(`/api/follow-ups/${followUpId}`, 'GET');
      const followUpData = await response.json();
      const followUp = followUpData.data;

      if (followUp) {
        // Set the isFollowUp flag and open the checkout modal with proper location/photo capture
        const followUpForCheckout = {
          ...followUp,
          isFollowUp: true // Ensure this flag is set
        };

        setSelectedSiteVisit(followUpForCheckout);
        setIsCheckoutModalOpen(true);
      } else {
        toast({
          title: "Error",
          description: "Follow-up visit not found",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load follow-up visit for checkout",
        variant: "destructive",
      });
    }
  };

  if (!hasAccess) {
    return (
      <div className="container mx-auto p-2 sm:p-4 lg:p-8">
        <Card>
          <CardHeader className="text-center sm:text-left">
            <CardTitle className="flex items-center gap-2 justify-center sm:justify-start text-lg sm:text-xl">
              <MapPin className="h-5 w-5 sm:h-6 sm:w-6" />
              Site Visit Management
            </CardTitle>
            <CardDescription className="text-sm">
              Field operations management for Technical, Marketing, and Admin departments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-6 sm:py-8 px-4">
              <AlertCircle className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-3 sm:mb-4" />
              <h3 className="text-base sm:text-lg font-semibold mb-2">Access Restricted</h3>
              <p className="text-sm sm:text-base text-muted-foreground mb-4 max-w-md mx-auto">
                Site Visit features are only available to Technical, Marketing, and Admin departments.
              </p>
              <Badge variant="outline" className="text-xs sm:text-sm">
                Your Department: {user?.department || 'Not Assigned'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-2 sm:p-4 lg:p-8 space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">Site Visit Management</h1>
          <p className="text-sm text-muted-foreground">
            Manage field operations and site visits for {user?.department} department
          </p>
        </div>
        <Button
          onClick={() => setIsStartModalOpen(true)}
          size="default"
          className="w-full sm:w-auto"
        >
          <Plus className="h-4 w-4 mr-2" />
          Start Site Visit
        </Button>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4">
          <Card>
            <CardContent className="p-3 sm:p-4 lg:p-6">
              <div className="flex items-center">
                <Activity className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 text-blue-600 flex-shrink-0" />
                <div className="ml-2 sm:ml-3 lg:ml-4 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Total Visits</p>
                  <p className="text-lg sm:text-xl lg:text-2xl font-bold">{(stats as any)?.total || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:p-4 lg:p-6">
              <div className="flex items-center">
                <Clock className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 text-orange-600 flex-shrink-0" />
                <div className="ml-2 sm:ml-3 lg:ml-4 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">In Progress</p>
                  <p className="text-lg sm:text-xl lg:text-2xl font-bold">{(stats as any)?.inProgress || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-all" onClick={() => { setOutcomeFilter(outcomeFilter === 'converted' ? null : 'converted'); setShowFilters(true) }}>
            <CardContent className="p-3 sm:p-4 lg:p-6">
              <div className="flex items-center">
                <TrendingUp className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 text-green-600 flex-shrink-0" />
                <div className="ml-2 sm:ml-3 lg:ml-4 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Converted</p>
                  <p className="text-lg sm:text-xl lg:text-2xl font-bold">{(stats as any)?.outcomes?.converted || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-all" onClick={() => { setOutcomeFilter(outcomeFilter === 'on_process' ? null : 'on_process'); setShowFilters(true) }}>
            <CardContent className="p-3 sm:p-4 lg:p-6">
              <div className="flex items-center">
                <Zap className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 text-yellow-600 flex-shrink-0" />
                <div className="ml-2 sm:ml-3 lg:ml-4 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">On Process</p>
                  <p className="text-lg sm:text-xl lg:text-2xl font-bold">{(stats as any)?.outcomes?.on_process || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-all" onClick={() => { setOutcomeFilter(outcomeFilter === 'cancelled' ? null : 'cancelled'); setShowFilters(true) }}>
            <CardContent className="p-3 sm:p-4 lg:p-6">
              <div className="flex items-center">
                <CircleX className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 text-red-600 flex-shrink-0" />
                <div className="ml-2 sm:ml-3 lg:ml-4 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Cancelled</p>
                  <p className="text-lg sm:text-xl lg:text-2xl font-bold">{(stats as any)?.outcomes?.cancelled || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Outcome Filters */}
      {(showFilters || outcomeFilter) && (
        <Card className="bg-muted/30">
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filters:</span>
              </div>

              {/* Outcome Filter Badges */}
              {outcomeFilter === 'converted' && (
                <Badge className="bg-green-100 text-green-800 border-green-200">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  Converted
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setOutcomeFilter(null)} />
                </Badge>
              )}
              {outcomeFilter === 'on_process' && (
                <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
                  <Zap className="h-3 w-3 mr-1" />
                  On Process
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setOutcomeFilter(null)} />
                </Badge>
              )}
              {outcomeFilter === 'cancelled' && (
                <Badge className="bg-red-100 text-red-800 border-red-200">
                  <CircleX className="h-3 w-3 mr-1" />
                  Cancelled
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setOutcomeFilter(null)} />
                </Badge>
              )}

              {/* Filter Options */}
              {!outcomeFilter && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setOutcomeFilter('converted')} className="h-8">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    Converted
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setOutcomeFilter('on_process')} className="h-8">
                    <Zap className="h-3 w-3 mr-1" />
                    On Process
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setOutcomeFilter('cancelled')} className="h-8">
                    <CircleX className="h-3 w-3 mr-1" />
                    Cancelled
                  </Button>
                </>
              )}

              {/* Clear All */}
              {outcomeFilter && (
                <Button variant="ghost" size="sm" onClick={() => { setOutcomeFilter(null); setShowFilters(false) }} className="h-8 text-xs">
                  Clear All
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Outcome-Based Navigation */}
      <div className="space-y-4">
        {/* Scope Filter Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium">Scope:</span>
            <div className="flex rounded-md border">
              <button
                onClick={() => setScopeFilter('my')}
                className={`px-3 py-1 text-xs rounded-l-md transition-colors ${scopeFilter === 'my'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
              >
                My
              </button>
              <button
                onClick={() => setScopeFilter('team')}
                className={`px-3 py-1 text-xs rounded-r-md border-l transition-colors ${scopeFilter === 'team'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
              >
                Team
              </button>
            </div>
          </div>
        </div>

        {/* Outcome Tabs */}
        <Tabs value={activeOutcome} onValueChange={setActiveOutcome}>
          <TabsList className="grid w-full grid-cols-3 h-auto">
            <TabsTrigger value="on_process" className="text-xs sm:text-sm px-2 py-2">
              <Zap className="h-4 w-4 mr-2 text-yellow-600" />
              On Process
            </TabsTrigger>
            <TabsTrigger value="converted" className="text-xs sm:text-sm px-2 py-2">
              <TrendingUp className="h-4 w-4 mr-2 text-green-600" />
              Completed
            </TabsTrigger>
            <TabsTrigger value="cancelled" className="text-xs sm:text-sm px-2 py-2">
              <CircleX className="h-4 w-4 mr-2 text-red-600" />
              Cancelled
            </TabsTrigger>
          </TabsList>

          {/* On Process Visits */}
          <TabsContent value="on_process">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-600" />
                  On Process
                </CardTitle>
                <CardDescription>
                  Active visits
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(isLoadingSiteVisits || isLoadingFollowUps) ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : (() => {
                  const combinedVisits = combineVisitsAndFollowUps(siteVisitsData, followUpsData);
                  const allGroupedVisits = groupVisitsByCustomer(combinedVisits);
                  const filteredGroups = allGroupedVisits.filter(group => {
                    const hasActiveVisit = [group.primaryVisit, ...group.followUps].some(v => v.status === 'in_progress');
                    const primaryIsOnProcess = getEffectiveCustomerStatus(group.primaryVisit) === 'on_process';
                    return hasActiveVisit || primaryIsOnProcess;
                  });
                  return filteredGroups.length === 0;
                })() ? (
                  <div className="text-center py-6 sm:py-8 px-4">
                    <Zap className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-3 sm:mb-4" />
                    <h3 className="text-base sm:text-lg font-semibold mb-2">No visits on process</h3>
                    <p className="text-sm sm:text-base text-muted-foreground mb-4 max-w-sm mx-auto">
                      All visits have been completed or cancelled. Great work!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(() => {
                      const combinedVisits = combineVisitsAndFollowUps(siteVisitsData, followUpsData);
                      // IMPORTANT: Group first, THEN filter
                      const allGroupedVisits = groupVisitsByCustomer(combinedVisits);
                      // On Process tab should show:
                      // 1. Groups with ANY in-progress visit (active work happening)
                      // 2. OR groups with primary visit outcome = 'on_process'
                      const filteredGroups = allGroupedVisits.filter(group => {
                        const hasActiveVisit = [group.primaryVisit, ...group.followUps].some(v => v.status === 'in_progress');
                        const primaryIsOnProcess = getEffectiveCustomerStatus(group.primaryVisit) === 'on_process';
                        return hasActiveVisit || primaryIsOnProcess;
                      });
                      // Sort by earliest follow-up date
                      const sortedGroups = filteredGroups.sort((a, b) => {
                        const aDate = a.primaryVisit.scheduledFollowUpDate;
                        const bDate = b.primaryVisit.scheduledFollowUpDate;
                        if (!aDate && !bDate) return 0;
                        if (!aDate) return 1;
                        if (!bDate) return -1;
                        return new Date(aDate).getTime() - new Date(bDate).getTime();
                      });
                      return sortedGroups;
                    })().map((group: CustomerVisitGroup, index: number) => (
                      <UnifiedSiteVisitCard
                        key={`${group.customerMobile}_${group.customerName}_${index}`}
                        visitGroup={group}
                        onView={handleViewDetails}
                        onCheckout={handleCheckoutSiteVisit}
                        onFollowUp={handleFollowUpVisit}
                        onDelete={handleDeleteSiteVisit}
                        showActions={true}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Converted/Completed Visits */}
          <TabsContent value="converted">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  Completed
                </CardTitle>
                <CardDescription>
                  Successfully converted visits
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(isLoadingSiteVisits || isLoadingFollowUps) ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : (() => {
                  const combinedVisits = combineVisitsAndFollowUps(siteVisitsData, followUpsData);
                  const convertedVisits = combinedVisits.filter(visit => getEffectiveCustomerStatus(visit) === 'converted');
                  return convertedVisits.length === 0;
                })() ? (
                  <div className="text-center py-6 sm:py-8 px-4">
                    <TrendingUp className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-3 sm:mb-4" />
                    <h3 className="text-base sm:text-lg font-semibold mb-2">No completed visits yet</h3>
                    <p className="text-sm sm:text-base text-muted-foreground mb-4 max-w-sm mx-auto">
                      Keep working on those 'On Process' visits to get your first conversions!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(() => {
                      const combinedVisits = combineVisitsAndFollowUps(siteVisitsData, followUpsData);
                      // IMPORTANT: Group first, THEN filter by primary visit status
                      const allGroupedVisits = groupVisitsByCustomer(combinedVisits);
                      const filteredGroups = allGroupedVisits.filter(group =>
                        getEffectiveCustomerStatus(group.primaryVisit) === 'converted'
                      );
                      return filteredGroups;
                    })().map((group: CustomerVisitGroup, index: number) => (
                      <UnifiedSiteVisitCard
                        key={`${group.customerMobile}_${group.customerName}_${index}`}
                        visitGroup={group}
                        onView={handleViewDetails}
                        onCheckout={handleCheckoutSiteVisit}
                        onFollowUp={handleFollowUpVisit}
                        onDelete={handleDeleteSiteVisit}
                        showActions={true}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Cancelled Visits */}
          <TabsContent value="cancelled">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CircleX className="h-5 w-5 text-red-600" />
                  Cancelled
                </CardTitle>
                <CardDescription>
                  Missed Opportunities
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(isLoadingSiteVisits || isLoadingFollowUps) ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : (() => {
                  const combinedVisits = combineVisitsAndFollowUps(siteVisitsData, followUpsData);
                  const cancelledVisits = combinedVisits.filter(visit => getEffectiveCustomerStatus(visit) === 'cancelled');
                  return cancelledVisits.length === 0;
                })() ? (
                  <div className="text-center py-6 sm:py-8 px-4">
                    <CircleX className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-3 sm:mb-4" />
                    <h3 className="text-base sm:text-lg font-semibold mb-2">No cancelled visits</h3>
                    <p className="text-sm sm:text-base text-muted-foreground mb-4 max-w-sm mx-auto">
                      Excellent! No cancelled visits means great customer engagement.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(() => {
                      const combinedVisits = combineVisitsAndFollowUps(siteVisitsData, followUpsData);
                      // IMPORTANT: Group first, THEN filter by primary visit status
                      const allGroupedVisits = groupVisitsByCustomer(combinedVisits);
                      const filteredGroups = allGroupedVisits.filter(group =>
                        getEffectiveCustomerStatus(group.primaryVisit) === 'cancelled'
                      );
                      return filteredGroups;
                    })().map((group: CustomerVisitGroup, index: number) => (
                      <UnifiedSiteVisitCard
                        key={`${group.customerMobile}_${group.customerName}_${index}`}
                        visitGroup={group}
                        onView={handleViewDetails}
                        onCheckout={handleCheckoutSiteVisit}
                        onFollowUp={handleFollowUpVisit}
                        onDelete={handleDeleteSiteVisit}
                        showActions={true}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Modals */}
      <SiteVisitStartModal
        isOpen={isStartModalOpen}
        onClose={() => setIsStartModalOpen(false)}
        userDepartment={user?.department?.toLowerCase() === 'administration' ? 'admin' : (user?.department || 'technical')}
      />

      <SiteVisitDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        siteVisit={selectedSiteVisit}
      />

      {selectedSiteVisit && (
        <SiteVisitCheckoutModal
          isOpen={isCheckoutModalOpen}
          onClose={() => setIsCheckoutModalOpen(false)}
          siteVisit={selectedSiteVisit}
        />
      )}

      <FollowUpModal
        isOpen={isFollowUpModalOpen}
        onClose={() => setIsFollowUpModalOpen(false)}
        originalVisit={selectedSiteVisit}
      />

      <FollowUpDetailsModal
        isOpen={isFollowUpDetailsModalOpen}
        onClose={() => setIsFollowUpDetailsModalOpen(false)}
        followUpId={selectedFollowUpId}
        onCheckout={handleFollowUpCheckout}
      />
    </div>
  );
}

// Unified Site Visit Card Component
interface UnifiedSiteVisitCardProps {
  visitGroup: CustomerVisitGroup;
  onView: (visit: SiteVisit) => void;
  onCheckout?: (visit: SiteVisit) => void;
  onFollowUp?: (visit: SiteVisit) => void;
  onDelete?: (visitId: string) => void;
  showActions: boolean;
}

function UnifiedSiteVisitCard({ visitGroup, onView, onCheckout, onFollowUp, onDelete, showActions }: UnifiedSiteVisitCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_progress': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getDepartmentColor = (department: string) => {
    switch (department) {
      case 'technical': return 'bg-blue-100 text-blue-800';
      case 'marketing': return 'bg-green-100 text-green-800';
      case 'admin': return 'bg-purple-100 text-purple-800';
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

  const formatTime = (timeString: string) => {
    try {
      return formatDistanceToNow(new Date(timeString), { addSuffix: true });
    } catch {
      return 'Unknown time';
    }
  };

  const currentActiveVisit = visitGroup.hasActiveVisit
    ? (visitGroup.primaryVisit.status === 'in_progress'
      ? visitGroup.primaryVisit
      : visitGroup.followUps.find(f => f.status === 'in_progress'))
    : null;

  return (
    <Card className="transition-all hover:shadow-md">
      <CardHeader className="pb-3 p-3 sm:p-4 lg:p-6">
        <div className="flex flex-col space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <CardTitle className="text-base sm:text-lg truncate">{visitGroup.customerName}</CardTitle>
            <div className="flex flex-wrap gap-1 sm:gap-2">
              {visitGroup.primaryVisit.visitOutcome && (
                <Badge className={getOutcomeColor(visitGroup.primaryVisit.visitOutcome)}>
                  {visitGroup.primaryVisit.visitOutcome === 'on_process' ? 'On Process' :
                    visitGroup.primaryVisit.visitOutcome.charAt(0).toUpperCase() + visitGroup.primaryVisit.visitOutcome.slice(1)}
                </Badge>
              )}
              {visitGroup.totalVisits > 1 && (
                <Badge variant="secondary" className="text-xs">
                  {visitGroup.totalVisits} visits
                </Badge>
              )}
            </div>
          </div>

          {visitGroup.followUps.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className="text-xs">
                <RefreshCw className="h-3 w-3 mr-1" />
                {visitGroup.followUps.length} follow-up{visitGroup.followUps.length > 1 ? 's' : ''}
              </Badge>
            </div>
          )}

          <div className="text-sm text-muted-foreground space-y-1">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 flex-shrink-0" />
              <span className="truncate sm:text-clip">{visitGroup.customerMobile}</span>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span className="flex-1 text-xs sm:text-sm line-clamp-2">{visitGroup.customerAddress}</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 sm:space-y-4 p-3 sm:p-4 lg:p-6">
        {/* Primary Visit Display */}
        <div className="border rounded-lg p-2 sm:p-3 bg-gray-50">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
            <div className="flex flex-wrap items-center gap-1 sm:gap-2">
              <Badge className={getDepartmentColor(visitGroup.primaryVisit.department)}>
                {visitGroup.primaryVisit.department}
              </Badge>
              <span className="text-xs sm:text-sm font-medium">Latest Visit</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {formatTime(visitGroup.primaryVisit.siteInTime)}
            </span>
          </div>

          <div className="text-xs sm:text-sm space-y-1">
            <div><strong>Purpose:</strong> <span className="break-words">{visitGroup.primaryVisit.visitPurpose}</span></div>
            {visitGroup.primaryVisit.notes && (
              <div><strong>Notes:</strong> <span className="break-words">{visitGroup.primaryVisit.notes}</span></div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-xs text-muted-foreground">
              <span>Check-in: {formatTime(visitGroup.primaryVisit.siteInTime)}</span>
              {visitGroup.primaryVisit.siteOutTime && (
                <span>Check-out: {formatTime(visitGroup.primaryVisit.siteOutTime)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Visit Timeline - All Visits Chronologically */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <History className="h-4 w-4" />
            <span>Visit Timeline ({visitGroup.totalVisits} visits)</span>
          </div>

          {/* Create chronological list of ALL visits */}
          {(() => {
            // Combine primary visit and follow-ups in reverse chronological order (latest first)
            const allVisits = [visitGroup.primaryVisit, ...visitGroup.followUps]
              .sort((a, b) => new Date(b.siteInTime || b.createdAt).getTime() - new Date(a.siteInTime || a.createdAt).getTime());

            return (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {allVisits.map((visit, index) => {
                  const isOriginal = !visit.isFollowUp;
                  const visitNumber = index + 1;
                  const isLatest = index === allVisits.length - 1;

                  return (
                    <div key={visit.id} className={`border rounded-lg p-3 transition-all hover:shadow-sm ${isLatest ? 'bg-blue-50 border-blue-200' : 'bg-gray-50'
                      }`}>
                      {/* Visit Header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs font-medium">
                            {isOriginal ? `Original Visit` : `Follow-up #${visitNumber - 1}`}
                          </Badge>
                          <Badge className={getDepartmentColor(visit.department)}>
                            {visit.department}
                          </Badge>
                          <Badge className={getStatusColor(visit.status)}>
                            {visit.status.replace('_', ' ')}
                          </Badge>
                          {isLatest && (
                            <Badge className="bg-yellow-100 text-yellow-800 text-xs">
                              Latest
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatTime(visit.siteInTime || visit.createdAt)}
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

                        {/* Timing Info */}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Check-in: {formatTime(visit.siteInTime || visit.createdAt)}</span>
                          {visit.siteOutTime && (
                            <span>Check-out: {formatTime(visit.siteOutTime)}</span>
                          )}
                        </div>
                      </div>

                      {/* Individual Visit Actions */}
                      <div className="space-y-2 pt-2 border-t border-gray-200">
                        {/* Quick Action Buttons for On Process visits (only after checkout, regular visits only) */}
                        {visit.visitOutcome === 'on_process' && visit.status === 'completed' && !visit.isFollowUp && (
                          <QuickActionButtons
                            siteVisit={visit}
                            className="mb-2"
                          />
                        )}

                        {/* Standard Action Buttons */}
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onView(visit)}
                            className="text-xs h-7 px-3"
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            View Details
                          </Button>

                          {visit.status === 'in_progress' && onCheckout && (
                            <Button
                              size="sm"
                              onClick={() => onCheckout(visit)}
                              className="text-xs h-7 px-3 bg-blue-600 hover:bg-blue-700"
                            >
                              <LogOut className="h-3 w-3 mr-1" />
                              Check-out
                            </Button>
                          )}


                          {/* TODO: Create Follow-up button - Implement in future */}
                          {/* {visit.status === 'completed' && onFollowUp && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onFollowUp(visit)}
                              className="text-xs h-7 px-3"
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Create Follow-up
                            </Button>
                          )} */}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Quick Actions for Overall Customer */}
        {showActions && (
          <div className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-2 border-t">
            {onFollowUp && visitGroup.latestStatus !== 'cancelled' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onFollowUp(visitGroup.primaryVisit)}
                className="w-full sm:w-auto text-xs sm:text-sm"
              >
                <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                Start New Follow-up
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Legacy Site Visit Card Component (kept for compatibility)
interface SiteVisitCardProps {
  siteVisit: SiteVisit;
  onView: () => void;
  onCheckout?: () => void;
  onFollowUp?: () => void;
  onDelete?: () => void;
  showActions: boolean;
}

function SiteVisitCard({ siteVisit, onView, onCheckout, onFollowUp, onDelete, showActions }: SiteVisitCardProps) {
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

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={getStatusColor(siteVisit.status)}>
                {siteVisit.status.replace('_', ' ')}
              </Badge>
              <Badge variant="outline" className={getDepartmentColor(siteVisit.department)}>
                {siteVisit.department}
              </Badge>
              <Badge variant="outline">
                {siteVisit.visitPurpose}
              </Badge>
            </div>

            <div>
              <h3 className="font-semibold text-lg">{siteVisit.customer.name}</h3>
              <p className="text-sm text-muted-foreground">{siteVisit.customer.address}</p>
              <p className="text-sm text-muted-foreground">{siteVisit.customer.mobile}</p>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {siteVisit.siteOutTime ? (
                  <span>Completed {formatDistanceToNow(new Date(siteVisit.siteOutTime))} ago</span>
                ) : (
                  <span>Started {formatDistanceToNow(new Date(siteVisit.siteInTime))} ago</span>
                )}
              </div>
              {siteVisit.siteOutTime && (
                <div className="flex items-center gap-1">
                  <Timer className="h-4 w-4" />
                  <span>Duration: {Math.round((new Date(siteVisit.siteOutTime).getTime() - new Date(siteVisit.siteInTime).getTime()) / (1000 * 60))}min</span>
                </div>
              )}
              {siteVisit.sitePhotos.length > 0 && (
                <div className="flex items-center gap-1">
                  <Camera className="h-4 w-4" />
                  <span>{siteVisit.sitePhotos.length} photo{siteVisit.sitePhotos.length !== 1 ? 's' : ''}</span>
                  {siteVisit.sitePhotos.length > 5 && (
                    <Badge variant="secondary" className="text-xs ml-1">
                      {siteVisit.sitePhotos.length > 15 ? 'Comprehensive' : 'Good Coverage'}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>

          {showActions && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onView}
              >
                <Eye className="h-4 w-4" />
              </Button>
              {siteVisit.status === 'in_progress' && onCheckout && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={onCheckout}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              )}
              {siteVisit.status === 'completed' && onFollowUp && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onFollowUp}
                  className="text-blue-600 hover:text-blue-700"
                  title="Create follow-up visit"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
              {onDelete && siteVisit.status !== 'in_progress' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDelete}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
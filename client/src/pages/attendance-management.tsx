import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthContext } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import { sanitizeFormData } from "../../../shared/utils/form-sanitizer";
import { TimeDisplay } from "@/components/time/time-display";
import { TimeInput } from "@/components/time/time-input";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { UndoManager, useUndoManager } from "@/components/undo/undo-manager";
import { useOfflineHandler, callWithOfflineHandling } from "@/utils/offline-handler";
import { getUserFriendlyMessage } from "@/utils/user-friendly-messages";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  CalendarIcon, Search, Loader2, FileText, BarChart, UserCheck, Clock,
  Plus, Edit, Trash2, Eye, Download, Upload, Settings, Users,
  CheckCircle, XCircle, AlertCircle, MapPin, Camera, TrendingUp, Play, RefreshCw, Edit3
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { departments } from "@shared/schema";
import * as XLSX from 'xlsx';
import { KPICards } from "@/components/attendance/kpi-cards";
import { ExceptionAlert } from "@/components/attendance/exception-alert";
import { AttendanceTrendChart } from "@/components/attendance/attendance-trend-chart";
import { DepartmentBreakdownChart } from "@/components/attendance/department-breakdown-chart";
import { AttendancePhotoViewer } from "@/components/attendance/attendance-photo-viewer";

export default function AttendanceManagement() {
  const { user } = useAuthContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Undo management
  const { actions, addAction, executeUndo, clearActions } = useUndoManager();

  // Offline handling
  const offlineHandler = useOfflineHandler();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modal states
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);
  const [photoViewerRecord, setPhotoViewerRecord] = useState<any>(null);
  const [selectedAttendanceRecord, setSelectedAttendanceRecord] = useState<any>(null);
  const [editingAttendance, setEditingAttendance] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    checkInTime: '',
    checkOutTime: '',
    status: '',
    overtimeHours: 0,
    remarks: ''
  });

  // Review modal states (Phase 3)
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewingRecord, setReviewingRecord] = useState<any>(null);
  const [reviewForm, setReviewForm] = useState({
    action: 'accepted',
    checkInTime: '',
    checkOutTime: '',
    notes: ''
  });

  // OT Review States (Zero-Fraud System)
  const [showOTReviewModal, setShowOTReviewModal] = useState(false);
  const [selectedOTSession, setSelectedOTSession] = useState<any>(null);
  const [otReviewAction, setOTReviewAction] = useState<'APPROVED' | 'ADJUSTED' | 'REJECTED'>('APPROVED');
  const [otAdjustedHours, setOTAdjustedHours] = useState('');
  const [otReviewNotes, setOTReviewNotes] = useState('');

  // Fetch pending OT sessions
  const { data: otResponse, isLoading: isLoadingOT, refetch: refetchOT } = useQuery({
    queryKey: ['/api/ot/sessions/pending'],
    enabled: !!user && (user.role === "master_admin" || user.role === "admin"),
    refetchInterval: 60000,
    queryFn: async () => {
      const res = await apiRequest('/api/ot/sessions/pending', 'GET');
      return res.json();
    },
  });

  const pendingOTSessions = otResponse?.sessions || [];

  // Fetch Live OT sessions (Active in-progress)
  const { data: liveOTResponse, isLoading: isLoadingLiveOT, refetch: refetchLiveOT } = useQuery({
    queryKey: ['/api/ot/sessions/active/all'],
    enabled: !!user && (user.role === "master_admin" || user.role === "admin"),
    refetchInterval: 30000, // Update every 30 seconds for real-time monitoring
    queryFn: async () => {
      const res = await apiRequest('/api/ot/sessions/active/all', 'GET');
      return res.json();
    },
  });

  const activeOTSessions = liveOTResponse?.sessions || [];

  // ✅ FIX: Calculate hours from timestamps (otHours is 0 for pending review)
  const calculateOTHours = (session: any) => {
    if (!session.startTime || !session.endTime) return 0;
    const start = new Date(session.startTime);
    const end = new Date(session.endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    const durationMs = end.getTime() - start.getTime();
    const hours = durationMs / (1000 * 60 * 60);
    return Math.max(0, hours);
  };

  // OT Review mutation
  const otReviewMutation = useMutation({
    mutationFn: async ({ sessionId, action, adjustedHours, notes, attendanceId }: {
      sessionId: string;
      action: 'APPROVED' | 'ADJUSTED' | 'REJECTED';
      adjustedHours?: number;
      notes?: string;
      attendanceId: string;
    }) => {
      const res = await apiRequest(`/api/ot/sessions/${sessionId}/review`, 'POST', {
        action,
        adjustedHours,
        notes,
        attendanceId
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ot/sessions/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ot/reports'] }); // ✅ FIX: Invalidate reports cache
      // Also invalidate attendance queries as status changes affect payload
      queryClient.invalidateQueries({ queryKey: ['/api/attendance/live'] });
      refetchOT();
      setShowOTReviewModal(false);
      resetOTForm();
      toast({
        title: "Review Processed",
        description: "OT session reviewed successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Review Failed",
        description: error.message || "Failed to process review",
        variant: "destructive",
      });
    },
  });

  const resetOTForm = () => {
    setSelectedOTSession(null);
    setOTReviewAction('APPROVED');
    setOTAdjustedHours('');
    setOTReviewNotes('');
  };

  const handleOTReview = (session: any) => {
    setSelectedOTSession(session);
    setOTReviewAction('APPROVED');
    setOTAdjustedHours(session.otHours?.toString() || '0');
    setOTReviewNotes('');
    setShowOTReviewModal(true);
  };

  const handleSubmitOTReview = () => {
    if (!selectedOTSession) return;

    if (otReviewAction === 'ADJUSTED' && (!otAdjustedHours || parseFloat(otAdjustedHours) < 0)) {
      toast({
        title: "Invalid Hours",
        description: "Please enter valid adjusted hours",
        variant: "destructive",
      });
      return;
    }

    otReviewMutation.mutate({
      sessionId: selectedOTSession.sessionId,
      action: otReviewAction,
      adjustedHours: otReviewAction === 'ADJUSTED' ? parseFloat(otAdjustedHours) : undefined,
      notes: otReviewNotes,
      attendanceId: selectedOTSession.attendanceId
    });
  };

  // Real-time attendance data - Fixed memory leak with cleanup
  const { data: liveAttendance = [], isLoading: isLoadingLive, refetch: refetchLive } = useQuery({
    queryKey: ['/api/attendance/live'],
    enabled: !!user && user.role === "master_admin",
    refetchInterval: 30000, // Refresh every 30 seconds
    refetchOnWindowFocus: false, // Prevent excessive refetching
  });

  // CRITICAL FIX: Memory leak prevention with proper cleanup
  useEffect(() => {
    return () => {
      // Clear all intervals and ongoing requests on unmount
      queryClient.cancelQueries({ queryKey: ['/api/attendance/live'] });
      queryClient.cancelQueries({ queryKey: ['/api/attendance'] });
    };
  }, [queryClient]);

  // Update last updated timestamp
  useEffect(() => {
    const updateTimestamp = () => {
      const now = new Date();
      setLastUpdated(now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }));
    };
    updateTimestamp();
    const interval = setInterval(updateTimestamp, 30000);
    return () => clearInterval(interval);
  }, []);

  // Date preset handlers
  const handleDatePreset = (preset: string) => {
    const today = new Date();
    let newDate = new Date();

    switch (preset) {
      case 'today':
        newDate = today;
        break;
      case 'yesterday':
        newDate.setDate(today.getDate() - 1);
        break;
      case 'this_week':
        const dayOfWeek = today.getDay();
        newDate.setDate(today.getDate() - dayOfWeek);
        break;
      case 'last_week':
        newDate.setDate(today.getDate() - 7);
        break;
      default:
        newDate = today;
    }

    setSelectedDate(newDate);
  };

  // Manual refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchLive(), refetchDaily()]);
    setIsRefreshing(false);
    toast({
      title: "Data Refreshed",
      description: "Attendance data has been updated",
    });
  };

  // Daily attendance records
  const { data: dailyAttendance = [], isLoading: isLoadingDaily, refetch: refetchDaily } = useQuery({
    queryKey: ['/api/attendance', { date: selectedDate.toISOString().split('T')[0] }],
    enabled: !!user,
    queryFn: async () => {
      const dateParam = selectedDate.toISOString().split('T')[0];
      const attendanceResponse = await apiRequest(`/api/attendance?date=${dateParam}`, 'GET');
      const attendanceData = await attendanceResponse.json();

      // Enrich with user details
      const usersResponse = await apiRequest('/api/users', 'GET');
      const users = await usersResponse.json();

      return attendanceData.map((record: any) => {
        const userDetails = users.find((u: any) => u.id === record.userId);
        return {
          ...record,
          userName: userDetails?.displayName || `User #${record.userId}`,
          userDepartment: userDetails?.department || null,
          userDesignation: userDetails?.designation || null,
          userEmail: userDetails?.email || null
        };
      });
    },
  });

  // Attendance policies
  const { data: attendancePolicies = [] } = useQuery({
    queryKey: ['/api/attendance/policies'],
    enabled: !!user,
    queryFn: async () => {
      const response = await apiRequest('/api/attendance/policies', 'GET');
      return response.json();
    },
  });

  // Pending review records (Phase 3)
  const { data: pendingReviews = [], isLoading: isLoadingReviews, refetch: refetchReviews } = useQuery({
    queryKey: ['/api/admin/attendance/pending-review'],
    enabled: !!user && (user.role === "master_admin" || user.role === "admin"),
    refetchInterval: 60000, // Refresh every minute
    queryFn: async () => {
      const response = await apiRequest('/api/admin/attendance/pending-review', 'GET');
      return response.json();
    },
  });



  // Department statistics
  const { data: departmentStats = [] } = useQuery({
    queryKey: ['/api/attendance/department-stats', selectedDate.toISOString().split('T')[0]],
    enabled: !!user,
    queryFn: async () => {
      const dateParam = selectedDate.toISOString().split('T')[0];
      const response = await apiRequest(`/api/attendance/department-stats?date=${dateParam}`, 'GET');
      return response.json();
    },
  });

  // Update attendance mutation
  const updateAttendanceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const sanitized = sanitizeFormData(data, ['notes', 'remarks', 'reason']);
      const response = await apiRequest(`/api/attendance/${id}`, 'PATCH', sanitized);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/attendance'] });
      refetchLive();
      refetchDaily();
      setShowEditModal(false);
      toast({
        title: "Success",
        description: "Attendance record updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update attendance record",
        variant: "destructive",
      });
    },
  });

  // Review attendance mutation (Phase 3)
  const reviewAttendanceMutation = useMutation({
    mutationFn: async ({ id, action, checkInTime, checkOutTime, notes }: {
      id: string;
      action: 'accepted' | 'adjusted' | 'rejected';
      checkInTime?: string;
      checkOutTime?: string;
      notes?: string;
    }) => {
      const response = await apiRequest(`/api/admin/attendance/${id}/review`, 'POST', {
        action,
        checkInTime,
        checkOutTime,
        notes
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/attendance/pending-review'] });
      queryClient.invalidateQueries({ queryKey: ['/api/attendance'] });
      refetchReviews();
      refetchDaily();
      setShowReviewModal(false);
      toast({
        title: "Review Processed",
        description: "Attendance record has been updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Review Failed",
        description: error.message || "Failed to process review",
        variant: "destructive",
      });
    },
  });

  // Enhanced bulk actions mutation with undo capabilities
  const bulkActionMutation = useMutation({
    mutationFn: async ({ action, attendanceIds, data }: {
      action: string;
      attendanceIds: string[];
      data?: any
    }) => {
      return await callWithOfflineHandling(
        async () => {
          const response = await apiRequest('/api/attendance/bulk-action', 'POST', { action, attendanceIds, data });
          return response.json();
        },
        async () => {
          const response = await apiRequest('/api/attendance/bulk-action', 'POST', { action, attendanceIds, data });
          return response.json();
        }
      );
    },
    onSuccess: (result, variables) => {
      const { action, attendanceIds } = variables;

      // Add undo action for bulk operations
      if (action === 'approve' || action === 'reject' || action === 'update_status') {
        addAction({
          description: `${getUserFriendlyMessage(action, 'attendance')} ${attendanceIds.length} attendance records`,
          undoFunction: async () => {
            await apiRequest('/api/attendance/bulk-undo', 'POST', {
              actionId: result.actionId,
              attendanceIds
            });
            queryClient.invalidateQueries({ queryKey: ['/api/attendance'] });
            refetchLive();
            refetchDaily();
          },
          affectedCount: attendanceIds.length,
          category: 'attendance',
          canUndo: true
        });
      }

      queryClient.invalidateQueries({ queryKey: ['/api/attendance'] });
      refetchLive();
      refetchDaily();
      toast({
        title: "Changes applied successfully",
        description: `Updated ${attendanceIds.length} attendance records`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Unable to make changes",
        description: getUserFriendlyMessage(error.message || "Failed to update attendance records", 'errors'),
        variant: "destructive",
      });
    },
  });

  // Test auto-checkout mutation (admin only, for testing)
  const testAutoCheckoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/test/run-auto-checkout', 'POST');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/attendance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/attendance/pending-review'] });
      refetchLive();
      refetchDaily();
      toast({
        title: "Auto-Checkout Completed",
        description: data.message || "Auto-checkout job processed successfully. Check Pending Review tab.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Auto-Checkout Failed",
        description: error.message || "Failed to run auto-checkout job",
        variant: "destructive",
      });
    },
  });

  // Manual OT Sync mutation (admin only)
  const syncOTMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/test/run-ot-auto-close', 'POST');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ot/sessions/pending'] });
      refetchOT();
      toast({
        title: "OT Sessions Synced",
        description: data.message || "Manual OT auto-close check completed. Check the list below.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "OT Sync Failed",
        description: error.message || "Failed to sync OT sessions",
        variant: "destructive",
      });
    },
  });


  // Helper function to check if record is incomplete (missing checkout)
  const isIncompleteRecord = (record: any) => {
    // Record is incomplete if there's check-in but no check-out time
    // Also check for empty strings and null values
    return record.checkInTime &&
      record.checkInTime !== '' &&
      (!record.checkOutTime || record.checkOutTime === '');
  };

  // Helper function to get suggested checkout time for department
  const getSuggestedCheckoutTime = (record: any) => {
    if (!record.userDepartment) return "6:00 PM";

    // Get department closing time (default to 6:00 PM)
    const departmentClosingTimes = {
      'technical': '6:00 PM',
      'marketing': '6:00 PM',
      'admin': '5:30 PM',
      'hr': '5:30 PM',
      'sales': '7:00 PM'
    };

    return departmentClosingTimes[record.userDepartment as keyof typeof departmentClosingTimes] || "6:00 PM";
  };

  // Filter attendance records
  const filteredDailyAttendance = dailyAttendance.filter((record: any) => {
    const matchesSearch = !searchQuery ||
      record.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.userEmail?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDepartment = selectedDepartment === "all" ||
      record.userDepartment === selectedDepartment;

    const matchesStatus = selectedStatus === "all" || record.status === selectedStatus;

    return matchesSearch && matchesDepartment && matchesStatus;
  });

  // CRITICAL FIX: Incomplete records for Pending Review tab should show ALL pending,
  // regardless of date filter, so admins see everything that needs review
  const allIncompleteRecords = dailyAttendance.filter((record: any) =>
    isIncompleteRecord(record) && !record.autoCorrected
  );

  // Separate incomplete records for easy identification (filtered by date for other views)
  // Option 2: Exclude auto-corrected records from incomplete list
  const incompleteRecords = filteredDailyAttendance.filter((record: any) =>
    isIncompleteRecord(record) && !record.autoCorrected
  );
  const completeRecords = filteredDailyAttendance.filter((record: any) => !isIncompleteRecord(record));

  // Pending review count
  const pendingReviewCount = Array.isArray(pendingReviews) ? pendingReviews.length : 0;

  // Calculate KPI metrics from filtered data
  const kpiMetrics = {
    totalPresent: filteredDailyAttendance.filter((r: any) => r.status === 'present' || r.status === 'late').length,
    totalAbsent: filteredDailyAttendance.filter((r: any) => r.status === 'absent').length,
    totalLate: filteredDailyAttendance.filter((r: any) => r.status === 'late').length,
    totalIncomplete: incompleteRecords.length,
  };

  // Generate real trend data from daily attendance records
  const trendData = useMemo(() => {
    const today = new Date();
    const data = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const dateKey = date.toISOString().split('T')[0];

      // Count actual attendance records for this date
      const recordsForDate = dailyAttendance.filter((record: any) => {
        const recordDate = new Date(record.date).toISOString().split('T')[0];
        return recordDate === dateKey;
      });

      data.push({
        date: dateStr,
        present: recordsForDate.filter((r: any) => r.status === 'present').length,
        late: recordsForDate.filter((r: any) => r.status === 'late').length,
        absent: recordsForDate.filter((r: any) => r.status === 'absent').length,
      });
    }
    return data;
  }, [dailyAttendance]);

  // Use real department stats data from the API
  const departmentData = useMemo(() => {
    // Use the departmentStats from the API query result
    if (departmentStats && departmentStats.length > 0) {
      return departmentStats.map((dept: any) => ({
        department: dept.department.charAt(0).toUpperCase() + dept.department.slice(1),
        count: dept.present + dept.absent + dept.late,
      }));
    }

    // Fallback: Calculate from daily attendance if department stats aren't available
    const deptCounts: { [key: string]: number } = {};
    dailyAttendance.forEach((record: any) => {
      const dept = record.userDepartment || 'Unknown';
      deptCounts[dept] = (deptCounts[dept] || 0) + 1;
    });

    return Object.entries(deptCounts).map(([department, count]) => ({
      department: department.charAt(0).toUpperCase() + department.slice(1),
      count,
    }));
  }, [departmentStats, dailyAttendance]);

  // Get unique departments for filter
  const uniqueDepartments = Array.from(new Set(
    dailyAttendance
      .map((r: any) => r.userDepartment)
      .filter(Boolean)
  )) as string[];

  // Date presets for command bar
  const datePresets = [
    { label: 'Today', value: 'today', onClick: () => handleDatePreset('today') },
    { label: 'Yesterday', value: 'yesterday', onClick: () => handleDatePreset('yesterday') },
    { label: 'This Week', value: 'this_week', onClick: () => handleDatePreset('this_week') },
    { label: 'Last Week', value: 'last_week', onClick: () => handleDatePreset('last_week') },
  ];

  // Handle fix all incomplete records
  const handleFixAllIncomplete = () => {
    incompleteRecords.forEach((record: any) => handleQuickFixCheckout(record));
  };

  // Debug logging for incomplete records (only when there are incomplete records)
  if (incompleteRecords.length > 0) {
    console.log('🚨 Found incomplete records:', {
      count: incompleteRecords.length,
      records: incompleteRecords.map((r: any) => ({
        name: r.userName,
        department: r.userDepartment,
        checkIn: r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString() : 'None',
        missingCheckout: !r.checkOutTime
      }))
    });
  }

  // Filter live attendance - Fix TypeScript error
  const filteredLiveAttendance = (Array.isArray(liveAttendance) ? liveAttendance : []).filter((record: any) => {
    const matchesSearch = !searchQuery ||
      record.userName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDepartment = selectedDepartment === "all" ||
      record.userDepartment === selectedDepartment;

    return matchesSearch && matchesDepartment;
  });

  // Handle edit attendance - Enhanced for forgotten checkouts
  const handleEditAttendance = (record: any) => {
    const isIncomplete = isIncompleteRecord(record);
    const suggestedCheckout = isIncomplete ? getSuggestedCheckoutTime(record) : '';

    setEditingAttendance(record);
    setEditForm({
      checkInTime: record.checkInTime ?
        (typeof record.checkInTime === 'string' ?
          new Date(record.checkInTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) :
          record.checkInTime) : '',
      checkOutTime: record.checkOutTime ?
        (typeof record.checkOutTime === 'string' ?
          new Date(record.checkOutTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) :
          record.checkOutTime) : suggestedCheckout,
      status: record.status || 'present',
      overtimeHours: record.overtimeHours || 0,
      remarks: record.remarks || (isIncomplete ? 'Checkout time corrected by admin - forgotten checkout detected' : '')
    });
    setShowEditModal(true);
  };

  // Quick fix for incomplete checkout
  const handleQuickFixCheckout = (record: any) => {
    const suggestedTime = getSuggestedCheckoutTime(record);
    const checkOutDate = new Date(record.date);

    // Parse suggested time (e.g., "6:00 PM")
    const timeMatch = suggestedTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (timeMatch) {
      let [, hours, minutes, period] = timeMatch;
      let hour24 = parseInt(hours);
      if (period.toUpperCase() === 'PM' && hour24 !== 12) hour24 += 12;
      if (period.toUpperCase() === 'AM' && hour24 === 12) hour24 = 0;
      checkOutDate.setHours(hour24, parseInt(minutes), 0, 0);
    }

    const updateData = {
      checkOutTime: checkOutDate.toISOString(),
      status: 'present',
      remarks: `Auto-corrected checkout at department closing time (${suggestedTime}) by admin`,
      approvedBy: user?.uid
    };

    updateAttendanceMutation.mutate({
      id: record.id,
      data: updateData
    });
  };

  // Handle save edit
  const handleSaveEdit = () => {
    if (!editingAttendance) return;

    const updateData: any = {
      status: editForm.status,
      overtimeHours: editForm.overtimeHours,
      remarks: editForm.remarks,
      approvedBy: user?.uid
    };

    // Convert times to full datetime if provided
    if (editForm.checkInTime) {
      const checkInDate = new Date(editingAttendance.date);
      // Parse 12-hour format properly
      const timeMatch = editForm.checkInTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (timeMatch) {
        let [, hours, minutes, period] = timeMatch;
        let hour24 = parseInt(hours);
        if (period.toUpperCase() === 'PM' && hour24 !== 12) hour24 += 12;
        if (period.toUpperCase() === 'AM' && hour24 === 12) hour24 = 0;
        checkInDate.setHours(hour24, parseInt(minutes), 0, 0);
        updateData.checkInTime = checkInDate.toISOString();
      }
    }

    if (editForm.checkOutTime) {
      const checkOutDate = new Date(editingAttendance.date);
      // Parse 12-hour format properly
      const timeMatch = editForm.checkOutTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (timeMatch) {
        let [, hours, minutes, period] = timeMatch;
        let hour24 = parseInt(hours);
        if (period.toUpperCase() === 'PM' && hour24 !== 12) hour24 += 12;
        if (period.toUpperCase() === 'AM' && hour24 === 12) hour24 = 0;
        checkOutDate.setHours(hour24, parseInt(minutes), 0, 0);
        updateData.checkOutTime = checkOutDate.toISOString();
      }
    }

    updateAttendanceMutation.mutate({
      id: editingAttendance.id,
      data: updateData
    });
  };

  // Helper to convert 12-hour time to ISO (Phase 3)
  const convertTimeToISO = (dateStr: string, timeStr: string) => {
    const date = new Date(dateStr);
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (timeMatch) {
      let [, hours, minutes, period] = timeMatch;
      let hour24 = parseInt(hours);
      if (period.toUpperCase() === 'PM' && hour24 !== 12) hour24 += 12;
      if (period.toUpperCase() === 'AM' && hour24 === 12) hour24 = 0;
      date.setHours(hour24, parseInt(minutes), 0, 0);
      return date.toISOString();
    }
    return new Date().toISOString(); // Fallback
  };

  // Open review modal (Phase 3)
  const handleOpenReview = (record: any) => {
    setReviewingRecord(record);
    setReviewForm({
      action: 'accepted',
      checkInTime: record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '',
      checkOutTime: record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '',
      notes: ''
    });
    setShowReviewModal(true);
  };

  // Submit review decision (Phase 3)
  const handleSubmitReview = () => {
    if (!reviewingRecord) return;

    const reviewData: any = {
      action: reviewForm.action as 'accepted' | 'adjusted' | 'rejected',
      notes: reviewForm.notes
    };

    // Only include times if action is 'adjusted'
    if (reviewForm.action === 'adjusted') {
      if (!reviewForm.checkInTime || !reviewForm.checkOutTime) {
        toast({
          title: "Missing Times",
          description: "Please provide both check-in and check-out times for adjustments",
          variant: "destructive",
        });
        return;
      }

      // Convert to ISO format
      const dateStr = new Date(reviewingRecord.date).toISOString().split('T')[0];
      reviewData.checkInTime = convertTimeToISO(dateStr, reviewForm.checkInTime);
      reviewData.checkOutTime = convertTimeToISO(dateStr, reviewForm.checkOutTime);
    }

    reviewAttendanceMutation.mutate({
      id: reviewingRecord.id,
      ...reviewData
    });
  };

  // Handle export to Excel
  const handleExportAttendance = () => {
    try {
      // Prepare data for export
      const exportData = filteredDailyAttendance.map((record: any) => ({
        'Employee Name': record.userName || 'N/A',
        'Email': record.userEmail || 'N/A',
        'Department': record.userDepartment || 'N/A',
        'Designation': record.userDesignation || 'N/A',
        'Date': formatDate(new Date(record.date)),
        'Check In': record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : 'Not Checked In',
        'Check Out': record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : 'Not Checked Out',
        'Working Hours': record.workingHours ? `${record.workingHours.toFixed(1)}h` : '0h',
        'Overtime Hours': record.overtimeHours ? `${record.overtimeHours.toFixed(1)}h` : '0h',
        'Status': record.status || 'Unknown',
        'Late Minutes': record.lateMinutes || 0,
        'Attendance Type': record.attendanceType === 'field_work' ? 'Field Work' :
          record.attendanceType === 'remote' ? 'Remote Work' : 'Office',
        'Customer Name': record.customerName || '',
        'Location': record.location || '',
        'Remarks': record.remarks || ''
      }));

      // Create workbook and worksheet
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(exportData);

      // Auto-size columns
      const columnWidths = [
        { wch: 20 }, // Employee Name
        { wch: 25 }, // Email
        { wch: 15 }, // Department
        { wch: 15 }, // Designation
        { wch: 12 }, // Date
        { wch: 12 }, // Check In
        { wch: 12 }, // Check Out
        { wch: 12 }, // Working Hours
        { wch: 12 }, // Overtime Hours
        { wch: 10 }, // Status
        { wch: 10 }, // Late Minutes
        { wch: 15 }, // Attendance Type
        { wch: 20 }, // Customer Name
        { wch: 30 }, // Location
        { wch: 30 }  // Remarks
      ];
      worksheet['!cols'] = columnWidths;

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance Report");

      // Generate filename with date
      const fileName = `attendance-report-${formatDate(selectedDate)}.xlsx`;

      // Write and download file
      XLSX.writeFile(workbook, fileName);

      toast({
        title: "Export Successful",
        description: `Attendance report exported as ${fileName}`,
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: "Unable to export attendance data. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Handle view details modal
  const handleViewDetails = (record: any) => {
    setSelectedAttendanceRecord(record);
    setShowDetailsModal(true);
  };

  // Calculate total time for an attendance record
  const calculateTotalTime = (record: any) => {
    if (!record.checkInTime || !record.checkOutTime) return 0;
    const checkIn = new Date(record.checkInTime);
    const checkOut = new Date(record.checkOutTime);
    return Math.max(0, (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60)); // Hours
  };

  // Enhanced status badge with incomplete detection
  const getStatusBadge = (record: any) => {
    const status = record?.status;
    const isIncomplete = isIncompleteRecord(record);

    // Handle incomplete records (missing checkout)
    if (isIncomplete) {
      return (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 animate-pulse">
            <AlertCircle className="h-3 w-3 mr-1" />
            Incomplete
          </Badge>
        </div>
      );
    }

    // Handle null/undefined status values
    if (!status) {
      return (
        <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-200">
          Unknown
        </Badge>
      );
    }

    const styles = {
      present: "bg-green-100 text-green-800 border-green-200",
      absent: "bg-red-100 text-red-800 border-red-200",
      late: "bg-orange-100 text-orange-800 border-orange-200",
      leave: "bg-yellow-100 text-yellow-800 border-yellow-200",
      holiday: "bg-blue-100 text-blue-800 border-blue-200",
      half_day: "bg-purple-100 text-purple-800 border-purple-200"
    };

    return (
      <Badge
        variant="outline"
        className={cn(
          "font-medium capitalize border",
          styles[status as keyof typeof styles] || "bg-gray-100 text-gray-800 border-gray-200"
        )}
        style={{
          backgroundColor: status === 'present' ? '#dcfce7' :
            status === 'absent' ? '#fee2e2' :
              status === 'late' ? '#fed7aa' :
                status === 'leave' ? '#fef3c7' :
                  status === 'holiday' ? '#dbeafe' :
                    status === 'half_day' ? '#e9d5ff' : '#f3f4f6',
          color: status === 'present' ? '#166534' :
            status === 'absent' ? '#991b1b' :
              status === 'late' ? '#c2410c' :
                status === 'leave' ? '#a16207' :
                  status === 'holiday' ? '#1e40af' :
                    status === 'half_day' ? '#7c3aed' : '#374151'
        }}
      >
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  // Check if user is master admin
  if (user?.role !== "master_admin") {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold">Access Denied</h3>
          <p className="text-gray-500">Only master administrators can access attendance management.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Page Header */}
      <div className="bg-white dark:bg-gray-800 border-b px-4 md:px-6 py-4 md:py-6">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
              Attendance Management
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm md:text-base mt-1">
              Enterprise-grade attendance tracking and management system
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={handleExportAttendance}
              variant="outline"
              className="gap-2"
              data-testid="button-export"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
            </Button>

            <Link href="/attendance-reports">
              <Button
                variant="outline"
                className="gap-2 w-full sm:w-auto"
                data-testid="link-reports"
              >
                <TrendingUp className="h-4 w-4" />
                <span className="hidden sm:inline">Reports</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-4 md:p-6 space-y-6">
        {/* Exception Alert */}
        <ExceptionAlert
          incompleteCount={incompleteRecords.length}
          onFixAll={handleFixAllIncomplete}
          onViewCorrections={() => setActiveTab("corrections")}
          isFixing={updateAttendanceMutation.isPending}
        />

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6 lg:w-auto lg:flex">
            <TabsTrigger value="dashboard" className="gap-2 text-xs sm:text-sm" data-testid="tab-dashboard">
              <BarChart className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
              <span className="sm:hidden">Stats</span>
            </TabsTrigger>
            <TabsTrigger value="live" className="gap-2 text-xs sm:text-sm" data-testid="tab-live">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              <span className="hidden sm:inline">Live</span>
              <span className="sm:hidden">Live</span>
            </TabsTrigger>
            <TabsTrigger value="live-ot" className="gap-2 text-xs sm:text-sm" data-testid="tab-live-ot">
              <div className="h-2 w-2 bg-orange-500 rounded-full animate-pulse" />
              <span className="hidden sm:inline">Live OT</span>
              <span className="sm:hidden">OT</span>
              {activeOTSessions.length > 0 && (
                <Badge className="ml-1 px-1 py-0 text-xs bg-orange-100 text-orange-700 border-orange-300">
                  {activeOTSessions.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="daily" className="gap-2 text-xs sm:text-sm" data-testid="tab-daily">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Attendance Records</span>
              <span className="sm:hidden">Records</span>
              {incompleteRecords.length > 0 && (
                <Badge variant="destructive" className="ml-1 px-1 py-0 text-xs">
                  {incompleteRecords.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="corrections" className="flex items-center gap-2 text-xs sm:text-sm">
              <Edit className="h-4 w-4" />
              <span className="hidden sm:inline">Corrections</span>
              <span className="sm:hidden">Fix</span>
              {allIncompleteRecords.length > 0 && (
                <Badge variant="destructive" className="ml-1 px-1 py-0 text-xs">
                  {allIncompleteRecords.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="pending-review" className="flex items-center gap-2 text-xs sm:text-sm">
              <AlertCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Pending Review</span>
              <span className="sm:hidden">Review</span>
              {pendingReviewCount > 0 && (
                <Badge variant="outline" className="ml-1 px-1 py-0 text-xs bg-amber-100 text-amber-700 border-amber-300">
                  {pendingReviewCount}
                </Badge>
              )}
            </TabsTrigger>
            {(user?.role === 'master_admin' || user?.role === 'admin') && (
              <TabsTrigger value="ot-pending" className="flex items-center gap-2 text-xs sm:text-sm">
                <Clock className="h-4 w-4" />
                <span className="hidden sm:inline">OT Pending</span>
                <span className="sm:hidden">OT</span>
                {pendingOTSessions.length > 0 && (
                  <Badge variant="outline" className="ml-1 px-1 py-0 text-xs bg-orange-100 text-orange-700 border-orange-300">
                    {pendingOTSessions.length}
                  </Badge>
                )}
              </TabsTrigger>
            )}
          </TabsList>

          {/* Filters - Show only on tabs that need filtering */}
          {(activeTab === "live" || activeTab === "live-ot" || activeTab === "daily" || activeTab === "corrections") && (
            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search employees..."
                  className="pl-10 text-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept.charAt(0).toUpperCase() + dept.slice(1).replace('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {activeTab === "daily" && (
                <>
                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger className="w-full sm:w-32">
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="present">Present</SelectItem>
                      <SelectItem value="absent">Absent</SelectItem>
                      <SelectItem value="late">Late</SelectItem>
                      <SelectItem value="leave">Leave</SelectItem>
                      <SelectItem value="holiday">Holiday</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-gray-50 w-full sm:w-auto">
                    <CalendarIcon className="h-4 w-4 text-gray-500 flex-shrink-0" />
                    <span className="text-sm font-medium flex-1 sm:flex-none">{formatDate(selectedDate)}</span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const newDate = new Date(selectedDate);
                          newDate.setDate(selectedDate.getDate() - 1);
                          setSelectedDate(newDate);
                        }}
                        className="h-6 w-6 p-0"
                        aria-label="Previous day"
                      >
                        ←
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedDate(new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000))}
                        className="h-6 w-6 p-0"
                      >
                        →
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Dashboard Tab - New Professional Overview */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* KPI Cards */}
            <KPICards
              totalPresent={kpiMetrics.totalPresent}
              totalAbsent={kpiMetrics.totalAbsent}
              totalLate={kpiMetrics.totalLate}
              totalIncomplete={kpiMetrics.totalIncomplete}
            />

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
              <AttendanceTrendChart data={trendData} />
              <DepartmentBreakdownChart data={departmentData} />
            </div>

            {/* Department Stats Quick View */}
            {departmentStats.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Department Summary
                  </CardTitle>
                  <CardDescription>Real-time attendance status by department</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {departmentStats.map((dept: any) => (
                      <Card key={dept.department} className="border-2">
                        <CardContent className="p-4">
                          <div className="space-y-3">
                            <h3 className="font-semibold text-base capitalize">{dept.department}</h3>
                            <div className="flex justify-between items-center">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <div className="h-2 w-2 bg-green-500 rounded-full" />
                                  <span className="text-sm text-gray-600 dark:text-gray-400">Present:</span>
                                  <span className="font-semibold text-green-600">{dept.present}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="h-2 w-2 bg-red-500 rounded-full" />
                                  <span className="text-sm text-gray-600 dark:text-gray-400">Absent:</span>
                                  <span className="font-semibold text-red-600">{dept.absent}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="h-2 w-2 bg-amber-500 rounded-full" />
                                  <span className="text-sm text-gray-600 dark:text-gray-400">Late:</span>
                                  <span className="font-semibold text-amber-600">{dept.late}</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-2xl font-bold">{dept.present + dept.absent + dept.late}</div>
                                <div className="text-xs text-gray-500">Total</div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Live Tracking Tab */}
          <TabsContent value="live" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
                  <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
                  Live Attendance Tracking
                </CardTitle>
                <CardDescription className="text-sm">
                  Real-time monitoring of employee check-ins and check-outs
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingLive ? (
                  <div className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    <p className="text-muted-foreground mt-2">Loading live data...</p>
                  </div>
                ) : filteredLiveAttendance.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <UserCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No active attendance records found</p>
                  </div>
                ) : (
                  <>
                    {/* Mobile Card View */}
                    <div className="block md:hidden space-y-4">
                      {filteredLiveAttendance.map((record: any) => (
                        <Card key={record.id} className="border shadow-sm">
                          <CardContent className="p-4">
                            <div className="space-y-3">
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-medium text-base">{record.userName}</p>
                                  <Badge variant="outline" className="text-xs mt-1">
                                    {record.userDepartment?.toUpperCase() || 'N/A'}
                                  </Badge>
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleEditAttendance(record)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  {record.checkInImageUrl && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setPhotoViewerRecord(record);
                                        setShowPhotoViewer(true);
                                      }}
                                      title="View Photos"
                                    >
                                      <Camera className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <p className="text-muted-foreground">Check In</p>
                                  <p className="font-medium mt-1">
                                    {record.checkInTime ? <TimeDisplay time={record.checkInTime} format12Hour={true} /> : '-'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Location</p>
                                  <p className="font-medium mt-1 capitalize">{record.location || 'office'}</p>
                                </div>
                              </div>

                              <div className="pt-2 border-t">
                                {getStatusBadge(record)}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Employee</TableHead>
                            <TableHead>Department</TableHead>
                            <TableHead>Check In</TableHead>
                            <TableHead>Location</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredLiveAttendance.map((record: any) => (
                            <TableRow key={record.id}>
                              <TableCell className="font-medium">
                                {record.userName}
                              </TableCell>
                              <TableCell className="capitalize">
                                {record.userDepartment || 'N/A'}
                              </TableCell>
                              <TableCell>
                                {record.checkInTime ? <TimeDisplay time={record.checkInTime} format12Hour={true} /> : '-'}
                              </TableCell>
                              <TableCell className="capitalize">
                                {record.location || 'office'}
                              </TableCell>
                              <TableCell>
                                {getStatusBadge(record)}
                              </TableCell>
                              <TableCell>
                                <div className="flex space-x-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleEditAttendance(record)}
                                  >
                                    <Edit className="h-3 w-3" />
                                  </Button>
                                  {record.checkInImageUrl && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setPhotoViewerRecord(record);
                                        setShowPhotoViewer(true);
                                      }}
                                      title="View Photos"
                                    >
                                      <Camera className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Daily Records Tab */}
          <TabsContent value="daily" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg md:text-xl">Attendance Records - {formatDate(selectedDate)}</CardTitle>
                <CardDescription className="text-sm">
                  Comprehensive view of all employee attendance for the selected date
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingDaily ? (
                  <div className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    <p className="text-muted-foreground mt-2">Loading attendance data...</p>
                  </div>
                ) : filteredDailyAttendance.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No attendance records found for this date</p>
                  </div>
                ) : (
                  <>
                    {/* Mobile Card View */}
                    <div className="block md:hidden space-y-4">
                      {filteredDailyAttendance.map((record: any) => (
                        <Card key={record.id} className={`border shadow-sm ${isIncompleteRecord(record) ? 'border-amber-300 bg-amber-50/30' : ''}`}>
                          <CardContent className="p-4">
                            <div className="space-y-3">
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-medium text-base">{record.userName}</p>
                                  <p className="text-sm text-muted-foreground">{record.userEmail}</p>
                                  <Badge variant="outline" className="text-xs mt-1">
                                    {record.userDepartment?.toUpperCase() || 'N/A'}
                                  </Badge>
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleEditAttendance(record)}
                                    title="Edit Attendance"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  {record.checkInImageUrl && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setPhotoViewerRecord(record);
                                        setShowPhotoViewer(true);
                                      }}
                                      title="View Photos"
                                    >
                                      <Camera className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <p className="text-muted-foreground">Check In</p>
                                  <p className="font-medium mt-1">
                                    {record.checkInTime ? <TimeDisplay time={record.checkInTime} format12Hour={true} /> : '-'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Check Out</p>
                                  <p className="font-medium mt-1">
                                    {record.checkOutTime ? (
                                      <TimeDisplay time={record.checkOutTime} format12Hour={true} />
                                    ) : (
                                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                                        Missing
                                      </Badge>
                                    )}
                                  </p>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <p className="text-muted-foreground">Working Hours</p>
                                  <p className="font-medium mt-1">
                                    {record.workingHours ? (
                                      <div className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {record.workingHours.toFixed(1)}h
                                      </div>
                                    ) : '-'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Overtime</p>
                                  <p className="font-medium mt-1">
                                    {record.overtimeHours && record.overtimeHours > 0 ? (
                                      <Badge variant="secondary" className="text-xs">
                                        {record.overtimeHours.toFixed(1)}h OT
                                      </Badge>
                                    ) : '-'}
                                  </p>
                                </div>
                              </div>

                              <div className="pt-2 border-t">
                                {getStatusBadge(record)}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Employee</TableHead>
                            <TableHead>Department</TableHead>
                            <TableHead>Check In</TableHead>
                            <TableHead>Check Out</TableHead>
                            <TableHead>Working Hours</TableHead>
                            <TableHead>Overtime</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredDailyAttendance.map((record: any) => (
                            <TableRow key={record.id} className={isIncompleteRecord(record) ? "bg-amber-50/30" : ""}>
                              <TableCell className="font-medium">
                                <div>
                                  <div>{record.userName}</div>
                                  <div className="text-xs text-gray-500">{record.userEmail}</div>
                                </div>
                              </TableCell>
                              <TableCell className="capitalize">
                                {record.userDepartment || 'N/A'}
                              </TableCell>
                              <TableCell>
                                {record.checkInTime ? <TimeDisplay time={record.checkInTime} format12Hour={true} /> : '-'}
                              </TableCell>
                              <TableCell>
                                {record.checkOutTime ? <TimeDisplay time={record.checkOutTime} format12Hour={true} /> : '-'}
                              </TableCell>
                              <TableCell>
                                {record.workingHours ? `${record.workingHours.toFixed(1)}h` : '-'}
                              </TableCell>
                              <TableCell>
                                {record.overtimeHours ? `${record.overtimeHours.toFixed(1)}h` : '-'}
                              </TableCell>
                              <TableCell>
                                {getStatusBadge(record)}
                              </TableCell>
                              <TableCell>
                                <div className="flex space-x-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleEditAttendance(record)}
                                    title="Edit Attendance"
                                  >
                                    <Edit className="h-3 w-3" />
                                  </Button>
                                  {record.checkInImageUrl && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setPhotoViewerRecord(record);
                                        setShowPhotoViewer(true);
                                      }}
                                      title="View Photos"
                                    >
                                      <Camera className="h-3 w-3" />
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleViewDetails(record)}
                                    title="View Details"
                                  >
                                    <Eye className="h-3 w-3" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Live OT Sessions Tab */}
          <TabsContent value="live-ot" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
                      <div className="h-3 w-3 bg-orange-500 rounded-full animate-pulse" />
                      Live OT Sessions
                    </CardTitle>
                    <CardDescription className="text-sm mt-1">
                      Real-time monitoring of employees currently doing overtime • Updates every 30 seconds
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-sm bg-orange-50 border-orange-200">
                    {activeOTSessions.length} Active
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingLiveOT ? (
                  <div className="text-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-orange-500" />
                    <p className="text-muted-foreground mt-3">Loading active OT sessions...</p>
                  </div>
                ) : activeOTSessions.length === 0 ? (
                  <div className="text-center py-16 text-gray-500">
                    <Clock className="h-16 w-16 mx-auto mb-4 opacity-30 text-orange-500" />
                    <p className="text-lg font-medium mb-2">No Active OT Sessions</p>
                    <p className="text-sm text-gray-400">
                      Employees doing overtime will appear here in real-time
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>OT Type</TableHead>
                          <TableHead>Started</TableHead>
                          <TableHead className="text-right">Duration</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeOTSessions.map((session: any) => (
                          <TableRow key={session.sessionId}>
                            <TableCell className="font-medium">
                              <div>
                                <div className="font-medium">{session.userName}</div>
                                <div className="text-xs text-gray-500">
                                  {session.userDesignation || 'N/A'}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {session.userDepartment || 'N/A'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={cn(
                                  "text-xs font-medium",
                                  session.otType === 'early_arrival' && "bg-blue-100 text-blue-700 border-blue-300",
                                  session.otType === 'late_departure' && "bg-purple-100 text-purple-700 border-purple-300",
                                  session.otType === 'weekend' && "bg-orange-100 text-orange-700 border-orange-300",
                                  session.otType === 'holiday' && "bg-red-100 text-red-700 border-red-300"
                                )}
                                variant="outline"
                              >
                                {session.otType?.replace('_', ' ') || 'N/A'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {new Date(session.startTime).toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                              })}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="font-mono font-bold text-orange-600 text-lg">
                                {session.currentDuration.toFixed(1)}h
                              </div>
                              <div className="text-xs text-gray-500">
                                {Math.floor(session.currentDuration * 60)}m
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge className="bg-green-500 text-white font-medium">
                                🟢 Active
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>



          {/* Corrections Tab - Now includes incomplete records */}
          <TabsContent value="corrections" className="space-y-4">
            {/* Incomplete Records Section */}
            {incompleteRecords.length > 0 && (
              <Card className="border-amber-200 bg-amber-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-amber-800">
                    <AlertCircle className="h-5 w-5" />
                    Incomplete Records - Urgent Action Required
                  </CardTitle>
                  <CardDescription className="text-amber-700">
                    {allIncompleteRecords.length} employee(s) forgot to check out. Showing ALL pending reviews regardless of date filter.
                    These records need immediate correction to maintain data accuracy.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 flex justify-between items-center">
                    <p className="text-sm text-amber-700">
                      Click "Quick Fix" to use department closing times, or "Edit" for custom times.
                    </p>
                    <Button
                      size="sm"
                      onClick={() => {
                        allIncompleteRecords.forEach((record: any) => handleQuickFixCheckout(record));
                      }}
                      disabled={updateAttendanceMutation.isPending}
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      {updateAttendanceMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Clock className="h-4 w-4 mr-2" />
                      )}
                      Quick Fix All
                    </Button>
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Check In</TableHead>
                          <TableHead>Missing Checkout</TableHead>
                          <TableHead>Suggested Time</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allIncompleteRecords.map((record: any) => (
                          <TableRow key={record.id} className="bg-amber-50/30">
                            <TableCell className="font-medium">
                              <div>
                                <div>{record.userName}</div>
                                <div className="text-xs text-gray-500">{record.userEmail}</div>
                              </div>
                            </TableCell>
                            <TableCell className="capitalize">
                              {record.userDepartment || 'N/A'}
                            </TableCell>
                            <TableCell>
                              <TimeDisplay time={record.checkInTime} format12Hour={true} />
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                                <XCircle className="h-3 w-3 mr-1" />
                                Missing
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                <Clock className="h-3 w-3 mr-1" />
                                {getSuggestedCheckoutTime(record)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex space-x-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleQuickFixCheckout(record)}
                                  disabled={updateAttendanceMutation.isPending}
                                  className="border-green-300 text-green-700 hover:bg-green-100"
                                  title="Quick fix with suggested time"
                                >
                                  <Clock className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEditAttendance(record)}
                                  className="border-blue-300 text-blue-700 hover:bg-blue-100"
                                  title="Edit with custom time"
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* General Corrections Section */}
            <Card>
              <CardHeader>
                <CardTitle>General Attendance Corrections</CardTitle>
                <CardDescription>
                  All attendance records for selected date range - Edit any record as needed
                </CardDescription>
              </CardHeader>
              <CardContent>
                {filteredDailyAttendance.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Check In</TableHead>
                          <TableHead>Check Out</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredDailyAttendance.map((record: any) => (
                          <TableRow key={record.id} className={isIncompleteRecord(record) ? "bg-amber-50/30" : ""}>
                            <TableCell className="font-medium">
                              <div>
                                <div>{record.userName}</div>
                                <div className="text-xs text-gray-500">{record.userEmail}</div>
                              </div>
                            </TableCell>
                            <TableCell className="capitalize">
                              {record.userDepartment || 'N/A'}
                            </TableCell>
                            <TableCell>
                              {record.checkInTime ? (
                                <TimeDisplay time={record.checkInTime} format12Hour={true} />
                              ) : (
                                <Badge variant="outline" className="bg-gray-50 text-gray-500">No check-in</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {record.checkOutTime ? (
                                <TimeDisplay time={record.checkOutTime} format12Hour={true} />
                              ) : (
                                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Missing
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={record.status === 'present' ? 'default' : record.status === 'absent' ? 'destructive' : 'secondary'}>
                                {record.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEditAttendance(record)}
                                className="border-blue-300 text-blue-700 hover:bg-blue-100"
                              >
                                <Edit className="h-3 w-3 mr-1" />
                                Edit
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No attendance records found for selected date range</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pending Review Tab (Phase 3) */}
          <TabsContent value="pending-review" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  Pending Admin Review
                </CardTitle>
                <CardDescription>
                  Auto-corrected attendance records requiring admin approval
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingReviews ? (
                  <div className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    <p className="text-muted-foreground mt-2">Loading pending reviews...</p>
                  </div>
                ) : pendingReviews.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50 text-green-500" />
                    <p>No pending reviews at this time</p>
                    <p className="text-sm mt-2 text-gray-400">All auto-corrections have been processed</p>
                  </div>
                ) : (
                  <>
                    {/* Mobile Card View */}
                    <div className="block md:hidden space-y-4">
                      {pendingReviews.map((record: any) => (
                        <Card key={record.id} className="border-l-4 border-l-amber-500">
                          <CardContent className="p-4">
                            <div className="space-y-3">
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-medium">{record.userName}</p>
                                  <Badge variant="outline" className="mt-1 capitalize">
                                    {record.userDepartment || 'N/A'}
                                  </Badge>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => handleOpenReview(record)}
                                  className="bg-amber-600 hover:bg-amber-700"
                                >
                                  <Eye className="h-3 w-3 mr-1" />
                                  Review
                                </Button>
                              </div>

                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                  <p className="text-muted-foreground">Date</p>
                                  <p className="font-medium">{formatDate(new Date(record.date))}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Auto-Corrected</p>
                                  <p className="font-medium text-amber-700">
                                    {new Date(record.autoCorrectedAt).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>

                              <div className="pt-2 border-t">
                                <p className="text-xs text-gray-600">Reason:</p>
                                <p className="text-sm text-amber-700 line-clamp-2">{record.autoCorrectionReason}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Employee</TableHead>
                            <TableHead>Department</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Check-In</TableHead>
                            <TableHead>Auto Check-Out</TableHead>
                            <TableHead>Corrected At</TableHead>
                            <TableHead>Reason</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pendingReviews.map((record: any) => (
                            <TableRow key={record.id} className="hover:bg-amber-50">
                              <TableCell className="font-medium">{record.userName}</TableCell>
                              <TableCell className="capitalize">{record.userDepartment || 'N/A'}</TableCell>
                              <TableCell>{formatDate(new Date(record.date))}</TableCell>
                              <TableCell>
                                {record.checkInTime ? <TimeDisplay time={record.checkInTime} format12Hour={true} /> : 'N/A'}
                              </TableCell>
                              <TableCell className="text-amber-700 font-medium">
                                {record.checkOutTime ? <TimeDisplay time={record.checkOutTime} format12Hour={true} /> : 'N/A'}
                              </TableCell>
                              <TableCell className="text-sm">
                                {new Date(record.autoCorrectedAt).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="max-w-xs">
                                <div className="truncate" title={record.autoCorrectionReason}>
                                  {record.autoCorrectionReason}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setPhotoViewerRecord(record);
                                      setShowPhotoViewer(true);
                                    }}
                                    title="View check-in/checkout photos"
                                  >
                                    <Camera className="h-3 w-3 mr-1" />
                                    Photos
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => handleOpenReview(record)}
                                    className="bg-amber-600 hover:bg-amber-700"
                                  >
                                    <Eye className="h-3 w-3 mr-1" />
                                    Review
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* OT Pending Review Tab */}
          <TabsContent value="ot-pending" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div className="space-y-1.5">
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    OT Pending Review
                  </CardTitle>
                  <CardDescription>
                    Review and approve overtime sessions requiring verification
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncOTMutation.mutate()}
                  disabled={syncOTMutation.isPending}
                  className="gap-2"
                >
                  {syncOTMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Sync OT Sessions
                </Button>
              </CardHeader>
              <CardContent>
                {isLoadingOT ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  </div>
                ) : pendingOTSessions.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500 opacity-50" />
                    <p className="text-lg font-medium">All Clear!</p>
                    <p className="text-sm mt-2">No pending OT sessions requiring review</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Start Time</TableHead>
                        <TableHead>End Time</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingOTSessions.map((session: any) => (
                        <TableRow key={session.sessionId}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {session.userName}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{session.userDepartment}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {new Date(session.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                          </TableCell>
                          <TableCell>
                            {new Date(session.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                          </TableCell>
                          <TableCell>
                            {session.endTime ?
                              new Date(session.endTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) :
                              <span className="text-gray-400 italic">Auto-closed</span>
                            }
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {calculateOTHours(session).toFixed(2)}h  {/* ✅ FIX: Calculate from timestamps */}
                          </TableCell>
                          <TableCell>
                            {session.autoClosedAt ? (
                              <Badge variant="destructive" className="gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Auto-Closed
                              </Badge>
                            ) : calculateOTHours(session) > 5 ? (
                              <Badge variant="outline" className="gap-1">
                                <Clock className="h-3 w-3" />
                                Exceeds Limit
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Pending</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              onClick={() => handleOTReview(session)}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Review
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </div>

      {/* Edit Attendance Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingAttendance && isIncompleteRecord(editingAttendance) ? (
                <>
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  Fix Incomplete Record
                </>
              ) : (
                <>
                  <Edit className="h-5 w-5" />
                  Edit Attendance Record
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {editingAttendance && isIncompleteRecord(editingAttendance) ? (
                'Complete missing attendance information'
              ) : (
                'Modify attendance details and working hours'
              )}
            </DialogDescription>
          </DialogHeader>

          {editingAttendance && (
            <div className="space-y-4">
              {/* Employee Info Card */}
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <Label className="text-gray-600">Employee</Label>
                      <p className="font-semibold">{editingAttendance.userName}</p>
                    </div>
                    <div>
                      <Label className="text-gray-600">Department</Label>
                      <p className="font-semibold capitalize">{editingAttendance.userDepartment || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-gray-600">Date</Label>
                      <p className="font-semibold">{formatDate(new Date(editingAttendance.date))}</p>
                    </div>
                    <div>
                      <Label className="text-gray-600">Status</Label>
                      <div className="mt-1">
                        {isIncompleteRecord(editingAttendance) ? (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                            Incomplete
                          </Badge>
                        ) : (
                          getStatusBadge(editingAttendance)
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Timing Card */}
              <Card className={editingAttendance && isIncompleteRecord(editingAttendance) ? "bg-amber-50 border-amber-200" : ""}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Attendance Times
                  </CardTitle>
                  {editingAttendance && isIncompleteRecord(editingAttendance) && (
                    <CardDescription className="text-amber-700">
                      Missing checkout detected. Suggested time: {getSuggestedCheckoutTime(editingAttendance)} (department closing)
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="pt-0 space-y-4">
                  <TimeInput
                    label="Check-In Time"
                    value={editForm.checkInTime}
                    onChange={(value) => setEditForm({ ...editForm, checkInTime: value })}
                    placeholder="9:00 AM"
                  />
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Label className="text-sm font-medium">
                        Check-Out Time
                      </Label>
                      {editingAttendance && isIncompleteRecord(editingAttendance) && (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                          Missing
                        </Badge>
                      )}
                    </div>
                    <TimeInput
                      value={editForm.checkOutTime}
                      onChange={(value) => setEditForm({ ...editForm, checkOutTime: value })}
                      placeholder={editingAttendance && isIncompleteRecord(editingAttendance) ? getSuggestedCheckoutTime(editingAttendance) : "6:00 PM"}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Additional Details Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Additional Details</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-4">
                  <div>
                    <Label htmlFor="status">Status</Label>
                    <Select value={editForm.status} onValueChange={(value) => setEditForm({ ...editForm, status: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="present">Present</SelectItem>
                        <SelectItem value="absent">Absent</SelectItem>
                        <SelectItem value="late">Late</SelectItem>
                        <SelectItem value="leave">Leave</SelectItem>
                        <SelectItem value="holiday">Holiday</SelectItem>
                        <SelectItem value="half_day">Half Day</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="overtimeHours">Overtime Hours</Label>
                    <Input
                      id="overtimeHours"
                      type="number"
                      step="0.5"
                      min="0"
                      value={editForm.overtimeHours}
                      onChange={(e) => setEditForm({ ...editForm, overtimeHours: parseFloat(e.target.value) || 0 })}
                    />
                  </div>

                  <div>
                    <Label htmlFor="remarks">Remarks</Label>
                    <Textarea
                      id="remarks"
                      placeholder="Add remarks or notes..."
                      value={editForm.remarks}
                      onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateAttendanceMutation.isPending}
            >
              {updateAttendanceMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Modal (Phase 3) */}
      <Dialog open={showReviewModal} onOpenChange={setShowReviewModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              Review Auto-Corrected Attendance
            </DialogTitle>
            <DialogDescription>
              Review and approve, adjust, or reject the auto-checkout for this employee
            </DialogDescription>
          </DialogHeader>

          {reviewingRecord && (
            <div className="space-y-4">
              {/* Employee Info */}
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <Label className="text-gray-600">Employee</Label>
                      <p className="font-semibold">{reviewingRecord.userName}</p>
                    </div>
                    <div>
                      <Label className="text-gray-600">Department</Label>
                      <p className="font-semibold capitalize">{reviewingRecord.userDepartment || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-gray-600">Date</Label>
                      <p className="font-semibold">{formatDate(new Date(reviewingRecord.date))}</p>
                    </div>
                    <div>
                      <Label className="text-gray-600">Auto-Correction Reason</Label>
                      <p className="text-amber-700 text-sm">{reviewingRecord.autoCorrectionReason}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Auto-Corrected Times */}
              <Card className="bg-amber-50 border-amber-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Auto-Corrected Times
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <Label>Check-In</Label>
                      <p className="font-semibold">
                        {reviewingRecord.checkInTime ? <TimeDisplay time={reviewingRecord.checkInTime} format12Hour={true} /> : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label>Check-Out (Auto)</Label>
                      <p className="font-semibold text-amber-700">
                        {reviewingRecord.checkOutTime ? <TimeDisplay time={reviewingRecord.checkOutTime} format12Hour={true} /> : 'N/A'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Action Selection */}
              <div className="space-y-4">
                <Label>Admin Decision</Label>
                <Select value={reviewForm.action} onValueChange={(value) => setReviewForm({ ...reviewForm, action: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="accepted">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        Accept Auto-Correction
                      </div>
                    </SelectItem>
                    <SelectItem value="adjusted">
                      <div className="flex items-center gap-2">
                        <Edit className="h-4 w-4 text-blue-600" />
                        Adjust Times
                      </div>
                    </SelectItem>
                    <SelectItem value="rejected">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-red-600" />
                        Reject & Mark Absent
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Time Adjustment Fields (shown when action is 'adjusted') */}
              {reviewForm.action === 'adjusted' && (
                <div className="grid grid-cols-2 gap-4">
                  <TimeInput
                    label="Adjusted Check-In Time"
                    value={reviewForm.checkInTime}
                    onChange={(value) => setReviewForm({ ...reviewForm, checkInTime: value })}
                    placeholder="9:00 AM"
                  />
                  <TimeInput
                    label="Adjusted Check-Out Time"
                    value={reviewForm.checkOutTime}
                    onChange={(value) => setReviewForm({ ...reviewForm, checkOutTime: value })}
                    placeholder="6:00 PM"
                  />
                </div>
              )}

              {/* Admin Notes */}
              <div>
                <Label>Admin Notes (Optional)</Label>
                <Textarea
                  placeholder="Add any notes about this review decision..."
                  value={reviewForm.notes}
                  onChange={(e) => setReviewForm({ ...reviewForm, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReviewModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitReview}
              disabled={reviewAttendanceMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {reviewAttendanceMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>Submit Review</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attendance Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-4xl h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Attendance Record Details
            </DialogTitle>
            <DialogDescription>
              {selectedAttendanceRecord && `Complete details for ${selectedAttendanceRecord.userName} on ${formatDate(new Date(selectedAttendanceRecord.date))}`}
            </DialogDescription>
          </DialogHeader>

          {selectedAttendanceRecord && (
            <div className="space-y-6">
              {/* Employee Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Employee Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs text-gray-500 uppercase tracking-wide">Employee Name</Label>
                      <p className="font-medium">{selectedAttendanceRecord.userName}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500 uppercase tracking-wide">Email</Label>
                      <p className="font-medium">{selectedAttendanceRecord.userEmail || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500 uppercase tracking-wide">Department</Label>
                      <p className="font-medium capitalize">{selectedAttendanceRecord.userDepartment || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500 uppercase tracking-wide">Designation</Label>
                      <p className="font-medium capitalize">{selectedAttendanceRecord.userDesignation || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500 uppercase tracking-wide">Date</Label>
                      <p className="font-medium">{formatDate(new Date(selectedAttendanceRecord.date))}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Attendance Timing */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Attendance Timing</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <Label className="text-xs text-gray-500 uppercase tracking-wide">Check In Time</Label>
                      <p className="font-medium">
                        {selectedAttendanceRecord.checkInTime ? (
                          <TimeDisplay time={selectedAttendanceRecord.checkInTime} format12Hour={true} />
                        ) : (
                          <Badge variant="outline" className="bg-red-50 text-red-700">Not Checked In</Badge>
                        )}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500 uppercase tracking-wide">Check Out Time</Label>
                      <p className="font-medium">
                        {selectedAttendanceRecord.checkOutTime ? (
                          <TimeDisplay time={selectedAttendanceRecord.checkOutTime} format12Hour={true} />
                        ) : (
                          <Badge variant="outline" className="bg-red-50 text-red-700">Not Checked Out</Badge>
                        )}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500 uppercase tracking-wide">Working Hours</Label>
                      <p className="font-medium">
                        {selectedAttendanceRecord.workingHours ?
                          `${selectedAttendanceRecord.workingHours.toFixed(1)}h` :
                          `${calculateTotalTime(selectedAttendanceRecord).toFixed(1)}h`
                        }
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500 uppercase tracking-wide">Overtime Hours</Label>
                      <p className="font-medium">
                        {selectedAttendanceRecord.overtimeHours ?
                          `${selectedAttendanceRecord.overtimeHours.toFixed(1)}h` : '0h'
                        }
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <div>
                      <Label className="text-xs text-gray-500 uppercase tracking-wide">Status</Label>
                      <div className="mt-1">
                        {getStatusBadge(selectedAttendanceRecord)}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500 uppercase tracking-wide">Late Minutes</Label>
                      <p className="font-medium">
                        {selectedAttendanceRecord.lateMinutes ?
                          `${selectedAttendanceRecord.lateMinutes} minutes` : 'On Time'
                        }
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* OT Session History - For Transparency */}
              {selectedAttendanceRecord.otSessions && selectedAttendanceRecord.otSessions.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Overtime Sessions (History)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {selectedAttendanceRecord.otSessions.map((session: any, index: number) => (
                        <div key={session.id || index} className="border rounded-md p-3 bg-slate-50">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <div className="font-medium text-sm">Session #{index + 1}</div>
                              <div className="text-xs text-gray-500">
                                {new Date(session.startTime).toLocaleTimeString()} - {session.endTime ? new Date(session.endTime).toLocaleTimeString() : 'In Progress'}
                              </div>
                            </div>
                            <Badge variant={
                              session.status === 'APPROVED' ? 'default' :
                                session.status === 'REJECTED' ? 'destructive' :
                                  session.status === 'ordered' ? 'outline' : 'secondary' // 'ordered' looks like pending?
                            } className={
                              session.status === 'PENDING_REVIEW' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                                session.status === 'APPROVED' ? 'bg-green-100 text-green-800 border-green-200' : ''
                            }>
                              {session.status === 'PENDING_REVIEW' ? 'Pending Review' : session.status}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-gray-500 text-xs">Recorded Hours:</span>
                              <span className="ml-2 font-medium">{session.otHours?.toFixed(2) || 0}h</span>
                            </div>
                            {session.status === 'APPROVED' && session.adjustedOTHours !== undefined && (
                              <div>
                                <span className="text-gray-500 text-xs">Paid Hours:</span>
                                <span className="ml-2 font-bold text-green-700">{session.adjustedOTHours.toFixed(2)}h</span>
                              </div>
                            )}
                          </div>

                          {(session.reviewNotes || session.autoClosedNote) && (
                            <div className="mt-2 text-xs bg-white p-2 rounded border">
                              {session.reviewNotes && (
                                <div className="text-red-600 font-medium">
                                  Admin Note: {session.reviewNotes}
                                </div>
                              )}
                              {session.autoClosedNote && (
                                <div className="text-orange-600 mt-1">
                                  System: {session.autoClosedNote}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Additional Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Additional Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-gray-500 uppercase tracking-wide">Reason/Notes</Label>
                      <p className="font-medium">{selectedAttendanceRecord.reason || selectedAttendanceRecord.remarks || 'No additional notes'}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500 uppercase tracking-wide">Record ID</Label>
                      <p className="font-medium text-xs">{selectedAttendanceRecord.id}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <DialogFooter className="sticky bottom-0 bg-white border-t pt-4">
            <Button
              variant="outline"
              onClick={() => selectedAttendanceRecord && handleEditAttendance(selectedAttendanceRecord)}
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit Record
            </Button>
            <Button onClick={() => setShowDetailsModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attendance Policies Modal */}
      <Dialog open={showPolicyModal} onOpenChange={setShowPolicyModal}>
        <DialogContent className="max-w-3xl h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Attendance Policies & Settings
            </DialogTitle>
            <DialogDescription>
              Configure attendance policies, working hours, and system settings
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Current Policies */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Active Policies</CardTitle>
              </CardHeader>
              <CardContent>
                {attendancePolicies.length > 0 ? (
                  <div className="space-y-4">
                    {attendancePolicies.map((policy: any) => (
                      <div key={policy.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <h4 className="font-medium">{policy.name}</h4>
                          <p className="text-sm text-gray-600">{policy.description}</p>
                          {policy.rules && (
                            <div className="mt-2 text-xs text-gray-500">
                              <span className="font-medium">Rules:</span> {Object.keys(policy.rules).length} configured
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={policy.isActive ? "default" : "secondary"}>
                            {policy.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <Button variant="outline" size="sm">
                            <Edit className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Settings className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No attendance policies configured</p>
                    <Button className="mt-4" size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Create First Policy
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Department Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Department Working Hours</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {departments.map((dept) => (
                    <div key={dept} className="p-4 border rounded-lg">
                      <h4 className="font-medium capitalize mb-2">{dept}</h4>
                      <div className="text-sm space-y-1">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Check-in:</span>
                          <span className="font-medium">9:00 AM</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Check-out:</span>
                          <span className="font-medium">6:00 PM</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Working Hours:</span>
                          <span className="font-medium">8 hours</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Break Time:</span>
                          <span className="font-medium">1 hour</span>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="w-full mt-3">
                        <Edit className="h-3 w-3 mr-2" />
                        Modify
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* General Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">General Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Late Arrival Threshold</h4>
                      <p className="text-sm text-gray-600">Grace period before marking as late</p>
                    </div>
                    <div className="text-right">
                      <span className="font-medium">15 minutes</span>
                      <Button variant="outline" size="sm" className="ml-2">
                        <Edit className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Overtime Threshold</h4>
                      <p className="text-sm text-gray-600">Minimum overtime hours to qualify</p>
                    </div>
                    <div className="text-right">
                      <span className="font-medium">30 minutes</span>
                      <Button variant="outline" size="sm" className="ml-2">
                        <Edit className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Photo Verification</h4>
                      <p className="text-sm text-gray-600">Require photos for attendance</p>
                    </div>
                    <div className="text-right">
                      <Badge variant="default">Enabled</Badge>
                      <Button variant="outline" size="sm" className="ml-2">
                        <Edit className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Location Verification</h4>
                      <p className="text-sm text-gray-600">GPS-based attendance validation</p>
                    </div>
                    <div className="text-right">
                      <Badge variant="default">Enabled</Badge>
                      <Button variant="outline" size="sm" className="ml-2">
                        <Edit className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Button variant="outline" className="justify-start">
                    <Plus className="h-4 w-4 mr-2" />
                    Create New Policy
                  </Button>
                  <Button variant="outline" className="justify-start">
                    <Download className="h-4 w-4 mr-2" />
                    Export Settings
                  </Button>
                  <Button variant="outline" className="justify-start">
                    <Upload className="h-4 w-4 mr-2" />
                    Import Settings
                  </Button>
                  <Button variant="outline" className="justify-start">
                    <Settings className="h-4 w-4 mr-2" />
                    Advanced Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <DialogFooter className="sticky bottom-0 bg-white border-t pt-4">
            <Button variant="outline" onClick={() => setShowPolicyModal(false)}>
              Close
            </Button>
            <Button>
              <CheckCircle className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OT Review Modal (Zero-Fraud) */}
      <Dialog open={showOTReviewModal} onOpenChange={setShowOTReviewModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review OT Session</DialogTitle>
            <DialogDescription>
              Approve, adjust, or reject this overtime claim
            </DialogDescription>
          </DialogHeader>

          {selectedOTSession && (
            <div className="space-y-4">
              {/* Session Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Session Details</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Employee:</span>
                    <p className="font-medium">{selectedOTSession.userName}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Department:</span>
                    <p className="font-medium">{selectedOTSession.userDepartment}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Date:</span>
                    <p className="font-medium">{new Date(selectedOTSession.date).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Hours Claimed:</span>
                    <p className="font-mono font-bold text-lg">{selectedOTSession.otHours?.toFixed(2)}h</p>
                  </div>
                  {selectedOTSession.autoClosedAt && (
                    <div className="col-span-2">
                      <Badge variant="destructive" className="gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Auto-Closed: {selectedOTSession.autoClosedNote}
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Review Action */}
              <div className="space-y-4">
                <div>
                  <Label>Action</Label>
                  <Select value={otReviewAction} onValueChange={(v: any) => setOTReviewAction(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="APPROVED">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          Approve - Accept as is
                        </div>
                      </SelectItem>
                      <SelectItem value="ADJUSTED">
                        <div className="flex items-center gap-2">
                          <Edit className="h-4 w-4 text-orange-500" />
                          Adjust - Change hours
                        </div>
                      </SelectItem>
                      <SelectItem value="REJECTED">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-red-500" />
                          Reject - Deny claim
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {otReviewAction === 'ADJUSTED' && (
                  <div>
                    <Label>Adjusted Hours</Label>
                    <Input
                      type="number"
                      step="0.25"
                      min="0"
                      max="12"
                      value={otAdjustedHours}
                      onChange={(e) => setOTAdjustedHours(e.target.value)}
                      placeholder="Enter corrected hours"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Original: {selectedOTSession.otHours?.toFixed(2)}h
                    </p>
                  </div>
                )}

                <div>
                  <Label>Notes (Optional)</Label>
                  <Textarea
                    value={otReviewNotes}
                    onChange={(e) => setOTReviewNotes(e.target.value)}
                    placeholder="Add any notes about this review decision..."
                    rows={3}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowOTReviewModal(false)}
              disabled={otReviewMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitOTReview}
              disabled={otReviewMutation.isPending}
            >
              {otReviewMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {otReviewAction === 'APPROVED' && <CheckCircle className="h-4 w-4 mr-2" />}
              {otReviewAction === 'ADJUSTED' && <Edit className="h-4 w-4 mr-2" />}
              {otReviewAction === 'REJECTED' && <XCircle className="h-4 w-4 mr-2" />}
              Confirm {otReviewAction.charAt(0) + otReviewAction.slice(1).toLowerCase()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attendance Photo Viewer */}
      {
        photoViewerRecord && (
          <AttendancePhotoViewer
            isOpen={showPhotoViewer}
            onClose={() => {
              setShowPhotoViewer(false);
              setPhotoViewerRecord(null);
            }}
            attendanceRecord={photoViewerRecord}
          />
        )
      }

      {/* Undo Manager */}
      <UndoManager
        actions={actions}
        onUndo={executeUndo}
        onClear={clearActions}
      />
    </div >
  );
}
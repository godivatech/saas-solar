import React, { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import * as XLSX from 'xlsx';
import { LocationDisplay } from "@/components/attendance/location-display";
import { AttendancePhotoViewer } from "@/components/attendance/attendance-photo-viewer";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Badge
} from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { 
  CalendarIcon, Search, Loader2, FileText, BarChart, UserCheck, Clock, 
  Download, Users, CheckCircle, XCircle, AlertCircle, MapPin, Camera, User, TrendingUp
} from "lucide-react";

import { formatDate } from "@/lib/utils";
import { TimeDisplay } from "@/components/time/time-display";
import { DateRangePicker } from "@/components/ui/date-picker";

// Status Badge Component
const StatusBadge = ({ status }: { status: string }) => {
  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'present': return 'bg-green-100 text-green-800 border-green-200';
      case 'absent': return 'bg-red-100 text-red-800 border-red-200';
      case 'late': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'half_day': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'early_checkout': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <Badge className={`${getStatusColor(status)} font-medium`}>
      {status?.replace('_', ' ') || 'Unknown'}
    </Badge>
  );
};

export default function AttendanceReports() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // State for filtering - Default to last 7 days (weekly)
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>(() => {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    return {
      from: sevenDaysAgo,
      to: today
    };
  });
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Photo viewer modal state
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);

  const handleViewPhotos = (record: any) => {
    setSelectedRecord(record);
    setShowPhotoViewer(true);
  };

  const handleClosePhotoViewer = () => {
    setShowPhotoViewer(false);
    setSelectedRecord(null);
  };
  const itemsPerPage = 10;

  // Range attendance records - Enhanced for date range and person filtering
  const { data: rangeAttendance = [], isLoading: isLoadingRange, error: rangeError, refetch: refetchRange } = useQuery({
    queryKey: ['/api/attendance/range', { 
      from: dateRange.from?.toISOString().split('T')[0], 
      to: dateRange.to?.toISOString().split('T')[0],
      userId: selectedEmployee !== "all" ? selectedEmployee : undefined,
      department: selectedDepartment !== "all" ? selectedDepartment : undefined
    }],
    enabled: !!user && !!dateRange.from && !!dateRange.to,
    queryFn: async () => {
      const params = new URLSearchParams();
      
      // Ensure proper date formatting for API
      if (dateRange.from) {
        const fromDate = new Date(dateRange.from);
        fromDate.setHours(0, 0, 0, 0); // Start of day
        params.append('from', fromDate.toISOString().split('T')[0]);
      }
      if (dateRange.to) {
        const toDate = new Date(dateRange.to);
        toDate.setHours(23, 59, 59, 999); // End of day  
        params.append('to', toDate.toISOString().split('T')[0]);
      }
      if (selectedEmployee !== "all") params.append('userId', selectedEmployee);
      if (selectedDepartment !== "all") params.append('department', selectedDepartment);
      
      console.log('📅 Fetching attendance data:', {
        from: dateRange.from?.toISOString().split('T')[0],
        to: dateRange.to?.toISOString().split('T')[0],
        employee: selectedEmployee !== "all" ? selectedEmployee : 'all',
        department: selectedDepartment !== "all" ? selectedDepartment : 'all',
        url: `/api/attendance/range?${params.toString()}`
      });
      
      const response = await apiRequest(`/api/attendance/range?${params}`, 'GET');
      const data = await response.json();
      
      console.log('📊 Received attendance data:', {
        count: data?.length || 0,
        sample: data?.slice(0, 2) || []
      });
      
      return data || [];
    },
  });

  // All users for employee dropdown
  const { data: allUsers = [] } = useQuery({
    queryKey: ['/api/users'],
    enabled: !!user,
    queryFn: async () => {
      const response = await apiRequest('/api/users', 'GET');
      return response.json();
    },
  });

  // Department statistics - use single date for stats
  const { data: departmentStats = [] } = useQuery({
    queryKey: ['/api/attendance/department-stats', dateRange.from?.toISOString().split('T')[0]],
    enabled: !!user && !!dateRange.from,
    queryFn: async () => {
      const dateParam = dateRange.from?.toISOString().split('T')[0];
      const response = await apiRequest(`/api/attendance/department-stats?date=${dateParam}`, 'GET');
      return response.json();
    },
  });

  // Filter attendance records
  const filteredRangeAttendance = rangeAttendance.filter((record: any) => {
    if (selectedStatus !== "all" && record.status !== selectedStatus) return false;
    return true;
  });

  // Sort attendance records by date (latest first)
  const sortedRangeAttendance = [...filteredRangeAttendance].sort((a: any, b: any) => {
    // Convert date strings to Date objects for comparison
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    
    // Sort in descending order (latest first)
    return dateB.getTime() - dateA.getTime();
  });
  
  // Pagination calculations
  const totalPages = Math.ceil(sortedRangeAttendance.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedAttendance = sortedRangeAttendance.slice(startIndex, endIndex);
  
  // Reset to first page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [selectedEmployee, selectedDepartment, selectedStatus, dateRange]);
  
  // Helper function to format location data
  const formatLocation = (record: any) => {
    // Check for check-in location data (stored as flat fields)
    if (record.checkInLatitude && record.checkInLongitude) {
      return {
        text: `Location: ${parseFloat(record.checkInLatitude).toFixed(4)}, ${parseFloat(record.checkInLongitude).toFixed(4)}`,
        type: 'coordinates',
        coords: `${record.checkInLatitude}, ${record.checkInLongitude}`,
        latitude: record.checkInLatitude,
        longitude: record.checkInLongitude
      };
    }
    
    // Fallback to checkout location if check-in not available
    if (record.checkOutLatitude && record.checkOutLongitude) {
      return {
        text: `Location: ${parseFloat(record.checkOutLatitude).toFixed(4)}, ${parseFloat(record.checkOutLongitude).toFixed(4)}`,
        type: 'coordinates',
        coords: `${record.checkOutLatitude}, ${record.checkOutLongitude}`,
        latitude: record.checkOutLatitude,
        longitude: record.checkOutLongitude
      };
    }
    
    return null;
  };

  // Function to get readable address from coordinates
  const [addressCache, setAddressCache] = React.useState<Map<string, string>>(new Map());
  
  const getReadableAddress = React.useCallback(async (latitude: string, longitude: string) => {
    const coordKey = `${latitude},${longitude}`;
    
    // Check cache first
    if (addressCache.has(coordKey)) {
      return addressCache.get(coordKey);
    }
    
    try {
      const response = await apiRequest(`/api/reverse-geocode?latitude=${latitude}&longitude=${longitude}`, 'GET');
      const data = await response.json();
      
      if (data.success && data.address) {
        setAddressCache(prev => new Map(prev).set(coordKey, data.address));
        return data.address;
      }
    } catch (error) {
      console.error('Error getting readable address:', error);
    }
    
    return `${parseFloat(latitude).toFixed(4)}, ${parseFloat(longitude).toFixed(4)}`;
  }, [addressCache]);

  // Helper function to check if a record is incomplete
  const isIncompleteRecord = (record: any) => {
    return !record.checkOutTime && record.checkInTime;
  };

  // Export functionality
  const handleExportExcel = () => {
    try {
      const dateRangeStr = dateRange.from && dateRange.to ? 
        `${formatDate(dateRange.from)}-to-${formatDate(dateRange.to)}` : 
        formatDate(new Date());
      
      // Add filter info to filename
      let fileName = `attendance-report-${dateRangeStr}`;
      if (selectedEmployee !== "all") {
        const employeeName = allUsers.find((u: any) => u.id === selectedEmployee)?.displayName || "employee";
        fileName += `-${employeeName.replace(/\s+/g, '-').toLowerCase()}`;
      }
      if (selectedDepartment !== "all") {
        fileName += `-${selectedDepartment}`;
      }
      fileName += '.xlsx';

      const exportData = filteredRangeAttendance.map((record: any) => ({
        'Employee Name': record.userName || `User #${record.userId}`,
        'Department': record.userDepartment || 'Unknown',
        'Date': formatDate(new Date(record.date)),
        'Check In Time': record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString('en-US', { hour12: true }) : 'Not recorded',
        'Check Out Time': record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString('en-US', { hour12: true }) : 'Not recorded',
        'Working Hours': record.workingHours ? `${record.workingHours.toFixed(2)}` : '0.00',
        'Overtime Hours': record.overtimeHours ? `${record.overtimeHours.toFixed(2)}` : '0.00',
        'Status': record.status || 'Unknown',
        'Has Photo': record.checkInPhoto ? 'Yes' : 'No',
        'Has Location': record.checkInLocation ? 'Yes' : 'No',
        'Check In Location': record.checkInLocation ? 
          `${record.checkInLocation.latitude}, ${record.checkInLocation.longitude}` : 'Not recorded',
        'Check Out Location': record.checkOutLocation ? 
          `${record.checkOutLocation.latitude}, ${record.checkOutLocation.longitude}` : 'Not recorded'
      }));

      // Add summary sheet
      const summaryData = [
        { 'Filter': 'Date Range', 'Value': `${dateRange.from?.toLocaleDateString()} to ${dateRange.to?.toLocaleDateString()}` },
        { 'Filter': 'Employee', 'Value': selectedEmployee === "all" ? 'All Employees' : allUsers.find((u: any) => u.id === selectedEmployee)?.displayName || 'Unknown' },
        { 'Filter': 'Department', 'Value': selectedDepartment === "all" ? 'All Departments' : selectedDepartment },
        { 'Filter': 'Status', 'Value': selectedStatus === "all" ? 'All Statuses' : selectedStatus },
        { 'Filter': 'Total Records', 'Value': filteredRangeAttendance.length.toString() },
        { 'Filter': 'Export Date', 'Value': new Date().toLocaleString() }
      ];

      const wb = XLSX.utils.book_new();
      
      // Add summary sheet
      const summaryWs = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Export Summary');
      
      // Add attendance data sheet
      const dataWs = XLSX.utils.json_to_sheet(exportData);
      XLSX.utils.book_append_sheet(wb, dataWs, 'Attendance Data');
      
      XLSX.writeFile(wb, fileName);
      
      console.log(`Exported ${exportData.length} records to ${fileName}`);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    }
  };

  // Get unique departments for filtering
  const availableDepartments = Array.from(new Set(
    allUsers.map((user: any) => user.department).filter((dept: string) => Boolean(dept))
  )) as string[];

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto p-2 sm:p-4 space-y-4 sm:space-y-6 max-w-7xl">
      {/* Header - Mobile First */}
      <div className="space-y-3 sm:space-y-4">
        <div className="text-center sm:text-left">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">Attendance Reports</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">Advanced filtering and analytics</p>
        </div>
        
        {/* Action Buttons - Mobile First */}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-2">
          <Button 
            onClick={handleExportExcel}
            disabled={filteredRangeAttendance.length === 0}
            className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 w-full sm:w-auto text-sm"
            size="sm"
          >
            <Download className="h-4 w-4" />
            <span className="hidden xs:inline">Export</span>
            <span className="xs:hidden">Export</span>
            <span className="text-xs">({filteredRangeAttendance.length})</span>
          </Button>
          
          <Button
            variant="outline"
            onClick={() => {
              setSelectedEmployee("all");
              setSelectedDepartment("all");
              setSelectedStatus("all");
              const today = new Date();
              const sevenDaysAgo = new Date(today);
              sevenDaysAgo.setDate(today.getDate() - 7);
              setDateRange({ from: sevenDaysAgo, to: today });
              refetchRange();
            }}
            className="flex items-center justify-center gap-2 w-full sm:w-auto text-sm"
            size="sm"
          >
            <Search className="h-4 w-4" />
            Clear Filters
          </Button>
          
          <Button
            variant="outline"
            onClick={() => refetchRange()}
            disabled={isLoadingRange}
            className="flex items-center justify-center gap-2 w-full sm:w-auto text-sm"
            size="sm"
          >
            {isLoadingRange ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <TrendingUp className="h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3 sm:pb-6">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Search className="h-4 w-4 sm:h-5 sm:w-5" />
            Filters
          </CardTitle>
          <CardDescription className="text-sm">
            Enterprise filtering with advanced presets
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Mobile: Stack all filters vertically, Desktop: Grid layout */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
              {/* Employee Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Employee</Label>
                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All Employees" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Employees</SelectItem>
                    {allUsers.map((user: any) => (
                      <SelectItem key={user.id} value={user.id}>
                        <span className="truncate">{user.displayName}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Department Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Department</Label>
                <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All Departments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {availableDepartments.map((dept: string) => (
                      <SelectItem key={dept} value={dept}>
                        {dept.charAt(0).toUpperCase() + dept.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Status</Label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="present">Present</SelectItem>
                    <SelectItem value="absent">Absent</SelectItem>
                    <SelectItem value="late">Late</SelectItem>
                    <SelectItem value="half_day">Half Day</SelectItem>
                    <SelectItem value="early_checkout">Early Checkout</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date Range - Enterprise Level */}
              <div className="space-y-2 sm:col-span-2 lg:col-span-2 xl:col-span-1">
                <Label className="text-sm font-medium">Date Range</Label>
                <DateRangePicker 
                  dateRange={dateRange}
                  setDateRange={setDateRange}
                  className="w-full"
                  placeholder="Select period"
                  maxRange={365}
                  maxDate={new Date()}
                  showPresets={true}
                  onError={(error) => {
                    console.error('Date range error:', error);
                  }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Statistics - Mobile First */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-blue-100 rounded-lg">
                <Users className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-lg sm:text-2xl font-bold truncate">{filteredRangeAttendance.length}</p>
                <p className="text-xs sm:text-sm text-gray-600 truncate">Total Records</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-green-100 rounded-lg">
                <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
              </div>
              <div className="min-w-0">
                <p className="text-lg sm:text-2xl font-bold text-green-600 truncate">
                  {filteredRangeAttendance.filter((r: any) => r.status === 'present').length}
                </p>
                <p className="text-xs sm:text-sm text-gray-600 truncate">Present</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-red-100 rounded-lg">
                <XCircle className="h-4 w-4 sm:h-5 sm:w-5 text-red-600" />
              </div>
              <div className="min-w-0">
                <p className="text-lg sm:text-2xl font-bold text-red-600 truncate">
                  {filteredRangeAttendance.filter((r: any) => isIncompleteRecord(r)).length}
                </p>
                <p className="text-xs sm:text-sm text-gray-600 truncate">Incomplete</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-orange-100 rounded-lg">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600" />
              </div>
              <div className="min-w-0">
                <p className="text-lg sm:text-2xl font-bold text-orange-600 truncate">
                  {filteredRangeAttendance.reduce((sum: number, r: any) => sum + (r.overtimeHours || 0), 0).toFixed(1)}h
                </p>
                <p className="text-xs sm:text-sm text-gray-600 truncate">Total OT</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Employee-specific analytics when individual selected - Mobile First */}
      {selectedEmployee !== "all" && (
        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <User className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="truncate">
                Employee Analytics - {allUsers.find((u: any) => u.id === selectedEmployee)?.displayName || "Unknown"}
              </span>
            </CardTitle>
            <CardDescription className="text-sm">
              Individual performance metrics for selected period
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-blue-50 p-3 sm:p-4 rounded-lg">
                <div className="text-lg sm:text-2xl font-bold text-blue-600">{filteredRangeAttendance.length}</div>
                <div className="text-xs sm:text-sm text-blue-600">Total Days</div>
              </div>
              <div className="bg-green-50 p-3 sm:p-4 rounded-lg">
                <div className="text-lg sm:text-2xl font-bold text-green-600">
                  {filteredRangeAttendance.filter((r: any) => !isIncompleteRecord(r)).length}
                </div>
                <div className="text-xs sm:text-sm text-green-600">Complete Days</div>
              </div>
              <div className="bg-amber-50 p-3 sm:p-4 rounded-lg">
                <div className="text-lg sm:text-2xl font-bold text-amber-600">
                  {filteredRangeAttendance.filter((r: any) => r.status === 'half_day').length}
                </div>
                <div className="text-xs sm:text-sm text-amber-600">Half Days</div>
              </div>
              <div className="bg-purple-50 p-3 sm:p-4 rounded-lg">
                <div className="text-lg sm:text-2xl font-bold text-purple-600">
                  {filteredRangeAttendance.reduce((sum: number, r: any) => sum + (r.workingHours || 0), 0).toFixed(1)}h
                </div>
                <div className="text-xs sm:text-sm text-purple-600">Total Hours</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Records Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg md:text-xl">
            Attendance Records
            {(selectedEmployee !== "all" || selectedDepartment !== "all" || selectedStatus !== "all") && (
              <span className="text-sm font-normal text-gray-500 ml-2">
                ({dateRange.from && dateRange.to ? 
                  `${formatDate(dateRange.from)} to ${formatDate(dateRange.to)}` : 'Filtered'})
              </span>
            )}
          </CardTitle>
          <CardDescription>
            {sortedRangeAttendance.length > 0 ? 
              `Showing ${sortedRangeAttendance.length} records` : 
              'No records found for current selection'
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {isLoadingRange ? (
            <div className="text-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mx-auto" />
              <p className="text-muted-foreground mt-2 text-sm">Loading attendance data...</p>
            </div>
          ) : filteredRangeAttendance.length > 0 ? (
            <>
              {/* Mobile Card View - Hidden on desktop */}
              <div className="sm:hidden">
                <div className="divide-y divide-gray-100">
                  {paginatedAttendance.map((record: any) => (
                    <div key={record.id} className="p-4 hover:bg-gray-50">
                      <div className="space-y-3">
                        {/* Header with name and status */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-400" />
                            <span className="font-medium text-sm truncate">
                              {record.userName || `User #${record.userId}`}
                            </span>
                          </div>
                          <StatusBadge status={record.status} />
                        </div>
                        
                        {/* Department and Date */}
                        <div className="flex items-center justify-between text-sm text-gray-600">
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-xs">
                              {record.userDepartment || 'Unknown'}
                            </Badge>
                          </div>
                          <span className="text-xs font-medium">
                            {formatDate(new Date(record.date))}
                          </span>
                        </div>
                        
                        {/* Time Info Grid */}
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-gray-500">
                              <Clock className="h-3 w-3" />
                              <span className="text-xs">Check In</span>
                            </div>
                            {record.checkInTime ? (
                              <div className="flex items-center gap-1">
                                <TimeDisplay time={record.checkInTime} format12Hour={true} />
                                {record.checkInPhoto && (
                                  <Camera className="h-3 w-3 text-green-500" />
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">No check-in</span>
                            )}
                          </div>
                          
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-gray-500">
                              <Clock className="h-3 w-3" />
                              <span className="text-xs">Check Out</span>
                            </div>
                            {record.checkOutTime ? (
                              <div className="flex items-center gap-1">
                                <TimeDisplay time={record.checkOutTime} format12Hour={true} />
                                {record.checkOutPhoto && (
                                  <Camera className="h-3 w-3 text-red-500" />
                                )}
                              </div>
                            ) : isIncompleteRecord(record) ? (
                              <div className="flex items-center gap-1">
                                <XCircle className="h-3 w-3 text-red-500" />
                                <span className="text-xs text-red-600">Missing</span>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </div>
                        </div>
                        
                        {/* Hours and Location */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-3">
                              <span className="text-gray-600">
                                Work: <span className="font-medium">{record.workingHours ? `${record.workingHours.toFixed(1)}h` : '0h'}</span>
                              </span>
                              <span className="text-blue-600">
                                OT: <span className="font-medium">{record.overtimeHours ? `${record.overtimeHours.toFixed(1)}h` : '0h'}</span>
                              </span>
                            </div>
                          </div>
                          {/* Location Display */}
                          <div className="space-y-1">
                            <div className="text-xs text-gray-500">Check-in:</div>
                            <LocationDisplay 
                              latitude={record.checkInLatitude} 
                              longitude={record.checkInLongitude}
                            />
                            {record.checkOutLatitude && record.checkOutLongitude && (
                              <>
                                <div className="text-xs text-gray-500 mt-1">Check-out:</div>
                                <LocationDisplay 
                                  latitude={record.checkOutLatitude} 
                                  longitude={record.checkOutLongitude}
                                />
                              </>
                            )}
                          </div>
                          
                          {/* Photos Section */}
                          {(record.checkInImageUrl || record.checkOutImageUrl) && (
                            <div className="pt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleViewPhotos(record)}
                                className="h-7 text-xs gap-1 hover:bg-blue-50 border-blue-200"
                              >
                                <Camera className="h-3 w-3" />
                                View Photos
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Desktop Table View - Hidden on mobile */}
              <div className="hidden sm:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium">Employee</TableHead>
                      <TableHead className="text-xs font-medium">Department</TableHead>
                      <TableHead className="text-xs font-medium">Date</TableHead>
                      <TableHead className="text-xs font-medium">Check In</TableHead>
                      <TableHead className="text-xs font-medium">Check Out</TableHead>
                      <TableHead className="text-xs font-medium">Working Hours</TableHead>
                      <TableHead className="text-xs font-medium">Overtime</TableHead>
                      <TableHead className="text-xs font-medium">Status</TableHead>
                      <TableHead className="text-xs font-medium w-48">Check-in Location</TableHead>
                      <TableHead className="text-xs font-medium w-48">Check-out Location</TableHead>
                      <TableHead className="text-xs font-medium">Photos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedAttendance.map((record: any) => (
                      <TableRow key={record.id} className="hover:bg-gray-50">
                        <TableCell className="font-medium text-sm">
                          {record.userName || `User #${record.userId}`}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {record.userDepartment || 'Unknown'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {formatDate(new Date(record.date))}
                        </TableCell>
                        <TableCell>
                          {record.checkInTime ? (
                            <TimeDisplay time={record.checkInTime} format12Hour={true} />
                          ) : (
                            <Badge variant="outline" className="bg-gray-50 text-gray-500 text-xs">No check-in</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {record.checkOutTime ? (
                            <TimeDisplay time={record.checkOutTime} format12Hour={true} />
                          ) : isIncompleteRecord(record) ? (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                              <XCircle className="h-3 w-3 mr-1" />
                              Missing
                            </Badge>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium text-sm">
                            {record.workingHours ? `${record.workingHours.toFixed(1)}h` : '0h'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium text-blue-600 text-sm">
                            {record.overtimeHours ? `${record.overtimeHours.toFixed(1)}h` : '0h'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={record.status} />
                        </TableCell>
                        <TableCell className="max-w-48">
                          <LocationDisplay 
                            latitude={record.checkInLatitude} 
                            longitude={record.checkInLongitude}
                          />
                        </TableCell>
                        <TableCell className="max-w-48">
                          <LocationDisplay 
                            latitude={record.checkOutLatitude} 
                            longitude={record.checkOutLongitude}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {(record.checkInImageUrl || record.checkOutImageUrl) ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewPhotos(record)}
                                className="h-8 w-8 p-0 hover:bg-blue-50"
                                title="View attendance photos"
                              >
                                <Camera className="h-4 w-4 text-blue-600" />
                              </Button>
                            ) : (
                              <span className="text-gray-400 text-xs">No photos</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="border-t bg-gray-50 px-3 py-3 sm:px-6">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="text-sm text-gray-700">
                      Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                      <span className="font-medium">{Math.min(endIndex, sortedRangeAttendance.length)}</span> of{' '}
                      <span className="font-medium">{sortedRangeAttendance.length}</span> records
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="h-8 px-3 text-xs"
                      >
                        Previous
                      </Button>
                      
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          
                          return (
                            <Button
                              key={pageNum}
                              variant={currentPage === pageNum ? "default" : "outline"}
                              size="sm"
                              onClick={() => setCurrentPage(pageNum)}
                              className="h-8 w-8 p-0 text-xs"
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        className="h-8 px-3 text-xs"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 px-4 text-gray-500">
              <FileText className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50" />
              <div className="space-y-2">
                <p className="font-medium text-sm sm:text-base">No attendance records found</p>
                {rangeError ? (
                  <p className="text-xs sm:text-sm text-red-600">Error: {rangeError.message}</p>
                ) : (
                  <div className="text-xs sm:text-sm space-y-1">
                    <p className="font-medium">Current filters:</p>
                    <div className="space-y-0.5">
                      <p>• Date: {dateRange.from ? dateRange.from.toLocaleDateString() : 'Not set'} to {dateRange.to ? dateRange.to.toLocaleDateString() : 'Not set'}</p>
                      {selectedEmployee !== "all" && <p>• Employee: {allUsers.find((u: any) => u.id === selectedEmployee)?.displayName || 'Unknown'}</p>}
                      {selectedDepartment !== "all" && <p>• Department: {selectedDepartment}</p>}
                      {selectedStatus !== "all" && <p>• Status: {selectedStatus}</p>}
                    </div>
                    <p className="mt-2 text-gray-600">Try adjusting your filters</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Photo Viewer Modal */}
      {selectedRecord && (
        <AttendancePhotoViewer
          isOpen={showPhotoViewer}
          onClose={handleClosePhotoViewer}
          attendanceRecord={selectedRecord}
        />
      )}
    </div>
  );
}
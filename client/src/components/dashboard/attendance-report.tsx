import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthContext } from "@/contexts/auth-context";
import { usePermissions } from "@/hooks/use-permissions";
import { formatDate } from "@/lib/utils";
import { TimeDisplay } from "@/components/time/time-display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-picker";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FileDown, Filter, Search, Loader2, BarChart2, Clock, Users, UserPlus, UserCheck } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { startOfDay, endOfDay, subDays, format, isAfter, isBefore, isEqual, addDays, eachDayOfInterval } from "date-fns";
import * as XLSX from 'xlsx';
import { departments } from "@shared/schema";

// Status styles for attendance badges
const statusStyles = {
  present: "bg-green-100 text-green-800",
  absent: "bg-red-100 text-red-800",
  leave: "bg-yellow-100 text-yellow-800",
  late: "bg-orange-100 text-orange-800",
};

export function AttendanceReport() {
  const { user } = useAuthContext();
  const { hasPermission } = usePermissions();
  const [dateRange, setDateRange] = useState({
    from: subDays(new Date(), 7),
    to: new Date(),
  });
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("summary");
  
  // Fetch attendance records for the date range
  const { data: attendanceRecords = [], isLoading } = useQuery({
    queryKey: ["/api/attendance/range", 
      { 
        from: dateRange.from?.toISOString(), 
        to: dateRange.to?.toISOString(),
        department: selectedDepartment,
        userId: selectedEmployee 
      }
    ],
    enabled: !!dateRange.from && !!dateRange.to,
  });
  
  // Fetch all employees for filtering
  const { data: employees = [] } = useQuery({
    queryKey: ["/api/users"],
  });
  
  // Fetch all departments for filtering
  const { data: departments = [] } = useQuery({
    queryKey: ["/api/departments"],
  });
  
  // Filter attendance records based on search query
  const filteredRecords = attendanceRecords.filter((record: any) => {
    const matchesSearch = searchQuery
      ? record.userName?.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    return matchesSearch;
  });
  
  // Get unique employees from attendance records
  const uniqueEmployees = Array.from(
    new Set(filteredRecords.map((record: any) => record.userName))
  );
  
  // Prepare data for summary chart (attendance by date)
  const dailySummaryData = dateRange.from && dateRange.to
    ? eachDayOfInterval({ start: dateRange.from, end: dateRange.to }).map(date => {
        const dateStr = format(date, "yyyy-MM-dd");
        const dayRecords = filteredRecords.filter((record: any) => 
          record.date?.split('T')[0] === dateStr
        );
        
        const present = dayRecords.filter((r: any) => r.status === 'present').length;
        const absent = dayRecords.filter((r: any) => r.status === 'absent').length;
        const leave = dayRecords.filter((r: any) => r.status === 'leave').length;
        const late = dayRecords.filter((r: any) => r.status === 'late').length;
        
        return {
          date: format(date, "MMM dd"),
          present,
          absent,
          leave,
          late,
          total: present + absent + leave + late
        };
      })
    : [];
    
  // Calculate overall stats
  const totalPresent = filteredRecords.filter((r: any) => r.status === 'present').length;
  const totalAbsent = filteredRecords.filter((r: any) => r.status === 'absent').length;
  const totalLeave = filteredRecords.filter((r: any) => r.status === 'leave').length;
  const totalLate = filteredRecords.filter((r: any) => r.status === 'late').length;
  const totalOvertimeHours = filteredRecords.reduce((total: number, record: any) => 
    total + (record.overtimeHours || 0), 0
  );
  
  // Calculate employee-wise stats
  const employeeStats = uniqueEmployees.map(empName => {
    const empRecords = filteredRecords.filter((r: any) => r.userName === empName);
    const present = empRecords.filter((r: any) => r.status === 'present').length;
    const absent = empRecords.filter((r: any) => r.status === 'absent').length;
    const leave = empRecords.filter((r: any) => r.status === 'leave').length;
    const late = empRecords.filter((r: any) => r.status === 'late').length;
    const totalOvertimeHours = empRecords.reduce((total: number, record: any) => 
      total + (record.overtimeHours || 0), 0
    );
    
    return {
      name: empName,
      present,
      absent,
      leave,
      late,
      total: present + absent + leave + late,
      overtimeHours: totalOvertimeHours
    };
  });
  
  // Handle export to Excel
  const handleExport = () => {
    // Prepare data for export
    const exportData = filteredRecords.map((record: any) => ({
      Date: record.date ? formatDate(new Date(record.date)) : '',
      Employee: record.userName || '',
      Department: record.userDepartment || '',
      Status: record.status || '',
      'Check In': record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '',
      'Check Out': record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '',
      Location: record.location || '',
      'Overtime Hours': record.overtimeHours || 0,
      Remarks: record.remarks || ''
    }));
    
    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Create workbook and add the worksheet
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance Report');
    
    // Generate file name based on date range
    const fromDateStr = dateRange.from ? format(dateRange.from, 'MMM-dd-yyyy') : '';
    const toDateStr = dateRange.to ? format(dateRange.to, 'MMM-dd-yyyy') : '';
    const fileName = `Attendance_Report_${fromDateStr}_to_${toDateStr}.xlsx`;
    
    // Export to Excel
    XLSX.writeFile(wb, fileName);
  };
  
  // Format date for display
  const formatDateDisplay = (date: Date) => {
    return format(date, 'MMM dd, yyyy');
  };
  
  // Format time for display
  const formatTimeDisplay = (date: Date) => {
    return format(date, 'hh:mm a');
  };
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl font-bold">Attendance Reports</CardTitle>
        <CardDescription>
          View and analyze attendance data for all employees
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {/* Filter controls */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Date Range</label>
              <DateRangePicker
                dateRange={dateRange}
                setDateRange={setDateRange}
                className="w-full"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Department</label>
              <Select
                value={selectedDepartment || "all_departments"}
                onValueChange={(value) => setSelectedDepartment(value === "all_departments" ? null : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_departments">All Departments</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept.charAt(0).toUpperCase() + dept.slice(1).replace('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Employee</label>
              <Select
                value={selectedEmployee || "all_employees"}
                onValueChange={(value) => setSelectedEmployee(value === "all_employees" ? null : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_employees">All Employees</SelectItem>
                  {employees.map((emp: any) => (
                    <SelectItem key={emp.id} value={emp.id.toString()}>
                      {emp.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-end">
              <Button 
                onClick={handleExport} 
                className="bg-primary hover:bg-primary/90 gap-1 w-full"
              >
                <FileDown className="h-4 w-4" />
                Export to Excel
              </Button>
            </div>
          </div>
          
          {/* Search and filter */}
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search employees..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          
          {/* Statistics cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-500">Present</p>
                  <p className="text-2xl font-bold">{totalPresent}</p>
                  <p className="text-xs text-gray-500">
                    {Math.round((totalPresent / filteredRecords.length) * 100) || 0}% of total
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                  <UserCheck className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-500">Absent</p>
                  <p className="text-2xl font-bold">{totalAbsent}</p>
                  <p className="text-xs text-gray-500">
                    {Math.round((totalAbsent / filteredRecords.length) * 100) || 0}% of total
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                  <Users className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-500">On Leave</p>
                  <p className="text-2xl font-bold">{totalLeave}</p>
                  <p className="text-xs text-gray-500">
                    {Math.round((totalLeave / filteredRecords.length) * 100) || 0}% of total
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-600">
                  <UserPlus className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-500">Overtime Hours</p>
                  <p className="text-2xl font-bold">{totalOvertimeHours.toFixed(1)}</p>
                  <p className="text-xs text-gray-500">Total overtime hours</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                  <Clock className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Tabbed content for detailed reports */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="detailed">Detailed Report</TabsTrigger>
              <TabsTrigger value="employee">Employee Stats</TabsTrigger>
            </TabsList>
            
            {/* Summary tab with charts */}
            <TabsContent value="summary" className="space-y-4">
              <div className="h-80 w-full mt-6">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={dailySummaryData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="present" fill="#22c55e" name="Present" />
                    <Bar dataKey="absent" fill="#ef4444" name="Absent" />
                    <Bar dataKey="leave" fill="#eab308" name="Leave" />
                    <Bar dataKey="late" fill="#f97316" name="Late" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              
              <div className="text-sm text-gray-500 text-center">
                Daily attendance trends from {dateRange.from && formatDateDisplay(dateRange.from)} to {dateRange.to && formatDateDisplay(dateRange.to)}
              </div>
            </TabsContent>
            
            {/* Detailed report tab with table */}
            <TabsContent value="detailed">
              <div className="rounded-md border mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Check In</TableHead>
                      <TableHead>Check Out</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Overtime</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-10">
                          <div className="flex justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          </div>
                          <p className="text-sm text-gray-500 mt-2">Loading attendance records...</p>
                        </TableCell>
                      </TableRow>
                    ) : filteredRecords.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-10 text-gray-500">
                          No attendance records found for the selected criteria
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRecords.map((record: any) => (
                        <TableRow key={record.id}>
                          <TableCell>
                            {record.date ? formatDate(new Date(record.date)) : "-"}
                          </TableCell>
                          <TableCell className="font-medium">
                            {record.userName || "-"}
                          </TableCell>
                          <TableCell>
                            {record.userDepartment || "-"}
                          </TableCell>
                          <TableCell>
                            <Badge className={cn("font-medium capitalize", 
                              record.status in statusStyles 
                                ? statusStyles[record.status as keyof typeof statusStyles] 
                                : "bg-gray-100"
                            )}>
                              {record.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {record.checkInTime ? <TimeDisplay time={record.checkInTime} format12Hour={true} /> : "-"}
                          </TableCell>
                          <TableCell>
                            {record.checkOutTime ? <TimeDisplay time={record.checkOutTime} format12Hour={true} /> : "-"}
                          </TableCell>
                          <TableCell className="capitalize">
                            {record.location || "-"}
                          </TableCell>
                          <TableCell>
                            {record.overtimeHours ? `${record.overtimeHours} hrs` : "-"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
            
            {/* Employee stats tab */}
            <TabsContent value="employee">
              <div className="rounded-md border mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Present</TableHead>
                      <TableHead>Absent</TableHead>
                      <TableHead>Leave</TableHead>
                      <TableHead>Late</TableHead>
                      <TableHead>Present %</TableHead>
                      <TableHead>Overtime Hours</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-10">
                          <div className="flex justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          </div>
                          <p className="text-sm text-gray-500 mt-2">Loading employee statistics...</p>
                        </TableCell>
                      </TableRow>
                    ) : employeeStats.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-10 text-gray-500">
                          No employee records found for the selected criteria
                        </TableCell>
                      </TableRow>
                    ) : (
                      employeeStats.map((employee, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">
                            {employee.name}
                          </TableCell>
                          <TableCell>{employee.present}</TableCell>
                          <TableCell>{employee.absent}</TableCell>
                          <TableCell>{employee.leave}</TableCell>
                          <TableCell>{employee.late}</TableCell>
                          <TableCell>
                            {Math.round((employee.present / employee.total) * 100) || 0}%
                          </TableCell>
                          <TableCell>
                            {employee.overtimeHours.toFixed(1)} hrs
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </CardContent>
    </Card>
  );
}
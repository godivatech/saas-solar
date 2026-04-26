import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthContext } from "../contexts/auth-context";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { FileDown, Loader2, Calendar, Users, FileText } from "lucide-react";
import * as XLSX from 'xlsx';

interface LeaveReport {
    id: string;
    userId: string;
    employeeName: string;
    employeeEmail: string;
    department: string;
    leaveType: 'casual_leave' | 'unpaid_leave' | 'permission';
    startDate: Date;
    endDate: Date;
    totalDays: number;
    reason: string;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: Date;
}

interface LeaveStats {
    total: number;
    casualCount: number;
    unpaidCount: number;
    permissionCount: number;
}

interface LeaveReportsResponse {
    leaves: LeaveReport[];
    stats: LeaveStats;
}

export default function LeaveReports() {
    const { user } = useAuthContext();

    // Permission check: admin/master_admin (role) OR hr (department)
    const hasAccess =
        user && (
            ['admin', 'master_admin'].includes(user.role) ||
            user.department === 'hr'
        );

    const currentDate = new Date();
    const [filters, setFilters] = useState({
        month: currentDate.getMonth() + 1,
        year: currentDate.getFullYear(),
        department: 'all',
        leaveType: 'all',
        status: 'all'
    });

    // Convert month/year to startDate/endDate for API
    const startDate = new Date(filters.year, filters.month - 1, 1).toISOString().split('T')[0];
    const endDate = new Date(filters.year, filters.month, 0).toISOString().split('T')[0];

    const queryParams = new URLSearchParams({
        startDate,
        endDate,
        ...(filters.department !== 'all' && { department: filters.department }),
        ...(filters.leaveType !== 'all' && { leaveType: filters.leaveType }),
        ...(filters.status !== 'all' && { status: filters.status })
    });

    // Fetch leave reports (uses default queryFn which handles auth)
    const { data, isLoading, isError } = useQuery<LeaveReportsResponse>({
        queryKey: [`/api/reports/leaves?${queryParams.toString()}`],
        enabled: hasAccess
    });

    // Export to Excel
    const exportToExcel = () => {
        if (!data?.leaves) return;

        const worksheetData = [
            ['Employee Name', 'Email', 'Department', 'Leave Type', 'Start Date', 'End Date', 'Days', 'Reason', 'Status'],
            ...data.leaves.map(leave => [
                leave.employeeName,
                leave.employeeEmail,
                leave.department,
                leave.leaveType.replace('_', ' ').toUpperCase(),
                new Date(leave.startDate).toLocaleDateString(),
                new Date(leave.endDate).toLocaleDateString(),
                leave.totalDays,
                leave.reason,
                leave.status.toUpperCase()
            ])
        ];

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

        worksheet['!cols'] = [
            { wch: 20 }, // Employee Name
            { wch: 25 }, // Email
            { wch: 15 }, // Department
            { wch: 15 }, // Leave Type
            { wch: 12 }, // Start Date
            { wch: 12 }, // End Date
            { wch: 8 },  // Days
            { wch: 30 }, // Reason
            { wch: 12 }  // Status
        ];

        XLSX.utils.book_append_sheet(workbook, worksheet, 'Leave Report');
        XLSX.writeFile(workbook, `leaves_${filters.month}_${filters.year}.xlsx`);
    };

    // Permission guard
    if (!hasAccess) {
        return (
            <div className="p-6">
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-center text-gray-500">
                            Access denied. Only admins and HR can view leave reports.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl">Leave Reports & Analytics</CardTitle>
                    <CardDescription>
                        View and export leave data for compliance and workforce planning
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    {/* Filters */}
                    <div className="mb-6 flex flex-wrap gap-4">
                        <Select
                            value={filters.month.toString()}
                            onValueChange={(value) => setFilters({ ...filters, month: parseInt(value) })}
                        >
                            <SelectTrigger className="w-[150px]">
                                <SelectValue placeholder="Month" />
                            </SelectTrigger>
                            <SelectContent>
                                {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                                    <SelectItem key={month} value={month.toString()}>
                                        {new Date(2000, month - 1).toLocaleString('default', { month: 'long' })}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select
                            value={filters.year.toString()}
                            onValueChange={(value) => setFilters({ ...filters, year: parseInt(value) })}
                        >
                            <SelectTrigger className="w-[120px]">
                                <SelectValue placeholder="Year" />
                            </SelectTrigger>
                            <SelectContent>
                                {Array.from({ length: 5 }, (_, i) => currentDate.getFullYear() - 2 + i).map(year => (
                                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select
                            value={filters.department}
                            onValueChange={(value) => setFilters({ ...filters, department: value })}
                        >
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Department" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Departments</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="hr">HR</SelectItem>
                                <SelectItem value="marketing">Marketing</SelectItem>
                                <SelectItem value="operations">Operations</SelectItem>
                                <SelectItem value="sales">Sales</SelectItem>
                                <SelectItem value="technical">Technical</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select
                            value={filters.leaveType}
                            onValueChange={(value) => setFilters({ ...filters, leaveType: value })}
                        >
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Leave Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Types</SelectItem>
                                <SelectItem value="casual_leave">Casual Leave</SelectItem>
                                <SelectItem value="unpaid_leave">Unpaid Leave</SelectItem>
                                <SelectItem value="permission">Permission</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select
                            value={filters.status}
                            onValueChange={(value) => setFilters({ ...filters, status: value })}
                        >
                            <SelectTrigger className="w-[150px]">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="approved">Approved</SelectItem>
                                <SelectItem value="rejected">Rejected</SelectItem>
                            </SelectContent>
                        </Select>

                        <Button
                            onClick={exportToExcel}
                            disabled={!data?.leaves.length}
                            className="ml-auto"
                        >
                            <FileDown className="h-4 w-4 mr-2" />
                            Export to Excel
                        </Button>
                    </div>

                    {/* Summary Cards */}
                    {data?.stats && (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                            <Card>
                                <CardContent className="pt-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-gray-500">Total Leaves</p>
                                            <p className="text-2xl font-bold">{data.stats.total}</p>
                                        </div>
                                        <FileText className="h-8 w-8 text-blue-500" />
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardContent className="pt-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-gray-500">Casual Leave</p>
                                            <p className="text-2xl font-bold">{data.stats.casualCount}</p>
                                        </div>
                                        <Calendar className="h-8 w-8 text-green-500" />
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardContent className="pt-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-gray-500">Unpaid Leave</p>
                                            <p className="text-2xl font-bold">{data.stats.unpaidCount}</p>
                                        </div>
                                        <Users className="h-8 w-8 text-orange-500" />
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardContent className="pt-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-gray-500">Permission</p>
                                            <p className="text-2xl font-bold">{data.stats.permissionCount}</p>
                                        </div>
                                        <FileText className="h-8 w-8 text-purple-500" />
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* Data Table */}
                    <div className="border rounded-lg">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                            </div>
                        ) : isError ? (
                            <div className="text-center py-12 text-gray-500">
                                Failed to load leave reports
                            </div>
                        ) : !data?.leaves.length ? (
                            <div className="text-center py-12 text-gray-500">
                                No leaves found for selected filters
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Employee</TableHead>
                                        <TableHead>Department</TableHead>
                                        <TableHead>Leave Type</TableHead>
                                        <TableHead>Start Date</TableHead>
                                        <TableHead>End Date</TableHead>
                                        <TableHead>Days</TableHead>
                                        <TableHead>Reason</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.leaves.map((leave) => (
                                        <TableRow key={leave.id}>
                                            <TableCell>
                                                <div>
                                                    <div className="font-medium">{leave.employeeName}</div>
                                                    <div className="text-sm text-gray-500">{leave.employeeEmail}</div>
                                                </div>
                                            </TableCell>
                                            <TableCell>{leave.department}</TableCell>
                                            <TableCell>
                                                <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                                                    {leave.leaveType.replace('_', ' ').toUpperCase()}
                                                </span>
                                            </TableCell>
                                            <TableCell>{new Date(leave.startDate).toLocaleDateString()}</TableCell>
                                            <TableCell>{new Date(leave.endDate).toLocaleDateString()}</TableCell>
                                            <TableCell>{leave.totalDays}</TableCell>
                                            <TableCell className="max-w-xs truncate">{leave.reason}</TableCell>
                                            <TableCell>
                                                <span className={`px-2 py-1 text-xs rounded-full ${leave.status === 'approved' ? 'bg-green-100 text-green-800' :
                                                    leave.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                                        'bg-yellow-100 text-yellow-800'
                                                    }`}>
                                                    {leave.status.toUpperCase()}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

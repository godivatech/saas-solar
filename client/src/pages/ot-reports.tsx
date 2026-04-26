import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthContext } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, FileSpreadsheet, Calendar, Users, Clock, Filter, RefreshCw, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function OTReports() {
    const { user, hasRole } = useAuthContext();
    const { toast } = useToast();

    //  Date filters - default to current month
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const [startDate, setStartDate] = useState(firstDay.toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(lastDay.toISOString().split('T')[0]);
    const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
    const [selectedDepartment, setSelectedDepartment] = useState<string>('all');

    // Define departments directly (from schema)
    const uniqueDepartments = ['operations', 'admin', 'hr', 'marketing', 'sales', 'technical', 'housekeeping'];

    // Fetch all users for employee dropdown (independent of OT data)
    const { data: allUsersData } = useQuery({
        queryKey: ['/api/users'],
        enabled: !!user && hasRole(['admin', 'master_admin']),
        queryFn: async () => {
            try {
                const res = await apiRequest('/api/users', 'GET');
                if (!res.ok) {
                    console.error('Failed to fetch users:', res.status);
                    return [];
                }
                return res.json();
            } catch (err) {
                console.error('Error fetching users:', err);
                return [];
            }
        },
    });

    const allUsers = allUsersData || [];

    // Fetch OT reports
    const { data: reportsData, isLoading, refetch, isFetching, error } = useQuery({
        queryKey: ['/api/ot/reports', { startDate, endDate, userId: selectedEmployee !== 'all' ? selectedEmployee : undefined, department: selectedDepartment !== 'all' ? selectedDepartment : undefined }],
        enabled: !!user && hasRole(['admin', 'master_admin']),
        queryFn: async () => {
            const params = new URLSearchParams({
                startDate,
                endDate,
                ...(selectedEmployee !== 'all' && { userId: selectedEmployee }),
                ...(selectedDepartment !== 'all' && { department: selectedDepartment })
            });
            const res = await apiRequest(`/api/ot/reports?${params.toString()}`, 'GET');
            if (!res.ok) {
                throw new Error('Failed to fetch OT reports');
            }
            return res.json();
        },
    });

    const sessions = reportsData?.sessions || [];
    const summary = reportsData?.summary || {
        totalSessions: 0,
        totalHours: 0,
        approvedHours: 0,
        pendingHours: 0,
        rejectedCount: 0,
        byType: { early_arrival: 0, late_departure: 0, weekend: 0, holiday: 0 }
    };

    // Get unique employees from all users (not just from sessions)
    const uniqueEmployees = useMemo(() => {
        return allUsers
            .filter((u: any) => u.isActive)
            .map((u: any) => ({
                id: u.id,
                name: u.displayName || u.email
            }));
    }, [allUsers]);

    // Export to Excel
    const handleExport = () => {
        if (sessions.length === 0) {
            toast({
                title: "No Data",
                description: "There are no OT sessions to export",
                variant: "destructive"
            });
            return;
        }

        const exportData = sessions.map((session: any) => ({
            'Employee': session.userName,
            'Email': session.userEmail,
            'Department': session.userDepartment || 'N/A',
            'Designation': session.userDesignation || 'N/A',
            'Date': new Date(session.date).toLocaleDateString(),
            'OT Type': session.otType?.replace('_', ' ').toUpperCase() || 'N/A',
            'Start Time': new Date(session.startTime).toLocaleString(),
            'End Time': session.endTime ? new Date(session.endTime).toLocaleString() : 'In Progress',
            'Hours': session.otHours.toFixed(2),
            'Status': session.status,
            'Auto Closed': session.autoClosedAt ? 'Yes' : 'No',
            'Review Notes': session.reviewNotes || ''
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'OT Report');

        // Generate filename with date range
        const filename = `OT_Report_${startDate}_to_${endDate}.xlsx`;
        XLSX.writeFile(wb, filename);

        toast({
            title: "Export Successful",
            description: `Downloaded ${sessions.length} OT sessions as Excel file`
        });
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'APPROVED':
            case 'completed':
                return <Badge className="bg-green-500">Approved</Badge>;
            case 'PENDING_REVIEW':
                return <Badge variant="outline" className="border-yellow-500 text-yellow-700">Pending</Badge>;
            case 'REJECTED':
                return <Badge variant="destructive">Rejected</Badge>;
            case 'in_progress':
                return <Badge variant="secondary">In Progress</Badge>;
            default:
                return <Badge>{status}</Badge>;
        }
    };

    const getOTTypeBadge = (type: string) => {
        const colors = {
            early_arrival: 'bg-blue-100 text-blue-700 border-blue-300',
            late_departure: 'bg-purple-100 text-purple-700 border-purple-300',
            weekend: 'bg-orange-100 text-orange-700 border-orange-300',
            holiday: 'bg-red-100 text-red-700 border-red-300'
        };
        return (
            <Badge variant="outline" className={colors[type as keyof typeof colors] || ''}>
                {type?.replace('_', ' ') || 'N/A'}
            </Badge>
        );
    };

    if (!hasRole(['admin', 'master_admin'])) {
        return (
            <div className="container mx-auto py-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Access Denied</CardTitle>
                        <CardDescription>Admin privileges required to view OT reports.</CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-6 space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold">OT Reports</h1>
                <p className="text-muted-foreground mt-1">View and export overtime sessions for payroll processing</p>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary.totalSessions}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary.totalHours.toFixed(1)}h</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Approved Hours</CardTitle>
                        <Clock className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{summary.approvedHours.toFixed(1)}h</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
                        <Clock className="h-4 w-4 text-yellow-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-yellow-600">{summary.pendingHours.toFixed(1)}h</div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Filter className="h-5 w-5" />
                        Filters
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-4">
                    <div>
                        <Label htmlFor="startDate">Start Date</Label>
                        <Input
                            id="startDate"
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                    </div>

                    <div>
                        <Label htmlFor="endDate">End Date</Label>
                        <Input
                            id="endDate"
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>

                    <div>
                        <Label htmlFor="employee">Employee</Label>
                        <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                            <SelectTrigger id="employee">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Employees</SelectItem>
                                {uniqueEmployees.map((emp: any) => (
                                    <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <Label htmlFor="department">Department</Label>
                        <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                            <SelectTrigger id="department">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Departments</SelectItem>
                                {uniqueDepartments.map((dept: any) => (
                                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex justify-between items-center">
                <div className="flex gap-2">
                    <Button
                        onClick={() => refetch()}
                        variant="outline"
                        disabled={isFetching}
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>

                <Button onClick={handleExport} disabled={sessions.length === 0}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export to Excel
                </Button>
            </div>

            {/* OT Sessions Table */}
            <Card>
                <CardHeader>
                    <CardTitle>OT Sessions</CardTitle>
                    <CardDescription>
                        Showing {sessions.length} sessions from {new Date(startDate).toLocaleDateString()} to {new Date(endDate).toLocaleDateString()}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center py-12">
                            <div className="text-muted-foreground">Loading...</div>
                        </div>
                    ) : error ? (
                        <div className="text-center py-12 text-destructive">
                            <AlertCircle className="h-12 w-12 mx-auto mb-4" />
                            <p className="text-lg font-medium">Error loading OT reports</p>
                            <p className="text-sm mt-2">{error instanceof Error ? error.message : 'Unknown error'}</p>
                            <Button onClick={() => refetch()} variant="outline" className="mt-4">
                                Try Again
                            </Button>
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p className="text-lg font-medium">No OT sessions found</p>
                            <p className="text-sm mt-2">Try adjusting the date range or filters</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Employee</TableHead>
                                        <TableHead>Department</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>OT Type</TableHead>
                                        <TableHead>Start Time</TableHead>
                                        <TableHead>End Time</TableHead>
                                        <TableHead className="text-right">Hours</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sessions.map((session: any) => (
                                        <TableRow key={session.sessionId}>
                                            <TableCell className="font-medium">
                                                <div>
                                                    <div>{session.userName}</div>
                                                    <div className="text-xs text-muted-foreground">{session.userDesignation}</div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{session.userDepartment || 'N/A'}</Badge>
                                            </TableCell>
                                            <TableCell>{new Date(session.date).toLocaleDateString()}</TableCell>
                                            <TableCell>{getOTTypeBadge(session.otType)}</TableCell>
                                            <TableCell className="text-sm">
                                                {new Date(session.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {session.endTime
                                                    ? new Date(session.endTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                                                    : <span className="text-muted-foreground italic">In Progress</span>
                                                }
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-semibold">
                                                {session.otHours.toFixed(2)}h
                                            </TableCell>
                                            <TableCell>{getStatusBadge(session.status)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

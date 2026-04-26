import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { sanitizeFormData } from "../../../shared/utils/form-sanitizer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UndoManager, useUndoManager } from "@/components/undo/undo-manager";
import { useOfflineHandler, callWithOfflineHandling } from "@/utils/offline-handler";
import { getUserFriendlyMessage, getSimplifiedFieldLabel } from "@/utils/user-friendly-messages";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuthContext } from "@/contexts/auth-context";
import { TimeDisplay } from "@/components/time/time-display";
import {
  Calculator,
  Settings,
  Users,
  FileSpreadsheet,
  Download,
  Upload,
  Plus,
  Edit3,
  Eye,
  DollarSign,
  Calendar,
  Building2,
  CheckCircle,
  AlertCircle,
  Clock,
  MoreVertical,
  X,
  CalendarDays,
  TrendingUp,
  Wallet,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Printer
} from "lucide-react";

// Types
interface PayrollFieldConfig {
  id: string;
  name: string;
  displayName: string;
  category: "earnings" | "deductions" | "attendance";
  dataType: "number" | "percentage" | "boolean" | "text";
  isRequired: boolean;
  isSystemField: boolean;
  defaultValue?: number | boolean | string;
  department?: string;
  sortOrder: number;
  isActive: boolean;
}

interface EnhancedSalaryStructure {
  id: string;
  userId: string;
  employeeId: string;
  fixedBasic: number;
  fixedHRA: number;
  fixedConveyance: number;
  customEarnings: Record<string, number>;
  customDeductions: Record<string, number>;
  perDaySalaryBase: "basic" | "basic_hra" | "gross";
  // Note: All employees use CompanySettings.defaultOTRate (1.0x)
  epfApplicable: boolean;
  esiApplicable: boolean;
  vptAmount: number;
  templateId?: string;
  effectiveFrom: Date;
  effectiveTo?: Date;
  isActive: boolean;
}

interface EnhancedPayroll {
  id: string;
  userId: string;
  employeeId: string;
  month: number;
  year: number;
  monthDays: number;
  presentDays: number;
  paidLeaveDays: number;
  overtimeHours: number;
  perDaySalary: number;
  earnedBasic: number;
  earnedHRA: number;
  earnedConveyance: number;
  overtimePay: number;
  dynamicEarnings: Record<string, number>;
  dynamicDeductions: Record<string, number>;
  epfDeduction: number;
  esiDeduction: number;
  vptDeduction: number;
  tdsDeduction: number;
  totalEarnings: number;
  totalDeductions: number;
  netSalary: number;
  status: "draft" | "processed" | "approved" | "paid";
  processedBy?: string;
  processedAt?: Date;
  approvedBy?: string;
  approvedAt?: Date;
  remarks?: string;
}

interface User {
  id: string;
  uid: string;
  displayName: string;
  email: string;
  department: string;
  designation: string;
  employeeId?: string;
  role?: string;
}

interface EnhancedPayrollSettings {
  id: string;
  epfEmployeeRate: number;
  epfEmployerRate: number;
  esiEmployeeRate: number;
  esiEmployerRate: number;
  epfCeiling: number;
  esiThreshold: number;
  tdsThreshold: number;
  standardWorkingDays: number;
  standardWorkingHours: number;
  overtimeThresholdHours: number;
  companyName: string;
  companyAddress?: string;
  companyPan?: string;
  companyTan?: string;
  autoCalculateStatutory: boolean;
  allowManualOverride: boolean;
  requireApprovalForProcessing: boolean;
  autoCheckoutGraceMinutes: number;
}

interface PayrollSettingsFormData {
  epfEmployeeRate: number;
  epfEmployerRate: number;
  esiEmployeeRate: number;
  esiEmployerRate: number;
  epfCeiling: number;
  esiThreshold: number;
  tdsThreshold: number;
  standardWorkingDays: number;
  standardWorkingHours: number;
  overtimeThresholdHours: number;
  companyName: string;
  companyAddress: string;
  companyPan: string;
  companyTan: string;
  autoCalculateStatutory: boolean;
  allowManualOverride: boolean;
  requireApprovalForProcessing: boolean;
  autoCheckoutGraceMinutes: number;
}

export default function EnhancedPayrollManagement() {
  const { toast } = useToast();
  const { user } = useAuthContext();
  const queryClient = useQueryClient();

  // Memory leak prevention with proper useEffect cleanup
  useEffect(() => {
    return () => {
      // Cleanup any pending queries when component unmounts
      queryClient.cancelQueries({ queryKey: ['/api/payroll'] });
      queryClient.cancelQueries({ queryKey: ['/api/users'] });
    };
  }, [queryClient]);

  // Undo management for bulk payroll operations
  const { actions, addAction, executeUndo, clearActions } = useUndoManager();

  // Offline handling
  const offlineHandler = useOfflineHandler();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");

  const [isSalaryStructureDialogOpen, setIsSalaryStructureDialogOpen] = useState(false);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [editingPayroll, setEditingPayroll] = useState<string | null>(null);
  const [selectedStructures, setSelectedStructures] = useState<Set<string>>(new Set());
  const [selectedPayrolls, setSelectedPayrolls] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  // API Queries
  const { data: users = [] } = useQuery({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const response = await apiRequest('/api/users', 'GET');
      if (!response.ok) {
        throw new Error(`Failed to fetch users: ${response.status}`);
      }
      const data = await response.json();
      // Return all users for salary structure creation (including admins if needed)
      return Array.isArray(data) ? data : [];
    },
    enabled: !!user?.uid
  });

  const { data: fieldConfigs = [] } = useQuery<PayrollFieldConfig[]>({
    queryKey: ["/api/payroll/field-configs"],
    queryFn: async () => {
      const response = await apiRequest('/api/payroll/field-configs', 'GET');
      return response.json();
    },
    enabled: !!user?.firebaseUser
  });

  const { data: payrolls = [], refetch: refetchPayrolls } = useQuery<EnhancedPayroll[]>({
    queryKey: ["/api/enhanced-payrolls", selectedMonth, selectedYear, selectedDepartment],
    queryFn: async () => {
      const queryParams = {
        month: selectedMonth.toString(),
        year: selectedYear.toString(),
        ...(selectedDepartment && selectedDepartment !== "all" && { department: selectedDepartment })
      };

      const response = await apiRequest('/api/enhanced-payrolls', 'GET', queryParams);
      if (!response.ok) {
        throw new Error(`Failed to fetch payrolls: ${response.status}`);
      }
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!user?.uid,
    refetchInterval: 60000, // CRITICAL FIX: Increased to 1 minute to prevent memory issues
    refetchOnWindowFocus: false, // Prevent excessive refetching
  });

  const { data: salaryStructures = [], refetch: refetchSalaryStructures } = useQuery<EnhancedSalaryStructure[]>({
    queryKey: ["/api/enhanced-salary-structures"],
    queryFn: async () => {
      const response = await apiRequest('/api/enhanced-salary-structures', 'GET');
      if (!response.ok) {
        throw new Error(`Failed to fetch salary structures: ${response.status}`);
      }
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!user?.uid,
    refetchInterval: 60000 // CRITICAL FIX: Increased to 1 minute to prevent memory issues
  });

  const { data: settings } = useQuery<EnhancedPayrollSettings>({
    queryKey: ["/api/enhanced-payroll-settings"],
    queryFn: async () => {
      const response = await apiRequest('/api/enhanced-payroll-settings', 'GET');
      return response.json();
    },
    enabled: !!user?.firebaseUser
  });

  // Enhanced mutations with offline handling and undo capabilities
  const updatePayrollMutation = useMutation({
    mutationFn: async (data: { id: string;[key: string]: any }) => {
      return await callWithOfflineHandling(
        async () => apiRequest(`/api/enhanced-payrolls/${data.id}`, 'PUT', data),
        async () => apiRequest(`/api/enhanced-payrolls/${data.id}`, 'PUT', data)
      );
    },
    onSuccess: (result, variables) => {
      toast({
        title: "Changes saved",
        description: getUserFriendlyMessage("Payroll updated successfully!", 'success')
      });
      queryClient.invalidateQueries({ queryKey: ["/api/enhanced-payrolls"] });
      refetchPayrolls();
    },
    onError: (error) => {
      console.error('Update payroll error:', error);
      toast({
        title: "Error",
        description: "Failed to update payroll record",
        variant: "destructive"
      });
    }
  });



  const createSalaryStructureMutation = useMutation({
    mutationFn: async (data: any) => {
      const sanitized = sanitizeFormData(data, ['structureName', 'description', 'notes']);
      const response = await apiRequest("/api/enhanced-salary-structures", "POST", sanitized);
      if (!response.ok) {
        throw new Error(`Failed to create salary structure: ${response.status}`);
      }
      return response.json();
    },
    onSuccess: () => {
      // Invalidate all related queries for real-time sync
      queryClient.invalidateQueries({ queryKey: ["/api/enhanced-salary-structures"] });
      queryClient.invalidateQueries({ queryKey: ["/api/enhanced-payrolls"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setIsSalaryStructureDialogOpen(false);
      toast({ title: "Salary structure created successfully" });
      // Force refetch to show immediate updates
      refetchSalaryStructures();
    },
    onError: (error: any) => {
      toast({ title: "Error creating salary structure", description: error.message, variant: "destructive" });
    }
  });

  const bulkProcessPayrollMutation = useMutation({
    mutationFn: async (data: { month: number; year: number; userIds?: string[] }) => {
      const sanitized = sanitizeFormData(data, []);
      const response = await apiRequest("/api/enhanced-payrolls/bulk-process", "POST", sanitized);
      if (!response.ok) {
        throw new Error(`Failed to process payroll: ${response.status}`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate all related queries for complete synchronization
      queryClient.invalidateQueries({ queryKey: ["/api/enhanced-payrolls"] });
      queryClient.invalidateQueries({ queryKey: ["/api/enhanced-salary-structures"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Bulk processing completed",
        description: `Processed ${data.payrolls?.length || 0} payrolls successfully`
      });
      // Force immediate refetch for real-time updates
      refetchPayrolls();
      refetchSalaryStructures();
    },
    onError: (error: any) => {
      toast({ title: "Error processing payroll", description: error.message, variant: "destructive" });
    }
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: any) => {
      const sanitized = sanitizeFormData(data, ['companyAddress', 'companyPan', 'companyTan']);
      const response = await apiRequest("/api/enhanced-payroll-settings", "PATCH", sanitized);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enhanced-payroll-settings"] });
      setIsSettingsDialogOpen(false);
      toast({ title: "Settings updated successfully" });
    }
  });

  // Helper functions
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const departments = ["operations", "admin", "hr", "marketing", "sales", "technical", "housekeeping"];

  // Get earnings and deductions field configs
  const earningsFields = fieldConfigs.filter(field => field.category === "earnings" && field.isActive);
  const deductionsFields = fieldConfigs.filter(field => field.category === "deductions" && field.isActive);

  return (
    <div className="container mx-auto py-4 px-4 space-y-4 lg:py-6 lg:space-y-6">
      {/* Header */}
      <div className="flex flex-col space-y-4 lg:flex-row lg:justify-between lg:items-center lg:space-y-0">
        <div className="space-y-1">
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Enhanced Payroll Management</h1>
          <p className="text-sm lg:text-base text-muted-foreground">
            Comprehensive payroll processing with flexible salary components
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog open={isSettingsDialogOpen} onOpenChange={setIsSettingsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="w-full sm:w-auto">
                <Settings className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Settings</span>
                <span className="sm:hidden">Config</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-2xl mx-auto">
              <DialogHeader>
                <DialogTitle>Payroll Settings</DialogTitle>
                <DialogDescription>
                  Configure statutory rates and company information
                </DialogDescription>
              </DialogHeader>
              <PayrollSettingsForm
                settings={settings}
                onSubmit={(data) => updateSettingsMutation.mutate(data)}
              />
            </DialogContent>
          </Dialog>

          <Dialog open={isSalaryStructureDialogOpen} onOpenChange={setIsSalaryStructureDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="w-full sm:w-auto">
                <DollarSign className="h-4 w-4 mr-2" />
                <span className="hidden lg:inline">Create Salary Structure</span>
                <span className="lg:hidden">Salary</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-h-[95vh] max-w-7xl mx-auto overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle className="text-lg lg:text-xl font-bold">Create Comprehensive Salary Structure</DialogTitle>
                <DialogDescription>
                  Define detailed salary components, deductions, and working parameters for an employee
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto p-1">
                <SalaryStructureForm
                  users={users}
                  earningsFields={earningsFields}
                  deductionsFields={deductionsFields}
                  settings={settings}
                  onSubmit={(data) => createSalaryStructureMutation.mutate(data)}
                />
              </div>
            </DialogContent>
          </Dialog>

          <Button
            onClick={() => bulkProcessPayrollMutation.mutate({
              month: selectedMonth,
              year: selectedYear,
              userIds: selectedDepartment && selectedDepartment !== "all" ? users
                .filter((user: any) => user.department === selectedDepartment)
                .map((user: any) => user.id) : undefined
            })}
            disabled={bulkProcessPayrollMutation.isPending}
            size="sm"
            className="w-full sm:w-auto"
          >
            <Calculator className="h-4 w-4 mr-2" />
            {bulkProcessPayrollMutation.isPending ? "Processing..." : "Process Payroll"}
          </Button>
        </div>
      </div>

      {/* Edit Payroll Dialog */}
      {editingPayroll && (
        <Dialog open={!!editingPayroll} onOpenChange={() => setEditingPayroll(null)}>
          <DialogContent className="w-[95vw] h-[95vh] max-w-6xl mx-auto overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg lg:text-xl font-bold">Edit Payroll Record</DialogTitle>
              <DialogDescription>
                Modify payroll components and deductions for this employee
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[calc(95vh-120px)] overflow-y-auto">
              <EditPayrollForm
                payrollId={editingPayroll}
                payroll={payrolls.find(p => p.id === editingPayroll)}
                users={users}
                earningsFields={earningsFields}
                deductionsFields={deductionsFields}
                onSubmit={(data: any) => {
                  updatePayrollMutation.mutate({ id: editingPayroll, ...data });
                  setEditingPayroll(null);
                }}
                onCancel={() => setEditingPayroll(null)}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Filters */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold text-lg">Payroll Filters</h3>
          </div>
          {(selectedDepartment !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedDepartment("all");
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3 mr-1" />
              Clear Filters
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="month" className="text-sm font-medium">Month</Label>
            <Select value={selectedMonth.toString()} onValueChange={(value) => setSelectedMonth(parseInt(value))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthNames.map((month, index) => (
                  <SelectItem key={index} value={(index + 1).toString()}>
                    {month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="year" className="text-sm font-medium">Year</Label>
            <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="department" className="text-sm font-medium">Department</Label>
            <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map(dept => (
                  <SelectItem key={dept} value={dept}>
                    {dept.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Payroll Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="transition-all hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Total Employees</CardTitle>
            <Users className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl lg:text-3xl font-bold text-gray-900">{payrolls.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {monthNames[selectedMonth - 1]} {selectedYear}
            </p>
          </CardContent>
        </Card>

        <Card className="transition-all hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Total Gross</CardTitle>
            <DollarSign className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-xl lg:text-2xl font-bold text-green-600">
              {formatCurrency(payrolls.reduce((sum, p) => sum + p.totalEarnings, 0))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Gross earnings
            </p>
          </CardContent>
        </Card>

        <Card className="transition-all hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Total Deductions</CardTitle>
            <AlertCircle className="h-5 w-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-xl lg:text-2xl font-bold text-orange-600">
              {formatCurrency(payrolls.reduce((sum, p) => sum + p.totalDeductions, 0))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Total deductions
            </p>
          </CardContent>
        </Card>

        <Card className="transition-all hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Net Payable</CardTitle>
            <CheckCircle className="h-5 w-5 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-xl lg:text-2xl font-bold text-purple-600">
              {formatCurrency(payrolls.reduce((sum, p) => sum + p.netSalary, 0))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Final payable amount
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="payroll" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:grid-cols-none lg:flex">
          <TabsTrigger value="payroll" className="text-xs sm:text-sm">
            <span className="hidden sm:inline">Payroll Processing</span>
            <span className="sm:hidden">Payroll</span>
          </TabsTrigger>
          <TabsTrigger value="structures" className="text-xs sm:text-sm">
            <span className="hidden sm:inline">Salary Structures</span>
            <span className="sm:hidden">Structures</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="payroll" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Payroll Register - {monthNames[selectedMonth - 1]} {selectedYear}
              </CardTitle>
              <CardDescription>
                Comprehensive payroll processing with flexible salary components
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PayrollTable
                payrolls={payrolls}
                users={users}
                earningsFields={earningsFields}
                deductionsFields={deductionsFields}
                onEdit={setEditingPayroll}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="structures" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Salary Structures
              </CardTitle>
              <CardDescription>
                Manage employee salary components and structures
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SalaryStructuresTable
                structures={salaryStructures}
                users={users}
                earningsFields={earningsFields}
                deductionsFields={deductionsFields}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Enhanced Payroll Processing Table Component
function PayrollTable({
  payrolls,
  users,
  earningsFields,
  deductionsFields,
  onEdit
}: {
  payrolls: EnhancedPayroll[];
  users: User[];
  earningsFields: PayrollFieldConfig[];
  deductionsFields: PayrollFieldConfig[];
  onEdit: (id: string) => void;
}) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const { toast } = useToast();

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft": return "bg-gray-100 text-gray-800";
      case "processed": return "bg-blue-100 text-blue-800";
      case "approved": return "bg-green-100 text-green-800";
      case "paid": return "bg-purple-100 text-purple-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const toggleRowExpansion = (payrollId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(payrollId)) {
      newExpanded.delete(payrollId);
    } else {
      newExpanded.add(payrollId);
    }
    setExpandedRows(newExpanded);
  };

  const calculateOvertimeDetails = (payroll: EnhancedPayroll) => {
    const overtimeHours = payroll.overtimeHours || 0;
    const overtimePay = payroll.overtimePay || 0;
    const perHourRate = overtimeHours > 0 ? overtimePay / overtimeHours : 0;
    return { overtimeHours, overtimePay, perHourRate };
  };

  const filteredPayrolls = payrolls.filter(payroll => {
    const payrollUser = users.find((u: any) => u.id === payroll.userId);
    const statusMatch = statusFilter === "all" || payroll.status === statusFilter;
    const departmentMatch = departmentFilter === "all" || payrollUser?.department === departmentFilter;
    return statusMatch && departmentMatch;
  });

  const departments = ["operations", "admin", "hr", "marketing", "sales", "technical", "housekeeping"];

  // Enhanced summary calculations
  const totalPayrolls = filteredPayrolls.length;
  const totalGrossEarnings = filteredPayrolls.reduce((sum, p) => sum + p.totalEarnings, 0);
  const totalDeductions = filteredPayrolls.reduce((sum, p) => sum + p.totalDeductions, 0);
  const totalNetPayable = filteredPayrolls.reduce((sum, p) => sum + p.netSalary, 0);
  const totalOvertimeHours = filteredPayrolls.reduce((sum, p) => sum + (p.overtimeHours || 0), 0);
  const totalOvertimePay = filteredPayrolls.reduce((sum, p) => sum + (p.overtimePay || 0), 0);

  if (payrolls.length === 0) {
    return (
      <div className="text-center py-8">
        <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">No payroll data found</h3>
        <p className="text-muted-foreground">
          Process payroll for the selected month to see data here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Enhanced Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="transition-all hover:shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Payrolls</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl lg:text-2xl font-bold">{totalPayrolls}</div>
            <p className="text-xs text-muted-foreground">Processed records</p>
          </CardContent>
        </Card>
        <Card className="transition-all hover:shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Gross Earnings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg lg:text-xl font-bold text-green-600">{formatCurrency(totalGrossEarnings)}</div>
            <p className="text-xs text-muted-foreground">Total earnings</p>
          </CardContent>
        </Card>
        <Card className="transition-all hover:shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Deductions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg lg:text-xl font-bold text-red-600">{formatCurrency(totalDeductions)}</div>
            <p className="text-xs text-muted-foreground">All deductions</p>
          </CardContent>
        </Card>
        <Card className="transition-all hover:shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Payable</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg lg:text-xl font-bold text-blue-600">{formatCurrency(totalNetPayable)}</div>
            <p className="text-xs text-muted-foreground">Final amount</p>
          </CardContent>
        </Card>
        <Card className="transition-all hover:shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">OT Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl lg:text-2xl font-bold text-orange-600">{totalOvertimeHours.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground">Overtime hours</p>
          </CardContent>
        </Card>
        <Card className="transition-all hover:shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">OT Pay</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg lg:text-xl font-bold text-orange-600">{formatCurrency(totalOvertimePay)}</div>
            <p className="text-xs text-muted-foreground">Overtime payment</p>
          </CardContent>
        </Card>
      </div>

      {/* Advanced Filters */}
      <div className="flex flex-col sm:flex-row gap-4 p-4 bg-gray-50 rounded-lg">
        <div className="flex-1 space-y-2">
          <Label htmlFor="status-filter" className="text-sm font-medium">Filter by Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="processed">Processed</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 space-y-2">
          <Label htmlFor="department-filter" className="text-sm font-medium">Filter by Department</Label>
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map(dept => (
                <SelectItem key={dept} value={dept}>
                  {dept.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2 w-full lg:w-auto">
          <Button
            className="w-full lg:w-auto bg-green-600 hover:bg-green-700 text-white"
            onClick={() => {
              window.location.href = `/api/payroll/export?month=${selectedMonth}&year=${selectedYear}`;
              toast({
                title: "Exporting Payroll",
                description: "Your Excel file is being generated and will download shortly.",
              });
            }}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Download Monthly Register
          </Button>
          <Button
            className="w-full lg:w-auto"
            onClick={() => setIsSettingsDialogOpen(true)} // Assuming setIsSettingsDialogOpen is the correct state setter for a settings dialog
          >
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </div>
      </div>

      {/* Enhanced Payroll Table - Mobile-First Responsive */}
      <div className="block lg:hidden space-y-4">
        {/* Mobile Card Layout */}
        {filteredPayrolls.map((payroll) => {
          const payrollUser = users.find((u: any) => u.id === payroll.userId);
          const isExpanded = expandedRows.has(payroll.id);
          const { overtimeHours, overtimePay, perHourRate } = calculateOvertimeDetails(payroll);

          return (
            <Card key={payroll.id} className="w-full">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-lg font-semibold">{payrollUser?.displayName}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">{payroll.employeeId}</p>
                    <div className="flex gap-2 mt-2">
                      <Badge variant="outline" className="text-xs">
                        {payrollUser?.department?.toUpperCase() || 'N/A'}
                      </Badge>
                      <Badge className={`text-xs ${getStatusColor(payroll.status)}`}>
                        {payroll.status}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleRowExpansion(payroll.id)}
                    className="ml-2"
                  >
                    {isExpanded ? "−" : "+"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-sm text-gray-600">Attendance</h4>
                    <div className="text-sm space-y-1 mt-1">
                      <div>Present: {payroll.presentDays}/{payroll.monthDays}</div>
                      <div>Leave: {payroll.paidLeaveDays || 0} days</div>
                      <div>Per Day: {formatCurrency(payroll.perDaySalary)}</div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-gray-600">Basic Earnings</h4>
                    <div className="text-sm space-y-1 mt-1">
                      <div>Basic: {formatCurrency(payroll.earnedBasic)}</div>
                      <div>HRA: {formatCurrency(payroll.earnedHRA)}</div>
                      <div>Conv: {formatCurrency(payroll.earnedConveyance)}</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-sm text-gray-600">Overtime</h4>
                    <div className="text-sm space-y-1 mt-1">
                      <div className="font-medium text-orange-600">{overtimeHours.toFixed(1)} hrs</div>
                      <div>{formatCurrency(overtimePay)}</div>
                      {perHourRate > 0 && (
                        <div className="text-muted-foreground">@{formatCurrency(perHourRate)}/hr</div>
                      )}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-gray-600">Summary</h4>
                    <div className="text-sm space-y-1 mt-1">
                      <div className="font-medium text-green-600">{formatCurrency(payroll.totalEarnings)}</div>
                      <div className="text-red-600">-{formatCurrency(payroll.totalDeductions)}</div>
                      <div className="font-bold text-blue-600">{formatCurrency(payroll.netSalary)}</div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(payroll.id)}
                    className="flex-1"
                  >
                    <Edit3 className="h-3 w-3 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleRowExpansion(payroll.id)}
                    className="flex-1"
                  >
                    <Eye className="h-3 w-3 mr-2" />
                    {isExpanded ? "Hide" : "Details"}
                  </Button>
                </div>

                {/* Expanded Details for Mobile */}
                {isExpanded && (
                  <div className="border-t pt-4 space-y-4">
                    <h4 className="font-semibold text-lg">Complete Details - {payrollUser?.displayName}</h4>

                    <div className="grid grid-cols-1 gap-4">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm text-blue-600">Statutory Deductions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="flex justify-between">
                            <span>EPF:</span>
                            <span className="font-medium">{formatCurrency(payroll.epfDeduction)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>ESI:</span>
                            <span className="font-medium">{formatCurrency(payroll.esiDeduction)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>VPT:</span>
                            <span className="font-medium">{formatCurrency(payroll.vptDeduction)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>TDS:</span>
                            <span className="font-medium">{formatCurrency(payroll.tdsDeduction)}</span>
                          </div>
                        </CardContent>
                      </Card>

                      {Object.keys(payroll.dynamicEarnings).length > 0 && (
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm text-green-600">Additional Earnings</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {Object.entries(payroll.dynamicEarnings).map(([key, value]) => {
                              const field = earningsFields.find(f => f.name === key);
                              return (
                                <div key={key} className="flex justify-between">
                                  <span>{field?.displayName || key}:</span>
                                  <span className="font-medium">{formatCurrency(value as number)}</span>
                                </div>
                              );
                            })}
                          </CardContent>
                        </Card>
                      )}

                      {Object.keys(payroll.dynamicDeductions).length > 0 && (
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm text-red-600">Additional Deductions</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {Object.entries(payroll.dynamicDeductions).map(([key, value]) => {
                              const field = deductionsFields.find(f => f.name === key);
                              return (
                                <div key={key} className="flex justify-between">
                                  <span>{field?.displayName || key}:</span>
                                  <span className="font-medium">{formatCurrency(value as number)}</span>
                                </div>
                              );
                            })}
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Desktop Table Layout */}
      <div className="hidden lg:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Employee Details</TableHead>
              <TableHead>Attendance & Days</TableHead>
              <TableHead>Basic Earnings</TableHead>
              <TableHead>Overtime Details</TableHead>
              <TableHead>Gross & Net</TableHead>
              <TableHead>Statutory Deductions</TableHead>
              <TableHead>Status & Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPayrolls.map((payroll) => {
              const payrollUser = users.find((u: any) => u.id === payroll.userId);
              const isExpanded = expandedRows.has(payroll.id);
              const { overtimeHours, overtimePay, perHourRate } = calculateOvertimeDetails(payroll);

              return (
                <React.Fragment key={payroll.id}>
                  <TableRow className="hover:bg-gray-50">
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleRowExpansion(payroll.id)}
                        className="p-1"
                      >
                        {isExpanded ? "−" : "+"}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{payrollUser?.displayName}</div>
                        <div className="text-sm text-muted-foreground">{payroll.employeeId}</div>
                        <Badge variant="outline" className="text-xs">
                          {payrollUser?.department?.toUpperCase() || 'N/A'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        <div>Present: {payroll.presentDays}/{payroll.monthDays}</div>
                        <div>Leave: {payroll.paidLeaveDays || 0} days</div>
                        <div>Per Day: {formatCurrency(payroll.perDaySalary)}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        <div>Basic: {formatCurrency(payroll.earnedBasic)}</div>
                        <div>HRA: {formatCurrency(payroll.earnedHRA)}</div>
                        <div>Conv: {formatCurrency(payroll.earnedConveyance)}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        <div className="font-medium text-orange-600">{overtimeHours.toFixed(1)} hrs</div>
                        <div>{formatCurrency(overtimePay)}</div>
                        {perHourRate > 0 && (
                          <div className="text-muted-foreground">@{formatCurrency(perHourRate)}/hr</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium text-green-600">{formatCurrency(payroll.totalEarnings)}</div>
                        <div className="text-sm text-red-600">-{formatCurrency(payroll.totalDeductions)}</div>
                        <div className="font-bold border-t pt-1">{formatCurrency(payroll.netSalary)}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        <div>EPF: {formatCurrency(payroll.epfDeduction)}</div>
                        <div>ESI: {formatCurrency(payroll.esiDeduction)}</div>
                        {payroll.vptDeduction > 0 && (
                          <div>VPT: {formatCurrency(payroll.vptDeduction)}</div>
                        )}
                        {payroll.tdsDeduction > 0 && (
                          <div>TDS: {formatCurrency(payroll.tdsDeduction)}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-2">
                        <Badge className={getStatusColor(payroll.status)}>
                          {payroll.status}
                        </Badge>
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => onEdit(payroll.id)}
                            title="Edit Payroll"
                          >
                            <Edit3 className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => toggleRowExpansion(payroll.id)}
                            title="View Details"
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Expanded Row Details */}
                  {isExpanded && (
                    <TableRow className="bg-gray-50">
                      <TableCell colSpan={8}>
                        <div className="p-4 space-y-4">
                          <h4 className="font-semibold text-lg">Comprehensive Payroll Details - {payrollUser?.displayName}</h4>

                          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            {/* Attendance Details */}
                            <Card>
                              <CardHeader className="pb-3">
                                <CardTitle className="text-sm text-blue-600">Attendance Details</CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-2">
                                <div className="flex justify-between">
                                  <span>Month Days:</span>
                                  <span className="font-medium">{payroll.monthDays}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Present Days:</span>
                                  <span className="font-medium">{payroll.presentDays}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Paid Leave:</span>
                                  <span className="font-medium">{payroll.paidLeaveDays || 0}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Overtime Hours:</span>
                                  <span className="font-medium text-orange-600">{overtimeHours.toFixed(1)}</span>
                                </div>
                                <div className="border-t pt-2 flex justify-between font-bold">
                                  <span>Per Day Salary:</span>
                                  <span>{formatCurrency(payroll.perDaySalary)}</span>
                                </div>
                              </CardContent>
                            </Card>

                            {/* Earnings Breakdown */}
                            <Card>
                              <CardHeader className="pb-3">
                                <CardTitle className="text-sm text-green-600">Earnings Breakdown</CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-2">
                                <div className="flex justify-between">
                                  <span>Earned Basic:</span>
                                  <span className="font-medium">{formatCurrency(payroll.earnedBasic)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Earned HRA:</span>
                                  <span className="font-medium">{formatCurrency(payroll.earnedHRA)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Earned Conveyance:</span>
                                  <span className="font-medium">{formatCurrency(payroll.earnedConveyance)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Overtime Pay:</span>
                                  <span className="font-medium text-orange-600">{formatCurrency(overtimePay)}</span>
                                </div>

                                {Object.keys(payroll.dynamicEarnings || {}).length > 0 && (
                                  <>
                                    <div className="border-t pt-2 mt-2">
                                      <div className="text-sm font-medium text-muted-foreground mb-1">Additional Earnings:</div>
                                      {Object.entries(payroll.dynamicEarnings || {}).map(([key, value]) => (
                                        <div key={key} className="flex justify-between text-sm">
                                          <span>{key}:</span>
                                          <span>{formatCurrency(value)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </>
                                )}

                                <div className="border-t pt-2 flex justify-between font-bold text-green-600">
                                  <span>Total Earnings:</span>
                                  <span>{formatCurrency(payroll.totalEarnings)}</span>
                                </div>
                              </CardContent>
                            </Card>

                            {/* Deductions Breakdown */}
                            <Card>
                              <CardHeader className="pb-3">
                                <CardTitle className="text-sm text-red-600">Deductions Breakdown</CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-2">
                                <div className="flex justify-between">
                                  <span>EPF:</span>
                                  <span className="font-medium">{formatCurrency(payroll.epfDeduction)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>ESI:</span>
                                  <span className="font-medium">{formatCurrency(payroll.esiDeduction)}</span>
                                </div>
                                {payroll.vptDeduction > 0 && (
                                  <div className="flex justify-between">
                                    <span>VPT:</span>
                                    <span className="font-medium">{formatCurrency(payroll.vptDeduction)}</span>
                                  </div>
                                )}
                                {payroll.tdsDeduction > 0 && (
                                  <div className="flex justify-between">
                                    <span>TDS:</span>
                                    <span className="font-medium">{formatCurrency(payroll.tdsDeduction)}</span>
                                  </div>
                                )}

                                {Object.keys(payroll.dynamicDeductions || {}).length > 0 && (
                                  <>
                                    <div className="border-t pt-2 mt-2">
                                      <div className="text-sm font-medium text-muted-foreground mb-1">Other Deductions:</div>
                                      {Object.entries(payroll.dynamicDeductions || {}).map(([key, value]) => (
                                        <div key={key} className="flex justify-between text-sm">
                                          <span>{key}:</span>
                                          <span>{formatCurrency(value)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </>
                                )}

                                <div className="border-t pt-2 flex justify-between font-bold text-red-600">
                                  <span>Total Deductions:</span>
                                  <span>{formatCurrency(payroll.totalDeductions)}</span>
                                </div>
                              </CardContent>
                            </Card>

                            {/* Processing Information */}
                            <Card>
                              <CardHeader className="pb-3">
                                <CardTitle className="text-sm text-purple-600">Processing Info</CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-2">
                                <div className="flex justify-between">
                                  <span>Status:</span>
                                  <Badge className={getStatusColor(payroll.status)}>
                                    {payroll.status}
                                  </Badge>
                                </div>
                                {payroll.processedBy && (
                                  <div className="flex justify-between">
                                    <span>Processed By:</span>
                                    <span className="font-medium">{payroll.processedBy}</span>
                                  </div>
                                )}
                                {payroll.processedAt && (
                                  <div className="flex justify-between">
                                    <span>Processed At:</span>
                                    <span className="font-medium">{new Date(payroll.processedAt).toLocaleDateString()}</span>
                                  </div>
                                )}
                                {payroll.approvedBy && (
                                  <div className="flex justify-between">
                                    <span>Approved By:</span>
                                    <span className="font-medium">{payroll.approvedBy}</span>
                                  </div>
                                )}
                                {payroll.remarks && (
                                  <div className="mt-2">
                                    <div className="text-sm font-medium text-muted-foreground mb-1">Remarks:</div>
                                    <div className="text-sm bg-gray-100 p-2 rounded">{payroll.remarks}</div>
                                  </div>
                                )}
                                <div className="border-t pt-2 flex justify-between font-bold text-blue-600">
                                  <span>Net Salary:</span>
                                  <span>{formatCurrency(payroll.netSalary)}</span>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {filteredPayrolls.length === 0 && (
        <div className="text-center py-8">
          <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No payroll records found</h3>
          <p className="text-muted-foreground">
            {payrolls.length === 0
              ? "Process payroll for the selected month to see data here."
              : "No payroll records match the selected filters."
            }
          </p>
        </div>
      )}
    </div>
  );
}

// Enhanced Salary Structures Table Component  
function SalaryStructuresTable({
  structures,
  users,
  earningsFields,
  deductionsFields
}: {
  structures: EnhancedSalaryStructure[];
  users: User[];
  earningsFields: PayrollFieldConfig[];
  deductionsFields: PayrollFieldConfig[];
}) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [filterDepartment, setFilterDepartment] = useState<string>("all");
  const [salaryRangeFilter, setSalaryRangeFilter] = useState<string>("all");

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);

  const toggleRowExpansion = (structureId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(structureId)) {
      newExpanded.delete(structureId);
    } else {
      newExpanded.add(structureId);
    }
    setExpandedRows(newExpanded);
  };

  const calculateGrossSalary = (structure: EnhancedSalaryStructure) => {
    const customEarningsTotal = Object.values(structure.customEarnings || {}).reduce((sum, val) => sum + val, 0);
    return structure.fixedBasic + structure.fixedHRA + structure.fixedConveyance + customEarningsTotal;
  };

  const calculateTotalDeductions = (structure: EnhancedSalaryStructure) => {
    const customDeductionsTotal = Object.values(structure.customDeductions || {}).reduce((sum, val) => sum + val, 0);
    const epfAmount = structure.epfApplicable ? (structure.fixedBasic * 0.12) : 0;
    const grossSalary = calculateGrossSalary(structure);
    const esiAmount = structure.esiApplicable && grossSalary <= 21000 ? (grossSalary * 0.0075) : 0;
    const vptAmount = structure.vptAmount || 0;

    // Check for individual deduction fields (stored as direct properties from form submission)
    const structureAny = structure as any; // Type assertion to access dynamic fields
    const tdsAmount = structureAny.tdsDeduction || 0;
    const loanAmount = structureAny.loanDeduction || 0;
    const advanceAmount = structureAny.advanceDeduction || 0;
    const fineAmount = structureAny.fineDeduction || 0;
    const creditAmount = structureAny.creditDeduction || 0;

    // Debug logging to understand the calculation
    const totalDeductions = epfAmount + esiAmount + vptAmount + tdsAmount + loanAmount +
      advanceAmount + fineAmount + creditAmount + customDeductionsTotal;

    console.log('DEBUG calculateTotalDeductions:', {
      epfAmount, esiAmount, vptAmount, tdsAmount, loanAmount,
      advanceAmount, fineAmount, creditAmount, customDeductionsTotal, totalDeductions,
      structureId: structure.id
    });

    return totalDeductions;
  };

  const filteredStructures = structures.filter(structure => {
    const structureUser = users.find((u: any) => u.id === structure.userId);
    const departmentMatch = filterDepartment === "all" || structureUser?.department === filterDepartment;

    const grossSalary = calculateGrossSalary(structure);
    let salaryRangeMatch = true;

    if (salaryRangeFilter !== "all") {
      switch (salaryRangeFilter) {
        case "0-25000":
          salaryRangeMatch = grossSalary <= 25000;
          break;
        case "25000-50000":
          salaryRangeMatch = grossSalary > 25000 && grossSalary <= 50000;
          break;
        case "50000-100000":
          salaryRangeMatch = grossSalary > 50000 && grossSalary <= 100000;
          break;
        case "100000+":
          salaryRangeMatch = grossSalary > 100000;
          break;
      }
    }

    return departmentMatch && salaryRangeMatch;
  });

  const departments = ["operations", "admin", "hr", "marketing", "sales", "technical", "housekeeping"];

  // Summary calculations
  const totalStructures = filteredStructures.length;
  const totalGrossPayroll = filteredStructures.reduce((sum, s) => sum + calculateGrossSalary(s), 0);
  const totalDeductions = filteredStructures.reduce((sum, s) => sum + calculateTotalDeductions(s), 0);
  const averageSalary = totalStructures > 0 ? totalGrossPayroll / totalStructures : 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Structures</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStructures}</div>
            <p className="text-xs text-muted-foreground">Active salary structures</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Gross Payroll</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalGrossPayroll)}</div>
            <p className="text-xs text-muted-foreground">Monthly gross payroll</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Deductions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalDeductions)}</div>
            <p className="text-xs text-muted-foreground">Monthly deductions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Average Salary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(averageSalary)}</div>
            <p className="text-xs text-muted-foreground">Average gross salary</p>
          </CardContent>
        </Card>
      </div>

      {/* Advanced Filters */}
      <div className="flex flex-wrap gap-4 p-4 bg-gray-50 rounded-lg">
        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="department-filter">Filter by Department</Label>
          <Select value={filterDepartment} onValueChange={setFilterDepartment}>
            <SelectTrigger>
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map(dept => (
                <SelectItem key={dept} value={dept}>
                  {dept.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="salary-range-filter">Filter by Salary Range</Label>
          <Select value={salaryRangeFilter} onValueChange={setSalaryRangeFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All Ranges" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Ranges</SelectItem>
              <SelectItem value="0-25000">₹0 - ₹25,000</SelectItem>
              <SelectItem value="25000-50000">₹25,000 - ₹50,000</SelectItem>
              <SelectItem value="50000-100000">₹50,000 - ₹1,00,000</SelectItem>
              <SelectItem value="100000+">₹1,00,000+</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Enhanced Table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Employee Details</TableHead>
              <TableHead>Fixed Salary Components</TableHead>
              <TableHead>Day Structure</TableHead>
              <TableHead>Gross & Net</TableHead>
              <TableHead>Statutory</TableHead>
              <TableHead>Configuration</TableHead>
              <TableHead>Status & Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStructures.map((structure) => {
              const structureUser = users.find((u: any) => u.id === structure.userId);
              const customEarningsTotal = Object.values(structure.customEarnings || {}).reduce((sum, val) => sum + val, 0);
              const customDeductionsTotal = Object.values(structure.customDeductions || {}).reduce((sum, val) => sum + val, 0);
              const grossSalary = calculateGrossSalary(structure);
              const totalDeductions = calculateTotalDeductions(structure);
              const netSalary = grossSalary - totalDeductions;
              const isExpanded = expandedRows.has(structure.id);

              return (
                <React.Fragment key={structure.id}>
                  <TableRow className="hover:bg-gray-50">
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleRowExpansion(structure.id)}
                        className="p-1"
                      >
                        {isExpanded ? "−" : "+"}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{structureUser?.displayName}</div>
                        <div className="text-sm text-muted-foreground">{structure.employeeId}</div>
                        <Badge variant="outline" className="text-xs">
                          {structureUser?.department?.toUpperCase() || 'N/A'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        <div>Basic: {formatCurrency(structure.fixedBasic)}</div>
                        <div>HRA: {formatCurrency(structure.fixedHRA)}</div>
                        <div>Conv: {formatCurrency(structure.fixedConveyance)}</div>
                        {customEarningsTotal > 0 && (
                          <div className="text-green-600">+{formatCurrency(customEarningsTotal)}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        <div>Base: {structure.perDaySalaryBase || 'basic'}</div>
                        {/* OT Rate removed - company-wide 1.0x for all */}
                        <div className="text-muted-foreground">Per day calculated</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium text-green-600">{formatCurrency(grossSalary)}</div>
                        <div className="text-sm text-red-600">-{formatCurrency(totalDeductions)}</div>
                        <div className="font-bold border-t pt-1">{formatCurrency(netSalary)}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        <div className={`px-2 py-1 rounded text-xs ${structure.epfApplicable ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                          EPF: {structure.epfApplicable ? "Yes" : "No"}
                        </div>
                        <div className={`px-2 py-1 rounded text-xs ${structure.esiApplicable ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                          ESI: {structure.esiApplicable ? "Yes" : "No"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        <div>VPT: {formatCurrency(structure.vptAmount || 0)}</div>
                        <div className="text-muted-foreground">
                          Since: {new Date(structure.effectiveFrom).toLocaleDateString()}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-2">
                        <Badge className="text-xs bg-green-100 text-green-800">
                          {structure.isActive ? "Active" : "Inactive"}
                        </Badge>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                            <Edit3 className="h-3 w-3" />
                          </Button>
                          <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                            <Eye className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Expanded Row Details */}
                  {isExpanded && (
                    <TableRow className="bg-gray-50">
                      <TableCell colSpan={8}>
                        <div className="p-4 space-y-4">
                          <h4 className="font-semibold text-lg">Detailed Salary Breakdown - {structureUser?.displayName}</h4>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Earnings Breakdown */}
                            <Card>
                              <CardHeader className="pb-3">
                                <CardTitle className="text-sm text-green-600">Earnings Components</CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-2">
                                <div className="flex justify-between">
                                  <span>Fixed Basic:</span>
                                  <span className="font-medium">{formatCurrency(structure.fixedBasic)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Fixed HRA:</span>
                                  <span className="font-medium">{formatCurrency(structure.fixedHRA)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Fixed Conveyance:</span>
                                  <span className="font-medium">{formatCurrency(structure.fixedConveyance)}</span>
                                </div>

                                {Object.keys(structure.customEarnings || {}).length > 0 && (
                                  <>
                                    <div className="border-t pt-2 mt-2">
                                      <div className="text-sm font-medium text-muted-foreground mb-1">Custom Earnings:</div>
                                      {Object.entries(structure.customEarnings || {}).map(([key, value]) => (
                                        <div key={key} className="flex justify-between text-sm">
                                          <span>{key}:</span>
                                          <span>{formatCurrency(value)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </>
                                )}

                                <div className="border-t pt-2 flex justify-between font-bold text-green-600">
                                  <span>Gross Earnings:</span>
                                  <span>{formatCurrency(grossSalary)}</span>
                                </div>
                              </CardContent>
                            </Card>

                            {/* Deductions Breakdown */}
                            <Card>
                              <CardHeader className="pb-3">
                                <CardTitle className="text-sm text-red-600">Deductions & Company Cost</CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-2">
                                {structure.epfApplicable && (
                                  <div className="flex justify-between">
                                    <span>Employee EPF (12%):</span>
                                    <span className="font-medium">{formatCurrency(structure.epfDeduction)}</span>
                                  </div>
                                )}
                                {structure.esiApplicable && (
                                  <div className="flex justify-between">
                                    <span>Employee ESI (0.75%):</span>
                                    <span className="font-medium">{formatCurrency(structure.esiDeduction)}</span>
                                  </div>
                                )}
                                <div className="border-t pt-2 my-2 border-gray-100"></div>
                                {/* Employer Contributions (Admin View) */}
                                {(user?.role === 'admin' || user?.role === 'master_admin') && (
                                  <>
                                    <div className="flex justify-between text-gray-500 text-xs">
                                      <span>Employer EPF (13%):</span>
                                      <span>{formatCurrency(structure.employerEPF || 0)}</span>
                                    </div>
                                    <div className="flex justify-between text-gray-500 text-xs">
                                      <span>Employer ESI (3.25%):</span>
                                      <span>{formatCurrency(structure.employerESI || 0)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs font-semibold text-gray-600 mt-1">
                                      <span>Cost to Company (CTC):</span>
                                      <span>{formatCurrency(structure.ctc || 0)}</span>
                                    </div>
                                  </>
                                )}
                                <div className="border-t pt-2 mt-2 flex justify-between font-bold text-red-600">
                                  <span>Total Deductions:</span>
                                  <span>{formatCurrency(totalDeductions)}</span>
                                </div>
                              </CardContent>
                            </Card>

                            {/* Configuration & Actions */}
                            <Card>
                              <CardHeader className="pb-3">
                                <CardTitle className="text-sm text-blue-600">Actions</CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-4">
                                <Button
                                  variant="outline"
                                  className="w-full justify-start"
                                  onClick={() => {
                                    window.open(`/api/payroll/${structure.id}/payslip`, '_blank');
                                  }}
                                >
                                  <Printer className="mr-2 h-4 w-4" />
                                  Print Payslip
                                </Button>
                                <div className="border-t pt-2 flex justify-between font-bold text-blue-600">
                                  <span>Net Salary:</span>
                                  <span>{formatCurrency(netSalary)}</span>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {filteredStructures.length === 0 && (
        <div className="text-center py-8">
          <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No salary structures found</h3>
          <p className="text-muted-foreground">
            {structures.length === 0
              ? "Create salary structures to see data here."
              : "No structures match the selected filters."
            }
          </p>
        </div>
      )}
    </div>
  );
}

// Field Configuration Table Component
function FieldConfigTable({ fieldConfigs }: { fieldConfigs: PayrollFieldConfig[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Field Name</TableHead>
            <TableHead>Display Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Data Type</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Required</TableHead>
            <TableHead>System Field</TableHead>
            <TableHead>Sort Order</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fieldConfigs.map((field) => (
            <TableRow key={field.id}>
              <TableCell className="font-medium">{field.name}</TableCell>
              <TableCell>{field.displayName}</TableCell>
              <TableCell>
                <Badge variant={field.category === "earnings" ? "default" : "secondary"}>
                  {field.category}
                </Badge>
              </TableCell>
              <TableCell>{field.dataType}</TableCell>
              <TableCell>{field.department?.toUpperCase() || "All"}</TableCell>
              <TableCell>{field.isRequired ? "Yes" : "No"}</TableCell>
              <TableCell>{field.isSystemField ? "Yes" : "No"}</TableCell>
              <TableCell>{field.sortOrder}</TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={field.isSystemField}>
                    <Edit3 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// Salary Structure Form Component
function SalaryStructureForm({
  users,
  earningsFields,
  deductionsFields,
  settings,
  onSubmit
}: {
  users: User[];
  earningsFields: PayrollFieldConfig[];
  deductionsFields: PayrollFieldConfig[];
  settings?: EnhancedPayrollSettings;
  onSubmit: (data: any) => void;
}) {
  const [formData, setFormData] = useState({
    // Employee Information
    userId: "",
    employeeId: "",
    designation: "",
    department: "",
    dateOfJoining: "",

    // Fixed Salary Components (Monthly)
    fixedSalary: 0,
    fixedBasic: 0,
    fixedHRA: 0,
    fixedConveyance: 0,

    // Day Structure
    monthDays: settings?.standardWorkingDays || 26,
    perDaySalary: 0,
    workingDays: settings?.standardWorkingDays || 26,
    monthWorkingHours: 0,
    perDayWorkingHours: 8,
    // Note: OT rate is company-wide (1.0x for all)

    // Earnings
    earnedBasic: 0,
    earnedHRA: 0,
    earnedConveyance: 0,
    otherEarnings: 0,
    grossSalary: 0,
    // Note: OT Hours/Pay removed - calculated monthly from OT sessions

    // Deductions
    epfDeduction: 0,
    esiDeduction: 0,
    vptDeduction: 0,
    tdsDeduction: 0,
    loanDeduction: 0,
    advanceDeduction: 0,
    fineDeduction: 0,
    creditDeduction: 0,
    totalDeductions: 0,

    // Final Salary
    netSalary: 0,

    // Configuration
    perDaySalaryBase: "basic_hra" as "basic" | "basic_hra" | "gross",
    epfApplicable: true,
    esiApplicable: true,
    autoCalculate: true,
    effectiveFrom: new Date().toISOString().split('T')[0],

    // Custom fields
    customEarnings: {} as Record<string, number>,
    customDeductions: {} as Record<string, number>,

    // Remarks
    remarks: ""
  });

  // Note: OT calculation removed from Salary Structure form
  // OT Hours come from OT sessions and are calculated during monthly payroll processing

  const selectedUser = users.find(u => u.id === formData.userId);

  // Auto-calculation when values change
  React.useEffect(() => {
    if (formData.autoCalculate) {
      calculateSalary();
    }
  }, [
    formData.fixedSalary,
    formData.fixedBasic,
    formData.fixedHRA,
    formData.fixedConveyance,
    formData.monthDays,
    formData.workingDays,
    formData.overtimePay,
    formData.epfApplicable,
    formData.esiApplicable,
    formData.autoCalculate
  ]);

  // Update total deductions when manual deduction values change (when auto-calculation is off)
  React.useEffect(() => {
    if (!formData.autoCalculate) {
      const totalDeductions = formData.epfDeduction + formData.esiDeduction + formData.vptDeduction +
        formData.tdsDeduction + formData.loanDeduction + formData.advanceDeduction +
        formData.fineDeduction + formData.creditDeduction;

      // Calculate total earnings for net salary (OT added in monthly payroll)
      const totalEarnings = formData.earnedBasic + formData.earnedHRA + formData.earnedConveyance +
        formData.otherEarnings; // OT Pay calculated monthly from OT sessions
      const netSalary = totalEarnings - totalDeductions;

      setFormData(prev => ({
        ...prev,
        totalDeductions: Math.round(totalDeductions),
        netSalary: Math.round(netSalary)
      }));
    }
  }, [
    formData.epfDeduction,
    formData.esiDeduction,
    formData.vptDeduction,
    formData.tdsDeduction,
    formData.loanDeduction,
    formData.advanceDeduction,
    formData.fineDeduction,
    formData.creditDeduction,
    formData.earnedBasic,
    formData.earnedHRA,
    formData.earnedConveyance,
    formData.otherEarnings,
    formData.overtimePay,
    formData.autoCalculate
  ]);

  const calculateSalary = () => {
    const gross = formData.fixedBasic + formData.fixedHRA + formData.fixedConveyance + formData.otherEarnings;
    const perDay = gross / formData.monthDays;
    const earnedBasic = (formData.fixedBasic / formData.monthDays) * formData.workingDays;
    const earnedHRA = (formData.fixedHRA / formData.monthDays) * formData.workingDays;
    const earnedConveyance = (formData.fixedConveyance / formData.monthDays) * formData.workingDays;

    // Statutory deductions using global settings
    let epf = 0, esi = 0;
    const epfCeiling = settings?.epfCeiling || 15000;
    const epfRate = (settings?.epfEmployeeRate || 12) / 100;
    const esiThreshold = settings?.esiThreshold || 21000;
    const esiRate = (settings?.esiEmployeeRate || 0.75) / 100;

    if (formData.epfApplicable) {
      // EPF is calculated ONLY on Basic salary (statutory requirement)
      // Apply to actual Basic if below ceiling, otherwise apply to ceiling
      const epfBasis = Math.min(formData.fixedBasic, epfCeiling);
      epf = epfBasis * epfRate;
    }
    if (formData.esiApplicable && gross <= esiThreshold) {
      // ESI is calculated on Gross salary
      esi = gross * esiRate;
    }

    const totalDeductions = epf + esi + formData.vptDeduction + formData.tdsDeduction +
      formData.loanDeduction + formData.advanceDeduction +
      formData.fineDeduction + formData.creditDeduction;

    const totalEarnings = earnedBasic + earnedHRA + earnedConveyance + formData.otherEarnings; // OT in monthly payroll
    const netSalary = totalEarnings - totalDeductions;

    setFormData(prev => ({
      ...prev,
      perDaySalary: Math.round(perDay),
      earnedBasic: Math.round(earnedBasic),
      earnedHRA: Math.round(earnedHRA),
      earnedConveyance: Math.round(earnedConveyance),
      grossSalary: Math.round(gross),
      epfDeduction: Math.round(epf),
      esiDeduction: Math.round(esi),
      totalDeductions: Math.round(totalDeductions),
      netSalary: Math.round(netSalary)
    }));
  };

  const handleUserChange = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (user) {
      setFormData(prev => ({
        ...prev,
        userId,
        employeeId: user.employeeId || user.uid || "",
        designation: user.designation || "",
        department: user.department || ""
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      employeeId: selectedUser?.employeeId || selectedUser?.uid || "",
      effectiveFrom: new Date(formData.effectiveFrom),
      isActive: true
    });
  };



  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Employee Information */}
      <div className="bg-gray-50 p-6 rounded-lg">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Users className="h-5 w-5" />
          Employee Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Label htmlFor="userId">Employee ({users?.length || 0} available)</Label>
            <Select value={formData.userId} onValueChange={handleUserChange}>
              <SelectTrigger>
                <SelectValue placeholder={users?.length > 0 ? "Select Employee" : "Loading employees..."} />
              </SelectTrigger>
              <SelectContent>
                {users?.length > 0 ? (
                  users.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.displayName || user.email} ({user.department?.toUpperCase() || 'N/A'})
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="no-users" disabled>
                    No employees found
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="designation">Designation</Label>
            <Input
              id="designation"
              value={formData.designation}
              onChange={(e) => setFormData(prev => ({ ...prev, designation: e.target.value }))}
              placeholder="Auto-filled from user"
              readOnly
            />
          </div>
          <div>
            <Label htmlFor="department">Department</Label>
            <Input
              id="department"
              value={formData.department}
              onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
              placeholder="Auto-filled from user"
              readOnly
            />
          </div>
          <div>
            <Label htmlFor="effectiveFrom">Effective From</Label>
            <Input
              id="effectiveFrom"
              type="date"
              value={formData.effectiveFrom}
              onChange={(e) => setFormData(prev => ({ ...prev, effectiveFrom: e.target.value }))}
              required
            />
          </div>
        </div>
      </div>

      {/* Fixed Salary Structure */}
      <div className="bg-green-50 p-6 rounded-lg">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Fixed Salary Structure (Monthly)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Label htmlFor="fixedSalary">Fixed Salary</Label>
            <Input
              id="fixedSalary"
              type="number"
              value={formData.fixedSalary}
              onChange={(e) => setFormData(prev => ({ ...prev, fixedSalary: parseFloat(e.target.value) || 0 }))}
              required
            />
          </div>
          <div>
            <Label htmlFor="fixedBasic">Fixed Basic</Label>
            <Input
              id="fixedBasic"
              type="number"
              value={formData.fixedBasic}
              onChange={(e) => setFormData(prev => ({ ...prev, fixedBasic: parseFloat(e.target.value) || 0 }))}
              required
            />
          </div>
          <div>
            <Label htmlFor="fixedHRA">Fixed HRA</Label>
            <Input
              id="fixedHRA"
              type="number"
              value={formData.fixedHRA}
              onChange={(e) => setFormData(prev => ({ ...prev, fixedHRA: parseFloat(e.target.value) || 0 }))}
              required
            />
          </div>
          <div>
            <Label htmlFor="fixedConveyance">Fixed Conveyance</Label>
            <Input
              id="fixedConveyance"
              type="number"
              value={formData.fixedConveyance}
              onChange={(e) => setFormData(prev => ({ ...prev, fixedConveyance: parseFloat(e.target.value) || 0 }))}
              required
            />
          </div>
        </div>
      </div>

      {/* Day Structure */}
      <div className="bg-blue-50 p-6 rounded-lg">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Day Structure & Working Hours
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="monthDays">Month Days <span className="text-sm text-gray-500">(Auto-calculated)</span></Label>
            <Input
              id="monthDays"
              type="number"
              value={formData.monthDays}
              readOnly
              className="bg-blue-50 border-blue-200"
              title="Automatically calculated based on selected month/year"
            />
          </div>
          <div>
            <Label htmlFor="perDaySalary">Per Day Salary</Label>
            <Input
              id="perDaySalary"
              type="number"
              value={formData.perDaySalary}
              readOnly
              className="bg-gray-100"
            />
          </div>
          <div>
            <Label htmlFor="perDayWorkingHours">Per Day Hours</Label>
            <Input
              id="perDayWorkingHours"
              type="number"
              value={formData.perDayWorkingHours}
              onChange={(e) => setFormData(prev => ({ ...prev, perDayWorkingHours: parseFloat(e.target.value) || 8 }))}
              required
            />
          </div>
          {/* OT Rate removed - using company-wide rate (1.0x) */}
        </div>
      </div>

      {/* Fixed Salary Section */}
      <div className="bg-yellow-50 p-6 rounded-lg">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Projected Monthly Salary (Based on Full Attendance)
        </h3>
        <p className="text-sm text-gray-600 mb-4">Preview of monthly salary with full attendance. Actual monthly pay calculated from attendance + OT sessions.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <div>
            <Label htmlFor="earnedBasic">Monthly Basic (Auto-calculated from attendance)</Label>
            <Input
              id="earnedBasic"
              type="number"
              value={formData.earnedBasic}
              readOnly
              className="bg-gray-100"
            />
          </div>
          <div>
            <Label htmlFor="earnedHRA">Monthly HRA (Auto-calculated from attendance)</Label>
            <Input
              id="earnedHRA"
              type="number"
              value={formData.earnedHRA}
              readOnly
              className="bg-gray-100"
            />
          </div>
          <div>
            <Label htmlFor="earnedConveyance">Monthly Conveyance (Auto-calculated from attendance)</Label>
            <Input
              id="earnedConveyance"
              type="number"
              value={formData.earnedConveyance}
              readOnly
              className="bg-gray-100"
            />
          </div>
          <div>
            <Label htmlFor="otherEarnings">Other Earnings</Label>
            <Input
              id="otherEarnings"
              type="number"
              value={formData.otherEarnings}
              onChange={(e) => setFormData(prev => ({ ...prev, otherEarnings: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          {/* Overtime Pay removed - calculated monthly from OT sessions during payroll processing */}
          <div>
            <Label htmlFor="grossSalary">Gross Salary</Label>
            <Input
              id="grossSalary"
              type="number"
              value={formData.grossSalary}
              readOnly
              className="bg-gray-100 font-bold"
            />
          </div>
        </div>
      </div>

      {/* Deductions */}
      <div className="bg-red-50 p-6 rounded-lg">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Deductions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <Label htmlFor="epfDeduction">EPF</Label>
            <Input
              id="epfDeduction"
              type="number"
              value={formData.epfDeduction}
              onChange={(e) => setFormData(prev => ({ ...prev, epfDeduction: parseFloat(e.target.value) || 0 }))}
              readOnly={formData.autoCalculate}
              className={formData.autoCalculate ? "bg-gray-100" : ""}
            />
          </div>
          <div>
            <Label htmlFor="esiDeduction">ESI</Label>
            <Input
              id="esiDeduction"
              type="number"
              value={formData.esiDeduction}
              onChange={(e) => setFormData(prev => ({ ...prev, esiDeduction: parseFloat(e.target.value) || 0 }))}
              readOnly={formData.autoCalculate}
              className={formData.autoCalculate ? "bg-gray-100" : ""}
            />
          </div>
          <div>
            <Label htmlFor="vptDeduction">VPT</Label>
            <Input
              id="vptDeduction"
              type="number"
              value={formData.vptDeduction}
              onChange={(e) => setFormData(prev => ({ ...prev, vptDeduction: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div>
            <Label htmlFor="tdsDeduction">TDS</Label>
            <Input
              id="tdsDeduction"
              type="number"
              value={formData.tdsDeduction}
              onChange={(e) => setFormData(prev => ({ ...prev, tdsDeduction: parseFloat(e.target.value) || 0 }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <Label htmlFor="loanDeduction">Loan</Label>
            <Input
              id="loanDeduction"
              type="number"
              value={formData.loanDeduction}
              onChange={(e) => setFormData(prev => ({ ...prev, loanDeduction: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div>
            <Label htmlFor="advanceDeduction">Advance</Label>
            <Input
              id="advanceDeduction"
              type="number"
              value={formData.advanceDeduction}
              onChange={(e) => setFormData(prev => ({ ...prev, advanceDeduction: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div>
            <Label htmlFor="fineDeduction">Fine</Label>
            <Input
              id="fineDeduction"
              type="number"
              value={formData.fineDeduction}
              onChange={(e) => setFormData(prev => ({ ...prev, fineDeduction: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div>
            <Label htmlFor="creditDeduction">Credit</Label>
            <Input
              id="creditDeduction"
              type="number"
              value={formData.creditDeduction}
              onChange={(e) => setFormData(prev => ({ ...prev, creditDeduction: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div>
            <Label htmlFor="totalDeductions">Total Deductions</Label>
            <Input
              id="totalDeductions"
              type="number"
              value={formData.totalDeductions}
              readOnly
              className="bg-gray-100 font-bold"
            />
          </div>
        </div>
      </div>

      {/* Configuration & Controls */}
      <div className="bg-purple-50 p-6 rounded-lg">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Configuration & Final Salary
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <Label htmlFor="perDaySalaryBase">Per Day Salary Base</Label>
            <Select value={formData.perDaySalaryBase} onValueChange={(value: "basic" | "basic_hra" | "gross") =>
              setFormData(prev => ({ ...prev, perDaySalaryBase: value }))
            }>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">Basic Only</SelectItem>
                <SelectItem value="basic_hra">Basic + HRA</SelectItem>
                <SelectItem value="gross">Gross Salary</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center space-x-2 pt-6">
            <Checkbox
              id="epfApplicable"
              checked={formData.epfApplicable}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, epfApplicable: Boolean(checked) }))}
            />
            <Label htmlFor="epfApplicable">EPF Applicable</Label>
          </div>
          <div className="flex items-center space-x-2 pt-6">
            <Checkbox
              id="esiApplicable"
              checked={formData.esiApplicable}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, esiApplicable: Boolean(checked) }))}
            />
            <Label htmlFor="esiApplicable">ESI Applicable</Label>
          </div>
          <div className="flex items-center space-x-2 pt-6">
            <Checkbox
              id="autoCalculate"
              checked={formData.autoCalculate}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, autoCalculate: Boolean(checked) }))}
            />
            <Label htmlFor="autoCalculate">Auto Calculate</Label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="netSalary">Net Salary</Label>
            <Input
              id="netSalary"
              type="number"
              value={formData.netSalary}
              readOnly
              className="bg-green-100 font-bold text-lg"
            />
          </div>
          <div>
            <Label htmlFor="remarks">Remarks</Label>
            <Input
              id="remarks"
              value={formData.remarks}
              onChange={(e) => setFormData(prev => ({ ...prev, remarks: e.target.value }))}
              placeholder="Additional notes or comments"
            />
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-6 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={calculateSalary}
          className="flex items-center gap-2"
        >
          <Calculator className="h-4 w-4" />
          Recalculate
        </Button>
        <div className="flex gap-2">
          <Button type="submit" size="lg" className="bg-primary hover:bg-primary-dark">
            <CheckCircle className="h-4 w-4 mr-2" />
            Create Salary Structure
          </Button>
        </div>
      </div>
    </form>
  );
}

// Payroll Settings Form Component
function PayrollSettingsForm({
  settings,
  onSubmit
}: {
  settings?: EnhancedPayrollSettings;
  onSubmit: (data: PayrollSettingsFormData) => void;
}) {
  const [formData, setFormData] = useState<PayrollSettingsFormData>({
    epfEmployeeRate: settings?.epfEmployeeRate || 12,
    epfEmployerRate: settings?.epfEmployerRate || 12,
    esiEmployeeRate: settings?.esiEmployeeRate || 0.75,
    esiEmployerRate: settings?.esiEmployerRate || 3.25,
    epfCeiling: settings?.epfCeiling || 15000,
    esiThreshold: settings?.esiThreshold || 21000,
    tdsThreshold: settings?.tdsThreshold || 250000,
    standardWorkingDays: settings?.standardWorkingDays || 26,
    standardWorkingHours: settings?.standardWorkingHours || 8,
    overtimeThresholdHours: settings?.overtimeThresholdHours || 8,
    companyName: settings?.companyName || "Godiva Solar",
    companyAddress: settings?.companyAddress || "",
    companyPan: settings?.companyPan || "",
    companyTan: settings?.companyTan || "",
    autoCalculateStatutory: Boolean(settings?.autoCalculateStatutory ?? true),
    allowManualOverride: Boolean(settings?.allowManualOverride ?? true),
    requireApprovalForProcessing: Boolean(settings?.requireApprovalForProcessing ?? false),
    autoCheckoutGraceMinutes: settings?.autoCheckoutGraceMinutes || 5
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-h-[500px] overflow-y-auto">
      <div className="hidden">
        {/* HIDDEN: Statutory rates are now hardcoded in the backend for simplicity */}
        {/* We keep the form data structure but hide the UI inputs */}
      </div>

      {/* Working Hours & Attendance */}
      <div className="bg-blue-50 p-6 rounded-lg border border-blue-100">
        <h3 className="text-lg font-semibold mb-4 text-blue-900 flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Attendance & Working Days
        </h3>
        <p className="text-sm text-blue-700 mb-4">
          Verify the standard working days for the month (e.g., 26 or 27 days).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <Label htmlFor="standardWorkingDays" className="text-blue-900">Standard Working Days</Label>
            <Input
              id="standardWorkingDays"
              type="number"
              className="bg-white border-blue-200"
              value={formData.standardWorkingDays}
              onChange={(e) => setFormData({ ...formData, standardWorkingDays: parseInt(e.target.value) || 0 })}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <Button type="submit" className="bg-blue-600 hover:bg-blue-700">Update Settings</Button>
      </div>
    </form >
  );
}

// Edit Payroll Form Component
function EditPayrollForm({
  payrollId,
  payroll,
  users,
  earningsFields,
  deductionsFields,
  onSubmit,
  onCancel
}: {
  payrollId: string;
  payroll?: EnhancedPayroll;
  users: User[];
  earningsFields: PayrollFieldConfig[];
  deductionsFields: PayrollFieldConfig[];
  onSubmit: (data: any) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState({
    presentDays: payroll?.presentDays || 0,
    paidLeaveDays: payroll?.paidLeaveDays || 0,
    overtimeHours: payroll?.overtimeHours || 0,
    earnedBasic: payroll?.earnedBasic || 0,
    earnedHRA: payroll?.earnedHRA || 0,
    earnedConveyance: payroll?.earnedConveyance || 0,
    overtimePay: payroll?.overtimePay || 0,
    betta: (payroll as any)?.betta || 0,
    dynamicEarnings: payroll?.dynamicEarnings || {},
    dynamicDeductions: payroll?.dynamicDeductions || {},
    epfDeduction: payroll?.epfDeduction || 0,
    esiDeduction: payroll?.esiDeduction || 0,
    vptDeduction: payroll?.vptDeduction || 0,
    tdsDeduction: payroll?.tdsDeduction || 0,
    fineDeduction: (payroll as any)?.fineDeduction || 0,
    salaryAdvance: (payroll as any)?.salaryAdvance || 0,
    creditAdjustment: (payroll as any)?.creditAdjustment || 0,
    esiEligible: (payroll as any)?.esiEligible ?? true,
    remarks: payroll?.remarks || ""
  });

  const payrollUser = users.find(u => u.id === payroll?.userId);

  const calculateTotals = () => {
    // Calculate gross salary (before BETTA)
    const grossSalary = formData.earnedBasic + formData.earnedHRA + formData.earnedConveyance +
      formData.overtimePay + Object.values(formData.dynamicEarnings).reduce((sum, val) => sum + val, 0);

    // Calculate final gross (after BETTA)
    const finalGross = grossSalary + formData.betta;

    // Calculate total deductions (including new fields from manual system)
    const totalDeductions = formData.epfDeduction + formData.esiDeduction + formData.vptDeduction +
      formData.tdsDeduction + formData.fineDeduction + formData.salaryAdvance +
      Object.values(formData.dynamicDeductions).reduce((sum, val) => sum + val, 0);

    // Calculate net salary (final gross + credit adjustment - total deductions)
    const netSalary = finalGross + formData.creditAdjustment - totalDeductions;

    return {
      grossSalary,
      finalGross,
      totalEarnings: finalGross,
      totalDeductions,
      netSalary
    };
  };

  const { totalEarnings, totalDeductions, netSalary } = calculateTotals();

  const handleDynamicEarningChange = (fieldName: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      dynamicEarnings: {
        ...prev.dynamicEarnings,
        [fieldName]: parseFloat(value) || 0
      }
    }));
  };

  const handleDynamicDeductionChange = (fieldName: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      dynamicDeductions: {
        ...prev.dynamicDeductions,
        [fieldName]: parseFloat(value) || 0
      }
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      totalEarnings,
      totalDeductions,
      netSalary
    });
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);

  if (!payroll) {
    return <div>Payroll record not found</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Employee Information */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <h3 className="font-semibold text-lg mb-2">Employee Information</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">Name:</span> {payrollUser?.displayName}
          </div>
          <div>
            <span className="font-medium">Employee ID:</span> {payroll.employeeId}
          </div>
          <div>
            <span className="font-medium">Department:</span> {payrollUser?.department?.toUpperCase()}
          </div>
          <div>
            <span className="font-medium">Month/Year:</span> {payroll.month}/{payroll.year}
          </div>
        </div>
      </div>

      {/* Attendance Section */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Attendance Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <Label htmlFor="monthDays">Month Days</Label>
            <Input
              id="monthDays"
              type="number"
              value={payroll.monthDays}
              readOnly
              className="bg-gray-100"
            />
          </div>
          <div>
            <Label htmlFor="presentDays">Present Days</Label>
            <Input
              id="presentDays"
              type="number"
              value={formData.presentDays}
              onChange={(e) => setFormData(prev => ({ ...prev, presentDays: parseInt(e.target.value) || 0 }))}
            />
          </div>
          <div>
            <Label htmlFor="paidLeaveDays">Paid Leave Days</Label>
            <Input
              id="paidLeaveDays"
              type="number"
              value={formData.paidLeaveDays}
              onChange={(e) => setFormData(prev => ({ ...prev, paidLeaveDays: parseInt(e.target.value) || 0 }))}
            />
          </div>
          <div>
            <Label htmlFor="overtimeHours">Overtime Hours</Label>
            <Input
              id="overtimeHours"
              type="number"
              step="0.5"
              value={formData.overtimeHours}
              onChange={(e) => setFormData(prev => ({ ...prev, overtimeHours: parseFloat(e.target.value) || 0 }))}
            />
          </div>
        </div>
      </div>

      {/* Earnings Section */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Earnings</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="earnedBasic">Basic Salary</Label>
            <Input
              id="earnedBasic"
              type="number"
              value={formData.earnedBasic}
              onChange={(e) => setFormData(prev => ({ ...prev, earnedBasic: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div>
            <Label htmlFor="earnedHRA">HRA</Label>
            <Input
              id="earnedHRA"
              type="number"
              value={formData.earnedHRA}
              onChange={(e) => setFormData(prev => ({ ...prev, earnedHRA: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div>
            <Label htmlFor="earnedConveyance">Conveyance</Label>
            <Input
              id="earnedConveyance"
              type="number"
              value={formData.earnedConveyance}
              onChange={(e) => setFormData(prev => ({ ...prev, earnedConveyance: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div>
            <Label htmlFor="overtimePay">Overtime Pay</Label>
            <Input
              id="overtimePay"
              type="number"
              value={formData.overtimePay}
              onChange={(e) => setFormData(prev => ({ ...prev, overtimePay: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div>
            <Label htmlFor="betta">BETTA</Label>
            <Input
              id="betta"
              type="number"
              value={formData.betta}
              onChange={(e) => setFormData(prev => ({ ...prev, betta: parseFloat(e.target.value) || 0 }))}
            />
          </div>
        </div>

        {/* Dynamic Earnings */}
        {earningsFields.length > 0 && (
          <div className="mt-4">
            <h4 className="font-medium mb-2">Additional Earnings</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {earningsFields.map(field => (
                <div key={field.id}>
                  <Label htmlFor={field.name}>{field.displayName}</Label>
                  <Input
                    id={field.name}
                    type="number"
                    value={formData.dynamicEarnings[field.name] || 0}
                    onChange={(e) => handleDynamicEarningChange(field.name, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Deductions Section */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Deductions</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <Label htmlFor="epfDeduction">EPF Deduction</Label>
            <Input
              id="epfDeduction"
              type="number"
              value={formData.epfDeduction}
              onChange={(e) => setFormData(prev => ({ ...prev, epfDeduction: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div>
            <Label htmlFor="esiDeduction">ESI Deduction</Label>
            <Input
              id="esiDeduction"
              type="number"
              value={formData.esiDeduction}
              onChange={(e) => setFormData(prev => ({ ...prev, esiDeduction: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div>
            <Label htmlFor="vptDeduction">VPT Deduction</Label>
            <Input
              id="vptDeduction"
              type="number"
              value={formData.vptDeduction}
              onChange={(e) => setFormData(prev => ({ ...prev, vptDeduction: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div>
            <Label htmlFor="tdsDeduction">TDS Deduction</Label>
            <Input
              id="tdsDeduction"
              type="number"
              value={formData.tdsDeduction}
              onChange={(e) => setFormData(prev => ({ ...prev, tdsDeduction: parseFloat(e.target.value) || 0 }))}
            />
          </div>
        </div>

        {/* Additional Deductions from Manual System */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <div>
            <Label htmlFor="fineDeduction">FINE</Label>
            <Input
              id="fineDeduction"
              type="number"
              value={formData.fineDeduction}
              onChange={(e) => setFormData(prev => ({ ...prev, fineDeduction: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div>
            <Label htmlFor="salaryAdvance">SALARY ADVANCE</Label>
            <Input
              id="salaryAdvance"
              type="number"
              value={formData.salaryAdvance}
              onChange={(e) => setFormData(prev => ({ ...prev, salaryAdvance: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div>
            <Label htmlFor="creditAdjustment">CREDIT</Label>
            <Input
              id="creditAdjustment"
              type="number"
              value={formData.creditAdjustment}
              onChange={(e) => setFormData(prev => ({ ...prev, creditAdjustment: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="esiEligible"
              checked={formData.esiEligible}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, esiEligible: !!checked }))}
            />
            <Label htmlFor="esiEligible">ESI Eligible</Label>
          </div>
        </div>

        {/* Dynamic Deductions */}
        {deductionsFields.length > 0 && (
          <div className="mt-4">
            <h4 className="font-medium mb-2">Additional Deductions</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {deductionsFields.map(field => (
                <div key={field.id}>
                  <Label htmlFor={field.name}>{field.displayName}</Label>
                  <Input
                    id={field.name}
                    type="number"
                    value={formData.dynamicDeductions[field.name] || 0}
                    onChange={(e) => handleDynamicDeductionChange(field.name, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Summary Section - Enhanced to match manual system */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 p-6 rounded-lg border-2 border-green-200">
        <h3 className="text-lg font-semibold mb-4 text-center">📊 Payroll Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="text-center bg-white p-3 rounded-lg shadow-sm">
            <div className="text-xs text-muted-foreground">GROSS SALARY</div>
            <div className="text-lg font-bold text-green-600">{formatCurrency(calculateTotals().grossSalary)}</div>
          </div>
          <div className="text-center bg-white p-3 rounded-lg shadow-sm">
            <div className="text-xs text-muted-foreground">BETTA</div>
            <div className="text-lg font-bold text-blue-600">{formatCurrency(formData.betta)}</div>
          </div>
          <div className="text-center bg-white p-3 rounded-lg shadow-sm">
            <div className="text-xs text-muted-foreground">FINAL GROSS</div>
            <div className="text-lg font-bold text-green-700">{formatCurrency(calculateTotals().finalGross)}</div>
          </div>
          <div className="text-center bg-white p-3 rounded-lg shadow-sm">
            <div className="text-xs text-muted-foreground">TOTAL DEDUCTIONS</div>
            <div className="text-lg font-bold text-red-600">{formatCurrency(totalDeductions)}</div>
          </div>
          <div className="text-center bg-white p-4 rounded-lg shadow-md border-2 border-blue-300">
            <div className="text-xs text-muted-foreground">NET SALARY</div>
            <div className="text-2xl font-bold text-blue-700">{formatCurrency(netSalary)}</div>
            {!formData.esiEligible && (
              <div className="text-xs text-orange-600 mt-1">ESI Not Eligible</div>
            )}
          </div>
        </div>
      </div>

      {/* Remarks */}
      <div>
        <Label htmlFor="remarks">Remarks</Label>
        <Input
          id="remarks"
          value={formData.remarks}
          onChange={(e) => setFormData(prev => ({ ...prev, remarks: e.target.value }))}
          placeholder="Additional notes or comments"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="bg-primary hover:bg-primary-dark">
          <CheckCircle className="h-4 w-4 mr-2" />
          Update Payroll
        </Button>
      </div>
    </form>
  );
}

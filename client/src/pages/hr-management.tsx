import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Users,
  UserPlus,
  Search,
  Filter,
  MoreHorizontal,
  Edit,
  Eye,
  Trash2,
  Building2,
  Calendar,
  Phone,
  Mail,
  MapPin,
  FileText,
  Award,
  Clock,
  ChevronRight,
  Download,
  Upload,
  Plus,
  X,
  CheckCircle,
  AlertCircle,
  User,
  Briefcase,
  CreditCard,
  ContactIcon
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  insertUserEnhancedSchema,
  departments,
  designations,
  employeeStatus,
  maritalStatus,
  bloodGroups,
  paymentModes
} from "@shared/schema";
import { sanitizeFormData } from "@shared/utils/form-sanitizer";
import { z } from "zod";
import { formatDate, getInitials } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { DocumentUpload } from "@/components/ui/document-upload";

type User = z.infer<typeof insertUserEnhancedSchema> & {
  id: string;
  uid: string;
  createdAt: Date;
  updatedAt: Date;
};

const userFormSchema = insertUserEnhancedSchema.omit({
  uid: true
}).extend({
  profilePhotoUrl: z.string().optional().nullable(),
  aadharCardUrl: z.string().optional().nullable(),
  panCardUrl: z.string().optional().nullable(),
});

export default function HRManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedDesignation, setSelectedDesignation] = useState<string>("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);

  // Document upload states
  const [profilePhotoData, setProfilePhotoData] = useState<string>("");
  const [aadharCardData, setAadharCardData] = useState<string>("");
  const [panCardData, setPanCardData] = useState<string>("");

  const { data: users = [], isLoading: isLoadingUsers } = useQuery<User[]>({
    queryKey: ['/api/users'],
    enabled: true
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: z.infer<typeof userFormSchema>) => {
      // Sanitize form data: convert empty strings to null for optional fields
      const sanitizedData = sanitizeFormData(data, [
        'employeeId', 'esiNumber', 'epfNumber', 'aadharNumber', 'panNumber',
        'fatherName', 'spouseName', 'contactNumber', 'emergencyContactPerson',
        'emergencyContactNumber', 'permanentAddress', 'presentAddress', 'location',
        'bankAccountNumber', 'bankName', 'ifscCode', 'educationalQualification'
      ]);

      // Use employee ID as default password, or generate a temporary one if not provided
      const defaultPassword = sanitizedData.employeeId || `temp_${Date.now()}`;

      const response = await apiRequest('/api/users', 'POST', {
        ...sanitizedData,
        createLogin: true,
        password: defaultPassword
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      setIsCreateDialogOpen(false);
      const employeeId = form.getValues('employeeId');
      form.reset();
      toast({
        title: "Success",
        description: employeeId
          ? `Employee created successfully. Default password is their Employee ID: ${employeeId}`
          : "Employee created successfully. They can log in with their email and temporary password.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ uid, data }: { uid: string; data: Partial<z.infer<typeof userFormSchema>> }) => {
      // Start with all form data
      const sanitizedData: any = { ...data };

      // Convert empty strings to null for optional text fields
      const emptyToNullFields = [
        'employeeId', 'esiNumber', 'epfNumber', 'aadharNumber', 'panNumber',
        'fatherName', 'spouseName', 'contactNumber', 'emergencyContactPerson',
        'emergencyContactNumber', 'permanentAddress', 'presentAddress', 'location',
        'bankAccountNumber', 'bankName', 'ifscCode', 'educationalQualification'
      ];

      emptyToNullFields.forEach(field => {
        if (sanitizedData[field] === "") {
          sanitizedData[field] = null;
        }
      });

      const response = await apiRequest(`/api/users/${uid}`, 'PATCH', sanitizedData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      setIsEditDialogOpen(false);
      setSelectedUser(null);
      toast({
        title: "Success",
        description: "Employee updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (uid: string) => {
      const response = await apiRequest(`/api/users/${uid}`, 'DELETE');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete user');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({
        title: "Success",
        description: "Employee deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const form = useForm<z.infer<typeof userFormSchema>>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      email: "",
      displayName: "",
      role: "employee",
      department: null,
      designation: null,
      employeeId: "",
      reportingManagerId: null,
      payrollGrade: null,
      joinDate: undefined,
      isActive: true,
      photoURL: null,
      esiNumber: "",
      epfNumber: "",
      aadharNumber: "",
      panNumber: "",
      fatherName: "",
      spouseName: "",
      dateOfBirth: undefined,
      age: undefined,
      gender: undefined,
      maritalStatus: undefined,
      bloodGroup: undefined,
      profilePhotoUrl: "",
      aadharCardUrl: "",
      panCardUrl: "",
      educationalQualification: "",
      experienceYears: undefined,
      dateOfLeaving: undefined,
      employeeStatus: "active",
      contactNumber: "",
      emergencyContactPerson: "",
      emergencyContactNumber: "",
      permanentAddress: "",
      presentAddress: "",
      location: "",
      paymentMode: undefined,
      bankAccountNumber: "",
      bankName: "",
      ifscCode: "",
      documents: undefined
    },
  });

  const editForm = useForm<z.infer<typeof userFormSchema>>({
    resolver: zodResolver(userFormSchema),
  });

  const onSubmit = async (values: z.infer<typeof userFormSchema>) => {
    try {
      const finalValues = { ...values };

      // Manual validation for required documents


      const employeeId = values.employeeId || 'temp_' + Date.now();

      // Upload documents if they exist
      const uploadPromises = [];

      if (profilePhotoData) {
        uploadPromises.push(
          apiRequest('/api/employees/upload-document', 'POST', {
            imageData: profilePhotoData,
            employeeId: employeeId,
            documentType: 'photo'
          }).then(async res => {
            if (!res.ok) {
              const error = await res.json();
              throw new Error(error.message || 'Photo upload failed');
            }
            return res.json();
          }).then(data => {
            finalValues.profilePhotoUrl = data.url;
          })
        );
      }

      if (aadharCardData) {
        uploadPromises.push(
          apiRequest('/api/employees/upload-document', 'POST', {
            imageData: aadharCardData,
            employeeId: employeeId,
            documentType: 'aadhar'
          }).then(async res => {
            if (!res.ok) {
              const error = await res.json();
              throw new Error(error.message || 'Aadhar card upload failed');
            }
            return res.json();
          }).then(data => {
            finalValues.aadharCardUrl = data.url;
          })
        );
      }

      if (panCardData) {
        uploadPromises.push(
          apiRequest('/api/employees/upload-document', 'POST', {
            imageData: panCardData,
            employeeId: employeeId,
            documentType: 'pan'
          }).then(async res => {
            if (!res.ok) {
              const error = await res.json();
              throw new Error(error.message || 'PAN card upload failed');
            }
            return res.json();
          }).then(data => {
            finalValues.panCardUrl = data.url;
          })
        );
      }

      // Wait for all uploads to complete
      if (uploadPromises.length > 0) {
        await Promise.all(uploadPromises);
      }

      // Submit the form with document URLs
      createUserMutation.mutate(finalValues);

      // Reset document states
      setProfilePhotoData("");
      setAadharCardData("");
      setPanCardData("");

    } catch (error) {
      toast({
        title: "Document Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload documents",
        variant: "destructive",
      });
    }
  };

  const [isUploading, setIsUploading] = useState(false);

  function requestUserEdit(user: User) {
    if (!user) return;
    setSelectedUser(user);
    console.log("Opening edit for user:", user);

    // Reset file upload states
    setProfilePhotoData("");
    setAadharCardData("");
    setPanCardData("");

    editForm.reset({
      // Personal Details
      displayName: user.displayName || '',
      email: user.email || '',
      employeeId: user.employeeId || '',
      department: user.department || undefined,
      designation: user.designation || undefined,
      employeeStatus: user.employeeStatus || 'active',
      joinDate: user.joinDate ? new Date(user.joinDate) : undefined,
      dateOfLeaving: user.dateOfLeaving ? new Date(user.dateOfLeaving) : undefined,

      fatherName: user.fatherName || '',
      spouseName: user.spouseName || '',
      dateOfBirth: user.dateOfBirth ? new Date(user.dateOfBirth) : undefined,
      gender: user.gender || undefined,
      maritalStatus: user.maritalStatus || undefined,
      bloodGroup: user.bloodGroup || undefined,
      profilePhotoUrl: user.profilePhotoUrl || '',
      aadharCardUrl: user.aadharCardUrl || '',
      panCardUrl: user.panCardUrl || '',

      // Contact Details
      contactNumber: user.contactNumber || '',
      location: user.location || '',
      presentAddress: user.presentAddress || '',
      permanentAddress: user.permanentAddress || '',
      emergencyContactPerson: user.emergencyContactPerson || '',
      emergencyContactNumber: user.emergencyContactNumber || '',

      // Statutory Details
      esiNumber: user.esiNumber || '',
      epfNumber: user.epfNumber || '',
      aadharNumber: user.aadharNumber || '',
      panNumber: user.panNumber || '',

      // Payroll Details
      bankName: user.bankName || '',
      bankAccountNumber: user.bankAccountNumber || '',
      ifscCode: user.ifscCode || '',

      // Professional Details
      educationalQualification: user.educationalQualification || '',
      experienceYears: user.experienceYears || undefined,
      reportingManagerId: user.reportingManagerId || '',
    });
    setIsEditDialogOpen(true);
  }



  const onEditSubmit = async (values: z.infer<typeof userFormSchema>) => {
    if (!selectedUser) return;

    setIsUploading(true);
    try {
      const finalValues = { ...values };

      // Manual validation for required documents (Enforce backfill)


      const employeeId = selectedUser.employeeId || selectedUser.uid;

      // Upload documents if they exist
      const uploadPromises = [];

      if (profilePhotoData) {
        uploadPromises.push(
          apiRequest('/api/employees/upload-document', 'POST', {
            imageData: profilePhotoData,
            employeeId: employeeId,
            documentType: 'photo'
          }).then(async res => {
            if (!res.ok) {
              const error = await res.json();
              throw new Error(error.message || 'Photo upload failed');
            }
            return res.json();
          }).then(data => {
            finalValues.profilePhotoUrl = data.url;
          })
        );
      }

      if (aadharCardData) {
        uploadPromises.push(
          apiRequest('/api/employees/upload-document', 'POST', {
            imageData: aadharCardData,
            employeeId: employeeId,
            documentType: 'aadhar'
          }).then(async res => {
            if (!res.ok) {
              const error = await res.json();
              throw new Error(error.message || 'Aadhar card upload failed');
            }
            return res.json();
          }).then(data => {
            finalValues.aadharCardUrl = data.url;
          })
        );
      }

      if (panCardData) {
        uploadPromises.push(
          apiRequest('/api/employees/upload-document', 'POST', {
            imageData: panCardData,
            employeeId: employeeId,
            documentType: 'pan'
          }).then(async res => {
            if (!res.ok) {
              const error = await res.json();
              throw new Error(error.message || 'PAN card upload failed');
            }
            return res.json();
          }).then(data => {
            finalValues.panCardUrl = data.url;
          })
        );
      }

      // Wait for all uploads to complete
      if (uploadPromises.length > 0) {
        await Promise.all(uploadPromises);
      }

      // Submit the form with document URLs
      console.log("Submitting update with finalValues:", finalValues);
      updateUserMutation.mutate({ uid: selectedUser.uid, data: finalValues }, {
        onSettled: () => setIsUploading(false)
      });

      // Reset document states
      setProfilePhotoData("");
      setAadharCardData("");
      setPanCardData("");

    } catch (error) {
      setIsUploading(false);
      toast({
        title: "Document Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload documents",
        variant: "destructive",
      });
    }
  };

  const filteredUsers = users.filter((user: User) => {
    const matchesSearch = !searchTerm ||
      user.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.employeeId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesDepartment = !selectedDepartment || selectedDepartment === "all" || user.department === selectedDepartment;
    const matchesStatus = (!selectedStatus || selectedStatus === "all")
      ? user.employeeStatus !== 'terminated' && user.employeeStatus !== 'inactive'
      : user.employeeStatus === selectedStatus;
    const matchesDesignation = !selectedDesignation || selectedDesignation === "all" || user.designation === selectedDesignation;

    return matchesSearch && matchesDepartment && matchesStatus && matchesDesignation;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-100 text-green-800";
      case "inactive": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getDepartmentColor = (department: string) => {
    const colors = {
      operations: "bg-blue-100 text-blue-800",
      admin: "bg-purple-100 text-purple-800",
      hr: "bg-green-100 text-green-800",
      marketing: "bg-orange-100 text-orange-800",
      sales: "bg-red-100 text-red-800",
      technical: "bg-teal-100 text-teal-800",
      housekeeping: "bg-gray-100 text-gray-800",
    };
    return colors[department as keyof typeof colors] || "bg-gray-100 text-gray-800";
  };

  useEffect(() => {
    if (selectedUser && isEditDialogOpen) {
      editForm.reset({
        ...selectedUser,
        dateOfBirth: selectedUser.dateOfBirth ? new Date(selectedUser.dateOfBirth) : undefined,
        joinDate: selectedUser.joinDate ? new Date(selectedUser.joinDate) : undefined,
        dateOfLeaving: selectedUser.dateOfLeaving ? new Date(selectedUser.dateOfLeaving) : undefined
      });
    }
  }, [selectedUser, isEditDialogOpen, editForm]);

  // Auto-calculate age when date of birth changes (Create Form)
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === 'dateOfBirth' && value.dateOfBirth) {
        const birthDate = new Date(value.dateOfBirth);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();

        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }

        if (age >= 0 && age <= 150) {
          form.setValue('age', age);
        }
      } else if (name === 'dateOfBirth' && !value.dateOfBirth) {
        form.setValue('age', undefined);
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  // Auto-calculate age when date of birth changes (Edit Form)
  useEffect(() => {
    const subscription = editForm.watch((value, { name }) => {
      if (name === 'dateOfBirth' && value.dateOfBirth) {
        const birthDate = new Date(value.dateOfBirth);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();

        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }

        if (age >= 0 && age <= 150) {
          editForm.setValue('age', age);
        }
      } else if (name === 'dateOfBirth' && !value.dateOfBirth) {
        editForm.setValue('age', undefined);
      }
    });
    return () => subscription.unsubscribe();
  }, [editForm]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-hr-management">Employee Management</h1>
          <p className="text-muted-foreground">
            Comprehensive employee data management with admin-controlled login creation
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90" data-testid="button-add-employee">
              <Plus className="mr-2 h-4 w-4" />
              Add New Employee
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Employee</DialogTitle>
              <DialogDescription>
                Create a comprehensive employee profile with all necessary information.
              </DialogDescription>
            </DialogHeader>
            <UserForm
              form={form}
              onSubmit={onSubmit}
              isLoading={createUserMutation.isPending}
              submitText="Create Employee"
              profilePhotoData={profilePhotoData}
              setProfilePhotoData={setProfilePhotoData}
              aadharCardData={aadharCardData}
              setAadharCardData={setAadharCardData}
              panCardData={panCardData}
              setPanCardData={setPanCardData}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Search & Filter Employees
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  data-testid="input-search-employees"
                  placeholder="Search by name, ID, or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="department">Department</Label>
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger data-testid="select-filter-department">
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
            </div>
            <div>
              <Label htmlFor="designation">Designation</Label>
              <Select value={selectedDesignation} onValueChange={setSelectedDesignation}>
                <SelectTrigger data-testid="select-filter-designation">
                  <SelectValue placeholder="All Designations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Designations</SelectItem>
                  {designations.map((designation) => (
                    <SelectItem key={designation} value={designation}>
                      {designation.toUpperCase().replace('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger data-testid="select-filter-status">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {employeeStatus.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Employees</p>
                <p className="text-2xl font-bold" data-testid="text-total-employees">{filteredUsers.length}</p>
              </div>
              <Users className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active</p>
                <p className="text-2xl font-bold text-green-600" data-testid="text-active-employees">
                  {filteredUsers.filter((user: User) => user.employeeStatus === 'active').length}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">On Probation</p>
                <p className="text-2xl font-bold text-yellow-600" data-testid="text-probation-employees">
                  {filteredUsers.filter((user: User) => user.employeeStatus === 'probation').length}
                </p>
              </div>
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">On Leave</p>
                <p className="text-2xl font-bold text-blue-600" data-testid="text-leave-employees">
                  {filteredUsers.filter((user: User) => user.employeeStatus === 'on_leave').length}
                </p>
              </div>
              <Calendar className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Employee Directory</CardTitle>
            <CardDescription>
              Manage all employee information and records
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" data-testid="button-export">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>

          </div>
        </CardHeader>
        <CardContent>
          {isLoadingUsers ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8">
              <Users className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-2 text-sm font-semibold text-gray-900">No employees found</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {searchTerm || selectedDepartment || selectedStatus || selectedDesignation
                  ? "Try adjusting your search criteria"
                  : "Get started by adding your first employee"}
              </p>
              <div className="mt-6">
                <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-add-first-employee">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Employee
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredUsers.map((user: User) => (
                <UserCard
                  key={user.uid}
                  user={user}
                  onView={() => {
                    setSelectedUser(user);
                    setIsViewDialogOpen(true);
                  }}
                  onEdit={() => requestUserEdit(user)}
                  onDelete={() => {
                    setUserToDelete(user.uid);
                    setIsDeleteDialogOpen(true);
                  }}
                  getStatusColor={getStatusColor}
                  getDepartmentColor={getDepartmentColor}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedUser && (
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Employee Details</DialogTitle>
              <DialogDescription>
                Complete employee information for {selectedUser.displayName}
              </DialogDescription>
            </DialogHeader>
            <UserViewDetails user={selectedUser} />
          </DialogContent>
        </Dialog>
      )}

      {selectedUser && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Employee</DialogTitle>
              <DialogDescription>
                Update employee information for {selectedUser.displayName}
              </DialogDescription>
            </DialogHeader>
            <UserForm
              form={editForm}
              onSubmit={onEditSubmit}
              isLoading={updateUserMutation.isPending || isUploading}
              submitText="Update Employee"
              profilePhotoData={profilePhotoData}
              setProfilePhotoData={setProfilePhotoData}
              aadharCardData={aadharCardData}
              setAadharCardData={setAadharCardData}
              panCardData={panCardData}
              setPanCardData={setPanCardData}
            />
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the employee
              account and remove their data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setUserToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (userToDelete) {
                  deleteUserMutation.mutate(userToDelete);
                  setUserToDelete(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UserCard({
  user,
  onView,
  onEdit,
  onDelete,
  getStatusColor,
  getDepartmentColor
}: {
  user: User;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  getStatusColor: (status: string) => string;
  getDepartmentColor: (department: string) => string;
}) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-6 border rounded-lg hover:bg-muted/50 transition-colors gap-4" data-testid={`card-employee-${user.uid}`}>
      <div className="flex items-start sm:items-center space-x-4 w-full sm:w-auto">
        <Avatar className="h-12 w-12 flex-shrink-0">
          <AvatarImage src={user.photoURL || undefined} />
          <AvatarFallback>
            {getInitials(user.displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold truncate" data-testid={`text-employee-name-${user.uid}`}>{user.displayName}</h3>
            <Badge className={getStatusColor(user.employeeStatus || 'active')}>
              {(user.employeeStatus || 'active').replace('_', ' ')}
            </Badge>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Building2 className="h-3 w-3 flex-shrink-0" />
              {user.employeeId || 'No ID'}
            </span>
            <span className="flex items-center gap-1">
              <Briefcase className="h-3 w-3 flex-shrink-0" />
              {user.designation?.toUpperCase() || 'No Designation'}
            </span>
            <span className="flex items-center gap-1 truncate">
              <Mail className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{user.email}</span>
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end w-full sm:w-auto gap-2 mt-2 sm:mt-0">
        {user.department && (
          <Badge className={getDepartmentColor(user.department)} variant="outline">
            {user.department}
          </Badge>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0" data-testid={`button-menu-${user.uid}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={onView} data-testid={`button-view-${user.uid}`}>
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit} data-testid={`button-edit-${user.uid}`}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-red-600" data-testid={`button-delete-${user.uid}`}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function UserForm({
  form,
  onSubmit,
  isLoading,
  submitText,
  profilePhotoData,
  setProfilePhotoData,
  aadharCardData,
  setAadharCardData,
  panCardData,
  setPanCardData
}: {
  form: any;
  onSubmit: (values: z.infer<typeof userFormSchema>) => void;
  isLoading: boolean;
  submitText: string;
  profilePhotoData: string;
  setProfilePhotoData: (data: string) => void;
  aadharCardData: string;
  setAadharCardData: (data: string) => void;
  panCardData: string;
  setPanCardData: (data: string) => void;
}) {
  const [activeTab, setActiveTab] = useState("basic");
  const { toast } = useToast();

  const fieldTabMapping: Record<string, string> = {
    // Basic Tab
    email: 'basic',
    displayName: 'basic',
    employeeId: 'basic',
    department: 'basic',
    designation: 'basic',
    employeeStatus: 'basic',
    joinDate: 'basic',
    dateOfLeaving: 'basic',
    createLogin: 'basic',

    // Personal Tab
    fatherName: 'personal',
    spouseName: 'personal',
    dateOfBirth: 'personal',
    age: 'personal',
    gender: 'personal',
    maritalStatus: 'personal',
    bloodGroup: 'personal',
    profilePhotoUrl: 'personal',
    aadharCardUrl: 'personal',
    panCardUrl: 'personal',

    // Contact Tab
    contactNumber: 'contact',
    location: 'contact',
    presentAddress: 'contact',
    permanentAddress: 'contact',
    emergencyContactPerson: 'contact',
    emergencyContactNumber: 'contact',

    // Statutory Tab
    esiNumber: 'statutory',
    epfNumber: 'statutory',
    aadharNumber: 'statutory',
    panNumber: 'statutory',

    // Payroll Tab
    bankName: 'payroll',
    bankAccountNumber: 'payroll',
    ifscCode: 'payroll',

    // Professional Tab
    educationalQualification: 'professional',
    experienceYears: 'professional',
    reportingManagerId: 'professional'
  };

  const onError = (errors: any) => {
    const errorFields = Object.keys(errors);
    if (errorFields.length > 0) {
      const firstErrorField = errorFields[0];
      const targetTab = fieldTabMapping[firstErrorField] || 'basic';

      setActiveTab(targetTab);

      toast({
        title: "Validation Error",
        description: `Please check the ${targetTab} tab for errors: ${errors[firstErrorField]?.message || 'Invalid field'}`,
        variant: "destructive",
      });
    }
  };

  const handleLocalSubmit = (values: z.infer<typeof userFormSchema>) => {
    // Manual validation for required documents
    const missingDocs = [];

    // Check if photo exists (either in currentUrl form value OR in new upload data)
    const hasPhoto = values.profilePhotoUrl || profilePhotoData;
    const hasAadhar = values.aadharCardUrl || aadharCardData;
    const hasPan = values.panCardUrl || panCardData;

    if (!hasPhoto) missingDocs.push("Profile Photo");
    if (!hasAadhar) missingDocs.push("Aadhar Card");
    if (!hasPan) missingDocs.push("PAN Card");

    if (missingDocs.length > 0) {
      setActiveTab("personal");
      toast({
        title: "Missing Required Documents",
        description: `Please upload the following documents: ${missingDocs.join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    onSubmit(values);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleLocalSubmit, onError)} className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full h-auto grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="personal">Personal</TabsTrigger>
            <TabsTrigger value="contact">Contact</TabsTrigger>
            <TabsTrigger value="statutory">Statutory</TabsTrigger>
            <TabsTrigger value="payroll">Payroll</TabsTrigger>
            <TabsTrigger value="professional">Professional</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="john@example.com" {...field} data-testid="input-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} data-testid="input-displayName" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="employeeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employee ID</FormLabel>
                    <FormControl>
                      <Input placeholder="EMP001" {...field} data-testid="input-employeeId" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="department"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger data-testid="select-department">
                          <SelectValue placeholder="Select department" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {departments.map((dept) => (
                          <SelectItem key={dept} value={dept}>
                            {dept.charAt(0).toUpperCase() + dept.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="designation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Designation</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger data-testid="select-designation">
                          <SelectValue placeholder="Select designation" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {designations.map((designation) => (
                          <SelectItem key={designation} value={designation}>
                            {designation.toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="employeeStatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employee Status *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-employeeStatus">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {employeeStatus.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status.replace('_', ' ').split(' ').map(word =>
                              word.charAt(0).toUpperCase() + word.slice(1)
                            ).join(' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="joinDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of Joining</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                        onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                        data-testid="input-joinDate"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dateOfLeaving"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of Leaving</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                        onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                        data-testid="input-dateOfLeaving"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>


          </TabsContent>

          <TabsContent value="personal" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="fatherName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Father's Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Father's name" {...field} data-testid="input-fatherName" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="spouseName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Spouse Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Spouse name" {...field} data-testid="input-spouseName" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dateOfBirth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of Birth</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                        onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                        data-testid="input-dateOfBirth"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="age"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Age</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value !== undefined ? field.value : ''}
                        disabled
                        placeholder="Auto-calculated from DOB"
                        className="bg-gray-50 dark:bg-gray-800"
                        data-testid="input-age"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gender</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger data-testid="select-gender">
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maritalStatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Marital Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger data-testid="select-maritalStatus">
                          <SelectValue placeholder="Select marital status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {maritalStatus.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bloodGroup"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Blood Group</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger data-testid="select-bloodGroup">
                          <SelectValue placeholder="Select blood group" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {bloodGroups.map((group) => (
                          <SelectItem key={group} value={group}>
                            {group}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="border-t pt-4 mt-4">
              <h3 className="text-lg font-medium mb-4">Employee Documents</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <DocumentUpload
                  label="Profile Photo"
                  required={true}
                  documentType="photo"
                  currentUrl={form.getValues('profilePhotoUrl')}
                  onFileSelect={setProfilePhotoData}
                  onRemove={() => setProfilePhotoData("")}
                  maxSizeMB={2}
                />
                <DocumentUpload
                  label="Aadhar Card"
                  required={true}
                  documentType="aadhar"
                  currentUrl={form.getValues('aadharCardUrl')}
                  onFileSelect={setAadharCardData}
                  onRemove={() => setAadharCardData("")}
                  maxSizeMB={5}
                />
                <DocumentUpload
                  label="PAN Card"
                  required={true}
                  documentType="pan"
                  currentUrl={form.getValues('panCardUrl')}
                  onFileSelect={setPanCardData}
                  onRemove={() => setPanCardData("")}
                  maxSizeMB={5}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="contact" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="contactNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Number</FormLabel>
                    <FormControl>
                      <Input placeholder="+91 9876543210" {...field} data-testid="input-contactNumber" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input placeholder="Mumbai" {...field} data-testid="input-location" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="presentAddress"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Present Address</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Current residential address" {...field} data-testid="input-presentAddress" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="permanentAddress"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Permanent Address</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Permanent residential address" {...field} data-testid="input-permanentAddress" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="border-t pt-4 mt-4">
              <h4 className="text-lg font-semibold mb-4">Emergency Contact</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="emergencyContactPerson"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Emergency Contact Person</FormLabel>
                      <FormControl>
                        <Input placeholder="Contact person name" {...field} data-testid="input-emergencyContactPerson" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="emergencyContactNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Emergency Contact Number</FormLabel>
                      <FormControl>
                        <Input placeholder="+91 9876543210" {...field} data-testid="input-emergencyContactNumber" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="statutory" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="esiNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ESI Number</FormLabel>
                    <FormControl>
                      <Input placeholder="ESI IP Number" {...field} data-testid="input-esiNumber" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="epfNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>EPF Number</FormLabel>
                    <FormControl>
                      <Input placeholder="EPF UAN Number" {...field} data-testid="input-epfNumber" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="aadharNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>AADHAR Number</FormLabel>
                    <FormControl>
                      <Input placeholder="123456789012 (12 digits)" {...field} maxLength={12} data-testid="input-aadharNumber" />
                    </FormControl>
                    <FormDescription>Must be exactly 12 digits</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="panNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PAN Number</FormLabel>
                    <FormControl>
                      <Input placeholder="ABCDE1234F" {...field} maxLength={10} data-testid="input-panNumber" />
                    </FormControl>
                    <FormDescription>Format: ABCDE1234F</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </TabsContent>

          <TabsContent value="payroll" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="bankName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bank Name</FormLabel>
                    <FormControl>
                      <Input placeholder="State Bank of India" {...field} data-testid="input-bankName" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bankAccountNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bank Account Number</FormLabel>
                    <FormControl>
                      <Input placeholder="1234567890" {...field} data-testid="input-bankAccountNumber" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ifscCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>IFSC Code</FormLabel>
                    <FormControl>
                      <Input placeholder="SBIN0001234" {...field} data-testid="input-ifscCode" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </TabsContent>

          <TabsContent value="professional" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="educationalQualification"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Educational Qualification</FormLabel>
                    <FormControl>
                      <Input placeholder="Bachelor of Engineering" {...field} data-testid="input-educationalQualification" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="experienceYears"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Years of Experience</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="5"
                        {...field}
                        value={field.value || ''}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                        data-testid="input-experienceYears"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-6 border-t">
          <Button type="button" variant="outline" onClick={() => form.reset()} data-testid="button-reset-form">
            Reset Form
          </Button>
          <Button type="submit" disabled={isLoading} data-testid="button-submit-form">
            {isLoading ? "Processing..." : submitText}
          </Button>
        </div>
      </form>
    </Form >
  );
}

function UserViewDetails({ user }: { user: User }) {
  console.log("UserViewDetails rendering with:", user);
  if (!user) return null;

  return (
    <div className="space-y-6">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full h-auto grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="contact">Contact</TabsTrigger>
          <TabsTrigger value="statutory">Statutory</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="flex items-center space-x-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src={user.photoURL || undefined} />
              <AvatarFallback className="text-xl">
                {getInitials(user.displayName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="text-2xl font-bold">{user.displayName}</h3>
              <p className="text-muted-foreground">{user.employeeId || 'No Employee ID'}</p>
              <div className="flex gap-2 mt-2">
                <Badge className={(user.employeeStatus || 'active') === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                  {(user.employeeStatus || 'active').replace('_', ' ')}
                </Badge>
                {user.department && (
                  <Badge variant="outline">
                    {user.department}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Basic Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email:</span>
                  <span>{user.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Department:</span>
                  <span>{user.department || 'Not specified'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Designation:</span>
                  <span>{user.designation?.toUpperCase() || 'Not specified'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span>{user.isActive ? 'Active' : 'Inactive'}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5" />
                  Employment Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employee ID:</span>
                  <span>{user.employeeId || 'Not specified'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Join Date:</span>
                  <span>{user.joinDate ? formatDate(new Date(user.joinDate)) : 'Not specified'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date of Leaving:</span>
                  <span>{user.dateOfLeaving ? formatDate(new Date(user.dateOfLeaving)) : 'Still employed'}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="personal" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Father's Name:</span>
                <span>{user.fatherName || 'Not provided'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Spouse Name:</span>
                <span>{user.spouseName || 'Not provided'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date of Birth:</span>
                <span>{user.dateOfBirth ? formatDate(new Date(user.dateOfBirth)) : 'Not provided'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gender:</span>
                <span>{user.gender || 'Not provided'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Marital Status:</span>
                <span>{user.maritalStatus || 'Not provided'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Blood Group:</span>
                <span>{user.bloodGroup || 'Not provided'}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contact" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ContactIcon className="h-5 w-5" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Contact Number:</span>
                  <span>{user.contactNumber || 'Not provided'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Location:</span>
                  <span>{user.location || 'Not provided'}</span>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-semibold mb-2">Present Address</h4>
                <p className="text-sm text-muted-foreground">{user.presentAddress || 'Not provided'}</p>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-semibold mb-2">Permanent Address</h4>
                <p className="text-sm text-muted-foreground">{user.permanentAddress || 'Not provided'}</p>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-semibold mb-2">Emergency Contact</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Contact Person:</span>
                    <span>{user.emergencyContactPerson || 'Not provided'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Contact Number:</span>
                    <span>{user.emergencyContactNumber || 'Not provided'}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statutory" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Statutory Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ESI Number:</span>
                <span>{user.esiNumber || 'Not provided'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">EPF Number:</span>
                <span>{user.epfNumber || 'Not provided'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">AADHAR Number:</span>
                <span>{user.aadharNumber || 'Not provided'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">PAN Number:</span>
                <span>{user.panNumber || 'Not provided'}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payroll" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Payroll Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold mb-4">Bank Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bank Name:</span>
                    <span>{user.bankName || 'Not provided'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Account Number:</span>
                    <span>{user.bankAccountNumber || 'Not provided'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IFSC Code:</span>
                    <span>{user.ifscCode || 'Not provided'}</span>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-semibold mb-4">Professional Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Educational Qualification:</span>
                    <span>{user.educationalQualification || 'Not provided'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Years of Experience:</span>
                    <span>{user.experienceYears || 'Not provided'}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Employee Documents
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Profile Photo */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Profile Photo</h4>
                <div className="border rounded-lg p-2 bg-gray-50 dark:bg-gray-800">
                  {user.profilePhotoUrl ? (
                    <div className="space-y-2">
                      <div className="relative aspect-square w-full overflow-hidden rounded-md border bg-white dark:bg-black">
                        <img
                          src={user.profilePhotoUrl}
                          alt="Profile Photo"
                          className="h-full w-full object-contain"
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => window.open(user.profilePhotoUrl!, '_blank')}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        View Full Size
                      </Button>
                    </div>
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center rounded-md border border-dashed bg-white dark:bg-black text-muted-foreground">
                      <span className="text-sm">Not uploaded</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Aadhar Card */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Aadhar Card</h4>
                <div className="border rounded-lg p-2 bg-gray-50 dark:bg-gray-800">
                  {user.aadharCardUrl ? (
                    <div className="space-y-2">
                      <div className="relative aspect-video w-full overflow-hidden rounded-md border bg-white dark:bg-black">
                        <img
                          src={user.aadharCardUrl}
                          alt="Aadhar Card"
                          className="h-full w-full object-contain"
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => window.open(user.aadharCardUrl!, '_blank')}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        View Full Size
                      </Button>
                    </div>
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center rounded-md border border-dashed bg-white dark:bg-black text-muted-foreground">
                      <span className="text-sm">Not uploaded</span>
                    </div>
                  )}
                </div>
              </div>
              {/*  */}
              { }
              {/* PAN Card */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">PAN Card</h4>
                <div className="border rounded-lg p-2 bg-gray-50 dark:bg-gray-800">
                  {user.panCardUrl ? (
                    <div className="space-y-2">
                      <div className="relative aspect-video w-full overflow-hidden rounded-md border bg-white dark:bg-black">
                        <img
                          src={user.panCardUrl}
                          alt="PAN Card"
                          className="h-full w-full object-contain"
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => window.open(user.panCardUrl!, '_blank')}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        View Full Size
                      </Button>
                    </div>
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center rounded-md border border-dashed bg-white dark:bg-black text-muted-foreground">
                      <span className="text-sm">Not uploaded</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

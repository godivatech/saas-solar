import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthContext } from "@/contexts/auth-context";
import { formatDate } from "@/lib/utils";
import { sanitizeFormData } from "../../../shared/utils/form-sanitizer";
import { TimeInput } from "@/components/time/time-input";
import { TimeDisplay, formatTimeFor12Hour } from "@/components/time/time-display";
import { TimingDialog } from "@/components/departments/timing-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Search, PlusCircle, Pencil, Trash2, UserCog, Users, Loader2, Check, Clock, Timer, Play, Square, Coffee, Shield, Home, Building, MapPin, Settings } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export default function Departments() {
  const { user } = useAuthContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddDepartmentDialog, setShowAddDepartmentDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showTimingDialog, setShowTimingDialog] = useState(false);
  const [currentDepartment, setCurrentDepartment] = useState<any>(null);
  const [formState, setFormState] = useState({
    name: "",
    description: ""
  });
  const [timingFormState, setTimingFormState] = useState({
    checkInTime: "9:00 AM",
    checkOutTime: "6:00 PM",
    workingHours: 8,
    overtimeThresholdMinutes: 30,
    lateThresholdMinutes: 15
  });

  // Only master_admin can access this page
  if (user?.role !== "master_admin") {
    return (
      <Card>
        <CardContent className="py-10">
          <div className="text-center">
            <UserCog className="h-10 w-10 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium">Access Denied</h3>
            <p className="text-sm text-gray-500 mt-2">
              You don't have permission to access this page. This area is restricted to master administrators.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Fetch departments
  const { data: departments, isLoading } = useQuery({
    queryKey: ["/api/departments"],
  });

  // Fetch users for employee count
  const { data: users } = useQuery({
    queryKey: ["/api/users"],
  });

  // Fetch department timings
  const { data: departmentTimings } = useQuery({
    queryKey: ["/api/departments/timings"],
  });

  // Fetch payroll settings for global auto-checkout
  const { data: payrollSettings } = useQuery<any>({
    queryKey: ["/api/payroll/settings"],
  });

  // Auto-sync form state whenever current department or timing data changes
  useEffect(() => {
    if (currentDepartment && showTimingDialog) {
      const timing = departmentTimings?.[currentDepartment.id];

      setTimingFormState({
        checkInTime: timing?.checkInTime || "9:00 AM",
        checkOutTime: timing?.checkOutTime || "6:00 PM",
        workingHours: timing?.workingHours || 8,
        overtimeThresholdMinutes: timing?.overtimeThresholdMinutes || 30,
        lateThresholdMinutes: timing?.lateThresholdMinutes || 15
      });
    }
  }, [currentDepartment, departmentTimings, showTimingDialog]);

  // Global timing mutation
  const updateGlobalSettingsMutation = useMutation({
    mutationFn: (data: { autoCheckoutGraceMinutes: number }) => {
      return apiRequest('/api/payroll/settings', 'POST', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/departments/timings"] });
      toast({
        title: "Settings updated",
        description: "Global attendance settings have been updated.",
      });
    }
  });

  // Helper function to reset form state
  const resetForm = () => {
    setFormState({
      name: "",
      description: ""
    });
    setCurrentDepartment(null);
  };

  // Create department mutation
  const createDepartmentMutation = useMutation({
    mutationFn: (departmentData: { name: string; description: string }) => {
      const sanitized = sanitizeFormData(departmentData, ['description']);
      return apiRequest('/api/departments', 'POST', sanitized);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey[0];
          if (typeof queryKey === 'string') {
            return queryKey.includes('/api/departments') || queryKey.includes('/api/users');
          }
          return false;
        }
      });
      toast({
        title: "Department created",
        description: "The department has been successfully created.",
        variant: "default"
      });
      setShowAddDepartmentDialog(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create department",
        variant: "destructive"
      });
    }
  });

  // Update department mutation
  const updateDepartmentMutation = useMutation({
    mutationFn: (departmentData: { id: number; name: string; description: string }) => {
      const { id, ...data } = departmentData;
      const sanitized = sanitizeFormData(data, ['description']);
      return apiRequest(`/api/departments/${id}`, 'PATCH', sanitized);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey[0];
          if (typeof queryKey === 'string') {
            return queryKey.includes('/api/departments') || queryKey.includes('/api/users');
          }
          return false;
        }
      });
      toast({
        title: "Department updated",
        description: "The department has been successfully updated.",
        variant: "default"
      });
      setShowEditDialog(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update department",
        variant: "destructive"
      });
    }
  });

  // Delete department mutation
  const deleteDepartmentMutation = useMutation({
    mutationFn: (id: number) => {
      return apiRequest(`/api/departments/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey[0];
          if (typeof queryKey === 'string') {
            return queryKey.includes('/api/departments') || queryKey.includes('/api/users');
          }
          return false;
        }
      });
      toast({
        title: "Department deleted",
        description: "The department has been successfully deleted.",
        variant: "default"
      });
      setShowDeleteDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete department",
        variant: "destructive"
      });
    }
  });

  // Enhanced department timing mutation with comprehensive cache management
  const updateTimingMutation = useMutation({
    mutationFn: (data: { departmentId: string; timing: any }) => {
      console.log('DEPARTMENTS: Updating timing for department:', data.departmentId);
      const sanitized = sanitizeFormData(data.timing, ['flexibleCheckInStart', 'flexibleCheckInEnd', 'updatedBy']);
      return apiRequest(`/api/departments/${data.departmentId}/timing`, 'POST', sanitized);
    },
    onSuccess: async (result, variables) => {
      console.log('DEPARTMENTS: Timing update successful for:', variables.departmentId);

      // Step 1: Clear all timing-related cache
      queryClient.removeQueries({
        predicate: (query) => {
          const queryKey = query.queryKey[0];
          if (typeof queryKey === 'string') {
            return queryKey.includes('/api/departments/timing') ||
              queryKey.includes('/api/departments/timings');
          }
          return false;
        }
      });

      // Step 2: Force immediate refetch of ALL department timings 
      console.log('DEPARTMENTS: Force refreshing ALL department timings');
      try {
        await queryClient.refetchQueries({
          queryKey: ["/api/departments/timings"],
          type: 'active'
        });

        // Also refetch the specific department timing
        await queryClient.refetchQueries({
          queryKey: [`/api/departments/${variables.departmentId}/timing`],
          type: 'active'
        });

        console.log('DEPARTMENTS: Department timings refreshed successfully');
      } catch (error) {
        console.error('DEPARTMENTS: Failed to refresh timings:', error);
      }

      // Step 3: Invalidate ALL department and attendance queries for comprehensive refresh
      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey[0];
          if (typeof queryKey === 'string') {
            return queryKey.includes('/api/departments') ||
              queryKey.includes('/api/attendance') ||
              queryKey.includes('timing');
          }
          return false;
        }
      });

      // Step 4: Signal other tabs/windows about the update
      localStorage.setItem('department_timing_updated', Date.now().toString());

      console.log('DEPARTMENTS: All cache operations completed');

      toast({
        title: "Department timing updated",
        description: `${variables.departmentId.toUpperCase()} department timing has been successfully configured. The changes are now visible.`,
        variant: "default"
      });
      setShowTimingDialog(false);
    },
    onError: (error: any) => {
      console.error('DEPARTMENTS: Timing update failed:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update attendance timing",
        variant: "destructive"
      });
    }
  });

  // Transform department strings to objects and filter by search query
  const departmentObjects = Array.isArray(departments) ? departments.map((dept: string) => ({
    id: dept,
    name: dept.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    description: `${dept.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Department`
  })) : [];

  const filteredDepartments = departmentObjects.filter((department: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      department.name?.toLowerCase().includes(query) ||
      department.description?.toLowerCase().includes(query)
    );
  });

  // Count employees in each department
  const getEmployeeCount = (departmentName: string) => {
    return Array.isArray(users) ? users.filter((user: any) => user.department === departmentName.toLowerCase().replace(/ /g, '_')).length : 0;
  };

  return (
    <>
      {/* Global Attendance Settings */}
      <Card className="mb-6 border-blue-200 bg-blue-50/30">
        <CardHeader className="pb-3 px-6 py-4">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Global Attendance Settings</CardTitle>
          </div>
          <CardDescription>Configure organization-wide attendance policies</CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <div className="flex flex-wrap items-end gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Auto-Checkout Grace Period</label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  defaultValue={payrollSettings?.autoCheckoutGraceMinutes ?? 5}
                  className="w-32 bg-white"
                  onBlur={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val) && val !== payrollSettings?.autoCheckoutGraceMinutes) {
                      updateGlobalSettingsMutation.mutate({ autoCheckoutGraceMinutes: val });
                    }
                  }}
                />
                <span className="text-sm text-muted-foreground">minutes after shift end</span>
              </div>
            </div>
            <div className="text-xs text-muted-foreground pb-2 max-w-md bg-white/50 p-2 rounded border border-blue-100 italic">
              <Shield className="h-3 w-3 inline mr-1 text-blue-500" />
              This setting applies to <strong>all departments</strong>. Employees will be automatically checked out if they forget to check out after this duration. Default is 5 minutes.
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between px-6 py-4">
          <div>
            <CardTitle className="text-xl">Departments</CardTitle>
            <CardDescription>Manage company departments</CardDescription>
          </div>
          <Button
            className="bg-primary hover:bg-primary-dark text-white"
            onClick={() => setShowAddDepartmentDialog(true)}
          >
            <PlusCircle className="h-4 w-4 mr-2" />
            Add Department
          </Button>
        </CardHeader>

        <CardContent className="px-6">
          <div className="mb-4 flex items-center">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search departments"
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Department Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Employees</TableHead>
                  <TableHead>Working Hours</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <div className="flex justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredDepartments?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                      {searchQuery ? "No departments match your search" : "No departments found"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDepartments?.map((department: any) => {
                    const timing = departmentTimings && typeof departmentTimings === 'object' ? (departmentTimings as Record<string, any>)[department.id] : null;
                    return (
                      <TableRow key={department.id}>
                        <TableCell>
                          <div className="flex items-center">
                            <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                              <Users className="h-5 w-5" />
                            </div>
                            <div className="ml-3 font-medium">{department.name}</div>
                          </div>
                        </TableCell>
                        <TableCell>{department.description || "-"}</TableCell>
                        <TableCell>{getEmployeeCount(department.name)}</TableCell>
                        <TableCell>
                          {timing ? (
                            <div className="text-sm">
                              <div>
                                <TimeDisplay time={timing.checkInTime} format12Hour={true} /> - <TimeDisplay time={timing.checkOutTime} format12Hour={true} />
                              </div>
                              <div className="text-muted-foreground">{timing.workingHours}h working</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Not configured</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => {
                                setCurrentDepartment(department);
                                setShowTimingDialog(true);
                              }}
                              title="Configure Attendance Timing"
                            >
                              <Clock className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => {
                                setCurrentDepartment(department);
                                setFormState({
                                  name: department.name,
                                  description: department.description || ""
                                });
                                setShowEditDialog(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive"
                              onClick={() => {
                                setCurrentDepartment(department);
                                setShowDeleteDialog(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Department Dialog */}
      < Dialog
        open={showAddDepartmentDialog || showEditDialog}
        onOpenChange={(open) => {
          if (!open) {
            resetForm();
            setShowAddDepartmentDialog(false);
            setShowEditDialog(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{showEditDialog ? 'Edit Department' : 'Add New Department'}</DialogTitle>
            <DialogDescription>
              {showEditDialog ? 'Update department information.' : 'Create a new department in the organization.'}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4 py-4" onSubmit={(e) => {
            e.preventDefault();
            if (showEditDialog) {
              updateDepartmentMutation.mutate({
                id: currentDepartment.id,
                name: formState.name,
                description: formState.description
              });
            } else {
              createDepartmentMutation.mutate(formState);
            }
          }}>
            <div className="grid gap-4">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">Department Name</label>
                <Input
                  id="name"
                  placeholder="Enter department name"
                  required
                  value={formState.name}
                  onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="description" className="text-sm font-medium">Description</label>
                <Input
                  id="description"
                  placeholder="Brief description of the department"
                  value={formState.description}
                  onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  resetForm();
                  if (showEditDialog) {
                    setShowEditDialog(false);
                  } else {
                    setShowAddDepartmentDialog(false);
                  }
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createDepartmentMutation.isPending || updateDepartmentMutation.isPending}
              >
                {(createDepartmentMutation.isPending || updateDepartmentMutation.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {showEditDialog ? 'Update Department' : 'Create Department'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog >
      {/* Delete Confirmation Dialog */}
      < AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog} >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the department
              {currentDepartment ? ` "${currentDepartment.name}"` : ''} and all related data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (currentDepartment) {
                  deleteDepartmentMutation.mutate(currentDepartment.id);
                }
              }}
              disabled={deleteDepartmentMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteDepartmentMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin inline" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog >

      {/* Advanced Department Timing Configuration Dialog */}
      <Dialog open={showTimingDialog} onOpenChange={(open) => {
        setShowTimingDialog(open);
        if (!open) {
          setCurrentDepartment(null);
        }
      }}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Configure Work Schedule - {currentDepartment?.name}
            </DialogTitle>
            <DialogDescription>
              Set up comprehensive work timings, shifts, and attendance policies for this department.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-8" onSubmit={(e) => {
            e.preventDefault();
            updateTimingMutation.mutate({
              departmentId: currentDepartment.id,
              timing: timingFormState
            });
          }}>

            {/* Visual Time Picker */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Timer className="h-4 w-4" />
                Work Schedule
              </h3>

              {/* Visual Timeline */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex justify-between text-xs text-gray-500 mb-2">
                  <span>12 AM</span>
                  <span>6 AM</span>
                  <span>12 PM</span>
                  <span>6 PM</span>
                  <span>11 PM</span>
                </div>
                <div className="relative h-8 bg-gray-200 rounded-full overflow-hidden">
                  {(() => {
                    // Parse 12-hour format times properly
                    const startMatch = timingFormState.checkInTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
                    const endMatch = timingFormState.checkOutTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);

                    let startHour = 9, startMin = 0, endHour = 18, endMin = 0; // Defaults

                    if (startMatch) {
                      let [, hours, minutes, period] = startMatch;
                      startHour = parseInt(hours);
                      startMin = parseInt(minutes);
                      if (period.toUpperCase() === 'PM' && startHour !== 12) startHour += 12;
                      if (period.toUpperCase() === 'AM' && startHour === 12) startHour = 0;
                    }

                    if (endMatch) {
                      let [, hours, minutes, period] = endMatch;
                      endHour = parseInt(hours);
                      endMin = parseInt(minutes);
                      if (period.toUpperCase() === 'PM' && endHour !== 12) endHour += 12;
                      if (period.toUpperCase() === 'AM' && endHour === 12) endHour = 0;
                    }

                    const startPercent = ((startHour * 60 + startMin) / (24 * 60)) * 100;
                    let endPercent = ((endHour * 60 + endMin) / (24 * 60)) * 100;

                    // Handle overnight shifts
                    if (endPercent <= startPercent) {
                      endPercent = 100;
                    }

                    const width = endPercent - startPercent;

                    return (
                      <div
                        className="absolute h-full bg-gradient-to-r from-green-400 to-blue-500 rounded-full"
                        style={{
                          left: `${startPercent}%`,
                          width: `${width}%`
                        }}
                      />
                    );
                  })()}
                </div>
                <div className="flex justify-between mt-2">
                  <div className="text-sm">
                    <span className="font-medium text-green-600">Start: <TimeDisplay time={timingFormState.checkInTime} format12Hour={true} /></span>
                  </div>
                  <div className="text-sm">
                    <span className="font-medium text-blue-600">End: <TimeDisplay time={timingFormState.checkOutTime} format12Hour={true} /></span>
                  </div>
                </div>
              </div>

              {/* Time Inputs with Better UX */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Play className="h-4 w-4 text-green-600" />
                    Check-in Time
                  </label>
                  <div className="relative">
                    <TimeInput
                      value={timingFormState.checkInTime}
                      onChange={(value) => setTimingFormState({
                        ...timingFormState,
                        checkInTime: value
                      })}
                      className="text-lg"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Square className="h-4 w-4 text-red-600" />
                    Check-out Time
                  </label>
                  <div className="relative">
                    <TimeInput
                      value={timingFormState.checkOutTime}
                      onChange={(value) => setTimingFormState({
                        ...timingFormState,
                        checkOutTime: value
                      })}
                      className="text-lg"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Attendance Policies */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Attendance Policies
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Late Arrival Grace Period</label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        value={timingFormState.lateThresholdMinutes}
                        onChange={(e) => setTimingFormState({
                          ...timingFormState,
                          lateThresholdMinutes: parseInt(e.target.value) || 15
                        })}
                        className="w-32"
                        placeholder="Enter minutes"
                      />
                      <span className="text-sm text-muted-foreground">minutes</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Overtime Threshold</label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        value={timingFormState.overtimeThresholdMinutes}
                        onChange={(e) => setTimingFormState({
                          ...timingFormState,
                          overtimeThresholdMinutes: parseInt(e.target.value) || 30
                        })}
                        className="w-32"
                        placeholder="Enter minutes"
                      />
                      <span className="text-sm text-muted-foreground">minutes</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Standard Working Hours</label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="1"
                        max="24"
                        step="0.5"
                        value={timingFormState.workingHours}
                        onChange={(e) => setTimingFormState({
                          ...timingFormState,
                          workingHours: parseFloat(e.target.value) || 8
                        })}
                        className="w-32"
                        placeholder="e.g., 8"
                      />
                      <span className="text-sm text-muted-foreground">hours/day</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground italic">
                      Used as divisor for OT hourly rate calculation (Daily Salary / Working Hours)
                    </p>
                  </div>
                </div>



              </div>
            </div>

            {/* Summary Card */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">Schedule Summary</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-blue-700 font-medium">Working Hours:</span>
                  <div className="text-blue-900">{timingFormState.workingHours} hours/day</div>
                </div>
                <div>
                  <span className="text-blue-700 font-medium">Late Grace:</span>
                  <div className="text-blue-900">{timingFormState.lateThresholdMinutes} minutes</div>
                </div>
                <div>
                  <span className="text-blue-700 font-medium">Auto-Checkout:</span>
                  <div className="text-blue-900">{payrollSettings?.autoCheckoutGraceMinutes ?? 5} mins (Global)</div>
                </div>
              </div>
            </div>


            <div className="flex justify-end space-x-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowTimingDialog(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateTimingMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {updateTimingMutation.isPending ? "Saving Schedule..." : "Save Schedule"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog >
    </>
  );
}

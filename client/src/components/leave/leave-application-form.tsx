import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuthContext } from "@/contexts/auth-context";
import { sanitizeFormData } from "../../../../shared/utils/form-sanitizer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DatePicker } from "@/components/ui/date-picker";
import { TimeInput } from "@/components/ui/time-input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Calendar, Clock, FileText, Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";

const leaveApplicationFormSchema = z.object({
  leaveType: z.enum(["casual_leave", "permission", "unpaid_leave"]),
  startDate: z.date().nullish(),
  endDate: z.date().nullish(),
  permissionDate: z.date().nullish(),
  permissionStartTime: z.string().nullish(),
  permissionEndTime: z.string().nullish(),
  reason: z.string().min(10, "Reason must be at least 10 characters"),
}).superRefine((data, ctx) => {
  if ((data.leaveType === "casual_leave" || data.leaveType === "unpaid_leave") && !data.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Start date is required",
      path: ["startDate"],
    });
  }
  if ((data.leaveType === "casual_leave" || data.leaveType === "unpaid_leave") && !data.endDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "End date is required",
      path: ["endDate"],
    });
  }
  if (data.leaveType === "permission" && !data.permissionDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Permission date is required",
      path: ["permissionDate"],
    });
  }
  if (data.leaveType === "permission" && !data.permissionStartTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Start time is required",
      path: ["permissionStartTime"],
    });
  }
  if (data.leaveType === "permission" && !data.permissionEndTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "End time is required",
      path: ["permissionEndTime"],
    });
  }
});

type LeaveApplicationFormData = z.infer<typeof leaveApplicationFormSchema>;

interface LeaveApplicationFormProps {
  onSuccess?: () => void;
}

export function LeaveApplicationForm({ onSuccess }: LeaveApplicationFormProps) {
  const { user } = useAuthContext();
  const { toast } = useToast();
  const [totalDays, setTotalDays] = useState<number>(0);
  const [permissionHours, setPermissionHours] = useState<number>(0);

  const form = useForm<LeaveApplicationFormData>({
    resolver: zodResolver(leaveApplicationFormSchema),
    defaultValues: {
      leaveType: "casual_leave",
      reason: "",
    },
  });

  const leaveType = form.watch("leaveType");
  const startDate = form.watch("startDate");
  const endDate = form.watch("endDate");
  const permissionStartTime = form.watch("permissionStartTime");
  const permissionEndTime = form.watch("permissionEndTime");

  const { data: leaveBalance, isLoading: balanceLoading } = useQuery<{
    casualLeaveBalance: number;
    casualLeaveUsed: number;
    permissionHoursBalance: number;
    permissionHoursUsed: number;
  }>({
    queryKey: ["/api/leave-balance/current"],
    enabled: !!user,
  });

  useEffect(() => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      setTotalDays(diffDays);
    } else {
      setTotalDays(0);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    if (permissionStartTime && permissionEndTime) {
      const parseTime = (timeStr: string) => {
        const [time, period] = timeStr.split(" ");
        let [hours, minutes] = time.split(":").map(Number);
        if (period === "PM" && hours !== 12) hours += 12;
        if (period === "AM" && hours === 12) hours = 0;
        return hours + minutes / 60;
      };
      const startHours = parseTime(permissionStartTime);
      const endHours = parseTime(permissionEndTime);
      const diff = Math.abs(endHours - startHours);
      setPermissionHours(diff);
    } else {
      setPermissionHours(0);
    }
  }, [permissionStartTime, permissionEndTime]);

  const missingFields: string[] = [];
  if (!user?.uid) missingFields.push("User ID");
  if (!user?.displayName) missingFields.push("Name");
  if (!user?.department) missingFields.push("Department");
  if (!user?.designation) missingFields.push("Designation");
  
  const isProfileComplete = missingFields.length === 0;

  const applyLeaveMutation = useMutation({
    mutationFn: async (data: LeaveApplicationFormData) => {
      if (!isProfileComplete) {
        throw new Error("User profile is incomplete. Please contact HR to update your profile.");
      }

      let payload: any = {
        userId: user!.uid,
        employeeId: user!.employeeId || user!.uid,
        userName: user!.displayName,
        userDepartment: user!.department,
        userDesignation: user!.designation,
        leaveType: data.leaveType,
        reason: data.reason,
        reportingManagerId: user!.reportingManagerId || null,
      };

      if (data.leaveType === "casual_leave" || data.leaveType === "unpaid_leave") {
        payload.startDate = data.startDate;
        payload.endDate = data.endDate;
        payload.totalDays = totalDays;
      } else if (data.leaveType === "permission") {
        payload.permissionDate = data.permissionDate;
        payload.permissionStartTime = data.permissionStartTime;
        payload.permissionEndTime = data.permissionEndTime;
        payload.permissionHours = permissionHours;
      }

      if (leaveBalance) {
        payload.balanceAtApplication = {
          casualLeaveAvailable: leaveBalance.casualLeaveBalance - leaveBalance.casualLeaveUsed,
          permissionHoursAvailable: leaveBalance.permissionHoursBalance - leaveBalance.permissionHoursUsed,
        };
      }

      payload = sanitizeFormData(payload, ['reason']);
      return apiRequest("/api/leave-applications", "POST", payload);
    },
    onSuccess: () => {
      toast({
        title: "Leave Applied Successfully",
        description: "Your leave application has been submitted for approval.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leave-applications/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leave-balance/current"] });
      form.reset();
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to apply leave. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LeaveApplicationFormData) => {
    if (leaveType === "casual_leave" && leaveBalance) {
      const available = leaveBalance.casualLeaveBalance - leaveBalance.casualLeaveUsed;
      if (totalDays > available) {
        toast({
          title: "Insufficient Balance",
          description: `You only have ${available} casual leave days available.`,
          variant: "destructive",
        });
        return;
      }
    }

    if (leaveType === "permission" && leaveBalance) {
      const available = leaveBalance.permissionHoursBalance - leaveBalance.permissionHoursUsed;
      if (permissionHours > available) {
        toast({
          title: "Insufficient Balance",
          description: `You only have ${available} hours of permission available.`,
          variant: "destructive",
        });
        return;
      }
      if (permissionHours > 2) {
        toast({
          title: "Invalid Duration",
          description: "Permission cannot exceed 2 hours.",
          variant: "destructive",
        });
        return;
      }
    }

    applyLeaveMutation.mutate(data);
  };

  if (balanceLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const casualLeaveAvailable = leaveBalance
    ? leaveBalance.casualLeaveBalance - leaveBalance.casualLeaveUsed
    : 0;
  const permissionHoursAvailable = leaveBalance
    ? leaveBalance.permissionHoursBalance - leaveBalance.permissionHoursUsed
    : 0;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6" data-testid="form-leave-application">
      {!isProfileComplete && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs sm:text-sm">
            Your profile is incomplete. Missing: <strong>{missingFields.join(", ")}</strong>. Please contact HR to update your profile before applying for leave.
          </AlertDescription>
        </Alert>
      )}
      
      <Card>
        <CardContent className="pt-4 sm:pt-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span className="break-words">
                Available: {casualLeaveAvailable} casual leave day(s) | {permissionHoursAvailable} permission hour(s)
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div>
          <Label htmlFor="leaveType" className="text-sm sm:text-base">Leave Type</Label>
          <RadioGroup
            value={form.watch("leaveType")}
            onValueChange={(value) => form.setValue("leaveType", value as any)}
            className="mt-2 space-y-2"
            data-testid="radio-group-leave-type"
          >
            <div className="flex items-start space-x-2">
              <RadioGroupItem value="casual_leave" id="casual_leave" data-testid="radio-casual-leave" className="mt-0.5" />
              <Label htmlFor="casual_leave" className="font-normal cursor-pointer text-xs sm:text-sm leading-relaxed">
                Casual Leave (1 day/month) - {casualLeaveAvailable} available
              </Label>
            </div>
            <div className="flex items-start space-x-2">
              <RadioGroupItem value="permission" id="permission" data-testid="radio-permission" className="mt-0.5" />
              <Label htmlFor="permission" className="font-normal cursor-pointer text-xs sm:text-sm leading-relaxed">
                Permission (2 hours/month) - {permissionHoursAvailable} hours available
              </Label>
            </div>
            <div className="flex items-start space-x-2">
              <RadioGroupItem value="unpaid_leave" id="unpaid_leave" data-testid="radio-unpaid-leave" className="mt-0.5" />
              <Label htmlFor="unpaid_leave" className="font-normal cursor-pointer text-xs sm:text-sm leading-relaxed">
                Unpaid Leave (Will be deducted from salary)
              </Label>
            </div>
          </RadioGroup>
        </div>

        {(leaveType === "casual_leave" || leaveType === "unpaid_leave") && (
          <div className="space-y-4 p-3 sm:p-4 border rounded-lg bg-muted/50">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Label htmlFor="startDate" className="text-sm">Start Date</Label>
                <DatePicker
                  date={form.watch("startDate")}
                  setDate={(date) => form.setValue("startDate", date)}
                  data-testid="date-picker-start"
                />
                {form.formState.errors.startDate && (
                  <p className="text-xs sm:text-sm text-destructive mt-1">{form.formState.errors.startDate.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="endDate" className="text-sm">End Date</Label>
                <DatePicker
                  date={form.watch("endDate")}
                  setDate={(date) => form.setValue("endDate", date)}
                  data-testid="date-picker-end"
                />
                {form.formState.errors.endDate && (
                  <p className="text-xs sm:text-sm text-destructive mt-1">{form.formState.errors.endDate.message}</p>
                )}
              </div>
            </div>
            {totalDays > 0 && (
              <Alert>
                <Calendar className="h-4 w-4" />
                <AlertDescription className="text-xs sm:text-sm">Total Days: {totalDays}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {leaveType === "permission" && (
          <div className="space-y-4 p-3 sm:p-4 border rounded-lg bg-muted/50">
            <div>
              <Label htmlFor="permissionDate" className="text-sm">Permission Date</Label>
              <DatePicker
                date={form.watch("permissionDate")}
                setDate={(date) => form.setValue("permissionDate", date)}
                data-testid="date-picker-permission"
              />
              {form.formState.errors.permissionDate && (
                <p className="text-xs sm:text-sm text-destructive mt-1">{form.formState.errors.permissionDate.message}</p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Label htmlFor="permissionStartTime" className="text-sm">Start Time</Label>
                <TimeInput
                  value={form.watch("permissionStartTime") || ""}
                  onChange={(value) => form.setValue("permissionStartTime", value)}
                  data-testid="input-start-time"
                />
                {form.formState.errors.permissionStartTime && (
                  <p className="text-xs sm:text-sm text-destructive mt-1">{form.formState.errors.permissionStartTime.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="permissionEndTime" className="text-sm">End Time</Label>
                <TimeInput
                  value={form.watch("permissionEndTime") || ""}
                  onChange={(value) => form.setValue("permissionEndTime", value)}
                  data-testid="input-end-time"
                />
                {form.formState.errors.permissionEndTime && (
                  <p className="text-xs sm:text-sm text-destructive mt-1">{form.formState.errors.permissionEndTime.message}</p>
                )}
              </div>
            </div>
            {permissionHours > 0 && (
              <Alert>
                <Clock className="h-4 w-4" />
                <AlertDescription className="text-xs sm:text-sm">
                  Duration: {permissionHours.toFixed(1)} hour(s)
                  {permissionHours > 2 && (
                    <span className="text-destructive ml-2">(Maximum 2 hours allowed)</span>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <div>
          <Label htmlFor="reason" className="text-sm sm:text-base">Reason</Label>
          <Textarea
            id="reason"
            placeholder="Enter reason for leave (minimum 10 characters)"
            className="mt-1 text-sm sm:text-base"
            {...form.register("reason")}
            data-testid="textarea-reason"
          />
          {form.formState.errors.reason && (
            <p className="text-xs sm:text-sm text-destructive mt-1">{form.formState.errors.reason.message}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            form.reset();
            onSuccess?.();
          }}
          data-testid="button-cancel"
          className="w-full sm:w-auto order-2 sm:order-1"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={applyLeaveMutation.isPending || !isProfileComplete}
          data-testid="button-submit"
          className="w-full sm:w-auto order-1 sm:order-2"
        >
          {applyLeaveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit Application
        </Button>
      </div>
    </form>
  );
}

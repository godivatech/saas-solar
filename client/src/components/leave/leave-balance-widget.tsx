import { useQuery } from "@tanstack/react-query";
import { useAuthContext } from "@/contexts/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Plus, Loader2 } from "lucide-react";

interface LeaveBalanceWidgetProps {
  onApplyLeave?: () => void;
  onViewHistory?: () => void;
}

export function LeaveBalanceWidget({ onApplyLeave, onViewHistory }: LeaveBalanceWidgetProps) {
  const { user } = useAuthContext();

  const { data: leaveBalance, isLoading } = useQuery<{
    casualLeaveBalance: number;
    casualLeaveUsed: number;
    permissionHoursBalance: number;
    permissionHoursUsed: number;
    month: number;
    year: number;
  }>({
    queryKey: ["/api/leave-balance/current"],
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <Card data-testid="card-leave-balance">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            My Leave Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const currentMonth = leaveBalance?.month ? monthNames[leaveBalance.month - 1] : monthNames[new Date().getMonth()];

  const casualLeaveUsed = leaveBalance?.casualLeaveUsed || 0;
  const casualLeaveTotal = leaveBalance?.casualLeaveBalance || 1;
  const casualLeaveAvailable = casualLeaveTotal - casualLeaveUsed;
  const casualLeavePercentage = (casualLeaveUsed / casualLeaveTotal) * 100;

  const permissionUsed = leaveBalance?.permissionHoursUsed || 0;
  const permissionTotal = leaveBalance?.permissionHoursBalance || 2;
  const permissionAvailable = permissionTotal - permissionUsed;
  const permissionPercentage = (permissionUsed / permissionTotal) * 100;

  return (
    <Card data-testid="card-leave-balance">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          My Leave Balance
        </CardTitle>
        <CardDescription>{currentMonth} {leaveBalance?.year || new Date().getFullYear()}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Casual Leave</span>
            </div>
            <span className="text-sm font-semibold" data-testid="text-casual-leave-balance">
              {casualLeaveAvailable}/{casualLeaveTotal}
            </span>
          </div>
          <Progress value={casualLeavePercentage} className="h-2" data-testid="progress-casual-leave" />
          <p className="text-xs text-muted-foreground">
            {casualLeaveUsed} used, {casualLeaveAvailable} available
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Permission</span>
            </div>
            <span className="text-sm font-semibold" data-testid="text-permission-balance">
              {permissionAvailable}/{permissionTotal}h
            </span>
          </div>
          <Progress value={permissionPercentage} className="h-2" data-testid="progress-permission" />
          <p className="text-xs text-muted-foreground">
            {permissionUsed} hours used, {permissionAvailable} hours available
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          {onApplyLeave && (
            <Button
              onClick={onApplyLeave}
              className="flex-1"
              size="sm"
              data-testid="button-apply-leave"
            >
              <Plus className="h-4 w-4 mr-1" />
              Apply Leave
            </Button>
          )}
          {onViewHistory && (
            <Button
              onClick={onViewHistory}
              variant="outline"
              className="flex-1"
              size="sm"
              data-testid="button-view-history"
            >
              View History
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

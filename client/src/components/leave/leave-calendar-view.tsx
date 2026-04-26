import { useQuery } from "@tanstack/react-query";
import { useAuthContext } from "@/contexts/auth-context";
import { formatDate } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface LeaveCalendarViewProps {
  userId?: string;
  year?: number;
  month?: number;
}

export function LeaveCalendarView({ userId, year, month }: LeaveCalendarViewProps) {
  const { user } = useAuthContext();
  const targetUserId = userId || user?.uid;
  
  const currentYear = year || new Date().getFullYear();
  const currentMonth = month || new Date().getMonth() + 1;

  const { data: leaves, isLoading } = useQuery<any[]>({
    queryKey: ["/api/leave-applications/my", targetUserId],
    enabled: !!targetUserId,
  });

  const leaveDates = new Set<string>();
  const leaveDetails: Record<string, any[]> = {};

  leaves?.forEach((leave: any) => {
    if (leave.status === "approved") {
      if (leave.leaveType === "permission") {
        const dateStr = formatDate(leave.permissionDate);
        leaveDates.add(dateStr);
        if (!leaveDetails[dateStr]) leaveDetails[dateStr] = [];
        leaveDetails[dateStr].push(leave);
      } else {
        const start = new Date(leave.startDate);
        const end = new Date(leave.endDate);
        
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = formatDate(new Date(d));
          leaveDates.add(dateStr);
          if (!leaveDetails[dateStr]) leaveDetails[dateStr] = [];
          leaveDetails[dateStr].push(leave);
        }
      }
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Loading calendar...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4" data-testid="container-leave-calendar">
      <div className="flex justify-center">
        <Calendar
          mode="single"
          selected={undefined}
          className="rounded-md border w-full sm:w-auto"
          modifiers={{
            leave: (date) => {
              const dateStr = formatDate(date);
              return leaveDates.has(dateStr);
            },
          }}
          modifiersStyles={{
            leave: {
              backgroundColor: "var(--primary)",
              color: "white",
              fontWeight: "bold",
            },
          }}
        />
      </div>
      
      <Card>
        <CardHeader className="px-4 sm:px-6 py-3 sm:py-4">
          <CardTitle className="text-sm sm:text-base">Legend</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-primary flex-shrink-0"></div>
            <span className="text-xs sm:text-sm">Approved Leave Days</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Total approved leaves this month: {
              Array.from(leaveDates).filter(dateStr => {
                const date = new Date(dateStr);
                return date.getMonth() + 1 === currentMonth && date.getFullYear() === currentYear;
              }).length
            }
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

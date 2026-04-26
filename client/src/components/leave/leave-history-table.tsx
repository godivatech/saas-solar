import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthContext } from "@/contexts/auth-context";
import { formatDate } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Search, Loader2, Eye, Calendar, Clock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LeaveHistoryTableProps {
  onViewDetails?: (leaveId: string) => void;
}

export function LeaveHistoryTable({ onViewDetails }: LeaveHistoryTableProps) {
  const { user } = useAuthContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: leaves, isLoading } = useQuery<any[]>({
    queryKey: ["/api/leave-applications/my"],
    enabled: !!user,
  });

  const filteredLeaves = leaves?.filter((leave: any) => {
    if (statusFilter !== "all" && leave.status !== statusFilter) return false;
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      leave.reason?.toLowerCase().includes(query) ||
      leave.leaveType?.toLowerCase().includes(query)
    );
  });

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending_manager: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      pending_hr: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      approved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      rejected_by_manager: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      rejected_by_hr: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending_manager: "Pending Manager",
      pending_hr: "Pending HR",
      approved: "Approved",
      rejected_by_manager: "Rejected by Manager",
      rejected_by_hr: "Rejected by HR",
      cancelled: "Cancelled",
    };
    return labels[status] || status;
  };

  const getLeaveTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      casual_leave: "Casual Leave",
      permission: "Permission",
      unpaid_leave: "Unpaid Leave",
    };
    return labels[type] || type;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Loading leave history...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4" data-testid="container-leave-history">
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search by reason or type..."
            className="pl-10 text-sm sm:text-base"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-history"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[200px] text-sm sm:text-base" data-testid="select-status-filter">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending_manager">Pending Manager</SelectItem>
            <SelectItem value="pending_hr">Pending HR</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected_by_manager">Rejected by Manager</SelectItem>
            <SelectItem value="rejected_by_hr">Rejected by HR</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border overflow-x-auto -mx-2 sm:mx-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap text-xs sm:text-sm">Type</TableHead>
              <TableHead className="whitespace-nowrap text-xs sm:text-sm">Period/Date</TableHead>
              <TableHead className="whitespace-nowrap text-xs sm:text-sm">Duration</TableHead>
              <TableHead className="whitespace-nowrap text-xs sm:text-sm min-w-[120px]">Reason</TableHead>
              <TableHead className="whitespace-nowrap text-xs sm:text-sm">Status</TableHead>
              <TableHead className="whitespace-nowrap text-xs sm:text-sm">Applied On</TableHead>
              <TableHead className="text-right whitespace-nowrap text-xs sm:text-sm">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLeaves?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-xs sm:text-sm text-gray-500">
                  {searchQuery || statusFilter !== "all"
                    ? "No leave records match your filters"
                    : "No leave records found"}
                </TableCell>
              </TableRow>
            ) : (
              filteredLeaves?.map((leave: any) => (
                <TableRow key={leave.id} data-testid={`row-leave-${leave.id}`}>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex items-center gap-1 sm:gap-2">
                      {leave.leaveType === "permission" ? (
                        <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <Calendar className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <span className="font-medium text-xs sm:text-sm">{getLeaveTypeLabel(leave.leaveType)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {leave.leaveType === "permission" ? (
                      <div className="text-xs sm:text-sm">
                        {formatDate(leave.permissionDate)}
                      </div>
                    ) : (
                      <div className="text-xs sm:text-sm">
                        {formatDate(leave.startDate)} - {formatDate(leave.endDate)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs sm:text-sm">
                    {leave.leaveType === "permission" ? (
                      <span>{leave.permissionHours}h</span>
                    ) : (
                      <span>{leave.totalDays} day(s)</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[120px] sm:max-w-xs">
                    <div className="truncate text-xs sm:text-sm" title={leave.reason}>
                      {leave.reason}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge className={cn("font-medium text-xs", getStatusColor(leave.status))}>
                      {getStatusLabel(leave.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs sm:text-sm">{formatDate(leave.applicationDate || leave.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    {onViewDetails && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onViewDetails(leave.id)}
                        data-testid={`button-view-${leave.id}`}
                        className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                      >
                        <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

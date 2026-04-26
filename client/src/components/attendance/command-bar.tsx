import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Download, RefreshCw, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  selectedDepartment: string;
  onDepartmentChange: (value: string) => void;
  selectedStatus: string;
  onStatusChange: (value: string) => void;
  onExport: () => void;
  onRefresh: () => void;
  lastUpdated?: string;
  isRefreshing?: boolean;
  datePresets: Array<{ label: string; value: string; onClick: () => void }>;
  selectedDate?: Date;
  departments?: string[];
}

export function CommandBar({
  searchQuery,
  onSearchChange,
  selectedDepartment,
  onDepartmentChange,
  selectedStatus,
  onStatusChange,
  onExport,
  onRefresh,
  lastUpdated,
  isRefreshing = false,
  datePresets,
  selectedDate,
  departments = [],
}: CommandBarProps) {
  const isToday = (date?: Date) => {
    if (!date) return false;
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  return (
    <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="px-4 md:px-6 py-4 space-y-4">
        {/* Date Presets Row */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
          <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="flex gap-2">
            {datePresets.map((preset) => (
              <Button
                key={preset.value}
                variant={preset.value === "today" && isToday(selectedDate) ? "default" : "outline"}
                size="sm"
                onClick={preset.onClick}
                className="whitespace-nowrap"
                data-testid={`date-preset-${preset.value}`}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10"
              data-testid="input-search"
            />
          </div>

          {/* Department Filter */}
          <Select value={selectedDepartment} onValueChange={onDepartmentChange}>
            <SelectTrigger className="w-full md:w-[180px]" data-testid="select-department">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map((dept) => (
                <SelectItem key={dept} value={dept}>
                  {dept.charAt(0).toUpperCase() + dept.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select value={selectedStatus} onValueChange={onStatusChange}>
            <SelectTrigger className="w-full md:w-[150px]" data-testid="select-status">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="present">Present</SelectItem>
              <SelectItem value="absent">Absent</SelectItem>
              <SelectItem value="late">Late</SelectItem>
              <SelectItem value="leave">On Leave</SelectItem>
            </SelectContent>
          </Select>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Refresh data"
              data-testid="button-refresh"
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
            <Button
              variant="outline"
              onClick={onExport}
              className="gap-2"
              data-testid="button-export"
            >
              <Download className="h-4 w-4" />
              <span className="hidden md:inline">Export</span>
            </Button>
          </div>
        </div>

        {/* Last Updated */}
        {lastUpdated && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-xs">
              Last updated: {lastUpdated}
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}

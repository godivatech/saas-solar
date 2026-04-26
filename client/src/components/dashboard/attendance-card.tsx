import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface AttendanceItem {
  status: "present" | "leave" | "absent";
  count: number;
  total: number;
}

interface AttendanceCardProps {
  date?: Date;
  items: AttendanceItem[];
  onCheckInOut: () => void;
}

export function AttendanceCard({ date = new Date(), items, onCheckInOut }: AttendanceCardProps) {
  // Status color mapping
  const statusColors = {
    present: "bg-success",
    leave: "bg-warning",
    absent: "bg-destructive"
  };

  // Status label mapping
  const statusLabels = {
    present: "Present",
    leave: "On Leave",
    absent: "Absent"
  };

  return (
    <Card className="border border-gray-200">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">Today's Attendance</h2>
          <div className="text-sm text-gray-500">{formatDate(date)}</div>
        </div>
        
        {items.map((item, index) => (
          <div key={index} className="flex items-center justify-between mb-3">
            <div>
              <span className={`inline-block w-3 h-3 rounded-full ${statusColors[item.status]} mr-2`}></span>
              <span className="text-sm">{statusLabels[item.status]}</span>
            </div>
            <span className="font-semibold">{item.count}/{item.total}</span>
          </div>
        ))}
        
        <div className="flex justify-end mt-5">
          <Button 
            variant="ghost" 
            className="text-secondary text-sm font-medium"
            onClick={onCheckInOut}
          >
            <span>Check In/Out</span>
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

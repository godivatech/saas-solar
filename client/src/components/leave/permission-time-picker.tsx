import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { TimeInput } from "@/components/ui/time-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Clock, AlertCircle } from "lucide-react";

interface PermissionTimePickerProps {
  startTime: string;
  endTime: string;
  onStartTimeChange: (time: string) => void;
  onEndTimeChange: (time: string) => void;
  maxHours?: number;
}

export function PermissionTimePicker({
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
  maxHours = 2,
}: PermissionTimePickerProps) {
  const [duration, setDuration] = useState<number>(0);
  const [isValid, setIsValid] = useState<boolean>(true);

  useEffect(() => {
    if (startTime && endTime) {
      const parseTime = (timeStr: string) => {
        const [time, period] = timeStr.split(" ");
        let [hours, minutes] = time.split(":").map(Number);
        if (period === "PM" && hours !== 12) hours += 12;
        if (period === "AM" && hours === 12) hours = 0;
        return hours + minutes / 60;
      };

      const startHours = parseTime(startTime);
      const endHours = parseTime(endTime);
      const calculatedDuration = Math.abs(endHours - startHours);
      
      setDuration(calculatedDuration);
      setIsValid(calculatedDuration > 0 && calculatedDuration <= maxHours);
    } else {
      setDuration(0);
      setIsValid(true);
    }
  }, [startTime, endTime, maxHours]);

  const formatDuration = (hours: number) => {
    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);
    
    if (wholeHours === 0) {
      return `${minutes} minutes`;
    } else if (minutes === 0) {
      return `${wholeHours} hour${wholeHours > 1 ? 's' : ''}`;
    } else {
      return `${wholeHours} hour${wholeHours > 1 ? 's' : ''} ${minutes} minutes`;
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4" data-testid="container-permission-time-picker">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div>
          <Label htmlFor="startTime" className="text-sm">Start Time</Label>
          <TimeInput
            value={startTime}
            onChange={onStartTimeChange}
            data-testid="input-permission-start-time"
          />
        </div>
        <div>
          <Label htmlFor="endTime" className="text-sm">End Time</Label>
          <TimeInput
            value={endTime}
            onChange={onEndTimeChange}
            data-testid="input-permission-end-time"
          />
        </div>
      </div>

      {duration > 0 && (
        <Alert variant={isValid ? "default" : "destructive"}>
          <Clock className="h-4 w-4 flex-shrink-0" />
          <AlertDescription className="text-xs sm:text-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-2">
              <span data-testid="text-permission-duration">Duration: {formatDuration(duration)}</span>
              {!isValid && (
                <div className="flex items-center gap-1 text-destructive">
                  <AlertCircle className="h-3 w-3 flex-shrink-0" />
                  <span className="text-xs">Exceeds {maxHours} hour limit</span>
                </div>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="text-xs text-muted-foreground space-y-1">
        <p>• Permission duration must not exceed {maxHours} hours</p>
        <p>• Select a time range within your working hours</p>
      </div>
    </div>
  );
}

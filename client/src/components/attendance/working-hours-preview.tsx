import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Zap, AlertTriangle } from 'lucide-react';
import { TimeDisplay } from '@/components/time/time-display';

interface WorkingHoursPreviewProps {
  checkInTime: string | Date;
  currentTime?: Date;
  departmentTiming: {
    checkInTime: string;
    checkOutTime: string;
    workingHours: number;
    overtimeThresholdMinutes: number;
  };
  className?: string;
}

export function WorkingHoursPreview({ 
  checkInTime, 
  currentTime = new Date(), 
  departmentTiming,
  className = ""
}: WorkingHoursPreviewProps) {
  
  const calculatePreview = () => {
    const checkIn = new Date(checkInTime);
    const now = currentTime;
    
    // FIXED: Proper 12-hour format parsing for department times
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // FIXED: Parse department schedule times for early arrival + late departure OT calculation
    const parseTime12Hour = (timeStr: string): Date => {
      const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (!timeMatch) {
        const fallback = new Date(today);
        fallback.setHours(timeStr.includes('out') ? 18 : 9, 0, 0, 0);
        return fallback;
      }
      
      let [, hours, minutes, period] = timeMatch;
      let hour24 = parseInt(hours);
      if (period.toUpperCase() === 'PM' && hour24 !== 12) hour24 += 12;
      if (period.toUpperCase() === 'AM' && hour24 === 12) hour24 = 0;
      
      const date = new Date(today);
      date.setHours(hour24, parseInt(minutes), 0, 0);
      return date;
    };
    
    const departCheckIn = parseTime12Hour(departmentTiming.checkInTime);
    const departCheckOut = parseTime12Hour(departmentTiming.checkOutTime);
    
    // FIXED: Calculate early arrival + late departure overtime (industry standard)
    let overtimeMinutes = 0;
    
    // Early arrival overtime: work before department start time
    if (checkIn < departCheckIn) {
      overtimeMinutes += Math.floor((departCheckIn.getTime() - checkIn.getTime()) / (1000 * 60));
    }
    
    // Late departure overtime: work after department end time
    if (now > departCheckOut) {
      overtimeMinutes += Math.floor((now.getTime() - departCheckOut.getTime()) / (1000 * 60));
    }
    
    // Calculate regular working time (within department schedule)
    const workStart = new Date(Math.max(checkIn.getTime(), departCheckIn.getTime()));
    const workEnd = new Date(Math.min(now.getTime(), departCheckOut.getTime()));
    const regularMinutes = Math.max(0, Math.floor((workEnd.getTime() - workStart.getTime()) / (1000 * 60)));
    
    const totalWorkingMinutes = regularMinutes + overtimeMinutes;
    
    const isCurrentlyOvertime = overtimeMinutes > 0;
    
    return {
      currentWorkingHours: totalWorkingMinutes / 60,
      currentWorkingMinutes: totalWorkingMinutes,
      currentRegularHours: regularMinutes / 60,
      currentRegularMinutes: regularMinutes,
      isCurrentlyOvertime,
      overtimeMinutes,
      overtimeHours: overtimeMinutes / 60,
      standardEndTime: departCheckOut,
      departmentStartTime: departCheckIn
    };
  };

  const preview = calculatePreview();
  
  const formatDuration = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  return (
    <Card className={`bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 ${className}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-blue-700 font-medium">
          <Clock className="h-4 w-4" />
          <span className="text-sm">Working Hours Preview</span>
        </div>
        
        <div className="grid grid-cols-3 gap-3">
          {/* Regular Hours */}
          <div className="bg-white p-3 rounded-lg border">
            <div className="text-xs text-muted-foreground">Regular Hours</div>
            <div className="font-semibold text-green-600">
              {formatDuration(preview.currentRegularHours)}
            </div>
            <div className="text-xs text-muted-foreground">In schedule</div>
          </div>
          
          {/* Overtime Hours */}
          <div className="bg-white p-3 rounded-lg border">
            <div className="text-xs text-muted-foreground">Overtime Hours</div>
            <div className={`font-semibold ${preview.isCurrentlyOvertime ? 'text-orange-600' : 'text-gray-400'}`}>
              {formatDuration(preview.overtimeHours)}
            </div>
            <div className="text-xs text-muted-foreground">Outside schedule</div>
          </div>
          
          {/* Total Time */}
          <div className="bg-white p-3 rounded-lg border">
            <div className="text-xs text-muted-foreground">Total Time</div>
            <div className="font-semibold text-blue-600">
              {formatDuration(preview.currentWorkingHours)}
            </div>
            <div className="text-xs text-muted-foreground">All time</div>
          </div>
        </div>
        
        {/* Overtime Status */}
        {preview.isCurrentlyOvertime && (
          <div className="flex items-center gap-2 p-2 bg-orange-50 rounded-lg border border-orange-200">
            <Zap className="h-4 w-4 text-orange-600" />
            <div className="flex-1">
              <div className="text-xs font-medium text-orange-700">Currently in Overtime</div>
              <div className="text-xs text-orange-600">
                {formatDuration(preview.overtimeHours)} beyond standard hours
              </div>
            </div>
            <Badge variant="outline" className="text-orange-600 border-orange-300">
              OT: {formatDuration(preview.overtimeHours)}
            </Badge>
          </div>
        )}
        
        {/* Enhanced Information */}
        <div className="text-xs bg-white p-3 rounded border space-y-1">
          <div className="font-medium text-gray-700">Department Schedule:</div>
          <div className="text-muted-foreground">
            <TimeDisplay time={departmentTiming.checkInTime} format12Hour={true} /> - {' '}
            <TimeDisplay time={departmentTiming.checkOutTime} format12Hour={true} />
            {' '}({departmentTiming.workingHours}h standard)
          </div>
          {preview.isCurrentlyOvertime ? (
            <div className="text-orange-600 font-medium">
              ⚠️ Currently working outside department schedule (overtime)
            </div>
          ) : (
            <div className="text-green-600">
              ✓ Working within department schedule
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
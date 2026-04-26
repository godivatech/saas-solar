/**
 * Department Timing Configuration Dialog
 * Enterprise-grade time management with 12-hour format
 */

import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { sanitizeFormData } from "../../../../shared/utils/form-sanitizer";
import { useToast } from '@/hooks/use-toast';
import { TimeInput } from '@/components/time/time-input';
import { TimeDisplay } from '@/components/time/time-display';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, Save, RotateCcw, AlertCircle } from 'lucide-react';

interface TimingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  department: any;
  currentTiming?: any;
}

export function TimingDialog({ isOpen, onClose, department, currentTiming }: TimingDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    checkInTime: "9:00 AM",
    checkOutTime: "6:00 PM",
    workingHours: 8,
    lateThresholdMinutes: 15,
    overtimeThresholdMinutes: 0,
    isFlexibleTiming: false
  });

  const [previewData, setPreviewData] = useState({
    overtimeStartTime: "6:00 PM",
    totalWorkingMinutes: 480,
    effectiveWorkingHours: 8
  });

  useEffect(() => {
    if (currentTiming) {
      console.log('TIMING_DIALOG: Loading current timing:', currentTiming);
      setFormData({
        checkInTime: currentTiming.checkInTime || "9:00 AM",
        checkOutTime: currentTiming.checkOutTime || "6:00 PM",
        workingHours: currentTiming.workingHours || 8,
        lateThresholdMinutes: currentTiming.lateThresholdMinutes || 15,
        overtimeThresholdMinutes: currentTiming.overtimeThresholdMinutes || 0,
        isFlexibleTiming: Boolean(currentTiming.isFlexibleTiming)
      });
      // Removed unused policy logging
    }
  }, [currentTiming]);

  // Calculate preview data when times change
  useEffect(() => {
    const calculatePreview = () => {
      try {
        const checkIn = parseTime12Hour(formData.checkInTime);
        const checkOut = parseTime12Hour(formData.checkOutTime);

        if (checkIn && checkOut) {
          const diffMs = checkOut.getTime() - checkIn.getTime();
          const totalMinutes = Math.max(0, diffMs / (1000 * 60));
          const hours = totalMinutes / 60;

          setPreviewData({
            overtimeStartTime: formData.checkOutTime,
            totalWorkingMinutes: totalMinutes,
            effectiveWorkingHours: Number(hours.toFixed(1))
          });
        }
      } catch (error) {
        console.error('Error calculating preview:', error);
      }
    };

    calculatePreview();
  }, [formData.checkInTime, formData.checkOutTime]);

  const updateTimingMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest(`/api/departments/${department.id}/timing`, 'POST', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments/timings"] });
      toast({
        title: "Timing Updated",
        description: `${department.name} working hours have been updated successfully.`,
      });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update department timing",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate times
    if (!isValidTimeSequence(formData.checkInTime, formData.checkOutTime)) {
      toast({
        title: "Invalid Time Range",
        description: "Check-out time must be after check-in time",
        variant: "destructive",
      });
      return;
    }

    updateTimingMutation.mutate(formData);
  };

  const handleReset = () => {
    setFormData({
      checkInTime: "9:00 AM",
      checkOutTime: "6:00 PM",
      workingHours: 8,
      lateThresholdMinutes: 15,
      overtimeThresholdMinutes: 0,
      isFlexibleTiming: false
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Configure Working Hours - {department?.name}
          </DialogTitle>
          <DialogDescription>
            Set up attendance timing, overtime rules, and work policies for this department.
            All employees in this department will follow these settings.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Main Timing Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Core Working Hours</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TimeInput
                label="Check-in Time"
                value={formData.checkInTime}
                onChange={(value) => setFormData(prev => ({ ...prev, checkInTime: value }))}
                placeholder="9:00 AM"
                required
              />

              <TimeInput
                label="Check-out Time"
                value={formData.checkOutTime}
                onChange={(value) => setFormData(prev => ({ ...prev, checkOutTime: value }))}
                placeholder="6:00 PM"
                required
              />
            </CardContent>
          </Card>

          {/* Preview Card */}
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader>
              <CardTitle className="text-lg text-blue-800">Timing Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div className="p-3 bg-white rounded-lg border">
                  <div className="text-sm text-muted-foreground">Working Hours</div>
                  <div className="text-xl font-bold text-blue-600">
                    {previewData.effectiveWorkingHours}h
                  </div>
                </div>
                <div className="p-3 bg-white rounded-lg border">
                  <div className="text-sm text-muted-foreground">OT Starts After</div>
                  <div className="text-xl font-bold text-orange-600">
                    <TimeDisplay time={previewData.overtimeStartTime} format12Hour={true} />
                  </div>
                </div>
                <div className="p-3 bg-white rounded-lg border">
                  <div className="text-sm text-muted-foreground">Daily Minutes</div>
                  <div className="text-xl font-bold text-green-600">
                    {Math.round(previewData.totalWorkingMinutes)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Attendance Policies */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Attendance Policies</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="lateThreshold">Late Threshold (minutes)</Label>
                <Input
                  id="lateThreshold"
                  type="number"
                  min="0"
                  max="60"
                  value={formData.lateThresholdMinutes}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    lateThresholdMinutes: parseInt(e.target.value) || 0
                  }))}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Grace period before marking attendance as late
                </p>
              </div>

              <div>
                <Label htmlFor="otThreshold">OT Threshold (minutes)</Label>
                <Input
                  id="otThreshold"
                  type="number"
                  min="0"
                  max="120"
                  value={formData.overtimeThresholdMinutes}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    overtimeThresholdMinutes: parseInt(e.target.value) || 0
                  }))}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Minimum minutes beyond checkout time to qualify for OT
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Work Flexibility Options */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Work Flexibility</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Flexible Timing</Label>
                  <p className="text-xs text-muted-foreground">
                    Allow employees to have flexible check-in/out times
                  </p>
                </div>
                <Switch
                  checked={formData.isFlexibleTiming}
                  onCheckedChange={(checked) => setFormData(prev => ({
                    ...prev,
                    isFlexibleTiming: checked
                  }))}
                />
              </div>



            </CardContent>
          </Card>

          {/* OT Calculation Info */}
          <Card className="bg-orange-50 border-orange-200">
            <CardHeader>
              <CardTitle className="text-lg text-orange-800 flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Overtime Calculation Rule
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-orange-700">
                <strong>Simple Google-level OT Rule:</strong> Any work performed after the department's
                scheduled checkout time ({formData.checkOutTime}) will be automatically calculated as overtime.
                No complex formulas or manual calculations required.
              </p>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-between pt-4">
            <Button type="button" variant="outline" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to Defaults
            </Button>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateTimingMutation.isPending}
                className="bg-primary hover:bg-primary/90"
              >
                <Save className="h-4 w-4 mr-2" />
                {updateTimingMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Helper functions
function parseTime12Hour(timeStr: string): Date | null {
  try {
    const timeRegex = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;
    const match = timeStr.match(timeRegex);

    if (!match) return null;

    let [, hourStr, minuteStr, period] = match;
    let hours = parseInt(hourStr);
    const minutes = parseInt(minuteStr);

    if (period.toUpperCase() === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period.toUpperCase() === 'AM' && hours === 12) {
      hours = 0;
    }

    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  } catch (error) {
    return null;
  }
}

function isValidTimeSequence(checkIn: string, checkOut: string): boolean {
  const checkInDate = parseTime12Hour(checkIn);
  const checkOutDate = parseTime12Hour(checkOut);

  if (!checkInDate || !checkOutDate) return false;

  return checkOutDate > checkInDate;
}
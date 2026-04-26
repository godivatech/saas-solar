/**
 * Reschedule Modal Component
 * Simple date picker for rescheduling site visit follow-ups
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Clock } from "lucide-react";

interface RescheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: { date: Date; reason?: string }) => void;
  customerName: string;
  currentDate?: Date;
}

export function RescheduleModal({
  isOpen,
  onClose,
  onConfirm,
  customerName,
  currentDate
}: RescheduleModalProps) {
  const [selectedDate, setSelectedDate] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize with current date or tomorrow
  useEffect(() => {
    if (isOpen) {
      const defaultDate = currentDate || new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
      setSelectedDate(defaultDate.toISOString().split('T')[0]);
      setReason("");
      setIsSubmitting(false);
    }
  }, [isOpen, currentDate]);

  const handleSubmit = () => {
    if (!selectedDate) return;

    setIsSubmitting(true);
    
    // Convert to Date object
    const date = new Date(selectedDate);
    
    // Set time to 9 AM to avoid timezone issues
    date.setHours(9, 0, 0, 0);
    
    onConfirm({
      date,
      reason: reason.trim() || undefined
    });
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  // Get minimum date (today)
  const today = new Date().toISOString().split('T')[0];

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" data-testid="reschedule-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-yellow-600" />
            Reschedule Follow-up Visit
          </DialogTitle>
          <DialogDescription>
            Reschedule the follow-up visit for <strong>{customerName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current Date Display */}
          {currentDate && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-3 rounded-md">
              <Clock className="h-4 w-4" />
              <span>
                Current follow-up date: <strong>{currentDate.toLocaleDateString()}</strong>
              </span>
            </div>
          )}

          {/* New Date Selection */}
          <div className="space-y-2">
            <Label htmlFor="reschedule-date">New Follow-up Date</Label>
            <Input
              id="reschedule-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min={today}
              required
              data-testid="input-reschedule-date"
            />
          </div>

          {/* Optional Reason */}
          <div className="space-y-2">
            <Label htmlFor="reschedule-reason">
              Reason (Optional)
            </Label>
            <Textarea
              id="reschedule-reason"
              placeholder="Why are you rescheduling this visit?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              data-testid="textarea-reschedule-reason"
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
            data-testid="button-reschedule-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedDate || isSubmitting}
            className="bg-yellow-600 hover:bg-yellow-700"
            data-testid="button-reschedule-confirm"
          >
            {isSubmitting ? "Rescheduling..." : "Reschedule Visit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
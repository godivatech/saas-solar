/**
 * Quick Action Buttons Component
 * Provides one-click actions for site visit outcome updates
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  Calendar,
  CircleX,
  Loader2,
  Clock
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { sanitizeFormData } from "../../../../shared/utils/form-sanitizer";
import { useToast } from "@/hooks/use-toast";
// import { RescheduleModal } from "./reschedule-modal"; // TODO: Implement in future

interface SiteVisit {
  id: string;
  visitOutcome?: 'converted' | 'on_process' | 'cancelled';
  scheduledFollowUpDate?: string;
  customer: {
    name: string;
  };
  status: 'in_progress' | 'completed' | 'cancelled';
  isFollowUp?: boolean; // Flag to detect if this is a follow-up visit
}

interface QuickActionButtonsProps {
  siteVisit: SiteVisit;
  onActionComplete?: () => void;
  className?: string;
}

interface QuickUpdateRequest {
  action: 'convert' | 'cancel' | 'reschedule';
  scheduledFollowUpDate?: Date;
  outcomeNotes?: string;
  reason?: string;
}

export function QuickActionButtons({
  siteVisit,
  onActionComplete,
  className = ""
}: QuickActionButtonsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false); // TODO: Implement in future

  // Quick update mutation with optimistic updates
  const quickUpdateMutation = useMutation({
    mutationFn: async (updateData: QuickUpdateRequest) => {
      // Use different endpoint for follow-ups vs regular site visits
      const endpoint = siteVisit.isFollowUp
        ? `/api/follow-ups/${siteVisit.id}/quick-update`
        : `/api/site-visits/${siteVisit.id}/quick-update`;

      const response = await apiRequest(
        endpoint,
        'PATCH',
        updateData
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Quick update failed');
      }

      return response.json();
    },
    onMutate: async (updateData: QuickUpdateRequest) => {
      // Cancel outgoing refetches to prevent optimistic updates from being overwritten
      await queryClient.cancelQueries({ queryKey: ['/api/site-visits'] });

      // Snapshot the previous value for rollback
      const previousSiteVisits = queryClient.getQueryData(['/api/site-visits']);

      // Optimistically update the cache
      queryClient.setQueryData(['/api/site-visits'], (old: any) => {
        if (!old?.data) return old;

        return {
          ...old,
          data: old.data.map((visit: any) => {
            if (visit.id === siteVisit.id) {
              // Create optimistic update based on action
              const updates: any = {};
              switch (updateData.action) {
                case 'convert':
                  updates.visitOutcome = 'converted';
                  updates.outcomeNotes = updateData.outcomeNotes;
                  updates.outcomeSelectedAt = new Date().toISOString();
                  break;
                case 'cancel':
                  updates.visitOutcome = 'cancelled';
                  updates.outcomeNotes = updateData.reason;
                  updates.outcomeSelectedAt = new Date().toISOString();
                  break;
                case 'reschedule':
                  updates.scheduledFollowUpDate = updateData.scheduledFollowUpDate?.toISOString();
                  updates.outcomeNotes = updateData.reason;
                  break;
              }
              return { ...visit, ...updates };
            }
            return visit;
          })
        };
      });

      // Return context for rollback
      return { previousSiteVisits };
    },
    onError: (error: any, variables, context) => {
      // Rollback optimistic update on error
      if (context?.previousSiteVisits) {
        queryClient.setQueryData(['/api/site-visits'], context.previousSiteVisits);
      }

      toast({
        title: "Error",
        description: error.message || "Failed to update site visit",
        variant: "destructive",
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: data.message,
      });

      onActionComplete?.();
    },
    onSettled: async () => {
      // Force immediate refetch to update tabs - use refetchQueries instead of invalidate
      await queryClient.refetchQueries({ queryKey: ['/api/site-visits'] });
      await queryClient.refetchQueries({ queryKey: ['/api/follow-ups'] });
      await queryClient.refetchQueries({ queryKey: ['/api/site-visits/stats'] });
    },
  });

  const handleConvert = () => {
    if (confirm(`Mark visit for ${siteVisit.customer.name} as converted?`)) {
      quickUpdateMutation.mutate({
        action: 'convert',
        outcomeNotes: 'Visit converted via quick action'
      });
    }
  };

  const handleCancel = () => {
    if (confirm(`Mark visit for ${siteVisit.customer.name} as cancelled?`)) {
      quickUpdateMutation.mutate({
        action: 'cancel',
        reason: 'Visit cancelled via quick action'
      });
    }
  };


  // TODO: Implement in future
  // const handleReschedule = (data: { date: Date; reason?: string }) => {
  //   quickUpdateMutation.mutate({
  //     action: 'reschedule',
  //     scheduledFollowUpDate: data.date,
  //     reason: data.reason || 'Visit rescheduled via quick action'
  //   });
  //   setIsRescheduleModalOpen(false);
  // };

  // Show overdue indicator if follow-up date is past
  const isOverdue = siteVisit.scheduledFollowUpDate &&
    new Date(siteVisit.scheduledFollowUpDate) < new Date();

  const isLoading = quickUpdateMutation.isPending;

  return (
    <>
      <div className={`flex flex-wrap items-center gap-2 ${className}`}>
        {/* Show follow-up date if scheduled */}
        {siteVisit.scheduledFollowUpDate && (
          <Badge
            variant={isOverdue ? "destructive" : "secondary"}
            className="text-xs"
          >
            <Clock className="h-3 w-3 mr-1" />
            {new Date(siteVisit.scheduledFollowUpDate).toLocaleDateString()}
            {isOverdue && " (Overdue)"}
          </Badge>
        )}

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-1">
          {/* Mark as Converted */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleConvert}
            disabled={isLoading || siteVisit.visitOutcome === 'converted'}
            className="h-7 px-2 text-xs border-green-200 text-green-700 hover:bg-green-50"
            data-testid="button-convert"
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <TrendingUp className="h-3 w-3 mr-1" />
            )}
            Convert
          </Button>


          {/* TODO: Reschedule button - Implement in future */}
          {/* <Button
            size="sm"
            variant="outline"
            onClick={() => setIsRescheduleModalOpen(true)}
            disabled={isLoading || siteVisit.visitOutcome !== 'on_process'}
            className="h-7 px-2 text-xs border-yellow-200 text-yellow-700 hover:bg-yellow-50"
            data-testid="button-reschedule"
          >
            <Calendar className="h-3 w-3 mr-1" />
            Reschedule
          </Button> */}

          {/* Mark as Cancelled */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading || siteVisit.visitOutcome === 'cancelled'}
            className="h-7 px-2 text-xs border-red-200 text-red-700 hover:bg-red-50"
            data-testid="button-cancel"
          >
            <CircleX className="h-3 w-3 mr-1" />
            Cancel
          </Button>
        </div>
      </div>


      {/* TODO: Reschedule Modal - Implement in future */}
      {/* <RescheduleModal
        isOpen={isRescheduleModalOpen}
        onClose={() => setIsRescheduleModalOpen(false)}
        onConfirm={handleReschedule}
        customerName={siteVisit.customer.name}
        currentDate={siteVisit.scheduledFollowUpDate ? new Date(siteVisit.scheduledFollowUpDate) : undefined}
      /> */}
    </>
  );
}
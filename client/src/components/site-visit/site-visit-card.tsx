/**
 * Enhanced Site Visit Card Component
 * Displays site visit information with follow-up indicators and timeline
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  User, Phone, MapPin, Clock, RefreshCw,
  ArrowRight, Building, AlertCircle, CheckCircle,
  FileText, Calendar, Users, Zap
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface SiteVisit {
  id: string;
  customer: {
    name: string;
    mobile: string;
    address: string;
    propertyType: string;
  };
  visitPurpose: string;
  department: string;
  siteInTime: string;
  siteOutTime?: string;
  status: string;
  followUpCount?: number;
  isFollowUp?: boolean;
  followUpOf?: string;
  followUpReason?: string;
  notes?: string;
  // New outcome fields
  visitOutcome?: 'converted' | 'on_process' | 'cancelled';
  scheduledFollowUpDate?: string;
  outcomeNotes?: string;
  outcomeSelectedAt?: string;
  outcomeSelectedBy?: string;
}

interface SiteVisitCardProps {
  visit: SiteVisit;
  onFollowUp?: (visit: SiteVisit) => void;
  onCheckout?: (visit: SiteVisit) => void;
  showFollowUpButton?: boolean;
  showCheckoutButton?: boolean;
  isCompact?: boolean;
}

const statusColors = {
  'in_progress': 'bg-blue-100 text-blue-800 border-blue-200',
  'completed': 'bg-green-100 text-green-800 border-green-200',
  'cancelled': 'bg-red-100 text-red-800 border-red-200'
};

const departmentColors = {
  'technical': 'bg-orange-100 text-orange-800',
  'marketing': 'bg-green-100 text-green-800',
  'admin': 'bg-blue-100 text-blue-800'
};

const followUpReasonIcons = {
  'additional_work_required': Zap,
  'issue_resolution': AlertCircle,
  'status_check': CheckCircle,
  'customer_request': User,
  'maintenance': Clock,
  'other': FileText
};

const outcomeColors = {
  'converted': 'bg-green-100 text-green-800 border-green-200',
  'on_process': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'cancelled': 'bg-red-100 text-red-800 border-red-200'
};

const outcomeLabels = {
  'converted': 'Converted',
  'on_process': 'On Process',
  'cancelled': 'Cancelled'
};

export function SiteVisitCard({
  visit,
  onFollowUp,
  onCheckout,
  showFollowUpButton = true,
  showCheckoutButton = true,
  isCompact = false
}: SiteVisitCardProps) {
  const formatTime = (timeString: string) => {
    const date = new Date(timeString);
    return {
      date: format(date, 'MMM dd, yyyy'),
      time: format(date, 'h:mm a'),
      relative: formatDistanceToNow(date, { addSuffix: true })
    };
  };

  const siteInTime = formatTime(visit.siteInTime);
  const siteOutTime = visit.siteOutTime ? formatTime(visit.siteOutTime) : null;

  const FollowUpReasonIcon = visit.followUpReason ?
    followUpReasonIcons[visit.followUpReason as keyof typeof followUpReasonIcons] || FileText :
    FileText;

  // Helper function to check if follow-up date is overdue
  const isOverdue = (dateString?: string) => {
    if (!dateString) return false;
    const followUpDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    followUpDate.setHours(0, 0, 0, 0);
    return followUpDate < today;
  };

  // Helper function to check if follow-up date is today
  const isToday = (dateString?: string) => {
    if (!dateString) return false;
    const followUpDate = new Date(dateString);
    const today = new Date();
    return followUpDate.toDateString() === today.toDateString();
  };

  const formatFollowUpDate = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: format(date, 'MMM dd, yyyy'),
      relative: formatDistanceToNow(date, { addSuffix: true })
    };
  };

  return (
    <Card className={`${isCompact ? 'h-auto' : 'h-full'} transition-all hover:shadow-md`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-muted-foreground" />
              {visit.customer.name}
              {visit.isFollowUp && (
                <Badge variant="outline" className="ml-2">
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Follow-up
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge className={departmentColors[visit.department as keyof typeof departmentColors] || 'bg-gray-100 text-gray-800'}>
                {visit.department.charAt(0).toUpperCase() + visit.department.slice(1)}
              </Badge>
              {visit.visitOutcome && (
                <Badge className={outcomeColors[visit.visitOutcome] || 'bg-gray-100 text-gray-800'}>
                  {outcomeLabels[visit.visitOutcome]}
                </Badge>
              )}
              {visit.followUpCount && visit.followUpCount > 0 && (
                <Badge variant="secondary">
                  {visit.followUpCount} follow-up{visit.followUpCount > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Customer Information */}
        <div className="grid grid-cols-1 gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span>{visit.customer.mobile}</span>
          </div>
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
            <span className="flex-1">{visit.customer.address}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Building className="h-4 w-4 text-muted-foreground" />
            <span>{visit.customer.propertyType}</span>
          </div>
        </div>

        <Separator />

        {/* Visit Details */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Purpose:</span>
            <span>{visit.visitPurpose}</span>
          </div>

          {/* Follow-up specific information */}
          {visit.isFollowUp && visit.followUpReason && (
            <div className="flex items-center gap-2 text-sm">
              <FollowUpReasonIcon className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Reason:</span>
              <span className="capitalize">
                {visit.followUpReason.replace(/_/g, ' ')}
              </span>
            </div>
          )}

          {/* Timing Information */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-green-600" />
              <span className="font-medium">Check-in:</span>
              <span>{siteInTime.time} on {siteInTime.date}</span>
              <span className="text-muted-foreground">({siteInTime.relative})</span>
            </div>

            {siteOutTime && (
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-red-600" />
                <span className="font-medium">Check-out:</span>
                <span>{siteOutTime.time} on {siteOutTime.date}</span>
                <span className="text-muted-foreground">({siteOutTime.relative})</span>
              </div>
            )}
          </div>

          {/* Scheduled Follow-up Date */}
          {visit.scheduledFollowUpDate && (
            <div className={`text-sm p-3 rounded-lg border ${isOverdue(visit.scheduledFollowUpDate)
                ? 'bg-red-50 border-red-200'
                : isToday(visit.scheduledFollowUpDate)
                  ? 'bg-yellow-50 border-yellow-200'
                  : 'bg-blue-50 border-blue-200'
              }`}>
              <div className="flex items-center gap-2">
                <Calendar className={`h-4 w-4 ${isOverdue(visit.scheduledFollowUpDate)
                    ? 'text-red-600'
                    : isToday(visit.scheduledFollowUpDate)
                      ? 'text-yellow-600'
                      : 'text-blue-600'
                  }`} />
                <span className="font-medium">
                  {isOverdue(visit.scheduledFollowUpDate) && 'Overdue Follow-up:'}
                  {isToday(visit.scheduledFollowUpDate) && 'Follow-up Today:'}
                  {!isOverdue(visit.scheduledFollowUpDate) && !isToday(visit.scheduledFollowUpDate) && 'Scheduled Follow-up:'}
                </span>
                <span className={`${isOverdue(visit.scheduledFollowUpDate)
                    ? 'text-red-700 font-semibold'
                    : isToday(visit.scheduledFollowUpDate)
                      ? 'text-yellow-700 font-semibold'
                      : 'text-blue-700'
                  }`}>
                  {formatFollowUpDate(visit.scheduledFollowUpDate).date}
                </span>
                <span className="text-muted-foreground text-xs">
                  ({formatFollowUpDate(visit.scheduledFollowUpDate).relative})
                </span>
              </div>
            </div>
          )}

          {/* Outcome Notes */}
          {visit.outcomeNotes && (
            <div className="text-sm">
              <span className="font-medium">Outcome Notes:</span>
              <p className="text-muted-foreground mt-1 text-xs bg-gray-50 p-2 rounded">
                {visit.outcomeNotes}
              </p>
            </div>
          )}

          {/* General Notes */}
          {visit.notes && (
            <div className="text-sm">
              <span className="font-medium">Notes:</span>
              <p className="text-muted-foreground mt-1 text-xs bg-gray-50 p-2 rounded">
                {visit.notes}
              </p>
            </div>
          )}

          {/* Quick Actions for On Process visits */}
          {visit.visitOutcome === 'on_process' && visit.scheduledFollowUpDate && (
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="outline" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                Action Required
              </Badge>
              {isOverdue(visit.scheduledFollowUpDate) && (
                <Badge variant="destructive" className="text-xs">
                  Overdue
                </Badge>
              )}
              {isToday(visit.scheduledFollowUpDate) && (
                <Badge className="bg-yellow-600 text-xs">
                  Due Today
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {(showFollowUpButton || showCheckoutButton) && (
          <>
            <Separator />
            <div className="flex gap-2 justify-end">
              {showFollowUpButton && onFollowUp && visit.status !== 'cancelled' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onFollowUp(visit)}
                  className="flex items-center gap-1"
                >
                  <RefreshCw className="h-4 w-4" />
                  Follow-up
                </Button>
              )}

              {showCheckoutButton && onCheckout && visit.status === 'in_progress' && !visit.siteOutTime && (
                <Button
                  size="sm"
                  onClick={() => onCheckout(visit)}
                  className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700"
                >
                  <ArrowRight className="h-4 w-4" />
                  Check-out
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
import { useState } from "react";
import { useAuthContext } from "@/contexts/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LeaveApplicationForm } from "@/components/leave/leave-application-form";
import { LeaveBalanceWidget } from "@/components/leave/leave-balance-widget";
import { LeaveHistoryTable } from "@/components/leave/leave-history-table";
import { ManagerApprovalList } from "@/components/leave/manager-approval-list";
import { HRApprovalList } from "@/components/leave/hr-approval-list";
import { LeaveCalendarView } from "@/components/leave/leave-calendar-view";
import { Calendar, Clock, CheckSquare, UserCheck, Shield, PlusCircle } from "lucide-react";

export default function Leave() {
  const { user } = useAuthContext();
  const [showApplyLeaveDialog, setShowApplyLeaveDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("my-leaves");

  const isHR = user?.department === "hr";

  return (
    <div className="space-y-4 sm:space-y-6 px-1 sm:px-0" data-testid="page-leave">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Leave Management</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Manage your leave applications and approvals
          </p>
        </div>
        <Button
          onClick={() => setShowApplyLeaveDialog(true)}
          data-testid="button-apply-leave"
          className="w-full sm:w-auto"
        >
          <PlusCircle className="h-4 w-4 mr-2" />
          Apply Leave
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 order-2 lg:order-1">
          <Tabs value={activeTab} onValueChange={setActiveTab} data-testid="tabs-leave">
            <TabsList className="grid w-full grid-cols-4 h-auto">
              <TabsTrigger value="my-leaves" data-testid="tab-my-leaves" className="flex-col sm:flex-row gap-1 sm:gap-2 py-2 px-1 sm:px-3">
                <Calendar className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Leaves</span>
              </TabsTrigger>
              <TabsTrigger value="calendar" data-testid="tab-calendar" className="flex-col sm:flex-row gap-1 sm:gap-2 py-2 px-1 sm:px-3">
                <Clock className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Cal</span>
              </TabsTrigger>
              {/* ✅ FIX: Only show to actual managers or master_admin */}
              {(user?.isManager || user?.role === "master_admin") && (
                <TabsTrigger value="manager-approvals" data-testid="tab-manager-approvals" className="flex-col sm:flex-row gap-1 sm:gap-2 py-2 px-1 sm:px-3">
                  <UserCheck className="h-4 w-4" />
                  <span className="text-xs sm:text-sm">Mgr</span>
                </TabsTrigger>
              )}
              {/* ✅ FIX: Only show to HR department or master_admin */}
              {(user?.department === "hr" || user?.role === "master_admin") && (
                <TabsTrigger value="hr-approvals" data-testid="tab-hr-approvals" className="flex-col sm:flex-row gap-1 sm:gap-2 py-2 px-1 sm:px-3">
                  <Shield className="h-4 w-4" />
                  <span className="text-xs sm:text-sm">HR</span>
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="my-leaves" className="mt-4 sm:mt-6">
              <Card>
                <CardHeader className="px-4 sm:px-6 py-3 sm:py-4">
                  <CardTitle className="text-lg sm:text-xl">My Leave Applications</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    View and manage your leave history
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                  <LeaveHistoryTable />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="calendar" className="mt-4 sm:mt-6">
              <Card>
                <CardHeader className="px-4 sm:px-6 py-3 sm:py-4">
                  <CardTitle className="text-lg sm:text-xl">Leave Calendar</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Visual overview of your approved leaves
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                  <LeaveCalendarView />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="manager-approvals" className="mt-4 sm:mt-6">
              <Card>
                <CardHeader className="px-4 sm:px-6 py-3 sm:py-4">
                  <CardTitle className="text-lg sm:text-xl">Manager Approvals</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Review and approve leave applications from your team
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                  <ManagerApprovalList />
                </CardContent>
              </Card>
            </TabsContent>

            {(isHR || user?.role === "admin" || user?.role === "master_admin") && (
              <TabsContent value="hr-approvals" className="mt-4 sm:mt-6">
                <Card>
                  <CardHeader className="px-4 sm:px-6 py-3 sm:py-4">
                    <CardTitle className="text-lg sm:text-xl">HR Approvals</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      Final review and approval of leave applications
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-2 sm:px-6">
                    <HRApprovalList />
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </div>

        <div className="space-y-4 sm:space-y-6 order-1 lg:order-2">
          <LeaveBalanceWidget
            onApplyLeave={() => setShowApplyLeaveDialog(true)}
            onViewHistory={() => setActiveTab("my-leaves")}
          />

          <Card className="hidden sm:block">
            <CardHeader>
              <CardTitle className="text-base">Quick Info</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex items-start gap-2">
                <CheckSquare className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="font-medium">Monthly Allocation</p>
                  <p className="text-xs text-muted-foreground">1 casual leave + 2 hours permission</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckSquare className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="font-medium">Approval Flow</p>
                  <p className="text-xs text-muted-foreground">Employee → Manager → HR</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckSquare className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="font-medium">Fixed Holidays</p>
                  <p className="text-xs text-muted-foreground">May 1, Aug 15, Oct 2, Jan 26</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showApplyLeaveDialog} onOpenChange={setShowApplyLeaveDialog}>
        <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader className="px-1 sm:px-0">
            <DialogTitle className="text-lg sm:text-xl">Apply for Leave</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Fill in the details to submit your leave application for approval.
            </DialogDescription>
          </DialogHeader>
          <LeaveApplicationForm onSuccess={() => setShowApplyLeaveDialog(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

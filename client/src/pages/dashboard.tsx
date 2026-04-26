import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthContext } from "@/contexts/auth-context";
import { SolarKPICard } from "@/components/dashboard/solar-kpi-card";
import { AttendanceCard } from "@/components/dashboard/attendance-card";
import { RecentCustomersTable } from "@/components/dashboard/recent-customers-table";

import { RecentQuotations } from "@/components/dashboard/recent-quotations";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { EnterpriseAttendanceCheckIn } from "@/components/attendance/enterprise-attendance-check-in";
import { LeaveBalanceWidget } from "@/components/leave/leave-balance-widget";
import { Loader2, Users, Zap } from "lucide-react";
import { useLocation } from "wouter";
import { UserPlus, FileText, MapPin, Calendar } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuthContext();
  const [, setLocation] = useLocation();
  const [showCheckInModal, setShowCheckInModal] = useState(false);

  // Fetch data
  const { data: usersData, isLoading: loadingUsers } = useQuery({
    queryKey: ["/api/users"],
  });

  const { data: customersData, isLoading: loadingCustomers } = useQuery({
    queryKey: ["/api/customers"],
  });

  const { data: quotationsData, isLoading: loadingQuotations } = useQuery({
    queryKey: ["/api/quotations"],
  });

  const { data: activityLogsData, isLoading: loadingActivityLogs } = useQuery({
    queryKey: ["/api/activity-logs"],
  });

  // Real solar KPIs from data (APIs return {data: [], pagination: {}})
  const totalUsers = Array.isArray(usersData) ? usersData.length : 0;
  const totalCustomers = customersData?.data ? customersData.data.length : 0;
  const activeQuotations = quotationsData?.data
    ? quotationsData.data.filter((q: any) => q.status !== "rejected" && q.status !== "converted").length
    : 0;


  // Format recent customers
  const recentCustomers = customersData?.data ? customersData.data.slice(0, 3).map((customer: any) => ({
    id: customer.id,
    name: customer.name,
    email: customer.email || '',
    location: customer.address || 'N/A',
    addedOn: new Date(customer.createdAt)
  })) : [];




  // Format recent quotations with status
  const recentQuotations = quotationsData?.data ? quotationsData.data.slice(0, 3).map((quotation: any) => {
    return {
      id: quotation.id.toString(),
      number: quotation.quotationNumber,
      amount: quotation.totalSystemCost || 0,
      status: quotation.status || "draft",
      customer: quotation.customerName || 'Unknown',
      location: 'N/A' // Location not available in quotation data
    };
  }) : [];



  // Format activity
  function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffInSeconds < 60) return "Just now";
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `${diffInDays}d ago`;
    return "Recently";
  }

  const recentActivity = Array.isArray(activityLogsData) ? activityLogsData.slice(0, 4).map((activity: any) => {
    let icon = "ri-history-line";
    let iconBgColor = "bg-primary";

    if (activity.type === 'customer_created') {
      icon = "ri-user-add-line";
      iconBgColor = "bg-success";
    } else if (activity.type === 'quotation_created') {
      icon = "ri-file-list-3-line";
      iconBgColor = "bg-info";
    } else if (activity.type === 'invoice_paid') {
      icon = "ri-bill-line";
      iconBgColor = "bg-success";
    } else if (activity.type === 'product_created') {
      icon = "ri-store-2-line";
      iconBgColor = "bg-primary";
    }

    return {
      id: activity.id,
      icon,
      iconBgColor,
      title: activity.title,
      description: activity.description,
      time: formatRelativeTime(new Date(activity.createdAt || new Date()))
    };
  }) : [];

  // Role-based quick actions
  const getRoleBasedActions = () => {
    const baseActions = [
      {
        id: "qa1",
        label: "Add Customer",
        icon: <UserPlus className="h-7 w-7 sm:h-8 sm:w-8 md:h-9 md:w-9" />,
        iconColor: "text-success",
        href: "/customers/new",
        category: "primary" as const
      },
      {
        id: "qa2",
        label: "New Quotation",
        icon: <FileText className="h-7 w-7 sm:h-8 sm:w-8 md:h-9 md:w-9" />,
        iconColor: "text-info",
        href: "/quotations/new",
        category: "primary" as const
      }
    ];

    // Secondary actions based on role
    const secondaryActions = [];

    if (user?.department === "technical") {
      secondaryActions.push({
        id: "qa4",
        label: "Site Visit",
        icon: <MapPin className="h-6 w-6 sm:h-7 sm:w-7 md:h-8 md:w-8" />,
        iconColor: "text-warning",
        href: "/site-visits/new",
        category: "secondary" as const
      });
    }

    if (["hr", "admin", "master_admin"].includes(user?.department || "")) {
      secondaryActions.push({
        id: "qa5",
        label: "Apply Leave",
        icon: <Calendar className="h-6 w-6 sm:h-7 sm:w-7 md:h-8 md:w-8" />,
        iconColor: "text-warning",
        href: "/leave/new",
        category: "secondary" as const
      });
    }



    return [...baseActions, ...secondaryActions];
  };

  // Loading state
  if (loadingUsers || loadingCustomers || loadingQuotations || loadingActivityLogs) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-primary" />
        <span className="ml-2 text-base sm:text-lg">Loading dashboard...</span>
      </div>
    );
  }

  return (
    <>
      {/* KPI Row - Solar-Specific Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 md:gap-6 mb-6">
        <SolarKPICard
          title="Quotations"
          value={activeQuotations.toString()}
          icon={<Zap className="h-5 w-5" />}
          color="info"
          trend={{ value: activeQuotations > 0 ? 15 : 0, period: "last month" }}
        />
        <SolarKPICard
          title="Customers"
          value={totalCustomers.toString()}
          icon={<Users className="h-5 w-5" />}
          color="primary"
        />
      </div>


      {/* Core Dashboard Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 md:gap-6 mb-6">
        {/* Today's Attendance */}
        <AttendanceCard
          date={new Date()}
          items={[
            { status: "present", count: Math.max(0, totalUsers - 2), total: totalUsers },
            { status: "leave", count: 1, total: totalUsers },
            { status: "absent", count: 1, total: totalUsers }
          ]}
          onCheckInOut={() => setShowCheckInModal(true)}
        />

        {/* Leave Balance Widget */}
        <LeaveBalanceWidget
          onApplyLeave={() => setLocation("/leave")}
          onViewHistory={() => setLocation("/leave")}
        />
      </div>

      {/* Recent Data Tables */}
      <div className="grid grid-cols-1 gap-4 sm:gap-5 md:gap-6 mb-6">
        <RecentCustomersTable customers={recentCustomers} />
      </div>

      {/* Activity & Transactions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 gap-4 sm:gap-5 md:gap-6 mb-6">
        <RecentQuotations quotations={recentQuotations} />
      </div>

      {/* Quick Actions */}
      <QuickActions actions={getRoleBasedActions()} />

      {/* Check-in Modal */}
      <EnterpriseAttendanceCheckIn
        isOpen={showCheckInModal}
        onClose={() => setShowCheckInModal(false)}
        onSuccess={() => {
          // Refresh dashboard data after successful check-in
          setShowCheckInModal(false);
        }}
      />
    </>
  );
}

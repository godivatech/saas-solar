import { useAuthContext } from "@/contexts/auth-context";
import type { SystemPermission } from "@shared/schema";

/**
 * Legacy permission hook - DEPRECATED
 * This hook is maintained for backward compatibility only.
 * New components should use the schema-based permission system from useAuthContext:
 * - hasPermission() for SystemPermission checks
 * - hasRole() for role-based checks  
 * - isDepartmentMember() for department-based checks
 * - canAccessModule() for module access checks
 */

// Legacy permission types - mapped to new schema permissions
export type Permission =
  | "manage_departments" // -> departments.create, departments.edit, departments.delete
  | "set_office_locations" // -> system.settings
  | "manage_access" // -> permissions.manage
  | "assign_departments" // -> users.edit
  | "view_all_reports" // -> reports.advanced, analytics.enterprise
  | "view_department_reports" // -> reports.basic, analytics.departmental
  | "manage_customers" // -> customers.create, customers.edit
  | "manage_quotations" // -> quotations.create, quotations.edit
  | "manage_invoices" // -> invoices.create, invoices.edit
  | "manage_attendance" // -> attendance.view_all, attendance.approve
  | "manage_leaves" // -> leave.approve
  | "approve_leaves" // -> leave.approve
  | "hr_operations" // -> HR department permissions
  | "admin_operations" // -> Admin department permissions
  | "sales_operations" // -> Sales department permissions
  | "marketing_operations" // -> Marketing department permissions
  | "technical_operations"; // -> Technical department permissions

export function usePermissions() {
  const { user, hasPermission: newHasPermission } = useAuthContext();

  // Legacy permission mapping to new schema permissions
  const legacyPermissionMap: Record<Permission, SystemPermission[]> = {
    "manage_departments": ["departments.create", "departments.edit", "departments.delete"],
    "set_office_locations": ["system.settings"],
    "manage_access": ["permissions.manage"],
    "assign_departments": ["users.edit"],
    "view_all_reports": ["reports.advanced", "analytics.enterprise"],
    "view_department_reports": ["reports.basic", "analytics.departmental"],
    "manage_customers": ["customers.create", "customers.edit"],
    "manage_quotations": ["quotations.create", "quotations.edit"],
    "manage_invoices": ["invoices.create", "invoices.edit"],
    "manage_attendance": ["attendance.view_all", "attendance.approve"],
    "manage_leaves": ["leave.approve"],
    "approve_leaves": ["leave.approve"],
    "hr_operations": ["leave.approve", "attendance.view_all"],
    "admin_operations": ["invoices.create", "invoices.edit"],
    "sales_operations": ["customers.create", "quotations.create"],
    "marketing_operations": ["customers.create", "quotations.create"],
    "technical_operations": [],
  };

  const hasPermission = (permission: Permission): boolean => {
    if (!user) return false;

    // Master admin has all permissions
    if (user.role === "master_admin") return true;

    // Map legacy permission to new schema permissions and check
    const mappedPermissions = legacyPermissionMap[permission] || [];
    return mappedPermissions.some(perm => newHasPermission(perm));
  };

  const canManageDepartments = (): boolean => hasPermission("manage_departments");
  const canSetOfficeLocations = (): boolean => hasPermission("set_office_locations");
  const canManageAccess = (): boolean => hasPermission("manage_access");
  const canAssignDepartments = (): boolean => hasPermission("assign_departments");
  const canViewAllReports = (): boolean => hasPermission("view_all_reports");
  const canManageCustomers = (): boolean => hasPermission("manage_customers");

  const canManageQuotations = (): boolean => hasPermission("manage_quotations");
  const canManageInvoices = (): boolean => hasPermission("manage_invoices");
  const canManageAttendance = (): boolean => hasPermission("manage_attendance");
  const canManageLeaves = (): boolean => hasPermission("manage_leaves");
  const canApproveLeaves = (): boolean => hasPermission("approve_leaves");

  return {
    hasPermission,
    canManageDepartments,
    canSetOfficeLocations,
    canManageAccess,
    canAssignDepartments,
    canViewAllReports,
    canManageCustomers,
    canManageQuotations,
    canManageInvoices,
    canManageAttendance,
    canManageLeaves,
    canApproveLeaves,
    userRole: user?.role,
    userDepartment: user?.department,
  };
}
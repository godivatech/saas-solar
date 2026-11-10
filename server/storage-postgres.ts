import type {
  IStorage,
  Customer,
  Quotation,
  Invoice,
  User,
  Attendance,
  ActivityLog,
  LeaveBalance,
  LeaveApplication,
  SalaryStructure,
  SalaryAdvance,
  Payroll,
  OfficeLocation,
  FixedHoliday,
  Role,
  UserRoleAssignment,
  PermissionOverride,
  Employee,
  EmployeeDocument,
  PerformanceReview,
  AttendancePolicy,
  PayrollFieldConfig,
  Designation,
  PermissionGroup,
  Department,
  Notification
} from "./storage";
import { db as pgDb } from "./db";
import {
  tenants,
  users as pgUsers,
  customers as pgCustomers,
  quotations as pgQuotations,
  invoices as pgInvoices,
  payments as pgPayments,
  products as pgProducts,
  siteVisits as pgSiteVisits,
  followUpVisits as pgFollowUpVisits,
  departmentTimings as pgDepartmentTimings,
  companySettings as pgCompanySettings,
  attendance as pgAttendance,
  otSessions as pgOtSessions,
  leaveBalances as pgLeaveBalances,
  leaveApplications as pgLeaveApplications,
  salaryStructures as pgSalaryStructures,
  salaryAdvances as pgSalaryAdvances,
  payrolls as pgPayrolls,
  auditLogs as pgAuditLogs,
  activityLogs as pgActivityLogs,
  officeLocations as pgOfficeLocations,
  fixedHolidays as pgFixedHolidays,
  payrollPeriods as pgPayrollPeriods,
  notifications as pgNotifications,
  departments as pgDepartments,
  designations as pgDesignations,
  permissionGroups as pgPermissionGroups,
  roles as pgRoles,
  userRoleAssignments as pgUserRoleAssignments,
  permissionOverrides as pgPermissionOverrides,
  employees as pgEmployees,
  employeeDocuments as pgEmployeeDocuments,
  performanceReviews as pgPerformanceReviews,
  attendancePolicies as pgAttendancePolicies,
  payrollFieldConfigs as pgPayrollFieldConfigs
} from "@shared/schema.postgres";
import { eq, or, ilike, and, desc, sql, gte, lte, inArray } from "drizzle-orm";
import { getActiveTenantId } from "./tenant-context";

/**
 * Enterprise PostgreSQL Storage Layer
 * Implements IStorage using Neon PostgreSQL and Drizzle ORM.
 * Wraps legacy fallback with a Transparent Proxy for 100% backward compatibility.
 */
export class PostgresStorage implements IStorage {
  private defaultTenantId: string | null = null;
  public fallback: IStorage;

  constructor(fallback: IStorage) {
    this.fallback = fallback;
    return new Proxy(this, {
      get(target: any, prop: string | symbol, receiver: any) {
        if (prop in target) {
          const val = Reflect.get(target, prop, receiver);
          if (typeof val === "function") {
            return val.bind(target);
          }
          return val;
        }
        const fallbackVal = Reflect.get(target.fallback, prop);
        if (typeof fallbackVal === "function") {
          return fallbackVal.bind(target.fallback);
        }
        return fallbackVal;
      }
    });
  }

  private async getTenantId(): Promise<string> {
    const active = getActiveTenantId();
    if (active) return active;
    if (this.defaultTenantId) return this.defaultTenantId;
    const [t] = await pgDb.select().from(tenants).limit(1);
    if (t) {
      this.defaultTenantId = t.id;
      return t.id;
    }
    const [created] = await pgDb.insert(tenants).values({
      id: "adc11a73-7ef8-417b-b930-28d1d855d707",
      name: "Prakash Greens Energy Pvt Ltd",
      slug: "prakash-greens",
      state: "Karnataka"
    }).returning();
    this.defaultTenantId = created.id;
    return created.id;
  }

  async listAllTenants(): Promise<any[]> {
    try {
      return await pgDb.select().from(tenants);
    } catch (e) {
      console.error("[PostgresStorage] listAllTenants error:", e);
      return [{ id: "adc11a73-7ef8-417b-b930-28d1d855d707", name: "Default Tenant" }];
    }
  }

  async getTenant(id?: string): Promise<any | undefined> {
    try {
      const targetId = id || (await this.getTenantId());
      const [t] = await pgDb
        .select()
        .from(tenants)
        .where(eq(tenants.id, targetId))
        .limit(1);
      return t;
    } catch (e) {
      console.error("[PostgresStorage] getTenant error:", e);
      return undefined;
    }
  }

  async updateTenant(id: string, updates: any): Promise<any> {
    try {
      const [updated] = await pgDb
        .update(tenants)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(tenants.id, id))
        .returning();
      return updated;
    } catch (e) {
      console.error("[PostgresStorage] updateTenant error:", e);
      return undefined;
    }
  }

  // ===================================================================
  // USERS
  // ===================================================================
  private mapUser(u: any): User {
    return {
      id: u.id,
      uid: u.firebaseUid,
      email: u.email,
      displayName: u.displayName,
      role: u.role as any,
      department: u.department as any,
      designation: u.designation as any,
      employeeId: u.employeeId || undefined,
      reportingManagerId: u.reportingManagerId || undefined,
      payrollGrade: u.payrollGrade || undefined,
      joinDate: u.joinDate || undefined,
      dateOfLeaving: u.dateOfLeaving || undefined,
      rehireDate: u.rehireDate || undefined,
      isActive: u.isActive,
      employeeStatus: u.employeeStatus as any,
      permissions: (u.permissions as string[]) || [],
      phone: u.phone || u.phoneNumber || undefined,
      contactNumber: u.phone || u.phoneNumber || undefined,
      profilePhotoUrl: u.profilePhotoUrl || undefined,
      photoURL: u.profilePhotoUrl || undefined,
      aadharCardUrl: u.aadharCardUrl || undefined,
      panCardUrl: u.panCardUrl || undefined,
      bankDetails: u.bankDetails || undefined,
      bankAccountNumber: u.bankAccountNumber || undefined,
      ifscCode: u.bankIfsc || undefined,
      panNumber: u.panNumber || undefined,
      uanNumber: u.uanNumber || undefined,
      esiNumber: u.esiNumber || undefined,
      tenantId: u.tenantId || undefined,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt
    } as unknown as User;
  }

  async getUser(idOrUid: string): Promise<User | undefined> {
    try {
      const activeTenantId = getActiveTenantId();
      const whereCondition = activeTenantId
        ? and(or(eq(pgUsers.id, idOrUid), eq(pgUsers.firebaseUid, idOrUid)), eq(pgUsers.tenantId, activeTenantId))
        : or(eq(pgUsers.id, idOrUid), eq(pgUsers.firebaseUid, idOrUid));

      const [u] = await pgDb
        .select()
        .from(pgUsers)
        .where(whereCondition)
        .limit(1);

      if (u) {
        return this.mapUser(u);
      }
    } catch (e) {
      console.error("[PostgresStorage] getUser error, delegating to fallback:", e);
    }
    return this.fallback.getUser(idOrUid);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      const activeTenantId = getActiveTenantId();
      const whereCondition = activeTenantId
        ? and(eq(pgUsers.email, email.trim().toLowerCase()), eq(pgUsers.tenantId, activeTenantId))
        : eq(pgUsers.email, email.trim().toLowerCase());

      const [u] = await pgDb
        .select()
        .from(pgUsers)
        .where(whereCondition)
        .limit(1);

      if (u) {
        return this.mapUser(u);
      }
    } catch (e) {
      console.error("[PostgresStorage] getUserByEmail error, delegating:", e);
    }
    return this.fallback.getUserByEmail(email);
  }

  async listUsers(): Promise<User[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb
        .select()
        .from(pgUsers)
        .where(eq(pgUsers.tenantId, tenantId))
        .orderBy(desc(pgUsers.createdAt));
      return rows.map(u => this.mapUser(u));
    } catch (e) {
      console.error("[PostgresStorage] listUsers error, delegating:", e);
      return (this.fallback as any).listUsers ? (this.fallback as any).listUsers() : [];
    }
  }

  async createUser(data: any): Promise<User> {
    try {
      const tenantId = await this.getTenantId();
      const insertValues: any = {
        tenantId,
        firebaseUid: data.uid || data.firebaseUid || (data.id ? data.id : `user_${Date.now()}`),
        email: data.email,
        displayName: data.displayName,
        role: data.role || "employee",
        department: data.department || "operations",
        designation: data.designation || null,
        employeeId: data.employeeId || null,
        reportingManagerId: data.reportingManagerId || null,
        phone: data.phone || data.contactNumber || data.phoneNumber || null,
        phoneNumber: data.phoneNumber || data.phone || data.contactNumber || null,
        payrollGrade: data.payrollGrade || null,
        joinDate: data.joinDate ? new Date(data.joinDate) : null,
        dateOfLeaving: data.dateOfLeaving ? new Date(data.dateOfLeaving) : null,
        rehireDate: data.rehireDate ? new Date(data.rehireDate) : null,
        profilePhotoUrl: data.profilePhotoUrl || data.photoURL || null,
        aadharCardUrl: data.aadharCardUrl || null,
        panCardUrl: data.panCardUrl || null,
        bankAccountNumber: data.bankAccountNumber || null,
        bankIfsc: data.ifscCode || data.bankIfsc || null,
        panNumber: data.panNumber || null,
        uanNumber: data.uanNumber || null,
        esiNumber: data.esiNumber || null,
        bankDetails: data.bankDetails || {},
        isActive: data.isActive ?? true,
        employeeStatus: data.employeeStatus || "active",
        permissions: data.permissions || []
      };
      if (data.id) insertValues.id = data.id;

      const [u] = await pgDb.insert(pgUsers).values(insertValues).returning();

      try { await this.fallback.createUser(data); } catch (_) {}

      return this.mapUser(u);
    } catch (e) {
      console.error("[PostgresStorage] createUser error, delegating:", e);
      return this.fallback.createUser(data);
    }
  }

  async updateUser(id: string, data: any): Promise<User> {
    try {
      const updateValues: any = { updatedAt: new Date() };
      if (data.displayName !== undefined) updateValues.displayName = data.displayName;
      if (data.email !== undefined) updateValues.email = data.email;
      if (data.role !== undefined) updateValues.role = data.role;
      if (data.department !== undefined) updateValues.department = data.department;
      if (data.designation !== undefined) updateValues.designation = data.designation;
      if (data.employeeId !== undefined) updateValues.employeeId = data.employeeId;
      if (data.reportingManagerId !== undefined) updateValues.reportingManagerId = data.reportingManagerId;
      if (data.phone !== undefined || data.phoneNumber !== undefined || data.contactNumber !== undefined) {
        const p = data.phone || data.phoneNumber || data.contactNumber;
        updateValues.phone = p;
        updateValues.phoneNumber = p;
      }
      if (data.payrollGrade !== undefined) updateValues.payrollGrade = data.payrollGrade;
      if (data.joinDate !== undefined) updateValues.joinDate = data.joinDate ? new Date(data.joinDate) : null;
      if (data.dateOfLeaving !== undefined) updateValues.dateOfLeaving = data.dateOfLeaving ? new Date(data.dateOfLeaving) : null;
      if (data.rehireDate !== undefined) updateValues.rehireDate = data.rehireDate ? new Date(data.rehireDate) : null;
      if (data.profilePhotoUrl !== undefined) updateValues.profilePhotoUrl = data.profilePhotoUrl;
      if (data.photoURL !== undefined) updateValues.profilePhotoUrl = data.photoURL;
      if (data.aadharCardUrl !== undefined) updateValues.aadharCardUrl = data.aadharCardUrl;
      if (data.panCardUrl !== undefined) updateValues.panCardUrl = data.panCardUrl;
      if (data.bankAccountNumber !== undefined) updateValues.bankAccountNumber = data.bankAccountNumber;
      if (data.ifscCode !== undefined || data.bankIfsc !== undefined) updateValues.bankIfsc = data.ifscCode || data.bankIfsc;
      if (data.panNumber !== undefined) updateValues.panNumber = data.panNumber;
      if (data.uanNumber !== undefined) updateValues.uanNumber = data.uanNumber;
      if (data.esiNumber !== undefined) updateValues.esiNumber = data.esiNumber;
      if (data.bankDetails !== undefined) updateValues.bankDetails = data.bankDetails;
      if (data.isActive !== undefined) updateValues.isActive = data.isActive;
      if (data.employeeStatus !== undefined) updateValues.employeeStatus = data.employeeStatus;
      if (data.permissions !== undefined) updateValues.permissions = data.permissions;

      const activeTenantId = getActiveTenantId();
      const whereCondition = activeTenantId
        ? and(
            or(eq(pgUsers.id, id), eq(pgUsers.firebaseUid, id)),
            eq(pgUsers.tenantId, activeTenantId)
          )
        : or(eq(pgUsers.id, id), eq(pgUsers.firebaseUid, id));

      const [u] = await pgDb
        .update(pgUsers)
        .set(updateValues)
        .where(whereCondition)
        .returning();

      try { await this.fallback.updateUser(id, data); } catch (_) {}

      if (u) {
        return this.mapUser(u);
      }
    } catch (e) {
      console.error("[PostgresStorage] updateUser error, delegating:", e);
    }
    return this.fallback.updateUser(id, data);
  }

  async getUsersByDepartment(department: string): Promise<User[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb
        .select()
        .from(pgUsers)
        .where(
          and(
            eq(pgUsers.tenantId, tenantId),
            eq(pgUsers.department, department.toLowerCase())
          )
        );
      return rows.map(r => this.mapUser(r));
    } catch (e) {
      console.error("[PostgresStorage] getUsersByDepartment error:", e);
      return this.fallback.getUsersByDepartment(department);
    }
  }

  async getUsersByDesignation(designation: string): Promise<User[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb
        .select()
        .from(pgUsers)
        .where(
          and(
            eq(pgUsers.tenantId, tenantId),
            eq(pgUsers.designation, designation)
          )
        );
      return rows.map(r => this.mapUser(r));
    } catch (e) {
      console.error("[PostgresStorage] getUsersByDesignation error:", e);
      return this.fallback.getUsersByDesignation(designation);
    }
  }

  async getUsersByReportingManager(managerId: string): Promise<User[]> {
    try {
      const tenantId = await this.getTenantId();
      const managerUser = await this.getUser(managerId);
      const managerKeys = [managerId];
      if (managerUser?.id && !managerKeys.includes(managerUser.id)) managerKeys.push(managerUser.id);
      if ((managerUser as any)?.firebaseUid && !managerKeys.includes((managerUser as any).firebaseUid)) managerKeys.push((managerUser as any).firebaseUid);
      if ((managerUser as any)?.employeeId && !managerKeys.includes((managerUser as any).employeeId)) managerKeys.push((managerUser as any).employeeId);

      const rows = await pgDb
        .select()
        .from(pgUsers)
        .where(
          and(
            eq(pgUsers.tenantId, tenantId),
            inArray(pgUsers.reportingManagerId, managerKeys)
          )
        );
      return rows.map(r => this.mapUser(r));
    } catch (e) {
      console.error("[PostgresStorage] getUsersByReportingManager error:", e);
      return this.fallback.getUsersByReportingManager(managerId);
    }
  }

  async getUsersByRole(role: string): Promise<User[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb
        .select()
        .from(pgUsers)
        .where(
          and(
            eq(pgUsers.tenantId, tenantId),
            eq(pgUsers.role, role)
          )
        );
      return rows.map(r => this.mapUser(r));
    } catch (e) {
      console.error("[PostgresStorage] getUsersByRole error:", e);
      return this.fallback.getUsersByRole(role);
    }
  }

  async listDepartments(): Promise<string[]> {
    try {
      const tenantId = await this.getTenantId();
      const [timingRows, userRows, deptRows] = await Promise.all([
        pgDb
          .select({ department: pgDepartmentTimings.department })
          .from(pgDepartmentTimings)
          .where(eq(pgDepartmentTimings.tenantId, tenantId)),
        pgDb
          .select({ department: pgUsers.department })
          .from(pgUsers)
          .where(eq(pgUsers.tenantId, tenantId)),
        pgDb
          .select({ name: pgDepartments.name })
          .from(pgDepartments)
          .where(and(eq(pgDepartments.tenantId, tenantId), eq(pgDepartments.isActive, true)))
      ]);

      const deptSet = new Set<string>();
      timingRows.forEach(r => r.department && deptSet.add(r.department));
      userRows.forEach(r => r.department && deptSet.add(r.department));
      deptRows.forEach(r => r.name && deptSet.add(r.name));

      return Array.from(deptSet);
    } catch (e) {
      console.error("[PostgresStorage] listDepartments error:", e);
      return this.fallback.listDepartments();
    }
  }

  async getEffectiveUserPermissions(userId: string): Promise<string[]> {
    try {
      const user = await this.getUser(userId);
      if (!user) return [];

      const permissions: Set<string> = new Set(((user as any).permissions as string[]) || []);

      if (user.role === "master_admin") {
        const { getEffectivePermissions } = await import("@shared/schema");
        const allPermissions = getEffectivePermissions(user.department || "sales", user.designation || "cre");
        allPermissions.forEach(p => permissions.add(p));
        permissions.add("system.settings");
        permissions.add("system.backup");
        permissions.add("system.audit");
        permissions.add("users.delete");
        permissions.add("permissions.assign");
        return Array.from(permissions);
      }

      if (user.department && user.designation) {
        try {
          const { getEffectivePermissions } = await import("@shared/schema");
          const deptPerms = getEffectivePermissions(user.department, user.designation);
          deptPerms.forEach(p => permissions.add(p));
        } catch (_) {}
      }

      return Array.from(permissions);
    } catch (e) {
      console.error("[PostgresStorage] getEffectiveUserPermissions error:", e);
      return this.fallback.getEffectiveUserPermissions(userId);
    }
  }

  async checkEffectiveUserPermission(userId: string, permission: string): Promise<boolean> {
    const permissions = await this.getEffectiveUserPermissions(userId);
    return permissions.includes(permission);
  }

  async getUserApprovalLimits(userId: string): Promise<{ canApprove: boolean; maxAmount: number | null }> {
    const user = await this.getUser(userId);
    if (!user) return { canApprove: false, maxAmount: null };
    if (user.role === 'master_admin') return { canApprove: true, maxAmount: null };
    if (user.role === 'admin') return { canApprove: true, maxAmount: 500000 };
    return { canApprove: false, maxAmount: 0 };
  }

  async getEffectiveUserApprovalLimits(userId: string): Promise<{ canApprove: boolean; maxAmount: Record<string, number | null> }> {
    const user = await this.getUser(userId);
    if (!user) return { canApprove: false, maxAmount: {} };
    const isMaster = user.role === 'master_admin';
    return {
      canApprove: isMaster || user.role === 'admin',
      maxAmount: {
        quotation: isMaster ? null : 1000000,
        discount: isMaster ? null : 50000,
        salary_advance: isMaster ? null : 25000,
        leave: isMaster ? null : 10
      }
    };
  }

  // ===================================================================
  // CUSTOMERS (CRM)
  // ===================================================================
  private mapCustomer(c: any): Customer {
    return {
      id: c.id,
      name: c.name,
      mobile: c.mobile,
      email: c.email || undefined,
      address: c.address || undefined,
      city: c.city || undefined,
      state: c.state || undefined,
      pincode: c.pincode || undefined,
      gstin: c.gstin || undefined,
      ebServiceNumber: c.ebServiceNumber || undefined,
      tariffCode: c.tariffCode || undefined,
      ebSanctionPhase: c.ebSanctionPhase as any,
      ebSanctionKW: c.ebSanctionKW ? Number(c.ebSanctionKW) : undefined,
      propertyType: c.propertyType as any,
      scope: c.scope || undefined,
      status: c.status || "lead",
      assignedSalesExecId: c.assignedSalesExecId || undefined,
      profileCompleteness: (c.ebServiceNumber && c.email) ? "full" : "basic",
      createdFrom: "customers_page",
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    } as unknown as Customer;
  }

  async listCustomers(): Promise<Customer[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb
        .select()
        .from(pgCustomers)
        .where(and(eq(pgCustomers.tenantId, tenantId), eq(pgCustomers.isDeleted, false)))
        .orderBy(desc(pgCustomers.createdAt));

      return rows.map(c => this.mapCustomer(c));
    } catch (e) {
      console.error("[PostgresStorage] listCustomers error, delegating:", e);
      return this.fallback.listCustomers();
    }
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [c] = await pgDb
        .select()
        .from(pgCustomers)
        .where(
          and(
            eq(pgCustomers.id, id),
            eq(pgCustomers.tenantId, tenantId),
            eq(pgCustomers.isDeleted, false)
          )
        )
        .limit(1);

      if (c) {
        return this.mapCustomer(c);
      }
    } catch (e) {
      console.error("[PostgresStorage] getCustomer error, delegating:", e);
    }
    return this.fallback.getCustomer(id);
  }

  async findCustomerByMobile(mobile: string): Promise<Customer | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [c] = await pgDb
        .select()
        .from(pgCustomers)
        .where(
          and(
            eq(pgCustomers.tenantId, tenantId),
            eq(pgCustomers.mobile, mobile),
            eq(pgCustomers.isDeleted, false)
          )
        )
        .limit(1);

      if (c) {
        return this.mapCustomer(c);
      }
    } catch (e) {
      console.error("[PostgresStorage] findCustomerByMobile error, delegating:", e);
    }
    return (this.fallback as any).findCustomerByMobile ? (this.fallback as any).findCustomerByMobile(mobile) : undefined;
  }

  async createCustomer(data: any): Promise<Customer> {
    try {
      const tenantId = await this.getTenantId();
      const [c] = await pgDb.insert(pgCustomers).values({
        tenantId,
        name: data.name,
        mobile: data.mobile || data.phone || data.contactNumber || "",
        email: data.email || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || "Karnataka",
        pincode: data.pincode || null,
        gstin: data.gstin || null,
        ebServiceNumber: data.ebServiceNumber || null,
        tariffCode: data.tariffCode || null,
        ebSanctionPhase: data.ebSanctionPhase || null,
        ebSanctionKW: data.ebSanctionKW ? String(data.ebSanctionKW) : null,
        propertyType: data.propertyType || "residential",
        scope: data.scope || null,
        status: data.status || "lead",
        assignedSalesExecId: data.assignedSalesExecId || null,
        isDeleted: false
      }).returning();

      try { await this.fallback.createCustomer(data); } catch (_) {}

      return this.mapCustomer(c);
    } catch (e) {
      console.error("[PostgresStorage] createCustomer error, using fallback:", e);
      return this.fallback.createCustomer(data);
    }
  }

  async updateCustomer(id: string, data: any): Promise<Customer> {
    try {
      const tenantId = await this.getTenantId();
      const updateValues: any = { updatedAt: new Date() };
      if (data.name !== undefined) updateValues.name = data.name;
      if (data.mobile !== undefined || data.phone !== undefined || data.contactNumber !== undefined) {
        updateValues.mobile = data.mobile || data.phone || data.contactNumber;
      }
      if (data.email !== undefined) updateValues.email = data.email;
      if (data.address !== undefined) updateValues.address = data.address;
      if (data.city !== undefined) updateValues.city = data.city;
      if (data.state !== undefined) updateValues.state = data.state;
      if (data.pincode !== undefined) updateValues.pincode = data.pincode;
      if (data.gstin !== undefined) updateValues.gstin = data.gstin;
      if (data.ebServiceNumber !== undefined) updateValues.ebServiceNumber = data.ebServiceNumber;
      if (data.tariffCode !== undefined) updateValues.tariffCode = data.tariffCode;
      if (data.ebSanctionPhase !== undefined) updateValues.ebSanctionPhase = data.ebSanctionPhase;
      if (data.ebSanctionKW !== undefined) updateValues.ebSanctionKW = String(data.ebSanctionKW);
      if (data.propertyType !== undefined) updateValues.propertyType = data.propertyType;
      if (data.scope !== undefined) updateValues.scope = data.scope;
      if (data.status !== undefined) updateValues.status = data.status;
      if (data.assignedSalesExecId !== undefined) updateValues.assignedSalesExecId = data.assignedSalesExecId;
      if (data.isDeleted !== undefined) updateValues.isDeleted = data.isDeleted;

      const [c] = await pgDb
        .update(pgCustomers)
        .set(updateValues)
        .where(
          and(
            eq(pgCustomers.id, id),
            eq(pgCustomers.tenantId, tenantId)
          )
        )
        .returning();

      try { await this.fallback.updateCustomer(id, data); } catch (_) {}

      if (c) {
        return this.mapCustomer(c);
      }
    } catch (e) {
      console.error("[PostgresStorage] updateCustomer error, using fallback:", e);
    }
    return this.fallback.updateCustomer(id, data);
  }

  async deleteCustomer(id: string): Promise<void> {
    try {
      const tenantId = await this.getTenantId();
      await pgDb
        .update(pgCustomers)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(
          and(
            eq(pgCustomers.id, id),
            eq(pgCustomers.tenantId, tenantId)
          )
        );

      try { await this.fallback.deleteCustomer(id); } catch (_) {}
    } catch (e) {
      console.error("[PostgresStorage] deleteCustomer error, using fallback:", e);
      return this.fallback.deleteCustomer(id);
    }
  }

  // ===================================================================
  // ACTIVITY LOGS
  // ===================================================================
  async listActivityLogs(limit = 10): Promise<ActivityLog[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb
        .select()
        .from(pgActivityLogs)
        .where(eq(pgActivityLogs.tenantId, tenantId))
        .orderBy(desc(pgActivityLogs.createdAt))
        .limit(limit);

      return rows.map(r => ({
        id: r.id,
        type: r.type as any,
        title: r.title,
        description: r.description,
        entityId: r.entityId || '',
        entityType: r.entityType || '',
        userId: r.userId || '',
        createdAt: r.createdAt
      }));
    } catch (e) {
      console.error("[PostgresStorage] listActivityLogs error, delegating:", e);
      return this.fallback.listActivityLogs(limit);
    }
  }

  async createActivityLog(data: any): Promise<ActivityLog> {
    try {
      const tenantId = await this.getTenantId();
      const [row] = await pgDb.insert(pgActivityLogs).values({
        tenantId,
        type: data.type,
        title: data.title,
        description: data.description,
        entityId: data.entityId || null,
        entityType: data.entityType || null,
        userId: data.userId || null,
      }).returning();

      return {
        id: row.id,
        type: row.type as any,
        title: row.title,
        description: row.description,
        entityId: row.entityId || '',
        entityType: row.entityType || '',
        userId: row.userId || '',
        createdAt: row.createdAt
      };
    } catch (e) {
      console.error("[PostgresStorage] createActivityLog error, fallback:", e);
      return this.fallback.createActivityLog(data);
    }
  }

  // ===================================================================
  // QUOTATIONS
  // ===================================================================
  private mapQuotation(q: any): Quotation {
    return {
      id: q.id,
      quotationNumber: q.quotationNumber,
      revision: q.revision,
      customerId: q.customerId,
      projectType: q.projectType as any,
      systemKw: Number(q.systemKw),
      ratePerKw: Number(q.ratePerKw) || 0,
      basePrice: Number(q.basePrice),
      gstPercentage: Number(q.gstPercentage),
      gstAmount: Number(q.gstAmount),
      totalCost: Number(q.totalCost),
      subsidyAmount: Number(q.subsidyAmount),
      customerPayment: Number(q.customerPayment),
      roundoff: Number(q.roundoff) || 0,
      status: q.status as any,
      source: q.source as any,
      preparedBy: q.preparedBy || undefined,
      projects: (q.projects as any[]) || [],
      customBillOfMaterials: (q.customBillOfMaterials as any[]) || undefined,
      customerNotes: q.customerNotes || undefined,
      internalNotes: q.internalNotes || undefined,
      validUntil: q.validUntil || undefined,
      createdBy: q.createdBy || undefined,
      updatedBy: q.updatedBy || undefined,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt
    } as unknown as Quotation;
  }

  async listQuotations(): Promise<Quotation[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb
        .select()
        .from(pgQuotations)
        .where(eq(pgQuotations.tenantId, tenantId))
        .orderBy(desc(pgQuotations.createdAt));
      return rows.map(q => this.mapQuotation(q));
    } catch (e) {
      console.error("[PostgresStorage] listQuotations error, delegating:", e);
      return this.fallback.listQuotations();
    }
  }

  async getQuotation(id: string): Promise<Quotation | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [q] = await pgDb
        .select()
        .from(pgQuotations)
        .where(
          and(
            eq(pgQuotations.id, id),
            eq(pgQuotations.tenantId, tenantId)
          )
        )
        .limit(1);
      if (q) {
        return this.mapQuotation(q);
      }
    } catch (e) {
      console.error("[PostgresStorage] getQuotation error:", e);
    }
    return this.fallback.getQuotation(id);
  }

  async createQuotation(data: any): Promise<Quotation> {
    try {
      const tenantId = await this.getTenantId();
      const [created] = await pgDb.insert(pgQuotations).values({
        tenantId,
        quotationNumber: data.quotationNumber || `QT-${Date.now().toString().slice(-6)}`,
        revision: data.revision || 0,
        customerId: data.customerId,
        projectType: data.projectType || 'on_grid',
        systemKw: String(data.systemKw || 0),
        ratePerKw: String(data.ratePerKw || 0),
        basePrice: String(data.basePrice || 0),
        gstPercentage: String(data.gstPercentage || 13.8),
        gstAmount: String(data.gstAmount || 0),
        totalCost: String(data.totalCost || 0),
        subsidyAmount: String(data.subsidyAmount || 0),
        customerPayment: String(data.customerPayment || 0),
        roundoff: String(data.roundoff || 0),
        status: data.status || 'draft',
        source: data.source || 'manual',
        preparedBy: data.preparedBy || 'System',
        projects: data.projects || [],
        customBillOfMaterials: data.customBillOfMaterials || [],
        customerNotes: data.customerNotes || null,
        internalNotes: data.internalNotes || null,
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        createdBy: data.createdBy || null,
        updatedBy: data.updatedBy || null
      }).returning();

      try {
        const enrichedForFallback = {
          ...data,
          quotationNumber: created.quotationNumber,
          source: data.source || 'manual',
          preparedBy: data.preparedBy || 'System',
          projects: data.projects || [],
          totalSystemCost: Number(created.totalCost),
          totalCustomerPayment: Number(created.customerPayment),
          advanceAmount: Math.round(Number(created.customerPayment) * 0.2),
          balanceAmount: Math.round(Number(created.customerPayment) * 0.8)
        };
        await this.fallback.createQuotation(enrichedForFallback);
      } catch (_) {}

      return this.mapQuotation(created);
    } catch (e) {
      console.error("[PostgresStorage] createQuotation error, delegating:", e);
      return this.fallback.createQuotation(data);
    }
  }

  async updateQuotation(id: string, data: any, updatedBy: string): Promise<Quotation> {
    try {
      const updateValues: any = { updatedAt: new Date(), updatedBy };
      if (data.status !== undefined) updateValues.status = data.status;
      if (data.revision !== undefined) updateValues.revision = data.revision;
      if (data.customerId !== undefined) updateValues.customerId = data.customerId;
      if (data.projectType !== undefined) updateValues.projectType = data.projectType;
      if (data.systemKw !== undefined) updateValues.systemKw = String(data.systemKw);
      if (data.ratePerKw !== undefined) updateValues.ratePerKw = String(data.ratePerKw);
      if (data.basePrice !== undefined) updateValues.basePrice = String(data.basePrice);
      if (data.gstPercentage !== undefined) updateValues.gstPercentage = String(data.gstPercentage);
      if (data.gstAmount !== undefined) updateValues.gstAmount = String(data.gstAmount);
      if (data.totalCost !== undefined) updateValues.totalCost = String(data.totalCost);
      if (data.subsidyAmount !== undefined) updateValues.subsidyAmount = String(data.subsidyAmount);
      if (data.customerPayment !== undefined) updateValues.customerPayment = String(data.customerPayment);
      if (data.roundoff !== undefined) updateValues.roundoff = String(data.roundoff);
      if (data.source !== undefined) updateValues.source = data.source;
      if (data.preparedBy !== undefined) updateValues.preparedBy = data.preparedBy;
      if (data.projects !== undefined) updateValues.projects = data.projects;
      if (data.customBillOfMaterials !== undefined) updateValues.customBillOfMaterials = data.customBillOfMaterials;
      if (data.customerNotes !== undefined) updateValues.customerNotes = data.customerNotes;
      if (data.internalNotes !== undefined) updateValues.internalNotes = data.internalNotes;
      if (data.validUntil !== undefined) updateValues.validUntil = data.validUntil ? new Date(data.validUntil) : null;

      const tenantId = await this.getTenantId();
      const [updated] = await pgDb
        .update(pgQuotations)
        .set(updateValues)
        .where(
          and(
            eq(pgQuotations.id, id),
            eq(pgQuotations.tenantId, tenantId)
          )
        )
        .returning();

      try { await this.fallback.updateQuotation(id, data, updatedBy); } catch (_) {}

      if (updated) {
        return this.mapQuotation(updated);
      }
    } catch (e) {
      console.error("[PostgresStorage] updateQuotation error, delegating:", e);
    }
    return this.fallback.updateQuotation(id, data, updatedBy);
  }

  async deleteQuotation(id: string): Promise<void> {
    try {
      const tenantId = await this.getTenantId();
      await pgDb
        .delete(pgQuotations)
        .where(
          and(
            eq(pgQuotations.id, id),
            eq(pgQuotations.tenantId, tenantId)
          )
        );
      try { await this.fallback.deleteQuotation(id); } catch (_) {}
    } catch (e) {
      console.error("[PostgresStorage] deleteQuotation error:", e);
      return this.fallback.deleteQuotation(id);
    }
  }

  // ===================================================================
  // INVOICES & PAYMENTS
  // ===================================================================
  private mapInvoice(inv: any): Invoice {
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      quotationId: inv.quotationId || '',
      customerId: inv.customerId,
      total: Number(inv.totalAmount),
      status: inv.status,
      createdAt: inv.createdAt
    } as Invoice;
  }

  async listInvoices(): Promise<Invoice[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb
        .select()
        .from(pgInvoices)
        .where(eq(pgInvoices.tenantId, tenantId))
        .orderBy(desc(pgInvoices.createdAt));
      return rows.map(inv => this.mapInvoice(inv));
    } catch (e) {
      console.error("[PostgresStorage] listInvoices error, delegating:", e);
      return this.fallback.listInvoices();
    }
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [inv] = await pgDb
        .select()
        .from(pgInvoices)
        .where(
          and(
            eq(pgInvoices.id, id),
            eq(pgInvoices.tenantId, tenantId)
          )
        )
        .limit(1);
      if (inv) {
        return this.mapInvoice(inv);
      }
      return undefined;
    } catch (e) {
      console.error("[PostgresStorage] getInvoice error:", e);
      return undefined;
    }
  }

  async createInvoice(data: any): Promise<Invoice> {
    try {
      const tenantId = await this.getTenantId();
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 15);

      const [created] = await pgDb.insert(pgInvoices).values({
        tenantId,
        invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
        quotationId: data.quotationId || null,
        customerId: data.customerId,
        dueDate,
        baseAmount: String(data.total || 0),
        totalAmount: String(data.total || 0),
        balanceDue: String(data.total || 0),
        status: data.status || 'pending'
      }).returning();

      try { await this.fallback.createInvoice(data); } catch (_) {}

      return this.mapInvoice(created);
    } catch (e) {
      console.error("[PostgresStorage] createInvoice error, fallback:", e);
      return this.fallback.createInvoice(data);
    }
  }

  async updateInvoice(id: string, data: any): Promise<Invoice> {
    try {
      const tenantId = await this.getTenantId();
      const updateValues: any = { updatedAt: new Date() };
      if (data.status !== undefined) updateValues.status = data.status;
      if (data.total !== undefined) {
        updateValues.totalAmount = String(data.total);
        updateValues.baseAmount = String(data.total);
      }
      if (data.paidAmount !== undefined) updateValues.paidAmount = String(data.paidAmount);
      if (data.balanceDue !== undefined) updateValues.balanceDue = String(data.balanceDue);
      if (data.dueDate !== undefined) updateValues.dueDate = data.dueDate ? new Date(data.dueDate) : null;
      if (data.paymentTerms !== undefined) updateValues.paymentTerms = data.paymentTerms;
      if (data.notes !== undefined) updateValues.notes = data.notes;

      const [updated] = await pgDb
        .update(pgInvoices)
        .set(updateValues)
        .where(
          and(
            eq(pgInvoices.id, id),
            eq(pgInvoices.tenantId, tenantId)
          )
        )
        .returning();
      try { await this.fallback.updateInvoice(id, data); } catch (_) {}

      if (updated) {
        return this.mapInvoice(updated);
      }
    } catch (e) {
      console.error("[PostgresStorage] updateInvoice error:", e);
    }
    return this.fallback.updateInvoice(id, data);
  }

  async deleteInvoice(id: string): Promise<void> {
    try {
      const tenantId = await this.getTenantId();
      await pgDb
        .delete(pgInvoices)
        .where(
          and(
            eq(pgInvoices.id, id),
            eq(pgInvoices.tenantId, tenantId)
          )
        );
      try { await this.fallback.deleteInvoice(id); } catch (_) {}
    } catch (e) {
      console.error("[PostgresStorage] deleteInvoice error:", e);
      return this.fallback.deleteInvoice(id);
    }
  }

  /**
   * Atomic ACID Financial Transaction: Records an invoice payment and recalculates invoice balance and status
   */
  async recordInvoicePayment(data: {
    invoiceId: string;
    amount: number;
    paymentMethod: string;
    referenceNumber?: string;
    receivedBy?: string;
    notes?: string;
  }): Promise<{ payment: any; invoice: Invoice }> {
    try {
      return await pgDb.transaction(async (tx) => {
        const tenantId = await this.getTenantId();
        const [inv] = await tx
          .select()
          .from(pgInvoices)
          .where(
            and(
              eq(pgInvoices.id, data.invoiceId),
              eq(pgInvoices.tenantId, tenantId)
            )
          )
          .limit(1);
        if (!inv) {
          throw new Error(`Invoice ${data.invoiceId} not found`);
        }

        const totalAmount = Number(inv.totalAmount);
        const prevPaid = Number(inv.amountPaid || 0);
        const newPaid = prevPaid + data.amount;
        const balanceDue = Math.max(0, totalAmount - newPaid);
        const newStatus = balanceDue === 0 ? "paid" : "partially_paid";
        const receiptNumber = `REC-${Date.now().toString().slice(-6)}`;

        const [payment] = await tx.insert(pgPayments).values({
          tenantId,
          invoiceId: data.invoiceId,
          customerId: inv.customerId,
          receiptNumber,
          amount: String(data.amount),
          paymentMethod: data.paymentMethod,
          paymentMode: data.paymentMethod,
          referenceNumber: data.referenceNumber || null,
          receivedBy: data.receivedBy || null,
          notes: data.notes || null,
          status: "completed"
        }).returning();

        const [updatedInv] = await tx
          .update(pgInvoices)
          .set({
            amountPaid: String(newPaid),
            balanceDue: String(balanceDue),
            status: newStatus,
            updatedAt: new Date()
          })
          .where(
            and(
              eq(pgInvoices.id, data.invoiceId),
              eq(pgInvoices.tenantId, tenantId)
            )
          )
          .returning();

        return {
          payment,
          invoice: {
            id: updatedInv.id,
            invoiceNumber: updatedInv.invoiceNumber,
            quotationId: updatedInv.quotationId || '',
            customerId: updatedInv.customerId,
            total: Number(updatedInv.totalAmount),
            status: updatedInv.status,
            createdAt: updatedInv.createdAt
          } as Invoice
        };
      });
    } catch (e) {
      console.error("[PostgresStorage] recordInvoicePayment transaction error:", e);
      throw e;
    }
  }

  async listPaymentsByInvoice(invoiceId: string): Promise<any[]> {
    try {
      const tenantId = await this.getTenantId();
      return await pgDb
        .select()
        .from(pgPayments)
        .where(
          and(
            eq(pgPayments.invoiceId, invoiceId),
            eq(pgPayments.tenantId, tenantId)
          )
        )
        .orderBy(desc(pgPayments.paymentDate));
    } catch (e) {
      console.error("[PostgresStorage] listPaymentsByInvoice error:", e);
      return [];
    }
  }

  // ===================================================================
  // PRODUCTS & INVENTORY
  // ===================================================================
  // PRODUCTS & INVENTORY
  // ===================================================================
  private mapProduct(p: any): any {
    return {
      id: p.id,
      tenantId: p.tenantId,
      name: p.name,
      sku: p.sku,
      category: p.category,
      brand: p.brand || null,
      model: p.model || null,
      specifications: p.specifications || {},
      unit: p.unit || 'Nos',
      purchasePrice: Number(p.purchasePrice) || 0,
      sellingPrice: Number(p.sellingPrice) || 0,
      currentStock: Number(p.currentStock) || 0,
      minimumStock: Number(p.minimumStock) || 0,
      status: p.status,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    };
  }

  async listProducts(filters?: { search?: string; category?: string; page?: number; limit?: number }): Promise<{ products: any[]; total: number }> {
    try {
      const tenantId = await this.getTenantId();
      const conditions: any[] = [eq(pgProducts.tenantId, tenantId)];

      if (filters?.category && filters.category !== 'all') {
        conditions.push(eq(pgProducts.category, filters.category));
      }

      if (filters?.search && filters.search.trim()) {
        const searchTerm = `%${filters.search.trim()}%`;
        conditions.push(
          or(
            ilike(pgProducts.name, searchTerm),
            ilike(pgProducts.sku, searchTerm),
            ilike(pgProducts.brand, searchTerm),
            ilike(pgProducts.model, searchTerm)
          )
        );
      }

      const [{ count }] = await pgDb
        .select({ count: sql<number>`count(*)::int` })
        .from(pgProducts)
        .where(and(...conditions));

      const page = Math.max(1, Number(filters?.page) || 1);
      const limit = Math.max(1, Math.min(100, Number(filters?.limit) || 50));
      const offset = (page - 1) * limit;

      const rows = await pgDb
        .select()
        .from(pgProducts)
        .where(and(...conditions))
        .orderBy(desc(pgProducts.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        products: rows.map(p => this.mapProduct(p)),
        total: count
      };
    } catch (e) {
      console.error("[PostgresStorage] listProducts error:", e);
      return { products: [], total: 0 };
    }
  }

  async getProduct(id: string): Promise<any | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [p] = await pgDb
        .select()
        .from(pgProducts)
        .where(and(eq(pgProducts.id, id), eq(pgProducts.tenantId, tenantId)))
        .limit(1);
      return p ? this.mapProduct(p) : undefined;
    } catch (e) {
      console.error("[PostgresStorage] getProduct error:", e);
      return undefined;
    }
  }

  async createProduct(data: any): Promise<any> {
    try {
      const tenantId = await this.getTenantId();
      const curStock = Number(data.currentStock) || 0;
      const minStock = Number(data.minimumStock) || 5;
      const calculatedStatus = curStock <= 0 ? 'out_of_stock' : (curStock <= minStock ? 'low_stock' : 'in_stock');

      const [p] = await pgDb.insert(pgProducts).values({
        tenantId,
        name: data.name,
        sku: data.sku || `SKU-${Date.now().toString().slice(-6)}`,
        category: data.category || 'panel',
        brand: data.brand || null,
        model: data.model || null,
        specifications: data.specifications || {},
        unit: data.unit || 'Nos',
        purchasePrice: String(data.purchasePrice || 0),
        sellingPrice: String(data.sellingPrice || 0),
        currentStock: curStock,
        minimumStock: minStock,
        status: data.status || calculatedStatus
      }).returning();
      return this.mapProduct(p);
    } catch (e) {
      console.error("[PostgresStorage] createProduct error:", e);
      throw e;
    }
  }

  async updateProduct(id: string, data: any): Promise<any> {
    try {
      const tenantId = await this.getTenantId();
      const [existing] = await pgDb
        .select()
        .from(pgProducts)
        .where(and(eq(pgProducts.id, id), eq(pgProducts.tenantId, tenantId)))
        .limit(1);

      if (!existing) {
        throw new Error(`Product ${id} not found`);
      }

      const updateValues: any = { updatedAt: new Date() };
      if (data.name !== undefined) updateValues.name = data.name;
      if (data.sku !== undefined) updateValues.sku = data.sku;
      if (data.category !== undefined) updateValues.category = data.category;
      if (data.brand !== undefined) updateValues.brand = data.brand;
      if (data.model !== undefined) updateValues.model = data.model;
      if (data.specifications !== undefined) updateValues.specifications = data.specifications;
      if (data.unit !== undefined) updateValues.unit = data.unit;
      if (data.purchasePrice !== undefined) updateValues.purchasePrice = String(data.purchasePrice);
      if (data.sellingPrice !== undefined) updateValues.sellingPrice = String(data.sellingPrice);

      const newStock = data.currentStock !== undefined ? Number(data.currentStock) : existing.currentStock;
      const minStock = data.minimumStock !== undefined ? Number(data.minimumStock) : existing.minimumStock;

      if (data.currentStock !== undefined) updateValues.currentStock = newStock;
      if (data.minimumStock !== undefined) updateValues.minimumStock = minStock;

      if (data.status !== undefined) {
        updateValues.status = data.status;
      } else if (data.currentStock !== undefined || data.minimumStock !== undefined) {
        updateValues.status = newStock <= 0 ? 'out_of_stock' : (newStock <= minStock ? 'low_stock' : 'in_stock');
      }

      const [p] = await pgDb
        .update(pgProducts)
        .set(updateValues)
        .where(and(eq(pgProducts.id, id), eq(pgProducts.tenantId, tenantId)))
        .returning();

      return p ? this.mapProduct(p) : undefined;
    } catch (e) {
      console.error("[PostgresStorage] updateProduct error:", e);
      throw e;
    }
  }

  async deleteProduct(id: string): Promise<void> {
    try {
      const tenantId = await this.getTenantId();
      await pgDb
        .delete(pgProducts)
        .where(and(eq(pgProducts.id, id), eq(pgProducts.tenantId, tenantId)));
    } catch (e) {
      console.error("[PostgresStorage] deleteProduct error:", e);
      throw e;
    }
  }

  // ===================================================================
  // ATTENDANCE & SHIFTS
  // ===================================================================
  private mapAttendance(att: any): Attendance {
    return {
      id: att.id,
      userId: att.userId,
      userDepartment: att.userDepartment || null,
      date: att.date,
      checkInTime: att.checkInTime || undefined,
      checkOutTime: att.checkOutTime || undefined,
      attendanceType: att.attendanceType,
      status: att.status,
      workingHours: Number(att.workingHours) || 0,
      overtimeHours: Number(att.overtimeHours) || 0,
      isLate: att.isLate,
      lateMinutes: att.lateMinutes,
      isWithinOfficeRadius: att.isWithinOfficeRadius,
      isWeeklyOff: att.isWeeklyOff,
      isHoliday: att.isHoliday,
      autoCorrected: att.autoCorrected,
      autoCorrectedAt: att.autoCorrectedAt,
      autoCorrectionReason: att.autoCorrectionReason,
      adminReviewStatus: att.adminReviewStatus,
      remarks: att.remarks,
      otSessions: (att.otSessions as any[]) || [],
      createdAt: att.createdAt
    } as unknown as Attendance;
  }

  async getAttendance(id: string): Promise<Attendance | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [att] = await pgDb
        .select()
        .from(pgAttendance)
        .where(
          and(
            eq(pgAttendance.id, id),
            eq(pgAttendance.tenantId, tenantId)
          )
        )
        .limit(1);
      if (att) return this.mapAttendance(att);
    } catch (e) {
      console.error("[PostgresStorage] getAttendance error:", e);
    }
    return this.fallback.getAttendance(id);
  }

  async getAttendanceByUserAndDate(userId: string, date: Date): Promise<Attendance | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);

      const [att] = await pgDb
        .select()
        .from(pgAttendance)
        .where(and(
          eq(pgAttendance.tenantId, tenantId),
          eq(pgAttendance.userId, userId),
          sql`${pgAttendance.date} >= ${start.toISOString()} AND ${pgAttendance.date} <= ${end.toISOString()}`
        ))
        .limit(1);

      if (att) return this.mapAttendance(att);
    } catch (e) {
      console.error("[PostgresStorage] getAttendanceByUserAndDate error:", e);
    }
    return this.fallback.getAttendanceByUserAndDate(userId, date);
  }

  async listAttendanceByUser(userId: string): Promise<Attendance[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb
        .select()
        .from(pgAttendance)
        .where(
          and(
            eq(pgAttendance.tenantId, tenantId),
            eq(pgAttendance.userId, userId)
          )
        )
        .orderBy(desc(pgAttendance.date));
      return rows.map(r => this.mapAttendance(r));
    } catch (e) {
      console.error("[PostgresStorage] listAttendanceByUser error:", e);
      return this.fallback.listAttendanceByUser(userId);
    }
  }

  async listAttendanceByDate(date: Date): Promise<Attendance[]> {
    try {
      const tenantId = await this.getTenantId();
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);

      const rows = await pgDb
        .select()
        .from(pgAttendance)
        .where(
          and(
            eq(pgAttendance.tenantId, tenantId),
            sql`${pgAttendance.date} >= ${start.toISOString()} AND ${pgAttendance.date} <= ${end.toISOString()}`
          )
        )
        .orderBy(desc(pgAttendance.createdAt));

      return rows.map(r => this.mapAttendance(r));
    } catch (e) {
      console.error("[PostgresStorage] listAttendanceByDate error:", e);
      return this.fallback.listAttendanceByDate(date);
    }
  }

  async createAttendance(data: any): Promise<Attendance> {
    try {
      const tenantId = await this.getTenantId();
      const attDate = data.date instanceof Date ? data.date : new Date(data.date);
      const [row] = await pgDb.insert(pgAttendance).values({
        tenantId,
        userId: data.userId,
        userDepartment: data.userDepartment || null,
        date: attDate,
        checkInTime: data.checkInTime ? new Date(data.checkInTime) : null,
        checkOutTime: data.checkOutTime ? new Date(data.checkOutTime) : null,
        attendanceType: data.attendanceType || 'office',
        status: data.status || 'present',
        workingHours: String(data.workingHours || 0),
        overtimeHours: String(data.overtimeHours || 0),
        isLate: Boolean(data.isLate),
        lateMinutes: Number(data.lateMinutes) || 0,
        isWithinOfficeRadius: data.isWithinOfficeRadius ?? true,
        isWeeklyOff: Boolean(data.isWeeklyOff),
        isHoliday: Boolean(data.isHoliday),
        adminReviewStatus: data.adminReviewStatus || 'approved',
        remarks: data.remarks || null,
        otSessions: Array.isArray(data.otSessions) ? data.otSessions : []
      }).returning();

      try { await this.fallback.createAttendance(data); } catch (_) {}
      return this.mapAttendance(row);
    } catch (e) {
      console.error("[PostgresStorage] createAttendance error, fallback:", e);
      return this.fallback.createAttendance(data);
    }
  }

  async updateAttendance(id: string, data: any): Promise<Attendance> {
    try {
      const tenantId = await this.getTenantId();
      const updateValues: any = { updatedAt: new Date() };
      if (data.checkInTime !== undefined) updateValues.checkInTime = data.checkInTime ? new Date(data.checkInTime) : null;
      if (data.checkOutTime !== undefined) updateValues.checkOutTime = data.checkOutTime ? new Date(data.checkOutTime) : null;
      if (data.userDepartment !== undefined) updateValues.userDepartment = data.userDepartment;
      if (data.attendanceType !== undefined) updateValues.attendanceType = data.attendanceType;
      if (data.workingHours !== undefined) updateValues.workingHours = String(data.workingHours);
      if (data.overtimeHours !== undefined) updateValues.overtimeHours = String(data.overtimeHours);
      if (data.status !== undefined) updateValues.status = data.status;
      if (data.isLate !== undefined) updateValues.isLate = Boolean(data.isLate);
      if (data.lateMinutes !== undefined) updateValues.lateMinutes = Number(data.lateMinutes);
      if (data.autoCorrected !== undefined) updateValues.autoCorrected = data.autoCorrected;
      if (data.autoCorrectionReason !== undefined) updateValues.autoCorrectionReason = data.autoCorrectionReason;
      if (data.autoCorrectedAt !== undefined) updateValues.autoCorrectedAt = data.autoCorrectedAt ? new Date(data.autoCorrectedAt) : null;
      if (data.adminReviewStatus !== undefined) updateValues.adminReviewStatus = data.adminReviewStatus;
      if (data.remarks !== undefined) updateValues.remarks = data.remarks;
      if (data.otSessions !== undefined) updateValues.otSessions = Array.isArray(data.otSessions) ? data.otSessions : [];

      const [updated] = await pgDb
        .update(pgAttendance)
        .set(updateValues)
        .where(
          and(
            eq(pgAttendance.id, id),
            eq(pgAttendance.tenantId, tenantId)
          )
        )
        .returning();
      try { await this.fallback.updateAttendance(id, data); } catch (_) {}
      if (updated) return this.mapAttendance(updated);
    } catch (e) {
      console.error("[PostgresStorage] updateAttendance error:", e);
    }
    return this.fallback.updateAttendance(id, data);
  }

  async getUserAttendanceForDate(userId: string, date: string): Promise<Attendance | undefined> {
    return this.getAttendanceByUserAndDate(userId, new Date(date));
  }

  async listAttendance(filters: { userId?: string; startDate?: string; endDate?: string; status?: string; adminReviewStatus?: string } = {}): Promise<any[]> {
    try {
      const tenantId = await this.getTenantId();
      const conditions: any[] = [eq(pgAttendance.tenantId, tenantId)];
      if (filters.userId) conditions.push(eq(pgAttendance.userId, filters.userId));
      if (filters.startDate) conditions.push(gte(pgAttendance.date, new Date(filters.startDate)));
      if (filters.endDate) conditions.push(lte(pgAttendance.date, new Date(filters.endDate)));
      if (filters.status) conditions.push(eq(pgAttendance.status, filters.status));
      if (filters.adminReviewStatus) conditions.push(eq(pgAttendance.adminReviewStatus, filters.adminReviewStatus));

      const rows = await pgDb
        .select()
        .from(pgAttendance)
        .where(and(...conditions))
        .orderBy(desc(pgAttendance.date));

      return rows.map(r => this.mapAttendance(r));
    } catch (e) {
      console.error("[PostgresStorage] listAttendance error, delegating:", e);
      return (this.fallback as any).listAttendance ? (this.fallback as any).listAttendance(filters) : [];
    }
  }

  async listAttendanceBetweenDates(startDate: Date, endDate: Date): Promise<Attendance[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb
        .select()
        .from(pgAttendance)
        .where(
          and(
            eq(pgAttendance.tenantId, tenantId),
            gte(pgAttendance.date, startDate),
            lte(pgAttendance.date, endDate)
          )
        )
        .orderBy(desc(pgAttendance.date));
      return rows.map(r => this.mapAttendance(r));
    } catch (e) {
      console.error("[PostgresStorage] listAttendanceBetweenDates error:", e);
      return this.fallback.listAttendanceBetweenDates(startDate, endDate);
    }
  }

  async listAttendanceByUserBetweenDates(userId: string, startDate: Date, endDate: Date): Promise<Attendance[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb
        .select()
        .from(pgAttendance)
        .where(and(
          eq(pgAttendance.tenantId, tenantId),
          eq(pgAttendance.userId, userId),
          gte(pgAttendance.date, startDate),
          lte(pgAttendance.date, endDate)
        ))
        .orderBy(desc(pgAttendance.date));
      return rows.map(r => this.mapAttendance(r));
    } catch (e) {
      console.error("[PostgresStorage] listAttendanceByUserBetweenDates error:", e);
      return this.fallback.listAttendanceByUserBetweenDates(userId, startDate, endDate);
    }
  }

  async listAttendanceByDateRange(startDate: Date, endDate: Date): Promise<Attendance[]> {
    return this.listAttendanceBetweenDates(startDate, endDate);
  }

  async listAttendanceByReviewStatus(status: string): Promise<Attendance[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb
        .select()
        .from(pgAttendance)
        .where(
          and(
            eq(pgAttendance.tenantId, tenantId),
            eq(pgAttendance.adminReviewStatus, status)
          )
        )
        .orderBy(desc(pgAttendance.date));
      return rows.map(r => this.mapAttendance(r));
    } catch (e) {
      console.error("[PostgresStorage] listAttendanceByReviewStatus error:", e);
      return this.fallback.listAttendanceByReviewStatus(status);
    }
  }

  async listIncompleteAttendance(date: Date): Promise<Attendance[]> {
    try {
      const tenantId = await this.getTenantId();
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);

      const rows = await pgDb
        .select()
        .from(pgAttendance)
        .where(and(
          eq(pgAttendance.tenantId, tenantId),
          gte(pgAttendance.date, start),
          lte(pgAttendance.date, end),
          sql`${pgAttendance.checkInTime} IS NOT NULL AND ${pgAttendance.checkOutTime} IS NULL`
        ));
      return rows.map(r => this.mapAttendance(r));
    } catch (e) {
      console.error("[PostgresStorage] listIncompleteAttendance error:", e);
      return this.fallback.listIncompleteAttendance(date);
    }
  }

  async getApprovedLeaveForDate(userId: string, date: Date): Promise<LeaveApplication | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const checkDate = new Date(date);
      checkDate.setHours(0, 0, 0, 0);

      const rows = await pgDb
        .select()
        .from(pgLeaveApplications)
        .where(and(
          eq(pgLeaveApplications.tenantId, tenantId),
          eq(pgLeaveApplications.userId, userId),
          eq(pgLeaveApplications.status, "approved"),
          or(
            eq(pgLeaveApplications.leaveType, "casual_leave"),
            eq(pgLeaveApplications.leaveType, "unpaid_leave")
          )
        ));

      for (const row of rows) {
        const start = new Date(row.startDate as any);
        start.setHours(0, 0, 0, 0);
        const end = new Date(row.endDate as any);
        end.setHours(23, 59, 59, 999);
        if (checkDate >= start && checkDate <= end) {
          return {
            id: row.id,
            userId: row.userId,
            leaveType: row.leaveType,
            startDate: row.startDate,
            endDate: row.endDate,
            daysCount: Number(row.daysCount),
            reason: row.reason,
            status: row.status,
            rejectionReason: row.rejectionReason || undefined,
            appliedAt: row.appliedAt,
            reviewedAt: row.reviewedAt || undefined,
            reviewedBy: row.reviewedBy || undefined,
            managerApprovalStatus: row.managerApprovalStatus || undefined,
            hrApprovalStatus: row.hrApprovalStatus || undefined,
            managerRemarks: row.managerRemarks || undefined,
            hrRemarks: row.hrRemarks || undefined
          } as unknown as LeaveApplication;
        }
      }
      return undefined;
    } catch (e) {
      console.error("[PostgresStorage] getApprovedLeaveForDate error:", e);
      return (this.fallback as any).getApprovedLeaveForDate ? (this.fallback as any).getApprovedLeaveForDate(userId, date) : undefined;
    }
  }

  async addOTSessionTransaction(attendanceId: string, sessionData: any): Promise<void> {
    try {
      const tenantId = await this.getTenantId();
      const [att] = await pgDb
        .select()
        .from(pgAttendance)
        .where(and(eq(pgAttendance.id, attendanceId), eq(pgAttendance.tenantId, tenantId)))
        .limit(1);
      if (!att) {
        throw new Error("Attendance record not found");
      }

      const currentSessions = (att.otSessions as any[]) || [];
      const hasActive = currentSessions.some((s: any) => s.status === 'in_progress');
      if (hasActive) {
        throw new Error('ACTIVE_SESSION_EXISTS');
      }

      const updatedSessions = [...currentSessions, sessionData];
      const totalOTHours = updatedSessions.reduce((sum: number, s: any) => sum + (Number(s.otHours) || Number(s.duration) || 0), 0);

      await pgDb.update(pgAttendance)
        .set({
          otSessions: updatedSessions,
          overtimeHours: String(totalOTHours),
          updatedAt: new Date()
        })
        .where(and(eq(pgAttendance.id, attendanceId), eq(pgAttendance.tenantId, tenantId)));

      try {
        await pgDb.insert(pgOtSessions).values({
          tenantId,
          attendanceId,
          userId: sessionData.employeeId || sessionData.userId || att.userId,
          sessionNumber: sessionData.sessionNumber || updatedSessions.length,
          startTime: sessionData.startTime instanceof Date ? sessionData.startTime : new Date(sessionData.startTime || Date.now()),
          otHours: String(sessionData.otHours || 0),
          reason: sessionData.reason || null,
          status: 'PENDING_REVIEW'
        });
      } catch (otRelErr) {
        console.warn("[PostgresStorage] addOTSession relational insert non-fatal warning:", otRelErr);
      }
    } catch (e) {
      console.error("[PostgresStorage] addOTSessionTransaction error:", e);
      throw e;
    }
  }

  // ===================================================================
  // LEAVE BALANCES & APPLICATIONS
  // ===================================================================
  async getLeaveBalance(userId: string, month: number, year: number): Promise<LeaveBalance | undefined> {
    try {
      const tenantId = await this.getTenantId();

      // Resolve user identifiers (both postgres ID and firebase UID)
      const user = await this.getUser(userId);
      const userIdentifiers = [userId];
      if (user) {
        if (user.id && !userIdentifiers.includes(user.id)) userIdentifiers.push(user.id);
        if (user.uid && !userIdentifiers.includes(user.uid)) userIdentifiers.push(user.uid);
      }

      const [lb] = await pgDb
        .select()
        .from(pgLeaveBalances)
        .where(and(
          eq(pgLeaveBalances.tenantId, tenantId),
          inArray(pgLeaveBalances.userId, userIdentifiers),
          eq(pgLeaveBalances.year, year),
          eq(pgLeaveBalances.month, month)
        ))
        .limit(1);

      if (lb) {
        return ({
          id: lb.id,
          userId: lb.userId,
          employeeId: lb.userId,
          year: lb.year,
          month: lb.month,
          casualLeaveBalance: lb.casualLeaveBalance,
          casualLeaveUsed: lb.casualLeaveUsed,
          permissionHoursBalance: lb.permissionHoursBalance,
          permissionHoursUsed: lb.permissionHoursUsed
        } as unknown) as LeaveBalance;
      }
    } catch (e) {
      console.error("[PostgresStorage] getLeaveBalance error:", e);
    }
    return this.fallback.getLeaveBalance(userId, month, year);
  }

  async getCurrentLeaveBalance(userId: string): Promise<LeaveBalance | undefined> {
    const now = new Date();
    return this.getLeaveBalance(userId, now.getMonth() + 1, now.getFullYear());
  }

  async createLeaveBalance(data: any): Promise<LeaveBalance> {
    try {
      const tenantId = await this.getTenantId();
      const [lb] = await pgDb.insert(pgLeaveBalances).values({
        tenantId,
        userId: data.userId || data.employeeId,
        year: Number(data.year),
        month: Number(data.month),
        casualLeaveBalance: String(data.casualLeaveBalance ?? 1),
        casualLeaveUsed: String(data.casualLeaveUsed ?? 0),
        permissionHoursBalance: String(data.permissionHoursBalance ?? 2),
        permissionHoursUsed: String(data.permissionHoursUsed ?? 0)
      }).returning();

      try { await this.fallback.createLeaveBalance(data); } catch (_) {}
      return ({
        id: lb.id,
        userId: lb.userId,
        employeeId: lb.userId,
        year: lb.year,
        month: lb.month,
        casualLeaveBalance: lb.casualLeaveBalance,
        casualLeaveUsed: lb.casualLeaveUsed,
        permissionHoursBalance: lb.permissionHoursBalance,
        permissionHoursUsed: lb.permissionHoursUsed
      } as unknown) as LeaveBalance;
    } catch (e) {
      console.error("[PostgresStorage] createLeaveBalance error:", e);
      return this.fallback.createLeaveBalance(data);
    }
  }

  async updateLeaveBalance(id: string, data: any): Promise<LeaveBalance> {
    try {
      const tenantId = await this.getTenantId();
      const updateValues: any = { updatedAt: new Date() };
      if (data.casualLeaveBalance !== undefined) updateValues.casualLeaveBalance = String(data.casualLeaveBalance);
      if (data.casualLeaveUsed !== undefined) updateValues.casualLeaveUsed = String(data.casualLeaveUsed);
      if (data.permissionHoursBalance !== undefined) updateValues.permissionHoursBalance = String(data.permissionHoursBalance);
      if (data.permissionHoursUsed !== undefined) updateValues.permissionHoursUsed = String(data.permissionHoursUsed);

      const [lb] = await pgDb
        .update(pgLeaveBalances)
        .set(updateValues)
        .where(
          and(
            eq(pgLeaveBalances.id, id),
            eq(pgLeaveBalances.tenantId, tenantId)
          )
        )
        .returning();
      try { await this.fallback.updateLeaveBalance(id, data); } catch (_) {}
      if (lb) {
        return ({
          id: lb.id,
          userId: lb.userId,
          employeeId: lb.userId,
          year: lb.year,
          month: lb.month,
          casualLeaveBalance: lb.casualLeaveBalance,
          casualLeaveUsed: lb.casualLeaveUsed,
          permissionHoursBalance: lb.permissionHoursBalance,
          permissionHoursUsed: lb.permissionHoursUsed
        } as unknown) as LeaveBalance;
      }
    } catch (e) {
      console.error("[PostgresStorage] updateLeaveBalance error:", e);
    }
    return this.fallback.updateLeaveBalance(id, data);
  }

  async listLeaveBalancesByYear(year: number): Promise<LeaveBalance[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb
        .select()
        .from(pgLeaveBalances)
        .where(
          and(
            eq(pgLeaveBalances.tenantId, tenantId),
            eq(pgLeaveBalances.year, year)
          )
        );
      return rows.map(lb => ({
        id: lb.id,
        userId: lb.userId,
        employeeId: lb.userId,
        year: lb.year,
        month: lb.month,
        casualLeaveBalance: lb.casualLeaveBalance,
        casualLeaveUsed: lb.casualLeaveUsed,
        permissionHoursBalance: lb.permissionHoursBalance,
        permissionHoursUsed: lb.permissionHoursUsed
      } as unknown) as LeaveBalance);
    } catch (e) {
      console.error("[PostgresStorage] listLeaveBalancesByYear error:", e);
      return this.fallback.listLeaveBalancesByYear(year);
    }
  }

  async resetMonthlyLeaveBalances(month: number, year: number): Promise<void> {
    try {
      const tenantId = await this.getTenantId();
      const usersList = await this.listUsers();
      for (const u of usersList) {
        const existing = await this.getLeaveBalance(u.id, month, year);
        if (!existing) {
          await this.createLeaveBalance({
            tenantId,
            userId: u.id,
            employeeId: u.id,
            month,
            year,
            casualLeaveBalance: 1,
            casualLeaveUsed: 0,
            permissionHoursBalance: 2,
            permissionHoursUsed: 0
          });
        }
      }
    } catch (e) {
      console.error("[PostgresStorage] resetMonthlyLeaveBalances error:", e);
      return this.fallback.resetMonthlyLeaveBalances(month, year);
    }
  }

  private mapLeaveApp(app: any): LeaveApplication {
    return {
      id: app.id,
      userId: app.userId,
      employeeId: app.userId,
      leaveType: app.leaveType,
      startDate: app.startDate || undefined,
      endDate: app.endDate || undefined,
      totalDays: app.totalDays || undefined,
      permissionDate: app.permissionDate || undefined,
      permissionHours: app.permissionHours || undefined,
      reason: app.reason,
      status: app.status,
      approvedBy: app.approvedBy || undefined,
      applicationDate: app.createdAt,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt
    } as unknown as LeaveApplication;
  }

  async getLeaveApplication(id: string): Promise<LeaveApplication | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [app] = await pgDb
        .select()
        .from(pgLeaveApplications)
        .where(
          and(
            eq(pgLeaveApplications.id, id),
            eq(pgLeaveApplications.tenantId, tenantId)
          )
        )
        .limit(1);
      if (app) return this.mapLeaveApp(app);
    } catch (e) {
      console.error("[PostgresStorage] getLeaveApplication error:", e);
    }
    return this.fallback.getLeaveApplication(id);
  }

  async createLeaveApplication(data: any): Promise<LeaveApplication> {
    try {
      const tenantId = await this.getTenantId();
      const totalDaysVal = data.totalDays !== undefined && data.totalDays !== null ? String(data.totalDays) : null;
      const daysCountVal = data.daysCount !== undefined && data.daysCount !== null ? String(data.daysCount) : totalDaysVal;

      const [app] = await pgDb.insert(pgLeaveApplications).values({
        tenantId,
        userId: data.userId,
        leaveType: data.leaveType,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        totalDays: totalDaysVal as any,
        daysCount: daysCountVal as any,
        permissionDate: data.permissionDate ? new Date(data.permissionDate) : null,
        permissionHours: data.permissionHours ? Number(data.permissionHours) : null,
        reason: data.reason,
        status: data.status || "pending_manager"
      }).returning();

      // Safely enrich fallback payload to satisfy strict Firestore Zod schemas
      let fallbackData = data;
      if (!data.employeeId || !data.userName || !data.userDepartment) {
        const user = await this.getUser(data.userId);
        fallbackData = {
          ...data,
          employeeId: data.employeeId || user?.employeeId || data.userId,
          userName: data.userName || user?.displayName || "Employee",
          userDepartment: data.userDepartment || user?.department || "operations",
          userDesignation: data.userDesignation || user?.designation || "technician",
          reportingManagerId: data.reportingManagerId || user?.reportingManagerId || data.userId
        };
      }
      try { await this.fallback.createLeaveApplication(fallbackData); } catch (_) {}
      return this.mapLeaveApp(app);
    } catch (e) {
      console.error("[PostgresStorage] createLeaveApplication error:", e);
      return this.fallback.createLeaveApplication(data);
    }
  }

  async updateLeaveApplication(id: string, data: any): Promise<LeaveApplication> {
    try {
      const tenantId = await this.getTenantId();
      const updateValues: any = { updatedAt: new Date() };
      if (data.status !== undefined) updateValues.status = data.status;
      if (data.approvedBy !== undefined) updateValues.approvedBy = data.approvedBy;

      const [updated] = await pgDb
        .update(pgLeaveApplications)
        .set(updateValues)
        .where(
          and(
            eq(pgLeaveApplications.id, id),
            eq(pgLeaveApplications.tenantId, tenantId)
          )
        )
        .returning();
      try { await this.fallback.updateLeaveApplication(id, data); } catch (_) {}
      if (updated) return this.mapLeaveApp(updated);
    } catch (e) {
      console.error("[PostgresStorage] updateLeaveApplication error:", e);
    }
    return this.fallback.updateLeaveApplication(id, data);
  }

  async listLeaveApplicationsByUser(userId: string): Promise<LeaveApplication[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb
        .select()
        .from(pgLeaveApplications)
        .where(
          and(
            eq(pgLeaveApplications.tenantId, tenantId),
            eq(pgLeaveApplications.userId, userId)
          )
        )
        .orderBy(desc(pgLeaveApplications.createdAt));
      return rows.map(r => this.mapLeaveApp(r));
    } catch (e) {
      console.error("[PostgresStorage] listLeaveApplicationsByUser error:", e);
      return this.fallback.listLeaveApplicationsByUser(userId);
    }
  }

  async listLeaveApplicationsByManager(managerId: string, status?: string): Promise<LeaveApplication[]> {
    try {
      const tenantId = await this.getTenantId();
      // Find all reportees belonging to this tenant
      const managerUser = await this.getUser(managerId);
      const managerIdentifiers = [managerId];
      if (managerUser?.id && !managerIdentifiers.includes(managerUser.id)) managerIdentifiers.push(managerUser.id);
      if ((managerUser as any)?.firebaseUid && !managerIdentifiers.includes((managerUser as any).firebaseUid)) managerIdentifiers.push((managerUser as any).firebaseUid);
      if ((managerUser as any)?.employeeId && !managerIdentifiers.includes((managerUser as any).employeeId)) managerIdentifiers.push((managerUser as any).employeeId);

      const teamUsers = await pgDb
        .select({ id: pgUsers.id })
        .from(pgUsers)
        .where(
          and(
            eq(pgUsers.tenantId, tenantId),
            inArray(pgUsers.reportingManagerId, managerIdentifiers)
          )
        );

      const teamUserIds = teamUsers.map(u => u.id);
      if (teamUserIds.length === 0) return [];

      const conditions: any[] = [
        eq(pgLeaveApplications.tenantId, tenantId),
        inArray(pgLeaveApplications.userId, teamUserIds)
      ];
      if (status) conditions.push(eq(pgLeaveApplications.status, status));

      const rows = await pgDb
        .select()
        .from(pgLeaveApplications)
        .where(and(...conditions))
        .orderBy(desc(pgLeaveApplications.createdAt));

      return rows.map(r => this.mapLeaveApp(r));
    } catch (e) {
      console.error("[PostgresStorage] listLeaveApplicationsByManager error:", e);
      return this.fallback.listLeaveApplicationsByManager(managerId, status);
    }
  }

  async listLeaveApplicationsByHR(status?: string): Promise<LeaveApplication[]> {
    try {
      const tenantId = await this.getTenantId();
      const conditions: any[] = [eq(pgLeaveApplications.tenantId, tenantId)];
      if (status) conditions.push(eq(pgLeaveApplications.status, status));

      const rows = await pgDb
        .select()
        .from(pgLeaveApplications)
        .where(and(...conditions))
        .orderBy(desc(pgLeaveApplications.createdAt));

      return rows.map(r => this.mapLeaveApp(r));
    } catch (e) {
      console.error("[PostgresStorage] listLeaveApplicationsByHR error:", e);
      return this.fallback.listLeaveApplicationsByHR(status);
    }
  }

  async listAllLeaveApplications(filters?: any): Promise<LeaveApplication[]> {
    try {
      const tenantId = await this.getTenantId();
      const conditions: any[] = [eq(pgLeaveApplications.tenantId, tenantId)];

      if (filters?.userId) conditions.push(eq(pgLeaveApplications.userId, filters.userId));
      if (filters?.status && filters.status !== 'all') conditions.push(eq(pgLeaveApplications.status, filters.status));
      if (filters?.leaveType && filters.leaveType !== 'all') conditions.push(eq(pgLeaveApplications.leaveType, filters.leaveType));

      const rows = await pgDb
        .select()
        .from(pgLeaveApplications)
        .where(and(...conditions))
        .orderBy(desc(pgLeaveApplications.createdAt));

      return rows.map(r => this.mapLeaveApp(r));
    } catch (e) {
      console.error("[PostgresStorage] listAllLeaveApplications error:", e);
      return this.fallback.listAllLeaveApplications(filters);
    }
  }

  async approveLeaveByManager(leaveId: string, managerId: string, remarks?: string): Promise<LeaveApplication> {
    try {
      const tenantId = await this.getTenantId();
      const [updated] = await pgDb
        .update(pgLeaveApplications)
        .set({ status: "pending_hr", approvedBy: managerId, updatedAt: new Date() })
        .where(
          and(
            eq(pgLeaveApplications.id, leaveId),
            eq(pgLeaveApplications.tenantId, tenantId)
          )
        )
        .returning();
      try { await this.fallback.approveLeaveByManager(leaveId, managerId, remarks); } catch (_) {}
      if (updated) return this.mapLeaveApp(updated);
    } catch (e) {
      console.error("[PostgresStorage] approveLeaveByManager error:", e);
    }
    return this.fallback.approveLeaveByManager(leaveId, managerId, remarks);
  }

  async approveLeaveByHR(leaveId: string, hrId: string, remarks?: string): Promise<LeaveApplication> {
    try {
      const tenantId = await this.getTenantId();
      const updated = await pgDb.transaction(async (tx) => {
        // 1. Fetch leave application
        const [leave] = await tx
          .select()
          .from(pgLeaveApplications)
          .where(
            and(
              eq(pgLeaveApplications.id, leaveId),
              eq(pgLeaveApplications.tenantId, tenantId)
            )
          )
          .limit(1);

        if (!leave) throw new Error("Leave application not found");

        // 2. Mark approved
        const [app] = await tx
          .update(pgLeaveApplications)
          .set({
            status: "approved",
            approvedBy: hrId,
            hrApprovalStatus: "approved",
            hrRemarks: remarks || null,
            reviewedAt: new Date(),
            reviewedBy: hrId,
            updatedAt: new Date()
          })
          .where(
            and(
              eq(pgLeaveApplications.id, leaveId),
              eq(pgLeaveApplications.tenantId, tenantId)
            )
          )
          .returning();

        // 3. Atomically update leave balance
        const targetDate = new Date(leave.startDate || leave.permissionDate || leave.appliedAt || new Date());
        const year = targetDate.getFullYear();
        const month = targetDate.getMonth() + 1;

        if (leave.leaveType === "casual_leave") {
          const daysToDeduct = Number(leave.totalDays || leave.daysCount || 1);
          const [balance] = await tx
            .select()
            .from(pgLeaveBalances)
            .where(
              and(
                eq(pgLeaveBalances.tenantId, tenantId),
                eq(pgLeaveBalances.userId, leave.userId),
                eq(pgLeaveBalances.year, year),
                eq(pgLeaveBalances.month, month)
              )
            )
            .limit(1);

          if (balance) {
            await tx
              .update(pgLeaveBalances)
              .set({
                casualLeaveUsed: sql`${pgLeaveBalances.casualLeaveUsed} + ${daysToDeduct}`,
                updatedAt: new Date()
              })
              .where(eq(pgLeaveBalances.id, balance.id));
          } else {
            await tx.insert(pgLeaveBalances).values({
              tenantId,
              userId: leave.userId,
              year,
              month,
              casualLeaveBalance: "1.00",
              casualLeaveUsed: String(daysToDeduct),
              permissionHoursBalance: "2.00",
              permissionHoursUsed: "0.00"
            });
          }
        } else if (leave.leaveType === "permission") {
          const hoursToDeduct = Number(leave.permissionHours || 2);
          const [balance] = await tx
            .select()
            .from(pgLeaveBalances)
            .where(
              and(
                eq(pgLeaveBalances.tenantId, tenantId),
                eq(pgLeaveBalances.userId, leave.userId),
                eq(pgLeaveBalances.year, year),
                eq(pgLeaveBalances.month, month)
              )
            )
            .limit(1);

          if (balance) {
            await tx
              .update(pgLeaveBalances)
              .set({
                permissionHoursUsed: sql`${pgLeaveBalances.permissionHoursUsed} + ${hoursToDeduct}`,
                updatedAt: new Date()
              })
              .where(eq(pgLeaveBalances.id, balance.id));
          } else {
            const tenantId = leave.tenantId || (await this.getTenantId());
            await tx.insert(pgLeaveBalances).values({
              tenantId,
              userId: leave.userId,
              year,
              month,
              casualLeaveBalance: "1.00",
              casualLeaveUsed: "0.00",
              permissionHoursBalance: "2.00",
              permissionHoursUsed: String(hoursToDeduct)
            });
          }
        }

        return app;
      });

      try { await this.fallback.approveLeaveByHR(leaveId, hrId, remarks); } catch (_) {}
      if (updated) return this.mapLeaveApp(updated);
    } catch (e) {
      console.error("[PostgresStorage] approveLeaveByHR error:", e);
    }
    return this.fallback.approveLeaveByHR(leaveId, hrId, remarks);
  }

  async rejectLeave(leaveId: string, rejectedBy: string, reason: string, rejectedByRole: 'manager' | 'hr'): Promise<LeaveApplication> {
    try {
      const tenantId = await this.getTenantId();
      const [updated] = await pgDb
        .update(pgLeaveApplications)
        .set({ status: "rejected", approvedBy: rejectedBy, rejectionReason: reason, updatedAt: new Date() })
        .where(
          and(
            eq(pgLeaveApplications.id, leaveId),
            eq(pgLeaveApplications.tenantId, tenantId)
          )
        )
        .returning();
      try { await this.fallback.rejectLeave(leaveId, rejectedBy, reason, rejectedByRole); } catch (_) {}
      if (updated) return this.mapLeaveApp(updated);
    } catch (e) {
      console.error("[PostgresStorage] rejectLeave error:", e);
    }
    return this.fallback.rejectLeave(leaveId, rejectedBy, reason, rejectedByRole);
  }

  async cancelLeaveApplication(leaveId: string, userId: string): Promise<LeaveApplication> {
    try {
      const tenantId = await this.getTenantId();
      const updated = await pgDb.transaction(async (tx) => {
        const [leave] = await tx
          .select()
          .from(pgLeaveApplications)
          .where(
            and(
              eq(pgLeaveApplications.id, leaveId),
              eq(pgLeaveApplications.tenantId, tenantId)
            )
          )
          .limit(1);

        if (!leave) throw new Error("Leave application not found");
        const wasApproved = leave.status === "approved";

        const [app] = await tx
          .update(pgLeaveApplications)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(
            and(
              eq(pgLeaveApplications.id, leaveId),
              eq(pgLeaveApplications.tenantId, tenantId)
            )
          )
          .returning();

        // If it was already approved, restore the deducted leave balance
        if (wasApproved) {
          const targetDate = new Date(leave.startDate || leave.permissionDate || leave.appliedAt || new Date());
          const year = targetDate.getFullYear();
          const month = targetDate.getMonth() + 1;

          if (leave.leaveType === "casual_leave") {
            const daysToRestore = Number(leave.totalDays || leave.daysCount || 1);
            await tx
              .update(pgLeaveBalances)
              .set({
                casualLeaveUsed: sql`GREATEST(0, ${pgLeaveBalances.casualLeaveUsed} - ${daysToRestore})`,
                updatedAt: new Date()
              })
              .where(
                and(
                  eq(pgLeaveBalances.tenantId, tenantId),
                  eq(pgLeaveBalances.userId, leave.userId),
                  eq(pgLeaveBalances.year, year),
                  eq(pgLeaveBalances.month, month)
                )
              );
          } else if (leave.leaveType === "permission") {
            const hoursToRestore = Number(leave.permissionHours || 2);
            await tx
              .update(pgLeaveBalances)
              .set({
                permissionHoursUsed: sql`GREATEST(0, ${pgLeaveBalances.permissionHoursUsed} - ${hoursToRestore})`,
                updatedAt: new Date()
              })
              .where(
                and(
                  eq(pgLeaveBalances.tenantId, tenantId),
                  eq(pgLeaveBalances.userId, leave.userId),
                  eq(pgLeaveBalances.year, year),
                  eq(pgLeaveBalances.month, month)
                )
              );
          }
        }

        return app;
      });

      try { await this.fallback.cancelLeaveApplication(leaveId, userId); } catch (_) {}
      if (updated) return this.mapLeaveApp(updated);
    } catch (e) {
      console.error("[PostgresStorage] cancelLeaveApplication error:", e);
    }
    return this.fallback.cancelLeaveApplication(leaveId, userId);
  }

async getLeave(id: string): Promise<any | undefined> {
    const app = await this.getLeaveApplication(id);
    if (!app) return undefined;
    return {
      id: app.id,
      userId: app.userId,
      leaveType: app.leaveType,
      startDate: app.startDate,
      endDate: app.endDate,
      reason: app.reason,
      status: app.status,
      createdAt: app.createdAt
    };
  }

  async listLeavesByUser(userId: string): Promise<any[]> {
    const apps = await this.listLeaveApplicationsByUser(userId);
    return apps.map(app => ({
      id: app.id,
      userId: app.userId,
      leaveType: app.leaveType,
      startDate: app.startDate,
      endDate: app.endDate,
      reason: app.reason,
      status: app.status,
      createdAt: app.createdAt
    }));
  }

  async listPendingLeaves(): Promise<any[]> {
    const apps = await this.listAllLeaveApplications();
    return apps.filter(app => (app.status || '').includes('pending')).map(app => ({
      id: app.id,
      userId: app.userId,
      leaveType: app.leaveType,
      startDate: app.startDate,
      endDate: app.endDate,
      reason: app.reason,
      status: app.status,
      createdAt: app.createdAt
    }));
  }

  async createLeave(data: any): Promise<any> {
    const app = await this.createLeaveApplication({
      userId: data.userId,
      leaveType: data.leaveType || 'casual_leave',
      startDate: data.startDate,
      endDate: data.endDate,
      reason: data.reason || '',
      status: data.status || 'pending_manager'
    });
    return {
      id: app.id,
      userId: app.userId,
      leaveType: app.leaveType,
      startDate: app.startDate,
      endDate: app.endDate,
      reason: app.reason,
      status: app.status,
      createdAt: app.createdAt
    };
  }

  async updateLeave(id: string, data: any): Promise<any> {
    const app = await this.updateLeaveApplication(id, data);
    return {
      id: app.id,
      userId: app.userId,
      leaveType: app.leaveType,
      startDate: app.startDate,
      endDate: app.endDate,
      reason: app.reason,
      status: app.status,
      createdAt: app.createdAt
    };
  }

  // ===================================================================
  // SALARY STRUCTURES, ADVANCES & PAYROLL
  // ===================================================================
  async getSalaryStructureByUser(userId: string): Promise<SalaryStructure | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [s] = await pgDb
        .select()
        .from(pgSalaryStructures)
        .where(
          and(
            eq(pgSalaryStructures.tenantId, tenantId),
            eq(pgSalaryStructures.userId, userId)
          )
        )
        .orderBy(desc(pgSalaryStructures.effectiveFrom))
        .limit(1);

      if (s) {
        return {
          id: s.id,
          userId: s.userId,
          employeeId: s.userId,
          baseSalary: Number(s.baseSalary),
          basicSalary: Number(s.baseSalary),
          fixedSalary: Number(s.monthlyGross || s.baseSalary),
          hra: Number(s.hra || 0),
          specialAllowance: Number(s.specialAllowance || 0),
          conveyance: Number(s.conveyance || 0),
          medicalAllowance: Number(s.medicalAllowance || 0),
          pfEmployee: Number(s.pfEmployee || 0),
          pfEmployer: Number(s.pfEmployer || 0),
          esiEmployee: Number(s.esiEmployee || 0),
          esiEmployer: Number(s.esiEmployer || 0),
          professionalTax: Number(s.professionalTax || 200),
          monthlyGross: Number(s.monthlyGross || s.baseSalary),
          monthlyNet: Number(s.monthlyNet || s.baseSalary),
          grossSalary: Number(s.monthlyGross || s.baseSalary),
          allowances: Number(s.specialAllowance || 0) + Number(s.conveyance || 0) + Number(s.medicalAllowance || 0),
          effectiveFrom: s.effectiveFrom,
          effectiveTo: s.effectiveTo || null,
          isActive: s.isActive ?? true,
          createdBy: "system",
          createdAt: s.createdAt,
          updatedAt: s.updatedAt
        } as any;
      }
      return undefined;
    } catch (e) {
      console.error("[PostgresStorage] getSalaryStructureByUser error:", e);
      return undefined;
    }
  }

  private mapSalaryAdvance(adv: any): SalaryAdvance {
    const amount = Number(adv.amount || adv.requestAmount || 0);
    const repaidAmount = Number(adv.repaidAmount || 0);
    const remainingAmount = adv.remainingBalance !== null && adv.remainingBalance !== undefined
      ? Number(adv.remainingBalance)
      : Math.max(0, amount - repaidAmount);
    const monthlyDeduction = Number(adv.monthlyDeduction || adv.monthlyEmiAmount || 0);
    const numberOfInstallments = Number(adv.emiCount) || (monthlyDeduction > 0 ? Math.ceil(amount / monthlyDeduction) : 1);

    return {
      id: adv.id,
      userId: adv.userId,
      employeeId: adv.userId,
      amount,
      reason: adv.reason || "General advance",
      requestDate: adv.createdAt || new Date(),
      approvedDate: adv.approvalDate || undefined,
      deductionStartMonth: Number(adv.deductionStartMonth) || 1,
      deductionStartYear: Number(adv.deductionStartYear) || new Date().getFullYear(),
      numberOfInstallments,
      monthlyDeduction,
      remainingAmount,
      remainingBalance: remainingAmount,
      monthlyEmiAmount: monthlyDeduction,
      emiCount: numberOfInstallments,
      status: adv.status as any,
      approvedBy: adv.approvedBy || undefined,
      remarks: adv.remarks || undefined,
      createdAt: adv.createdAt || new Date(),
      updatedAt: adv.updatedAt || new Date()
    } as any;
  }

  async createSalaryAdvance(data: any): Promise<SalaryAdvance> {
    try {
      const tenantId = await this.getTenantId();
      const now = new Date();
      const amountVal = String(data.amount || data.requestAmount || 0);
      const monthlyDeduct = String(data.monthlyDeduction || data.monthlyEmiAmount || 0);
      const emiCount = Number(data.numberOfInstallments || data.emiCount) || 
        (Number(monthlyDeduct) > 0 ? Math.ceil(Number(amountVal) / Number(monthlyDeduct)) : 1);
      const startMonth = Number(data.deductionStartMonth) || (now.getMonth() + 1);
      const startYear = Number(data.deductionStartYear) || now.getFullYear();

      const [adv] = await pgDb.insert(pgSalaryAdvances).values({
        tenantId,
        userId: data.userId,
        amount: amountVal,
        requestAmount: amountVal,
        monthlyDeduction: monthlyDeduct,
        monthlyEmiAmount: monthlyDeduct,
        emiCount,
        repaidAmount: "0",
        remainingBalance: amountVal,
        deductionStartMonth: startMonth,
        deductionStartYear: startYear,
        reason: data.reason || "General advance",
        status: data.status || "pending"
      }).returning();

      try { await this.fallback.createSalaryAdvance(data); } catch (_) {}
      return this.mapSalaryAdvance(adv);
    } catch (e) {
      console.error("[PostgresStorage] createSalaryAdvance error:", e);
      return this.fallback.createSalaryAdvance(data);
    }
  }

  async updateSalaryAdvance(id: string, data: any): Promise<SalaryAdvance> {
    try {
      const tenantId = await this.getTenantId();
      const updateValues: any = { updatedAt: new Date() };
      if (data.repaidAmount !== undefined) updateValues.repaidAmount = String(data.repaidAmount);
      if (data.remainingAmount !== undefined) updateValues.remainingBalance = String(data.remainingAmount);
      if (data.remainingBalance !== undefined) updateValues.remainingBalance = String(data.remainingBalance);
      if (data.status !== undefined) updateValues.status = data.status;
      if (data.approvedBy !== undefined) updateValues.approvedBy = data.approvedBy;
      if (data.approvalDate !== undefined) updateValues.approvalDate = data.approvalDate ? new Date(data.approvalDate) : null;

      const [adv] = await pgDb
        .update(pgSalaryAdvances)
        .set(updateValues)
        .where(
          and(
            eq(pgSalaryAdvances.id, id),
            eq(pgSalaryAdvances.tenantId, tenantId)
          )
        )
        .returning();
      try { await this.fallback.updateSalaryAdvance(id, data); } catch (_) {}
      if (adv) return this.mapSalaryAdvance(adv);
    } catch (e) {
      console.error("[PostgresStorage] updateSalaryAdvance error:", e);
    }
    return this.fallback.updateSalaryAdvance(id, data);
  }

  async getSalaryAdvance(id: string): Promise<SalaryAdvance | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [adv] = await pgDb
        .select()
        .from(pgSalaryAdvances)
        .where(
          and(
            eq(pgSalaryAdvances.id, id),
            eq(pgSalaryAdvances.tenantId, tenantId)
          )
        )
        .limit(1);
      if (adv) return this.mapSalaryAdvance(adv);
    } catch (e) {
      console.error("[PostgresStorage] getSalaryAdvance error:", e);
    }
    return this.fallback.getSalaryAdvance(id);
  }

  async listSalaryAdvances(filters?: any): Promise<SalaryAdvance[]> {
    try {
      const tenantId = await this.getTenantId();
      const conditions: any[] = [eq(pgSalaryAdvances.tenantId, tenantId)];
      if (filters?.userId) conditions.push(eq(pgSalaryAdvances.userId, filters.userId));
      if (filters?.status) conditions.push(eq(pgSalaryAdvances.status, filters.status));

      const rows = await pgDb
        .select()
        .from(pgSalaryAdvances)
        .where(and(...conditions))
        .orderBy(desc(pgSalaryAdvances.createdAt));

      return rows.map(adv => this.mapSalaryAdvance(adv));
    } catch (e) {
      console.error("[PostgresStorage] listSalaryAdvances error:", e);
      return this.fallback.listSalaryAdvances(filters);
    }
  }

  private mapPayroll(p: any): Payroll {
    return ({
      id: p.id,
      userId: p.userId,
      employeeId: p.employeeId || p.userId,
      month: p.month,
      year: p.year,
      workingDays: p.totalWorkingDays ?? p.workingDays ?? 0,
      presentDays: Number(p.daysWorked ?? p.presentDays ?? 0),
      paidLeaveDays: Number(p.paidLeaveDays ?? 0),
      absentDays: Number(p.absentDays ?? 0),
      overtimeHours: Number(p.overtimeHours ?? 0),
      fixedSalary: Number(p.fixedSalary ?? 0),
      earnedBasic: Number(p.earnedBasic ?? 0),
      earnedHRA: Number(p.earnedHRA ?? 0),
      earnedConveyance: Number(p.earnedConveyance ?? 0),
      overtimePay: Number(p.overtimePay ?? 0),
      grossSalary: Number(p.grossSalary ?? 0),
      epfDeduction: Number(p.pfDeduction ?? p.epfDeduction ?? 0),
      esiDeduction: Number(p.esiDeduction ?? 0),
      tdsDeduction: Number(p.tdsDeduction ?? 0),
      advanceDeduction: Number(p.advanceDeduction ?? 0),
      totalDeductions: Number(p.totalDeductions ?? 0),
      netSalary: Number(p.netSalary ?? 0),
      status: p.status,
      processedBy: p.processedBy || undefined,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    } as unknown) as Payroll;
  }

  async getPayroll(id: string): Promise<Payroll | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [p] = await pgDb
        .select()
        .from(pgPayrolls)
        .where(
          and(
            eq(pgPayrolls.id, id),
            eq(pgPayrolls.tenantId, tenantId)
          )
        )
        .limit(1);
      if (p) return this.mapPayroll(p);
    } catch (e) {
      console.error("[PostgresStorage] getPayroll error:", e);
    }
    return this.fallback.getPayroll(id);
  }

  async getPayrollByUserAndMonth(userId: string, month: number, year: number): Promise<Payroll | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [p] = await pgDb
        .select()
        .from(pgPayrolls)
        .where(
          and(
            eq(pgPayrolls.tenantId, tenantId),
            eq(pgPayrolls.userId, userId),
            eq(pgPayrolls.month, month),
            eq(pgPayrolls.year, year)
          )
        )
        .limit(1);
      if (p) return this.mapPayroll(p);
    } catch (e) {
      console.error("[PostgresStorage] getPayrollByUserAndMonth error:", e);
    }
    return this.fallback.getPayrollByUserAndMonth(userId, month, year);
  }

  async createPayroll(data: any): Promise<Payroll> {
    try {
      const tenantId = await this.getTenantId();
      const [p] = await pgDb.insert(pgPayrolls).values({
        tenantId,
        userId: data.userId,
        month: data.month,
        year: data.year,
        totalWorkingDays: data.totalWorkingDays ?? data.workingDays ?? 26,
        daysWorked: String(data.daysWorked ?? data.presentDays ?? 0),
        overtimeHours: String(data.overtimeHours || 0),
        overtimePay: String(data.overtimePay || 0),
        grossSalary: String(data.grossSalary || 0),
        netSalary: String(data.netSalary || 0),
        pfDeduction: String(data.pfDeduction ?? data.epfDeduction ?? 0),
        esiDeduction: String(data.esiDeduction || 0),
        ptDeduction: String(data.ptDeduction || 0),
        advanceDeduction: String(data.advanceDeduction || 0),
        totalDeductions: String(data.totalDeductions || 0),
        status: data.status || "draft",
        paymentDate: data.paymentDate ? new Date(data.paymentDate) : null,
        paymentReference: data.paymentReference || null,
        payslipUrl: data.payslipUrl || null
      }).returning();

      try { await this.fallback.createPayroll(data); } catch (_) {}
      return this.mapPayroll(p);
    } catch (e) {
      console.error("[PostgresStorage] createPayroll error:", e);
      return this.fallback.createPayroll(data);
    }
  }

  async updatePayroll(id: string, data: any): Promise<Payroll> {
    try {
      const tenantId = await this.getTenantId();
      const updateValues: any = { updatedAt: new Date() };
      if (data.status !== undefined) updateValues.status = data.status;
      if (data.paymentDate !== undefined) updateValues.paymentDate = data.paymentDate ? new Date(data.paymentDate) : null;
      if (data.paymentReference !== undefined) updateValues.paymentReference = data.paymentReference;
      if (data.payslipUrl !== undefined) updateValues.payslipUrl = data.payslipUrl;

      const [p] = await pgDb
        .update(pgPayrolls)
        .set(updateValues)
        .where(
          and(
            eq(pgPayrolls.id, id),
            eq(pgPayrolls.tenantId, tenantId)
          )
        )
        .returning();
      try { await this.fallback.updatePayroll(id, data); } catch (_) {}
      if (p) return this.mapPayroll(p);
    } catch (e) {
      console.error("[PostgresStorage] updatePayroll error:", e);
    }
    return this.fallback.updatePayroll(id, data);
  }

  async listPayrolls(filters?: any): Promise<Payroll[]> {
    try {
      const tenantId = await this.getTenantId();
      const conditions: any[] = [eq(pgPayrolls.tenantId, tenantId)];
      if (filters?.userId) conditions.push(eq(pgPayrolls.userId, filters.userId));
      if (filters?.month !== undefined) conditions.push(eq(pgPayrolls.month, Number(filters.month)));
      if (filters?.year !== undefined) conditions.push(eq(pgPayrolls.year, Number(filters.year)));
      if (filters?.status) conditions.push(eq(pgPayrolls.status, filters.status));

      const rows = await pgDb
        .select()
        .from(pgPayrolls)
        .where(and(...conditions))
        .orderBy(desc(pgPayrolls.createdAt));
      return rows.map(r => this.mapPayroll(r));
    } catch (e) {
      console.error("[PostgresStorage] listPayrolls error:", e);
      return this.fallback.listPayrolls(filters);
    }
  }

  async listPayrollsByUser(userId: string): Promise<Payroll[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb
        .select()
        .from(pgPayrolls)
        .where(
          and(
            eq(pgPayrolls.tenantId, tenantId),
            eq(pgPayrolls.userId, userId)
          )
        )
        .orderBy(desc(pgPayrolls.createdAt));
      return rows.map(r => this.mapPayroll(r));
    } catch (e) {
      console.error("[PostgresStorage] listPayrollsByUser error:", e);
      return this.fallback.listPayrollsByUser(userId);
    }
  }

  async getEnhancedPayroll(id: string): Promise<any | undefined> {
    return this.getPayroll(id);
  }

  async getEnhancedPayrollByUserAndMonth(userId: string, month: number, year: number): Promise<any | undefined> {
    return this.getPayrollByUserAndMonth(userId, month, year);
  }

  async createEnhancedPayroll(data: any): Promise<any> {
    return this.createPayroll(data);
  }

  async updateEnhancedPayroll(id: string, data: any): Promise<any> {
    return this.updatePayroll(id, data);
  }

  async listEnhancedPayrolls(filters?: any): Promise<any[]> {
    return this.listPayrolls(filters);
  }

  async listEnhancedPayrollsByUser(userId: string): Promise<any[]> {
    return this.listPayrollsByUser(userId);
  }

  async getEnhancedSalaryStructure(id: string): Promise<any | undefined> {
    return this.getSalaryStructure(id);
  }

  async getEnhancedSalaryStructureByUser(userId: string): Promise<any | undefined> {
    return this.getSalaryStructureByUser(userId);
  }

  async createEnhancedSalaryStructure(data: any): Promise<any> {
    return this.createSalaryStructure(data);
  }

  async updateEnhancedSalaryStructure(id: string, data: any): Promise<any> {
    return this.updateSalaryStructure(id, data);
  }

  async listEnhancedSalaryStructures(): Promise<any[]> {
    return this.listSalaryStructures();
  }

  async getEnhancedPayrollSettings(): Promise<any | undefined> {
    return this.getPayrollSettings();
  }

  async updateEnhancedPayrollSettings(data: any): Promise<any> {
    return this.updatePayrollSettings(data);
  }

  async getMonthlyAttendanceSummary(userId: string, month: number, year: number): Promise<{
    workingDays: number;
    presentDays: number;
    absentDays: number;
    overtimeHours: number;
    leaveDays: number;
  }> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const attendanceRecords = await this.listAttendance({
      userId,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    });

    let workingDays = 0;
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        workingDays++;
      }
    }

    const validRecords = attendanceRecords.filter(r => r.adminReviewStatus !== 'rejected');

    let presentDays = 0;
    validRecords.forEach(r => {
      if (r.status === 'half_day') {
        presentDays += 0.5;
      } else if (['present', 'late', 'overtime', 'early_checkout'].includes(r.status)) {
        presentDays += 1.0;
      } else if (r.checkInTime && r.checkOutTime && (Number(r.workingHours) || 0) >= 7) {
        presentDays += 1.0;
      } else if (r.checkInTime && r.checkOutTime && (Number(r.workingHours) || 0) >= 4) {
        presentDays += 0.5;
      }
    });

    const absentDays = Math.max(0, workingDays - Math.floor(presentDays));
    const overtimeHours = validRecords.reduce((total, r) => total + (Number(r.overtimeHours) || 0), 0);
    const leaveDays = validRecords.filter(r => r.status === 'leave').length;

    return {
      workingDays,
      presentDays,
      absentDays,
      overtimeHours,
      leaveDays
    };
  }

  async calculatePayroll(userId: string, month: number, year: number): Promise<any> {
    const salaryStructure = await this.getSalaryStructureByUser(userId);
    if (!salaryStructure) {
      throw new Error('No salary structure found for user');
    }

    const attendanceSummary = await this.getMonthlyAttendanceSummary(userId, month, year);
    const settings = await this.getPayrollSettings();
    const defaultSettings = {
      pfRate: 12,
      esiRate: 1.75,
      tdsRate: 10,
      standardWorkingHours: 8,
      standardWorkingDays: 26,
      leaveDeductionRate: 1,
      pfApplicableFromSalary: 15000,
      esiApplicableFromSalary: 21000,
      autoCheckoutGraceMinutes: 5,
    };
    const payrollSettings = settings || defaultSettings;

    const { presentDays, overtimeHours } = attendanceSummary;

    const basicSalary = Number((salaryStructure as any).basicSalary ?? (salaryStructure as any).baseSalary ?? 0);
    const hra = Number(salaryStructure.hra) || 0;
    const allowances = Number((salaryStructure as any).allowances ?? (salaryStructure as any).specialAllowance ?? 0)
      + Number((salaryStructure as any).conveyance || 0)
      + Number((salaryStructure as any).medicalAllowance || 0);

    const standardDays = payrollSettings.standardWorkingDays || 26;
    const dailySalary = (basicSalary + hra + allowances) / standardDays;
    const adjustedSalary = dailySalary * presentDays;

    const user = await this.getUser(userId);
    const departmentTiming = await this.getDepartmentTiming(user?.department || "");
    const standardWorkingHours = Number(departmentTiming?.workingHours) || payrollSettings.standardWorkingHours || 8;
    const hourlyRate = dailySalary / standardWorkingHours;
    const overtimePay = hourlyRate * overtimeHours * 1.0;

    const grossSalary = adjustedSalary + overtimePay;

    const epfRate = (payrollSettings.pfRate || 12) / 100;
    const pfDeduction = basicSalary >= payrollSettings.pfApplicableFromSalary ? (basicSalary * epfRate) : 0;

    const esiRate = (payrollSettings.esiRate || 0.75) / 100;
    const esiDeduction = grossSalary <= payrollSettings.esiApplicableFromSalary ? (grossSalary * esiRate) : 0;

    const ptDeduction = Number((salaryStructure as any).professionalTax) || 200;

    const advances = await this.listSalaryAdvances({ userId, status: 'approved' });
    let totalAdvanceDeduction = 0;
    for (const adv of advances) {
      const advRemaining = Number((adv as any).remainingBalance ?? (adv as any).balance ?? 0);
      if (adv.status === 'approved' && advRemaining > 0) {
        const emi = Number((adv as any).monthlyEmiAmount ?? (adv as any).emiAmount ?? 0);
        totalAdvanceDeduction += Math.min(emi, advRemaining);
      }
    }

    const totalDeductions = pfDeduction + esiDeduction + ptDeduction + totalAdvanceDeduction;
    const netSalary = Math.max(0, grossSalary - totalDeductions);

    return {
      userId,
      month,
      year,
      totalWorkingDays: standardDays,
      daysWorked: presentDays,
      overtimeHours,
      overtimePay: Math.round(overtimePay),
      grossSalary: Math.round(grossSalary),
      netSalary: Math.round(netSalary),
      pfDeduction: Math.round(pfDeduction),
      esiDeduction: Math.round(esiDeduction),
      ptDeduction: Math.round(ptDeduction),
      advanceDeduction: Math.round(totalAdvanceDeduction),
      totalDeductions: Math.round(totalDeductions),
      status: 'draft'
    };
  }

  // ===================================================================
  // OFFICE LOCATIONS & SETTINGS
  // ===================================================================
  async listOfficeLocations(): Promise<OfficeLocation[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb
        .select()
        .from(pgOfficeLocations)
        .where(
          and(
            eq(pgOfficeLocations.tenantId, tenantId),
            eq(pgOfficeLocations.isActive, true)
          )
        );

      return rows.map(loc => ({
        id: loc.id,
        name: loc.name,
        latitude: String(loc.latitude),
        longitude: String(loc.longitude),
        radius: Number(loc.radius) || 500,
        address: loc.address || undefined,
        city: loc.city || undefined,
        state: loc.state || undefined,
        pincode: loc.pincode || undefined,
        isActive: loc.isActive,
        createdAt: loc.createdAt
      } as any));
    } catch (e) {
      console.error("[PostgresStorage] listOfficeLocations error:", e);
      return this.fallback.listOfficeLocations();
    }
  }

  async getOfficeLocation(id: string): Promise<OfficeLocation | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [loc] = await pgDb
        .select()
        .from(pgOfficeLocations)
        .where(
          and(
            eq(pgOfficeLocations.id, id),
            eq(pgOfficeLocations.tenantId, tenantId)
          )
        )
        .limit(1);

      if (loc) {
        return {
          id: loc.id,
          name: loc.name,
          latitude: String(loc.latitude),
          longitude: String(loc.longitude),
          radius: Number(loc.radius) || 500,
          address: loc.address || undefined,
          city: loc.city || undefined,
          state: loc.state || undefined,
          pincode: loc.pincode || undefined,
          isActive: loc.isActive,
          createdAt: loc.createdAt
        } as any;
      }
    } catch (e) {
      console.error("[PostgresStorage] getOfficeLocation error:", e);
    }
    return this.fallback.getOfficeLocation(id);
  }

  async getCompanySettings(): Promise<any | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [s] = await pgDb
        .select()
        .from(pgCompanySettings)
        .where(eq(pgCompanySettings.tenantId, tenantId))
        .limit(1);

      if (s) {
        return {
          id: s.id,
          tenantId: s.tenantId,
          companyName: s.companyName,
          logoUrl: s.logoUrl,
          supportEmail: s.supportEmail,
          supportPhone: s.supportPhone,
          address: s.address,
          gstin: s.gstin,
          defaultOTRate: Number(s.defaultOTRate) || 1.0,
          weekendOTRate: Number(s.weekendOTRate) || 1.0,
          maxOTHoursPerDay: s.maxOTHoursPerDay,
          weekendDays: (s.weekendDays as number[]) || [0],
          updatedAt: s.updatedAt
        };
      }
    } catch (e) {
      console.error("[PostgresStorage] getCompanySettings error, delegating:", e);
    }
    return this.fallback.getCompanySettings();
  }

  async updateCompanySettings(settings: any): Promise<void> {
    try {
      const tenantId = await this.getTenantId();
      const [existing] = await pgDb
        .select()
        .from(pgCompanySettings)
        .where(eq(pgCompanySettings.tenantId, tenantId))
        .limit(1);

      const updateValues: any = {
        updatedAt: new Date()
      };
      if (settings.companyName !== undefined) updateValues.companyName = settings.companyName;
      if (settings.logoUrl !== undefined) updateValues.logoUrl = settings.logoUrl;
      if (settings.supportEmail !== undefined) updateValues.supportEmail = settings.supportEmail;
      if (settings.supportPhone !== undefined) updateValues.supportPhone = settings.supportPhone;
      if (settings.address !== undefined) updateValues.address = settings.address;
      if (settings.gstin !== undefined) updateValues.gstin = settings.gstin;
      if (settings.defaultOTRate !== undefined) updateValues.defaultOTRate = String(settings.defaultOTRate);
      if (settings.weekendOTRate !== undefined) updateValues.weekendOTRate = String(settings.weekendOTRate);
      if (settings.maxOTHoursPerDay !== undefined) updateValues.maxOTHoursPerDay = Number(settings.maxOTHoursPerDay);
      if (settings.weekendDays !== undefined) updateValues.weekendDays = settings.weekendDays;

      if (existing) {
        await pgDb
          .update(pgCompanySettings)
          .set(updateValues)
          .where(and(eq(pgCompanySettings.id, existing.id), eq(pgCompanySettings.tenantId, tenantId)));
      } else {
        await pgDb.insert(pgCompanySettings).values({
          tenantId,
          companyName: settings.companyName || "Default Company",
          ...updateValues
        });
      }
      try { await this.fallback.updateCompanySettings(settings); } catch (_) {}
    } catch (e) {
      console.error("[PostgresStorage] updateCompanySettings error:", e);
      return this.fallback.updateCompanySettings(settings);
    }
  }

  async getDepartmentTiming(department: string): Promise<any | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [timing] = await pgDb
        .select()
        .from(pgDepartmentTimings)
        .where(
          and(
            eq(pgDepartmentTimings.tenantId, tenantId),
            eq(pgDepartmentTimings.department, department.toLowerCase().trim())
          )
        )
        .limit(1);

      if (timing) {
        return {
          id: timing.id,
          department: timing.department,
          checkInTime: timing.checkInTime,
          checkOutTime: timing.checkOutTime,
          workingHours: Number(timing.workingHours) || 8.0,
          autoCheckoutGraceMinutes: timing.autoCheckoutGraceMinutes,
          weekendDays: (timing.weekendDays as number[]) || [0],
          isActive: timing.isActive
        };
      }
    } catch (e) {
      console.error("[PostgresStorage] getDepartmentTiming error, delegating:", e);
    }
    return this.fallback.getDepartmentTiming(department);
  }

  async listDepartmentTimings(): Promise<any[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb
        .select()
        .from(pgDepartmentTimings)
        .where(eq(pgDepartmentTimings.tenantId, tenantId));
      return rows.map(t => ({
        id: t.id,
        department: t.department,
        checkInTime: t.checkInTime,
        checkOutTime: t.checkOutTime,
        workingHours: Number(t.workingHours) || 8.0,
        autoCheckoutGraceMinutes: t.autoCheckoutGraceMinutes,
        weekendDays: (t.weekendDays as number[]) || [0],
        isActive: t.isActive
      }));
    } catch (e) {
      console.error("[PostgresStorage] listDepartmentTimings error:", e);
      return this.fallback.listDepartmentTimings();
    }
  }

  async createOfficeLocation(data: any): Promise<OfficeLocation> {
    try {
      const tenantId = await this.getTenantId();
      const [loc] = await pgDb.insert(pgOfficeLocations).values({
        tenantId,
        name: data.name,
        latitude: String(data.latitude),
        longitude: String(data.longitude),
        radius: Number(data.radius) || 500,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        pincode: data.pincode || null,
        isActive: data.isActive ?? true
      }).returning();

      if (typeof (this.fallback as any).createOfficeLocation === 'function') {
        try { await (this.fallback as any).createOfficeLocation(data); } catch (_) {}
      }

      return {
        id: loc.id,
        name: loc.name,
        latitude: String(loc.latitude),
        longitude: String(loc.longitude),
        radius: Number(loc.radius),
        address: loc.address || undefined,
        city: loc.city || undefined,
        state: loc.state || undefined,
        pincode: loc.pincode || undefined,
        isActive: loc.isActive,
        createdAt: loc.createdAt
      } as any;
    } catch (e) {
      console.error("[PostgresStorage] createOfficeLocation error:", e);
      throw e;
    }
  }

  async updateDepartmentTiming(department: string, data: any): Promise<any> {
    try {
      const tenantId = await this.getTenantId();
      const dept = department.toLowerCase().trim();
      const updateValues: any = { updatedAt: new Date() };
      if (data.checkInTime !== undefined) updateValues.checkInTime = data.checkInTime;
      if (data.checkOutTime !== undefined) updateValues.checkOutTime = data.checkOutTime;
      if (data.workingHours !== undefined) updateValues.workingHours = String(data.workingHours);
      if (data.autoCheckoutGraceMinutes !== undefined) updateValues.autoCheckoutGraceMinutes = data.autoCheckoutGraceMinutes;
      if (data.weekendDays !== undefined) updateValues.weekendDays = data.weekendDays;
      if (data.isActive !== undefined) updateValues.isActive = data.isActive;

      let [updated] = await pgDb
        .update(pgDepartmentTimings)
        .set(updateValues)
        .where(
          and(
            eq(pgDepartmentTimings.tenantId, tenantId),
            eq(pgDepartmentTimings.department, dept)
          )
        )
        .returning();

      if (!updated) {
        // Upsert if not existing for this tenant
        [updated] = await pgDb
          .insert(pgDepartmentTimings)
          .values({
            tenantId,
            department: dept,
            checkInTime: data.checkInTime || "9:00 AM",
            checkOutTime: data.checkOutTime || "6:00 PM",
            workingHours: String(data.workingHours || 8),
            autoCheckoutGraceMinutes: data.autoCheckoutGraceMinutes || 120,
            weekendDays: data.weekendDays || [0],
            isActive: data.isActive ?? true,
            ...updateValues
          })
          .onConflictDoUpdate({
            target: [pgDepartmentTimings.tenantId, pgDepartmentTimings.department],
            set: {
              ...updateValues,
              updatedAt: new Date()
            }
          })
          .returning();
      }

      try { await this.fallback.updateDepartmentTiming(department, data); } catch (_) {}
      return updated;
    } catch (e) {
      console.error("[PostgresStorage] updateDepartmentTiming error:", e);
      return this.fallback.updateDepartmentTiming(department, data);
    }
  }

  async createDepartmentTiming(data: any): Promise<any> {
    try {
      const tenantId = await this.getTenantId();
      const dept = data.department.toLowerCase().trim();
      const [upserted] = await pgDb
        .insert(pgDepartmentTimings)
        .values({
          tenantId,
          department: dept,
          checkInTime: data.checkInTime,
          checkOutTime: data.checkOutTime,
          workingHours: String(data.workingHours || 8),
          autoCheckoutGraceMinutes: data.autoCheckoutGraceMinutes || 120,
          weekendDays: data.weekendDays || [0],
          isActive: data.isActive ?? true
        })
        .onConflictDoUpdate({
          target: [pgDepartmentTimings.tenantId, pgDepartmentTimings.department],
          set: {
            checkInTime: data.checkInTime,
            checkOutTime: data.checkOutTime,
            workingHours: String(data.workingHours || 8),
            autoCheckoutGraceMinutes: data.autoCheckoutGraceMinutes || 120,
            weekendDays: data.weekendDays || [0],
            isActive: data.isActive ?? true,
            updatedAt: new Date()
          }
        })
        .returning();
      try { await (this.fallback as any).createDepartmentTiming?.(data); } catch (_) {}
      return upserted;
    } catch (e) {
      console.error("[PostgresStorage] createDepartmentTiming error:", e);
      return (this.fallback as any).createDepartmentTiming ? (this.fallback as any).createDepartmentTiming(data) : undefined;
    }
  }

  // ===================================================================
  // AUDIT LOGS
  // ===================================================================
  async createAuditLog(data: any): Promise<any> {
    try {
      const tenantId = await this.getTenantId();
      const [log] = await pgDb.insert(pgAuditLogs).values({
        tenantId,
        userId: data.userId || 'system',
        action: data.action || 'system_action',
        entityType: data.entityType || 'general',
        entityId: data.entityId ? String(data.entityId) : 'unknown',
        details: data.details || data.changes || {},
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null
      }).returning();

      try { await this.fallback.createAuditLog(data); } catch (_) {}
      return log;
    } catch (e) {
      console.error("[PostgresStorage] createAuditLog error:", e);
      return this.fallback.createAuditLog(data);
    }
  }

  async getAuditLogs(filters?: { userId?: string; entityType?: string; startDate?: Date; endDate?: Date }): Promise<any[]> {
    try {
      const tenantId = await this.getTenantId();
      const conditions: any[] = [eq(pgAuditLogs.tenantId, tenantId)];
      if (filters?.userId) conditions.push(eq(pgAuditLogs.userId, filters.userId));
      if (filters?.entityType) conditions.push(eq(pgAuditLogs.entityType, filters.entityType));
      if (filters?.startDate) conditions.push(gte(pgAuditLogs.createdAt, filters.startDate));
      if (filters?.endDate) conditions.push(lte(pgAuditLogs.createdAt, filters.endDate));

      const rows = await pgDb
        .select()
        .from(pgAuditLogs)
        .where(and(...conditions))
        .orderBy(desc(pgAuditLogs.createdAt))
        .limit(1000);

      return rows;
    } catch (e) {
      console.error("[PostgresStorage] getAuditLogs error:", e);
      return this.fallback.getAuditLogs(filters);
    }
  }

  // ===================================================================
  // NOTIFICATIONS
  // ===================================================================
  async createNotification(data: any): Promise<any> {
    try {
      const tenantId = await this.getTenantId();
      const [n] = await pgDb.insert(pgNotifications).values({
        tenantId,
        userId: data.userId,
        title: data.title,
        message: data.message,
        type: data.type || "info",
        isRead: Boolean(data.isRead ?? false),
        metadata: data.metadata || {}
      }).returning();
      try { await this.fallback.createNotification(data); } catch (_) {}
      return n;
    } catch (e) {
      console.error("[PostgresStorage] createNotification error:", e);
      return this.fallback.createNotification(data);
    }
  }

  async getNotifications(userId: string): Promise<any[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb
        .select()
        .from(pgNotifications)
        .where(
          and(
            eq(pgNotifications.userId, userId),
            eq(pgNotifications.tenantId, tenantId)
          )
        )
        .orderBy(desc(pgNotifications.createdAt));
      return rows;
    } catch (e) {
      console.error("[PostgresStorage] getNotifications error:", e);
      return this.fallback.getNotifications(userId);
    }
  }

  async updateNotification(id: string, updates: any): Promise<any> {
    try {
      const tenantId = await this.getTenantId();
      const [n] = await pgDb
        .update(pgNotifications)
        .set({ ...updates, updatedAt: new Date() })
        .where(
          and(
            eq(pgNotifications.id, id),
            eq(pgNotifications.tenantId, tenantId)
          )
        )
        .returning();
      try { await this.fallback.updateNotification(id, updates); } catch (_) {}
      return n;
    } catch (e) {
      console.error("[PostgresStorage] updateNotification error:", e);
      return this.fallback.updateNotification(id, updates);
    }
  }

  async deleteExpiredNotifications(expiryDate: Date): Promise<void> {
    try {
      const tenantId = await this.getTenantId();
      await pgDb
        .delete(pgNotifications)
        .where(
          and(
            eq(pgNotifications.tenantId, tenantId),
            lte(pgNotifications.createdAt, expiryDate)
          )
        );
      try { await this.fallback.deleteExpiredNotifications(expiryDate); } catch (_) {}
    } catch (e) {
      console.error("[PostgresStorage] deleteExpiredNotifications error:", e);
      return this.fallback.deleteExpiredNotifications(expiryDate);
    }
  }

// ===================================================================
  // SALARY STRUCTURES & PAYROLL
  // ===================================================================
  async getSalaryStructure(id: string): Promise<SalaryStructure | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [s] = await pgDb
        .select()
        .from(pgSalaryStructures)
        .where(
          and(
            eq(pgSalaryStructures.id, id),
            eq(pgSalaryStructures.tenantId, tenantId)
          )
        )
        .limit(1);
      if (s) {
        return {
          id: s.id,
          userId: s.userId,
          employeeId: s.userId,
          baseSalary: Number(s.baseSalary),
          basicSalary: Number(s.baseSalary),
          fixedSalary: Number(s.monthlyGross || s.baseSalary),
          hra: Number(s.hra || 0),
          specialAllowance: Number(s.specialAllowance || 0),
          conveyance: Number(s.conveyance || 0),
          medicalAllowance: Number(s.medicalAllowance || 0),
          pfEmployee: Number(s.pfEmployee || 0),
          pfEmployer: Number(s.pfEmployer || 0),
          esiEmployee: Number(s.esiEmployee || 0),
          esiEmployer: Number(s.esiEmployer || 0),
          professionalTax: Number(s.professionalTax || 200),
          monthlyGross: Number(s.monthlyGross || s.baseSalary),
          monthlyNet: Number(s.monthlyNet || s.baseSalary),
          grossSalary: Number(s.monthlyGross || s.baseSalary),
          allowances: Number(s.specialAllowance || 0) + Number(s.conveyance || 0) + Number(s.medicalAllowance || 0),
          effectiveFrom: s.effectiveFrom,
          effectiveTo: s.effectiveTo || null,
          isActive: s.isActive ?? true,
          createdBy: "system",
          createdAt: s.createdAt,
          updatedAt: s.updatedAt
        } as any;
      }
      return undefined;
    } catch (e) {
      console.error("[PostgresStorage] getSalaryStructure error:", e);
      return undefined;
    }
  }

  async createSalaryStructure(data: any): Promise<SalaryStructure> {
    try {
      const tenantId = await this.getTenantId();
      const baseSalary = data.baseSalary ?? data.basicSalary ?? 0;
      const monthlyGross = data.monthlyGross ?? data.fixedSalary ?? data.grossSalary ?? baseSalary;
      const monthlyNet = data.monthlyNet ?? monthlyGross;
      const [s] = await pgDb.insert(pgSalaryStructures).values({
        tenantId,
        userId: data.userId,
        baseSalary: String(baseSalary),
        hra: String(data.hra || 0),
        specialAllowance: String(data.specialAllowance || 0),
        conveyance: String(data.conveyance || data.conveyanceAllowance || 0),
        medicalAllowance: String(data.medicalAllowance || 0),
        pfEmployee: String(data.pfEmployee || 0),
        pfEmployer: String(data.pfEmployer || 0),
        esiEmployee: String(data.esiEmployee || 0),
        esiEmployer: String(data.esiEmployer || 0),
        professionalTax: String(data.professionalTax || 200),
        monthlyGross: String(monthlyGross),
        monthlyNet: String(monthlyNet),
        effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : new Date(),
        isActive: data.isActive ?? true
      }).returning();

      try { await this.fallback.createSalaryStructure(data); } catch (_) {}
      return {
        id: s.id,
        userId: s.userId,
        employeeId: s.userId,
        baseSalary: Number(s.baseSalary),
        basicSalary: Number(s.baseSalary),
        fixedSalary: Number(s.monthlyGross || s.baseSalary),
        hra: Number(s.hra || 0),
        specialAllowance: Number(s.specialAllowance || 0),
        conveyance: Number(s.conveyance || 0),
        medicalAllowance: Number(s.medicalAllowance || 0),
        pfEmployee: Number(s.pfEmployee || 0),
        pfEmployer: Number(s.pfEmployer || 0),
        esiEmployee: Number(s.esiEmployee || 0),
        esiEmployer: Number(s.esiEmployer || 0),
        professionalTax: Number(s.professionalTax || 200),
        monthlyGross: Number(s.monthlyGross || s.baseSalary),
        monthlyNet: Number(s.monthlyNet || s.baseSalary),
        grossSalary: Number(s.monthlyGross || s.baseSalary),
        allowances: Number(s.specialAllowance || 0) + Number(s.conveyance || 0) + Number(s.medicalAllowance || 0),
        effectiveFrom: s.effectiveFrom,
        effectiveTo: s.effectiveTo || null,
        isActive: s.isActive ?? true,
        createdBy: "system",
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      } as any;
    } catch (e) {
      console.error("[PostgresStorage] createSalaryStructure error:", e);
      return this.fallback.createSalaryStructure(data);
    }
  }

  async updateSalaryStructure(id: string, data: any): Promise<SalaryStructure> {
    try {
      const tenantId = await this.getTenantId();
      const updateValues: any = { updatedAt: new Date() };
      if (data.baseSalary !== undefined) updateValues.baseSalary = String(data.baseSalary);
      if (data.hra !== undefined) updateValues.hra = String(data.hra);
      if (data.monthlyGross !== undefined) updateValues.monthlyGross = String(data.monthlyGross);
      if (data.monthlyNet !== undefined) updateValues.monthlyNet = String(data.monthlyNet);
      if (data.isActive !== undefined) updateValues.isActive = data.isActive;

      const [s] = await pgDb
        .update(pgSalaryStructures)
        .set(updateValues)
        .where(
          and(
            eq(pgSalaryStructures.id, id),
            eq(pgSalaryStructures.tenantId, tenantId)
          )
        )
        .returning();
      try { await this.fallback.updateSalaryStructure(id, data); } catch (_) {}
      if (s) {
        return {
          id: s.id,
          userId: s.userId,
          baseSalary: Number(s.baseSalary),
          hra: Number(s.hra),
          specialAllowance: Number(s.specialAllowance),
          conveyance: Number(s.conveyance),
          medicalAllowance: Number(s.medicalAllowance),
          pfEmployee: Number(s.pfEmployee),
          pfEmployer: Number(s.pfEmployer),
          esiEmployee: Number(s.esiEmployee),
          esiEmployer: Number(s.esiEmployer),
          professionalTax: Number(s.professionalTax),
          monthlyGross: Number(s.monthlyGross),
          monthlyNet: Number(s.monthlyNet),
          effectiveFrom: s.effectiveFrom,
          effectiveTo: s.effectiveTo || null,
          isActive: s.isActive,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt
        } as unknown as SalaryStructure;
      }
    } catch (e) {
      console.error("[PostgresStorage] updateSalaryStructure error:", e);
    }
    return this.fallback.updateSalaryStructure(id, data);
  }

  async listSalaryStructures(): Promise<SalaryStructure[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb
        .select()
        .from(pgSalaryStructures)
        .where(eq(pgSalaryStructures.tenantId, tenantId))
        .orderBy(desc(pgSalaryStructures.createdAt));
      return rows.map(s => ({
        id: s.id,
        userId: s.userId,
        baseSalary: Number(s.baseSalary),
        hra: Number(s.hra),
        specialAllowance: Number(s.specialAllowance),
        conveyance: Number(s.conveyance),
        medicalAllowance: Number(s.medicalAllowance),
        pfEmployee: Number(s.pfEmployee),
        pfEmployer: Number(s.pfEmployer),
        esiEmployee: Number(s.esiEmployee),
        esiEmployer: Number(s.esiEmployer),
        professionalTax: Number(s.professionalTax),
        monthlyGross: Number(s.monthlyGross),
        monthlyNet: Number(s.monthlyNet),
        effectiveFrom: s.effectiveFrom,
        effectiveTo: s.effectiveTo || null,
        isActive: s.isActive,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      } as unknown as SalaryStructure));
    } catch (e) {
      console.error("[PostgresStorage] listSalaryStructures error:", e);
      return this.fallback.listSalaryStructures();
    }
  }

  async getPayrollSettings(): Promise<any | undefined> {
    return {
      id: "default-payroll-settings",
      pfRate: 12,
      esiRate: 1.75,
      tdsRate: 10,
      standardWorkingHours: 8,
      standardWorkingDays: 26,
      leaveDeductionRate: 1,
      pfApplicableFromSalary: 15000,
      esiApplicableFromSalary: 21000,
      autoCheckoutGraceMinutes: 5,
      updatedAt: new Date()
    };
  }

  async updatePayrollSettings(data: any): Promise<any> {
    return {
      id: "default-payroll-settings",
      ...data,
      updatedAt: new Date()
    };
  }

  // ===================================================================
  // FIXED HOLIDAYS
  // ===================================================================
  private mapFixedHoliday(h: any): FixedHoliday {
    return {
      id: h.id,
      tenantId: h.tenantId,
      name: h.name,
      date: h.date,
      year: h.year,
      type: h.type as any,
      isPaid: h.isPaid ?? true,
      isOptional: h.isOptional ?? false,
      allowOT: (h as any).allowOT ?? false,
      applicableDepartments: (h.applicableDepartments as string[]) || [],
      description: h.description || undefined,
      notes: h.description || undefined,
      createdBy: h.createdBy || undefined,
      isActive: h.isActive ?? true,
      createdAt: h.createdAt,
      updatedAt: h.updatedAt
    } as any;
  }

  async getFixedHoliday(id: string): Promise<FixedHoliday | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [h] = await pgDb
        .select()
        .from(pgFixedHolidays)
        .where(and(eq(pgFixedHolidays.id, id), eq(pgFixedHolidays.tenantId, tenantId)))
        .limit(1);
      if (h) return this.mapFixedHoliday(h);
    } catch (e) {
      console.error("[PostgresStorage] getFixedHoliday error:", e);
    }
    return this.fallback.getFixedHoliday(id);
  }

  async createFixedHoliday(data: any): Promise<FixedHoliday> {
    try {
      const tenantId = await this.getTenantId();
      const dateObj = data.date instanceof Date ? data.date : new Date(data.date);
      const year = Number(data.year) || dateObj.getFullYear();
      const [h] = await pgDb.insert(pgFixedHolidays).values({
        tenantId,
        name: data.name,
        date: dateObj,
        year,
        type: data.type || "mandatory",
        isPaid: data.isPaid ?? true,
        isOptional: data.isOptional ?? false,
        applicableDepartments: data.applicableDepartments || [],
        description: data.description || data.notes || null,
        createdBy: data.createdBy || null,
        isActive: data.isActive !== undefined ? Boolean(data.isActive) : true
      }).returning();

      try { await this.fallback.createFixedHoliday(data); } catch (_) {}
      return this.mapFixedHoliday(h);
    } catch (e) {
      console.error("[PostgresStorage] createFixedHoliday error:", e);
      return this.fallback.createFixedHoliday(data);
    }
  }

  async updateFixedHoliday(id: string, data: any): Promise<FixedHoliday> {
    try {
      const tenantId = await this.getTenantId();
      const updateValues: any = { updatedAt: new Date() };
      if (data.name !== undefined) updateValues.name = data.name;
      if (data.date !== undefined) {
        const d = data.date instanceof Date ? data.date : new Date(data.date);
        updateValues.date = d;
        updateValues.year = d.getFullYear();
      }
      if (data.year !== undefined) updateValues.year = Number(data.year);
      if (data.type !== undefined) updateValues.type = data.type;
      if (data.isPaid !== undefined) updateValues.isPaid = Boolean(data.isPaid);
      if (data.isOptional !== undefined) updateValues.isOptional = Boolean(data.isOptional);
      if (data.applicableDepartments !== undefined) updateValues.applicableDepartments = data.applicableDepartments;
      if (data.description !== undefined) updateValues.description = data.description;
      if (data.notes !== undefined) updateValues.description = data.notes;
      if (data.isActive !== undefined) updateValues.isActive = Boolean(data.isActive);

      const [h] = await pgDb
        .update(pgFixedHolidays)
        .set(updateValues)
        .where(and(eq(pgFixedHolidays.id, id), eq(pgFixedHolidays.tenantId, tenantId)))
        .returning();

      try { await this.fallback.updateFixedHoliday(id, data); } catch (_) {}
      if (h) return this.mapFixedHoliday(h);
    } catch (e) {
      console.error("[PostgresStorage] updateFixedHoliday error:", e);
    }
    return this.fallback.updateFixedHoliday(id, data);
  }

  async deleteFixedHoliday(id: string): Promise<boolean> {
    try {
      const tenantId = await this.getTenantId();
      const [h] = await pgDb
        .update(pgFixedHolidays)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(pgFixedHolidays.id, id), eq(pgFixedHolidays.tenantId, tenantId)))
        .returning();
      try { await this.fallback.deleteFixedHoliday(id); } catch (_) {}
      return Boolean(h);
    } catch (e) {
      console.error("[PostgresStorage] deleteFixedHoliday error:", e);
      return this.fallback.deleteFixedHoliday(id);
    }
  }

  async listFixedHolidays(year?: number): Promise<FixedHoliday[]> {
    try {
      const tenantId = await this.getTenantId();
      const conditions: any[] = [
        eq(pgFixedHolidays.tenantId, tenantId),
        eq(pgFixedHolidays.isActive, true)
      ];
      if (year) {
        conditions.push(eq(pgFixedHolidays.year, year));
      }

      const rows = await pgDb
        .select()
        .from(pgFixedHolidays)
        .where(and(...conditions))
        .orderBy(pgFixedHolidays.date);

      return rows.map(h => this.mapFixedHoliday(h));
    } catch (e) {
      console.error("[PostgresStorage] listFixedHolidays error:", e);
      return this.fallback.listFixedHolidays(year);
    }
  }

  async initializeFixedHolidays(year: number, createdBy: string): Promise<void> {
    try {
      const defaultHolidays = [
        { name: "New Year's Day", date: new Date(year, 0, 1), type: "mandatory" },
        { name: "Republic Day", date: new Date(year, 0, 26), type: "mandatory" },
        { name: "May Day", date: new Date(year, 4, 1), type: "mandatory" },
        { name: "Independence Day", date: new Date(year, 7, 15), type: "mandatory" },
        { name: "Gandhi Jayanti", date: new Date(year, 9, 2), type: "mandatory" },
        { name: "Karnataka Rajyotsava", date: new Date(year, 10, 1), type: "mandatory" },
        { name: "Christmas", date: new Date(year, 11, 25), type: "mandatory" },
      ];

      for (const h of defaultHolidays) {
        await this.createFixedHoliday({
          ...h,
          year,
          isPaid: true,
          isOptional: false,
          applicableDepartments: [],
          createdBy
        });
      }
    } catch (e) {
      console.error("[PostgresStorage] initializeFixedHolidays error:", e);
      return this.fallback.initializeFixedHolidays(year, createdBy);
    }
  }

  async getHolidaysByDate(date: Date): Promise<any[]> {
    try {
      const tenantId = await this.getTenantId();
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);

      const rows = await pgDb
        .select()
        .from(pgFixedHolidays)
        .where(
          and(
            eq(pgFixedHolidays.tenantId, tenantId),
            eq(pgFixedHolidays.isActive, true),
            gte(pgFixedHolidays.date, start),
            lte(pgFixedHolidays.date, end)
          )
        );
      return rows.map(h => this.mapFixedHoliday(h));
    } catch (e) {
      console.error("[PostgresStorage] getHolidaysByDate error:", e);
      return this.fallback.getHolidaysByDate(date);
    }
  }

  async getHolidaysByDateRange(startDate: Date, endDate: Date): Promise<any[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb
        .select()
        .from(pgFixedHolidays)
        .where(
          and(
            eq(pgFixedHolidays.tenantId, tenantId),
            eq(pgFixedHolidays.isActive, true),
            gte(pgFixedHolidays.date, startDate),
            lte(pgFixedHolidays.date, endDate)
          )
        )
        .orderBy(pgFixedHolidays.date);
      return rows.map(h => this.mapFixedHoliday(h));
    } catch (e) {
      console.error("[PostgresStorage] getHolidaysByDateRange error:", e);
      return this.fallback.getHolidaysByDateRange(startDate, endDate);
    }
  }

  async createHoliday(holiday: any): Promise<void> {
    await this.createFixedHoliday(holiday);
  }

  async updateHoliday(id: string, updates: any): Promise<void> {
    await this.updateFixedHoliday(id, updates);
  }

  async deleteHoliday(id: string): Promise<boolean> {
    return this.deleteFixedHoliday(id);
  }

  // ===================================================================
  // PAYROLL PERIODS
  // ===================================================================
  async getPayrollPeriod(month: number, year: number): Promise<any | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [period] = await pgDb
        .select()
        .from(pgPayrollPeriods)
        .where(
          and(
            eq(pgPayrollPeriods.month, month),
            eq(pgPayrollPeriods.year, year),
            eq(pgPayrollPeriods.tenantId, tenantId)
          )
        )
        .limit(1);

      if (period) {
        return {
          id: period.id,
          month: period.month,
          year: period.year,
          startDate: period.startDate,
          endDate: period.endDate,
          cutoffDate: period.cutoffDate,
          status: period.status,
          isLocked: period.isLocked,
          lockedAt: period.lockedAt,
          lockedBy: period.lockedBy,
          createdAt: period.createdAt,
          updatedAt: period.updatedAt
        };
      }
      return undefined;
    } catch (e) {
      console.error("[PostgresStorage] getPayrollPeriod error:", e);
      return undefined;
    }
  }

  async createPayrollPeriod(period: any): Promise<any> {
    try {
      const tenantId = await this.getTenantId();
      const rawId = period.id || `payroll_${period.year}_${String(period.month).padStart(2, '0')}`;
      const periodId = rawId.startsWith(`${tenantId}-`) || rawId.startsWith(`period-${tenantId}`)
        ? rawId
        : `${tenantId}-${rawId}`;
      const [p] = await pgDb.insert(pgPayrollPeriods).values({
        id: periodId,
        tenantId,
        month: Number(period.month),
        year: Number(period.year),
        startDate: period.startDate ? new Date(period.startDate) : null,
        endDate: period.endDate ? new Date(period.endDate) : null,
        cutoffDate: period.cutoffDate ? new Date(period.cutoffDate) : null,
        status: period.status || "draft",
        isLocked: Boolean(period.isLocked),
        lockedAt: period.lockedAt ? new Date(period.lockedAt) : null,
        lockedBy: period.lockedBy || null
      }).onConflictDoUpdate({
        target: pgPayrollPeriods.id,
        set: {
          status: period.status || "draft",
          isLocked: Boolean(period.isLocked),
          lockedAt: period.lockedAt ? new Date(period.lockedAt) : null,
          lockedBy: period.lockedBy || null,
          updatedAt: new Date()
        }
      }).returning();

      try { await this.fallback.createPayrollPeriod({ ...period, id: periodId }); } catch (_) {}
      return p;
    } catch (e) {
      console.error("[PostgresStorage] createPayrollPeriod error:", e);
      return period;
    }
  }

  async updatePayrollPeriod(id: string, updates: any): Promise<void> {
    try {
      const tenantId = await this.getTenantId();
      const resolvedId = id.startsWith(`${tenantId}-`) ? id : `${tenantId}-${id}`;
      const updateValues: any = { updatedAt: new Date() };
      if (updates.status !== undefined) updateValues.status = updates.status;
      if (updates.isLocked !== undefined) updateValues.isLocked = updates.isLocked;
      if (updates.lockedAt !== undefined) updateValues.lockedAt = updates.lockedAt ? new Date(updates.lockedAt) : null;
      if (updates.lockedBy !== undefined) updateValues.lockedBy = updates.lockedBy;

      await pgDb
        .update(pgPayrollPeriods)
        .set(updateValues)
        .where(
          and(
            or(
              eq(pgPayrollPeriods.id, id),
              eq(pgPayrollPeriods.id, resolvedId)
            ),
            eq(pgPayrollPeriods.tenantId, tenantId)
          )
        );
      try { await this.fallback.updatePayrollPeriod(id, updates); } catch (_) {}
    } catch (e) {
      console.error("[PostgresStorage] updatePayrollPeriod error:", e);
      return this.fallback.updatePayrollPeriod(id, updates);
    }
  }

  async getPayrollPeriodsByYear(year: number): Promise<any[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb
        .select()
        .from(pgPayrollPeriods)
        .where(
          and(
            eq(pgPayrollPeriods.year, year),
            eq(pgPayrollPeriods.tenantId, tenantId)
          )
        );
      return rows;
    } catch (e) {
      console.error("[PostgresStorage] getPayrollPeriodsByYear error:", e);
      return this.fallback.getPayrollPeriodsByYear(year);
    }
  }

  async getEnhancedPayrolls(filters?: any): Promise<any[]> {
    return this.listPayrolls(filters);
  }

  async listEmployees(filters?: { department?: string; status?: string; designation?: string; search?: string }): Promise<Employee[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb.select().from(pgEmployees).where(eq(pgEmployees.tenantId, tenantId));
      let employees: Employee[] = rows.map(emp => ({
        id: emp.id,
        employeeId: emp.employeeId,
        systemUserId: emp.systemUserId || undefined,
        personalInfo: emp.personalInfo as any,
        contactInfo: emp.contactInfo as any,
        employmentInfo: emp.employmentInfo as any,
        payrollInfo: emp.payrollInfo as any,
        professionalInfo: emp.professionalInfo as any,
        emergencyContacts: (emp.emergencyContacts as any) || [],
        status: emp.status as any,
        isActive: emp.isActive,
        notes: emp.notes || undefined,
        createdBy: emp.createdBy || undefined,
        lastUpdatedBy: emp.lastUpdatedBy || undefined,
        createdAt: emp.createdAt || new Date(),
        updatedAt: emp.updatedAt || new Date()
      }));

      // If no dedicated employee records, synthesize from users table
      if (employees.length === 0) {
        const users = await this.listUsers();
        employees = users.map(u => ({
          id: u.id,
          systemUserId: u.id,
          employeeId: u.employeeId || `EMP-${u.id.slice(0, 6)}`,
          status: (u.employeeStatus as any) || (u.isActive ? 'active' : 'inactive'),
          isActive: u.isActive,
          personalInfo: {
            firstName: u.displayName.split(' ')[0] || u.displayName,
            lastName: u.displayName.split(' ').slice(1).join(' ') || '',
            displayName: u.displayName,
            photoURL: u.photoURL
          },
          contactInfo: {
            primaryEmail: u.email,
            primaryPhone: (u as any).phone || ''
          },
          employmentInfo: {
            department: u.department || 'operations',
            designation: u.designation || 'executive',
            employmentType: 'full_time',
            joinDate: u.createdAt,
            probationPeriodMonths: 6,
            weeklyOffDays: [0, 6],
            reportingManagerId: u.reportingManagerId || undefined
          },
          payrollInfo: {
            payrollGrade: u.payrollGrade || undefined,
            currency: 'INR',
            paymentMethod: 'bank_transfer'
          },
          professionalInfo: {
            skills: [],
            certifications: [],
            languages: [],
            previousEmployers: []
          },
          emergencyContacts: [],
          createdAt: u.createdAt,
          updatedAt: (u as any).updatedAt || u.createdAt
        })) as Employee[];
      }

      if (filters?.department) employees = employees.filter(e => e.employmentInfo?.department?.toLowerCase() === filters.department!.toLowerCase());
      if (filters?.designation) employees = employees.filter(e => e.employmentInfo?.designation?.toLowerCase() === filters.designation!.toLowerCase());
      if (filters?.status) employees = employees.filter(e => e.status?.toLowerCase() === filters.status!.toLowerCase());
      if (filters?.search) {
        const s = filters.search.toLowerCase();
        employees = employees.filter(e =>
          e.personalInfo?.displayName?.toLowerCase().includes(s) ||
          e.employeeId?.toLowerCase().includes(s) ||
          e.contactInfo?.primaryEmail?.toLowerCase().includes(s)
        );
      }

      return employees;
    } catch (e) {
      console.error("[PostgresStorage] listEmployees error:", e);
      return this.fallback.listEmployees(filters);
    }
  }

  async getEmployee(id: string): Promise<Employee | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [emp] = await pgDb.select().from(pgEmployees)
        .where(
          and(
            eq(pgEmployees.tenantId, tenantId),
            or(eq(pgEmployees.id, id), eq(pgEmployees.employeeId, id), eq(pgEmployees.systemUserId, id))
          )
        )
        .limit(1);
      if (emp) {
        return {
          id: emp.id,
          employeeId: emp.employeeId,
          systemUserId: emp.systemUserId || undefined,
          personalInfo: emp.personalInfo as any,
          contactInfo: emp.contactInfo as any,
          employmentInfo: emp.employmentInfo as any,
          payrollInfo: emp.payrollInfo as any,
          professionalInfo: emp.professionalInfo as any,
          emergencyContacts: (emp.emergencyContacts as any) || [],
          status: emp.status as any,
          isActive: emp.isActive,
          notes: emp.notes || undefined,
          createdBy: emp.createdBy || undefined,
          lastUpdatedBy: emp.lastUpdatedBy || undefined,
          createdAt: emp.createdAt || new Date(),
          updatedAt: emp.updatedAt || new Date()
        };
      }

      // Check users table as fallback
      const u = await this.getUser(id);
      if (u) {
        return {
          id: u.id,
          systemUserId: u.id,
          employeeId: u.employeeId || `EMP-${u.id.slice(0, 6)}`,
          status: (u.employeeStatus as any) || (u.isActive ? 'active' : 'inactive'),
          isActive: u.isActive,
          personalInfo: {
            firstName: u.displayName.split(' ')[0] || u.displayName,
            lastName: u.displayName.split(' ').slice(1).join(' ') || '',
            displayName: u.displayName,
            photoURL: u.photoURL
          },
          contactInfo: {
            primaryEmail: u.email,
            primaryPhone: (u as any).phone || ''
          },
          employmentInfo: {
            department: u.department || 'operations',
            designation: u.designation || 'executive',
            employmentType: 'full_time',
            joinDate: u.createdAt,
            probationPeriodMonths: 6,
            weeklyOffDays: [0, 6],
            reportingManagerId: u.reportingManagerId || undefined
          },
          payrollInfo: {
            payrollGrade: u.payrollGrade || undefined,
            currency: 'INR',
            paymentMethod: 'bank_transfer'
          },
          professionalInfo: {
            skills: [],
            certifications: [],
            languages: [],
            previousEmployers: []
          },
          emergencyContacts: [],
          createdAt: u.createdAt,
          updatedAt: (u as any).updatedAt || u.createdAt
        } as Employee;
      }
    } catch (e) {
      console.error("[PostgresStorage] getEmployee error:", e);
    }
    return this.fallback.getEmployee(id);
  }

  async getEmployeeByEmployeeId(employeeId: string): Promise<Employee | undefined> {
    return this.getEmployee(employeeId);
  }

  async getEmployeeBySystemUserId(systemUserId: string): Promise<Employee | undefined> {
    return this.getEmployee(systemUserId);
  }

  async getEmployeesByDepartment(department: string): Promise<Employee[]> {
    return this.listEmployees({ department });
  }

  async getEmployeesByDesignation(designation: string): Promise<Employee[]> {
    return this.listEmployees({ designation });
  }

  async getEmployeesByManager(managerId: string): Promise<Employee[]> {
    const all = await this.listEmployees();
    return all.filter(e => e.employmentInfo?.reportingManagerId === managerId);
  }

  async getEmployeesByStatus(status: string): Promise<Employee[]> {
    return this.listEmployees({ status });
  }

  async createEmployee(data: any): Promise<Employee> {
    try {
      const tenantId = await this.getTenantId();
      const [created] = await pgDb.insert(pgEmployees).values({
        tenantId,
        employeeId: data.employeeId,
        systemUserId: data.systemUserId || null,
        personalInfo: data.personalInfo || {},
        contactInfo: data.contactInfo || {},
        employmentInfo: data.employmentInfo || {},
        payrollInfo: data.payrollInfo || null,
        professionalInfo: data.professionalInfo || null,
        emergencyContacts: data.emergencyContacts || [],
        status: data.status || 'active',
        isActive: data.isActive !== undefined ? data.isActive : true,
        notes: data.notes || null,
        createdBy: data.createdBy || null,
        lastUpdatedBy: data.lastUpdatedBy || null
      }).returning();

      try { await this.fallback.createEmployee({ ...data, id: created.id }); } catch (_) {}
      return {
        id: created.id,
        employeeId: created.employeeId,
        systemUserId: created.systemUserId || undefined,
        personalInfo: created.personalInfo as any,
        contactInfo: created.contactInfo as any,
        employmentInfo: created.employmentInfo as any,
        payrollInfo: created.payrollInfo as any,
        professionalInfo: created.professionalInfo as any,
        emergencyContacts: (created.emergencyContacts as any) || [],
        status: created.status as any,
        isActive: created.isActive,
        notes: created.notes || undefined,
        createdBy: created.createdBy || undefined,
        lastUpdatedBy: created.lastUpdatedBy || undefined,
        createdAt: created.createdAt || new Date(),
        updatedAt: created.updatedAt || new Date()
      };
    } catch (e) {
      console.error("[PostgresStorage] createEmployee error:", e);
      return this.fallback.createEmployee(data);
    }
  }

  async updateEmployee(id: string, data: any): Promise<Employee> {
    try {
      const tenantId = await this.getTenantId();
      const updateValues: any = { updatedAt: new Date() };
      if (data.employeeId !== undefined) updateValues.employeeId = data.employeeId;
      if (data.systemUserId !== undefined) updateValues.systemUserId = data.systemUserId;
      if (data.personalInfo !== undefined) updateValues.personalInfo = data.personalInfo;
      if (data.contactInfo !== undefined) updateValues.contactInfo = data.contactInfo;
      if (data.employmentInfo !== undefined) updateValues.employmentInfo = data.employmentInfo;
      if (data.payrollInfo !== undefined) updateValues.payrollInfo = data.payrollInfo;
      if (data.professionalInfo !== undefined) updateValues.professionalInfo = data.professionalInfo;
      if (data.emergencyContacts !== undefined) updateValues.emergencyContacts = data.emergencyContacts;
      if (data.status !== undefined) updateValues.status = data.status;
      if (data.isActive !== undefined) updateValues.isActive = data.isActive;
      if (data.notes !== undefined) updateValues.notes = data.notes;
      if (data.lastUpdatedBy !== undefined) updateValues.lastUpdatedBy = data.lastUpdatedBy;

      const [updated] = await pgDb.update(pgEmployees)
        .set(updateValues)
        .where(
          and(
            eq(pgEmployees.id, id),
            eq(pgEmployees.tenantId, tenantId)
          )
        )
        .returning();

      try { await this.fallback.updateEmployee(id, data); } catch (_) {}
      if (updated) {
        return {
          id: updated.id,
          employeeId: updated.employeeId,
          systemUserId: updated.systemUserId || undefined,
          personalInfo: updated.personalInfo as any,
          contactInfo: updated.contactInfo as any,
          employmentInfo: updated.employmentInfo as any,
          payrollInfo: updated.payrollInfo as any,
          professionalInfo: updated.professionalInfo as any,
          emergencyContacts: (updated.emergencyContacts as any) || [],
          status: updated.status as any,
          isActive: updated.isActive,
          notes: updated.notes || undefined,
          createdBy: updated.createdBy || undefined,
          lastUpdatedBy: updated.lastUpdatedBy || undefined,
          createdAt: updated.createdAt || new Date(),
          updatedAt: updated.updatedAt || new Date()
        };
      }
    } catch (e) {
      console.error("[PostgresStorage] updateEmployee error:", e);
    }
    return this.fallback.updateEmployee(id, data);
  }

  async deleteEmployee(id: string): Promise<boolean> {
    try {
      const tenantId = await this.getTenantId();
      await pgDb.update(pgEmployees)
        .set({ isActive: false, status: 'terminated', updatedAt: new Date() })
        .where(
          and(
            eq(pgEmployees.id, id),
            eq(pgEmployees.tenantId, tenantId)
          )
        );
      try { await this.fallback.deleteEmployee(id); } catch (_) {}
      return true;
    } catch (e) {
      console.error("[PostgresStorage] deleteEmployee error:", e);
      return this.fallback.deleteEmployee(id);
    }
  }

  // ===================================================================
  // EMPLOYEE DOCUMENTS
  // ===================================================================
  async getEmployeeDocument(id: string): Promise<EmployeeDocument | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [doc] = await pgDb
        .select()
        .from(pgEmployeeDocuments)
        .where(
          and(
            eq(pgEmployeeDocuments.id, id),
            eq(pgEmployeeDocuments.tenantId, tenantId)
          )
        )
        .limit(1);
      if (doc) {
        return {
          id: doc.id,
          employeeId: doc.employeeId,
          documentType: doc.documentType as any,
          documentName: doc.documentName,
          documentUrl: doc.documentUrl,
          documentNumber: doc.documentNumber || undefined,
          expiryDate: doc.expiryDate || undefined,
          isVerified: doc.isVerified,
          verifiedBy: doc.verifiedBy || undefined,
          verifiedAt: doc.verifiedAt || undefined,
          uploadedBy: doc.uploadedBy,
          notes: doc.notes || undefined,
          createdAt: doc.createdAt || new Date(),
          updatedAt: doc.updatedAt || new Date()
        };
      }
    } catch (e) {
      console.error("[PostgresStorage] getEmployeeDocument error:", e);
    }
    return this.fallback.getEmployeeDocument(id);
  }

  async getEmployeeDocuments(employeeId: string): Promise<EmployeeDocument[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb.select().from(pgEmployeeDocuments)
        .where(
          and(
            eq(pgEmployeeDocuments.tenantId, tenantId),
            eq(pgEmployeeDocuments.employeeId, employeeId)
          )
        )
        .orderBy(desc(pgEmployeeDocuments.createdAt));
      return rows.map(doc => ({
        id: doc.id,
        employeeId: doc.employeeId,
        documentType: doc.documentType as any,
        documentName: doc.documentName,
        documentUrl: doc.documentUrl,
        documentNumber: doc.documentNumber || undefined,
        expiryDate: doc.expiryDate || undefined,
        isVerified: doc.isVerified,
        verifiedBy: doc.verifiedBy || undefined,
        verifiedAt: doc.verifiedAt || undefined,
        uploadedBy: doc.uploadedBy,
        notes: doc.notes || undefined,
        createdAt: doc.createdAt || new Date(),
        updatedAt: doc.updatedAt || new Date()
      }));
    } catch (e) {
      console.error("[PostgresStorage] getEmployeeDocuments error:", e);
      return this.fallback.getEmployeeDocuments(employeeId);
    }
  }

  async getEmployeeDocumentsByType(employeeId: string, documentType: string): Promise<EmployeeDocument[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb.select().from(pgEmployeeDocuments)
        .where(
          and(
            eq(pgEmployeeDocuments.tenantId, tenantId),
            eq(pgEmployeeDocuments.employeeId, employeeId),
            eq(pgEmployeeDocuments.documentType, documentType)
          )
        )
        .orderBy(desc(pgEmployeeDocuments.createdAt));
      return rows.map(doc => ({
        id: doc.id,
        employeeId: doc.employeeId,
        documentType: doc.documentType as any,
        documentName: doc.documentName,
        documentUrl: doc.documentUrl,
        documentNumber: doc.documentNumber || undefined,
        expiryDate: doc.expiryDate || undefined,
        isVerified: doc.isVerified,
        verifiedBy: doc.verifiedBy || undefined,
        verifiedAt: doc.verifiedAt || undefined,
        uploadedBy: doc.uploadedBy,
        notes: doc.notes || undefined,
        createdAt: doc.createdAt || new Date(),
        updatedAt: doc.updatedAt || new Date()
      }));
    } catch (e) {
      console.error("[PostgresStorage] getEmployeeDocumentsByType error:", e);
      return this.fallback.getEmployeeDocumentsByType(employeeId, documentType);
    }
  }

  async createEmployeeDocument(data: any): Promise<EmployeeDocument> {
    try {
      const tenantId = await this.getTenantId();
      const [created] = await pgDb.insert(pgEmployeeDocuments).values({
        tenantId,
        employeeId: data.employeeId,
        documentType: data.documentType,
        documentName: data.documentName,
        documentUrl: data.documentUrl,
        documentNumber: data.documentNumber || null,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        isVerified: data.isVerified !== undefined ? data.isVerified : false,
        verifiedBy: data.verifiedBy || null,
        verifiedAt: data.verifiedAt ? new Date(data.verifiedAt) : null,
        uploadedBy: data.uploadedBy,
        notes: data.notes || null
      }).returning();

      try { await this.fallback.createEmployeeDocument({ ...data, id: created.id }); } catch (_) {}
      return {
        id: created.id,
        employeeId: created.employeeId,
        documentType: created.documentType as any,
        documentName: created.documentName,
        documentUrl: created.documentUrl,
        documentNumber: created.documentNumber || undefined,
        expiryDate: created.expiryDate || undefined,
        isVerified: created.isVerified,
        verifiedBy: created.verifiedBy || undefined,
        verifiedAt: created.verifiedAt || undefined,
        uploadedBy: created.uploadedBy,
        notes: created.notes || undefined,
        createdAt: created.createdAt || new Date(),
        updatedAt: created.updatedAt || new Date()
      };
    } catch (e) {
      console.error("[PostgresStorage] createEmployeeDocument error:", e);
      return this.fallback.createEmployeeDocument(data);
    }
  }

  async updateEmployeeDocument(id: string, data: any): Promise<EmployeeDocument> {
    try {
      const tenantId = await this.getTenantId();
      const updateValues: any = { updatedAt: new Date() };
      if (data.documentType !== undefined) updateValues.documentType = data.documentType;
      if (data.documentName !== undefined) updateValues.documentName = data.documentName;
      if (data.documentUrl !== undefined) updateValues.documentUrl = data.documentUrl;
      if (data.documentNumber !== undefined) updateValues.documentNumber = data.documentNumber;
      if (data.expiryDate !== undefined) updateValues.expiryDate = data.expiryDate ? new Date(data.expiryDate) : null;
      if (data.isVerified !== undefined) updateValues.isVerified = data.isVerified;
      if (data.verifiedBy !== undefined) updateValues.verifiedBy = data.verifiedBy;
      if (data.verifiedAt !== undefined) updateValues.verifiedAt = data.verifiedAt ? new Date(data.verifiedAt) : null;
      if (data.notes !== undefined) updateValues.notes = data.notes;

      const [updated] = await pgDb.update(pgEmployeeDocuments)
        .set(updateValues)
        .where(
          and(
            eq(pgEmployeeDocuments.id, id),
            eq(pgEmployeeDocuments.tenantId, tenantId)
          )
        )
        .returning();

      try { await this.fallback.updateEmployeeDocument(id, data); } catch (_) {}
      if (updated) {
        return {
          id: updated.id,
          employeeId: updated.employeeId,
          documentType: updated.documentType as any,
          documentName: updated.documentName,
          documentUrl: updated.documentUrl,
          documentNumber: updated.documentNumber || undefined,
          expiryDate: updated.expiryDate || undefined,
          isVerified: updated.isVerified,
          verifiedBy: updated.verifiedBy || undefined,
          verifiedAt: updated.verifiedAt || undefined,
          uploadedBy: updated.uploadedBy,
          notes: updated.notes || undefined,
          createdAt: updated.createdAt || new Date(),
          updatedAt: updated.updatedAt || new Date()
        };
      }
    } catch (e) {
      console.error("[PostgresStorage] updateEmployeeDocument error:", e);
    }
    return this.fallback.updateEmployeeDocument(id, data);
  }

  async deleteEmployeeDocument(id: string): Promise<boolean> {
    try {
      const tenantId = await this.getTenantId();
      await pgDb
        .delete(pgEmployeeDocuments)
        .where(
          and(
            eq(pgEmployeeDocuments.id, id),
            eq(pgEmployeeDocuments.tenantId, tenantId)
          )
        );
      try { await this.fallback.deleteEmployeeDocument(id); } catch (_) {}
      return true;
    } catch (e) {
      console.error("[PostgresStorage] deleteEmployeeDocument error:", e);
      return this.fallback.deleteEmployeeDocument(id);
    }
  }

  // ===================================================================
  // PERFORMANCE REVIEWS
  // ===================================================================
  async getPerformanceReview(id: string): Promise<PerformanceReview | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [pr] = await pgDb
        .select()
        .from(pgPerformanceReviews)
        .where(
          and(
            eq(pgPerformanceReviews.id, id),
            eq(pgPerformanceReviews.tenantId, tenantId)
          )
        )
        .limit(1);
      if (pr) {
        const rp: any = pr.reviewPeriod || {};
        return {
          id: pr.id,
          employeeId: pr.employeeId,
          reviewPeriod: {
            startDate: rp.startDate ? new Date(rp.startDate) : new Date(),
            endDate: rp.endDate ? new Date(rp.endDate) : new Date()
          },
          reviewType: pr.reviewType as any,
          overallRating: Number(pr.overallRating),
          goals: (pr.goals as any) || [],
          strengths: (pr.strengths as any) || [],
          improvementAreas: (pr.improvementAreas as any) || [],
          reviewerComments: pr.reviewerComments || undefined,
          employeeComments: pr.employeeComments || undefined,
          reviewedBy: pr.reviewedBy,
          nextReviewDate: pr.nextReviewDate || undefined,
          createdAt: pr.createdAt || new Date(),
          updatedAt: pr.updatedAt || new Date()
        };
      }
    } catch (e) {
      console.error("[PostgresStorage] getPerformanceReview error:", e);
    }
    return this.fallback.getPerformanceReview(id);
  }

  async getEmployeePerformanceReviews(employeeId: string): Promise<PerformanceReview[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb.select().from(pgPerformanceReviews)
        .where(
          and(
            eq(pgPerformanceReviews.tenantId, tenantId),
            eq(pgPerformanceReviews.employeeId, employeeId)
          )
        )
        .orderBy(desc(pgPerformanceReviews.createdAt));
      return rows.map(pr => {
        const rp: any = pr.reviewPeriod || {};
        return {
          id: pr.id,
          employeeId: pr.employeeId,
          reviewPeriod: {
            startDate: rp.startDate ? new Date(rp.startDate) : new Date(),
            endDate: rp.endDate ? new Date(rp.endDate) : new Date()
          },
          reviewType: pr.reviewType as any,
          overallRating: Number(pr.overallRating),
          goals: (pr.goals as any) || [],
          strengths: (pr.strengths as any) || [],
          improvementAreas: (pr.improvementAreas as any) || [],
          reviewerComments: pr.reviewerComments || undefined,
          employeeComments: pr.employeeComments || undefined,
          reviewedBy: pr.reviewedBy,
          nextReviewDate: pr.nextReviewDate || undefined,
          createdAt: pr.createdAt || new Date(),
          updatedAt: pr.updatedAt || new Date()
        };
      });
    } catch (e) {
      console.error("[PostgresStorage] getEmployeePerformanceReviews error:", e);
      return this.fallback.getEmployeePerformanceReviews(employeeId);
    }
  }

  async getPerformanceReviewsByReviewer(reviewerId: string): Promise<PerformanceReview[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb.select().from(pgPerformanceReviews)
        .where(
          and(
            eq(pgPerformanceReviews.tenantId, tenantId),
            eq(pgPerformanceReviews.reviewedBy, reviewerId)
          )
        )
        .orderBy(desc(pgPerformanceReviews.createdAt));
      return rows.map(pr => {
        const rp: any = pr.reviewPeriod || {};
        return {
          id: pr.id,
          employeeId: pr.employeeId,
          reviewPeriod: {
            startDate: rp.startDate ? new Date(rp.startDate) : new Date(),
            endDate: rp.endDate ? new Date(rp.endDate) : new Date()
          },
          reviewType: pr.reviewType as any,
          overallRating: Number(pr.overallRating),
          goals: (pr.goals as any) || [],
          strengths: (pr.strengths as any) || [],
          improvementAreas: (pr.improvementAreas as any) || [],
          reviewerComments: pr.reviewerComments || undefined,
          employeeComments: pr.employeeComments || undefined,
          reviewedBy: pr.reviewedBy,
          nextReviewDate: pr.nextReviewDate || undefined,
          createdAt: pr.createdAt || new Date(),
          updatedAt: pr.updatedAt || new Date()
        };
      });
    } catch (e) {
      console.error("[PostgresStorage] getPerformanceReviewsByReviewer error:", e);
      return this.fallback.getPerformanceReviewsByReviewer(reviewerId);
    }
  }

  async getUpcomingPerformanceReviews(): Promise<PerformanceReview[]> {
    try {
      const tenantId = await this.getTenantId();
      const now = new Date();
      const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const rows = await pgDb.select().from(pgPerformanceReviews)
        .where(
          and(
            eq(pgPerformanceReviews.tenantId, tenantId),
            gte(pgPerformanceReviews.nextReviewDate, now),
            lte(pgPerformanceReviews.nextReviewDate, nextMonth)
          )
        )
        .orderBy(pgPerformanceReviews.nextReviewDate);
      return rows.map(pr => {
        const rp: any = pr.reviewPeriod || {};
        return {
          id: pr.id,
          employeeId: pr.employeeId,
          reviewPeriod: {
            startDate: rp.startDate ? new Date(rp.startDate) : new Date(),
            endDate: rp.endDate ? new Date(rp.endDate) : new Date()
          },
          reviewType: pr.reviewType as any,
          overallRating: Number(pr.overallRating),
          goals: (pr.goals as any) || [],
          strengths: (pr.strengths as any) || [],
          improvementAreas: (pr.improvementAreas as any) || [],
          reviewerComments: pr.reviewerComments || undefined,
          employeeComments: pr.employeeComments || undefined,
          reviewedBy: pr.reviewedBy,
          nextReviewDate: pr.nextReviewDate || undefined,
          createdAt: pr.createdAt || new Date(),
          updatedAt: pr.updatedAt || new Date()
        };
      });
    } catch (e) {
      console.error("[PostgresStorage] getUpcomingPerformanceReviews error:", e);
      return this.fallback.getUpcomingPerformanceReviews();
    }
  }

  async createPerformanceReview(data: any): Promise<PerformanceReview> {
    try {
      const tenantId = await this.getTenantId();
      const [created] = await pgDb.insert(pgPerformanceReviews).values({
        tenantId,
        employeeId: data.employeeId,
        reviewPeriod: data.reviewPeriod || {},
        reviewType: data.reviewType || 'annual',
        overallRating: String(data.overallRating),
        goals: data.goals || [],
        strengths: data.strengths || [],
        improvementAreas: data.improvementAreas || [],
        reviewerComments: data.reviewerComments || null,
        employeeComments: data.employeeComments || null,
        reviewedBy: data.reviewedBy,
        nextReviewDate: data.nextReviewDate ? new Date(data.nextReviewDate) : null
      }).returning();

      try { await this.fallback.createPerformanceReview({ ...data, id: created.id }); } catch (_) {}
      const rp: any = created.reviewPeriod || {};
      return {
        id: created.id,
        employeeId: created.employeeId,
        reviewPeriod: {
          startDate: rp.startDate ? new Date(rp.startDate) : new Date(),
          endDate: rp.endDate ? new Date(rp.endDate) : new Date()
        },
        reviewType: created.reviewType as any,
        overallRating: Number(created.overallRating),
        goals: (created.goals as any) || [],
        strengths: (created.strengths as any) || [],
        improvementAreas: (created.improvementAreas as any) || [],
        reviewerComments: created.reviewerComments || undefined,
        employeeComments: created.employeeComments || undefined,
        reviewedBy: created.reviewedBy,
        nextReviewDate: created.nextReviewDate || undefined,
        createdAt: created.createdAt || new Date(),
        updatedAt: created.updatedAt || new Date()
      };
    } catch (e) {
      console.error("[PostgresStorage] createPerformanceReview error:", e);
      return this.fallback.createPerformanceReview(data);
    }
  }

  async updatePerformanceReview(id: string, data: any): Promise<PerformanceReview> {
    try {
      const tenantId = await this.getTenantId();
      const updateValues: any = { updatedAt: new Date() };
      if (data.reviewPeriod !== undefined) updateValues.reviewPeriod = data.reviewPeriod;
      if (data.reviewType !== undefined) updateValues.reviewType = data.reviewType;
      if (data.overallRating !== undefined) updateValues.overallRating = String(data.overallRating);
      if (data.goals !== undefined) updateValues.goals = data.goals;
      if (data.strengths !== undefined) updateValues.strengths = data.strengths;
      if (data.improvementAreas !== undefined) updateValues.improvementAreas = data.improvementAreas;
      if (data.reviewerComments !== undefined) updateValues.reviewerComments = data.reviewerComments;
      if (data.employeeComments !== undefined) updateValues.employeeComments = data.employeeComments;
      if (data.reviewedBy !== undefined) updateValues.reviewedBy = data.reviewedBy;
      if (data.nextReviewDate !== undefined) updateValues.nextReviewDate = data.nextReviewDate ? new Date(data.nextReviewDate) : null;

      const [updated] = await pgDb.update(pgPerformanceReviews)
        .set(updateValues)
        .where(
          and(
            eq(pgPerformanceReviews.id, id),
            eq(pgPerformanceReviews.tenantId, tenantId)
          )
        )
        .returning();

      try { await this.fallback.updatePerformanceReview(id, data); } catch (_) {}
      if (updated) {
        const rp: any = updated.reviewPeriod || {};
        return {
          id: updated.id,
          employeeId: updated.employeeId,
          reviewPeriod: {
            startDate: rp.startDate ? new Date(rp.startDate) : new Date(),
            endDate: rp.endDate ? new Date(rp.endDate) : new Date()
          },
          reviewType: updated.reviewType as any,
          overallRating: Number(updated.overallRating),
          goals: (updated.goals as any) || [],
          strengths: (updated.strengths as any) || [],
          improvementAreas: (updated.improvementAreas as any) || [],
          reviewerComments: updated.reviewerComments || undefined,
          employeeComments: updated.employeeComments || undefined,
          reviewedBy: updated.reviewedBy,
          nextReviewDate: updated.nextReviewDate || undefined,
          createdAt: updated.createdAt || new Date(),
          updatedAt: updated.updatedAt || new Date()
        };
      }
    } catch (e) {
      console.error("[PostgresStorage] updatePerformanceReview error:", e);
    }
    return this.fallback.updatePerformanceReview(id, data);
  }

  async deletePerformanceReview(id: string): Promise<boolean> {
    try {
      const tenantId = await this.getTenantId();
      await pgDb
        .delete(pgPerformanceReviews)
        .where(
          and(
            eq(pgPerformanceReviews.id, id),
            eq(pgPerformanceReviews.tenantId, tenantId)
          )
        );
      try { await this.fallback.deletePerformanceReview(id); } catch (_) {}
      return true;
    } catch (e) {
      console.error("[PostgresStorage] deletePerformanceReview error:", e);
      return this.fallback.deletePerformanceReview(id);
    }
  }

  // ===================================================================
  // DESIGNATIONS
  // ===================================================================
  async getDesignation(id: string): Promise<Designation | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [des] = await pgDb
        .select()
        .from(pgDesignations)
        .where(
          and(
            eq(pgDesignations.id, id),
            eq(pgDesignations.tenantId, tenantId)
          )
        )
        .limit(1);
      if (des) {
        return {
          id: des.id,
          name: des.name as any,
          level: des.level,
          description: des.description || undefined,
          permissions: (des.permissions as any) || [],
          createdAt: des.createdAt || new Date()
        } as Designation;
      }
    } catch (e) {
      console.error("[PostgresStorage] getDesignation error:", e);
    }
    return (this.fallback as any)?.getDesignation ? (this.fallback as any).getDesignation(id) : undefined;
  }

  async getDesignationByName(name: string): Promise<Designation | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [des] = await pgDb.select().from(pgDesignations)
        .where(and(eq(pgDesignations.tenantId, tenantId), ilike(pgDesignations.name, name)))
        .limit(1);
      if (des) {
        return {
          id: des.id,
          name: des.name as any,
          level: des.level,
          description: des.description || undefined,
          permissions: (des.permissions as any) || [],
          createdAt: des.createdAt || new Date()
        } as Designation;
      }
    } catch (e) {
      console.error("[PostgresStorage] getDesignationByName error:", e);
    }
    return (this.fallback as any)?.getDesignationByName ? (this.fallback as any).getDesignationByName(name) : undefined;
  }

  async listDesignations(): Promise<Designation[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb.select().from(pgDesignations)
        .where(eq(pgDesignations.tenantId, tenantId))
        .orderBy(desc(pgDesignations.level));
      if (rows.length > 0) {
        return rows.map(des => ({
          id: des.id,
          name: des.name as any,
          level: des.level,
          description: des.description || undefined,
          permissions: (des.permissions as any) || [],
          createdAt: des.createdAt || new Date()
        })) as Designation[];
      }
    } catch (e) {
      console.error("[PostgresStorage] listDesignations error:", e);
    }
    return [
      { id: "des_ceo", name: "CEO", level: 10, description: "Chief Executive Officer", permissions: [] },
      { id: "des_gm", name: "General Manager", level: 9, description: "General Manager", permissions: [] },
      { id: "des_officer", name: "Officer", level: 7, description: "Department Officer", permissions: [] },
      { id: "des_tl", name: "Team Leader", level: 6, description: "Team Leader", permissions: [] },
      { id: "des_exec", name: "Executive", level: 5, description: "Executive", permissions: [] },
      { id: "des_cre", name: "CRE", level: 4, description: "Customer Relationship Executive", permissions: [] },
      { id: "des_tech", name: "Technician", level: 3, description: "Solar Installation Technician", permissions: [] },
      { id: "des_welder", name: "Welder", level: 2, description: "Structure Welder", permissions: [] },
      { id: "des_houseman", name: "House Man", level: 1, description: "Office Maintenance", permissions: [] },
    ] as any;
  }

  async createDesignation(data: any): Promise<Designation> {
    try {
      const tenantId = await this.getTenantId();
      const [created] = await pgDb.insert(pgDesignations).values({
        tenantId,
        name: data.name,
        level: data.level || 1,
        description: data.description || null,
        permissions: data.permissions || []
      }).returning();

      try { await this.fallback.createDesignation(data); } catch (_) {}
      return {
        id: created.id,
        name: created.name as any,
        level: created.level,
        description: created.description || undefined,
        permissions: (created.permissions as any) || [],
        createdAt: created.createdAt || new Date()
      } as Designation;
    } catch (e) {
      console.error("[PostgresStorage] createDesignation error:", e);
      return this.fallback.createDesignation(data);
    }
  }

  async updateDesignation(id: string, data: any): Promise<Designation> {
    try {
      const tenantId = await this.getTenantId();
      const updateValues: any = { updatedAt: new Date() };
      if (data.name !== undefined) updateValues.name = data.name;
      if (data.level !== undefined) updateValues.level = data.level;
      if (data.description !== undefined) updateValues.description = data.description;
      if (data.permissions !== undefined) updateValues.permissions = data.permissions;

      const [updated] = await pgDb.update(pgDesignations)
        .set(updateValues)
        .where(and(eq(pgDesignations.tenantId, tenantId), eq(pgDesignations.id, id)))
        .returning();

      try { await this.fallback.updateDesignation(id, data); } catch (_) {}
      if (updated) {
        return {
          id: updated.id,
          name: updated.name as any,
          level: updated.level,
          description: updated.description || undefined,
          permissions: (updated.permissions as any) || [],
          createdAt: updated.createdAt || new Date()
        } as Designation;
      }
    } catch (e) {
      console.error("[PostgresStorage] updateDesignation error:", e);
    }
    return (this.fallback as any)?.updateDesignation ? (this.fallback as any).updateDesignation(id, data) : undefined;
  }

  async deleteDesignation(id: string): Promise<boolean> {
    try {
      const tenantId = await this.getTenantId();
      await pgDb.delete(pgDesignations).where(and(eq(pgDesignations.tenantId, tenantId), eq(pgDesignations.id, id)));
      try { await (this.fallback as any)?.deleteDesignation?.(id); } catch (_) {}
      return true;
    } catch (e) {
      console.error("[PostgresStorage] deleteDesignation error:", e);
      return (this.fallback as any)?.deleteDesignation ? (this.fallback as any).deleteDesignation(id) : false;
    }
  }

  // ===================================================================
  // PERMISSION GROUPS
  // ===================================================================
  async getPermissionGroup(id: string): Promise<PermissionGroup | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [pg] = await pgDb.select().from(pgPermissionGroups)
        .where(and(eq(pgPermissionGroups.tenantId, tenantId), eq(pgPermissionGroups.id, id)))
        .limit(1);
      if (pg) {
        return {
          id: pg.id,
          name: pg.name,
          department: pg.department as any,
          designation: pg.designation as any,
          permissions: (pg.permissions as any) || [],
          canApprove: pg.canApprove || false,
          maxApprovalAmount: pg.maxApprovalAmount ? Number(pg.maxApprovalAmount) : null,
          createdAt: pg.createdAt || new Date()
        } as PermissionGroup;
      }
    } catch (e) {
      console.error("[PostgresStorage] getPermissionGroup error:", e);
    }
    return (this.fallback as any)?.getPermissionGroup ? (this.fallback as any).getPermissionGroup(id) : undefined;
  }

  async getPermissionsByDepartmentAndDesignation(department: string, designation: string): Promise<PermissionGroup | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [pg] = await pgDb.select().from(pgPermissionGroups)
        .where(and(
          eq(pgPermissionGroups.tenantId, tenantId),
          ilike(pgPermissionGroups.department, department),
          ilike(pgPermissionGroups.designation, designation)
        ))
        .limit(1);
      if (pg) {
        return {
          id: pg.id,
          name: pg.name,
          department: pg.department as any,
          designation: pg.designation as any,
          permissions: (pg.permissions as any) || [],
          canApprove: pg.canApprove || false,
          maxApprovalAmount: pg.maxApprovalAmount ? Number(pg.maxApprovalAmount) : null,
          createdAt: pg.createdAt || new Date()
        } as PermissionGroup;
      }
    } catch (e) {
      console.error("[PostgresStorage] getPermissionsByDepartmentAndDesignation error:", e);
    }
    return (this.fallback as any)?.getPermissionsByDepartmentAndDesignation ? (this.fallback as any).getPermissionsByDepartmentAndDesignation(department, designation) : undefined;
  }

  async listPermissionGroups(): Promise<PermissionGroup[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb.select().from(pgPermissionGroups)
        .where(eq(pgPermissionGroups.tenantId, tenantId))
        .orderBy(desc(pgPermissionGroups.createdAt));
      return rows.map(pg => ({
        id: pg.id,
        name: pg.name,
        department: pg.department as any,
        designation: pg.designation as any,
        permissions: (pg.permissions as any) || [],
        canApprove: pg.canApprove || false,
        maxApprovalAmount: pg.maxApprovalAmount ? Number(pg.maxApprovalAmount) : null,
        createdAt: pg.createdAt || new Date()
      })) as PermissionGroup[];
    } catch (e) {
      console.error("[PostgresStorage] listPermissionGroups error:", e);
      return this.fallback.listPermissionGroups();
    }
  }

  async createPermissionGroup(data: any): Promise<PermissionGroup> {
    try {
      const tenantId = await this.getTenantId();
      const [created] = await pgDb.insert(pgPermissionGroups).values({
        tenantId,
        name: data.name,
        department: data.department,
        designation: data.designation,
        permissions: data.permissions || [],
        canApprove: data.canApprove || false,
        maxApprovalAmount: data.maxApprovalAmount != null ? String(data.maxApprovalAmount) : null
      }).returning();

      try { await this.fallback.createPermissionGroup(data); } catch (_) {}
      return {
        id: created.id,
        name: created.name,
        department: created.department as any,
        designation: created.designation as any,
        permissions: (created.permissions as any) || [],
        canApprove: created.canApprove || false,
        maxApprovalAmount: created.maxApprovalAmount ? Number(created.maxApprovalAmount) : null,
        createdAt: created.createdAt || new Date()
      } as PermissionGroup;
    } catch (e) {
      console.error("[PostgresStorage] createPermissionGroup error:", e);
      return this.fallback.createPermissionGroup(data);
    }
  }

  async updatePermissionGroup(id: string, data: any): Promise<PermissionGroup> {
    try {
      const tenantId = await this.getTenantId();
      const updateValues: any = { updatedAt: new Date() };
      if (data.name !== undefined) updateValues.name = data.name;
      if (data.department !== undefined) updateValues.department = data.department;
      if (data.designation !== undefined) updateValues.designation = data.designation;
      if (data.permissions !== undefined) updateValues.permissions = data.permissions;
      if (data.canApprove !== undefined) updateValues.canApprove = data.canApprove;
      if (data.maxApprovalAmount !== undefined) updateValues.maxApprovalAmount = data.maxApprovalAmount != null ? String(data.maxApprovalAmount) : null;

      const [updated] = await pgDb.update(pgPermissionGroups)
        .set(updateValues)
        .where(and(eq(pgPermissionGroups.tenantId, tenantId), eq(pgPermissionGroups.id, id)))
        .returning();

      try { await this.fallback.updatePermissionGroup(id, data); } catch (_) {}
      if (updated) {
        return {
          id: updated.id,
          name: updated.name,
          department: updated.department as any,
          designation: updated.designation as any,
          permissions: (updated.permissions as any) || [],
          canApprove: updated.canApprove || false,
          maxApprovalAmount: updated.maxApprovalAmount ? Number(updated.maxApprovalAmount) : null,
          createdAt: updated.createdAt || new Date()
        } as PermissionGroup;
      }
    } catch (e) {
      console.error("[PostgresStorage] updatePermissionGroup error:", e);
    }
    return (this.fallback as any)?.updatePermissionGroup ? (this.fallback as any).updatePermissionGroup(id, data) : undefined;
  }

  async deletePermissionGroup(id: string): Promise<boolean> {
    try {
      const tenantId = await this.getTenantId();
      await pgDb.delete(pgPermissionGroups).where(and(eq(pgPermissionGroups.tenantId, tenantId), eq(pgPermissionGroups.id, id)));
      try { await (this.fallback as any)?.deletePermissionGroup?.(id); } catch (_) {}
      return true;
    } catch (e) {
      console.error("[PostgresStorage] deletePermissionGroup error:", e);
      return (this.fallback as any)?.deletePermissionGroup ? (this.fallback as any).deletePermissionGroup(id) : false;
    }
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    try {
      const user = await this.getUser(userId);
      if (!user || !user.department || !user.designation) return [];
      const pg = await this.getPermissionsByDepartmentAndDesignation(user.department, user.designation);
      return pg?.permissions || [];
    } catch (e) {
      console.error("[PostgresStorage] getUserPermissions error:", e);
      return this.fallback.getUserPermissions(userId);
    }
  }

  async checkUserPermission(userId: string, permission: string): Promise<boolean> {
    try {
      const permissions = await this.getUserPermissions(userId);
      return permissions.includes(permission);
    } catch (e) {
      console.error("[PostgresStorage] checkUserPermission error:", e);
      return this.fallback.checkUserPermission(userId, permission);
    }
  }

  // ===================================================================
  // ROLES & ASSIGNMENTS & OVERRIDES
  // ===================================================================
  async getRole(id: string): Promise<Role | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [r] = await pgDb.select().from(pgRoles)
        .where(and(
          eq(pgRoles.tenantId, tenantId),
          or(eq(pgRoles.id, id), eq(pgRoles.name, id))
        ))
        .limit(1);
      if (r) {
        return {
          id: r.id,
          name: r.name,
          description: r.description || undefined,
          isSystemRole: r.isSystemRole,
          department: r.department || undefined,
          designation: r.designation || undefined,
          permissions: (r.permissions as any) || [],
          approvalLimits: r.approvalLimits as any,
          createdAt: r.createdAt || new Date(),
          updatedAt: r.updatedAt || new Date()
        };
      }
    } catch (e) {
      console.error("[PostgresStorage] getRole error:", e);
    }
    const roles = await this.listRoles();
    return roles.find(r => r.id === id || r.name === id);
  }

  async getRoleByName(name: string): Promise<Role | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [r] = await pgDb.select().from(pgRoles)
        .where(and(eq(pgRoles.tenantId, tenantId), ilike(pgRoles.name, name)))
        .limit(1);
      if (r) {
        return {
          id: r.id,
          name: r.name,
          description: r.description || undefined,
          isSystemRole: r.isSystemRole,
          department: r.department || undefined,
          designation: r.designation || undefined,
          permissions: (r.permissions as any) || [],
          approvalLimits: r.approvalLimits as any,
          createdAt: r.createdAt || new Date(),
          updatedAt: r.updatedAt || new Date()
        };
      }
    } catch (e) {
      console.error("[PostgresStorage] getRoleByName error:", e);
    }
    return this.fallback.getRoleByName(name);
  }

  async listRoles(): Promise<Role[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb.select().from(pgRoles).where(eq(pgRoles.tenantId, tenantId));
      if (rows.length > 0) {
        return rows.map(r => ({
          id: r.id,
          name: r.name,
          description: r.description || undefined,
          isSystemRole: r.isSystemRole,
          department: r.department || undefined,
          designation: r.designation || undefined,
          permissions: (r.permissions as any) || [],
          approvalLimits: r.approvalLimits as any,
          createdAt: r.createdAt || new Date(),
          updatedAt: r.updatedAt || new Date()
        }));
      }
    } catch (e) {
      console.error("[PostgresStorage] listRoles error:", e);
    }
    return [
      { id: "role_master_admin", name: "master_admin", description: "Full system administration", isSystemRole: true, permissions: ["*"], createdAt: new Date(), updatedAt: new Date() },
      { id: "role_admin", name: "admin", description: "Operational and departmental administration", isSystemRole: true, permissions: ["attendance.manage", "payroll.manage", "crm.manage"], createdAt: new Date(), updatedAt: new Date() },
      { id: "role_employee", name: "employee", description: "Standard employee access", isSystemRole: true, permissions: ["attendance.view", "attendance.checkin"], createdAt: new Date(), updatedAt: new Date() }
    ];
  }

  async createRole(data: any): Promise<Role> {
    try {
      const tenantId = await this.getTenantId();
      const [created] = await pgDb.insert(pgRoles).values({
        tenantId,
        name: data.name,
        description: data.description || null,
        isSystemRole: data.isSystemRole || false,
        department: data.department || null,
        designation: data.designation || null,
        permissions: data.permissions || [],
        approvalLimits: data.approvalLimits || null
      }).returning();

      try { await this.fallback.createRole(data); } catch (_) {}
      return {
        id: created.id,
        name: created.name,
        description: created.description || undefined,
        isSystemRole: created.isSystemRole,
        department: created.department || undefined,
        designation: created.designation || undefined,
        permissions: (created.permissions as any) || [],
        approvalLimits: created.approvalLimits as any,
        createdAt: created.createdAt || new Date(),
        updatedAt: created.updatedAt || new Date()
      };
    } catch (e) {
      console.error("[PostgresStorage] createRole error:", e);
      return this.fallback.createRole(data);
    }
  }

  async updateRole(id: string, data: any): Promise<Role> {
    try {
      const tenantId = await this.getTenantId();
      const updateValues: any = { updatedAt: new Date() };
      if (data.name !== undefined) updateValues.name = data.name;
      if (data.description !== undefined) updateValues.description = data.description;
      if (data.isSystemRole !== undefined) updateValues.isSystemRole = data.isSystemRole;
      if (data.department !== undefined) updateValues.department = data.department;
      if (data.designation !== undefined) updateValues.designation = data.designation;
      if (data.permissions !== undefined) updateValues.permissions = data.permissions;
      if (data.approvalLimits !== undefined) updateValues.approvalLimits = data.approvalLimits;

      const [updated] = await pgDb.update(pgRoles)
        .set(updateValues)
        .where(and(eq(pgRoles.tenantId, tenantId), eq(pgRoles.id, id)))
        .returning();

      try { await this.fallback.updateRole(id, data); } catch (_) {}
      if (updated) {
        return {
          id: updated.id,
          name: updated.name,
          description: updated.description || undefined,
          isSystemRole: updated.isSystemRole,
          department: updated.department || undefined,
          designation: updated.designation || undefined,
          permissions: (updated.permissions as any) || [],
          approvalLimits: updated.approvalLimits as any,
          createdAt: updated.createdAt || new Date(),
          updatedAt: updated.updatedAt || new Date()
        };
      }
    } catch (e) {
      console.error("[PostgresStorage] updateRole error:", e);
    }
    return this.fallback.updateRole(id, data);
  }

  async deleteRole(id: string): Promise<boolean> {
    try {
      const tenantId = await this.getTenantId();
      await pgDb.delete(pgRoles).where(and(eq(pgRoles.tenantId, tenantId), eq(pgRoles.id, id)));
      try { await this.fallback.deleteRole(id); } catch (_) {}
      return true;
    } catch (e) {
      console.error("[PostgresStorage] deleteRole error:", e);
      return this.fallback.deleteRole(id);
    }
  }

  async getUserRoleAssignments(userId: string): Promise<UserRoleAssignment[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb.select().from(pgUserRoleAssignments)
        .where(and(
          eq(pgUserRoleAssignments.tenantId, tenantId),
          eq(pgUserRoleAssignments.userId, userId),
          eq(pgUserRoleAssignments.isActive, true)
        ));
      return rows.map(r => ({
        id: r.id,
        userId: r.userId,
        roleId: r.roleId,
        assignedBy: r.assignedBy,
        effectiveFrom: r.effectiveFrom || new Date(),
        effectiveTo: r.effectiveTo || null,
        isActive: r.isActive,
        createdAt: r.createdAt || new Date()
      }));
    } catch (e) {
      console.error("[PostgresStorage] getUserRoleAssignments error:", e);
      return this.fallback.getUserRoleAssignments(userId);
    }
  }

  async getRoleAssignment(id: string): Promise<UserRoleAssignment | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [r] = await pgDb.select().from(pgUserRoleAssignments)
        .where(and(
          eq(pgUserRoleAssignments.tenantId, tenantId),
          eq(pgUserRoleAssignments.id, id)
        ))
        .limit(1);
      if (r) {
        return {
          id: r.id,
          userId: r.userId,
          roleId: r.roleId,
          assignedBy: r.assignedBy,
          effectiveFrom: r.effectiveFrom || new Date(),
          effectiveTo: r.effectiveTo || null,
          isActive: r.isActive,
          createdAt: r.createdAt || new Date()
        };
      }
    } catch (e) {
      console.error("[PostgresStorage] getRoleAssignment error:", e);
    }
    return this.fallback.getRoleAssignment(id);
  }

  async assignUserRole(data: any): Promise<UserRoleAssignment> {
    try {
      const tenantId = await this.getTenantId();
      const [created] = await pgDb.insert(pgUserRoleAssignments).values({
        tenantId,
        userId: data.userId,
        roleId: data.roleId,
        assignedBy: data.assignedBy,
        effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : new Date(),
        effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
        isActive: data.isActive !== undefined ? data.isActive : true
      }).returning();

      try { await this.fallback.assignUserRole(data); } catch (_) {}
      return {
        id: created.id,
        userId: created.userId,
        roleId: created.roleId,
        assignedBy: created.assignedBy,
        effectiveFrom: created.effectiveFrom || new Date(),
        effectiveTo: created.effectiveTo || null,
        isActive: created.isActive,
        createdAt: created.createdAt || new Date()
      };
    } catch (e) {
      console.error("[PostgresStorage] assignUserRole error:", e);
      return this.fallback.assignUserRole(data);
    }
  }

  async revokeUserRole(userId: string, roleId: string): Promise<boolean> {
    try {
      const tenantId = await this.getTenantId();
      await pgDb.update(pgUserRoleAssignments)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(pgUserRoleAssignments.tenantId, tenantId),
          eq(pgUserRoleAssignments.userId, userId),
          eq(pgUserRoleAssignments.roleId, roleId)
        ));
      try { await this.fallback.revokeUserRole(userId, roleId); } catch (_) {}
      return true;
    } catch (e) {
      console.error("[PostgresStorage] revokeUserRole error:", e);
      return this.fallback.revokeUserRole(userId, roleId);
    }
  }

  async getUserPermissionOverrides(userId: string): Promise<PermissionOverride[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb.select().from(pgPermissionOverrides)
        .where(and(
          eq(pgPermissionOverrides.tenantId, tenantId),
          eq(pgPermissionOverrides.userId, userId)
        ));
      return rows.map(r => ({
        id: r.id,
        userId: r.userId,
        permission: r.permission,
        granted: r.granted,
        reason: r.reason,
        grantedBy: r.grantedBy,
        effectiveFrom: r.effectiveFrom || new Date(),
        effectiveTo: r.effectiveTo || null,
        createdAt: r.createdAt || new Date()
      }));
    } catch (e) {
      console.error("[PostgresStorage] getUserPermissionOverrides error:", e);
      return this.fallback.getUserPermissionOverrides(userId);
    }
  }

  async createPermissionOverride(data: any): Promise<PermissionOverride> {
    try {
      const tenantId = await this.getTenantId();
      const [created] = await pgDb.insert(pgPermissionOverrides).values({
        tenantId,
        userId: data.userId,
        permission: data.permission,
        granted: data.granted,
        reason: data.reason,
        grantedBy: data.grantedBy,
        effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : new Date(),
        effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null
      }).returning();

      try { await this.fallback.createPermissionOverride(data); } catch (_) {}
      return {
        id: created.id,
        userId: created.userId,
        permission: created.permission,
        granted: created.granted,
        reason: created.reason,
        grantedBy: created.grantedBy,
        effectiveFrom: created.effectiveFrom || new Date(),
        effectiveTo: created.effectiveTo || null,
        createdAt: created.createdAt || new Date()
      };
    } catch (e) {
      console.error("[PostgresStorage] createPermissionOverride error:", e);
      return this.fallback.createPermissionOverride(data);
    }
  }

  async revokePermissionOverride(id: string): Promise<boolean> {
    try {
      const tenantId = await this.getTenantId();
      await pgDb.delete(pgPermissionOverrides)
        .where(and(
          eq(pgPermissionOverrides.tenantId, tenantId),
          eq(pgPermissionOverrides.id, id)
        ));
      try { await this.fallback.revokePermissionOverride(id); } catch (_) {}
      return true;
    } catch (e) {
      console.error("[PostgresStorage] revokePermissionOverride error:", e);
      return this.fallback.revokePermissionOverride(id);
    }
  }

  // ===================================================================
  // ATTENDANCE POLICIES
  // ===================================================================
  async getAttendancePolicy(id: string): Promise<AttendancePolicy | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [p] = await pgDb.select().from(pgAttendancePolicies)
        .where(and(
          eq(pgAttendancePolicies.tenantId, tenantId),
          eq(pgAttendancePolicies.id, id)
        ))
        .limit(1);
      if (p) {
        return {
          id: p.id,
          name: p.name,
          department: p.department || undefined,
          designation: p.designation || undefined,
          checkInTime: p.checkInTime || "9:30 AM",
          checkOutTime: p.checkOutTime || "6:30 PM",
          flexibleTiming: p.flexibleTiming,
          flexibilityMinutes: p.flexibilityMinutes || 0,
          overtimeAllowed: p.overtimeAllowed,
          maxOvertimeHours: Number(p.maxOvertimeHours || 4),
          overtimeApprovalRequired: p.overtimeApprovalRequired,
          lateMarkAfterMinutes: p.lateMarkAfterMinutes || 15,
          halfDayMarkAfterMinutes: p.halfDayMarkAfterMinutes || 240,
          weekendDays: (p.weekendDays as number[]) || [0, 6],
          holidayPolicy: (p.holidayPolicy as any) || "paid",
          isActive: p.isActive,
          createdBy: p.createdBy,
          createdAt: p.createdAt || new Date(),
          updatedAt: p.updatedAt || new Date()
        };
      }
    } catch (e) {
      console.error("[PostgresStorage] getAttendancePolicy error:", e);
    }
    return this.fallback.getAttendancePolicy(id);
  }

  async getAttendancePolicyByDepartment(department: string, designation?: string): Promise<AttendancePolicy | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const conditions = [
        eq(pgAttendancePolicies.tenantId, tenantId),
        eq(pgAttendancePolicies.department, department),
        eq(pgAttendancePolicies.isActive, true)
      ];
      if (designation) conditions.push(eq(pgAttendancePolicies.designation, designation));

      const [p] = await pgDb.select().from(pgAttendancePolicies)
        .where(and(...conditions))
        .limit(1);
      if (p) {
        return {
          id: p.id,
          name: p.name,
          department: p.department || undefined,
          designation: p.designation || undefined,
          checkInTime: p.checkInTime || "9:30 AM",
          checkOutTime: p.checkOutTime || "6:30 PM",
          flexibleTiming: p.flexibleTiming,
          flexibilityMinutes: p.flexibilityMinutes || 0,
          overtimeAllowed: p.overtimeAllowed,
          maxOvertimeHours: Number(p.maxOvertimeHours || 4),
          overtimeApprovalRequired: p.overtimeApprovalRequired,
          lateMarkAfterMinutes: p.lateMarkAfterMinutes || 15,
          halfDayMarkAfterMinutes: p.halfDayMarkAfterMinutes || 240,
          weekendDays: (p.weekendDays as number[]) || [0, 6],
          holidayPolicy: (p.holidayPolicy as any) || "paid",
          isActive: p.isActive,
          createdBy: p.createdBy,
          createdAt: p.createdAt || new Date(),
          updatedAt: p.updatedAt || new Date()
        };
      }
    } catch (e) {
      console.error("[PostgresStorage] getAttendancePolicyByDepartment error:", e);
    }
    return this.fallback.getAttendancePolicyByDepartment(department, designation);
  }

  async listAttendancePolicies(): Promise<AttendancePolicy[]> {
    try {
      const tenantId = await this.getTenantId();
      const rows = await pgDb.select().from(pgAttendancePolicies)
        .where(eq(pgAttendancePolicies.tenantId, tenantId))
        .orderBy(desc(pgAttendancePolicies.createdAt));
      return rows.map(p => ({
        id: p.id,
        name: p.name,
        department: p.department || undefined,
        designation: p.designation || undefined,
        checkInTime: p.checkInTime || "9:30 AM",
        checkOutTime: p.checkOutTime || "6:30 PM",
        flexibleTiming: p.flexibleTiming,
        flexibilityMinutes: p.flexibilityMinutes || 0,
        overtimeAllowed: p.overtimeAllowed,
        maxOvertimeHours: Number(p.maxOvertimeHours || 4),
        overtimeApprovalRequired: p.overtimeApprovalRequired,
        lateMarkAfterMinutes: p.lateMarkAfterMinutes || 15,
        halfDayMarkAfterMinutes: p.halfDayMarkAfterMinutes || 240,
        weekendDays: (p.weekendDays as number[]) || [0, 6],
        holidayPolicy: (p.holidayPolicy as any) || "paid",
        isActive: p.isActive,
        createdBy: p.createdBy,
        createdAt: p.createdAt || new Date(),
        updatedAt: p.updatedAt || new Date()
      }));
    } catch (e) {
      console.error("[PostgresStorage] listAttendancePolicies error:", e);
      return this.fallback.listAttendancePolicies();
    }
  }

  async createAttendancePolicy(data: any): Promise<AttendancePolicy> {
    try {
      const tenantId = await this.getTenantId();
      const [created] = await pgDb.insert(pgAttendancePolicies).values({
        tenantId,
        name: data.name,
        department: data.department || null,
        designation: data.designation || null,
        checkInTime: data.checkInTime || "9:30 AM",
        checkOutTime: data.checkOutTime || "6:30 PM",
        flexibleTiming: data.flexibleTiming !== undefined ? data.flexibleTiming : false,
        flexibilityMinutes: data.flexibilityMinutes || 0,
        overtimeAllowed: data.overtimeAllowed !== undefined ? data.overtimeAllowed : true,
        maxOvertimeHours: data.maxOvertimeHours != null ? String(data.maxOvertimeHours) : "4",
        overtimeApprovalRequired: data.overtimeApprovalRequired !== undefined ? data.overtimeApprovalRequired : true,
        lateMarkAfterMinutes: data.lateMarkAfterMinutes || 15,
        halfDayMarkAfterMinutes: data.halfDayMarkAfterMinutes || 240,
        weekendDays: data.weekendDays || [0, 6],
        holidayPolicy: data.holidayPolicy || "paid",
        isActive: data.isActive !== undefined ? data.isActive : true,
        createdBy: data.createdBy || "system"
      }).returning();

      try { await this.fallback.createAttendancePolicy(data); } catch (_) {}
      return {
        id: created.id,
        name: created.name,
        department: created.department || undefined,
        designation: created.designation || undefined,
        checkInTime: created.checkInTime || "9:30 AM",
        checkOutTime: created.checkOutTime || "6:30 PM",
        flexibleTiming: created.flexibleTiming,
        flexibilityMinutes: created.flexibilityMinutes || 0,
        overtimeAllowed: created.overtimeAllowed,
        maxOvertimeHours: Number(created.maxOvertimeHours || 4),
        overtimeApprovalRequired: created.overtimeApprovalRequired,
        lateMarkAfterMinutes: created.lateMarkAfterMinutes || 15,
        halfDayMarkAfterMinutes: created.halfDayMarkAfterMinutes || 240,
        weekendDays: (created.weekendDays as number[]) || [0, 6],
        holidayPolicy: (created.holidayPolicy as any) || "paid",
        isActive: created.isActive,
        createdBy: created.createdBy,
        createdAt: created.createdAt || new Date(),
        updatedAt: created.updatedAt || new Date()
      };
    } catch (e) {
      console.error("[PostgresStorage] createAttendancePolicy error:", e);
      return this.fallback.createAttendancePolicy(data);
    }
  }

  async updateAttendancePolicy(id: string, data: any): Promise<AttendancePolicy> {
    try {
      const tenantId = await this.getTenantId();
      const updateValues: any = { updatedAt: new Date() };
      if (data.name !== undefined) updateValues.name = data.name;
      if (data.department !== undefined) updateValues.department = data.department;
      if (data.designation !== undefined) updateValues.designation = data.designation;
      if (data.checkInTime !== undefined) updateValues.checkInTime = data.checkInTime;
      if (data.checkOutTime !== undefined) updateValues.checkOutTime = data.checkOutTime;
      if (data.flexibleTiming !== undefined) updateValues.flexibleTiming = data.flexibleTiming;
      if (data.flexibilityMinutes !== undefined) updateValues.flexibilityMinutes = data.flexibilityMinutes;
      if (data.overtimeAllowed !== undefined) updateValues.overtimeAllowed = data.overtimeAllowed;
      if (data.maxOvertimeHours !== undefined) updateValues.maxOvertimeHours = String(data.maxOvertimeHours);
      if (data.overtimeApprovalRequired !== undefined) updateValues.overtimeApprovalRequired = data.overtimeApprovalRequired;
      if (data.lateMarkAfterMinutes !== undefined) updateValues.lateMarkAfterMinutes = data.lateMarkAfterMinutes;
      if (data.halfDayMarkAfterMinutes !== undefined) updateValues.halfDayMarkAfterMinutes = data.halfDayMarkAfterMinutes;
      if (data.weekendDays !== undefined) updateValues.weekendDays = data.weekendDays;
      if (data.holidayPolicy !== undefined) updateValues.holidayPolicy = data.holidayPolicy;
      if (data.isActive !== undefined) updateValues.isActive = data.isActive;

      const [updated] = await pgDb.update(pgAttendancePolicies)
        .set(updateValues)
        .where(and(
          eq(pgAttendancePolicies.tenantId, tenantId),
          eq(pgAttendancePolicies.id, id)
        ))
        .returning();

      try { await this.fallback.updateAttendancePolicy(id, data); } catch (_) {}
      if (updated) {
        return {
          id: updated.id,
          name: updated.name,
          department: updated.department || undefined,
          designation: updated.designation || undefined,
          checkInTime: updated.checkInTime || "9:30 AM",
          checkOutTime: updated.checkOutTime || "6:30 PM",
          flexibleTiming: updated.flexibleTiming,
          flexibilityMinutes: updated.flexibilityMinutes || 0,
          overtimeAllowed: updated.overtimeAllowed,
          maxOvertimeHours: Number(updated.maxOvertimeHours || 4),
          overtimeApprovalRequired: updated.overtimeApprovalRequired,
          lateMarkAfterMinutes: updated.lateMarkAfterMinutes || 15,
          halfDayMarkAfterMinutes: updated.halfDayMarkAfterMinutes || 240,
          weekendDays: (updated.weekendDays as number[]) || [0, 6],
          holidayPolicy: (updated.holidayPolicy as any) || "paid",
          isActive: updated.isActive,
          createdBy: updated.createdBy,
          createdAt: updated.createdAt || new Date(),
          updatedAt: updated.updatedAt || new Date()
        };
      }
    } catch (e) {
      console.error("[PostgresStorage] updateAttendancePolicy error:", e);
    }
    return this.fallback.updateAttendancePolicy(id, data);
  }

  // ===================================================================
  // PAYROLL FIELD CONFIGS
  // ===================================================================
  async getPayrollFieldConfig(id: string): Promise<PayrollFieldConfig | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [cfg] = await pgDb.select().from(pgPayrollFieldConfigs)
        .where(and(
          eq(pgPayrollFieldConfigs.tenantId, tenantId),
          eq(pgPayrollFieldConfigs.id, id)
        ))
        .limit(1);
      if (cfg) {
        return {
          id: cfg.id,
          name: cfg.name,
          displayName: cfg.displayName,
          category: cfg.category as any,
          dataType: cfg.dataType as any,
          isRequired: cfg.isRequired,
          isSystemField: cfg.isSystemField,
          defaultValue: cfg.defaultValue != null ? Number(cfg.defaultValue) : undefined,
          sortOrder: cfg.sortOrder,
          isActive: cfg.isActive,
          createdAt: cfg.createdAt || new Date(),
          updatedAt: cfg.updatedAt || new Date()
        };
      }
    } catch (e) {
      console.error("[PostgresStorage] getPayrollFieldConfig error:", e);
    }
    return (this.fallback as any)?.getPayrollFieldConfig ? (this.fallback as any).getPayrollFieldConfig(id) : undefined;
  }

  async listPayrollFieldConfigs(filters?: any): Promise<PayrollFieldConfig[]> {
    try {
      const tenantId = await this.getTenantId();
      const conditions = [eq(pgPayrollFieldConfigs.tenantId, tenantId)];
      if (filters?.category) conditions.push(eq(pgPayrollFieldConfigs.category, filters.category));
      if (filters?.isActive !== undefined) conditions.push(eq(pgPayrollFieldConfigs.isActive, filters.isActive));

      const rows = await pgDb.select().from(pgPayrollFieldConfigs)
        .where(and(...conditions))
        .orderBy(pgPayrollFieldConfigs.sortOrder);
      return rows.map(cfg => ({
        id: cfg.id,
        name: cfg.name,
        displayName: cfg.displayName,
        category: cfg.category as any,
        dataType: cfg.dataType as any,
        isRequired: cfg.isRequired,
        isSystemField: cfg.isSystemField,
        defaultValue: cfg.defaultValue != null ? Number(cfg.defaultValue) : undefined,
        sortOrder: cfg.sortOrder,
        isActive: cfg.isActive,
        createdAt: cfg.createdAt || new Date(),
        updatedAt: cfg.updatedAt || new Date()
      }));
    } catch (e) {
      console.error("[PostgresStorage] listPayrollFieldConfigs error:", e);
      return (this.fallback.listPayrollFieldConfigs as any)(filters);
    }
  }

  async createPayrollFieldConfig(data: any): Promise<PayrollFieldConfig> {
    try {
      const tenantId = await this.getTenantId();
      const [created] = await pgDb.insert(pgPayrollFieldConfigs).values({
        tenantId,
        name: data.name,
        displayName: data.displayName,
        category: data.category,
        dataType: data.dataType,
        isRequired: data.isRequired !== undefined ? data.isRequired : false,
        isSystemField: data.isSystemField !== undefined ? data.isSystemField : false,
        defaultValue: data.defaultValue != null ? String(data.defaultValue) : null,
        department: data.department || null,
        sortOrder: data.sortOrder || 1,
        isActive: data.isActive !== undefined ? data.isActive : true
      }).returning();

      try { await this.fallback.createPayrollFieldConfig({ ...data, id: created.id }); } catch (_) {}
      return {
        id: created.id,
        name: created.name,
        displayName: created.displayName,
        category: created.category as any,
        dataType: created.dataType as any,
        isRequired: created.isRequired,
        isSystemField: created.isSystemField,
        defaultValue: created.defaultValue != null ? Number(created.defaultValue) : undefined,
        sortOrder: created.sortOrder,
        isActive: created.isActive,
        createdAt: created.createdAt || new Date(),
        updatedAt: created.updatedAt || new Date()
      };
    } catch (e) {
      console.error("[PostgresStorage] createPayrollFieldConfig error:", e);
      return this.fallback.createPayrollFieldConfig(data);
    }
  }

  async updatePayrollFieldConfig(id: string, data: any): Promise<PayrollFieldConfig> {
    try {
      const tenantId = await this.getTenantId();
      const updateValues: any = { updatedAt: new Date() };
      if (data.name !== undefined) updateValues.name = data.name;
      if (data.displayName !== undefined) updateValues.displayName = data.displayName;
      if (data.category !== undefined) updateValues.category = data.category;
      if (data.dataType !== undefined) updateValues.dataType = data.dataType;
      if (data.isRequired !== undefined) updateValues.isRequired = data.isRequired;
      if (data.isSystemField !== undefined) updateValues.isSystemField = data.isSystemField;
      if (data.defaultValue !== undefined) updateValues.defaultValue = data.defaultValue != null ? String(data.defaultValue) : null;
      if (data.department !== undefined) updateValues.department = data.department;
      if (data.sortOrder !== undefined) updateValues.sortOrder = data.sortOrder;
      if (data.isActive !== undefined) updateValues.isActive = data.isActive;

      const [updated] = await pgDb.update(pgPayrollFieldConfigs)
        .set(updateValues)
        .where(and(
          eq(pgPayrollFieldConfigs.tenantId, tenantId),
          eq(pgPayrollFieldConfigs.id, id)
        ))
        .returning();

      try { await this.fallback.updatePayrollFieldConfig(id, data); } catch (_) {}
      if (updated) {
        return {
          id: updated.id,
          name: updated.name,
          displayName: updated.displayName,
          category: updated.category as any,
          dataType: updated.dataType as any,
          isRequired: updated.isRequired,
          isSystemField: updated.isSystemField,
          defaultValue: updated.defaultValue != null ? Number(updated.defaultValue) : undefined,
          sortOrder: updated.sortOrder,
          isActive: updated.isActive,
          createdAt: updated.createdAt || new Date(),
          updatedAt: updated.updatedAt || new Date()
        };
      }
    } catch (e) {
      console.error("[PostgresStorage] updatePayrollFieldConfig error:", e);
    }
    return (this.fallback as any)?.updatePayrollFieldConfig ? (this.fallback as any).updatePayrollFieldConfig(id, data) : undefined;
  }

  async deletePayrollFieldConfig(id: string): Promise<boolean> {
    try {
      const tenantId = await this.getTenantId();
      await pgDb.delete(pgPayrollFieldConfigs).where(and(
        eq(pgPayrollFieldConfigs.tenantId, tenantId),
        eq(pgPayrollFieldConfigs.id, id)
      ));
      try { await (this.fallback as any)?.deletePayrollFieldConfig?.(id); } catch (_) {}
      return true;
    } catch (e) {
      console.error("[PostgresStorage] deletePayrollFieldConfig error:", e);
      return (this.fallback as any)?.deletePayrollFieldConfig ? (this.fallback as any).deletePayrollFieldConfig(id) : false;
    }
  }

  // ===================================================================
  // DEPARTMENTS
  // ===================================================================
  async getDepartment(id: string): Promise<Department | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [dept] = await pgDb.select().from(pgDepartments)
        .where(and(
          eq(pgDepartments.tenantId, tenantId),
          eq(pgDepartments.id, id)
        ))
        .limit(1);
      if (dept) {
        return {
          id: dept.id,
          name: dept.name,
          code: dept.code || undefined,
          description: dept.description || undefined,
          managerId: dept.managerId || undefined,
          isActive: dept.isActive,
          createdAt: dept.createdAt || new Date(),
          updatedAt: dept.updatedAt || new Date()
        } as Department;
      }
    } catch (e) {
      console.error("[PostgresStorage] getDepartment error:", e);
    }
    return (this.fallback as any)?.getDepartment ? (this.fallback as any).getDepartment(id) : undefined;
  }

  async getDepartmentByName(name: string): Promise<Department | undefined> {
    try {
      const tenantId = await this.getTenantId();
      const [dept] = await pgDb.select().from(pgDepartments)
        .where(and(eq(pgDepartments.tenantId, tenantId), ilike(pgDepartments.name, name)))
        .limit(1);
      if (dept) {
        return {
          id: dept.id,
          name: dept.name,
          code: dept.code || undefined,
          description: dept.description || undefined,
          managerId: dept.managerId || undefined,
          isActive: dept.isActive,
          createdAt: dept.createdAt || new Date(),
          updatedAt: dept.updatedAt || new Date()
        } as Department;
      }
    } catch (e) {
      console.error("[PostgresStorage] getDepartmentByName error:", e);
    }
    return (this.fallback as any)?.getDepartmentByName ? (this.fallback as any).getDepartmentByName(name) : undefined;
  }

  async createDepartment(data: any): Promise<Department> {
    try {
      const tenantId = await this.getTenantId();
      const [created] = await pgDb.insert(pgDepartments).values({
        tenantId,
        name: data.name,
        code: data.code || null,
        description: data.description || null,
        managerId: data.managerId || null,
        isActive: data.isActive !== undefined ? data.isActive : true,
      }).returning();

      try { await (this.fallback as any)?.createDepartment?.(data); } catch (_) {}
      return {
        id: created.id,
        name: created.name,
        code: created.code || undefined,
        description: created.description || undefined,
        managerId: created.managerId || undefined,
        isActive: created.isActive,
        createdAt: created.createdAt || new Date(),
        updatedAt: created.updatedAt || new Date()
      } as Department;
    } catch (e) {
      console.error("[PostgresStorage] createDepartment error:", e);
      return (this.fallback as any)?.createDepartment ? (this.fallback as any).createDepartment(data) : undefined;
    }
  }

  async updateDepartment(id: string, data: any): Promise<Department> {
    try {
      const tenantId = await this.getTenantId();
      const updateValues: any = { updatedAt: new Date() };
      if (data.name !== undefined) updateValues.name = data.name;
      if (data.code !== undefined) updateValues.code = data.code;
      if (data.description !== undefined) updateValues.description = data.description;
      if (data.managerId !== undefined) updateValues.managerId = data.managerId;
      if (data.isActive !== undefined) updateValues.isActive = data.isActive;

      const [updated] = await pgDb.update(pgDepartments)
        .set(updateValues)
        .where(and(
          eq(pgDepartments.tenantId, tenantId),
          eq(pgDepartments.id, id)
        ))
        .returning();

      try { await (this.fallback as any)?.updateDepartment?.(id, data); } catch (_) {}
      if (updated) {
        return {
          id: updated.id,
          name: updated.name,
          code: updated.code || undefined,
          description: updated.description || undefined,
          managerId: updated.managerId || undefined,
          isActive: updated.isActive,
          createdAt: updated.createdAt || new Date(),
          updatedAt: updated.updatedAt || new Date()
        } as Department;
      }
    } catch (e) {
      console.error("[PostgresStorage] updateDepartment error:", e);
    }
    return (this.fallback as any)?.updateDepartment ? (this.fallback as any).updateDepartment(id, data) : undefined;
  }

  async deleteDepartment(id: string): Promise<boolean> {
    try {
      const tenantId = await this.getTenantId();
      await pgDb.delete(pgDepartments).where(and(
        eq(pgDepartments.tenantId, tenantId),
        eq(pgDepartments.id, id)
      ));
      try { await (this.fallback as any)?.deleteDepartment?.(id); } catch (_) {}
      return true;
    } catch (e) {
      console.error("[PostgresStorage] deleteDepartment error:", e);
      return (this.fallback as any)?.deleteDepartment ? (this.fallback as any).deleteDepartment(id) : false;
    }
  }
}

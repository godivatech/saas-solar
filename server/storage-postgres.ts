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
  FixedHoliday
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
  notifications as pgNotifications
} from "@shared/schema.postgres";
import { eq, or, ilike, and, desc, sql, gte, lte } from "drizzle-orm";

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
      isActive: u.isActive,
      employeeStatus: u.employeeStatus as any,
      permissions: (u.permissions as string[]) || [],
      phone: u.phone || undefined,
      profilePhotoUrl: u.profilePhotoUrl || undefined,
      aadharCardUrl: u.aadharCardUrl || undefined,
      panCardUrl: u.panCardUrl || undefined,
      bankDetails: u.bankDetails || undefined,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt
    } as unknown as User;
  }

  async getUser(idOrUid: string): Promise<User | undefined> {
    try {
      const [u] = await pgDb
        .select()
        .from(pgUsers)
        .where(or(eq(pgUsers.id, idOrUid), eq(pgUsers.firebaseUid, idOrUid)))
        .limit(1);

      if (u) {
        return {
          id: u.id,
          uid: u.firebaseUid,
          email: u.email,
          displayName: u.displayName,
          role: u.role as any,
          department: u.department as any,
          designation: u.designation as any,
          employeeId: u.employeeId || undefined,
          isActive: u.isActive,
          employeeStatus: u.employeeStatus as any,
          permissions: (u.permissions as string[]) || [],
          createdAt: u.createdAt
        };
      }
    } catch (e) {
      console.error("[PostgresStorage] getUser error, delegating to fallback:", e);
    }
    return this.fallback.getUser(idOrUid);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      const [u] = await pgDb
        .select()
        .from(pgUsers)
        .where(eq(pgUsers.email, email.trim().toLowerCase()))
        .limit(1);

      if (u) {
        return {
          id: u.id,
          uid: u.firebaseUid,
          email: u.email,
          displayName: u.displayName,
          role: u.role as any,
          department: u.department as any,
          designation: u.designation as any,
          employeeId: u.employeeId || undefined,
          isActive: u.isActive,
          employeeStatus: u.employeeStatus as any,
          permissions: (u.permissions as string[]) || [],
          createdAt: u.createdAt
        };
      }
    } catch (e) {
      console.error("[PostgresStorage] getUserByEmail error, delegating:", e);
    }
    return this.fallback.getUserByEmail(email);
  }

  async listUsers(): Promise<User[]> {
    try {
      const rows = await pgDb.select().from(pgUsers).orderBy(desc(pgUsers.createdAt));
      if (rows.length > 0) {
        return rows.map(u => ({
          id: u.id,
          uid: u.firebaseUid,
          email: u.email,
          displayName: u.displayName,
          role: u.role as any,
          department: u.department as any,
          designation: u.designation as any,
          employeeId: u.employeeId || undefined,
          isActive: u.isActive,
          employeeStatus: u.employeeStatus as any,
          permissions: (u.permissions as string[]) || [],
          createdAt: u.createdAt
        }));
      }
    } catch (e) {
      console.error("[PostgresStorage] listUsers error, delegating:", e);
    }
    return (this.fallback as any).listUsers ? (this.fallback as any).listUsers() : [];
  }

  async createUser(data: any): Promise<User> {
    try {
      const tenantId = await this.getTenantId();
      const [u] = await pgDb.insert(pgUsers).values({
        tenantId,
        firebaseUid: data.uid || data.firebaseUid || `user_${Date.now()}`,
        email: data.email,
        displayName: data.displayName,
        role: data.role || "employee",
        department: data.department || "operations",
        designation: data.designation || null,
        employeeId: data.employeeId || null,
        isActive: data.isActive ?? true,
        employeeStatus: data.employeeStatus || "active",
        permissions: data.permissions || []
      }).returning();

      try { await this.fallback.createUser(data); } catch (_) {}

      return {
        id: u.id,
        uid: u.firebaseUid,
        email: u.email,
        displayName: u.displayName,
        role: u.role as any,
        department: u.department as any,
        designation: u.designation as any,
        employeeId: u.employeeId || undefined,
        isActive: u.isActive,
        employeeStatus: u.employeeStatus as any,
        permissions: (u.permissions as string[]) || [],
        createdAt: u.createdAt
      };
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
      if (data.isActive !== undefined) updateValues.isActive = data.isActive;
      if (data.employeeStatus !== undefined) updateValues.employeeStatus = data.employeeStatus;
      if (data.permissions !== undefined) updateValues.permissions = data.permissions;

      const [u] = await pgDb
        .update(pgUsers)
        .set(updateValues)
        .where(or(eq(pgUsers.id, id), eq(pgUsers.firebaseUid, id)))
        .returning();

      try { await this.fallback.updateUser(id, data); } catch (_) {}

      if (u) {
        return {
          id: u.id,
          uid: u.firebaseUid,
          email: u.email,
          displayName: u.displayName,
          role: u.role as any,
          department: u.department as any,
          designation: u.designation as any,
          employeeId: u.employeeId || undefined,
          isActive: u.isActive,
          employeeStatus: u.employeeStatus as any,
          permissions: (u.permissions as string[]) || [],
          createdAt: u.createdAt
        };
      }
    } catch (e) {
      console.error("[PostgresStorage] updateUser error, delegating:", e);
    }
    return this.fallback.updateUser(id, data);
  }

  async getUsersByDepartment(department: string): Promise<User[]> {
    try {
      const rows = await pgDb.select().from(pgUsers).where(eq(pgUsers.department, department.toLowerCase()));
      if (rows.length > 0) return rows.map(r => this.mapUser(r));
    } catch (e) {
      console.error("[PostgresStorage] getUsersByDepartment error:", e);
    }
    return this.fallback.getUsersByDepartment(department);
  }

  async getUsersByDesignation(designation: string): Promise<User[]> {
    try {
      const rows = await pgDb.select().from(pgUsers).where(eq(pgUsers.designation, designation));
      if (rows.length > 0) return rows.map(r => this.mapUser(r));
    } catch (e) {
      console.error("[PostgresStorage] getUsersByDesignation error:", e);
    }
    return this.fallback.getUsersByDesignation(designation);
  }

  async getUsersByReportingManager(managerId: string): Promise<User[]> {
    try {
      const rows = await pgDb.select().from(pgUsers).where(eq(pgUsers.reportingManagerId, managerId));
      if (rows.length > 0) return rows.map(r => this.mapUser(r));
    } catch (e) {
      console.error("[PostgresStorage] getUsersByReportingManager error:", e);
    }
    return this.fallback.getUsersByReportingManager(managerId);
  }

  async getUsersByRole(role: string): Promise<User[]> {
    try {
      const rows = await pgDb.select().from(pgUsers).where(eq(pgUsers.role, role));
      if (rows.length > 0) return rows.map(r => this.mapUser(r));
    } catch (e) {
      console.error("[PostgresStorage] getUsersByRole error:", e);
    }
    return this.fallback.getUsersByRole(role);
  }

  async listDepartments(): Promise<string[]> {
    try {
      const rows = await pgDb.select({ department: pgDepartmentTimings.department }).from(pgDepartmentTimings);
      if (rows.length > 0) return rows.map(r => r.department);
    } catch (e) {
      console.error("[PostgresStorage] listDepartments error:", e);
    }
    return this.fallback.listDepartments();
  }

  async getEffectiveUserPermissions(userId: string): Promise<string[]> {
    try {
      const user = await this.getUser(userId);
      if (!user) return [];

      const permissions: Set<string> = new Set((user.permissions as string[]) || []);

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
  async listCustomers(): Promise<Customer[]> {
    try {
      const rows = await pgDb
        .select()
        .from(pgCustomers)
        .where(eq(pgCustomers.isDeleted, false))
        .orderBy(desc(pgCustomers.createdAt));

      if (rows.length > 0) {
        return rows.map(c => ({
          id: c.id,
          name: c.name,
          mobile: c.mobile,
          email: c.email || undefined,
          address: c.address || undefined,
          city: c.city || undefined,
          state: c.state || undefined,
          pincode: c.pincode || undefined,
          ebServiceNumber: c.ebServiceNumber || undefined,
          tariffCode: c.tariffCode || undefined,
          ebSanctionPhase: c.ebSanctionPhase as any,
          ebSanctionKW: c.ebSanctionKW ? Number(c.ebSanctionKW) : undefined,
          propertyType: c.propertyType as any,
          scope: c.scope || undefined,
          status: c.status || "lead",
          createdAt: c.createdAt
        }));
      }
    } catch (e) {
      console.error("[PostgresStorage] listCustomers error, delegating:", e);
    }
    return this.fallback.listCustomers();
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    try {
      const [c] = await pgDb
        .select()
        .from(pgCustomers)
        .where(and(eq(pgCustomers.id, id), eq(pgCustomers.isDeleted, false)))
        .limit(1);

      if (c) {
        return {
          id: c.id,
          name: c.name,
          mobile: c.mobile,
          email: c.email || undefined,
          address: c.address || undefined,
          city: c.city || undefined,
          state: c.state || undefined,
          pincode: c.pincode || undefined,
          ebServiceNumber: c.ebServiceNumber || undefined,
          tariffCode: c.tariffCode || undefined,
          ebSanctionPhase: c.ebSanctionPhase as any,
          ebSanctionKW: c.ebSanctionKW ? Number(c.ebSanctionKW) : undefined,
          propertyType: c.propertyType as any,
          scope: c.scope || undefined,
          status: c.status || "lead",
          createdAt: c.createdAt
        };
      }
    } catch (e) {
      console.error("[PostgresStorage] getCustomer error, delegating:", e);
    }
    return this.fallback.getCustomer(id);
  }

  async findCustomerByMobile(mobile: string): Promise<Customer | undefined> {
    try {
      const [c] = await pgDb
        .select()
        .from(pgCustomers)
        .where(and(eq(pgCustomers.mobile, mobile), eq(pgCustomers.isDeleted, false)))
        .limit(1);

      if (c) {
        return {
          id: c.id,
          name: c.name,
          mobile: c.mobile,
          email: c.email || undefined,
          address: c.address || undefined,
          city: c.city || undefined,
          state: c.state || undefined,
          pincode: c.pincode || undefined,
          ebServiceNumber: c.ebServiceNumber || undefined,
          tariffCode: c.tariffCode || undefined,
          ebSanctionPhase: c.ebSanctionPhase as any,
          ebSanctionKW: c.ebSanctionKW ? Number(c.ebSanctionKW) : undefined,
          propertyType: c.propertyType as any,
          scope: c.scope || undefined,
          status: c.status || "lead",
          createdAt: c.createdAt
        };
      }
    } catch (e) {
      console.error("[PostgresStorage] findCustomerByMobile error, delegating:", e);
    }
    return this.fallback.findCustomerByMobile(mobile);
  }

  async createCustomer(data: any): Promise<Customer> {
    try {
      const tenantId = await this.getTenantId();
      const [c] = await pgDb.insert(pgCustomers).values({
        tenantId,
        name: data.name,
        mobile: data.mobile,
        email: data.email || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || "Karnataka",
        pincode: data.pincode || null,
        ebServiceNumber: data.ebServiceNumber || null,
        tariffCode: data.tariffCode || null,
        ebSanctionPhase: data.ebSanctionPhase || null,
        ebSanctionKW: data.ebSanctionKW ? String(data.ebSanctionKW) : null,
        propertyType: data.propertyType || "residential",
        scope: data.scope || null,
        status: data.status || "lead",
        isDeleted: false
      }).returning();

      try { await this.fallback.createCustomer(data); } catch (_) {}

      return {
        id: c.id,
        name: c.name,
        mobile: c.mobile,
        email: c.email || undefined,
        address: c.address || undefined,
        city: c.city || undefined,
        state: c.state || undefined,
        pincode: c.pincode || undefined,
        ebServiceNumber: c.ebServiceNumber || undefined,
        tariffCode: c.tariffCode || undefined,
        ebSanctionPhase: c.ebSanctionPhase as any,
        ebSanctionKW: c.ebSanctionKW ? Number(c.ebSanctionKW) : undefined,
        propertyType: c.propertyType as any,
        scope: c.scope || undefined,
        status: c.status || "lead",
        createdAt: c.createdAt
      };
    } catch (e) {
      console.error("[PostgresStorage] createCustomer error, using fallback:", e);
      return this.fallback.createCustomer(data);
    }
  }

  async updateCustomer(id: string, data: any): Promise<Customer> {
    try {
      const updateValues: any = { updatedAt: new Date() };
      if (data.name !== undefined) updateValues.name = data.name;
      if (data.mobile !== undefined) updateValues.mobile = data.mobile;
      if (data.email !== undefined) updateValues.email = data.email;
      if (data.address !== undefined) updateValues.address = data.address;
      if (data.city !== undefined) updateValues.city = data.city;
      if (data.state !== undefined) updateValues.state = data.state;
      if (data.pincode !== undefined) updateValues.pincode = data.pincode;
      if (data.ebServiceNumber !== undefined) updateValues.ebServiceNumber = data.ebServiceNumber;
      if (data.tariffCode !== undefined) updateValues.tariffCode = data.tariffCode;
      if (data.ebSanctionPhase !== undefined) updateValues.ebSanctionPhase = data.ebSanctionPhase;
      if (data.ebSanctionKW !== undefined) updateValues.ebSanctionKW = String(data.ebSanctionKW);
      if (data.propertyType !== undefined) updateValues.propertyType = data.propertyType;
      if (data.scope !== undefined) updateValues.scope = data.scope;
      if (data.status !== undefined) updateValues.status = data.status;

      const [c] = await pgDb
        .update(pgCustomers)
        .set(updateValues)
        .where(eq(pgCustomers.id, id))
        .returning();

      try { await this.fallback.updateCustomer(id, data); } catch (_) {}

      if (c) {
        return {
          id: c.id,
          name: c.name,
          mobile: c.mobile,
          email: c.email || undefined,
          address: c.address || undefined,
          city: c.city || undefined,
          state: c.state || undefined,
          pincode: c.pincode || undefined,
          ebServiceNumber: c.ebServiceNumber || undefined,
          tariffCode: c.tariffCode || undefined,
          ebSanctionPhase: c.ebSanctionPhase as any,
          ebSanctionKW: c.ebSanctionKW ? Number(c.ebSanctionKW) : undefined,
          propertyType: c.propertyType as any,
          scope: c.scope || undefined,
          status: c.status || "lead",
          createdAt: c.createdAt
        };
      }
    } catch (e) {
      console.error("[PostgresStorage] updateCustomer error, using fallback:", e);
    }
    return this.fallback.updateCustomer(id, data);
  }

  async deleteCustomer(id: string): Promise<void> {
    try {
      await pgDb
        .update(pgCustomers)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(eq(pgCustomers.id, id));

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
      const rows = await pgDb
        .select()
        .from(pgActivityLogs)
        .orderBy(desc(pgActivityLogs.createdAt))
        .limit(limit);

      if (rows.length > 0) {
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
      }
    } catch (e) {
      console.error("[PostgresStorage] listActivityLogs error, delegating:", e);
    }
    return this.fallback.listActivityLogs(limit);
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
  async listQuotations(): Promise<Quotation[]> {
    try {
      const rows = await pgDb.select().from(pgQuotations).orderBy(desc(pgQuotations.createdAt));
      return rows.map(q => ({
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
      } as Quotation));
    } catch (e) {
      console.error("[PostgresStorage] listQuotations error, delegating:", e);
      return this.fallback.listQuotations();
    }
  }

  async getQuotation(id: string): Promise<Quotation | undefined> {
    try {
      const [q] = await pgDb.select().from(pgQuotations).where(eq(pgQuotations.id, id)).limit(1);
      if (q) {
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
        } as Quotation;
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
        quotationNumber: data.quotationNumber,
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
        preparedBy: data.preparedBy || null,
        projects: data.projects || [],
        customBillOfMaterials: data.customBillOfMaterials || [],
        customerNotes: data.customerNotes || null,
        internalNotes: data.internalNotes || null,
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        createdBy: data.createdBy || null,
        updatedBy: data.updatedBy || null
      }).returning();

      try { await this.fallback.createQuotation(data); } catch (_) {}

      return {
        id: created.id,
        quotationNumber: created.quotationNumber,
        revision: created.revision,
        customerId: created.customerId,
        projectType: created.projectType as any,
        systemKw: Number(created.systemKw),
        ratePerKw: Number(created.ratePerKw) || 0,
        basePrice: Number(created.basePrice),
        gstPercentage: Number(created.gstPercentage),
        gstAmount: Number(created.gstAmount),
        totalCost: Number(created.totalCost),
        subsidyAmount: Number(created.subsidyAmount),
        customerPayment: Number(created.customerPayment),
        roundoff: Number(created.roundoff) || 0,
        status: created.status as any,
        source: created.source as any,
        preparedBy: created.preparedBy || undefined,
        projects: (created.projects as any[]) || [],
        customBillOfMaterials: (created.customBillOfMaterials as any[]) || undefined,
        customerNotes: created.customerNotes || undefined,
        internalNotes: created.internalNotes || undefined,
        validUntil: created.validUntil || undefined,
        createdBy: created.createdBy || undefined,
        updatedBy: created.updatedBy || undefined,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt
      } as Quotation;
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
      if (data.projects !== undefined) updateValues.projects = data.projects;
      if (data.totalCost !== undefined) updateValues.totalCost = String(data.totalCost);
      if (data.customerPayment !== undefined) updateValues.customerPayment = String(data.customerPayment);
      if (data.customBillOfMaterials !== undefined) updateValues.customBillOfMaterials = data.customBillOfMaterials;

      const [updated] = await pgDb
        .update(pgQuotations)
        .set(updateValues)
        .where(eq(pgQuotations.id, id))
        .returning();

      try { await this.fallback.updateQuotation(id, data, updatedBy); } catch (_) {}

      if (updated) {
        return {
          id: updated.id,
          quotationNumber: updated.quotationNumber,
          revision: updated.revision,
          customerId: updated.customerId,
          projectType: updated.projectType as any,
          systemKw: Number(updated.systemKw),
          ratePerKw: Number(updated.ratePerKw) || 0,
          basePrice: Number(updated.basePrice),
          gstPercentage: Number(updated.gstPercentage),
          gstAmount: Number(updated.gstAmount),
          totalCost: Number(updated.totalCost),
          subsidyAmount: Number(updated.subsidyAmount),
          customerPayment: Number(updated.customerPayment),
          roundoff: Number(updated.roundoff) || 0,
          status: updated.status as any,
          source: updated.source as any,
          preparedBy: updated.preparedBy || undefined,
          projects: (updated.projects as any[]) || [],
          customBillOfMaterials: (updated.customBillOfMaterials as any[]) || undefined,
          customerNotes: updated.customerNotes || undefined,
          internalNotes: updated.internalNotes || undefined,
          validUntil: updated.validUntil || undefined,
          createdBy: updated.createdBy || undefined,
          updatedBy: updated.updatedBy || undefined,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt
        } as Quotation;
      }
    } catch (e) {
      console.error("[PostgresStorage] updateQuotation error, delegating:", e);
    }
    return this.fallback.updateQuotation(id, data, updatedBy);
  }

  async deleteQuotation(id: string): Promise<void> {
    try {
      await pgDb.delete(pgQuotations).where(eq(pgQuotations.id, id));
      try { await this.fallback.deleteQuotation(id); } catch (_) {}
    } catch (e) {
      console.error("[PostgresStorage] deleteQuotation error:", e);
      return this.fallback.deleteQuotation(id);
    }
  }

  // ===================================================================
  // INVOICES & PAYMENTS
  // ===================================================================
  async listInvoices(): Promise<Invoice[]> {
    try {
      const rows = await pgDb.select().from(pgInvoices).orderBy(desc(pgInvoices.createdAt));
      return rows.map(inv => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        quotationId: inv.quotationId || '',
        customerId: inv.customerId,
        total: Number(inv.totalAmount),
        status: inv.status,
        createdAt: inv.createdAt
      } as Invoice));
    } catch (e) {
      console.error("[PostgresStorage] listInvoices error, delegating:", e);
      return this.fallback.listInvoices();
    }
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    try {
      const [inv] = await pgDb.select().from(pgInvoices).where(eq(pgInvoices.id, id)).limit(1);
      if (inv) {
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
    } catch (e) {
      console.error("[PostgresStorage] getInvoice error:", e);
    }
    return this.fallback.getInvoice(id);
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

      return {
        id: created.id,
        invoiceNumber: created.invoiceNumber,
        quotationId: created.quotationId || '',
        customerId: created.customerId,
        total: Number(created.totalAmount),
        status: created.status,
        createdAt: created.createdAt
      } as Invoice;
    } catch (e) {
      console.error("[PostgresStorage] createInvoice error, fallback:", e);
      return this.fallback.createInvoice(data);
    }
  }

  async updateInvoice(id: string, data: any): Promise<Invoice> {
    try {
      const updateValues: any = { updatedAt: new Date() };
      if (data.status !== undefined) updateValues.status = data.status;
      if (data.total !== undefined) {
        updateValues.totalAmount = String(data.total);
        updateValues.baseAmount = String(data.total);
      }

      const [updated] = await pgDb.update(pgInvoices).set(updateValues).where(eq(pgInvoices.id, id)).returning();
      try { await this.fallback.updateInvoice(id, data); } catch (_) {}

      if (updated) {
        return {
          id: updated.id,
          invoiceNumber: updated.invoiceNumber,
          quotationId: updated.quotationId || '',
          customerId: updated.customerId,
          total: Number(updated.totalAmount),
          status: updated.status,
          createdAt: updated.createdAt
        } as Invoice;
      }
    } catch (e) {
      console.error("[PostgresStorage] updateInvoice error:", e);
    }
    return this.fallback.updateInvoice(id, data);
  }

  async deleteInvoice(id: string): Promise<void> {
    try {
      await pgDb.delete(pgInvoices).where(eq(pgInvoices.id, id));
      try { await this.fallback.deleteInvoice(id); } catch (_) {}
    } catch (e) {
      console.error("[PostgresStorage] deleteInvoice error:", e);
      return this.fallback.deleteInvoice(id);
    }
  }

  // ===================================================================
  // PRODUCTS & INVENTORY
  // ===================================================================
  async listProducts(filters?: { search?: string; category?: string; page?: number; limit?: number }): Promise<{ products: any[]; total: number }> {
    try {
      const rows = await pgDb.select().from(pgProducts).orderBy(desc(pgProducts.createdAt));
      return { products: rows, total: rows.length };
    } catch (e) {
      console.error("[PostgresStorage] listProducts error:", e);
      return { products: [], total: 0 };
    }
  }

  async getProduct(id: string): Promise<any | undefined> {
    try {
      const [p] = await pgDb.select().from(pgProducts).where(eq(pgProducts.id, id)).limit(1);
      return p;
    } catch (e) {
      console.error("[PostgresStorage] getProduct error:", e);
      return undefined;
    }
  }

  async createProduct(data: any): Promise<any> {
    try {
      const tenantId = await this.getTenantId();
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
        currentStock: Number(data.currentStock) || 0,
        minimumStock: Number(data.minimumStock) || 5,
        status: Number(data.currentStock) <= 0 ? 'out_of_stock' : (Number(data.currentStock) <= (Number(data.minimumStock) || 5) ? 'low_stock' : 'in_stock')
      }).returning();
      return p;
    } catch (e) {
      console.error("[PostgresStorage] createProduct error:", e);
      throw e;
    }
  }

  async updateProduct(id: string, data: any): Promise<any> {
    try {
      const updateValues: any = { updatedAt: new Date() };
      if (data.name !== undefined) updateValues.name = data.name;
      if (data.category !== undefined) updateValues.category = data.category;
      if (data.brand !== undefined) updateValues.brand = data.brand;
      if (data.model !== undefined) updateValues.model = data.model;
      if (data.specifications !== undefined) updateValues.specifications = data.specifications;
      if (data.unit !== undefined) updateValues.unit = data.unit;
      if (data.purchasePrice !== undefined) updateValues.purchasePrice = String(data.purchasePrice);
      if (data.sellingPrice !== undefined) updateValues.sellingPrice = String(data.sellingPrice);
      if (data.currentStock !== undefined) {
        updateValues.currentStock = Number(data.currentStock);
        updateValues.status = Number(data.currentStock) <= 0 ? 'out_of_stock' : 'in_stock';
      }
      if (data.minimumStock !== undefined) updateValues.minimumStock = Number(data.minimumStock);

      const [p] = await pgDb.update(pgProducts).set(updateValues).where(eq(pgProducts.id, id)).returning();
      return p;
    } catch (e) {
      console.error("[PostgresStorage] updateProduct error:", e);
      throw e;
    }
  }

  async deleteProduct(id: string): Promise<void> {
    try {
      await pgDb.delete(pgProducts).where(eq(pgProducts.id, id));
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
    } as Attendance;
  }

  async getAttendance(id: string): Promise<Attendance | undefined> {
    try {
      const [att] = await pgDb.select().from(pgAttendance).where(eq(pgAttendance.id, id)).limit(1);
      if (att) return this.mapAttendance(att);
    } catch (e) {
      console.error("[PostgresStorage] getAttendance error:", e);
    }
    return this.fallback.getAttendance(id);
  }

  async getAttendanceByUserAndDate(userId: string, date: Date): Promise<Attendance | undefined> {
    try {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);

      const [att] = await pgDb
        .select()
        .from(pgAttendance)
        .where(and(
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
      const rows = await pgDb
        .select()
        .from(pgAttendance)
        .where(eq(pgAttendance.userId, userId))
        .orderBy(desc(pgAttendance.date));
      if (rows.length > 0) return rows.map(r => this.mapAttendance(r));
    } catch (e) {
      console.error("[PostgresStorage] listAttendanceByUser error:", e);
    }
    return this.fallback.listAttendanceByUser(userId);
  }

  async listAttendanceByDate(date: Date): Promise<Attendance[]> {
    try {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);

      const rows = await pgDb
        .select()
        .from(pgAttendance)
        .where(sql`${pgAttendance.date} >= ${start.toISOString()} AND ${pgAttendance.date} <= ${end.toISOString()}`)
        .orderBy(desc(pgAttendance.createdAt));

      if (rows.length > 0) return rows.map(r => this.mapAttendance(r));
    } catch (e) {
      console.error("[PostgresStorage] listAttendanceByDate error:", e);
    }
    return this.fallback.listAttendanceByDate(date);
  }

  async createAttendance(data: any): Promise<Attendance> {
    try {
      const tenantId = await this.getTenantId();
      const attDate = data.date instanceof Date ? data.date : new Date(data.date);
      const [row] = await pgDb.insert(pgAttendance).values({
        tenantId,
        userId: data.userId,
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
        remarks: data.remarks || null
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
      const updateValues: any = { updatedAt: new Date() };
      if (data.checkOutTime !== undefined) updateValues.checkOutTime = new Date(data.checkOutTime);
      if (data.workingHours !== undefined) updateValues.workingHours = String(data.workingHours);
      if (data.overtimeHours !== undefined) updateValues.overtimeHours = String(data.overtimeHours);
      if (data.status !== undefined) updateValues.status = data.status;
      if (data.autoCorrected !== undefined) updateValues.autoCorrected = data.autoCorrected;
      if (data.autoCorrectionReason !== undefined) updateValues.autoCorrectionReason = data.autoCorrectionReason;
      if (data.adminReviewStatus !== undefined) updateValues.adminReviewStatus = data.adminReviewStatus;

      const [updated] = await pgDb.update(pgAttendance).set(updateValues).where(eq(pgAttendance.id, id)).returning();
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
      const conditions: any[] = [];
      if (filters.userId) conditions.push(eq(pgAttendance.userId, filters.userId));
      if (filters.startDate) conditions.push(gte(pgAttendance.date, new Date(filters.startDate)));
      if (filters.endDate) conditions.push(lte(pgAttendance.date, new Date(filters.endDate)));
      if (filters.status) conditions.push(eq(pgAttendance.status, filters.status));
      if (filters.adminReviewStatus) conditions.push(eq(pgAttendance.adminReviewStatus, filters.adminReviewStatus));

      const query = pgDb.select().from(pgAttendance);
      const rows = conditions.length > 0 
        ? await query.where(and(...conditions)).orderBy(desc(pgAttendance.date))
        : await query.orderBy(desc(pgAttendance.date));

      return rows.map(r => this.mapAttendance(r));
    } catch (e) {
      console.error("[PostgresStorage] listAttendance error, delegating:", e);
      return this.fallback.listAttendance(filters);
    }
  }

  async listAttendanceBetweenDates(startDate: Date, endDate: Date): Promise<Attendance[]> {
    try {
      const rows = await pgDb
        .select()
        .from(pgAttendance)
        .where(and(gte(pgAttendance.date, startDate), lte(pgAttendance.date, endDate)))
        .orderBy(desc(pgAttendance.date));
      return rows.map(r => this.mapAttendance(r));
    } catch (e) {
      console.error("[PostgresStorage] listAttendanceBetweenDates error:", e);
      return this.fallback.listAttendanceBetweenDates(startDate, endDate);
    }
  }

  async listAttendanceByUserBetweenDates(userId: string, startDate: Date, endDate: Date): Promise<Attendance[]> {
    try {
      const rows = await pgDb
        .select()
        .from(pgAttendance)
        .where(and(
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
      const rows = await pgDb
        .select()
        .from(pgAttendance)
        .where(eq(pgAttendance.adminReviewStatus, status))
        .orderBy(desc(pgAttendance.date));
      return rows.map(r => this.mapAttendance(r));
    } catch (e) {
      console.error("[PostgresStorage] listAttendanceByReviewStatus error:", e);
      return this.fallback.listAttendanceByReviewStatus(status);
    }
  }

  async listIncompleteAttendance(date: Date): Promise<Attendance[]> {
    try {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);

      const rows = await pgDb
        .select()
        .from(pgAttendance)
        .where(and(
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
      const checkDate = new Date(date);
      checkDate.setHours(0, 0, 0, 0);

      const rows = await pgDb
        .select()
        .from(pgLeaveApplications)
        .where(and(
          eq(pgLeaveApplications.userId, userId),
          eq(pgLeaveApplications.status, "approved"),
          or(
            eq(pgLeaveApplications.leaveType, "casual_leave"),
            eq(pgLeaveApplications.leaveType, "unpaid_leave")
          )
        ));

      for (const row of rows) {
        const start = new Date(row.startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(row.endDate);
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
          } as LeaveApplication;
        }
      }
      return undefined;
    } catch (e) {
      console.error("[PostgresStorage] getApprovedLeaveForDate error:", e);
      return this.fallback.getApprovedLeaveForDate(userId, date);
    }
  }

  async addOTSessionTransaction(attendanceId: string, sessionData: any): Promise<void> {
    try {
      const tenantId = await this.getTenantId();
      const [att] = await pgDb.select().from(pgAttendance).where(eq(pgAttendance.id, attendanceId)).limit(1);
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
        .where(eq(pgAttendance.id, attendanceId));

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
      const [lb] = await pgDb
        .select()
        .from(pgLeaveBalances)
        .where(and(
          eq(pgLeaveBalances.userId, userId),
          eq(pgLeaveBalances.year, year),
          eq(pgLeaveBalances.month, month)
        ))
        .limit(1);

      if (lb) {
        return {
          id: lb.id,
          userId: lb.userId,
          employeeId: lb.userId,
          year: lb.year,
          month: lb.month,
          casualLeaveBalance: lb.casualLeaveBalance,
          casualLeaveUsed: lb.casualLeaveUsed,
          permissionHoursBalance: lb.permissionHoursBalance,
          permissionHoursUsed: lb.permissionHoursUsed
        };
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
        casualLeaveBalance: Number(data.casualLeaveBalance ?? 1),
        casualLeaveUsed: Number(data.casualLeaveUsed ?? 0),
        permissionHoursBalance: Number(data.permissionHoursBalance ?? 2),
        permissionHoursUsed: Number(data.permissionHoursUsed ?? 0)
      }).returning();

      try { await this.fallback.createLeaveBalance(data); } catch (_) {}
      return {
        id: lb.id,
        userId: lb.userId,
        employeeId: lb.userId,
        year: lb.year,
        month: lb.month,
        casualLeaveBalance: lb.casualLeaveBalance,
        casualLeaveUsed: lb.casualLeaveUsed,
        permissionHoursBalance: lb.permissionHoursBalance,
        permissionHoursUsed: lb.permissionHoursUsed
      } as LeaveBalance;
    } catch (e) {
      console.error("[PostgresStorage] createLeaveBalance error:", e);
      return this.fallback.createLeaveBalance(data);
    }
  }

  async updateLeaveBalance(id: string, data: any): Promise<LeaveBalance> {
    try {
      const updateValues: any = { updatedAt: new Date() };
      if (data.casualLeaveBalance !== undefined) updateValues.casualLeaveBalance = Number(data.casualLeaveBalance);
      if (data.casualLeaveUsed !== undefined) updateValues.casualLeaveUsed = Number(data.casualLeaveUsed);
      if (data.permissionHoursBalance !== undefined) updateValues.permissionHoursBalance = Number(data.permissionHoursBalance);
      if (data.permissionHoursUsed !== undefined) updateValues.permissionHoursUsed = Number(data.permissionHoursUsed);

      const [lb] = await pgDb.update(pgLeaveBalances).set(updateValues).where(eq(pgLeaveBalances.id, id)).returning();
      try { await this.fallback.updateLeaveBalance(id, data); } catch (_) {}
      if (lb) {
        return {
          id: lb.id,
          userId: lb.userId,
          employeeId: lb.userId,
          year: lb.year,
          month: lb.month,
          casualLeaveBalance: lb.casualLeaveBalance,
          casualLeaveUsed: lb.casualLeaveUsed,
          permissionHoursBalance: lb.permissionHoursBalance,
          permissionHoursUsed: lb.permissionHoursUsed
        } as LeaveBalance;
      }
    } catch (e) {
      console.error("[PostgresStorage] updateLeaveBalance error:", e);
    }
    return this.fallback.updateLeaveBalance(id, data);
  }

  async listLeaveBalancesByYear(year: number): Promise<LeaveBalance[]> {
    try {
      const rows = await pgDb.select().from(pgLeaveBalances).where(eq(pgLeaveBalances.year, year));
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
      } as LeaveBalance));
    } catch (e) {
      console.error("[PostgresStorage] listLeaveBalancesByYear error:", e);
      return this.fallback.listLeaveBalancesByYear(year);
    }
  }

  async resetMonthlyLeaveBalances(month: number, year: number): Promise<void> {
    try {
      const usersList = await this.listUsers();
      for (const u of usersList) {
        const existing = await this.getLeaveBalance(u.id, month, year);
        if (!existing) {
          await this.createLeaveBalance({
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
    } as LeaveApplication;
  }

  async getLeaveApplication(id: string): Promise<LeaveApplication | undefined> {
    try {
      const [app] = await pgDb.select().from(pgLeaveApplications).where(eq(pgLeaveApplications.id, id)).limit(1);
      if (app) return this.mapLeaveApp(app);
    } catch (e) {
      console.error("[PostgresStorage] getLeaveApplication error:", e);
    }
    return this.fallback.getLeaveApplication(id);
  }

  async createLeaveApplication(data: any): Promise<LeaveApplication> {
    try {
      const tenantId = await this.getTenantId();
      const [app] = await pgDb.insert(pgLeaveApplications).values({
        tenantId,
        userId: data.userId,
        leaveType: data.leaveType,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        totalDays: data.totalDays || null,
        permissionDate: data.permissionDate ? new Date(data.permissionDate) : null,
        permissionHours: data.permissionHours || null,
        reason: data.reason,
        status: data.status || "pending_manager"
      }).returning();

      try { await this.fallback.createLeaveApplication(data); } catch (_) {}
      return this.mapLeaveApp(app);
    } catch (e) {
      console.error("[PostgresStorage] createLeaveApplication error:", e);
      return this.fallback.createLeaveApplication(data);
    }
  }

  async updateLeaveApplication(id: string, data: any): Promise<LeaveApplication> {
    try {
      const updateValues: any = { updatedAt: new Date() };
      if (data.status !== undefined) updateValues.status = data.status;
      if (data.approvedBy !== undefined) updateValues.approvedBy = data.approvedBy;
      if (data.managerApprovalStatus !== undefined) updateValues.managerApprovalStatus = data.managerApprovalStatus;
      if (data.hrApprovalStatus !== undefined) updateValues.hrApprovalStatus = data.hrApprovalStatus;
      if (data.managerRemarks !== undefined) updateValues.managerRemarks = data.managerRemarks;
      if (data.hrRemarks !== undefined) updateValues.hrRemarks = data.hrRemarks;
      if (data.rejectionReason !== undefined) updateValues.rejectionReason = data.rejectionReason;

      const [updated] = await pgDb.update(pgLeaveApplications).set(updateValues).where(eq(pgLeaveApplications.id, id)).returning();
      try { await this.fallback.updateLeaveApplication(id, data); } catch (_) {}
      if (updated) return this.mapLeaveApp(updated);
    } catch (e) {
      console.error("[PostgresStorage] updateLeaveApplication error:", e);
    }
    return this.fallback.updateLeaveApplication(id, data);
  }

  async listLeaveApplicationsByUser(userId: string): Promise<LeaveApplication[]> {
    try {
      const rows = await pgDb.select().from(pgLeaveApplications).where(eq(pgLeaveApplications.userId, userId)).orderBy(desc(pgLeaveApplications.createdAt));
      if (rows.length > 0) return rows.map(r => this.mapLeaveApp(r));
    } catch (e) {
      console.error("[PostgresStorage] listLeaveApplicationsByUser error:", e);
    }
    return this.fallback.listLeaveApplicationsByUser(userId);
  }

  async listLeaveApplicationsByManager(managerId: string, status?: string): Promise<LeaveApplication[]> {
    try {
      let query = pgDb.select().from(pgLeaveApplications);
      const rows = status
        ? await query.where(eq(pgLeaveApplications.status, status)).orderBy(desc(pgLeaveApplications.createdAt))
        : await query.orderBy(desc(pgLeaveApplications.createdAt));
      if (rows.length > 0) return rows.map(r => this.mapLeaveApp(r));
    } catch (e) {
      console.error("[PostgresStorage] listLeaveApplicationsByManager error:", e);
    }
    return this.fallback.listLeaveApplicationsByManager(managerId, status);
  }

  async listLeaveApplicationsByHR(status?: string): Promise<LeaveApplication[]> {
    try {
      let query = pgDb.select().from(pgLeaveApplications);
      const rows = status
        ? await query.where(eq(pgLeaveApplications.status, status)).orderBy(desc(pgLeaveApplications.createdAt))
        : await query.orderBy(desc(pgLeaveApplications.createdAt));
      if (rows.length > 0) return rows.map(r => this.mapLeaveApp(r));
    } catch (e) {
      console.error("[PostgresStorage] listLeaveApplicationsByHR error:", e);
    }
    return this.fallback.listLeaveApplicationsByHR(status);
  }

  async listAllLeaveApplications(filters?: any): Promise<LeaveApplication[]> {
    try {
      const rows = await pgDb.select().from(pgLeaveApplications).orderBy(desc(pgLeaveApplications.createdAt));
      if (rows.length > 0) return rows.map(r => this.mapLeaveApp(r));
    } catch (e) {
      console.error("[PostgresStorage] listAllLeaveApplications error:", e);
    }
    return this.fallback.listAllLeaveApplications(filters);
  }

  async approveLeaveByManager(leaveId: string, managerId: string, remarks?: string): Promise<LeaveApplication> {
    try {
      const [updated] = await pgDb
        .update(pgLeaveApplications)
        .set({ status: "pending_hr", approvedBy: managerId, updatedAt: new Date() })
        .where(eq(pgLeaveApplications.id, leaveId))
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
      const [updated] = await pgDb
        .update(pgLeaveApplications)
        .set({ status: "approved", approvedBy: hrId, updatedAt: new Date() })
        .where(eq(pgLeaveApplications.id, leaveId))
        .returning();
      try { await this.fallback.approveLeaveByHR(leaveId, hrId, remarks); } catch (_) {}
      if (updated) return this.mapLeaveApp(updated);
    } catch (e) {
      console.error("[PostgresStorage] approveLeaveByHR error:", e);
    }
    return this.fallback.approveLeaveByHR(leaveId, hrId, remarks);
  }

  async rejectLeave(leaveId: string, rejectedBy: string, reason: string, rejectedByRole: 'manager' | 'hr'): Promise<LeaveApplication> {
    try {
      const [updated] = await pgDb
        .update(pgLeaveApplications)
        .set({ status: "rejected", approvedBy: rejectedBy, updatedAt: new Date() })
        .where(eq(pgLeaveApplications.id, leaveId))
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
      const [updated] = await pgDb
        .update(pgLeaveApplications)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(pgLeaveApplications.id, leaveId))
        .returning();
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
      const [s] = await pgDb
        .select()
        .from(pgSalaryStructures)
        .where(eq(pgSalaryStructures.userId, userId))
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

  async createSalaryAdvance(data: any): Promise<SalaryAdvance> {
    try {
      const tenantId = await this.getTenantId();
      const now = new Date();
      const amountVal = String(data.amount || data.requestAmount || 0);
      const monthlyDeduct = String(data.monthlyDeduction || data.monthlyEmiAmount || 0);
      const startMonth = Number(data.deductionStartMonth) || (now.getMonth() + 1);
      const startYear = Number(data.deductionStartYear) || now.getFullYear();

      const [adv] = await pgDb.insert(pgSalaryAdvances).values({
        tenantId,
        userId: data.userId,
        amount: amountVal,
        monthlyDeduction: monthlyDeduct,
        repaidAmount: "0",
        deductionStartMonth: startMonth,
        deductionStartYear: startYear,
        requestAmount: amountVal,
        remainingBalance: amountVal,
        reason: data.reason || "General advance",
        status: data.status || "pending"
      }).returning();

      try { await this.fallback.createSalaryAdvance(data); } catch (_) {}

      return {
        id: adv.id,
        userId: adv.userId,
        employeeId: adv.userId,
        amount: Number(adv.amount),
        monthlyDeduction: Number(adv.monthlyDeduction),
        repaidAmount: Number(adv.repaidAmount),
        remainingAmount: Number(adv.remainingBalance || adv.amount),
        deductionStartMonth: adv.deductionStartMonth,
        deductionStartYear: adv.deductionStartYear,
        numberOfInstallments: adv.emiCount || 1,
        requestDate: adv.createdAt,
        reason: adv.reason || undefined,
        status: adv.status as any,
        createdAt: adv.createdAt,
        updatedAt: adv.updatedAt
      } as any;
    } catch (e) {
      console.error("[PostgresStorage] createSalaryAdvance error:", e);
      return this.fallback.createSalaryAdvance(data);
    }
  }

  async updateSalaryAdvance(id: string, data: any): Promise<SalaryAdvance> {
    try {
      const updateValues: any = { updatedAt: new Date() };
      if (data.repaidAmount !== undefined) updateValues.repaidAmount = String(data.repaidAmount);
      if (data.status !== undefined) updateValues.status = data.status;

      const [adv] = await pgDb.update(pgSalaryAdvances).set(updateValues).where(eq(pgSalaryAdvances.id, id)).returning();
      try { await this.fallback.updateSalaryAdvance(id, data); } catch (_) {}

      if (adv) {
        return {
          id: adv.id,
          userId: adv.userId,
          amount: Number(adv.amount),
          monthlyDeduction: Number(adv.monthlyDeduction),
          repaidAmount: Number(adv.repaidAmount),
          deductionStartMonth: adv.deductionStartMonth,
          deductionStartYear: adv.deductionStartYear,
          reason: adv.reason || undefined,
          status: adv.status as any,
          createdAt: adv.createdAt,
          updatedAt: adv.updatedAt
        } as SalaryAdvance;
      }
    } catch (e) {
      console.error("[PostgresStorage] updateSalaryAdvance error:", e);
    }
    return this.fallback.updateSalaryAdvance(id, data);
  }

  async getSalaryAdvance(id: string): Promise<SalaryAdvance | undefined> {
    try {
      const [adv] = await pgDb.select().from(pgSalaryAdvances).where(eq(pgSalaryAdvances.id, id)).limit(1);
      if (adv) {
        return {
          id: adv.id,
          userId: adv.userId,
          amount: Number(adv.amount),
          monthlyDeduction: Number(adv.monthlyDeduction),
          repaidAmount: Number(adv.repaidAmount),
          deductionStartMonth: adv.deductionStartMonth,
          deductionStartYear: adv.deductionStartYear,
          reason: adv.reason || undefined,
          status: adv.status as any,
          createdAt: adv.createdAt,
          updatedAt: adv.updatedAt
        } as SalaryAdvance;
      }
    } catch (e) {
      console.error("[PostgresStorage] getSalaryAdvance error:", e);
    }
    return this.fallback.getSalaryAdvance(id);
  }

  async listSalaryAdvances(filters?: any): Promise<SalaryAdvance[]> {
    try {
      let query = pgDb.select().from(pgSalaryAdvances);
      let rows;
      if (filters?.userId && filters?.status) {
        rows = await query.where(and(eq(pgSalaryAdvances.userId, filters.userId), eq(pgSalaryAdvances.status, filters.status)));
      } else if (filters?.userId) {
        rows = await query.where(eq(pgSalaryAdvances.userId, filters.userId));
      } else if (filters?.status) {
        rows = await query.where(eq(pgSalaryAdvances.status, filters.status));
      } else {
        rows = await query.orderBy(desc(pgSalaryAdvances.createdAt));
      }

      if (rows.length > 0) {
        return rows.map(adv => ({
          id: adv.id,
          userId: adv.userId,
          amount: Number(adv.amount),
          monthlyDeduction: Number(adv.monthlyDeduction),
          repaidAmount: Number(adv.repaidAmount),
          deductionStartMonth: adv.deductionStartMonth,
          deductionStartYear: adv.deductionStartYear,
          reason: adv.reason || undefined,
          status: adv.status as any,
          createdAt: adv.createdAt,
          updatedAt: adv.updatedAt
        } as SalaryAdvance));
      }
    } catch (e) {
      console.error("[PostgresStorage] listSalaryAdvances error:", e);
    }
    return this.fallback.listSalaryAdvances(filters);
  }

  private mapPayroll(p: any): Payroll {
    return {
      id: p.id,
      userId: p.userId,
      employeeId: p.employeeId || p.userId,
      month: p.month,
      year: p.year,
      workingDays: p.workingDays,
      presentDays: Number(p.presentDays),
      paidLeaveDays: Number(p.paidLeaveDays),
      absentDays: Number(p.absentDays),
      overtimeHours: Number(p.overtimeHours),
      fixedSalary: Number(p.fixedSalary),
      earnedBasic: Number(p.earnedBasic),
      earnedHRA: Number(p.earnedHRA),
      earnedConveyance: Number(p.earnedConveyance),
      overtimePay: Number(p.overtimePay),
      grossSalary: Number(p.grossSalary),
      epfDeduction: Number(p.epfDeduction),
      esiDeduction: Number(p.esiDeduction),
      tdsDeduction: Number(p.tdsDeduction),
      advanceDeduction: Number(p.advanceDeduction),
      totalDeductions: Number(p.totalDeductions),
      netSalary: Number(p.netSalary),
      status: p.status,
      processedBy: p.processedBy || undefined,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    } as Payroll;
  }

  async getPayroll(id: string): Promise<Payroll | undefined> {
    try {
      const [p] = await pgDb.select().from(pgPayrolls).where(eq(pgPayrolls.id, id)).limit(1);
      if (p) return this.mapPayroll(p);
    } catch (e) {
      console.error("[PostgresStorage] getPayroll error:", e);
    }
    return this.fallback.getPayroll(id);
  }

  async getPayrollByUserAndMonth(userId: string, month: number, year: number): Promise<Payroll | undefined> {
    try {
      const [p] = await pgDb
        .select()
        .from(pgPayrolls)
        .where(and(eq(pgPayrolls.userId, userId), eq(pgPayrolls.month, month), eq(pgPayrolls.year, year)))
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
        employeeId: data.employeeId || data.userId,
        month: data.month,
        year: data.year,
        workingDays: data.workingDays,
        presentDays: String(data.presentDays || 0),
        paidLeaveDays: String(data.paidLeaveDays || 0),
        absentDays: String(data.absentDays || 0),
        overtimeHours: String(data.overtimeHours || 0),
        fixedSalary: String(data.fixedSalary || 0),
        earnedBasic: String(data.earnedBasic || 0),
        earnedHRA: String(data.earnedHRA || 0),
        earnedConveyance: String(data.earnedConveyance || 0),
        overtimePay: String(data.overtimePay || 0),
        grossSalary: String(data.grossSalary || 0),
        epfDeduction: String(data.epfDeduction || 0),
        esiDeduction: String(data.esiDeduction || 0),
        tdsDeduction: String(data.tdsDeduction || 0),
        advanceDeduction: String(data.advanceDeduction || 0),
        totalDeductions: String(data.totalDeductions || 0),
        netSalary: String(data.netSalary || 0),
        status: data.status || "draft",
        processedBy: data.processedBy || null
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
      const updateValues: any = { updatedAt: new Date() };
      if (data.status !== undefined) updateValues.status = data.status;

      const [p] = await pgDb.update(pgPayrolls).set(updateValues).where(eq(pgPayrolls.id, id)).returning();
      try { await this.fallback.updatePayroll(id, data); } catch (_) {}
      if (p) return this.mapPayroll(p);
    } catch (e) {
      console.error("[PostgresStorage] updatePayroll error:", e);
    }
    return this.fallback.updatePayroll(id, data);
  }

  async listPayrolls(filters?: any): Promise<Payroll[]> {
    try {
      let query = pgDb.select().from(pgPayrolls);
      const rows = await query.orderBy(desc(pgPayrolls.createdAt));
      if (rows.length > 0) return rows.map(r => this.mapPayroll(r));
    } catch (e) {
      console.error("[PostgresStorage] listPayrolls error:", e);
    }
    return this.fallback.listPayrolls(filters);
  }

  async listPayrollsByUser(userId: string): Promise<Payroll[]> {
    try {
      const rows = await pgDb.select().from(pgPayrolls).where(eq(pgPayrolls.userId, userId)).orderBy(desc(pgPayrolls.createdAt));
      if (rows.length > 0) return rows.map(r => this.mapPayroll(r));
    } catch (e) {
      console.error("[PostgresStorage] listPayrollsByUser error:", e);
    }
    return this.fallback.listPayrollsByUser(userId);
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

    const basicSalary = Number(salaryStructure.baseSalary) || 0;
    const hra = Number(salaryStructure.hra) || 0;
    const allowances = Number(salaryStructure.specialAllowance || 0) + Number(salaryStructure.conveyance || 0) + Number(salaryStructure.medicalAllowance || 0);

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

    const ptDeduction = Number(salaryStructure.professionalTax) || 200;

    const advances = await this.listSalaryAdvances({ userId, status: 'approved' });
    let totalAdvanceDeduction = 0;
    for (const adv of advances) {
      if (adv.status === 'approved' && Number(adv.remainingBalance || 0) > 0) {
        const emi = Number(adv.monthlyEmiAmount || 0);
        const rem = Number(adv.remainingBalance || 0);
        totalAdvanceDeduction += Math.min(emi, rem);
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
      const rows = await pgDb.select().from(pgOfficeLocations).where(eq(pgOfficeLocations.isActive, true));
      if (rows.length > 0) {
        return rows.map(loc => ({
          id: loc.id,
          name: loc.name,
          latitude: loc.latitude,
          longitude: loc.longitude,
          radius: loc.radius,
          createdAt: loc.createdAt
        } as OfficeLocation));
      }
    } catch (e) {
      console.error("[PostgresStorage] listOfficeLocations error:", e);
    }
    return this.fallback.listOfficeLocations();
  }

  async getOfficeLocation(id: string): Promise<OfficeLocation | undefined> {
    try {
      const [loc] = await pgDb.select().from(pgOfficeLocations).where(eq(pgOfficeLocations.id, id)).limit(1);
      if (loc) {
        return {
          id: loc.id,
          name: loc.name,
          latitude: loc.latitude,
          longitude: loc.longitude,
          radius: loc.radius,
          createdAt: loc.createdAt
        } as OfficeLocation;
      }
    } catch (e) {
      console.error("[PostgresStorage] getOfficeLocation error:", e);
    }
    return this.fallback.getOfficeLocation(id);
  }

  async getCompanySettings(): Promise<any | undefined> {
    try {
      const [s] = await pgDb.select().from(pgCompanySettings).limit(1);
      if (s) {
        return {
          id: s.id,
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
      const existing = await pgDb.select().from(pgCompanySettings).limit(1);
      if (existing.length > 0) {
        await pgDb.update(pgCompanySettings).set({
          ...settings,
          updatedAt: new Date()
        }).where(eq(pgCompanySettings.id, existing[0].id));
      } else {
        await pgDb.insert(pgCompanySettings).values({
          tenantId,
          ...settings
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
      const [timing] = await pgDb
        .select()
        .from(pgDepartmentTimings)
        .where(eq(pgDepartmentTimings.department, department.toLowerCase()))
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
      const rows = await pgDb.select().from(pgDepartmentTimings);
      if (rows.length > 0) {
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
      }
    } catch (e) {
      console.error("[PostgresStorage] listDepartmentTimings error:", e);
    }
    return this.fallback.listDepartmentTimings();
  }

  async createOfficeLocation(data: any): Promise<OfficeLocation> {
    try {
      const tenantId = await this.getTenantId();
      const radiusVal = Number(data.radius ?? data.radiusMeters ?? 500);
      const [loc] = await pgDb.insert(pgOfficeLocations).values({
        tenantId,
        name: data.name,
        latitude: String(data.latitude),
        longitude: String(data.longitude),
        radius: radiusVal,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        pincode: data.pincode || null,
        isActive: data.isActive ?? true
      }).returning();

      try { await this.fallback.createOfficeLocation(data); } catch (_) {}

      return {
        id: loc.id,
        name: loc.name,
        latitude: loc.latitude,
        longitude: loc.longitude,
        radius: loc.radius,
        radiusMeters: loc.radius,
        address: loc.address,
        isActive: loc.isActive,
        createdAt: loc.createdAt
      } as any;
    } catch (e) {
      console.error("[PostgresStorage] createOfficeLocation error, delegating:", e);
      return this.fallback.createOfficeLocation(data);
    }
  }

  async updateDepartmentTiming(department: string, data: any): Promise<any> {
    try {
      const updateValues: any = { updatedAt: new Date() };
      if (data.checkInTime !== undefined) updateValues.checkInTime = data.checkInTime;
      if (data.checkOutTime !== undefined) updateValues.checkOutTime = data.checkOutTime;
      if (data.workingHours !== undefined) updateValues.workingHours = String(data.workingHours);
      if (data.autoCheckoutGraceMinutes !== undefined) updateValues.autoCheckoutGraceMinutes = data.autoCheckoutGraceMinutes;
      if (data.weekendDays !== undefined) updateValues.weekendDays = data.weekendDays;
      if (data.isActive !== undefined) updateValues.isActive = data.isActive;

      const [updated] = await pgDb
        .update(pgDepartmentTimings)
        .set(updateValues)
        .where(eq(pgDepartmentTimings.department, department.toLowerCase()))
        .returning();

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
      const [created] = await pgDb.insert(pgDepartmentTimings).values({
        tenantId,
        department: data.department.toLowerCase(),
        checkInTime: data.checkInTime,
        checkOutTime: data.checkOutTime,
        workingHours: String(data.workingHours || 8),
        autoCheckoutGraceMinutes: data.autoCheckoutGraceMinutes || 120,
        weekendDays: data.weekendDays || [0],
        isActive: data.isActive ?? true
      }).returning();
      try { await this.fallback.createDepartmentTiming(data); } catch (_) {}
      return created;
    } catch (e) {
      console.error("[PostgresStorage] createDepartmentTiming error:", e);
      return this.fallback.createDepartmentTiming(data);
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
      const conditions: any[] = [];
      if (filters?.userId) conditions.push(eq(pgAuditLogs.userId, filters.userId));
      if (filters?.entityType) conditions.push(eq(pgAuditLogs.entityType, filters.entityType));
      if (filters?.startDate) conditions.push(gte(pgAuditLogs.createdAt, filters.startDate));
      if (filters?.endDate) conditions.push(lte(pgAuditLogs.createdAt, filters.endDate));

      const query = pgDb.select().from(pgAuditLogs);
      const rows = conditions.length > 0
        ? await query.where(and(...conditions)).orderBy(desc(pgAuditLogs.createdAt)).limit(1000)
        : await query.orderBy(desc(pgAuditLogs.createdAt)).limit(1000);

      return rows;
    } catch (e) {
      console.error("[PostgresStorage] getAuditLogs error:", e);
      return this.fallback.getAuditLogs(filters);
    }
  }

  // ===================================================================
  // SALARY STRUCTURES & PAYROLL
  // ===================================================================
  async getSalaryStructure(id: string): Promise<SalaryStructure | undefined> {
    try {
      const [s] = await pgDb.select().from(pgSalaryStructures).where(eq(pgSalaryStructures.id, id)).limit(1);
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
      const updateValues: any = { updatedAt: new Date() };
      if (data.baseSalary !== undefined) updateValues.baseSalary = String(data.baseSalary);
      if (data.hra !== undefined) updateValues.hra = String(data.hra);
      if (data.monthlyGross !== undefined) updateValues.monthlyGross = String(data.monthlyGross);
      if (data.monthlyNet !== undefined) updateValues.monthlyNet = String(data.monthlyNet);
      if (data.isActive !== undefined) updateValues.isActive = data.isActive;

      const [s] = await pgDb.update(pgSalaryStructures).set(updateValues).where(eq(pgSalaryStructures.id, id)).returning();
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
        } as SalaryStructure;
      }
    } catch (e) {
      console.error("[PostgresStorage] updateSalaryStructure error:", e);
    }
    return this.fallback.updateSalaryStructure(id, data);
  }

  async listSalaryStructures(): Promise<SalaryStructure[]> {
    try {
      const rows = await pgDb.select().from(pgSalaryStructures).orderBy(desc(pgSalaryStructures.createdAt));
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
      } as SalaryStructure));
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
  async getFixedHoliday(id: string): Promise<FixedHoliday | undefined> {
    try {
      const [h] = await pgDb.select().from(pgFixedHolidays).where(eq(pgFixedHolidays.id, id)).limit(1);
      if (h) {
        return {
          id: h.id,
          name: h.name,
          date: h.date,
          year: h.year,
          type: h.type as any,
          isPaid: h.isPaid ?? true,
          isOptional: h.isOptional ?? false,
          applicableDepartments: (h.applicableDepartments as string[]) || [],
          description: h.description || undefined,
          createdBy: h.createdBy || undefined,
          createdAt: h.createdAt
        } as FixedHoliday;
      }
    } catch (e) {
      console.error("[PostgresStorage] getFixedHoliday error:", e);
    }
    return this.fallback.getFixedHoliday(id);
  }

  async createFixedHoliday(data: any): Promise<FixedHoliday> {
    try {
      const tenantId = await this.getTenantId();
      const [h] = await pgDb.insert(pgFixedHolidays).values({
        tenantId,
        name: data.name,
        date: data.date instanceof Date ? data.date : new Date(data.date),
        year: Number(data.year),
        type: data.type || "mandatory",
        isPaid: data.isPaid ?? true,
        isOptional: data.isOptional ?? false,
        applicableDepartments: data.applicableDepartments || [],
        description: data.description || null,
        createdBy: data.createdBy || null
      }).returning();

      try { await this.fallback.createFixedHoliday(data); } catch (_) {}
      return {
        id: h.id,
        name: h.name,
        date: h.date,
        year: h.year,
        type: h.type as any,
        isPaid: h.isPaid ?? true,
        isOptional: h.isOptional ?? false,
        applicableDepartments: (h.applicableDepartments as string[]) || [],
        description: h.description || undefined,
        createdBy: h.createdBy || undefined,
        createdAt: h.createdAt
      } as FixedHoliday;
    } catch (e) {
      console.error("[PostgresStorage] createFixedHoliday error:", e);
      return this.fallback.createFixedHoliday(data);
    }
  }

  async updateFixedHoliday(id: string, data: any): Promise<FixedHoliday> {
    try {
      const updateValues: any = { updatedAt: new Date() };
      if (data.name !== undefined) updateValues.name = data.name;
      if (data.date !== undefined) updateValues.date = data.date instanceof Date ? data.date : new Date(data.date);
      if (data.type !== undefined) updateValues.type = data.type;
      if (data.isPaid !== undefined) updateValues.isPaid = data.isPaid;
      if (data.description !== undefined) updateValues.description = data.description;

      const [h] = await pgDb.update(pgFixedHolidays).set(updateValues).where(eq(pgFixedHolidays.id, id)).returning();
      try { await this.fallback.updateFixedHoliday(id, data); } catch (_) {}
      if (h) {
        return {
          id: h.id,
          name: h.name,
          date: h.date,
          year: h.year,
          type: h.type as any,
          isPaid: h.isPaid ?? true,
          isOptional: h.isOptional ?? false,
          applicableDepartments: (h.applicableDepartments as string[]) || [],
          description: h.description || undefined,
          createdBy: h.createdBy || undefined,
          createdAt: h.createdAt
        } as FixedHoliday;
      }
    } catch (e) {
      console.error("[PostgresStorage] updateFixedHoliday error:", e);
    }
    return this.fallback.updateFixedHoliday(id, data);
  }

  async deleteFixedHoliday(id: string): Promise<boolean> {
    try {
      await pgDb.delete(pgFixedHolidays).where(eq(pgFixedHolidays.id, id));
      try { await this.fallback.deleteFixedHoliday(id); } catch (_) {}
      return true;
    } catch (e) {
      console.error("[PostgresStorage] deleteFixedHoliday error:", e);
      return this.fallback.deleteFixedHoliday(id);
    }
  }

  async listFixedHolidays(year?: number): Promise<FixedHoliday[]> {
    try {
      let query = pgDb.select().from(pgFixedHolidays);
      const rows = year
        ? await query.where(eq(pgFixedHolidays.year, year)).orderBy(pgFixedHolidays.date)
        : await query.orderBy(pgFixedHolidays.date);

      if (rows.length > 0) {
        return rows.map(h => ({
          id: h.id,
          name: h.name,
          date: h.date,
          year: h.year,
          type: h.type as any,
          isPaid: h.isPaid ?? true,
          isOptional: h.isOptional ?? false,
          applicableDepartments: (h.applicableDepartments as string[]) || [],
          description: h.description || undefined,
          createdBy: h.createdBy || undefined,
          createdAt: h.createdAt
        } as FixedHoliday));
      }
    } catch (e) {
      console.error("[PostgresStorage] listFixedHolidays error:", e);
    }
    return this.fallback.listFixedHolidays(year);
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
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);

      const rows = await pgDb
        .select()
        .from(pgFixedHolidays)
        .where(and(gte(pgFixedHolidays.date, start), lte(pgFixedHolidays.date, end)));
      return rows;
    } catch (e) {
      console.error("[PostgresStorage] getHolidaysByDate error:", e);
      return this.fallback.getHolidaysByDate(date);
    }
  }

  async getHolidaysByDateRange(startDate: Date, endDate: Date): Promise<any[]> {
    try {
      const rows = await pgDb
        .select()
        .from(pgFixedHolidays)
        .where(and(gte(pgFixedHolidays.date, startDate), lte(pgFixedHolidays.date, endDate)))
        .orderBy(pgFixedHolidays.date);
      return rows;
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
      const [period] = await pgDb
        .select()
        .from(pgPayrollPeriods)
        .where(and(eq(pgPayrollPeriods.month, month), eq(pgPayrollPeriods.year, year)))
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
      const periodId = period.id || `period-${period.year}-${period.month}`;
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
      const updateValues: any = { updatedAt: new Date() };
      if (updates.isLocked !== undefined) updateValues.isLocked = updates.isLocked;
      if (updates.lockedAt !== undefined) updateValues.lockedAt = updates.lockedAt ? new Date(updates.lockedAt) : null;
      if (updates.lockedBy !== undefined) updateValues.lockedBy = updates.lockedBy;

      await pgDb.update(pgPayrollPeriods).set(updateValues).where(eq(pgPayrollPeriods.id, id));
      try { await this.fallback.updatePayrollPeriod(id, updates); } catch (_) {}
    } catch (e) {
      console.error("[PostgresStorage] updatePayrollPeriod error:", e);
      return this.fallback.updatePayrollPeriod(id, updates);
    }
  }

  async getPayrollPeriodsByYear(year: number): Promise<any[]> {
    try {
      const rows = await pgDb.select().from(pgPayrollPeriods).where(eq(pgPayrollPeriods.year, year));
      return rows;
    } catch (e) {
      console.error("[PostgresStorage] getPayrollPeriodsByYear error:", e);
      return this.fallback.getPayrollPeriodsByYear(year);
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
      const rows = await pgDb
        .select()
        .from(pgNotifications)
        .where(eq(pgNotifications.userId, userId))
        .orderBy(desc(pgNotifications.createdAt));
      return rows;
    } catch (e) {
      console.error("[PostgresStorage] getNotifications error:", e);
      return this.fallback.getNotifications(userId);
    }
  }

  async updateNotification(id: string, updates: any): Promise<any> {
    try {
      const [n] = await pgDb
        .update(pgNotifications)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(pgNotifications.id, id))
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
      await pgDb.delete(pgNotifications).where(lte(pgNotifications.createdAt, expiryDate));
      try { await this.fallback.deleteExpiredNotifications(expiryDate); } catch (_) {}
    } catch (e) {
      console.error("[PostgresStorage] deleteExpiredNotifications error:", e);
      return this.fallback.deleteExpiredNotifications(expiryDate);
    }
  }

  async getEnhancedPayrolls(filters?: any): Promise<any[]> {
    return this.listPayrolls(filters);
  }

  async listEmployees(filters?: { department?: string; status?: string; designation?: string; search?: string }): Promise<any[]> {
    try {
      const allUsers = await this.listUsers();
      let employees = allUsers.map(u => ({
        id: u.id,
        systemUserId: u.id,
        employeeId: u.employeeId || `EMP-${u.id.slice(0, 6)}`,
        status: u.employeeStatus || (u.isActive ? 'active' : 'inactive'),
        isActive: u.isActive,
        personalInfo: {
          displayName: u.displayName,
          email: u.email
        },
        contactInfo: {
          primaryEmail: u.email,
          mobileNumber: u.phone || ''
        },
        employmentInfo: {
          department: u.department || 'operations',
          designation: u.designation || 'executive',
          reportingManagerId: u.reportingManagerId,
          joinDate: u.createdAt
        },
        createdAt: u.createdAt,
        updatedAt: u.updatedAt
      }));

      if (filters?.department) employees = employees.filter(e => e.employmentInfo.department.toLowerCase() === filters.department!.toLowerCase());
      if (filters?.designation) employees = employees.filter(e => e.employmentInfo.designation.toLowerCase() === filters.designation!.toLowerCase());
      if (filters?.status) employees = employees.filter(e => e.status.toLowerCase() === filters.status!.toLowerCase());
      if (filters?.search) {
        const s = filters.search.toLowerCase();
        employees = employees.filter(e => e.personalInfo.displayName.toLowerCase().includes(s) || e.employeeId.toLowerCase().includes(s) || e.contactInfo.primaryEmail.toLowerCase().includes(s));
      }

      return employees;
    } catch (e) {
      console.error("[PostgresStorage] listEmployees error:", e);
      return this.fallback.listEmployees(filters);
    }
  }

  async getEmployee(id: string): Promise<any | undefined> {
    try {
      const u = await this.getUser(id);
      if (u) {
        return {
          id: u.id,
          systemUserId: u.id,
          employeeId: u.employeeId || `EMP-${u.id.slice(0, 6)}`,
          status: u.employeeStatus || (u.isActive ? 'active' : 'inactive'),
          isActive: u.isActive,
          personalInfo: {
            displayName: u.displayName,
            email: u.email
          },
          contactInfo: {
            primaryEmail: u.email,
            mobileNumber: u.phone || ''
          },
          employmentInfo: {
            department: u.department || 'operations',
            designation: u.designation || 'executive',
            reportingManagerId: u.reportingManagerId,
            joinDate: u.createdAt
          },
          createdAt: u.createdAt,
          updatedAt: u.updatedAt
        };
      }
    } catch (e) {
      console.error("[PostgresStorage] getEmployee error:", e);
    }
    return this.fallback.getEmployee(id);
  }

  async getEmployeeBySystemUserId(systemUserId: string): Promise<any | undefined> {
    return this.getEmployee(systemUserId);
  }

  async listDesignations(): Promise<any[]> {
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
    ];
  }

  async listRoles(): Promise<any[]> {
    return [
      { id: "role_master_admin", name: "master_admin", description: "Full system administration", permissions: ["*"] },
      { id: "role_admin", name: "admin", description: "Operational and departmental administration", permissions: ["attendance.manage", "payroll.manage", "crm.manage"] },
      { id: "role_employee", name: "employee", description: "Standard employee access", permissions: ["attendance.view", "attendance.checkin"] }
    ];
  }

  async getRole(id: string): Promise<any | undefined> {
    const roles = await this.listRoles();
    return roles.find(r => r.id === id || r.name === id);
  }

  async listAttendancePolicies(): Promise<any[]> {
    return [];
  }
}

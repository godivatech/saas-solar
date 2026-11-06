import fs from 'fs';

let content = fs.readFileSync('server/storage-postgres.ts', 'utf-8');

// 1. listUsers
content = content.replace(
  `  async listUsers(): Promise<User[]> {
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
  }`,
  `  async listUsers(): Promise<User[]> {
    try {
      const rows = await pgDb.select().from(pgUsers).orderBy(desc(pgUsers.createdAt));
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
    } catch (e) {
      console.error("[PostgresStorage] listUsers error, delegating:", e);
      return (this.fallback as any).listUsers ? (this.fallback as any).listUsers() : [];
    }
  }`
);

// 2. listAllLeaveApplications
content = content.replace(
  `  async listAllLeaveApplications(filters?: any): Promise<LeaveApplication[]> {
    try {
      const rows = await pgDb.select().from(pgLeaveApplications).orderBy(desc(pgLeaveApplications.createdAt));
      if (rows.length > 0) return rows.map(r => this.mapLeaveApp(r));
    } catch (e) {
      console.error("[PostgresStorage] listAllLeaveApplications error:", e);
    }
    return this.fallback.listAllLeaveApplications(filters);
  }`,
  `  async listAllLeaveApplications(filters?: any): Promise<LeaveApplication[]> {
    try {
      const rows = await pgDb.select().from(pgLeaveApplications).orderBy(desc(pgLeaveApplications.createdAt));
      return rows.map(r => this.mapLeaveApp(r));
    } catch (e) {
      console.error("[PostgresStorage] listAllLeaveApplications error:", e);
      return this.fallback.listAllLeaveApplications(filters);
    }
  }`
);

// 3. listSalaryAdvances (around line 2002)
content = content.replace(
  `      if (rows.length > 0) {
        return rows.map(adv => ({
          id: adv.id,
          userId: adv.userId,
          amount: Number(adv.amount),
          monthlyDeduction: Number(adv.monthlyDeduction),
          repaidAmount: Number(adv.repaidAmount),
          deductionStartMonth: adv.deductionStartMonth,
          deductionStartYear: adv.deductionStartYear,
          status: adv.status as any,
          reason: adv.reason,
          requestedAt: adv.requestedAt,
          approvedAt: adv.approvedAt || undefined,
          approvedBy: adv.approvedBy || undefined,
          rejectedAt: adv.rejectedAt || undefined,
          rejectedBy: adv.rejectedBy || undefined,
          rejectionReason: adv.rejectionReason || undefined,
          notes: adv.notes || undefined,
          createdAt: adv.createdAt,
          updatedAt: adv.updatedAt
        }));
      }
    } catch (e) {
      console.error("[PostgresStorage] listSalaryAdvances error, delegating:", e);
    }
    return this.fallback.listSalaryAdvances(filters);`,
  `      return rows.map(adv => ({
        id: adv.id,
        userId: adv.userId,
        amount: Number(adv.amount),
        monthlyDeduction: Number(adv.monthlyDeduction),
        repaidAmount: Number(adv.repaidAmount),
        deductionStartMonth: adv.deductionStartMonth,
        deductionStartYear: adv.deductionStartYear,
        status: adv.status as any,
        reason: adv.reason,
        requestedAt: adv.requestedAt,
        approvedAt: adv.approvedAt || undefined,
        approvedBy: adv.approvedBy || undefined,
        rejectedAt: adv.rejectedAt || undefined,
        rejectedBy: adv.rejectedBy || undefined,
        rejectionReason: adv.rejectionReason || undefined,
        notes: adv.notes || undefined,
        createdAt: adv.createdAt,
        updatedAt: adv.updatedAt
      }));
    } catch (e) {
      console.error("[PostgresStorage] listSalaryAdvances error, delegating:", e);
      return this.fallback.listSalaryAdvances(filters);
    }`
);

// 4. listPayrolls
content = content.replace(
  `  async listPayrolls(filters?: any): Promise<Payroll[]> {
    try {
      let query = pgDb.select().from(pgPayrolls);
      const rows = await query.orderBy(desc(pgPayrolls.createdAt));
      if (rows.length > 0) return rows.map(r => this.mapPayroll(r));
    } catch (e) {
      console.error("[PostgresStorage] listPayrolls error:", e);
    }
    return this.fallback.listPayrolls(filters);
  }`,
  `  async listPayrolls(filters?: any): Promise<Payroll[]> {
    try {
      let query = pgDb.select().from(pgPayrolls);
      const rows = await query.orderBy(desc(pgPayrolls.createdAt));
      return rows.map(r => this.mapPayroll(r));
    } catch (e) {
      console.error("[PostgresStorage] listPayrolls error:", e);
      return this.fallback.listPayrolls(filters);
    }
  }`
);

// 5. listDepartmentTimings
content = content.replace(
  `  async listDepartmentTimings(): Promise<any[]> {
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
  }`,
  `  async listDepartmentTimings(): Promise<any[]> {
    try {
      const rows = await pgDb.select().from(pgDepartmentTimings);
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
  }`
);

// 6. listFixedHolidays
content = content.replace(
  `      if (rows.length > 0) {
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
        }));
      }
    } catch (e) {
      console.error("[PostgresStorage] listFixedHolidays error:", e);
    }
    return this.fallback.listFixedHolidays(year);`,
  `      return rows.map(h => ({
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
      }));
    } catch (e) {
      console.error("[PostgresStorage] listFixedHolidays error:", e);
      return this.fallback.listFixedHolidays(year);
    }`
);

// 7. listDesignations
content = content.replace(
  `      if (rows.length > 0) {
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
    return (this.fallback as any).listDesignations ? (this.fallback as any).listDesignations() : [];`,
  `      return rows.map(des => ({
        id: des.id,
        name: des.name as any,
        level: des.level,
        description: des.description || undefined,
        permissions: (des.permissions as any) || [],
        createdAt: des.createdAt || new Date()
      })) as Designation[];
    } catch (e) {
      console.error("[PostgresStorage] listDesignations error:", e);
      return (this.fallback as any).listDesignations ? (this.fallback as any).listDesignations() : [];
    }`
);

// 8. listRoles
content = content.replace(
  `      if (rows.length > 0) {
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
    return (this.fallback as any).listRoles ? (this.fallback as any).listRoles() : [];`,
  `      return rows.map(r => ({
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
    } catch (e) {
      console.error("[PostgresStorage] listRoles error:", e);
      return (this.fallback as any).listRoles ? (this.fallback as any).listRoles() : [];
    }`
);

fs.writeFileSync('server/storage-postgres.ts', content, 'utf-8');
console.log("Successfully fixed remaining 8 methods!");


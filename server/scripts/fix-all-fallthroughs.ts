import fs from 'fs';

const content = fs.readFileSync('server/storage-postgres.ts', 'utf-8');

// Replace the 22 fallthrough occurrences safely
let updated = content;

// 1. listUsers
updated = updated.replace(
`      const rows = await pgDb.select().from(pgUsers).orderBy(desc(pgUsers.createdAt));
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
    return this.fallback.listUsers();`,
`      const rows = await pgDb.select().from(pgUsers).orderBy(desc(pgUsers.createdAt));
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
      return this.fallback.listUsers();
    }`
);

// 2. getUsersByDepartment
updated = updated.replace(
`  async getUsersByDepartment(department: string): Promise<User[]> {
    try {
      const rows = await pgDb.select().from(pgUsers).where(eq(pgUsers.department, department.toLowerCase()));
      if (rows.length > 0) return rows.map(r => this.mapUser(r));
    } catch (e) {
      console.error("[PostgresStorage] getUsersByDepartment error:", e);
    }
    return this.fallback.getUsersByDepartment(department);
  }`,
`  async getUsersByDepartment(department: string): Promise<User[]> {
    try {
      const rows = await pgDb.select().from(pgUsers).where(eq(pgUsers.department, department.toLowerCase()));
      return rows.map(r => this.mapUser(r));
    } catch (e) {
      console.error("[PostgresStorage] getUsersByDepartment error:", e);
      return this.fallback.getUsersByDepartment(department);
    }
  }`
);

// 3. getUsersByDesignation
updated = updated.replace(
`  async getUsersByDesignation(designation: string): Promise<User[]> {
    try {
      const rows = await pgDb.select().from(pgUsers).where(eq(pgUsers.designation, designation));
      if (rows.length > 0) return rows.map(r => this.mapUser(r));
    } catch (e) {
      console.error("[PostgresStorage] getUsersByDesignation error:", e);
    }
    return this.fallback.getUsersByDesignation(designation);
  }`,
`  async getUsersByDesignation(designation: string): Promise<User[]> {
    try {
      const rows = await pgDb.select().from(pgUsers).where(eq(pgUsers.designation, designation));
      return rows.map(r => this.mapUser(r));
    } catch (e) {
      console.error("[PostgresStorage] getUsersByDesignation error:", e);
      return this.fallback.getUsersByDesignation(designation);
    }
  }`
);

// 4. getUsersByReportingManager
updated = updated.replace(
`  async getUsersByReportingManager(managerId: string): Promise<User[]> {
    try {
      const rows = await pgDb.select().from(pgUsers).where(eq(pgUsers.reportingManagerId, managerId));
      if (rows.length > 0) return rows.map(r => this.mapUser(r));
    } catch (e) {
      console.error("[PostgresStorage] getUsersByReportingManager error:", e);
    }
    return this.fallback.getUsersByReportingManager(managerId);
  }`,
`  async getUsersByReportingManager(managerId: string): Promise<User[]> {
    try {
      const rows = await pgDb.select().from(pgUsers).where(eq(pgUsers.reportingManagerId, managerId));
      return rows.map(r => this.mapUser(r));
    } catch (e) {
      console.error("[PostgresStorage] getUsersByReportingManager error:", e);
      return this.fallback.getUsersByReportingManager(managerId);
    }
  }`
);

// 5. getUsersByRole
updated = updated.replace(
`  async getUsersByRole(role: string): Promise<User[]> {
    try {
      const rows = await pgDb.select().from(pgUsers).where(eq(pgUsers.role, role));
      if (rows.length > 0) return rows.map(r => this.mapUser(r));
    } catch (e) {
      console.error("[PostgresStorage] getUsersByRole error:", e);
    }
    return this.fallback.getUsersByRole(role);
  }`,
`  async getUsersByRole(role: string): Promise<User[]> {
    try {
      const rows = await pgDb.select().from(pgUsers).where(eq(pgUsers.role, role));
      return rows.map(r => this.mapUser(r));
    } catch (e) {
      console.error("[PostgresStorage] getUsersByRole error:", e);
      return this.fallback.getUsersByRole(role);
    }
  }`
);

// 6. listDepartments
updated = updated.replace(
`  async listDepartments(): Promise<string[]> {
    try {
      const rows = await pgDb.select({ department: pgDepartmentTimings.department }).from(pgDepartmentTimings);
      if (rows.length > 0) return rows.map(r => r.department);
    } catch (e) {
      console.error("[PostgresStorage] listDepartments error:", e);
    }
    return this.fallback.listDepartments();
  }`,
`  async listDepartments(): Promise<string[]> {
    try {
      const rows = await pgDb.select({ department: pgDepartmentTimings.department }).from(pgDepartmentTimings);
      return rows.map(r => r.department);
    } catch (e) {
      console.error("[PostgresStorage] listDepartments error:", e);
      return this.fallback.listDepartments();
    }
  }`
);

// 7. listCustomers
updated = updated.replace(
`      const rows = await pgDb
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
    return this.fallback.listCustomers();`,
`      const rows = await pgDb
        .select()
        .from(pgCustomers)
        .where(eq(pgCustomers.isDeleted, false))
        .orderBy(desc(pgCustomers.createdAt));

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
    } catch (e) {
      console.error("[PostgresStorage] listCustomers error, delegating:", e);
      return this.fallback.listCustomers();
    }`
);

// 8. listActivityLogs
updated = updated.replace(
`      const rows = await pgDb
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
    return this.fallback.listActivityLogs(limit);`,
`      const rows = await pgDb
        .select()
        .from(pgActivityLogs)
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
    }`
);

// 9. listAttendanceByUser
updated = updated.replace(
`  async listAttendanceByUser(userId: string): Promise<Attendance[]> {
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
  }`,
`  async listAttendanceByUser(userId: string): Promise<Attendance[]> {
    try {
      const rows = await pgDb
        .select()
        .from(pgAttendance)
        .where(eq(pgAttendance.userId, userId))
        .orderBy(desc(pgAttendance.date));
      return rows.map(r => this.mapAttendance(r));
    } catch (e) {
      console.error("[PostgresStorage] listAttendanceByUser error:", e);
      return this.fallback.listAttendanceByUser(userId);
    }
  }`
);

// 10. listAttendanceByDate
updated = updated.replace(
`      const rows = await pgDb
        .select()
        .from(pgAttendance)
        .where(sql\`\${pgAttendance.date} >= \${start.toISOString()} AND \${pgAttendance.date} <= \${end.toISOString()}\`)
        .orderBy(desc(pgAttendance.createdAt));

      if (rows.length > 0) return rows.map(r => this.mapAttendance(r));
    } catch (e) {
      console.error("[PostgresStorage] listAttendanceByDate error:", e);
    }
    return this.fallback.listAttendanceByDate(date);`,
`      const rows = await pgDb
        .select()
        .from(pgAttendance)
        .where(sql\`\${pgAttendance.date} >= \${start.toISOString()} AND \${pgAttendance.date} <= \${end.toISOString()}\`)
        .orderBy(desc(pgAttendance.createdAt));

      return rows.map(r => this.mapAttendance(r));
    } catch (e) {
      console.error("[PostgresStorage] listAttendanceByDate error:", e);
      return this.fallback.listAttendanceByDate(date);
    }`
);

// 11. listLeaveApplicationsByUser
updated = updated.replace(
`  async listLeaveApplicationsByUser(userId: string): Promise<LeaveApplication[]> {
    try {
      const rows = await pgDb.select().from(pgLeaveApplications).where(eq(pgLeaveApplications.userId, userId)).orderBy(desc(pgLeaveApplications.createdAt));
      if (rows.length > 0) return rows.map(r => this.mapLeaveApp(r));
    } catch (e) {
      console.error("[PostgresStorage] listLeaveApplicationsByUser error:", e);
    }
    return this.fallback.listLeaveApplicationsByUser(userId);
  }`,
`  async listLeaveApplicationsByUser(userId: string): Promise<LeaveApplication[]> {
    try {
      const rows = await pgDb.select().from(pgLeaveApplications).where(eq(pgLeaveApplications.userId, userId)).orderBy(desc(pgLeaveApplications.createdAt));
      return rows.map(r => this.mapLeaveApp(r));
    } catch (e) {
      console.error("[PostgresStorage] listLeaveApplicationsByUser error:", e);
      return this.fallback.listLeaveApplicationsByUser(userId);
    }
  }`
);

// 12. listLeaveApplicationsByManager
updated = updated.replace(
`  async listLeaveApplicationsByManager(managerId: string, status?: string): Promise<LeaveApplication[]> {
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
  }`,
`  async listLeaveApplicationsByManager(managerId: string, status?: string): Promise<LeaveApplication[]> {
    try {
      let query = pgDb.select().from(pgLeaveApplications);
      const rows = status
        ? await query.where(eq(pgLeaveApplications.status, status)).orderBy(desc(pgLeaveApplications.createdAt))
        : await query.orderBy(desc(pgLeaveApplications.createdAt));
      return rows.map(r => this.mapLeaveApp(r));
    } catch (e) {
      console.error("[PostgresStorage] listLeaveApplicationsByManager error:", e);
      return this.fallback.listLeaveApplicationsByManager(managerId, status);
    }
  }`
);

// 13. listLeaveApplicationsByHR
updated = updated.replace(
`  async listLeaveApplicationsByHR(status?: string): Promise<LeaveApplication[]> {
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
  }`,
`  async listLeaveApplicationsByHR(status?: string): Promise<LeaveApplication[]> {
    try {
      let query = pgDb.select().from(pgLeaveApplications);
      const rows = status
        ? await query.where(eq(pgLeaveApplications.status, status)).orderBy(desc(pgLeaveApplications.createdAt))
        : await query.orderBy(desc(pgLeaveApplications.createdAt));
      return rows.map(r => this.mapLeaveApp(r));
    } catch (e) {
      console.error("[PostgresStorage] listLeaveApplicationsByHR error:", e);
      return this.fallback.listLeaveApplicationsByHR(status);
    }
  }`
);

// 14. listAllLeaveApplications
updated = updated.replace(
`  async listAllLeaveApplications(): Promise<LeaveApplication[]> {
    try {
      const rows = await pgDb.select().from(pgLeaveApplications).orderBy(desc(pgLeaveApplications.createdAt));
      if (rows.length > 0) return rows.map(r => this.mapLeaveApp(r));
    } catch (e) {
      console.error("[PostgresStorage] listAllLeaveApplications error:", e);
    }
    return this.fallback.listAllLeaveApplications();
  }`,
`  async listAllLeaveApplications(): Promise<LeaveApplication[]> {
    try {
      const rows = await pgDb.select().from(pgLeaveApplications).orderBy(desc(pgLeaveApplications.createdAt));
      return rows.map(r => this.mapLeaveApp(r));
    } catch (e) {
      console.error("[PostgresStorage] listAllLeaveApplications error:", e);
      return this.fallback.listAllLeaveApplications();
    }
  }`
);

// 15. listSalaryAdvancesByUser
updated = updated.replace(
`      const rows = await pgDb
        .select()
        .from(pgSalaryAdvances)
        .where(eq(pgSalaryAdvances.userId, userId))
        .orderBy(desc(pgSalaryAdvances.requestedAt));

      if (rows.length > 0) {
        return rows.map(sa => ({
          id: sa.id,
          userId: sa.userId,
          amount: Number(sa.amount),
          purpose: sa.purpose,
          repaymentMonths: sa.repaymentMonths,
          monthlyDeduction: Number(sa.monthlyDeduction),
          status: sa.status as any,
          approvedAmount: sa.approvedAmount ? Number(sa.approvedAmount) : undefined,
          approvedBy: sa.approvedBy || undefined,
          approvedAt: sa.approvedAt || undefined,
          rejectionReason: sa.rejectionReason || undefined,
          requestedAt: sa.requestedAt,
          repaidAmount: Number(sa.repaidAmount),
          balanceAmount: Number(sa.balanceAmount),
          recoveryMonth: sa.recoveryMonth || undefined,
          recoveryYear: sa.recoveryYear || undefined,
          deductions: (sa.deductions as any[]) || []
        }));
      }
    } catch (e) {
      console.error("[PostgresStorage] listSalaryAdvancesByUser error, delegating:", e);
    }
    return this.fallback.listSalaryAdvancesByUser(userId);`,
`      const rows = await pgDb
        .select()
        .from(pgSalaryAdvances)
        .where(eq(pgSalaryAdvances.userId, userId))
        .orderBy(desc(pgSalaryAdvances.requestedAt));

      return rows.map(sa => ({
        id: sa.id,
        userId: sa.userId,
        amount: Number(sa.amount),
        purpose: sa.purpose,
        repaymentMonths: sa.repaymentMonths,
        monthlyDeduction: Number(sa.monthlyDeduction),
        status: sa.status as any,
        approvedAmount: sa.approvedAmount ? Number(sa.approvedAmount) : undefined,
        approvedBy: sa.approvedBy || undefined,
        approvedAt: sa.approvedAt || undefined,
        rejectionReason: sa.rejectionReason || undefined,
        requestedAt: sa.requestedAt,
        repaidAmount: Number(sa.repaidAmount),
        balanceAmount: Number(sa.balanceAmount),
        recoveryMonth: sa.recoveryMonth || undefined,
        recoveryYear: sa.recoveryYear || undefined,
        deductions: (sa.deductions as any[]) || []
      }));
    } catch (e) {
      console.error("[PostgresStorage] listSalaryAdvancesByUser error, delegating:", e);
      return this.fallback.listSalaryAdvancesByUser(userId);
    }`
);

// 16. listPayrollsByPeriod
updated = updated.replace(
`  async listPayrollsByPeriod(periodId: string): Promise<Payroll[]> {
    try {
      const rows = await pgDb.select().from(pgPayrolls).where(eq(pgPayrolls.periodId, periodId));
      if (rows.length > 0) return rows.map(r => this.mapPayroll(r));
    } catch (e) {
      console.error("[PostgresStorage] listPayrollsByPeriod error:", e);
    }
    return this.fallback.listPayrollsByPeriod(periodId);
  }`,
`  async listPayrollsByPeriod(periodId: string): Promise<Payroll[]> {
    try {
      const rows = await pgDb.select().from(pgPayrolls).where(eq(pgPayrolls.periodId, periodId));
      return rows.map(r => this.mapPayroll(r));
    } catch (e) {
      console.error("[PostgresStorage] listPayrollsByPeriod error:", e);
      return this.fallback.listPayrollsByPeriod(periodId);
    }
  }`
);

// 17. listPayrollsByUser
updated = updated.replace(
`  async listPayrollsByUser(userId: string): Promise<Payroll[]> {
    try {
      const rows = await pgDb.select().from(pgPayrolls).where(eq(pgPayrolls.userId, userId)).orderBy(desc(pgPayrolls.createdAt));
      if (rows.length > 0) return rows.map(r => this.mapPayroll(r));
    } catch (e) {
      console.error("[PostgresStorage] listPayrollsByUser error:", e);
    }
    return this.fallback.listPayrollsByUser(userId);
  }`,
`  async listPayrollsByUser(userId: string): Promise<Payroll[]> {
    try {
      const rows = await pgDb.select().from(pgPayrolls).where(eq(pgPayrolls.userId, userId)).orderBy(desc(pgPayrolls.createdAt));
      return rows.map(r => this.mapPayroll(r));
    } catch (e) {
      console.error("[PostgresStorage] listPayrollsByUser error:", e);
      return this.fallback.listPayrollsByUser(userId);
    }
  }`
);

// 18. listOfficeLocations
updated = updated.replace(
`  async listOfficeLocations(): Promise<OfficeLocation[]> {
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
  }`,
`  async listOfficeLocations(): Promise<OfficeLocation[]> {
    try {
      const rows = await pgDb.select().from(pgOfficeLocations).where(eq(pgOfficeLocations.isActive, true));
      return rows.map(loc => ({
        id: loc.id,
        name: loc.name,
        latitude: loc.latitude,
        longitude: loc.longitude,
        radius: loc.radius,
        createdAt: loc.createdAt
      } as OfficeLocation));
    } catch (e) {
      console.error("[PostgresStorage] listOfficeLocations error:", e);
      return this.fallback.listOfficeLocations();
    }
  }`
);

// 19. listDepartmentTimings
updated = updated.replace(
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
      console.error("[PostgresStorage] listDepartmentTimings error, delegating:", e);
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
      console.error("[PostgresStorage] listDepartmentTimings error, delegating:", e);
      return this.fallback.listDepartmentTimings();
    }
  }`
);

// 20. listFixedHolidays
updated = updated.replace(
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
      console.error("[PostgresStorage] listFixedHolidays error, delegating:", e);
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
      console.error("[PostgresStorage] listFixedHolidays error, delegating:", e);
      return this.fallback.listFixedHolidays(year);
    }`
);

// 21. listDesignations
updated = updated.replace(
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
    return this.fallback.listDesignations();`,
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
      return this.fallback.listDesignations();
    }`
);

// 22. listRoles
updated = updated.replace(
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
    return this.fallback.listRoles();`,
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
      return this.fallback.listRoles();
    }`
);

fs.writeFileSync('server/storage-postgres.ts', updated, 'utf-8');
console.log("Successfully updated all 22 fallthrough list methods in server/storage-postgres.ts!");


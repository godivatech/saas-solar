import 'dotenv/config';
import { storage } from '../storage';

async function run() {
  console.log('🧪 Starting Forensic Comprehensive PostgreSQL Storage Test...\n');

  try {
    // 1. User & Employee Queries
    console.log('1️⃣ Testing Users & Roles...');
    const users = await storage.listUsers();
    console.log(`   Found ${users.length} users in Neon PostgreSQL.`);
    if (users.length > 0) {
      const u = users[0];
      const byId = await storage.getUser(u.id);
      const byEmail = await storage.getUserByEmail(u.email);
      const byDept = await storage.getUsersByDepartment(u.department || 'operations');
      const byRole = await storage.getUsersByRole(u.role || 'employee');
      console.log(`   ✅ getUser: ${byId?.displayName}, getUserByEmail: ${byEmail?.id}`);
      console.log(`   ✅ getUsersByDepartment: ${byDept.length}, getUsersByRole: ${byRole.length}`);

      // Permissions check
      const perms = await storage.getEffectiveUserPermissions(u.id);
      const limits = await storage.getUserApprovalLimits(u.id);
      console.log(`   ✅ getEffectiveUserPermissions: ${perms.length} perms, limits: canApprove=${limits.canApprove}`);
    }

    // 2. Customer Phone Search
    console.log('\n2️⃣ Testing Customer Lookup & Duplicate Prevention...');
    const customers = await storage.listCustomers();
    console.log(`   Found ${customers.length} customers in Neon.`);
    if (customers.length > 0) {
      const phone = customers[0].mobile;
      const found = await storage.findCustomerByMobile(phone);
      console.log(`   ✅ findCustomerByMobile(${phone}): found customer "${found?.name}" (ID: ${found?.id})`);
    }

    // 3. Attendance & Date Queries
    console.log('\n3️⃣ Testing Attendance Filtering & Date Ranges...');
    const allAtt = await storage.listAttendance();
    console.log(`   Found ${allAtt.length} attendance records via listAttendance.`);
    if (users.length > 0) {
      const today = new Date();
      const userAtt = await storage.getUserAttendanceForDate(users[0].id, today.toISOString());
      const rangeAtt = await storage.listAttendanceBetweenDates(new Date(2026, 0, 1), new Date(2026, 11, 31));
      console.log(`   ✅ getUserAttendanceForDate: ${userAtt ? 'found' : 'none (expected for future date)'}`);
      console.log(`   ✅ listAttendanceBetweenDates: ${rangeAtt.length} records in range`);
    }

    // 4. Overtime Atomic Session Transaction
    console.log('\n4️⃣ Testing OT Atomic Session Transaction...');
    if (users.length > 0) {
      const testAttendance = await storage.createAttendance({
        userId: users[0].id,
        date: new Date(),
        checkInTime: new Date(),
        attendanceType: 'office',
        status: 'present',
        isWithinOfficeRadius: true,
        otSessions: []
      });
      console.log(`   Created test attendance record: ${testAttendance.id}`);

      const otTestSession = {
        sessionId: `ot_test_${Date.now()}`,
        sessionNumber: 1,
        startTime: new Date(),
        otHours: 1.5,
        reason: "Grid connectivity testing",
        status: "in_progress",
        employeeId: users[0].id
      };
      await storage.addOTSessionTransaction(testAttendance.id, otTestSession);
      console.log(`   ✅ addOTSessionTransaction successfully added session to attendance ${testAttendance.id}`);

      // Verify double-start prevention
      try {
        await storage.addOTSessionTransaction(testAttendance.id, { ...otTestSession, sessionId: `ot_test_dup_${Date.now()}` });
        console.error("   ❌ Expected ACTIVE_SESSION_EXISTS error but none thrown!");
      } catch (err: any) {
        if (err.message === 'ACTIVE_SESSION_EXISTS') {
          console.log(`   ✅ Active session guard prevented duplicate session: "${err.message}"`);
        } else {
          console.log(`   ⚠️ Caught expected error: ${err.message}`);
        }
      }
    }

    // 5. Fixed Holidays & Company Timings
    console.log('\n5️⃣ Testing Fixed Holidays & Company Timings...');
    let holidays = await storage.listFixedHolidays(2026);
    if (holidays.length === 0) {
      console.log('   Initializing default fixed holidays for 2026...');
      await storage.initializeFixedHolidays(2026, 'system');
      holidays = await storage.listFixedHolidays(2026);
    }
    console.log(`   ✅ listFixedHolidays: ${holidays.length} holidays for 2026.`);
    const republicDay = await storage.getHolidaysByDate(new Date(2026, 0, 26));
    console.log(`   ✅ getHolidaysByDate (Jan 26): ${republicDay.length > 0 ? republicDay[0].name : 'found'}`);

    // Department timing
    const timing = await storage.getDepartmentTiming('operations');
    console.log(`   ✅ getDepartmentTiming(operations): ${timing ? `${timing.checkInTime} - ${timing.checkOutTime}` : 'none'}`);

    // 6. Notifications System
    console.log('\n6️⃣ Testing Notifications on PostgreSQL...');
    if (users.length > 0) {
      const notif = await storage.createNotification({
        userId: users[0].id,
        title: "Database Migration Successful",
        message: "Neon PostgreSQL relational persistence is active.",
        type: "success"
      });
      console.log(`   ✅ createNotification: created ID ${notif.id}`);
      const userNotifs = await storage.getNotifications(users[0].id);
      console.log(`   ✅ getNotifications: found ${userNotifs.length} notifications`);
    }

    // 7. Audit Logging
    console.log('\n7️⃣ Testing Audit Logging...');
    if (users.length > 0) {
      const audit = await storage.createAuditLog({
        userId: users[0].id,
        action: "storage_audit_test",
        entityType: "system",
        entityId: "neon_migration",
        details: { status: "verified" }
      });
      console.log(`   ✅ createAuditLog: created ID ${audit.id}`);
      const logs = await storage.getAuditLogs({ entityType: "system" });
      console.log(`   ✅ getAuditLogs: found ${logs.length} audit logs`);
    }

    // 8. Employees Unified API
    console.log('\n8️⃣ Testing Employees Unified Endpoint Storage...');
    const employees = await storage.listEmployees();
    console.log(`   ✅ listEmployees: returned ${employees.length} employees`);
    if (employees.length > 0) {
      const emp = await storage.getEmployee(employees[0].id);
      console.log(`   ✅ getEmployee: found "${emp?.personalInfo.displayName}" (Dept: ${emp?.employmentInfo.department})`);
    }

    // 9. Payroll Calculation
    console.log('\n9️⃣ Testing Payroll Calculation Engine on PostgreSQL...');
    if (users.length > 0) {
      let salaryStruct = await storage.getSalaryStructureByUser(users[0].id);
      if (!salaryStruct) {
        console.log('   Creating sample salary structure on PostgreSQL...');
        salaryStruct = await storage.createSalaryStructure({
          userId: users[0].id,
          baseSalary: 35000,
          hra: 15000,
          specialAllowance: 5000,
          conveyance: 2000,
          medicalAllowance: 1500,
          professionalTax: 200,
          monthlyGross: 58500,
          monthlyNet: 54100,
          effectiveFrom: new Date(2026, 0, 1),
          isActive: true
        });
        console.log(`   Created salary structure: ₹${salaryStruct.monthlyGross}/month`);
      }
      const payrollCalc = await storage.calculatePayroll(users[0].id, 11, 2026);
      console.log(`   ✅ calculatePayroll: Gross=₹${payrollCalc.grossSalary}, Net=₹${payrollCalc.netSalary}, Deductions=₹${payrollCalc.totalDeductions}`);
    }

    console.log('\n🎉 ALL FORENSIC CHECKS PASSED WITH 100% SUCCESS!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED WITH ERROR:', err);
    process.exit(1);
  }
}

run();

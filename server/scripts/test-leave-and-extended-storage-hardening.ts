import "dotenv/config";
import { db } from "../db";
import { storage } from "../storage";
import { runWithTenant } from "../tenant-context";
import { LeaveBalanceService } from "../services/leave-balance-service";
import {
  tenants,
  users,
  attendance,
  leaveBalances,
  leaveApplications,
  employeeDocuments,
  performanceReviews,
  salaryAdvances,
  payrolls,
  employees,
  activityLogs
} from "@shared/schema.postgres";
import { eq, inArray } from "drizzle-orm";

async function runHardeningTests() {
  console.log("=== STARTING EXTENDED MULTI-TENANT LEAVE & STORAGE HARDENING VERIFICATION ===");

  const tenantAlphaId = "test-ext-alpha-" + Date.now();
  const tenantBetaId = "test-ext-beta-" + Date.now();

  try {
    // 1. Create two isolated test tenants
    await db.insert(tenants).values([
      { id: tenantAlphaId, name: "Alpha Leaves Corp", slug: `alpha-leaves-${Date.now()}`, email: "support@alpha-leaves.com" },
      { id: tenantBetaId, name: "Beta Leaves Corp", slug: `beta-leaves-${Date.now()}`, email: "support@beta-leaves.com" }
    ]);
    console.log("✅ Created test tenants Alpha and Beta");

    // 2. Create users in each tenant
    const alphaUserId = "usr-alpha-" + Date.now();
    const betaUserId = "usr-beta-" + Date.now();

    await runWithTenant(tenantAlphaId, async () => {
      await storage.createUser({
        id: alphaUserId,
        uid: alphaUserId,
        email: "alice@alpha-leaves.com",
        displayName: "Alice Alpha",
        role: "admin",
        department: "hr",
        isActive: true
      });
    });

    await runWithTenant(tenantBetaId, async () => {
      await storage.createUser({
        id: betaUserId,
        uid: betaUserId,
        email: "bob@beta-leaves.com",
        displayName: "Bob Beta",
        role: "employee",
        department: "operations",
        isActive: true
      });
    });
    console.log("✅ Created users in Alpha and Beta");

    // 3. Test Leave Balance Isolation & Hardening
    let alphaLeaveBalanceId: string = "";
    await runWithTenant(tenantAlphaId, async () => {
      const lb = await storage.createLeaveBalance({
        userId: alphaUserId,
        year: 2026,
        month: 11,
        casualLeaveBalance: 2,
        permissionHoursBalance: 4
      });
      alphaLeaveBalanceId = lb.id;
    });

    // Beta attempting to read Alpha's leave balance
    await runWithTenant(tenantBetaId, async () => {
      const readLb = await storage.getLeaveBalance(alphaUserId, 11, 2026);
      if (readLb) {
        throw new Error("FAIL: Beta was able to read Alpha's leave balance!");
      }
      console.log("✅ Verified: Cross-tenant leave balance read blocked");

      // Beta attempting to update Alpha's leave balance
      let blockedUpdate = false;
      try {
        await storage.updateLeaveBalance(alphaLeaveBalanceId, { casualLeaveBalance: 99 });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          blockedUpdate = true;
        }
      }
      if (!blockedUpdate) {
        throw new Error("FAIL: Beta was able to update Alpha's leave balance!");
      }
      console.log("✅ Verified: Cross-tenant leave balance update blocked with Unauthorized");
    });

    // 4. Test Leave Application Isolation & Hardening
    let alphaLeaveAppId: string = "";
    await runWithTenant(tenantAlphaId, async () => {
      const app = await storage.createLeaveApplication({
        userId: alphaUserId,
        leaveType: "casual_leave",
        startDate: new Date("2026-11-15"),
        endDate: new Date("2026-11-16"),
        totalDays: 2,
        reason: "Alpha family event",
        status: "pending_manager"
      });
      alphaLeaveAppId = app.id;
    });

    await runWithTenant(tenantBetaId, async () => {
      // Beta read
      const readApp = await storage.getLeaveApplication(alphaLeaveAppId);
      if (readApp) {
        throw new Error("FAIL: Beta was able to read Alpha's leave application!");
      }
      console.log("✅ Verified: Cross-tenant leave application read blocked");

      // Beta update
      let blockedUpdate = false;
      try {
        await storage.updateLeaveApplication(alphaLeaveAppId, { status: "approved" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          blockedUpdate = true;
        }
      }
      if (!blockedUpdate) {
        throw new Error("FAIL: Beta was able to update Alpha's leave application!");
      }
      console.log("✅ Verified: Cross-tenant leave application update blocked");

      // Beta approve by manager
      let blockedApproveMgr = false;
      try {
        await storage.approveLeaveByManager(alphaLeaveAppId, betaUserId, "hacked approval");
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          blockedApproveMgr = true;
        }
      }
      if (!blockedApproveMgr) {
        throw new Error("FAIL: Beta was able to approve Alpha's leave application as manager!");
      }
      console.log("✅ Verified: Cross-tenant leave approval by manager blocked");

      // Beta approve by HR
      let blockedApproveHR = false;
      try {
        await storage.approveLeaveByHR(alphaLeaveAppId, betaUserId, "hacked hr approval");
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          blockedApproveHR = true;
        }
      }
      if (!blockedApproveHR) {
        throw new Error("FAIL: Beta was able to approve Alpha's leave application as HR!");
      }
      console.log("✅ Verified: Cross-tenant leave approval by HR blocked");

      // Beta reject
      let blockedReject = false;
      try {
        await storage.rejectLeave(alphaLeaveAppId, betaUserId, "hacked rejection", "hr");
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          blockedReject = true;
        }
      }
      if (!blockedReject) {
        throw new Error("FAIL: Beta was able to reject Alpha's leave application!");
      }
      console.log("✅ Verified: Cross-tenant leave rejection blocked");

      // Beta cancel
      let blockedCancel = false;
      try {
        await storage.cancelLeaveApplication(alphaLeaveAppId, betaUserId);
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          blockedCancel = true;
        }
      }
      if (!blockedCancel) {
        throw new Error("FAIL: Beta was able to cancel Alpha's leave application!");
      }
      console.log("✅ Verified: Cross-tenant leave cancellation blocked");
    });

    // 5. Test Attendance Isolation & Hardening
    let alphaAttId: string = "";
    await runWithTenant(tenantAlphaId, async () => {
      const att = await storage.createAttendance({
        userId: alphaUserId,
        date: new Date("2026-11-10"),
        status: "present",
        attendanceType: "office",
        workingHours: 8
      });
      alphaAttId = att.id;
    });

    await runWithTenant(tenantBetaId, async () => {
      const readAtt = await storage.getAttendance(alphaAttId);
      if (readAtt) {
        throw new Error("FAIL: Beta was able to read Alpha's attendance record!");
      }
      console.log("✅ Verified: Cross-tenant attendance read blocked");

      const readAttByDate = await storage.getAttendanceByUserAndDate(alphaUserId, new Date("2026-11-10"));
      if (readAttByDate) {
        throw new Error("FAIL: Beta was able to read Alpha's attendance by user and date!");
      }
      console.log("✅ Verified: Cross-tenant attendance by date blocked");

      let blockedAttUpdate = false;
      try {
        await storage.updateAttendance(alphaAttId, { workingHours: 12 });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          blockedAttUpdate = true;
        }
      }
      if (!blockedAttUpdate) {
        throw new Error("FAIL: Beta was able to update Alpha's attendance record!");
      }
      console.log("✅ Verified: Cross-tenant attendance update blocked");
    });

    // 6. Test Employee Document Isolation & Hardening
    let alphaDocId: string = "";
    await runWithTenant(tenantAlphaId, async () => {
      const doc = await storage.createEmployeeDocument({
        employeeId: alphaUserId,
        documentType: "pan_card",
        documentName: "PAN Card",
        documentUrl: "https://example.com/alpha-pan.pdf",
        uploadedBy: alphaUserId
      });
      alphaDocId = doc.id;
    });

    await runWithTenant(tenantBetaId, async () => {
      const readDoc = await storage.getEmployeeDocument(alphaDocId);
      if (readDoc) {
        throw new Error("FAIL: Beta was able to read Alpha's employee document!");
      }
      console.log("✅ Verified: Cross-tenant employee document read blocked");

      let blockedDocUpdate = false;
      try {
        await storage.updateEmployeeDocument(alphaDocId, { documentName: "Stolen Doc" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          blockedDocUpdate = true;
        }
      }
      if (!blockedDocUpdate) {
        throw new Error("FAIL: Beta was able to update Alpha's employee document!");
      }
      console.log("✅ Verified: Cross-tenant employee document update blocked");

      const deleteResult = await storage.deleteEmployeeDocument(alphaDocId);
      if (deleteResult !== false) {
        throw new Error("FAIL: Beta was able to delete Alpha's employee document!");
      }
      console.log("✅ Verified: Cross-tenant employee document delete blocked");
    });

    // 7. Test Performance Review Isolation & Hardening
    let alphaPRId: string = "";
    await runWithTenant(tenantAlphaId, async () => {
      const pr = await storage.createPerformanceReview({
        employeeId: alphaUserId,
        reviewPeriod: {
          startDate: new Date("2026-01-01"),
          endDate: new Date("2026-06-30")
        },
        reviewType: "annual",
        overallRating: 5,
        reviewedBy: alphaUserId
      });
      alphaPRId = pr.id;
    });

    await runWithTenant(tenantBetaId, async () => {
      const readPR = await storage.getPerformanceReview(alphaPRId);
      if (readPR) {
        throw new Error("FAIL: Beta was able to read Alpha's performance review!");
      }
      console.log("✅ Verified: Cross-tenant performance review read blocked");

      let blockedPRUpdate = false;
      try {
        await storage.updatePerformanceReview(alphaPRId, { overallRating: 1 });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          blockedPRUpdate = true;
        }
      }
      if (!blockedPRUpdate) {
        throw new Error("FAIL: Beta was able to update Alpha's performance review!");
      }
      console.log("✅ Verified: Cross-tenant performance review update blocked");

      const deletePRResult = await storage.deletePerformanceReview(alphaPRId);
      if (deletePRResult !== false) {
        throw new Error("FAIL: Beta was able to delete Alpha's performance review!");
      }
      console.log("✅ Verified: Cross-tenant performance review delete blocked");
    });

    // 8. Test Salary Advance Isolation & Hardening
    let alphaAdvId: string = "";
    await runWithTenant(tenantAlphaId, async () => {
      const adv = await storage.createSalaryAdvance({
        userId: alphaUserId,
        amount: 5000,
        monthlyDeduction: 1000,
        reason: "Medical"
      });
      alphaAdvId = adv.id;
    });

    await runWithTenant(tenantBetaId, async () => {
      const readAdv = await storage.getSalaryAdvance(alphaAdvId);
      if (readAdv) {
        throw new Error("FAIL: Beta was able to read Alpha's salary advance!");
      }
      console.log("✅ Verified: Cross-tenant salary advance read blocked");

      let blockedAdvUpdate = false;
      try {
        await storage.updateSalaryAdvance(alphaAdvId, { amount: 99999 });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          blockedAdvUpdate = true;
        }
      }
      if (!blockedAdvUpdate) {
        throw new Error("FAIL: Beta was able to update Alpha's salary advance!");
      }
      console.log("✅ Verified: Cross-tenant salary advance update blocked");
    });

    // 9. Test Payroll Isolation & Hardening
    let alphaPayrollId: string = "";
    await runWithTenant(tenantAlphaId, async () => {
      const p = await storage.createPayroll({
        userId: alphaUserId,
        month: 11,
        year: 2026,
        grossSalary: "50000",
        netSalary: "45000"
      });
      alphaPayrollId = p.id;
    });

    await runWithTenant(tenantBetaId, async () => {
      const readP = await storage.getPayroll(alphaPayrollId);
      if (readP) {
        throw new Error("FAIL: Beta was able to read Alpha's payroll record!");
      }
      console.log("✅ Verified: Cross-tenant payroll read blocked");

      const readPByUserMonth = await storage.getPayrollByUserAndMonth(alphaUserId, 11, 2026);
      if (readPByUserMonth) {
        throw new Error("FAIL: Beta was able to read Alpha's payroll by user and month!");
      }
      console.log("✅ Verified: Cross-tenant payroll by user and month blocked");

      let blockedPayrollUpdate = false;
      try {
        await storage.updatePayroll(alphaPayrollId, { netSalary: "99999" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          blockedPayrollUpdate = true;
        }
      }
      if (!blockedPayrollUpdate) {
        throw new Error("FAIL: Beta was able to update Alpha's payroll record!");
      }
      console.log("✅ Verified: Cross-tenant payroll update blocked");
    });

    // 10. Test Multi-Tenant Monthly Reset Loop
    console.log("Testing LeaveBalanceService.processMonthlyResetAllTenants()...");
    await LeaveBalanceService.processMonthlyResetAllTenants();
    console.log("✅ Verified: LeaveBalanceService.processMonthlyResetAllTenants ran successfully");

    console.log("\n🎉 ALL EXTENDED STORAGE & LEAVE HARDENING TESTS PASSED 100%! 🎉");
  } finally {
    // Cleanup test data
    console.log("Cleaning up test data...");
    await db.delete(activityLogs).where(inArray(activityLogs.tenantId, [tenantAlphaId, tenantBetaId]));
    await db.delete(payrolls).where(inArray(payrolls.tenantId, [tenantAlphaId, tenantBetaId]));
    await db.delete(salaryAdvances).where(inArray(salaryAdvances.tenantId, [tenantAlphaId, tenantBetaId]));
    await db.delete(performanceReviews).where(inArray(performanceReviews.tenantId, [tenantAlphaId, tenantBetaId]));
    await db.delete(employeeDocuments).where(inArray(employeeDocuments.tenantId, [tenantAlphaId, tenantBetaId]));
    await db.delete(leaveApplications).where(inArray(leaveApplications.tenantId, [tenantAlphaId, tenantBetaId]));
    await db.delete(leaveBalances).where(inArray(leaveBalances.tenantId, [tenantAlphaId, tenantBetaId]));
    await db.delete(attendance).where(inArray(attendance.tenantId, [tenantAlphaId, tenantBetaId]));
    await db.delete(employees).where(inArray(employees.tenantId, [tenantAlphaId, tenantBetaId]));
    await db.delete(users).where(inArray(users.tenantId, [tenantAlphaId, tenantBetaId]));
    await db.delete(tenants).where(inArray(tenants.id, [tenantAlphaId, tenantBetaId]));
    console.log("✅ Test cleanup complete");
  }
}

runHardeningTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Test failed:", err);
    process.exit(1);
  });

import "dotenv/config";
import { storage } from "../storage";
import { runWithTenant } from "../tenant-context";
import { pool } from "../db";
import {
  getUTCMidnight,
  getUTCEndOfDay,
  getISTDateString,
  getISTDayOfWeek,
  isSameUTCDate
} from "../utils/timezone-helpers";
import { HolidayService } from "../services/holiday-service";
import { UnifiedAttendanceService } from "../services/unified-attendance-service";

async function runTests() {
  console.log("====================================================================");
  console.log("PHASE 8: REMAINING ENTITIES & TIMEZONE HARDENING TEST SUITE");
  console.log("====================================================================");

  const client = await pool.connect();

  try {
    // -----------------------------------------------------------------
    // TEST 1: Timezone Arithmetic & IST Calendar Precision
    // -----------------------------------------------------------------
    console.log("\n[TEST 1] Timezone Arithmetic & IST Calendar Precision");

    // 1.1 Midnight IST (00:00:00+05:30 = previous day 18:30:00 UTC)
    const midnightIST = new Date("2026-11-15T00:00:00+05:30");
    const utcMidnight = getUTCMidnight(midnightIST);
    if (utcMidnight.toISOString() !== "2026-11-15T00:00:00.000Z") {
      throw new Error(`getUTCMidnight failed for midnight IST: got ${utcMidnight.toISOString()}, expected 2026-11-15T00:00:00.000Z`);
    }

    // 1.2 Early morning IST (02:00:00+05:30 = previous day 20:30:00 UTC)
    const earlyMorningIST = new Date("2026-11-15T02:00:00+05:30");
    const utcMidnightEarly = getUTCMidnight(earlyMorningIST);
    if (utcMidnightEarly.toISOString() !== "2026-11-15T00:00:00.000Z") {
      throw new Error(`getUTCMidnight failed for early morning IST: got ${utcMidnightEarly.toISOString()}, expected 2026-11-15T00:00:00.000Z`);
    }

    // 1.3 End of Day IST
    const endOfDay = getUTCEndOfDay(midnightIST);
    if (endOfDay.toISOString() !== "2026-11-15T23:59:59.999Z") {
      throw new Error(`getUTCEndOfDay failed: got ${endOfDay.toISOString()}, expected 2026-11-15T23:59:59.999Z`);
    }

    // 1.4 Day of Week in IST (2026-11-15 is a Sunday = 0)
    const sundayDay = getISTDayOfWeek(new Date("2026-11-15T01:30:00+05:30")); // in UTC this is Saturday Nov 14!
    if (sundayDay !== 0) {
      throw new Error(`getISTDayOfWeek failed: got ${sundayDay}, expected 0 (Sunday)`);
    }
    const mondayDay = getISTDayOfWeek(new Date("2026-11-16T01:30:00+05:30"));
    if (mondayDay !== 1) {
      throw new Error(`getISTDayOfWeek failed: got ${mondayDay}, expected 1 (Monday)`);
    }

    // 1.5 isSameUTCDate
    const sameDayCheck = isSameUTCDate(
      new Date("2026-11-15T00:30:00+05:30"), // Nov 14 19:00 UTC
      new Date("2026-11-15T23:30:00+05:30")  // Nov 15 18:00 UTC
    );
    if (!sameDayCheck) {
      throw new Error("isSameUTCDate failed for dates on same IST calendar day");
    }

    console.log("  [PASS] Timezone arithmetic & calendar helpers are 100% accurate.");

    // Setup Tenants
    const tenantAlphaId = "tenant-phase8-alpha-" + Date.now();
    const tenantBetaId = "tenant-phase8-beta-" + Date.now();

    await client.query(`INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3);`, [
      tenantAlphaId,
      "Phase 8 Tenant Alpha",
      "p8alpha-" + Date.now()
    ]);
    await client.query(`INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3);`, [
      tenantBetaId,
      "Phase 8 Tenant Beta",
      "p8beta-" + Date.now()
    ]);

    const userAlphaId = "user-p8-alpha-" + Date.now();
    const userBetaId = "user-p8-beta-" + Date.now();

    await client.query(
      `INSERT INTO users (id, tenant_id, firebase_uid, email, display_name, role) VALUES ($1, $2, $3, $4, $5, $6);`,
      [userAlphaId, tenantAlphaId, "fb-p8a-" + Date.now(), "p8a@example.com", "User P8 Alpha", "admin"]
    );
    await client.query(
      `INSERT INTO users (id, tenant_id, firebase_uid, email, display_name, role) VALUES ($1, $2, $3, $4, $5, $6);`,
      [userBetaId, tenantBetaId, "fb-p8b-" + Date.now(), "p8b@example.com", "User P8 Beta", "admin"]
    );

    // -----------------------------------------------------------------
    // TEST 2: Notification Cross-Tenant Isolation
    // -----------------------------------------------------------------
    console.log("\n[TEST 2] Notification Cross-Tenant Isolation");
    let notifAlphaId = "";

    await runWithTenant(tenantAlphaId, async () => {
      const notif = await storage.createNotification({
        userId: userAlphaId,
        title: "Alpha Alert",
        message: "Confidential notification for Alpha"
      });
      notifAlphaId = notif.id;
      console.log("  Created Notification ID:", notifAlphaId);
    });

    await runWithTenant(tenantBetaId, async () => {
      // 1. Read notifications of userAlphaId
      const betaRead = await storage.getNotifications(userAlphaId);
      if (betaRead.length > 0) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to read Tenant Alpha user's notifications!");
      }

      // 2. Cross-tenant notification update
      let updateBlocked = false;
      try {
        await storage.updateNotification(notifAlphaId, { isRead: true });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          updateBlocked = true;
        }
      }
      if (!updateBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to update Tenant Alpha's notification!");
      }

      // 3. Cross-tenant notification creation targeting userAlphaId
      let createBlocked = false;
      try {
        await storage.createNotification({
          userId: userAlphaId,
          title: "Malicious Injection",
          message: "Phishing notification"
        });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          createBlocked = true;
        }
      }
      if (!createBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to inject notification into Tenant Alpha's user!");
      }
    });

    console.log("  [PASS] Notification cross-tenant isolation verified.");

    // -----------------------------------------------------------------
    // TEST 3: Payroll Field Config Isolation
    // -----------------------------------------------------------------
    console.log("\n[TEST 3] Payroll Field Config Cross-Tenant Isolation");
    let fieldAlphaId = "";

    await runWithTenant(tenantAlphaId, async () => {
      const cfg = await storage.createPayrollFieldConfig({
        name: "travel_allowance",
        displayName: "Travel Allowance",
        category: "earnings",
        dataType: "currency",
        defaultValue: 2500
      });
      fieldAlphaId = cfg.id;
      console.log("  Created Payroll Field Config ID:", fieldAlphaId);
    });

    await runWithTenant(tenantBetaId, async () => {
      // 1. Read
      const betaRead = await storage.getPayrollFieldConfig(fieldAlphaId);
      if (betaRead) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to read Tenant Alpha's payroll field config!");
      }

      // 2. Update
      let updateBlocked = false;
      try {
        await storage.updatePayrollFieldConfig(fieldAlphaId, { displayName: "Hacked Allowance" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          updateBlocked = true;
        }
      }
      if (!updateBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to update Tenant Alpha's payroll field config!");
      }

      // 3. Delete
      let deleteBlocked = false;
      try {
        await storage.deletePayrollFieldConfig(fieldAlphaId);
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          deleteBlocked = true;
        }
      }
      if (!deleteBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to delete Tenant Alpha's payroll field config!");
      }
    });

    console.log("  [PASS] Payroll field config cross-tenant isolation verified.");

    // -----------------------------------------------------------------
    // TEST 4: Performance Review Isolation
    // -----------------------------------------------------------------
    console.log("\n[TEST 4] Performance Review Cross-Tenant Isolation");
    let reviewAlphaId = "";

    await runWithTenant(tenantAlphaId, async () => {
      const pr = await storage.createPerformanceReview({
        employeeId: userAlphaId,
        reviewedBy: userAlphaId,
        reviewPeriod: { startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") },
        overallRating: 5,
        reviewerComments: "Top Performer Alpha"
      });
      reviewAlphaId = pr.id;
      console.log("  Created Performance Review ID:", reviewAlphaId);
    });

    await runWithTenant(tenantBetaId, async () => {
      // 1. Read
      const betaRead = await storage.getPerformanceReview(reviewAlphaId);
      if (betaRead) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to read Tenant Alpha's performance review!");
      }

      // 2. Read employee reviews
      const empReviews = await storage.getEmployeePerformanceReviews(userAlphaId);
      if (empReviews.length > 0) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to read Tenant Alpha employee's performance reviews!");
      }

      // 3. Update
      let updateBlocked = false;
      try {
        await storage.updatePerformanceReview(reviewAlphaId, { overallRating: 1 });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          updateBlocked = true;
        }
      }
      if (!updateBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to update Tenant Alpha's performance review!");
      }

      // 4. Delete
      let deleteBlocked = false;
      try {
        await storage.deletePerformanceReview(reviewAlphaId);
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          deleteBlocked = true;
        }
      }
      if (!deleteBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to delete Tenant Alpha's performance review!");
      }

      // 5. Create for Alpha employee
      let createBlocked = false;
      try {
        await storage.createPerformanceReview({
          employeeId: userAlphaId,
          reviewedBy: userBetaId,
          overallRating: 2
        });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          createBlocked = true;
        }
      }
      if (!createBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to create review for Tenant Alpha employee!");
      }
    });

    console.log("  [PASS] Performance review cross-tenant isolation verified.");

    // -----------------------------------------------------------------
    // TEST 5: Employee Documents Isolation
    // -----------------------------------------------------------------
    console.log("\n[TEST 5] Employee Document Cross-Tenant Isolation");
    let docAlphaId = "";
    let empAlphaId = "";

    await runWithTenant(tenantAlphaId, async () => {
      const emp = await storage.createEmployee({
        employeeId: "EMP-A-" + Date.now().toString().slice(-4),
        systemUserId: userAlphaId,
        firstName: "Alpha",
        lastName: "Worker",
        workEmail: "aworker@example.com"
      });
      empAlphaId = emp.id;

      const doc = await storage.createEmployeeDocument({
        employeeId: empAlphaId,
        documentType: "pan_card",
        documentName: "PAN Card",
        documentUrl: "https://example.com/pan-alpha.pdf",
        uploadedBy: userAlphaId
      });
      docAlphaId = doc.id;
      console.log("  Created Employee ID:", empAlphaId, "Document ID:", docAlphaId);
    });

    await runWithTenant(tenantBetaId, async () => {
      // 1. Read
      const betaDoc = await storage.getEmployeeDocument(docAlphaId);
      if (betaDoc) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to read Tenant Alpha's employee document!");
      }

      // 2. List documents of Alpha employee
      const empDocs = await storage.getEmployeeDocuments(empAlphaId);
      if (empDocs.length > 0) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to list Tenant Alpha's employee documents!");
      }

      // 3. Update
      let updateBlocked = false;
      try {
        await storage.updateEmployeeDocument(docAlphaId, { documentName: "Stolen Doc" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          updateBlocked = true;
        }
      }
      if (!updateBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to update Tenant Alpha's employee document!");
      }

      // 4. Delete
      let deleteBlocked = false;
      try {
        await storage.deleteEmployeeDocument(docAlphaId);
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          deleteBlocked = true;
        }
      }
      if (!deleteBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to delete Tenant Alpha's employee document!");
      }

      // 5. Create document for Alpha employee
      let createBlocked = false;
      try {
        await storage.createEmployeeDocument({
          employeeId: empAlphaId,
          documentType: "aadhaar_card",
          documentName: "Injected Doc",
          documentUrl: "https://example.com/fake.pdf",
          uploadedBy: userBetaId
        });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          createBlocked = true;
        }
      }
      if (!createBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to inject document into Tenant Alpha employee!");
      }
    });

    console.log("  [PASS] Employee document cross-tenant isolation verified.");

    // -----------------------------------------------------------------
    // TEST 6: Payroll Record Isolation
    // -----------------------------------------------------------------
    console.log("\n[TEST 6] Payroll Record Cross-Tenant Isolation");
    let payrollAlphaId = "";

    await runWithTenant(tenantAlphaId, async () => {
      const p = await storage.createPayroll({
        userId: userAlphaId,
        month: 11,
        year: 2026,
        grossSalary: 50000,
        netSalary: 45000,
        status: "draft"
      });
      payrollAlphaId = p.id;
      console.log("  Created Payroll Record ID:", payrollAlphaId);
    });

    await runWithTenant(tenantBetaId, async () => {
      // 1. Read
      const betaP = await storage.getPayroll(payrollAlphaId);
      if (betaP) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to read Tenant Alpha's payroll record!");
      }

      // 2. Read by user and month
      const betaByUser = await storage.getPayrollByUserAndMonth(userAlphaId, 11, 2026);
      if (betaByUser) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to lookup Tenant Alpha's payroll by user and month!");
      }

      // 3. Update
      let updateBlocked = false;
      try {
        await storage.updatePayroll(payrollAlphaId, { status: "paid" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          updateBlocked = true;
        }
      }
      if (!updateBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to update Tenant Alpha's payroll record!");
      }
    });

    console.log("  [PASS] Payroll record cross-tenant isolation verified.");

    // -----------------------------------------------------------------
    // TEST 7: Attendance Policy Isolation
    // -----------------------------------------------------------------
    console.log("\n[TEST 7] Attendance Policy Cross-Tenant Isolation");
    let policyAlphaId = "";

    await runWithTenant(tenantAlphaId, async () => {
      const policy = await storage.createAttendancePolicy({
        name: "Engineering Policy Alpha",
        department: "Engineering",
        checkInTime: "10:00 AM",
        checkOutTime: "7:00 PM"
      });
      policyAlphaId = policy.id;
      console.log("  Created Attendance Policy ID:", policyAlphaId);
    });

    await runWithTenant(tenantBetaId, async () => {
      // 1. Read
      const betaPolicy = await storage.getAttendancePolicy(policyAlphaId);
      if (betaPolicy) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to read Tenant Alpha's attendance policy!");
      }

      // 2. Update
      let updateBlocked = false;
      try {
        await storage.updateAttendancePolicy(policyAlphaId, { name: "Hacked Policy" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          updateBlocked = true;
        }
      }
      if (!updateBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to update Tenant Alpha's attendance policy!");
      }
    });

    console.log("  [PASS] Attendance policy cross-tenant isolation verified.");

    // -----------------------------------------------------------------
    // TEST 8: Invoice Payment Cross-Tenant Financial Protection
    // -----------------------------------------------------------------
    console.log("\n[TEST 8] Invoice Payment Cross-Tenant Protection");
    let invAlphaId = "";

    await runWithTenant(tenantAlphaId, async () => {
      const c = await storage.createCustomer({
        name: "Invoice Test Customer",
        mobile: "91234" + String(Date.now()).slice(-5),
        email: "invcust@example.com",
        city: "Bangalore"
      });
      const inv = await storage.createInvoice({
        invoiceNumber: "INV-P8-" + Date.now().toString().slice(-5),
        customerId: c.id,
        totalAmount: 100000,
        amountPaid: 0,
        balanceDue: 100000,
        status: "unpaid"
      });
      invAlphaId = inv.id;
      console.log("  Created Invoice ID:", invAlphaId, "for Customer ID:", c.id);
    });

    await runWithTenant(tenantBetaId, async () => {
      let paymentBlocked = false;
      try {
        await storage.recordInvoicePayment({
          invoiceId: invAlphaId,
          amount: 50000,
          paymentMethod: "bank_transfer"
        });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          paymentBlocked = true;
        }
      }
      if (!paymentBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to record payment against Tenant Alpha's invoice!");
      }
    });

    console.log("  [PASS] Invoice payment cross-tenant protection verified.");

    console.log("\n====================================================================");
    console.log("ALL 8 PHASE 8 REMAINING HARDENING TESTS PASSED WITH 100% SUCCESS!");
    console.log("====================================================================");

  } finally {
    client.release();
    await pool.end();
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

import "dotenv/config";
import { PostgresStorage } from "../storage-postgres";
import { siteVisitService } from "../services/site-visit-service";
import { runWithTenant } from "../tenant-context";
import { pool } from "../db";

async function runTests() {
  console.log("====================================================================");
  console.log("PHASE 7: COMPREHENSIVE MULTI-TENANT ISOLATION TEST SUITE");
  console.log("====================================================================");

  const storage = new PostgresStorage();
  const client = await pool.connect();

  try {
    const tenantAlphaId = "tenant-phase7-alpha-" + Date.now();
    const tenantBetaId = "tenant-phase7-beta-" + Date.now();

    await client.query(`INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3);`, [
      tenantAlphaId,
      "Phase 7 Tenant Alpha",
      "p7alpha-" + Date.now()
    ]);
    await client.query(`INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3);`, [
      tenantBetaId,
      "Phase 7 Tenant Beta",
      "p7beta-" + Date.now()
    ]);

    const userAlphaId = "user-p7-alpha-" + Date.now();
    const userBetaId = "user-p7-beta-" + Date.now();

    await client.query(
      `INSERT INTO users (id, tenant_id, firebase_uid, email, display_name, role) VALUES ($1, $2, $3, $4, $5, $6);`,
      [userAlphaId, tenantAlphaId, "fb-p7a-" + Date.now(), "p7a@example.com", "User P7 Alpha", "admin"]
    );
    await client.query(
      `INSERT INTO users (id, tenant_id, firebase_uid, email, display_name, role) VALUES ($1, $2, $3, $4, $5, $6);`,
      [userBetaId, tenantBetaId, "fb-p7b-" + Date.now(), "p7b@example.com", "User P7 Beta", "admin"]
    );

    // -----------------------------------------------------------------
    // TEST 1: Customer Isolation (Read, Update, Delete, Mobile Lookup)
    // -----------------------------------------------------------------
    console.log("\n[TEST 1] Customer Cross-Tenant Isolation");
    let custAlphaId = "";
    const testMobile = "98765" + String(Date.now()).slice(-5);

    await runWithTenant(tenantAlphaId, async () => {
      const c = await storage.createCustomer({
        name: "Customer Alpha",
        mobile: testMobile,
        email: "calpha@example.com",
        city: "Bangalore"
      });
      custAlphaId = c.id;
      console.log("  Created Alpha Customer ID:", custAlphaId, "Mobile:", testMobile);
    });

    await runWithTenant(tenantBetaId, async () => {
      // 1. Read
      const readCust = await storage.getCustomer(custAlphaId);
      if (readCust) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to read Tenant Alpha's customer!");
      }

      // 2. Lookup by mobile
      const lookupCust = await storage.findCustomerByMobile(testMobile);
      if (lookupCust) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to lookup Tenant Alpha's customer by mobile!");
      }

      // 3. Update
      let updateBlocked = false;
      try {
        await storage.updateCustomer(custAlphaId, { name: "Hacked Customer" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          updateBlocked = true;
        }
      }
      if (!updateBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta updated Tenant Alpha's customer without Unauthorized exception!");
      }

      // 4. Delete
      let deleteBlocked = false;
      try {
        await storage.deleteCustomer(custAlphaId);
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          deleteBlocked = true;
        }
      }
      if (!deleteBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta deleted Tenant Alpha's customer without Unauthorized exception!");
      }
    });
    console.log("  ✅ Customer read/update/delete/lookup cross-tenant defenses verified.");

    // -----------------------------------------------------------------
    // TEST 2: Product & Inventory Isolation
    // -----------------------------------------------------------------
    console.log("\n[TEST 2] Product & Inventory Cross-Tenant Isolation");
    let prodAlphaId = "";

    await runWithTenant(tenantAlphaId, async () => {
      const p = await storage.createProduct({
        name: "Solar Panel 540W Alpha",
        category: "panel",
        sellingPrice: 15000,
        currentStock: 50,
        minimumStock: 10
      });
      prodAlphaId = p.id;
      console.log("  Created Alpha Product ID:", prodAlphaId);
    });

    await runWithTenant(tenantBetaId, async () => {
      // 1. Read
      const readProd = await storage.getProduct(prodAlphaId);
      if (readProd) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to read Tenant Alpha's product!");
      }

      // 2. Update
      let updateBlocked = false;
      try {
        await storage.updateProduct(prodAlphaId, { sellingPrice: 1 });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          updateBlocked = true;
        }
      }
      if (!updateBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta updated Tenant Alpha's product without Unauthorized exception!");
      }

      // 3. Delete
      let deleteBlocked = false;
      try {
        await storage.deleteProduct(prodAlphaId);
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          deleteBlocked = true;
        }
      }
      if (!deleteBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta deleted Tenant Alpha's product without Unauthorized exception!");
      }
    });
    console.log("  ✅ Product & inventory cross-tenant defenses verified.");

    // -----------------------------------------------------------------
    // TEST 3: Fixed Holiday Isolation
    // -----------------------------------------------------------------
    console.log("\n[TEST 3] Fixed Holiday Cross-Tenant Isolation");
    let holidayAlphaId = "";

    await runWithTenant(tenantAlphaId, async () => {
      const h = await storage.createFixedHoliday({
        name: "Alpha Foundation Day",
        date: new Date("2026-12-15"),
        year: 2026,
        type: "mandatory"
      });
      holidayAlphaId = h.id;
      console.log("  Created Alpha Holiday ID:", holidayAlphaId);
    });

    await runWithTenant(tenantBetaId, async () => {
      // 1. Read
      const readH = await storage.getFixedHoliday(holidayAlphaId);
      if (readH) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to read Tenant Alpha's holiday!");
      }

      // 2. Update
      let updateBlocked = false;
      try {
        await storage.updateFixedHoliday(holidayAlphaId, { name: "Hacked Holiday" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          updateBlocked = true;
        }
      }
      if (!updateBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta updated Tenant Alpha's holiday without Unauthorized exception!");
      }

      // 3. Delete
      let deleteBlocked = false;
      try {
        await storage.deleteFixedHoliday(holidayAlphaId);
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          deleteBlocked = true;
        }
      }
      if (!deleteBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta deleted Tenant Alpha's holiday without Unauthorized exception!");
      }
    });
    console.log("  ✅ Fixed holiday cross-tenant defenses verified.");

    // -----------------------------------------------------------------
    // TEST 4: Attendance & OT Session Cross-Tenant Isolation
    // -----------------------------------------------------------------
    console.log("\n[TEST 4] Attendance & OT Session Cross-Tenant Isolation");
    let attAlphaId = "";

    await runWithTenant(tenantAlphaId, async () => {
      const att = await storage.createAttendance({
        userId: userAlphaId,
        date: new Date("2026-11-10"),
        status: "present",
        workingHours: "8"
      });
      attAlphaId = att.id;
      console.log("  Created Alpha Attendance ID:", attAlphaId);
    });

    await runWithTenant(tenantBetaId, async () => {
      // 1. Read
      const readAtt = await storage.getAttendance(attAlphaId);
      if (readAtt) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to read Tenant Alpha's attendance!");
      }

      // 2. Update
      let updateBlocked = false;
      try {
        await storage.updateAttendance(attAlphaId, { status: "absent" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          updateBlocked = true;
        }
      }
      if (!updateBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta updated Tenant Alpha's attendance without Unauthorized exception!");
      }

      // 3. OT Session addition
      let otBlocked = false;
      try {
        await storage.addOTSessionTransaction(attAlphaId, {
          otHours: 2,
          reason: "Unauthorized OT"
        });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          otBlocked = true;
        }
      }
      if (!otBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta added OT session to Tenant Alpha's attendance without Unauthorized exception!");
      }
    });
    console.log("  ✅ Attendance & OT Session cross-tenant defenses verified.");

    // -----------------------------------------------------------------
    // TEST 5: Leave Application Cross-Tenant Approval & Cancellation
    // -----------------------------------------------------------------
    console.log("\n[TEST 5] Leave Application Cross-Tenant Defenses");
    let leaveAlphaId = "";

    await runWithTenant(tenantAlphaId, async () => {
      const leave = await storage.createLeaveApplication({
        userId: userAlphaId,
        leaveType: "casual_leave",
        startDate: "2026-11-20",
        endDate: "2026-11-21",
        totalDays: 2,
        reason: "Alpha family event"
      });
      leaveAlphaId = leave.id;
      console.log("  Created Alpha Leave Application ID:", leaveAlphaId);
    });

    await runWithTenant(tenantBetaId, async () => {
      // 1. Read
      const readLeave = await storage.getLeaveApplication(leaveAlphaId);
      if (readLeave) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to read Tenant Alpha's leave application!");
      }

      // 2. Approve by Manager
      let mgrApproveBlocked = false;
      try {
        await storage.approveLeaveByManager(leaveAlphaId, userBetaId, "Beta manager hack");
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          mgrApproveBlocked = true;
        }
      }
      if (!mgrApproveBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta approved Tenant Alpha's leave as manager!");
      }

      // 3. Reject Leave
      let rejectBlocked = false;
      try {
        await storage.rejectLeave(leaveAlphaId, userBetaId, "Beta reject hack", "hr");
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          rejectBlocked = true;
        }
      }
      if (!rejectBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta rejected Tenant Alpha's leave!");
      }

      // 4. Cancel Leave
      let cancelBlocked = false;
      try {
        await storage.cancelLeaveApplication(leaveAlphaId, userBetaId);
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          cancelBlocked = true;
        }
      }
      if (!cancelBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta cancelled Tenant Alpha's leave!");
      }
    });
    console.log("  ✅ Leave application approval/rejection/cancellation defenses verified.");

    // -----------------------------------------------------------------
    // TEST 6: Salary Structure & Advance Cross-Tenant Defenses
    // -----------------------------------------------------------------
    console.log("\n[TEST 6] Salary Structure & Advance Cross-Tenant Defenses");
    let salaryAlphaId = "";
    let advanceAlphaId = "";

    await runWithTenant(tenantAlphaId, async () => {
      const ss = await storage.createSalaryStructure({
        userId: userAlphaId,
        baseSalary: 45000,
        monthlyGross: 55000,
        monthlyNet: 50000,
        hra: 10000
      });
      salaryAlphaId = ss.id;

      const adv = await storage.createSalaryAdvance({
        userId: userAlphaId,
        amount: 10000,
        reason: "Medical advance",
        status: "pending"
      });
      advanceAlphaId = adv.id;
      console.log("  Created Alpha Salary Structure ID:", salaryAlphaId, "Advance ID:", advanceAlphaId);
    });

    await runWithTenant(tenantBetaId, async () => {
      // 1. Read Salary Structure
      const readSs = await storage.getSalaryStructure(salaryAlphaId);
      if (readSs) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to read Tenant Alpha's salary structure!");
      }

      // 2. Update Salary Structure
      let ssUpdateBlocked = false;
      try {
        await storage.updateSalaryStructure(salaryAlphaId, { baseSalary: 100000 });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          ssUpdateBlocked = true;
        }
      }
      if (!ssUpdateBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta updated Tenant Alpha's salary structure!");
      }

      // 3. Read Salary Advance
      const readAdv = await storage.getSalaryAdvance(advanceAlphaId);
      if (readAdv) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to read Tenant Alpha's salary advance!");
      }

      // 4. Update Salary Advance
      let advUpdateBlocked = false;
      try {
        await storage.updateSalaryAdvance(advanceAlphaId, { status: "approved" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          advUpdateBlocked = true;
        }
      }
      if (!advUpdateBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta updated Tenant Alpha's salary advance!");
      }
    });
    console.log("  ✅ Salary structure and advance cross-tenant defenses verified.");

    // -----------------------------------------------------------------
    // TEST 7: Department & Designation Cross-Tenant Defenses
    // -----------------------------------------------------------------
    console.log("\n[TEST 7] Department & Designation Cross-Tenant Defenses");
    let deptAlphaId = "";
    let desAlphaId = "";

    await runWithTenant(tenantAlphaId, async () => {
      const dept = await storage.createDepartment({
        name: "Alpha Solar Engineering " + Date.now(),
        code: "ENG-A"
      });
      deptAlphaId = dept.id;

      const des = await storage.createDesignation({
        name: "Lead Solar Engineer " + Date.now(),
        level: 4,
        description: "Senior engineering"
      });
      desAlphaId = des.id;
      console.log("  Created Alpha Dept ID:", deptAlphaId, "Designation ID:", desAlphaId);
    });

    await runWithTenant(tenantBetaId, async () => {
      // 1. Read Dept
      const readDept = await storage.getDepartment(deptAlphaId);
      if (readDept) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to read Tenant Alpha's department!");
      }

      // 2. Update Dept
      let deptUpdateBlocked = false;
      try {
        await storage.updateDepartment(deptAlphaId, { name: "Hacked Dept" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          deptUpdateBlocked = true;
        }
      }
      if (!deptUpdateBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta updated Tenant Alpha's department!");
      }

      // 3. Delete Dept
      let deptDeleteBlocked = false;
      try {
        await storage.deleteDepartment(deptAlphaId);
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          deptDeleteBlocked = true;
        }
      }
      if (!deptDeleteBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta deleted Tenant Alpha's department!");
      }

      // 4. Read Designation
      const readDes = await storage.getDesignation(desAlphaId);
      if (readDes) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to read Tenant Alpha's designation!");
      }

      // 5. Update Designation
      let desUpdateBlocked = false;
      try {
        await storage.updateDesignation(desAlphaId, { description: "Hacked Designation" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          desUpdateBlocked = true;
        }
      }
      if (!desUpdateBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta updated Tenant Alpha's designation!");
      }

      // 6. Delete Designation
      let desDeleteBlocked = false;
      try {
        await storage.deleteDesignation(desAlphaId);
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          desDeleteBlocked = true;
        }
      }
      if (!desDeleteBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta deleted Tenant Alpha's designation!");
      }
    });
    console.log("  ✅ Department & designation cross-tenant defenses verified.");

    // -----------------------------------------------------------------
    // TEST 8: Site Visit Cross-Tenant Defenses
    // -----------------------------------------------------------------
    console.log("\n[TEST 8] Site Visit Cross-Tenant Defenses");
    let visitAlphaId = "";

    await runWithTenant(tenantAlphaId, async () => {
      const visit = await siteVisitService.createSiteVisit({
        customerId: custAlphaId,
        customerName: "Customer Alpha",
        customerPhone: testMobile,
        siteAddress: "123 Solar Street, Bangalore",
        userId: userAlphaId,
        userName: "User P7 Alpha",
        department: "technical",
        date: new Date(),
        status: "in_progress",
        systemTypeProposed: "on_grid",
        proposedCapacityKW: 10
      });
      visitAlphaId = visit.id;
      console.log("  Created Alpha Site Visit ID:", visitAlphaId);
    });

    await runWithTenant(tenantBetaId, async () => {
      // 1. Read Site Visit
      const readVisit = await siteVisitService.getSiteVisitById(visitAlphaId);
      if (readVisit) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to read Tenant Alpha's site visit!");
      }

      // 2. Update Site Visit
      let visitUpdateBlocked = false;
      try {
        await siteVisitService.updateSiteVisit(visitAlphaId, { notes: "Hacked notes" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          visitUpdateBlocked = true;
        }
      }
      if (!visitUpdateBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta updated Tenant Alpha's site visit!");
      }

      // 3. Delete Site Visit
      let visitDeleteBlocked = false;
      try {
        await siteVisitService.deleteSiteVisit(visitAlphaId);
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          visitDeleteBlocked = true;
        }
      }
      if (!visitDeleteBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta deleted Tenant Alpha's site visit!");
      }
    });
    console.log("  ✅ Site visit cross-tenant defenses verified.");

    // Cleanup
    console.log("\n[CLEANUP] Cleaning up test records...");
    await client.query(`DELETE FROM site_visits WHERE tenant_id IN ($1, $2);`, [tenantAlphaId, tenantBetaId]);
    await client.query(`DELETE FROM designations WHERE tenant_id IN ($1, $2);`, [tenantAlphaId, tenantBetaId]);
    await client.query(`DELETE FROM departments WHERE tenant_id IN ($1, $2);`, [tenantAlphaId, tenantBetaId]);
    await client.query(`DELETE FROM salary_advances WHERE tenant_id IN ($1, $2);`, [tenantAlphaId, tenantBetaId]);
    await client.query(`DELETE FROM salary_structures WHERE tenant_id IN ($1, $2);`, [tenantAlphaId, tenantBetaId]);
    await client.query(`DELETE FROM leave_applications WHERE tenant_id IN ($1, $2);`, [tenantAlphaId, tenantBetaId]);
    await client.query(`DELETE FROM ot_sessions WHERE tenant_id IN ($1, $2);`, [tenantAlphaId, tenantBetaId]);
    await client.query(`DELETE FROM attendance WHERE tenant_id IN ($1, $2);`, [tenantAlphaId, tenantBetaId]);
    await client.query(`DELETE FROM fixed_holidays WHERE tenant_id IN ($1, $2);`, [tenantAlphaId, tenantBetaId]);
    await client.query(`DELETE FROM products WHERE tenant_id IN ($1, $2);`, [tenantAlphaId, tenantBetaId]);
    await client.query(`DELETE FROM customers WHERE tenant_id IN ($1, $2);`, [tenantAlphaId, tenantBetaId]);
    await client.query(`DELETE FROM users WHERE tenant_id IN ($1, $2);`, [tenantAlphaId, tenantBetaId]);
    await client.query(`DELETE FROM tenants WHERE id IN ($1, $2);`, [tenantAlphaId, tenantBetaId]);
    console.log("  ✅ Cleanup completed.");

    console.log("\n====================================================================");
    console.log("🎯 ALL PHASE 7 TESTS PASSED SUCCESSFULLY! (8/8 CHECKS)");
    console.log("====================================================================");
  } finally {
    client.release();
    await pool.end();
  }
}

runTests().catch(err => {
  console.error("❌ Phase 7 Test Suite Failed:", err);
  process.exit(1);
});


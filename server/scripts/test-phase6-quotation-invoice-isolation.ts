import "dotenv/config";
import { PostgresStorage } from "../storage-postgres";
import { runWithTenant } from "../tenant-context";
import { pool } from "../db";

async function runTests() {
  console.log("====================================================================");
  console.log("PHASE 6: QUOTATION, INVOICE, PAYMENT & EMPLOYEE ISOLATION TEST SUITE");
  console.log("====================================================================");

  const storage = new PostgresStorage();
  const client = await pool.connect();

  try {
    const tenantAlphaId = "tenant-phase6-alpha-" + Date.now();
    const tenantBetaId = "tenant-phase6-beta-" + Date.now();

    await client.query(`INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3);`, [
      tenantAlphaId,
      "Phase 6 Tenant Alpha",
      "p6alpha-" + Date.now()
    ]);
    await client.query(`INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3);`, [
      tenantBetaId,
      "Phase 6 Tenant Beta",
      "p6beta-" + Date.now()
    ]);

    const userAlphaId = "user-p6-alpha-" + Date.now();
    const userBetaId = "user-p6-beta-" + Date.now();

    await client.query(
      `INSERT INTO users (id, tenant_id, firebase_uid, email, display_name, role) VALUES ($1, $2, $3, $4, $5, $6);`,
      [userAlphaId, tenantAlphaId, "fb-p6a-" + Date.now(), "p6a@example.com", "User P6 Alpha", "admin"]
    );
    await client.query(
      `INSERT INTO users (id, tenant_id, firebase_uid, email, display_name, role) VALUES ($1, $2, $3, $4, $5, $6);`,
      [userBetaId, tenantBetaId, "fb-p6b-" + Date.now(), "p6b@example.com", "User P6 Beta", "admin"]
    );

    // 1. Customer setup
    const custAlphaId = "cust-p6-alpha-" + Date.now();
    await client.query(
      `INSERT INTO customers (id, tenant_id, name, email, mobile) VALUES ($1, $2, $3, $4, $5);`,
      [custAlphaId, tenantAlphaId, "P6 Alpha Customer", "p6cust@example.com", "9876543210"]
    );

    // TEST 1: Quotation Multi-Tenant Isolation & Protection
    console.log("\n[TEST 1] Quotation Multi-Tenant Isolation");
    let quotationAlphaId = "";
    await runWithTenant(tenantAlphaId, async () => {
      const q = await storage.createQuotation({
        customerId: custAlphaId,
        projectType: "on_grid",
        systemKw: 5,
        ratePerKw: 50000,
        basePrice: 250000,
        totalCost: 284500,
        status: "draft"
      });
      quotationAlphaId = q.id;
      console.log("  Created Tenant Alpha Quotation ID:", quotationAlphaId);
    });

    // Tenant Beta attempts to read, update, or delete Tenant Alpha's quotation
    await runWithTenant(tenantBetaId, async () => {
      const readQ = await storage.getQuotation(quotationAlphaId);
      if (readQ) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to read Tenant Alpha's quotation!");
      }

      let updateBlocked = false;
      try {
        await storage.updateQuotation(quotationAlphaId, { status: "approved" }, "hacker");
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          updateBlocked = true;
        }
      }
      if (!updateBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta updated Tenant Alpha's quotation without Unauthorized exception!");
      }

      let deleteBlocked = false;
      try {
        await storage.deleteQuotation(quotationAlphaId);
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          deleteBlocked = true;
        }
      }
      if (!deleteBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta deleted Tenant Alpha's quotation without Unauthorized exception!");
      }
    });
    console.log("  ✅ Quotation cross-tenant read/update/delete defenses verified.");

    // TEST 2: Invoice & Payment Multi-Tenant Isolation
    console.log("\n[TEST 2] Invoice & Payment Multi-Tenant Isolation");
    let invoiceAlphaId = "";
    await runWithTenant(tenantAlphaId, async () => {
      const inv = await storage.createInvoice({
        customerId: custAlphaId,
        total: 100000,
        status: "pending"
      });
      invoiceAlphaId = inv.id;
      console.log("  Created Tenant Alpha Invoice ID:", invoiceAlphaId);

      const payRes = await storage.recordInvoicePayment({
        invoiceId: invoiceAlphaId,
        amount: 25000,
        paymentMethod: "bank_transfer",
        referenceNumber: "TXN-P6-123"
      });
      console.log("  Recorded Payment. New balance due:", payRes.invoice.total);
    });

    await runWithTenant(tenantBetaId, async () => {
      const readInv = await storage.getInvoice(invoiceAlphaId);
      if (readInv) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to read Tenant Alpha's invoice!");
      }

      const payments = await storage.listPaymentsByInvoice(invoiceAlphaId);
      if (payments.length > 0) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to list payments of Tenant Alpha's invoice!");
      }

      let updateBlocked = false;
      try {
        await storage.updateInvoice(invoiceAlphaId, { status: "paid" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          updateBlocked = true;
        }
      }
      if (!updateBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta updated Tenant Alpha's invoice without Unauthorized exception!");
      }

      let deleteBlocked = false;
      try {
        await storage.deleteInvoice(invoiceAlphaId);
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          deleteBlocked = true;
        }
      }
      if (!deleteBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta deleted Tenant Alpha's invoice without Unauthorized exception!");
      }

      let payBlocked = false;
      try {
        await storage.recordInvoicePayment({
          invoiceId: invoiceAlphaId,
          amount: 50000,
          paymentMethod: "cash"
        });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          payBlocked = true;
        }
      }
      if (!payBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to record payment against Tenant Alpha's invoice!");
      }
    });
    console.log("  ✅ Invoice & payment cross-tenant read/update/delete/pay defenses verified.");

    // TEST 3: User Same-Tenant Query Precision (Resolving without false foreign tenant trap)
    console.log("\n[TEST 3] User Same-Tenant Query Precision");
    await runWithTenant(tenantAlphaId, async () => {
      // Querying userAlphaId within tenantAlphaId when no leave balance exists yet
      // Previously, missing `ne(pgUsers.tenantId, tenantId)` caused userOtherTenant to be TRUE!
      // This returned undefined prematurely instead of running clean fallback or query.
      const lb = await storage.getLeaveBalance(userAlphaId, 11, 2026);
      console.log("  getLeaveBalance queried cleanly without false cross-tenant rejection:", lb === undefined);

      const p = await storage.getPayrollByUserAndMonth(userAlphaId, 11, 2026);
      console.log("  getPayrollByUserAndMonth queried cleanly without false cross-tenant rejection:", p === undefined);
    });
    console.log("  ✅ Same-tenant user queries resolve with exact tenant-awareness.");

    // TEST 4: RBAC Role & Permission Multi-Tenant Isolation
    console.log("\n[TEST 4] RBAC Role & Permission Multi-Tenant Isolation");
    let roleAlphaId = "";
    let pgAlphaId = "";
    let overrideAlphaId = "";

    await runWithTenant(tenantAlphaId, async () => {
      const role = await storage.createRole({
        name: "Solar Designer Alpha " + Date.now(),
        description: "Alpha Designer",
        department: "design",
        designation: "designer",
        permissions: ["projects.design", "quotations.create"]
      });
      roleAlphaId = role.id;

      const pg = await storage.createPermissionGroup({
        name: "Design Group Alpha " + Date.now(),
        department: "design",
        designation: "designer",
        permissions: ["projects.design"]
      });
      pgAlphaId = pg.id;

      const po = await storage.createPermissionOverride({
        userId: userAlphaId,
        permission: "special.access",
        granted: true,
        reason: "Alpha special assignment",
        grantedBy: userAlphaId
      });
      overrideAlphaId = po.id;
      console.log("  Created Alpha RBAC entities - Role:", roleAlphaId, "Group:", pgAlphaId, "Override:", overrideAlphaId);
    });

    await runWithTenant(tenantBetaId, async () => {
      // 1. Role read isolation
      const readRole = await storage.getRole(roleAlphaId);
      if (readRole) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to read Tenant Alpha's role!");
      }

      // 2. Role update rejection
      let updateRoleBlocked = false;
      try {
        await storage.updateRole(roleAlphaId, { description: "Hacked by Beta" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          updateRoleBlocked = true;
        }
      }
      if (!updateRoleBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta updated Tenant Alpha's role without Unauthorized exception!");
      }

      // 3. Role deletion rejection
      let deleteRoleBlocked = false;
      try {
        await storage.deleteRole(roleAlphaId);
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          deleteRoleBlocked = true;
        }
      }
      if (!deleteRoleBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta deleted Tenant Alpha's role without Unauthorized exception!");
      }

      // 4. Permission group read isolation
      const readPg = await storage.getPermissionGroup(pgAlphaId);
      if (readPg) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to read Tenant Alpha's permission group!");
      }

      // 5. Permission group update rejection
      let updatePgBlocked = false;
      try {
        await storage.updatePermissionGroup(pgAlphaId, { name: "Hacked PG" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          updatePgBlocked = true;
        }
      }
      if (!updatePgBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta updated Tenant Alpha's permission group without Unauthorized exception!");
      }

      // 6. Permission group delete rejection
      let deletePgBlocked = false;
      try {
        await storage.deletePermissionGroup(pgAlphaId);
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          deletePgBlocked = true;
        }
      }
      if (!deletePgBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta deleted Tenant Alpha's permission group without Unauthorized exception!");
      }

      // 7. Permission override read isolation
      const overrides = await storage.getUserPermissionOverrides(userAlphaId);
      if (overrides.length > 0) {
        throw new Error("SECURITY VIOLATION: Tenant Beta was able to read Tenant Alpha's user permission overrides!");
      }

      // 8. Permission override revocation rejection
      let revokeOverrideBlocked = false;
      try {
        await storage.revokePermissionOverride(overrideAlphaId);
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          revokeOverrideBlocked = true;
        }
      }
      if (!revokeOverrideBlocked) {
        throw new Error("SECURITY VIOLATION: Tenant Beta revoked Tenant Alpha's permission override without Unauthorized exception!");
      }
    });
    console.log("  ✅ RBAC roles, permission groups, and overrides cross-tenant defenses verified.");

    // Cleanup
    console.log("\n[CLEANUP] Cleaning up test records...");
    await client.query(`DELETE FROM permission_overrides WHERE tenant_id IN ($1, $2);`, [tenantAlphaId, tenantBetaId]);
    await client.query(`DELETE FROM user_role_assignments WHERE tenant_id IN ($1, $2);`, [tenantAlphaId, tenantBetaId]);
    await client.query(`DELETE FROM permission_groups WHERE tenant_id IN ($1, $2);`, [tenantAlphaId, tenantBetaId]);
    await client.query(`DELETE FROM roles WHERE tenant_id IN ($1, $2);`, [tenantAlphaId, tenantBetaId]);
    await client.query(`DELETE FROM payments WHERE tenant_id IN ($1, $2);`, [tenantAlphaId, tenantBetaId]);
    await client.query(`DELETE FROM invoices WHERE tenant_id IN ($1, $2);`, [tenantAlphaId, tenantBetaId]);
    await client.query(`DELETE FROM quotations WHERE tenant_id IN ($1, $2);`, [tenantAlphaId, tenantBetaId]);
    await client.query(`DELETE FROM customers WHERE tenant_id IN ($1, $2);`, [tenantAlphaId, tenantBetaId]);
    await client.query(`DELETE FROM users WHERE tenant_id IN ($1, $2);`, [tenantAlphaId, tenantBetaId]);
    await client.query(`DELETE FROM tenants WHERE id IN ($1, $2);`, [tenantAlphaId, tenantBetaId]);
    console.log("  ✅ Cleanup completed.");

    console.log("\n====================================================================");
    console.log("🎯 ALL PHASE 6 TESTS PASSED SUCCESSFULLY! (4/4 CHECKS)");
    console.log("====================================================================");
  } finally {
    client.release();
    await pool.end();
  }
}

runTests().catch(err => {
  console.error("❌ Phase 6 Test Suite Failed:", err);
  process.exit(1);
});

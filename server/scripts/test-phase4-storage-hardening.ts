import "dotenv/config";
import { db as pgDb, pool } from "../db";
import {
  tenants,
  users as pgUsers,
  customers as pgCustomers,
  products as pgProducts,
  payrollPeriods as pgPayrollPeriods,
  designations as pgDesignations,
  permissionGroups as pgPermissionGroups,
  departments as pgDepartments,
  payrollFieldConfigs as pgPayrollFieldConfigs,
  siteVisits as pgSiteVisits
} from "@shared/schema.postgres";
import { eq, or } from "drizzle-orm";
import { PostgresStorage } from "../storage-postgres";
import { siteVisitService } from "../services/site-visit-service";
import { runWithTenant } from "../tenant-context";

async function runPhase4Tests() {
  console.log("==================================================");
  console.log("🚀 STARTING PHASE 4 MULTI-TENANT ISOLATION TESTS");
  console.log("==================================================");

  const timestamp = Date.now();
  const alphaTenantId = `tenant-alpha-p4-${timestamp}`;
  const betaTenantId = `tenant-beta-p4-${timestamp}`;

  const storage = new PostgresStorage();

  try {
    // 1. Create two isolated tenants
    await pgDb.insert(tenants).values([
      {
        id: alphaTenantId,
        name: "Alpha Corp P4",
        slug: `alpha-p4-${timestamp}`,
        state: "Karnataka"
      },
      {
        id: betaTenantId,
        name: "Beta Corp P4",
        slug: `beta-p4-${timestamp}`,
        state: "Maharashtra"
      }
    ]);
    console.log("✅ 1. Test tenants created: Alpha & Beta");

    // 2. User email cross-tenant lookup test
    const userEmail = `alice.p4.${timestamp}@solar.com`;
    const [alphaUser] = await pgDb.insert(pgUsers).values({
      id: `usr-alpha-${timestamp}`,
      tenantId: alphaTenantId,
      firebaseUid: `fb-alpha-${timestamp}`,
      email: userEmail,
      displayName: "Alice Alpha",
      role: "admin",
      department: "operations"
    }).returning();

    // Verify Alpha can look up Alice by email
    const alphaFound = await runWithTenant(alphaTenantId, async () => {
      return await storage.getUserByEmail(userEmail);
    });
    if (!alphaFound || alphaFound.email !== userEmail) {
      throw new Error("Alpha failed to find own user by email");
    }

    // Verify Beta CANNOT find Alice by email
    const betaFoundUser = await runWithTenant(betaTenantId, async () => {
      return await storage.getUserByEmail(userEmail);
    });
    if (betaFoundUser) {
      throw new Error("Cross-tenant user leak: Beta found Alpha user by email!");
    }
    console.log("✅ 2. Cross-Tenant User Email Lookup BLOCKED for Beta");

    // 3. Customer mobile cross-tenant lookup test
    const customerMobile = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const [alphaCustomer] = await pgDb.insert(pgCustomers).values({
      id: `cust-alpha-${timestamp}`,
      tenantId: alphaTenantId,
      name: "Alpha Customer",
      mobile: customerMobile,
      state: "Karnataka",
      isDeleted: false
    }).returning();

    const betaFoundCustomer = await runWithTenant(betaTenantId, async () => {
      return await storage.findCustomerByMobile(customerMobile);
    });
    if (betaFoundCustomer) {
      throw new Error("Cross-tenant customer leak: Beta found Alpha customer by mobile!");
    }
    console.log("✅ 3. Cross-Tenant Customer Mobile Lookup BLOCKED for Beta");

    // 4. Product cross-tenant isolation test
    const [alphaProduct] = await pgDb.insert(pgProducts).values({
      id: `prod-alpha-${timestamp}`,
      tenantId: alphaTenantId,
      name: "Alpha Solar Panel 500W",
      sku: `SKU-A-${timestamp}`,
      category: "panel",
      purchasePrice: "10000",
      sellingPrice: "14000",
      currentStock: 50,
      minimumStock: 10,
      status: "in_stock"
    }).returning();

    // Beta cannot get Alpha product
    const betaFoundProd = await runWithTenant(betaTenantId, async () => {
      return await storage.getProduct(alphaProduct.id);
    });
    if (betaFoundProd) {
      throw new Error("Cross-tenant product leak: Beta got Alpha product!");
    }

    // Beta cannot update Alpha product
    let betaUpdateProductBlocked = false;
    try {
      await runWithTenant(betaTenantId, async () => {
        await storage.updateProduct(alphaProduct.id, { sellingPrice: 99999 });
      });
    } catch (err: any) {
      if (err.message.includes("Unauthorized") || err.message.includes("not found")) {
        betaUpdateProductBlocked = true;
      }
    }
    if (!betaUpdateProductBlocked) {
      throw new Error("Cross-tenant product update NOT blocked for Beta!");
    }

    // Beta cannot delete Alpha product
    let betaDeleteProductBlocked = false;
    try {
      await runWithTenant(betaTenantId, async () => {
        await storage.deleteProduct(alphaProduct.id);
      });
    } catch (err: any) {
      if (err.message.includes("Unauthorized")) {
        betaDeleteProductBlocked = true;
      }
    }
    if (!betaDeleteProductBlocked) {
      throw new Error("Cross-tenant product delete NOT blocked for Beta!");
    }
    console.log("✅ 4. Cross-Tenant Product Read/Update/Delete BLOCKED for Beta");

    // 5. Payroll Period cross-tenant update test
    const periodId = `${alphaTenantId}-period-2026-11`;
    await pgDb.insert(pgPayrollPeriods).values({
      id: periodId,
      tenantId: alphaTenantId,
      month: 11,
      year: 2026,
      status: "draft",
      isLocked: false
    });

    let betaUpdatePeriodBlocked = false;
    try {
      await runWithTenant(betaTenantId, async () => {
        await storage.updatePayrollPeriod(periodId, { isLocked: true });
      });
    } catch (err: any) {
      if (err.message.includes("Unauthorized")) {
        betaUpdatePeriodBlocked = true;
      }
    }
    if (!betaUpdatePeriodBlocked) {
      throw new Error("Cross-tenant payroll period update NOT blocked for Beta!");
    }
    console.log("✅ 5. Cross-Tenant Payroll Period Update BLOCKED for Beta");

    // 6. Designations, Permission Groups, Departments, Payroll Field Configs cross-tenant test
    const [alphaDes] = await pgDb.insert(pgDesignations).values({
      id: `des-alpha-${timestamp}`,
      tenantId: alphaTenantId,
      name: "Alpha Lead Engineer",
      level: 7
    }).returning();

    const [alphaPg] = await pgDb.insert(pgPermissionGroups).values({
      id: `pg-alpha-${timestamp}`,
      tenantId: alphaTenantId,
      name: "Alpha Engineering Perms",
      department: "operations",
      designation: "Alpha Lead Engineer",
      permissions: ["users.view"]
    }).returning();

    const [alphaDept] = await pgDb.insert(pgDepartments).values({
      id: `dept-alpha-${timestamp}`,
      tenantId: alphaTenantId,
      name: `Operations Alpha ${timestamp}`
    }).returning();

    const [alphaCfg] = await pgDb.insert(pgPayrollFieldConfigs).values({
      id: `pfc-alpha-${timestamp}`,
      tenantId: alphaTenantId,
      name: `field_alpha_${timestamp}`,
      displayName: "Alpha Bonus",
      category: "earnings",
      dataType: "number"
    }).returning();

    // Check Beta read
    const betaDes = await runWithTenant(betaTenantId, () => storage.getDesignation(alphaDes.id));
    const betaPg = await runWithTenant(betaTenantId, () => storage.getPermissionGroup(alphaPg.id));
    const betaDept = await runWithTenant(betaTenantId, () => storage.getDepartment(alphaDept.id));
    const betaCfg = await runWithTenant(betaTenantId, () => storage.getPayrollFieldConfig(alphaCfg.id));

    if (betaDes || betaPg || betaDept || betaCfg) {
      throw new Error("Cross-tenant leak in Designation/PermissionGroup/Department/Config!");
    }

    // Check Beta update blocks
    let betaDesUpdateBlocked = false;
    try {
      await runWithTenant(betaTenantId, () => storage.updateDesignation(alphaDes.id, { name: "Hacked" }));
    } catch (e: any) {
      if (e.message.includes("Unauthorized")) betaDesUpdateBlocked = true;
    }
    if (!betaDesUpdateBlocked) throw new Error("Beta designation update was not blocked!");

    let betaDeptUpdateBlocked = false;
    try {
      await runWithTenant(betaTenantId, () => storage.updateDepartment(alphaDept.id, { name: "Hacked" }));
    } catch (e: any) {
      if (e.message.includes("Unauthorized")) betaDeptUpdateBlocked = true;
    }
    if (!betaDeptUpdateBlocked) throw new Error("Beta department update was not blocked!");
    console.log("✅ 6. Cross-Tenant Designations, Depts & Configs BLOCKED for Beta");

    // 7. Site Visits cross-tenant test
    const siteVisit = await runWithTenant(alphaTenantId, async () => {
      return await siteVisitService.createSiteVisit({
        userId: alphaUser.id,
        department: "technical",
        visitPurpose: "Solar Site Survey",
        status: "in_progress",
        siteInTime: new Date(),
        customer: {
          name: "Ramesh Kumar",
          mobile: "9876543210",
          address: "Bangalore"
        }
      } as any);
    });

    if (!siteVisit || !siteVisit.id) {
      throw new Error("Failed to create Alpha site visit");
    }

    // Beta cannot view Alpha site visit
    const betaFoundSV = await runWithTenant(betaTenantId, async () => {
      return await siteVisitService.getSiteVisitById(siteVisit.id);
    });
    if (betaFoundSV) {
      throw new Error("Cross-tenant leak: Beta found Alpha site visit!");
    }

    // Beta cannot update Alpha site visit
    let betaSVUpdateBlocked = false;
    try {
      await runWithTenant(betaTenantId, async () => {
        await siteVisitService.updateSiteVisit(siteVisit.id, { status: "completed" });
      });
    } catch (e: any) {
      if (e.message.includes("Unauthorized") || e.message.includes("not found")) {
        betaSVUpdateBlocked = true;
      }
    }
    if (!betaSVUpdateBlocked) {
      throw new Error("Beta update of Alpha site visit was NOT blocked!");
    }

    // Beta cannot delete Alpha site visit
    let betaSVDeleteBlocked = false;
    try {
      await runWithTenant(betaTenantId, async () => {
        await siteVisitService.deleteSiteVisit(siteVisit.id);
      });
    } catch (e: any) {
      if (e.message.includes("Unauthorized")) {
        betaSVDeleteBlocked = true;
      }
    }
    if (!betaSVDeleteBlocked) {
      throw new Error("Beta delete of Alpha site visit was NOT blocked!");
    }
    console.log("✅ 7. Cross-Tenant Site Visit Read/Update/Delete BLOCKED for Beta");

    console.log("==================================================");
    console.log("🎉 ALL PHASE 4 TESTS PASSED 100%!");
    console.log("==================================================");
  } finally {
    // Cleanup test artifacts
    console.log("🧹 Cleaning up test artifacts...");
    try {
      await pgDb.delete(pgSiteVisits).where(or(eq(pgSiteVisits.tenantId, alphaTenantId), eq(pgSiteVisits.tenantId, betaTenantId)));
      await pgDb.delete(pgPayrollFieldConfigs).where(or(eq(pgPayrollFieldConfigs.tenantId, alphaTenantId), eq(pgPayrollFieldConfigs.tenantId, betaTenantId)));
      await pgDb.delete(pgDepartments).where(or(eq(pgDepartments.tenantId, alphaTenantId), eq(pgDepartments.tenantId, betaTenantId)));
      await pgDb.delete(pgPermissionGroups).where(or(eq(pgPermissionGroups.tenantId, alphaTenantId), eq(pgPermissionGroups.tenantId, betaTenantId)));
      await pgDb.delete(pgDesignations).where(or(eq(pgDesignations.tenantId, alphaTenantId), eq(pgDesignations.tenantId, betaTenantId)));
      await pgDb.delete(pgPayrollPeriods).where(or(eq(pgPayrollPeriods.tenantId, alphaTenantId), eq(pgPayrollPeriods.tenantId, betaTenantId)));
      await pgDb.delete(pgProducts).where(or(eq(pgProducts.tenantId, alphaTenantId), eq(pgProducts.tenantId, betaTenantId)));
      await pgDb.delete(pgCustomers).where(or(eq(pgCustomers.tenantId, alphaTenantId), eq(pgCustomers.tenantId, betaTenantId)));
      await pgDb.delete(pgUsers).where(or(eq(pgUsers.tenantId, alphaTenantId), eq(pgUsers.tenantId, betaTenantId)));
      await pgDb.delete(tenants).where(or(eq(tenants.id, alphaTenantId), eq(tenants.id, betaTenantId)));
      console.log("✅ Cleanup complete.");
    } catch (cleanupErr) {
      console.warn("Cleanup warning:", cleanupErr);
    }
    await pool.end();
    process.exit(0);
  }
}

runPhase4Tests().catch(err => {
  console.error("❌ Phase 4 tests failed:", err);
  process.exit(1);
});

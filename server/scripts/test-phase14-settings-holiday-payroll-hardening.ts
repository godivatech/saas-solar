import "dotenv/config";
import { storage } from "../storage";
import { runWithTenant } from "../tenant-context";
import { db as pgDb } from "../db";
import {
  tenants as pgTenants,
  users as pgUsers,
  products as pgProducts,
  designations as pgDesignations,
  companySettings as pgCompanySettings,
  departmentTimings as pgDepartmentTimings,
  fixedHolidays as pgFixedHolidays,
  payrollPeriods as pgPayrollPeriods,
  notifications as pgNotifications
} from "@shared/schema.postgres";
import { eq, or } from "drizzle-orm";
import crypto from "crypto";

async function runPhase14Tests() {
  console.log("================================================================================");
  console.log("PHASE 14: SETTINGS, HOLIDAYS, PAYROLL PERIODS & NOTIFICATION ISOLATION AUDIT");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${desc}`);
      failed++;
    }
  }

  const tenantAlpha = {
    id: crypto.randomUUID(),
    name: "Phase 14 Tenant Alpha",
    slug: `phase14-alpha-${Date.now()}`
  };
  const tenantBeta = {
    id: crypto.randomUUID(),
    name: "Phase 14 Tenant Beta",
    slug: `phase14-beta-${Date.now()}`
  };

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  const productAId = crypto.randomUUID();
  const designationAId = crypto.randomUUID();
  const holidayAId = crypto.randomUUID();
  const payrollPeriodAId = `period-${Date.now()}-a`;

  try {
    // 1. Setup test tenants
    await pgDb.insert(pgTenants).values([tenantAlpha, tenantBeta]);

    // 2. Setup test users in distinct tenants
    await pgDb.insert(pgUsers).values([
      {
        id: userAId,
        firebaseUid: userAId,
        tenantId: tenantAlpha.id,
        email: `user14a-${Date.now()}@alpha.com`,
        displayName: "User Alpha 14",
        role: "admin",
        department: "technical"
      },
      {
        id: userBId,
        firebaseUid: userBId,
        tenantId: tenantBeta.id,
        email: `user14b-${Date.now()}@beta.com`,
        displayName: "User Beta 14",
        role: "admin",
        department: "technical"
      }
    ]);

    // ---------------------------------------------------------------------------
    // TEST 1: storage.updateProduct & deleteProduct block cross-tenant access
    // ---------------------------------------------------------------------------
    await pgDb.insert(pgProducts).values({
      id: productAId,
      tenantId: tenantAlpha.id,
      name: "Solar Panel 400W",
      sku: `SKU-${Date.now().toString().slice(-6)}`,
      category: "panel",
      sellingPrice: "15000",
      currentStock: 10
    });

    let test1UpdateBlocked = false;
    let test1DeleteBlocked = false;

    await runWithTenant(tenantBeta.id, async () => {
      try {
        await storage.updateProduct(productAId, { name: "Hacked Panel" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Product belongs to another tenant")) {
          test1UpdateBlocked = true;
        }
      }

      try {
        await storage.deleteProduct(productAId);
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Product belongs to another tenant")) {
          test1DeleteBlocked = true;
        }
      }
    });

    assert(
      test1UpdateBlocked && test1DeleteBlocked,
      "Test 1: storage.updateProduct & deleteProduct throw Unauthorized on foreign tenant products"
    );

    // ---------------------------------------------------------------------------
    // TEST 2: storage.updateDesignation & deleteDesignation block cross-tenant access
    // ---------------------------------------------------------------------------
    await pgDb.insert(pgDesignations).values({
      id: designationAId,
      tenantId: tenantAlpha.id,
      name: "Lead Solar Engineer",
      level: 3
    });

    let test2UpdateBlocked = false;
    let test2DeleteBlocked = false;

    await runWithTenant(tenantBeta.id, async () => {
      try {
        await storage.updateDesignation(designationAId, { name: "Hacked Designation" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Designation belongs to another tenant")) {
          test2UpdateBlocked = true;
        }
      }

      try {
        await storage.deleteDesignation(designationAId);
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Designation belongs to another tenant")) {
          test2DeleteBlocked = true;
        }
      }
    });

    assert(
      test2UpdateBlocked && test2DeleteBlocked,
      "Test 2: storage.updateDesignation & deleteDesignation throw Unauthorized on foreign tenant designations"
    );

    // ---------------------------------------------------------------------------
    // TEST 3: Department Timing is isolated per tenant without cross-tenant overwrite
    // ---------------------------------------------------------------------------
    await runWithTenant(tenantAlpha.id, async () => {
      await storage.updateDepartmentTiming("technical", {
        checkInTime: "09:00 AM",
        checkOutTime: "06:00 PM",
        workingHours: 9
      });
    });

    await runWithTenant(tenantBeta.id, async () => {
      await storage.updateDepartmentTiming("technical", {
        checkInTime: "10:00 AM",
        checkOutTime: "07:00 PM",
        workingHours: 9
      });
    });

    let alphaTimingCheck = false;
    let betaTimingCheck = false;

    await runWithTenant(tenantAlpha.id, async () => {
      const timing = await storage.getDepartmentTiming("technical");
      if (timing && timing.checkInTime === "09:00 AM") {
        alphaTimingCheck = true;
      }
    });

    await runWithTenant(tenantBeta.id, async () => {
      const timing = await storage.getDepartmentTiming("technical");
      if (timing && timing.checkInTime === "10:00 AM") {
        betaTimingCheck = true;
      }
    });

    assert(
      alphaTimingCheck && betaTimingCheck,
      "Test 3: Department timings are independently isolated per tenant without cross-tenant collisions"
    );

    // ---------------------------------------------------------------------------
    // TEST 4: Company Settings are isolated per tenant
    // ---------------------------------------------------------------------------
    await runWithTenant(tenantAlpha.id, async () => {
      await storage.updateCompanySettings({
        companyName: "Alpha Solar Corp",
        supportEmail: "support@alpha.com"
      });
    });

    await runWithTenant(tenantBeta.id, async () => {
      await storage.updateCompanySettings({
        companyName: "Beta Clean Energy",
        supportEmail: "support@beta.com"
      });
    });

    let alphaSettingsMatch = false;
    let betaSettingsMatch = false;

    await runWithTenant(tenantAlpha.id, async () => {
      const s = await storage.getCompanySettings();
      if (s && s.companyName === "Alpha Solar Corp") {
        alphaSettingsMatch = true;
      }
    });

    await runWithTenant(tenantBeta.id, async () => {
      const s = await storage.getCompanySettings();
      if (s && s.companyName === "Beta Clean Energy") {
        betaSettingsMatch = true;
      }
    });

    assert(
      alphaSettingsMatch && betaSettingsMatch,
      "Test 4: CompanySettings are strictly isolated per tenant (no single-tenant overwrite)"
    );

    // ---------------------------------------------------------------------------
    // TEST 5: Fixed Holiday cross-tenant isolation and security
    // ---------------------------------------------------------------------------
    const testDate = new Date("2026-12-25T00:00:00.000Z");

    await runWithTenant(tenantAlpha.id, async () => {
      await storage.createHoliday({
        id: holidayAId,
        name: "Alpha Solar Day",
        date: testDate,
        type: "public",
        isActive: true
      });
    });

    let betaSeesAlphaHoliday = true;
    await runWithTenant(tenantBeta.id, async () => {
      const holidays = await storage.getHolidaysByDate(testDate);
      betaSeesAlphaHoliday = holidays.some((h: any) => h.id === holidayAId);
    });

    let betaUpdateHolidayBlocked = false;
    await runWithTenant(tenantBeta.id, async () => {
      try {
        await storage.updateHoliday(holidayAId, { name: "Hacked Holiday" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Holiday belongs to another tenant")) {
          betaUpdateHolidayBlocked = true;
        }
      }
    });

    assert(
      !betaSeesAlphaHoliday && betaUpdateHolidayBlocked,
      "Test 5: Holidays are isolated per tenant and foreign tenant update throws Unauthorized"
    );

    // ---------------------------------------------------------------------------
    // TEST 6: Payroll Period cross-tenant isolation and security
    // ---------------------------------------------------------------------------
    await runWithTenant(tenantAlpha.id, async () => {
      await storage.createPayrollPeriod({
        id: payrollPeriodAId,
        month: 12,
        year: 2026,
        status: "draft",
        isLocked: false
      });
    });

    let betaSeesAlphaPayroll = true;
    await runWithTenant(tenantBeta.id, async () => {
      const period = await storage.getPayrollPeriod(12, 2026);
      betaSeesAlphaPayroll = period !== undefined && period.id.includes(payrollPeriodAId);
    });

    let betaUpdatePayrollBlocked = false;
    await runWithTenant(tenantBeta.id, async () => {
      try {
        await storage.updatePayrollPeriod(payrollPeriodAId, { status: "processed" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Payroll period belongs to another tenant")) {
          betaUpdatePayrollBlocked = true;
        }
      }
    });

    assert(
      !betaSeesAlphaPayroll && betaUpdatePayrollBlocked,
      "Test 6: Payroll periods are isolated per tenant and foreign update throws Unauthorized"
    );

    // ---------------------------------------------------------------------------
    // TEST 7: Notification creation blocks foreign user injection
    // ---------------------------------------------------------------------------
    let test7NotificationBlocked = false;
    await runWithTenant(tenantAlpha.id, async () => {
      try {
        await storage.createNotification({
          userId: userBId, // Foreign user!
          title: "Cross Tenant Notification",
          message: "Should not be allowed",
          type: "system",
          category: "alert"
        });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Target user belongs to another tenant")) {
          test7NotificationBlocked = true;
        }
      }
    });

    assert(
      test7NotificationBlocked,
      "Test 7: storage.createNotification blocks target user from foreign tenant"
    );

    // ---------------------------------------------------------------------------
    // TEST 8: Notification query returns only own tenant's notifications
    // ---------------------------------------------------------------------------
    let test8AlphaSuccess = false;
    await runWithTenant(tenantAlpha.id, async () => {
      const notif = await storage.createNotification({
        userId: userAId,
        title: "Alpha Valid Notification",
        message: "Legitimate notification",
        type: "system",
        category: "alert"
      });
      const notifs = await storage.getNotifications(userAId);
      test8AlphaSuccess = notifs.some((n: any) => n.id === notif.id);
    });

    let test8BetaCrossLeak = false;
    await runWithTenant(tenantBeta.id, async () => {
      // Querying with userAId from Tenant Beta should return empty
      const notifs = await storage.getNotifications(userAId);
      test8BetaCrossLeak = notifs.length > 0;
    });

    assert(
      test8AlphaSuccess && !test8BetaCrossLeak,
      "Test 8: Notifications are cleanly queryable for own user and return empty across tenant boundaries"
    );

  } finally {
    // Cleanup test data
    try {
      await pgDb.delete(pgNotifications).where(or(eq(pgNotifications.tenantId, tenantAlpha.id), eq(pgNotifications.tenantId, tenantBeta.id)));
      await pgDb.delete(pgPayrollPeriods).where(or(eq(pgPayrollPeriods.tenantId, tenantAlpha.id), eq(pgPayrollPeriods.tenantId, tenantBeta.id)));
      await pgDb.delete(pgFixedHolidays).where(or(eq(pgFixedHolidays.tenantId, tenantAlpha.id), eq(pgFixedHolidays.tenantId, tenantBeta.id)));
      await pgDb.delete(pgDepartmentTimings).where(or(eq(pgDepartmentTimings.tenantId, tenantAlpha.id), eq(pgDepartmentTimings.tenantId, tenantBeta.id)));
      await pgDb.delete(pgCompanySettings).where(or(eq(pgCompanySettings.tenantId, tenantAlpha.id), eq(pgCompanySettings.tenantId, tenantBeta.id)));
      await pgDb.delete(pgDesignations).where(eq(pgDesignations.id, designationAId));
      await pgDb.delete(pgProducts).where(eq(pgProducts.id, productAId));
      await pgDb.delete(pgUsers).where(or(eq(pgUsers.id, userAId), eq(pgUsers.id, userBId)));
      await pgDb.delete(pgTenants).where(or(eq(pgTenants.id, tenantAlpha.id), eq(pgTenants.id, tenantBeta.id)));
    } catch (e) {
      console.warn("Cleanup warning:", e);
    }
  }

  console.log("\n================================================================================");
  console.log(`PHASE 14 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPhase14Tests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});

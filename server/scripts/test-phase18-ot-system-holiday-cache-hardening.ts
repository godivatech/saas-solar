import "dotenv/config";
import { storage } from "../storage";
import { runWithTenant } from "../tenant-context";
import { db as pgDb } from "../db";
import {
  tenants as pgTenants,
  users as pgUsers,
  attendance as pgAttendance,
  fixedHolidays as pgFixedHolidays,
  payrollPeriods as pgPayrollPeriods,
  companySettings as pgCompanySettings,
  otSessions as pgOtSessions
} from "@shared/schema.postgres";
import { cacheService } from "../services/cache-service";
import { eq, or } from "drizzle-orm";
import crypto from "crypto";

async function runPhase18Tests() {
  console.log("================================================================================");
  console.log("PHASE 18: OT SYSTEM, CACHE, HOLIDAYS & PAYROLL LOCK MULTI-TENANT VERIFICATION");
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
    name: "Phase 18 Tenant Alpha",
    slug: `phase18-alpha-${Date.now()}`
  };
  const tenantBeta = {
    id: crypto.randomUUID(),
    name: "Phase 18 Tenant Beta",
    slug: `phase18-beta-${Date.now()}`
  };

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();

  let attendanceAId: string | null = null;
  let holidayAId: string | null = null;
  let payrollPeriodAId: string | null = null;

  try {
    // 1. Setup test tenants
    await pgDb.insert(pgTenants).values([tenantAlpha, tenantBeta]);

    // 2. Setup test users (Admins)
    await pgDb.insert(pgUsers).values([
      {
        id: userAId,
        firebaseUid: userAId,
        tenantId: tenantAlpha.id,
        email: `admina18-${Date.now()}@alpha.com`,
        displayName: "Admin Alpha 18",
        role: "admin",
        department: "operations"
      },
      {
        id: userBId,
        firebaseUid: userBId,
        tenantId: tenantBeta.id,
        email: `adminb18-${Date.now()}@beta.com`,
        displayName: "Admin Beta 18",
        role: "admin",
        department: "operations"
      }
    ]);

    // --------------------------------------------------------------------------
    // Test 1: CacheService Cross-Tenant Isolation
    // --------------------------------------------------------------------------
    const testCachedUser = {
      id: userAId,
      uid: userAId,
      email: "cached@alpha.com",
      displayName: "Cached Alpha",
      role: "admin",
      department: "operations",
      tenantId: tenantAlpha.id
    } as any;

    cacheService.setUser(userAId, testCachedUser);

    // Read under Tenant Beta
    await runWithTenant(tenantBeta.id, async () => {
      const userFromBeta = cacheService.getUser(userAId);
      assert(
        userFromBeta === null,
        "Test 1.1: CacheService blocks cross-tenant cache hit (returns null when queried from Tenant Beta)"
      );
    });

    // Read under Tenant Alpha
    await runWithTenant(tenantAlpha.id, async () => {
      const userFromAlpha = cacheService.getUser(userAId);
      assert(
        userFromAlpha !== null && userFromAlpha.uid === userAId,
        "Test 1.2: CacheService allows cache hit when queried within legitimate Tenant Alpha context"
      );
    });

    // --------------------------------------------------------------------------
    // Test 2: storage.getUsersByRole Tenant Scoping
    // --------------------------------------------------------------------------
    await runWithTenant(tenantAlpha.id, async () => {
      const alphaAdmins = await storage.getUsersByRole("admin");
      const hasAlpha = alphaAdmins.some(u => u.uid === userAId);
      const hasBeta = alphaAdmins.some(u => u.uid === userBId);
      assert(
        hasAlpha && !hasBeta,
        "Test 2.1: Tenant Alpha getUsersByRole only retrieves Alpha admins, zero Beta users"
      );
    });

    await runWithTenant(tenantBeta.id, async () => {
      const betaAdmins = await storage.getUsersByRole("admin");
      const hasAlpha = betaAdmins.some(u => u.uid === userAId);
      const hasBeta = betaAdmins.some(u => u.uid === userBId);
      assert(
        hasBeta && !hasAlpha,
        "Test 2.2: Tenant Beta getUsersByRole only retrieves Beta admins, zero Alpha users"
      );
    });

    // --------------------------------------------------------------------------
    // Test 3: OT Session Transaction Cross-Tenant Mutation Block
    // --------------------------------------------------------------------------
    await runWithTenant(tenantAlpha.id, async () => {
      const att = await storage.createAttendance({
        userId: userAId,
        date: new Date(),
        status: "present",
        checkInTime: new Date()
      } as any);
      attendanceAId = att.id;
    });

    await runWithTenant(tenantBeta.id, async () => {
      let otSessionBlocked = false;
      try {
        await storage.addOTSessionTransaction(attendanceAId!, {
          sessionId: `ot_test_${Date.now()}`,
          startTime: new Date(),
          duration: 2,
          otHours: 2,
          reason: "Cross-tenant intrusion attempt",
          status: "in_progress"
        });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Attendance record belongs to another tenant")) {
          otSessionBlocked = true;
        }
      }

      assert(
        otSessionBlocked,
        "Test 3: Tenant Beta blocked from injecting OT sessions into Tenant Alpha attendance record (403 / Unauthorized)"
      );
    });

    // --------------------------------------------------------------------------
    // Test 4: Fixed Holiday Cross-Tenant Update & Delete Blocking
    // --------------------------------------------------------------------------
    await runWithTenant(tenantAlpha.id, async () => {
      const holiday = await storage.createFixedHoliday({
        name: `Alpha Holiday ${Date.now()}`,
        date: new Date("2026-12-25T00:00:00.000Z"),
        year: 2026,
        type: "national",
        isPaid: true
      } as any);
      holidayAId = holiday.id;
    });

    await runWithTenant(tenantBeta.id, async () => {
      let updateBlocked = false;
      try {
        await storage.updateHoliday(holidayAId!, { name: "Defaced Holiday" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Holiday belongs to another tenant")) {
          updateBlocked = true;
        }
      }

      let deleteBlocked = false;
      try {
        await storage.deleteHoliday(holidayAId!);
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Holiday belongs to another tenant")) {
          deleteBlocked = true;
        }
      }

      assert(
        updateBlocked && deleteBlocked,
        "Test 4: Tenant Beta blocked from modifying or deleting Tenant Alpha fixed holiday"
      );
    });

    // --------------------------------------------------------------------------
    // Test 5: Payroll Period Lock Cross-Tenant Protection
    // --------------------------------------------------------------------------
    await runWithTenant(tenantAlpha.id, async () => {
      const period = await storage.createPayrollPeriod({
        month: 11,
        year: 2026,
        status: "locked",
        isLocked: true,
        lockedBy: userAId
      });
      payrollPeriodAId = period.id;
    });

    await runWithTenant(tenantBeta.id, async () => {
      let periodUpdateBlocked = false;
      try {
        await storage.updatePayrollPeriod(payrollPeriodAId!, { status: "open" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Payroll period belongs to another tenant")) {
          periodUpdateBlocked = true;
        }
      }

      assert(
        periodUpdateBlocked,
        "Test 5: Tenant Beta blocked from unlocking or modifying Tenant Alpha payroll period"
      );
    });

    // --------------------------------------------------------------------------
    // Test 6: Company Settings Isolation
    // --------------------------------------------------------------------------
    await runWithTenant(tenantAlpha.id, async () => {
      await storage.updateCompanySettings({
        companyName: "Alpha Solar Solutions",
        maxOTHoursPerDay: 6
      });
    });

    await runWithTenant(tenantBeta.id, async () => {
      const betaSettings = await storage.getCompanySettings();
      assert(
        betaSettings?.companyName !== "Alpha Solar Solutions" &&
        betaSettings?.maxOTHoursPerDay !== 6,
        "Test 6: Tenant Beta company settings remain completely isolated from Tenant Alpha updates"
      );
    });

    // --------------------------------------------------------------------------
    // Test 7: Authorized Same-Tenant Operations
    // --------------------------------------------------------------------------
    await runWithTenant(tenantAlpha.id, async () => {
      const holidayUpdated = await storage.updateHoliday(holidayAId!, { name: "Alpha Christmas" });
      const holidayDeleted = await storage.deleteHoliday(holidayAId!);

      assert(
        holidayUpdated && holidayDeleted === true,
        "Test 7: Tenant Alpha can successfully update and delete its own fixed holiday"
      );
    });

  } finally {
    // Teardown
    console.log("\nStarting test teardown...");
    try {
      cacheService.invalidateUser(userAId);

      await pgDb.delete(pgOtSessions).where(
        or(
          eq(pgOtSessions.tenantId, tenantAlpha.id),
          eq(pgOtSessions.tenantId, tenantBeta.id)
        )
      );

      await pgDb.delete(pgAttendance).where(
        or(
          eq(pgAttendance.tenantId, tenantAlpha.id),
          eq(pgAttendance.tenantId, tenantBeta.id)
        )
      );

      await pgDb.delete(pgFixedHolidays).where(
        or(
          eq(pgFixedHolidays.tenantId, tenantAlpha.id),
          eq(pgFixedHolidays.tenantId, tenantBeta.id)
        )
      );

      await pgDb.delete(pgPayrollPeriods).where(
        or(
          eq(pgPayrollPeriods.tenantId, tenantAlpha.id),
          eq(pgPayrollPeriods.tenantId, tenantBeta.id)
        )
      );

      await pgDb.delete(pgCompanySettings).where(
        or(
          eq(pgCompanySettings.tenantId, tenantAlpha.id),
          eq(pgCompanySettings.tenantId, tenantBeta.id)
        )
      );

      await pgDb.delete(pgUsers).where(
        or(
          eq(pgUsers.tenantId, tenantAlpha.id),
          eq(pgUsers.tenantId, tenantBeta.id)
        )
      );

      await pgDb.delete(pgTenants).where(
        or(
          eq(pgTenants.id, tenantAlpha.id),
          eq(pgTenants.id, tenantBeta.id)
        )
      );

      console.log("Teardown completed successfully.");
    } catch (cleanupErr) {
      console.error("Teardown error:", cleanupErr);
    }
  }

  console.log("\n================================================================================");
  console.log(`PHASE 18 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPhase18Tests().catch((err) => {
  console.error("Unhandled rejection in Phase 18 test runner:", err);
  process.exit(1);
});

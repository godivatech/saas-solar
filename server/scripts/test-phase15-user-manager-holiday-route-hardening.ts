import "dotenv/config";
import { storage } from "../storage";
import { runWithTenant } from "../tenant-context";
import { HolidayService } from "../services/holiday-service";
import { PayrollLockService } from "../services/payroll-lock-service";
import { db as pgDb } from "../db";
import {
  tenants as pgTenants,
  users as pgUsers,
  fixedHolidays as pgFixedHolidays,
  payrollPeriods as pgPayrollPeriods,
  activityLogs as pgActivityLogs
} from "@shared/schema.postgres";
import { eq, or } from "drizzle-orm";
import crypto from "crypto";

async function runPhase15Tests() {
  console.log("================================================================================");
  console.log("PHASE 15: USER MANAGER REFERENCE, HOLIDAY SERVICE & ROUTE HARDENING AUDIT");
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
    name: "Phase 15 Tenant Alpha",
    slug: `phase15-alpha-${Date.now()}`
  };
  const tenantBeta = {
    id: crypto.randomUUID(),
    name: "Phase 15 Tenant Beta",
    slug: `phase15-beta-${Date.now()}`
  };

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  let createdUserA2Id: string | null = null;
  let createdHolidayId: string | null = null;

  try {
    // 1. Setup test tenants
    await pgDb.insert(pgTenants).values([tenantAlpha, tenantBeta]);

    // 2. Setup test users in distinct tenants
    await pgDb.insert(pgUsers).values([
      {
        id: userAId,
        firebaseUid: userAId,
        tenantId: tenantAlpha.id,
        email: `mgr15a-${Date.now()}@alpha.com`,
        displayName: "Manager Alpha 15",
        role: "admin",
        department: "technical"
      },
      {
        id: userBId,
        firebaseUid: userBId,
        tenantId: tenantBeta.id,
        email: `mgr15b-${Date.now()}@beta.com`,
        displayName: "Manager Beta 15",
        role: "admin",
        department: "technical"
      }
    ]);

    // ---------------------------------------------------------------------------
    // TEST 1: storage.createUser blocks foreign reportingManagerId
    // ---------------------------------------------------------------------------
    let test1Blocked = false;
    await runWithTenant(tenantAlpha.id, async () => {
      try {
        await storage.createUser({
          email: `emp-fail-${Date.now()}@alpha.com`,
          displayName: "Employee Cross Manager",
          role: "employee",
          department: "technical",
          reportingManagerId: userBId // Foreign manager!
        });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Reporting manager belongs to another tenant")) {
          test1Blocked = true;
        }
      }
    });

    assert(
      test1Blocked,
      "Test 1: storage.createUser blocks assigning foreign reportingManagerId"
    );

    // ---------------------------------------------------------------------------
    // TEST 2: storage.createUser permits valid reportingManagerId in same tenant
    // ---------------------------------------------------------------------------
    let test2Success = false;
    await runWithTenant(tenantAlpha.id, async () => {
      try {
        const emp = await storage.createUser({
          email: `emp-ok-${Date.now()}@alpha.com`,
          displayName: "Employee Valid Manager",
          role: "employee",
          department: "technical",
          reportingManagerId: userAId // Same tenant manager
        });
        if (emp && emp.id) {
          createdUserA2Id = emp.id;
          test2Success = true;
        }
      } catch (err) {
        console.error("Test 2 error:", err);
      }
    });

    assert(
      test2Success,
      "Test 2: storage.createUser permits assigning same-tenant reportingManagerId"
    );

    // ---------------------------------------------------------------------------
    // TEST 3: storage.updateUser blocks mutating reportingManagerId to foreign tenant
    // ---------------------------------------------------------------------------
    let test3Blocked = false;
    if (createdUserA2Id) {
      await runWithTenant(tenantAlpha.id, async () => {
        try {
          await storage.updateUser(createdUserA2Id!, {
            reportingManagerId: userBId // Mutate to foreign manager
          });
        } catch (err: any) {
          if (err.message.includes("Unauthorized: Reporting manager belongs to another tenant")) {
            test3Blocked = true;
          }
        }
      });
    }

    assert(
      test3Blocked,
      "Test 3: storage.updateUser blocks mutating reportingManagerId to foreign tenant"
    );

    // ---------------------------------------------------------------------------
    // TEST 4: storage.updateUser blocks foreign tenant from mutating user
    // ---------------------------------------------------------------------------
    let test4Blocked = false;
    if (createdUserA2Id) {
      await runWithTenant(tenantBeta.id, async () => {
        try {
          await storage.updateUser(createdUserA2Id!, {
            displayName: "Hacked Display Name"
          });
        } catch (err: any) {
          if (err.message.includes("Unauthorized: Target user belongs to another tenant")) {
            test4Blocked = true;
          }
        }
      });
    }

    assert(
      test4Blocked,
      "Test 4: storage.updateUser blocks foreign tenant from modifying users across tenant boundaries"
    );

    // ---------------------------------------------------------------------------
    // TEST 5: HolidayService creates holiday with tenant boundary
    // ---------------------------------------------------------------------------
    let test5Success = false;
    const testHolidayDate = new Date("2026-11-20T00:00:00.000Z");

    await runWithTenant(tenantAlpha.id, async () => {
      const res = await HolidayService.createHoliday({
        name: "Solar Energy Day 15",
        date: testHolidayDate,
        type: "national",
        isPaid: true,
        isOptional: false,
        allowOT: true,
        applicableDepartments: ["technical"],
        isActive: true
      }, userAId);

      if (res.success && res.id) {
        createdHolidayId = res.id;
        test5Success = true;
      }
    });

    assert(
      test5Success,
      "Test 5: HolidayService.createHoliday creates holiday scoped to current tenant"
    );

    // ---------------------------------------------------------------------------
    // TEST 6: HolidayService blocks foreign tenant update & delete
    // ---------------------------------------------------------------------------
    let test6UpdateDenied = false;
    let test6DeleteDenied = false;

    if (createdHolidayId) {
      await runWithTenant(tenantBeta.id, async () => {
        const updateRes = await HolidayService.updateHoliday(
          createdHolidayId!,
          { name: "Hacked Holiday Name" },
          userBId
        );
        test6UpdateDenied = !updateRes.success && (updateRes.message.includes("Unauthorized") || updateRes.message.includes("denied") || updateRes.message.includes("not found"));

        const deleteRes = await HolidayService.deleteHoliday(
          createdHolidayId!,
          userBId
        );
        test6DeleteDenied = !deleteRes.success && (deleteRes.message.includes("Unauthorized") || deleteRes.message.includes("denied") || deleteRes.message.includes("not found"));
      });
    }

    assert(
      test6UpdateDenied && test6DeleteDenied,
      "Test 6: HolidayService blocks foreign tenant from updating or deleting holidays"
    );

    // ---------------------------------------------------------------------------
    // TEST 7: PayrollLockService locks and unlocks cleanly within tenant
    // ---------------------------------------------------------------------------
    let test7LockSuccess = false;
    let test7IsLocked = false;
    let test7UnlockSuccess = false;

    await runWithTenant(tenantAlpha.id, async () => {
      const lockRes = await PayrollLockService.lockPeriod(11, 2026, userAId, "master_admin");
      test7LockSuccess = lockRes.success;

      test7IsLocked = await PayrollLockService.isPeriodLocked(new Date("2026-11-15T10:00:00.000Z"));

      const unlockRes = await PayrollLockService.unlockPeriod(11, 2026, userAId, "master_admin", "Testing audit unlock functionality");
      test7UnlockSuccess = unlockRes.success;
    });

    assert(
      test7LockSuccess && test7IsLocked && test7UnlockSuccess,
      "Test 7: PayrollLockService correctly locks, detects locked status, and unlocks for authorized master admin"
    );

    // ---------------------------------------------------------------------------
    // TEST 8: PayrollLockService blocks non-master-admin from locking/unlocking
    // ---------------------------------------------------------------------------
    let test8LockDenied = false;
    let test8UnlockDenied = false;

    await runWithTenant(tenantAlpha.id, async () => {
      const lockRes = await PayrollLockService.lockPeriod(11, 2026, userAId, "employee");
      test8LockDenied = !lockRes.success && lockRes.message.includes("Only master admin");

      const unlockRes = await PayrollLockService.unlockPeriod(11, 2026, userAId, "employee", "Attempt by employee");
      test8UnlockDenied = !unlockRes.success && unlockRes.message.includes("Only master admin");
    });

    assert(
      test8LockDenied && test8UnlockDenied,
      "Test 8: PayrollLockService strictly enforces master_admin role requirement for lock/unlock operations"
    );

  } finally {
    // Cleanup test data
    try {
      await pgDb.delete(pgActivityLogs).where(or(eq(pgActivityLogs.tenantId, tenantAlpha.id), eq(pgActivityLogs.tenantId, tenantBeta.id)));
      await pgDb.delete(pgPayrollPeriods).where(or(eq(pgPayrollPeriods.tenantId, tenantAlpha.id), eq(pgPayrollPeriods.tenantId, tenantBeta.id)));
      await pgDb.delete(pgFixedHolidays).where(or(eq(pgFixedHolidays.tenantId, tenantAlpha.id), eq(pgFixedHolidays.tenantId, tenantBeta.id)));
      if (createdUserA2Id) {
        await pgDb.delete(pgUsers).where(eq(pgUsers.id, createdUserA2Id));
      }
      await pgDb.delete(pgUsers).where(or(eq(pgUsers.id, userAId), eq(pgUsers.id, userBId)));
      await pgDb.delete(pgTenants).where(or(eq(pgTenants.id, tenantAlpha.id), eq(pgTenants.id, tenantBeta.id)));
    } catch (e) {
      console.warn("Cleanup warning:", e);
    }
  }

  console.log("\n================================================================================");
  console.log(`PHASE 15 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPhase15Tests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});

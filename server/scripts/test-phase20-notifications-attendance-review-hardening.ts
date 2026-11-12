import "dotenv/config";
import { storage } from "../storage";
import { runWithTenant } from "../tenant-context";
import { db as pgDb } from "../db";
import {
  tenants as pgTenants,
  users as pgUsers,
  attendance as pgAttendance,
  notifications as pgNotifications
} from "@shared/schema.postgres";
import { eq, or } from "drizzle-orm";
import crypto from "crypto";

async function runPhase20Tests() {
  console.log("================================================================================");
  console.log("PHASE 20: NOTIFICATIONS, INCOMPLETE ATTENDANCE & REVIEW STATUS HARDENING TEST");
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
    name: "Phase 20 Tenant Alpha",
    slug: `phase20-alpha-${Date.now()}`
  };
  const tenantBeta = {
    id: crypto.randomUUID(),
    name: "Phase 20 Tenant Beta",
    slug: `phase20-beta-${Date.now()}`
  };

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();

  let notifAId: string | null = null;
  let notifBId: string | null = null;
  let attendanceAId: string | null = null;
  let attendanceBId: string | null = null;

  try {
    // 1. Setup test tenants
    await pgDb.insert(pgTenants).values([tenantAlpha, tenantBeta]);

    // 2. Setup test users
    await pgDb.insert(pgUsers).values([
      {
        id: userAId,
        firebaseUid: userAId,
        tenantId: tenantAlpha.id,
        email: `emp_a20_${Date.now()}@alpha.com`,
        displayName: "Employee Alpha 20",
        role: "employee",
        department: "operations"
      },
      {
        id: userBId,
        firebaseUid: userBId,
        tenantId: tenantBeta.id,
        email: `emp_b20_${Date.now()}@beta.com`,
        displayName: "Employee Beta 20",
        role: "employee",
        department: "operations"
      }
    ]);

    // --------------------------------------------------------------------------
    // Test 1: Notification Creation, Cross-Tenant Read & Modification Blocking
    // --------------------------------------------------------------------------
    await runWithTenant(tenantAlpha.id, async () => {
      const created = await storage.createNotification({
        userId: userAId,
        title: "Alpha Shift Alert",
        message: "Your shift begins at 9 AM",
        type: "info",
        isRead: false
      });
      notifAId = created.id;
    });

    await runWithTenant(tenantBeta.id, async () => {
      const created = await storage.createNotification({
        userId: userBId,
        title: "Beta Maintenance Notice",
        message: "System maintenance tonight",
        type: "warning",
        isRead: false
      });
      notifBId = created.id;
    });

    assert(!!notifAId && !!notifBId, "Test 1.1: Successfully created notifications in Alpha and Beta");

    // Beta queries Alpha's notification by ID
    await runWithTenant(tenantBeta.id, async () => {
      const readById = await storage.getNotification(notifAId!);
      assert(
        readById === undefined,
        "Test 1.2: Tenant Beta cannot read Tenant Alpha's notification by ID (returns undefined)"
      );

      const userANotifs = await storage.getNotifications(userAId);
      assert(
        userANotifs.length === 0,
        "Test 1.3: Tenant Beta cannot query notifications for Tenant Alpha user (returns empty array)"
      );

      let blocked = false;
      try {
        await storage.updateNotification(notifAId!, { isRead: true });
      } catch (err: any) {
        if (err.message?.includes("Unauthorized") || err.message?.includes("another tenant")) {
          blocked = true;
        }
      }
      assert(
        blocked,
        "Test 1.4: Tenant Beta cannot update Tenant Alpha's notification (blocked with Unauthorized error)"
      );
    });

    // --------------------------------------------------------------------------
    // Test 2: Expired Notification Deletion Boundary Scoping
    // --------------------------------------------------------------------------
    // Set expiry in past for both
    const pastDate = new Date(Date.now() - 3600000); // 1 hour ago
    await pgDb.update(pgNotifications)
      .set({ createdAt: pastDate })
      .where(or(eq(pgNotifications.id, notifAId!), eq(pgNotifications.id, notifBId!)));

    // Tenant Alpha runs cleanup
    await runWithTenant(tenantAlpha.id, async () => {
      await storage.deleteExpiredNotifications(new Date());
    });

    // Verify Tenant Alpha's notification was deleted, but Tenant Beta's remains intact
    const [alphaRemaining] = await pgDb.select().from(pgNotifications).where(eq(pgNotifications.id, notifAId!));
    const [betaRemaining] = await pgDb.select().from(pgNotifications).where(eq(pgNotifications.id, notifBId!));

    assert(
      !alphaRemaining,
      "Test 2.1: Tenant Alpha's expired notification was cleanly pruned"
    );
    assert(
      !!betaRemaining,
      "Test 2.2: Tenant Beta's expired notification was PRESERVED during Alpha's cleanup (zero bleed)"
    );

    // --------------------------------------------------------------------------
    // Test 3: Incomplete Attendance Tenant Isolation
    // --------------------------------------------------------------------------
    const today = new Date();
    today.setHours(9, 0, 0, 0);

    await runWithTenant(tenantAlpha.id, async () => {
      const att = await storage.createAttendance({
        userId: userAId,
        date: today,
        checkInTime: today,
        source: "mobile"
      });
      attendanceAId = att.id;
    });

    await runWithTenant(tenantBeta.id, async () => {
      const att = await storage.createAttendance({
        userId: userBId,
        date: today,
        checkInTime: today,
        source: "mobile"
      });
      attendanceBId = att.id;
    });

    await runWithTenant(tenantAlpha.id, async () => {
      const incompleteList = await storage.listIncompleteAttendance(today);
      const hasAlpha = incompleteList.some(r => r.userId === userAId);
      const hasBeta = incompleteList.some(r => r.userId === userBId);

      assert(
        hasAlpha && !hasBeta,
        "Test 3.1: Tenant Alpha listIncompleteAttendance sees User Alpha, zero User Beta records"
      );
    });

    await runWithTenant(tenantBeta.id, async () => {
      const incompleteList = await storage.listIncompleteAttendance(today);
      const hasAlpha = incompleteList.some(r => r.userId === userAId);
      const hasBeta = incompleteList.some(r => r.userId === userBId);

      assert(
        hasBeta && !hasAlpha,
        "Test 3.2: Tenant Beta listIncompleteAttendance sees User Beta, zero User Alpha records"
      );
    });

    // --------------------------------------------------------------------------
    // Test 4: Attendance Review Status Isolation
    // --------------------------------------------------------------------------
    // Mark Alpha attendance as pending review
    await pgDb.update(pgAttendance)
      .set({ adminReviewStatus: "pending" })
      .where(eq(pgAttendance.id, attendanceAId!));

    await runWithTenant(tenantBeta.id, async () => {
      const reviewPending = await storage.listAttendanceByReviewStatus("pending");
      const leaked = reviewPending.some(r => r.id === attendanceAId || r.userId === userAId);
      assert(
        !leaked,
        "Test 4.1: Tenant Beta listAttendanceByReviewStatus does not leak Tenant Alpha review records"
      );
    });

    // --------------------------------------------------------------------------
    // Test 5: FirestoreStorage activeTenantId Dynamic Getter Parity
    // --------------------------------------------------------------------------
    const fallbackStorage = (storage as any).fallback;
    if (fallbackStorage) {
      await runWithTenant(tenantBeta.id, async () => {
        const activeTenantIdProp = fallbackStorage.activeTenantId;
        assert(
          activeTenantIdProp === tenantBeta.id,
          "Test 5.1: FirestoreStorage.activeTenantId dynamically returns current active tenant context"
        );
      });
    }

    // --------------------------------------------------------------------------
    // Test 6: Authorized Same-Tenant Operations
    // --------------------------------------------------------------------------
    await runWithTenant(tenantBeta.id, async () => {
      const updated = await storage.updateNotification(notifBId!, { isRead: true });
      assert(
        updated.isRead === true,
        "Test 6.1: Authorized Tenant Beta update to notification succeeds"
      );
    });

  } finally {
    // --------------------------------------------------------------------------
    // Teardown Test Data
    // --------------------------------------------------------------------------
    console.log("\nTearing down Phase 20 test data...");
    try {
      await pgDb.delete(pgNotifications).where(
        or(
          eq(pgNotifications.tenantId, tenantAlpha.id),
          eq(pgNotifications.tenantId, tenantBeta.id)
        )
      );

      await pgDb.delete(pgAttendance).where(
        or(
          eq(pgAttendance.tenantId, tenantAlpha.id),
          eq(pgAttendance.tenantId, tenantBeta.id)
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
  console.log(`PHASE 20 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPhase20Tests().catch((err) => {
  console.error("Unhandled rejection in Phase 20 test runner:", err);
  process.exit(1);
});


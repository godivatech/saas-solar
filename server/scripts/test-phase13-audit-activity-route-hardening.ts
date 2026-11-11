import "dotenv/config";
import { storage } from "../storage";
import { runWithTenant } from "../tenant-context";
import { AutoCheckoutService } from "../services/auto-checkout-service";
import { db as pgDb } from "../db";
import {
  tenants as pgTenants,
  users as pgUsers,
  auditLogs as pgAuditLogs,
  activityLogs as pgActivityLogs
} from "@shared/schema.postgres";
import { eq, or } from "drizzle-orm";
import crypto from "crypto";

async function runPhase13Tests() {
  console.log("================================================================================");
  console.log("PHASE 13: AUDIT & ACTIVITY LOG CROSS-TENANT ISOLATION AND STARTUP VERIFICATION");
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
    name: "Phase 13 Tenant Alpha",
    slug: `phase13-alpha-${Date.now()}`
  };
  const tenantBeta = {
    id: crypto.randomUUID(),
    name: "Phase 13 Tenant Beta",
    slug: `phase13-beta-${Date.now()}`
  };

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();

  let createdAuditAId: string | null = null;
  let createdActivityAId: string | null = null;

  try {
    // 1. Setup test tenants
    await pgDb.insert(pgTenants).values([tenantAlpha, tenantBeta]);

    // 2. Setup test users in distinct tenants
    await pgDb.insert(pgUsers).values([
      {
        id: userAId,
        firebaseUid: userAId,
        tenantId: tenantAlpha.id,
        email: `user13a-${Date.now()}@alpha.com`,
        displayName: "User Alpha 13",
        role: "admin",
        department: "technical"
      },
      {
        id: userBId,
        firebaseUid: userBId,
        tenantId: tenantBeta.id,
        email: `user13b-${Date.now()}@beta.com`,
        displayName: "User Beta 13",
        role: "admin",
        department: "technical"
      }
    ]);

    // ---------------------------------------------------------------------------
    // TEST 1: storage.createActivityLog blocks foreign userId
    // ---------------------------------------------------------------------------
    let test1Blocked = false;
    await runWithTenant(tenantAlpha.id, async () => {
      try {
        await storage.createActivityLog({
          type: "user_login",
          title: "Test Activity",
          description: "Cross-tenant activity attempt",
          userId: userBId // Foreign user!
        });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: User belongs to another tenant")) {
          test1Blocked = true;
        }
      }
    });
    assert(test1Blocked, "Test 1: storage.createActivityLog blocks foreign userId injection");

    // ---------------------------------------------------------------------------
    // TEST 2: storage.createActivityLog permits valid user in same tenant & system
    // ---------------------------------------------------------------------------
    let test2Success = false;
    await runWithTenant(tenantAlpha.id, async () => {
      try {
        const log1 = await storage.createActivityLog({
          type: "user_login",
          title: "Valid Activity Alpha",
          description: "Same tenant activity",
          userId: userAId
        });
        const log2 = await storage.createActivityLog({
          type: "system_alert",
          title: "System Alert",
          description: "System level activity",
          userId: "system"
        });
        if (log1 && log2) {
          createdActivityAId = log1.id;
          test2Success = true;
        }
      } catch (err) {
        console.error("Test 2 error:", err);
      }
    });
    assert(test2Success, "Test 2: storage.createActivityLog allows own-tenant user and system user");

    // ---------------------------------------------------------------------------
    // TEST 3: storage.createAuditLog blocks foreign userId
    // ---------------------------------------------------------------------------
    let test3Blocked = false;
    await runWithTenant(tenantAlpha.id, async () => {
      try {
        await storage.createAuditLog({
          userId: userBId, // Foreign user!
          action: "unauthorized_action",
          entityType: "system_config",
          entityId: "cfg-123"
        });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: User belongs to another tenant")) {
          test3Blocked = true;
        }
      }
    });
    assert(test3Blocked, "Test 3: storage.createAuditLog blocks foreign userId injection");

    // ---------------------------------------------------------------------------
    // TEST 4: storage.createAuditLog permits valid user in same tenant & system
    // ---------------------------------------------------------------------------
    let test4Success = false;
    await runWithTenant(tenantAlpha.id, async () => {
      try {
        const log1 = await storage.createAuditLog({
          userId: userAId,
          action: "config_updated",
          entityType: "system_config",
          entityId: "cfg-alpha"
        });
        const log2 = await storage.createAuditLog({
          userId: "system",
          action: "cron_executed",
          entityType: "cron_job",
          entityId: "job-alpha"
        });
        if (log1 && log2) {
          createdAuditAId = log1.id;
          test4Success = true;
        }
      } catch (err) {
        console.error("Test 4 error:", err);
      }
    });
    assert(test4Success, "Test 4: storage.createAuditLog allows own-tenant user and system user");

    // ---------------------------------------------------------------------------
    // TEST 5: storage.getAuditLogs prevents cross-tenant lookup with foreign userId
    // ---------------------------------------------------------------------------
    let test5Secure = false;
    await runWithTenant(tenantAlpha.id, async () => {
      // Querying Tenant Alpha with User B's ID should return empty array
      const foreignLogs = await storage.getAuditLogs({ userId: userBId });
      test5Secure = Array.isArray(foreignLogs) && foreignLogs.length === 0;
    });
    assert(test5Secure, "Test 5: storage.getAuditLogs returns empty array when queried with foreign userId");

    // ---------------------------------------------------------------------------
    // TEST 6: storage.getAuditLogs strictly isolates logs by tenantId
    // ---------------------------------------------------------------------------
    let test6AlphaHasLogs = false;
    let test6BetaHasZeroAlphaLogs = false;

    await runWithTenant(tenantAlpha.id, async () => {
      const alphaLogs = await storage.getAuditLogs();
      test6AlphaHasLogs = alphaLogs.some((l: any) => l.id === createdAuditAId);
    });

    await runWithTenant(tenantBeta.id, async () => {
      const betaLogs = await storage.getAuditLogs();
      test6BetaHasZeroAlphaLogs = !betaLogs.some((l: any) => l.id === createdAuditAId);
    });

    assert(
      test6AlphaHasLogs && test6BetaHasZeroAlphaLogs,
      "Test 6: storage.getAuditLogs prevents Tenant Beta from reading Tenant Alpha's audit logs"
    );

    // ---------------------------------------------------------------------------
    // TEST 7: storage.listActivityLogs strictly isolates logs by tenantId
    // ---------------------------------------------------------------------------
    let test7AlphaHasActivity = false;
    let test7BetaHasZeroAlphaActivity = false;

    await runWithTenant(tenantAlpha.id, async () => {
      const alphaActivities = await storage.listActivityLogs(50);
      test7AlphaHasActivity = alphaActivities.some((a: any) => a.id === createdActivityAId);
    });

    await runWithTenant(tenantBeta.id, async () => {
      const betaActivities = await storage.listActivityLogs(50);
      test7BetaHasZeroAlphaActivity = !betaActivities.some((a: any) => a.id === createdActivityAId);
    });

    assert(
      test7AlphaHasActivity && test7BetaHasZeroAlphaActivity,
      "Test 7: storage.listActivityLogs prevents Tenant Beta from reading Tenant Alpha's activity logs"
    );

    // ---------------------------------------------------------------------------
    // TEST 8: AutoCheckoutService.processAutoCheckouts executes cleanly on startup
    // ---------------------------------------------------------------------------
    let test8Success = false;
    try {
      await AutoCheckoutService.processAutoCheckouts();
      test8Success = true;
    } catch (err) {
      console.error("Test 8 error:", err);
    }
    assert(
      test8Success,
      "Test 8: AutoCheckoutService.processAutoCheckouts executes without error across multi-tenant environments"
    );

  } finally {
    // Cleanup test data
    try {
      if (createdAuditAId) {
        await pgDb.delete(pgAuditLogs).where(eq(pgAuditLogs.tenantId, tenantAlpha.id));
      }
      if (createdActivityAId) {
        await pgDb.delete(pgActivityLogs).where(eq(pgActivityLogs.tenantId, tenantAlpha.id));
      }
      await pgDb.delete(pgUsers).where(or(eq(pgUsers.id, userAId), eq(pgUsers.id, userBId)));
      await pgDb.delete(pgTenants).where(or(eq(pgTenants.id, tenantAlpha.id), eq(pgTenants.id, tenantBeta.id)));
    } catch (e) {
      console.warn("Cleanup warning:", e);
    }
  }

  console.log("\n================================================================================");
  console.log(`PHASE 13 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPhase13Tests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});

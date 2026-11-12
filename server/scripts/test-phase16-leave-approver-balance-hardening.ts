import "dotenv/config";
import { storage } from "../storage";
import { runWithTenant } from "../tenant-context";
import { db as pgDb } from "../db";
import {
  tenants as pgTenants,
  users as pgUsers,
  leaveApplications as pgLeaveApplications,
  leaveBalances as pgLeaveBalances,
  activityLogs as pgActivityLogs
} from "@shared/schema.postgres";
import { eq, or } from "drizzle-orm";
import crypto from "crypto";

async function runPhase16Tests() {
  console.log("================================================================================");
  console.log("PHASE 16: LEAVE WORKFLOW, APPROVER SECURITY & BALANCE MULTI-TENANT AUDIT");
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
    name: "Phase 16 Tenant Alpha",
    slug: `phase16-alpha-${Date.now()}`
  };
  const tenantBeta = {
    id: crypto.randomUUID(),
    name: "Phase 16 Tenant Beta",
    slug: `phase16-beta-${Date.now()}`
  };

  const empAId = crypto.randomUUID();
  const mgrAId = crypto.randomUUID();
  const hrAId = crypto.randomUUID();
  const empBId = crypto.randomUUID();
  const mgrBId = crypto.randomUUID();

  let leaveAId: string | null = null;
  let balanceAId: string | null = null;

  try {
    // 1. Setup test tenants
    await pgDb.insert(pgTenants).values([tenantAlpha, tenantBeta]);

    // 2. Setup test users
    await pgDb.insert(pgUsers).values([
      {
        id: empAId,
        firebaseUid: empAId,
        tenantId: tenantAlpha.id,
        email: `empa16-${Date.now()}@alpha.com`,
        displayName: "Employee Alpha 16",
        role: "employee",
        department: "technical"
      },
      {
        id: mgrAId,
        firebaseUid: mgrAId,
        tenantId: tenantAlpha.id,
        email: `mgra16-${Date.now()}@alpha.com`,
        displayName: "Manager Alpha 16",
        role: "admin",
        department: "technical"
      },
      {
        id: hrAId,
        firebaseUid: hrAId,
        tenantId: tenantAlpha.id,
        email: `hra16-${Date.now()}@alpha.com`,
        displayName: "HR Alpha 16",
        role: "admin",
        department: "hr"
      },
      {
        id: empBId,
        firebaseUid: empBId,
        tenantId: tenantBeta.id,
        email: `empb16-${Date.now()}@beta.com`,
        displayName: "Employee Beta 16",
        role: "employee",
        department: "technical"
      },
      {
        id: mgrBId,
        firebaseUid: mgrBId,
        tenantId: tenantBeta.id,
        email: `mgrb16-${Date.now()}@beta.com`,
        displayName: "Manager Beta 16",
        role: "admin",
        department: "technical"
      }
    ]);

    // --------------------------------------------------------------------------
    // Test 1: Create Leave Application under Tenant Alpha
    // --------------------------------------------------------------------------
    await runWithTenant(tenantAlpha.id, async () => {
      const leave = await storage.createLeaveApplication({
        userId: empAId,
        leaveType: "casual_leave",
        startDate: new Date("2026-11-20T00:00:00.000Z"),
        endDate: new Date("2026-11-20T23:59:59.000Z"),
        totalDays: 1,
        reason: "Personal family event",
        status: "pending_manager"
      } as any);

      leaveAId = leave.id;
      assert(
        leave && leave.id && (leave as any).userId === empAId,
        "Test 1: Leave application successfully created under Tenant Alpha"
      );
    });

    // --------------------------------------------------------------------------
    // Test 2: Foreign Tenant Isolation on Reads
    // --------------------------------------------------------------------------
    await runWithTenant(tenantBeta.id, async () => {
      const getResult = await storage.getLeaveApplication(leaveAId!);
      const listResult = await storage.listLeaveApplicationsByUser(empAId);

      assert(
        getResult === undefined && listResult.length === 0,
        "Test 2: Tenant Beta cannot read Tenant Alpha leave application (isolated to undefined & empty list)"
      );
    });

    // --------------------------------------------------------------------------
    // Test 3: Foreign Approver Blocking (Tenant Beta attempting to approve Tenant Alpha leave)
    // --------------------------------------------------------------------------
    await runWithTenant(tenantBeta.id, async () => {
      let blocked = false;
      try {
        await storage.approveLeaveByManager(leaveAId!, mgrBId, "Cross-tenant approval attempt");
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Leave application belongs to another tenant")) {
          blocked = true;
        }
      }
      assert(
        blocked,
        "Test 3: Cross-tenant approval blocked with 'Unauthorized: Leave application belongs to another tenant'"
      );
    });

    // --------------------------------------------------------------------------
    // Test 4: Injected Foreign Manager in Tenant Alpha
    // --------------------------------------------------------------------------
    await runWithTenant(tenantAlpha.id, async () => {
      let blocked = false;
      try {
        await storage.approveLeaveByManager(leaveAId!, mgrBId, "Injected foreign manager");
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Approver belongs to another tenant")) {
          blocked = true;
        }
      }
      assert(
        blocked,
        "Test 4: Injected foreign manager blocked with 'Unauthorized: Approver belongs to another tenant'"
      );
    });

    // --------------------------------------------------------------------------
    // Test 5: Injected Foreign HR Approver in Tenant Alpha
    // --------------------------------------------------------------------------
    await runWithTenant(tenantAlpha.id, async () => {
      let blocked = false;
      try {
        await storage.approveLeaveByHR(leaveAId!, mgrBId, "Injected foreign HR");
      } catch (err: any) {
        if (err.message.includes("Unauthorized: HR approver belongs to another tenant")) {
          blocked = true;
        }
      }
      assert(
        blocked,
        "Test 5: Injected foreign HR blocked with 'Unauthorized: HR approver belongs to another tenant'"
      );
    });

    // --------------------------------------------------------------------------
    // Test 6: Injected Foreign User on Reject and Cancel
    // --------------------------------------------------------------------------
    await runWithTenant(tenantAlpha.id, async () => {
      let rejectBlocked = false;
      let cancelBlocked = false;

      try {
        await storage.rejectLeave(leaveAId!, mgrBId, "Foreign reject", "manager");
      } catch (err: any) {
        if (err.message.includes("Unauthorized: User belongs to another tenant")) {
          rejectBlocked = true;
        }
      }

      try {
        await storage.cancelLeaveApplication(leaveAId!, mgrBId);
      } catch (err: any) {
        if (err.message.includes("Unauthorized: User belongs to another tenant")) {
          cancelBlocked = true;
        }
      }

      assert(
        rejectBlocked && cancelBlocked,
        "Test 6: Injected foreign user blocked on reject & cancel with 'Unauthorized: User belongs to another tenant'"
      );
    });

    // --------------------------------------------------------------------------
    // Test 7: Leave Balance Multi-Tenant Scoping & Modification Block
    // --------------------------------------------------------------------------
    await runWithTenant(tenantAlpha.id, async () => {
      const balance = await storage.createLeaveBalance({
        userId: empAId,
        employeeId: "EMP-A-16",
        year: 2026,
        month: 11,
        casualLeaveBalance: 2,
        casualLeaveUsed: 0,
        permissionHoursBalance: 2,
        permissionHoursUsed: 0,
        casualLeaveHistory: [],
        permissionHistory: [],
        lastResetDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      } as any);
      balanceAId = balance.id;
    });

    await runWithTenant(tenantBeta.id, async () => {
      const getBal = await storage.getLeaveBalance(empAId, 11, 2026);
      let updateBlocked = false;

      try {
        await storage.updateLeaveBalance(balanceAId!, { casualLeaveUsed: 1 });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Leave balance belongs to another tenant")) {
          updateBlocked = true;
        }
      }

      assert(
        getBal === undefined && updateBlocked,
        "Test 7: Foreign tenant cannot read or update Tenant Alpha leave balance (isolated to undefined & 403 throw)"
      );
    });

    // --------------------------------------------------------------------------
    // Test 8: Valid Approval Workflow & Balance Deduction within Tenant Alpha
    // --------------------------------------------------------------------------
    await runWithTenant(tenantAlpha.id, async () => {
      // 1. Manager approves
      const mgrApproved = await storage.approveLeaveByManager(leaveAId!, mgrAId, "Approved by manager");
      const isMgrApproved = mgrApproved.status === "pending_hr";

      // 2. HR approves
      const hrApproved = await storage.approveLeaveByHR(leaveAId!, hrAId, "Final approval by HR");
      const isHrApproved = hrApproved.status === "approved";

      // 3. Verify balance deducted
      const updatedBalance = await storage.getLeaveBalance(empAId, 11, 2026);
      const isBalanceDeducted = Number(updatedBalance?.casualLeaveUsed) === 1;

      assert(
        isMgrApproved && isHrApproved && isBalanceDeducted,
        "Test 8: Valid multi-step leave approval (manager -> HR) and atomic balance deduction succeed in Tenant Alpha"
      );
    });

  } catch (error) {
    console.error("FATAL ERROR in Phase 16 test suite:", error);
    failed++;
  } finally {
    // Teardown
    console.log("\nTearing down Phase 16 test fixtures...");
    try {
      // Clean up activity logs
      await pgDb.delete(pgActivityLogs).where(
        or(
          eq(pgActivityLogs.tenantId, tenantAlpha.id),
          eq(pgActivityLogs.tenantId, tenantBeta.id)
        )
      );

      // Clean up leave applications
      await pgDb.delete(pgLeaveApplications).where(
        or(
          eq(pgLeaveApplications.tenantId, tenantAlpha.id),
          eq(pgLeaveApplications.tenantId, tenantBeta.id)
        )
      );

      // Clean up leave balances
      await pgDb.delete(pgLeaveBalances).where(
        or(
          eq(pgLeaveBalances.tenantId, tenantAlpha.id),
          eq(pgLeaveBalances.tenantId, tenantBeta.id)
        )
      );

      // Clean up users
      await pgDb.delete(pgUsers).where(
        or(
          eq(pgUsers.tenantId, tenantAlpha.id),
          eq(pgUsers.tenantId, tenantBeta.id)
        )
      );

      // Clean up tenants
      await pgDb.delete(pgTenants).where(
        or(
          eq(pgTenants.id, tenantAlpha.id),
          eq(pgTenants.id, tenantBeta.id)
        )
      );

      console.log("Teardown completed successfully.");
    } catch (cleanupError) {
      console.error("Teardown failed:", cleanupError);
    }
  }

  console.log("\n================================================================================");
  console.log(`PHASE 16 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase16Tests().catch((err) => {
  console.error("Unhandled rejection in Phase 16 test runner:", err);
  process.exit(1);
});


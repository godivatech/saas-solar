import "dotenv/config";
import { db as pgDb } from "../db";
import { tenants, users, siteVisits, followUpVisits, departments, attendance, leaveBalances } from "@shared/schema.postgres";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";
import { runWithTenant } from "../tenant-context";
import { followUpService } from "../services/follow-up-service";
import crypto from "crypto";

async function runPhase9Tests() {
  console.log("=== STARTING PHASE 9 ENTERPRISE HARDENING TESTS ===");

  const tenantAlphaSlug = `tenant-alpha-p9-${Date.now()}`;
  const tenantBetaSlug = `tenant-beta-p9-${Date.now()}`;

  // 1. Setup isolated test tenants
  const [tenantAlpha] = await pgDb.insert(tenants).values({
    name: "Tenant Alpha P9",
    slug: tenantAlphaSlug,
    tier: "enterprise"
  }).returning();

  const [tenantBeta] = await pgDb.insert(tenants).values({
    name: "Tenant Beta P9",
    slug: tenantBetaSlug,
    tier: "enterprise"
  }).returning();

  console.log(`[SETUP] Created Tenant Alpha (${tenantAlpha.id}) and Tenant Beta (${tenantBeta.id})`);

  let passed = 0;
  let total = 0;

  // Setup User Alpha in Tenant Alpha
  const userAlphaId = crypto.randomUUID();
  const [userAlpha] = await pgDb.insert(users).values({
    id: userAlphaId,
    firebaseUid: `fb-${userAlphaId}`,
    tenantId: tenantAlpha.id,
    email: `alpha-user-${Date.now()}@test.com`,
    displayName: "Alpha User P9",
    role: "field_technician",
    department: "operations"
  }).returning();

  // Setup User Beta in Tenant Beta
  const userBetaId = crypto.randomUUID();
  const [userBeta] = await pgDb.insert(users).values({
    id: userBetaId,
    firebaseUid: `fb-${userBetaId}`,
    tenantId: tenantBeta.id,
    email: `beta-user-${Date.now()}@test.com`,
    displayName: "Beta User P9",
    role: "admin",
    department: "admin"
  }).returning();

  // -------------------------------------------------------------
  // TEST 1: Cross-Tenant Attendance Creation
  // -------------------------------------------------------------
  total++;
  try {
    console.log("\n[TEST 1] Probing Cross-Tenant Attendance Creation (Beta -> Alpha user)...");
    await runWithTenant(tenantBeta.id, async () => {
      await storage.createAttendance({
        userId: userAlpha.id,
        date: new Date(),
        attendanceType: "office",
        status: "present"
      });
    });
    console.error("FAIL: Tenant Beta was able to create attendance for Tenant Alpha user!");
  } catch (err: any) {
    if (err.message.includes("Unauthorized") || err.message.includes("belongs to another tenant")) {
      console.log("PASS: Cross-tenant attendance creation blocked:", err.message);
      passed++;
    } else {
      console.error("FAIL: Unexpected error message:", err.message);
    }
  }

  // -------------------------------------------------------------
  // TEST 2: Cross-Tenant Leave Balance Creation & Mutation
  // -------------------------------------------------------------
  total++;
  try {
    console.log("\n[TEST 2] Probing Cross-Tenant Leave Balance Creation (Beta -> Alpha user)...");
    await runWithTenant(tenantBeta.id, async () => {
      await storage.createLeaveBalance({
        userId: userAlpha.id,
        year: 2026,
        month: 11,
        casualLeaveBalance: 2
      });
    });
    console.error("FAIL: Tenant Beta was able to create leave balance for Tenant Alpha user!");
  } catch (err: any) {
    if (err.message.includes("Unauthorized") || err.message.includes("belongs to another tenant")) {
      console.log("PASS: Cross-tenant leave balance creation blocked:", err.message);
      passed++;
    } else {
      console.error("FAIL: Unexpected error message:", err.message);
    }
  }

  // -------------------------------------------------------------
  // TEST 3: Cross-Tenant Leave Application Creation
  // -------------------------------------------------------------
  total++;
  try {
    console.log("\n[TEST 3] Probing Cross-Tenant Leave Application Creation (Beta -> Alpha user)...");
    await runWithTenant(tenantBeta.id, async () => {
      await storage.createLeaveApplication({
        userId: userAlpha.id,
        leaveType: "casual_leave",
        startDate: new Date("2026-11-15"),
        endDate: new Date("2026-11-16"),
        totalDays: 2,
        reason: "Cross tenant test"
      });
    });
    console.error("FAIL: Tenant Beta was able to create leave application for Tenant Alpha user!");
  } catch (err: any) {
    if (err.message.includes("Unauthorized") || err.message.includes("belongs to another tenant")) {
      console.log("PASS: Cross-tenant leave application creation blocked:", err.message);
      passed++;
    } else {
      console.error("FAIL: Unexpected error message:", err.message);
    }
  }

  // -------------------------------------------------------------
  // TEST 4: Cross-Tenant Salary Structure & Advance Creation
  // -------------------------------------------------------------
  total++;
  try {
    console.log("\n[TEST 4] Probing Cross-Tenant Salary Structure & Advance Creation...");
    let salStructBlocked = false;
    let salAdvBlocked = false;

    try {
      await runWithTenant(tenantBeta.id, async () => {
        await storage.createSalaryStructure({
          userId: userAlpha.id,
          baseSalary: 60000
        });
      });
    } catch (e: any) {
      if (e.message.includes("Unauthorized") || e.message.includes("belongs to another tenant")) {
        salStructBlocked = true;
      }
    }

    try {
      await runWithTenant(tenantBeta.id, async () => {
        await storage.createSalaryAdvance({
          userId: userAlpha.id,
          amount: 5000,
          reason: "Unauthorized advance"
        });
      });
    } catch (e: any) {
      if (e.message.includes("Unauthorized") || e.message.includes("belongs to another tenant")) {
        salAdvBlocked = true;
      }
    }

    if (salStructBlocked && salAdvBlocked) {
      console.log("PASS: Both Salary Structure and Salary Advance blocked cross-tenant injection.");
      passed++;
    } else {
      console.error(`FAIL: Salary isolation incomplete. StructBlocked=${salStructBlocked}, AdvBlocked=${salAdvBlocked}`);
    }
  } catch (err: any) {
    console.error("FAIL in Test 4:", err);
  }

  // -------------------------------------------------------------
  // TEST 5: Cross-Tenant Department Manager Reference
  // -------------------------------------------------------------
  total++;
  try {
    console.log("\n[TEST 5] Probing Cross-Tenant Department Manager Assignment...");
    let createDeptBlocked = false;
    let updateDeptBlocked = false;

    try {
      await runWithTenant(tenantBeta.id, async () => {
        await storage.createDepartment({
          name: "Rogue Dept",
          managerId: userAlpha.id
        });
      });
    } catch (e: any) {
      if (e.message.includes("Unauthorized") || e.message.includes("belongs to another tenant")) {
        createDeptBlocked = true;
      }
    }

    // Now create a valid dept in Beta and try to update its manager to Alpha user
    const validDept = await runWithTenant(tenantBeta.id, async () => {
      return storage.createDepartment({
        name: "Legit Beta Dept",
        managerId: userBeta.id
      });
    });

    try {
      await runWithTenant(tenantBeta.id, async () => {
        await storage.updateDepartment(validDept.id, {
          managerId: userAlpha.id
        });
      });
    } catch (e: any) {
      if (e.message.includes("Unauthorized") || e.message.includes("belongs to another tenant")) {
        updateDeptBlocked = true;
      }
    }

    if (createDeptBlocked && updateDeptBlocked) {
      console.log("PASS: Department manager assignment strictly blocked cross-tenant managers.");
      passed++;
    } else {
      console.error(`FAIL: Dept manager isolation failed. CreateBlocked=${createDeptBlocked}, UpdateBlocked=${updateDeptBlocked}`);
    }
  } catch (err: any) {
    console.error("FAIL in Test 5:", err);
  }

  // -------------------------------------------------------------
  // TEST 6: Follow-Up Site Visit Cross-Tenant Protection
  // -------------------------------------------------------------
  total++;
  try {
    console.log("\n[TEST 6] Probing Follow-Up Site Visit Cross-Tenant Isolation...");
    // Create site visit in Tenant Alpha
    const visitAlphaId = crypto.randomUUID();
    const sampleCustomer = {
      name: "Alpha Customer",
      phone: "9876543210",
      mobile: "9876543210",
      address: "123 Solar Street",
      propertyType: "residential" as const,
      source: "website"
    };

    const sampleLocation = {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracy: 10,
      address: "Bangalore"
    };

    await pgDb.insert(siteVisits).values({
      id: visitAlphaId,
      tenantId: tenantAlpha.id,
      userId: userAlpha.id,
      department: "technical",
      visitPurpose: "quotation_discussion",
      siteInTime: new Date(),
      status: "completed",
      visitOutcome: "on_process",
      customerCurrentStatus: "on_process",
      customer: sampleCustomer
    });

    let createFollowUpBlocked = false;
    try {
      await runWithTenant(tenantBeta.id, async () => {
        await followUpService.createFollowUp({
          originalVisitId: visitAlphaId,
          userId: userBeta.id,
          department: "technical",
          siteInTime: new Date(),
          siteInLocation: sampleLocation,
          customer: sampleCustomer,
          description: "Unauthorized follow up",
          tenantId: tenantBeta.id
        } as any);
      });
    } catch (e: any) {
      if (e.message.includes("Unauthorized") || e.message.includes("belongs to another tenant")) {
        createFollowUpBlocked = true;
      }
    }

    // Create a legitimate follow-up in Tenant Alpha
    const validFollowUp = await runWithTenant(tenantAlpha.id, async () => {
      return followUpService.createFollowUp({
        originalVisitId: visitAlphaId,
        userId: userAlpha.id,
        department: "technical",
        siteInTime: new Date(),
        siteInLocation: sampleLocation,
        customer: sampleCustomer,
        description: "Valid follow up",
        tenantId: tenantAlpha.id
      } as any);
    });

    let updateFollowUpBlocked = false;
    try {
      await runWithTenant(tenantBeta.id, async () => {
        await followUpService.updateFollowUp(validFollowUp.id, {
          notes: "Tampered by Tenant Beta",
          tenantId: tenantBeta.id
        } as any);
      });
    } catch (e: any) {
      if (e.message.includes("Unauthorized") || e.message.includes("belongs to another tenant")) {
        updateFollowUpBlocked = true;
      }
    }

    let deleteFollowUpBlocked = false;
    try {
      await runWithTenant(tenantBeta.id, async () => {
        await followUpService.deleteFollowUp(validFollowUp.id, tenantBeta.id);
      });
    } catch (e: any) {
      if (e.message.includes("Unauthorized") || e.message.includes("belongs to another tenant")) {
        deleteFollowUpBlocked = true;
      }
    }

    if (createFollowUpBlocked && updateFollowUpBlocked && deleteFollowUpBlocked) {
      console.log("PASS: Follow-Up Site Visit completely isolated across create, update, and delete.");
      passed++;
    } else {
      console.error(`FAIL: FollowUp isolation failed. CreateBlocked=${createFollowUpBlocked}, UpdateBlocked=${updateFollowUpBlocked}, DeleteBlocked=${deleteFollowUpBlocked}`);
    }
  } catch (err: any) {
    console.error("FAIL in Test 6:", err);
  }

  // -------------------------------------------------------------
  // TEST 7: IST Timezone Day-Shift Boundary in Attendance Query
  // -------------------------------------------------------------
  total++;
  try {
    console.log("\n[TEST 7] Testing IST Day-Shift Boundary in getAttendanceByUserAndDate...");
    // 01:30 AM IST on Nov 12, 2026 is 20:00 UTC on Nov 11, 2026
    const earlyMorningIST = new Date("2026-11-11T20:00:00.000Z");

    // Insert attendance on Nov 12 IST calendar date
    const nov12UTCStart = new Date("2026-11-12T00:00:00.000Z");
    const [attRow] = await pgDb.insert(attendance).values({
      tenantId: tenantAlpha.id,
      userId: userAlpha.id,
      date: nov12UTCStart,
      attendanceType: "office",
      status: "present",
      workingHours: "8.0"
    }).returning();

    // Query using the early morning IST timestamp (which has UTC date of Nov 11)
    const foundAtt = await runWithTenant(tenantAlpha.id, async () => {
      return storage.getAttendanceByUserAndDate(userAlpha.id, earlyMorningIST);
    });

    if (foundAtt && foundAtt.id === attRow.id) {
      console.log("PASS: getAttendanceByUserAndDate correctly resolved 01:30 AM IST (Nov 11 20:00 UTC) to Nov 12 record!");
      passed++;
    } else {
      console.error("FAIL: Attendance query failed to match IST date boundary. Found:", foundAtt);
    }
  } catch (err: any) {
    console.error("FAIL in Test 7:", err);
  }

  // Clean up
  console.log("\n[TEARDOWN] Cleaning up test data...");
  try {
    await pgDb.delete(followUpVisits).where(eq(followUpVisits.tenantId, tenantAlpha.id));
    await pgDb.delete(followUpVisits).where(eq(followUpVisits.tenantId, tenantBeta.id));
    await pgDb.delete(siteVisits).where(eq(siteVisits.tenantId, tenantAlpha.id));
    await pgDb.delete(siteVisits).where(eq(siteVisits.tenantId, tenantBeta.id));
    await pgDb.delete(attendance).where(eq(attendance.tenantId, tenantAlpha.id));
    await pgDb.delete(attendance).where(eq(attendance.tenantId, tenantBeta.id));
    await pgDb.delete(departments).where(eq(departments.tenantId, tenantBeta.id));
    await pgDb.delete(users).where(eq(users.id, userAlpha.id));
    await pgDb.delete(users).where(eq(users.id, userBeta.id));
    await pgDb.delete(tenants).where(eq(tenants.id, tenantAlpha.id));
    await pgDb.delete(tenants).where(eq(tenants.id, tenantBeta.id));
    console.log("[TEARDOWN] Completed.");
  } catch (cleanErr) {
    console.warn("[TEARDOWN] Warning:", cleanErr);
  }

  console.log(`\n=== RESULTS: ${passed}/${total} PASSED ===`);
  if (passed !== total) {
    process.exit(1);
  }
}

runPhase9Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FATAL ERROR in Phase 9 tests:", err);
    process.exit(1);
  });

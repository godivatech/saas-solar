import "dotenv/config";
import { CompanySettingsService } from "../services/company-settings-service";
import { UnifiedAttendanceService } from "../services/unified-attendance-service";
import { LeaveService } from "../services/leave-service";
import { EnterpriseTimeService } from "../services/enterprise-time-service";
import { QuotationTemplateService } from "../services/quotation-template-service";
import { PayrollLockService } from "../services/payroll-lock-service";
import { getISTDateString, getISTDayOfWeek } from "../utils/timezone-helpers";
import { storage } from "../storage";
import { runWithTenant } from "../tenant-context";
import { db as pgDb } from "../db";
import {
  tenants as pgTenants,
  users as pgUsers,
  performanceReviews as pgPerformanceReviews
} from "@shared/schema.postgres";
import { eq, or } from "drizzle-orm";

async function runPhase10Tests() {
  console.log("================================================================================");
  console.log("PHASE 10: IST CALENDAR BOUNDARY ERADICATION & REVIEWER TENANT HARDENING TEST SUITE");
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

  // ---------------------------------------------------------------------------
  // TEST 1: IST Weekend Boundary (Sunday 01:30 AM IST = Saturday 20:00 UTC)
  // ---------------------------------------------------------------------------
  try {
    // 2026-05-17 is a Sunday. 01:30 AM IST on 2026-05-17 is 2026-05-16 20:00:00 UTC.
    const sundayEarlyMorningIST = new Date("2026-05-16T20:00:00.000Z");
    const utcDay = sundayEarlyMorningIST.getUTCDay(); // 6 (Saturday)
    const istDay = getISTDayOfWeek(sundayEarlyMorningIST); // 0 (Sunday)
    const isWeekend = await CompanySettingsService.isWeekend(sundayEarlyMorningIST);

    assert(
      utcDay === 6 && istDay === 0 && isWeekend === true,
      "Test 1: CompanySettingsService.isWeekend correctly identifies Sunday during early morning IST (Saturday UTC)"
    );
  } catch (err: any) {
    console.error("Test 1 error:", err);
    assert(false, `Test 1 threw error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: LeaveService.isSunday & isHoliday Early-Morning IST Boundary
  // ---------------------------------------------------------------------------
  try {
    const leaveService = new LeaveService(storage);
    const sundayEarlyMorning = new Date("2026-05-16T20:30:00.000Z"); // Sunday 02:00 AM IST
    const isSun = await leaveService.isSunday(sundayEarlyMorning);

    // Mock Republic Day holiday: Jan 26, 2026 at 01:00 AM IST (Jan 25 19:30 UTC)
    const republicDayEarlyMorning = new Date("2026-01-25T19:30:00.000Z");
    const istDateStr = getISTDateString(republicDayEarlyMorning);

    assert(
      isSun === true && istDateStr === "2026-01-26",
      "Test 2: LeaveService.isSunday and getISTDateString accurately resolve early-morning calendar day"
    );
  } catch (err: any) {
    console.error("Test 2 error:", err);
    assert(false, `Test 2 threw error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: EnterpriseTimeService 12-Hour IST Timezone Output
  // ---------------------------------------------------------------------------
  try {
    // 19:30 UTC = 01:00 AM IST the next day
    const timeAtUTC = new Date("2026-03-10T19:30:00.000Z");
    const formatted = (EnterpriseTimeService as any).formatTo12Hour(timeAtUTC);
    assert(
      formatted.includes("1:00") && formatted.toLowerCase().includes("am"),
      `Test 3: EnterpriseTimeService.formatTo12Hour formats in Asia/Kolkata IST (expected '1:00 AM', got '${formatted}')`
    );
  } catch (err: any) {
    console.error("Test 3 error:", err);
    assert(false, `Test 3 threw error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Quotation Number Month Code Alignment with IST
  // ---------------------------------------------------------------------------
  try {
    const qNum = QuotationTemplateService.generateQuotationNumber();
    const expectedMonth = getISTDateString(new Date()).split('-')[1];
    const match = qNum.match(/^Q-(\d{2})-\d{4}$/);

    assert(
      match !== null && match[1] === expectedMonth,
      `Test 4: QuotationTemplateService.generateQuotationNumber matches current IST month (${match?.[1]} === ${expectedMonth})`
    );
  } catch (err: any) {
    console.error("Test 4 error:", err);
    assert(false, `Test 4 threw error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // TENANT SETUP FOR TESTS 5, 6, 7
  // ---------------------------------------------------------------------------
  const [tenantAlpha] = await pgDb.insert(pgTenants).values({
    name: "Tenant Alpha P10",
    slug: `tenant-alpha-p10-${Date.now()}`,
    tier: "enterprise"
  }).returning();

  const [tenantBeta] = await pgDb.insert(pgTenants).values({
    name: "Tenant Beta P10",
    slug: `tenant-beta-p10-${Date.now()}`,
    tier: "enterprise"
  }).returning();

  const testUserAId = "test-emp-a-p10-" + Date.now();
  const testReviewerBId = "test-rev-b-p10-" + Date.now();

  let validPRId = "";

  try {
    // Setup test employee in Tenant Alpha and reviewer in Tenant Beta
    await pgDb.insert(pgUsers).values({
      id: testUserAId,
      firebaseUid: testUserAId,
      tenantId: tenantAlpha.id,
      email: `emp_a_${Date.now()}@test.com`,
      displayName: "Tenant Alpha Employee",
      role: "employee",
      department: "operations",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await pgDb.insert(pgUsers).values({
      id: testReviewerBId,
      firebaseUid: testReviewerBId,
      tenantId: tenantBeta.id,
      email: `rev_b_${Date.now()}@test.com`,
      displayName: "Tenant Beta Reviewer",
      role: "manager",
      department: "operations",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // ---------------------------------------------------------------------------
    // TEST 5: Performance Review Reviewer Cross-Tenant Leakage Prevention (Create)
    // ---------------------------------------------------------------------------
    let preventedCreate = false;
    await runWithTenant(tenantAlpha.id, async () => {
      try {
        await storage.createPerformanceReview({
          employeeId: testUserAId,
          reviewPeriod: { startDate: new Date(), endDate: new Date() },
          reviewType: "annual",
          overallRating: 5,
          goals: ["Deliver project"],
          strengths: ["Fast learner"],
          improvementAreas: ["Time management"],
          reviewerComments: "Great work",
          reviewedBy: testReviewerBId, // Foreign reviewer from Tenant Beta!
        } as any);
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Reviewer belongs to another tenant")) {
          preventedCreate = true;
        } else {
          console.error("Unexpected error in Test 5:", err);
        }
      }
    });

    assert(
      preventedCreate,
      "Test 5: storage.createPerformanceReview blocks assigning foreign tenant user as reviewedBy"
    );

    // ---------------------------------------------------------------------------
    // TEST 6: Performance Review Reviewer Cross-Tenant Leakage Prevention (Update)
    // ---------------------------------------------------------------------------
    const createdPR = await runWithTenant(tenantAlpha.id, async () => {
      return await storage.createPerformanceReview({
        employeeId: testUserAId,
        reviewPeriod: { startDate: new Date(), endDate: new Date() },
        reviewType: "quarterly",
        overallRating: 4,
        goals: ["Improve code"],
        strengths: ["Detail oriented"],
        improvementAreas: ["None"],
        reviewerComments: "Good",
        reviewedBy: testUserAId,
      } as any);
    });
    validPRId = createdPR.id;

    let preventedUpdate = false;
    await runWithTenant(tenantAlpha.id, async () => {
      try {
        await storage.updatePerformanceReview(validPRId, {
          reviewedBy: testReviewerBId // Attempt to set foreign reviewer from Tenant Beta
        });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Reviewer belongs to another tenant")) {
          preventedUpdate = true;
        } else {
          console.error("Unexpected error in Test 6:", err);
        }
      }
    });

    assert(
      preventedUpdate,
      "Test 6: storage.updatePerformanceReview blocks updating reviewedBy to a foreign tenant user"
    );

    // ---------------------------------------------------------------------------
    // TEST 7: Cross-Tenant Performance Review Isolation (Read & Delete)
    // ---------------------------------------------------------------------------
    const readFromBeta = await runWithTenant(tenantBeta.id, async () => {
      return await storage.getPerformanceReview(validPRId);
    });

    let preventedDelete = false;
    await runWithTenant(tenantBeta.id, async () => {
      try {
        await storage.deletePerformanceReview(validPRId);
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Performance review belongs to another tenant")) {
          preventedDelete = true;
        }
      }
    });

    assert(
      readFromBeta === undefined && preventedDelete,
      "Test 7: Cross-tenant performance review inspection returns undefined and cross-tenant delete throws Unauthorized"
    );

  } finally {
    // ---------------------------------------------------------------------------
    // Cleanup test data
    // ---------------------------------------------------------------------------
    try {
      if (validPRId) {
        await pgDb.delete(pgPerformanceReviews).where(eq(pgPerformanceReviews.id, validPRId));
      }
      await pgDb.delete(pgUsers).where(or(eq(pgUsers.id, testUserAId), eq(pgUsers.id, testReviewerBId)));
      await pgDb.delete(pgTenants).where(or(eq(pgTenants.id, tenantAlpha.id), eq(pgTenants.id, tenantBeta.id)));
    } catch (e) {
      console.warn("Cleanup warning:", e);
    }
  }

  console.log("\n================================================================================");
  console.log(`PHASE 10 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPhase10Tests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});

import 'dotenv/config';
import { storage } from '../storage';
import { db } from '../db';
import { tenants, users, siteVisits, followUpVisits, leaveApplications, leaveBalances } from '@shared/schema.postgres';
import { eq } from 'drizzle-orm';
import { siteVisitService } from '../services/site-visit-service';
import { followUpService } from '../services/follow-up-service';

async function runTests() {
  console.log("=== STARTING LEAVES & FIELD OPERATIONS ISOLATION VERIFICATION ===");

  const tenantA = "default-tenant";
  const tenantB = "test-tenant-field-" + Date.now();

  try {
    // 0. Ensure test tenant B exists
    await db.insert(tenants).values({
      id: tenantB,
      name: "Test Tenant Field B",
      slug: `tenant-field-b-${Date.now()}`,
      status: "active"
    }).onConflictDoNothing();

    // Create Manager and 2 employees in Tenant A
    const managerA = await storage.createUser({
      email: `mgr.a.${Date.now()}@example.com`,
      displayName: "Manager Alpha",
      role: "manager",
      department: "technical"
    });

    const otherManagerA = await storage.createUser({
      email: `other.mgr.a.${Date.now()}@example.com`,
      displayName: "Other Manager Alpha",
      role: "manager",
      department: "marketing"
    });

    const empA1 = await storage.createUser({
      email: `emp.a1.${Date.now()}@example.com`,
      displayName: "Employee A1",
      role: "employee",
      department: "technical",
      reportingManagerId: managerA.id
    });

    const empA2 = await storage.createUser({
      email: `emp.a2.${Date.now()}@example.com`,
      displayName: "Employee A2",
      role: "employee",
      department: "technical",
      reportingManagerId: managerA.id
    });

    const otherEmpA = await storage.createUser({
      email: `other.emp.a.${Date.now()}@example.com`,
      displayName: "Other Employee A",
      role: "employee",
      department: "marketing",
      reportingManagerId: otherManagerA.id
    });

    // Create Tenant B Employee
    const empBId = `emp-b-${Date.now()}`;

    // =========================================================================
    // 1. MANAGER LEAVE APPLICATIONS SCOPING TEST
    // =========================================================================
    console.log("\n[TEST 1] Testing Manager-Scoped Leave Applications Hierarchy...");

    // Create leaves for empA1, empA2, and otherEmpA
    const leaveA1 = await storage.createLeaveApplication({
      userId: empA1.id,
      leaveType: "casual_leave",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-09-02"),
      totalDays: 2,
      reason: "Family event",
      status: "pending_manager"
    });

    const leaveA2 = await storage.createLeaveApplication({
      userId: empA2.id,
      leaveType: "permission",
      permissionDate: new Date("2026-09-05"),
      permissionHours: 2,
      reason: "Doctor appointment",
      status: "pending_manager"
    });

    const leaveOther = await storage.createLeaveApplication({
      userId: otherEmpA.id,
      leaveType: "casual_leave",
      startDate: new Date("2026-09-10"),
      endDate: new Date("2026-09-10"),
      totalDays: 1,
      reason: "Personal work",
      status: "pending_manager"
    });

    console.log(`✓ Created 3 leave applications across 2 manager teams`);

    // Query leaves for Manager A
    const managerALeaves = await storage.listLeaveApplicationsByManager(managerA.id);
    console.log(`✓ Manager A retrieved ${managerALeaves.length} team leave application(s)`);

    const hasA1 = managerALeaves.some(l => l.id === leaveA1.id);
    const hasA2 = managerALeaves.some(l => l.id === leaveA2.id);
    const hasOther = managerALeaves.some(l => l.id === leaveOther.id);

    if (!hasA1 || !hasA2) {
      throw new Error("Manager A failed to see their own team members' leave applications!");
    }
    if (hasOther) {
      throw new Error("SECURITY VIOLATION: Manager A can see other manager's employee leave applications!");
    }
    console.log("✓ Manager hierarchy strictly enforced: Manager A sees ONLY their team (Emp A1 & Emp A2)");

    // Query leaves for Other Manager A
    const otherManagerLeaves = await storage.listLeaveApplicationsByManager(otherManagerA.id);
    if (!otherManagerLeaves.some(l => l.id === leaveOther.id) || otherManagerLeaves.some(l => l.id === leaveA1.id)) {
      throw new Error("Other Manager A cannot see their own team or leaked Manager A leaves!");
    }
    console.log("✓ Other Manager sees ONLY their employee (Other Emp A)");

    // =========================================================================
    // 2. FIELD OPERATIONS & SITE VISITS MULTI-TENANT ISOLATION
    // =========================================================================
    console.log("\n[TEST 2] Testing Site Visits & Follow-Up Visits Multi-Tenant Scoping...");

    // Create Site Visit in Tenant A
    const visitA = await siteVisitService.createSiteVisit({
      userId: empA1.id,
      department: "technical",
      visitPurpose: "Rooftop Feasibility Survey",
      siteInTime: new Date(),
      status: "in_progress",
      customer: {
        name: "Alpha Corp Headquarters",
        mobile: "9876543210",
        address: "100 MG Road, Bangalore"
      }
    } as any);

    console.log(`✓ Created Tenant A site visit: ${visitA.id} (${visitA.visitPurpose})`);

    // Create Site Visit in Tenant B directly
    const visitB = await siteVisitService.createSiteVisit({
      tenantId: tenantB,
      userId: empBId,
      department: "technical",
      visitPurpose: "Industrial 500KW Survey",
      siteInTime: new Date(),
      status: "in_progress",
      customer: {
        name: "Beta Steel Works",
        mobile: "9123456780",
        address: "Plot 42 Peenya, Bangalore"
      }
    } as any);

    console.log(`✓ Created Tenant B site visit: ${visitB.id} (${visitB.visitPurpose})`);

    // Query monitoring dashboard for Tenant A
    const tenantAMonitoring = await siteVisitService.getAllSiteVisitsForMonitoring();
    const hasVisitAInA = tenantAMonitoring.some(v => v.id === visitA.id);
    const hasVisitBInA = tenantAMonitoring.some(v => v.id === visitB.id);

    if (!hasVisitAInA) {
      throw new Error("Tenant A failed to see their own site visit!");
    }
    if (hasVisitBInA) {
      throw new Error("SECURITY VIOLATION: Tenant B site visit leaked into Tenant A monitoring dashboard!");
    }
    console.log("✓ Monitoring dashboard strictly isolated: Tenant A sees visit A, NOT visit B");

    // Query active site visits for Tenant A
    const activeA = await siteVisitService.getActiveSiteVisits();
    if (!activeA.some(v => v.id === visitA.id) || activeA.some(v => v.id === visitB.id)) {
      throw new Error("Active site visits query leaked across tenants!");
    }
    console.log("✓ Active visits query strictly isolated by tenant");

    // Query stats for Tenant A vs Tenant B
    const statsA = await siteVisitService.getSiteVisitStats();
    const statsB = await siteVisitService.getSiteVisitStats({ tenantId: tenantB });
    console.log(`✓ Tenant A stats total: ${statsA.total}, Tenant B stats total: ${statsB.total}`);
    if (statsB.total !== 1) {
      throw new Error(`Expected Tenant B stats total to be exactly 1, got ${statsB.total}`);
    }

    // Clean up created site visits
    await siteVisitService.deleteSiteVisit(visitA.id);
    await siteVisitService.deleteSiteVisit(visitB.id);
    console.log("✓ Cleaned up test site visits");

    console.log("\n=======================================================");
    console.log(" ALL LEAVES & SITE VISITS ISOLATION TESTS PASSED 100%");
    console.log("=======================================================\n");

  } finally {
    // Cleanup tenant B data
    try {
      await db.delete(siteVisits).where(eq(siteVisits.tenantId, tenantB));
      await db.delete(tenants).where(eq(tenants.id, tenantB));
    } catch (_) {}
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error("\n❌ TEST SUITE FAILED:", err);
  process.exit(1);
});

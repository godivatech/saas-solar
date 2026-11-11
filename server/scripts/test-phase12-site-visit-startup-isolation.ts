import "dotenv/config";
import { siteVisitService } from "../services/site-visit-service";
import { SiteVisitAutoCloseService } from "../services/site-visit-auto-close-service";
import { storage } from "../storage";
import { runWithTenant } from "../tenant-context";
import { db as pgDb } from "../db";
import {
  tenants as pgTenants,
  users as pgUsers,
  customers as pgCustomers,
  siteVisits as pgSiteVisits,
  quotations as pgQuotations,
  invoices as pgInvoices,
  employees as pgEmployees,
  payrolls as pgPayrolls,
  roles as pgRoles,
  userRoleAssignments as pgUserRoleAssignments,
  permissionOverrides as pgPermissionOverrides
} from "@shared/schema.postgres";
import { eq, or } from "drizzle-orm";
import crypto from "crypto";

async function runPhase12Tests() {
  console.log("================================================================================");
  console.log("PHASE 12: SITE VISIT & STORAGE CROSS-TENANT ISOLATION AND STARTUP VERIFICATION");
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
    name: "Phase 12 Tenant Alpha",
    slug: `phase12-alpha-${Date.now()}`
  };
  const tenantBeta = {
    id: crypto.randomUUID(),
    name: "Phase 12 Tenant Beta",
    slug: `phase12-beta-${Date.now()}`
  };

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  const custAId = crypto.randomUUID();
  const custBId = crypto.randomUUID();
  const roleAId = crypto.randomUUID();
  const roleBId = crypto.randomUUID();

  let createdSiteVisitId: string | null = null;
  let createdCustAId: string | null = null;
  let createdQuotationId: string | null = null;
  let createdInvoiceId: string | null = null;
  let createdEmployeeId: string | null = null;
  let createdPayrollId: string | null = null;

  try {
    // Setup test tenants
    await pgDb.insert(pgTenants).values([tenantAlpha, tenantBeta]);

    // Setup test users in distinct tenants
    await pgDb.insert(pgUsers).values([
      {
        id: userAId,
        firebaseUid: userAId,
        tenantId: tenantAlpha.id,
        email: `usera-${Date.now()}@alpha.com`,
        displayName: "User Alpha",
        role: "admin",
        department: "technical"
      },
      {
        id: userBId,
        firebaseUid: userBId,
        tenantId: tenantBeta.id,
        email: `userb-${Date.now()}@beta.com`,
        displayName: "User Beta",
        role: "admin",
        department: "technical"
      }
    ]);

    // Setup test customers in distinct tenants
    await pgDb.insert(pgCustomers).values([
      {
        id: custAId,
        tenantId: tenantAlpha.id,
        name: "Customer Alpha",
        mobile: "9876543210",
        state: "Karnataka",
        status: "lead"
      },
      {
        id: custBId,
        tenantId: tenantBeta.id,
        name: "Customer Beta",
        mobile: "9876543211",
        state: "Karnataka",
        status: "lead"
      }
    ]);

    // Setup test roles in distinct tenants
    await pgDb.insert(pgRoles).values([
      {
        id: roleAId,
        tenantId: tenantAlpha.id,
        name: "Role Alpha",
        permissions: ["users.view"]
      },
      {
        id: roleBId,
        tenantId: tenantBeta.id,
        name: "Role Beta",
        permissions: ["users.view"]
      }
    ]);

    // ---------------------------------------------------------------------------
    // TEST 1: SiteVisitService.createSiteVisit blocks foreign userId
    // ---------------------------------------------------------------------------
    let test1Blocked = false;
    await runWithTenant(tenantAlpha.id, async () => {
      try {
        await siteVisitService.createSiteVisit({
          userId: userBId, // Foreign user from Tenant Beta!
          department: "technical",
          visitPurpose: "initial_survey",
          customer: { id: custAId, name: "Customer Alpha", phone: "9876543210" }
        } as any);
      } catch (err: any) {
        if (err.message.includes("Unauthorized: User belongs to another tenant")) {
          test1Blocked = true;
        } else {
          console.error("Test 1 unexpected error:", err);
        }
      }
    });
    assert(test1Blocked, "Test 1: SiteVisitService.createSiteVisit blocks foreign tenant user injection");

    // ---------------------------------------------------------------------------
    // TEST 2: SiteVisitService.createSiteVisit blocks foreign customerId
    // ---------------------------------------------------------------------------
    let test2Blocked = false;
    await runWithTenant(tenantAlpha.id, async () => {
      try {
        await siteVisitService.createSiteVisit({
          userId: userAId,
          department: "technical",
          visitPurpose: "initial_survey",
          customer: { id: custBId, name: "Customer Beta", phone: "9876543211" } // Foreign customer from Tenant Beta!
        } as any);
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Customer belongs to another tenant")) {
          test2Blocked = true;
        } else {
          console.error("Test 2 unexpected error:", err);
        }
      }
    });
    assert(test2Blocked, "Test 2: SiteVisitService.createSiteVisit blocks foreign tenant customer injection");

    // ---------------------------------------------------------------------------
    // TEST 3: SiteVisitService.createSiteVisit succeeds with same-tenant entities
    // ---------------------------------------------------------------------------
    let createdVisit: any = null;
    await runWithTenant(tenantAlpha.id, async () => {
      createdVisit = await siteVisitService.createSiteVisit({
        userId: userAId,
        department: "technical",
        visitPurpose: "initial_survey",
        customer: { id: custAId, name: "Customer Alpha", phone: "9876543210" }
      } as any);
    });
    createdSiteVisitId = createdVisit?.id;
    assert(
      createdVisit && createdVisit.id && createdVisit.userId === userAId,
      "Test 3: SiteVisitService.createSiteVisit successfully creates visit for valid same-tenant entities"
    );

    // ---------------------------------------------------------------------------
    // TEST 4: SiteVisitService.updateSiteVisit blocks foreign userId/customer update
    // ---------------------------------------------------------------------------
    let test4UserBlocked = false;
    let test4CustBlocked = false;
    await runWithTenant(tenantAlpha.id, async () => {
      try {
        await siteVisitService.updateSiteVisit(createdSiteVisitId!, { userId: userBId } as any);
      } catch (err: any) {
        if (err.message.includes("Unauthorized: User belongs to another tenant")) {
          test4UserBlocked = true;
        }
      }

      try {
        await siteVisitService.updateSiteVisit(createdSiteVisitId!, { customer: { id: custBId } } as any);
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Customer belongs to another tenant")) {
          test4CustBlocked = true;
        }
      }
    });
    assert(
      test4UserBlocked && test4CustBlocked,
      "Test 4: SiteVisitService.updateSiteVisit blocks mutating userId or customer to foreign tenant"
    );

    // ---------------------------------------------------------------------------
    // TEST 5: SiteVisitService cross-tenant access control (read/update/delete)
    // ---------------------------------------------------------------------------
    const readFromBeta = await runWithTenant(tenantBeta.id, async () => {
      return await siteVisitService.getSiteVisitById(createdSiteVisitId!);
    });

    let test5UpdateBlocked = false;
    await runWithTenant(tenantBeta.id, async () => {
      try {
        await siteVisitService.updateSiteVisit(createdSiteVisitId!, { notes: "Hacked" } as any);
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Site visit belongs to another tenant")) {
          test5UpdateBlocked = true;
        }
      }
    });

    let test5DeleteBlocked = false;
    await runWithTenant(tenantBeta.id, async () => {
      try {
        await siteVisitService.deleteSiteVisit(createdSiteVisitId!);
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Site visit belongs to another tenant")) {
          test5DeleteBlocked = true;
        }
      }
    });

    assert(
      readFromBeta === null && test5UpdateBlocked && test5DeleteBlocked,
      "Test 5: Cross-tenant Site Visit read returns null, and cross-tenant update and delete throw Unauthorized"
    );

    // ---------------------------------------------------------------------------
    // TEST 6: storage.createCustomer blocks foreign assignedSalesExecId
    // ---------------------------------------------------------------------------
    let test6Blocked = false;
    await runWithTenant(tenantAlpha.id, async () => {
      try {
        await storage.createCustomer({
          name: "Test Sales Cross",
          mobile: "9123456789",
          assignedSalesExecId: userBId // Foreign user!
        });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Assigned sales executive belongs to another tenant")) {
          test6Blocked = true;
        }
      }
    });
    assert(test6Blocked, "Test 6: storage.createCustomer blocks foreign assignedSalesExecId");

    // ---------------------------------------------------------------------------
    // TEST 7: storage.updateCustomer blocks updating assignedSalesExecId to foreign user
    // ---------------------------------------------------------------------------
    let test7Blocked = false;
    await runWithTenant(tenantAlpha.id, async () => {
      try {
        await storage.updateCustomer(custAId, {
          assignedSalesExecId: userBId // Foreign user!
        });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Assigned sales executive belongs to another tenant")) {
          test7Blocked = true;
        }
      }
    });
    assert(test7Blocked, "Test 7: storage.updateCustomer blocks updating assignedSalesExecId to foreign user");

    // ---------------------------------------------------------------------------
    // TEST 8: storage.createQuotation blocks foreign customerId and createdBy
    // ---------------------------------------------------------------------------
    let test8CustBlocked = false;
    let test8UserBlocked = false;
    await runWithTenant(tenantAlpha.id, async () => {
      try {
        await storage.createQuotation({
          customerId: custBId, // Foreign customer!
          systemKw: 5,
          ratePerKw: 50000,
          totalCost: 250000
        });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Customer belongs to another tenant")) {
          test8CustBlocked = true;
        }
      }

      try {
        await storage.createQuotation({
          customerId: custAId,
          createdBy: userBId, // Foreign user!
          systemKw: 5,
          ratePerKw: 50000,
          totalCost: 250000
        });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: User belongs to another tenant")) {
          test8UserBlocked = true;
        }
      }
    });
    assert(
      test8CustBlocked && test8UserBlocked,
      "Test 8: storage.createQuotation blocks foreign customerId and foreign createdBy"
    );

    // ---------------------------------------------------------------------------
    // TEST 9: storage.createInvoice blocks foreign customerId and foreign quotationId
    // ---------------------------------------------------------------------------
    let test9CustBlocked = false;
    await runWithTenant(tenantAlpha.id, async () => {
      try {
        await storage.createInvoice({
          customerId: custBId, // Foreign customer!
          total: 100000
        });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Customer belongs to another tenant")) {
          test9CustBlocked = true;
        }
      }
    });
    assert(test9CustBlocked, "Test 9: storage.createInvoice blocks foreign customerId");

    // ---------------------------------------------------------------------------
    // TEST 10: storage.createEmployee blocks foreign systemUserId
    // ---------------------------------------------------------------------------
    let test10Blocked = false;
    await runWithTenant(tenantAlpha.id, async () => {
      try {
        await storage.createEmployee({
          employeeId: `EMP-${Date.now()}`,
          systemUserId: userBId, // Foreign user!
          personalInfo: { firstName: "Test", lastName: "Foreign" },
          contactInfo: { email: "foreign@test.com", phone: "9876500000" },
          employmentInfo: { department: "technical", designation: "technician" }
        });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: System user belongs to another tenant")) {
          test10Blocked = true;
        }
      }
    });
    assert(test10Blocked, "Test 10: storage.createEmployee blocks foreign systemUserId");

    // ---------------------------------------------------------------------------
    // TEST 11: storage.createPayroll blocks foreign userId
    // ---------------------------------------------------------------------------
    let test11Blocked = false;
    await runWithTenant(tenantAlpha.id, async () => {
      try {
        await storage.createPayroll({
          userId: userBId, // Foreign user!
          month: 11,
          year: 2026,
          grossSalary: 50000,
          netSalary: 45000
        });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: User belongs to another tenant")) {
          test11Blocked = true;
        }
      }
    });
    assert(test11Blocked, "Test 11: storage.createPayroll blocks foreign userId");

    // ---------------------------------------------------------------------------
    // TEST 12: storage.assignUserRole blocks foreign userId and foreign roleId
    // ---------------------------------------------------------------------------
    let test12UserBlocked = false;
    let test12RoleBlocked = false;
    await runWithTenant(tenantAlpha.id, async () => {
      try {
        await storage.assignUserRole({
          userId: userBId, // Foreign user!
          roleId: roleAId,
          assignedBy: userAId
        });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: User belongs to another tenant")) {
          test12UserBlocked = true;
        }
      }

      try {
        await storage.assignUserRole({
          userId: userAId,
          roleId: roleBId, // Foreign role!
          assignedBy: userAId
        });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Role belongs to another tenant")) {
          test12RoleBlocked = true;
        }
      }
    });
    assert(
      test12UserBlocked && test12RoleBlocked,
      "Test 12: storage.assignUserRole blocks foreign userId and foreign roleId"
    );

    // ---------------------------------------------------------------------------
    // TEST 13: storage.createPermissionOverride blocks foreign userId
    // ---------------------------------------------------------------------------
    let test13Blocked = false;
    await runWithTenant(tenantAlpha.id, async () => {
      try {
        await storage.createPermissionOverride({
          userId: userBId, // Foreign user!
          permission: "users.view",
          granted: true,
          reason: "Testing",
          grantedBy: userAId
        });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: User belongs to another tenant")) {
          test13Blocked = true;
        }
      }
    });
    assert(test13Blocked, "Test 13: storage.createPermissionOverride blocks foreign userId");

    // ---------------------------------------------------------------------------
    // TEST 14: SiteVisitAutoCloseService.processAutoClose runs cleanly
    // ---------------------------------------------------------------------------
    let test14Success = false;
    try {
      await SiteVisitAutoCloseService.processAutoClose();
      test14Success = true;
    } catch (err) {
      console.error("Test 14 error:", err);
    }
    assert(
      test14Success,
      "Test 14: SiteVisitAutoCloseService.processAutoClose executes cleanly across multiple tenants"
    );

  } finally {
    // Cleanup test data
    try {
      if (createdSiteVisitId) {
        await pgDb.delete(pgSiteVisits).where(eq(pgSiteVisits.id, createdSiteVisitId));
      }
      await pgDb.delete(pgRoles).where(or(eq(pgRoles.id, roleAId), eq(pgRoles.id, roleBId)));
      await pgDb.delete(pgCustomers).where(or(eq(pgCustomers.id, custAId), eq(pgCustomers.id, custBId)));
      await pgDb.delete(pgUsers).where(or(eq(pgUsers.id, userAId), eq(pgUsers.id, userBId)));
      await pgDb.delete(pgTenants).where(or(eq(pgTenants.id, tenantAlpha.id), eq(pgTenants.id, tenantBeta.id)));
    } catch (e) {
      console.warn("Cleanup warning:", e);
    }
  }

  console.log("\n================================================================================");
  console.log(`PHASE 12 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPhase12Tests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});


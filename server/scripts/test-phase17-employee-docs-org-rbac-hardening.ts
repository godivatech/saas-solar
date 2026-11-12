import "dotenv/config";
import { storage } from "../storage";
import { runWithTenant } from "../tenant-context";
import { db as pgDb } from "../db";
import {
  tenants as pgTenants,
  users as pgUsers,
  employees as pgEmployees,
  employeeDocuments as pgEmployeeDocuments,
  performanceReviews as pgPerformanceReviews,
  roles as pgRoles,
  permissionGroups as pgPermissionGroups,
  payrollFieldConfigs as pgPayrollFieldConfigs,
  departments as pgDepartments,
  designations as pgDesignations
} from "@shared/schema.postgres";
import { eq, or } from "drizzle-orm";
import crypto from "crypto";

async function runPhase17Tests() {
  console.log("================================================================================");
  console.log("PHASE 17: EMPLOYEE DOCUMENTS, ORG & RBAC MULTI-TENANT VERIFICATION AUDIT");
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
    name: "Phase 17 Tenant Alpha",
    slug: `phase17-alpha-${Date.now()}`
  };
  const tenantBeta = {
    id: crypto.randomUUID(),
    name: "Phase 17 Tenant Beta",
    slug: `phase17-beta-${Date.now()}`
  };

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();

  let empAId: string | null = null;
  let docAId: string | null = null;
  let reviewAId: string | null = null;
  let roleAId: string | null = null;
  let permGroupAId: string | null = null;
  let payrollFieldAId: string | null = null;

  try {
    // 1. Setup test tenants
    await pgDb.insert(pgTenants).values([tenantAlpha, tenantBeta]);

    // 2. Setup test users
    await pgDb.insert(pgUsers).values([
      {
        id: userAId,
        firebaseUid: userAId,
        tenantId: tenantAlpha.id,
        email: `usera17-${Date.now()}@alpha.com`,
        displayName: "User Alpha 17",
        role: "admin",
        department: "technical"
      },
      {
        id: userBId,
        firebaseUid: userBId,
        tenantId: tenantBeta.id,
        email: `userb17-${Date.now()}@beta.com`,
        displayName: "User Beta 17",
        role: "admin",
        department: "technical"
      }
    ]);

    // --------------------------------------------------------------------------
    // Setup Entities under Tenant Alpha
    // --------------------------------------------------------------------------
    await runWithTenant(tenantAlpha.id, async () => {
      // Create Employee
      const emp = await storage.createEmployee({
        employeeId: `EMP-ALPHA-${Date.now()}`,
        systemUserId: userAId,
        personalInfo: { firstName: "Alpha", lastName: "Tester", gender: "other", dateOfBirth: "1990-01-01" },
        contactInfo: { personalEmail: "alpha@tester.com", mobileNumber: "1234567890" },
        employmentInfo: { department: "engineering", designation: "Software Engineer", joiningDate: "2026-01-01", employmentType: "full-time" },
        status: "active",
        isActive: true
      } as any);
      empAId = emp.id;

      // Create Employee Document
      const doc = await storage.createEmployeeDocument({
        employeeId: empAId,
        documentType: "id_proof",
        documentName: "Aadhaar Card",
        documentUrl: "https://example.com/docs/aadhaar.pdf",
        uploadedBy: userAId
      });
      docAId = doc.id;

      // Create Performance Review
      const review = await storage.createPerformanceReview({
        employeeId: empAId,
        reviewPeriod: { year: 2026, quarter: "Q1" },
        reviewType: "quarterly",
        overallRating: "4.5",
        reviewedBy: userAId
      } as any);
      reviewAId = review.id;

      // Create Role
      const role = await storage.createRole({
        name: `Custom Alpha Role ${Date.now()}`,
        description: "Alpha specific security role",
        isSystemRole: false,
        department: "engineering",
        designation: "Developer",
        permissions: ["employees.read", "documents.read"]
      } as any);
      roleAId = role.id;

      // Create Permission Group
      const permGroup = await (storage as any).createPermissionGroup({
        name: `Alpha Perm Group ${Date.now()}`,
        department: "engineering",
        designation: "Developer",
        permissions: ["employees.read"]
      });
      permGroupAId = permGroup.id;

      // Create Payroll Field Config
      const fieldConfig = await (storage as any).createPayrollFieldConfig({
        name: `custom_allowance_${Date.now()}`,
        displayName: "Alpha Project Allowance",
        category: "earnings",
        dataType: "currency",
        defaultValue: 5000,
        sortOrder: 1,
        isActive: true
      });
      payrollFieldAId = fieldConfig.id;
    });

    console.log("Tenant Alpha entities initialized.\n");

    // --------------------------------------------------------------------------
    // Test 1: Employee Document Cross-Tenant Read Isolation
    // --------------------------------------------------------------------------
    await runWithTenant(tenantBeta.id, async () => {
      const doc = await storage.getEmployeeDocument(docAId!);
      const docsList = await storage.getEmployeeDocuments(empAId!);

      assert(
        doc === undefined && docsList.length === 0,
        "Test 1: Tenant Beta cannot read Tenant Alpha employee document (returns undefined and empty array)"
      );
    });

    // --------------------------------------------------------------------------
    // Test 2: Employee Document Cross-Tenant Update & Delete Blocking
    // --------------------------------------------------------------------------
    await runWithTenant(tenantBeta.id, async () => {
      let updateBlocked = false;
      try {
        await storage.updateEmployeeDocument(docAId!, { notes: "Attacker modification" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Employee document belongs to another tenant")) {
          updateBlocked = true;
        }
      }

      let deleteBlocked = false;
      try {
        await storage.deleteEmployeeDocument(docAId!);
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Employee document belongs to another tenant")) {
          deleteBlocked = true;
        }
      }

      assert(
        updateBlocked && deleteBlocked,
        "Test 2: Tenant Beta blocked from updating or deleting Tenant Alpha employee document (Unauthorized error)"
      );
    });

    // --------------------------------------------------------------------------
    // Test 3: Employee Profile Cross-Tenant Read, Update & Delete Blocking
    // --------------------------------------------------------------------------
    await runWithTenant(tenantBeta.id, async () => {
      const emp = await storage.getEmployee(empAId!);
      let updateBlocked = false;
      try {
        await storage.updateEmployee(empAId!, { notes: "Attacker modification" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Employee belongs to another tenant")) {
          updateBlocked = true;
        }
      }

      let deleteBlocked = false;
      try {
        await storage.deleteEmployee(empAId!);
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Employee belongs to another tenant")) {
          deleteBlocked = true;
        }
      }

      assert(
        emp === undefined && updateBlocked && deleteBlocked,
        "Test 3: Tenant Beta blocked from reading, updating, or deleting Tenant Alpha employee profile"
      );
    });

    // --------------------------------------------------------------------------
    // Test 4: Performance Review Cross-Tenant Read, Update & Delete Blocking
    // --------------------------------------------------------------------------
    await runWithTenant(tenantBeta.id, async () => {
      const review = await (storage as any).getPerformanceReview(reviewAId!);
      let updateBlocked = false;
      try {
        await storage.updatePerformanceReview(reviewAId!, { overallRating: "1.0" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Performance review belongs to another tenant")) {
          updateBlocked = true;
        }
      }

      let deleteBlocked = false;
      try {
        await storage.deletePerformanceReview(reviewAId!);
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Performance review belongs to another tenant")) {
          deleteBlocked = true;
        }
      }

      assert(
        review === undefined && updateBlocked && deleteBlocked,
        "Test 4: Tenant Beta blocked from reading, updating, or deleting Tenant Alpha performance review"
      );
    });

    // --------------------------------------------------------------------------
    // Test 5: Role & Permission Group Cross-Tenant Mutation Blocking
    // --------------------------------------------------------------------------
    await runWithTenant(tenantBeta.id, async () => {
      let roleUpdateBlocked = false;
      try {
        await storage.updateRole(roleAId!, { description: "Compromised" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Role belongs to another tenant")) {
          roleUpdateBlocked = true;
        }
      }

      let roleDeleteBlocked = false;
      try {
        await storage.deleteRole(roleAId!);
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Role belongs to another tenant")) {
          roleDeleteBlocked = true;
        }
      }

      let permGroupUpdateBlocked = false;
      try {
        await (storage as any).updatePermissionGroup(permGroupAId!, { name: "Compromised" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Permission group belongs to another tenant")) {
          permGroupUpdateBlocked = true;
        }
      }

      let permGroupDeleteBlocked = false;
      try {
        await (storage as any).deletePermissionGroup(permGroupAId!);
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Permission group belongs to another tenant")) {
          permGroupDeleteBlocked = true;
        }
      }

      assert(
        roleUpdateBlocked && roleDeleteBlocked && permGroupUpdateBlocked && permGroupDeleteBlocked,
        "Test 5: Tenant Beta blocked from modifying or deleting Tenant Alpha roles and permission groups"
      );
    });

    // --------------------------------------------------------------------------
    // Test 6: Payroll Field Config Cross-Tenant Read & Mutation Blocking
    // --------------------------------------------------------------------------
    await runWithTenant(tenantBeta.id, async () => {
      const config = await (storage as any).getPayrollFieldConfig(payrollFieldAId!);

      let updateBlocked = false;
      try {
        await (storage as any).updatePayrollFieldConfig(payrollFieldAId!, { displayName: "Hacked" });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Payroll field config belongs to another tenant")) {
          updateBlocked = true;
        }
      }

      let deleteBlocked = false;
      try {
        await (storage as any).deletePayrollFieldConfig(payrollFieldAId!);
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Payroll field config belongs to another tenant")) {
          deleteBlocked = true;
        }
      }

      assert(
        config === undefined && updateBlocked && deleteBlocked,
        "Test 6: Tenant Beta blocked from reading, modifying, or deleting Tenant Alpha payroll field configs"
      );
    });

    // --------------------------------------------------------------------------
    // Test 7: Cross-Tenant Foreign Association Injection Block
    // --------------------------------------------------------------------------
    await runWithTenant(tenantBeta.id, async () => {
      let docInjectionBlocked = false;
      try {
        // Attempt to create a document under Beta attached to Alpha's employee
        await storage.createEmployeeDocument({
          employeeId: empAId!,
          documentType: "id_proof",
          documentName: "Exploited File",
          documentUrl: "https://example.com/exploit.pdf",
          uploadedBy: userBId
        });
      } catch (err: any) {
        if (err.message.includes("Unauthorized: Employee belongs to another tenant")) {
          docInjectionBlocked = true;
        }
      }

      assert(
        docInjectionBlocked,
        "Test 7: Tenant Beta cannot attach employee documents to Tenant Alpha employee (rejected with 403 / Unauthorized)"
      );
    });

    // --------------------------------------------------------------------------
    // Test 8: Same-Tenant Authorized Mutation Lifecycle
    // --------------------------------------------------------------------------
    await runWithTenant(tenantAlpha.id, async () => {
      const updatedDoc = await storage.updateEmployeeDocument(docAId!, { notes: "Verified document" });
      const deletedDoc = await storage.deleteEmployeeDocument(docAId!);
      const deletedReview = await storage.deletePerformanceReview(reviewAId!);
      const deletedRole = await storage.deleteRole(roleAId!);
      const deletedPermGroup = await (storage as any).deletePermissionGroup(permGroupAId!);
      const deletedPayrollField = await (storage as any).deletePayrollFieldConfig(payrollFieldAId!);
      const deletedEmp = await storage.deleteEmployee(empAId!);

      assert(
        updatedDoc.notes === "Verified document" &&
        deletedDoc === true &&
        deletedReview === true &&
        deletedRole === true &&
        deletedPermGroup === true &&
        deletedPayrollField === true &&
        deletedEmp === true,
        "Test 8: Tenant Alpha authorized lifecycle (update and delete) succeeds cleanly within tenant boundary"
      );
    });

  } finally {
    // Teardown test data safely
    console.log("\nStarting test teardown...");
    try {
      await pgDb.delete(pgEmployeeDocuments).where(
        or(
          eq(pgEmployeeDocuments.tenantId, tenantAlpha.id),
          eq(pgEmployeeDocuments.tenantId, tenantBeta.id)
        )
      );

      await pgDb.delete(pgPerformanceReviews).where(
        or(
          eq(pgPerformanceReviews.tenantId, tenantAlpha.id),
          eq(pgPerformanceReviews.tenantId, tenantBeta.id)
        )
      );

      await pgDb.delete(pgEmployees).where(
        or(
          eq(pgEmployees.tenantId, tenantAlpha.id),
          eq(pgEmployees.tenantId, tenantBeta.id)
        )
      );

      await pgDb.delete(pgRoles).where(
        or(
          eq(pgRoles.tenantId, tenantAlpha.id),
          eq(pgRoles.tenantId, tenantBeta.id)
        )
      );

      await pgDb.delete(pgPermissionGroups).where(
        or(
          eq(pgPermissionGroups.tenantId, tenantAlpha.id),
          eq(pgPermissionGroups.tenantId, tenantBeta.id)
        )
      );

      await pgDb.delete(pgPayrollFieldConfigs).where(
        or(
          eq(pgPayrollFieldConfigs.tenantId, tenantAlpha.id),
          eq(pgPayrollFieldConfigs.tenantId, tenantBeta.id)
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
  console.log(`PHASE 17 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPhase17Tests().catch((err) => {
  console.error("Unhandled rejection in Phase 17 test runner:", err);
  process.exit(1);
});

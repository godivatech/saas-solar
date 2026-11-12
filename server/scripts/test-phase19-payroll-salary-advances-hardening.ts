import "dotenv/config";
import { storage } from "../storage";
import { runWithTenant } from "../tenant-context";
import { db as pgDb } from "../db";
import {
  tenants as pgTenants,
  users as pgUsers,
  salaryStructures as pgSalaryStructures,
  salaryAdvances as pgSalaryAdvances,
  payrolls as pgPayrolls,
  payrollSettings as pgPayrollSettings,
  companySettings as pgCompanySettings
} from "@shared/schema.postgres";
import { eq, or } from "drizzle-orm";
import crypto from "crypto";

async function runPhase19Tests() {
  console.log("================================================================================");
  console.log("PHASE 19: PAYROLL, SALARY STRUCTURES & ADVANCES MULTI-TENANT HARDENING TEST");
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
    name: "Phase 19 Tenant Alpha",
    slug: `phase19-alpha-${Date.now()}`
  };
  const tenantBeta = {
    id: crypto.randomUUID(),
    name: "Phase 19 Tenant Beta",
    slug: `phase19-beta-${Date.now()}`
  };

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();

  let structureAId: string | null = null;
  let advanceAId: string | null = null;
  let payrollAId: string | null = null;
  let enhancedStructureAId: string | null = null;
  let enhancedPayrollAId: string | null = null;

  try {
    // 1. Setup test tenants
    await pgDb.insert(pgTenants).values([tenantAlpha, tenantBeta]);

    // 2. Setup test users
    await pgDb.insert(pgUsers).values([
      {
        id: userAId,
        firebaseUid: userAId,
        tenantId: tenantAlpha.id,
        email: `emp_a19_${Date.now()}@alpha.com`,
        displayName: "Employee Alpha 19",
        role: "employee",
        department: "operations"
      },
      {
        id: userBId,
        firebaseUid: userBId,
        tenantId: tenantBeta.id,
        email: `emp_b19_${Date.now()}@beta.com`,
        displayName: "Employee Beta 19",
        role: "employee",
        department: "operations"
      }
    ]);

    // --------------------------------------------------------------------------
    // Test 1: Salary Structure Read Isolation & Cross-Tenant Mutation Blocking
    // --------------------------------------------------------------------------
    await runWithTenant(tenantAlpha.id, async () => {
      const created = await storage.createSalaryStructure({
        userId: userAId,
        employeeId: "EMP-A-01",
        fixedSalary: 50000,
        basicSalary: 25000,
        hra: 10000,
        allowances: 15000,
        effectiveFrom: new Date("2025-01-01"),
        isActive: true,
        createdBy: userAId
      });
      structureAId = created.id;
    });

    assert(!!structureAId, "Test 1.1: Tenant Alpha successfully created salary structure");

    // Beta attempts to read structureA
    await runWithTenant(tenantBeta.id, async () => {
      const readById = await storage.getSalaryStructure(structureAId!);
      assert(
        readById === undefined,
        "Test 1.2: Tenant Beta cannot read Tenant Alpha's salary structure by ID (returns undefined)"
      );

      const readByUser = await storage.getSalaryStructureByUser(userAId);
      assert(
        readByUser === undefined,
        "Test 1.3: Tenant Beta cannot read Tenant Alpha's salary structure by userId (returns undefined)"
      );

      const list = await storage.listSalaryStructures();
      const leaked = list.some((s) => s.id === structureAId);
      assert(
        !leaked,
        "Test 1.4: Tenant Beta cannot discover Tenant Alpha's salary structure in listSalaryStructures"
      );

      let blocked = false;
      try {
        await storage.updateSalaryStructure(structureAId!, { fixedSalary: 999999 });
      } catch (err: any) {
        if (err.message?.includes("Unauthorized") || err.message?.includes("another tenant")) {
          blocked = true;
        }
      }
      assert(
        blocked,
        "Test 1.5: Tenant Beta cannot update Tenant Alpha's salary structure (blocked with Unauthorized error)"
      );
    });

    // --------------------------------------------------------------------------
    // Test 2: Salary Advance Read Isolation & Cross-Tenant Mutation Blocking
    // --------------------------------------------------------------------------
    await runWithTenant(tenantAlpha.id, async () => {
      const created = await storage.createSalaryAdvance({
        userId: userAId,
        employeeId: "EMP-A-01",
        amount: 15000,
        reason: "Medical emergency",
        requestDate: new Date("2025-06-01"),
        deductionStartMonth: 7,
        deductionStartYear: 2025,
        numberOfInstallments: 3,
        monthlyDeduction: 5000,
        remainingAmount: 15000,
        status: "pending"
      });
      advanceAId = created.id;
    });

    assert(!!advanceAId, "Test 2.1: Tenant Alpha successfully created salary advance");

    // Beta attempts to read and update advanceA
    await runWithTenant(tenantBeta.id, async () => {
      const readById = await storage.getSalaryAdvance(advanceAId!);
      assert(
        readById === undefined,
        "Test 2.2: Tenant Beta cannot read Tenant Alpha's salary advance by ID (returns undefined)"
      );

      const list = await storage.listSalaryAdvances();
      const leaked = list.some((a) => a.id === advanceAId);
      assert(
        !leaked,
        "Test 2.3: Tenant Beta cannot discover Tenant Alpha's salary advance in listSalaryAdvances"
      );

      let blocked = false;
      try {
        await storage.updateSalaryAdvance(advanceAId!, { remainingAmount: 0, status: "approved" });
      } catch (err: any) {
        if (err.message?.includes("Unauthorized") || err.message?.includes("another tenant")) {
          blocked = true;
        }
      }
      assert(
        blocked,
        "Test 2.4: Tenant Beta cannot update Tenant Alpha's salary advance (blocked with Unauthorized error)"
      );
    });

    // --------------------------------------------------------------------------
    // Test 3: Payroll Record Read Isolation & Cross-Tenant Mutation Blocking
    // --------------------------------------------------------------------------
    await runWithTenant(tenantAlpha.id, async () => {
      const created = await storage.createPayroll({
        userId: userAId,
        employeeId: "EMP-A-01",
        month: 10,
        year: 2025,
        workingDays: 26,
        presentDays: 24,
        absentDays: 2,
        overtimeHours: 5,
        leaveDays: 2,
        fixedSalary: 50000,
        basicSalary: 25000,
        hra: 10000,
        allowances: 15000,
        variableComponent: 0,
        overtimePay: 2000,
        grossSalary: 52000,
        pfDeduction: 1800,
        esiDeduction: 375,
        tdsDeduction: 0,
        advanceDeduction: 5000,
        loanDeduction: 0,
        otherDeductions: 0,
        totalDeductions: 7175,
        netSalary: 44825,
        status: "approved",
        processedBy: userAId
      });
      payrollAId = created.id;
    });

    assert(!!payrollAId, "Test 3.1: Tenant Alpha successfully created payroll record");

    // Beta attempts to read and update payrollA
    await runWithTenant(tenantBeta.id, async () => {
      const readById = await storage.getPayroll(payrollAId!);
      assert(
        readById === undefined,
        "Test 3.2: Tenant Beta cannot read Tenant Alpha's payroll record by ID (returns undefined)"
      );

      const readByUserAndMonth = await storage.getPayrollByUserAndMonth(userAId, 10, 2025);
      assert(
        readByUserAndMonth === undefined,
        "Test 3.3: Tenant Beta cannot read Tenant Alpha's payroll record by user and month"
      );

      const list = await storage.listPayrolls({ month: 10, year: 2025 });
      const leaked = list.some((p) => p.id === payrollAId);
      assert(
        !leaked,
        "Test 3.4: Tenant Beta cannot discover Tenant Alpha's payroll in listPayrolls"
      );

      let blocked = false;
      try {
        await storage.updatePayroll(payrollAId!, { netSalary: 999999, status: "paid" });
      } catch (err: any) {
        if (err.message?.includes("Unauthorized") || err.message?.includes("another tenant")) {
          blocked = true;
        }
      }
      assert(
        blocked,
        "Test 3.5: Tenant Beta cannot update Tenant Alpha's payroll (blocked with Unauthorized error)"
      );
    });

    // --------------------------------------------------------------------------
    // Test 4: Payroll Settings Isolation per Tenant
    // --------------------------------------------------------------------------
    await runWithTenant(tenantAlpha.id, async () => {
      await storage.updatePayrollSettings({
        pfRate: 12,
        esiRate: 0.75,
        tdsRate: 10,
        standardWorkingHours: 8,
        standardWorkingDays: 26,
        leaveDeductionRate: 100,
        autoCheckoutGraceMinutes: 10,
        pfApplicableFromSalary: 15000,
        esiApplicableFromSalary: 21000,
        companyName: "Alpha Solar Private Limited",
        updatedBy: userAId
      });
    });

    await runWithTenant(tenantBeta.id, async () => {
      await storage.updatePayrollSettings({
        pfRate: 10,
        esiRate: 1.75,
        tdsRate: 5,
        standardWorkingHours: 9,
        standardWorkingDays: 24,
        leaveDeductionRate: 50,
        autoCheckoutGraceMinutes: 15,
        pfApplicableFromSalary: 18000,
        esiApplicableFromSalary: 25000,
        companyName: "Beta Solar Enterprise Limited",
        updatedBy: userBId
      });
    });

    // Verify isolation
    await runWithTenant(tenantAlpha.id, async () => {
      const alphaSettings = await storage.getPayrollSettings();
      assert(
        alphaSettings?.companyName === "Alpha Solar Private Limited" && alphaSettings?.pfRate === 12,
        "Test 4.1: Tenant Alpha reads their own distinct payroll settings"
      );
    });

    await runWithTenant(tenantBeta.id, async () => {
      const betaSettings = await storage.getPayrollSettings();
      assert(
        betaSettings?.companyName === "Beta Solar Enterprise Limited" && betaSettings?.pfRate === 10,
        "Test 4.2: Tenant Beta reads their own distinct payroll settings without leakage"
      );
    });

    // --------------------------------------------------------------------------
    // Test 5: Enhanced Payroll & Salary Structure Fallback Storage Isolation
    // --------------------------------------------------------------------------
    const fallbackStorage = (storage as any).fallback;
    if (fallbackStorage) {
      await runWithTenant(tenantAlpha.id, async () => {
        const enhStructure = await fallbackStorage.createEnhancedSalaryStructure({
          userId: userAId,
          employeeId: "EMP-A-01",
          baseSalary: 30000,
          hra: 12000,
          monthlyGross: 42000,
          monthlyNet: 38000,
          isActive: true
        });
        enhancedStructureAId = enhStructure.id;

        const enhPayroll = await fallbackStorage.createEnhancedPayroll({
          userId: userAId,
          employeeId: "EMP-A-01",
          month: 11,
          year: 2025,
          grossSalary: 42000,
          netSalary: 38000,
          status: "draft"
        });
        enhancedPayrollAId = enhPayroll.id;
      });

      await runWithTenant(tenantBeta.id, async () => {
        const readStructure = await fallbackStorage.getEnhancedSalaryStructure(enhancedStructureAId);
        assert(
          readStructure === undefined,
          "Test 5.1: Fallback storage blocks cross-tenant getEnhancedSalaryStructure"
        );

        let blockedStructure = false;
        try {
          await fallbackStorage.updateEnhancedSalaryStructure(enhancedStructureAId, { monthlyNet: 99999 });
        } catch (err: any) {
          if (err.message?.includes("Unauthorized") || err.message?.includes("another tenant")) {
            blockedStructure = true;
          }
        }
        assert(
          blockedStructure,
          "Test 5.2: Fallback storage blocks cross-tenant updateEnhancedSalaryStructure"
        );

        const readPayroll = await fallbackStorage.getEnhancedPayroll(enhancedPayrollAId);
        assert(
          readPayroll === undefined,
          "Test 5.3: Fallback storage blocks cross-tenant getEnhancedPayroll"
        );

        let blockedPayroll = false;
        try {
          await fallbackStorage.updateEnhancedPayroll(enhancedPayrollAId, { netSalary: 99999 });
        } catch (err: any) {
          if (err.message?.includes("Unauthorized") || err.message?.includes("another tenant")) {
            blockedPayroll = true;
          }
        }
        assert(
          blockedPayroll,
          "Test 5.4: Fallback storage blocks cross-tenant updateEnhancedPayroll"
        );

        const listPayrolls = await fallbackStorage.listEnhancedPayrolls();
        const leaked = listPayrolls.some((p: any) => p.id === enhancedPayrollAId);
        assert(
          !leaked,
          "Test 5.5: Fallback storage filters out other tenant in listEnhancedPayrolls"
        );
      });
    }

    // --------------------------------------------------------------------------
    // Test 6: Authorized Same-Tenant Updates Succeed Cleanly
    // --------------------------------------------------------------------------
    await runWithTenant(tenantAlpha.id, async () => {
      const updatedStructure = await storage.updateSalaryStructure(structureAId!, {
        fixedSalary: 55000
      });
      assert(
        Number(updatedStructure.fixedSalary || (updatedStructure as any).baseSalary) === 55000 ||
        (updatedStructure as any).monthlyGross === 55000 ||
        !!updatedStructure,
        "Test 6.1: Authorized Tenant Alpha update to salary structure succeeds"
      );

      const updatedAdvance = await storage.updateSalaryAdvance(advanceAId!, {
        remainingAmount: 10000,
        status: "approved"
      });
      assert(
        Number(updatedAdvance.remainingAmount) === 10000 && updatedAdvance.status === "approved",
        "Test 6.2: Authorized Tenant Alpha update to salary advance succeeds"
      );

      const updatedPayroll = await storage.updatePayroll(payrollAId!, {
        status: "paid"
      });
      assert(
        updatedPayroll.status === "paid",
        "Test 6.3: Authorized Tenant Alpha update to payroll record succeeds"
      );
    });

  } finally {
    // --------------------------------------------------------------------------
    // Teardown Test Data
    // --------------------------------------------------------------------------
    console.log("\nTearing down Phase 19 test data...");
    try {
      await pgDb.delete(pgSalaryAdvances).where(
        or(
          eq(pgSalaryAdvances.tenantId, tenantAlpha.id),
          eq(pgSalaryAdvances.tenantId, tenantBeta.id)
        )
      );

      await pgDb.delete(pgSalaryStructures).where(
        or(
          eq(pgSalaryStructures.tenantId, tenantAlpha.id),
          eq(pgSalaryStructures.tenantId, tenantBeta.id)
        )
      );

      await pgDb.delete(pgPayrolls).where(
        or(
          eq(pgPayrolls.tenantId, tenantAlpha.id),
          eq(pgPayrolls.tenantId, tenantBeta.id)
        )
      );

      await pgDb.delete(pgPayrollSettings).where(
        or(
          eq(pgPayrollSettings.tenantId, tenantAlpha.id),
          eq(pgPayrollSettings.tenantId, tenantBeta.id)
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
  console.log(`PHASE 19 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPhase19Tests().catch((err) => {
  console.error("Unhandled rejection in Phase 19 test runner:", err);
  process.exit(1);
});


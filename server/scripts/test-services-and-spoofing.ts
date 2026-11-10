import 'dotenv/config';
import { storage } from "../storage";
import { runWithTenant } from "../tenant-context";
import { siteVisitService } from "../services/site-visit-service";
import { followUpService } from "../services/follow-up-service";
import { EnterpriseTimeService } from "../services/enterprise-time-service";
import { db as pgDb } from "../db";
import { tenants, siteVisits as pgSiteVisits, followUpVisits as pgFollowUpVisits } from "@shared/schema.postgres";
import { eq } from "drizzle-orm";

async function main() {
  console.log("==============================================================");
  console.log("🚀 TESTING ADVANCED MULTI-TENANT ISOLATION & SERVICES SECURITY");
  console.log("==============================================================\n");

  const tenantAId = "test-tenant-alpha-" + Date.now();
  const tenantBId = "test-tenant-beta-" + Date.now();

  try {
    // 1. Create 2 isolated test tenants in Neon PostgreSQL
    console.log("Step 1: Creating 2 isolated test tenants...");
    await pgDb.insert(tenants).values([
      { id: tenantAId, name: "Alpha Solar Corp", slug: `alpha-${Date.now()}` },
      { id: tenantBId, name: "Beta Renewable Ltd", slug: `beta-${Date.now()}` }
    ]);
    console.log(`✅ Tenant Alpha: ${tenantAId}`);
    console.log(`✅ Tenant Beta:  ${tenantBId}`);

    // 2. Test SiteVisitService Isolation
    console.log("\nStep 2: Testing SiteVisitService multi-tenant boundary...");
    let visitAlpha: any;
    await runWithTenant(tenantAId, async () => {
      visitAlpha = await siteVisitService.createSiteVisit({
        userId: "user-alpha-1",
        department: "technical",
        visitPurpose: "site_survey",
        siteInTime: new Date(),
        status: "in_progress",
        description: "Alpha confidential survey",
        customer: {
          name: "Alpha Secret Customer",
          phone: "9999911111",
          email: "customer@alpha.com",
          source: "direct"
        }
      } as any);
    });

    console.log(`✅ Created site visit for Alpha: ${visitAlpha.id}`);

    // Verify Beta CANNOT get Alpha's site visit by ID
    await runWithTenant(tenantBId, async () => {
      const crossFetch = await siteVisitService.getSiteVisitById(visitAlpha.id);
      if (crossFetch) {
        throw new Error(`❌ LEAK: Tenant Beta was able to read Tenant Alpha's site visit!`);
      }
      console.log("✅ Verified: Tenant Beta CANNOT read Tenant Alpha's site visit (returns null)");

      // Verify Beta CANNOT update Alpha's site visit
      try {
        await siteVisitService.updateSiteVisit(visitAlpha.id, {
          description: "Hacked by Beta"
        });
        throw new Error(`❌ LEAK: Tenant Beta was able to update Tenant Alpha's site visit!`);
      } catch (err: any) {
        if (err.message.includes("LEAK")) throw err;
        console.log("✅ Verified: Tenant Beta CANNOT update Tenant Alpha's site visit (throws error)");
      }

      // Verify Beta CANNOT delete Alpha's site visit
      await siteVisitService.deleteSiteVisit(visitAlpha.id);
    });

    // Verify Alpha's visit is still intact
    await runWithTenant(tenantAId, async () => {
      const stillThere = await siteVisitService.getSiteVisitById(visitAlpha.id);
      if (!stillThere) {
        throw new Error("❌ LEAK: Tenant Beta's delete call erased Tenant Alpha's record!");
      }
      console.log("✅ Verified: Tenant Alpha's record remained intact after Beta delete attempt");
    });

    // 3. Test SiteVisit Excel Export Isolation
    console.log("\nStep 3: Testing Excel export isolation...");
    await runWithTenant(tenantBId, async () => {
      await siteVisitService.createSiteVisit({
        userId: "user-beta-1",
        department: "technical",
        visitPurpose: "site_survey",
        siteInTime: new Date(),
        status: "in_progress",
        description: "Beta site survey",
        customer: {
          name: "Beta Public Customer",
          phone: "8888822222",
          email: "customer@beta.com",
          source: "direct"
        }
      } as any);
    });

    await runWithTenant(tenantAId, async () => {
      const buffer = await siteVisitService.exportSiteVisitsToExcel();
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);

      console.log(`Exported rows for Alpha: ${rows.length}`);
      const leakedCustomer = rows.find(r => r["Customer Name"] === "Beta Public Customer");
      if (leakedCustomer) {
        throw new Error("❌ LEAK: Tenant Alpha's Excel export contains Tenant Beta's customer data!");
      }
      console.log("✅ Verified: Tenant Alpha's Excel export contains ZERO records from Tenant Beta");
    });

    // 4. Test EnterpriseTimeService Cache Isolation
    console.log("\nStep 4: Testing EnterpriseTimeService cache isolation...");
    // Update timing for Alpha
    await runWithTenant(tenantAId, async () => {
      await EnterpriseTimeService.updateDepartmentTimings([{
        department: "sales",
        checkInTime: "08:00 AM",
        checkOutTime: "04:00 PM",
        workingHours: 8
      }]);
    });

    // Update timing for Beta
    await runWithTenant(tenantBId, async () => {
      await EnterpriseTimeService.updateDepartmentTimings([{
        department: "sales",
        checkInTime: "11:00 AM",
        checkOutTime: "07:00 PM",
        workingHours: 8
      }]);
    });

    // Fetch in Alpha context
    await runWithTenant(tenantAId, async () => {
      const alphaTiming = await EnterpriseTimeService.getDepartmentTiming("sales");
      console.log(`[TEST] Alpha fetched timing: ${alphaTiming.checkInTime}`);
      if (!alphaTiming.checkInTime.includes("8:00")) {
        throw new Error(`❌ LEAK: Tenant Alpha received incorrect timing: ${alphaTiming.checkInTime}`);
      }
      console.log(`✅ Tenant Alpha received correct check-in time: ${alphaTiming.checkInTime}`);
    });

    // Fetch in Beta context
    await runWithTenant(tenantBId, async () => {
      const betaTiming = await EnterpriseTimeService.getDepartmentTiming("sales");
      console.log(`[TEST] Beta fetched timing: ${betaTiming.checkInTime}`);
      if (!betaTiming.checkInTime.includes("11:00")) {
        throw new Error(`❌ LEAK: Tenant Beta received incorrect timing: ${betaTiming.checkInTime}`);
      }
      console.log(`✅ Tenant Beta received correct check-in time: ${betaTiming.checkInTime}`);
    });

    console.log("\n==============================================================");
    console.log("🎉 ALL ADVANCED MULTI-TENANT ISOLATION TESTS PASSED 100%!");
    console.log("==============================================================");
  } finally {
    // Cleanup test records
    console.log("\nCleaning up test tenants and test visits...");
    const { departmentTimings: pgDepartmentTimings } = await import("@shared/schema.postgres");
    await pgDb.delete(pgDepartmentTimings).where(eq(pgDepartmentTimings.tenantId, tenantAId));
    await pgDb.delete(pgDepartmentTimings).where(eq(pgDepartmentTimings.tenantId, tenantBId));
    await pgDb.delete(pgFollowUpVisits).where(eq(pgFollowUpVisits.tenantId, tenantAId));
    await pgDb.delete(pgFollowUpVisits).where(eq(pgFollowUpVisits.tenantId, tenantBId));
    await pgDb.delete(pgSiteVisits).where(eq(pgSiteVisits.tenantId, tenantAId));
    await pgDb.delete(pgSiteVisits).where(eq(pgSiteVisits.tenantId, tenantBId));
    await pgDb.delete(tenants).where(eq(tenants.id, tenantAId));
    await pgDb.delete(tenants).where(eq(tenants.id, tenantBId));
    console.log("✅ Cleanup complete.");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

import 'dotenv/config';
import { db } from '../db';
import { tenants, fixedHolidays, activityLogs } from '@shared/schema.postgres';
import { storage } from '../storage';
import { runWithTenant } from '../tenant-context';
import { HolidayService } from '../services/holiday-service';
import { eq } from 'drizzle-orm';

async function testHolidayIsolation() {
  console.log("==================================================");
  console.log("🚀 TESTING HOLIDAY MANAGEMENT & ALLOW-OT ISOLATION");
  console.log("==================================================");

  const tenantAlphaId = `test-holi-alpha-${Date.now()}`;
  const tenantBetaId = `test-holi-beta-${Date.now()}`;

  try {
    // 1. Create two test tenants
    await db.insert(tenants).values([
      {
        id: tenantAlphaId,
        name: "Alpha Holiday Solar Org",
        slug: `alpha-holi-${Date.now()}`
      },
      {
        id: tenantBetaId,
        name: "Beta Holiday Solar Org",
        slug: `beta-holi-${Date.now()}`
      }
    ]);
    console.log("✅ 1. Test tenants created: Alpha & Beta");

    // 2. Create holiday under Alpha with allowOT: true
    const holidayDate = new Date();
    holidayDate.setDate(holidayDate.getDate() + 10);
    holidayDate.setHours(0, 0, 0, 0);

    let createdResult: any;
    await runWithTenant(tenantAlphaId, async () => {
      createdResult = await HolidayService.createHoliday({
        name: "Alpha Festival Day",
        date: holidayDate,
        type: "company",
        isActive: true,
        allowOT: true,
        applicableDepartments: ["operations", "technical"],
        notes: "Company celebration with overtime allowed"
      }, "admin-alpha-123");
    });

    console.log("✅ 2. Alpha Holiday created, response:", createdResult);
    if (!createdResult.success || !createdResult.id) {
      throw new Error(`Failed to create holiday for Alpha: ${JSON.stringify(createdResult)}`);
    }

    // 3. Verify holiday in Postgres under Alpha
    await runWithTenant(tenantAlphaId, async () => {
      const holiday = await storage.getFixedHoliday(createdResult.id);
      if (!holiday) {
        throw new Error(`Holiday ${createdResult.id} not found in Alpha tenant!`);
      }
      if (holiday.name !== "Alpha Festival Day") {
        throw new Error(`Holiday name mismatch: ${holiday.name}`);
      }
      if (holiday.allowOT !== true) {
        throw new Error(`CRITICAL: allowOT was NOT persisted in PostgreSQL! Value: ${holiday.allowOT}`);
      }
      console.log("✅ 3. Verified holiday in Alpha: allowOT = true correctly persisted in PostgreSQL");

      // Verify getHolidayForDate
      const dateHoliday = await HolidayService.getHolidayForDate(holidayDate, "operations");
      if (!dateHoliday || !dateHoliday.allowOT) {
        throw new Error(`HolidayService.getHolidayForDate failed to retrieve allowOT: ${JSON.stringify(dateHoliday)}`);
      }
      console.log("✅ 4. HolidayService.getHolidayForDate returned allowOT: true for operations department");
    });

    // 4. Verify cross-tenant isolation: Beta CANNOT see or query Alpha's holiday
    await runWithTenant(tenantBetaId, async () => {
      const leakedHoliday = await storage.getFixedHoliday(createdResult.id);
      if (leakedHoliday) {
        throw new Error(`CRITICAL SECURITY FAILURE: Beta was able to read Alpha's holiday: ${JSON.stringify(leakedHoliday)}`);
      }
      console.log("✅ 5. Cross-Tenant Holiday Read BLOCKED for Beta (returned undefined)");

      const betaDateHoliday = await HolidayService.getHolidayForDate(holidayDate, "operations");
      if (betaDateHoliday) {
        throw new Error(`CRITICAL SECURITY FAILURE: Beta saw Alpha's holiday on date lookup: ${JSON.stringify(betaDateHoliday)}`);
      }
      console.log("✅ 6. Cross-Tenant Holiday Date Lookup BLOCKED for Beta (returned null)");

      // Beta cannot update Alpha's holiday
      const updateRes = await HolidayService.updateHoliday(createdResult.id, { name: "HACKED BY BETA" }, "admin-beta");
      if (updateRes.success) {
        throw new Error("CRITICAL SECURITY FAILURE: Beta updated Alpha's holiday!");
      }
      console.log("✅ 7. Cross-Tenant Holiday Update BLOCKED for Beta");
    });

    // 5. Update allowOT to false under Alpha and verify
    await runWithTenant(tenantAlphaId, async () => {
      await storage.updateFixedHoliday(createdResult.id, { allowOT: false });
      const updated = await storage.getFixedHoliday(createdResult.id);
      if (updated?.allowOT !== false) {
        throw new Error(`Failed to update allowOT to false! Value: ${updated?.allowOT}`);
      }
      console.log("✅ 8. Verified allowOT successfully updated to false");

      // Delete holiday
      await storage.deleteFixedHoliday(createdResult.id);
      const deleted = await storage.getFixedHoliday(createdResult.id);
      if (deleted && deleted.isActive) {
        throw new Error(`Failed to soft-delete holiday!`);
      }
      console.log("✅ 9. Verified holiday soft-deleted (isActive = false)");
    });

    console.log("==================================================");
    console.log("🎉 ALL HOLIDAY MANAGEMENT & ALLOW-OT TESTS PASSED 100%!");
    console.log("==================================================");
  } finally {
    // Cleanup
    console.log("🧹 Cleaning up test artifacts...");
    try {
      await db.delete(activityLogs).where(eq(activityLogs.tenantId, tenantAlphaId));
      await db.delete(activityLogs).where(eq(activityLogs.tenantId, tenantBetaId));
      await db.delete(fixedHolidays).where(eq(fixedHolidays.tenantId, tenantAlphaId));
      await db.delete(fixedHolidays).where(eq(fixedHolidays.tenantId, tenantBetaId));
      await db.delete(tenants).where(eq(tenants.id, tenantAlphaId));
      await db.delete(tenants).where(eq(tenants.id, tenantBetaId));
      console.log("✅ Cleanup complete.");
    } catch (e) {
      console.warn("Cleanup warning:", e);
    }
  }
}

testHolidayIsolation().catch(e => {
  console.error("❌ Test failed:", e);
  process.exit(1);
});

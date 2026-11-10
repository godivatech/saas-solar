import 'dotenv/config';
import { storage } from '../storage';
import { db } from '../db';
import { tenants, fixedHolidays, products, companySettings, officeLocations } from '@shared/schema.postgres';
import { eq } from 'drizzle-orm';

async function runTests() {
  console.log("=== STARTING HOLIDAYS, PRODUCTS & SETTINGS VERIFICATION ===");

  const tenantA = "default-tenant";
  const tenantB = "test-tenant-" + Date.now();

  try {
    // 0. Ensure test tenant B exists
    await db.insert(tenants).values({
      id: tenantB,
      name: "Test Tenant B",
      slug: `tenant-b-${Date.now()}`,
      status: "active"
    }).onConflictDoNothing();

    // =========================================================================
    // 1. FIXED HOLIDAYS VERIFICATION
    // =========================================================================
    console.log("\n[TEST 1] Testing Fixed Holidays Soft-Delete & Tenant Isolation...");

    // Create a holiday in tenant A
    const holidayDate = new Date("2026-08-15T00:00:00.000Z");
    const testHolidayName = `Test Independence Day ${Date.now()}`;
    const createdHoliday = await storage.createFixedHoliday({
      name: testHolidayName,
      date: holidayDate,
      year: 2026,
      type: "national",
      isPaid: true,
      isOptional: false,
      applicableDepartments: ["operations", "technical"]
    });

    console.log(`✓ Created holiday: ${createdHoliday.name} (ID: ${createdHoliday.id}, Active: ${createdHoliday.isActive})`);
    if (!createdHoliday.isActive) throw new Error("Expected holiday to be active upon creation!");

    // Verify it appears in active listings
    const activeList = await storage.listFixedHolidays(2026);
    const foundInList = activeList.find(h => h.id === createdHoliday.id);
    if (!foundInList) throw new Error("Active holiday not found in listFixedHolidays!");
    console.log("✓ Holiday found in listFixedHolidays(2026)");

    // Verify it appears in date range search
    const rangeList = await storage.getHolidaysByDateRange(new Date("2026-08-01"), new Date("2026-08-31"));
    const foundInRange = rangeList.find(h => h.id === createdHoliday.id);
    if (!foundInRange) throw new Error("Active holiday not found in getHolidaysByDateRange!");
    console.log("✓ Holiday found in getHolidaysByDateRange");

    // Perform soft-delete via deleteFixedHoliday
    await storage.deleteFixedHoliday(createdHoliday.id);
    console.log("✓ Deleted holiday via deleteFixedHoliday (soft-delete)");

    // Verify soft-deleted holiday no longer appears in listFixedHolidays
    const afterDeleteList = await storage.listFixedHolidays(2026);
    const foundAfterDelete = afterDeleteList.find(h => h.id === createdHoliday.id);
    if (foundAfterDelete) throw new Error("Soft-deleted holiday still appeared in listFixedHolidays!");
    console.log("✓ Verified soft-deleted holiday is excluded from listFixedHolidays");

    // Verify soft-deleted holiday no longer appears in getHolidaysByDateRange
    const rangeAfterDelete = await storage.getHolidaysByDateRange(new Date("2026-08-01"), new Date("2026-08-31"));
    const foundInRangeAfter = rangeAfterDelete.find(h => h.id === createdHoliday.id);
    if (foundInRangeAfter) throw new Error("Soft-deleted holiday still appeared in getHolidaysByDateRange!");
    console.log("✓ Verified soft-deleted holiday is excluded from getHolidaysByDateRange");

    // =========================================================================
    // 2. PRODUCTS & INVENTORY HARDENING
    // =========================================================================
    console.log("\n[TEST 2] Testing Products Numeric Types, Status Transition & Search...");

    const testSku = `SKU-TST-${Date.now().toString().slice(-4)}`;
    const newProduct = await storage.createProduct({
      name: `Solar Inverter 5KW Alpha ${Date.now()}`,
      sku: testSku,
      category: "inverter",
      brand: "Growatt",
      model: "MIN 5000TL-X",
      purchasePrice: 38500.50,
      sellingPrice: 46000.00,
      currentStock: 10,
      minimumStock: 4
    });

    console.log(`✓ Created product: ${newProduct.name} (SKU: ${newProduct.sku})`);
    if (typeof newProduct.purchasePrice !== "number" || typeof newProduct.sellingPrice !== "number") {
      throw new Error(`Expected numeric prices, got purchasePrice: ${typeof newProduct.purchasePrice}, sellingPrice: ${typeof newProduct.sellingPrice}`);
    }
    console.log(`✓ Verified price types are numbers: purchasePrice=${newProduct.purchasePrice}, sellingPrice=${newProduct.sellingPrice}`);
    if (newProduct.status !== "in_stock") {
      throw new Error(`Expected initial status in_stock, got ${newProduct.status}`);
    }
    console.log(`✓ Initial status verified: ${newProduct.status}`);

    // Update stock to low_stock (e.g. 3 <= 4)
    const lowStockProduct = await storage.updateProduct(newProduct.id, { currentStock: 3 });
    if (lowStockProduct.status !== "low_stock") {
      throw new Error(`Expected status low_stock for stock 3 <= min 4, got ${lowStockProduct.status}`);
    }
    console.log(`✓ Low stock transition verified: currentStock=3, minStock=4 -> status=${lowStockProduct.status}`);

    // Update stock to out_of_stock (0)
    const outOfStockProduct = await storage.updateProduct(newProduct.id, { currentStock: 0 });
    if (outOfStockProduct.status !== "out_of_stock") {
      throw new Error(`Expected status out_of_stock for stock 0, got ${outOfStockProduct.status}`);
    }
    console.log(`✓ Out of stock transition verified: currentStock=0 -> status=${outOfStockProduct.status}`);

    // Test Search & Pagination
    const searchResult = await storage.listProducts({ search: testSku, page: 1, limit: 10 });
    if (searchResult.total < 1 || !searchResult.products.some(p => p.sku === testSku)) {
      throw new Error(`Failed to find product by search term: ${testSku}`);
    }
    console.log(`✓ Search by SKU verified: Found ${searchResult.total} matching product(s)`);

    const categoryResult = await storage.listProducts({ category: "inverter", page: 1, limit: 5 });
    if (categoryResult.products.some(p => p.category !== "inverter")) {
      throw new Error("Category filter returned non-inverter products!");
    }
    console.log(`✓ Category filter verified: ${categoryResult.products.length} inverter(s) retrieved`);

    // Clean up product
    await storage.deleteProduct(newProduct.id);
    const afterDeleteProduct = await storage.getProduct(newProduct.id);
    if (afterDeleteProduct) throw new Error("Product was not deleted properly!");
    console.log("✓ Product deletion verified");

    // =========================================================================
    // 3. COMPANY SETTINGS & OFFICE LOCATIONS MULTI-TENANT ISOLATION
    // =========================================================================
    console.log("\n[TEST 3] Testing Company Settings & Office Locations Multi-Tenant Isolation...");

    // Update Tenant A settings
    await storage.updateCompanySettings({
      companyName: "Solar Enterprise Alpha Corp",
      supportEmail: "support@solarenterprise.com",
      defaultOTRate: 1.5,
      gstin: "29AAAAA0000A1Z5"
    });

    const settingsA = await storage.getCompanySettings();
    if (settingsA.companyName !== "Solar Enterprise Alpha Corp") {
      throw new Error(`Expected Tenant A company name Solar Enterprise Alpha Corp, got ${settingsA?.companyName}`);
    }
    console.log(`✓ Tenant A settings verified: ${settingsA.companyName}, OT Rate: ${settingsA.defaultOTRate}`);

    // Insert separate Tenant B settings directly in DB to verify isolation
    await db.insert(companySettings).values({
      tenantId: tenantB,
      companyName: "Beta Solar Industries Ltd",
      supportEmail: "info@betasolar.com",
      defaultOTRate: "2.00",
      gstin: "33BBBBB1111B1Z2"
    }).onConflictDoNothing();

    // Verify Tenant A still reads its own settings and not Tenant B's
    const recheckA = await storage.getCompanySettings();
    if (recheckA.companyName !== "Solar Enterprise Alpha Corp" || recheckA.tenantId === tenantB) {
      throw new Error("Cross-tenant leakage detected in getCompanySettings!");
    }
    console.log("✓ Multi-tenant company settings isolation verified: Tenant A unaffected by Tenant B");

    // Office locations test
    const loc = await storage.createOfficeLocation({
      name: "Bangalore HQ Rooftop Hub",
      latitude: "12.9716",
      longitude: "77.5946",
      radius: 300,
      city: "Bengaluru",
      state: "Karnataka"
    });
    console.log(`✓ Office location created: ${loc.name} (Radius: ${loc.radius}m)`);

    const locations = await storage.listOfficeLocations();
    const foundLoc = locations.find(l => l.id === loc.id);
    if (!foundLoc) throw new Error("Created office location not found in listOfficeLocations!");
    console.log("✓ Office location found in tenant list");

    console.log("\n=======================================================");
    console.log(" ALL 3 SYSTEM INTEGRITY & MULTI-TENANT TESTS PASSED 100%");
    console.log("=======================================================\n");

  } finally {
    // Cleanup tenant B data
    try {
      await db.delete(companySettings).where(eq(companySettings.tenantId, tenantB));
      await db.delete(tenants).where(eq(tenants.id, tenantB));
    } catch (_) {}
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error("\n❌ TEST SUITE FAILED:", err);
  process.exit(1);
});

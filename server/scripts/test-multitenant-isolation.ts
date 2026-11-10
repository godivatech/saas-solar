import 'dotenv/config';
import { db as pgDb } from '../db';
import { tenants, customers as pgCustomers } from '@shared/schema.postgres';
import { eq } from 'drizzle-orm';
import { storage } from '../storage';
import { runWithTenant, getActiveTenantId } from '../tenant-context';
import { AutoCheckoutService } from '../services/auto-checkout-service';

async function runMultiTenantVerification() {
  console.log("=== MULTI-TENANT ISOLATION & CONTEXT VERIFICATION ===");

  const tenantAlphaId = "test-tenant-alpha-" + Date.now();
  const tenantBetaId = "test-tenant-beta-" + Date.now();

  try {
    // 1. Seed two test tenants
    console.log("1. Seeding Tenant Alpha and Tenant Beta...");
    await pgDb.insert(tenants).values([
      { id: tenantAlphaId, name: "Alpha Solar Systems", slug: `alpha-${Date.now()}`, state: "Maharashtra" },
      { id: tenantBetaId, name: "Beta Renewable Power", slug: `beta-${Date.now()}`, state: "Gujarat" }
    ]);
    console.log("✅ Seeded tenants successfully.");

    // 2. Test Tenant Alpha Context
    console.log("2. Testing operations within Tenant Alpha context...");
    let alphaCustomerId = "";
    await runWithTenant(tenantAlphaId, async () => {
      console.log("   Current Active Tenant:", getActiveTenantId());
      if (getActiveTenantId() !== tenantAlphaId) {
        throw new Error(`Expected active tenant ${tenantAlphaId}, got ${getActiveTenantId()}`);
      }

      const created = await storage.createCustomer({
        name: "Alpha Corp Customer",
        phone: "9988776655",
        email: "customer@alpha.com",
        address: "Alpha Headquarters, Pune",
        city: "Pune",
        state: "Maharashtra",
        pincode: "411001",
        systemCapacityKW: 10,
        batteryBackup: false,
        totalCost: "500000",
        source: "direct"
      } as any);

      alphaCustomerId = created.id;
      console.log(`   Created customer ${alphaCustomerId} under Tenant Alpha.`);

      // Verify customer is visible in Tenant Alpha
      const alphaCustomer = await storage.getCustomer(alphaCustomerId);
      if (!alphaCustomer) {
        throw new Error("Alpha customer not found under Tenant Alpha!");
      }
      console.log("   ✅ Alpha customer correctly visible in Tenant Alpha.");
    });

    // 3. Test Tenant Beta Context - Strict Cross-Tenant Isolation
    console.log("3. Testing operations within Tenant Beta context (Isolation Check)...");
    let betaCustomerId = "";
    await runWithTenant(tenantBetaId, async () => {
      console.log("   Current Active Tenant:", getActiveTenantId());
      if (getActiveTenantId() !== tenantBetaId) {
        throw new Error(`Expected active tenant ${tenantBetaId}, got ${getActiveTenantId()}`);
      }

      // Tenant Beta tries to fetch Tenant Alpha's customer by ID
      const crossTenantCheck = await storage.getCustomer(alphaCustomerId);
      if (crossTenantCheck) {
        throw new Error(`CRITICAL DATA LEAK: Tenant Beta was able to view Tenant Alpha's customer ${alphaCustomerId}!`);
      }
      console.log("   ✅ Isolation Verified: Tenant Beta CANNOT access Tenant Alpha's customer.");

      // Tenant Beta lists customers - should NOT contain Tenant Alpha's customer
      const betaCustomersList = await storage.listCustomers();
      const leakedCustomer = betaCustomersList.find(c => c.id === alphaCustomerId);
      if (leakedCustomer) {
        throw new Error(`CRITICAL DATA LEAK: Tenant Beta customer list contained Tenant Alpha's customer!`);
      }
      console.log("   ✅ Isolation Verified: Tenant Beta customer list does NOT contain Tenant Alpha data.");

      // Create a customer under Tenant Beta
      const createdBeta = await storage.createCustomer({
        name: "Beta Industries Customer",
        phone: "9123456780",
        email: "customer@beta.com",
        address: "Beta Tech Park, Ahmedabad",
        city: "Ahmedabad",
        state: "Gujarat",
        pincode: "380001",
        systemCapacityKW: 25,
        batteryBackup: true,
        totalCost: "1200000",
        source: "referral"
      } as any);

      betaCustomerId = createdBeta.id;
      console.log(`   Created customer ${betaCustomerId} under Tenant Beta.`);

      const betaCustomer = await storage.getCustomer(betaCustomerId);
      if (!betaCustomer) {
        throw new Error("Beta customer not found under Tenant Beta!");
      }
      console.log("   ✅ Beta customer correctly visible in Tenant Beta.");
    });

    // 4. Verify listAllTenants returns all tenants
    console.log("4. Verifying listAllTenants...");
    const allTenants = await (storage as any).listAllTenants();
    const foundAlpha = allTenants.find((t: any) => t.id === tenantAlphaId);
    const foundBeta = allTenants.find((t: any) => t.id === tenantBetaId);
    if (!foundAlpha || !foundBeta) {
      throw new Error("listAllTenants failed to return all registered tenants!");
    }
    console.log(`   ✅ Found ${allTenants.length} tenants total, including Alpha and Beta.`);

    // 5. Test Background Worker Multi-Tenant Loop
    console.log("5. Testing AutoCheckoutService multi-tenant execution...");
    await AutoCheckoutService.processAutoCheckouts();
    console.log("   ✅ AutoCheckoutService successfully processed all tenants.");

    console.log("\n==================================================");
    console.log("🎉 ALL MULTI-TENANT ISOLATION TESTS PASSED 100%!");
    console.log("==================================================");

  } finally {
    // Cleanup test data
    console.log("Cleaning up test tenants and customers...");
    try {
      await pgDb.delete(pgCustomers).where(eq(pgCustomers.tenantId, tenantAlphaId));
      await pgDb.delete(pgCustomers).where(eq(pgCustomers.tenantId, tenantBetaId));
      await pgDb.delete(tenants).where(eq(tenants.id, tenantAlphaId));
      await pgDb.delete(tenants).where(eq(tenants.id, tenantBetaId));
      console.log("Cleaned up successfully.");
    } catch (cleanupErr) {
      console.error("Cleanup error:", cleanupErr);
    }
    process.exit(0);
  }
}

runMultiTenantVerification().catch(err => {
  console.error("❌ Verification failed:", err);
  process.exit(1);
});


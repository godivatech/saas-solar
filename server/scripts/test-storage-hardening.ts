import 'dotenv/config';
import { db } from '../db';
import { tenants, users, customers, quotations, invoices } from '@shared/schema.postgres';
import { storage } from '../storage';
import { runWithTenant } from '../tenant-context';
import { emailService } from '../services/email-service';
import { eq } from 'drizzle-orm';

async function runHardeningTests() {
  console.log("==================================================");
  console.log("🚀 STARTING STORAGE HARDENING & TENANT DEFENSE TEST");
  console.log("==================================================");

  const tenantAlphaId = `test-hard-alpha-${Date.now()}`;
  const tenantBetaId = `test-hard-beta-${Date.now()}`;

  try {
    // 1. Create two test tenants
    await db.insert(tenants).values([
      {
        id: tenantAlphaId,
        name: "Alpha Solar Hardening Org",
        slug: `alpha-${Date.now()}`,
        email: "support@alpha-solar.com"
      },
      {
        id: tenantBetaId,
        name: "Beta Solar Hardening Org",
        slug: `beta-${Date.now()}`,
        email: "support@beta-solar.com"
      }
    ]);
    console.log("✅ 1. Test tenants created: Alpha & Beta");

    // 2. Create customer under Alpha
    let alphaCustomer: any;
    await runWithTenant(tenantAlphaId, async () => {
      alphaCustomer = await storage.createCustomer({
        name: "Alpha VIP Customer",
        mobile: "9988776655",
        email: "alpha-vip@test.com"
      });
    });
    console.log("✅ 2. Alpha customer created with ID:", alphaCustomer.id);

    // 3. Test Cross-Tenant getCustomer from Beta
    await runWithTenant(tenantBetaId, async () => {
      const leakedCustomer = await storage.getCustomer(alphaCustomer.id);
      if (leakedCustomer) {
        throw new Error(`CRITICAL SECURITY FAILURE: Beta was able to read Alpha's customer: ${JSON.stringify(leakedCustomer)}`);
      }
    });
    console.log("✅ 3. Cross-Tenant Customer Read BLOCKED for Beta (returned undefined)");

    // 4. Test Cross-Tenant updateCustomer from Beta
    await runWithTenant(tenantBetaId, async () => {
      const updateResult = await storage.updateCustomer(alphaCustomer.id, {
        name: "HACKED BY BETA"
      });
      if (updateResult) {
        throw new Error(`CRITICAL SECURITY FAILURE: Beta was able to update Alpha's customer: ${JSON.stringify(updateResult)}`);
      }
    });
    console.log("✅ 4. Cross-Tenant Customer Update BLOCKED for Beta");

    // Verify Alpha customer name is unchanged
    await runWithTenant(tenantAlphaId, async () => {
      const verified = await storage.getCustomer(alphaCustomer.id);
      if (verified?.name !== "Alpha VIP Customer") {
        throw new Error(`Integrity violated: Alpha customer was modified by Beta! Name: ${verified?.name}`);
      }
    });
    console.log("✅ 5. Alpha Customer data integrity intact");

    // 6. Test Cross-Tenant deleteCustomer from Beta
    await runWithTenant(tenantBetaId, async () => {
      await storage.deleteCustomer(alphaCustomer.id);
    });
    console.log("✅ 6. Beta attempted deleteCustomer on Alpha customer");

    // Verify Alpha customer is NOT deleted
    await runWithTenant(tenantAlphaId, async () => {
      const verified = await storage.getCustomer(alphaCustomer.id);
      if (!verified) {
        throw new Error("Integrity violated: Alpha customer was deleted by Beta!");
      }
    });
    console.log("✅ 7. Alpha Customer NOT deleted by Beta");

    // 8. Create quotation under Alpha
    let alphaQuotation: any;
    await runWithTenant(tenantAlphaId, async () => {
      alphaQuotation = await storage.createQuotation({
        customerId: alphaCustomer.id,
        systemKw: 5,
        totalCost: 250000,
        customerPayment: 250000,
        projects: [{ type: "residential", capacityKw: 5, rate: 50000 }]
      });
    });
    console.log("✅ 8. Alpha Quotation created with ID:", alphaQuotation.id);

    // 9. Test Cross-Tenant getQuotation from Beta
    await runWithTenant(tenantBetaId, async () => {
      const leakedQuotation = await storage.getQuotation(alphaQuotation.id);
      if (leakedQuotation) {
        throw new Error(`CRITICAL SECURITY FAILURE: Beta was able to read Alpha's quotation: ${JSON.stringify(leakedQuotation)}`);
      }
    });
    console.log("✅ 9. Cross-Tenant Quotation Read BLOCKED for Beta");

    // 10. Test Cross-Tenant updateQuotation from Beta
    await runWithTenant(tenantBetaId, async () => {
      const updateResult = await storage.updateQuotation(alphaQuotation.id, {
        totalCost: 10
      }, "hacker");
      if (updateResult) {
        throw new Error("CRITICAL SECURITY FAILURE: Beta updated Alpha's quotation!");
      }
    });
    console.log("✅ 10. Cross-Tenant Quotation Update BLOCKED for Beta");

    // 11. Create invoice under Alpha
    let alphaInvoice: any;
    await runWithTenant(tenantAlphaId, async () => {
      alphaInvoice = await storage.createInvoice({
        customerId: alphaCustomer.id,
        quotationId: alphaQuotation.id,
        total: 250000
      });
    });
    console.log("✅ 11. Alpha Invoice created with ID:", alphaInvoice.id);

    // 12. Test Cross-Tenant getInvoice from Beta
    await runWithTenant(tenantBetaId, async () => {
      const leakedInvoice = await storage.getInvoice(alphaInvoice.id);
      if (leakedInvoice) {
        throw new Error(`CRITICAL SECURITY FAILURE: Beta was able to read Alpha's invoice: ${JSON.stringify(leakedInvoice)}`);
      }
    });
    console.log("✅ 12. Cross-Tenant Invoice Read BLOCKED for Beta");

    // 13. Test Email Branding Injection
    await runWithTenant(tenantAlphaId, async () => {
      const branding = await (emailService as any).resolveTenantBranding();
      if (branding.companyName !== "Alpha Solar Hardening Org" || branding.supportEmail !== "support@alpha-solar.com") {
        throw new Error(`Email branding mismatch for Alpha: ${JSON.stringify(branding)}`);
      }
    });
    console.log("✅ 13. Email branding dynamically resolved for Alpha tenant: 'Alpha Solar Hardening Org'");

    await runWithTenant(tenantBetaId, async () => {
      const branding = await (emailService as any).resolveTenantBranding();
      if (branding.companyName !== "Beta Solar Hardening Org" || branding.supportEmail !== "support@beta-solar.com") {
        throw new Error(`Email branding mismatch for Beta: ${JSON.stringify(branding)}`);
      }
    });
    console.log("✅ 14. Email branding dynamically resolved for Beta tenant: 'Beta Solar Hardening Org'");

    console.log("==================================================");
    console.log("🎉 ALL STORAGE HARDENING & DEFENSE TESTS PASSED 100%!");
    console.log("==================================================");
  } finally {
    // Cleanup
    console.log("🧹 Cleaning up test artifacts...");
    try {
      await db.delete(invoices).where(eq(invoices.tenantId, tenantAlphaId));
      await db.delete(quotations).where(eq(quotations.tenantId, tenantAlphaId));
      await db.delete(customers).where(eq(customers.tenantId, tenantAlphaId));
      await db.delete(tenants).where(eq(tenants.id, tenantAlphaId));
      await db.delete(tenants).where(eq(tenants.id, tenantBetaId));
      console.log("✅ Cleanup complete.");
    } catch (e) {
      console.warn("Cleanup warning:", e);
    }
  }
}

runHardeningTests().catch((e) => {
  console.error("❌ Test failed:", e);
  process.exit(1);
});

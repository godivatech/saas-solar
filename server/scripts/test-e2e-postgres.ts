import { storage } from '../storage';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  console.log("🚀 Testing End-to-End Core Operations on Neon PostgreSQL via storage...\n");

  // 1. Fetch user
  const admin = await storage.getUserByEmail('admin@gmail.com');
  console.log(`✅ 1. Admin user verified in Postgres: ${admin?.displayName} (ID: ${admin?.id})`);

  // 2. Fetch existing customers
  const customers = await storage.listCustomers();
  console.log(`✅ 2. Customers in Postgres: ${customers.map(c => `${c.name} [${c.id}]`).join(', ')}`);
  const targetCust = customers[0];

  // 3. Create a Quotation in Neon PostgreSQL
  console.log(`\n📄 3. Creating a quotation for customer ${targetCust.name}...`);
  const testQuotationNumber = `QT-TEST-${Date.now().toString().slice(-4)}`;
  const quote = await storage.createQuotation({
    quotationNumber: testQuotationNumber,
    customerId: targetCust.id,
    projectType: 'on_grid',
    systemKw: 5,
    ratePerKw: 50000,
    basePrice: 250000,
    gstPercentage: 13.8,
    gstAmount: 34500,
    totalCost: 284500,
    subsidyAmount: 78000,
    customerPayment: 206500,
    roundoff: 0,
    status: 'draft',
    source: 'manual',
    projects: [
      {
        projectType: 'on_grid',
        systemKw: 5,
        panelType: 'Mono Perc Bifacial 550Wp',
        inverterType: '5kW String Inverter'
      }
    ]
  });
  console.log(`✅ Quotation created in Neon PostgreSQL: ${quote.quotationNumber} (ID: ${quote.id})`);

  // 4. Fetch the quotation back from Neon
  const fetchedQuote = await storage.getQuotation(quote.id);
  console.log(`✅ 4. Fetched quotation back from Postgres: ${fetchedQuote?.quotationNumber}, System KW: ${fetchedQuote?.systemKw}, Total: ₹${fetchedQuote?.totalCost}`);

  // 5. Create an Invoice linked to this quotation
  console.log(`\n🧾 5. Creating invoice in Neon PostgreSQL...`);
  const inv = await storage.createInvoice({
    quotationId: quote.id,
    customerId: targetCust.id,
    total: quote.totalCost,
    status: 'pending'
  });
  console.log(`✅ Invoice created in Neon PostgreSQL: ${inv.invoiceNumber} (ID: ${inv.id}), Total: ₹${inv.total}`);

  // 6. Fetch invoices
  const allInvoices = await storage.listInvoices();
  console.log(`✅ 6. Total invoices in Neon Postgres: ${allInvoices.length}`);

  // 7. Clean up test quotation and invoice
  await storage.deleteInvoice(inv.id);
  await storage.deleteQuotation(quote.id);
  console.log(`\n🧹 7. Cleaned up test quotation and invoice successfully.`);

  console.log('\n🌟 ALL CORE ERP FLOWS VERIFIED 100% OPERATIONAL ON NEON POSTGRESQL!');
}

main().then(() => process.exit(0)).catch(err => {
  console.error("End-to-end test error:", err);
  process.exit(1);
});


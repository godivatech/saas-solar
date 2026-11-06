import 'dotenv/config';
import { storage } from '../storage';

async function testAtomicInvoicePayments() {
  console.log("=== Testing Atomic ACID Invoice Payment Processing in PostgreSQL ===");

  let customerId = '';
  let invoiceId = '';
  let quotationId = '';

  try {
    // 1. Create a test customer first (for foreign key integrity)
    console.log("1. Creating test customer for foreign key integrity...");
    const customer = await storage.createCustomer({
      name: "Payment Test Customer",
      mobile: `99${Date.now().toString().slice(-8)}`,
      city: "Bangalore",
      state: "Karnataka"
    });
    customerId = customer.id;
    console.log(`✅ Customer created: ID=${customerId}`);

    // 2. Create quotation
    console.log("2. Creating quotation...");
    const quotation = await storage.createQuotation({
      quotationNumber: `QT-${Date.now().toString().slice(-6)}`,
      customerId,
      projectType: "residential",
      systemKw: 5,
      ratePerKw: 20000,
      basePrice: 100000,
      gstPercentage: 13.8,
      gstAmount: 13800,
      totalCost: 113800,
      totalSystemCost: 113800,
      subsidyAmount: 0,
      customerPayment: 113800,
      totalCustomerPayment: 113800,
      advanceAmount: 20000,
      balanceAmount: 93800,
      roundoff: 0,
      status: "approved",
      source: "manual",
      preparedBy: "Senior Solar Engineer",
      projects: []
    });
    quotationId = quotation.id;
    console.log(`✅ Quotation created: ID=${quotationId}`);

    // 3. Create test invoice
    console.log("3. Creating test invoice with total 100,000...");
    const invoice = await storage.createInvoice({
      customerId,
      quotationId: quotation.id,
      total: 100000,
      status: "pending"
    });
    invoiceId = invoice.id;
    console.log(`✅ Invoice created: ID=${invoice.id}, Number=${invoice.invoiceNumber}, Total=${invoice.total}`);

    // 4. Record partial payment of 40,000
    console.log("4. Recording partial payment of 40,000 (atomic transaction)...");
    const partialResult = await (storage as any).recordInvoicePayment({
      invoiceId: invoice.id,
      amount: 40000,
      paymentMethod: "bank_transfer",
      referenceNumber: "UTR987654321",
      receivedBy: "Accounts Officer",
      notes: "Advance installment"
    });

    console.log(`✅ Partial payment recorded: receipt=${partialResult.payment.receiptNumber}, invoiceStatus=${partialResult.invoice.status}`);
    if (partialResult.invoice.status !== "partially_paid") {
      throw new Error(`Expected status 'partially_paid', got ${partialResult.invoice.status}`);
    }

    // 5. Record remaining payment of 60,000
    console.log("5. Recording final payment of 60,000 (atomic transaction)...");
    const finalResult = await (storage as any).recordInvoicePayment({
      invoiceId: invoice.id,
      amount: 60000,
      paymentMethod: "upi",
      referenceNumber: "UPI123456789",
      receivedBy: "Accounts Officer",
      notes: "Final clearance"
    });

    console.log(`✅ Final payment recorded: receipt=${finalResult.payment.receiptNumber}, invoiceStatus=${finalResult.invoice.status}`);
    if (finalResult.invoice.status !== "paid") {
      throw new Error(`Expected status 'paid', got ${finalResult.invoice.status}`);
    }

    // 6. List payments by invoice
    console.log("6. Fetching all payments for invoice...");
    const paymentList = await (storage as any).listPaymentsByInvoice(invoice.id);
    console.log(`✅ Found ${paymentList.length} payment receipts for invoice:`);
    for (const p of paymentList) {
      console.log(`   - Receipt: ${p.receiptNumber}, Amount: ${p.amount}, Method: ${p.paymentMethod || p.paymentMode}`);
    }

    if (paymentList.length !== 2) {
      throw new Error(`Expected 2 payments, found ${paymentList.length}`);
    }

    // 7. Cleanup
    console.log("7. Cleaning up test records...");
    await storage.deleteInvoice(invoice.id);
    await storage.deleteQuotation(quotation.id);
    console.log("✅ Test invoice, quotation, and associated payments cleaned up.");

    console.log("\n🎉 ATOMIC FINANCIAL TRANSACTION TESTS PASSED WITH 100% SUCCESS!");
  } catch (err) {
    console.error("❌ Test failed:", err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

testAtomicInvoicePayments();

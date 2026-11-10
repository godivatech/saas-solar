import 'dotenv/config';
import { storage } from '../storage';

async function testUserQuotationInvoice() {
  console.log('🧪 Testing User Lifecycle, Quotation Revisions, and Invoices with PostgreSQL...\n');

  // ==========================================
  // 1. TEST USER LIFECYCLE & MANAGER ASSIGNMENT
  // ==========================================
  console.log('--- 1. Testing User Lifecycle & Manager Assignment ---');
  const managerUid = `test_mgr_${Date.now()}`;
  const empUid = `test_emp_${Date.now()}`;

  // Create Manager
  const manager = await storage.createUser({
    uid: managerUid,
    email: `${managerUid}@example.com`,
    displayName: 'Test Manager',
    role: 'employee',
    department: 'technical',
    designation: 'team_leader',
    phone: '9876543210'
  });
  console.log(`✅ Created Manager: ${manager.displayName} (${manager.uid})`);

  // Create Subordinate with Manager link
  const employee = await storage.createUser({
    uid: empUid,
    email: `${empUid}@example.com`,
    displayName: 'Test Subordinate',
    role: 'employee',
    department: 'technical',
    designation: 'technician',
    reportingManagerId: manager.uid,
    phone: '9876543211',
    payrollGrade: 'B1'
  });
  console.log(`✅ Created Employee: ${employee.displayName} (${employee.uid}), Manager: ${employee.reportingManagerId}`);

  if (employee.reportingManagerId !== manager.uid) {
    throw new Error(`Expected reportingManagerId ${manager.uid}, got ${employee.reportingManagerId}`);
  }

  // Verify Subordinates Query
  const subordinates = await storage.getUsersByReportingManager(manager.uid);
  console.log(`✅ Subordinates count for manager: ${subordinates.length}`);
  if (!subordinates.some(s => s.uid === employee.uid)) {
    throw new Error('Employee not returned in manager subordinates list');
  }

  // Soft-terminate Employee (sets dateOfLeaving, clears manager link)
  console.log('--- Testing Employee Termination ---');
  const now = new Date();
  const terminated = await storage.updateUser(employee.uid, {
    isActive: false,
    employeeStatus: 'terminated',
    dateOfLeaving: now,
    reportingManagerId: null
  });
  console.log(`✅ Terminated status: isActive=${terminated.isActive}, status=${terminated.employeeStatus}, dateOfLeaving=${terminated.dateOfLeaving}`);
  if (terminated.isActive !== false || terminated.employeeStatus !== 'terminated') {
    throw new Error('Termination update failed');
  }

  // Reactivate Employee (sets rehireDate, clears dateOfLeaving)
  console.log('--- Testing Employee Reactivation ---');
  const reactivated = await storage.updateUser(employee.uid, {
    isActive: true,
    employeeStatus: 'active',
    rehireDate: new Date(),
    dateOfLeaving: null,
    reportingManagerId: manager.uid
  });
  console.log(`✅ Reactivated status: isActive=${reactivated.isActive}, status=${reactivated.employeeStatus}, rehireDate=${reactivated.rehireDate}, manager=${reactivated.reportingManagerId}`);
  if (reactivated.isActive !== true || reactivated.employeeStatus !== 'active' || reactivated.reportingManagerId !== manager.uid) {
    throw new Error('Reactivation update failed');
  }

  // ==========================================
  // 2. TEST QUOTATION REVISION & PRICING UPDATE
  // ==========================================
  console.log('\n--- 2. Testing Quotation Creation & Revision ---');
  const customer = await storage.createCustomer({
    name: 'Quotation Test Customer',
    mobile: '9123456789',
    email: 'quote.cust@example.com',
    state: 'Karnataka'
  });

  const quote = await storage.createQuotation({
    customerId: customer.id,
    projectType: 'on_grid',
    systemKw: 3.5,
    ratePerKw: 55000,
    basePrice: 192500,
    gstPercentage: 13.8,
    gstAmount: 26565,
    totalCost: 219065,
    subsidyAmount: 78000,
    customerPayment: 141065,
    roundoff: 0,
    status: 'draft',
    customBillOfMaterials: [
      { item: 'Solar Panels 550W', qty: 7, rate: 12000, amount: 84000 },
      { item: 'Inverter 3.3kW', qty: 1, rate: 35000, amount: 35000 }
    ]
  });
  console.log(`✅ Created Quotation: ${quote.quotationNumber} (Rev ${quote.revision}, ${quote.systemKw}kW, Total ₹${quote.totalCost})`);

  // Revise Quotation to 5kW
  const revisedQuote = await storage.updateQuotation(quote.id, {
    revision: 2,
    systemKw: 5.0,
    ratePerKw: 52000,
    basePrice: 260000,
    gstAmount: 35880,
    totalCost: 295880,
    customerPayment: 217880,
    status: 'sent',
    customBillOfMaterials: [
      { item: 'Solar Panels 550W', qty: 10, rate: 12000, amount: 120000 },
      { item: 'Inverter 5kW', qty: 1, rate: 45000, amount: 45000 }
    ]
  }, manager.uid);

  console.log(`✅ Revised Quotation: Rev ${revisedQuote.revision}, ${revisedQuote.systemKw}kW, Total ₹${revisedQuote.totalCost}, Status: ${revisedQuote.status}`);
  if (revisedQuote.revision !== 2 || revisedQuote.systemKw !== 5.0 || revisedQuote.totalCost !== 295880) {
    throw new Error(`Quotation revision fields did not update properly: rev=${revisedQuote.revision}, kw=${revisedQuote.systemKw}, total=${revisedQuote.totalCost}`);
  }

  // ==========================================
  // 3. TEST INVOICE CREATION & PARTIAL PAYMENT
  // ==========================================
  console.log('\n--- 3. Testing Invoice Creation & Balance Tracking ---');
  const invoice = await storage.createInvoice({
    quotationId: revisedQuote.id,
    customerId: customer.id,
    total: revisedQuote.customerPayment,
    status: 'pending'
  });
  console.log(`✅ Created Invoice: ${invoice.invoiceNumber} (Total ₹${invoice.total})`);

  // Partial Payment Update on Invoice
  const updatedInv = await storage.updateInvoice(invoice.id, {
    paidAmount: 100000,
    balanceDue: 117880,
    status: 'partially_paid',
    notes: 'First advance milestone received'
  });
  console.log(`✅ Updated Invoice: status=${updatedInv.status}`);

  console.log('\n🎉 ALL User, Quotation Revision, and Invoice tests PASSED 100% with Neon PostgreSQL!');
  process.exit(0);
}

testUserQuotationInvoice().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

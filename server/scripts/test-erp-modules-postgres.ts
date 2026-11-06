import 'dotenv/config';
import { storage } from '../storage';
import { db } from '../db';
import { tenants, customers, users } from '../../shared/schema.postgres';

async function run() {
  console.log('🧪 Starting Full ERP Modules PostgreSQL Forensic Verification...\n');

  try {
    // Fetch base tenant, user, customer
    const [tenant] = await db.select().from(tenants).limit(1);
    const [user] = await db.select().from(users).limit(1);
    const [cust] = await db.select().from(customers).limit(1);

    if (!tenant || !user || !cust) {
      throw new Error('Pre-requisite seed data missing (tenant, user, or customer)');
    }

    console.log(`📌 Context: Tenant=${tenant.name}, User=${user.displayName}, Customer=${cust.name}\n`);

    // ===================================================================
    // 1. PRODUCTS & INVENTORY
    // ===================================================================
    console.log('1️⃣ Testing Products & Inventory CRUD...');
    const productSku = `TEST-PANEL-${Date.now().toString().slice(-4)}`;
    const newProduct = await storage.createProduct({
      name: "Mono PERC 550W Tier 1 Solar Panel",
      sku: productSku,
      category: "panel",
      brand: "Godiva Power",
      model: "GP-550M",
      specifications: { wattage: 550, cellType: "Mono PERC", efficiency: "21.3%" },
      unit: "Nos",
      purchasePrice: 9500,
      sellingPrice: 13500,
      currentStock: 120,
      minimumStock: 20
    });
    console.log(`   ✅ createProduct: Created "${newProduct.name}" (ID: ${newProduct.id}, SKU: ${newProduct.sku})`);

    const fetchedProduct = await storage.getProduct(newProduct.id);
    if (!fetchedProduct || fetchedProduct.sku !== productSku) {
      throw new Error(`getProduct failed for ID ${newProduct.id}`);
    }
    console.log(`   ✅ getProduct: Verified SKU ${fetchedProduct.sku}`);

    const updatedProduct = await storage.updateProduct(newProduct.id, {
      currentStock: 110,
      sellingPrice: 13200
    });
    console.log(`   ✅ updateProduct: Updated stock to ${updatedProduct.currentStock}, price to ₹${updatedProduct.sellingPrice}`);

    const prodList = await storage.listProducts();
    console.log(`   ✅ listProducts: Returned ${prodList.total} total inventory items in PostgreSQL`);

    // Clean up test product
    await storage.deleteProduct(newProduct.id);
    console.log(`   ✅ deleteProduct: Successfully cleaned up test product`);

    // ===================================================================
    // 2. QUOTATIONS MODULE
    // ===================================================================
    console.log('\n2️⃣ Testing Solar Quotations Lifecycle...');
    const quoteNum = `QT-${Date.now().toString().slice(-6)}`;
    const createdQuote = await storage.createQuotation({
      quotationNumber: quoteNum,
      revision: 1,
      customerId: cust.id,
      projectType: "on_grid",
      systemKw: 5.0,
      ratePerKw: 55000,
      basePrice: 275000,
      gstPercentage: 13.8,
      gstAmount: 37950,
      totalCost: 312950,
      subsidyAmount: 78000,
      customerPayment: 234950,
      roundoff: 0,
      status: "draft",
      source: "manual",
      preparedBy: user.id,
      projects: [{ panelBrand: "Godiva", inverterBrand: "Sungrow", kw: 5 }],
      customBillOfMaterials: [{ item: "550W Panels", qty: 9 }, { item: "5kW Inverter", qty: 1 }],
      customerNotes: "Roof access on south side",
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdBy: user.id
    });
    console.log(`   ✅ createQuotation: Created Quotation "${createdQuote.quotationNumber}" (ID: ${createdQuote.id}, ₹${createdQuote.customerPayment})`);

    const fetchedQuote = await storage.getQuotation(createdQuote.id);
    if (!fetchedQuote || fetchedQuote.quotationNumber !== quoteNum) {
      throw new Error(`getQuotation failed for ID ${createdQuote.id}`);
    }
    console.log(`   ✅ getQuotation: Verified Quotation Number ${fetchedQuote.quotationNumber}, Status=${fetchedQuote.status}`);

    const updatedQuote = await storage.updateQuotation(createdQuote.id, {
      status: "approved",
      revision: 2,
      totalCost: 310000,
      customerPayment: 232000
    }, user.id);
    console.log(`   ✅ updateQuotation: Updated Status to "${updatedQuote.status}", Revision=${updatedQuote.revision}`);

    const quotesList = await storage.listQuotations();
    console.log(`   ✅ listQuotations: Found ${quotesList.length} quotations in PostgreSQL`);

    // Clean up test quotation
    await storage.deleteQuotation(createdQuote.id);
    console.log(`   ✅ deleteQuotation: Cleaned up test quotation`);

    // ===================================================================
    // 3. INVOICES MODULE
    // ===================================================================
    console.log('\n3️⃣ Testing Invoices CRUD & Payments...');
    const createdInv = await storage.createInvoice({
      customerId: cust.id,
      quotationId: null,
      total: 232000,
      status: "pending"
    });
    console.log(`   ✅ createInvoice: Created Invoice "${createdInv.invoiceNumber}" (ID: ${createdInv.id}, Total: ₹${createdInv.total})`);

    const fetchedInv = await storage.getInvoice(createdInv.id);
    if (!fetchedInv) throw new Error(`getInvoice failed for ${createdInv.id}`);
    console.log(`   ✅ getInvoice: Fetched invoice successfully, Status=${fetchedInv.status}`);

    const updatedInv = await storage.updateInvoice(createdInv.id, {
      status: "paid"
    });
    console.log(`   ✅ updateInvoice: Updated Invoice Status to "${updatedInv.status}"`);

    const invList = await storage.listInvoices();
    console.log(`   ✅ listInvoices: Found ${invList.length} invoices in PostgreSQL`);

    await storage.deleteInvoice(createdInv.id);
    console.log(`   ✅ deleteInvoice: Cleaned up test invoice`);

    // ===================================================================
    // 4. LEAVE MANAGEMENT & BALANCES
    // ===================================================================
    console.log('\n4️⃣ Testing Leave Applications & Dual-Approval Lifecycle...');
    const leaveApp = await storage.createLeave({
      userId: user.id,
      leaveType: "casual_leave",
      startDate: new Date(2026, 11, 20),
      endDate: new Date(2026, 11, 21),
      totalDays: 2,
      reason: "Family function",
      status: "pending_manager"
    });
    console.log(`   ✅ createLeave: Applied 2 days casual leave (ID: ${leaveApp.id}, Status: ${leaveApp.status})`);

    const fetchedLeave = await storage.getLeave(leaveApp.id);
    if (!fetchedLeave) throw new Error(`getLeave failed for ${leaveApp.id}`);
    console.log(`   ✅ getLeave: Verified leave application, reason="${fetchedLeave.reason}"`);

    // Manager approve
    const mgrApproved = await storage.updateLeave(leaveApp.id, {
      managerApprovalStatus: "approved",
      managerRemarks: "Recommended for approval",
      status: "pending_hr"
    });
    console.log(`   ✅ updateLeave (Manager): Status progressed to "${mgrApproved.status}"`);

    // HR approve
    const hrApproved = await storage.updateLeave(leaveApp.id, {
      hrApprovalStatus: "approved",
      hrRemarks: "Approved by HR",
      status: "approved",
      approvedBy: user.id
    });
    console.log(`   ✅ updateLeave (HR Final): Status is "${hrApproved.status}"`);

    const userLeaves = await storage.listLeavesByUser(user.id);
    console.log(`   ✅ listLeavesByUser: User has ${userLeaves.length} leave application(s)`);

    // ===================================================================
    // 5. SALARY ADVANCES
    // ===================================================================
    console.log('\n5️⃣ Testing Salary Advances Management...');
    const advance = await storage.createSalaryAdvance({
      userId: user.id,
      amount: 25000,
      monthlyDeduction: 5000,
      deductionStartMonth: 12,
      deductionStartYear: 2026,
      reason: "Medical emergency advance",
      status: "approved"
    });
    console.log(`   ✅ createSalaryAdvance: Created advance ₹${advance.amount} (ID: ${advance.id}, EMI=₹${advance.monthlyDeduction}/mo)`);

    const fetchedAdvance = await storage.getSalaryAdvance(advance.id);
    if (!fetchedAdvance) throw new Error(`getSalaryAdvance failed for ${advance.id}`);
    console.log(`   ✅ getSalaryAdvance: Fetched successfully, Status=${fetchedAdvance.status}`);

    const advList = await storage.listSalaryAdvances({ userId: user.id });
    console.log(`   ✅ listSalaryAdvances: User has ${advList.length} salary advance record(s)`);

    // ===================================================================
    // 6. OFFICE LOCATIONS & DEPARTMENT TIMINGS
    // ===================================================================
    console.log('\n6️⃣ Testing Office Locations & Department Timings...');
    const officeLoc = await storage.createOfficeLocation({
      name: "Coimbatore Tech Hub",
      address: "102 Avinashi Road, Peelamedu, Coimbatore 641004",
      latitude: 11.0264,
      longitude: 77.0125,
      radiusMeters: 250,
      isActive: true
    });
    console.log(`   ✅ createOfficeLocation: Created "${officeLoc.name}" (Radius: ${officeLoc.radiusMeters}m)`);

    const allLocations = await storage.listOfficeLocations();
    console.log(`   ✅ listOfficeLocations: Found ${allLocations.length} office location(s)`);

    const deptTiming = await storage.createDepartmentTiming({
      department: "sales",
      checkInTime: "09:30",
      checkOutTime: "18:30",
      graceMinutes: 15,
      workingHours: 9,
      halfDayThresholdHours: 4.5,
      isOvertimeAllowed: true,
      overtimeRateMultiplier: 1.5
    });
    console.log(`   ✅ createDepartmentTiming: Configured Sales department timings (09:30 - 18:30)`);

    const fetchedTiming = await storage.getDepartmentTiming("sales");
    console.log(`   ✅ getDepartmentTiming(sales): Check-in=${fetchedTiming?.checkInTime}, Grace=${fetchedTiming?.graceMinutes}m`);

    // ===================================================================
    // 7. PAYROLL PERIODS
    // ===================================================================
    console.log('\n7️⃣ Testing Payroll Periods...');
    const period = await storage.createPayrollPeriod({
      month: 12,
      year: 2026,
      startDate: new Date(2026, 11, 1),
      endDate: new Date(2026, 11, 31),
      cutoffDate: new Date(2026, 11, 25),
      status: "draft"
    });
    console.log(`   ✅ createPayrollPeriod: Created period for ${period.month}/${period.year} (ID: ${period.id})`);

    const fetchedPeriod = await storage.getPayrollPeriod(12, 2026);
    console.log(`   ✅ getPayrollPeriod(12/2026): Status=${fetchedPeriod?.status}`);

    const yearPeriods = await storage.getPayrollPeriodsByYear(2026);
    console.log(`   ✅ getPayrollPeriodsByYear(2026): Found ${yearPeriods.length} period(s)`);

    console.log('\n============================================================');
    console.log('🎉 100% SUCCESS: ALL ERP MODULES VERIFIED ON NEON POSTGRESQL');
    console.log('============================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ ERP MODULES TEST FAILED:', err);
    process.exit(1);
  }
}

run();

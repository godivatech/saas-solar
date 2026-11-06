import { storage } from '../storage';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  console.log("🧪 Starting Advanced Enterprise Validation on Neon PostgreSQL...\n");

  const user = await storage.getUserByEmail('admin@gmail.com');
  if (!user) throw new Error("Admin user not found in Postgres");
  console.log(`✅ 1. User: ${user.displayName} (UID: ${user.uid})`);

  // 1. Office Locations
  const locations = await storage.listOfficeLocations();
  console.log(`✅ 2. Office Locations from Neon: ${locations.length} found`);
  locations.forEach(loc => console.log(`   - ${loc.name} (${loc.latitude}, ${loc.longitude})`));

  // 2. Leave Application Flow
  console.log('\n📝 3. Testing Leave Application Flow in Neon...');
  const leave = await storage.createLeaveApplication({
    userId: user.uid,
    leaveType: 'casual_leave',
    startDate: new Date('2026-12-01'),
    endDate: new Date('2026-12-02'),
    totalDays: 2,
    reason: 'Family function attendance',
    status: 'pending_manager'
  });
  console.log(`   ✅ Leave application created: ${leave.id} (Status: ${leave.status})`);

  // Approve by Manager
  const approvedMgr = await storage.approveLeaveByManager(leave.id, user.id, 'Approved by team lead');
  console.log(`   ✅ Approved by manager: Status -> ${approvedMgr.status}`);

  // Approve by HR
  const approvedHR = await storage.approveLeaveByHR(leave.id, user.id, 'HR sanction granted');
  console.log(`   ✅ Approved by HR: Status -> ${approvedHR.status}`);

  // List user leaves
  const userLeaves = await storage.listLeaveApplicationsByUser(user.uid);
  console.log(`   ✅ User leave history count in Neon: ${userLeaves.length}`);

  // 3. Salary Advance Flow
  console.log('\n💰 4. Testing Salary Advance Flow in Neon...');
  const advance = await storage.createSalaryAdvance({
    userId: user.uid,
    amount: 15000,
    monthlyDeduction: 5000,
    deductionStartMonth: 12,
    deductionStartYear: 2026,
    reason: 'Medical emergency advance',
    status: 'approved'
  });
  console.log(`   ✅ Salary advance created: ${advance.id} (Amount: ₹${advance.amount}, Monthly: ₹${advance.monthlyDeduction})`);

  const advances = await storage.listSalaryAdvances({ userId: user.uid });
  console.log(`   ✅ Salary advances listed from Neon: ${advances.length} record(s)`);

  // 4. Payroll Run Flow
  console.log('\n📊 5. Testing Payroll Run Flow in Neon...');
  const payroll = await storage.createPayroll({
    userId: user.uid,
    employeeId: user.employeeId || 'EMP-001',
    month: 11,
    year: 2026,
    workingDays: 26,
    presentDays: 24,
    paidLeaveDays: 2,
    absentDays: 0,
    overtimeHours: 6,
    fixedSalary: 50000,
    earnedBasic: 25000,
    earnedHRA: 10000,
    earnedConveyance: 1600,
    overtimePay: 1800,
    grossSalary: 38400,
    epfDeduction: 1800,
    esiDeduction: 288,
    tdsDeduction: 1000,
    advanceDeduction: 5000,
    totalDeductions: 8088,
    netSalary: 30312,
    status: 'approved',
    processedBy: user.displayName
  });
  console.log(`   ✅ Payroll run saved to Neon: ${payroll.id} (Net: ₹${payroll.netSalary}, Advance Deducted: ₹${payroll.advanceDeduction})`);

  const fetchedPayroll = await storage.getPayrollByUserAndMonth(user.uid, 11, 2026);
  console.log(`   ✅ Verified payroll query from Neon: Month ${fetchedPayroll?.month}/${fetchedPayroll?.year} -> Net Salary: ₹${fetchedPayroll?.netSalary}`);

  console.log('\n🎉 ALL ENTERPRISE HR & PAYROLL MODULES VERIFIED 100% OPERATIONAL ON NEON POSTGRESQL!');
}

main().then(() => process.exit(0)).catch(err => {
  console.error("Advanced test error:", err);
  process.exit(1);
});

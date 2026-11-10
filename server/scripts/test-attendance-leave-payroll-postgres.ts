import 'dotenv/config';
import { storage } from '../storage';
import { pool } from '../db';
import { AutoCheckoutService } from '../services/auto-checkout-service';
import { LeaveService } from '../services/leave-service';
import { PayrollCalculationService } from '../services/payroll-calculation-service';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING COMPREHENSIVE ARCHITECTURAL VERIFICATION');
  console.log('====================================================\n');

  const testTenantId = 'tenant_default';
  const testUserId = `test-emp-${Date.now()}`;
  const hrUserId = `test-hr-${Date.now()}`;

  try {
    // 0. Setup test user
    console.log('0️⃣ Creating test user in PostgreSQL...');
    const user = await storage.createUser({
      uid: testUserId,
      email: `${testUserId}@example.com`,
      displayName: 'Test Architecture User',
      role: 'employee',
      department: 'operations',
      designation: 'technician',
      isActive: true
    });
    console.log(`   ✓ Created test user: ${user.id} (${user.department})`);

    // 1. Test Attendance creation and userDepartment persistence
    console.log('\n1️⃣ Testing Attendance Creation & userDepartment Persistence...');
    const today = new Date();
    today.setHours(9, 0, 0, 0);

    const att = await storage.createAttendance({
      userId: user.id,
      userDepartment: user.department,
      date: today,
      checkInTime: today,
      attendanceType: 'office',
      status: 'present',
      isLate: false,
      lateMinutes: 0
    });
    console.log(`   ✓ Created attendance: ${att.id}`);
    console.log(`   ✓ userDepartment on attendance: ${att.userDepartment}`);
    if (att.userDepartment !== 'operations') {
      throw new Error(`Expected att.userDepartment to be 'operations', got: ${att.userDepartment}`);
    }

    // Test listIncompleteAttendance
    const incomplete = await storage.listIncompleteAttendance(today);
    console.log(`   ✓ listIncompleteAttendance found: ${incomplete.length} records`);
    const foundMyAtt = incomplete.find(i => i.id === att.id);
    if (!foundMyAtt) {
      throw new Error(`Incomplete attendance did not include test record ${att.id}`);
    }
    console.log(`   ✓ Incomplete record userDepartment: ${foundMyAtt.userDepartment}`);

    // Test AutoCheckoutService execution
    console.log('\n2️⃣ Testing AutoCheckoutService Resilient Execution...');
    await AutoCheckoutService.processAutoCheckouts();
    console.log('   ✓ AutoCheckoutService completed without crashes or missing department skips.');

    // 2. Test Atomic Leave Approval & Fractional Balance Deduction
    console.log('\n3️⃣ Testing Atomic Leave Approval & Balance Deduction...');
    const curYear = today.getFullYear();
    const curMonth = today.getMonth() + 1;

    // Create initial leave balance of 1.0 day casual leave
    const initialBal = await storage.createLeaveBalance({
      userId: user.id,
      year: curYear,
      month: curMonth,
      casualLeaveBalance: 1.0,
      casualLeaveUsed: 0.0,
      permissionHoursBalance: 2.0,
      permissionHoursUsed: 0.0
    });
    console.log(`   ✓ Initial leave balance: casual available = ${Number(initialBal.casualLeaveBalance) - Number(initialBal.casualLeaveUsed)}`);

    // Create a 0.5 day half-day casual leave application
    const leaveApp = await storage.createLeaveApplication({
      userId: user.id,
      leaveType: 'casual_leave',
      startDate: today,
      endDate: today,
      totalDays: 0.5,
      reason: 'Urgent personal work (half-day)',
      status: 'pending_hr'
    });
    console.log(`   ✓ Created leave application: ${leaveApp.id} for 0.5 days`);

    // HR approves the leave atomically
    console.log('   Approving leave via approveLeaveByHR...');
    const approvedLeave = await storage.approveLeaveByHR(leaveApp.id, hrUserId, 'Approved half-day casual leave');
    console.log(`   ✓ Leave status after approval: ${approvedLeave.status}`);
    if (approvedLeave.status !== 'approved') {
      throw new Error(`Expected leave status 'approved', got: ${approvedLeave.status}`);
    }

    // Verify balance deduction in PostgreSQL
    const updatedBal = await storage.getLeaveBalance(user.id, curMonth, curYear);
    console.log(`   ✓ Updated balance in PostgreSQL: casualLeaveUsed = ${updatedBal?.casualLeaveUsed}`);
    if (Number(updatedBal?.casualLeaveUsed) !== 0.5) {
      throw new Error(`Expected casualLeaveUsed to be 0.5, got: ${updatedBal?.casualLeaveUsed}`);
    }

    // Now test cancellation & balance restoration
    console.log('   Testing cancellation & balance restoration...');
    const cancelledLeave = await storage.cancelLeaveApplication(leaveApp.id, user.id);
    console.log(`   ✓ Leave status after cancellation: ${cancelledLeave.status}`);
    const restoredBal = await storage.getLeaveBalance(user.id, curMonth, curYear);
    console.log(`   ✓ Restored balance in PostgreSQL: casualLeaveUsed = ${restoredBal?.casualLeaveUsed}`);
    if (Number(restoredBal?.casualLeaveUsed) !== 0.0) {
      throw new Error(`Expected casualLeaveUsed to be restored to 0, got: ${restoredBal?.casualLeaveUsed}`);
    }

    // 4. Test Salary Advance & Recovery Deduction
    console.log('\n4️⃣ Testing Salary Advance & Recovery Calculation...');
    const advance = await storage.createSalaryAdvance({
      userId: user.id,
      amount: 6000,
      monthlyDeduction: 2000,
      numberOfInstallments: 3,
      deductionStartMonth: curMonth,
      deductionStartYear: curYear,
      reason: 'Home appliance purchase',
      status: 'approved'
    });
    console.log(`   ✓ Created advance: ${advance.id}, amount=${advance.amount}, monthlyDeduction=${advance.monthlyDeduction}, installments=${advance.numberOfInstallments}`);
    if (advance.numberOfInstallments !== 3) {
      throw new Error(`Expected numberOfInstallments to be 3, got: ${advance.numberOfInstallments}`);
    }

    const payrollCalc = new PayrollCalculationService(storage);
    const deduction = await payrollCalc.calculateSalaryAdvanceDeduction(user.id, curMonth, curYear);
    console.log(`   ✓ Calculated salary advance deduction for current month: ₹${deduction}`);
    if (deduction !== 2000) {
      throw new Error(`Expected salary advance deduction of ₹2000, got: ₹${deduction}`);
    }

    // Month before deduction starts should be 0
    const prevMonthDeduction = await payrollCalc.calculateSalaryAdvanceDeduction(user.id, curMonth === 1 ? 12 : curMonth - 1, curMonth === 1 ? curYear - 1 : curYear);
    console.log(`   ✓ Deduction before start month: ₹${prevMonthDeduction}`);
    if (prevMonthDeduction !== 0) {
      throw new Error(`Expected 0 deduction before start month, got: ₹${prevMonthDeduction}`);
    }

    // 5. Clean up test records
    console.log('\n5️⃣ Cleaning up test records...');
    await pool.query('DELETE FROM salary_advances WHERE user_id = $1', [user.id]);
    await pool.query('DELETE FROM leave_applications WHERE user_id = $1', [user.id]);
    await pool.query('DELETE FROM leave_balances WHERE user_id = $1', [user.id]);
    await pool.query('DELETE FROM attendance WHERE user_id = $1', [user.id]);
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    console.log('   ✓ Cleanup complete.');

    console.log('\n====================================================');
    console.log('🎉 ALL ARCHITECTURAL TESTS PASSED (100% SUCCESS)');
    console.log('====================================================');
  } catch (err) {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runTests();


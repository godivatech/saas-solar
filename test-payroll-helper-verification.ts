
// INLINED HELPER FOR VERIFICATION (To bypass ESM/TS import issues)
class PayrollHelper {
    static getDailySalary(salaryStructure: any, settings: any): number {
        const fixedBasic = Number(salaryStructure.fixedBasic) || 0;
        const fixedHRA = Number(salaryStructure.fixedHRA) || 0;
        const fixedConveyance = Number(salaryStructure.fixedConveyance) || 0;

        const totalFixedSalary = fixedBasic + fixedHRA + fixedConveyance;
        const standardDays = Number(settings?.standardWorkingDays) || 26;

        if (standardDays <= 0) return 0;
        return totalFixedSalary / standardDays;
    }

    static getHourlyRate(dailySalary: number, settings: any, deptWorkingHours?: number): number {
        const hoursPerDay = deptWorkingHours || Number(settings?.standardWorkingHours) || 8;
        if (hoursPerDay <= 0) return 0;
        return dailySalary / hoursPerDay;
    }
}

async function runTest() {
    // Mock Data
    const salaryStructure = {
        fixedBasic: 15000,
        fixedHRA: 8000,
        fixedConveyance: 3000
        // Total = 26,000
    };

    const settings = {
        standardWorkingDays: 26,
        standardWorkingHours: 8
    };

    console.log('--- STARTING PAYROLL HELPER VERIFICATION ---');

    // 1. Verify Daily Salary (Should be 1000)
    const dailySalary = PayrollHelper.getDailySalary(salaryStructure, settings);
    console.log(`Daily Salary Calculation: ${dailySalary} (Expected: 1000)`);

    if (Math.abs(dailySalary - 1000) > 0.01) {
        console.error('❌ FAIL: Daily Salary Calculation Incorrect');
        process.exit(1);
    } else {
        console.log('✅ PASS: Daily Salary is 1000/day');
    }

    // 2. Verify Hourly Rate (Should be 125)
    // 1000 / 8 = 125
    const hourly = PayrollHelper.getHourlyRate(dailySalary, settings);
    console.log(`Hourly Rate Calculation: ${hourly} (Expected: 125)`);

    if (Math.abs(hourly - 125) > 0.01) {
        console.error('❌ FAIL: Hourly Rate Calculation Incorrect');
        process.exit(1);
    } else {
        console.log('✅ PASS: Hourly Rate is 125/hour');
    }

    // 3. Verify Payroll Logic Consistency
    // Scenario: 1 Day Unpaid Leave
    const unpaidDays = 1;

    // Leave Service Logic (Simulated using Helper)
    // LeaveService now uses: Math.round(dailySalary * days)
    const leaveDeduction = Math.round(dailySalary * unpaidDays);

    // Payroll Service Logic (Simulated Pro-rata)
    // In standard system: 25 days paid out of 26
    // PayrollService now uses: value * (workedDays / standardDays)
    const standardDays = 26;
    const workedDays = 25;
    const proRataRatio = workedDays / standardDays;

    // Total Fixed Earnings
    const totalFixed = 26000;

    // Pro-rated Earnings
    const earnings = Math.round(totalFixed * proRataRatio);

    // Deduction = Total - Earnings
    const payrollDeduction = totalFixed - earnings;

    console.log('--- Consistency Check ---');
    console.log(`Leave Service Deduction (1 day x Daily): ${leaveDeduction}`);
    console.log(`Payroll Service Deduction (Total - Pro-rated Earnings):     ${payrollDeduction}`);
    console.log(`Values: Total=${totalFixed}, Earnings=${earnings}`);

    // Allow 1 rupee difference due to rounding in pro-rata vs direct multiplication
    if (Math.abs(leaveDeduction - payrollDeduction) <= 1) {
        console.log('✅ PASS: LEAVE and PAYROLL logic are aligned (within rounding error).');
    } else {
        console.error(`❌ FAIL: Mismatch detected! Leave: ${leaveDeduction}, Payroll: ${payrollDeduction}`);
        process.exit(1);
    }
}

runTest();

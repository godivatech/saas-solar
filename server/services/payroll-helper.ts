/**
 * Payroll Helper Service
 * The Single Source of Truth for all salary calculations.
 * 
 * Enforces:
 * 1. Daily Salary Base = Total Fixed Salary (Basic + HRA + Conveyance)
 * 2. Divisor = Standard Working Days (from settings, default 26)
 * 3. Consistent Pro-rating for Payroll, Leave, and OT
 */

export class PayrollHelper {
    /**
     * Calculate Daily Salary based on Total Fixed Salary and Standard Days.
     * @param salaryStructure - Employee's salary structure (must contain fixedBasic, etc.)
     * @param settings - Global payroll settings (must contain standardWorkingDays)
     */
    static getDailySalary(salaryStructure: any, settings: any): number {
        // Enforce Total Fixed Salary Base
        const fixedBasic = Number(salaryStructure.fixedBasic) || 0;
        const fixedHRA = Number(salaryStructure.fixedHRA) || 0;
        const fixedConveyance = Number(salaryStructure.fixedConveyance) || 0;

        const totalFixedSalary = fixedBasic + fixedHRA + fixedConveyance;

        // Enforce Divisor Rule (Global Settings > Default 26)
        // NOT 30, NOT 31, NOT Calendar Days
        const standardDays = Number(settings?.standardWorkingDays) || 26;

        if (standardDays <= 0) return 0; // Safety check

        return totalFixedSalary / standardDays;
    }

    /**
     * Calculate Hourly Rate derived from Daily Salary
     * @param dailySalary - Calculated daily salary
     * @param settings - Global payroll settings (must contain standardWorkingHours)
     */
    static getHourlyRate(dailySalary: number, settings: any, deptWorkingHours?: number): number {
        // Use department hours if provided, otherwise global standard
        const hoursPerDay = deptWorkingHours || Number(settings?.standardWorkingHours) || 8;

        if (hoursPerDay <= 0) return 0;

        return dailySalary / hoursPerDay;
    }

    /**
     * Calculate Pro-rated Earnings
     * @param dailySalary - The single source daily salary
     * @param workingDays - Total payable days (Attendance + Paid Leave + Holidays)
     */
    static calculateProRatedEarnings(dailySalary: number, workingDays: number): number {
        return dailySalary * workingDays;
    }
}

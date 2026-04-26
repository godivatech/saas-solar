import { IStorage } from "../storage";
import { LeaveService } from "./leave-service";
import { PayrollHelper } from "./payroll-helper";

/**
 * Enterprise Payroll Calculation Service
 * Handles comprehensive payroll calculation including:
 * - Overtime pay calculation
 * - Leave integration (paid and unpaid)
 * - Salary advance deductions
 * - Pro-rated earnings and deductions
 */
export class PayrollCalculationService {
  constructor(private storage: IStorage) { }

  /**
   * Calculate overtime pay based on salary structure and hours worked
   */
  async calculateOvertimePay(
    userId: string,
    overtimeHours: number,
    salaryStructure: any,
    settings?: any, // PayrollSettings
    departmentId?: string
  ): Promise<number> {
    if (overtimeHours <= 0) return 0;

    // Calculate base components for hourly rate
    const fixedBasic = salaryStructure.fixedBasic || 0;
    const fixedHRA = salaryStructure.fixedHRA || 0;
    const fixedConveyance = salaryStructure.fixedConveyance || 0;
    const totalFixedSalary = fixedBasic + fixedHRA + fixedConveyance;

    // All employees use uniform company rate (1.0x)
    // No employee-specific overrides
    const overtimeRate = 1.0;

    // Calculate hourly rate based on standard working days and hours
    // If departmentId is provided, get department-specific working hours
    let standardWorkingHours = settings?.standardWorkingHours || 8;

    if (departmentId) {
      try {
        const deptTiming = await this.storage.getDepartmentTiming(departmentId);
        if (deptTiming && deptTiming.workingHours) {
          standardWorkingHours = deptTiming.workingHours;
          console.log(`PAYROLL_CALC: Using department (${departmentId}) working hours: ${standardWorkingHours}`);
        }
      } catch (error) {
        console.error(`PAYROLL_CALC: Error fetching department timing for ${departmentId}:`, error);
      }
    }

    const dailySalary = PayrollHelper.getDailySalary(salaryStructure, settings);
    const hourlyRate = PayrollHelper.getHourlyRate(dailySalary, settings, standardWorkingHours);

    // Calculate overtime pay
    const overtimePay = overtimeHours * hourlyRate * overtimeRate;

    console.log('PAYROLL_CALC: Overtime calculation:', {
      userId,
      overtimeHours,
      totalFixedSalary,
      hourlyRate: hourlyRate.toFixed(2),
      overtimeRate,
      overtimePay: overtimePay.toFixed(2),
      standardWorkingHours
    });

    return Math.round(overtimePay);
  }

  /**
   * Get approved paid leave days for a specific month/year
   * Handles multi-day leaves that span months correctly
   * Supports: casual_leave (paid), permission (paid partial day)
   */
  async getPaidLeaveDays(
    userId: string,
    month: number,
    year: number,
    departmentId?: string
  ): Promise<number> {
    try {
      const leaves = await this.storage.listLeaveApplicationsByUser(userId);

      // Filter for approved paid leave types (casual_leave, permission)
      const paidLeaves = leaves.filter(leave => {
        if (leave.status !== 'approved') return false;
        if (leave.leaveType !== 'casual_leave' && leave.leaveType !== 'permission') return false;
        if (!leave.startDate || !leave.endDate) return false;
        return true;
      });

      let totalPaidDays = 0;

      for (const leave of paidLeaves) {
        if (!leave.startDate || !leave.endDate) continue;

        const startDate = new Date(leave.startDate);
        const endDate = new Date(leave.endDate);

        // Get the first and last day of the payroll month (end of day for last day)
        const monthStart = new Date(year, month - 1, 1);
        const monthEnd = new Date(year, month, 0, 23, 59, 59, 999); // End of last day of month

        // Find overlap between leave period and payroll month
        const overlapStart = startDate > monthStart ? startDate : monthStart;
        const overlapEnd = endDate < monthEnd ? endDate : monthEnd;

        // Check if there's any overlap
        if (overlapStart <= overlapEnd) {
          // Calculate number of days in the overlap
          const daysInMonth = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

          // For permission (partial day), convert hours to days
          if (leave.leaveType === 'permission') {
            const permissionHours = leave.permissionHours || 0; // Fixed: Use permissionHours

            // Use department-specific working hours if available
            let workingHoursPerDay = 8;
            if (departmentId) {
              try {
                const deptTiming = await this.storage.getDepartmentTiming(departmentId);
                if (deptTiming && deptTiming.workingHours) {
                  workingHoursPerDay = deptTiming.workingHours;
                }
              } catch (error) {
                console.error(`PAYROLL_CALC: Error fetching department timing for ${departmentId}:`, error);
              }
            }

            const partialDays = permissionHours / workingHoursPerDay;
            totalPaidDays += partialDays;
            console.log(`PAYROLL_CALC: Permission leave for ${userId}: ${permissionHours} hours = ${partialDays.toFixed(2)} days`);
          } else {
            // Casual leave - full days
            totalPaidDays += daysInMonth;
            console.log(`PAYROLL_CALC: Casual leave for ${userId}: ${daysInMonth} days in month ${month}/${year} (from ${startDate.toDateString()} to ${endDate.toDateString()})`);
          }
        }
      }

      console.log('PAYROLL_CALC: Total paid leave days:', {
        userId,
        month,
        year,
        approvedLeaves: paidLeaves.length,
        totalPaidDays: totalPaidDays.toFixed(2)
      });

      return totalPaidDays;
    } catch (error) {
      console.error('Error calculating paid leave days:', error);
      return 0;
    }
  }

  /**
   * Calculate unpaid leave deductions for a specific month/year
   * Handles multi-day leaves that span months correctly
   * Applies to: unpaid_leave type and any leave with affectsPayroll=true
   */
  async calculateUnpaidLeaveDeduction(
    userId: string,
    month: number,
    year: number,
    totalFixedSalary: number
  ): Promise<number> {
    try {
      const leaves = await this.storage.listLeaveApplicationsByUser(userId);

      // Filter for approved unpaid leaves
      const unpaidLeaves = leaves.filter(leave => {
        if (leave.status !== 'approved') return false;
        if (!leave.startDate || !leave.endDate) return false;

        // Include unpaid_leave type OR any leave that affects payroll (excluding paid types)
        const isUnpaidType = leave.leaveType === 'unpaid_leave';
        const isPaidType = leave.leaveType === 'casual_leave' || leave.leaveType === 'permission';
        const affectsPayroll = leave.affectsPayroll === true;

        return isUnpaidType || (affectsPayroll && !isPaidType);
      });

      let totalUnpaidDays = 0;

      for (const leave of unpaidLeaves) {
        const startDate = new Date(leave.startDate);
        const endDate = new Date(leave.endDate);

        // Get the first and last day of the payroll month (end of day for last day)
        const monthStart = new Date(year, month - 1, 1);
        const monthEnd = new Date(year, month, 0, 23, 59, 59, 999); // End of last day of month

        // Find overlap between leave period and payroll month
        const overlapStart = startDate > monthStart ? startDate : monthStart;
        const overlapEnd = endDate < monthEnd ? endDate : monthEnd;

        // Check if there's any overlap
        if (overlapStart <= overlapEnd) {
          // Calculate number of days in the overlap
          const daysInMonth = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          totalUnpaidDays += daysInMonth;

          console.log(`PAYROLL_CALC: Unpaid leave for ${userId}: ${daysInMonth} days in month ${month}/${year} (from ${startDate.toDateString()} to ${endDate.toDateString()})`);
        }
      }

      // Calculate per-day salary and deduction
      // Calculate per-day salary and deduction using STANDARD DAYS
      const settings = await this.storage.getPayrollSettings();
      const dailySalary = PayrollHelper.getDailySalary({
        fixedBasic: totalFixedSalary, // Passing total as one component since we only need the sum
        fixedHRA: 0,
        fixedConveyance: 0
      }, settings);

      const unpaidDeduction = totalUnpaidDays * dailySalary;

      console.log('PAYROLL_CALC: Total unpaid leave deduction:', {
        userId,
        month,
        year,
        unpaidLeaves: unpaidLeaves.length,
        totalUnpaidDays,
        perDaySalary: dailySalary.toFixed(2),
        unpaidDeduction: unpaidDeduction.toFixed(2)
      });

      return Math.round(unpaidDeduction);
    } catch (error) {
      console.error('Error calculating unpaid leave deduction:', error);
      return 0;
    }
  }

  /**
   * Calculate salary advance deductions for a specific month/year
   */
  async calculateSalaryAdvanceDeduction(
    userId: string,
    month: number,
    year: number
  ): Promise<number> {
    try {
      // Get all approved salary advances for the user
      const advances = await this.storage.listSalaryAdvances({
        userId,
        status: 'approved'
      });

      // Filter advances where deduction applies to this month/year
      const applicableAdvances = advances.filter(advance => {
        const deductionStartMonth = advance.deductionStartMonth;
        const deductionStartYear = advance.deductionStartYear;

        if (!deductionStartMonth || !deductionStartYear) return false;

        // Create date objects for comparison
        const startDate = new Date(deductionStartYear, deductionStartMonth - 1);
        const currentDate = new Date(year, month - 1);

        // Check if current month is within deduction period
        if (currentDate < startDate) return false;

        // Calculate number of months since deduction started
        const monthsSinceStart = (year - deductionStartYear) * 12 + (month - deductionStartMonth);

        // Check if deduction is still active (within number of installments)
        return monthsSinceStart < advance.numberOfInstallments;
      });

      const totalAdvanceDeduction = applicableAdvances.reduce(
        (sum, advance) => sum + (advance.monthlyDeduction || 0),
        0
      );

      console.log('PAYROLL_CALC: Salary advance deduction:', {
        userId,
        month,
        year,
        applicableAdvances: applicableAdvances.length,
        totalDeduction: totalAdvanceDeduction
      });

      return Math.round(totalAdvanceDeduction);
    } catch (error) {
      console.error('Error calculating salary advance deduction:', error);
      return 0;
    }
  }

  /**
   * Comprehensive payroll calculation with all integrations
   */
  async calculateComprehensivePayroll(
    userId: string,
    month: number,
    year: number,
    attendanceRecords: any[],
    salaryStructure: any,
    departmentId?: string
  ) {
    // Get month details (ONLY used for displaying Days in Month, NOT for calculation)
    const monthDays = new Date(year, month, 0).getDate();

    // Fetch Global Payroll Settings
    const fetchedSettings = await this.storage.getPayrollSettings();
    // SAFETY FIX: Default settings to {} to prevent undefined crash in calculations
    const settings = fetchedSettings || {} as any;

    // Calculate present days from attendance with weighted units
    // CRITICAL: half_day = 0.5, present/late/holiday/weekly_off = 1.0
    const presentDays = attendanceRecords.reduce((total, record) => {
      // BLOCK: Records pending admin review are excluded from payroll (Treat as 0 days)
      if (record.adminReviewStatus === 'pending') return total;

      if (record.status === 'half_day') return total + 0.5;

      const fullPayStatuses = ['present', 'late', 'overtime', 'early_checkout', 'holiday', 'weekly_off'];
      if (fullPayStatuses.includes(record.status)) return total + 1.0;

      return total;
    }, 0);

    // Get paid leave days
    const paidLeaveDays = await this.getPaidLeaveDays(userId, month, year, departmentId);

    // Calculate total working days (attendance + paid leave)
    const totalWorkingDays = presentDays + paidLeaveDays;

    // Calculate fixed salary components
    const fixedBasic = salaryStructure.fixedBasic || 0;
    const fixedHRA = salaryStructure.fixedHRA || 0;
    const fixedConveyance = salaryStructure.fixedConveyance || 0;
    const totalFixedSalary = fixedBasic + fixedHRA + fixedConveyance;

    // Pro-rate earnings based on total working days (attendance + paid leave)
    // Pro-rate earnings based on STANDARD DAYS (via PayrollHelper)
    // We calculate the ratio of worked days to standard days (e.g. 26)
    // ratio = totalWorkingDays / standardWorkingDays
    const standardWorkingDays = settings.standardWorkingDays || 26;
    const proRataRatio = totalWorkingDays / standardWorkingDays;

    const earnedBasic = fixedBasic * proRataRatio;
    const earnedHRA = fixedHRA * proRataRatio;
    const earnedConveyance = fixedConveyance * proRataRatio;

    // Get holidays for the month (for OT rate calculation)
    const { HolidayService } = await import('./holiday-service');
    const monthlyHolidays = await HolidayService.getHolidaysForMonth(month, year);

    // Create a map for O(1) holiday lookup by date string (YYYY-MM-DD)
    const holidayMap = new Map();
    monthlyHolidays.forEach(h => {
      const dateStr = new Date(h.date).toISOString().split('T')[0];
      holidayMap.set(dateStr, h);
    });

    // Calculate overtime hours and pay
    // ZERO-FRAUD LOGIC: Only count APPROVED sessions (and legacy 'completed')
    // STRICTLY EXCLUDE sessions with status 'PENDING_REVIEW' or 'REJECTED'
    // RATE INTEGRETY FIX: Calculate "Weighted Effective Hours" based on OT Type logic
    const totalWeightedOvertimeHours = attendanceRecords.reduce((sum, record) => {
      // Exclude records pending attendance review
      if (record.adminReviewStatus === 'pending') return sum;

      // NEW OT SYSTEM: Filter by session status
      if (record.otSessions && Array.isArray(record.otSessions)) {
        const approvedWeightedHours = record.otSessions
          .filter((s: any) => {
            // Include legacy 'completed' status (backward compatibility)
            if (s.status === 'completed') return true;
            // Include new 'APPROVED' status
            if (s.status === 'APPROVED') return true;
            // EXCLUDE all others ('in_progress', 'PENDING_REVIEW', 'REJECTED', 'locked')
            return false;
          })
          .reduce((hours: number, s: any) => {
            const rawHours = s.otHours || 0;

            // Use uniform OT rate for all types (weekday, weekend, holiday)
            // OT rate is calculated from employee salary, no day-type premium
            const multiplier = settings.defaultOTRate || 1.0;

            // Return weighted hours (e.g. 5 hours * 1.0 rate = 5 effective hours)
            return hours + (rawHours * multiplier);
          }, 0);
        return sum + approvedWeightedHours;
      }

      // LEGACY FIELDS: Fallback for old records (assume 1.0x rate)
      return sum + (record.totalOTHours || record.overtimeHours || record.manualOTHours || 0);
    }, 0);

    // ROUNDING FIX: Ensure 2 decimal precision to avoid floating point artifacts (e.g. 3.999999)
    const finalWeightedHours = Math.round(totalWeightedOvertimeHours * 100) / 100;

    // Pass '1.0' as the rate multiplier since we already applied the weights above
    // This allows the weighted sum to be multiplied by the hourly rate directly
    // SAFETY FIX: Default settings to {} to prevent undefined crash
    const safeSettings = settings || {};
    const overtimePay = await this.calculateOvertimePay(
      userId,
      finalWeightedHours,
      salaryStructure,
      safeSettings, // Use settings as-is (OT rate in CompanySettings)
      departmentId
    );

    // Calculate dynamic earnings (pro-rated)
    const dynamicEarnings = { ...(salaryStructure.dynamicEarnings || {}) };
    let totalDynamicEarnings = 0;
    Object.entries(dynamicEarnings).forEach(([key, value]) => {
      if (typeof value === 'number' && value > 0) {
        // Dynamic earnings also follow the standard day pro-rating?
        // Usually these are fixed monthly amounts that get pro-rated.
        // If we strictly follow "Standard 26 Day" rule:
        const earnedAmount = value * proRataRatio;
        dynamicEarnings[key] = Math.round(earnedAmount);
        totalDynamicEarnings += earnedAmount;
      }
    });

    // Calculate gross salary
    const grossSalary = earnedBasic + earnedHRA + earnedConveyance + totalDynamicEarnings + overtimePay;

    // Calculate statutory deductions using Settings
    // EPF Logic: Rate defaults to 12%, Ceiling defaults to 15000 (usually 1800 limit)
    const epfRate = (settings?.pfRate || 12) / 100;
    const epfCeiling = settings?.pfApplicableFromSalary || 15000; // Salary limit for PF
    const maxEpfDeduction = epfCeiling * epfRate; // e.g., 1800

    // LEGAL BUG FIX: EPF is calculated on FIXED BASIC, not Earned Basic
    // This ensures compliance even if employee takes leave
    const epfBasis = fixedBasic > settings.epfCeiling ? settings.epfCeiling : fixedBasic;
    const epfDeduction = salaryStructure.epfApplicable
      ? Math.round(Math.min(epfBasis * (settings.epfEmployeeRate / 100), settings.epfCeiling * (settings.epfEmployeeRate / 100)))
      : 0;

    // ESI Calculation (on Gross)
    // If Gross <= 21000, 0.75% for Employee
    const esiEligible = grossSalary <= settings.esiThreshold;
    const esiDeduction = (salaryStructure.esiApplicable && esiEligible)
      ? Math.ceil(grossSalary * (settings.esiEmployeeRate / 100))
      : 0;

    const vptDeduction = salaryStructure.vptAmount || 0;

    // Calculate dynamic deductions (pro-rated)
    const dynamicDeductions = { ...(salaryStructure.dynamicDeductions || {}) };
    let totalDynamicDeductions = 0;
    Object.entries(dynamicDeductions).forEach(([key, value]) => {
      if (typeof value === 'number' && value > 0) {
        const deductedAmount = value * proRataRatio;
        dynamicDeductions[key] = Math.round(deductedAmount);
        totalDynamicDeductions += deductedAmount;
      }
    });

    // Calculate unpaid leave deduction
    const unpaidLeaveDeduction = await this.calculateUnpaidLeaveDeduction(
      userId,
      month,
      year,
      // Note: Unpaid leave deduction inside the service might need similar adjustment
      // But we passed totalFixedSalary. 
      // Ideally, `calculateUnpaidLeaveDeduction` should also use PayrollHelper logic.
      // Let's verify that method next.
      totalFixedSalary
    );

    // Calculate salary advance deduction
    const salaryAdvanceDeduction = await this.calculateSalaryAdvanceDeduction(
      userId,
      month,
      year
    );

    // Calculate total deductions
    const totalDeductions =
      epfDeduction +
      esiDeduction +
      vptDeduction +
      totalDynamicDeductions +
      unpaidLeaveDeduction +
      salaryAdvanceDeduction;

    // Calculate net salary
    const netSalary = grossSalary - totalDeductions;

    console.log('PAYROLL_CALC: Comprehensive calculation complete:', {
      userId,
      month,
      year,
      presentDays,
      paidLeaveDays,
      totalWorkingDays,
      overtimeHours: finalWeightedHours,
      overtimePay,
      grossSalary: Math.round(grossSalary),
      totalDeductions: Math.round(totalDeductions),
      netSalary: Math.round(netSalary)
    });

    return {
      monthDays,
      presentDays,
      paidLeaveDays,
      overtimeHours: finalWeightedHours,
      perDaySalary: Math.round(PayrollHelper.getDailySalary(salaryStructure, settings)),
      earnedBasic: Math.round(earnedBasic),
      earnedHRA: Math.round(earnedHRA),
      earnedConveyance: Math.round(earnedConveyance),
      overtimePay: Math.round(overtimePay),
      dynamicEarnings,
      grossSalary: Math.round(grossSalary),
      epfDeduction: Math.round(epfDeduction),
      esiDeduction: Math.round(esiDeduction),
      vptDeduction: Math.round(vptDeduction),
      dynamicDeductions,
      unpaidLeaveDeduction: Math.round(unpaidLeaveDeduction),
      salaryAdvanceDeduction: Math.round(salaryAdvanceDeduction),
      totalEarnings: Math.round(grossSalary),
      totalDeductions: Math.round(totalDeductions),
      netSalary: Math.round(netSalary),
      esiEligible: grossSalary <= esiThreshold
    };
  }
}

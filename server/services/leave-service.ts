import { IStorage } from "../storage";
import { InsertLeaveApplication, LeaveApplication, FIXED_ANNUAL_HOLIDAYS } from "@shared/schema";
import { PayrollHelper } from "./payroll-helper";
import { getUTCMidnight, getUTCEndOfDay } from "../utils/timezone-helpers";

export class LeaveService {
  constructor(private storage: IStorage) { }

  async validateLeaveApplication(
    data: Partial<InsertLeaveApplication>,
    userId: string
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (data.leaveType === "casual_leave" || data.leaveType === "unpaid_leave") {
      if (!data.startDate || !data.endDate) {
        errors.push("Start date and end date are required for leave applications");
        return { valid: false, errors };
      }

      const start = new Date(data.startDate);
      const end = new Date(data.endDate);

      if (start > end) {
        errors.push("Start date cannot be after end date");
      }

      if (await this.isHoliday(start)) {
        errors.push(`Start date ${start.toDateString()} is a holiday`);
      }

      if (await this.isSunday(start)) {
        errors.push(`Start date ${start.toDateString()} is a Sunday`);
      }

      const hasOverlap = await this.checkLeaveOverlap(userId, start, end);
      if (hasOverlap) {
        errors.push("Leave dates overlap with an existing approved leave");
      }
    }

    if (data.leaveType === "permission") {
      if (!data.permissionDate) {
        errors.push("Permission date is required");
        return { valid: false, errors };
      }

      const permissionDate = new Date(data.permissionDate);

      if (await this.isHoliday(permissionDate)) {
        errors.push(`Permission date ${permissionDate.toDateString()} is a holiday`);
      }

      if (await this.isSunday(permissionDate)) {
        errors.push(`Permission date ${permissionDate.toDateString()} is a Sunday`);
      }

      if (!data.permissionHours || data.permissionHours > 2) {
        errors.push("Permission hours cannot exceed 2 hours");
      }
    }

    if (data.leaveType === "casual_leave") {
      const balance = await this.storage.getCurrentLeaveBalance(userId);
      if (balance) {
        const available = balance.casualLeaveBalance - balance.casualLeaveUsed;
        if (data.totalDays && data.totalDays > available) {
          errors.push(`Insufficient casual leave balance. Available: ${available} day(s)`);
        }
      }
    }

    if (data.leaveType === "permission") {
      const balance = await this.storage.getCurrentLeaveBalance(userId);
      if (balance) {
        const available = balance.permissionHoursBalance - balance.permissionHoursUsed;
        if (data.permissionHours && data.permissionHours > available) {
          errors.push(`Insufficient permission hours. Available: ${available} hour(s)`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  async checkLeaveOverlap(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<boolean> {
    const leaves = await this.storage.listLeaveApplicationsByUser(userId);

    for (const leave of leaves) {
      if (leave.status === "approved" || leave.status === "pending_manager" || leave.status === "pending_hr") {
        if (leave.leaveType !== "permission" && leave.startDate && leave.endDate) {
          const leaveStart = new Date(leave.startDate);
          const leaveEnd = new Date(leave.endDate);

          if (
            (startDate >= leaveStart && startDate <= leaveEnd) ||
            (endDate >= leaveStart && endDate <= leaveEnd) ||
            (startDate <= leaveStart && endDate >= leaveEnd)
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }

  async isHoliday(date: Date): Promise<boolean> {
    const holidays = await this.storage.listFixedHolidays(date.getFullYear());
    return holidays.some(holiday => {
      const holidayDate = new Date(holiday.date);
      return (
        holidayDate.getDate() === date.getDate() &&
        holidayDate.getMonth() === date.getMonth() &&
        holidayDate.getFullYear() === date.getFullYear()
      );
    });
  }

  isSunday(date: Date): boolean {
    return date.getDay() === 0;
  }

  /**
   * P1.2: Check if a user has approved leave on a specific date
   * Used by AutoCheckoutService to skip leave days
   */
  async hasLeaveOnDate(userId: string, date: Date): Promise<boolean> {
    const leaves = await this.storage.listLeaveApplicationsByUser(userId);
    // Use UTC midnight for consistent date comparison
    const targetDate = getUTCMidnight(date);

    for (const leave of leaves) {
      // Only check approved leaves
      if (leave.status !== "approved") continue;

      if (leave.leaveType === "permission") {
        // For permission, check if it's on the same day (UTC-safe)
        if (leave.permissionDate) {
          const permDate = getUTCMidnight(new Date(leave.permissionDate));
          if (permDate.getTime() === targetDate.getTime()) {
            return true;
          }
        }
      } else if (leave.startDate && leave.endDate) {
        // For full-day leaves, check if date falls within range (UTC-safe)
        const leaveStart = getUTCMidnight(new Date(leave.startDate));
        const leaveEnd = getUTCEndOfDay(new Date(leave.endDate));

        if (targetDate >= leaveStart && targetDate <= leaveEnd) {
          return true;
        }
      }
    }

    return false;
  }

  async calculatePayrollDeduction(
    userId: string,
    leaveType: string,
    days: number
  ): Promise<number> {
    if (leaveType !== "unpaid_leave") {
      return 0;
    }

    const salaryStructure = await this.storage.getSalaryStructureByUser(userId);
    if (!salaryStructure) {
      return 0;
    }

    const settings = await this.storage.getPayrollSettings();
    const dailySalary = PayrollHelper.getDailySalary(salaryStructure, settings);

    return Math.round(dailySalary * days);
  }

  async updateLeaveBalanceOnApproval(leaveId: string): Promise<void> {
    const leave = await this.storage.getLeaveApplication(leaveId);
    if (!leave || leave.status !== "approved") {
      return;
    }

    const balance = await this.storage.getCurrentLeaveBalance(leave.userId);
    if (!balance) {
      return;
    }

    if (leave.leaveType === "casual_leave" && leave.totalDays) {
      await this.storage.updateLeaveBalance(balance.id, {
        casualLeaveUsed: balance.casualLeaveUsed + leave.totalDays,
        casualLeaveHistory: [
          ...balance.casualLeaveHistory,
          {
            date: new Date(),
            days: leave.totalDays,
            leaveId: leave.id,
          },
        ],
      });
    }

    if (leave.leaveType === "permission" && leave.permissionHours) {
      await this.storage.updateLeaveBalance(balance.id, {
        permissionHoursUsed: balance.permissionHoursUsed + leave.permissionHours,
        permissionHistory: [
          ...balance.permissionHistory,
          {
            date: new Date(),
            hours: leave.permissionHours,
            leaveId: leave.id,
          },
        ],
      });
    }
  }

  async getLeaveStatistics(userId: string, month: number, year: number) {
    const balance = await this.storage.getLeaveBalance(userId, month, year);
    const leaves = await this.storage.listLeaveApplicationsByUser(userId);

    const monthLeaves = leaves.filter(leave => {
      const appDate = new Date(leave.applicationDate || leave.createdAt);
      return appDate.getMonth() + 1 === month && appDate.getFullYear() === year;
    });

    return {
      balance: balance ? {
        casualLeaveAvailable: balance.casualLeaveBalance - balance.casualLeaveUsed,
        permissionHoursAvailable: balance.permissionHoursBalance - balance.permissionHoursUsed,
        casualLeaveUsed: balance.casualLeaveUsed,
        permissionHoursUsed: balance.permissionHoursUsed,
      } : null,
      totalApplications: monthLeaves.length,
      approved: monthLeaves.filter(l => l.status === "approved").length,
      pending: monthLeaves.filter(l => l.status === "pending_manager" || l.status === "pending_hr").length,
      rejected: monthLeaves.filter(l => l.status === "rejected_by_manager" || l.status === "rejected_by_hr").length,
    };
  }
}

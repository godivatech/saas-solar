import { IStorage } from "../storage";
import { InsertLeaveBalance, FIXED_ANNUAL_HOLIDAYS } from "@shared/schema";

export class LeaveBalanceService {
  constructor(private storage: IStorage) {}

  async resetMonthlyLeaveBalances(month: number, year: number): Promise<void> {
    console.log(`[LeaveBalanceService] Starting monthly reset for ${month}/${year}`);
    
    try {
      const users = await this.storage.listUsers();
      const activeUsers = users.filter(u => u.isActive);

      console.log(`[LeaveBalanceService] Found ${activeUsers.length} active users`);

      for (const user of activeUsers) {
        const existingBalance = await this.storage.getLeaveBalance(user.uid, month, year);
        
        if (existingBalance) {
          console.log(`[LeaveBalanceService] Balance already exists for user ${user.uid} in ${month}/${year}`);
          continue;
        }

        const balanceData: InsertLeaveBalance = {
          userId: user.uid,
          employeeId: user.employeeId || "",
          casualLeaveBalance: 1,
          permissionHoursBalance: 2,
          casualLeaveUsed: 0,
          permissionHoursUsed: 0,
          year,
          month,
          casualLeaveHistory: [],
          permissionHistory: [],
          lastResetDate: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await this.storage.createLeaveBalance(balanceData);
        console.log(`[LeaveBalanceService] Created balance for user ${user.uid}`);
      }

      console.log(`[LeaveBalanceService] Monthly reset completed for ${month}/${year}`);
    } catch (error) {
      console.error(`[LeaveBalanceService] Error during monthly reset:`, error);
      throw error;
    }
  }

  async initializeBalanceForUser(userId: string, employeeId: string): Promise<void> {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const existingBalance = await this.storage.getLeaveBalance(userId, currentMonth, currentYear);
    
    if (existingBalance) {
      console.log(`[LeaveBalanceService] Balance already exists for user ${userId}`);
      return;
    }

    const balanceData: InsertLeaveBalance = {
      userId,
      employeeId,
      casualLeaveBalance: 1,
      permissionHoursBalance: 2,
      casualLeaveUsed: 0,
      permissionHoursUsed: 0,
      year: currentYear,
      month: currentMonth,
      casualLeaveHistory: [],
      permissionHistory: [],
      lastResetDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.storage.createLeaveBalance(balanceData);
    console.log(`[LeaveBalanceService] Initialized balance for new user ${userId}`);
  }

  async getBalanceSummary(userId: string) {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const balance = await this.storage.getLeaveBalance(userId, currentMonth, currentYear);
    
    if (!balance) {
      return {
        casualLeaveBalance: 1,
        casualLeaveUsed: 0,
        casualLeaveAvailable: 1,
        permissionHoursBalance: 2,
        permissionHoursUsed: 0,
        permissionHoursAvailable: 2,
        month: currentMonth,
        year: currentYear,
        lastResetDate: null,
      };
    }

    return {
      casualLeaveBalance: balance.casualLeaveBalance,
      casualLeaveUsed: balance.casualLeaveUsed,
      casualLeaveAvailable: balance.casualLeaveBalance - balance.casualLeaveUsed,
      permissionHoursBalance: balance.permissionHoursBalance,
      permissionHoursUsed: balance.permissionHoursUsed,
      permissionHoursAvailable: balance.permissionHoursBalance - balance.permissionHoursUsed,
      month: balance.month,
      year: balance.year,
      lastResetDate: balance.lastResetDate,
    };
  }

  async initializeFixedHolidaysForYear(year: number, createdBy: string): Promise<void> {
    console.log(`[LeaveBalanceService] Initializing fixed holidays for ${year}`);
    
    try {
      const existingHolidays = await this.storage.listFixedHolidays(year);
      
      if (existingHolidays.length > 0) {
        console.log(`[LeaveBalanceService] Holidays already exist for ${year}`);
        return;
      }

      for (const holiday of FIXED_ANNUAL_HOLIDAYS) {
        const holidayDate = new Date(year, holiday.month - 1, holiday.day);
        
        await this.storage.createFixedHoliday({
          name: holiday.name,
          date: holidayDate,
          year,
          type: "national",
          isPaid: true,
          isOptional: false,
          createdBy,
          createdAt: new Date(),
        });
      }

      console.log(`[LeaveBalanceService] Fixed holidays initialized for ${year}`);
    } catch (error) {
      console.error(`[LeaveBalanceService] Error initializing holidays:`, error);
      throw error;
    }
  }

  async getUpcomingHolidays(year?: number): Promise<any[]> {
    const targetYear = year || new Date().getFullYear();
    const holidays = await this.storage.listFixedHolidays(targetYear);
    const now = new Date();

    return holidays
      .filter(holiday => new Date(holiday.date) >= now)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  async runScheduledMonthlyReset(): Promise<void> {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    if (now.getDate() === 1) {
      await this.resetMonthlyLeaveBalances(currentMonth, currentYear);
    }
  }
}

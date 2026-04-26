/**
 * Attendance Cache Service
 * Google-level caching for attendance operations
 */

import { performanceOptimizer } from './performance-optimizer';

interface AttendanceCacheConfig {
  userAttendanceToday: number;      // 30 seconds
  departmentStats: number;          // 2 minutes  
  attendanceList: number;           // 1 minute
  userProfile: number;              // 5 minutes
  departmentTiming: number;         // 10 minutes
}

const CACHE_TTL: AttendanceCacheConfig = {
  userAttendanceToday: 30000,
  departmentStats: 120000,
  attendanceList: 60000,
  userProfile: 300000,
  departmentTiming: 600000,
};

export class AttendanceCacheService {
  // User's today attendance with ultra-fast access
  static async getUserTodayAttendance(userId: string, queryFn: () => Promise<any>): Promise<any> {
    const cacheKey = `attendance:today:${userId}`;
    return performanceOptimizer.executeOptimizedQuery(
      cacheKey,
      queryFn,
      CACHE_TTL.userAttendanceToday
    );
  }

  // Payroll data caching
  static async getPayrollData(filters: any, queryFn: () => Promise<any>): Promise<any> {
    const filterKey = JSON.stringify(filters);
    const cacheKey = `payroll:data:${filterKey}`;
    return performanceOptimizer.executeOptimizedQuery(
      cacheKey,
      queryFn,
      300000 // 5 minutes for payroll data
    );
  }

  // Users list caching
  static async getUsersList(queryFn: () => Promise<any>): Promise<any> {
    const cacheKey = `users:list:all`;
    return performanceOptimizer.executeOptimizedQuery(
      cacheKey,
      queryFn,
      600000 // 10 minutes for users list
    );
  }

  // Customers data caching
  static async getCustomersData(filters: any, queryFn: () => Promise<any>): Promise<any> {
    const filterKey = JSON.stringify(filters);
    const cacheKey = `customers:data:${filterKey}`;
    return performanceOptimizer.executeOptimizedQuery(
      cacheKey,
      queryFn,
      300000 // 5 minutes for customers
    );
  }

  // Quotations data caching
  static async getQuotationsData(filters: any, queryFn: () => Promise<any>): Promise<any> {
    const filterKey = JSON.stringify(filters);
    const cacheKey = `quotations:data:${filterKey}`;
    return performanceOptimizer.executeOptimizedQuery(
      cacheKey,
      queryFn,
      120000 // 2 minutes for quotations
    );
  }

  // Invoices data caching
  static async getInvoicesData(filters: any, queryFn: () => Promise<any>): Promise<any> {
    const filterKey = JSON.stringify(filters);
    const cacheKey = `invoices:data:${filterKey}`;
    return performanceOptimizer.executeOptimizedQuery(
      cacheKey,
      queryFn,
      120000 // 2 minutes for invoices
    );
  }

  // Activity logs caching
  static async getActivityLogs(queryFn: () => Promise<any>): Promise<any> {
    const cacheKey = `activity:logs:recent`;
    return performanceOptimizer.executeOptimizedQuery(
      cacheKey,
      queryFn,
      60000 // 1 minute for activity logs
    );
  }

  // Department statistics with smart caching
  static async getDepartmentStats(department: string, queryFn: () => Promise<any>): Promise<any> {
    const cacheKey = `stats:department:${department}`;
    return performanceOptimizer.executeOptimizedQuery(
      cacheKey,
      queryFn,
      CACHE_TTL.departmentStats
    );
  }

  // Attendance list with pagination awareness
  static async getAttendanceList(filters: any, queryFn: () => Promise<any>): Promise<any> {
    const filterKey = JSON.stringify(filters);
    const cacheKey = `attendance:list:${filterKey}`;
    return performanceOptimizer.executeOptimizedQuery(
      cacheKey,
      queryFn,
      CACHE_TTL.attendanceList
    );
  }

  // User profile with long-term caching
  static async getUserProfile(userId: string, queryFn: () => Promise<any>): Promise<any> {
    const cacheKey = `user:profile:${userId}`;
    return performanceOptimizer.executeOptimizedQuery(
      cacheKey,
      queryFn,
      CACHE_TTL.userProfile
    );
  }

  // Department timing with longest cache
  static async getDepartmentTiming(department: string, queryFn: () => Promise<any>): Promise<any> {
    const cacheKey = `timing:department:${department}`;
    return performanceOptimizer.executeOptimizedQuery(
      cacheKey,
      queryFn,
      CACHE_TTL.departmentTiming
    );
  }

  // Live attendance with minimal caching
  static async getLiveAttendance(queryFn: () => Promise<any>): Promise<any> {
    const cacheKey = `attendance:live:${new Date().toISOString().split('T')[0]}`;
    return performanceOptimizer.executeOptimizedQuery(
      cacheKey,
      queryFn,
      15000 // 15 seconds only for live data
    );
  }

  // Invalidation strategies
  static invalidateUserCache(userId: string): void {
    performanceOptimizer.invalidate(`attendance:today:${userId}`);
    performanceOptimizer.invalidate(`user:profile:${userId}`);
    console.log(`CACHE: Invalidated user cache for ${userId}`);
  }

  static invalidateDepartmentCache(department: string): void {
    performanceOptimizer.invalidate(`stats:department:${department}`);
    performanceOptimizer.invalidate(`timing:department:${department}`);
    console.log(`CACHE: Invalidated department cache for ${department}`);
  }

  static invalidateAttendanceCache(): void {
    performanceOptimizer.invalidate('attendance:list');
    performanceOptimizer.invalidate('attendance:live');
    performanceOptimizer.invalidate('stats:department');
    console.log('CACHE: Invalidated all attendance cache');
  }

  static getCacheStats(): any {
    return performanceOptimizer.getPerformanceStats();
  }
}
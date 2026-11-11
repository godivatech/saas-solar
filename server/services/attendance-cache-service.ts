/**
 * Attendance Cache Service
 * Multi-tenant safe enterprise caching for attendance, CRM, and payroll operations.
 */

import { performanceOptimizer } from './performance-optimizer';
import { getActiveTenantId } from '../tenant-context';
import { getISTDateString } from '../utils/timezone-helpers';

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
  /**
   * Helper to ensure all cache entries are isolated by tenant
   */
  private static getTenantPrefix(): string {
    const tenantId = getActiveTenantId();
    return tenantId ? `tenant:${tenantId}:` : 'tenant:default:';
  }

  // User's today attendance with ultra-fast access
  static async getUserTodayAttendance(userId: string, queryFn: () => Promise<any>): Promise<any> {
    const cacheKey = `${this.getTenantPrefix()}attendance:today:${userId}`;
    return performanceOptimizer.executeOptimizedQuery(
      cacheKey,
      queryFn,
      CACHE_TTL.userAttendanceToday
    );
  }

  // Payroll data caching
  static async getPayrollData(filters: any, queryFn: () => Promise<any>): Promise<any> {
    const filterKey = JSON.stringify(filters);
    const cacheKey = `${this.getTenantPrefix()}payroll:data:${filterKey}`;
    return performanceOptimizer.executeOptimizedQuery(
      cacheKey,
      queryFn,
      300000 // 5 minutes for payroll data
    );
  }

  // Users list caching
  static async getUsersList(queryFn: () => Promise<any>): Promise<any> {
    const cacheKey = `${this.getTenantPrefix()}users:list:all`;
    return performanceOptimizer.executeOptimizedQuery(
      cacheKey,
      queryFn,
      600000 // 10 minutes for users list
    );
  }

  // Customers data caching
  static async getCustomersData(filters: any, queryFn: () => Promise<any>): Promise<any> {
    const filterKey = JSON.stringify(filters);
    const cacheKey = `${this.getTenantPrefix()}customers:data:${filterKey}`;
    return performanceOptimizer.executeOptimizedQuery(
      cacheKey,
      queryFn,
      300000 // 5 minutes for customers
    );
  }

  // Quotations data caching
  static async getQuotationsData(filters: any, queryFn: () => Promise<any>): Promise<any> {
    const filterKey = JSON.stringify(filters);
    const cacheKey = `${this.getTenantPrefix()}quotations:data:${filterKey}`;
    return performanceOptimizer.executeOptimizedQuery(
      cacheKey,
      queryFn,
      120000 // 2 minutes for quotations
    );
  }

  // Invoices data caching
  static async getInvoicesData(filters: any, queryFn: () => Promise<any>): Promise<any> {
    const filterKey = JSON.stringify(filters);
    const cacheKey = `${this.getTenantPrefix()}invoices:data:${filterKey}`;
    return performanceOptimizer.executeOptimizedQuery(
      cacheKey,
      queryFn,
      120000 // 2 minutes for invoices
    );
  }

  // Activity logs caching
  static async getActivityLogs(queryFn: () => Promise<any>): Promise<any> {
    const cacheKey = `${this.getTenantPrefix()}activity:logs:recent`;
    return performanceOptimizer.executeOptimizedQuery(
      cacheKey,
      queryFn,
      60000 // 1 minute for activity logs
    );
  }

  // Department statistics with smart caching
  static async getDepartmentStats(department: string, queryFn: () => Promise<any>): Promise<any> {
    const cacheKey = `${this.getTenantPrefix()}stats:department:${department}`;
    return performanceOptimizer.executeOptimizedQuery(
      cacheKey,
      queryFn,
      CACHE_TTL.departmentStats
    );
  }

  // Attendance list with pagination awareness
  static async getAttendanceList(filters: any, queryFn: () => Promise<any>): Promise<any> {
    const filterKey = JSON.stringify(filters);
    const cacheKey = `${this.getTenantPrefix()}attendance:list:${filterKey}`;
    return performanceOptimizer.executeOptimizedQuery(
      cacheKey,
      queryFn,
      CACHE_TTL.attendanceList
    );
  }

  // User profile with long-term caching
  static async getUserProfile(userId: string, queryFn: () => Promise<any>): Promise<any> {
    const cacheKey = `${this.getTenantPrefix()}user:profile:${userId}`;
    return performanceOptimizer.executeOptimizedQuery(
      cacheKey,
      queryFn,
      CACHE_TTL.userProfile
    );
  }

  // Department timing with longest cache
  static async getDepartmentTiming(department: string, queryFn: () => Promise<any>): Promise<any> {
    const cacheKey = `${this.getTenantPrefix()}timing:department:${department}`;
    return performanceOptimizer.executeOptimizedQuery(
      cacheKey,
      queryFn,
      CACHE_TTL.departmentTiming
    );
  }

  // Live attendance with minimal caching
  static async getLiveAttendance(queryFn: () => Promise<any>): Promise<any> {
    const cacheKey = `${this.getTenantPrefix()}attendance:live:${getISTDateString(new Date())}`;
    return performanceOptimizer.executeOptimizedQuery(
      cacheKey,
      queryFn,
      15000 // 15 seconds only for live data
    );
  }

  // Invalidation strategies
  static invalidateUserCache(userId: string): void {
    const prefix = this.getTenantPrefix();
    performanceOptimizer.invalidate(`${prefix}attendance:today:${userId}`);
    performanceOptimizer.invalidate(`${prefix}user:profile:${userId}`);
    console.log(`CACHE: Invalidated user cache for ${userId} in ${prefix}`);
  }

  static invalidateDepartmentCache(department: string): void {
    const prefix = this.getTenantPrefix();
    performanceOptimizer.invalidate(`${prefix}stats:department:${department}`);
    performanceOptimizer.invalidate(`${prefix}timing:department:${department}`);
    console.log(`CACHE: Invalidated department cache for ${department} in ${prefix}`);
  }

  static invalidateAttendanceCache(): void {
    const prefix = this.getTenantPrefix();
    performanceOptimizer.invalidate(`${prefix}attendance:list`);
    performanceOptimizer.invalidate(`${prefix}attendance:live`);
    performanceOptimizer.invalidate(`${prefix}stats:department`);
    console.log(`CACHE: Invalidated all attendance cache in ${prefix}`);
  }

  static getCacheStats(): any {
    return performanceOptimizer.getPerformanceStats();
  }
}

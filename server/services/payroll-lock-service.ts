/**
 * Payroll Lock Service
 * Prevents retroactive OT changes after payroll processing
 * 
 * Features:
 * - Lock payroll periods
 * - Only master_admin can unlock
 * - Automatically locks OT sessions when period is locked
 */

import { storage } from '../storage';
import type { PayrollPeriod } from '../types/ot-types';
import { OTSessionService } from './ot-session-service';

export class PayrollLockService {

    /**
     * Lock a payroll period
     * Master admin only
     */
    static async lockPeriod(
        month: number,
        year: number,
        adminId: string,
        adminRole: string
    ): Promise<{ success: boolean; message: string }> {
        try {
            // Verify master admin
            if (adminRole !== 'master_admin') {
                return {
                    success: false,
                    message: 'Only master admin can lock payroll periods'
                };
            }

            // Validate month/year
            if (month < 1 || month > 12) {
                return { success: false, message: 'Invalid month' };
            }

            if (year < 2024) {
                return { success: false, message: 'Invalid year' };
            }

            // Check if period already exists
            let period = await storage.getPayrollPeriod(month, year);

            if (period && period.status === 'locked') {
                return {
                    success: false,
                    message: 'Payroll period is already locked'
                };
            }

            // Create or update period
            const periodId = `payroll_${year}_${String(month).padStart(2, '0')}`;
            const periodData: PayrollPeriod = {
                id: periodId,
                month,
                year,
                status: 'locked',
                lockedAt: new Date(),
                lockedBy: adminId
            };

            if (period) {
                await storage.updatePayrollPeriod(periodId, periodData);
            } else {
                await storage.createPayrollPeriod(periodData);
            }

            // Lock all OT sessions for this period
            await OTSessionService.lockSessionsForPeriod(month, year, adminId);

            // Log activity
            await storage.createActivityLog({
                type: 'payroll',
                title: 'Payroll Period Locked',
                description: `Payroll for ${month}/${year} locked by master admin`,
                entityId: periodId,
                entityType: 'payroll_period',
                userId: adminId
            });

            return {
                success: true,
                message: `Payroll period ${month}/${year} locked successfully`
            };

        } catch (error) {
            console.error('Error locking payroll period:', error);
            return {
                success: false,
                message: 'Failed to lock payroll period'
            };
        }
    }

    /**
     * Unlock a payroll period
     * Master admin only - use with caution!
     */
    static async unlockPeriod(
        month: number,
        year: number,
        adminId: string,
        adminRole: string,
        reason: string
    ): Promise<{ success: boolean; message: string }> {
        try {
            // Verify master admin
            if (adminRole !== 'master_admin') {
                return {
                    success: false,
                    message: 'Only master admin can unlock payroll periods'
                };
            }

            // Require reason
            if (!reason || reason.trim().length < 10) {
                return {
                    success: false,
                    message: 'Reason required (minimum 10 characters)'
                };
            }

            // Get period
            const period = await storage.getPayrollPeriod(month, year);
            if (!period) {
                return {
                    success: false,
                    message: 'Payroll period not found'
                };
            }

            if (period.status !== 'locked') {
                return {
                    success: false,
                    message: 'Payroll period is not locked'
                };
            }

            // Unlock period
            await storage.updatePayrollPeriod(period.id, {
                status: 'open'
            });

            // Log activity with reason
            await storage.createActivityLog({
                type: 'payroll',
                title: 'Payroll Period Unlocked',
                description: `Payroll for ${month}/${year} unlocked by master admin. Reason: ${reason}`,
                entityId: period.id,
                entityType: 'payroll_period',
                userId: adminId
            });

            return {
                success: true,
                message: `Payroll period ${month}/${year} unlocked`
            };

        } catch (error) {
            console.error('Error unlocking payroll period:', error);
            return {
                success: false,
                message: 'Failed to unlock payroll period'
            };
        }
    }

    /**
     * Check if a specific date's payroll is locked
     */
    static async isPeriodLocked(date: Date): Promise<boolean> {
        try {
            const month = date.getMonth() + 1;
            const year = date.getFullYear();

            const period = await storage.getPayrollPeriod(month, year);
            return period?.status === 'locked';

        } catch (error) {
            console.error('Error checking period lock:', error);
            return false; // Allow if error (fail open)
        }
    }

    /**
     * Get payroll period status
     */
    static async getPeriodStatus(
        month: number,
        year: number
    ): Promise<PayrollPeriod | null> {
        try {
            return await storage.getPayrollPeriod(month, year);
        } catch (error) {
            console.error('Error getting period status:', error);
            return null;
        }
    }

    /**
     * Get all payroll periods for a year
     */
    static async getPeriodsForYear(year: number): Promise<PayrollPeriod[]> {
        try {
            return await storage.getPayrollPeriodsByYear(year);
        } catch (error) {
            console.error('Error getting periods:', error);
            return [];
        }
    }
}

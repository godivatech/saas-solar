/**
 * Holiday Service
 * Manages company holiday calendar and OT submission policy
 * 
 * Features:
 * - Manual holiday management (no API import)
 * - Department-specific holidays
 * - OT submission control per holiday (allow/block)
 * 
 * Note: OT rate is calculated from employee salary, not configured per-holiday
 */

import { storage } from '../storage';
import type { Holiday } from '../types/ot-types';
import { getUTCMidnight, getISTDateString } from '../utils/timezone-helpers';
import { getActiveTenantId } from '../tenant-context';

export class HolidayService {

    /**
     * Get holiday for a specific date and department
     * Returns null if no holiday found
     */
    static async getHolidayForDate(
        date: Date,
        department?: string
    ): Promise<Holiday | null> {
        try {
            // Normalize date to UTC midnight for consistent querying
            const normalizedDate = getUTCMidnight(date);

            // Get all active holidays for this date
            const holidays = await storage.getHolidaysByDate(normalizedDate);

            if (holidays.length === 0) {
                return null;
            }

            // If no department specified, return first active holiday
            if (!department) {
                return holidays.find(h => h.isActive) || null;
            }

            // Find holiday applicable to this department
            const applicableHoliday = holidays.find(h => {
                if (!h.isActive) return false;

                // If applicableDepartments is null/undefined, holiday applies to all departments
                if (!h.applicableDepartments || h.applicableDepartments.length === 0) {
                    return true;
                }

                // Check if department is in the list
                return h.applicableDepartments.includes(department);
            });

            return applicableHoliday || null;

        } catch (error) {
            console.error('Error getting holiday:', error);
            return null;
        }
    }

    /**
     * Create a new holiday
     * Admin only
     */
    static async createHoliday(
        holiday: Omit<Holiday, 'id' | 'createdAt' | 'updatedAt'>,
        adminId: string
    ): Promise<{ success: boolean; message: string; id?: string }> {
        try {
            // Normalize date to UTC midnight for consistent querying & storage
            const normalizedDate = getUTCMidnight(holiday.date);

            // Check if holiday already exists for this date
            const existing = await storage.getHolidaysByDate(normalizedDate);
            if (existing.length > 0) {
                return {
                    success: false,
                    message: `A holiday already exists for ${holiday.date.toDateString()}`
                };
            }

            // Generate ID
            const tenantPrefix = getActiveTenantId() ? `${getActiveTenantId()}_` : '';
            const dateStr = getISTDateString(normalizedDate).replace(/-/g, '');
            const id = `${tenantPrefix}holiday_${dateStr}`;

            // Create holiday
            const newHoliday: Holiday = {
                ...holiday,
                date: normalizedDate,
                id,
                createdBy: adminId,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const created = await storage.createHoliday(newHoliday);
            const actualId = (created as any)?.id || id;

            // Log activity
            await storage.createActivityLog({
                type: 'holiday',
                title: 'Holiday Created',
                description: `${holiday.name} created`,
                entityId: actualId,
                entityType: 'holiday',
                userId: adminId
            });

            return {
                success: true,
                message: 'Holiday created successfully',
                id: actualId
            };

        } catch (error: any) {
            console.error('Error creating holiday:', error);
            return {
                success: false,
                message: error.message || 'Failed to create holiday'
            };
        }
    }

    /**
     * Update existing holiday
     * Admin only
     */
    static async updateHoliday(
        id: string,
        updates: Partial<Omit<Holiday, 'id' | 'createdAt' | 'createdBy'>>,
        adminId: string
    ): Promise<{ success: boolean; message: string }> {
        try {
            // Update holiday
            const updated = await storage.updateHoliday(id, {
                ...updates,
                updatedAt: new Date()
            });

            if (!updated) {
                return {
                    success: false,
                    message: 'Holiday not found or access denied'
                };
            }

            // Log activity
            await storage.createActivityLog({
                type: 'holiday',
                title: 'Holiday Updated',
                description: `Holiday ${id} updated`,
                entityId: id,
                entityType: 'holiday',
                userId: adminId
            });

            return {
                success: true,
                message: 'Holiday updated successfully'
            };

        } catch (error: any) {
            console.error('Error updating holiday:', error);
            return {
                success: false,
                message: error.message || 'Failed to update holiday'
            };
        }
    }

    /**
     * Delete holiday
     * Admin only (soft delete - sets isActive to false)
     */
    static async deleteHoliday(
        id: string,
        adminId: string
    ): Promise<{ success: boolean; message: string }> {
        try {
            const success = await storage.deleteHoliday(id);
            if (!success) {
                return {
                    success: false,
                    message: 'Holiday not found or access denied'
                };
            }

            // Log activity
            await storage.createActivityLog({
                type: 'holiday',
                title: 'Holiday Deleted',
                description: `Holiday ${id} deleted`,
                entityId: id,
                entityType: 'holiday',
                userId: adminId
            });

            return {
                success: true,
                message: 'Holiday deleted successfully'
            };

        } catch (error: any) {
            console.error('Error deleting holiday:', error);
            return {
                success: false,
                message: error.message || 'Failed to delete holiday'
            };
        }
    }

    /**
     * Get all holidays for a year
     */
    static async getHolidaysForYear(year: number): Promise<Holiday[]> {
        try {
            const startDate = new Date(year, 0, 1);
            const endDate = new Date(year, 11, 31, 23, 59, 59, 999);

            return await storage.getHolidaysByDateRange(startDate, endDate);

        } catch (error) {
            console.error('Error getting holidays for year:', error);
            return [];
        }
    }

    /**
     * Get all holidays for a month
     */
    static async getHolidaysForMonth(month: number, year: number): Promise<Holiday[]> {
        try {
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0, 23, 59, 59, 999);

            return await storage.getHolidaysByDateRange(startDate, endDate);

        } catch (error) {
            console.error('Error getting holidays for month:', error);
            return [];
        }
    }
}

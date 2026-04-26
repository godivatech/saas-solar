/**
 * Company Settings Service
 * Manages company-wide OT configuration (singleton)
 * 
 * Features:
 * - Configurable weekend days (no hardcoded Sat/Sun)
 * - Uniform OT rate for all types (weekday, weekend, holiday)
 * - Daily OT caps
 * - Pure salary-based calculation
 */

import { storage } from '../storage';
import type { CompanySettings } from '../types/ot-types';

export class CompanySettingsService {

    /**
     * Get company settings (singleton)
     * Returns defaults if not set
     */
    static async getSettings(): Promise<CompanySettings> {
        try {
            const settings = await storage.getCompanySettings();

            // Return settings or safe defaults
            return settings || {
                id: '1',
                weekendDays: [0], // Sunday only default
                defaultOTRate: 1.0,
                weekendOTRate: 1.0,
                maxOTHoursPerDay: 5.0,
                updatedAt: new Date()
            };

        } catch (error) {
            console.error('Error getting company settings:', error);

            // Return safe defaults on error
            return {
                id: '1',
                weekendDays: [0],
                defaultOTRate: 1.0,
                weekendOTRate: 1.0,
                maxOTHoursPerDay: 5.0,
                updatedAt: new Date()
            };
        }
    }

    /**
     * Update company settings
     * Admin only
     */
    static async updateSettings(
        updates: Partial<Omit<CompanySettings, 'id'>>,
        adminId: string
    ): Promise<{ success: boolean; message: string }> {
        try {
            // Validate weekend days if provided
            if (updates.weekendDays !== undefined) {
                if (!Array.isArray(updates.weekendDays)) {
                    return {
                        success: false,
                        message: 'Weekend days must be an array'
                    };
                }

                // Validate day numbers (0-6)
                const invalidDays = updates.weekendDays.filter(d => d < 0 || d > 6);
                if (invalidDays.length > 0) {
                    return {
                        success: false,
                        message: 'Invalid day numbers. Must be 0-6 (0=Sunday, 6=Saturday)'
                    };
                }
            }

            // Validate OT rates if provided
            if (updates.defaultOTRate !== undefined && updates.defaultOTRate <= 0) {
                return {
                    success: false,
                    message: 'Default OT rate must be greater than 0'
                };
            }

            // Note: weekendOTRate kept for backward compatibility
            // Frontend auto-syncs it with defaultOTRate for uniform rate
            if (updates.weekendOTRate !== undefined && updates.weekendOTRate <= 0) {
                return {
                    success: false,
                    message: 'OT rate must be greater than 0'
                };
            }

            // Validate daily OT cap
            if (updates.maxOTHoursPerDay !== undefined && updates.maxOTHoursPerDay <= 0) {
                return {
                    success: false,
                    message: 'Max OT hours per day must be greater than 0'
                };
            }

            // Update settings
            await storage.updateCompanySettings({
                ...updates,
                updatedBy: adminId,
                updatedAt: new Date()
            });

            // Log activity
            await storage.createActivityLog({
                type: 'attendance',
                title: 'Company Settings Updated',
                description: `OT settings updated by admin`,
                entityId: '1',
                entityType: 'company_settings',
                userId: adminId
            });

            return {
                success: true,
                message: 'Company settings updated successfully'
            };

        } catch (error) {
            console.error('Error updating company settings:', error);
            return {
                success: false,
                message: 'Failed to update company settings'
            };
        }
    }

    /**
     * Update weekend days configuration
     */
    static async updateWeekendDays(
        weekendDays: number[],
        adminId: string
    ): Promise<{ success: boolean; message: string }> {
        return this.updateSettings({ weekendDays }, adminId);
    }

    /**
     * Update OT rates
     */
    static async updateOTRates(
        rates: {
            defaultOTRate?: number;
            weekendOTRate?: number;
        },
        adminId: string
    ): Promise<{ success: boolean; message: string }> {
        return this.updateSettings(rates, adminId);
    }

    /**
     * Update daily OT cap
     */
    static async updateDailyOTCap(
        maxOTHoursPerDay: number,
        adminId: string
    ): Promise<{ success: boolean; message: string }> {
        return this.updateSettings(
            { maxOTHoursPerDay },
            adminId
        );
    }

    /**
     * Check if a specific day is a weekend
     */
    static async isWeekend(date: Date): Promise<boolean> {
        try {
            const settings = await this.getSettings();
            const dayOfWeek = date.getDay();
            return settings.weekendDays.includes(dayOfWeek);
        } catch (error) {
            console.error('Error checking weekend:', error);
            // Default: Sunday only
            return date.getDay() === 0;
        }
    }

    /**
     * Get OT rate for a specific type
     * Note: Returns uniform rate (defaultOTRate) for all types
     */
    static async getOTRate(otType: 'regular' | 'weekend' | 'holiday'): Promise<number> {
        try {
            const settings = await this.getSettings();

            // Uniform rate for all OT types - pure salary-based calculation
            return settings.defaultOTRate;

        } catch (error) {
            console.error('Error getting OT rate:', error);
            return 1.0; // Safe default
        }
    }
}

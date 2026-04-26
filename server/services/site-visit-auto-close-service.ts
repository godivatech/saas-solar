/**
 * Site Visit Auto-Close Service
 * Automatically closes stale site visits that were not checked out
 * 
 * CLEAN DATA APPROACH:
 * - Runs daily at midnight (12:05 AM IST)
 * - Closes visits older than 24 hours
 * - Status set to 'auto_closed' (not 'completed')
 * - No fabricated siteOutTime - preserves data integrity
 * - Simple informational notification to employee
 * - Activity log for audit trail
 * 
 * WHY 24 HOURS:
 * - Handles overnight installations (multi-day work)
 * - Allows for rural sites with network issues
 * - Provides grace period for emergencies
 * - Defensible and production-ready
 * 
 * Pattern: Follows ot-auto-close-cron.ts architecture
 */

import { siteVisitService } from './site-visit-service';
import { NotificationService } from './notification-service';
import { storage } from '../storage';
import type { SiteVisit } from '@shared/schema';

export class SiteVisitAutoCloseService {
    // 24-hour threshold in milliseconds
    private static readonly AUTO_CLOSE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

    /**
     * Main auto-close processing logic
     * Called by cron job daily at 12:05 AM
     */
    static async processAutoClose(): Promise<void> {
        console.log('[SITE-VISIT-AUTO-CLOSE] Starting cleanup at', new Date().toISOString());

        try {
            // Calculate cutoff time (24 hours ago)
            const cutoff = new Date(Date.now() - this.AUTO_CLOSE_THRESHOLD_MS);
            console.log(`[SITE-VISIT-AUTO-CLOSE] Cutoff time: ${cutoff.toISOString()}`);

            // Get all active site visits
            const activeVisits = await siteVisitService.getActiveSiteVisits();
            console.log(`[SITE-VISIT-AUTO-CLOSE] Found ${activeVisits.length} active visits`);

            // Filter to only stale visits older than threshold
            const staleVisits = activeVisits.filter(visit => {
                // Defensive guard: only process in_progress visits
                if (visit.status !== 'in_progress') return false;

                // Check if visit is older than 24 hours
                return visit.siteInTime < cutoff;
            });

            console.log(`[SITE-VISIT-AUTO-CLOSE] Found ${staleVisits.length} stale visits to auto-close`);

            // Process each stale visit
            let closedCount = 0;
            let errorCount = 0;

            for (const visit of staleVisits) {
                try {
                    await this.autoCloseVisit(visit);
                    closedCount++;
                } catch (error) {
                    console.error(`[SITE-VISIT-AUTO-CLOSE] Failed to close visit ${visit.id}:`, error);
                    errorCount++;
                }
            }

            console.log(`[SITE-VISIT-AUTO-CLOSE] ✅ Completed: ${closedCount} visits closed, ${errorCount} errors`);

        } catch (error) {
            console.error('[SITE-VISIT-AUTO-CLOSE] Fatal error during cleanup:', error);
            throw error;
        }
    }

    /**
     * Auto-close a single stale site visit
     */
    private static async autoCloseVisit(visit: SiteVisit): Promise<void> {
        try {
            const now = new Date();
            const formattedDate = visit.siteInTime.toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });

            const customerName = visit.customer?.name || 'Unknown Customer';

            // Calculate how long the visit was open (for logging only)
            const hoursOpen = ((now.getTime() - visit.siteInTime.getTime()) / (1000 * 60 * 60)).toFixed(1);

            console.log(`[SITE-VISIT-AUTO-CLOSE] Auto-closing visit ${visit.id}:`, {
                customer: customerName,
                userId: visit.userId,
                siteInTime: visit.siteInTime.toISOString(),
                hoursOpen: `${hoursOpen}h`
            });

            // Update site visit status to auto_closed
            await siteVisitService.updateSiteVisit(visit.id, {
                status: 'auto_closed' as any, // Cast since schema update pending
                autoCorrected: true as any,
                autoClosedAt: now as any,
                autoCorrectionReason: `Auto-closed after 24 hours (no checkout received). Visit was open for ${hoursOpen} hours.` as any
            });

            // Send simple informational notification to employee
            await NotificationService.sendSiteVisitAutoCloseNotification(
                visit.userId,
                customerName,
                visit.siteInTime
            );

            // Create activity log for audit trail
            await storage.createActivityLog({
                type: 'site_visit',
                title: 'Site Visit Auto-Closed',
                description: `Site visit to ${customerName} was auto-closed after 24 hours (employee forgot to check out). Visit started at ${formattedDate}.`,
                entityId: visit.id,
                entityType: 'site_visit',
                userId: visit.userId
            });

            console.log(`[SITE-VISIT-AUTO-CLOSE] ✓ Successfully closed visit ${visit.id} for ${customerName}`);

        } catch (error) {
            console.error(`[SITE-VISIT-AUTO-CLOSE] Error closing visit ${visit.id}:`, error);
            throw error;
        }
    }

    /**
     * Manual trigger for testing purposes
     * Can be called from debug scripts or admin endpoints
     */
    static async runNow(): Promise<void> {
        console.log('[SITE-VISIT-AUTO-CLOSE] Manual run triggered');
        await this.processAutoClose();
    }

    /**
     * Get configuration from company settings
     * Future enhancement: make threshold configurable
     */
    private static async getThresholdHours(): Promise<number> {
        // For now, hardcoded to 24 hours
        // In future, could read from company settings:
        // const settings = await CompanySettingsService.getSettings();
        // return settings.siteVisitAutoClose?.autoCloseAfterHours || 24;
        return 24;
    }
}

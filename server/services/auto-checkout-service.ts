import { storage } from '../storage';
import { EnterpriseTimeService } from './enterprise-time-service';
import { NotificationService } from './notification-service';
import { LeaveService } from './leave-service';

export class AutoCheckoutService {
    /**
     * Main job to process incomplete attendance records
     * Should be called via CRON every 5 minutes
     */
    static async processAutoCheckouts() {
        console.log('[AUTO-CHECKOUT] ========================================');
        console.log('[AUTO-CHECKOUT] Starting auto-checkout job...');
        console.log('[AUTO-CHECKOUT] Current time:', new Date().toISOString());

        try {
            // Process records for today and yesterday to ensure we don't miss anything 
            // around the 2-hour threshold
            const now = new Date();
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);

            const datesToProcess = [now, yesterday];

            for (const date of datesToProcess) {
                await this.processDate(date);
            }

            console.log('[AUTO-CHECKOUT] Job completed successfully.');
            console.log('[AUTO-CHECKOUT] ========================================');
        } catch (error) {
            console.error('[AUTO-CHECKOUT] Critical error in auto-checkout job:', error);
        }
    }

    private static async processDate(date: Date) {
        const incomplete = await storage.listIncompleteAttendance(date);
        const now = new Date();

        if (incomplete.length === 0) {
            return;
        }

        for (const record of incomplete) {
            try {
                // P1.2: Skip records on approved leave days - leave always wins
                const leaveService = new LeaveService(storage);
                const hasLeave = await leaveService.hasLeaveOnDate(record.userId, record.date);
                if (hasLeave) {
                    continue;
                }

                // 🛡️ HOLIDAY AWARENESS: Skip auto-checkout on company holidays
                // If it's a holiday, employees are not expected to work, so we shouldn't auto-checkout 
                // any lingering records which might be data artifacts or special cases.
                const { UnifiedAttendanceService } = await import('./unified-attendance-service');
                const { isHoliday } = await UnifiedAttendanceService.isHoliday(record.date, record.userDepartment);
                if (isHoliday) {
                    console.log(`[AUTO-CHECKOUT] 🌴 Skipping record ${record.id} - today is a company holiday`);
                    continue;
                }

                // 🛡️ WEEKEND AWARENESS: Skip auto-checkout on weekly off days
                const { CompanySettingsService } = await import('./company-settings-service');
                const isWeekend = await CompanySettingsService.isWeekend(record.date);
                if (isWeekend) {
                    console.log(`[AUTO-CHECKOUT] 😴 Skipping record ${record.id} - today is a weekly off (weekend)`);
                    continue;
                }

                // 🛡️ OT PROTECTION: Skip auto-checkout if there's an active OT session
                // Check session-based OT format (otSessions[] array)
                if (record.otSessions && Array.isArray(record.otSessions)) {
                    const hasActiveOT = record.otSessions.some((s: any) => s.status === 'in_progress');
                    if (hasActiveOT) {
                        console.log(`[AUTO-CHECKOUT] ⏰ Skipping record ${record.id} - Active OT session found`);
                        continue;
                    }
                }

                if (!record.userDepartment) {
                    console.warn(`[AUTO-CHECKOUT] ⚠️ Skipping record ${record.id} -missing department`);
                    continue;
                }

                const timing = await EnterpriseTimeService.getDepartmentTiming(record.userDepartment);

                // Parse the department check-out time based on check-in time (handles cross-midnight shifts)
                const deptCheckOutDate = EnterpriseTimeService.getExpectedCheckoutDateTime(record.checkInTime!, timing.checkOutTime);

                // Use department-specific grace period (now global, default to 5 minutes)
                const gracePeriodMs = (timing.autoCheckoutGraceMinutes || 5) * 60 * 1000;
                const autoCheckoutThreshold = new Date(deptCheckOutDate.getTime() + gracePeriodMs);

                // If current time is past the threshold, perform auto-checkout
                if (now >= autoCheckoutThreshold) {
                    // Use department closing time as the official checkout time
                    const checkOutTime = deptCheckOutDate;

                    // Calculate final working hours using the established service
                    const metrics = await EnterpriseTimeService.calculateTimeMetrics(
                        record.userId,
                        record.userDepartment,
                        record.checkInTime!,
                        checkOutTime
                    );

                    // Update attendance record
                    await storage.updateAttendance(record.id, {
                        checkOutTime,
                        workingHours: metrics.workingHours,
                        autoCorrected: true,
                        autoCorrectedAt: now,
                        autoCorrectionReason: `Forgotten checkout (system auto-corrected after ${timing.autoCheckoutGraceMinutes || 5} minutes past ${timing.checkOutTime})`,
                        adminReviewStatus: 'pending'
                    });

                    // Phase 2: Create employee notification
                    await NotificationService.createAutoCheckoutNotification(
                        record.userId,
                        record.date,
                        timing.checkOutTime
                    );

                    // Phase 3: Notify Admin about pending review
                    const user = await storage.getUser(record.userId);
                    if (user) {
                        await NotificationService.notifyAdminReviewPending(
                            record.id,
                            user.displayName,
                            record.date
                        );
                    }
                }
            } catch (error) {
                console.error(`[AUTO-CHECKOUT] ❌ Error processing record ${record.id}:`, error);
            }
        }
    }
}

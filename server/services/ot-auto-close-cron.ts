/**
 * OT Auto-Close Cron Service
 * Runs daily at midnight to close forgotten OT sessions
 * 
 * ZERO-FRAUD LOGIC:
 * - Sessions left open are auto-closed at 11:59 PM
 * - Status set to PENDING_REVIEW (requires admin verification)
 * - OT hours set to 0 for payroll purposes until approved
 * - Employee

 notified about auto-close
 */

import * as cron from 'node-cron';
import { storage } from '../storage';
import type { OTSession } from '../types/ot-types';
import { getUTCMidnight, getUTCEndOfDay } from '../utils/timezone-helpers';

export class OTAutoCloseService {
    private static cronJob: cron.ScheduledTask | null = null;

    /**
     * Start the auto-close cron job
     * Runs daily at 12:05 AM
     */
    static start(): void {
        if (this.cronJob) {
            console.log('[OT-AUTO-CLOSE] Cron already running');
            return;
        }

        // Schedule: Run at :05 past every hour (e.g., 1:05, 2:05, 3:05...)
        // This ensures early OT sessions are closed ~5min before check-in time
        this.cronJob = cron.schedule('5 * * * *', async () => {
            try {
                await this.runAutoClose();
            } catch (error) {
                console.error('[OT-AUTO-CLOSE] Fatal error:', error);
            }
        });

        console.log('[OT-AUTO-CLOSE] ✅ Cron scheduled (runs hourly at :05 past the hour)');
    }

    /**
     * Stop the cron job (for cleanup)
     */
    static stop(): void {
        if (this.cronJob) {
            this.cronJob.stop();
            this.cronJob = null;
            console.log('[OT-AUTO-CLOSE] Cron stopped');
        }
    }

    /**
     * Main auto-close logic
     */
    private static async runAutoClose(): Promise<void> {
        console.log('[OT-AUTO-CLOSE] Starting auto-close at', new Date().toISOString());

        try {
            // ZERO-FRAUD FIX: Look back 3 days to catch "Zombie Sessions"
            // If we only look at "yesterday", a late-night session (e.g. 10 PM) might not be 
            // 16h old during the first pass, and would be ignored forever in subsequent runs.
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
            const startDate = getUTCMidnight(threeDaysAgo); // UTC-safe

            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const endDate = getUTCEndOfDay(yesterday); // UTC-safe

            // Get attendance records from last 3 days
            const attendanceRecords = await storage.listAttendanceByDateRange(
                startDate,
                endDate
            );

            // ⚡ PERFORMANCE: Batch load users in PARALLEL (not sequential!)
            // Senior best practice: Use Promise.allSettled() for true parallel execution
            const uniqueUserIds = Array.from(new Set(attendanceRecords.map(a => a.userId)));

            console.log(`[OT-AUTO-CLOSE] Loading ${uniqueUserIds.length} unique users in parallel...`);
            const userResults = await Promise.allSettled(
                uniqueUserIds.map(userId => storage.getUser(userId))
            );

            // Build user map from successful fetches only
            const userMap = new Map<string, any>();
            userResults.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value) {
                    userMap.set(uniqueUserIds[index], result.value);
                } else if (result.status === 'rejected') {
                    console.error(`[OT-AUTO-CLOSE] Failed to load user ${uniqueUserIds[index]}:`, result.reason);
                }
            });

            // Load department timings in PARALLEL
            const { EnterpriseTimeService } = await import('./enterprise-time-service');
            const uniqueDepartments = Array.from(new Set(Array.from(userMap.values()).map(u => u.department).filter(Boolean)));

            console.log(`[OT-AUTO-CLOSE] Loading ${uniqueDepartments.length} department timings in parallel...`);
            const timingResults = await Promise.allSettled(
                uniqueDepartments.map(dept => EnterpriseTimeService.getDepartmentTiming(dept))
            );

            // Build timing cache from successful fetches only
            const deptTimingCache = new Map<string, any>();
            timingResults.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value) {
                    deptTimingCache.set(uniqueDepartments[index], result.value);
                } else if (result.status === 'rejected') {
                    console.error(`[OT-AUTO-CLOSE] Failed to load timing for ${uniqueDepartments[index]}:`, result.reason);
                }
            });

            let closedCount = 0;
            let errorCount = 0;

            // Process each attendance record
            for (const attendance of attendanceRecords) {
                if (!attendance.otSessions || !Array.isArray(attendance.otSessions)) {
                    continue;
                }

                // SMART AUTO-CLOSE: Find sessions that need closing (async-safe)
                const openSessions: OTSession[] = [];

                for (const session of attendance.otSessions) {
                    // Only consider 'in_progress' sessions
                    if (session.status !== 'in_progress') continue;

                    const startTime = new Date(session.startTime);
                    const now = new Date();
                    const hoursRunning = (now.getTime() - startTime.getTime()) / (1000 * 60 * 60);

                    let shouldClose = false;

                    // 🛡️ FRAUD PREVENTION: Auto-close early_arrival OT before regular work begins
                    if (session.otType === 'early_arrival') {
                        try {
                            const user = userMap.get(attendance.userId);
                            if (user && user.department) {
                                const timing = deptTimingCache.get(user.department);

                                if (timing && timing.checkInTime) {
                                    // Parse department check-in time (e.g., "9:00 AM")
                                    const checkInTime = OTAutoCloseService.parseTime12ToDate(timing.checkInTime, now);

                                    // Auto-close 5 minutes before check-in time
                                    const autoCloseTime = new Date(checkInTime.getTime() - 5 * 60 * 1000);

                                    // 🛡️ DEFENSIVE EDGE CASE: Validate session started BEFORE auto-close time
                                    // Scenario: Employee starts "early" OT at 10:00 AM when check-in is 9:00 AM
                                    // This is invalid data (corruption or API bypass) - session can't be "early" if started after check-in
                                    if (startTime >= autoCloseTime) {
                                        console.warn(`[OT-AUTO-CLOSE] ⚠️ Invalid early_arrival OT detected: ${session.sessionId} started at ${startTime.toISOString()} but auto-close time is ${autoCloseTime.toISOString()}. Using standard 5h threshold.`);
                                        // Fallback: Use standard 5-hour threshold for this edge case
                                        shouldClose = hoursRunning > 5;
                                    } else if (now >= autoCloseTime) {
                                        // ✅ Valid early OT: started before auto-close time, now it's time to close
                                        console.log(`[OT-AUTO-CLOSE] ⚡ Early arrival OT auto-closing: ${session.sessionId}, started ${startTime.toISOString()}, dept check-in: ${timing.checkInTime}`);
                                        shouldClose = true;
                                    }
                                    // else: Not yet time to auto-close (now < autoCloseTime), keep running
                                } else {
                                    // No timing configured - fallback to 5-hour threshold
                                    console.log(`[OT-AUTO-CLOSE] No check-in time for ${user.department}, using 5h threshold`);
                                    shouldClose = hoursRunning > 5;
                                }
                            } else {
                                // User/department not found - fallback to 5-hour threshold
                                shouldClose = hoursRunning > 5;
                            }
                        } catch (error) {
                            console.error(`[OT-AUTO-CLOSE] Error checking early OT for ${session.sessionId}:`, error);
                            // Fallback to 5-hour threshold on error
                            shouldClose = hoursRunning > 5;
                        }
                    } else {
                        // 📊 STANDARD AUTO-CLOSE: late_departure and weekend OT (5-hour threshold)
                        shouldClose = hoursRunning > 5;
                    }

                    if (shouldClose) {
                        openSessions.push(session);
                    }
                }

                if (openSessions.length === 0) {
                    continue;
                }

                try {
                    // Close each open session
                    for (const session of openSessions) {
                        await this.closeSession(attendance.id, session, attendance.userId);
                        closedCount++;
                    }
                } catch (error) {
                    console.error(`[OT-AUTO-CLOSE] Error closing sessions for ${attendance.userId}:`, error);
                    errorCount++;
                }
            }

            console.log(`[OT-AUTO-CLOSE] ✅ Completed: ${closedCount} sessions closed, ${errorCount} errors`);

        } catch (error) {
            console.error('[OT-AUTO-CLOSE] Fatal error during run:', error);
        }
    }

    /**
     * Utility: Remove undefined fields from object
     * Firestore rejects updates containing undefined values
     */
    private static filterUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
        const filtered: any = {};
        for (const key in obj) {
            if (obj[key] !== undefined) {
                filtered[key] = obj[key];
            }
        }
        return filtered;
    }

    /**
     * Close a single session
     */
    private static async closeSession(
        attendanceId: string,
        session: OTSession,
        userId: string
    ): Promise<void> {
        try {
            // Get the attendance record
            const attendance = await storage.getAttendance(attendanceId);
            if (!attendance || !attendance.otSessions) {
                throw new Error('Attendance not found');
            }

            const sessions = Array.isArray(attendance.otSessions) ? attendance.otSessions : [];

            // Find session index
            const sessionIndex = sessions.findIndex(
                (s: OTSession) => s.sessionId === session.sessionId
            );

            if (sessionIndex === -1) {
                throw new Error('Session not found');
            }

            // ZERO-FRAUD LOGIC: Auto-close with PENDING_REVIEW status
            const now = new Date();
            const endOfDay = new Date(session.startTime);
            endOfDay.setHours(23, 59, 59, 999);

            // Calculate hours to end of day (for display only, not used for payroll)
            const startTime = new Date(session.startTime);
            const calculatedHours = Number(
                ((endOfDay.getTime() - startTime.getTime()) / (1000 * 60 * 60)).toFixed(2)
            );

            // Update session with PENDING_REVIEW status
            // ✅ CRITICAL FIX: Filter undefined fields before Firestore write
            const updatedSession = this.filterUndefined({
                ...session,
                endTime: endOfDay,
                otHours: 0,  // CRITICAL: Set to 0 for payroll (admin must approve actual hours)
                status: 'PENDING_REVIEW' as const,
                autoClosedAt: now,
                autoClosedNote: `Session auto-closed at midnight. Employee forgot to end session. Calculated ${calculatedHours.toFixed(2)}h (needs admin verification).`,
                updatedAt: now
            });

            sessions[sessionIndex] = updatedSession as OTSession;

            // Update attendance (no change to totalOTHours since this is pending)
            await storage.updateAttendance(attendanceId, {
                otSessions: sessions
            });

            // Get user for notification
            const user = await storage.getUser(userId);
            const userName = user?.displayName || 'Employee';

            // Notify employee
            await storage.createNotification({
                userId,
                type: 'admin_review',
                title: 'OT Session Auto-Closed',
                message: `Your OT session from ${this.formatTime(session.startTime)} was auto-closed because you forgot to end it. An admin will review and verify your actual hours.`,
                createdAt: now
            });

            // Log activity
            await storage.createActivityLog({
                type: 'attendance',
                title: 'OT Session Auto-Closed',
                description: `${userName}'s OT session auto-closed (forgot to end). Status: PENDING_REVIEW. Estimated ${calculatedHours.toFixed(2)}h.`,
                entityId: session.sessionId,
                entityType: 'ot_session',
                userId
            });

            console.log(`[OT-AUTO-CLOSE] ✓ Closed session ${session.sessionId} for ${userName}`);

        } catch (error) {
            console.error(`[OT-AUTO-CLOSE] Error closing session ${session.sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Format time for display
     */
    private static formatTime(date: Date | string): string {
        const d = new Date(date);
        return d.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    }

    /**
     * Manual trigger (for testing)
     */
    static async runNow(): Promise<void> {
        console.log('[OT-AUTO-CLOSE] Manual run triggered');
        await this.runAutoClose();
    }

    /**
     * Helper: Parse 12-hour time format to Date object
     * TODO: Replace with normalized time storage (checkInMinutesFromMidnight) in future
     * @param time12 Time in 12-hour format (e.g., "9:00 AM", "11:30 PM")
     * @param baseDate Base date to use for the time
     * @returns Date object set to the specified time on baseDate
     */
    private static parseTime12ToDate(time12: string, baseDate: Date = new Date()): Date {
        const match = time12.trim().match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!match) {
            throw new Error(`Invalid 12-hour time format: "${time12}". Expected format: "9:00 AM" or "11:30 PM"`);
        }

        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const meridiem = match[3].toUpperCase();

        // Convert to 24-hour format
        if (meridiem === 'PM' && hours !== 12) {
            hours += 12;
        } else if (meridiem === 'AM' && hours === 12) {
            hours = 0;
        }

        // Create new date with parsed time
        const result = new Date(baseDate);
        result.setHours(hours, minutes, 0, 0);
        return result;
    }
}

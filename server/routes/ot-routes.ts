/**
 * OT System API Routes
 * Comprehensive REST API for overtime management
 */

import { Router, Request, Response, NextFunction } from 'express';
import { OTSessionService } from '../services/ot-session-service';
import { HolidayService } from '../services/holiday-service';
import { CompanySettingsService } from '../services/company-settings-service';
import { PayrollLockService } from '../services/payroll-lock-service';
import { auth } from '../firebase';
import { storage } from '../storage';
import { getUTCMidnight } from '../utils/timezone-helpers';

const router = Router();

// Auth middleware matching existing pattern from routes.ts
const verifyAuth = async (req: any, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Unauthorized: Missing or invalid token" });
    }
    const token = authHeader.split("Bearer ")[1];
    try {
        const decodedToken = await auth.verifyIdToken(token);
        req.user = decodedToken;

        // Load user profile
        const userProfile = await storage.getUser(decodedToken.uid);
        if (userProfile) {
            req.authenticatedUser = {
                uid: decodedToken.uid,
                user: userProfile,
                permissions: [],
                canApprove: false,
                maxApprovalAmount: null
            };
        }
        next();
    } catch (error) {
        console.error("Auth verification error:", error);
        res.status(401).json({ message: "Unauthorized: Invalid token" });
    }
};

// Admin check middleware
const requireAdmin = async (req: any, res: Response, next: NextFunction) => {
    const userProfile = req.authenticatedUser?.user;
    if (!userProfile || (userProfile.role !== 'admin' && userProfile.role !== 'master_admin')) {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
    }
    next();
};

// Master admin check middleware
const requireMasterAdmin = async (req: any, res: Response, next: NextFunction) => {
    const userProfile = req.authenticatedUser?.user;
    if (!userProfile || userProfile.role !== 'master_admin') {
        return res.status(403).json({ message: "Forbidden: Master admin access required" });
    }
    next();
};

// ============================================
// OT SESSION ROUTES
// ============================================

/**
 * POST /api/ot/sessions/start
 * Start a new OT session
 */
router.post('/sessions/start', verifyAuth, async (req: any, res) => {
    try {
        const { latitude, longitude, accuracy, imageUrl, address, reason } = req.body;
        const userId = req.user.uid;

        if (!latitude || !longitude || !imageUrl) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: latitude, longitude, imageUrl'
            });
        }

        const result = await OTSessionService.startSession({
            userId,
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            accuracy: parseFloat(accuracy || 0),
            imageUrl,
            address,
            reason
        });

        return res.json(result);

    } catch (error) {
        console.error('Error starting OT session:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to start OT session'
        });
    }
});

/**
 * POST /api/ot/sessions/:id/end
 * End an active OT session
 */
router.post('/sessions/:id/end', verifyAuth, async (req: any, res) => {
    try {
        const { id: sessionId } = req.params;
        const { latitude, longitude, accuracy, imageUrl, address, reason } = req.body;
        const userId = req.user.uid;

        if (!latitude || !longitude || !imageUrl) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: latitude, longitude, imageUrl'
            });
        }

        const result = await OTSessionService.endSession({
            userId,
            sessionId,
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            accuracy: parseFloat(accuracy || 0),
            imageUrl,
            address,
            reason
        });

        return res.json(result);

    } catch (error) {
        console.error('Error ending OT session:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to end OT session'
        });
    }
});

/**
 * GET /api/ot/sessions/active
 * Get active OT session for current user
 */
router.get('/sessions/active', verifyAuth, async (req: any, res) => {
    try {
        const userId = req.user.uid;

        const session = await OTSessionService.getActiveSession(userId);

        return res.json({
            success: true,
            session
        });

    } catch (error) {
        console.error('Error getting active session:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to get active session'
        });
    }
});

/**
 * GET /api/ot/sessions
 * Get OT sessions for a specific date
 */
router.get('/sessions', verifyAuth, async (req: any, res) => {
    try {
        const userId = req.user.uid;
        const { date } = req.query;

        // UTC-safe date for session query
        const targetDate = date
            ? getUTCMidnight(new Date(date as string))
            : getUTCMidnight(new Date());

        const sessions = await OTSessionService.getSessionsForDate(userId, targetDate);

        return res.json({
            success: true,
            sessions
        });

    } catch (error) {
        console.error('Error getting sessions:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to get sessions'
        });
    }
});

// ============================================
// COMPANY SETTINGS ROUTES (Admin Only)
// ============================================


// Duplicate routes removed - using the more secure versions below (lines 668+)




/**
 * GET /api/payroll/periods/:year
 * Get all payroll periods for a year
 */
router.get('/payroll/periods/:year', verifyAuth, requireAdmin, async (req: any, res) => {
    try {
        const { year } = req.params;

        const periods = await PayrollLockService.getPeriodsForYear(parseInt(year));

        return res.json({
            success: true,
            periods
        });

    } catch (error) {
        console.error('Error getting payroll periods:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to get payroll periods'
        });
    }
});

/**
 * GET /api/payroll/status/:month/:year
 * Get payroll period status
 */
router.get('/payroll/status/:month/:year', verifyAuth, requireAdmin, async (req: any, res) => {
    try {
        const { month, year } = req.params;

        const period = await PayrollLockService.getPeriodStatus(
            parseInt(month),
            parseInt(year)
        );

        return res.json({
            success: true,
            period
        });

    } catch (error) {
        console.error('Error getting payroll status:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to get payroll status'
        });
    }
});

// ============================================
// HOLIDAY MANAGEMENT ROUTES
// ============================================

/**
 * GET /api/holidays
 * Get holidays for a specific year or month
 * Query params: year (required), month (optional)
 */
router.get('/holidays', verifyAuth, requireAdmin, async (req: any, res) => {
    try {
        const { year, month } = req.query;

        if (!year) {
            return res.status(400).json({
                success: false,
                message: 'Year parameter is required'
            });
        }

        const yearNum = parseInt(year as string);
        if (isNaN(yearNum)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid year format'
            });
        }

        let holidays;
        if (month) {
            const monthNum = parseInt(month as string);
            if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid month format (must be 1-12)'
                });
            }
            holidays = await HolidayService.getHolidaysForMonth(monthNum, yearNum);
        } else {
            holidays = await HolidayService.getHolidaysForYear(yearNum);
        }

        return res.json({ holidays });

    } catch (error) {
        console.error('Error fetching holidays:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch holidays'
        });
    }
});

/**
 * POST /api/holidays
 * Create a new holiday
 */
router.post('/holidays', verifyAuth, requireAdmin, async (req: any, res) => {
    try {
        const { date, name, type, applicableDepartments, notes } = req.body;
        const adminId = req.user.uid;

        // Validate required fields
        if (!date || !name) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: date, name'
            });
        }

        const result = await HolidayService.createHoliday({
            date: new Date(date),
            name,
            type: type || 'company',
            isActive: true,
            applicableDepartments,
            notes
        }, adminId);

        return res.json(result);

    } catch (error) {
        console.error('Error creating holiday:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create holiday'
        });
    }
});

/**
 * PUT /api/holidays/:id
 * Update an existing holiday
 */
router.put('/holidays/:id', verifyAuth, requireAdmin, async (req: any, res) => {
    try {
        const { id } = req.params;
        const { date, name, type, applicableDepartments, notes, isActive } = req.body;
        const adminId = req.user.uid;

        const updates: any = {};
        if (date !== undefined) updates.date = new Date(date);
        if (name !== undefined) updates.name = name;
        if (type !== undefined) updates.type = type;
        if (applicableDepartments !== undefined) updates.applicableDepartments = applicableDepartments;
        if (notes !== undefined) updates.notes = notes;
        if (isActive !== undefined) updates.isActive = isActive;

        const result = await HolidayService.updateHoliday(id, updates, adminId);
        return res.json(result);

    } catch (error) {
        console.error('Error updating holiday:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update holiday'
        });
    }
});

/**
 * DELETE /api/holidays/:id
 * Delete a holiday (soft delete - sets isActive to false)
 */
router.delete('/holidays/:id', verifyAuth, requireAdmin, async (req: any, res) => {
    try {
        const { id } = req.params;
        const adminId = req.user.uid;

        const result = await HolidayService.deleteHoliday(id, adminId);
        return res.json(result);

    } catch (error) {
        console.error('Error deleting holiday:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete holiday'
        });
    }
});

// ============================================
// COMPANY SETTINGS ROUTES
// ============================================

/**
 * GET /api/settings
 * Get company OT settings
 */
router.get('/settings', verifyAuth, requireAdmin, async (req: any, res) => {
    try {
        const settings = await CompanySettingsService.getSettings();
        return res.json({ settings });

    } catch (error) {
        console.error('Error fetching settings:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch settings'
        });
    }
});

/**
 * PUT /api/settings
 * Update company OT settings
 */
router.put('/settings', verifyAuth, requireAdmin, async (req: any, res) => {
    try {
        const { weekendDays, defaultOTRate, weekendOTRate, maxOTHoursPerDay } = req.body;
        const adminId = req.user.uid;

        // Validate numeric fields
        const numericFields = {
            maxOTHoursPerDay
        };

        for (const [key, value] of Object.entries(numericFields)) {
            if (value !== undefined) {
                const num = parseFloat(value as string);
                if (isNaN(num) || num <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: `${key} must be a positive number`
                    });
                }
            }
        }

        // Validate weekendDays array
        if (weekendDays !== undefined) {
            if (!Array.isArray(weekendDays)) {
                return res.status(400).json({
                    success: false,
                    message: 'weekendDays must be an array'
                });
            }
            if (!weekendDays.every((day: number) => day >= 0 && day <= 6)) {
                return res.status(400).json({
                    success: false,
                    message: 'weekendDays must contain values between 0-6'
                });
            }
        }

        const updates: any = {};
        if (weekendDays !== undefined) updates.weekendDays = weekendDays;
        if (defaultOTRate !== undefined) updates.defaultOTRate = parseFloat(defaultOTRate);
        if (weekendOTRate !== undefined) updates.weekendOTRate = parseFloat(weekendOTRate);
        if (maxOTHoursPerDay !== undefined) updates.maxOTHoursPerDay = parseFloat(maxOTHoursPerDay);


        const result = await CompanySettingsService.updateSettings(updates, adminId);
        return res.json(result);

    } catch (error) {
        console.error('Error updating settings:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update settings'
        });
    }
});

// ============================================
// PAYROLL LOCK ROUTES
// ============================================

/**
 * GET /api/payroll/periods/:year
 * Get all payroll periods for a year
 */
router.get('/payroll/periods/:year', verifyAuth, requireAdmin, async (req: any, res) => {
    try {
        const { year } = req.params;
        const yearNum = parseInt(year);

        if (isNaN(yearNum)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid year format'
            });
        }

        const periods = await PayrollLockService.getPeriodsForYear(yearNum);
        return res.json({ periods });

    } catch (error) {
        console.error('Error fetching payroll periods:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch payroll periods'
        });
    }
});

/**
 * POST /api/payroll/lock
 * Lock a payroll period (master_admin only)
 */
router.post('/payroll/lock', verifyAuth, requireMasterAdmin, async (req: any, res) => {
    try {
        const { month, year } = req.body;
        const adminId = req.user.uid;

        if (!month || !year) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: month, year'
            });
        }

        const monthNum = parseInt(month);
        const yearNum = parseInt(year);

        if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
            return res.status(400).json({
                success: false,
                message: 'Invalid month (must be 1-12)'
            });
        }

        if (isNaN(yearNum)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid year'
            });
        }

        const result = await PayrollLockService.lockPeriod(monthNum, yearNum, adminId, req.authenticatedUser?.user?.role || 'admin');
        return res.json(result);

    } catch (error) {
        console.error('Error locking payroll period:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to lock payroll period'
        });
    }
});

/**
 * POST /api/payroll/unlock
 * Unlock a payroll period with mandatory reason (master_admin only)
 */
router.post('/payroll/unlock', verifyAuth, requireMasterAdmin, async (req: any, res) => {
    try {
        const { month, year, reason } = req.body;
        const adminId = req.user.uid;

        if (!month || !year || !reason) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: month, year, reason'
            });
        }

        const monthNum = parseInt(month);
        const yearNum = parseInt(year);

        if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
            return res.status(400).json({
                success: false,
                message: 'Invalid month (must be 1-12)'
            });
        }

        if (isNaN(yearNum)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid year'
            });
        }

        if (reason.trim().length < 10) {
            return res.status(400).json({
                success: false,
                message: 'Unlock reason must be at least 10 characters'
            });
        }

        const result = await PayrollLockService.unlockPeriod(monthNum, yearNum, reason, adminId, req.authenticatedUser?.user?.role || 'admin');
        return res.json(result);

    } catch (error) {
        console.error('Error unlocking payroll period:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to unlock payroll period'
        });
    }
});

// ============================================
// ADMIN REVIEW ROUTES (Zero-Fraud System)
// ============================================

/**
 * GET /api/ot/sessions/pending
 * Get all OT sessions pending admin review
 */
router.get('/sessions/pending', verifyAuth, requireAdmin, async (req: any, res) => {
    try {
        const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
        const department = req.query.department as string | undefined;

        // Get all attendance records in date range
        const records = startDate && endDate
            ? await storage.listAttendanceByDateRange(startDate, endDate)
            : await storage.listAttendanceByDateRange(
                new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
                new Date()
            );

        // Extract pending OT sessions
        const pendingSessions: any[] = [];

        for (const record of records) {
            if (!record.otSessions || !Array.isArray(record.otSessions)) continue;

            const pending = record.otSessions.filter((s: any) => s.status === 'PENDING_REVIEW');

            for (const session of pending) {
                // Get user info
                const user = await storage.getUser(record.userId);

                // Filter by department if specified
                if (department && user?.department !== department) continue;

                pendingSessions.push({
                    ...session,
                    attendanceId: record.id,
                    userId: record.userId,
                    userName: user?.displayName || 'Unknown',
                    userDepartment: user?.department || 'Unknown',
                    date: record.date
                });
            }
        }

        // Sort by date descending
        pendingSessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return res.json({
            success: true,
            sessions: pendingSessions,
            total: pendingSessions.length
        });

    } catch (error) {
        console.error('Error getting pending OT sessions:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to get pending sessions'
        });
    }
});

/**
 * GET /api/ot/sessions/active/all
 * Get ALL active OT sessions for admin monitoring (real-time view)
 */
router.get('/sessions/active/all', verifyAuth, requireAdmin, async (req: any, res) => {
    try {
        const department = req.query.department as string | undefined;

        // Get today's attendance records
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

        // Get attendance records for today
        const records = await storage.listAttendanceBetweenDates(startOfDay, endOfDay);

        // Extract active (in-progress) OT sessions
        const activeSessions: any[] = [];
        const now = new Date();

        for (const record of records) {
            if (!record.otSessions || !Array.isArray(record.otSessions)) continue;

            // Filter for in-progress sessions
            const active = record.otSessions.filter((s: any) =>
                s.status === 'in_progress' && s.startTime && !s.endTime
            );

            for (const session of active) {
                // Get user info
                const user = await storage.getUser(record.userId);

                // Filter by department if specified
                if (department && user?.department !== department) continue;

                // Calculate current duration
                const startTime = new Date(session.startTime);
                const durationMs = now.getTime() - startTime.getTime();
                const durationHours = durationMs / (1000 * 60 * 60);

                activeSessions.push({
                    sessionId: session.sessionId,
                    userId: record.userId,
                    userName: user?.displayName || 'Unknown',
                    userEmail: user?.email || 'Unknown',
                    userDepartment: user?.department || null,
                    userDesignation: user?.designation || null,
                    otType: session.otType,
                    startTime: session.startTime,
                    currentDuration: Math.max(0, durationHours),
                    status: session.status,
                    date: record.date,
                    startLatitude: session.startLatitude,
                    startLongitude: session.startLongitude,
                    startImageUrl: session.startImageUrl,
                    startAddress: session.startAddress
                });
            }
        }

        // Sort by start time (most recent first)
        activeSessions.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

        return res.json({
            success: true,
            sessions: activeSessions,
            total: activeSessions.length,
            timestamp: now
        });

    } catch (error) {
        console.error('Error getting active OT sessions:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to get active sessions'
        });
    }
});

/**
 * POST /api/ot/sessions/:sessionId/review
 * Review an OT session (approve/adjust/reject)
 */
router.post('/sessions/:sessionId/review', verifyAuth, requireAdmin, async (req: any, res) => {
    try {
        const { sessionId } = req.params;
        const { action, adjustedHours, notes, attendanceId } = req.body;
        const adminUid = req.user.uid;
        const adminUser = req.authenticatedUser?.user;

        if (!action || !['APPROVED', 'ADJUSTED', 'REJECTED'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid action. Must be APPROVED, ADJUSTED, or REJECTED'
            });
        }

        if (action === 'ADJUSTED' && (adjustedHours === undefined || adjustedHours === null)) {
            return res.status(400).json({
                success: false,
                message: 'Adjusted hours required for ADJUSTED action'
            });
        }

        if (!attendanceId) {
            return res.status(400).json({
                success: false,
                message: 'Attendance ID required'
            });
        }

        // Get attendance record
        const attendance = await storage.getAttendance(attendanceId);
        if (!attendance || !attendance.otSessions) {
            return res.status(404).json({
                success: false,
                message: 'Attendance record not found'
            });
        }

        // Find session
        const sessions = Array.isArray(attendance.otSessions) ? attendance.otSessions : [];
        const sessionIndex = sessions.findIndex((s: any) => s.sessionId === sessionId);

        if (sessionIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'OT session not found'
            });
        }

        const session = sessions[sessionIndex];

        // SECURITY CHECK: Ensure payroll period is not locked
        const sessionDate = new Date(session.startTime);
        const month = sessionDate.getMonth() + 1;
        const year = sessionDate.getFullYear();

        const payrollPeriod = await storage.getPayrollPeriod(month, year);
        if (payrollPeriod && payrollPeriod.status === 'locked') {
            return res.status(403).json({
                success: false,
                message: `Payroll for ${month}/${year} is locked. Cannot review OT sessions for this period.`
            });
        }

        // Update session based on action
        const now = new Date();
        let updatedSession: any;

        if (action === 'APPROVED') {
            updatedSession = {
                ...session,
                status: 'APPROVED',
                reviewedBy: adminUid,
                reviewedAt: now,
                reviewAction: 'APPROVED',
                reviewNotes: notes || 'Approved by admin',
                updatedAt: now
            };
        } else if (action === 'ADJUSTED') {
            updatedSession = {
                ...session,
                status: 'APPROVED',
                originalOTHours: session.otHours,
                otHours: parseFloat(adjustedHours),
                adjustedOTHours: parseFloat(adjustedHours),
                reviewedBy: adminUid,
                reviewedAt: now,
                reviewAction: 'ADJUSTED',
                reviewNotes: notes || `Hours adjusted from ${session.otHours}h to ${adjustedHours}h`,
                updatedAt: now
            };
        } else { // REJECTED
            updatedSession = {
                ...session,
                status: 'REJECTED',
                reviewedBy: adminUid,
                reviewedAt: now,
                reviewAction: 'REJECTED',
                reviewNotes: notes || 'Rejected by admin',
                updatedAt: now
            };
        }

        // Update sessions array
        sessions[sessionIndex] = updatedSession;

        // Recalculate total approved OT
        const totalApprovedOT = sessions
            .filter((s: any) => s.status === 'APPROVED' || s.status === 'completed')
            .reduce((sum: number, s: any) => sum + (s.otHours || 0), 0);

        // Update attendance
        await storage.updateAttendance(attendanceId, {
            otSessions: sessions,
            totalOTHours: totalApprovedOT
        });

        // Log activity
        await storage.createActivityLog({
            type: 'attendance',
            title: `OT Session ${action}`,
            description: `${adminUser?.displayName || 'Admin'} ${action.toLowerCase()} OT session (${session.otHours}h${action === 'ADJUSTED' ? ` → ${adjustedHours}h` : ''})`,
            entityId: sessionId,
            entityType: 'ot_session',
            userId: attendance.userId
        });

        // Notify employee
        const actionText = action === 'APPROVED' ? 'approved' :
            action === 'ADJUSTED' ? `adjusted to ${adjustedHours} hours` :
                'rejected';

        await storage.createNotification({
            userId: attendance.userId,
            type: 'admin_review',
            title: `OT ${action === 'REJECTED' ? 'Rejected' : 'Approved'}`,
            message: `Your OT session from ${new Date(session.startTime).toLocaleString()} has been ${actionText}.${notes ? ` Note: ${notes}` : ''}`,
            createdAt: now
        });

        return res.json({
            success: true,
            message: `OT session ${action.toLowerCase()} successfully`,
            session: updatedSession,
            totalOTHours: totalApprovedOT
        });

    } catch (error) {
        console.error('Error reviewing OT session:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to review OT session'
        });
    }
});

// ============================================
// OT REPORTS ENDPOINT (Admin Only)
// ============================================

/**
 * GET /api/ot/reports
 * Get OT sessions for reporting (monthly export)
 * Query params: startDate, endDate, userId, department
 */
router.get('/reports', verifyAuth, requireAdmin, async (req: any, res) => {
    try {
        const { startDate, endDate, userId, department } = req.query;

        // Parse and validate dates
        const start = startDate ? new Date(startDate as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const end = endDate ? new Date(endDate as string) : new Date();

        // Validate date range
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Invalid date format. Use YYYY-MM-DD format.'
            });
        }

        if (start > end) {
            return res.status(400).json({
                success: false,
                message: 'Start date must be before end date.'
            });
        }

        // Query attendance records within date range using the correct storage method
        const attendanceRecords = await storage.listAttendanceBetweenDates(start, end);

        // Get all users for enrichment - fetch individually as needed
        const userCache = new Map<string, any>();

        // Flatten OT sessions from attendance records
        const otSessions: any[] = [];

        for (const attendance of attendanceRecords) {
            // Get user from cache or fetch
            let user = userCache.get(attendance.userId);
            if (!user) {
                user = await storage.getUser(attendance.userId);
                if (user) {
                    userCache.set(attendance.userId, user);
                }
            }
            if (!user) continue;

            // Apply filters
            if (userId && attendance.userId !== userId) continue;
            if (department && user.department !== department) continue;

            // Extract OT sessions from attendance
            if (attendance.otSessions && Array.isArray(attendance.otSessions)) {
                for (const session of attendance.otSessions) {
                    otSessions.push({
                        // Session info
                        sessionId: session.sessionId,
                        sessionNumber: session.sessionNumber,
                        startTime: session.startTime,
                        endTime: session.endTime,
                        otHours: session.otHours || 0,
                        otType: session.otType,
                        status: session.status,

                        // Employee info
                        userId: attendance.userId,
                        userName: user.displayName || user.email,
                        userEmail: user.email,
                        userDepartment: user.department || null,
                        userDesignation: user.designation || null,

                        // Date
                        date: attendance.date,

                        // Admin review info (if applicable)
                        autoClosedAt: session.autoClosedAt,
                        autoClosedNote: session.autoClosedNote,
                        reviewedBy: session.reviewedBy,
                        reviewNotes: session.reviewNotes,
                        reviewedAt: session.reviewedAt
                    });
                }
            }
        }

        // Sort by date (newest first)
        otSessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Calculate summary statistics
        const summary = {
            totalSessions: otSessions.length,
            totalHours: otSessions.reduce((sum, s) => sum + (s.otHours || 0), 0),
            approvedHours: otSessions
                .filter(s => s.status === 'APPROVED' || s.status === 'completed')
                .reduce((sum, s) => sum + (s.otHours || 0), 0),
            pendingHours: otSessions
                .filter(s => s.status === 'PENDING_REVIEW')
                .reduce((sum, s) => sum + (s.otHours || 0), 0),
            rejectedCount: otSessions.filter(s => s.status === 'REJECTED').length,
            byType: {
                early_arrival: otSessions.filter(s => s.otType === 'early_arrival').length,
                late_departure: otSessions.filter(s => s.otType === 'late_departure').length,
                weekend: otSessions.filter(s => s.otType === 'weekend').length,
                holiday: otSessions.filter(s => s.otType === 'holiday').length
            }
        };

        return res.json({
            success: true,
            sessions: otSessions,
            summary,
            filters: {
                startDate: start,
                endDate: end,
                userId: userId || null,
                department: department || null
            }
        });

    } catch (error) {
        console.error('Error fetching OT reports:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch OT reports'
        });
    }
});

export default router;


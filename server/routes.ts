import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import {
  insertAttendanceSchema,
  insertPermissionSchema,
  insertRoleSchema,
  insertUserRoleAssignmentSchema,
  insertPermissionOverrideSchema,
  insertAuditLogSchema,
  insertSalaryStructureSchema,
  insertPayrollSchema,
  insertPayrollSettingsSchema,
  insertSalaryAdvanceSchema,
  insertAttendancePolicySchema,
  insertEmployeeSchema,
  insertEmployeeDocumentSchema,
  insertPerformanceReviewSchema,
  insertCustomerSchema,
  insertLeaveApplicationSchema,
  insertFixedHolidaySchema,
  departments
} from "@shared/schema";
// Import all the necessary schemas from storage.ts since they've been moved there
import {
  insertUserSchema,
  insertDepartmentSchema,
  insertDesignationSchema,
  insertPermissionGroupSchema,
  insertQuotationSchema,
  insertInvoiceSchema,
  insertLeaveSchema
} from "./storage";
import { isWithinGeoFence, calculateDistance } from "./utils";
import { UnifiedAttendanceService } from "./services/unified-attendance-service";
import { EnterprisePerformanceMonitor } from "./services/performance-monitor";
import { auth } from "./firebase";
import { userService } from "./services/user-service";
import { testFirebaseAdminSDK, testUserManagement } from "./test-firebase-admin";
import { attendanceRateLimiter, generalRateLimiter, createRateLimitMiddleware } from "./utils/rate-limiter";
import { DataCompletenessAnalyzer, SiteVisitDataMapper } from "./services/quotation-mapping-service";
import { registerQuotationRoutes } from "./routes/quotations";
import { isCheckoutOverdue } from "./utils/time-helpers";
import otRoutes from "./routes/ot-routes";
import { AutoCheckoutService } from "./services/auto-checkout-service";
import { NotificationService } from "./services/notification-service";
import { EnterpriseTimeService } from "./services/enterprise-time-service";
import { insertNotificationSchema } from "@shared/schema";
import { PayrollLockService } from "./services/payroll-lock-service";
import { generateOTP, validateOTPFormat, OTP_CONFIG, otpStore } from "./utils/otp";
import { emailService } from "./services/email-service";
import { CloudinaryService } from './services/cloudinary-service';
import { SiteVisitService } from './services/site-visit-service';
import { ActivityService } from './services/activity-service';
import { ManualOTService } from './services/manual-ot-service';
import { LeaveService } from './services/leave-service';
import { HolidayService } from './services/holiday-service';
import { AdvancedQuotationService } from './services/quotation-service';
import { getUTCMidnight, getUTCEndOfDay } from './utils/timezone-helpers';

/**
 * Helper function to merge a date with a time string
 * Handles multiple time formats: ISO strings, 12-hour format (9:00 AM), 24-hour format (09:00)
 * 
 * @param originalDate - The original date to preserve (year, month, day)
 * @param timeValue - Time as ISO string, 12-hour format, or HH:MM format
 * @returns Date object with original date but updated time
 */
function mergeDateAndTime(originalDate: Date, timeValue: string): Date {
  const result = new Date(originalDate);

  // Handle ISO string format (e.g., "2024-12-18T18:00:00.000Z")
  if (timeValue.includes('T') || timeValue.includes('Z')) {
    const parsed = new Date(timeValue);
    result.setHours(parsed.getHours(), parsed.getMinutes(), parsed.getSeconds(), parsed.getMilliseconds());
    return result;
  }

  // Handle 12-hour format (e.g., "6:00 PM", "9:30 AM")
  const time12HourMatch = timeValue.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (time12HourMatch) {
    let [, hoursStr, minutesStr, period] = time12HourMatch;
    let hours = parseInt(hoursStr);
    const minutes = parseInt(minutesStr);

    // Convert to 24-hour format
    if (period.toUpperCase() === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period.toUpperCase() === 'AM' && hours === 12) {
      hours = 0;
    }

    result.setHours(hours, minutes, 0, 0);
    return result;
  }

  // Handle 24-hour format or simple HH:MM (e.g., "18:00", "09:30")
  const time24HourMatch = timeValue.match(/(\d{1,2}):(\d{2})/);
  if (time24HourMatch) {
    const [, hoursStr, minutesStr] = time24HourMatch;
    result.setHours(parseInt(hoursStr), parseInt(minutesStr), 0, 0);
    return result;
  }

  // Fallback: return original if parsing fails
  console.warn(`mergeDateAndTime: Unable to parse time format: "${timeValue}". Returning original date.`);
  return result;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint for monitoring (Render, UptimeRobot, etc.)
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      apiOnly: process.env.API_ONLY === 'true',
      uptime: process.uptime()
    });
  });

  // Enhanced middleware to verify Firebase Auth token and load user profile
  const verifyAuth = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    console.log("SERVER AUTH: Headers received:", !!authHeader, authHeader ? "Bearer format: " + authHeader.startsWith("Bearer ") : "no header");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ message: "Unauthorized: Missing or invalid token" });
    }
    const token = authHeader.split("Bearer ")[1];
    console.log("SERVER AUTH: Token extracted, length:", token.length);
    try {
      const decodedToken = await auth.verifyIdToken(token);
      req.user = decodedToken;

      // Load user profile from storage
      const userProfile = await storage.getUser(decodedToken.uid);


      if (userProfile) {
        // Attach enhanced user data for permission checking
        req.authenticatedUser = {
          uid: decodedToken.uid,
          user: userProfile,
          permissions: [],
          canApprove: false,
          maxApprovalAmount: null
        };

        // Master admin gets all permissions first - Use dynamic import for consistency
        if (userProfile.role === "master_admin") {
          const { systemPermissions } = await import("@shared/schema");
          req.authenticatedUser.permissions = [...systemPermissions];
          req.authenticatedUser.canApprove = true;
          req.authenticatedUser.maxApprovalAmount = null; // Unlimited

        }
        // Calculate permissions if user has department and designation
        else if (userProfile.department && userProfile.designation) {
          try {

            const { getEffectivePermissions } = await import("@shared/schema");
            const effectivePermissions = getEffectivePermissions(userProfile.department, userProfile.designation);
            req.authenticatedUser.permissions = effectivePermissions;


            // Set approval capabilities based on designation - Fixed duplicate keys
            const designationLevels = {
              "house_man": 1,
              "welder": 2,
              "technician": 3,
              "cre": 4,
              "executive": 5,
              "team_leader": 6,
              "officer": 7,
              "gm": 8,
              "ceo": 9
            };
            const level = designationLevels[userProfile.designation] || 1;
            req.authenticatedUser.canApprove = level >= 5;
            req.authenticatedUser.maxApprovalAmount = level >= 8 ? null : level >= 7 ? 1000000 : level >= 6 ? 500000 : level >= 5 ? 100000 : null;
          } catch (error) {
            console.error("Error calculating permissions:", error);
            console.error("Error details:", error.stack);
          }
        } else {
          // New employee without department/designation gets default permissions

          try {
            const { getNewEmployeePermissions } = await import("@shared/schema");
            const defaultPermissions = getNewEmployeePermissions();
            req.authenticatedUser.permissions = defaultPermissions;
            req.authenticatedUser.canApprove = false;
            req.authenticatedUser.maxApprovalAmount = null;

          } catch (error) {
            console.error("Error loading default permissions:", error);
            req.authenticatedUser.permissions = ["dashboard.view", "attendance.view_own", "leave.view_own", "leave.request"];
          }
        }

      }

      next();
    } catch (error) {
      console.error("Auth verification error:", error);
      res.status(401).json({ message: "Unauthorized: Invalid token" });
    }
  };

  // ============================================
  // ATTENDANCE AUTO-CHECKOUT & NOTIFICATIONS (Phases 1-3)
  // ============================================


  // ============================================
  // TEST ENDPOINT FOR PENDING REVIEW FIX
  // ============================================
  app.post("/api/test/create-incomplete-record", async (req, res) => {
    try {
      console.log('🧪 Creating test incomplete attendance record...');

      // 1. Get a user (try master_admin first)
      const admins = await storage.getUsersByRole('master_admin');
      const user = admins[0]; // Use the first master admin

      if (!user) {
        return res.status(404).json({ message: "No master_admin found to attach record to" });
      }

      console.log(`👤 Using user: ${user.displayName} (${user.email})`);

      // 2. Set date to Yesterday 9:00 AM
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(9, 0, 0, 0);

      // 3. Remove any existing record for yesterday to avoid duplicates
      // Note: We need to implement a delete or just ignore collision for now
      // Let's just create it. If it fails due to duplicate, that's fine for testing manually
      // but ideally we check. 
      // check for existing
      const existing = await storage.getAttendanceByUserAndDate(user.id, yesterday);
      if (existing) {
        console.log(`⚠️ Found existing record for yesterday (ID: ${existing.id}). attempting to delete/overwrite...`);
        // We might not have delete exposed easily here without importing more.
        // Let's just try to create. If storage allows duplicates for different timestamps, it might verify.
        // But getAttendanceByUserAndDate usually checks by date string.
        // Let's proceed.
      }

      // 4. Create Incomplete Record (No CheckOut Time)
      const attendanceData = {
        userId: user.id,
        date: yesterday,
        checkInTime: yesterday,
        checkOutTime: undefined, // ❌ MISSING CHECKOUT

        status: 'present',
        attendanceType: 'office',
        reason: 'Test Incomplete Record',
        checkInLatitude: '12.9716',
        checkInLongitude: '77.5946',
        isLate: false,
        lateMinutes: 0,
        workingHours: 0,
        breakHours: 0,
        otStartTime: undefined,
        otEndTime: undefined,
        isWithinOfficeRadius: true,
        remarks: 'Test record created via API for validation',

        locationAccuracy: 10,
        locationValidationType: 'manual',
        locationConfidence: 1,
        isManualOT: false,
        otStatus: 'not_started',
        autoCorrected: false // Important: Not auto-corrected yet
      };

      // @ts-ignore - bypassing some strict type checks for test data
      const newRecord = await storage.createAttendance(attendanceData);

      console.log('✅ Test record created successfully:', newRecord.id);

      return res.json({
        success: true,
        message: "Test incomplete record created successfully for yesterday",
        recordId: newRecord.id,
        user: user.displayName,
        date: yesterday.toISOString().split('T')[0]
      });

    } catch (error: any) {
      console.error("❌ Error creating test record:", error);
      res.status(500).json({ message: "Failed to create test record", error: error.message });
    }
  });

  // CRON Endpoint for Auto-Checkout (Phase 1)
  app.post("/api/cron/auto-checkout", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const cronSecret = process.env.CRON_SECRET;

      if (!cronSecret) {
        console.error("[CRON] CRON_SECRET environment variable is not set!");
        return res.status(500).json({ success: false, message: "Server configuration error" });
      }

      if (authHeader !== `Bearer ${cronSecret}`) {
        console.warn(`[CRON] Unauthorized access attempt from IP: ${req.ip}`);
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const { AutoCheckoutService } = await import("./services/auto-checkout-service");
      await AutoCheckoutService.processAutoCheckouts();
      res.json({ success: true, message: "Auto-checkout job processed successfully" });
    } catch (error) {
      console.error("[CRON] Error in auto-checkout route:", error);
      res.status(500).json({ success: false, message: "Internal server error during auto-checkout" });
    }
  });

  // Test endpoint for admins to manually trigger auto-checkout (development/testing)
  app.post("/api/test/run-auto-checkout", verifyAuth, async (req, res) => {
    console.log("[TEST] ========================================");
    console.log("[TEST] Endpoint hit! Starting test auto-checkout...");
    try {
      // Check admin access
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      console.log("[TEST] User loaded:", user?.email, "role:", user?.role);

      if (!user || (user.role !== "master_admin" && user.role !== "admin")) {
        console.log("[TEST] Access denied - not admin");
        return res.status(403).json({ success: false, message: "Access denied - admin only" });
      }

      console.log("[TEST] Admin access confirmed. Importing AutoCheckoutService...");
      const { AutoCheckoutService } = await import("./services/auto-checkout-service");
      console.log("[TEST] AutoCheckoutService imported. Calling processAutoCheckouts()...");

      await AutoCheckoutService.processAutoCheckouts();

      console.log("[TEST] processAutoCheckouts() completed successfully");
      res.json({ success: true, message: "Auto-checkout job processed successfully" });
    } catch (error) {
      console.error("[TEST] Error in manual auto-checkout:", error);
      res.status(500).json({ success: false, message: "Internal server error during auto-checkout" });
    }
  });


  // Other routes continue...

  // Test endpoint for admins to manually trigger OT auto-close (development/testing)
  app.post("/api/test/run-ot-auto-close", verifyAuth, async (req, res) => {
    console.log("[TEST] Starting manual OT auto-close...");
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || (user.role !== "master_admin" && user.role !== "admin")) {
        return res.status(403).json({ success: false, message: "Access denied - admin only" });
      }

      const { OTAutoCloseService } = await import("./services/ot-auto-close-cron");
      await OTAutoCloseService.runNow();

      res.json({ success: true, message: "OT auto-close job processed successfully" });
    } catch (error) {
      console.error("[TEST] Error in manual OT auto-close:", error);
      res.status(500).json({ success: false, message: "Internal server error during OT auto-close" });
    }
  });

  // Diagnostic endpoint to check OT sessions for current user
  app.get("/api/test/my-ot-sessions", verifyAuth, async (req, res) => {
    try {
      const userId = req.authenticatedUser?.uid || "";

      // Get last 7 days of attendance
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const records = await storage.listAttendanceByDateRange(sevenDaysAgo, new Date());
      const myRecords = records.filter(r => r.userId === userId);

      const sessionsInfo = myRecords.map(r => ({
        date: r.date,
        otSessions: r.otSessions?.map((s: any) => ({
          sessionId: s.sessionId,
          startTime: s.startTime,
          endTime: s.endTime,
          status: s.status,
          otHours: s.otHours,
          autoClosedAt: s.autoClosedAt,
          hoursRunning: s.startTime ? ((new Date().getTime() - new Date(s.startTime).getTime()) / (1000 * 60 * 60)).toFixed(2) : 0
        })) || []
      })).filter(r => r.otSessions.length > 0);

      res.json({
        success: true,
        userId,
        records: sessionsInfo,
        totalSessions: sessionsInfo.reduce((sum, r) => sum + r.otSessions.length, 0)
      });
    } catch (error) {
      console.error("[TEST] Error checking OT sessions:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  // Investigation endpoint for OT bug analysis (NO AUTH for debugging)
  app.get("/api/test/investigate-ot-bug", async (req, res) => {
    try {
      console.log('\n\n═══════════════════════════════════════════════');
      console.log('🔍 OT BUG INVESTIGATION STARTED');
      console.log('═══════════════════════════════════════════════\n');

      console.log('🔍 Starting OT Bug Investigation...');
      const results: any = {};

      // Q1: Find Vishnu's session
      const allUsers = await storage.listUsers();
      const vishnu = allUsers.find((u: any) =>
        u.displayName?.toLowerCase().includes('vishnu') ||
        u.email?.toLowerCase().includes('vishnu')
      );

      if (!vishnu) {
        return res.json({ success: false, message: "User 'vishnu' not found" });
      }

      results.user = {
        name: vishnu.displayName,
        email: vishnu.email,
        id: vishnu.id,
        department: vishnu.department,
        designation: vishnu.designation
      };

      // Get attendance for Jan 5, 2026
      const targetDate = new Date('2026-01-05');
      const attendance = await storage.getAttendanceByUserAndDate(vishnu.id, targetDate);

      if (!attendance || !attendance.otSessions || attendance.otSessions.length === 0) {
        return res.json({
          success: false,
          message: "No OT sessions found for Jan 5, 2026",
          user: results.user
        });
      }

      // Find early_arrival session
      const targetSession = attendance.otSessions.find((s: any) => s.otType === 'early_arrival');

      if (!targetSession) {
        return res.json({
          success: false,
          message: "No early_arrival session found for Jan 5, 2026",
          user: results.user,
          availableSessions: attendance.otSessions.map((s: any) => ({
            type: s.otType,
            hours: s.otHours,
            status: s.status
          }))
        });
      }

      // Calculate actual hours
      const start = new Date(targetSession.startTime);
      const end = new Date(targetSession.endTime);
      const calculatedHours = Number(((end.getTime() - start.getTime()) / (1000 * 60 * 60)).toFixed(2));

      // Q1 Answer: Session State
      results.question1_sessionState = {
        sessionId: targetSession.sessionId,
        sessionNumber: targetSession.sessionNumber,
        date: attendance.date,
        otType: targetSession.otType,
        status: targetSession.status,
        startTime: targetSession.startTime,
        startTimeFormatted: start.toLocaleString(),
        endTime: targetSession.endTime,
        endTimeFormatted: end.toLocaleString(),
        otHours: targetSession.otHours,
        calculatedHours,
        discrepancy: calculatedHours - targetSession.otHours,
        autoClosedAt: targetSession.autoClosedAt || null,
        autoClosedNote: targetSession.autoClosedNote || null,
        reviewAction: targetSession.reviewAction || null,
        reviewedBy: targetSession.reviewedBy || null,
        reviewedAt: targetSession.reviewedAt || null,
        reviewNotes: targetSession.reviewNotes || null,
        originalOTHours: targetSession.originalOTHours || null,
        adjustedOTHours: targetSession.adjustedOTHours || null
      };

      // Q2 Answer: Approval method
      results.question2_approvalMethod = {
        action: targetSession.reviewAction || 'NOT_REVIEWED',
        interpretation: targetSession.reviewAction === 'APPROVED'
          ? 'SYSTEM BUG - Should have recalculated hours'
          : targetSession.reviewAction === 'ADJUSTED'
            ? 'ADMIN MANUALLY SET - Intentional or mistake'
            : 'NOT REVIEWED YET'
      };

      // Q3 Answer: Capping logic
      const settings = await storage.getCompanySettings();
      results.question3_cappingLogic = {
        maxOTHoursPerDay: settings?.maxOTHoursPerDay || null,
        defaultOTRate: settings?.defaultOTRate || null,
        weekendOTRate: settings?.weekendOTRate || null,
        weekendDays: settings?.weekendDays || null,
        isStoredHoursEqualToMax: targetSession.otHours === settings?.maxOTHoursPerDay
      };

      // Q4 Answer: Other affected sessions
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const allAttendance = await storage.listAttendanceBetweenDates(threeMonthsAgo, new Date());

      let affectedSessions: any[] = [];
      for (const att of allAttendance) {
        if (att.otSessions && Array.isArray(att.otSessions)) {
          for (const session of att.otSessions) {
            if (
              session.status === 'APPROVED' &&
              session.autoClosedAt &&
              session.otHours === 0
            ) {
              const sessionUser = await storage.getUser(att.userId);
              affectedSessions.push({
                date: att.date,
                userName: sessionUser?.displayName || 'Unknown',
                userId: att.userId,
                sessionId: session.sessionId,
                otHours: session.otHours,
                reviewAction: session.reviewAction
              });
            }
          }
        }
      }

      results.question4_otherAffectedSessions = {
        totalAttendanceChecked: allAttendance.length,
        affectedSessionsCount: affectedSessions.length,
        affectedSessions: affectedSessions.slice(0, 10),
        hasMoreThan10: affectedSessions.length > 10
      };

      // Print all answers to console
      console.log('\n📊 SUMMARY:');
      console.log(`   Stored Hours:      ${targetSession.otHours}h`);
      console.log(`   Calculated Hours:  ${calculatedHours}h`);
      console.log(`   DISCREPANCY:       ${(calculatedHours - targetSession.otHours).toFixed(2)}h ❌\n`);

      console.log('1️⃣ SESSION STATE:');
      console.log(`   Auto Closed:       ${targetSession.autoClosedAt ? 'YES ✓' : 'NO'}`);
      console.log(`   Review Action:     ${targetSession.reviewAction || 'NOT REVIEWED'}`);
      console.log(`   Status:            ${targetSession.status}\n`);

      console.log('2️⃣ APPROVAL METHOD:');
      if (targetSession.reviewAction === 'APPROVED') {
        console.log('   ❌ SYSTEM BUG - Was APPROVED but hours not recalculated\n');
      } else if (targetSession.reviewAction === 'ADJUSTED') {
        console.log('   ✓ Was ADJUSTED - Admin manually set hours\n');
      } else {
        console.log('   ⚠️  Not yet reviewed\n');
      }

      console.log('3️⃣ CAPPING LOGIC:');
      console.log(`   Max OT/Day:        ${settings?.maxOTHoursPerDay}h`);
      console.log(`   Equals stored?     ${targetSession.otHours === settings?.maxOTHoursPerDay ? 'YES' : 'NO'}\n`);

      // Q5 Answer: Design recommendation
      results.question5_designDecision = {
        currentBehavior: 'APPROVED preserves existing otHours (does not recalculate)',
        recommendedFix: 'APPROVED should recalculate hours if autoClosedAt exists',
        needsUserDecision: true
      };

      res.json({
        success: true,
        summary: {
          sessionFound: true,
          storedHours: targetSession.otHours,
          calculatedHours,
          discrepancy: calculatedHours - targetSession.otHours,
          wasAutoCompleted: !!targetSession.autoClosedAt,
          reviewAction: targetSession.reviewAction || 'NOT_REVIEWED',
          affectedSessionsFound: affectedSessions.length
        },
        detailedAnswers: results
      });

    } catch (error: any) {
      console.error("Error in OT bug investigation:", error);
      res.status(500).json({
        success: false,
        message: "Investigation failed",
        error: error.message
      });
    }
  });

  // Migration endpoint for converting legacy OT to new session format
  app.post("/api/migrate/legacy-ot", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== 'master_admin') {
        return res.status(403).json({ success: false, message: "Only master admin can run migrations" });
      }

      console.log(`[MIGRATION-ROUTE] Migration triggered by admin: ${user.email}`);

      const { migrateLegacyOTSessions } = await import("./migrations/migrate-legacy-ot");
      const result = await migrateLegacyOTSessions(storage);

      res.json(result);
    } catch (error) {
      console.error('[MIGRATION-ROUTE] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Migration failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });


  // Admin Review Routes (Phase 3)
  app.get("/api/admin/attendance/pending-review", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      // Get user to check role
      const currentUser = await storage.getUser(req.authenticatedUser.uid);
      if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'master_admin')) {
        return res.status(403).json({ success: false, message: "Admin access required" });
      }

      const records = await storage.listAttendanceByReviewStatus('pending');

      const enrichedRecords = await Promise.all(records.map(async (record) => {
        const user = await storage.getUser(record.userId);
        return {
          ...record,
          userName: user?.displayName || 'Unknown employee',
          userDepartment: user?.department || null,
          userEmail: user?.email || null
        };
      }));

      res.json(enrichedRecords);
    } catch (error) {
      console.error("Error fetching pending reviews:", error);
      res.status(500).json({ success: false, message: "Failed to fetch pending reviews" });
    }
  });

  app.post("/api/admin/attendance/:id/review", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser || (req.authenticatedUser.user.role !== 'admin' && req.authenticatedUser.user.role !== 'master_admin')) {
        return res.status(403).json({ success: false, message: "Unauthorized" });
      }

      const { id } = req.params;
      const { action, checkInTime, checkOutTime, notes } = req.body;
      const adminId = req.authenticatedUser.uid;

      const recordSnapshot = await storage.getAttendance(id);
      if (!recordSnapshot) {
        return res.status(404).json({ success: false, message: "Attendance record not found" });
      }

      // P1.1: Block reviews if payroll period is locked
      if (await PayrollLockService.isPeriodLocked(recordSnapshot.date)) {
        return res.status(403).json({
          success: false,
          message: "Cannot modify attendance for a locked payroll period. Unlock the period first."
        });
      }

      const updateData: any = {
        adminReviewStatus: action,
        adminReviewedBy: adminId,
        adminReviewedAt: new Date(),
        adminReviewNotes: notes || ''
      };

      const { EnterpriseTimeService } = await import("./services/enterprise-time-service");
      const { NotificationService } = await import("./services/notification-service");

      if (action === 'adjusted') {
        if (!checkInTime || !checkOutTime) {
          return res.status(400).json({ success: false, message: "Check-in and check-out times are required for adjustments" });
        }

        const finalIn = new Date(checkInTime);
        const finalOut = new Date(checkOutTime);

        updateData.originalCheckOutTime = recordSnapshot.checkOutTime;
        updateData.checkInTime = finalIn;
        updateData.checkOutTime = finalOut;

        const metrics = await EnterpriseTimeService.calculateTimeMetrics(
          recordSnapshot.userId,
          recordSnapshot.userDepartment || 'general',
          finalIn,
          finalOut
        );
        updateData.workingHours = metrics.workingHours;
      } else if (action === 'rejected') {
        updateData.status = 'absent';
      } else if (action === 'accepted') {
        updateData.status = 'present';
      }

      await storage.updateAttendance(id, updateData);

      await NotificationService.notifyAdjustmentMade(
        recordSnapshot.userId,
        recordSnapshot.date,
        action,
        notes
      );

      res.json({ success: true });
    } catch (error) {
      console.error("Error processing review:", error);
      res.status(500).json({ success: false, message: "Failed to process review" });
    }
  });


  // Activity Logs with optimized performance
  app.get("/api/activity-logs", verifyAuth, async (req, res) => {
    try {
      // Check if user is authenticated
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get limit parameter with fallback and validation
      const limitParam = req.query.limit;
      const limit = limitParam ? Math.min(Math.max(parseInt(limitParam as string, 10) || 10, 1), 50) : 10;

      // Try to fetch stored activity logs first
      try {
        const storedLogs = await storage.listActivityLogs(limit);

        // If we have enough stored logs, return them directly
        if (storedLogs.length >= limit) {
          return res.json(storedLogs);
        }

        // If we have some logs but not enough, supplement with generated logs
        const activities = [...storedLogs];
        const remainingCount = limit - storedLogs.length;

        // Get supplementary data and generate activities
        const [customers, quotations, invoices] = await Promise.all([
          storage.listCustomers(),
          storage.listQuotations(),
          storage.listInvoices()
        ]);

        // Generate from customers if needed
        if (customers.length > 0 && activities.length < limit) {
          const existingCustomerIds = new Set(
            activities
              .filter(a => a.entityType === 'customer')
              .map(a => a.entityId)
          );

          const newCustomerActivities = customers
            .filter(c => !existingCustomerIds.has(c.id))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, remainingCount)
            .map(customer => ({
              id: `customer-${customer.id}`,
              type: 'customer_created' as const,
              title: "New customer added",
              description: `${customer.name}, ${customer.address || 'Location unknown'}`,
              createdAt: customer.createdAt,
              entityId: customer.id,
              entityType: 'customer',
              userId: user.id
            }));

          activities.push(...newCustomerActivities);
        }

        // Generate from quotations if needed
        if (quotations.length > 0 && activities.length < limit) {
          const existingQuotationIds = new Set(
            activities
              .filter(a => a.entityType === 'quotation')
              .map(a => a.entityId)
          );

          const newQuotationActivities = quotations
            .filter(q => !existingQuotationIds.has(q.id))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, limit - activities.length)
            .map(quotation => ({
              id: `quotation-${quotation.id}`,
              type: 'quotation_created' as const,
              title: "Quotation created",
              description: `${quotation.quotationNumber || 'New quotation'} for ₹${quotation.total || 0}`,
              createdAt: quotation.createdAt,
              entityId: quotation.id,
              entityType: 'quotation',
              userId: user.id
            }));

          activities.push(...newQuotationActivities);
        }

        // Generate from invoices if needed
        if (invoices.length > 0 && activities.length < limit) {
          const existingInvoiceIds = new Set(
            activities
              .filter(a => a.entityType === 'invoice')
              .map(a => a.entityId)
          );

          const newInvoiceActivities = invoices
            .filter(i => !existingInvoiceIds.has(i.id))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, limit - activities.length)
            .map(invoice => ({
              id: `invoice-${invoice.id}`,
              type: 'invoice_paid' as const,
              title: "Invoice paid",
              description: `${invoice.invoiceNumber || 'Invoice'} for ₹${invoice.total || 0}`,
              createdAt: invoice.createdAt,
              entityId: invoice.id,
              entityType: 'invoice',
              userId: user.id
            }));

          activities.push(...newInvoiceActivities);
        }

        // Sort all activities by date (newest first)
        activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        // Try to store generated activities for future use
        try {
          for (const activity of activities) {
            if (!storedLogs.some(log => log.id === activity.id)) {
              await storage.createActivityLog({
                type: activity.type,
                title: activity.title,
                description: activity.description,
                entityId: activity.entityId,
                entityType: activity.entityType,
                userId: activity.userId
              });
            }
          }
        } catch (storeError) {
          console.error("Error storing activity logs:", storeError);
          // Continue to return the activities even if storing fails
        }

        return res.json(activities.slice(0, limit));
      } catch (error) {
        console.error("Error with stored logs, falling back to generated logs:", error);

        // Fallback to fully generated logs
        const activities = [];

        const [customers, quotations, invoices] = await Promise.all([
          storage.listCustomers(),
          storage.listQuotations(),
          storage.listInvoices()
        ]);

        // Generate from customers (up to 2)
        if (customers.length > 0) {
          const recentCustomers = [...customers]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 2);

          recentCustomers.forEach(customer => {
            activities.push({
              id: `customer-${customer.id}`,
              type: 'customer_created' as const,
              title: "New customer added",
              description: `${customer.name}, ${customer.address || 'Location unknown'}`,
              createdAt: customer.createdAt,
              entityId: customer.id,
              entityType: 'customer',
              userId: user.id
            });
          });
        }

        // Generate from most recent quotation
        if (quotations.length > 0) {
          const recentQuotation = quotations
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

          activities.push({
            id: `quotation-${recentQuotation.id}`,
            type: 'quotation_created' as const,
            title: "Quotation created",
            description: `${recentQuotation.quotationNumber || 'New quotation'} for ₹${recentQuotation.total || 0}`,
            createdAt: recentQuotation.createdAt,
            entityId: recentQuotation.id,
            entityType: 'quotation',
            userId: user.id
          });
        }

        // Generate from most recent invoice
        if (invoices.length > 0) {
          const recentInvoice = invoices
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

          activities.push({
            id: `invoice-${recentInvoice.id}`,
            type: 'invoice_paid' as const,
            title: "Invoice paid",
            description: `${recentInvoice.invoiceNumber || 'Invoice'} for ₹${recentInvoice.total || 0}`,
            createdAt: recentInvoice.createdAt,
            entityId: recentInvoice.id,
            entityType: 'invoice',
            userId: user.id
          });
        }

        // Sort by creation date (newest first)
        activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return res.json(activities.slice(0, limit));
      }
    } catch (error) {
      console.error("Error generating activity logs:", error);
      res.status(500).json({
        message: "Failed to fetch activity logs",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // Users - enterprise permission based access
  app.get("/api/users", verifyAuth, async (req, res) => {
    try {
      // Try to get user first, if not found, sync from Firebase Auth
      let user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user) {
        // Sync user from Firebase Auth if not found in storage
        const syncResult = await userService.syncUserProfile(req.authenticatedUser?.uid || "", { role: 'employee' });
        if (syncResult.success) {
          user = syncResult.user;
        }
      }

      // Check enterprise permissions instead of hardcoded roles
      if (!user || !(await storage.checkEffectiveUserPermission(user.uid, "users.view"))) {
        return res.status(403).json({ message: "Access denied" });
      }

      const result = await userService.getAllUsers();
      if (Array.isArray(result)) {
        res.json(result);
      } else if (!result.success) {
        return res.status(500).json({ message: result.error });
      } else {
        res.json(result.users);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get("/api/users/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      // Allow users to view their own profile or check enterprise permissions for viewing others
      const canViewOwnProfile = user && user.id === req.params.id;
      const hasViewPermission = user && await storage.checkEffectiveUserPermission(user.uid, "users.view");

      if (!user || (!canViewOwnProfile && !hasViewPermission)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const targetUser = await storage.getUser(req.params.id);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // ✅ FIX: Add isManager flag by checking if user has subordinates
      const subordinates = await storage.getUsersByReportingManager(targetUser.id);
      const isManager = subordinates.length > 0;

      console.log(`[isManager Debug] Checking for user: ${targetUser.displayName} (${targetUser.id})`);
      console.log(`[isManager Debug] Found ${subordinates.length} subordinates`);
      if (subordinates.length > 0) {
        console.log(`[isManager Debug] Subordinates:`, subordinates.map(s => `${s.displayName} (${s.id})`));
      }
      console.log(`[isManager Debug] isManager = ${isManager}`);

      const responseUser = {
        ...targetUser,
        isManager
      };

      console.log(`[Debug API] Serving user ${req.params.id}:`, JSON.stringify({
        profilePhotoUrl: responseUser.profilePhotoUrl,
        aadharCardUrl: responseUser.aadharCardUrl,
        panCardUrl: responseUser.panCardUrl
      }, null, 2));

      res.json(responseUser);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.post("/api/users", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      // Check enterprise permission for user creation
      if (!user || !(await storage.checkEffectiveUserPermission(user.uid, "users.create"))) {
        return res.status(403).json({ message: "Access denied" });
      }

      const result = await userService.createUser(req.body);
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      res.status(201).json(result.user);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.patch("/api/users/:id", verifyAuth, async (req, res) => {
    try {
      console.log(`[PATCH /api/users/${req.params.id}] Request body:`, JSON.stringify(req.body, null, 2));

      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      console.log(`[PATCH /api/users/${req.params.id}] Authenticated user: ${user?.displayName} (${user?.uid}), Role: ${user?.role}`);

      // Check enterprise permissions for user editing
      if (!user || !(await storage.checkEffectiveUserPermission(user.uid, "users.edit"))) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check role assignment permissions using enterprise RBAC
      if (req.body.role === "master_admin" && !(await storage.checkEffectiveUserPermission(user.uid, "permissions.assign"))) {
        return res
          .status(403)
          .json({ message: "Insufficient permissions to assign master_admin role" });
      }

      const result = await userService.updateUserProfile(req.params.id, req.body);
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      res.json(result.user);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // Reactivate a terminated user
  // Reactivate a terminated user
  app.post("/api/users/:id/reactivate", verifyAuth, async (req, res) => {
    try {
      console.log(`[Reactivate API] Request received for user ${req.params.id} by ${req.authenticatedUser?.uid}`);

      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      // Only admins can reactivate users
      if (!user || !(await storage.checkEffectiveUserPermission(user.uid, "users.create"))) {
        return res.status(403).json({ message: "Access denied. Only administrators can reactivate users." });
      }

      const result = await userService.reactivateUser(req.params.id, user.uid);
      if (!result.success) {
        console.error(`[Reactivate API] Failed: ${result.error}`);
        return res.status(400).json({ message: result.error });
      }

      res.json({
        message: result.message,
        user: result.user,
        passwordResetSent: result.passwordResetSent
      });
    } catch (error) {
      console.error("Error reactivating user:", error);
      res.status(500).json({ message: "Failed to reactivate user" });
    }
  });

  // Debug endpoint to check user status
  app.get("/api/debug/user/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      res.json(user);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ==================== OTP VERIFICATION ENDPOINTS ====================

  /**
   * Send OTP to email for registration verification
   */
  app.post("/api/auth/send-otp", async (req, res) => {
    try {
      const { email } = req.body;

      // Validate and normalize email
      const normalized = email?.trim().toLowerCase();
      if (!normalized) {
        return res.status(400).json({ message: "Email is required" });
      }

      // Gmail validation
      if (!normalized.endsWith('@gmail.com') && !normalized.endsWith('@googlemail.com')) {
        return res.status(400).json({
          message: "Only Gmail addresses (@gmail.com or @googlemail.com) are accepted"
        });
      }

      // Basic email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalized)) {
        return res.status(400).json({ message: "Invalid email format" });
      }

      // Rate limiting: Check if can request new OTP
      const rateLimitCheck = otpStore.canRequestNew(normalized);
      if (!rateLimitCheck.allowed) {
        return res.status(429).json({
          message: `Please wait before requesting another code`,
          retryAfter: rateLimitCheck.retryAfter
        });
      }

      // Check if email already registered
      try {
        const existingUser = await storage.getUserByEmail(normalized);
        if (existingUser) {
          return res.status(400).json({
            message: "This email is already registered. Please login instead."
          });
        }
      } catch (error) {
        // getUserByEmail might throw if user not found, that's okay
        console.log("No existing user found, proceeding with OTP");
      }

      // Generate OTP
      const otp = generateOTP(OTP_CONFIG.LENGTH);

      // Store OTP
      otpStore.set(normalized, otp);

      // Send email
      try {
        await emailService.sendOTPEmail(normalized, otp);
        console.log(`✅ OTP email sent successfully to: ${normalized}`);
      } catch (emailError: any) {
        console.error('❌ Email sending failed:', emailError.message);

        // Development fallback: Log OTP to console
        if (process.env.NODE_ENV === 'development') {
          console.log('\n' + '='.repeat(60));
          console.log('📧 EMAIL DELIVERY FAILED - DEVELOPMENT MODE FALLBACK');
          console.log('='.repeat(60));
          console.log(`📨 Email: ${normalized}`);
          console.log(`🔑 OTP Code: ${otp}`);
          console.log(`⏰ Expires in: ${OTP_CONFIG.EXPIRY_MINUTES} minutes`);
          console.log(`💡 Copy this code to test the registration flow`);
          console.log('='.repeat(60) + '\n');

          // Continue without throwing error in development
          console.log('⚠️  Note: In production, configure a verified domain at resend.com/domains');
        } else {
          // In production, fail if email can't be sent
          otpStore.delete(normalized);
          return res.status(500).json({
            message: "Failed to send verification code. Please try again."
          });
        }
      }

      res.json({
        message: "Verification code sent to your email",
        expiresIn: OTP_CONFIG.EXPIRY_MINUTES * 60 // seconds
      });

    } catch (error) {
      console.error("Error sending OTP:", error);
      res.status(500).json({ message: "Failed to send verification code" });
    }
  });

  /**
   * Verify OTP code
   */
  app.post("/api/auth/verify-otp", async (req, res) => {
    try {
      const { email, otp } = req.body;

      const normalized = email?.trim().toLowerCase();
      if (!normalized || !otp) {
        return res.status(400).json({ message: "Email and OTP are required" });
      }

      // Validate OTP format
      if (!validateOTPFormat(otp)) {
        return res.status(400).json({ message: "Invalid OTP format. Must be 6 digits." });
      }

      // Get stored OTP
      const storedOTP = otpStore.get(normalized);
      if (!storedOTP) {
        return res.status(400).json({
          message: "No verification code found. Please request a new one."
        });
      }

      // Check expiration
      if (otpStore.isExpired(normalized)) {
        otpStore.delete(normalized);
        return res.status(400).json({
          message: "Verification code expired. Please request a new one."
        });
      }

      // Check attempts
      if (storedOTP.attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
        otpStore.delete(normalized);
        return res.status(400).json({
          message: "Too many failed attempts. Please request a new code."
        });
      }

      // Verify OTP
      if (storedOTP.otp !== otp) {
        storedOTP.attempts++;
        otpStore.update(normalized, { attempts: storedOTP.attempts });

        const remaining = OTP_CONFIG.MAX_ATTEMPTS - storedOTP.attempts;
        return res.status(400).json({
          message: `Incorrect verification code. ${remaining} attempt(s) remaining.`
        });
      }

      // Success! Mark as verified
      otpStore.update(normalized, { verified: true });

      res.json({
        message: "Email verified successfully",
        verified: true
      });

    } catch (error) {
      console.error("Error verifying OTP:", error);
      res.status(500).json({ message: "Failed to verify code" });
    }
  });

  /**
   * Public registration endpoint with OTP verification
   */
  app.post("/api/auth/register-public", async (req, res) => {
    try {
      const { email, password, displayName } = req.body;

      // Validate required fields
      if (!email || !password || !displayName) {
        return res.status(400).json({
          message: "Email, password, and name are required"
        });
      }

      // Normalize email
      const normalized = email.trim().toLowerCase();

      // Gmail validation
      if (!normalized.endsWith('@gmail.com') && !normalized.endsWith('@googlemail.com')) {
        return res.status(400).json({
          message: "Only Gmail addresses are accepted"
        });
      }

      // Check OTP verification
      const otpRecord = otpStore.get(normalized);
      if (!otpRecord || !otpRecord.verified) {
        return res.status(400).json({
          message: "Email not verified. Please complete OTP verification first."
        });
      }

      // Check if OTP is still valid (not expired)
      if (otpStore.isExpired(normalized)) {
        otpStore.delete(normalized);
        return res.status(400).json({
          message: "Verification expired. Please start registration again."
        });
      }

      // Create Firebase user
      try {
        const userRecord = await auth.createUser({
          email: normalized,
          password,
          displayName,
          emailVerified: true // Mark as verified since we verified via OTP
        });

        // Clean up OTP record
        otpStore.delete(normalized);

        // Create user in database
        await storage.createUser({
          uid: userRecord.uid,
          email: normalized,
          displayName,
          role: 'employee', // Default role for public registration
          isActive: true,
          employeeStatus: 'active'
        });

        console.log(`Public registration successful for: ${normalized}`);

        res.status(201).json({
          message: "Registration successful! You can now log in.",
          user: {
            uid: userRecord.uid,
            email: normalized,
            displayName
          }
        });
      } catch (firebaseError: any) {
        console.error("Firebase user creation error:", firebaseError);

        // Handle specific Firebase errors
        if (firebaseError.code === 'auth/email-already-exists') {
          return res.status(400).json({
            message: "This email is already registered. Please login instead."
          });
        }

        if (firebaseError.code === 'auth/weak-password') {
          return res.status(400).json({
            message: "Password is too weak. Please use at least 6 characters."
          });
        }

        throw firebaseError;
      }
    } catch (error) {
      console.error("Error in public registration:", error);
      res.status(500).json({ message: "Registration failed. Please try again." });
    }
  });

  // Registration endpoint - DISABLED for public use
  // Employee accounts must be created by admins through /api/users
  app.post("/api/auth/register", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      // Only master_admin and admin can register new users
      if (!user || (user.role !== "master_admin" && user.role !== "admin")) {
        return res.status(403).json({
          message: "Public registration is disabled. Please contact your administrator to create an account."
        });
      }

      console.log("Admin registration request received for:", req.body.email || "unknown");

      const result = await userService.createUser({
        ...req.body,
        role: req.body.role || "employee", // Allow role specification for admins
        createLogin: true // Always create login for admin-registered users
      });

      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      res.status(201).json({
        message: result.message || "User registered successfully",
        user: {
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName,
          role: result.user.role
        },
        loginCreated: result.loginCreated,
        passwordResetSent: result.passwordResetSent
      });
    } catch (error) {
      console.error("Error registering user:", error);
      res.status(500).json({ message: "Failed to register user" });
    }
  });

  // Public endpoint for syncing user profile after Firebase Auth registration
  app.post("/api/sync-user", async (req, res) => {
    try {
      console.log("User sync request received:", req.body);

      // Get UID from request body or auth token
      let uid = req.body.uid;

      if (!uid) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          const token = authHeader.split("Bearer ")[1];
          try {
            const decodedToken = await auth.verifyIdToken(token);
            uid = decodedToken.uid;
          } catch (error) {
            console.error("Token verification failed during sync:", error);
            return res.status(401).json({ message: "Invalid or missing authentication" });
          }
        } else {
          return res.status(400).json({ message: "UID required for user sync" });
        }
      }

      const result = await userService.syncUserProfile(uid, req.body);

      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      res.json({
        message: "User profile synced successfully",
        user: result.user,
        action: result.action
      });
    } catch (error) {
      console.error("Error syncing user:", error);
      res.status(500).json({ message: "Failed to sync user profile" });
    }
  });

  // Sync user endpoint to fix existing user data
  app.post("/api/auth/sync", verifyAuth, async (req, res) => {
    try {
      // Pass any displayName from the request body to preserve user registration data
      const syncData = req.body.displayName ? { displayName: req.body.displayName } : {};
      const result = await userService.syncUserProfile(req.authenticatedUser?.uid || "", syncData);

      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      res.json({
        message: "User profile synced successfully",
        user: result.user,
        action: result.action
      });
    } catch (error) {
      console.error("Error syncing user:", error);
      res.status(500).json({ message: "Failed to sync user profile" });
    }
  });

  // Enterprise-grade user permission routes
  app.get("/api/users/:id/permissions", verifyAuth, async (req, res) => {
    try {
      const requestingUser = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!requestingUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Allow users to check their own permissions or admins to check others
      if (req.params.id !== req.authenticatedUser?.uid || "" && requestingUser.role !== "master_admin" && requestingUser.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      const targetUser = await storage.getUser(req.params.id);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get effective permissions using enterprise RBAC
      const effectivePermissions = await storage.getEffectiveUserPermissions(req.params.id);
      const approvalLimits = await storage.getUserApprovalLimits(req.params.id);

      res.json({
        user: {
          uid: targetUser.uid,
          email: targetUser.email,
          displayName: targetUser.displayName,
          role: targetUser.role,
          department: targetUser.department,
          designation: targetUser.designation
        },
        permissions: effectivePermissions,
        canApprove: approvalLimits.canApprove,
        maxApprovalAmount: approvalLimits.maxAmount,
        rbacInfo: {
          departmentAccess: targetUser.department ? `Department: ${targetUser.department} (defines which modules they can access)` : null,
          designationLevel: targetUser.designation ? `Designation: ${targetUser.designation} (defines what actions they can perform)` : null
        }
      });
    } catch (error) {
      console.error("Error fetching user permissions:", error);
      res.status(500).json({ message: "Failed to fetch user permissions" });
    }
  });

  // Delete user (Master Admin only)
  app.delete("/api/users/:uid", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const requestingUser = await storage.getUser(req.authenticatedUser.uid);
      if (!requestingUser || requestingUser.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied. Only master admin can delete users." });
      }

      const uid = req.params.uid;
      const result = await userService.deleteUser(uid);

      if (!result.success) {
        // Check for specific error message about reporting manager
        if (result.error && result.error.includes("reporting manager")) {
          return res.status(400).json({ message: result.error });
        }
        return res.status(500).json({ message: result.error });
      }

      res.status(200).json({ message: "User deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Enterprise RBAC testing endpoint
  app.get("/api/rbac/test", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - Master admin only" });
      }

      const { getDepartmentModuleAccess, getDesignationActionPermissions, getEffectivePermissions } = await import("@shared/schema");

      // Test different department + designation combinations
      const testCases = [
        { department: "operations", designation: "ceo" },
        { department: "admin", designation: "executive" },
        { department: "hr", designation: "executive" },
        { department: "marketing", designation: "executive" },
        { department: "sales", designation: "cre" },
        { department: "technical", designation: "team_leader" },
        { department: "housekeeping", designation: "house_man" }
      ];

      const results = testCases.map(({ department, designation }) => ({
        combination: `${department} + ${designation}`,
        departmentAccess: getDepartmentModuleAccess(department as any),
        designationActions: getDesignationActionPermissions(designation as any),
        effectivePermissions: getEffectivePermissions(department as any, designation as any)
      }));

      res.json({
        message: "Enterprise RBAC Test Results",
        description: "Department = Feature Access (modules), Designation = Action Permissions (what they can do)",
        testResults: results,
        currentUser: {
          department: user.department,
          designation: user.designation,
          effectivePermissions: await storage.getEffectiveUserPermissions(user.uid)
        }
      });
    } catch (error) {
      console.error("Error testing RBAC:", error);
      res.status(500).json({ message: "Failed to test RBAC system" });
    }
  });

  app.get("/api/users/department/:department", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || (user.role !== "master_admin" && user.role !== "admin")) {
        return res.status(403).json({ message: "Access denied" });
      }

      const users = await storage.getUsersByDepartment(req.params.department);
      res.json(users);
    } catch (error) {
      console.error("Error fetching users by department:", error);
      res.status(500).json({ message: "Failed to fetch users by department" });
    }
  });

  app.get("/api/users/designation/:designation", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || (user.role !== "master_admin" && user.role !== "admin")) {
        return res.status(403).json({ message: "Access denied" });
      }

      const users = await storage.getUsersByDesignation(req.params.designation);
      res.json(users);
    } catch (error) {
      console.error("Error fetching users by designation:", error);
      res.status(500).json({ message: "Failed to fetch users by designation" });
    }
  });

  app.get("/api/users/:managerId/subordinates", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Allow users to check their own subordinates or admins to check others
      if (req.params.managerId !== req.authenticatedUser?.uid || "" && user.role !== "master_admin" && user.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      const subordinates = await storage.getUsersByReportingManager(req.params.managerId);
      res.json(subordinates);
    } catch (error) {
      console.error("Error fetching subordinates:", error);
      res.status(500).json({ message: "Failed to fetch subordinates" });
    }
  });

  // Designation Management Routes
  app.get("/api/designations", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || (user.role !== "master_admin" && user.role !== "admin")) {
        return res.status(403).json({ message: "Access denied" });
      }

      const designations = await storage.listDesignations();
      res.json(designations);
    } catch (error) {
      console.error("Error fetching designations:", error);
      res.status(500).json({ message: "Failed to fetch designations" });
    }
  });

  app.post("/api/designations", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      const designation = await storage.createDesignation(req.body);
      res.status(201).json(designation);
    } catch (error) {
      console.error("Error creating designation:", error);
      res.status(500).json({ message: "Failed to create designation" });
    }
  });

  app.patch("/api/designations/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      const designation = await storage.updateDesignation(req.params.id, req.body);
      res.json(designation);
    } catch (error) {
      console.error("Error updating designation:", error);
      res.status(500).json({ message: "Failed to update designation" });
    }
  });

  app.delete("/api/designations/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.deleteDesignation(req.params.id);
      res.json({ message: "Designation deleted successfully" });
    } catch (error) {
      console.error("Error deleting designation:", error);
      res.status(500).json({ message: "Failed to delete designation" });
    }
  });

  // Permission Group Management Routes
  app.get("/api/permission-groups", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      const permissionGroups = await storage.listPermissionGroups();
      res.json(permissionGroups);
    } catch (error) {
      console.error("Error fetching permission groups:", error);
      res.status(500).json({ message: "Failed to fetch permission groups" });
    }
  });

  app.post("/api/permission-groups", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      const permissionGroup = await storage.createPermissionGroup(req.body);
      res.status(201).json(permissionGroup);
    } catch (error) {
      console.error("Error creating permission group:", error);
      res.status(500).json({ message: "Failed to create permission group" });
    }
  });

  app.patch("/api/permission-groups/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      const permissionGroup = await storage.updatePermissionGroup(req.params.id, req.body);
      res.json(permissionGroup);
    } catch (error) {
      console.error("Error updating permission group:", error);
      res.status(500).json({ message: "Failed to update permission group" });
    }
  });

  app.delete("/api/permission-groups/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.deletePermissionGroup(req.params.id);
      res.json({ message: "Permission group deleted successfully" });
    } catch (error) {
      console.error("Error deleting permission group:", error);
      res.status(500).json({ message: "Failed to delete permission group" });
    }
  });

  // Migration endpoint for organizational structure
  app.post("/api/admin/migrate-organization", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - master admin only" });
      }

      const { migrateOrganizationalStructure } = await import('./migration-organizational-structure');
      const result = await migrateOrganizationalStructure();

      if (result.success) {
        res.json({
          message: "Migration completed successfully",
          migratedCount: result.migratedCount
        });
      } else {
        res.status(500).json({
          message: "Migration failed",
          error: result.error
        });
      }
    } catch (error) {
      console.error("Error running migration:", error);
      res.status(500).json({ message: "Failed to run migration" });
    }
  });

  // Departments
  app.get("/api/departments", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || (user.role !== "master_admin" && user.role !== "admin")) {
        return res.status(403).json({ message: "Access denied" });
      }
      const departments = await storage.listDepartments();
      res.json(departments);
    } catch (error) {
      console.error("Error fetching departments:", error);
      res.status(500).json({ message: "Failed to fetch departments" });
    }
  });

  // Office Locations
  app.get("/api/office-locations", verifyAuth, async (req, res) => {
    try {
      let officeLocations = await storage.listOfficeLocations();

      // If no office locations exist, create default office location
      if (officeLocations.length === 0) {
        // NOTE: Office location mutation methods have been removed
        // If you need to create office locations, do so via Firebase Console
        console.warn('No office locations found. Please create via Firebase Console.');

        // const defaultLocation = {
        //   name: "Head Office - Godiva Solar",
        //   latitude: "9.966844592415782",
        //   longitude: "78.1338405791111",
        //   radius: 100
        // };
        // await storage.createOfficeLocation(defaultLocation);
        // officeLocations = await storage.listOfficeLocations();
      }

      res.json(officeLocations);
    } catch (error) {
      console.error("Error fetching office locations:", error);
      res.status(500).json({ message: "Failed to fetch office locations" });
    }
  });



  // Attendance
  app.get("/api/attendance", verifyAuth, async (req, res) => {
    try {
      const { userId, date } = req.query;
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const requestingUser = req.authenticatedUser.user;

      // If specific userId and date requested
      if (userId && date) {
        // Users can only access their own data unless they're admin/master_admin
        if (
          requestingUser.role !== "master_admin" &&
          requestingUser.role !== "admin" &&
          requestingUser.uid !== userId
        ) {
          return res.status(403).json({ message: "Access denied" });
        }
        const attendance = await storage.getUserAttendanceForDate(userId as string, date as string);
        return res.json(attendance || null);
      }

      // If specific userId requested (all records for that user)
      if (userId) {
        // Users can only access their own data unless they're admin/master_admin
        if (
          requestingUser.role !== "master_admin" &&
          requestingUser.role !== "admin" &&
          requestingUser.uid !== userId
        ) {
          return res.status(403).json({ message: "Access denied" });
        }
        const attendance = await storage.listAttendanceByUser(userId as string);
        // P2: Exclude pending reviews
        const filtered = attendance.filter(r => r.adminReviewStatus !== 'pending');
        return res.json(filtered);
      }

      // If specific date requested (all users for that date - admin only)
      if (date) {
        if (
          requestingUser.role !== "master_admin" &&
          requestingUser.role !== "admin"
        ) {
          return res.status(403).json({ message: "Access denied" });
        }
        const attendance = await storage.listAttendanceByDate(
          new Date(date as string),
        );
        // P2: Exclude pending reviews
        const filtered = attendance.filter(r => r.adminReviewStatus !== 'pending');
        return res.json(filtered);
      }

      // Default case: return current user's own attendance data
      // This allows employees to view their own attendance without specifying userId
      const attendance = await storage.listAttendanceByUser(requestingUser.uid);
      // P2: Exclude pending reviews
      const filtered = attendance.filter(r => r.adminReviewStatus !== 'pending');
      return res.json(filtered);
    } catch (error) {
      console.error("Error fetching attendance:", error);
      res.status(500).json({ message: "Failed to fetch attendance" });
    }
  });

  app.post("/api/attendance/check-in", verifyAuth, async (req, res) => {
    try {
      const {
        userId,
        latitude,
        longitude,
        accuracy = 100,
        attendanceType = "office",
        customerName,
        reason,
        imageUrl
      } = req.body;

      if (!userId || userId !== req.authenticatedUser?.uid || "") {
        return res.status(403).json({ message: "Access denied" });
      }

      // Input validation
      if (!latitude || !longitude) {
        return res.status(400).json({
          message: "Location coordinates are required",
          recommendations: ["Please enable location services and try again"]
        });
      }

      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return res.status(400).json({
          message: "Invalid location coordinates",
          recommendations: ["Location must be valid GPS coordinates"]
        });
      }

      // Import and use unified attendance service
      const { UnifiedAttendanceService } = await import('./services/unified-attendance-service');

      const checkInRequest = {
        userId,
        latitude: Number(latitude),
        longitude: Number(longitude),
        accuracy: Number(accuracy),
        attendanceType: attendanceType as 'office' | 'remote' | 'field_work',
        reason,
        customerName,
        imageUrl
      };

      console.log('ENTERPRISE CHECK-IN: Processing request with advanced location validation');
      console.log('Location:', { latitude, longitude, accuracy, attendanceType });

      const result = await UnifiedAttendanceService.processCheckIn(checkInRequest);

      if (!result.success) {
        console.log('ENTERPRISE CHECK-IN: Validation failed -', result.message);
        return res.status(400).json({
          message: result.message
        });
      }

      console.log('ENTERPRISE CHECK-IN: Success -', result.message);

      // Success response with comprehensive information
      res.status(201).json({
        message: result.message,
        success: true,
        attendance: {
          id: result.attendanceId,
          type: attendanceType,
          timestamp: new Date().toISOString(),
          ...result.attendanceDetails
        },
        location: {
          validation: {
            type: result.locationValidation.validationType,
            confidence: Math.round(result.locationValidation.confidence * 100),
            distance: result.locationValidation.distance,
            accuracy: result.locationValidation.metadata.accuracy,
            indoorDetection: result.locationValidation.metadata.indoorDetection
          },
          office: result.locationValidation.detectedOffice ? {
            name: result.locationValidation.detectedOffice.name,
            distance: result.locationValidation.detectedOffice.distance
          } : null
        },
        recommendations: result.recommendations,
        enterprise: {
          version: "v2.0-unified",
          locationEngine: "enterprise-grade",
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error("Enterprise check-in error:", error);
      res.status(500).json({
        message: "System error during check-in processing",
        error: {
          type: "enterprise_service_error",
          timestamp: new Date().toISOString()
        },
        recommendations: [
          "Please try again in a moment",
          "If the issue persists, contact system administrator"
        ]
      });
    }
  });

  // Photo upload endpoint for attendance
  app.post("/api/attendance/upload-photo", verifyAuth, async (req, res) => {
    try {
      const { imageData, userId, attendanceType } = req.body;

      // Validate request
      if (!imageData || !userId) {
        return res.status(400).json({
          message: "Invalid request - image data and user ID required"
        });
      }

      // For site visit and follow-up uploads, allow temporary user IDs
      const isSiteVisitUpload = userId.startsWith('site_visit') || userId.startsWith('sitevisit') || userId.startsWith('followup');
      if (!isSiteVisitUpload && userId !== req.authenticatedUser?.uid || "") {
        return res.status(400).json({
          message: "Invalid request - user ID mismatch"
        });
      }

      if (!attendanceType) {
        return res.status(400).json({
          message: "Photo type is required for photo upload"
        });
      }

      // Validate base64 image format
      if (!imageData.startsWith('data:image/')) {
        return res.status(400).json({
          message: "Invalid image format - base64 image data required"
        });
      }

      console.log('SERVER: Processing photo upload for user:', userId, 'type:', attendanceType);
      console.log('SERVER: Image data size:', imageData.length);

      // Import and use Cloudinary service
      const { CloudinaryService } = await import('./services/cloudinary-service');

      // Upload to Cloudinary with appropriate context
      const uploadResult = await CloudinaryService.uploadAttendancePhoto(
        imageData,
        userId,
        new Date()
      );

      if (!uploadResult.success) {
        console.error('SERVER: Cloudinary upload failed:', uploadResult.error);
        return res.status(500).json({
          message: "Photo upload failed",
          error: uploadResult.error
        });
      }

      console.log('SERVER: Photo uploaded successfully to:', uploadResult.url);

      // Log the photo upload activity (skip for site visit temp uploads)
      if (!userId.startsWith('site_visit')) {
        const user = await storage.getUser(userId);
        if (user) {
          await storage.createActivityLog({
            type: attendanceType.includes('site_visit') ? 'site_visit' : 'attendance',
            title: attendanceType.includes('site_visit') ? 'Site Visit Photo Uploaded' : 'Attendance Photo Uploaded',
            description: `${user.displayName} uploaded photo for ${attendanceType}`,
            entityId: uploadResult.publicId || 'unknown',
            entityType: 'cloudinary_image',
            userId: user.uid
          });
        }
      }

      res.json({
        success: true,
        url: uploadResult.url,
        publicId: uploadResult.publicId,
        message: "Photo uploaded successfully"
      });

    } catch (error) {
      console.error('SERVER: Photo upload error:', error);
      res.status(500).json({
        message: "Internal server error during photo upload",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Employee document upload endpoint (Photo, Aadhar, PAN)
  app.post("/api/employees/upload-document", verifyAuth, async (req, res) => {
    try {
      const { imageData, employeeId, documentType } = req.body;

      // Validate request
      if (!imageData || !employeeId || !documentType) {
        return res.status(400).json({
          message: "Invalid request - image data, employee ID, and document type required"
        });
      }

      // Validate document type
      const validDocumentTypes = ['photo', 'aadhar', 'pan'];
      if (!validDocumentTypes.includes(documentType)) {
        return res.status(400).json({
          message: `Invalid document type. Must be one of: ${validDocumentTypes.join(', ')}`
        });
      }

      // Validate base64 image format
      if (!imageData.startsWith('data:image/')) {
        return res.status(400).json({
          message: "Invalid image format - base64 image data required"
        });
      }

      console.log('SERVER: Processing employee document upload for:', employeeId, 'type:', documentType);
      console.log('SERVER: Image data size:', imageData.length);

      // Import Cloudinary service
      const { CloudinaryService } = await import('./services/cloudinary-service');

      // Upload to appropriate Cloudinary folder based on document type
      let uploadResult;
      switch (documentType) {
        case 'photo':
          uploadResult = await CloudinaryService.uploadEmployeePhoto(imageData, employeeId);
          break;
        case 'aadhar':
          uploadResult = await CloudinaryService.uploadAadharCard(imageData, employeeId);
          break;
        case 'pan':
          uploadResult = await CloudinaryService.uploadPanCard(imageData, employeeId);
          break;
        default:
          return res.status(400).json({ message: "Invalid document type" });
      }

      if (!uploadResult.success) {
        console.error('SERVER: Cloudinary document upload failed:', uploadResult.error);
        return res.status(500).json({
          message: "Document upload failed",
          error: uploadResult.error
        });
      }

      console.log('SERVER: Employee document uploaded successfully to:', uploadResult.url);

      // Log the document upload activity
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (user) {
        await storage.createActivityLog({
          type: 'hr',
          title: `Employee ${documentType.toUpperCase()} Document Uploaded`,
          description: `${user.displayName} uploaded ${documentType} document for employee ${employeeId}`,
          entityId: employeeId,
          entityType: 'employee_document',
          userId: user.uid
        });
      }

      res.json({
        success: true,
        url: uploadResult.url,
        publicId: uploadResult.publicId,
        documentType: documentType,
        message: `${documentType.charAt(0).toUpperCase() + documentType.slice(1)} document uploaded successfully`
      });

    } catch (error) {
      console.error('SERVER: Employee document upload error:', error);
      res.status(500).json({
        message: "Internal server error during document upload",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post("/api/attendance/check-out", createRateLimitMiddleware(attendanceRateLimiter), verifyAuth, async (req, res) => {
    try {
      const { userId, latitude, longitude, imageUrl, reason } = req.body;
      // Allow reason to be used for otReason if not explicitly provided
      const otReason = req.body.otReason || reason;

      if (!userId || userId !== req.authenticatedUser?.uid || "") {
        return res.status(403).json({ message: "Access denied" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // CRITICAL FIX: Use UTC midnight to match UnifiedAttendanceService storage format
      // Local time setHours(0,0,0,0) creates mismatched timestamps in IST (+5:30)
      const now = new Date();

      const today = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0, 0, 0, 0
      ));

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // First try to find attendance record for today
      let attendanceRecord = await storage.getAttendanceByUserAndDate(userId, today);

      // If not found today and it's early hours (before 6 AM), check yesterday
      if (!attendanceRecord && now.getHours() < 6) {
        attendanceRecord = await storage.getAttendanceByUserAndDate(userId, yesterday);
      }

      if (!attendanceRecord) {
        return res.status(400).json({ message: "No check-in record found for today" });
      }

      if (attendanceRecord.checkOutTime) {
        return res.status(400).json({ message: "You have already checked out today" });
      }

      // CRITICAL FIX: Use Enterprise Time Service for all time operations
      const { EnterpriseTimeService } = await import("./services/enterprise-time-service");
      const finalCheckOutTime = new Date();

      // Get department timing through Enterprise Time Service for consistency
      const departmentTiming = user.department
        ? await EnterpriseTimeService.getDepartmentTiming(user.department)
        : null;

      if (!departmentTiming) {
        return res.status(400).json({
          message: "Department timing not configured. Please contact administrator."
        });
      }

      // CRITICAL FIX: Use Enterprise Time Service for time calculations
      const checkInTime = new Date(attendanceRecord.checkInTime || new Date());

      // Calculate comprehensive time metrics using Enterprise Time Service
      const timeMetrics = await EnterpriseTimeService.calculateTimeMetrics(
        userId,
        user.department || 'operations',
        checkInTime,
        finalCheckOutTime
      );

      const { workingHours, overtimeHours } = timeMetrics;

      // Use department-specific working hours from timing
      const standardWorkingHours = departmentTiming.workingHours || 8;
      const overtimeThresholdMinutes = departmentTiming.overtimeThresholdMinutes || 30;

      // Check if overtime meets the threshold
      const overtimeMinutes = overtimeHours * 60;
      const hasOvertimeThreshold = overtimeMinutes >= overtimeThresholdMinutes;

      // Check if overtime requires approval and photo
      if (hasOvertimeThreshold) {
        if (!otReason) {
          return res.status(400).json({
            message: `Overtime exceeds ${overtimeThresholdMinutes} minute threshold. Please provide a reason.`,
            overtimeHours: Math.round(overtimeHours * 100) / 100,
            overtimeMinutes: Math.round(overtimeMinutes),
            threshold: overtimeThresholdMinutes,
            requiresOTReason: true
          });
        }
        if (!imageUrl) {
          return res.status(400).json({
            message: `Overtime exceeds ${overtimeThresholdMinutes} minute threshold. Photo verification required.`,
            overtimeHours: Math.round(overtimeHours * 100) / 100,
            overtimeMinutes: Math.round(overtimeMinutes),
            threshold: overtimeThresholdMinutes,
            requiresPhoto: true
          });
        }
      }

      // CRITICAL FIX: Use time metrics for early/overtime detection
      const isOvertimeCheckout = overtimeHours > 0;
      const earlyCheckout = !isOvertimeCheckout && workingHours < standardWorkingHours;
      const earlyMinutes = earlyCheckout ? Math.floor((standardWorkingHours - workingHours) * 60) : 0;

      // Early checkout reason requirement (simplified - just ask for reason, no policy blocking)
      if (!isOvertimeCheckout && earlyCheckout) {
        console.log(`CHECKOUT: Early checkout detected - Department: ${user.department}, earlyMinutes: ${earlyMinutes}`);

        // Only require reason for early checkout, don't block based on department policy
        if (!reason || reason.trim().length < 10) {
          return res.status(400).json({
            message: `Early checkout (${earlyMinutes} minutes early) requires a detailed reason (minimum 10 characters)`,
            expectedHours: standardWorkingHours,
            actualHours: workingHours,
            requiresReason: true,
            isEarlyCheckout: true,
            earlyMinutes
          });
        }
      }

      // CRITICAL: Auto-tag half-day status based on working hours (50% threshold)
      // Only auto-tag during normal checkout, NOT during auto-checkout
      let finalStatus = attendanceRecord.status; // Keep original status by default

      if (workingHours < (standardWorkingHours * 0.5)) {
        finalStatus = 'half_day' as any;
        console.log(`CHECKOUT: Auto-tagging as half_day - worked ${workingHours.toFixed(2)}h < 50% of ${standardWorkingHours}h`);
      }

      // Update attendance record with checkout details
      const updatedAttendance = await storage.updateAttendance(attendanceRecord.id, {
        checkOutTime: finalCheckOutTime,
        checkOutLatitude: String(latitude),
        checkOutLongitude: String(longitude),
        checkOutImageUrl: imageUrl,
        workingHours: Math.round(workingHours * 100) / 100,
        overtimeHours: Math.round(overtimeHours * 100) / 100,
        status: finalStatus, // Apply auto-tagged status
        otReason: hasOvertimeThreshold ? otReason : undefined,
        remarks: reason || (hasOvertimeThreshold ? `Overtime: ${otReason}` : undefined)
      });

      // Log activity
      await storage.createActivityLog({
        type: 'attendance',
        title: `Check-out ${hasOvertimeThreshold ? 'with Overtime' : ''}`,
        description: `${user.displayName} checked out at ${finalCheckOutTime.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}${hasOvertimeThreshold ? ` with ${Math.round(overtimeHours * 100) / 100} hours overtime` : ''}${earlyCheckout ? ' (early checkout)' : ''}`,
        entityId: attendanceRecord.id,
        entityType: 'attendance',
        userId: user.uid
      });

      res.json({
        message: `Checked out successfully${hasOvertimeThreshold ? ` with ${Math.round(overtimeHours * 100) / 100} hours overtime` : ''}`,
        attendance: updatedAttendance,
        workingHours: Math.round(workingHours * 100) / 100,
        overtimeHours: Math.round(overtimeHours * 100) / 100,
        hasOvertime: hasOvertimeThreshold,
        checkOutTime: finalCheckOutTime,
        departmentSettings: {
          expectedCheckOut: departmentTiming.checkOutTime,
          standardHours: standardWorkingHours,
          overtimeThreshold: overtimeThresholdMinutes
        },
        timeMetrics
      });
    } catch (error: any) {
      console.error("Error checking out:", error);
      res.status(500).json({ message: "Failed to process check-out" });
    }
  });

  // ✅ REMOVED: Legacy Manual OT routes (/api/attendance/ot-start, /api/attendance/ot-end)
  // Frontend migrated to /api/ot/sessions/start and /api/ot/sessions/:id/end
  // These new routes use OTSessionService and write to otSessions[] array only

  // Get OT status for user
  app.get("/api/ot/status", verifyAuth, async (req, res) => {
    try {
      // Security: Derive user from auth token only, never from query params
      if (!req.authenticatedUser) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      const userId = req.authenticatedUser.uid;

      // ✅ MIGRATION: Use OTSessionService (reads from otSessions[] array)
      // This replaces legacy ManualOTService which used old otStatus/otStartTime fields
      const { OTSessionService } = await import('./services/ot-session-service');
      const { ManualOTService } = await import('./services/manual-ot-service');

      console.log(`[OT-STATUS-ROUTE] Fetching OT status for user: ${userId}`);

      const [otStatus, otButtonAvailability] = await Promise.all([
        OTSessionService.getOTStatus(userId),  // ✅ NEW: Reads from otSessions[]
        ManualOTService.isOTButtonAvailable(userId)  // ⚠️ KEEP: Holiday/weekend check logic
      ]);

      console.log(`[OT-STATUS-ROUTE] Button availability result:`, otButtonAvailability);

      // Return consistent response structure
      res.json({
        success: true,
        ...otStatus,
        buttonAvailable: otButtonAvailability.available,
        buttonReason: otButtonAvailability.reason,
        nextAvailableTime: otButtonAvailability.nextAvailableTime
      });
    } catch (error: any) {
      console.error("Error getting OT status:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get OT status"
      });
    }
  });

  // Department Timing Management APIs
  // REMOVED: Legacy route that returned hardcoded default values and ignored Firestore.
  // The correct route is at line 6008+ which uses EnterpriseTimeService to read from database.

  // Get specific department timing
  app.get("/api/departments/:departmentId/timing", verifyAuth, async (req, res) => {
    try {
      const { departmentId } = req.params;
      const { user } = req.authenticatedUser;

      // Users can view their own department timing or master_admin can view all
      if (user.role !== "master_admin" && user.department !== departmentId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Use EnterpriseTimeService which provides defaults when timing not configured
      const { EnterpriseTimeService } = await import("./services/enterprise-time-service");
      const timing = await EnterpriseTimeService.getDepartmentTiming(departmentId);

      // EnterpriseTimeService always returns a timing object (with defaults if not found)
      res.json(timing);
    } catch (error: any) {
      console.error("Error fetching department timing:", error);
      res.status(500).json({ message: "Failed to fetch department timing" });
    }
  });

  // Update department timing (Master admin only)
  app.post("/api/departments/:departmentId/timing", verifyAuth, async (req, res) => {
    try {
      const { departmentId } = req.params;
      const { user } = req.authenticatedUser;

      // Only master_admin can update department timings
      if (user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      // CRITICAL: Normalize department name to lowercase for consistent storage
      const normalizedDeptId = departmentId.toLowerCase();

      const {
        checkInTime,
        checkOutTime,
        workingHours,
        overtimeThresholdMinutes,
        lateThresholdMinutes,
        isFlexibleTiming,
        flexibleCheckInStart,
        flexibleCheckInEnd,
        breakDurationMinutes,
        weeklyOffDays,
        autoCheckoutGraceMinutes,
      } = req.body;

      console.log('BACKEND: Policy values received: none (removed)');

      // Validate timing data
      if (!checkInTime || !checkOutTime || !workingHours) {
        return res.status(400).json({ message: "Check-in time, check-out time, and working hours are required" });
      }

      const timingData = {
        department: normalizedDeptId, // Store normalized department name
        checkInTime,
        checkOutTime,
        workingHours: parseInt(workingHours),
        overtimeThresholdMinutes: parseInt(overtimeThresholdMinutes) || 30,
        lateThresholdMinutes: parseInt(lateThresholdMinutes) || 15,
        autoCheckoutGraceMinutes: parseInt(autoCheckoutGraceMinutes) || 120,
        isFlexibleTiming: Boolean(isFlexibleTiming),
        ...(flexibleCheckInStart && { flexibleCheckInStart }),
        ...(flexibleCheckInEnd && { flexibleCheckInEnd }),
        breakDurationMinutes: parseInt(breakDurationMinutes) || 60,
        weeklyOffDays: weeklyOffDays || [0],
        updatedBy: user.uid
      };

      console.log('BACKEND: Saving timing data with policies:', timingData);

      // Save to database using normalized department name
      const updatedTiming = await storage.updateDepartmentTiming(normalizedDeptId, timingData);

      // Clear Enterprise Time Service cache for this department
      const { EnterpriseTimeService } = await import("./services/enterprise-time-service");
      EnterpriseTimeService.clearDepartmentCache(normalizedDeptId);

      // Force clear all related cache to ensure fresh data
      EnterpriseTimeService.invalidateTimingCache(normalizedDeptId);

      // Log activity
      await storage.createActivityLog({
        type: 'department_timing',
        title: 'Department Timing Updated',
        description: `${user.displayName} updated attendance timing for ${departmentId} department`,
        entityId: departmentId,
        entityType: 'department',
        userId: user.uid
      });

      res.json({
        message: "Department timing updated successfully",
        timing: updatedTiming
      });
    } catch (error: any) {
      console.error("Error updating department timing:", error);
      res.status(500).json({ message: "Failed to update department timing" });
    }
  });

  // Attendance Reports
  app.get("/api/attendance/report", verifyAuth, async (req, res) => {
    try {
      const { userId, from, to } = req.query;
      const requestingUser = await storage.getUser(req.authenticatedUser?.uid || "");
      if (
        !requestingUser ||
        (requestingUser.role !== "master_admin" &&
          requestingUser.role !== "admin")
      ) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!from || !to) {
        return res
          .status(400)
          .json({ message: "Missing required parameters: from and to dates" });
      }

      // UTC-safe date boundaries for attendance queries
      const fromDate = getUTCMidnight(new Date(from as string));
      const toDate = getUTCEndOfDay(new Date(to as string));

      let attendanceRecords = [];
      if (userId) {
        const userAttendance = await storage.listAttendanceByUserBetweenDates(
          userId as string,
          fromDate,
          toDate,
        );
        const user = await storage.getUser(userId as string);
        if (user && userAttendance) {
          // CRITICAL: Enrich with holidays to ensure holidays never show as absent
          const { UnifiedAttendanceService } = await import('./services/unified-attendance-service');
          const enrichedAttendance = await UnifiedAttendanceService.enrichAttendanceWithHolidays(
            userId as string,
            fromDate,
            toDate,
            userAttendance
          );

          attendanceRecords = enrichedAttendance.map((record) => ({
            ...record,
            userName: user.displayName,
            userDepartment: user.department,
            overtimeHours: record.overtimeHours || 0,
          }));
        }
      } else {
        const allUsers = await storage.listUsers();
        const attendancesByDate = await storage.listAttendanceBetweenDates(
          fromDate,
          toDate,
        );
        if (attendancesByDate && allUsers) {
          attendanceRecords = attendancesByDate.map((record) => {
            const matchedUser = allUsers.find((u) => u.id === record.userId);
            return {
              ...record,
              userName: matchedUser ? matchedUser.displayName : "Unknown User",
              userDepartment: matchedUser ? matchedUser.department : null,
              overtimeHours: record.overtimeHours || 0,
            };
          });
        }
      }

      // P2: Exclude pending reviews to match payroll logic
      const filteredRecords = attendanceRecords.filter(r => r.adminReviewStatus !== 'pending');

      res.json(filteredRecords);
    } catch (error) {
      console.error("Error generating attendance report:", error);
      res.status(500).json({ message: "Failed to generate attendance report" });
    }
  });

  app.get("/api/attendance/range", verifyAuth, async (req, res) => {
    try {
      const { from, to, department, userId } = req.query;
      const requestingUser = await storage.getUser(req.authenticatedUser?.uid || "");
      if (
        !requestingUser ||
        (requestingUser.role !== "master_admin" &&
          requestingUser.role !== "admin")
      ) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!from || !to) {
        return res
          .status(400)
          .json({ message: "Missing required parameters: from and to dates" });
      }

      const fromDate = getUTCMidnight(new Date(from as string));
      const toDate = getUTCEndOfDay(new Date(to as string));

      const allUsers = await storage.listUsers();
      let filteredUsers = allUsers;
      if (department) {
        filteredUsers = allUsers.filter(
          (user) =>
            user.department?.toLowerCase() ===
            (department as string).toLowerCase(),
        );
      }
      if (userId) {
        filteredUsers = filteredUsers.filter((user) => user.id === userId);
      }

      const attendancesByDate = await storage.listAttendanceBetweenDates(
        fromDate,
        toDate,
      );
      let filteredAttendanceRecords = attendancesByDate;
      if (department || userId) {
        const filteredUserIds = filteredUsers.map((user) => user.id);
        filteredAttendanceRecords = attendancesByDate.filter((record) =>
          filteredUserIds.includes(record.userId),
        );
      }

      const enrichedRecords = filteredAttendanceRecords.map((record) => {
        const matchedUser = allUsers.find((u) => u.id === record.userId);
        return {
          ...record,
          userName: matchedUser ? matchedUser.displayName : "Unknown User",
          userDepartment: matchedUser ? matchedUser.department : null,
          overtimeHours: record.overtimeHours || 0,
        };
      });

      // P2: Exclude pending reviews to match payroll logic
      const filteredForPayroll = enrichedRecords.filter(r => r.adminReviewStatus !== 'pending');

      res.json(filteredForPayroll);
    } catch (error) {
      console.error("Error generating attendance range report:", error);
      res
        .status(500)
        .json({ message: "Failed to generate attendance range report" });
    }
  });

  // Live attendance tracking API
  app.get("/api/attendance/live", verifyAuth, async (req, res) => {
    try {
      const { user } = req.authenticatedUser;

      // Only admin/master_admin can view live attendance
      if (user.role !== "master_admin" && user.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      // UTC-safe date for today's live attendance
      const today = getUTCMidnight(new Date());

      // Get all attendance records for today
      const attendanceRecords = await storage.listAttendanceByDate(today);

      // Get all users to enrich attendance data
      const allUsers = await storage.listUsers();

      // Create live attendance data with user details
      const liveAttendance = attendanceRecords.map((record) => {
        const userDetails = allUsers.find((u) => u.id === record.userId);
        const currentTime = new Date();
        const checkInTime = record.checkInTime ? new Date(record.checkInTime) : null;
        const workingHours = checkInTime
          ? (currentTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60)
          : 0;

        return {
          ...record,
          userName: userDetails?.displayName || `User #${record.userId}`,
          userEmail: userDetails?.email || null,
          userDepartment: userDetails?.department || null,
          userDesignation: userDetails?.designation || null,
          currentWorkingHours: Math.round(workingHours * 100) / 100,
          isOnline: !record.checkOutTime, // Still online if no checkout
          status: record.checkOutTime ? 'checked_out' : 'checked_in',
          location: record.attendanceType || 'office'
        };
      });

      res.json(liveAttendance);
    } catch (error) {
      console.error("Error fetching live attendance:", error);
      res.status(500).json({ message: "Failed to fetch live attendance" });
    }
  });

  // Department statistics API
  app.get("/api/attendance/department-stats", verifyAuth, async (req, res) => {
    try {
      const { user } = req.authenticatedUser;
      const { date } = req.query;

      // Only admin/master_admin can view department stats
      if (user.role !== "master_admin" && user.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      // UTC-safe date for department stats query
      const targetDate = date ? getUTCMidnight(new Date(date as string)) : getUTCMidnight(new Date());

      // Get attendance records for the date
      const allRecords = await storage.listAttendanceByDate(targetDate);
      // P2: Exclude pending reviews from stats
      const attendanceRecords = allRecords.filter(r => r.adminReviewStatus !== 'pending');

      // Get all users
      const allUsers = await storage.listUsers();

      // Group by department
      const departmentStats = {};

      allUsers.forEach(user => {
        if (!user.department) return;

        const dept = user.department;
        if (!departmentStats[dept]) {
          departmentStats[dept] = {
            department: dept,
            totalEmployees: 0,
            present: 0,
            absent: 0,
            late: 0,
            onTime: 0,
            overtime: 0,
            checkedOut: 0,
            stillWorking: 0
          };
        }

        departmentStats[dept].totalEmployees++;

        const userAttendance = attendanceRecords.find(record => record.userId === user.id);

        if (userAttendance) {
          departmentStats[dept].present++;

          if (userAttendance.isLate) {
            departmentStats[dept].late++;
          } else {
            departmentStats[dept].onTime++;
          }

          if (userAttendance.overtimeHours && userAttendance.overtimeHours > 0) {
            departmentStats[dept].overtime++;
          }

          if (userAttendance.checkOutTime) {
            departmentStats[dept].checkedOut++;
          } else {
            departmentStats[dept].stillWorking++;
          }
        } else {
          departmentStats[dept].absent++;
        }
      });

      res.json(Object.values(departmentStats));
    } catch (error) {
      console.error("Error fetching department stats:", error);
      res.status(500).json({ message: "Failed to fetch department statistics" });
    }
  });

  // Attendance policies API
  app.get("/api/attendance/policies", verifyAuth, async (req, res) => {
    try {
      const { user } = req.authenticatedUser;

      // Only admin/master_admin can view policies
      if (user.role !== "master_admin" && user.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      // Return attendance policies configuration
      const policies = [
        {
          id: "geofence_policy",
          name: "Geofence Requirement",
          description: "Office attendance requires being within 100 meters of office location",
          enabled: true,
          config: {
            radius: 100,
            strictMode: true,
            allowedOfficeLocations: 1
          }
        },
        {
          id: "overtime_policy",
          name: "Overtime Approval",
          description: "Overtime work requires photo verification and reason",
          enabled: true,
          config: {
            requiresPhoto: true,
            requiresReason: true,
            autoApprovalThreshold: 0,
            maxOvertimeHours: 4
          }
        },
        {
          id: "late_policy",
          name: "Late Arrival Policy",
          description: "Automatic late marking based on department timing",
          enabled: true,
          config: {
            graceMinutes: 15,
            autoMarkLate: true,
            requiresReason: false
          }
        },
        {
          id: "remote_work_policy",
          name: "Remote Work Policy",
          description: "Remote work requires reason when outside office geofence",
          enabled: true,
          config: {
            requiresReason: true,
            requiresApproval: false,
            maxRemoteDays: 2
          }
        }
      ];

      res.json(policies);
    } catch (error) {
      console.error("Error fetching attendance policies:", error);
      res.status(500).json({ message: "Failed to fetch attendance policies" });
    }
  });

  // Update attendance record API
  app.patch("/api/attendance/:id", verifyAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { user } = req.authenticatedUser;
      const updateData = req.body;

      // Only admin/master_admin can update attendance records
      if (user.role !== "master_admin" && user.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get existing attendance record
      const existingRecord = await storage.getAttendance(id);
      if (!existingRecord) {
        return res.status(404).json({ message: "Attendance record not found" });
      }

      // Security Check: Verify payroll period is not locked
      if (await PayrollLockService.isPeriodLocked(existingRecord.date)) {
        return res.status(403).json({ message: "Cannot modify attendance for a locked payroll period" });
      }

      // **CRITICAL: Enforce date immutability - date field cannot be modified**
      delete updateData.date;

      // Prepare update data
      const updates: any = {};

      // Use helper function to merge times with ORIGINAL date
      if (updateData.checkInTime) {
        updates.checkInTime = mergeDateAndTime(
          new Date(existingRecord.date),
          updateData.checkInTime
        );
      }

      if (updateData.checkOutTime) {
        updates.checkOutTime = mergeDateAndTime(
          new Date(existingRecord.date),
          updateData.checkOutTime
        );
      }

      if (updateData.status) {
        updates.status = updateData.status;
      }

      if (updateData.overtimeHours !== undefined) {
        updates.overtimeHours = parseFloat(updateData.overtimeHours);
      }

      if (updateData.remarks) {
        updates.remarks = updateData.remarks;
      }

      if (updateData.approvedBy) {
        updates.approvedBy = updateData.approvedBy;
      }

      // Recalculate working hours if both times are updated or available
      const finalCheckInTime = updates.checkInTime || new Date(existingRecord.checkInTime);
      const finalCheckOutTime = updates.checkOutTime || (existingRecord.checkOutTime ? new Date(existingRecord.checkOutTime) : null);

      if (finalCheckInTime && finalCheckOutTime) {
        const workingMilliseconds = finalCheckOutTime.getTime() - finalCheckInTime.getTime();
        updates.workingHours = Math.round((workingMilliseconds / (1000 * 60 * 60)) * 100) / 100;
      }

      // Update the record
      const updatedRecord = await storage.updateAttendance(id, updates);

      // Log activity
      await storage.createActivityLog({
        type: 'attendance',
        title: 'Attendance Record Updated',
        description: `${user.displayName} updated attendance record for ${existingRecord.userId}`,
        entityId: id,
        entityType: 'attendance',
        userId: user.uid
      });

      res.json({
        message: "Attendance record updated successfully",
        attendance: updatedRecord
      });
    } catch (error) {
      console.error("Error updating attendance record:", error);
      res.status(500).json({ message: "Failed to update attendance record" });
    }
  });

  // Bulk actions API
  app.post("/api/attendance/bulk-action", verifyAuth, async (req, res) => {
    try {
      const { user } = req.authenticatedUser;
      const { action, attendanceIds, data } = req.body;

      // Only admin/master_admin can perform bulk actions
      if (user.role !== "master_admin" && user.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!action || !attendanceIds || !Array.isArray(attendanceIds)) {
        return res.status(400).json({ message: "Invalid bulk action parameters" });
      }

      let results = [];
      let successCount = 0;
      let errorCount = 0;

      for (const attendanceId of attendanceIds) {
        try {
          // Security Check: Verify payroll period is not locked
          const record = await storage.getAttendance(attendanceId);
          if (record && await PayrollLockService.isPeriodLocked(record.date)) {
            errorCount++;
            results.push({
              id: attendanceId,
              status: 'error',
              error: 'Cannot modify attendance for a locked payroll period'
            });
            continue;
          }

          let result = null;

          switch (action) {
            case 'approve_overtime':
              result = await storage.updateAttendance(attendanceId, {
                overtimeApproved: true,
                overtimeApprovedBy: user.uid,
                overtimeApprovedAt: new Date()
              });
              break;

            case 'reject_overtime':
              result = await storage.updateAttendance(attendanceId, {
                overtimeApproved: false,
                overtimeRejectedBy: user.uid,
                overtimeRejectedAt: new Date(),
                overtimeRejectionReason: data?.reason || 'No reason provided'
              });
              break;

            case 'mark_present':
              result = await storage.updateAttendance(attendanceId, {
                status: 'present'
              });
              break;

            case 'mark_absent':
              result = await storage.updateAttendance(attendanceId, {
                status: 'absent'
              });
              break;

            default:
              throw new Error(`Unknown action: ${action}`);
          }

          if (result) {
            results.push({ id: attendanceId, success: true, data: result });
            successCount++;
          }
        } catch (error) {
          results.push({ id: attendanceId, success: false, error: error.message });
          errorCount++;
        }
      }

      // Log bulk activity
      await storage.createActivityLog({
        type: 'attendance',
        title: `Bulk Action: ${action}`,
        description: `${user.displayName} performed bulk action '${action}' on ${attendanceIds.length} records (${successCount} succeeded, ${errorCount} failed)`,
        entityId: attendanceIds.join(','),
        entityType: 'attendance',
        userId: user.uid
      });

      res.json({
        message: `Bulk action completed: ${successCount} succeeded, ${errorCount} failed`,
        results,
        summary: {
          total: attendanceIds.length,
          succeeded: successCount,
          failed: errorCount
        }
      });
    } catch (error) {
      console.error("Error performing bulk action:", error);
      res.status(500).json({ message: "Failed to perform bulk action" });
    }
  });

  // Customer search endpoint for site visit autocomplete - MUST BE BEFORE /api/customers
  app.get("/api/customers/search", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Debug authentication data
      console.log("Customer search auth debug:");
      console.log("- User role:", req.authenticatedUser.user.role);
      console.log("- User department:", req.authenticatedUser.user.department);
      console.log("- User designation:", req.authenticatedUser.user.designation);
      console.log("- User permissions:", req.authenticatedUser.permissions);
      console.log("- Permissions length:", req.authenticatedUser.permissions.length);

      // Check if user has site visit permissions (allows customer search for site visits)
      const hasSiteVisitPermission = req.authenticatedUser.permissions.includes("site_visit.view") ||
        req.authenticatedUser.permissions.includes("site_visit.create") ||
        req.authenticatedUser.user.role === "master_admin";

      console.log("- Has site visit permission:", hasSiteVisitPermission);

      if (!hasSiteVisitPermission) {
        console.log("DENIED: User lacks site visit permissions for customer search");
        return res.status(403).json({ message: "Site visit permission required to search customers" });
      }

      console.log("Customer search authorized via site visit permissions");

      const query = (req.query.q as string) || '';
      const limit = parseInt(req.query.limit as string) || 10;

      if (!query || query.length < 2) {
        return res.json([]);
      }

      // Get all customers and filter on client side for now
      console.log("Customer search query:", query);
      const customers = await storage.listCustomers();
      console.log("Total customers in database:", customers.length);

      // If no customers exist, create some sample ones for testing
      if (customers.length === 0) {
        console.log("No customers found, creating sample customers...");
        try {
          await storage.createCustomer({
            name: "Ajith Kumar",
            mobile: "9944325858",
            email: "ajith@example.com",
            address: "123 Main Street, Chennai",
            profileCompleteness: "full",
            createdFrom: "customers_page"
          });
          await storage.createCustomer({
            name: "Priya Sharma",
            mobile: "9876543210",
            email: "priya@example.com",
            address: "456 Park Road, Bangalore",
            profileCompleteness: "full",
            createdFrom: "customers_page"
          });
          await storage.createCustomer({
            name: "Rajesh Patel",
            mobile: "8765432109",
            email: "rajesh@example.com",
            address: "789 Garden Lane, Mumbai",
            profileCompleteness: "full",
            createdFrom: "customers_page"
          });
          console.log("Sample customers created successfully");
          // Refresh customers list
          const updatedCustomers = await storage.listCustomers();
          console.log("Updated customer count:", updatedCustomers.length);
        } catch (error) {
          console.error("Error creating sample customers:", error);
        }
      }

      // Get fresh customer list
      const allCustomers = await storage.listCustomers();

      const searchLower = query.toLowerCase();
      const filteredCustomers = allCustomers.filter((customer: any) =>
        customer.name?.toLowerCase().includes(searchLower) ||
        customer.mobile?.toLowerCase().includes(searchLower) ||
        customer.email?.toLowerCase().includes(searchLower)
      ).slice(0, limit);

      console.log("Filtered customers found:", filteredCustomers.length);

      // Return customers with formatted display text for autocomplete
      const results = filteredCustomers.map((customer: any) => ({
        id: customer.id,
        name: customer.name,
        mobile: customer.mobile,
        email: customer.email,
        address: customer.address,
        displayText: `${customer.name}${customer.mobile ? ` (${customer.mobile})` : ''}`
      }));

      res.json(results);
    } catch (error) {
      console.error("Error searching customers:", error);
      res.status(500).json({ message: "Failed to search customers" });
    }
  });

  // Normalize mobile number - remove non-digits, handle +91/0 prefixes
  const normalizeMobileNumber = (mobile: string): string => {
    if (!mobile) return '';

    // Remove all non-digit characters
    let normalized = mobile.replace(/\D/g, '');

    // Handle Indian mobile formats
    if (normalized.startsWith('91') && normalized.length === 12) {
      // Remove country code +91
      normalized = normalized.substring(2);
    } else if (normalized.startsWith('0') && normalized.length === 11) {
      // Remove leading zero
      normalized = normalized.substring(1);
    }

    return normalized;
  };

  // Check if customer with mobile number already exists (for duplicate validation)
  app.get("/api/customers/check-mobile/:mobile", createRateLimitMiddleware(generalRateLimiter), verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Check if user has site visit permissions (allows customer search for site visits)
      const hasSiteVisitPermission = req.authenticatedUser.permissions.includes("site_visit.view") ||
        req.authenticatedUser.permissions.includes("site_visit.create") ||
        req.authenticatedUser.user.role === "master_admin";

      if (!hasSiteVisitPermission) {
        return res.status(403).json({ message: "Site visit permission required to check customers" });
      }

      const mobile = req.params.mobile;
      const normalizedMobile = normalizeMobileNumber(mobile);

      if (!normalizedMobile || normalizedMobile.length < 10) {
        return res.json({ exists: false, customer: null });
      }

      console.log("Checking for existing customer with mobile:", normalizedMobile);
      const existingCustomer = await storage.findCustomerByMobile(normalizedMobile);

      if (existingCustomer) {
        console.log("Found existing customer:", existingCustomer.name, existingCustomer.id);
        // Return minimal customer fields for security
        res.json({
          exists: true,
          customer: {
            id: existingCustomer.id,
            name: existingCustomer.name,
            mobile: existingCustomer.mobile,
            address: existingCustomer.address,
            propertyType: existingCustomer.propertyType
          }
        });
      } else {
        console.log("No existing customer found with mobile:", normalizedMobile);
        res.json({ exists: false, customer: null });
      }
    } catch (error) {
      console.error("Error checking customer mobile:", error);
      res.status(500).json({ message: "Failed to check customer mobile" });
    }
  });

  // Customers with pagination and performance optimizations
  app.get("/api/customers", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      console.log("SERVER PERMISSION CHECK:", {
        userPermissions: req.authenticatedUser.permissions,
        hasCustomersView: req.authenticatedUser.permissions.includes("customers.view"),
        hasCustomersCreate: req.authenticatedUser.permissions.includes("customers.create"),
        userRole: req.authenticatedUser.user.role,
        isMasterAdmin: req.authenticatedUser.user.role === "master_admin"
      });

      const hasPermission = req.authenticatedUser.permissions.includes("customers.view") ||
        req.authenticatedUser.permissions.includes("customers.create") ||
        req.authenticatedUser.user.role === "master_admin";

      console.log("SERVER PERMISSION RESULT:", hasPermission);

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Parse pagination parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = (req.query.search as string) || '';
      const sortBy = (req.query.sortBy as string) || 'name';
      const sortOrder = (req.query.sortOrder as string) || 'asc';

      // Get customers
      const customers = await storage.listCustomers();

      // Apply search filter if provided
      let filteredCustomers = customers;
      if (search) {
        const searchLower = search.toLowerCase();
        filteredCustomers = customers.filter((customer: any) =>
          customer.name?.toLowerCase().includes(searchLower) ||
          customer.email?.toLowerCase().includes(searchLower) ||
          customer.mobile?.toLowerCase().includes(searchLower) ||
          customer.address?.toLowerCase().includes(searchLower)
        );
      }

      // Sort customers
      filteredCustomers.sort((a: any, b: any) => {
        const aValue = a[sortBy] || '';
        const bValue = b[sortBy] || '';

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortOrder === 'asc'
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);
        } else {
          return sortOrder === 'asc'
            ? (aValue > bValue ? 1 : -1)
            : (bValue > aValue ? 1 : -1);
        }
      });

      // Calculate pagination values
      const totalItems = filteredCustomers.length;
      const totalPages = Math.ceil(totalItems / limit);
      const startIndex = (page - 1) * limit;
      const endIndex = Math.min(startIndex + limit, totalItems);

      // Get paginated subset
      const paginatedCustomers = filteredCustomers.slice(startIndex, endIndex);

      // Return with pagination metadata
      res.json({
        data: paginatedCustomers,
        pagination: {
          page,
          limit,
          totalItems,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      });
    } catch (error) {
      console.error("Error fetching customers:", error);
      res.status(500).json({ message: "Failed to fetch customers" });
    }
  });

  app.get("/api/customers/:id", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const hasPermission = req.authenticatedUser.permissions.includes("customers.view") ||
        req.authenticatedUser.user.role === "master_admin";

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }
      const customer = await storage.getCustomer(req.params.id);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      res.json(customer);
    } catch (error) {
      console.error("Error fetching customer:", error);
      res.status(500).json({ message: "Failed to fetch customer" });
    }
  });

  app.post("/api/customers", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const hasPermission = req.authenticatedUser.permissions.includes("customers.create") ||
        req.authenticatedUser.user.role === "master_admin";

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }
      const customerData = insertCustomerSchema.parse(req.body);
      const customer = await storage.createCustomer(customerData);
      res.status(201).json(customer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error creating customer:", error);
      res.status(500).json({ message: "Failed to create customer" });
    }
  });

  app.patch("/api/customers/:id", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const hasPermission = req.authenticatedUser.permissions.includes("customers.edit") ||
        req.authenticatedUser.user.role === "master_admin";

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }
      const customerData = insertCustomerSchema.partial().parse(req.body);
      const updatedCustomer = await storage.updateCustomer(
        req.params.id,
        customerData,
      );
      if (!updatedCustomer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      res.json(updatedCustomer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error updating customer:", error);
      res.status(500).json({ message: "Failed to update customer" });
    }
  });

  app.delete("/api/customers/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !["master_admin", "admin"].includes(user.role || "")) {
        return res.status(403).json({ message: "Access denied" });
      }
      await storage.deleteCustomer(req.params.id);
      res.status(204).end();
    } catch (error) {
      console.error("Error deleting customer:", error);
      res.status(500).json({ message: "Failed to delete customer" });
    }
  });



  // Quotations with pagination and performance optimizations
  app.get("/api/quotations", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Check if user has permission to view quotations
      const hasPermission = req.authenticatedUser.permissions.includes("quotations.view") ||
        req.authenticatedUser.permissions.includes("quotations.create") ||
        req.authenticatedUser.user.role === "master_admin";

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Parse pagination parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = (req.query.search as string) || '';
      const sortBy = (req.query.sortBy as string) || 'createdAt';
      const sortOrder = (req.query.sortOrder as string) || 'desc'; // Default newest first
      const status = (req.query.status as string) || '';

      // Get quotations
      const quotations = await storage.listQuotations();

      // Apply search & status filter if provided
      let filteredQuotations = quotations;

      if (status) {
        filteredQuotations = filteredQuotations.filter((quotation: any) =>
          quotation.status?.toLowerCase() === status.toLowerCase()
        );
      }

      if (search) {
        const searchLower = search.toLowerCase();
        // Get customer details for better search
        const customers = await storage.listCustomers();
        const customerMap = new Map();
        customers.forEach((customer: any) => {
          customerMap.set(customer.id, customer);
        });

        filteredQuotations = filteredQuotations.filter((quotation: any) => {
          const customer = customerMap.get(quotation.customerId);
          // Search by quotation ID, amount, status, or customer name
          return (
            quotation.id?.toLowerCase().includes(searchLower) ||
            quotation.status?.toLowerCase().includes(searchLower) ||
            (customer && customer.name?.toLowerCase().includes(searchLower))
          );
        });
      }

      // Sort quotations
      filteredQuotations.sort((a: any, b: any) => {
        let aValue = a[sortBy];
        let bValue = b[sortBy];

        // Handle dates for proper sorting
        if (sortBy === 'createdAt') {
          aValue = new Date(aValue).getTime();
          bValue = new Date(bValue).getTime();
        }

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortOrder === 'asc'
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);
        } else {
          return sortOrder === 'asc'
            ? (aValue > bValue ? 1 : -1)
            : (bValue > aValue ? 1 : -1);
        }
      });

      // Calculate pagination values
      const totalItems = filteredQuotations.length;
      const totalPages = Math.ceil(totalItems / limit);
      const startIndex = (page - 1) * limit;
      const endIndex = Math.min(startIndex + limit, totalItems);

      // Get paginated subset
      const paginatedQuotations = filteredQuotations.slice(startIndex, endIndex);

      // Enhance with customer data
      const enhancedQuotations = await Promise.all(
        paginatedQuotations.map(async (quotation: any) => {
          let customerName = "Unknown Customer";
          try {
            const customer = await storage.getCustomer(quotation.customerId);
            if (customer) {
              customerName = customer.name;
            }
          } catch (error) {
            console.error("Error fetching customer for quotation:", error);
          }

          return {
            ...quotation,
            customerName
          };
        })
      );

      // Return with pagination metadata
      res.json({
        data: enhancedQuotations,
        pagination: {
          page,
          limit,
          totalItems,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      });
    } catch (error) {
      console.error("Error fetching quotations:", error);
      res.status(500).json({ message: "Failed to fetch quotations" });
    }
  });

  app.get("/api/quotations/:id", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Check permissions - use same permission check as PUT endpoint
      const hasPermission = req.authenticatedUser.permissions.includes("quotations.view") ||
        req.authenticatedUser.permissions.includes("quotations.edit") ||
        req.authenticatedUser.permissions.includes("quotations.create") ||
        req.authenticatedUser.user.role === "master_admin";

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }

      const quotation = await storage.getQuotation(req.params.id);
      if (!quotation) {
        return res.status(404).json({ message: "Quotation not found" });
      }
      res.json(quotation);
    } catch (error) {
      console.error("Error fetching quotation:", error);
      res.status(500).json({ message: "Failed to fetch quotation" });
    }
  });


  // Update quotation with revision tracking
  app.put("/api/quotations/:id", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Check permissions
      const hasPermission = req.authenticatedUser.permissions.includes("quotations.edit") ||
        req.authenticatedUser.permissions.includes("quotations.create") ||
        req.authenticatedUser.user.role === "master_admin";

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Fetch existing quotation to enforce immutability of customer and source
      const existingQuotation = await storage.getQuotation(req.params.id);
      if (!existingQuotation) {
        return res.status(404).json({ message: "Quotation not found" });
      }

      // Import the update schema
      const { updateQuotationSchema } = await import("@shared/schema");

      // Validate the request body against update schema (excludes immutable fields)
      const quotationData = updateQuotationSchema.parse(req.body);

      // Enforce immutability: override customerId, source, and siteVisitMapping with existing values
      // This prevents client-side tampering and ensures data integrity
      const immutableQuotationData = {
        ...quotationData,
        customerId: existingQuotation.customerId, // Locked - cannot change customer
        source: existingQuotation.source, // Locked - cannot change source
        siteVisitMapping: existingQuotation.siteVisitMapping, // Locked - cannot change site visit association
      };

      // Update quotation with revision tracking
      const updatedQuotation = await storage.updateQuotation(
        req.params.id,
        immutableQuotationData,
        req.authenticatedUser.uid // Pass the user ID for revision history
      );

      // Invalidate caches if needed
      res.json(updatedQuotation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors
        });
      }
      console.error("Error updating quotation:", error);
      res.status(500).json({ message: "Failed to update quotation" });
    }
  });

  // Legacy PATCH endpoint for partial updates (deprecated, use PUT)
  app.patch("/api/quotations/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (
        !user ||
        !["master_admin", "admin", "sales_and_marketing"].includes(
          user.role || user.department || "",
        )
      ) {
        return res.status(403).json({ message: "Access denied" });
      }
      const quotationData = insertQuotationSchema.partial().parse(req.body);
      const updatedQuotation = await storage.updateQuotation(
        req.params.id,
        quotationData,
        req.authenticatedUser?.uid || ""
      );
      if (!updatedQuotation) {
        return res.status(404).json({ message: "Quotation not found" });
      }
      res.json(updatedQuotation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error updating quotation:", error);
      res.status(500).json({ message: "Failed to update quotation" });
    }
  });

  app.delete("/api/quotations/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !["master_admin", "admin"].includes(user.role || "")) {
        return res.status(403).json({ message: "Access denied" });
      }
      await storage.deleteQuotation(req.params.id);
      res.status(204).end();
    } catch (error) {
      console.error("Error deleting quotation:", error);
      res.status(500).json({ message: "Failed to delete quotation" });
    }
  });

  // Generate PDF/HTML preview for quotation
  app.post("/api/quotations/:id/generate-pdf", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Check permissions
      const hasPermission = req.authenticatedUser.permissions.includes("quotations.view") ||
        req.authenticatedUser.permissions.includes("quotations.edit") ||
        req.authenticatedUser.permissions.includes("quotations.create") ||
        req.authenticatedUser.user.role === "master_admin";

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get the quotation
      const quotation = await storage.getQuotation(req.params.id);
      if (!quotation) {
        return res.status(404).json({ message: "Quotation not found" });
      }

      // Get the customer
      const customer = await storage.getCustomer(quotation.customerId);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      // Merge EB Sanction fields from quotation (now stored at top-level)
      // These are quotation-specific regulatory requirements
      const customerWithEBSanction = {
        ...customer,
        tariffCode: (quotation as any).tariffCode,
        ebSanctionPhase: (quotation as any).ebSanctionPhase,
        ebSanctionKW: (quotation as any).ebSanctionKW
      };

      // Get the first/main project
      const projects = quotation.projects || [];
      if (projects.length === 0) {
        return res.status(400).json({ message: "No projects found in quotation" });
      }
      const mainProject = projects[0];

      // Import PDF service
      const { QuotationPDFService } = await import("./services/quotation-pdf-service");

      // Generate HTML preview
      const { html, template } = await QuotationPDFService.generateHTMLPreview(
        quotation,
        mainProject,
        customerWithEBSanction
      );

      // Return HTML for client-side PDF generation
      res.json({
        html,
        quotationNumber: quotation.quotationNumber,
        customerName: customer.name
      });
    } catch (error) {
      console.error("Error generating PDF preview:", error);
      res.status(500).json({ message: "Failed to generate PDF preview" });
    }
  });


  // ====== SITE VISIT INTEGRATION ROUTES FOR QUOTATION SYSTEM ======

  // Get site visit data for quotation creation (with data mapping analysis)
  app.get("/api/quotations/site-visits/mappable", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Check permissions
      const hasPermission = req.authenticatedUser.permissions.includes("quotations.create") ||
        req.authenticatedUser.user.role === "master_admin";

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get user for permission checks
      const user = await storage.getUser(req.authenticatedUser.uid);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Import site visit service and get all site visits
      const { siteVisitService } = await import("./services/site-visit-service");

      // Create filters to get all site visits that the user can see
      const filters: any = { limit: 1000 }; // Get up to 1000 visits for filtering

      // Determine what the user can see based on permissions
      if (user.role === 'master_admin' || await checkSiteVisitPermission(user, 'view_all')) {
        // Can see all site visits - no additional filters needed
      } else if (await checkSiteVisitPermission(user, 'view_team')) {
        // Can see team/department site visits
        filters.department = user.department;
      } else {
        // Can only see own site visits
        filters.userId = user.uid;
      }

      const allSiteVisits = await siteVisitService.getSiteVisitsWithFilters(filters);

      console.log(`=== MAPPABLE SITE VISITS DEBUG ===`);
      console.log(`Total site visits fetched: ${allSiteVisits.length}`);

      // Log each visit for debugging
      allSiteVisits.forEach((visit: any, index: number) => {
        console.log(`Visit ${index + 1}:`, {
          id: visit.id,
          customerName: visit.customer?.name,
          status: visit.status,
          visitOutcome: visit.visitOutcome,
          hasCustomer: !!visit.customer,
          hasName: !!visit.customer?.name,
          hasMobile: !!visit.customer?.mobile
        });
      });

      // Filter for site visits that can be used for quotations
      // Logic: 
      // 1. Must have customer data (name and mobile)
      // 2. If status is 'in_progress', include regardless of visitOutcome (ongoing work, outcome not yet determined)
      // 3. If status is 'completed', must have visitOutcome of 'converted' or 'on_process'
      const mappableSiteVisits = allSiteVisits.filter((visit: any) => {
        const hasRequiredCustomerData = visit.customer && visit.customer.name && visit.customer.mobile;

        if (!hasRequiredCustomerData) {
          console.log(`Filtered out ${visit.id}: Missing customer data`);
          return false;
        }

        // Include in_progress visits regardless of outcome (ongoing work)
        if (visit.status === 'in_progress') {
          console.log(`Including ${visit.id}: In progress status (ongoing)`);
          return true;
        }

        // For completed visits, check the outcome
        if (visit.status === 'completed') {
          const hasValidOutcome = visit.visitOutcome === 'converted' || visit.visitOutcome === 'on_process';
          if (hasValidOutcome) {
            console.log(`Including ${visit.id}: Completed with valid outcome (${visit.visitOutcome})`);
            return true;
          } else {
            console.log(`Filtered out ${visit.id}: Completed but outcome is ${visit.visitOutcome}`);
            return false;
          }
        }

        console.log(`Filtered out ${visit.id}: Status is ${visit.status}`);
        return false;
      });

      console.log(`Mappable site visits after filter: ${mappableSiteVisits.length}`);
      console.log(`=================================`);

      // Add completeness analysis for each site visit using dedicated service
      const enrichedSiteVisits = mappableSiteVisits.map((visit: any) => {
        const completenessAnalysis = DataCompletenessAnalyzer.analyze(visit);
        return {
          ...visit,
          completenessAnalysis
        };
      });

      res.json({
        data: enrichedSiteVisits,
        total: enrichedSiteVisits.length
      });
    } catch (error) {
      console.error("Error fetching mappable site visits:", error);
      res.status(500).json({ message: "Failed to fetch site visits" });
    }
  });

  // Get specific site visit data for quotation creation
  app.get("/api/quotations/site-visits/:siteVisitId/mapping-data", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Check permissions
      const hasPermission = req.authenticatedUser.permissions.includes("quotations.create") ||
        req.authenticatedUser.user.role === "master_admin";

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get the site visit using the site visit service
      const { siteVisitService } = await import("./services/site-visit-service");
      const siteVisit = await siteVisitService.getSiteVisitById(req.params.siteVisitId);
      if (!siteVisit) {
        return res.status(404).json({ message: "Site visit not found" });
      }

      // Perform comprehensive data mapping using dedicated service
      const mappingResult = await SiteVisitDataMapper.mapToQuotation(siteVisit, req.authenticatedUser.uid);

      res.json(mappingResult);
    } catch (error) {
      console.error("Error mapping site visit data:", error);

      // Handle specific mapping errors with actionable responses
      if (error instanceof Error) {
        // Handle completeness analysis failures
        if ((error as any).validationError && (error as any).completenessAnalysis) {
          const analysis = (error as any).completenessAnalysis;
          return res.status(422).json({
            message: "Site visit data incomplete for quotation creation",
            error: error.message,
            recommendedAction: analysis.recommendedAction,
            completenessAnalysis: {
              completenessScore: analysis.completenessScore,
              missingCriticalFields: analysis.missingCriticalFields,
              missingImportantFields: analysis.missingImportantFields,
              missingOptionalFields: analysis.missingOptionalFields,
              qualityGrade: analysis.qualityGrade,
              canCreateQuotation: analysis.canCreateQuotation
            },
            needsAction: true
          });
        }

        // Handle project validation failures (now includes completeness analysis)
        if ((error as any).projectValidationError) {
          const analysis = (error as any).completenessAnalysis;
          return res.status(422).json({
            message: "No valid project configurations found in site visit",
            error: error.message,
            recommendedAction: (error as any).recommendedAction || "update_marketing_data",
            missingData: (error as any).missingData,
            completenessAnalysis: analysis ? {
              completenessScore: analysis.completenessScore,
              missingCriticalFields: analysis.missingCriticalFields,
              missingImportantFields: analysis.missingImportantFields,
              missingOptionalFields: analysis.missingOptionalFields,
              qualityGrade: analysis.qualityGrade,
              canCreateQuotation: analysis.canCreateQuotation
            } : undefined,
            needsAction: true
          });
        }

        // Handle any other mapping failures as 422 with complete context
        return res.status(422).json({
          message: "Site visit data incomplete for quotation creation",
          error: error.message,
          recommendedAction: "collect_missing_data",
          completenessAnalysis: {
            completenessScore: 0,
            missingCriticalFields: ["Validation error occurred"],
            missingImportantFields: [],
            missingOptionalFields: [],
            qualityGrade: "F" as const,
            canCreateQuotation: false
          },
          needsAction: true
        });
      }

      res.status(500).json({ message: "Failed to map site visit data" });
    }
  });

  // Create quotation from site visit data
  app.post("/api/quotations/from-site-visit/:siteVisitId", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Check permissions
      const hasPermission = req.authenticatedUser.permissions.includes("quotations.create") ||
        req.authenticatedUser.user.role === "master_admin";

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get the site visit using the site visit service
      const { siteVisitService } = await import("./services/site-visit-service");
      const siteVisit = await siteVisitService.getSiteVisitById(req.params.siteVisitId);
      if (!siteVisit) {
        return res.status(404).json({ message: "Site visit not found" });
      }

      // Map site visit data to quotation format using dedicated service
      const mappingResult = await SiteVisitDataMapper.mapToQuotation(siteVisit, req.authenticatedUser.uid);

      // Allow user to override mapped data with request body
      const quotationData = {
        ...mappingResult.quotationData,
        ...req.body, // User can override any mapped values
        source: "site_visit" as const,
        siteVisitMapping: mappingResult.mappingMetadata,
        // CRITICAL: Use preparedBy from request body (user's form input) first, then fallback
        preparedBy: req.body.preparedBy || mappingResult.quotationData.preparedBy || req.authenticatedUser.user.displayName || req.authenticatedUser.user.email || req.authenticatedUser.uid
      };

      // Validate the quotation data
      const validatedData = insertQuotationSchema.parse(quotationData);

      // Create the quotation
      const quotation = await storage.createQuotation(validatedData);

      res.status(201).json({
        quotation,
        mappingResult: {
          completenessScore: mappingResult.mappingMetadata.completenessScore,
          missingCriticalFields: mappingResult.mappingMetadata.missingCriticalFields,
          missingOptionalFields: mappingResult.mappingMetadata.missingOptionalFields,
          businessRuleWarnings: mappingResult.businessRuleWarnings,
          dataTransformations: mappingResult.dataTransformations
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Quotation data validation failed",
          errors: error.errors
        });
      }

      // Handle specific mapping errors with actionable responses
      if (error instanceof Error) {
        // Handle completeness analysis failures
        if ((error as any).validationError && (error as any).completenessAnalysis) {
          const analysis = (error as any).completenessAnalysis;
          return res.status(422).json({
            message: "Site visit data incomplete for quotation creation",
            error: error.message,
            recommendedAction: analysis.recommendedAction,
            completenessAnalysis: {
              completenessScore: analysis.completenessScore,
              missingCriticalFields: analysis.missingCriticalFields,
              missingImportantFields: analysis.missingImportantFields,
              missingOptionalFields: analysis.missingOptionalFields,
              qualityGrade: analysis.qualityGrade,
              canCreateQuotation: analysis.canCreateQuotation
            },
            needsAction: true
          });
        }

        // Handle project validation failures (now includes completeness analysis)
        if ((error as any).projectValidationError) {
          const analysis = (error as any).completenessAnalysis;
          return res.status(422).json({
            message: "No valid project configurations found in site visit",
            error: error.message,
            recommendedAction: (error as any).recommendedAction || "update_marketing_data",
            missingData: (error as any).missingData,
            completenessAnalysis: analysis ? {
              completenessScore: analysis.completenessScore,
              missingCriticalFields: analysis.missingCriticalFields,
              missingImportantFields: analysis.missingImportantFields,
              missingOptionalFields: analysis.missingOptionalFields,
              qualityGrade: analysis.qualityGrade,
              canCreateQuotation: analysis.canCreateQuotation
            } : undefined,
            needsAction: true
          });
        }

        // Handle any other mapping failures as 422 with complete context
        return res.status(422).json({
          message: "Site visit data incomplete for quotation creation",
          error: error.message,
          recommendedAction: "collect_missing_data",
          completenessAnalysis: {
            completenessScore: 0,
            missingCriticalFields: ["Validation error occurred"],
            missingImportantFields: [],
            missingOptionalFields: [],
            qualityGrade: "F" as const,
            canCreateQuotation: false
          },
          needsAction: true
        });
      }

      console.error("Error creating quotation from site visit:", error);
      res.status(500).json({ message: "Failed to create quotation from site visit" });
    }
  });

  // Invoices with pagination and performance optimizations
  app.get("/api/invoices", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Check if user has permission to view invoices
      const hasPermission = req.authenticatedUser.permissions.includes("invoices.view") ||
        req.authenticatedUser.permissions.includes("invoices.create") ||
        req.authenticatedUser.user.role === "master_admin";

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Parse pagination parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = (req.query.search as string) || '';
      const sortBy = (req.query.sortBy as string) || 'createdAt';
      const sortOrder = (req.query.sortOrder as string) || 'desc'; // Default newest first
      const status = (req.query.status as string) || '';

      // Get invoices
      const invoices = await storage.listInvoices();

      // Apply search & status filter if provided
      let filteredInvoices = invoices;

      if (status) {
        filteredInvoices = filteredInvoices.filter((invoice: any) =>
          invoice.status?.toLowerCase() === status.toLowerCase()
        );
      }

      if (search) {
        const searchLower = search.toLowerCase();
        // Get customer details for better search
        const customers = await storage.listCustomers();
        const customerMap = new Map();
        customers.forEach((customer: any) => {
          customerMap.set(customer.id, customer);
        });

        filteredInvoices = filteredInvoices.filter((invoice: any) => {
          const customer = customerMap.get(invoice.customerId);
          // Search by invoice ID, amount, status, or customer name
          return (
            invoice.id?.toLowerCase().includes(searchLower) ||
            invoice.status?.toLowerCase().includes(searchLower) ||
            (customer && customer.name?.toLowerCase().includes(searchLower))
          );
        });
      }

      // Sort invoices
      filteredInvoices.sort((a: any, b: any) => {
        let aValue = a[sortBy];
        let bValue = b[sortBy];

        // Handle dates for proper sorting
        if (sortBy === 'createdAt') {
          aValue = new Date(aValue).getTime();
          bValue = new Date(bValue).getTime();
        }

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortOrder === 'asc'
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);
        } else {
          return sortOrder === 'asc'
            ? (aValue > bValue ? 1 : -1)
            : (bValue > aValue ? 1 : -1);
        }
      });

      // Calculate pagination values
      const totalItems = filteredInvoices.length;
      const totalPages = Math.ceil(totalItems / limit);
      const startIndex = (page - 1) * limit;
      const endIndex = Math.min(startIndex + limit, totalItems);

      // Get paginated subset
      const paginatedInvoices = filteredInvoices.slice(startIndex, endIndex);

      // Enhance with customer data
      const enhancedInvoices = await Promise.all(
        paginatedInvoices.map(async (invoice: any) => {
          let customerName = "Unknown Customer";
          try {
            const customer = await storage.getCustomer(invoice.customerId);
            if (customer) {
              customerName = customer.name;
            }
          } catch (error) {
            console.error("Error fetching customer for invoice:", error);
          }

          return {
            ...invoice,
            customerName
          };
        })
      );

      // Return with pagination metadata
      res.json({
        data: enhancedInvoices,
        pagination: {
          page,
          limit,
          totalItems,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      });
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  app.get("/api/invoices/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (
        !user ||
        !["master_admin", "admin", "accounts"].includes(
          user.role || user.department || "",
        )
      ) {
        return res.status(403).json({ message: "Access denied" });
      }
      const invoice = await storage.getInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      res.json(invoice);
    } catch (error) {
      console.error("Error fetching invoice:", error);
      res.status(500).json({ message: "Failed to fetch invoice" });
    }
  });

  app.post("/api/invoices", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (
        !user ||
        !["master_admin", "admin", "accounts"].includes(
          user.role || user.department || "",
        )
      ) {
        return res.status(403).json({ message: "Access denied" });
      }
      const invoiceData = insertInvoiceSchema.parse(req.body);
      const invoice = await storage.createInvoice(invoiceData);
      res.status(201).json(invoice);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error creating invoice:", error);
      res.status(500).json({ message: "Failed to create invoice" });
    }
  });

  app.patch("/api/invoices/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (
        !user ||
        !["master_admin", "admin", "accounts"].includes(
          user.role || user.department || "",
        )
      ) {
        return res.status(403).json({ message: "Access denied" });
      }
      const invoiceData = insertInvoiceSchema.partial().parse(req.body);
      const updatedInvoice = await storage.updateInvoice(
        req.params.id,
        invoiceData,
      );
      if (!updatedInvoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      res.json(updatedInvoice);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error updating invoice:", error);
      res.status(500).json({ message: "Failed to update invoice" });
    }
  });

  app.delete("/api/invoices/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !["master_admin", "admin"].includes(user.role || "")) {
        return res.status(403).json({ message: "Access denied" });
      }
      await storage.deleteInvoice(req.params.id);
      res.status(204).end();
    } catch (error) {
      console.error("Error deleting invoice:", error);
      res.status(500).json({ message: "Failed to delete invoice" });
    }
  });

  // ============================================
  // ENTERPRISE HR MANAGEMENT API ROUTES
  // ============================================

  // Employee Management Routes
  app.get("/api/employees", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Check if user has permission to view employees (HR module access)
      const hasPermission = req.authenticatedUser.permissions.includes("users.view") ||
        req.authenticatedUser.user.role === "master_admin" ||
        req.authenticatedUser.user.department === "hr";

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied. HR module access required." });
      }

      // Parse filter parameters
      const filters: any = {};
      if (req.query.department) filters.department = req.query.department as string;
      if (req.query.status) filters.status = req.query.status as string;
      if (req.query.designation) filters.designation = req.query.designation as string;
      if (req.query.search) filters.search = req.query.search as string;

      const employees = await storage.listEmployees(filters);

      res.json(employees);
    } catch (error) {
      console.error("Error fetching employees:", error);
      res.status(500).json({ message: "Failed to fetch employees" });
    }
  });

  app.get("/api/employees/:id", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const hasPermission = req.authenticatedUser.permissions.includes("users.view") ||
        req.authenticatedUser.user.role === "master_admin" ||
        req.authenticatedUser.user.department === "hr";

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }

      const employee = await storage.getEmployee(req.params.id);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }

      res.json(employee);
    } catch (error) {
      console.error("Error fetching employee:", error);
      res.status(500).json({ message: "Failed to fetch employee" });
    }
  });

  app.post("/api/employees", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Only master_admin and HR can create employees
      const hasPermission = req.authenticatedUser.user.role === "master_admin" ||
        req.authenticatedUser.user.department === "hr";

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied. Only HR can create employees." });
      }

      const employeeData = insertEmployeeSchema.parse({
        ...req.body,
        createdBy: req.authenticatedUser.user.uid,
        lastUpdatedBy: req.authenticatedUser.user.uid
      });

      const employee = await storage.createEmployee(employeeData);

      // Log activity
      await storage.createActivityLog({
        type: 'employee_created',
        title: 'Employee Created',
        description: `${req.authenticatedUser.user.displayName} created employee profile for ${employee.personalInfo.displayName}`,
        entityId: employee.id,
        entityType: 'employee',
        userId: req.authenticatedUser.user.uid
      });

      res.status(201).json(employee);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error creating employee:", error);
      res.status(500).json({ message: "Failed to create employee" });
    }
  });

  app.patch("/api/employees/:id", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const hasPermission = req.authenticatedUser.user.role === "master_admin" ||
        req.authenticatedUser.user.department === "hr";

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }

      const updateData = {
        ...req.body,
        lastUpdatedBy: req.authenticatedUser.user.uid
      };

      const employee = await storage.updateEmployee(req.params.id, updateData);

      // Log activity
      await storage.createActivityLog({
        type: 'employee_updated',
        title: 'Employee Updated',
        description: `${req.authenticatedUser.user.displayName} updated employee profile for ${employee.personalInfo.displayName}`,
        entityId: employee.id,
        entityType: 'employee',
        userId: req.authenticatedUser.user.uid
      });

      res.json(employee);
    } catch (error) {
      console.error("Error updating employee:", error);
      res.status(500).json({ message: "Failed to update employee" });
    }
  });

  app.delete("/api/employees/:id", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Only master_admin can delete employees
      if (req.authenticatedUser.user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied. Only master admin can delete employees." });
      }

      const success = await storage.deleteEmployee(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Employee not found" });
      }

      // Log activity
      await storage.createActivityLog({
        type: 'employee_deleted',
        title: 'Employee Deleted',
        description: `${req.authenticatedUser.user.displayName} deleted employee profile`,
        entityId: req.params.id,
        entityType: 'employee',
        userId: req.authenticatedUser.user.uid
      });

      res.status(204).end();
    } catch (error) {
      console.error("Error deleting employee:", error);
      res.status(500).json({ message: "Failed to delete employee" });
    }
  });

  // Employee Document Management Routes
  app.get("/api/employees/:employeeId/documents", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const hasPermission = req.authenticatedUser.permissions.includes("users.view") ||
        req.authenticatedUser.user.role === "master_admin" ||
        req.authenticatedUser.user.department === "hr";

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }

      const documents = await storage.getEmployeeDocuments(req.params.employeeId);
      res.json(documents);
    } catch (error) {
      console.error("Error fetching employee documents:", error);
      res.status(500).json({ message: "Failed to fetch employee documents" });
    }
  });

  app.post("/api/employees/:employeeId/documents", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const hasPermission = req.authenticatedUser.user.role === "master_admin" ||
        req.authenticatedUser.user.department === "hr";

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }

      const documentData = insertEmployeeDocumentSchema.parse({
        ...req.body,
        employeeId: req.params.employeeId,
        uploadedBy: req.authenticatedUser.user.uid
      });

      const document = await storage.createEmployeeDocument(documentData);
      res.status(201).json(document);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error creating employee document:", error);
      res.status(500).json({ message: "Failed to create employee document" });
    }
  });

  app.patch("/api/employees/:employeeId/documents/:documentId", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const hasPermission = req.authenticatedUser.user.role === "master_admin" ||
        req.authenticatedUser.user.department === "hr";

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }

      const document = await storage.updateEmployeeDocument(req.params.documentId, req.body);
      res.json(document);
    } catch (error) {
      console.error("Error updating employee document:", error);
      res.status(500).json({ message: "Failed to update employee document" });
    }
  });

  app.delete("/api/employees/:employeeId/documents/:documentId", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const hasPermission = req.authenticatedUser.user.role === "master_admin" ||
        req.authenticatedUser.user.department === "hr";

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }

      const success = await storage.deleteEmployeeDocument(req.params.documentId);
      if (!success) {
        return res.status(404).json({ message: "Document not found" });
      }

      res.status(204).end();
    } catch (error) {
      console.error("Error deleting employee document:", error);
      res.status(500).json({ message: "Failed to delete employee document" });
    }
  });

  // Performance Review Management Routes
  app.get("/api/performance-reviews", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const hasPermission = req.authenticatedUser.permissions.includes("users.view") ||
        req.authenticatedUser.user.role === "master_admin" ||
        req.authenticatedUser.user.department === "hr";

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { employeeId, reviewerId } = req.query;
      let reviews = [];

      if (employeeId) {
        reviews = await storage.getEmployeePerformanceReviews(employeeId as string);
      } else if (reviewerId) {
        reviews = await storage.getPerformanceReviewsByReviewer(reviewerId as string);
      } else {
        reviews = await storage.getUpcomingPerformanceReviews();
      }

      res.json(reviews);
    } catch (error) {
      console.error("Error fetching performance reviews:", error);
      res.status(500).json({ message: "Failed to fetch performance reviews" });
    }
  });

  app.post("/api/performance-reviews", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const hasPermission = req.authenticatedUser.user.role === "master_admin" ||
        req.authenticatedUser.user.department === "hr";

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }

      const reviewData = insertPerformanceReviewSchema.parse({
        ...req.body,
        reviewedBy: req.authenticatedUser.user.uid
      });

      const review = await storage.createPerformanceReview(reviewData);
      res.status(201).json(review);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error creating performance review:", error);
      res.status(500).json({ message: "Failed to create performance review" });
    }
  });

  app.patch("/api/performance-reviews/:id", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const hasPermission = req.authenticatedUser.user.role === "master_admin" ||
        req.authenticatedUser.user.department === "hr";

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }

      const review = await storage.updatePerformanceReview(req.params.id, req.body);
      res.json(review);
    } catch (error) {
      console.error("Error updating performance review:", error);
      res.status(500).json({ message: "Failed to update performance review" });
    }
  });

  // Employee Search and Lookup Routes
  app.get("/api/employees/search", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const hasPermission = req.authenticatedUser.permissions.includes("users.view") ||
        req.authenticatedUser.user.role === "master_admin" ||
        req.authenticatedUser.user.department === "hr";

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { q, department, designation, status } = req.query;

      const filters: any = {};
      if (q) filters.search = q as string;
      if (department) filters.department = department as string;
      if (designation) filters.designation = designation as string;
      if (status) filters.status = status as string;

      const employees = await storage.listEmployees(filters);

      // Return simplified employee data for search results
      const searchResults = employees.map(emp => ({
        id: emp.id,
        employeeId: emp.employeeId,
        displayName: emp.personalInfo.displayName,
        email: emp.contactInfo.primaryEmail,
        department: emp.employmentInfo.department,
        designation: emp.employmentInfo.designation,
        status: emp.status,
        photoURL: emp.personalInfo.photoURL
      }));

      res.json(searchResults);
    } catch (error) {
      console.error("Error searching employees:", error);
      res.status(500).json({ message: "Failed to search employees" });
    }
  });

  app.get("/api/employees/by-system-user/:systemUserId", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const employee = await storage.getEmployeeBySystemUserId(req.params.systemUserId);
      if (!employee) {
        return res.status(404).json({ message: "Employee profile not found for this user" });
      }

      res.json(employee);
    } catch (error) {
      console.error("Error fetching employee by system user ID:", error);
      res.status(500).json({ message: "Failed to fetch employee profile" });
    }
  });

  // Leaves
  app.get("/api/leaves", verifyAuth, async (req, res) => {
    try {
      const { userId, status } = req.query;
      const requestingUser = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!requestingUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (userId) {
        if (
          requestingUser.role !== "master_admin" &&
          requestingUser.role !== "admin" &&
          requestingUser.id !== userId
        ) {
          return res.status(403).json({ message: "Access denied" });
        }
        const leaves = await storage.listLeavesByUser(userId as string);
        return res.json(leaves);
      }

      if (status === "pending") {
        if (
          requestingUser.role !== "master_admin" &&
          requestingUser.role !== "admin" &&
          requestingUser.department !== "hr"
        ) {
          return res.status(403).json({ message: "Access denied" });
        }
        const leaves = await storage.listPendingLeaves();
        return res.json(leaves);
      }

      res.status(400).json({ message: "Missing required query parameters" });
    } catch (error) {
      console.error("Error fetching leaves:", error);
      res.status(500).json({ message: "Failed to fetch leaves" });
    }
  });

  app.get("/api/leaves/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      const leave = await storage.getLeave(req.params.id);
      if (!leave) {
        return res.status(404).json({ message: "Leave record not found" });
      }
      if (
        !user ||
        (user.role !== "master_admin" &&
          user.role !== "admin" &&
          user.department !== "hr" &&
          leave.userId !== user.id)
      ) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.json(leave);
    } catch (error) {
      console.error("Error fetching leave:", error);
      res.status(500).json({ message: "Failed to fetch leave" });
    }
  });

  app.post("/api/leaves", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user) {
        return res.status(403).json({ message: "Access denied" });
      }
      const leaveData = insertLeaveSchema.parse({
        ...req.body,
        userId: user.id,
      });
      const leave = await storage.createLeave(leaveData);
      res.status(201).json(leave);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error creating leave:", error);
      res.status(500).json({ message: "Failed to create leave" });
    }
  });

  app.patch("/api/leaves/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      const leave = await storage.getLeave(req.params.id);
      if (!leave) {
        return res.status(404).json({ message: "Leave record not found" });
      }
      if (
        !user ||
        (user.role !== "master_admin" &&
          user.role !== "admin" &&
          user.department !== "hr" &&
          leave.userId !== user.id)
      ) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Security Check: Verify payroll period is not locked (for original date)
      if (await PayrollLockService.isPeriodLocked(leave.startDate)) {
        return res.status(403).json({ message: "Cannot modify leave for a locked payroll period" });
      }

      const leaveData = insertLeaveSchema.partial().parse(req.body);

      // Security Check: Verify payroll period is not locked (for new date if changed)
      if (leaveData.startDate && await PayrollLockService.isPeriodLocked(leaveData.startDate)) {
        return res.status(403).json({ message: "Cannot move leave to a locked payroll period" });
      }
      const updatedLeave = await storage.updateLeave(req.params.id, leaveData);
      if (!updatedLeave) {
        return res.status(404).json({ message: "Leave record not found" });
      }
      res.json(updatedLeave);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error updating leave:", error);
      res.status(500).json({ message: "Failed to update leave" });
    }
  });

  // ===================== Comprehensive Leave Management System API Routes =====================

  /**
   * GET /api/reports/leaves - Leave Reports API
   * Returns filtered leave data with summary statistics for HR/Admin
   * 
   * Permissions: admin, master_admin (role) OR hr (department)
   * Query params:
   * - startDate (required): ISO date string (YYYY-MM-DD)
   * - endDate (required): ISO date string (YYYY-MM-DD) 
   * - department (optional): filter by department
   * - leaveType (optional): filter by leave type
   * - status (optional): filter by status
   */
  app.get('/api/reports/leaves', verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Permission Guard: admin/master_admin (role) OR hr (department)
      const hasAccess =
        ['admin', 'master_admin'].includes(user.role) ||
        user.department === 'hr';

      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied. Only admins and HR can access leave reports." });
      }

      // Parse and validate query parameters
      const { startDate, endDate, department, leaveType, status } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ message: "startDate and endDate are required" });
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD" });
      }

      // Fetch all leave applications (HR can see all, no status filter)
      const allLeaves = await storage.listLeaveApplicationsByHR();

      // Filter by date overlap
      // Include leaves that overlap with [startDate, endDate]
      // Logic: leave starts before range ends AND leave ends after range starts
      const dateFilteredLeaves = allLeaves.filter(leave => {
        if (!leave.startDate || !leave.endDate) return false;

        const leaveStart = new Date(leave.startDate);
        const leaveEnd = new Date(leave.endDate);

        // Date overlap logic
        return leaveStart <= end && leaveEnd >= start;
      });

      // Apply additional filters
      let filteredLeaves = dateFilteredLeaves;

      // Fetch all users once for both filtering and enrichment
      const allUsers = await storage.listUsers();
      const userMapByUid = new Map(allUsers.map(u => [u.uid, u]));

      if (department && department !== 'all') {
        // Filter by department
        filteredLeaves = filteredLeaves.filter(leave => {
          const user = userMapByUid.get(leave.userId);
          return user?.department === department;
        });
      }

      if (leaveType && leaveType !== 'all') {
        filteredLeaves = filteredLeaves.filter(leave =>
          leave.leaveType === leaveType
        );
      }

      if (status && status !== 'all') {
        filteredLeaves = filteredLeaves.filter(leave =>
          leave.status === status
        );
      }

      // Enrich with employee names (reuse userMap from above)
      const enrichedLeaves = filteredLeaves.map(leave => ({
        ...leave,
        employeeName: userMapByUid.get(leave.userId)?.displayName || 'Unknown',
        employeeEmail: userMapByUid.get(leave.userId)?.email || '',
        department: userMapByUid.get(leave.userId)?.department || 'Unknown'
      }));

      // Calculate summary statistics
      const stats = {
        total: filteredLeaves.length,
        casualCount: filteredLeaves.filter(l => l.leaveType === 'casual_leave').length,
        unpaidCount: filteredLeaves.filter(l => l.leaveType === 'unpaid_leave').length,
        permissionCount: filteredLeaves.filter(l => l.leaveType === 'permission').length
      };

      res.json({
        leaves: enrichedLeaves,
        stats
      });

    } catch (error) {
      console.error('==== LEAVE REPORTS API ERROR ====');
      console.error('Full error:', error);
      console.error('==================================');
      res.status(500).json({ message: "Failed to fetch leave reports" });
    }
  });

  // Leave Balance Routes
  app.get("/api/leave-balance/current", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user) {
        return res.status(403).json({ message: "Access denied" });
      }

      const balance = await storage.getCurrentLeaveBalance(user.id);
      if (!balance) {
        // Initialize balance for current month if doesn't exist
        const now = new Date();
        await storage.createLeaveBalance({
          userId: user.id,
          employeeId: user.employeeId || user.id,
          casualLeaveBalance: 1,
          permissionHoursBalance: 2,
          casualLeaveUsed: 0,
          permissionHoursUsed: 0,
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          casualLeaveHistory: [],
          permissionHistory: [],
          lastResetDate: now,
          createdAt: now,
          updatedAt: now,
        });
        const newBalance = await storage.getCurrentLeaveBalance(user.id);
        return res.json(newBalance);
      }

      res.json(balance);
    } catch (error) {
      console.error("Error fetching leave balance:", error);
      res.status(500).json({ message: "Failed to fetch leave balance" });
    }
  });

  app.get("/api/leave-balance/:userId", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check permissions: user can view own balance, managers can view team, HR can view all
      if (req.params.userId !== user.id && user.department !== "hr" && user.role !== "master_admin") {
        // Check if user is the reporting manager
        const targetUser = await storage.getUser(req.params.userId);
        if (!targetUser || targetUser.reportingManagerId !== user.id) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      const balance = await storage.getCurrentLeaveBalance(req.params.userId);
      if (!balance) {
        return res.status(404).json({ message: "Leave balance not found" });
      }

      res.json(balance);
    } catch (error) {
      console.error("Error fetching leave balance:", error);
      res.status(500).json({ message: "Failed to fetch leave balance" });
    }
  });

  app.post("/api/leave-balance/reset", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !(await storage.checkEffectiveUserPermission(user.uid, "system.settings"))) {
        return res.status(403).json({ message: "Access denied - System settings permission required" });
      }

      // Validate month and year input
      const resetSchema = z.object({
        month: z.number().min(1).max(12),
        year: z.number().min(2020).max(2100)
      });

      const { month, year } = resetSchema.parse(req.body);
      await storage.resetMonthlyLeaveBalances(month, year);

      res.json({ message: "Leave balances reset successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error resetting leave balances:", error);
      res.status(500).json({ message: "Failed to reset leave balances" });
    }
  });

  // Leave Application Routes
  app.post("/api/leave-applications", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get current leave balance
      const balance = await storage.getCurrentLeaveBalance(user.id);
      if (!balance) {
        return res.status(400).json({ message: "Leave balance not found. Please contact HR." });
      }

      // Convert date strings to Date objects and handle nullable fields before validation
      const processedBody = {
        ...req.body,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
        permissionDate: req.body.permissionDate ? new Date(req.body.permissionDate) : undefined,
      };

      // Create a validation schema that accepts partial data but handles nullable fields correctly
      const leaveApplicationValidationSchema = insertLeaveApplicationSchema.pick({
        leaveType: true,
        startDate: true,
        endDate: true,
        totalDays: true,
        permissionDate: true,
        permissionStartTime: true,
        permissionEndTime: true,
        permissionHours: true,
        reason: true,
      }).partial();

      // Validate request body using schema
      const validatedBody = leaveApplicationValidationSchema.parse(processedBody);

      // Prepare leave application data
      const now = new Date();
      const leaveData: any = {
        ...validatedBody,
        userId: user.id,
        employeeId: user.employeeId || user.id,
        userName: user.displayName,
        userDepartment: user.department || null,
        userDesignation: user.designation || null,
        reportingManagerId: user.reportingManagerId || null,
        status: "pending_manager" as const,
        balanceAtApplication: {
          casualLeaveAvailable: balance.casualLeaveBalance - balance.casualLeaveUsed,
          permissionHoursAvailable: balance.permissionHoursBalance - balance.permissionHoursUsed,
        },
        affectsPayroll: false,
        deductionAmount: 0,
        applicationDate: now,
        createdAt: now,
        updatedAt: now,
      };

      // Remove undefined fields to avoid Firestore errors
      Object.keys(leaveData).forEach(key => {
        if (leaveData[key] === undefined) {
          delete leaveData[key];
        }
      });

      // Ensure unpaid leave always affects payroll (salary deduction)
      if (leaveData.leaveType === "unpaid_leave") {
        leaveData.affectsPayroll = true;
      }

      // Validate balance availability
      if (leaveData.leaveType === "casual_leave" && leaveData.totalDays) {
        const available = balance.casualLeaveBalance - balance.casualLeaveUsed;
        if (available < leaveData.totalDays) {
          leaveData.leaveType = "unpaid_leave";
          leaveData.affectsPayroll = true;
        }
      } else if (leaveData.leaveType === "permission" && leaveData.permissionHours) {
        const available = balance.permissionHoursBalance - balance.permissionHoursUsed;
        if (available < leaveData.permissionHours) {
          return res.status(400).json({
            message: `Insufficient permission hours. Available: ${available} hours`
          });
        }
      }

      const leave = await storage.createLeaveApplication(leaveData);
      res.status(201).json(leave);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Leave application validation error:", JSON.stringify(error.errors, null, 2));
        console.error("Request body:", JSON.stringify(req.body, null, 2));
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error creating leave application:", error);
      res.status(500).json({ message: "Failed to create leave application" });
    }
  });

  // GET /api/leave/today-status - Check if user has blocking leave today (for frontend UX)
  app.get("/api/leave/today-status", verifyAuth, async (req, res) => {
    try {
      const userId = req.authenticatedUser?.uid;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Check if user has approved leave for today
      const leave = await storage.getApprovedLeaveForDate(userId, new Date());

      res.json({
        hasBlockingLeave: !!leave,
        leaveType: leave?.leaveType || null,
        leaveDetails: leave ? {
          type: leave.leaveType,
          startDate: leave.startDate?.toISOString(),
          endDate: leave.endDate?.toISOString(),
          reason: leave.reason
        } : null
      });
    } catch (error) {
      console.error("Error checking today's leave status:", error);
      // Return false on error (fail-open for UX)
      res.json({ hasBlockingLeave: false, leaveType: null, leaveDetails: null });
    }
  });

  app.get("/api/leave-applications/my", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user) {
        return res.status(403).json({ message: "Access denied" });
      }

      const leaves = await storage.listLeaveApplicationsByUser(user.id);
      res.json(leaves);
    } catch (error) {
      console.error("Error fetching leave applications:", error);
      res.status(500).json({ message: "Failed to fetch leave applications" });
    }
  });

  // ✅ RESTORED: Pending manager leaves route
  app.get("/api/leave-applications/pending-manager", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user) {
        return res.status(403).json({ message: "Access denied" });
      }

      console.log(`Fetching pending manager leaves for user ID: ${user.id}`);
      const leaves = await storage.listLeaveApplicationsByManager(user.id, "pending_manager");
      console.log(`Found ${leaves.length} pending manager leaves`);
      res.json(leaves);
    } catch (error) {
      console.error("Error fetching pending manager leaves:", error);
      res.status(500).json({ message: "Failed to fetch pending manager leaves" });
    }
  });

  app.get("/api/leave-applications/pending-hr", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      // ✅ FIX: Allow HR department or master_admin
      if (!user || (user.department !== "hr" && user.role !== "master_admin")) {
        return res.status(403).json({ message: "Access denied - HR department access required" });
      }

      console.log("Fetching pending HR leaves...");
      const leaves = await storage.listLeaveApplicationsByHR("pending_hr");
      console.log(`Found ${leaves.length} pending HR leaves`);
      if (leaves.length > 0) {
        console.log("Pending HR leaves:", leaves.map(l => ({ id: l.id, status: l.status, userName: l.userName })));
      }
      res.json(leaves);
    } catch (error) {
      console.error("Error fetching pending HR leaves:", error);
      res.status(500).json({ message: "Failed to fetch pending HR leaves" });
    }
  });

  app.get("/api/leave-applications/all", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || (user.department !== "hr" && user.role !== "master_admin")) {
        return res.status(403).json({ message: "Access denied - HR or Admin only" });
      }

      const { status, month, year } = req.query;
      const leaves = await storage.listAllLeaveApplications({
        status: status as string,
        month: month ? parseInt(month as string) : undefined,
        year: year ? parseInt(year as string) : undefined,
      });
      res.json(leaves);
    } catch (error) {
      console.error("Error fetching all leave applications:", error);
      res.status(500).json({ message: "Failed to fetch all leave applications" });
    }
  });

  app.get("/api/leave-applications/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user) {
        return res.status(403).json({ message: "Access denied" });
      }

      const leave = await storage.getLeaveApplication(req.params.id);
      if (!leave) {
        return res.status(404).json({ message: "Leave application not found" });
      }

      // Check permissions
      const canView = leave.userId === user.id ||
        leave.reportingManagerId === user.id ||
        user.department === "hr" ||
        user.role === "master_admin";

      if (!canView) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(leave);
    } catch (error) {
      console.error("Error fetching leave application:", error);
      res.status(500).json({ message: "Failed to fetch leave application" });
    }
  });

  app.put("/api/leave-applications/:id/approve-manager", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user) {
        return res.status(403).json({ message: "Access denied" });
      }

      const leave = await storage.getLeaveApplication(req.params.id);
      if (!leave) {
        return res.status(404).json({ message: "Leave application not found" });
      }

      // ✅ FIX: Simple check - is user the reporting manager for this leave?
      if (leave.reportingManagerId !== user.id) {
        return res.status(403).json({ message: "Access denied - You are not the reporting manager for this employee" });
      }

      if (leave.status !== "pending_manager") {
        return res.status(400).json({ message: "Leave is not pending manager approval" });
      }

      // Validate remarks input
      const approvalSchema = z.object({
        remarks: z.string().optional()
      });

      const { remarks } = approvalSchema.parse(req.body);
      const updatedLeave = await storage.approveLeaveByManager(req.params.id, user.id, remarks);
      console.log(`Manager approved leave ${req.params.id}, new status: ${updatedLeave.status}`);

      res.json(updatedLeave);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error approving leave (manager):", error);
      res.status(500).json({ message: "Failed to approve leave" });
    }
  });

  app.put("/api/leave-applications/:id/approve-hr", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      // ✅ FIX: Simple check - HR department or master_admin
      if (!user || (user.department !== "hr" && user.role !== "master_admin")) {
        return res.status(403).json({ message: "Access denied - HR department access required" });
      }

      const leave = await storage.getLeaveApplication(req.params.id);
      if (!leave) {
        return res.status(404).json({ message: "Leave application not found" });
      }

      if (leave.status !== "pending_hr") {
        return res.status(400).json({ message: "Leave is not pending HR approval" });
      }

      // Validate remarks input
      const approvalSchema = z.object({
        remarks: z.string().optional()
      });

      const { remarks } = approvalSchema.parse(req.body);
      const updatedLeave = await storage.approveLeaveByHR(req.params.id, user.id, remarks);

      res.json(updatedLeave);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error approving leave (HR):", error);
      res.status(500).json({ message: "Failed to approve leave" });
    }
  });

  app.put("/api/leave-applications/:id/reject", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user) {
        return res.status(403).json({ message: "Access denied" });
      }

      const leave = await storage.getLeaveApplication(req.params.id);
      if (!leave) {
        return res.status(404).json({ message: "Leave application not found" });
      }

      // ✅ FIX: Simple check - is user the reporting manager OR HR?
      const isReportingManager = leave.reportingManagerId === user.id;
      const isHR = user.department === "hr" || user.role === "master_admin";

      if (!isReportingManager && !isHR) {
        return res.status(403).json({ message: "Access denied - Only reporting manager or HR can reject leaves" });
      }

      // Determine role: manager or hr
      let rejectedByRole: 'manager' | 'hr';
      if (leave.status === "pending_manager" && isReportingManager) {
        rejectedByRole = 'manager';
      } else if (leave.status === "pending_hr" && isHR) {
        rejectedByRole = 'hr';
      } else {
        return res.status(400).json({ message: "Invalid leave status for rejection" });
      }

      // Validate remarks input
      const rejectionSchema = z.object({
        reason: z.string().min(1, "Rejection reason is required")
      });

      const { reason } = rejectionSchema.parse(req.body);
      const updatedLeave = await storage.rejectLeave(req.params.id, user.id, reason, rejectedByRole);

      res.json(updatedLeave);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error rejecting leave:", error);
      res.status(500).json({ message: "Failed to reject leave" });
    }
  });

  app.put("/api/leave-applications/:id/cancel", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user) {
        return res.status(403).json({ message: "Access denied" });
      }

      const updatedLeave = await storage.cancelLeaveApplication(req.params.id, user.id);

      res.json(updatedLeave);
    } catch (error: any) {
      console.error("Error cancelling leave:", error);
      res.status(500).json({ message: error.message || "Failed to cancel leave" });
    }
  });

  // Fixed Holidays Routes
  app.get("/api/holidays", verifyAuth, async (req, res) => {
    try {
      const { year } = req.query;
      const holidays = await storage.listFixedHolidays(year ? parseInt(year as string) : undefined);
      res.json({ success: true, holidays });
    } catch (error) {
      console.error("Error fetching holidays:", error);
      res.status(500).json({ success: false, message: "Failed to fetch holidays" });
    }
  });

  app.post("/api/holidays", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !(await storage.checkEffectiveUserPermission(user.uid, "system.settings"))) {
        return res.status(403).json({ message: "Access denied - System settings permission required" });
      }

      console.log("[Holiday Creation] Request body:", JSON.stringify(req.body, null, 2));

      // Extract and validate required fields
      const { date, name, type, applicableDepartments, notes, allowOT } = req.body;

      if (!date || !name) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: date and name are required"
        });
      }

      const holidayDate = new Date(date);
      const year = holidayDate.getFullYear();

      const holidayData = {
        name,
        date: holidayDate,
        year,
        type: type || "national",
        isPaid: true,
        isOptional: false,
        allowOT: allowOT === true, // Explicit boolean, defaults to false if not provided
        applicableDepartments: applicableDepartments || null,
        description: notes || null,
        createdBy: user.uid,
        createdAt: new Date(),
      };

      console.log("[Holiday Creation] Transformed data:", JSON.stringify(holidayData, null, 2));

      const holiday = await storage.createFixedHoliday(holidayData);
      res.status(201).json({ success: true, holiday, message: "Holiday created successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("[Holiday Creation] Validation error:", JSON.stringify(error.errors, null, 2));
        return res.status(400).json({ success: false, errors: error.errors, message: "Validation failed" });
      }
      console.error("[Holiday Creation] Error:", error);
      res.status(500).json({ success: false, message: "Failed to create holiday" });
    }
  });

  app.put("/api/holidays/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !(await storage.checkEffectiveUserPermission(user.uid, "system.settings"))) {
        return res.status(403).json({ success: false, message: "Access denied - System settings permission required" });
      }

      console.log("[Holiday Update] Request body:", JSON.stringify(req.body, null, 2));

      // Extract and validate required fields
      const { date, name, type, applicableDepartments, notes, allowOT } = req.body;

      if (!date || !name) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: date and name are required"
        });
      }

      const holidayDate = new Date(date);
      const year = holidayDate.getFullYear();

      const updateData = {
        name,
        date: holidayDate,
        year,
        type: type || "national",
        isPaid: true,
        isOptional: false,
        allowOT: allowOT === true,
        applicableDepartments: applicableDepartments || null,
        description: notes || null,
      };

      console.log("[Holiday Update] Transformed data:", JSON.stringify(updateData, null, 2));

      const holiday = await storage.updateFixedHoliday(req.params.id, updateData);
      res.json({ success: true, holiday, message: "Holiday updated successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("[Holiday Update] Validation error:", JSON.stringify(error.errors, null, 2));
        return res.status(400).json({ success: false, errors: error.errors, message: "Validation failed" });
      }
      console.error("[Holiday Update] Error:", error);
      res.status(500).json({ success: false, message: "Failed to update holiday" });
    }
  });

  app.delete("/api/holidays/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !(await storage.checkEffectiveUserPermission(user.uid, "system.settings"))) {
        return res.status(403).json({ success: false, message: "Access denied - System settings permission required" });
      }

      await storage.deleteFixedHoliday(req.params.id);
      res.json({ success: true, message: "Holiday deleted successfully" });
    } catch (error) {
      console.error("Error deleting holiday:", error);
      res.status(500).json({ success: false, message: "Failed to delete holiday" });
    }
  });

  // GET /api/attendance/holidays - Get holidays for attendance system
  app.get("/api/attendance/holidays", verifyAuth, async (req, res) => {
    try {
      const { start, end, department } = req.query;

      if (!start || !end) {
        return res.status(400).json({
          success: false,
          message: "Missing required parameters: start and end dates required"
        });
      }

      const startDate = new Date(start as string);
      const endDate = new Date(end as string);

      // Get user's department if not specified
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      const dept = department as string || user?.department || undefined;

      // Use UnifiedAttendanceService to get holidays
      const { UnifiedAttendanceService } = await import('./services/unified-attendance-service');
      const holidays = await UnifiedAttendanceService.getHolidaysInRange(
        startDate,
        endDate,
        dept
      );

      res.json({ success: true, holidays });
    } catch (error) {
      console.error("Error fetching holidays for attendance:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch holidays"
      });
    }
  });

  app.post("/api/holidays/initialize", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !(await storage.checkEffectiveUserPermission(user.uid, "system.settings"))) {
        return res.status(403).json({ message: "Access denied - System settings permission required" });
      }

      // Validate year input
      const initializeSchema = z.object({
        year: z.number().min(2020).max(2100)
      });

      const { year } = initializeSchema.parse(req.body);
      await storage.initializeFixedHolidays(year, user.id);
      res.json({ message: "Fixed holidays initialized successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error initializing holidays:", error);
      res.status(500).json({ message: "Failed to initialize holidays" });
    }
  });

  // ===================== Phase 2: Enterprise RBAC API Routes =====================

  // Role Management Routes
  app.get("/api/roles", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !["master_admin", "admin"].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const roles = await storage.listRoles();
      res.json(roles);
    } catch (error) {
      console.error("Error fetching roles:", error);
      res.status(500).json({ message: "Failed to fetch roles" });
    }
  });

  app.get("/api/roles/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !["master_admin", "admin"].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const role = await storage.getRole(req.params.id);
      if (!role) {
        return res.status(404).json({ message: "Role not found" });
      }
      res.json(role);
    } catch (error) {
      console.error("Error fetching role:", error);
      res.status(500).json({ message: "Failed to fetch role" });
    }
  });

  app.post("/api/roles", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - Master Admin only" });
      }
      const roleData = insertRoleSchema.parse(req.body);
      const role = await storage.createRole(roleData);

      // Create audit log
      await storage.createAuditLog({
        userId: user.id,
        action: "role_created",
        entityType: "role",
        entityId: role.id,
        changes: { name: role.name, permissions: role.permissions },
        department: user.department,
        designation: user.designation
      });

      res.status(201).json(role);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error creating role:", error);
      res.status(500).json({ message: "Failed to create role" });
    }
  });

  app.patch("/api/roles/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - Master Admin only" });
      }
      const roleData = insertRoleSchema.partial().parse(req.body);
      const updatedRole = await storage.updateRole(req.params.id, roleData);

      // Create audit log
      await storage.createAuditLog({
        userId: user.id,
        action: "role_updated",
        entityType: "role",
        entityId: req.params.id,
        changes: roleData,
        department: user.department,
        designation: user.designation
      });

      res.json(updatedRole);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error updating role:", error);
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  // EXPORT: Excel Payroll Register
  app.get("/api/payroll/export", verifyAuth, async (req, res) => {
    try {
      const month = parseInt(req.query.month as string);
      const year = parseInt(req.query.year as string);

      if (isNaN(month) || isNaN(year)) {
        return res.status(400).json({ error: "Month and Year are required" });
      }

      const payrolls = await storage.getEnhancedPayrolls(month, year);
      const workBook = XLSX.utils.book_new();

      // Flat data structure matching client "October 2025" sheet
      const payrollData = await Promise.all(payrolls.map(async (p) => {
        const user = await storage.getUser(p.userId);
        return {
          "E CODE": user?.employeeId || p.employeeId,
          "NAME": user?.displayName || "Unknown",
          "DESIGNATION": user?.designation || "-",
          "DEPARTMENT": user?.department || "-",
          "BASIC": p.fixedBasic,
          "WORKING DAYS": p.monthDays,
          "PRESENT DAYS": p.presentDays + p.paidLeaveDays, // Total Payable Days
          "EARNED BASIC": p.earnedBasic,
          "EARNED HRA": p.earnedHRA,
          "EARNED CONV": p.earnedConveyance,
          "OTHER EARNINGS": p.otherEarnings + p.betta + p.overtimePay,
          "GROSS SALARY": p.grossSalary,
          "EPF": p.epfDeduction,
          "ESI": p.esiDeduction,
          "TDS": p.tdsDeduction,
          "ADVANCE": p.advanceDeduction + p.salaryAdvance,
          "TOTAL DEDUCTIONS": p.totalDeductions,
          "NET SALARY": p.netSalary,
          // EMPLOYER COSTS (Hidden Columns)
          "EMPLOYER EPF": p.employerEPF || 0,
          "EMPLOYER ESI": p.employerESI || 0,
          "CTC": p.ctc || 0
        };
      }));

      const workSheet = XLSX.utils.json_to_sheet(payrollData);

      // Auto-width columns
      const colWidths = [
        { wch: 10 }, { wch: 20 }, { wch: 15 }, { wch: 15 },
        { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
        { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 15 },
        { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
        { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }
      ];
      workSheet['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(workBook, workSheet, "Payroll Register");

      const buffer = XLSX.write(workBook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=Payroll_${month}_${year}.xlsx`);
      res.send(buffer);

    } catch (error) {
      console.error("Export error:", error);
      res.status(500).json({ error: "Failed to generate export" });
    }
  });

  // EXPORT: Payslip HTML (Printable)
  app.get("/api/payroll/:id/payslip", verifyAuth, async (req, res) => {
    try {
      const payroll = await storage.getEnhancedPayroll(req.params.id);
      if (!payroll) return res.status(404).send("Payroll not found");

      const user = await storage.getUser(payroll.userId);
      const companyName = "KAMALESHWARI ENGINEERING PVT LTD"; // Hardcoded for now, or fetch from settings

      // Simple HTML Template for Browser Printing
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Payslip - ${user?.displayName}</title>
          <style>
            body { font-family: 'Helvetica', sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
            .company-name { font-size: 24px; font-weight: bold; text-transform: uppercase; margin-bottom: 5px; }
            .payslip-title { font-size: 18px; color: #666; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
            .section-title { font-weight: bold; background: #f3f4f6; padding: 8px; margin-bottom: 10px; border-radius: 4px; }
            .row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #ccc; }
            .row:last-child { border-bottom: none; }
            .total-row { display: flex; justify-content: space-between; padding: 10px 0; border-top: 2px solid #333; font-weight: bold; margin-top: 10px; }
            .net-pay { background: #e5e7eb; padding: 15px; text-align: center; font-size: 20px; font-weight: bold; margin-top: 30px; border-radius: 8px; }
            .footer { margin-top: 50px; font-size: 12px; text-align: center; color: #666; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body onload="window.print()">
          <div class="header">
            <div class="company-name">${companyName}</div>
            <div class="payslip-title">Payslip for ${new Date(payroll.year, payroll.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}</div>
          </div>

          <div class="grid">
            <div>
              <div class="row"><span>Name:</span> <strong>${user?.displayName}</strong></div>
              <div class="row"><span>ID:</span> ${user?.employeeId || payroll.employeeId}</div>
              <div class="row"><span>Designation:</span> ${user?.designation || '-'}</div>
            </div>
            <div>
              <div class="row"><span>Days Payable:</span> ${payroll.presentDays + payroll.paidLeaveDays}</div>
              <div class="row"><span>Bank A/c:</span> ${user?.bankAccountNumber || '-'}</div>
              <div class="row"><span>PAN:</span> ${user?.panNumber || '-'}</div>
            </div>
          </div>

          <div class="grid">
            <div>
              <div class="section-title">Earnings</div>
              <div class="row"><span>Basic Salary</span> <span>₹${payroll.earnedBasic.toLocaleString('en-IN')}</span></div>
              <div class="row"><span>HRA</span> <span>₹${payroll.earnedHRA.toLocaleString('en-IN')}</span></div>
              <div class="row"><span>Conveyance</span> <span>₹${payroll.earnedConveyance.toLocaleString('en-IN')}</span></div>
              <div class="row"><span>Overtime</span> <span>₹${payroll.overtimePay.toLocaleString('en-IN')}</span></div>
              <div class="row"><span>Other Allowances</span> <span>₹${(payroll.otherEarnings + payroll.betta).toLocaleString('en-IN')}</span></div>
              <div class="total-row"><span>Total Earnings</span> <span>₹${payroll.grossSalary.toLocaleString('en-IN')}</span></div>
            </div>
            <div>
              <div class="section-title">Deductions</div>
              <div class="row"><span>EPF</span> <span>₹${payroll.epfDeduction.toLocaleString('en-IN')}</span></div>
              <div class="row"><span>ESI</span> <span>₹${payroll.esiDeduction.toLocaleString('en-IN')}</span></div>
              <div class="row"><span>TDS</span> <span>₹${payroll.tdsDeduction.toLocaleString('en-IN')}</span></div>
              <div class="row"><span>Advance/Loan</span> <span>₹${(payroll.advanceDeduction + payroll.loanDeduction + payroll.salaryAdvance).toLocaleString('en-IN')}</span></div>
              <div class="total-row"><span>Total Deductions</span> <span>₹${payroll.totalDeductions.toLocaleString('en-IN')}</span></div>
            </div>
          </div>

          <div class="net-pay">
            NET PAYABLE: ₹${payroll.netSalary.toLocaleString('en-IN')}
          </div>

          <div class="footer">
            Amount in words: ${numberToWords(payroll.netSalary)} Only<br>
            This is a computer-generated document and does not require a signature.
          </div>
        </body>
        </html>
      `;

      res.send(html);

    } catch (error) {
      console.error("Payslip error:", error);
      res.status(500).send("Error generating payslip");
    }
  });

  function numberToWords(num: number): string {
    // Simple placeholder - ideally use a library like 'number-to-words'
    return num.toString();
  }

  app.delete("/api/roles/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - Master Admin only" });
      }
      const success = await storage.deleteRole(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Role not found" });
      }

      // Create audit log
      await storage.createAuditLog({
        userId: user.id,
        action: "role_deleted",
        entityType: "role",
        entityId: req.params.id,
        department: user.department,
        designation: user.designation
      });

      res.json({ message: "Role deleted successfully" });
    } catch (error) {
      console.error("Error deleting role:", error);
      res.status(500).json({ message: "Failed to delete role" });
    }
  });

  // User Role Assignment Routes
  app.get("/api/users/:userId/roles", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || (!["master_admin", "admin"].includes(user.role) && user.id !== req.params.userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const roleAssignments = await storage.getUserRoleAssignments(req.params.userId);
      res.json(roleAssignments);
    } catch (error) {
      console.error("Error fetching user roles:", error);
      res.status(500).json({ message: "Failed to fetch user roles" });
    }
  });

  app.post("/api/users/:userId/roles", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !["master_admin", "admin"].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const assignmentData = insertUserRoleAssignmentSchema.parse({
        ...req.body,
        userId: req.params.userId,
        assignedBy: user.id
      });
      const assignment = await storage.assignUserRole(assignmentData);

      // Create audit log
      await storage.createAuditLog({
        userId: user.id,
        action: "role_assigned",
        entityType: "user_role_assignment",
        entityId: assignment.id,
        changes: { targetUserId: req.params.userId, roleId: req.body.roleId },
        department: user.department,
        designation: user.designation
      });

      res.status(201).json(assignment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error assigning role:", error);
      res.status(500).json({ message: "Failed to assign role" });
    }
  });

  app.delete("/api/users/:userId/roles/:roleId", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !["master_admin", "admin"].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const success = await storage.revokeUserRole(req.params.userId, req.params.roleId);
      if (!success) {
        return res.status(404).json({ message: "Role assignment not found" });
      }

      // Create audit log
      await storage.createAuditLog({
        userId: user.id,
        action: "role_revoked",
        entityType: "user_role_assignment",
        entityId: `${req.params.userId}_${req.params.roleId}`,
        changes: { targetUserId: req.params.userId, roleId: req.params.roleId },
        department: user.department,
        designation: user.designation
      });

      res.json({ message: "Role revoked successfully" });
    } catch (error) {
      console.error("Error revoking role:", error);
      res.status(500).json({ message: "Failed to revoke role" });
    }
  });

  // Permission Override Routes
  app.get("/api/users/:userId/permission-overrides", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || (!["master_admin", "admin"].includes(user.role) && user.id !== req.params.userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const overrides = await storage.getUserPermissionOverrides(req.params.userId);
      res.json(overrides);
    } catch (error) {
      console.error("Error fetching permission overrides:", error);
      res.status(500).json({ message: "Failed to fetch permission overrides" });
    }
  });

  app.post("/api/users/:userId/permission-overrides", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - Master Admin only" });
      }
      const overrideData = insertPermissionOverrideSchema.parse({
        ...req.body,
        userId: req.params.userId,
        grantedBy: user.id
      });
      const override = await storage.createPermissionOverride(overrideData);

      // Create audit log
      await storage.createAuditLog({
        userId: user.id,
        action: "permission_override_created",
        entityType: "permission_override",
        entityId: override.id,
        changes: {
          targetUserId: req.params.userId,
          permission: req.body.permission,
          granted: req.body.granted
        },
        department: user.department,
        designation: user.designation
      });

      res.status(201).json(override);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error creating permission override:", error);
      res.status(500).json({ message: "Failed to create permission override" });
    }
  });

  app.delete("/api/permission-overrides/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - Master Admin only" });
      }
      const success = await storage.revokePermissionOverride(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Permission override not found" });
      }

      // Create audit log
      await storage.createAuditLog({
        userId: user.id,
        action: "permission_override_revoked",
        entityType: "permission_override",
        entityId: req.params.id,
        department: user.department,
        designation: user.designation
      });

      res.json({ message: "Permission override revoked successfully" });
    } catch (error) {
      console.error("Error revoking permission override:", error);
      res.status(500).json({ message: "Failed to revoke permission override" });
    }
  });

  // Enhanced Permission Checking Routes
  app.get("/api/users/:userId/effective-permissions", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || (!["master_admin", "admin"].includes(user.role) && user.id !== req.params.userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const permissions = await storage.getEffectiveUserPermissions(req.params.userId);
      const approvalLimits = await storage.getEffectiveUserApprovalLimits(req.params.userId);
      res.json({ permissions, approvalLimits });
    } catch (error) {
      console.error("Error fetching effective permissions:", error);
      res.status(500).json({ message: "Failed to fetch effective permissions" });
    }
  });

  app.post("/api/users/:userId/check-permission", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || (!["master_admin", "admin"].includes(user.role) && user.id !== req.params.userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { permission } = req.body;
      if (!permission) {
        return res.status(400).json({ message: "Permission parameter required" });
      }
      const hasPermission = await storage.checkEffectiveUserPermission(req.params.userId, permission);
      res.json({ hasPermission, permission });
    } catch (error) {
      console.error("Error checking permission:", error);
      res.status(500).json({ message: "Failed to check permission" });
    }
  });

  // Audit Log Routes
  app.get("/api/audit-logs", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !["master_admin", "admin"].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const filters: any = {};
      if (req.query.userId) filters.userId = req.query.userId as string;
      if (req.query.entityType) filters.entityType = req.query.entityType as string;
      if (req.query.startDate) filters.startDate = new Date(req.query.startDate as string);
      if (req.query.endDate) filters.endDate = new Date(req.query.endDate as string);

      const logs = await storage.getAuditLogs(filters);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  // Firebase Admin SDK Health Check Endpoint
  app.get("/api/firebase/health-check", async (req, res) => {
    try {
      console.log('\n=== Firebase Admin SDK Health Check Started ===');

      // Run comprehensive Firebase tests
      const healthResults = await testFirebaseAdminSDK();
      const userManagementResults = await testUserManagement();

      const response = {
        timestamp: new Date().toISOString(),
        firebase_admin_sdk: {
          auth: healthResults.auth,
          firestore: healthResults.firestore,
          storage: healthResults.storage,
          overall: healthResults.overall
        },
        user_management: {
          tested: true,
          working: true
        },
        environment_check: {
          project_id: process.env.FIREBASE_PROJECT_ID ? 'Present' : 'Missing',
          client_email: process.env.FIREBASE_CLIENT_EMAIL ? 'Present' : 'Missing',
          private_key: process.env.FIREBASE_PRIVATE_KEY ? 'Present' : 'Missing',
          storage_bucket: process.env.FIREBASE_STORAGE_BUCKET ? 'Present' : 'Missing'
        }
      };

      console.log('=== Firebase Admin SDK Health Check Complete ===\n');

      if (healthResults.overall) {
        res.json({ status: 'healthy', details: response });
      } else {
        res.status(500).json({ status: 'unhealthy', details: response });
      }

    } catch (error: any) {
      console.error('Firebase Health Check Error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Firebase User List Endpoint (for admin testing)
  app.get("/api/firebase/list-users", async (req, res) => {
    try {
      const listResult = await auth.listUsers(100); // Get up to 100 users

      const users = listResult.users.map(user => ({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        emailVerified: user.emailVerified,
        disabled: user.disabled,
        customClaims: user.customClaims || {},
        creationTime: user.metadata.creationTime,
        lastSignInTime: user.metadata.lastSignInTime
      }));

      res.json(users);
    } catch (error: any) {
      console.error('Error listing Firebase users:', error);
      res.status(500).json({
        error: 'Failed to list users',
        message: error.message
      });
    }
  });

  // ===============================================
  // ENTERPRISE PAYROLL MANAGEMENT API ENDPOINTS
  // ===============================================

  // Get payroll records with comprehensive filtering
  app.get("/api/payroll", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - Master Admin only" });
      }

      const { month, year, department, status } = req.query;
      const filters: any = {};

      if (month) filters.month = parseInt(month as string);
      if (year) filters.year = parseInt(year as string);
      if (department && department !== "all") filters.department = department;
      if (status && status !== "all") filters.status = status;

      const payrollRecords = await storage.listPayrolls(filters);
      res.json(payrollRecords);
    } catch (error) {
      console.error("Error fetching payroll records:", error);
      res.status(500).json({ message: "Failed to fetch payroll records" });
    }
  });

  // Process payroll for specified period
  app.post("/api/payroll/process", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - Master Admin only" });
      }

      const { month, year, userIds } = req.body;

      // Security Check: Verify payroll period is not locked
      if (await PayrollLockService.isPeriodLocked(new Date(year, month - 1, 1))) {
        return res.status(403).json({ message: "Cannot process payroll for a locked period" });
      }

      // Process payroll for all users or specific users
      const usersToProcess = userIds || (await storage.listUsers()).map(u => u.id);
      const processedPayrolls = [];

      for (const userId of usersToProcess) {
        try {
          const payrollData = await storage.calculatePayroll(userId, month, year);
          const payroll = await storage.createPayroll({
            ...payrollData,
            processedBy: user.id
          });
          processedPayrolls.push(payroll);
        } catch (error) {
          console.error(`Error processing payroll for user ${userId}:`, error);
        }
      }

      // Create audit log
      await storage.createAuditLog({
        userId: user.id,
        action: "payroll_processed",
        entityType: "payroll",
        entityId: `${month}-${year}`,
        changes: { month, year, processedCount: processedPayrolls.length },
        department: user.department,
        designation: user.designation
      });

      res.json({
        message: "Payroll processed successfully",
        processedCount: processedPayrolls.length,
        payrolls: processedPayrolls
      });
    } catch (error) {
      console.error("Error processing payroll:", error);
      res.status(500).json({ message: "Failed to process payroll" });
    }
  });

  // Get payroll statistics
  app.get("/api/payroll/stats", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - Master Admin only" });
      }

      const { month, year } = req.query;
      const payrolls = await storage.listPayrolls({
        month: parseInt(month as string),
        year: parseInt(year as string)
      });

      const stats = {
        totalEmployees: payrolls.length,
        totalGrossSalary: payrolls.reduce((sum, p) => sum + p.grossSalary, 0),
        totalDeductions: payrolls.reduce((sum, p) => sum + p.totalDeductions, 0),
        totalNetSalary: payrolls.reduce((sum, p) => sum + p.netSalary, 0),
        departmentBreakdown: payrolls.reduce((acc, p) => {
          const dept = p.userDepartment || 'unknown';
          acc[dept] = (acc[dept] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      };

      res.json(stats);
    } catch (error) {
      console.error("Error fetching payroll statistics:", error);
      res.status(500).json({ message: "Failed to fetch payroll statistics" });
    }
  });

  // Salary Structure Management
  app.get("/api/salary-structures", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - Master Admin only" });
      }

      const salaryStructures = await storage.listSalaryStructures();
      res.json(salaryStructures);
    } catch (error) {
      console.error("Error fetching salary structures:", error);
      res.status(500).json({ message: "Failed to fetch salary structures" });
    }
  });

  app.post("/api/salary-structures", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - Master Admin only" });
      }

      const salaryData = {
        ...req.body,
        createdBy: user.id,
        isActive: true,
        effectiveFrom: new Date(req.body.effectiveFrom || new Date())
      };

      const salaryStructure = await storage.createSalaryStructure(salaryData);

      await storage.createAuditLog({
        userId: user.id,
        action: "salary_structure_created",
        entityType: "salary_structure",
        entityId: salaryStructure.id,
        changes: salaryData,
        department: user.department,
        designation: user.designation
      });

      res.status(201).json(salaryStructure);
    } catch (error) {
      console.error("Error creating salary structure:", error);
      res.status(500).json({ message: "Failed to create salary structure" });
    }
  });

  // Payroll Settings Management
  app.get("/api/payroll-settings", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - Master Admin only" });
      }

      const settings = await storage.getPayrollSettings();
      res.json(settings || {
        pfRate: 12,
        esiRate: 1.75,
        tdsRate: 10,
        // Note: OT rate in CompanySettings.defaultOTRate
        standardWorkingHours: 8,
        standardWorkingDays: 26,
        leaveDeductionRate: 1,
        pfApplicableFromSalary: 15000,
        esiApplicableFromSalary: 21000,
        companyName: "Godiva Solar"

      });
    } catch (error) {
      console.error("Error fetching payroll settings:", error);
      res.status(500).json({ message: "Failed to fetch payroll settings" });
    }
  });

  // ===============================================
  // ENTERPRISE ATTENDANCE MANAGEMENT API ENDPOINTS
  // ===============================================

  // Live attendance tracking
  app.get("/api/attendance/live", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - Master Admin only" });
      }

      const today = new Date();
      const todayString = today.toISOString().split('T')[0];

      const attendance = await storage.listAttendance({ startDate: todayString, endDate: todayString });

      // Filter for active/live records (checked in but not checked out)
      const liveAttendance = attendance.filter(record =>
        record.checkInTime && !record.checkOutTime && record.status !== 'absent'
      );

      res.json(liveAttendance);
    } catch (error) {
      console.error("Error fetching live attendance:", error);
      res.status(500).json({ message: "Failed to fetch live attendance" });
    }
  });



  // Attendance policies management
  app.get("/api/attendance/policies", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - Master Admin only" });
      }

      const policies = await storage.listAttendancePolicies();
      res.json(policies);
    } catch (error) {
      console.error("Error fetching attendance policies:", error);
      res.status(500).json({ message: "Failed to fetch attendance policies" });
    }
  });

  // Add server-side today endpoint to fix timezone issues
  app.get("/api/attendance/today", verifyAuth, async (req, res) => {
    try {
      const { userId } = req.query;
      if (!userId) {
        return res.status(400).json({ message: "User ID required" });
      }

      // **CRITICAL: Disable browser caching to ensure fresh attendance data**
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      // Use server timezone for consistent date handling
      const serverDate = new Date();
      const dateString = serverDate.toISOString().split('T')[0];

      console.log('API /api/attendance/today - Query params:', { userId, serverDate, dateString });

      // Get today's attendance using the correct method
      const todayAttendance = await storage.getUserAttendanceForDate(userId as string, dateString);

      console.log('API /api/attendance/today - Result:', {
        found: !!todayAttendance,
        attendanceId: todayAttendance?.id,
        attendanceDate: todayAttendance?.date,
        checkInTime: todayAttendance?.checkInTime
      });

      res.json(todayAttendance || null);
    } catch (error) {
      console.error("Error fetching today's attendance:", error);
      res.status(500).json({ message: "Failed to fetch today's attendance" });
    }
  });

  // Smart incomplete records endpoint - department timing aware
  app.get("/api/attendance/incomplete", verifyAuth, async (req, res) => {
    try {
      // Check admin access
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || (user.role !== "master_admin" && user.role !== "admin")) {
        return res.status(403).json({ message: "Access denied" });
      }

      console.log('INCOMPLETE DETECTION: Fetching records with department timing awareness');

      // Get ALL attendance records without checkout
      const allRecordsResponse = await storage.listAttendance();
      const recordsWithoutCheckout = allRecordsResponse.filter((record: any) =>
        record.checkInTime && !record.checkOutTime
      );

      console.log(`INCOMPLETE DETECTION: Found ${recordsWithoutCheckout.length} records without checkout`);

      // ✅ OPTIMIZATION: Fetch all department timings ONCE (avoid N+1 queries)
      const { EnterpriseTimeService } = await import('./services/enterprise-time-service');
      const allTimings = await EnterpriseTimeService.getAllDepartmentTimings();
      const timingMap = new Map(
        allTimings.map((t: any) => [t.departmentId || t.id, t])
      );

      console.log(`INCOMPLETE DETECTION: Loaded ${allTimings.length} department timings`);

      // Filter based on department timing with grace period
      const trulyIncomplete = [];

      for (const record of recordsWithoutCheckout) {
        // O(1) lookup from in-memory map - no database hit
        const timing = timingMap.get(record.userDepartment);

        if (!timing) {
          // No timing config found - include by default to be safe
          console.log(`INCOMPLETE DETECTION: No timing for dept ${record.userDepartment}, including record ${record.id}`);
          trulyIncomplete.push(record);
          continue;
        }

        const isOverdue = record.checkInTime ? isCheckoutOverdue(
          new Date(record.checkInTime),
          timing.checkOutTime,
          30
        ) : false;

        if (isOverdue) {
          trulyIncomplete.push(record);
        }
      }

      console.log(`INCOMPLETE DETECTION: ${trulyIncomplete.length} truly incomplete (${recordsWithoutCheckout.length - trulyIncomplete.length} still within work hours)`);

      res.json(trulyIncomplete);
    } catch (error) {
      console.error("Error fetching incomplete records:", error);
      res.status(500).json({ message: "Failed to fetch incomplete records" });
    }
  });



  // Enhanced Check-in with geolocation and field work support
  app.post("/api/attendance/check-in", createRateLimitMiddleware(attendanceRateLimiter), verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const {
        latitude,
        longitude,
        attendanceType = "office",
        customerName,
        reason,
        imageUrl,
        isWithinOfficeRadius = false,
        distanceFromOffice
      } = req.body;

      const userId = req.authenticatedUser.user.uid;

      // Enhanced validation with coordinate range checks
      if (!latitude || !longitude) {
        return res.status(400).json({ message: "Location coordinates are required" });
      }

      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);

      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({ message: "Invalid coordinate values. Latitude must be between -90 and 90, longitude between -180 and 180" });
      }

      // Use server timezone for consistent date handling to prevent timezone mismatches
      const serverDate = new Date();
      const dateString = serverDate.toISOString().split('T')[0];

      // Check for existing attendance with proper date range to handle timezone issues
      const existingAttendance = await storage.listAttendance({
        userId,
        date: {
          start: new Date(dateString + 'T00:00:00.000Z'),
          end: new Date(dateString + 'T23:59:59.999Z')
        }
      });

      if (existingAttendance && existingAttendance.length > 0 && existingAttendance[0].checkInTime) {
        return res.status(400).json({
          message: "You have already checked in today",
          attendance: existingAttendance[0]
        });
      }

      // Get office locations for validation
      const officeLocations = await storage.listOfficeLocations();
      const primaryOffice = officeLocations[0] || {
        latitude: 9.966844592415782,
        longitude: 78.1338405791111,
        radius: 100
      };

      // Calculate distance from office
      const distance = calculateDistance(
        parseFloat(latitude),
        parseFloat(longitude),
        parseFloat(primaryOffice.latitude.toString()),
        parseFloat(primaryOffice.longitude.toString())
      );

      const isWithinRadius = distance <= (primaryOffice.radius || 100);

      // Validate attendance type and requirements
      if (attendanceType === "office" && !isWithinRadius) {
        return res.status(400).json({
          message: `You are ${Math.round(distance)}m away from office. Please select 'Remote' or 'Field Work' and provide a reason.`,
          distance: Math.round(distance),
          allowedRadius: primaryOffice.radius || 100,
          requiresReasonSelection: true
        });
      }

      if (attendanceType === "remote" && !reason) {
        return res.status(400).json({ message: "Please provide a reason for remote work" });
      }

      if (attendanceType === "field_work") {
        if (!customerName) {
          return res.status(400).json({ message: "Customer name is required for field work" });
        }
        if (!imageUrl) {
          return res.status(400).json({ message: "Photo is mandatory for field work attendance" });
        }
      }

      const checkInData = {
        userId,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        attendanceType,
        customerName: attendanceType === "field_work" ? customerName : undefined,
        reason: attendanceType !== "office" ? reason : undefined,
        imageUrl: attendanceType === "field_work" ? imageUrl : undefined,
        isWithinOfficeRadius: isWithinRadius,
        distanceFromOffice: Math.round(distance)
      };

      // Create attendance record with all required fields
      const attendanceRecord = await storage.createAttendance({
        ...checkInData,
        status: "present",
        isLate: false,
        checkInTime: new Date(),
        date: new Date(),
        checkInLatitude: checkInData.latitude,
        checkInLongitude: checkInData.longitude,
        checkInImageUrl: checkInData.imageUrl
      });

      // Create audit log
      await storage.createAuditLog({
        userId: req.authenticatedUser.user.uid,
        action: "attendance_check_in",
        entityType: "attendance",
        entityId: attendanceRecord.id,
        changes: {
          attendanceType: checkInData.attendanceType,
          location: `${checkInData.latitude},${checkInData.longitude}`,
          distance: Math.round(distance),
          withinOfficeRadius: isWithinRadius
        },
        department: req.authenticatedUser.user.department,
        designation: req.authenticatedUser.user.designation
      });

      res.status(201).json({
        message: "Check-in successful",
        attendance: attendanceRecord,
        location: {
          distance: Math.round(distance),
          withinRadius: isWithinRadius,
          attendanceType: checkInData.attendanceType
        }
      });
    } catch (error) {
      console.error("Error during check-in:", error);
      res.status(500).json({ message: "Failed to record check-in" });
    }
  });



  // Department timing management (legacy route - kept for backward compatibility)
  // NOTE: This route duplicates the one at line ~1917, Express will match the first one
  app.get("/api/departments/:departmentId/timing", verifyAuth, async (req, res) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Check permission
      const hasPermission = req.authenticatedUser.user.role === "master_admin" ||
        req.authenticatedUser.permissions.includes("departments.view");

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Use EnterpriseTimeService for consistent defaults
      const { EnterpriseTimeService } = await import("./services/enterprise-time-service");
      const timing = await EnterpriseTimeService.getDepartmentTiming(req.params.departmentId);
      res.json(timing);
    } catch (error) {
      console.error("Error fetching department timing:", error);
      res.status(500).json({ message: "Failed to fetch department timing" });
    }
  });

  // REMOVED: Legacy duplicate route - was shadowing the correct route at line 6113
  // This route used storage.createDepartmentTiming instead of EnterpriseTimeService.updateDepartmentTimings
  // and read department from req.body instead of URL params, causing data loss
  // The correct implementation is at /api/departments/:department/timing (line 6113+)

  // Bulk attendance actions
  app.post("/api/attendance/bulk-action", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - Master Admin only" });
      }

      const { action, attendanceIds, data } = req.body;
      const results = [];

      for (const attendanceId of attendanceIds) {
        try {
          if (action === 'approve') {
            const updated = await storage.updateAttendance(attendanceId, {
              ...data,
              approvedBy: user.id
            });
            results.push(updated);
          } else if (action === 'update') {
            const updated = await storage.updateAttendance(attendanceId, data);
            results.push(updated);
          }
        } catch (error) {
          console.error(`Error performing ${action} on attendance ${attendanceId}:`, error);
        }
      }

      await storage.createAuditLog({
        userId: user.id,
        action: `attendance_bulk_${action}`,
        entityType: "attendance",
        entityId: attendanceIds.join(','),
        changes: { action, count: results.length },
        department: user.department,
        designation: user.designation
      });

      res.json({ message: `Bulk ${action} completed`, results });
    } catch (error) {
      console.error("Error performing bulk action:", error);
      res.status(500).json({ message: "Failed to perform bulk action" });
    }
  });

  // Enterprise System Health Monitoring API
  app.get("/api/system/health", verifyAuth, async (req, res) => {
    try {
      const { user } = req.authenticatedUser;

      // Only admin/master_admin can view system health
      if (user.role !== "master_admin" && user.role !== "admin") {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      const systemHealth = EnterprisePerformanceMonitor.getSystemHealth();
      const performanceMetrics = EnterprisePerformanceMonitor.getPerformanceMetrics();

      res.json({
        enterprise: {
          version: "microsoft-grade-v1.0",
          monitoring: "active",
          timestamp: new Date().toISOString()
        },
        system: systemHealth,
        performance: performanceMetrics,
        uptime: process.uptime(),
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          external: Math.round(process.memoryUsage().external / 1024 / 1024)
        }
      });
    } catch (error) {
      console.error("System health check error:", error);
      res.status(500).json({
        message: "Failed to retrieve system health",
        error: {
          type: "monitoring_service_error",
          timestamp: new Date().toISOString()
        }
      });
    }
  });

  // Enterprise Attendance Analytics API
  app.get("/api/attendance/analytics", verifyAuth, async (req, res) => {
    try {
      const { user } = req.authenticatedUser;
      const { userId, startDate, endDate } = req.query;

      // Only admin/master_admin can view full analytics
      if (user.role !== "master_admin" && user.role !== "admin") {
        return res.status(403).json({ message: "Access denied - Admin privileges required" });
      }

      const dateRange = startDate && endDate ? {
        start: new Date(startDate as string),
        end: new Date(endDate as string)
      } : undefined;

      const metrics = await UnifiedAttendanceService.generateAttendanceMetrics(
        userId as string,
        dateRange
      );

      res.json({
        enterprise: {
          version: "microsoft-grade-v1.0",
          analytics: "comprehensive",
          timestamp: new Date().toISOString()
        },
        metrics,
        period: dateRange ? {
          start: dateRange.start.toISOString(),
          end: dateRange.end.toISOString()
        } : "all-time"
      });
    } catch (error) {
      console.error("Enterprise analytics error:", error);
      res.status(500).json({
        message: "Failed to generate attendance analytics",
        error: {
          type: "analytics_service_error",
          timestamp: new Date().toISOString()
        }
      });
    }
  });

  // ===================== Department Timing Routes with Enterprise Time Service =====================

  // Get all department timings with cache refresh option
  app.get("/api/departments/timings", verifyAuth, async (req, res) => {
    try {
      // CRITICAL: Disable HTTP caching to ensure fresh data
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      const { user } = req.authenticatedUser;
      const { refresh } = req.query;

      // Only master_admin can view all department timings
      if (user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      const { EnterpriseTimeService } = await import("./services/enterprise-time-service");

      // Clear cache if refresh requested
      if (refresh === 'true') {
        EnterpriseTimeService.invalidateTimingCache();
      }

      const timings = await EnterpriseTimeService.getAllDepartmentTimings();

      // CRITICAL FIX: Use normalized lowercase department names as keys
      // Frontend lookup uses lowercase keys, so we must ensure consistency
      const timingsObject = timings.reduce((acc, timing) => {
        const normalizedKey = timing.department.toLowerCase();
        acc[normalizedKey] = timing;
        return acc;
      }, {} as Record<string, any>);

      res.json(timingsObject);
    } catch (error) {
      console.error("Error fetching department timings:", error);
      res.status(500).json({ message: "Failed to fetch department timings" });
    }
  });

  // Get specific department timing with ultra-fast caching
  app.get("/api/departments/:department/timing", verifyAuth, async (req, res) => {
    try {
      const { department } = req.params;
      const { user } = req.authenticatedUser;

      // 🔥 CRITICAL: Disable caching to ensure enriched data (isHoliday, isWeekend) always reaches frontend
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');

      console.log(`BACKEND: Fast-fetching timing for department ${department}`);

      // Users can view their own department timing or master_admin can view all
      if (user.role !== "master_admin" && user.department !== department) {
        return res.status(403).json({ message: "Access denied" });
      }

      console.log('🚨🚨🚨 [TIMING-ROUTE] ROUTE HIT! Department:', department, 'Day of week:', new Date().getDay());

      const { AttendanceCacheService } = await import("./services/attendance-cache-service");

      const timing = await AttendanceCacheService.getDepartmentTiming(department, async () => {
        const { EnterpriseTimeService } = await import("./services/enterprise-time-service");
        return await EnterpriseTimeService.getDepartmentTiming(department);
      });

      // 🛡️ ENRICHMENT: Add holiday and weekend metadata for the frontend
      console.log('[TIMING-API] 🔍 Starting enrichment for department:', department);
      const { UnifiedAttendanceService } = await import("./services/unified-attendance-service");
      const { CompanySettingsService } = await import("./services/company-settings-service");

      const now = new Date();
      const { isHoliday, holiday } = await UnifiedAttendanceService.isHoliday(now, department);
      const isWeekend = await CompanySettingsService.isWeekend(now);

      console.log('[TIMING-API] 📅 Enrichment results:', {
        isHoliday,
        holidayName: holiday?.name,
        isWeekend,
        dayOfWeek: now.getDay()
      });

      const enrichedResponse = {
        ...timing,
        isHoliday,
        holidayName: holiday?.name || null,
        isWeekend
      };

      console.log('[TIMING-API] 📤 Sending response:', enrichedResponse);
      res.json(enrichedResponse);
    } catch (error) {
      console.error(`Error fetching timing for department ${req.params.department}:`, error);
      res.status(500).json({ message: "Failed to fetch department timing" });
    }
  });

  // Update specific department timing (POST)
  app.post("/api/departments/:department/timing", verifyAuth, async (req, res) => {
    try {
      const { department } = req.params;
      const user = await storage.getUser(req.authenticatedUser?.uid || "");

      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - Master Admin only" });
      }

      console.log(`BACKEND: Updating timing for department ${department}`);
      console.log('BACKEND: Full timing data received:', req.body);

      const { EnterpriseTimeService } = await import("./services/enterprise-time-service");

      // Filter out undefined values before updating
      const cleanData = Object.fromEntries(
        Object.entries(req.body).filter(([_, value]) => value !== undefined)
      );

      // Update single department timing
      await EnterpriseTimeService.updateDepartmentTimings([{
        department,
        ...cleanData
      }]);

      // Clear cache for this specific department and all cache
      console.log(`BACKEND: Clearing cache for department ${department}`);
      EnterpriseTimeService.clearDepartmentCache(department);
      EnterpriseTimeService.invalidateTimingCache();

      // Clear performance optimizer cache
      const { AttendanceCacheService } = await import("./services/attendance-cache-service");
      AttendanceCacheService.invalidateDepartmentCache(department);
      AttendanceCacheService.invalidateAttendanceCache();

      // Get fresh data from database (not cache)
      const updatedTiming = await EnterpriseTimeService.getDepartmentTiming(department);

      console.log(`BACKEND: Updated timing for ${department}:`, updatedTiming);

      res.json({
        success: true,
        department,
        timing: updatedTiming,
        message: `Department timing updated successfully for ${department}`
      });
    } catch (error) {
      console.error(`Error updating timing for department ${req.params.department}:`, error);
      res.status(500).json({ message: "Failed to update department timing" });
    }
  });

  // Update specific department timing (PUT)
  app.put("/api/departments/:department/timing", verifyAuth, async (req, res) => {
    try {
      const { department } = req.params;
      const user = await storage.getUser(req.authenticatedUser?.uid || "");

      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - Master Admin only" });
      }

      console.log(`BACKEND: PUT updating timing for department ${department}`);

      const { EnterpriseTimeService } = await import("./services/enterprise-time-service");

      // Filter out undefined values before updating
      const cleanData = Object.fromEntries(
        Object.entries(req.body).filter(([_, value]) => value !== undefined)
      );

      // Update single department timing
      await EnterpriseTimeService.updateDepartmentTimings([{
        department,
        ...cleanData
      }]);

      // Clear cache for this specific department and all cache
      console.log(`BACKEND: PUT clearing cache for department ${department}`);
      EnterpriseTimeService.clearDepartmentCache(department);
      EnterpriseTimeService.invalidateTimingCache();

      // Get fresh data from database
      const updatedTiming = await EnterpriseTimeService.getDepartmentTiming(department);

      console.log(`BACKEND: PUT updated timing for ${department}:`, updatedTiming);

      res.json({
        success: true,
        department,
        timing: updatedTiming,
        message: `Department timing updated successfully for ${department}`
      });
    } catch (error) {
      console.error(`Error updating timing for department ${req.params.department}:`, error);
      res.status(500).json({ message: "Failed to update department timing" });
    }
  });

  // Bulk update department timings
  app.post("/api/departments/timings/bulk", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");

      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - Master Admin only" });
      }

      const { timings } = req.body;
      const { EnterpriseTimeService } = await import("./services/enterprise-time-service");

      await EnterpriseTimeService.updateDepartmentTimings(timings);

      res.json({
        message: `Successfully updated timings for ${timings.length} departments`,
        updatedCount: timings.length
      });
    } catch (error) {
      console.error("Error bulk updating department timings:", error);
      res.status(500).json({ message: "Failed to bulk update department timings" });
    }
  });

  // Check if current time is business hours for department
  app.get("/api/departments/:department/business-hours", verifyAuth, async (req, res) => {
    try {
      const { department } = req.params;
      const { EnterpriseTimeService } = await import("./services/enterprise-time-service");

      const isBusinessHours = await EnterpriseTimeService.isBusinessHours(department);
      const nextBusinessDay = await EnterpriseTimeService.getNextBusinessDay(department);

      res.json({
        department,
        isBusinessHours,
        nextBusinessDay: nextBusinessDay.toISOString(),
        currentTime: new Date().toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        })
      });
    } catch (error) {
      console.error(`Error checking business hours for department ${req.params.department}:`, error);
      res.status(500).json({ message: "Failed to check business hours" });
    }
  });

  // Performance analytics endpoint
  app.get("/api/performance/stats", verifyAuth, async (req, res) => {
    try {
      const { user } = req.authenticatedUser;

      if (user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - Master Admin only" });
      }

      const { AttendanceCacheService } = await import("./services/attendance-cache-service");
      const stats = AttendanceCacheService.getCacheStats();

      res.json({
        ...stats,
        timestamp: new Date().toISOString(),
        message: "Performance analytics retrieved successfully"
      });
    } catch (error) {
      console.error("Error getting performance stats:", error);
      res.status(500).json({ message: "Failed to get performance stats" });
    }
  });

  // Enhanced cache refresh endpoint
  app.post("/api/departments/timings/refresh-cache", verifyAuth, async (req, res) => {
    try {
      const { user } = req.authenticatedUser;

      if (user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - Master Admin only" });
      }

      console.log('BACKEND: Manual cache refresh requested by master admin');

      const { EnterpriseTimeService } = await import("./services/enterprise-time-service");
      const { AttendanceCacheService } = await import("./services/attendance-cache-service");

      // Clear all caches
      EnterpriseTimeService.invalidateTimingCache();
      AttendanceCacheService.invalidateAttendanceCache();

      // Get fresh data for all departments
      const timings = await EnterpriseTimeService.getAllDepartmentTimings();

      console.log('BACKEND: All caches refreshed, retrieved timings for departments:',
        timings.map(t => t.department));

      res.json({
        success: true,
        message: "All caches refreshed successfully",
        refreshedDepartments: timings.map(t => t.department),
        performanceStats: AttendanceCacheService.getCacheStats(),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error refreshing caches:", error);
      res.status(500).json({ message: "Failed to refresh caches" });
    }
  });

  // ===================== Enhanced Payroll Management API Routes =====================

  // Payroll Field Configuration Routes
  // Enhanced Salary Structure Routes
  app.get("/api/enhanced-salary-structures", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - Master Admin only" });
      }

      const structures = await storage.listEnhancedSalaryStructures();
      res.json(structures);
    } catch (error) {
      console.error("Error fetching salary structures:", error);
      res.status(500).json({ message: "Failed to fetch salary structures" });
    }
  });

  app.post("/api/enhanced-salary-structures", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - Master Admin only" });
      }

      const structureData = {
        ...req.body,
        isActive: true
      };

      const newStructure = await storage.createEnhancedSalaryStructure(structureData);
      res.status(201).json(newStructure);
    } catch (error) {
      console.error("Error creating salary structure:", error);
      res.status(500).json({ message: "Failed to create salary structure" });
    }
  });

  // Enhanced Payroll Routes
  app.get("/api/enhanced-payrolls", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - Master Admin only" });
      }

      const { month, year, department, status } = req.query;

      const filters: any = {};
      if (month) filters.month = parseInt(month as string);
      if (year) filters.year = parseInt(year as string);
      if (department && department !== 'all') filters.department = department as string;
      if (status) filters.status = status as string;

      const payrolls = await storage.listEnhancedPayrolls(filters);
      res.json(payrolls);
    } catch (error) {
      console.error("Error fetching payrolls:", error);
      res.status(500).json({ message: "Failed to fetch payroll data" });
    }
  });

  // Update enhanced payroll record
  app.put("/api/enhanced-payrolls/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || (user.role !== "master_admin" && user.role !== "admin")) {
        return res.status(403).json({ message: "Access denied - Admin or Master Admin only" });
      }

      const { id } = req.params;
      const updateData = req.body;

      // Remove id from update data if present
      delete updateData.id;

      // Add metadata
      updateData.updatedAt = new Date();
      updateData.updatedBy = user.id;

      const updatedPayroll = await storage.updateEnhancedPayroll(id, updateData);

      // Create audit log
      await storage.createAuditLog({
        userId: user.id,
        action: "payroll_updated",
        entityType: "enhanced_payroll",
        entityId: id,
        changes: updateData,
        department: user.department,
        designation: user.designation
      });

      res.json(updatedPayroll);
    } catch (error) {
      console.error("Error updating enhanced payroll:", error);
      res.status(500).json({ message: "Failed to update enhanced payroll" });
    }
  });

  app.post("/api/enhanced-payrolls/bulk-process", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - Master Admin only" });
      }

      const { month, year, userIds } = req.body;
      console.log("PAYROLL_BULK: Starting bulk process:", { month, year, userIds: userIds?.length || 'all' });

      // If no userIds provided, get all users with salary structures
      let targetUserIds = userIds;
      if (!targetUserIds || !Array.isArray(targetUserIds)) {
        const allSalaryStructures = await storage.listEnhancedSalaryStructures();
        targetUserIds = allSalaryStructures.map(s => s.userId);
        console.log(`PAYROLL_BULK: Processing all users: ${targetUserIds.length}`);
      }

      // P1.3: Check for pending review records in this period
      const pendingRecords = await storage.listAttendanceByReviewStatus('pending');
      const periodPending = pendingRecords.filter(r => {
        const recordDate = new Date(r.date);
        return recordDate.getMonth() + 1 === month && recordDate.getFullYear() === year;
      });

      if (periodPending.length > 0 && !req.body.forceProceed) {
        console.log(`PAYROLL_BULK: Blocked due to ${periodPending.length} pending reviews`);
        return res.status(409).json({
          success: false,
          message: `${periodPending.length} attendance record(s) are pending admin review for this period. Review them first or set forceProceed to continue.`,
          pendingCount: periodPending.length,
          pendingRecords: periodPending.map(r => ({
            id: r.id,
            userId: r.userId,
            date: r.date,
            userName: (r as any).userName || 'Unknown'
          })),
          requiresConfirmation: true
        });
      }

      // P2.1: Restrict forceProceed to Master Admin only
      if (req.body.forceProceed) {
        if (user.role !== 'master_admin') {
          console.log(`PAYROLL_BULK: forceProceed blocked for non-master admin: ${user.displayName}`);
          return res.status(403).json({
            success: false,
            message: "Only Master Admin can use forceProceed to bypass pending review checks."
          });
        }
        console.log(`[PAYROLL AUDIT] forceProceed used by ${user.displayName} (${user.id}) for ${month}/${year} - ${periodPending.length} pending days excluded`);
      }

      // Initialize PayrollCalculationService
      const { PayrollCalculationService } = await import('./services/payroll-calculation-service');
      const payrollCalcService = new PayrollCalculationService(storage);

      const processedPayrolls = [];
      const skippedUsers = [];

      // Process payroll for each user
      for (const userId of targetUserIds) {
        try {
          // Check if already processed
          const existingPayroll = await storage.getEnhancedPayrollByUserAndMonth(userId, month, year);
          if (existingPayroll) {
            console.log(`PAYROLL_BULK: Skipping ${userId} - already processed`);
            skippedUsers.push({ userId, reason: 'already_processed' });
            continue;
          }

          // Get user details
          const employee = await storage.getUser(userId);
          if (!employee) {
            console.log(`PAYROLL_BULK: Skipping ${userId} - user not found`);
            skippedUsers.push({ userId, reason: 'user_not_found' });
            continue;
          }

          // Get salary structure
          const salaryStructure = await storage.getEnhancedSalaryStructureByUser(userId);
          if (!salaryStructure) {
            console.log(`PAYROLL_BULK: Skipping ${employee.displayName} - no salary structure`);
            skippedUsers.push({ userId, reason: 'no_salary_structure', name: employee.displayName });
            continue;
          }

          console.log(`PAYROLL_BULK: Processing ${employee.displayName} (${userId})`);

          // Get attendance records with fallback to UID
          let attendanceRecords = await storage.listAttendanceByUser(userId);

          // Fallback: Try with UID if no records found with userId
          if (attendanceRecords.length === 0 && employee.uid !== userId) {
            console.log(`PAYROLL_BULK: Trying UID fallback for ${employee.displayName}`);
            attendanceRecords = await storage.listAttendanceByUser(employee.uid);
          }

          // Filter attendance records for the specified month/year
          const monthAttendance = attendanceRecords.filter(record => {
            const recordDate = new Date(record.date);
            return recordDate.getMonth() + 1 === month && recordDate.getFullYear() === year;
          });

          console.log(`PAYROLL_BULK: ${employee.displayName} - ${monthAttendance.length} attendance records`);

          // CRITICAL: Enrich attendance with holidays and weekly-offs before calculation
          // This ensures employees get paid for Sundays and Holidays
          const { UnifiedAttendanceService } = await import('./services/unified-attendance-service');
          const startDate = new Date(year, month - 1, 1);
          const endDate = new Date(year, month, 0);

          const enrichedAttendance = await UnifiedAttendanceService.enrichAttendanceComprehensively(
            userId,
            startDate,
            endDate,
            monthAttendance
          );

          console.log(`PAYROLL_BULK: ${employee.displayName} - Enriched to ${enrichedAttendance.length} days (added ${enrichedAttendance.length - monthAttendance.length} statutory days)`);

          // Use PayrollCalculationService for comprehensive calculation
          const calculation = await payrollCalcService.calculateComprehensivePayroll(
            userId,
            month,
            year,
            enrichedAttendance,
            salaryStructure,
            employee.department ?? undefined
          );

          // Create payroll record with all calculated values
          const payrollData = {
            userId,
            employeeId: employee.employeeId || employee.uid,
            month,
            year,
            monthDays: calculation.monthDays,
            presentDays: calculation.presentDays,
            paidLeaveDays: calculation.paidLeaveDays,
            overtimeHours: calculation.overtimeHours,
            perDaySalary: calculation.perDaySalary,
            earnedBasic: calculation.earnedBasic,
            earnedHRA: calculation.earnedHRA,
            earnedConveyance: calculation.earnedConveyance,
            overtimePay: calculation.overtimePay,
            betta: 0, // BETTA allowance - can be added later if needed
            dynamicEarnings: calculation.dynamicEarnings,
            grossSalary: calculation.grossSalary,
            finalGross: calculation.grossSalary, // Same as gross unless BETTA is added
            dynamicDeductions: calculation.dynamicDeductions,
            epfDeduction: calculation.epfDeduction,
            esiDeduction: calculation.esiDeduction,
            vptDeduction: calculation.vptDeduction,
            tdsDeduction: 0, // TDS - can be added later if needed
            fineDeduction: 0, // Fine - can be added later if needed
            salaryAdvance: calculation.salaryAdvanceDeduction,
            unpaidLeaveDeduction: calculation.unpaidLeaveDeduction,
            creditAdjustment: 0, // Credit - can be added later if needed
            esiEligible: calculation.esiEligible,
            totalEarnings: calculation.totalEarnings,
            totalDeductions: calculation.totalDeductions,
            netSalary: calculation.netSalary,
            status: 'processed',
            processedBy: user.uid,
            processedAt: new Date(),
            // P2.1: Audit fields for compliance
            generatedWithForceProceed: req.body.forceProceed || false,
            pendingReviewDaysExcluded: req.body.forceProceed ? periodPending.filter(r => r.userId === userId).length : 0,
            payrollNotes: req.body.forceProceed && periodPending.some(r => r.userId === userId)
              ? `Generated with forceProceed flag. ${periodPending.filter(r => r.userId === userId).length} day(s) pending review were excluded from salary calculation.`
              : null
          };

          const newPayroll = await storage.createEnhancedPayroll(payrollData);
          processedPayrolls.push(newPayroll);

          console.log(`PAYROLL_BULK: ✓ Successfully processed ${employee.displayName}`);
        } catch (error) {
          console.error(`PAYROLL_BULK: Error processing user ${userId}:`, error);
          skippedUsers.push({ userId, reason: 'processing_error', error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }

      console.log(`PAYROLL_BULK: Complete - Processed: ${processedPayrolls.length}, Skipped: ${skippedUsers.length}`);

      res.json({
        success: true,
        message: "Payroll processing completed",
        payrolls: processedPayrolls,
        processedCount: processedPayrolls.length,
        skippedCount: skippedUsers.length,
        skippedUsers: skippedUsers
      });
    } catch (error) {
      console.error("PAYROLL_BULK: Fatal error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to process payroll",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Enhanced Payroll Settings Routes
  app.get("/api/enhanced-payroll-settings", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - Master Admin only" });
      }

      const settings = await storage.getEnhancedPayrollSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching payroll settings:", error);
      res.status(500).json({ message: "Failed to fetch payroll settings" });
    }
  });

  app.patch("/api/enhanced-payroll-settings", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied - Master Admin only" });
      }

      const settingsData = {
        ...req.body,
        updatedBy: user.uid
      };

      const updatedSettings = await storage.updateEnhancedPayrollSettings(settingsData);

      // AUDIT LOG: Critical for Forensic Consistency
      await storage.createAuditLog({
        userId: user.uid,
        action: "payroll_settings_updated",
        entityType: "payroll_settings",
        entityId: updatedSettings.id || "global",
        changes: req.body, // Log the changes requested
        department: user.department,
        designation: user.designation
      });

      res.json(updatedSettings);
    } catch (error) {
      console.error("Error updating payroll settings:", error);
      res.status(500).json({ message: "Failed to update payroll settings" });
    }
  });

  // Emergency cache clearing endpoint for timing issues
  app.post("/api/admin/clear-cache", verifyAuth, async (req, res) => {
    try {
      // Clear Enterprise Time Service cache
      const { clearTimingCache } = await import("./services/enterprise-time-service");
      clearTimingCache();

      console.log("Admin cleared timing cache");
      res.json({ message: "Cache cleared successfully" });
    } catch (error) {
      console.error("Error clearing cache:", error);
      res.status(500).json({ message: "Failed to clear cache" });
    }
  });

  // Debug endpoint to list all users and their roles/departments
  app.get("/api/debug/users", verifyAuth, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.authenticatedUser?.uid || "");

      // Only allow master_admin or admin role to access this debug info
      if (!currentUser || (currentUser.role !== 'master_admin' && currentUser.role !== 'admin')) {
        return res.status(403).json({ message: "Access denied. Debug endpoint requires admin access." });
      }

      const users = await storage.listUsers();
      const debugUsers = users.map((user: any) => ({
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        department: user.department,
        designation: user.designation,
        isActive: user.isActive
      }));

      res.json({
        total: users.length,
        users: debugUsers
      });
    } catch (error) {
      console.error("Error fetching debug user info:", error);
      res.status(500).json({ message: "Failed to fetch user info" });
    }
  });

  // ========== SITE VISIT MANAGEMENT API ROUTES ==========

  // Permission helper for site visit access
  const checkSiteVisitPermission = async (user: any, action: string) => {
    // Only Technical, Marketing, and Admin departments can access Site Visit
    const allowedDepartments = ['technical', 'marketing', 'admin', 'administration', 'operations'];

    console.log("=== SITE VISIT PERMISSION DEBUG ===");
    console.log("User role:", user.role);
    console.log("User department:", user.department);
    console.log("Allowed departments:", allowedDepartments);
    console.log("Department check result:", allowedDepartments.includes(user.department?.toLowerCase()));

    if (user.role === 'master_admin') {
      console.log("Access granted: master_admin role");
      return true;
    }

    // Also allow admin role users regardless of department
    if (user.role === 'admin') {
      console.log("Access granted: admin role");
      return true;
    }

    if (!user.department || !allowedDepartments.includes(user.department.toLowerCase())) {
      console.log("Access denied: Department not allowed");
      console.log("=====================================");
      return false;
    }

    console.log("Passed department check, now checking permissions...");

    // Calculate effective permissions dynamically
    const { getEffectivePermissions } = await import("@shared/schema");
    const effectivePermissions = getEffectivePermissions(user.department, user.designation);

    console.log("User effective permissions:", effectivePermissions);

    // Check specific permissions based on action
    const requiredPermissions = {
      'view_own': ['site_visit.view_own', 'site_visit.view'],
      'view_team': ['site_visit.view_team', 'site_visit.view'],
      'view_all': ['site_visit.view_all', 'site_visit.view'],
      'create': ['site_visit.create'],
      'edit': ['site_visit.edit'],
      'delete': ['site_visit.delete']
    };

    console.log("Required permissions for action:", action, "->", requiredPermissions[action]);

    const hasPermission = effectivePermissions?.some((permission: string) =>
      requiredPermissions[action]?.includes(permission)
    ) || false;

    console.log("Final permission result:", hasPermission);
    console.log("=====================================");

    return hasPermission;
  };

  // Create new site visit (Site In)
  app.post("/api/site-visits", verifyAuth, async (req, res) => {
    try {
      console.log("=== SITE VISIT CREATION STARTED ===");
      console.log("User ID:", req.authenticatedUser?.uid);
      console.log("Request body received:", JSON.stringify(req.body, null, 2));

      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      console.log("User retrieved:", user ? `${user.displayName} (${user.department})` : 'null');

      const hasPermission = user ? await checkSiteVisitPermission(user, 'create') : false;
      console.log("Permission check result:", hasPermission);

      if (!user || !hasPermission) {
        console.log("SITE VISIT CREATION DENIED - User or permission missing");
        return res.status(403).json({
          message: "Access denied. Site Visit access is limited to Technical, Marketing, and Admin departments."
        });
      }

      const { insertSiteVisitSchema } = await import("@shared/schema");
      const { siteVisitService } = await import("./services/site-visit-service");

      // SOLUTION: Prevent multiple active site visits
      // Check if user already has an active site visit to prevent "days and days" of open visits
      const activeVisits = await siteVisitService.getActiveSiteVisits();
      const userActiveVisit = activeVisits.find(v => v.userId === user.uid);

      if (userActiveVisit) {
        console.log(`SITE VISIT CREATION BLOCKED - User ${user.displayName} has active visit ${userActiveVisit.id}`);
        return res.status(400).json({
          message: "You already have an active site visit. Please end your current visit before starting a new one.",
          activeVisitId: userActiveVisit.id,
          activeVisitSince: userActiveVisit.siteInTime
        });
      }

      // UNIFIED: Automatically create/find customer using deduplication logic
      let customerId = null;
      if (req.body.customer && req.body.customer.name && req.body.customer.mobile) {
        const customerData = req.body.customer;

        console.log("=== CUSTOMER CREATION ATTEMPT ===");
        console.log("Customer data to create:", JSON.stringify(customerData, null, 2));

        // Use unified customer creation with automatic deduplication
        try {
          // Build customer data object, excluding empty/undefined values
          const customerCreateData: any = {
            name: customerData.name,
            mobile: customerData.mobile,
            // CRITICAL: Mark as created from site visit with basic profile
            createdFrom: "site_visit",
            profileCompleteness: "basic"
          };

          // Only add optional fields if they have actual values
          if (customerData.email && customerData.email.trim() !== "") {
            customerCreateData.email = customerData.email;
          }
          if (customerData.address && customerData.address.trim() !== "") {
            customerCreateData.address = customerData.address;
          }
          if (customerData.ebServiceNumber && customerData.ebServiceNumber.trim() !== "") {
            customerCreateData.ebServiceNumber = customerData.ebServiceNumber;
          }
          if (customerData.propertyType && customerData.propertyType.trim() !== "") {
            customerCreateData.propertyType = customerData.propertyType;
          }
          if (customerData.location && customerData.location.trim() !== "") {
            customerCreateData.location = customerData.location;
          }

          console.log("Clean customer data for Firestore:", JSON.stringify(customerCreateData, null, 2));
          const customer = await storage.createCustomer(customerCreateData);
          customerId = customer.id;
          console.log(`✅ Customer creation SUCCESS: ${customer.mobile} -> ID: ${customerId} (${customer.profileCompleteness} profile, created from ${customer.createdFrom})`);

          // Verify customer was actually created by checking if it exists
          const verifyCustomer = await storage.findCustomerByMobile(customerData.mobile);
          if (verifyCustomer) {
            console.log(`✅ VERIFICATION PASSED: Customer ${customerData.mobile} exists in customers collection with ID: ${verifyCustomer.id}`);
          } else {
            console.error(`❌ VERIFICATION FAILED: Customer ${customerData.mobile} was created but not found in customers collection!`);
          }
        } catch (error) {
          console.error("❌ CUSTOMER CREATION ERROR during site visit:", error);
          console.error("Error details:", {
            message: error.message,
            stack: error.stack,
            customerData: customerData
          });
          // Continue without customer ID if creation fails
        }
        console.log("=== END CUSTOMER CREATION ===");
      } else {
        console.log("❌ No customer data provided or missing required fields (name/mobile)");
      }

      // Map user department to site visit schema department
      const departmentMapping: Record<string, string> = {
        'admin': 'admin',
        'administration': 'admin',
        'operations': 'admin', // Operations users are often admin users
        'technical': 'technical',
        'marketing': 'marketing',
        'sales': 'marketing', // Sales users work closely with marketing for site visits
        'hr': 'admin', // HR users are admin for site visits
        'housekeeping': 'admin' // Housekeeping users are admin for site visits
      };

      const mappedDepartment = departmentMapping[user.department.toLowerCase()] || 'admin';

      // Prepare and validate input data
      const requestData = {
        ...req.body,
        userId: user.uid,
        department: mappedDepartment,
        customerId: customerId, // Add the customer ID for reference
        siteInTime: req.body.siteInTime ? new Date(req.body.siteInTime) : new Date(),
        siteOutTime: req.body.siteOutTime ? new Date(req.body.siteOutTime) : undefined,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Debug: Log the data being validated
      console.log("=== SITE VISIT VALIDATION DEBUG ===");
      console.log("Request body:", JSON.stringify(req.body, null, 2));
      console.log("Request data after processing:", JSON.stringify(requestData, null, 2));
      console.log("User department:", user.department);
      console.log("Schema department enum:", ["technical", "marketing", "admin"]);
      console.log("=====================================");

      const siteVisitData = insertSiteVisitSchema.parse(requestData);
      console.log("Data validation passed, creating site visit...");

      const siteVisit = await siteVisitService.createSiteVisit(siteVisitData);
      console.log("Site visit created successfully:", siteVisit.id);
      console.log("===================================");

      res.status(201).json({
        message: "Site visit created successfully",
        siteVisit
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Site visit validation errors:", JSON.stringify(error.errors, null, 2));
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors
        });
      }
      console.error("Error creating site visit:", error);
      res.status(500).json({ message: "Failed to create site visit" });
    }
  });

  // Update site visit (Site Out, progress updates)
  app.patch("/api/site-visits/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !(await checkSiteVisitPermission(user, 'edit'))) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { siteVisitService } = await import("./services/site-visit-service");

      // Get existing site visit to check ownership
      const existingSiteVisit = await siteVisitService.getSiteVisitById(req.params.id);
      if (!existingSiteVisit) {
        return res.status(404).json({ message: "Site visit not found" });
      }

      // Check if user can edit this site visit (own or has permission)
      const canEdit = existingSiteVisit.userId === user.uid ||
        (await checkSiteVisitPermission(user, 'view_all')) ||
        user.role === 'master_admin';

      if (!canEdit) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Log the update request for debugging
      console.log("=== SITE VISIT UPDATE DEBUG ===");
      console.log("Site Visit ID:", req.params.id);
      console.log("Update payload:", JSON.stringify(req.body, null, 2));
      console.log("User:", user.uid, user.displayName);

      // Validate known checkout fields including visit outcome fields
      const allowedFields = [
        'status', 'siteOutTime', 'siteOutLocation', 'siteOutPhotoUrl',
        'notes', 'updatedAt', 'sitePhotos', 'siteOutPhotos',
        // Visit outcome fields for business classification
        'visitOutcome', 'outcomeNotes', 'scheduledFollowUpDate',
        'outcomeSelectedAt', 'outcomeSelectedBy'
      ];

      const invalidFields = Object.keys(req.body).filter(field =>
        !allowedFields.includes(field) && field !== 'updatedAt'
      );

      if (invalidFields.length > 0) {
        console.warn("Invalid fields in update request:", invalidFields);
      }

      const updatedSiteVisit = await siteVisitService.updateSiteVisit(req.params.id, req.body);

      console.log("Site visit updated successfully:", updatedSiteVisit.id);
      console.log("================================");

      res.json({
        message: "Site visit updated successfully",
        siteVisit: updatedSiteVisit
      });
    } catch (error) {
      console.error("Error updating site visit:", error);
      res.status(500).json({ message: "Failed to update site visit" });
    }
  });

  // Site Visit Monitoring - Master Admin and HR only
  // IMPORTANT: This route must come BEFORE /api/site-visits/:id to avoid matching 'monitoring' as an ID
  app.get("/api/site-visits/monitoring", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Check access - only master admin and HR department
      const hasAccess = user.role === "master_admin" ||
        (user.department && user.department.toLowerCase() === 'hr');

      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied. This endpoint is restricted to Master Admin and HR Department." });
      }

      const { siteVisitService } = await import("./services/site-visit-service");

      // Get all site visits with enhanced data for monitoring
      const siteVisits = await siteVisitService.getAllSiteVisitsForMonitoring();

      // Enrich with user names
      console.log(`SITE_VISITS_MONITORING: Enriching ${siteVisits.length} site visits with user names...`);
      const enrichedSiteVisits = await Promise.all(
        siteVisits.map(async (visit, index) => {
          try {
            if (!visit.userId) {
              console.warn(`SITE_VISITS_MONITORING: Visit ${visit.id} (index ${index}) has no userId!`);
              return {
                ...visit,
                userName: 'Unknown User (No UserID)'
              };
            }

            console.log(`SITE_VISITS_MONITORING: Looking up user ${visit.userId} for visit ${visit.id}`);
            const visitUser = await storage.getUser(visit.userId);

            if (!visitUser) {
              console.warn(`SITE_VISITS_MONITORING: User ${visit.userId} not found in storage`);
              return {
                ...visit,
                userName: 'Unknown User (Not Found)'
              };
            }

            const userName = visitUser?.displayName || visitUser?.name || 'Unknown User (No Name)';
            console.log(`SITE_VISITS_MONITORING: Visit ${visit.id} -> User ${visit.userId} -> ${userName}`);
            return {
              ...visit,
              userName
            };
          } catch (error) {
            console.error(`SITE_VISITS_MONITORING: Error fetching user ${visit.userId} for visit ${visit.id}:`, error);
            return {
              ...visit,
              userName: 'Unknown User (Error)'
            };
          }
        })
      );

      console.log(`SITE_VISITS_MONITORING: Enrichment complete, returning ${enrichedSiteVisits.length} visits`);
      res.json(enrichedSiteVisits);
    } catch (error) {
      console.error("Error fetching site visits for monitoring:", error);
      res.status(500).json({ message: "Failed to fetch site visits data" });
    }
  });

  // Get site visit by ID
  app.get("/api/site-visits/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !(await checkSiteVisitPermission(user, 'view_own'))) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { siteVisitService } = await import("./services/site-visit-service");
      const siteVisit = await siteVisitService.getSiteVisitById(req.params.id);

      if (!siteVisit) {
        return res.status(404).json({ message: "Site visit not found" });
      }

      // Check if user can view this site visit
      const canView = siteVisit.userId === user.uid ||
        await checkSiteVisitPermission(user, 'view_all') ||
        (await checkSiteVisitPermission(user, 'view_team') && siteVisit.department === user.department) ||
        user.role === 'master_admin';

      if (!canView) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(siteVisit);
    } catch (error) {
      console.error("Error fetching site visit:", error);
      res.status(500).json({ message: "Failed to fetch site visit" });
    }
  });

  // Get site visits with filters
  app.get("/api/site-visits", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      const hasPermission = user ? await checkSiteVisitPermission(user, 'view_own') : false;

      if (!user || !hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { siteVisitService } = await import("./services/site-visit-service");

      // Parse query parameters
      const filters: any = {
        limit: parseInt(req.query.limit as string) || 50
      };

      // Determine what the user can see based on permissions
      if (user.role === 'master_admin' || await checkSiteVisitPermission(user, 'view_all')) {
        // Can see all site visits, apply any filters from query
        if (req.query.userId) filters.userId = req.query.userId as string;
        if (req.query.department) filters.department = req.query.department as string;
      } else if (await checkSiteVisitPermission(user, 'view_team')) {
        // Can see team/department site visits
        filters.department = user.department;
      } else {
        // Can only see own site visits
        filters.userId = user.uid;
      }

      // Apply additional filters
      if (req.query.status) filters.status = req.query.status as string;
      if (req.query.visitPurpose) filters.visitPurpose = req.query.visitPurpose as string;
      if (req.query.customerCurrentStatus) filters.customerCurrentStatus = req.query.customerCurrentStatus as string;
      if (req.query.startDate) {
        // UTC-safe date range for site visit filtering
        const startDate = getUTCMidnight(new Date(req.query.startDate as string));
        filters.startDate = startDate;
      }
      if (req.query.endDate) {
        const endDate = new Date(req.query.endDate as string);
        endDate.setHours(23, 59, 59, 999); // End of day
        filters.endDate = endDate;
      }

      const siteVisits = await siteVisitService.getSiteVisitsWithFilters(filters);

      res.json({
        data: siteVisits,
        filters: filters,
        count: siteVisits.length
      });
    } catch (error) {
      console.error("Error fetching site visits:", error);
      res.status(500).json({ message: "Failed to fetch site visits" });
    }
  });

  // Get site visit statistics - MOVED BEFORE :id ROUTE
  app.get("/api/site-visits/stats", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !(await checkSiteVisitPermission(user, 'view_own'))) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { siteVisitService } = await import("./services/site-visit-service");

      const filters: any = {};

      // Apply department filter based on permissions
      if (user.role !== 'master_admin' && !(await checkSiteVisitPermission(user, 'view_all'))) {
        filters.department = user.department;
      }

      if (req.query.startDate) filters.startDate = new Date(req.query.startDate as string);
      if (req.query.endDate) filters.endDate = new Date(req.query.endDate as string);

      const stats = await siteVisitService.getSiteVisitStats(filters);

      res.json(stats);
    } catch (error) {
      console.error("Error fetching site visit stats:", error);
      res.status(500).json({ message: "Failed to fetch site visit statistics" });
    }
  });

  // Get active site visits (in progress)
  app.get("/api/site-visits/active", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !(await checkSiteVisitPermission(user, 'view_own'))) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { siteVisitService } = await import("./services/site-visit-service");
      const activeSiteVisits = await siteVisitService.getActiveSiteVisits();

      // Filter based on user permissions
      let filteredSiteVisits = activeSiteVisits;

      if (user.role !== 'master_admin' && !(await checkSiteVisitPermission(user, 'view_all'))) {
        if (await checkSiteVisitPermission(user, 'view_team')) {
          filteredSiteVisits = activeSiteVisits.filter(sv => sv.department === user.department);
        } else {
          filteredSiteVisits = activeSiteVisits.filter(sv => sv.userId === user.uid);
        }
      }

      res.json(filteredSiteVisits);
    } catch (error) {
      console.error("Error fetching active site visits:", error);
      res.status(500).json({ message: "Failed to fetch active site visits" });
    }
  });

  // Add photos to site visit
  app.post("/api/site-visits/:id/photos", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !(await checkSiteVisitPermission(user, 'edit'))) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { siteVisitService } = await import("./services/site-visit-service");

      // Check if user owns the site visit
      const siteVisit = await siteVisitService.getSiteVisitById(req.params.id);
      if (!siteVisit) {
        return res.status(404).json({ message: "Site visit not found" });
      }

      if (siteVisit.userId !== user.uid && user.role !== 'master_admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const { sitePhotoSchema } = await import("@shared/schema");

      // Validate photos data
      const photosData = z.array(sitePhotoSchema).parse(req.body.photos);

      const updatedSiteVisit = await siteVisitService.addSitePhotos(req.params.id, photosData);

      res.json({
        message: "Photos added successfully",
        siteVisit: updatedSiteVisit
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors
        });
      }
      console.error("Error adding site photos:", error);
      res.status(500).json({ message: "Failed to add site photos" });
    }
  });

  // Delete site visit
  app.delete("/api/site-visits/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !(await checkSiteVisitPermission(user, 'delete'))) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { siteVisitService } = await import("./services/site-visit-service");

      // Check if user owns the site visit or has admin rights
      const siteVisit = await siteVisitService.getSiteVisitById(req.params.id);
      if (!siteVisit) {
        return res.status(404).json({ message: "Site visit not found" });
      }

      const canDelete = siteVisit.userId === user.uid ||
        user.role === 'master_admin' ||
        (user.role === 'admin' && siteVisit.department === user.department);

      if (!canDelete) {
        return res.status(403).json({ message: "Access denied" });
      }

      await siteVisitService.deleteSiteVisit(req.params.id);

      res.status(204).end();
    } catch (error) {
      console.error("Error deleting site visit:", error);
      res.status(500).json({ message: "Failed to delete site visit" });
    }
  });

  // Quick update site visit outcome (convert, cancel, reschedule)
  app.patch("/api/site-visits/:id/quick-update", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !(await checkSiteVisitPermission(user, 'edit'))) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Import and validate the quick update schema
      const { quickUpdateSiteVisitSchema } = await import("@shared/schema");

      let validatedData;
      try {
        validatedData = quickUpdateSiteVisitSchema.parse(req.body);
      } catch (zodError: any) {
        console.error("Quick update validation error:", zodError);
        return res.status(400).json({
          message: "Invalid request data",
          errors: zodError.issues || zodError.errors
        });
      }

      const { siteVisitService } = await import("./services/site-visit-service");

      // Check if user owns the site visit or has appropriate permissions
      const siteVisit = await siteVisitService.getSiteVisitById(req.params.id);
      if (!siteVisit) {
        return res.status(404).json({ message: "Site visit not found" });
      }

      const canUpdate = siteVisit.userId === user.uid ||
        user.role === 'master_admin' ||
        (user.role === 'admin' && siteVisit.department === user.department) ||
        (user.department === siteVisit.department && ['team_leader', 'officer', 'gm'].includes(user.designation || ''));

      if (!canUpdate) {
        return res.status(403).json({ message: "Access denied: You can only update your own site visits" });
      }

      // Validate action-specific requirements
      if (validatedData.action === 'reschedule' && !validatedData.scheduledFollowUpDate) {
        return res.status(400).json({
          message: "Scheduled follow-up date is required for reschedule action"
        });
      }

      // Perform the quick update
      const updatedSiteVisit = await siteVisitService.quickUpdateSiteVisit(
        req.params.id,
        validatedData.action,
        {
          scheduledFollowUpDate: validatedData.scheduledFollowUpDate,
          outcomeNotes: validatedData.outcomeNotes,
          reason: validatedData.reason,
          userId: user.uid
        }
      );

      // Return success response with updated data
      res.json({
        success: true,
        data: {
          id: updatedSiteVisit.id,
          visitOutcome: updatedSiteVisit.visitOutcome,
          scheduledFollowUpDate: updatedSiteVisit.scheduledFollowUpDate,
          outcomeNotes: updatedSiteVisit.outcomeNotes,
          updatedAt: updatedSiteVisit.updatedAt
        },
        message: `Site visit ${validatedData.action === 'convert' ? 'converted' : validatedData.action === 'cancel' ? 'cancelled' : 'rescheduled'} successfully`
      });

    } catch (error) {
      console.error("Error in quick update site visit:", error);
      res.status(500).json({
        message: "Failed to update site visit",
        error: (error as Error).message
      });
    }
  });

  // Create Follow-up Site Visit
  app.post("/api/site-visits/follow-up", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      const hasPermission = user ? await checkSiteVisitPermission(user, 'create') : false;

      if (!user || !hasPermission) {
        return res.status(403).json({
          message: "Access denied. Site Visit access is limited to Technical, Marketing, and Admin departments."
        });
      }

      const { followUpService } = await import("./services/follow-up-service");
      const { siteVisitService } = await import("./services/site-visit-service");

      // Get original visit to copy customer data and verify ownership
      console.log("FOLLOW_UP_CREATE: Looking for original visit:", req.body.originalVisitId);
      const originalVisit = await siteVisitService.getSiteVisitById(req.body.originalVisitId);
      if (!originalVisit) {
        console.log("FOLLOW_UP_CREATE: Original site visit not found:", req.body.originalVisitId);
        return res.status(404).json({ message: "Original site visit not found" });
      }
      console.log("FOLLOW_UP_CREATE: Found original visit:", originalVisit.id, "for customer:", originalVisit.customer.name);

      // Verify user can create follow-up for this visit (own visit or has permission)
      const canCreateFollowUp = originalVisit.userId === user.uid ||
        await checkSiteVisitPermission(user, 'view_all') ||
        user.role === 'master_admin';

      if (!canCreateFollowUp) {
        return res.status(403).json({ message: "Access denied. You can only create follow-ups for your own visits." });
      }

      // Map user department to site visit schema department
      const departmentMapping: Record<string, string> = {
        'admin': 'admin',
        'administration': 'admin',
        'operations': 'admin',
        'technical': 'technical',
        'marketing': 'marketing'
      };

      const mappedDepartment = departmentMapping[user.department?.toLowerCase() || ''] || user.department;

      // Prepare follow-up data with proper validation
      const followUpData = {
        originalVisitId: req.body.originalVisitId,
        userId: user.uid,
        department: mappedDepartment as "technical" | "marketing" | "admin",
        siteInTime: req.body.siteInTime ? new Date(req.body.siteInTime) : new Date(),
        siteInLocation: req.body.siteInLocation,
        siteInPhotoUrl: req.body.siteInPhotoUrl,
        followUpReason: req.body.followUpReason || 'additional_work_required',
        description: req.body.description || 'Follow-up visit for customer service',
        sitePhotos: req.body.sitePhotos || [],
        customer: originalVisit.customer,
        status: 'in_progress' as const,
        notes: req.body.description || req.body.notes || '',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      console.log("FOLLOW_UP_CREATE: Prepared follow-up data:", JSON.stringify(followUpData, null, 2));

      console.log("=== FOLLOW-UP VISIT CREATION (SEPARATE COLLECTION) ===");
      console.log("Original Visit ID:", req.body.originalVisitId);
      console.log("Follow-up reason:", req.body.followUpReason);
      console.log("User:", user.uid, user.displayName);
      console.log("Customer:", originalVisit.customer.name);
      console.log("======================================================");

      // Create follow-up in separate collection
      const createdFollowUp = await followUpService.createFollowUp(followUpData);

      res.status(201).json({
        data: createdFollowUp,
        message: "Follow-up visit created successfully"
      });

    } catch (error) {
      console.error("FOLLOW_UP_CREATE: Error creating follow-up:", error);
      res.status(500).json({ message: "Failed to create follow-up visit" });
    }
  });

  // Get all follow-ups for a user (to include in main site visit listing)
  app.get("/api/follow-ups", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      const hasPermission = user ? await checkSiteVisitPermission(user, 'view_own') : false;

      if (!user || !hasPermission) {
        return res.status(403).json({
          message: "Access denied. Site Visit access is limited to Technical, Marketing, and Admin departments."
        });
      }

      const { followUpService } = await import("./services/follow-up-service");

      // Get follow-ups by user
      const { userId, department, status } = req.query;

      let followUps = [];

      // For master_admin or users with view_all permission, fetch ALL follow-ups
      if (user.role === 'master_admin' || await checkSiteVisitPermission(user, 'view_all')) {
        console.log("FOLLOW_UPS_API: Fetching ALL follow-ups for admin user", user.uid);
        followUps = await followUpService.getAllFollowUps();

        // Apply filters client-side if needed
        if (userId) {
          followUps = followUps.filter(f => f.userId === userId);
        }
        if (department) {
          followUps = followUps.filter(f => f.department === department);
        }
        if (status) {
          followUps = followUps.filter(f => f.status === status);
        }
      } else if (userId && userId === user.uid) {
        // User requesting their own follow-ups
        followUps = await followUpService.getFollowUpsByUser(
          userId as string,
          department as string,
          status as string
        );
      } else {
        // Default to own follow-ups
        followUps = await followUpService.getFollowUpsByUser(user.uid);
      }

      // Enrich with user names
      console.log(`FOLLOW_UPS_API: Enriching ${followUps.length} follow-ups with user names...`);
      const enrichedFollowUps = await Promise.all(
        followUps.map(async (followUp, index) => {
          try {
            if (!followUp.userId) {
              console.warn(`FOLLOW_UPS_API: Follow-up ${followUp.id} (index ${index}) has no userId!`);
              return {
                ...followUp,
                userName: 'Unknown User (No UserID)'
              };
            }

            console.log(`FOLLOW_UPS_API: Looking up user ${followUp.userId} for follow-up ${followUp.id}`);
            const followUpUser = await storage.getUser(followUp.userId);

            if (!followUpUser) {
              console.warn(`FOLLOW_UPS_API: User ${followUp.userId} not found in storage`);
              return {
                ...followUp,
                userName: 'Unknown User (Not Found)'
              };
            }

            const userName = followUpUser?.displayName || followUpUser?.name || 'Unknown User (No Name)';
            console.log(`FOLLOW_UPS_API: Follow-up ${followUp.id} -> User ${followUp.userId} -> ${userName}`);
            return {
              ...followUp,
              userName
            };
          } catch (error) {
            console.error(`FOLLOW_UPS_API: Error fetching user ${followUp.userId} for follow-up ${followUp.id}:`, error);
            return {
              ...followUp,
              userName: 'Unknown User (Error)'
            };
          }
        })
      );

      console.log(`FOLLOW_UPS_API: Enrichment complete, returning ${enrichedFollowUps.length} follow-ups`);
      res.json({ data: enrichedFollowUps });
    } catch (error) {
      console.error("Error fetching follow-ups:", error);
      res.status(500).json({ message: "Failed to fetch follow-ups" });
    }
  });

  // Get follow-up visit by ID
  app.get("/api/follow-ups/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      const hasPermission = user ? await checkSiteVisitPermission(user, 'view_own') : false;

      if (!user || !hasPermission) {
        return res.status(403).json({
          message: "Access denied. Site Visit access is limited to Technical, Marketing, and Admin departments."
        });
      }

      const { followUpService } = await import("./services/follow-up-service");
      const followUp = await followUpService.getFollowUpById(req.params.id);

      if (!followUp) {
        return res.status(404).json({ message: "Follow-up visit not found" });
      }

      // Check if user can view this follow-up
      const canView = followUp.userId === user.uid ||
        await checkSiteVisitPermission(user, 'view_all') ||
        user.role === 'master_admin';

      if (!canView) {
        return res.status(403).json({ message: "Access denied. You can only view your own follow-ups." });
      }

      res.json({ data: followUp });
    } catch (error) {
      console.error("Error getting follow-up:", error);
      res.status(500).json({ message: "Failed to get follow-up visit" });
    }
  });

  // Get follow-ups for original visit
  app.get("/api/follow-ups/original/:originalVisitId", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      const hasPermission = user ? await checkSiteVisitPermission(user, 'view_own') : false;

      if (!user || !hasPermission) {
        return res.status(403).json({
          message: "Access denied. Site Visit access is limited to Technical, Marketing, and Admin departments."
        });
      }

      const { followUpService } = await import("./services/follow-up-service");
      const { siteVisitService } = await import("./services/site-visit-service");

      // Verify user can view the original visit
      const originalVisit = await siteVisitService.getSiteVisitById(req.params.originalVisitId);
      if (!originalVisit) {
        return res.status(404).json({ message: "Original site visit not found" });
      }

      const canView = originalVisit.userId === user.uid ||
        await checkSiteVisitPermission(user, 'view_all') ||
        user.role === 'master_admin';

      if (!canView) {
        return res.status(403).json({ message: "Access denied." });
      }

      const followUps = await followUpService.getFollowUpsByOriginalVisit(req.params.originalVisitId);
      res.json({ data: followUps });
    } catch (error) {
      console.error("Error getting follow-ups for original visit:", error);
      res.status(500).json({ message: "Failed to get follow-ups" });
    }
  });

  // Update follow-up visit (general update)
  app.patch("/api/follow-ups/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      const hasPermission = user ? await checkSiteVisitPermission(user, 'edit') : false;

      if (!user || !hasPermission) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { followUpService } = await import("./services/follow-up-service");

      // Get existing follow-up to check ownership
      const existingFollowUp = await followUpService.getFollowUpById(req.params.id);
      if (!existingFollowUp) {
        return res.status(404).json({ message: "Follow-up visit not found" });
      }

      // Check if user can edit this follow-up
      const canEdit = existingFollowUp.userId === user.uid ||
        await checkSiteVisitPermission(user, 'view_all') ||
        user.role === 'master_admin';

      if (!canEdit) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Validate update fields
      const allowedFields = [
        'status', 'siteOutTime', 'siteOutLocation', 'siteOutPhotoUrl',
        'notes', 'updatedAt', 'sitePhotos', 'siteOutPhotos'
      ];

      const updateData: any = {};
      Object.keys(req.body).forEach(key => {
        if (allowedFields.includes(key)) {
          updateData[key] = req.body[key];
        }
      });

      // Handle time conversion
      if (updateData.siteOutTime) {
        updateData.siteOutTime = new Date(updateData.siteOutTime);
      }

      updateData.updatedAt = new Date();

      console.log("=== FOLLOW-UP UPDATE DEBUG ===");
      console.log("Follow-up ID:", req.params.id);
      console.log("Update payload:", JSON.stringify(updateData, null, 2));

      const updatedFollowUp = await followUpService.updateFollowUp(req.params.id, updateData);

      res.json({
        message: "Follow-up visit updated successfully",
        data: updatedFollowUp
      });
    } catch (error) {
      console.error("Error updating follow-up visit:", error);
      res.status(500).json({ message: "Failed to update follow-up visit" });
    }
  });

  // Update follow-up (checkout)
  app.patch("/api/follow-ups/:id/checkout", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      const hasPermission = user ? await checkSiteVisitPermission(user, 'edit') : false;

      if (!user || !hasPermission) {
        return res.status(403).json({
          message: "Access denied. Site Visit access is limited to Technical, Marketing, and Admin departments."
        });
      }

      const { followUpService } = await import("./services/follow-up-service");
      const followUp = await followUpService.getFollowUpById(req.params.id);

      if (!followUp) {
        return res.status(404).json({ message: "Follow-up visit not found" });
      }

      // Check if user can checkout this follow-up
      const canCheckout = followUp.userId === user.uid ||
        await checkSiteVisitPermission(user, 'view_all') ||
        user.role === 'master_admin';

      if (!canCheckout) {
        return res.status(403).json({ message: "Access denied. You can only checkout your own follow-ups." });
      }

      // Validate required fields
      if (!req.body.siteOutLocation) {
        return res.status(400).json({
          message: "Missing required field: siteOutLocation",
          error: "MISSING_LOCATION"
        });
      }

      const checkoutData = {
        siteOutTime: new Date(),
        siteOutLocation: req.body.siteOutLocation,
        siteOutPhotoUrl: req.body.siteOutPhotoUrl || null,
        siteOutPhotos: req.body.siteOutPhotos || [],
        status: 'completed' as const,
        notes: req.body.notes || followUp.notes || '',
        visitOutcome: req.body.visitOutcome || null,
        outcomeNotes: req.body.outcomeNotes || null,
        scheduledFollowUpDate: req.body.scheduledFollowUpDate ? new Date(req.body.scheduledFollowUpDate) : null,
        outcomeSelectedAt: req.body.visitOutcome ? new Date() : null,
        outcomeSelectedBy: req.body.visitOutcome ? user.uid : null,
        updatedAt: new Date()
      };

      const updatedFollowUp = await followUpService.updateFollowUp(req.params.id, checkoutData);

      // Log activity
      try {
        if (updatedFollowUp.visitOutcome) {
          const outcomeLabel = {
            completed: 'Completed',
            on_process: 'Scheduled for Follow-up',
            cancelled: 'Cancelled'
          }[updatedFollowUp.visitOutcome] || updatedFollowUp.visitOutcome;

          await storage.createActivityLog({
            type: updatedFollowUp.visitOutcome === 'on_process' ? 'follow_up_scheduled' : 'follow_up_completed',
            title: `Follow-up ${outcomeLabel}`,
            description: `Follow-up visit ${outcomeLabel.toLowerCase()} for ${followUp.customer.name}`,
            entityId: req.params.id,
            entityType: 'follow_up',
            userId: user.uid
          });
        }
      } catch (logError) {
        console.error("Failed to create activity log:", logError);
      }

      res.json({
        data: updatedFollowUp,
        message: "Follow-up checkout completed successfully"
      });
    } catch (error) {
      console.error("Error processing follow-up checkout:", error);
      res.status(500).json({ message: "Failed to checkout follow-up visit", error: (error as Error).message });
    }
  });

  // Get customer site visit history for follow-up modal
  app.get("/api/site-visits/customer-history", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      const hasPermission = user ? await checkSiteVisitPermission(user, 'view_own') : false;

      if (!user || !hasPermission) {
        return res.status(403).json({
          message: "Access denied. Site Visit access is limited to Technical, Marketing, and Admin departments."
        });
      }

      const { mobile } = req.query;
      if (!mobile) {
        return res.status(400).json({ message: "Customer mobile number is required" });
      }

      const { siteVisitService } = await import("./services/site-visit-service");

      // Get all site visits for this customer (by mobile number)
      const allVisits = await siteVisitService.getAllSiteVisits({});

      // Filter visits by customer mobile number
      const customerVisits = allVisits.filter((visit: any) =>
        visit.customer && visit.customer.mobile === mobile
      );

      // Sort by creation date (newest first)
      customerVisits.sort((a: any, b: any) =>
        new Date(b.createdAt || b.siteInTime).getTime() - new Date(a.createdAt || a.siteInTime).getTime()
      );

      // Return limited data for timeline display
      const timeline = customerVisits.map((visit: any) => ({
        id: visit.id,
        visitPurpose: visit.visitPurpose,
        department: visit.department,
        siteInTime: visit.siteInTime,
        siteOutTime: visit.siteOutTime,
        status: visit.status,
        isFollowUp: visit.isFollowUp || false,
        followUpReason: visit.followUpReason,
        followUpOf: visit.followUpOf,
        notes: visit.notes
      }));

      res.json(timeline);
    } catch (error) {
      console.error("Error fetching customer visit history:", error);
      res.status(500).json({ message: "Failed to fetch customer visit history" });
    }
  });

  // Site Visit Data Export - Master Admin and HR only
  app.post("/api/site-visits/export", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Check access - only master admin and HR department
      const hasAccess = user.role === "master_admin" ||
        (user.department && user.department.toLowerCase() === 'hr');

      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied. This endpoint is restricted to Master Admin and HR Department." });
      }

      const { siteVisitService } = await import("./services/site-visit-service");
      const { filters } = req.body;

      // Generate Excel export
      const excelBuffer = await siteVisitService.exportSiteVisitsToExcel(filters);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=site-visits-${new Date().toISOString().split('T')[0]}.xlsx`);
      res.send(excelBuffer);
    } catch (error) {
      console.error("Error exporting site visits:", error);
      res.status(500).json({ message: "Failed to export site visits data" });
    }
  });

  // Register quotation routes
  registerQuotationRoutes(app, verifyAuth);

  // Reverse Geocoding API endpoint using Google Maps
  app.get("/api/reverse-geocode", verifyAuth, async (req, res) => {
    try {
      const { lat, lng } = req.query;

      if (!lat || !lng) {
        return res.status(400).json({ message: "Latitude and longitude are required" });
      }

      const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!googleMapsApiKey) {
        return res.status(500).json({ message: "Google Maps API key not configured" });
      }

      // Call Google Maps Geocoding API
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${googleMapsApiKey}`
      );

      if (!response.ok) {
        return res.status(500).json({ message: "Failed to fetch address from Google Maps" });
      }

      const data = await response.json();

      if (data.status === 'OK' && data.results && data.results.length > 0) {
        const address = data.results[0].formatted_address;
        res.json({ address, fullResponse: data.results[0] });
      } else {
        res.json({
          address: `${parseFloat(lat as string).toFixed(6)}, ${parseFloat(lng as string).toFixed(6)}`,
          error: "Address not found"
        });
      }
    } catch (error) {
      console.error("Error in reverse geocoding:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ================================================================
  // AUTO-CHECKOUT SYSTEM ROUTES (Phases 1-3)
  // ================================================================

  // Phase 1: CRON Job Endpoint for Auto-Checkout
  app.post("/api/cron/auto-checkout", async (req, res) => {
    try {
      // Security: Verify CRON secret
      const cronSecret = process.env.CRON_SECRET;
      const authHeader = req.headers.authorization;

      if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        console.warn("[AUTO-CHECKOUT] Unauthorized CRON attempt");
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      console.log("[AUTO-CHECKOUT] CRON job triggered");

      // Import and execute auto-checkout service
      const { AutoCheckoutService } = await import("./services/auto-checkout-service");
      await AutoCheckoutService.processAutoCheckouts();

      res.json({
        success: true,
        message: "Auto-checkout job completed successfully"
      });
    } catch (error: any) {
      console.error("[AUTO-CHECKOUT] CRON job error:", error);
      res.status(500).json({
        success: false,
        message: "Auto-checkout job failed",
        error: error.message
      });
    }
  });

  // Phase 2: Notification Endpoints
  app.get("/api/notifications", verifyAuth, async (req, res) => {
    try {
      const userId = req.authenticatedUser?.uid;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const notifications = await storage.getNotifications(userId, {
        status: 'unread',
        limit: 50
      });

      res.json({
        success: true,
        notifications
      });
    } catch (error: any) {
      console.error("[NOTIFICATIONS] Error fetching notifications:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch notifications",
        error: error.message
      });
    }
  });

  app.post("/api/notifications/:id/dismiss", verifyAuth, async (req, res) => {
    try {
      const userId = req.authenticatedUser?.uid;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const notificationId = req.params.id;

      // Verify notification belongs to user
      const notifications = await storage.getNotifications(userId);
      const notification = notifications.find(n => n.id === notificationId);

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: "Notification not found or access denied"
        });
      }

      await storage.updateNotification(notificationId, {
        status: 'read',
        dismissedAt: new Date()
      });

      res.json({
        success: true,
        message: "Notification dismissed"
      });
    } catch (error: any) {
      console.error("[NOTIFICATIONS] Error dismissing notification:", error);
      res.status(500).json({
        success: false,
        message: "Failed to dismiss notification",
        error: error.message
      });
    }
  });

  // Phase 3: Admin Review Endpoints
  app.get("/api/admin/attendance/pending-review", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");

      // Check admin role
      if (!user || (user.role !== 'admin' && user.role !== 'master_admin')) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Admin privileges required."
        });
      }

      const pendingReviews = await storage.listAttendanceByReviewStatus('pending');

      res.json(pendingReviews);
    } catch (error: any) {
      console.error("[ADMIN REVIEW] Error fetching pending reviews:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch pending reviews",
        error: error.message
      });
    }
  });

  app.post("/api/admin/attendance/:id/review", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");

      // Check admin role
      if (!user || (user.role !== 'admin' && user.role !== 'master_admin')) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Admin privileges required."
        });
      }

      const attendanceId = req.params.id;
      const { action, checkInTime, checkOutTime, notes } = req.body;

      // Validate action
      if (!['accepted', 'adjusted', 'rejected'].includes(action)) {
        return res.status(400).json({
          success: false,
          message: "Invalid action. Must be 'accepted', 'adjusted', or 'rejected'"
        });
      }

      // Get the attendance record
      const record = await storage.getAttendance(attendanceId);
      if (!record) {
        return res.status(404).json({
          success: false,
          message: "Attendance record not found"
        });
      }

      // Prepare update data
      const updateData: any = {
        adminReviewStatus: action,
        adminReviewedBy: user.uid,
        adminReviewedAt: new Date(),
        adminReviewNotes: notes || null
      };

      // Handle different actions
      if (action === 'accepted') {
        // Just mark as accepted, no time changes
      } else if (action === 'adjusted') {
        // Validate times
        if (!checkInTime || !checkOutTime) {
          return res.status(400).json({
            success: false,
            message: "Both checkInTime and checkOutTime are required for adjustment"
          });
        }

        // Store original checkout time for audit trail
        updateData.originalCheckOutTime = record.checkOutTime;
        updateData.checkInTime = new Date(checkInTime);
        updateData.checkOutTime = new Date(checkOutTime);

        // Recalculate working hours
        const { EnterpriseTimeService } = await import("./services/enterprise-time-service");
        const metrics = await EnterpriseTimeService.calculateTimeMetrics(
          record.userId,
          record.userDepartment || "general",
          updateData.checkInTime,
          updateData.checkOutTime
        );
        updateData.workingHours = metrics.workingHours;
      } else if (action === 'rejected') {
        // Mark as absent
        updateData.status = 'absent';
        updateData.checkOutTime = null;
        updateData.workingHours = 0;
      }

      // Update the record
      await storage.updateAttendance(attendanceId, updateData);

      // Notify the employee
      const { NotificationService } = await import("./services/notification-service");
      await NotificationService.notifyAdjustmentMade(
        record.userId,
        record.date,
        action,
        notes
      );

      res.json({
        success: true,
        message: `Attendance ${action} successfully`,
        data: {
          id: attendanceId,
          action,
          reviewedBy: user.displayName
        }
      });
    } catch (error: any) {
      console.error("[ADMIN REVIEW] Error processing review:", error);
      res.status(500).json({
        success: false,
        message: "Failed to process review",
        error: error.message
      });
    }
  });

  // Register OT System routes
  // Mount at /api/ot so routes like /sessions/start become /api/ot/sessions/start
  app.use('/api/ot', otRoutes);

  const httpServer = createServer(app);
  return httpServer;
}
/* In the main and to the client  in the main and most intrutive say in the main and most and client and more ways to get client in the to the main reason and more client and what is the main and met so the client moved from the clint to the main reasons of the client and main reason so that they reach the client and in the meeet and client so this  To the clinets main cities to the main reason of the client and met ren ven and how you lusu kyooti and   in the main and most imp part of life every one realize mny is imp  */ 
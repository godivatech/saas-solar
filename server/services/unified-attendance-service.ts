/**
 * Unified Enterprise Attendance Service
 * Single source of truth for all attendance operations with advanced location validation
 */

import { storage } from '../storage';
import { CloudinaryService } from './cloudinary-service';
import { EnterpriseTimeService } from './enterprise-time-service';
import { LeaveService } from './leave-service';
import { HolidayService } from './holiday-service';
import { getUTCMidnight, isSameUTCDate } from '../utils/timezone-helpers';

export interface AttendanceCheckInRequest {
  userId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  attendanceType: 'office' | 'remote' | 'field_work';
  reason?: string;
  customerName?: string;
  imageUrl?: string;
  deviceInfo?: {
    type: 'mobile' | 'tablet' | 'desktop';
    userAgent?: string;
    locationCapability: 'excellent' | 'good' | 'limited' | 'poor';
  };
}

export interface AttendanceCheckInResponse {
  success: boolean;
  attendanceId?: string;
  message: string;
  locationValidation: LocationValidationResult;
  attendanceDetails?: {
    isLate: boolean;
    lateMinutes: number;
    expectedCheckInTime: string;
    actualCheckInTime: string;
  };
  recommendations?: string[];
}

export interface AttendanceCheckOutRequest {
  userId: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  reason?: string;
  otReason?: string;
  imageUrl?: string;
}

export interface AttendanceCheckOutResponse {
  success: boolean;
  message: string;
  workingHours: number;
  overtimeHours: number;
  totalHours: number;
}

export class UnifiedAttendanceService {

  /**
   * Check if a specific date is a company holiday
   * @param date - The date to check
   * @param department - Optional department filter
   * @returns Object with isHoliday flag and holiday details
   */
  static async isHoliday(date: Date, department?: string): Promise<{
    isHoliday: boolean;
    holiday?: any;
  }> {
    try {
      const year = date.getFullYear();
      const holidays = await storage.listFixedHolidays(year);

      // Helper to compare dates (ignoring time)
      const isSameDay = (d1: Date, d2: Date): boolean => {
        return d1.getFullYear() === d2.getFullYear() &&
          d1.getMonth() === d2.getMonth() &&
          d1.getDate() === d2.getDate();
      };

      const matchingHoliday = holidays.find(holiday => {
        const holidayDate = new Date(holiday.date);
        const sameDateCheck = isSameDay(holidayDate, date);

        // Check if holiday applies to this department
        const appliesToDepartment =
          !holiday.applicableDepartments ||
          !department ||
          holiday.applicableDepartments.includes(department);

        return sameDateCheck && appliesToDepartment;
      });

      return {
        isHoliday: !!matchingHoliday,
        holiday: matchingHoliday
      };
    } catch (error) {
      console.error('[UnifiedAttendanceService] Error checking holiday:', error);
      // Return false on error to avoid blocking attendance
      return { isHoliday: false };
    }
  }

  /**
   * Get all holidays within a date range
   * @param startDate - Range start date
   * @param endDate - Range end date
   * @param department - Optional department filter
   * @returns Array of holidays in the range
   */
  static async getHolidaysInRange(
    startDate: Date,
    endDate: Date,
    department?: string
  ): Promise<any[]> {
    try {
      const startYear = startDate.getFullYear();
      const endYear = endDate.getFullYear();

      // Get all years in range
      const years: number[] = [];
      for (let year = startYear; year <= endYear; year++) {
        years.push(year);
      }

      // Fetch holidays for all years
      const allHolidaysPromises = years.map(year => storage.listFixedHolidays(year));
      const allHolidaysArrays = await Promise.all(allHolidaysPromises);
      const allHolidays = allHolidaysArrays.flat();

      // Filter by date range and department
      return allHolidays.filter(h => {
        const holidayDate = new Date(h.date);
        const inRange = holidayDate >= startDate && holidayDate <= endDate;
        const appliesToDept =
          !h.applicableDepartments ||
          !department ||
          h.applicableDepartments.includes(department);
        return inRange && appliesToDept;
      });
    } catch (error) {
      console.error('[UnifiedAttendanceService] Error getting holidays in range:', error);
      return [];
    }
  }

  /**
   * Enrich attendance records with holiday information
   * For dates without attendance records, check if they're holidays and mark accordingly
   */
  static async enrichAttendanceWithHolidays(
    userId: string,
    startDate: Date,
    endDate: Date,
    existingRecords: any[]
  ): Promise<any[]> {
    try {
      const user = await storage.getUser(userId);
      if (!user) return existingRecords;

      const holidays = await this.getHolidaysInRange(startDate, endDate, user.department || undefined);

      const recordsByDate = new Map();
      existingRecords.forEach(record => {
        const dateStr = new Date(record.date).toISOString().split('T')[0];
        recordsByDate.set(dateStr, record);
      });

      const enrichedRecords = [...existingRecords];

      for (const holiday of holidays) {
        const holidayDateStr = new Date(holiday.date).toISOString().split('T')[0];

        if (!recordsByDate.has(holidayDateStr)) {
          enrichedRecords.push({
            id: `holiday-${holidayDateStr}-${userId}`,
            userId,
            date: holiday.date,
            status: 'holiday',
            holidayName: holiday.name,
            isHoliday: true,
            checkInTime: null,
            checkOutTime: null,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }

      enrichedRecords.sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      return enrichedRecords;
    } catch (error) {
      console.error('[UnifiedAttendanceService] Error enriching attendance:', error);
      return existingRecords;
    }
  }

  /**
   * Enrich attendance records with weekly-off days (e.g., Sundays)
   * For dates without attendance records that fall on configured weekly-off days,
   * add virtual records to ensure employees get paid for these days
   */
  static async enrichAttendanceWithWeeklyOffs(
    userId: string,
    startDate: Date,
    endDate: Date,
    existingRecords: any[]
  ): Promise<any[]> {
    try {
      const user = await storage.getUser(userId);
      if (!user || !user.department) return existingRecords;

      // Get department timing to check configured weekly-off days
      const departmentTiming = await storage.getDepartmentTiming(user.department);
      const weeklyOffDays = departmentTiming?.weekendDays || [0]; // Default to Sunday

      const recordsByDate = new Map();
      existingRecords.forEach(record => {
        const dateStr = new Date(record.date).toISOString().split('T')[0];
        recordsByDate.set(dateStr, record);
      });

      const enrichedRecords = [...existingRecords];

      // Iterate through all dates in the range
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 6 = Saturday
        const dateStr = currentDate.toISOString().split('T')[0];

        // Check if this day is a configured weekly-off and no record exists
        if (weeklyOffDays.includes(dayOfWeek) && !recordsByDate.has(dateStr)) {
          enrichedRecords.push({
            id: `weekly_off-${dateStr}-${userId}`,
            userId,
            date: new Date(currentDate),
            status: 'weekly_off',
            attendanceType: 'office',
            isWeeklyOff: true,
            checkInTime: null,
            checkOutTime: null,
            workingHours: 0,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      enrichedRecords.sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      return enrichedRecords;
    } catch (error) {
      console.error('[UnifiedAttendanceService] Error enriching attendance with weekly-offs:', error);
      return existingRecords;
    }
  }

  /**
   * Comprehensive attendance enrichment
   * Combines holiday and weekly-off enrichment to ensure complete month view
   * This is the master enrichment function to call before payroll processing
   */
  static async enrichAttendanceComprehensively(
    userId: string,
    startDate: Date,
    endDate: Date,
    existingRecords: any[]
  ): Promise<any[]> {
    try {
      // First enrich with holidays
      let enriched = await this.enrichAttendanceWithHolidays(
        userId,
        startDate,
        endDate,
        existingRecords
      );

      // Then enrich with weekly-offs
      enriched = await this.enrichAttendanceWithWeeklyOffs(
        userId,
        startDate,
        endDate,
        enriched
      );

      console.log(`[UnifiedAttendanceService] Comprehensively enriched attendance for user ${userId}:`, {
        original: existingRecords.length,
        enriched: enriched.length,
        added: enriched.length - existingRecords.length
      });

      return enriched;
    } catch (error) {
      console.error('[UnifiedAttendanceService] Error in comprehensive enrichment:', error);
      return existingRecords;
    }
  }

  /**
   * Process attendance check-in with enterprise location validation
   */
  static async processCheckIn(request: AttendanceCheckInRequest): Promise<AttendanceCheckInResponse> {
    try {
      // Validate user exists
      const user = await storage.getUser(request.userId);
      if (!user) {
        return {
          success: false,
          message: 'User not found',
          locationValidation: {
            isValid: false,
            confidence: 0,
            distance: 0,
            detectedOffice: null,
            validationType: 'failed',
            message: 'User validation failed',
            recommendations: ['Contact system administrator'],
            metadata: {
              accuracy: request.accuracy,
              effectiveRadius: 0,
              indoorDetection: false,
              confidenceFactors: ['user_not_found']
            }
          }
        };
      }

      // CRITICAL: Validate department timing configuration before allowing check-in
      if (!user.department) {
        return {
          success: false,
          message: 'Department not assigned. Contact administrator to assign you to a department.',
          locationValidation: {
            isValid: false,
            confidence: 0,
            distance: 0,
            detectedOffice: null,
            validationType: 'failed',
            message: 'Department assignment required',
            recommendations: ['Contact your administrator to assign you to a department'],
            metadata: {
              accuracy: request.accuracy,
              effectiveRadius: 0,
              indoorDetection: false,
              confidenceFactors: ['no_department']
            }
          }
        };
      }

      // Check if department timing is configured (using EnterpriseTimeService for case normalization and defaults)
      const { EnterpriseTimeService } = await import('./enterprise-time-service');
      const departmentTiming = await EnterpriseTimeService.getDepartmentTiming(user.department);

      // EnterpriseTimeService always returns a timing object (with defaults if not configured)
      // Only fail if the timing is explicitly marked as inactive
      if (!departmentTiming.isActive) {
        return {
          success: false,
          message: `Department timing is disabled for ${user.department} department. Contact administrator.`,
          locationValidation: {
            isValid: false,
            confidence: 0,
            distance: 0,
            detectedOffice: null,
            validationType: 'failed',
            message: 'Department timing disabled',
            recommendations: [
              'Contact your administrator to enable department timing',
            ],
            metadata: {
              accuracy: request.accuracy,
              effectiveRadius: 0,
              indoorDetection: false,
              confidenceFactors: ['department_timing_disabled']
            }
          }
        };
      }

      // **CRITICAL FIX: Use UTC date to avoid timezone issues**
      // When using local time with setHours(0,0,0,0), the ISO string conversion
      // causes date mismatch in timezones ahead of UTC (e.g., IST +5:30)
      const now = new Date();

      // **CRITICAL: Check if today is a company holiday BEFORE allowing check-in**
      const { isHoliday, holiday } = await this.isHoliday(now, user.department);
      if (isHoliday) {
        return {
          success: false,
          message: `Today is ${holiday.name}. Office is closed. Attendance marking is not allowed.`,
          locationValidation: {
            isValid: false,
            confidence: 0,
            distance: 0,
            detectedOffice: null,
            validationType: 'holiday',
            message: 'Company holiday',
            recommendations: [
              'Company is closed for holiday',
              'Enjoy your day off!',
              'Contact supervisor if you need to report emergency work'
            ],
            metadata: {
              accuracy: request.accuracy,
              effectiveRadius: 0,
              indoorDetection: false,
              confidenceFactors: ['company_holiday']
            }
          }
        };
      }

      // **CRITICAL: Check if user has approved LEAVE (casual/unpaid) BEFORE allowing check-in**
      // IMPORTANT: Permission is NOT checked here - it's a paid allowance, not leave
      // Permission allows attendance because employee is still working that day
      const approvedLeave = await storage.getApprovedLeaveForDate(request.userId, now);

      if (approvedLeave) {
        // Build user-friendly leave description
        const leaveTypeLabel = approvedLeave.leaveType === 'casual_leave' ? 'casual leave' : 'unpaid leave';
        let dateInfo = '';

        if (approvedLeave.startDate && approvedLeave.endDate) {
          const startStr = approvedLeave.startDate.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          });
          const endStr = approvedLeave.endDate.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          });
          dateInfo = startStr === endStr ? startStr : `${startStr} to ${endStr}`;
        }

        // Log for debugging and audit trail
        console.log(`[Attendance-Leave Block] User ${request.userId} attempted check-in while on approved ${approvedLeave.leaveType}`);
        console.log(`[Attendance-Leave Block] Leave ID: ${approvedLeave.id}, Date: ${dateInfo}`);

        return {
          success: false,
          message: `You have approved ${leaveTypeLabel} for today (${dateInfo}). Attendance marking is not allowed while on leave.`,
          locationValidation: {
            isValid: false,
            confidence: 0,
            distance: 0,
            detectedOffice: null,
            validationType: 'blocked',
            message: 'On approved leave',
            recommendations: [
              'You cannot mark attendance while on approved leave',
              'Your leave has been approved and is already recorded in the system',
              'Contact HR if you believe this is a mistake or if you need to cancel your leave'
            ],
            metadata: {
              accuracy: request.accuracy,
              effectiveRadius: 0,
              indoorDetection: false,
              confidenceFactors: ['approved_leave_full_day']
            }
          }
        };
      }

      // **🛡️ WEEKEND BLOCKING: Block regular attendance on weekends**
      const { CompanySettingsService } = await import('./company-settings-service');
      const isWeekend = await CompanySettingsService.isWeekend(now);
      if (isWeekend) {
        return {
          success: false,
          message: `Today is a weekly off (weekend). Regular attendance is not required. Please use the OT system if you are working today.`,
          locationValidation: {
            isValid: false,
            confidence: 0,
            distance: 0,
            detectedOffice: null,
            validationType: 'failed',
            message: 'Weekly Off - Regular attendance blocked',
            recommendations: [
              'It is a weekend!',
              'Use the OT system for weekend work',
              'Regular check-ins are disabled today'
            ],
            metadata: {
              accuracy: request.accuracy,
              effectiveRadius: 0,
              indoorDetection: false,
              confidenceFactors: ['weekend_blocking']
            }
          }
        };
      }

      const today = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0, 0, 0, 0
      ));

      console.log('CHECK-IN: Using UTC date for consistency:', {
        serverTime: now.toISOString(),
        utcDate: today.toISOString(),
        dateString: today.toISOString().split('T')[0]
      });

      const existingAttendance = await storage.getAttendanceByUserAndDate(request.userId, today);

      if (existingAttendance) {
        // **CRITICAL: Verify the existing record is actually from TODAY (UTC-safe)**
        const existingDate = new Date(existingAttendance.date);
        const todayNormalized = today;

        // Only block if the existing record is genuinely from today (UTC comparison)
        // AND already has a checkInTime set (allows regular check-in after early OT start)
        if (isSameUTCDate(existingDate, todayNormalized) && existingAttendance.checkInTime) {
          console.log('DUPLICATE CHECK-IN: Blocking duplicate check-in for user', request.userId, {
            existingRecordDate: existingDate.toISOString(),
            todayDate: todayNormalized.toISOString(),
            existingRecordId: existingAttendance.id
          });

          return {
            success: false,
            message: 'You have already checked in today',
            locationValidation: {
              isValid: false,
              confidence: 0,
              distance: 0,
              detectedOffice: null,
              validationType: 'failed',
              message: 'Duplicate check-in attempt',
              recommendations: ['You can only check in once per day'],
              metadata: {
                accuracy: request.accuracy,
                effectiveRadius: 0,
                indoorDetection: false,
                confidenceFactors: ['duplicate_checkin']
              }
            }
          };
        } else {
          // Old record exists but it's from a different day - allow check-in
          console.log('DUPLICATE CHECK: Found old attendance record, but it\'s from a different day. Allowing check-in.', {
            existingRecordDate: existingDate.toISOString(),
            todayDate: todayNormalized.toISOString(),
            userId: request.userId
          });
        }
      }

      // Simplified location validation - accept any location
      console.log('UNIFIED SERVICE: Processing simplified attendance with location data...');
      console.log('Location coordinates:', {
        latitude: request.latitude,
        longitude: request.longitude,
        accuracy: request.accuracy
      });

      const locationValidation = {
        isValid: true,
        confidence: 1.0,
        distance: 0,
        detectedOffice: null,
        validationType: 'proximity_based' as const,
        message: 'Location recorded successfully',
        recommendations: [] as string[],
        metadata: {
          accuracy: request.accuracy,
          effectiveRadius: 0,
          indoorDetection: false,
          confidenceFactors: ['simplified_attendance']
        }
      };

      // Calculate timing information using Enterprise Time Service
      const timingInfo = await this.calculateTimingInfo(user, new Date());

      // Handle photo upload to Cloudinary if provided
      let cloudinaryImageUrl = request.imageUrl;
      if (request.imageUrl && request.imageUrl.startsWith('data:')) {
        console.log('ATTENDANCE: Uploading photo to Cloudinary for user:', request.userId);
        const uploadResult = await CloudinaryService.uploadAttendancePhoto(
          request.imageUrl,
          request.userId,
          new Date()
        );

        if (uploadResult.success) {
          cloudinaryImageUrl = uploadResult.url;
          console.log('ATTENDANCE: Photo uploaded successfully:', uploadResult.url);
        } else {
          console.error('ATTENDANCE: Photo upload failed:', uploadResult.error);
          // Continue without failing the check-in - photo upload is not critical
        }
      }

      // ✅ CRITICAL FIX: If attendance record exists (e.g., from early OT) but has no check-in time,
      // UPDATE it instead of creating a duplicate!
      let newAttendance;
      if (existingAttendance && !existingAttendance.checkInTime) {
        // Update existing OT-only record with regular check-in data
        console.log('CHECK-IN: Updating existing OT-only attendance with regular check-in data');
        newAttendance = await storage.updateAttendance(existingAttendance.id, {
          checkInTime: new Date(),
          attendanceType: request.attendanceType,
          reason: request.reason || '',
          checkInLatitude: request.latitude.toString(),
          checkInLongitude: request.longitude.toString(),
          status: (timingInfo.isLate ? 'late' : 'present') as 'late' | 'present',
          isLate: timingInfo.isLate,
          lateMinutes: timingInfo.lateMinutes,
          workingHours: 0,
          breakHours: 0,
          isWithinOfficeRadius: true,
          remarks: `Attendance recorded with location verification`,
          locationAccuracy: request.accuracy,
          locationValidationType: locationValidation.validationType,
          locationConfidence: locationValidation.confidence,
          detectedOfficeId: locationValidation.detectedOffice?.id || null,
          distanceFromOffice: locationValidation.distance,
          isManualOT: existingAttendance.isManualOT, // Preserve OT flag
          ...(request.customerName && { customerName: request.customerName }),
          ...(cloudinaryImageUrl && { checkInImageUrl: cloudinaryImageUrl })
        });
      } else {
        // No existing record (or has check-in already) - create new
        console.log('CHECK-IN: Creating new attendance record');
        const attendanceData = {
          userId: request.userId,
          date: today,
          checkInTime: new Date(),
          attendanceType: request.attendanceType,
          reason: request.reason || '',
          checkInLatitude: request.latitude.toString(),
          checkInLongitude: request.longitude.toString(),
          status: (timingInfo.isLate ? 'late' : 'present') as 'late' | 'present',
          isLate: timingInfo.isLate,
          lateMinutes: timingInfo.lateMinutes,
          workingHours: 0,
          breakHours: 0,
          isWithinOfficeRadius: true,
          remarks: `Attendance recorded with location verification`,
          locationAccuracy: request.accuracy,
          locationValidationType: locationValidation.validationType,
          locationConfidence: locationValidation.confidence,
          detectedOfficeId: locationValidation.detectedOffice?.id || null,
          distanceFromOffice: locationValidation.distance,
          location: {
            latitude: request.latitude,
            longitude: request.longitude,
            accuracy: request.accuracy,
            effectiveRadius: locationValidation.metadata.effectiveRadius,
            indoorDetection: locationValidation.metadata.indoorDetection,
            confidenceFactors: locationValidation.metadata.confidenceFactors,
            validationType: locationValidation.validationType,
            message: locationValidation.message,
            detectedOffice: locationValidation.detectedOffice ? {
              id: locationValidation.detectedOffice.id,
              name: locationValidation.detectedOffice.name,
              latitude: locationValidation.detectedOffice.latitude,
              longitude: locationValidation.detectedOffice.longitude,
              radius: locationValidation.detectedOffice.radius,
            } : null,
            distance: locationValidation.distance,
          },
          autoCorrected: false,
          // ✅ REMOVED: otStatus (legacy field) - use otSessions[] array instead
          otSessions: [], // Initialize empty OT sessions array
          isManualOT: false,
          ...(request.customerName && { customerName: request.customerName }),
          ...(cloudinaryImageUrl && { checkInImageUrl: cloudinaryImageUrl })
        };
        newAttendance = await storage.createAttendance(attendanceData);
      }

      // Log simplified attendance acceptance
      console.log('UNIFIED SERVICE: Simplified attendance accepted for user:', request.userId);

      // Create activity log
      await storage.createActivityLog({
        type: 'attendance',
        title: `${this.getAttendanceTypeDisplay(request.attendanceType)} Check-in`,
        description: `${user.displayName} checked in${timingInfo.isLate ? ` (${timingInfo.lateMinutes} minutes late)` : ''} - Location recorded successfully`,
        entityId: newAttendance.id,
        entityType: 'attendance',
        userId: request.userId
      });

      const actualCheckInTime = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

      return {
        success: true,
        attendanceId: newAttendance.id,
        message: `Check-in successful at ${actualCheckInTime}${timingInfo.isLate ? ` (${timingInfo.lateMinutes} minutes late from ${timingInfo.expectedCheckInTime} start time)` : ''}`,
        locationValidation,
        attendanceDetails: {
          isLate: timingInfo.isLate,
          lateMinutes: timingInfo.lateMinutes,
          expectedCheckInTime: timingInfo.expectedCheckInTime,
          actualCheckInTime: actualCheckInTime
        },
        recommendations: locationValidation.recommendations
      };

    } catch (error) {
      console.error('Error processing check-in:', error);
      return {
        success: false,
        message: 'Failed to process check-in due to system error',
        locationValidation: {
          isValid: false,
          confidence: 0,
          distance: 0,
          detectedOffice: null,
          validationType: 'failed',
          message: 'System error during validation',
          recommendations: ['Please try again or contact support'],
          metadata: {
            accuracy: request.accuracy,
            effectiveRadius: 0,
            indoorDetection: false,
            confidenceFactors: ['system_error']
          }
        }
      };
    }
  }

  /**
   * Process attendance check-out with overtime calculation
   */
  static async processCheckOut(request: AttendanceCheckOutRequest): Promise<AttendanceCheckOutResponse> {
    try {
      // Find today's attendance record (UTC-safe)
      const today = getUTCMidnight(new Date());
      const attendance = await storage.getAttendanceByUserAndDate(request.userId, today);

      if (!attendance) {
        return {
          success: false,
          message: 'No check-in record found for today',
          workingHours: 0,
          overtimeHours: 0,
          totalHours: 0
        };
      }

      if (attendance.checkOutTime) {
        return {
          success: false,
          message: 'You have already checked out for today',
          workingHours: 0,
          overtimeHours: 0,
          totalHours: 0
        };
      }

      // Get user for department timing
      const user = await storage.getUser(request.userId);
      const { EnterpriseTimeService } = await import('./enterprise-time-service');

      // Calculate comprehensive time metrics using Enterprise Time Service
      const checkOutTime = new Date();
      const checkInTime = attendance.checkInTime ? new Date(attendance.checkInTime) : new Date();

      const timeMetrics = await EnterpriseTimeService.calculateTimeMetrics(
        request.userId,
        user?.department || 'operations',
        checkInTime,
        checkOutTime
      );

      const { workingHours, overtimeHours } = timeMetrics;

      // Update attendance record
      const updatedAttendance = await storage.updateAttendance(attendance.id, {
        checkOutTime,
        checkOutLatitude: request.latitude?.toString(),
        checkOutLongitude: request.longitude?.toString(),
        workingHours,
        overtimeHours,
        otReason: request.otReason || '',
        remarks: request.reason || ''
      });

      // Log activity
      await storage.createActivityLog({
        type: 'attendance',
        title: 'Check-out',
        description: `${user?.displayName} checked out after ${workingHours.toFixed(1)} hours${overtimeHours > 0 ? ` (${overtimeHours.toFixed(1)}h overtime)` : ''}`,
        entityId: attendance.id,
        entityType: 'attendance',
        userId: request.userId
      });

      return {
        success: true,
        message: `Check-out successful. Total working time: ${workingHours.toFixed(1)} hours${overtimeHours > 0 ? ` (${overtimeHours.toFixed(1)}h overtime)` : ''}`,
        workingHours: Number(workingHours.toFixed(2)),
        overtimeHours: Number(overtimeHours.toFixed(2)),
        totalHours: Number(workingHours.toFixed(2))
      };

    } catch (error) {
      console.error('Error processing check-out:', error);
      return {
        success: false,
        message: 'Failed to process check-out due to system error',
        workingHours: 0,
        overtimeHours: 0,
        totalHours: 0
      };
    }
  }

  /**
   * Validate business rules for attendance check-in with work policy enforcement
   */
  private static async validateBusinessRules(
    request: AttendanceCheckInRequest,
    locationValidation: LocationValidationResult
  ): Promise<{ isValid: boolean; message: string; recommendations: string[] }> {
    const recommendations: string[] = [];

    // Get user and department timing for policy validation
    const user = await storage.getUser(request.userId);
    const { EnterpriseTimeService } = await import('./enterprise-time-service');
    const departmentTiming = await EnterpriseTimeService.getDepartmentTiming(user?.department || 'operations');

    // Remote work validation - simplified (no policy check)

    // Office attendance validation
    if (request.attendanceType === 'office') {
      if (!locationValidation.isValid) {
        return {
          isValid: false,
          message: `Office check-in failed: ${locationValidation.message}`,
          recommendations: [
            ...locationValidation.recommendations,
            'Consider using "Remote Work" if you are working from outside office'
          ]
        };
      }
    }

    // Field work validation
    if (request.attendanceType === 'field_work') {
      if (!request.customerName) {
        return {
          isValid: false,
          message: 'Customer name is required for field work',
          recommendations: ['Please enter the customer name you are visiting']
        };
      }
      if (!request.imageUrl) {
        return {
          isValid: false,
          message: 'Photo is mandatory for field work check-in',
          recommendations: ['Please capture a photo to verify your field work location']
        };
      }
    }

    // Remote work validation
    if (request.attendanceType === 'remote') {
      if (!request.reason) {
        return {
          isValid: false,
          message: 'Reason is required for remote work',
          recommendations: ['Please provide a reason for working remotely today']
        };
      }
    }

    return { isValid: true, message: 'Validation successful', recommendations };
  }

  /**
   * Calculate timing information for check-in using Enterprise Time Service
   */
  private static async calculateTimingInfo(user: any, checkInTime: Date = new Date()): Promise<{
    isLate: boolean;
    lateMinutes: number;
    expectedCheckInTime: string;
  }> {
    const { EnterpriseTimeService } = await import('./enterprise-time-service');

    const department = user?.department || 'operations';
    const timing = await EnterpriseTimeService.getDepartmentTiming(department);

    // Parse expected check-in time for today
    const today = new Date(checkInTime);
    const expectedTime = this.parseTime12ToDate(timing.checkInTime, today);

    const isLate = checkInTime > expectedTime;
    const lateMinutes = isLate ?
      Math.floor((checkInTime.getTime() - expectedTime.getTime()) / (1000 * 60)) : 0;

    return {
      isLate,
      lateMinutes,
      expectedCheckInTime: timing.checkInTime
    };
  }

  /**
   * Parse 12-hour time string to Date object - DEPRECATED: Use EnterpriseTimeService
   */
  private static parseTime12ToDate(timeStr: string, baseDate: Date): Date {
    console.warn('DEPRECATED: Use EnterpriseTimeService.parseTimeToDate instead');
    const timeRegex = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;
    const match = timeStr.match(timeRegex);

    if (!match) {
      console.error('UNIFIED_ATTENDANCE: Invalid time format:', timeStr);
      // Return safe fallback
      const fallback = new Date(baseDate);
      fallback.setHours(18, 0, 0, 0); // 6 PM default
      return fallback;
    }

    let [, hourStr, minuteStr, period] = match;
    let hours = parseInt(hourStr);
    const minutes = parseInt(minuteStr);

    if (isNaN(hours) || isNaN(minutes)) {
      console.error('UNIFIED_ATTENDANCE: Invalid time values:', timeStr);
      const fallback = new Date(baseDate);
      fallback.setHours(18, 0, 0, 0);
      return fallback;
    }

    if (period.toUpperCase() === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period.toUpperCase() === 'AM' && hours === 12) {
      hours = 0;
    }

    const date = new Date(baseDate);
    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  /**
   * Generate appropriate remarks for attendance record
   */
  private static generateRemarks(
    request: AttendanceCheckInRequest,
    locationValidation: LocationValidationResult
  ): string {
    const parts: string[] = [];

    if (request.attendanceType === 'field_work' && request.customerName) {
      parts.push(`Field work at ${request.customerName}`);
    }

    if (request.reason) {
      parts.push(request.reason);
    }

    if (locationValidation.validationType === 'indoor_compensation') {
      parts.push('Indoor GPS detection');
    } else if (locationValidation.validationType === 'proximity_based') {
      parts.push('Proximity-based location validation');
    }

    if (locationValidation.detectedOffice) {
      parts.push(`Office: ${locationValidation.detectedOffice.name}`);
    }

    return parts.join(' | ') || 'Standard check-in';
  }

  /**
   * Get display name for attendance type
   */
  private static getAttendanceTypeDisplay(type: string): string {
    switch (type) {
      case 'office': return 'Office';
      case 'remote': return 'Remote Work';
      case 'field_work': return 'Field Work';
      default: return 'Unknown';
    }
  }

  /**
   * Generate comprehensive attendance metrics for analytics with Enterprise Time Service
   */
  static async generateAttendanceMetrics(userId: string, dateRange?: { start: Date; end: Date }) {
    try {
      const attendanceRecords = await storage.getAttendance(userId);

      if (!Array.isArray(attendanceRecords)) {
        console.error('ATTENDANCE METRICS: Expected array, got:', typeof attendanceRecords);
        return {
          totalDays: 0,
          totalWorkingHours: 0,
          totalOvertimeHours: 0,
          averageWorkingHours: 0,
          lateArrivals: 0,
          punctualityRate: 100,
          records: []
        };
      }

      // Filter by date range if provided
      let filteredRecords = dateRange
        ? attendanceRecords.filter((record: any) => {
          const checkInDate = new Date(record.checkInTime);
          return checkInDate >= dateRange.start && checkInDate <= dateRange.end;
        })
        : attendanceRecords;

      // P2: Exclude pending reviews to match payroll logic
      filteredRecords = filteredRecords.filter((record: any) => record.adminReviewStatus !== 'pending');

      const totalDays = filteredRecords.length;
      const totalWorkingHours = filteredRecords.reduce((sum: number, record: any) => sum + (record.workingHours || 0), 0);
      const totalOvertimeHours = filteredRecords.reduce((sum: number, record: any) => sum + (record.overtimeHours || 0), 0);
      const lateArrivals = filteredRecords.filter((record: any) => record.isLate).length;

      return {
        totalDays,
        totalWorkingHours: Math.round(totalWorkingHours * 100) / 100,
        totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
        averageWorkingHours: totalDays > 0 ? Math.round((totalWorkingHours / totalDays) * 100) / 100 : 0,
        lateArrivals,
        punctualityRate: totalDays > 0 ? Math.round(((totalDays - lateArrivals) / totalDays) * 100) : 100,
        records: filteredRecords
      };
    } catch (error) {
      console.error('Error generating attendance metrics:', error);
      return {
        totalDays: 0,
        totalWorkingHours: 0,
        totalOvertimeHours: 0,
        averageWorkingHours: 0,
        lateArrivals: 0,
        punctualityRate: 100,
        records: []
      };
    }
  }

  /**
   * Get department-specific timing configuration (DEPRECATED)
   * @deprecated Use EnterpriseTimeService.getDepartmentTiming() instead
   */
  private static getDepartmentTiming(department?: string): {
    checkInTime: string;
    checkOutTime: string;
    workingHours: number;
  } {
    console.warn('DEPRECATED: Using legacy getDepartmentTiming - migrate to EnterpriseTimeService');

    // Legacy fallback with 12-hour format
    const defaultTimings = {
      'operations': { checkInTime: '9:00 AM', checkOutTime: '6:00 PM', workingHours: 8 },
      'admin': { checkInTime: '9:30 AM', checkOutTime: '6:30 PM', workingHours: 8 },
      'hr': { checkInTime: '9:30 AM', checkOutTime: '6:30 PM', workingHours: 8 },
      'marketing': { checkInTime: '10:00 AM', checkOutTime: '7:00 PM', workingHours: 8 },
      'sales': { checkInTime: '9:00 AM', checkOutTime: '6:00 PM', workingHours: 8 },
      'technical': { checkInTime: '9:00 AM', checkOutTime: '6:00 PM', workingHours: 8 },
      'housekeeping': { checkInTime: '8:00 AM', checkOutTime: '5:00 PM', workingHours: 8 }
    };

    return defaultTimings[department as keyof typeof defaultTimings] || defaultTimings.operations;
  }
}
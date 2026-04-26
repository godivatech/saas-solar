/**
 * Manual Overtime Service
 * Handles user-controlled OT sessions with photo and location evidence
 */

import { storage } from '../storage';
import { EnterpriseTimeService } from './enterprise-time-service';
import { PayrollLockService } from './payroll-lock-service';
import { getUTCMidnight } from '../utils/timezone-helpers';

export interface OTStartRequest {
  userId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  imageUrl: string;
  address?: string;
  reason?: string;
  deviceInfo?: {
    type: 'mobile' | 'tablet' | 'desktop';
    userAgent?: string;
    locationCapability: 'excellent' | 'good' | 'limited' | 'poor';
  };
}

export interface OTEndRequest {
  userId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  imageUrl: string;
  address?: string;
  reason?: string;
}

export interface OTStartResponse {
  success: boolean;
  message: string;
  otSessionId?: string;
  otType: 'early_arrival' | 'late_departure' | 'weekend' | 'holiday';
  startTime: string;
  expectedEndTime?: string;
}

export interface OTEndResponse {
  success: boolean;
  message: string;
  otHours: number;
  totalWorkingHours: number;
  startTime: string;
  endTime: string;
}

export class ManualOTService {
  // NOTE: Caching is now handled by EnterpriseTimeService
  // This service was updated to use EnterpriseTimeService for consistency


  // ✅ REMOVED: startOTSession(), endOTSession(), getOTStatus()
  //    Frontend migrated to OTSessionService methods
  //    All OT data now in otSessions[] array only

  /**
   * Determine OT type based on current time and department timing
   * Unified method used by all services
   */
  public static async determineOTType(department: string, currentTime: Date): Promise<'early_arrival' | 'late_departure' | 'weekend' | 'holiday'> {
    try {
      // 1. Check if it's a company holiday (Priority 1)
      const { UnifiedAttendanceService } = await import('./unified-attendance-service');
      const { isHoliday } = await UnifiedAttendanceService.isHoliday(currentTime, department);
      if (isHoliday) {
        return 'holiday';
      }

      // 2. Check if weekend (Priority 2)
      const { CompanySettingsService } = await import('./company-settings-service');
      const isWeekend = await CompanySettingsService.isWeekend(currentTime);
      if (isWeekend) {
        return 'weekend';
      }

      // Use EnterpriseTimeService for consistent timing operations
      const { EnterpriseTimeService } = await import('./enterprise-time-service');
      const departmentTiming = await EnterpriseTimeService.getDepartmentTiming(department);

      if (!departmentTiming || !departmentTiming.isActive) {
        return 'late_departure'; // Default if no timing configured
      }

      // Parse department timing using EnterpriseTimeService
      const deptStartTime = EnterpriseTimeService.parseTimeToDate(
        departmentTiming.checkInTime,
        currentTime
      );
      const deptEndTime = EnterpriseTimeService.parseTimeToDate(
        departmentTiming.checkOutTime,
        currentTime
      );

      if (!deptStartTime || !deptEndTime) {
        return 'late_departure';
      }

      // Determine OT type based on current time vs department timing
      if (currentTime < deptStartTime) {
        return 'early_arrival';
      } else if (currentTime > deptEndTime) {
        return 'late_departure';
      } else {
        // During regular hours - shouldn't happen but default to late_departure
        return 'late_departure';
      }

    } catch (error) {
      console.error('Error determining OT type:', error);
      return 'late_departure';
    }
  }

  /**
   * Check if OT button should be available based on department timing
   * SECURITY: Fail-safe design - disables button on any error/missing data
   */
  static async isOTButtonAvailable(userId: string): Promise<{
    available: boolean;
    reason?: string;
    nextAvailableTime?: string;
  }> {
    try {
      // Validate user and department
      const user = await storage.getUser(userId);
      if (!user || !user.department) {
        console.warn('[OT-AVAILABILITY] User missing or no department assigned:', {
          userId,
          hasUser: !!user,
          hasDept: !!user?.department
        });
        return {
          available: false,
          reason: 'Department not assigned. Please contact administrator.'
        };
      }

      const currentTime = new Date();
      const dayOfWeek = currentTime.getDay();

      // ✅ CONFIGURABLE WEEKEND: Use CompanySettingsService for weekend detection
      const { CompanySettingsService } = await import('./company-settings-service');
      const isWeekend = await CompanySettingsService.isWeekend(currentTime);

      if (isWeekend) {
        console.log('[OT-AVAILABILITY] Weekend detected - OT available');
        return { available: true };
      }

      // 🛡️ CRITICAL: Check if today is a company holiday
      const { UnifiedAttendanceService } = await import('./unified-attendance-service');
      const { isHoliday, holiday } = await UnifiedAttendanceService.isHoliday(
        currentTime,
        user.department
      );

      if (isHoliday) {
        // Check if OT is allowed on this specific holiday
        if (!holiday || !holiday.allowOT) {
          console.log('[OT-AVAILABILITY] Holiday detected - OT NOT allowed:', holiday?.name);
          return {
            available: false,
            reason: `OT is not allowed on ${holiday?.name}. This is a company holiday.`
          };
        }
        // Holiday allows OT - continue to normal OT availability checks
        console.log('[OT-AVAILABILITY] Holiday detected - OT allowed:', holiday.name);
        // Note: Will still need to check department timing for early/late classification
      }

      // CRITICAL FIX: Use EnterpriseTimeService for consistent timing
      // This service provides default timings if not configured and handles all edge cases
      const { EnterpriseTimeService } = await import('./enterprise-time-service');
      const departmentTiming = await EnterpriseTimeService.getDepartmentTiming(user.department);

      // FAIL-SAFE: If timing is not active, disable button
      if (!departmentTiming || !departmentTiming.isActive) {
        console.warn('[OT-AVAILABILITY] Department timing not configured or inactive:', {
          dept: user.department,
          isActive: departmentTiming?.isActive,
          hasTiming: !!departmentTiming
        });
        return {
          available: false,
          reason: 'Department timing not configured. Please contact administrator.'
        };
      }

      // Parse department start and end times using EnterpriseTimeService
      const deptStartTime = EnterpriseTimeService.parseTimeToDate(
        departmentTiming.checkInTime,
        currentTime
      );
      const deptEndTime = EnterpriseTimeService.parseTimeToDate(
        departmentTiming.checkOutTime,
        currentTime
      );

      // FAIL-SAFE: If time parsing fails, disable button
      if (!deptStartTime || !deptEndTime) {
        console.error('[OT-AVAILABILITY] Time parsing failed:', {
          dept: user.department,
          checkInTime: departmentTiming.checkInTime,
          checkOutTime: departmentTiming.checkOutTime,
          parsedStart: deptStartTime,
          parsedEnd: deptEndTime
        });
        return {
          available: false,
          reason: 'Invalid department timing configuration. Please contact administrator.'
        };
      }

      // Debug logging for troubleshooting
      console.log('[OT-AVAILABILITY] Time check:', {
        userId,
        dept: user.department,
        currentTime: currentTime.toISOString(),
        deptStart: deptStartTime.toISOString(),
        deptEnd: deptEndTime.toISOString(),
        isBeforeStart: currentTime < deptStartTime,
        isAfterEnd: currentTime > deptEndTime
      });

      // Determine OT scenario
      const isEarlyArrival = currentTime < deptStartTime;
      const isLateDeparture = currentTime > deptEndTime;

      // ✅ SMART ATTENDANCE CHECK: OT-type aware
      // Early arrival: Employee CANNOT check in yet (before work hours)
      //   → Allow OT without attendance (will auto-create)
      // Late departure: Employee SHOULD have checked in already
      //   → Require attendance to prevent abuse
      const today = getUTCMidnight(new Date());
      const attendance = await storage.getAttendanceByUserAndDate(userId, today);

      if (!attendance && isLateDeparture) {
        console.log('[OT-AVAILABILITY] Late departure requires attendance - OT NOT available');
        return {
          available: false,
          reason: 'Please check in first before starting late departure OT.'
        };
      }

      // Early arrival OT (before work hours)
      if (isEarlyArrival) {
        console.log('[OT-AVAILABILITY] Early arrival - OT available', attendance ? '(has attendance)' : '(will auto-create)');
        return { available: true };
      }

      // Late departure OT (after work hours) - attendance already validated above
      if (isLateDeparture) {
        console.log('[OT-AVAILABILITY] Late departure with attendance - OT available');
        return { available: true };
      }

      // NOT AVAILABLE: During regular department hours
      console.log('[OT-AVAILABILITY] During work hours - OT NOT available');
      return {
        available: false,
        reason: `OT is only available before ${departmentTiming.checkInTime} or after ${departmentTiming.checkOutTime}`,
        nextAvailableTime: departmentTiming.checkOutTime
      };

    } catch (error) {
      // FAIL-SAFE: On ANY error, disable button and log details for debugging
      console.error('[OT-AVAILABILITY] Critical error - DISABLING button for security:', error);
      console.error('[OT-AVAILABILITY] Error details:', {
        userId,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      return {
        available: false,
        reason: 'System error checking OT availability. Please contact support if this persists.'
      };
    }
  }
}
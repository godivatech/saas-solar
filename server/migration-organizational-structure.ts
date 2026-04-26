import { storage } from './storage';
import { departments, designations } from '@shared/schema';

/**
 * Migration script to update organizational structure based on the organizational chart
 * 
 * Chart Analysis:
 * - CEO, GM, Officer -> Operations Department
 * - Executive -> Admin, HR, Marketing Departments
 * - CRE -> Sales Department (designation, not department)
 * - Team Leader, Technician, Welder -> Technical Department
 * - House Man -> Housekeeping Department
 */

export async function migrateOrganizationalStructure() {
  console.log('Starting organizational structure migration...');

  try {
    // Get all users
    const users = await storage.listUsers();
    console.log(`Found ${users.length} users to migrate`);

    // Legacy department mappings to new structure (only for historical data)
    const legacyDepartmentMap: Record<string, { department: string; designation: string }> = {
      // Legacy departments that may exist in old data
      'accounts': { department: 'admin', designation: 'executive' },
      'administration': { department: 'admin', designation: 'executive' },
      'human_resources': { department: 'hr', designation: 'executive' },
      'sales_and_marketing': { department: 'marketing', designation: 'executive' },
      'technical_team': { department: 'technical', designation: 'technician' },
      'cre': { department: 'sales', designation: 'cre' } // CRE was incorrectly used as department
    };

    let migratedCount = 0;
    for (const user of users) {
      let needsUpdate = false;
      const updateData: any = {};

      // Migrate legacy departments to current organizational structure
      if (user.department && legacyDepartmentMap[user.department]) {
        updateData.department = legacyDepartmentMap[user.department].department;
        updateData.designation = legacyDepartmentMap[user.department].designation;
        needsUpdate = true;
        console.log(`Migrating user ${user.email}: ${user.department} -> ${updateData.department} (${updateData.designation})`);
      }

      // Validate current department exists in schema
      if (user.department && !departments.includes(user.department as any)) {
        console.log(`Invalid department ${user.department} for user ${user.email}, setting to null`);
        updateData.department = null;
        updateData.designation = null;
        needsUpdate = true;
      }

      // Validate current designation exists in schema
      if (user.designation && !designations.includes(user.designation as any)) {
        console.log(`Invalid designation ${user.designation} for user ${user.email}, setting to null`);
        updateData.designation = null;
        needsUpdate = true;
      }

      // Legacy designation mapping (only for historical data)
      const legacyDesignationMap: Record<string, string> = {
        'director': 'ceo',
        'manager': 'gm', 
        'assistant_manager': 'officer',
        'senior_executive': 'team_leader',
        'junior_executive': 'cre',
        'trainee': 'technician',
        'intern': 'house_man'
      };

      if (user.designation && legacyDesignationMap[user.designation]) {
        updateData.designation = legacyDesignationMap[user.designation];
        needsUpdate = true;
        console.log(`Updating designation for ${user.email}: ${user.designation} -> ${updateData.designation}`);
      }

      if (needsUpdate) {
        await storage.updateUser(user.uid, updateData);
        migratedCount++;
      }
    }

    console.log(`Migration completed successfully! Migrated ${migratedCount} users.`);
    return { success: true, migratedCount };

  } catch (error) {
    console.error('Migration failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Default department timings for new organizational structure
export const newDepartmentTimings = {
  operations: {
    departmentId: 'operations',
    checkInTime: '9:00 AM',
    checkOutTime: '6:00 PM',
    workingHours: 9,
    overtimeThresholdMinutes: 30,
    lateThresholdMinutes: 15,
    isFlexibleTiming: true,
    flexibleCheckInStart: '08:30',
    flexibleCheckInEnd: '09:30',
    breakDurationMinutes: 60,
    weeklyOffDays: [0], // Sunday
    isActive: true
  },
  admin: {
    departmentId: 'admin',
    checkInTime: '9:30 AM',
    checkOutTime: '6:30 PM',
    workingHours: 8,
    overtimeThresholdMinutes: 30,
    lateThresholdMinutes: 15,
    isFlexibleTiming: false,
    breakDurationMinutes: 60,
    weeklyOffDays: [0], // Sunday
    isActive: true
  },
  hr: {
    departmentId: 'hr',
    checkInTime: '9:30 AM',
    checkOutTime: '6:30 PM',
    workingHours: 8,
    overtimeThresholdMinutes: 30,
    lateThresholdMinutes: 15,
    isFlexibleTiming: false,
    breakDurationMinutes: 60,
    weeklyOffDays: [0], // Sunday
    isActive: true
  },
  marketing: {
    departmentId: 'marketing',
    checkInTime: '9:30 AM',
    checkOutTime: '6:30 PM',
    workingHours: 8,
    overtimeThresholdMinutes: 30,
    lateThresholdMinutes: 15,
    isFlexibleTiming: false,
    breakDurationMinutes: 60,
    weeklyOffDays: [0], // Sunday
    isActive: true
  },
  sales: {
    departmentId: 'sales',
    checkInTime: '9:00 AM',
    checkOutTime: '6:00 PM',
    workingHours: 8,
    overtimeThresholdMinutes: 30,
    lateThresholdMinutes: 15,
    isFlexibleTiming: true,
    flexibleCheckInStart: '08:30',
    flexibleCheckInEnd: '09:30',
    breakDurationMinutes: 60,
    weeklyOffDays: [0], // Sunday
    isActive: true
  },
  technical: {
    departmentId: 'technical',
    checkInTime: '8:00 AM',
    checkOutTime: '5:00 PM',
    workingHours: 8,
    overtimeThresholdMinutes: 30,
    lateThresholdMinutes: 15,
    isFlexibleTiming: false,
    breakDurationMinutes: 60,
    weeklyOffDays: [0], // Sunday
    isActive: true
  },
  housekeeping: {
    departmentId: 'housekeeping',
    checkInTime: '7:00 AM',
    checkOutTime: '4:00 PM',
    workingHours: 8,
    overtimeThresholdMinutes: 30,
    lateThresholdMinutes: 15,
    isFlexibleTiming: false,
    breakDurationMinutes: 60,
    weeklyOffDays: [0], // Sunday
    isActive: true
  }
};
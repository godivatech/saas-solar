/**
 * User-Friendly Messages Utility
 * Converts technical terms to everyday language for non-technical users
 */

export const userFriendlyMessages = {
  // Location and GPS messages
  location: {
    'Excellent GPS Signal': 'Perfect location found',
    'Good GPS Signal': 'Location detected successfully',
    'Fair GPS Signal': 'Location found (works fine indoors)',
    'Poor GPS Signal': 'Location signal is weak',
    'Office Location Detected': 'You are at the office',
    'Location Verified': 'Location confirmed',
    'Location Signal Weak': 'Having trouble finding your location',

    // Technical terms to friendly terms
    'GPS Accuracy': 'Location accuracy',
    'Network Positioning': 'Office network location',
    'Indoor compensation': 'Indoor location detected',
    'Proximity based': 'Close to office',
    'Geofence validation': 'Office boundary check'
  },

  // Attendance status messages
  attendance: {
    'check_in': 'Clock In',
    'check_out': 'Clock Out',
    'break_start': 'Start Break',
    'break_end': 'End Break',
    'remote_work': 'Working from Home',
    'field_work': 'Field Work',
    'office_work': 'Office Work',
    'overtime': 'Extra Hours',
    'late_arrival': 'Late Arrival',
    'early_departure': 'Early Leave',
    'approve': 'Approved',
    'reject': 'Rejected',
    'update_status': 'Updated',
    'present': 'Present',
    'absent': 'Absent',
    'half_day': 'Half Day',
    'on_leave': 'On Leave'
  },

  // Department names (more friendly)
  departments: {
    'operations': 'Operations',
    'admin': 'Administration',
    'hr': 'Human Resources',
    'marketing': 'Marketing',
    'sales': 'Sales',
    'technical': 'Technical',
    'housekeeping': 'Facilities'
  },

  // Error messages in plain language
  errors: {
    'Auth verification failed': 'Please sign in again',
    'Token expired': 'Your session has expired, please sign in',
    'Permission denied': 'You don\'t have access to this feature',
    'Validation error': 'Please check your information and try again',
    'Network error': 'Connection problem - please check your internet',
    'Server error': 'Something went wrong on our end',
    'Location timeout': 'Taking too long to find your location',
    'Camera permission denied': 'Please allow camera access to take photos',
    'Location permission denied': 'Please allow location access for attendance',
    'Failed to update attendance records': 'Could not save attendance changes',
    'Failed to perform bulk action': 'Could not apply changes to multiple records',
    'Failed to fetch': 'Could not connect to server',
    'Unauthorized': 'You need to sign in first'
  },

  // Success messages
  success: {
    'Attendance marked successfully': 'Your attendance has been recorded',
    'Profile updated': 'Your information has been saved',
    'Settings saved': 'Your preferences have been updated',
    'Data exported': 'Your report is ready to download',
    'Bulk operation completed': 'All changes have been applied'
  },

  // Form field labels (simplified)
  fields: {
    'employeeId': 'Employee ID',
    'reportingManagerId': 'Manager',
    'payrollGrade': 'Salary Level',
    'checkInTime': 'Start Time',
    'checkOutTime': 'End Time',
    'overtimeThresholdMinutes': 'Extra Hours Limit',
    'lateThresholdMinutes': 'Late Arrival Limit',
    'isFlexibleTiming': 'Flexible Hours',
    'epfEmployeeRate': 'Retirement Fund (Employee)',
    'epfEmployerRate': 'Retirement Fund (Company)',
    'esiEmployeeRate': 'Medical Insurance (Employee)',
    'esiEmployerRate': 'Medical Insurance (Company)',
    'tdsRate': 'Income Tax Rate',
    'basicSalary': 'Base Salary',
    'hra': 'House Rent Allowance',
    'conveyanceAllowance': 'Travel Allowance',
    'medicalAllowance': 'Medical Allowance',
    'professionalTax': 'Professional Tax',
    'standardWorkingDays': 'Working Days per Month',
    'standardWorkingHours': 'Working Hours per Day'
  }
};

export function getUserFriendlyMessage(technicalMessage: string, category?: keyof typeof userFriendlyMessages): string {
  if (!technicalMessage) return '';

  // Try exact match first
  if (category && userFriendlyMessages[category]) {
    const categoryMessages = userFriendlyMessages[category] as Record<string, string>;
    if (categoryMessages[technicalMessage]) {
      return categoryMessages[technicalMessage];
    }
  }

  // Try partial matches across all categories
  for (const cat of Object.keys(userFriendlyMessages)) {
    const messages = userFriendlyMessages[cat as keyof typeof userFriendlyMessages] as Record<string, string>;
    for (const [tech, friendly] of Object.entries(messages)) {
      if (technicalMessage.toLowerCase().includes(tech.toLowerCase())) {
        return friendly;
      }
    }
  }

  // Return original if no match found
  return technicalMessage;
}

export function getSimplifiedFieldLabel(fieldName: string): string {
  return userFriendlyMessages.fields[fieldName as keyof typeof userFriendlyMessages.fields] || fieldName;
}
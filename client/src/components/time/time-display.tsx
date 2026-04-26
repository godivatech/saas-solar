/**
 * Enterprise Time Display Component
 * Standardized 12-hour format display throughout the application
 */

import React from 'react';
import { formatDistanceToNow, format } from 'date-fns';

interface TimeDisplayProps {
  time: string | Date;
  format12Hour?: boolean;
  showSeconds?: boolean;
  showDate?: boolean;
  relative?: boolean;
  className?: string;
}

export function TimeDisplay({ 
  time, 
  format12Hour = true, 
  showSeconds = false, 
  showDate = false,
  relative = false,
  className = ""
}: TimeDisplayProps) {
  if (!time) return <span className={className}>--</span>;
  
  // Handle time-only strings from database (e.g., "12:46", "9:30", "09:00", "19:00")
  if (typeof time === 'string') {
    // Check if it's already in 12-hour format (with AM/PM)
    const time12HourRegex = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;
    const time12Match = time.match(time12HourRegex);
    
    if (time12Match) {
      // Already in 12-hour format, return as-is
      return (
        <span className={className}>
          {time}
        </span>
      );
    }
    
    // Legacy: Time without AM/PM is now deprecated, assume malformed data
    const timeOnlyRegex = /^(\d{1,2}):(\d{2})$/;
    const match = time.match(timeOnlyRegex);
    
    if (match) {
      console.warn('DEPRECATED: Found time without AM/PM suffix, treating as malformed:', time);
      return <span className={`${className} text-red-500`}>Invalid Time</span>;
    }
    
    // Try to parse as full date string
    const date = new Date(time);
    if (!isNaN(date.getTime())) {
      if (relative) {
        return (
          <span className={className} title={formatTime(date, format12Hour, showSeconds, showDate)}>
            {formatDistanceToNow(date, { addSuffix: true })}
          </span>
        );
      }
      return (
        <span className={className}>
          {formatTime(date, format12Hour, showSeconds, showDate)}
        </span>
      );
    }
    
    return <span className={className}>Invalid time</span>;
  }
  
  // Handle Date objects
  const date = time;
  if (isNaN(date.getTime())) {
    return <span className={className}>Invalid time</span>;
  }

  if (relative) {
    return (
      <span className={className} title={formatTime(date, format12Hour, showSeconds, showDate)}>
        {formatDistanceToNow(date, { addSuffix: true })}
      </span>
    );
  }

  return (
    <span className={className}>
      {formatTime(date, format12Hour, showSeconds, showDate)}
    </span>
  );
}

function formatTime(date: Date, format12Hour: boolean, showSeconds: boolean, showDate: boolean): string {
  // Convert to Indian Standard Time if needed
  const indianTime = new Date(date);
  
  // Use native JavaScript formatting with Indian timezone
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Kolkata',
    hour12: format12Hour,
    hour: 'numeric',
    minute: '2-digit'
  };
  
  if (showSeconds) {
    options.second = '2-digit';
  }
  
  if (showDate) {
    options.month = 'short';
    options.day = 'numeric';
    options.year = 'numeric';
  }
  
  return indianTime.toLocaleString('en-IN', options);
}

// Utility function to format time consistently across the app
export function formatTimeFor12Hour(time: string | Date): string {
  if (!time) return '--';
  
  const date = typeof time === 'string' ? new Date(time) : time;
  
  if (isNaN(date.getTime())) return 'Invalid time';
  
  return format(date, 'h:mm a');
}

// Utility function to format time with date
export function formatDateTimeFor12Hour(time: string | Date): string {
  if (!time) return '--';
  
  const date = typeof time === 'string' ? new Date(time) : time;
  
  if (isNaN(date.getTime())) return 'Invalid date/time';
  
  return format(date, 'MMM dd, yyyy h:mm a');
}

// Utility to check if time string is in 12-hour format
export function is12HourFormat(timeString: string): boolean {
  return /\d{1,2}:\d{2}\s*(AM|PM)/i.test(timeString);
}

// DEPRECATED: 24-hour format functions removed
// System now uses 12-hour format exclusively throughout the entire application
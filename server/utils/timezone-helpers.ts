/**
 * Timezone-Safe Date Utilities
 * 
 * Provides UTC-based date helpers to ensure consistent date handling
 * regardless of server timezone. All functions return UTC-normalized dates.
 * 
 * WHY UTC?
 * - Firestore Timestamps are internally UTC
 * - Prevents timezone-related bugs at month/day boundaries
 * - Ensures consistent behavior across deployments
 * 
 * USAGE:
 * - Use getUTCMidnight() for start-of-day queries
 * - Use getUTCEndOfDay() for end-of-day queries
 * - Use getISTDateString() for display/filtering
 */

/**
 * Get UTC midnight (00:00:00.000) for a given date
 * 
 * Calendar-safe conversion: converts the input date to IST calendar date
 * and returns midnight in UTC (00:00:00.000Z), immune to server timezone
 * and off-by-one day shifts for early-morning IST timestamps.
 * 
 * @example
 * // Input: IST 2026-01-03 01:30 (which is 2026-01-02 20:00 UTC)
 * // Output: 2026-01-03 00:00:00.000 UTC
 * const istDate = new Date('2026-01-03T01:30:00+05:30');
 * const utcMidnight = getUTCMidnight(istDate);
 * // utcMidnight.toISOString() === '2026-01-03T00:00:00.000Z'
 * 
 * @param date - Input date (any timezone)
 * @returns Date object set to 00:00:00.000 UTC on the same calendar date
 */
export function getUTCMidnight(date: Date): Date {
    const istDateStr = getISTDateString(date);
    return new Date(`${istDateStr}T00:00:00.000Z`);
}

/**
 * Get UTC end-of-day (23:59:59.999) for a given date
 * 
 * Calendar-safe conversion: converts the input date to IST calendar date
 * and returns end-of-day in UTC (23:59:59.999Z).
 * 
 * @example
 * const endOfDay = getUTCEndOfDay(new Date('2026-01-03'));
 * // endOfDay.toISOString() === '2026-01-03T23:59:59.999Z'
 * 
 * @param date - Input date (any timezone)
 * @returns Date object set to 23:59:59.999 UTC on the same calendar date
 */
export function getUTCEndOfDay(date: Date): Date {
    const istDateStr = getISTDateString(date);
    return new Date(`${istDateStr}T23:59:59.999Z`);
}

/**
 * Convert date to IST date string (YYYY-MM-DD format)
 * 
 * Formats date as it would appear in Asia/Kolkata timezone.
 * Useful for display, logging, and client-side filtering.
 * 
 * @example
 * // UTC: 2026-01-03 20:00 (8 PM UTC)
 * // IST: 2026-01-04 01:30 (next day in India)
 * const utcDate = new Date('2026-01-03T20:00:00Z');
 * const istString = getISTDateString(utcDate);
 * // istString === '2026-01-04' (next day in IST)
 * 
 * @param date - Input date (any timezone)
 * @returns Date string in YYYY-MM-DD format (IST timezone)
 */
export function getISTDateString(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}

/**
 * Get current date in IST as UTC midnight
 * 
 * Combines getISTDateString() and getUTCMidnight() to get
 * "today" in IST timezone, but as a UTC Date object.
 * 
 * Useful for CRON jobs and server-side "today" logic.
 * 
 * @example
 * // Server time: 2026-01-03 22:00 UTC (which is 2026-01-04 03:30 IST)
 * const istToday = getISTTodayAsUTC();
 * // Returns: 2026-01-04 00:00:00 UTC (representing IST "today")
 * 
 * @returns Date object representing IST "today" at UTC midnight
 */
export function getISTTodayAsUTC(): Date {
    const istDateStr = getISTDateString(new Date());
    return new Date(istDateStr + 'T00:00:00.000Z');
}

/**
 * Create date range for querying (both in UTC midnight)
 * 
 * Helper to create start/end dates for date range queries.
 * Both dates are normalized to UTC midnight for consistent querying.
 * 
 * @param startDate - Start date (any timezone)
 * @param endDate - End date (any timezone)  
 * @returns Object with utcStart (00:00 UTC) and utcEnd (23:59:59.999 UTC)
 */
export function getUTCDateRange(startDate: Date, endDate: Date): {
    utcStart: Date;
    utcEnd: Date;
} {
    return {
        utcStart: getUTCMidnight(startDate),
        utcEnd: getUTCEndOfDay(endDate)
    };
}

/**
 * Get day of week in IST (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 * Immune to server timezone and DST.
 * 
 * @param date - Input date (any timezone)
 * @returns 0 for Sunday, 1 for Monday, ..., 6 for Saturday in Indian Standard Time
 */
export function getISTDayOfWeek(date: Date): number {
    const istDateStr = getISTDateString(date);
    return new Date(`${istDateStr}T12:00:00.000Z`).getUTCDay();
}

/**
 * Check if two dates represent the same calendar day in Indian Standard Time
 * 
 * @param date1 - First date
 * @param date2 - Second date
 * @returns true if both dates represent the same calendar day in IST
 */
export function isSameUTCDate(date1: Date, date2: Date): boolean {
    return getISTDateString(date1) === getISTDateString(date2);
}

/**
 * Format date for logging with both UTC and IST
 * 
 * Useful for debugging timezone-related issues.
 * 
 * @param date - Date to format
 * @param label - Optional label for the log
 * @returns Formatted string with UTC and IST representations
 */
export function formatDateForLogging(date: Date, label?: string): string {
    const utcStr = date.toISOString();
    const istStr = date.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'medium'
    });

    return label
        ? `${label}: ${utcStr} (IST: ${istStr})`
        : `UTC: ${utcStr} | IST: ${istStr}`;
}


import 'dotenv/config';
import { storage } from './storage';

// Logic copied from ManualOTService to simulate and debug
async function simulateOTButtonCheck(department: string) {
    console.log(`\n--- Simulating Check for Department: ${department} ---`);
    try {
        const timing = await storage.getDepartmentTiming(department);
        console.log('Raw Department Timing from DB:', JSON.stringify(timing, null, 2));

        if (!timing) {
            console.log('RESULT: Department timing is NULL. Original code returns { available: true }');
            return;
        }

        const currentTime = new Date();
        console.log('Current Time used for check:', currentTime.toISOString());

        const parseTime12Hour = (timeStr: string, referenceDate: Date) => {
            try {
                if (!timeStr) return null;
                const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
                if (!match) return null;

                const [, hourStr, minuteStr, period] = match;
                let hour = parseInt(hourStr);
                const minute = parseInt(minuteStr);

                if (period.toUpperCase() === 'PM' && hour !== 12) hour += 12;
                else if (period.toUpperCase() === 'AM' && hour === 12) hour = 0;

                const istOffset = 5.5 * 60 * 60 * 1000;
                const result = new Date(referenceDate);
                result.setUTCFullYear(referenceDate.getUTCFullYear());
                result.setUTCMonth(referenceDate.getUTCMonth());
                result.setUTCDate(referenceDate.getUTCDate());
                result.setUTCHours(hour, minute, 0, 0);

                return new Date(result.getTime() - istOffset);
            } catch (e) { return null; }
        };

        const deptStartTime = parseTime12Hour(timing.checkInTime, currentTime);
        const deptEndTime = parseTime12Hour(timing.checkOutTime, currentTime);

        console.log(`Parsed Start Time: ${deptStartTime?.toISOString()}`);
        console.log(`Parsed End Time: ${deptEndTime?.toISOString()}`);

        if (!deptStartTime || !deptEndTime) {
            console.log('RESULT: Time parsing failed. Original code returns { available: true }');
            return;
        }

        if (currentTime < deptStartTime) {
            console.log('RESULT: Current time is BEFORE start. OT Available (Correct behaviour)');
        } else if (currentTime > deptEndTime) {
            console.log('RESULT: Current time is AFTER end. OT Available (Correct behaviour)');
        } else {
            console.log('RESULT: Current time is DURING work hours. OT SHOULD BE DISABLED (If this line is reached)');
        }

    } catch (error) {
        console.log('RESULT: Error occurred:', error);
        console.log('Original code catches error and returns { available: true }');
    }
}

async function runAnalysis() {
    console.log('Starting OT Analysis...');
    try {
        const users = await storage.listUsers();
        console.log(`Found ${users.length} users.`);

        // Group by department to avoid duplicates
        const departments = new Set<string>();
        for (const user of users) {
            if (user.department) departments.add(user.department);
        }

        console.log('Found departments:', Array.from(departments));

        for (const dept of departments) {
            await simulateOTButtonCheck(dept);
        }

    } catch (err) {
        console.error('Fatal error running analysis:', err);
    }
    process.exit(0);
}

runAnalysis();

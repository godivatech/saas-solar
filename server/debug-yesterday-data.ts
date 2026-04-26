import 'dotenv/config';
import { storage } from './storage';

async function analyze() {
    console.log('--- Analyzing Attendance Records for 2026-01-05 ---');

    const dateStr = '2026-01-05';
    const targetDate = new Date(dateStr + 'T00:00:00Z');

    try {
        // Get all records for that date
        // listAttendanceByDateRange(startDate, endDate)
        const records = await storage.listAttendanceByDateRange(targetDate, targetDate);

        console.log(`Found ${records.length} records for ${dateStr}`);

        for (const record of records) {
            console.log(`\nUser: ${record.userId} (${record.userEmail})`);
            console.log(`Attendance ID: ${record.id}`);
            console.log(`Status: ${record.status}`);
            console.log(`Admin Review: ${record.adminReviewStatus}`);
            console.log(`OT Sessions: ${JSON.stringify(record.otSessions, null, 2)}`);
            console.log(`Auto Corrected: ${record.autoCorrected} / Reason: ${record.autoCorrectionReason}`);
        }
    } catch (error) {
        console.error('Error during analysis:', error);
    }
}

analyze().then(() => process.exit(0));

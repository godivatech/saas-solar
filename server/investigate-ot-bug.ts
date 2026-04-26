/**
 * OT Hours Bug Investigation Script
 * Answers all 5 questions with actual database facts
 */

import { storage } from './storage';

async function investigateOTBug() {
    console.log('═══════════════════════════════════════════════');
    console.log('🔍 OT Hours Bug Investigation');
    console.log('═══════════════════════════════════════════════\n');

    // Question 1: Find Vishnu's session and check its state
    console.log('1️⃣ CHECKING VISHNU\'S SESSION STATE...\n');

    try {
        // Find user Vishnu
        const allUsers = await storage.listUsers();
        const vishnu = allUsers.find((u: any) =>
            u.displayName?.toLowerCase().includes('vishnu') ||
            u.email?.toLowerCase().includes('vishnu')
        );

        if (!vishnu) {
            console.log('❌ User "vishnu" not found');
            return;
        }

        console.log(`✅ Found user: ${vishnu.displayName} (${vishnu.email})`);
        console.log(`   Department: ${vishnu.department}`);
        console.log(`   Designation: ${vishnu.designation}\n`);

        // Get attendance for Jan 5, 2026
        const targetDate = new Date('2026-01-05');
        const attendance = await storage.getAttendanceByUserAndDate(vishnu.id, targetDate);

        if (!attendance) {
            console.log('❌ No attendance record found for 2026-01-05');
            return;
        }

        console.log(`✅ Found attendance record: ${attendance.id}`);
        console.log(`   Date: ${attendance.date}`);
        console.log(`   OT Sessions: ${attendance.otSessions?.length || 0}\n`);

        if (!attendance.otSessions || attendance.otSessions.length === 0) {
            console.log('❌ No OT sessions found');
            return;
        }

        // Find the early_arrival session
        const earlyArrivalSession = attendance.otSessions.find((s: any) => s.otType === 'early_arrival');

        if (!earlyArrivalSession) {
            console.log('❌ No early_arrival OT session found');
            console.log('Available sessions:', attendance.otSessions.map((s: any) => s.otType));
            return;
        }

        console.log('✅ FOUND THE SESSION!\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('SESSION DETAILS:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Session ID:        ${earlyArrivalSession.sessionId}`);
        console.log(`Session Number:    ${earlyArrivalSession.sessionNumber}`);
        console.log(`OT Type:           ${earlyArrivalSession.otType}`);
        console.log(`Status:            ${earlyArrivalSession.status}`);
        console.log(`Start Time:        ${earlyArrivalSession.startTime}`);
        console.log(`End Time:          ${earlyArrivalSession.endTime}`);
        console.log(`OT Hours:          ${earlyArrivalSession.otHours}`);
        console.log(`Auto Closed At:    ${earlyArrivalSession.autoClosedAt || 'NOT AUTO-CLOSED'}`);
        console.log(`Auto Close Note:   ${earlyArrivalSession.autoClosedNote || 'N/A'}`);
        console.log(`Review Action:     ${earlyArrivalSession.reviewAction || 'NOT REVIEWED'}`);
        console.log(`Reviewed By:       ${earlyArrivalSession.reviewedBy || 'N/A'}`);
        console.log(`Reviewed At:       ${earlyArrivalSession.reviewedAt || 'N/A'}`);
        console.log(`Review Notes:      ${earlyArrivalSession.reviewNotes || 'N/A'}`);
        console.log(`Original OT Hours: ${earlyArrivalSession.originalOTHours || 'N/A'}`);
        console.log(`Adjusted OT Hours: ${earlyArrivalSession.adjustedOTHours || 'N/A'}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Calculate what the hours SHOULD be
        if (earlyArrivalSession.startTime && earlyArrivalSession.endTime) {
            const start = new Date(earlyArrivalSession.startTime);
            const end = new Date(earlyArrivalSession.endTime);
            const calculatedHours = ((end.getTime() - start.getTime()) / (1000 * 60 * 60)).toFixed(2);

            console.log('📊 CALCULATION CHECK:');
            console.log(`   Actual Start:      ${start.toLocaleString()}`);
            console.log(`   Actual End:        ${end.toLocaleString()}`);
            console.log(`   Calculated Hours:  ${calculatedHours}h`);
            console.log(`   Stored Hours:      ${earlyArrivalSession.otHours}h`);
            console.log(`   Difference:        ${(parseFloat(calculatedHours) - earlyArrivalSession.otHours).toFixed(2)}h\n`);
        }

        // Question 2: Determine approval action
        console.log('\n2️⃣ APPROVAL ACTION ANALYSIS:\n');
        if (earlyArrivalSession.reviewAction === 'APPROVED') {
            console.log('✅ Action was: APPROVED (system should have recalculated)');
        } else if (earlyArrivalSession.reviewAction === 'ADJUSTED') {
            console.log('✅ Action was: ADJUSTED (admin manually set hours)');
        } else {
            console.log('⚠️  No review action recorded');
        }

    } catch (error) {
        console.error('Error investigating session:', error);
    }

    // Question 3: Check for capping logic
    console.log('\n3️⃣ CHECKING FOR CAPPING LOGIC...\n');

    try {
        const settings = await storage.getCompanySettings();
        console.log('Company Settings:');
        console.log(`   maxOTHoursPerDay:   ${settings?.maxOTHoursPerDay || 'NOT SET'}`);
        console.log(`   defaultOTRate:      ${settings?.defaultOTRate || 'NOT SET'}`);
        console.log(`   weekendOTRate:      ${settings?.weekendOTRate || 'NOT SET'}`);
        console.log(`   Weekend Days:       ${settings?.weekendDays?.join(', ') || 'NOT SET'}\n`);
    } catch (error) {
        console.error('Error fetching company settings:', error);
    }

    // Question 4: Find other sessions with the same issue
    console.log('\n4️⃣ SEARCHING FOR OTHER AFFECTED SESSIONS...\n');

    try {
        // Get all attendance records from the last 3 months
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        const allAttendance = await storage.listAttendanceBetweenDates(threeMonthsAgo, new Date());

        let affectedSessions = 0;
        let affectedAttendance = [];

        for (const attendance of allAttendance) {
            if (attendance.otSessions && Array.isArray(attendance.otSessions)) {
                for (const session of attendance.otSessions) {
                    // Check for approved sessions that were auto-closed with 0 hours
                    if (
                        session.status === 'APPROVED' &&
                        session.autoClosedAt &&
                        session.otHours === 0
                    ) {
                        affectedSessions++;
                        affectedAttendance.push({
                            attendanceId: attendance.id,
                            userId: attendance.userId,
                            date: attendance.date,
                            sessionId: session.sessionId,
                            otHours: session.otHours,
                            reviewAction: session.reviewAction
                        });
                    }
                }
            }
        }

        console.log(`📊 RESULTS:`);
        console.log(`   Total attendance records checked: ${allAttendance.length}`);
        console.log(`   Affected sessions found: ${affectedSessions}\n`);

        if (affectedSessions > 0) {
            console.log('⚠️  AFFECTED SESSIONS (status=APPROVED, autoClosedAt exists, otHours=0):');
            affectedAttendance.slice(0, 10).forEach((item, idx) => {
                console.log(`   ${idx + 1}. Date: ${item.date}, User: ${item.userId}, Session: ${item.sessionId}`);
            });
            if (affectedSessions > 10) {
                console.log(`   ... and ${affectedSessions - 10} more\n`);
            }
        } else {
            console.log('✅ No other affected sessions found\n');
        }

    } catch (error) {
        console.error('Error searching for affected sessions:', error);
    }

    // Question 5: Current approval logic analysis
    console.log('\n5️⃣ CURRENT APPROVAL LOGIC ANALYSIS:\n');
    console.log('Current behavior in code:');
    console.log('   - APPROVED: Preserves existing otHours (does NOT recalculate)');
    console.log('   - ADJUSTED: Uses admin-provided adjustedHours value');
    console.log('   - REJECTED: Marks session as rejected\n');

    console.log('Design Decision Needed:');
    console.log('   Option A: APPROVED always recalculates from startTime/endTime');
    console.log('   Option B: APPROVED preserves otHours (admin must use ADJUSTED)\n');

    console.log('═══════════════════════════════════════════════');
    console.log('Investigation Complete');
    console.log('═══════════════════════════════════════════════');
}

// Run the investigation
investigateOTBug()
    .then(() => {
        console.log('\n✅ Investigation completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Investigation failed:', error);
        process.exit(1);
    });

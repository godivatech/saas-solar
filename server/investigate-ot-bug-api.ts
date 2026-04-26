/**
 * OT Bug Investigation - API-based version
 * Run this while the server is running
 */

async function investigateViaAPI() {
    const baseURL = 'http://localhost:5000';

    console.log('═══════════════════════════════════════════════');
    console.log('🔍 OT Hours Bug Investigation (API Method)');
    console.log('═══════════════════════════════════════════════\n');

    // You'll need to manually provide the auth token
    const authToken = 'YOUR_ADMIN_AUTH_TOKEN_HERE';

    if (authToken === 'YOUR_ADMIN_AUTH_TOKEN_HERE') {
        console.log('❌ ERROR: Please provide a valid admin auth token');
        console.log('\nHow to get your token:');
        console.log('1. Open browser DevTools (F12)');
        console.log('2. Go to Application tab -> Local Storage');
        console.log('3. Find the auth token');
        console.log('4. Replace YOUR_ADMIN_AUTH_TOKEN_HERE in this script\n');
        return;
    }

    const headers = {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
    };

    try {
        // 1. Get all users to find Vishnu
        console.log('1️⃣ Finding user "vishnu"...\n');
        const usersRes = await fetch(`${baseURL}/api/users`, { headers });
        const users = await usersRes.json();

        const vishnu = users.find((u: any) =>
            u.displayName?.toLowerCase().includes('vishnu')
        );

        if (!vishnu) {
            console.log('❌ User vishnu not found');
            return;
        }

        console.log(`✅ Found: ${vishnu.displayName} (${vishnu.email})`);
        console.log(`   ID: ${vishnu.id}`);
        console.log(`   Department: ${vishnu.department}\n`);

        // 2. Get OT reports for January 2026
        console.log('2️⃣ Fetching OT reports for January 2026...\n');
        const reportsRes = await fetch(
            `${baseURL}/api/ot/reports?startDate=2026-01-01&endDate=2026-01-31&userId=${vishnu.id}`,
            { headers }
        );
        const reportsData = await reportsRes.json();

        console.log(`✅ Found ${reportsData.sessions?.length || 0} OT sessions\n`);

        // 3. Find the Jan 5 early_arrival session
        const targetSession = reportsData.sessions?.find((s: any) =>
            new Date(s.date).toDateString() === new Date('2026-01-05').toDateString() &&
            s.otType === 'early_arrival'
        );

        if (!targetSession) {
            console.log('❌ Session not found for Jan 5, 2026');
            console.log('Available sessions:', reportsData.sessions?.map((s: any) => ({
                date: s.date,
                type: s.otType,
                hours: s.otHours
            })));
            return;
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('SESSION DETAILS:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Session ID:        ${targetSession.sessionId}`);
        console.log(`Date:              ${targetSession.date}`);
        console.log(`OT Type:           ${targetSession.otType}`);
        console.log(`Status:            ${targetSession.status}`);
        console.log(`Start Time:        ${targetSession.startTime}`);
        console.log(`End Time:          ${targetSession.endTime}`);
        console.log(`OT Hours (stored): ${targetSession.otHours}h`);
        console.log(`Auto Closed:       ${targetSession.autoClosedAt || 'NO'}`);
        console.log(`Review Action:     ${targetSession.reviewAction || 'NOT REVIEWED'}`);
        console.log(`Review Notes:      ${targetSession.reviewNotes || 'N/A'}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Calculate actual hours
        const start = new Date(targetSession.startTime);
        const end = new Date(targetSession.endTime);
        const actualHours = ((end.getTime() - start.getTime()) / (1000 * 60 * 60)).toFixed(2);

        console.log('📊 CALCULATION VERIFICATION:');
        console.log(`   Start:             ${start.toLocaleString()}`);
        console.log(`   End:               ${end.toLocaleString()}`);
        console.log(`   Calculated Hours:  ${actualHours}h`);
        console.log(`   Stored Hours:      ${targetSession.otHours}h`);
        console.log(`   DISCREPANCY:       ${(parseFloat(actualHours) - targetSession.otHours).toFixed(2)}h ❌\n`);

        // Answer the 5 questions
        console.log('\n═══════════════════════════════════════════════');
        console.log('ANSWERS TO YOUR 5 QUESTIONS:');
        console.log('═══════════════════════════════════════════════\n');

        console.log('1️⃣ Session State (FACT CHECK):');
        console.log(`   autoClosedAt: ${targetSession.autoClosedAt ? 'YES' : 'NO'}`);
        console.log(`   startTime: ${targetSession.startTime}`);
        console.log(`   endTime: ${targetSession.endTime}`);
        console.log(`   otHours: ${targetSession.otHours}`);
        console.log(`   status: ${targetSession.status}`);
        console.log(`   reviewAction: ${targetSession.reviewAction || 'UNKNOWN'}\n`);

        console.log('2️⃣ Approval Method:');
        if (targetSession.reviewAction === 'APPROVED') {
            console.log(`   ✅ APPROVED - This is a SYSTEM BUG`);
            console.log(`   The system should have recalculated hours but didn't\n`);
        } else if (targetSession.reviewAction === 'ADJUSTED') {
            console.log(`   ✅ ADJUSTED - Admin manually set ${targetSession.otHours}h`);
            console.log(`   This was intentional, but possibly incorrect\n`);
        } else {
            console.log(`   ⚠️  Unknown review action\n`);
        }

        console.log('3️⃣ Capping Logic:');
        console.log(`   Company maxOTHoursPerDay setting: Check OT Administration page`);
        console.log(`   (Cannot query this via OT reports API)\n`);

        console.log('4️⃣ Other Affected Sessions:');
        const potentiallyAffected = reportsData.sessions?.filter((s: any) =>
            s.status === 'APPROVED' &&
            s.autoClosedAt &&
            s.otHours < 1
        );
        console.log(`   Found ${potentiallyAffected?.length || 0} other sessions with similar pattern\n`);

        console.log('5️⃣ Design Decision Needed:');
        console.log(`   Current behavior: APPROVED preserves otHours`);
        console.log(`   Proposed fix: APPROVED should recalculate if autoClosedAt exists`);
        console.log(`   Your decision: ???\n`);

    } catch (error: any) {
        console.error('❌ Error:', error.message);
    }
}

// Instructions
console.log('\n📋 INSTRUCTIONS:');
console.log('1. Make sure the dev server is running (npm run dev)');
console.log('2. Login as admin in the browser');
console.log('3. Get your auth token from DevTools');
console.log('4. Update the authToken variable in this script');
console.log('5. Run: npx tsx server/investigate-ot-bug-api.ts\n');

// Uncomment to run:
// investigation();

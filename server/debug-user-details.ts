import 'dotenv/config';
import { storage } from './storage';
import { EnterpriseTimeService } from './services/enterprise-time-service';

async function analyze() {
    const emails = ['lmnqjar@gmail.com', 'new4@gmail.com'];

    for (const email of emails) {
        console.log(`\n--- User: ${email} ---`);
        const userSnap = await storage.db.collection('users').where('email', '==', email).get();
        if (userSnap.empty) {
            console.log('User not found');
            continue;
        }
        const user = userSnap.docs[0].data();
        console.log(`User ID: ${userSnap.docs[0].id}`);
        console.log(`Role: ${user.role}`);
        console.log(`Department: ${user.department}`);

        if (user.department) {
            const timing = await EnterpriseTimeService.getDepartmentTiming(user.department);
            console.log(`Timing: ${JSON.stringify(timing, null, 2)}`);
        } else {
            console.log('No department assigned');
        }
    }
}

analyze().then(() => process.exit(0));


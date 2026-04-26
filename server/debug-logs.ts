import 'dotenv/config';
import { storage } from './storage';

async function analyze() {
    const userId = 'AEBwyrZByYThJstD2oc1LRtvHjs2'; // new4@gmail.com
    console.log(`\n--- Activity Logs for User: ${userId} ---`);

    try {
        const logsSnap = await storage.db.collection('activityLogs')
            .where('userId', '==', userId)
            .orderBy('timestamp', 'desc')
            .limit(20)
            .get();

        console.log(`Found ${logsSnap.docs.length} logs`);

        for (const doc of logsSnap.docs) {
            const data = doc.data();
            console.log(`[${data.timestamp?.toDate().toISOString()}] ${data.type} - ${data.title}: ${data.description}`);
        }
    } catch (error) {
        console.error('Error fetching logs:', error);
    }
}

analyze().then(() => process.exit(0));

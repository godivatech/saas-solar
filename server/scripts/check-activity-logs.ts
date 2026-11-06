import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import * as dotenv from 'dotenv';
dotenv.config();

if (getApps().length === 0) {
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

const firestore = getFirestore();
async function main() {
  const snap = await firestore.collection('activity_logs').get();
  console.log(`Found ${snap.size} activity logs:`);
  snap.docs.forEach(d => console.log(d.id, JSON.stringify(d.data(), null, 2)));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });


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
  const collections = await firestore.listCollections();
  console.log(`Found ${collections.length} root collections in Firestore:`);
  for (const col of collections) {
    const snap = await col.get();
    console.log(`- ${col.id}: ${snap.size} documents`);
    if (snap.size > 0 && snap.size <= 3) {
      snap.docs.forEach(d => console.log(`    [${d.id}]:`, JSON.stringify(d.data()).slice(0, 100)));
    }
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error("Error inspecting firestore:", err);
  process.exit(1);
});


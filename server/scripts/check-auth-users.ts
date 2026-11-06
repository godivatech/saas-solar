import { getAuth } from 'firebase-admin/auth';
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

const auth = getAuth();

async function main() {
  const listUsersResult = await auth.listUsers(100);
  console.log(`Firebase Auth has ${listUsersResult.users.length} users:`);
  listUsersResult.users.forEach(u => {
    console.log(`- UID: ${u.uid}, Email: ${u.email}, Name: ${u.displayName}`);
  });
}

main().then(() => process.exit(0)).catch(err => {
  console.error("Auth inspect error:", err);
  process.exit(1);
});


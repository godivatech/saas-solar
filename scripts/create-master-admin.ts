import "dotenv/config";
import { auth, db } from '../server/firebase.js';

async function makeMasterAdmin(email: string, password?: string) {
  try {
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
      console.log(`User found in Auth: ${userRecord.uid}`);
      
      // Update password if provided for an existing user
      if (password) {
        await auth.updateUser(userRecord.uid, { password });
        console.log(`Updated password for existing user.`);
      }
    } catch (e: any) {
      if (e.code === 'auth/user-not-found') {
        if (!password) {
          console.error(`User with email ${email} not found.`);
          console.error("Please provide a password as the second argument to create a new account.");
          process.exit(1);
        }
        console.log(`Creating new user account for ${email}...`);
        userRecord = await auth.createUser({
          email: email,
          password: password,
          displayName: "Master Admin"
        });
        console.log(`Successfully created Auth user: ${userRecord.uid}`);
      } else {
        throw e;
      }
    }

    const userData = {
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName || "Master Admin",
      role: "master_admin",
      isActive: true,
      department: "admin",
      designation: "ceo",
      updatedAt: new Date().toISOString()
    };

    // Update Firestore User Document
    await db.collection('users').doc(userRecord.uid).set(userData, { merge: true });
    
    // Set custom claims for Firebase Auth
    await auth.setCustomUserClaims(userRecord.uid, { role: "master_admin" });

    console.log(`✅ Successfully set master_admin role in Firestore & Auth Claims for ${email}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating to master admin:', error);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const emailArg = args[0];
const passwordArg = args[1];

if (!emailArg) {
  console.log("Usage: npx tsx scripts/create-master-admin.ts <user_email> [password]");
  process.exit(1);
}

makeMasterAdmin(emailArg, passwordArg);

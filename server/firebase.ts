import { initializeApp, cert, type ServiceAccount, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage, Storage } from 'firebase-admin/storage';

// Firebase server configuration
const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID || "solar-energy-56bc8",
  privateKey: process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "solar-energy-56bc8.firebasestorage.app",
};

// Initialize Firebase Admin with error handling
let app: App;
let auth: Auth;
let db: Firestore;
let storage: Storage;

try {
  if (firebaseConfig.privateKey && firebaseConfig.clientEmail) {
    app = initializeApp({
      credential: cert(firebaseConfig as ServiceAccount),
      storageBucket: firebaseConfig.storageBucket
    });

    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    console.log("Firebase Admin initialized successfully");
  } else {
    console.error("Firebase Admin credentials missing. Required: FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL, FIREBASE_PROJECT_ID");
    throw new Error("Firebase Admin SDK requires service account credentials");
  }
} catch (error) {
  console.error("Critical: Firebase Admin initialization failed:", error);
  process.exit(1); // Exit the process if Firebase cannot initialize
}

export { app, auth, db, storage };



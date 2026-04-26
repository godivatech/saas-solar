import { auth, db, storage } from './firebase.js';

export async function testFirebaseAdminSDK() {
  console.log('\n=== Firebase Admin SDK Health Check ===');
  
  const results = {
    auth: false,
    firestore: false,
    storage: false,
    overall: false
  };

  try {
    // Test Firebase Auth Admin
    console.log('Testing Firebase Auth Admin...');
    const authTest = await auth.listUsers(1); // List just 1 user to test
    console.log('✅ Firebase Auth Admin: Working');
    console.log(`   - Can list users: ${authTest.users.length >= 0 ? 'Yes' : 'No'}`);
    results.auth = true;
  } catch (error: any) {
    console.log('❌ Firebase Auth Admin: Error');
    console.log(`   - Error: ${error.message}`);
  }

  try {
    // Test Firestore Admin
    console.log('Testing Firestore Admin...');
    const testCollection = db.collection('health-check');
    const testDoc = testCollection.doc('test');
    
    // Try to write
    await testDoc.set({ 
      timestamp: new Date().toISOString(),
      test: 'Firebase Admin SDK Health Check'
    });
    
    // Try to read
    const docSnapshot = await testDoc.get();
    const data = docSnapshot.data();
    
    // Clean up
    await testDoc.delete();
    
    console.log('✅ Firestore Admin: Working');
    console.log(`   - Can write: Yes`);
    console.log(`   - Can read: ${data ? 'Yes' : 'No'}`);
    console.log(`   - Can delete: Yes`);
    results.firestore = true;
  } catch (error: any) {
    console.log('❌ Firestore Admin: Error');
    console.log(`   - Error: ${error.message}`);
  }

  try {
    // Test Firebase Storage Admin
    console.log('Testing Firebase Storage Admin...');
    const bucket = storage.bucket();
    
    // Test bucket access
    const [exists] = await bucket.exists();
    
    console.log('✅ Firebase Storage Admin: Working');
    console.log(`   - Bucket exists: ${exists ? 'Yes' : 'No'}`);
    console.log(`   - Bucket name: ${bucket.name}`);
    results.storage = true;
  } catch (error: any) {
    console.log('❌ Firebase Storage Admin: Error');
    console.log(`   - Error: ${error.message}`);
  }

  // Overall result
  results.overall = results.auth && results.firestore && results.storage;
  
  console.log('\n=== Summary ===');
  console.log(`Firebase Auth Admin: ${results.auth ? '✅' : '❌'}`);
  console.log(`Firestore Admin: ${results.firestore ? '✅' : '❌'}`);
  console.log(`Firebase Storage Admin: ${results.storage ? '✅' : '❌'}`);
  console.log(`Overall Status: ${results.overall ? '✅ All systems operational' : '❌ Some services have issues'}`);
  console.log('=====================================\n');

  return results;
}

// Test user management functions
export async function testUserManagement() {
  console.log('\n=== Testing User Management Functions ===');
  
  try {
    // List existing users
    const listResult = await auth.listUsers(5);
    console.log(`✅ Can list users: Found ${listResult.users.length} users`);
    
    if (listResult.users.length > 0) {
      const firstUser = listResult.users[0];
      console.log(`   - Sample user: ${firstUser.email || 'No email'} (${firstUser.uid})`);
      
      // Test getting user by UID
      try {
        const userRecord = await auth.getUser(firstUser.uid);
        console.log(`✅ Can get user by UID: ${userRecord.email || 'No email'}`);
      } catch (error: any) {
        console.log(`❌ Error getting user by UID: ${error.message}`);
      }
    }
    
    // Test custom claims (important for role-based access)
    if (listResult.users.length > 0) {
      const testUser = listResult.users[0];
      console.log(`✅ Custom claims for ${testUser.email}: ${JSON.stringify(testUser.customClaims || {})}`);
    }
    
  } catch (error: any) {
    console.log(`❌ User management test failed: ${error.message}`);
  }
  
  console.log('===========================================\n');
}
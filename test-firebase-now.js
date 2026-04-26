// Direct Firebase Admin SDK test
const { auth, db, storage } = require('./server/firebase.js');

async function runFirebaseTests() {
  console.log('\n=== Firebase Admin SDK Direct Test ===');
  
  try {
    // Test 1: Firebase Auth Admin
    console.log('Testing Firebase Auth Admin...');
    const authTest = await auth.listUsers(1);
    console.log('✅ Firebase Auth Admin: Working');
    console.log(`   - Can list users: ${authTest.users.length >= 0 ? 'Yes' : 'No'}`);
    
    if (authTest.users.length > 0) {
      console.log(`   - Sample user: ${authTest.users[0].email || 'No email'}`);
    }
  } catch (error) {
    console.log('❌ Firebase Auth Admin: Error');
    console.log(`   - Error: ${error.message}`);
  }

  try {
    // Test 2: Firestore Admin
    console.log('\nTesting Firestore Admin...');
    const testCollection = db.collection('health-check-direct');
    const testDoc = testCollection.doc('test-' + Date.now());
    
    // Write test
    await testDoc.set({ 
      timestamp: new Date().toISOString(),
      test: 'Direct Firebase Admin SDK Test'
    });
    
    // Read test
    const docSnapshot = await testDoc.get();
    const data = docSnapshot.data();
    
    // Clean up
    await testDoc.delete();
    
    console.log('✅ Firestore Admin: Working');
    console.log(`   - Can write: Yes`);
    console.log(`   - Can read: ${data ? 'Yes' : 'No'}`);
    console.log(`   - Can delete: Yes`);
  } catch (error) {
    console.log('❌ Firestore Admin: Error');
    console.log(`   - Error: ${error.message}`);
  }

  try {
    // Test 3: Firebase Storage Admin
    console.log('\nTesting Firebase Storage Admin...');
    const bucket = storage.bucket();
    const [exists] = await bucket.exists();
    
    console.log('✅ Firebase Storage Admin: Working');
    console.log(`   - Bucket exists: ${exists ? 'Yes' : 'No'}`);
    console.log(`   - Bucket name: ${bucket.name}`);
  } catch (error) {
    console.log('❌ Firebase Storage Admin: Error');
    console.log(`   - Error: ${error.message}`);
  }

  // Test 4: Environment Variables
  console.log('\n=== Environment Check ===');
  console.log(`FIREBASE_PROJECT_ID: ${process.env.FIREBASE_PROJECT_ID ? 'Present' : 'Missing'}`);
  console.log(`FIREBASE_CLIENT_EMAIL: ${process.env.FIREBASE_CLIENT_EMAIL ? 'Present' : 'Missing'}`);
  console.log(`FIREBASE_PRIVATE_KEY: ${process.env.FIREBASE_PRIVATE_KEY ? 'Present (length: ' + process.env.FIREBASE_PRIVATE_KEY.length + ')' : 'Missing'}`);
  console.log(`FIREBASE_STORAGE_BUCKET: ${process.env.FIREBASE_STORAGE_BUCKET ? 'Present' : 'Missing'}`);
  
  console.log('\n=== Test Complete ===\n');
}

runFirebaseTests().catch(console.error);
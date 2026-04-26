import admin from 'firebase-admin';

// Initialize Firebase Admin with service account
const serviceAccount = {
  type: "service_account",
  project_id: "solar-energy-56bc8",
  private_key_id: "ce701d33b65e3c66b2ed5e1bb13cee00a05b7a6a",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDRg1DjPn4P7IhT\nOGODDRdOAV5/Uf6P44f8TKmLHH9P7HjDm+oZpX1vZXzQXwV8oJ7XGzY1ZKjE5vFz\n5lKzJ7dJ8HGzN7FzJzFzHzFzKzJzMzNzOzPzQzRzSzTzUzVzWzXzYzZza2c3d2f3\nh2j3k2l3m2n3o2p3q2r3s2t3u2v3w2x3y2z312233343536373839404142434445\n464748495051525354555657585960616263646566676869707172737475767778\n798081828384858687888990919293949596979899A0A1A2A3A4A5A6A7A8A9B0B1\nB2B3B4B5B6B7B8B9C0C1C2C3C4C5C6C7C8C9D0D1D2D3D4D5D6D7D8D9E0E1E2E3E4\nE5E6E7E8E9F0F1F2F3F4F5F6F7F8F9\n-----END PRIVATE KEY-----\n",
  client_email: "firebase-adminsdk-t8x9h@solar-energy-56bc8.iam.gserviceaccount.com",
  client_id: "108463825421345678901",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-t8x9h%40solar-energy-56bc8.iam.gserviceaccount.com"
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function debugSiteVisitData() {
  try {
    console.log('=== DEBUGGING SITE VISIT DATA ===');
    
    // Get the specific site visit by ID
    const siteVisitId = 'BDM6DBGtsLVFJu6p1fJm';
    const doc = await db.collection('siteVisits').doc(siteVisitId).get();
    
    if (!doc.exists) {
      console.log('Site visit not found!');
      return;
    }
    
    const data = doc.data();
    console.log('Full site visit data structure:');
    console.log(JSON.stringify(data, null, 2));
    
    console.log('\n=== CHECKING SPECIFIC FIELDS ===');
    console.log('Customer data:', data.customer);
    console.log('Marketing data:', data.marketingData);
    console.log('Technical data:', data.technicalData); 
    console.log('Admin data:', data.adminData);
    console.log('Site photos:', data.sitePhotos);
    console.log('Notes:', data.notes);
    
    // Also check all site visits to see overall structure
    console.log('\n=== ALL SITE VISITS OVERVIEW ===');
    const allVisits = await db.collection('siteVisits').get();
    allVisits.docs.forEach(doc => {
      const data = doc.data();
      console.log(`Visit ${doc.id}:`);
      console.log(`  - Customer: ${data.customer?.name || data.customerName || 'N/A'}`);
      console.log(`  - Department: ${data.department}`);
      console.log(`  - Has marketing data: ${!!data.marketingData}`);
      console.log(`  - Has technical data: ${!!data.technicalData}`);
      console.log(`  - Has admin data: ${!!data.adminData}`);
      console.log(`  - Photo count: ${data.sitePhotos?.length || 0}`);
      console.log(`  - Status: ${data.status}`);
      console.log('---');
    });
    
  } catch (error) {
    console.error('Error debugging site visit data:', error);
  }
}

debugSiteVisitData();
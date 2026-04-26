import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

// Firebase configuration (using the actual config from the client)
const firebaseConfig = {
  apiKey: "AIzaSyBo8D4pTG6oNGg4qy7V4AaC73qfAB0HRcc",
  authDomain: "solar-energy-56bc8.firebaseapp.com", 
  databaseURL: "https://solar-energy-56bc8-default-rtdb.firebaseio.com",
  projectId: "solar-energy-56bc8",
  storageBucket: "solar-energy-56bc8.firebasestorage.app",
  messagingSenderId: "833087081002",
  appId: "1:833087081002:web:10001186150884d311d153",
  measurementId: "G-2S9TJM6E3C"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function debugTest8Data() {
  try {
    console.log('=== SEARCHING FOR TEST8 CUSTOMER DATA ===');
    
    // Search for site visits with customer name containing "test8"
    const siteVisitsRef = collection(db, 'siteVisits');
    
    console.log('Searching for site visits with customer name "test8"...');
    const nameQuery = query(siteVisitsRef, where('customer.name', '==', 'test8'));
    const nameSnapshot = await getDocs(nameQuery);
    
    if (!nameSnapshot.empty) {
      console.log(`Found ${nameSnapshot.size} site visit(s) for customer "test8"`);
      
      nameSnapshot.forEach((doc) => {
        const data = doc.data();
        console.log('\n=== SITE VISIT DATA FOR TEST8 ===');
        console.log('Site Visit ID:', doc.id);
        console.log('Customer:', data.customer);
        console.log('Department:', data.department);
        console.log('Status:', data.status);
        console.log('Visit Outcome:', data.visitOutcome);
        console.log('Created At:', data.createdAt?.toDate?.()?.toLocaleString() || data.createdAt);
        
        console.log('\n--- MARKETING DATA ---');
        if (data.marketingData) {
          console.log('Marketing Data Keys:', Object.keys(data.marketingData));
          console.log('Full Marketing Data:', JSON.stringify(data.marketingData, null, 2));
        } else {
          console.log('No marketing data found');
        }
        
        console.log('\n--- TECHNICAL DATA ---');
        if (data.technicalData) {
          console.log('Technical Data Keys:', Object.keys(data.technicalData));
          console.log('Full Technical Data:', JSON.stringify(data.technicalData, null, 2));
        } else {
          console.log('No technical data found');
        }
        
        console.log('\n--- ADMIN DATA ---');
        if (data.adminData) {
          console.log('Admin Data Keys:', Object.keys(data.adminData));
          console.log('Full Admin Data:', JSON.stringify(data.adminData, null, 2));
        } else {
          console.log('No admin data found');
        }
        
        console.log('\n--- PHOTOS ---');
        console.log('Site Photos Count:', data.sitePhotos?.length || 0);
        if (data.sitePhotos?.length > 0) {
          console.log('Photo Details:', data.sitePhotos.map(photo => ({
            url: photo.url,
            description: photo.description,
            timestamp: photo.timestamp?.toDate?.()?.toLocaleString() || photo.timestamp
          })));
        }
        
        console.log('\n--- OTHER FIELDS ---');
        console.log('Notes:', data.notes);
        console.log('Visit Purpose:', data.visitPurpose);
        console.log('Site In Time:', data.siteInTime?.toDate?.()?.toLocaleString() || data.siteInTime);
        console.log('Site Out Time:', data.siteOutTime?.toDate?.()?.toLocaleString() || data.siteOutTime);
        
        console.log('\n=== FIELD COMPLETENESS ANALYSIS ===');
        const fields = {
          'customer.name': data.customer?.name,
          'customer.mobile': data.customer?.mobile,
          'customer.address': data.customer?.address,
          'customer.propertyType': data.customer?.propertyType,
          'marketingData.onGridConfig.inverterKW': data.marketingData?.onGridConfig?.inverterKW,
          'marketingData.onGridConfig.projectValue': data.marketingData?.onGridConfig?.projectValue,
          'marketingData.offGridConfig.inverterKW': data.marketingData?.offGridConfig?.inverterKW,
          'marketingData.offGridConfig.batteryCount': data.marketingData?.offGridConfig?.batteryCount,
          'marketingData.hybridConfig.inverterKW': data.marketingData?.hybridConfig?.inverterKW,
          'marketingData.waterHeaterConfig.litre': data.marketingData?.waterHeaterConfig?.litre,
          'marketingData.waterPumpConfig.hp': data.marketingData?.waterPumpConfig?.hp,
          'technicalData.serviceTypes': data.technicalData?.serviceTypes,
          'technicalData.workType': data.technicalData?.workType,
          'adminData.bankProcess': data.adminData?.bankProcess,
          'adminData.ebProcess': data.adminData?.ebProcess
        };
        
        const missingFields = [];
        const presentFields = [];
        
        Object.entries(fields).forEach(([fieldPath, value]) => {
          if (value === undefined || value === null || value === '') {
            missingFields.push(fieldPath);
          } else {
            presentFields.push(fieldPath);
          }
        });
        
        console.log('Present Fields:', presentFields);
        console.log('Missing Fields:', missingFields);
        console.log('Completeness:', `${presentFields.length}/${Object.keys(fields).length} (${Math.round(presentFields.length / Object.keys(fields).length * 100)}%)`);
      });
    } else {
      console.log('No site visits found for customer "test8"');
      
      // Let's try a broader search to see all customers
      console.log('\n=== SEARCHING ALL SITE VISITS FOR SIMILAR NAMES ===');
      const allVisitsSnapshot = await getDocs(siteVisitsRef);
      
      const test8Visits = [];
      allVisitsSnapshot.forEach((doc) => {
        const data = doc.data();
        const customerName = data.customer?.name?.toLowerCase() || '';
        if (customerName.includes('test8') || customerName.includes('test')) {
          test8Visits.push({
            id: doc.id,
            customerName: data.customer?.name,
            mobile: data.customer?.mobile,
            status: data.status,
            department: data.department,
            visitOutcome: data.visitOutcome
          });
        }
      });
      
      if (test8Visits.length > 0) {
        console.log('Found similar customers:');
        test8Visits.forEach(visit => {
          console.log(`- ${visit.customerName} (${visit.mobile}) - Status: ${visit.status}, Outcome: ${visit.visitOutcome}, ID: ${visit.id}`);
        });
      } else {
        console.log('No customers with names containing "test" found');
      }
    }
    
  } catch (error) {
    console.error('Error debugging test8 data:', error);
  }
}

debugTest8Data();
/**
 * Debug script to test site visit creation
 */

console.log("🔍 DEBUGGING SITE VISIT CREATION ISSUE");
console.log("=".repeat(50));

// Check if the issue is with the frontend form validation
console.log("1. CHECKING MARKETING FORM VALIDATION");

// Test marketing form data similar to what you're entering
const testMarketingData = {
  updateRequirements: true,
  projectType: 'on_grid',
  onGridConfig: {
    solarPanelMake: 'premier',
    panelWatts: 530,
    inverterMake: 'deye', 
    inverterWatts: '4kw',
    inverterPhase: 'three_phase',
    lightningArrest: false,
    earth: 'ac',
    floor: 'Ground floor',
    panelCount: 1,
    structureHeight: 123,
    projectValue: 11,
    others: ''
  }
};

console.log("Marketing form data structure:", JSON.stringify(testMarketingData, null, 2));

// Test customer data similar to the form
const testCustomerData = {
  name: 'Muthu Kumar', // From your form
  mobile: '9876543210',
  address: 'Test Address',
  ebServiceNumber: '',
  propertyType: 'residential'
};

console.log("Customer data structure:", JSON.stringify(testCustomerData, null, 2));

// Test complete site visit payload
const testSiteVisitPayload = {
  visitPurpose: 'visit',
  siteInTime: new Date(),
  siteInLocation: {
    latitude: 12.9716,
    longitude: 77.5946,
    accuracy: 10,
    address: 'Test Location Address'
  },
  customer: testCustomerData,
  status: 'in_progress',
  marketingData: testMarketingData,
  sitePhotos: [],
  notes: ''
};

console.log("Complete site visit payload:", JSON.stringify(testSiteVisitPayload, null, 2));

console.log("\n🎯 DEBUGGING CHECKLIST:");
console.log("□ 1. Frontend form validation");
console.log("□ 2. API request format");
console.log("□ 3. Backend schema validation");  
console.log("□ 4. Database save operation");
console.log("□ 5. Response handling");

console.log("\n📝 NEXT STEPS:");
console.log("1. Check browser console for errors during form submission");
console.log("2. Check server logs for site visit creation attempts");
console.log("3. Verify schema validation is passing");
console.log("4. Check if data is reaching Firestore");
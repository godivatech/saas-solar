// Script to create missing test2 customer in the database
import { storage } from './server/storage.js';

async function createTestCustomer() {
  console.log('Creating missing test2 customer...');
  
  try {
    // First check if test2 customer already exists
    const existingCustomer = await storage.findCustomerByMobile('1234567890');
    if (existingCustomer) {
      console.log('Customer with mobile 1234567890 already exists:', existingCustomer);
      return;
    }
    
    // Create the customer that should have been created during site visit
    const customerData = {
      name: 'test2',
      mobile: '1234567890', // Using a test mobile number
      address: 'Test Address for site visit customer',
      profileCompleteness: 'basic',
      createdFrom: 'site_visit'
    };
    
    console.log('Creating customer with data:', customerData);
    const customer = await storage.createCustomer(customerData);
    
    console.log('✅ Successfully created customer:', customer);
    console.log('Customer ID:', customer.id);
    console.log('Customer should now appear in the customers page');
    
  } catch (error) {
    console.error('❌ Error creating customer:', error);
    console.error('Error details:', error.message);
  }
}

// Run the script
createTestCustomer().then(() => {
  console.log('Script completed');
  process.exit(0);
}).catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
});
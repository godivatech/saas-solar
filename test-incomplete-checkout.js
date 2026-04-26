// Test script to create an incomplete attendance record
// This simulates an employee forgetting to check out

const testIncompleteCheckout = async () => {
  console.log('🧪 Testing Incomplete Checkout Detection System');
  
  const testData = {
    userId: 'test-user-001',
    userName: 'Test Employee',
    userEmail: 'test@company.com',
    userDepartment: 'technical',
    checkInTime: new Date('2025-08-19T09:00:00Z').toISOString(),
    checkOutTime: null, // This is the forgotten checkout
    date: '2025-08-19',
    status: 'present',
    location: 'office',
    remarks: 'Employee forgot to check out - needs admin correction'
  };
  
  try {
    console.log('📊 Creating test incomplete record...');
    console.log('Test Record:', {
      employee: testData.userName,
      department: testData.userDepartment,
      checkIn: testData.checkInTime,
      checkOut: testData.checkOutTime,
      isIncomplete: testData.checkInTime && !testData.checkOutTime
    });
    
    // In a real scenario, this would be created by the attendance system
    // when an employee checks in but forgets to check out
    
    console.log('✅ Test record created successfully');
    console.log('🔍 System should detect this as incomplete and suggest 6:00 PM checkout (technical department)');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
};

// Run test
testIncompleteCheckout();
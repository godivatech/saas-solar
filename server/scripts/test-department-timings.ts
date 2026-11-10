import 'dotenv/config';
import { storage } from '../storage';

async function testDepartmentTimings() {
  console.log('🧪 Testing Department Timings with PostgreSQL & Multi-Tenancy...');

  // 1. List all department timings
  const timings = await storage.listDepartmentTimings();
  console.log(`Found ${timings.length} department timings:`);
  for (const t of timings) {
    console.log(`  - ${t.department}: ${t.checkInTime} to ${t.checkOutTime} (${t.workingHours} hrs)`);
  }
  if (timings.length < 7) {
    throw new Error(`Expected at least 7 canonical departments, got ${timings.length}`);
  }

  // 2. Fetch specific department
  const salesTiming = await storage.getDepartmentTiming('sales');
  console.log('Sales timing fetched:', salesTiming);
  if (!salesTiming || salesTiming.checkInTime !== '9:00 AM') {
    throw new Error('Sales timing check failed: expected 9:00 AM');
  }

  // 3. Update department timing
  console.log('\n--- Updating Technical Timing ---');
  await storage.updateDepartmentTiming('technical', {
    checkInTime: '9:15 AM',
    checkOutTime: '6:15 PM'
  });
  const updatedTech = await storage.getDepartmentTiming('technical');
  console.log('Updated technical timing:', updatedTech);
  if (updatedTech?.checkInTime !== '9:15 AM') {
    throw new Error('Update timing failed');
  }

  // 4. Test Upsert on createDepartmentTiming
  console.log('\n--- Testing Upsert on createDepartmentTiming ---');
  await storage.createDepartmentTiming({
    department: 'technical',
    checkInTime: '9:00 AM',
    checkOutTime: '6:00 PM',
    workingHours: 8
  });
  const restoredTech = await storage.getDepartmentTiming('technical');
  console.log('Restored technical timing:', restoredTech);
  if (restoredTech?.checkInTime !== '9:00 AM') {
    throw new Error('Upsert timing failed');
  }

  console.log('\n✅ All Department Timing tests PASSED successfully!');
  process.exit(0);
}

testDepartmentTimings().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

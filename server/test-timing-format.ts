/**
 * Test script to check if department timings are in correct 12-hour format
 */

import { storage } from './storage.ts';
import { EnterpriseTimeService } from './services/enterprise-time-service.ts';

async function testTimingFormats(): Promise<void> {
  console.log('🧪 Testing current department timing formats...\n');
  
  const departments = ['sales', 'operations', 'admin', 'hr', 'marketing', 'technical', 'housekeeping'];
  
  for (const dept of departments) {
    try {
      // Get from storage
      const storageTiming = await storage.getDepartmentTiming(dept);
      console.log(`📁 ${dept.toUpperCase()} - Storage:`, {
        checkIn: storageTiming?.checkInTime || 'NOT FOUND',
        checkOut: storageTiming?.checkOutTime || 'NOT FOUND'
      });
      
      // Get from Enterprise Time Service (with cache)
      const serviceTiming = await EnterpriseTimeService.getDepartmentTiming(dept);
      console.log(`⚡ ${dept.toUpperCase()} - Service:`, {
        checkIn: serviceTiming.checkInTime,
        checkOut: serviceTiming.checkOutTime
      });
      
      // Check format
      const is12HourFormat = (time: string) => /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.test(time);
      const storageIn12 = storageTiming ? is12HourFormat(storageTiming.checkInTime) : false;
      const storageOut12 = storageTiming ? is12HourFormat(storageTiming.checkOutTime) : false;
      const serviceIn12 = is12HourFormat(serviceTiming.checkInTime);
      const serviceOut12 = is12HourFormat(serviceTiming.checkOutTime);
      
      console.log(`✅ ${dept.toUpperCase()} - Format Check:`, {
        storage: storageIn12 && storageOut12 ? '12-hour ✓' : '24-hour ❌',
        service: serviceIn12 && serviceOut12 ? '12-hour ✓' : '24-hour ❌'
      });
      
      console.log(''); // Empty line for separation
      
    } catch (error) {
      console.error(`❌ Error testing ${dept}:`, error);
    }
  }
  
  // Clear cache to force fresh data
  console.log('🔄 Clearing timing cache...');
  EnterpriseTimeService.clearTimingCache();
  console.log('✅ Cache cleared');
}

// Run the test
testTimingFormats().catch(console.error);
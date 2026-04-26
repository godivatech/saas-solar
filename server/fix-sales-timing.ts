/**
 * Direct fix for sales department timing to resolve early checkout issue
 */

import { storage } from './storage.ts';

async function fixSalesTiming(): Promise<void> {
  console.log('🔧 FIXING SALES DEPARTMENT TIMING FORMAT');
  
  try {
    const currentTiming = await storage.getDepartmentTiming('sales');
    
    if (!currentTiming) {
      console.log('❌ No sales timing found');
      return;
    }
    
    console.log('📥 Current sales timing:', {
      checkIn: currentTiming.checkInTime,
      checkOut: currentTiming.checkOutTime
    });
    
    // Set to 9:00 AM - 2:00 PM as you specified
    const updatedTiming = {
      ...currentTiming,
      checkInTime: '9:00 AM',
      checkOutTime: '2:00 PM',
      updatedAt: new Date()
    };
    
    await storage.updateDepartmentTiming('sales', updatedTiming);
    
    console.log('✅ SALES TIMING FIXED:');
    console.log('   Check-in: 9:00 AM');
    console.log('   Check-out: 2:00 PM');
    console.log('');
    console.log('🎯 This should fix the "early checkout" issue when checking out at 2:15 PM');
    
  } catch (error) {
    console.error('❌ Error fixing sales timing:', error);
    throw error;
  }
}

// Run the fix
fixSalesTiming().catch(console.error);
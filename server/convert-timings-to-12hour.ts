/**
 * Critical Migration: Convert all department timing data from 24-hour to 12-hour format
 * This fixes the format mismatch causing "early checkout" detection errors
 */

import { storage } from './storage.ts';

interface TimingUpdate {
  department: string;
  checkInTime: string;
  checkOutTime: string;
}

// Convert 24-hour time to 12-hour format
function convert24To12Hour(time24: string): string {
  try {
    // Handle both "HH:MM" and "H:MM" formats
    const [hours, minutes] = time24.split(':').map(Number);
    
    if (isNaN(hours) || isNaN(minutes)) {
      console.warn(`Invalid time format: ${time24}, using default`);
      return '9:00 AM';
    }
    
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${period}`;
  } catch (error) {
    console.error('Error converting to 12-hour format:', time24, error);
    return '9:00 AM'; // Safe fallback
  }
}

export async function convertTimingsTo12Hour(): Promise<void> {
  console.log('🔄 CRITICAL MIGRATION: Converting department timings to 12-hour format');
  
  try {
    // Get all department timings
    const departments = ['operations', 'admin', 'hr', 'marketing', 'sales', 'technical', 'housekeeping'];
    
    for (const department of departments) {
      try {
        console.log(`\n📋 Processing ${department} department...`);
        
        const currentTiming = await storage.getDepartmentTiming(department);
        
        if (!currentTiming) {
          console.log(`⚠️  No timing found for ${department}, skipping`);
          continue;
        }
        
        console.log(`📥 Current timing:`, {
          checkIn: currentTiming.checkInTime,
          checkOut: currentTiming.checkOutTime
        });
        
        // Check if already in 12-hour format
        const is12HourFormat = (time: string) => /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.test(time);
        
        if (is12HourFormat(currentTiming.checkInTime) && is12HourFormat(currentTiming.checkOutTime)) {
          console.log(`✅ ${department} already in 12-hour format, skipping`);
          continue;
        }
        
        // Convert to 12-hour format
        const checkIn12 = convert24To12Hour(currentTiming.checkInTime);
        const checkOut12 = convert24To12Hour(currentTiming.checkOutTime);
        
        console.log(`🔄 Converting to:`, {
          checkIn: checkIn12,
          checkOut: checkOut12
        });
        
        // Update the timing
        const updatedTiming = {
          ...currentTiming,
          checkInTime: checkIn12,
          checkOutTime: checkOut12,
          updatedAt: new Date()
        };
        
        await storage.updateDepartmentTiming(department, updatedTiming);
        
        console.log(`✅ Successfully converted ${department} timing to 12-hour format`);
        
      } catch (error) {
        console.error(`❌ Error processing ${department}:`, error);
        // Continue with other departments
      }
    }
    
    console.log('\n🎉 MIGRATION COMPLETE: All department timings converted to 12-hour format');
    console.log('🔧 This should fix the "early checkout" detection issue');
    
  } catch (error) {
    console.error('❌ MIGRATION FAILED:', error);
    throw error;
  }
}

// Run the migration automatically
console.log('🚀 Starting department timing format conversion...');
convertTimingsTo12Hour().catch(console.error);
/**
 * Manual cache clearing script
 */

import { EnterpriseTimeService } from "./services/enterprise-time-service.ts";

async function clearCache(): Promise<void> {
  console.log("🔄 Clearing Enterprise Time Service cache...");

  // Clear the timing cache
  EnterpriseTimeService.clearTimingCache();

  console.log("✅ Cache cleared successfully");

  // Test the sales department timing immediately
  console.log("\n🧪 Testing sales department timing after cache clear...");

  try {
    const salesTiming =
      await EnterpriseTimeService.getDepartmentTiming("sales");
    console.log("📋 Sales timing from service:", {
      checkIn: salesTiming.checkInTime,
      checkOut: salesTiming.checkOutTime,
    });

    // Verify the format
    const is12Hour = (time: string) =>
      /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.test(time);

    if (
      is12Hour(salesTiming.checkInTime) &&
      is12Hour(salesTiming.checkOutTime)
    ) {
      console.log("✅ Sales timing is in correct 12-hour format");
      console.log('🎯 The "early checkout" issue should now be resolved');
    } else {
      console.log("❌ Sales timing is still not in correct format");
    }
  } catch (error) {
    console.error("❌ Error testing sales timing:", error);
  }
}

// Run the cache clear
clearCache().catch(console.error);

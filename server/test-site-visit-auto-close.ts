/**
 * Manual Test Script for Site Visit Auto-Close Service
 * 
 * Purpose: Test the auto-close logic manually without waiting for cron
 * 
 * Usage:
 *   cd "c:\Godivatech\solar-saas\server"
 *   npx tsx test-site-visit-auto-close.ts
 */

import { SiteVisitAutoCloseService } from './services/site-visit-auto-close-service';

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║  Site Visit Auto-Close Service - Manual Test            ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log('');
console.log('🔍 Testing auto-close functionality...');
console.log('⏰ Threshold: 24 hours');
console.log('📅 Current Time:', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

async function runTest() {
    try {
        await SiteVisitAutoCloseService.processAutoClose();

        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
        console.log('✅ Test completed successfully!');
        console.log('');
        console.log('Next steps:');
        console.log('  1. Check Firebase for auto-closed visits');
        console.log('  2. Verify notifications were created');
        console.log('  3. Check activity logs');
        console.log('');

    } catch (error) {
        console.error('');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('');
        console.error('❌ Test failed with error:');
        console.error(error);
        console.error('');
        process.exit(1);
    }
}

runTest();

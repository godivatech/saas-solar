/**
 * Quick Migration Runner
 * Run this to migrate legacy OT sessions to new format
 * 
 * Usage: npm run migrate-ot
 */

import { migrateLegacyOTSessions } from './migrations/migrate-legacy-ot';

console.log('🚀 Starting Legacy OT Migration...\n');

migrateLegacyOTSessions()
    .then(result => {
        console.log('\n📊 Final Results:');
        console.log(JSON.stringify(result, null, 2));

        if (result.success) {
            console.log('\n✅ Migration completed successfully!');
            console.log('You can now end your OT sessions properly.');
            process.exit(0);
        } else {
            console.log('\n❌ Migration failed!');
            process.exit(1);
        }
    })
    .catch(error => {
        console.error('\n💥 Fatal error:', error);
        process.exit(1);
    });

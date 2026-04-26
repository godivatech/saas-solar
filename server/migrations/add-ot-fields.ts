/**
 * Database Migration: Add OT Fields to Attendance Table
 * 
 * Adds:
 * - otSessions (JSONB): Array of OT session objects
 * - totalOTHours (DECIMAL): Aggregated total OT hours
 * 
 * Run with: npx tsx server/migrations/add-ot-fields.ts
 */

import { db } from '../db';

async function addOTFieldsToAttendance() {
    console.log('🔄 Starting OT schema migration...');

    try {
        // Note: Using raw SQL since we don't have Drizzle ORM set up
        // Adjust based on your database setup

        console.log('Adding otSessions JSONB column...');
        await db.execute(`
      ALTER TABLE attendance 
      ADD COLUMN IF NOT EXISTS "otSessions" JSONB DEFAULT '[]'::jsonb;
    `);
        console.log('✅ otSessions column added');

        console.log('Adding totalOTHours DECIMAL column...');
        await db.execute(`
      ALTER TABLE attendance 
      ADD COLUMN IF NOT EXISTS "totalOTHours" DECIMAL(10,2) DEFAULT 0;
    `);
        console.log('✅ totalOTHours column added');

        console.log('');
        console.log('✅ Migration completed successfully!');
        console.log('');
        console.log('OT System is now ready to use.');
        console.log('Restart your server to apply changes.');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        console.error('');
        console.error('If using PostgreSQL, run these commands manually:');
        console.error('');
        console.error('ALTER TABLE attendance ADD COLUMN IF NOT EXISTS "otSessions" JSONB DEFAULT \'[]\'::jsonb;');
        console.error('ALTER TABLE attendance ADD COLUMN IF NOT EXISTS "totalOTHours" DECIMAL(10,2) DEFAULT 0;');
        console.error('');
        throw error;
    }
}

// Run migration
addOTFieldsToAttendance()
    .then(() => {
        console.log('Exiting...');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Migration failed. Exiting with error.');
        process.exit(1);
    });

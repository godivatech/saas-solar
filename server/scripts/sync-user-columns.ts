import 'dotenv/config';
import { db } from '../db';
import { sql } from 'drizzle-orm';

async function run() {
  try {
    console.log('🔄 Adding missing columns to users table in Neon PostgreSQL...');
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reporting_manager_id VARCHAR(128);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS payroll_grade VARCHAR(20);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS aadhar_card_url TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS pan_card_url TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_details JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS join_date TIMESTAMPTZ;
    `);
    console.log('✅ SUCCESS: users table columns synced successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error syncing user columns:', err);
    process.exit(1);
  }
}

run();


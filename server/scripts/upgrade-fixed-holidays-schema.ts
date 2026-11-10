import 'dotenv/config';
import { pool } from '../db';

async function upgradeFixedHolidays() {
  console.log('--- Upgrading fixed_holidays table in Neon PostgreSQL ---');
  await pool.query(`
    ALTER TABLE fixed_holidays
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
  `);
  console.log('✅ Added is_active column with default true to fixed_holidays.');

  // Create performance indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_fixed_holidays_tenant_active_date 
    ON fixed_holidays(tenant_id, is_active, date);
  `);
  console.log('✅ Created idx_fixed_holidays_tenant_active_date index.');

  await pool.end();
}

upgradeFixedHolidays().catch(console.error);

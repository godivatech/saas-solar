import 'dotenv/config';
import { pool } from '../db';

async function upgradeUsersSchema() {
  console.log('--- Upgrading users schema in Neon PostgreSQL ---');
  await pool.query(`
    ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS date_of_leaving TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS rehire_date TIMESTAMP WITH TIME ZONE;
  `);
  console.log('✅ Added date_of_leaving and rehire_date columns to users table.');

  // Create index on reporting_manager_id and department if not existing
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_users_reporting_manager ON users(reporting_manager_id);
    CREATE INDEX IF NOT EXISTS idx_users_department ON users(department);
    CREATE INDEX IF NOT EXISTS idx_users_tenant_active ON users(tenant_id, is_active);
  `);
  console.log('✅ Created performance indexes on users table.');

  await pool.end();
}

upgradeUsersSchema().catch(console.error);

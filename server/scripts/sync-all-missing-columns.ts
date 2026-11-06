import 'dotenv/config';
import { db } from '../db';
import { sql } from 'drizzle-orm';

async function run() {
  try {
    console.log('🔄 Syncing missing columns on customers and audit_logs...');
    
    // Customers table
    await db.execute(sql`
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS assigned_sales_exec_id VARCHAR(128);
    `);
    console.log('✅ customers.assigned_sales_exec_id verified.');

    // Audit logs table
    await db.execute(sql`
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS details JSONB;
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;
    `);
    console.log('✅ audit_logs.details & user_agent verified.');

    process.exit(0);
  } catch (err) {
    console.error('❌ Error syncing columns:', err);
    process.exit(1);
  }
}

run();

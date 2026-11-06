import 'dotenv/config';
import { db } from '../db';
import { sql } from 'drizzle-orm';

async function run() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS payroll_periods (
        id VARCHAR(128) PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id VARCHAR(128) REFERENCES tenants(id) ON DELETE RESTRICT,
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        is_locked BOOLEAN DEFAULT false,
        locked_at TIMESTAMP WITH TIME ZONE,
        locked_by VARCHAR(128),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(128) PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id VARCHAR(128) REFERENCES tenants(id) ON DELETE RESTRICT,
        user_id VARCHAR(128) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'info',
        is_read BOOLEAN DEFAULT false,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `);
    console.log('SUCCESS: payroll_periods and notifications tables created/verified on Neon PostgreSQL.');
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
}
run();

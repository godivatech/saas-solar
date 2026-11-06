import 'dotenv/config';
import { db } from '../db';
import { sql } from 'drizzle-orm';

async function run() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS fixed_holidays (
        id VARCHAR(128) PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id VARCHAR(128) REFERENCES tenants(id) ON DELETE RESTRICT,
        name VARCHAR(255) NOT NULL,
        date TIMESTAMP WITH TIME ZONE NOT NULL,
        year INTEGER NOT NULL,
        type VARCHAR(50) DEFAULT 'mandatory',
        is_paid BOOLEAN DEFAULT true,
        is_optional BOOLEAN DEFAULT false,
        applicable_departments JSONB DEFAULT '[]'::jsonb,
        description TEXT,
        created_by VARCHAR(128),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `);
    console.log('SUCCESS: fixed_holidays table created/verified on Neon PostgreSQL.');
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
}
run();


import 'dotenv/config';
import { db } from '../db';
import { sql } from 'drizzle-orm';

async function createTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS follow_up_visits (
      id VARCHAR(128) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id VARCHAR(128) REFERENCES tenants(id) ON DELETE RESTRICT,
      original_visit_id VARCHAR(128) REFERENCES site_visits(id) ON DELETE CASCADE,
      user_id VARCHAR(128) NOT NULL,
      department VARCHAR(50) NOT NULL,
      site_in_time TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      site_in_location JSONB,
      site_in_photo_url TEXT,
      site_out_time TIMESTAMP WITH TIME ZONE,
      site_out_location JSONB,
      site_out_photo_url TEXT,
      follow_up_reason VARCHAR(100) DEFAULT 'additional_work_required',
      description TEXT NOT NULL,
      original_customer_status VARCHAR(50),
      affects_customer_status BOOLEAN DEFAULT TRUE,
      new_customer_status VARCHAR(50),
      site_photos JSONB DEFAULT '[]'::jsonb,
      site_out_photos JSONB DEFAULT '[]'::jsonb,
      status VARCHAR(50) DEFAULT 'in_progress' NOT NULL,
      visit_outcome VARCHAR(50),
      outcome_notes TEXT,
      scheduled_follow_up_date TIMESTAMP WITH TIME ZONE,
      customer JSONB NOT NULL,
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );
  `);
  console.log('✅ Created follow_up_visits table on Neon PostgreSQL');
  process.exit(0);
}

createTable();

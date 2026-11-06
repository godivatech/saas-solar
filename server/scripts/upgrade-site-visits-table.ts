import 'dotenv/config';
import { pool } from '../db';

async function upgradeSiteVisitsTable() {
  const client = await pool.connect();
  try {
    console.log("Adding missing columns to site_visits table in Neon PostgreSQL...");
    await client.query(`
      ALTER TABLE site_visits 
        ADD COLUMN IF NOT EXISTS site_out_photos jsonb DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS is_follow_up boolean DEFAULT false,
        ADD COLUMN IF NOT EXISTS follow_up_of varchar(128),
        ADD COLUMN IF NOT EXISTS has_follow_ups boolean DEFAULT false,
        ADD COLUMN IF NOT EXISTS follow_up_count integer DEFAULT 0,
        ADD COLUMN IF NOT EXISTS follow_up_reason varchar(255),
        ADD COLUMN IF NOT EXISTS follow_up_description text,
        ADD COLUMN IF NOT EXISTS visit_outcome varchar(50),
        ADD COLUMN IF NOT EXISTS outcome_notes text,
        ADD COLUMN IF NOT EXISTS scheduled_follow_up_date timestamp with time zone,
        ADD COLUMN IF NOT EXISTS outcome_selected_at timestamp with time zone,
        ADD COLUMN IF NOT EXISTS outcome_selected_by varchar(128),
        ADD COLUMN IF NOT EXISTS customer_current_status varchar(50),
        ADD COLUMN IF NOT EXISTS last_activity_type varchar(50) DEFAULT 'initial_visit',
        ADD COLUMN IF NOT EXISTS last_activity_date timestamp with time zone DEFAULT now(),
        ADD COLUMN IF NOT EXISTS active_follow_up_id varchar(128),
        ADD COLUMN IF NOT EXISTS auto_corrected boolean DEFAULT false,
        ADD COLUMN IF NOT EXISTS auto_closed_at timestamp with time zone,
        ADD COLUMN IF NOT EXISTS auto_correction_reason text;
    `);

    console.log("Adding performance indexes for site_visits & follow_up_visits...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_site_visits_user_id ON site_visits(user_id);
      CREATE INDEX IF NOT EXISTS idx_site_visits_department ON site_visits(department);
      CREATE INDEX IF NOT EXISTS idx_site_visits_status ON site_visits(status);
      CREATE INDEX IF NOT EXISTS idx_site_visits_site_in_time ON site_visits(site_in_time DESC);
      CREATE INDEX IF NOT EXISTS idx_site_visits_tenant_id ON site_visits(tenant_id);

      CREATE INDEX IF NOT EXISTS idx_follow_up_visits_original ON follow_up_visits(original_visit_id);
      CREATE INDEX IF NOT EXISTS idx_follow_up_visits_user ON follow_up_visits(user_id);
      CREATE INDEX IF NOT EXISTS idx_follow_up_visits_tenant ON follow_up_visits(tenant_id);
    `);

    console.log("✅ Successfully upgraded site_visits and added indexes in Neon PostgreSQL!");
  } catch (err) {
    console.error("❌ Error upgrading site_visits:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

upgradeSiteVisitsTable().catch(console.error);

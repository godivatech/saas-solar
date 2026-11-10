import 'dotenv/config';
import { pool } from '../db';

async function migrateAllowOT() {
  try {
    console.log("Checking and migrating allow_ot column in fixed_holidays...");
    await pool.query(`
      ALTER TABLE fixed_holidays 
      ADD COLUMN IF NOT EXISTS allow_ot BOOLEAN DEFAULT false;
    `);
    console.log("✅ Column allow_ot verified/added in fixed_holidays table.");
  } catch (e) {
    console.error("Migration error:", e);
  } finally {
    await pool.end();
  }
}

migrateAllowOT();

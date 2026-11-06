import 'dotenv/config';
import { db } from '../db';
import { sql } from 'drizzle-orm';

async function run() {
  try {
    await db.execute(sql`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS ot_sessions JSONB DEFAULT '[]'::jsonb;`);
    console.log('SUCCESS: ot_sessions column verified on attendance table.');
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
}
run();

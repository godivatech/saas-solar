import 'dotenv/config';
import { db } from '../db';
import { sql } from 'drizzle-orm';

async function listAllTables() {
  const res = await db.execute(sql.raw(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `));
  console.log("ALL TABLES IN DB (" + res.rows.length + "):");
  console.log((res.rows as any[]).map(r => r.table_name).join(', '));
  process.exit(0);
}
listAllTables().catch(e => { console.error(e); process.exit(1); });

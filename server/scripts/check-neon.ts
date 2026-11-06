import { db } from '../db';
import { sql } from 'drizzle-orm';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const result = await db.execute(sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);

  console.log(`Found ${result.rows.length} tables in PostgreSQL:`);
  for (const row of result.rows) {
    const tableName = (row as any).table_name;
    const countRes = await db.execute(sql.raw(`SELECT count(*) as count FROM "${tableName}"`));
    const count = (countRes.rows[0] as any).count;
    console.log(`- ${tableName}: ${count} rows`);
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error("Error inspecting Neon DB:", err);
  process.exit(1);
});


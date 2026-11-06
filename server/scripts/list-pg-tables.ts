import 'dotenv/config';
import { db } from '../db';
import { sql } from 'drizzle-orm';

async function main() {
  const res = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`);
  console.log('Tables in PostgreSQL:', res.rows.map((r: any) => r.table_name));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

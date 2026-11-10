import 'dotenv/config';
import { db } from '../db';
import { sql } from 'drizzle-orm';

async function checkCols() {
  const tables = ['salary_structures', 'salary_advances', 'payrolls', 'notifications', 'department_timings', 'departments', 'users'];
  for (const t of tables) {
    const res = await db.execute(sql.raw(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '${t}' ORDER BY ordinal_position;`));
    console.log('TABLE:', t, 'COLUMNS:', (res.rows as any[]).map(r => `${r.column_name}(${r.data_type})`).join(', '));
  }
  process.exit(0);
}
checkCols().catch(e => { console.error(e); process.exit(1); });

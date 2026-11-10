import 'dotenv/config';
import { pool } from '../db';

async function run() {
  const tableName = process.argv[2] || 'payrolls';
  const res = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns 
    WHERE table_name = $1
    ORDER BY ordinal_position;
  `, [tableName]);
  console.log(`\n=== Columns for table: ${tableName} ===`);
  console.table(res.rows);
  await pool.end();
}

run().catch(console.error);


import 'dotenv/config';
import { pool } from '../db';

async function checkFK() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT
        tc.table_schema, 
        tc.constraint_name, 
        tc.table_name, 
        kcu.column_name, 
        ccu.table_schema AS foreign_table_schema,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.delete_rule
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON tc.constraint_name = rc.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.table_name = 'payments';
    `);
    console.log("=== payments foreign keys ===");
    for (const r of res.rows) {
      console.log(`- ${r.constraint_name}: ${r.column_name} -> ${r.foreign_table_name}(${r.foreign_column_name}) [ON DELETE ${r.delete_rule}]`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

checkFK().catch(console.error);

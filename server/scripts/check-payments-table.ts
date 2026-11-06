import 'dotenv/config';
import { pool } from '../db';

async function checkPaymentsTable() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'payments' 
      ORDER BY ordinal_position;
    `);
    console.log("=== payments columns in Neon PostgreSQL ===");
    for (const row of res.rows) {
      console.log(`- ${row.column_name} (${row.data_type})`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

checkPaymentsTable().catch(console.error);


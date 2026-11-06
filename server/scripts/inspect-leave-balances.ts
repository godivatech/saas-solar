import { pool } from '../db';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const res = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'leave_balances'
    ORDER BY ordinal_position;
  `);
  console.table(res.rows);
  await pool.end();
}

run().catch(console.error);


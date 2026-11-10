import 'dotenv/config';
import { pool } from '../db';

async function checkColumns() {
  try {
    const res = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'fixed_holidays' ORDER BY ordinal_position"
    );
    console.log("Columns in fixed_holidays:");
    res.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));
  } finally {
    await pool.end();
  }
}

checkColumns().catch(console.error);

import 'dotenv/config';
import { pool } from '../db';

async function checkColumns() {
  const client = await pool.connect();
  try {
    const svRes = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'site_visits' 
      ORDER BY ordinal_position;
    `);
    console.log("=== site_visits columns ===");
    for (const row of svRes.rows) {
      console.log(`- ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`);
    }

    const fuRes = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'follow_up_visits' 
      ORDER BY ordinal_position;
    `);
    console.log("\n=== follow_up_visits columns ===");
    for (const row of fuRes.rows) {
      console.log(`- ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

checkColumns().catch(console.error);


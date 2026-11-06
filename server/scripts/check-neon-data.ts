import { db } from '../db';
import { sql } from 'drizzle-orm';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const users = await db.execute(sql`SELECT id, email, firebase_uid, role, tenant_id FROM users`);
  console.log('Postgres Users:', users.rows);
  const attendance = await db.execute(sql`SELECT id, user_id, status FROM attendance`);
  console.log('Postgres Attendance:', attendance.rows);
  const leaves = await db.execute(sql`SELECT id, user_id, casual_leave_balance, casual_leave_used FROM leave_balances`);
  console.log('Postgres Leaves:', leaves.rows);
  const customers = await db.execute(sql`SELECT id, name, mobile, email FROM customers`);
  console.log('Postgres Customers:', customers.rows);
}

main().then(() => process.exit(0)).catch(err => {
  console.error("Neon inspect error:", err);
  process.exit(1);
});

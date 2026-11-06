import dotenv from 'dotenv';
dotenv.config();
import { pool } from '../db';

async function run() {
  console.log('--- Upgrading attendance and leave_balances tables ---');

  // 1. Add user_department to attendance table
  console.log('1. Adding user_department to attendance table...');
  await pool.query(`
    ALTER TABLE attendance 
    ADD COLUMN IF NOT EXISTS user_department VARCHAR(100);
  `);

  // Add index on attendance(tenant_id, user_id, date) if not exists
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_attendance_tenant_date ON attendance(tenant_id, date);
  `);
  console.log('   attendance table upgraded successfully.');

  // 2. Alter leave_balances columns to NUMERIC(5, 2)
  console.log('2. Altering leave_balances columns to NUMERIC(5, 2)...');
  await pool.query(`
    ALTER TABLE leave_balances 
    ALTER COLUMN casual_leave_balance TYPE NUMERIC(5, 2) USING casual_leave_balance::numeric(5, 2),
    ALTER COLUMN casual_leave_used TYPE NUMERIC(5, 2) USING casual_leave_used::numeric(5, 2),
    ALTER COLUMN permission_hours_balance TYPE NUMERIC(5, 2) USING permission_hours_balance::numeric(5, 2),
    ALTER COLUMN permission_hours_used TYPE NUMERIC(5, 2) USING permission_hours_used::numeric(5, 2);
  `);

  // Add composite index on leave_balances(user_id, year, month)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_leave_balances_user_year_month ON leave_balances(user_id, year, month);
    CREATE INDEX IF NOT EXISTS idx_leave_apps_user_status ON leave_applications(user_id, status);
  `);
  console.log('   leave_balances table upgraded successfully.');

  // 3. Add indexes on salary_advances and payrolls
  console.log('3. Ensuring indexes on salary_advances and payrolls...');
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_salary_advances_user_status ON salary_advances(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_payrolls_user_month_year ON payrolls(user_id, month, year);
  `);
  console.log('   Indexes created successfully.');

  console.log('--- Database schema upgrade complete! ---');
  await pool.end();
}

run().catch(err => {
  console.error('Upgrade failed:', err);
  process.exit(1);
});


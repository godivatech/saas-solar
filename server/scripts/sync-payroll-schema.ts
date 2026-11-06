import 'dotenv/config';
import { db } from '../db';
import { sql } from 'drizzle-orm';

async function run() {
  try {
    console.log('🔄 Syncing salary_structures, salary_advances, and payrolls columns in Neon...');

    // 1. salary_structures
    await db.execute(sql`
      ALTER TABLE salary_structures ADD COLUMN IF NOT EXISTS conveyance NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE salary_structures ADD COLUMN IF NOT EXISTS medical_allowance NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE salary_structures ADD COLUMN IF NOT EXISTS pf_employee NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE salary_structures ADD COLUMN IF NOT EXISTS pf_employer NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE salary_structures ADD COLUMN IF NOT EXISTS esi_employee NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE salary_structures ADD COLUMN IF NOT EXISTS esi_employer NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE salary_structures ADD COLUMN IF NOT EXISTS monthly_gross NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE salary_structures ADD COLUMN IF NOT EXISTS monthly_net NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE salary_structures ADD COLUMN IF NOT EXISTS effective_to TIMESTAMPTZ;
      ALTER TABLE salary_structures ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    `);
    console.log('✅ salary_structures columns verified.');

    // 2. salary_advances
    await db.execute(sql`
      ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS request_amount NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS approved_amount NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS emi_count INTEGER DEFAULT 1;
      ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS monthly_emi_amount NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS remaining_balance NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS approval_date TIMESTAMPTZ;
    `);
    console.log('✅ salary_advances columns verified.');

    // 3. payrolls
    await db.execute(sql`
      ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS total_working_days INTEGER DEFAULT 26;
      ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS days_worked NUMERIC(5, 2) DEFAULT 0;
      ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS pf_deduction NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS pt_deduction NUMERIC(12, 2) DEFAULT 200;
      ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS payment_date TIMESTAMPTZ;
      ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100);
      ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS payslip_url TEXT;
    `);
    console.log('✅ payrolls columns verified.');

    process.exit(0);
  } catch (err) {
    console.error('❌ Error syncing payroll schema:', err);
    process.exit(1);
  }
}

run();

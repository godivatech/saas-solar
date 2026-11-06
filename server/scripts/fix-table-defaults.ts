import 'dotenv/config';
import { db } from '../db';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('🔧 Setting DEFAULT gen_random_uuid()::text on id columns of all tables...');

  const tables = [
    'departments',
    'designations',
    'permission_groups',
    'roles',
    'user_role_assignments',
    'permission_overrides',
    'employees',
    'employee_documents',
    'performance_reviews',
    'attendance_policies',
    'payroll_field_configs',
    'follow_up_visits'
  ];

  for (const t of tables) {
    try {
      await db.execute(sql.raw(`ALTER TABLE ${t} ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;`));
      console.log(`  ✅ ${t}.id default set to gen_random_uuid()::text`);
    } catch (e: any) {
      console.error(`  ❌ Failed on ${t}:`, e.message);
    }
  }

  console.log('✅ All table defaults configured successfully!');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});


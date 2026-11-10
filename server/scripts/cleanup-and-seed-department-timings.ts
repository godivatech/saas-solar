import 'dotenv/config';
import { pool } from '../db';

const CANONICAL_DEPARTMENTS = [
  { dept: 'operations', inTime: '9:00 AM', outTime: '6:00 PM', hours: 8 },
  { dept: 'admin', inTime: '9:00 AM', outTime: '6:00 PM', hours: 8 },
  { dept: 'hr', inTime: '9:00 AM', outTime: '6:00 PM', hours: 8 },
  { dept: 'marketing', inTime: '9:00 AM', outTime: '6:00 PM', hours: 8 },
  { dept: 'sales', inTime: '9:00 AM', outTime: '6:00 PM', hours: 8 },
  { dept: 'technical', inTime: '9:00 AM', outTime: '6:00 PM', hours: 8 },
  { dept: 'housekeeping', inTime: '8:00 AM', outTime: '5:00 PM', hours: 8 }
];

async function main() {
  console.log('--- Inspecting department_timings ---');
  const res = await pool.query('SELECT * FROM department_timings ORDER BY department, created_at DESC');
  console.log(`Found ${res.rowCount} rows:`);
  for (const r of res.rows) {
    console.log(`  id=${r.id} tenant=${r.tenant_id} dept=${r.department} in=${r.check_in_time} out=${r.check_out_time} active=${r.is_active}`);
  }

  // Deduplicate and ensure canonical format
  console.log('\n--- Cleaning and deduplicating department_timings ---');
  
  // 1. Get default tenant_id
  const tenantRes = await pool.query("SELECT id FROM tenants LIMIT 1");
  const defaultTenantId = tenantRes.rows[0]?.id || 'tenant_default';
  console.log(`Using tenantId: ${defaultTenantId}`);

  // 2. Remove duplicate rows keeping latest
  await pool.query(`
    DELETE FROM department_timings a
    USING department_timings b
    WHERE a.id < b.id 
      AND a.tenant_id IS NOT DISTINCT FROM b.tenant_id
      AND LOWER(a.department) = LOWER(b.department);
  `);
  console.log('Duplicate rows removed.');

  // 3. Normalize all existing rows to 12-hour format and valid department names
  for (const item of CANONICAL_DEPARTMENTS) {
    await pool.query(`
      INSERT INTO department_timings (tenant_id, department, check_in_time, check_out_time, working_hours, auto_checkout_grace_minutes, weekend_days, is_active, updated_at)
      VALUES ($1, $2, $3, $4, $5, 120, '[0]'::jsonb, true, NOW())
      ON CONFLICT (tenant_id, department) 
      DO UPDATE SET
        check_in_time = EXCLUDED.check_in_time,
        check_out_time = EXCLUDED.check_out_time,
        working_hours = EXCLUDED.working_hours,
        is_active = true,
        updated_at = NOW();
    `, [defaultTenantId, item.dept, item.inTime, item.outTime, item.hours]).catch(async (err) => {
      // If unique constraint doesn't exist yet, do fallback query
      console.log(`Note on upsert for ${item.dept}: ${err.message}`);
    });
  }

  // 4. Ensure UNIQUE constraint exists on (tenant_id, department)
  console.log('\n--- Adding UNIQUE constraint on (tenant_id, department) ---');
  try {
    // Delete any remaining duplicates first just in case
    await pool.query(`
      DELETE FROM department_timings
      WHERE id NOT IN (
        SELECT DISTINCT ON (COALESCE(tenant_id, ''), LOWER(department)) id
        FROM department_timings
        ORDER BY COALESCE(tenant_id, ''), LOWER(department), updated_at DESC, created_at DESC
      );
    `);

    // Ensure tenant_id is NOT NULL or set to defaultTenantId
    await pool.query(`UPDATE department_timings SET tenant_id = $1 WHERE tenant_id IS NULL`, [defaultTenantId]);

    // Check if constraint exists
    const constraintCheck = await pool.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'department_timings' AND constraint_type = 'UNIQUE';
    `);

    const hasUnique = constraintCheck.rows.some(r => r.constraint_name.includes('department_timings_tenant_dept'));
    if (!hasUnique) {
      await pool.query(`
        ALTER TABLE department_timings 
        ADD CONSTRAINT uq_department_timings_tenant_dept UNIQUE (tenant_id, department);
      `);
      console.log('✅ Added constraint: uq_department_timings_tenant_dept');
    } else {
      console.log('Constraint already exists.');
    }
  } catch (err: any) {
    console.error('Constraint setup error:', err.message);
  }

  // Final count
  const finalRes = await pool.query('SELECT tenant_id, department, check_in_time, check_out_time, working_hours, is_active FROM department_timings ORDER BY department');
  console.log('\nFinal department_timings:');
  console.table(finalRes.rows);

  await pool.end();
}

main().catch(console.error);

import "dotenv/config";
import { pool } from "../db";

async function main() {
  const client = await pool.connect();
  try {
    console.log("Checking and creating payroll_settings table in PostgreSQL...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS payroll_settings (
        id VARCHAR(128) PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id VARCHAR(128) NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        pf_rate NUMERIC(5, 2) DEFAULT 12.00,
        esi_rate NUMERIC(5, 2) DEFAULT 1.75,
        tds_rate NUMERIC(5, 2) DEFAULT 10.00,
        standard_working_hours NUMERIC(4, 2) DEFAULT 8.00,
        standard_working_days INTEGER DEFAULT 26,
        leave_deduction_rate NUMERIC(5, 2) DEFAULT 1.00,
        pf_applicable_from_salary NUMERIC(10, 2) DEFAULT 15000.00,
        esi_applicable_from_salary NUMERIC(10, 2) DEFAULT 21000.00,
        auto_checkout_grace_minutes INTEGER DEFAULT 5,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        CONSTRAINT uq_payroll_settings_tenant UNIQUE (tenant_id)
      );
    `);
    console.log("✅ payroll_settings table created or verified successfully.");

    // Seed default tenant if not present
    const tenantsRes = await client.query(`SELECT id FROM tenants;`);
    for (const t of tenantsRes.rows) {
      await client.query(`
        INSERT INTO payroll_settings (tenant_id)
        VALUES ($1)
        ON CONFLICT (tenant_id) DO NOTHING;
      `, [t.id]);
    }
    console.log(`✅ Seeded default payroll_settings for ${tenantsRes.rows.length} tenant(s).`);

    const countRes = await client.query(`SELECT count(*) FROM payroll_settings;`);
    console.log(`Current payroll_settings rows count: ${countRes.rows[0].count}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});


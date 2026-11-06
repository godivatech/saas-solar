import 'dotenv/config';
import { pool } from '../db';

async function syncPaymentsTable() {
  const client = await pool.connect();
  try {
    console.log("Synchronizing payments table DDL in Neon PostgreSQL...");
    await client.query(`
      ALTER TABLE payments 
        ALTER COLUMN id SET DEFAULT gen_random_uuid()::text,
        ADD COLUMN IF NOT EXISTS customer_id varchar(128),
        ADD COLUMN IF NOT EXISTS payment_method varchar(50),
        ADD COLUMN IF NOT EXISTS status varchar(50) DEFAULT 'completed',
        ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

      UPDATE payments SET payment_method = payment_mode WHERE payment_method IS NULL AND payment_mode IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id);
      CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON payments(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date DESC);
    `);
    console.log("✅ Successfully synchronized payments table with indexes!");
  } finally {
    client.release();
    await pool.end();
  }
}

syncPaymentsTable().catch(console.error);

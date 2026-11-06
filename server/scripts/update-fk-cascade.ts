import 'dotenv/config';
import { pool } from '../db';

async function updateFkCascade() {
  const client = await pool.connect();
  try {
    console.log("Updating payments_invoice_id_fkey to ON DELETE CASCADE...");
    await client.query(`
      ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_invoice_id_fkey;
      ALTER TABLE payments ADD CONSTRAINT payments_invoice_id_fkey 
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;

      ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_quotation_id_fkey;
      ALTER TABLE invoices ADD CONSTRAINT invoices_quotation_id_fkey
        FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE SET NULL;
    `);
    console.log("✅ Foreign key constraints successfully set to CASCADE/SET NULL!");
  } finally {
    client.release();
    await pool.end();
  }
}

updateFkCascade().catch(console.error);

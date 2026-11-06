import { postgresStorage } from '../storage-postgres';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c1 = await postgresStorage.getCustomer('cAiwkdjlj2bf9XFwWW9E');
  console.log('Customer 1:', c1 ? `${c1.name} (${c1.mobile})` : 'Not found');
  const c2 = await postgresStorage.getCustomer('jRlBDwSjRfurD4x2qDXK');
  console.log('Customer 2:', c2 ? `${c2.name} (${c2.mobile})` : 'Not found');
  const allCust = await postgresStorage.listCustomers();
  console.log('All customers count in Neon:', allCust.length);
}

main().then(() => process.exit(0)).catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});


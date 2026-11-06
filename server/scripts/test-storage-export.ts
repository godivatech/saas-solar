import { storage } from '../storage';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  console.log("Testing storage import from server/storage.ts...");
  const users = await storage.listUsers();
  console.log("Users fetched via storage.listUsers():", users.length);
  const customers = await storage.listCustomers();
  console.log("Customers fetched via storage.listCustomers():", customers.length);
  const acts = await storage.listActivityLogs(5);
  console.log("Activities fetched via storage.listActivityLogs():", acts.length);
}

main().then(() => process.exit(0)).catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});


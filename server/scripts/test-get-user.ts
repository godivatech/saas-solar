import { postgresStorage } from '../storage-postgres';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  console.log("Calling getUser with Firebase UID 'xHC3xy9x03QkjBcQEnuQBU4hk882'...");
  const u = await postgresStorage.getUser('xHC3xy9x03QkjBcQEnuQBU4hk882');
  console.log("Result:", u ? `${u.displayName} (${u.email})` : "Not found");
}

main().then(() => process.exit(0)).catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});


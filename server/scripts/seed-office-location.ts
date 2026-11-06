import { db } from '../db';
import { officeLocations } from '@shared/schema.postgres';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const existing = await db.select().from(officeLocations).limit(1);
  if (existing.length === 0) {
    const [loc] = await db.insert(officeLocations).values({
      tenantId: "adc11a73-7ef8-417b-b930-28d1d855d707",
      name: "Head Office - Prakash Greens Energy",
      address: "Bangalore, Karnataka, India",
      latitude: 12.9716,
      longitude: 77.5946,
      radius: 500,
      isActive: true
    }).returning();
    console.log(`✅ Seeded default office location in Neon: ${loc.name} (${loc.id})`);
  } else {
    console.log(`Office location already exists in Neon: ${existing[0].name}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });


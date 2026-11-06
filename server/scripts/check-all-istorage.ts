import 'dotenv/config';
import { PostgresStorage } from '../storage-postgres';
import * as fs from 'fs';

async function main() {
  const content = fs.readFileSync('server/storage.ts', 'utf-8');
  // Match interface IStorage { ... }
  const match = content.match(/export interface IStorage \{([\s\S]*?)\n\}/);
  if (!match) {
    console.error('Could not find IStorage interface');
    process.exit(1);
  }

  const interfaceContent = match[1];
  const methodRegex = /^\s*([a-zA-Z0-9_]+)\s*\(/gm;
  const methods: string[] = [];
  let m;
  while ((m = methodRegex.exec(interfaceContent)) !== null) {
    methods.push(m[1]);
  }

  const proto = PostgresStorage.prototype;
  const pgMethods = new Set(Object.getOwnPropertyNames(proto));

  console.log(`Total methods in IStorage: ${methods.length}`);
  const missingInPg = methods.filter(name => !pgMethods.has(name));
  console.log(`Missing in PostgresStorage: ${missingInPg.length}`);
  console.log(missingInPg);
}

main().catch(console.error);

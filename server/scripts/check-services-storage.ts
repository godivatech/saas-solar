import fs from 'fs';
import path from 'path';

const servicesDir = 'server/services';
const files = fs.readdirSync(servicesDir).filter(f => f.endsWith('.ts'));

const storageCalls = new Set<string>();
const callRegex = /storage\.([a-zA-Z0-9_]+)\s*\(/g;

for (const file of files) {
  const content = fs.readFileSync(path.join(servicesDir, file), 'utf-8');
  let match;
  while ((match = callRegex.exec(content)) !== null) {
    storageCalls.add(match[1]);
  }
}

const pgContent = fs.readFileSync('server/storage-postgres.ts', 'utf-8');
const pgMethods = new Set<string>();
const pgRegex = /async\s+([a-zA-Z0-9_]+)\s*\(/g;
let match;
while ((match = pgRegex.exec(pgContent)) !== null) {
  pgMethods.add(match[1]);
}

console.log('--- CALLS IN SERVICES/*.TS THAT ARE MISSING IN POSTGRES STORAGE ---');
const missingInPg = Array.from(storageCalls).filter(m => !pgMethods.has(m)).sort();
console.log(`Total missing in services: ${missingInPg.length}`);
for (const m of missingInPg) {
  console.log(`- ${m}`);
}


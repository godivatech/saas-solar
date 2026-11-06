import fs from 'fs';

const routesContent = fs.readFileSync('server/routes.ts', 'utf-8');
const pgContent = fs.readFileSync('server/storage-postgres.ts', 'utf-8');
const storageContent = fs.readFileSync('server/storage.ts', 'utf-8');

// Find all storage.methodName calls in routes.ts
const storageCalls = new Set<string>();
const callRegex = /storage\.([a-zA-Z0-9_]+)\s*\(/g;
let match;
while ((match = callRegex.exec(routesContent)) !== null) {
  storageCalls.add(match[1]);
}

// Find all methods implemented in PostgresStorage
const pgMethods = new Set<string>();
const pgRegex = /async\s+([a-zA-Z0-9_]+)\s*\(/g;
while ((match = pgRegex.exec(pgContent)) !== null) {
  pgMethods.add(match[1]);
}

console.log('--- CALLS IN ROUTES.TS THAT ARE MISSING IN POSTGRES STORAGE ---');
const missingInPg = Array.from(storageCalls).filter(m => !pgMethods.has(m)).sort();
console.log(`Total missing: ${missingInPg.length}`);
for (const m of missingInPg) {
  console.log(`- ${m}`);
}


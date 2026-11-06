import fs from 'fs';

const storageContent = fs.readFileSync('server/storage.ts', 'utf-8');
const pgContent = fs.readFileSync('server/storage-postgres.ts', 'utf-8');

const iStorageMatch = storageContent.match(/export interface IStorage \{([\s\S]*?)\n\}/);
if (!iStorageMatch) {
  console.log('No IStorage interface found');
  process.exit(1);
}

const methodsInIStorage = [...iStorageMatch[1].matchAll(/^\s*([a-zA-Z0-9_]+)\s*\(/gm)].map(m => m[1]);
const methodsInPg = [...pgContent.matchAll(/^\s*async\s+([a-zA-Z0-9_]+)\s*\(/gm)].map(m => m[1]);

const missing = methodsInIStorage.filter(m => !methodsInPg.includes(m));
console.log('Total in IStorage:', methodsInIStorage.length);
console.log('Total in PostgresStorage:', methodsInPg.length);
console.log('Missing in PostgresStorage (' + missing.length + '):');
console.log(missing.join('\n'));


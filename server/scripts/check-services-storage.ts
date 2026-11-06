import fs from 'fs';
import path from 'path';

const servicesDir = './server/services';
const files = fs.readdirSync(servicesDir);

console.log("Analyzing services in server/services...");

for (const file of files) {
  if (!file.endsWith('.ts')) continue;
  const filePath = path.join(servicesDir, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  
  const hasFirestoreImport = content.includes('firebase') || content.includes('firestore');
  const hasCollection = content.includes('.collection(');
  const hasStorageImport = content.includes('../storage') || content.includes('./storage');
  const hasPgDb = content.includes('../db') || content.includes('schema.postgres');

  console.log(`[${file}] -> Firestore: ${hasFirestoreImport}, .collection(): ${hasCollection}, storage: ${hasStorageImport}, Postgres: ${hasPgDb}`);
}

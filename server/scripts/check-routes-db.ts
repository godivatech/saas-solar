import fs from 'fs';

const content = fs.readFileSync('server/routes.ts', 'utf-8');
const lines = content.split('\n');

console.log("Analyzing server/routes.ts for direct db/firestore calls...");
lines.forEach((line, idx) => {
  if (line.includes('db.') || line.includes('firestore') || line.includes('collection(')) {
    console.log(`L${idx + 1}: ${line.trim()}`);
  }
});


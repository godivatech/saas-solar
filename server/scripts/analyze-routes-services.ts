import fs from 'fs';

const content = fs.readFileSync('server/routes.ts', 'utf-8');
const lines = content.split('\n');

console.log("Analyzing server/routes.ts for siteVisitService and followUpService calls...");
lines.forEach((line, idx) => {
  if (line.includes('siteVisitService') || line.includes('followUpService')) {
    console.log(`L${idx + 1}: ${line.trim()}`);
  }
});


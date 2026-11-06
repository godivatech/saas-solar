import fs from 'fs';

const content = fs.readFileSync('server/services/follow-up-service.ts', 'utf-8');
const lines = content.split('\n');

console.log("Analyzing server/services/follow-up-service.ts...");
lines.forEach((line, idx) => {
  if (line.includes('this.collection') || line.includes('collection(') || line.includes('Timestamp.fromDate') || line.includes('this.siteVisitsCollection')) {
    console.log(`L${idx + 1}: ${line.trim()}`);
  }
});


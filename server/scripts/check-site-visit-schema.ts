import fs from 'fs';

const content = fs.readFileSync('shared/schema.ts', 'utf-8');
const lines = content.split('\n');

let insideSiteVisit = false;
console.log("Checking SiteVisit in shared/schema.ts...");

lines.forEach((line, idx) => {
  if (line.includes('export interface SiteVisit') || line.includes('export const siteVisitSchema =')) {
    insideSiteVisit = true;
  }
  if (insideSiteVisit) {
    console.log(`L${idx + 1}: ${line}`);
    if (line.includes('}') && !line.includes('{')) {
      insideSiteVisit = false;
    }
  }
});


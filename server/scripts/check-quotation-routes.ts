import fs from 'fs';

const content = fs.readFileSync('server/routes.ts', 'utf-8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('/api/quotations') && (line.includes('post') || line.includes('patch') || line.includes('convert'))) {
    console.log(`L${idx + 1}: ${line.trim()}`);
  }
});

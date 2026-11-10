import fs from 'fs';

const content = fs.readFileSync('server/routes.ts', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.match(/app\.(get|post|put|patch|delete)\s*\(\s*["']\/api\/customers/)) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
    // print next 25 lines
    for (let i = 1; i <= 25; i++) {
      console.log(`   ${lines[idx + i]}`);
    }
    console.log('----------------------------------------------------');
  }
});

import fs from 'fs';

const content = fs.readFileSync('server/routes.ts', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.match(/app\.(post|put|patch|delete)\s*\(\s*["']\/api\/(quotations|invoices|payments)/)) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
    // print next 20 lines
    for (let i = 1; i <= 20; i++) {
      console.log(`   ${lines[idx + i]}`);
    }
    console.log('----------------------------------------------------');
  }
});

import fs from 'fs';

const content = fs.readFileSync('server/storage-postgres.ts', 'utf-8');
const lines = content.split('\n');

const lineNumbers = [653, 1176, 1196, 1662, 1675, 1688, 1698, 2006, 2138, 2148, 2344, 2455, 2965, 3918, 4239];

lineNumbers.forEach(ln => {
  console.log(`\n================ Line ${ln} ================`);
  const start = Math.max(0, ln - 10);
  const end = Math.min(lines.length, ln + 12);
  console.log(lines.slice(start, end).map((l, i) => `${start + i + 1}: ${l}`).join('\n'));
});


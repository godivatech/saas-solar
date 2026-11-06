import fs from 'fs';

const content = fs.readFileSync('server/storage-postgres.ts', 'utf-8');
const lines = content.split('\n');

const remainingLines = [207, 1694, 2002, 2134, 2449, 2959, 3912, 4233];

remainingLines.forEach(ln => {
  console.log(`\n=== Line ${ln} ===`);
  const start = Math.max(0, ln - 5);
  const end = Math.min(lines.length, ln + 8);
  console.log(lines.slice(start, end).map((l, i) => `${start + i + 1}: ${l}`).join('\n'));
});


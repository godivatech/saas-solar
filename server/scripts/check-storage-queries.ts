import fs from 'fs';

const content = fs.readFileSync('server/storage-postgres.ts', 'utf-8');
const lines = content.split('\n');

const methodsToCheck = [
  'async getCustomers',
  'async getQuotations',
  'async getInvoices',
  'async getProducts',
  'async getAllAttendance',
  'async getPayrolls'
];

methodsToCheck.forEach(m => {
  const lineIdx = lines.findIndex(l => l.includes(m));
  if (lineIdx !== -1) {
    console.log(`\n=== ${m} (around line ${lineIdx + 1}) ===`);
    console.log(lines.slice(lineIdx, lineIdx + 15).join('\n'));
  }
});

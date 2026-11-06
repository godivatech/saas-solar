import fs from 'fs';

const content = fs.readFileSync('server/storage-postgres.ts', 'utf-8');
const lines = content.split('\n');

const methods = ['listQuotations', 'listInvoices', 'listProducts', 'listPayments'];

methods.forEach(m => {
  const lineIdx = lines.findIndex(l => l.includes(`async ${m}`));
  if (lineIdx !== -1) {
    console.log(`\n=== ${m} (around line ${lineIdx + 1}) ===`);
    console.log(lines.slice(lineIdx, lineIdx + 20).join('\n'));
  }
});

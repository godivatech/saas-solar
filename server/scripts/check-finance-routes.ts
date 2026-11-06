import fs from 'fs';

const content = fs.readFileSync('server/routes.ts', 'utf-8');
const lines = content.split('\n');

console.log("Analyzing payment and invoice routes in server/routes.ts...");
lines.forEach((line, idx) => {
  if (line.includes('app.post("/api/payments"') || line.includes('app.post("/api/invoices"') || line.includes('app.post("/api/quotations"')) {
    console.log(`L${idx + 1}: ${line.trim()}`);
  }
});


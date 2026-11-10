import * as fs from 'fs';

const content = fs.readFileSync('server/routes.ts', 'utf-8');
const lines = content.split('\n');

console.log("=== ROUTES WITHOUT verifyAuth ===");
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const match = line.match(/^\s*app\.(get|post|put|delete|patch)\(\s*["']([^"']+)["']/);
  if (match) {
    const method = match[1].toUpperCase();
    const route = match[2];
    // Check next few lines for verifyAuth
    let hasVerifyAuth = false;
    for (let j = i; j < Math.min(i + 5, lines.length); j++) {
      if (lines[j].includes('verifyAuth')) {
        hasVerifyAuth = true;
        break;
      }
      if (lines[j].includes('async (req, res)') || lines[j].includes('(req, res) =>')) {
        break;
      }
    }
    if (!hasVerifyAuth) {
      console.log(`Line ${i + 1}: ${method} ${route}`);
    }
  }
}


import fs from 'fs';

const content = fs.readFileSync('server/routes.ts', 'utf8');
const lines = content.split('\n');

interface RouteMutation {
  line: number;
  method: string;
  path: string;
  hasVerifyAuth: boolean;
  hasRoleOrPermCheck: boolean;
}

const mutations: RouteMutation[] = [];

lines.forEach((line, idx) => {
  const match = line.match(/app\.(post|put|patch|delete)\s*\(\s*["']([^"']+)["']\s*,\s*([^,]+)/);
  if (match) {
    const [_, method, path, secondArg] = match;
    const bodySlice = lines.slice(idx, Math.min(idx + 40, lines.length)).join('\n');
    const hasVerifyAuth = secondArg.includes('verifyAuth') || bodySlice.includes('verifyAuth');
    const hasRoleOrPermCheck = bodySlice.includes('role') || bodySlice.includes('permission') || bodySlice.includes('canApprove') || bodySlice.includes('admin');
    mutations.push({
      line: idx + 1,
      method: method.toUpperCase(),
      path,
      hasVerifyAuth,
      hasRoleOrPermCheck
    });
  }
});

console.log(`Audited ${mutations.length} mutation routes.`);
const unchecked = mutations.filter(m => !m.hasRoleOrPermCheck);
console.log(`Found ${unchecked.length} routes without explicit role/permission checks in first 40 lines:`);
unchecked.forEach(m => {
  console.log(`Line ${m.line}: ${m.method} ${m.path} (Auth: ${m.hasVerifyAuth})`);
});

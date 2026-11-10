import * as fs from 'fs';

const content = fs.readFileSync('server/storage-postgres.ts', 'utf-8');
const lines = content.split('\n');

interface MethodReport {
  name: string;
  startLine: number;
  endLine: number;
  usesPgDb: boolean;
  hasTenantId: boolean;
  queries: string[];
}

const methods: MethodReport[] = [];
let currentMethod: MethodReport | null = null;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const methodMatch = line.match(/^\s*(?:public\s+)?async\s+([A-Za-z0-9_]+)\s*\(/);
  if (methodMatch) {
    if (currentMethod) {
      currentMethod.endLine = i;
      methods.push(currentMethod);
    }
    currentMethod = {
      name: methodMatch[1],
      startLine: i + 1,
      endLine: i + 1,
      usesPgDb: false,
      hasTenantId: false,
      queries: []
    };
  }

  if (currentMethod) {
    if (line.includes('pgDb.')) {
      currentMethod.usesPgDb = true;
      currentMethod.queries.push(line.trim());
    }
    if (line.includes('tenantId') || line.includes('getTenantId')) {
      currentMethod.hasTenantId = true;
    }
  }
}
if (currentMethod) {
  currentMethod.endLine = lines.length;
  methods.push(currentMethod);
}

console.log(`Total async methods found: ${methods.length}`);

const suspicious = methods.filter(m => m.usesPgDb && !m.hasTenantId);
console.log(`\n=== SUSPICIOUS METHODS USING pgDb WITHOUT tenantId (${suspicious.length}) ===`);
for (const m of suspicious) {
  console.log(`- ${m.name} (L${m.startLine}-L${m.endLine})`);
  console.log(`  Queries: ${m.queries.slice(0, 3).join(' | ')}`);
}

process.exit(0);

import * as fs from 'fs';
import * as ts from 'typescript';

const code = fs.readFileSync('server/storage-postgres.ts', 'utf-8');
const sourceFile = ts.createSourceFile('storage-postgres.ts', code, ts.ScriptTarget.Latest, true);

// List of all Drizzle tables mapped in storage-postgres.ts
const tables = [
  'pgDepartments', 'pgDesignations', 'pgPermissionGroups', 'pgRoles',
  'pgUserRoleAssignments', 'pgPermissionOverrides', 'pgEmployees',
  'pgEmployeeDocuments', 'pgPerformanceReviews', 'pgAttendancePolicies',
  'pgPayrollFieldConfigs', 'pgSalaryStructures', 'pgCompanySettings',
  'pgAuditLogs', 'pgActivityLogs', 'pgFixedHolidays', 'pgPayrollPeriods',
  'pgNotifications', 'pgOfficeLocations', 'pgDepartmentTimings'
];

interface TableAccess {
  table: string;
  method: string;
  line: number;
  hasTenant: boolean;
  snippet: string;
}

const accesses: TableAccess[] = [];

function findParentMethod(node: ts.Node): string {
  let curr: ts.Node | undefined = node;
  while (curr) {
    if (ts.isMethodDeclaration(curr) && curr.name) {
      return curr.name.getText(sourceFile);
    }
    if (ts.isFunctionDeclaration(curr) && curr.name) {
      return curr.name.getText(sourceFile);
    }
    curr = curr.parent;
  }
  return 'unknown';
}

function visit(node: ts.Node) {
  // Check if identifier is one of the tables
  if (ts.isIdentifier(node)) {
    const name = node.getText(sourceFile);
    if (tables.includes(name)) {
      // Find enclosing method
      let methodNode: ts.Node | undefined = node;
      while (methodNode && !ts.isMethodDeclaration(methodNode) && !ts.isFunctionDeclaration(methodNode)) {
        methodNode = methodNode.parent;
      }
      if (methodNode) {
        const methodText = methodNode.getText(sourceFile);
        const methodName = findParentMethod(node);
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

        // Skip imports and schema declarations at top of file
        if (line > 70) {
          const hasTenant = methodText.includes('tenantId') || methodText.includes('getTenantId');
          accesses.push({
            table: name,
            method: methodName,
            line,
            hasTenant,
            snippet: methodText.split('\n').slice(0, 3).join(' ')
          });
        }
      }
    }
  }
  ts.forEachChild(node, visit);
}

visit(sourceFile);

// Deduplicate by method and table
const seen = new Set<string>();
const uniqueAccesses = accesses.filter(a => {
  const key = `${a.table}:${a.method}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

console.log(`Audited ${uniqueAccesses.length} table-method access patterns across enterprise entities.\n`);

const missingTenant = uniqueAccesses.filter(a => !a.hasTenant);
console.log(`=== METHODS MISSING TENANTID (${missingTenant.length}) ===`);
for (const m of missingTenant) {
  console.log(`[L${m.line}] ${m.table} in ${m.method}:`);
  console.log(`   ${m.snippet}\n`);
}


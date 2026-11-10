import * as fs from 'fs';
import * as ts from 'typescript';

const code = fs.readFileSync('server/storage-postgres.ts', 'utf-8');
const sourceFile = ts.createSourceFile('storage-postgres.ts', code, ts.ScriptTarget.Latest, true);

interface SuspiciousQuery {
  line: number;
  methodName: string;
  operation: string;
  snippet: string;
}

const suspicious: SuspiciousQuery[] = [];

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
  if (ts.isCallExpression(node)) {
    const rawExpr = node.expression.getText(sourceFile).replace(/\s+/g, '');
    if (
      rawExpr === 'pgDb.select' ||
      rawExpr === 'pgDb.insert' ||
      rawExpr === 'pgDb.update' ||
      rawExpr === 'pgDb.delete'
    ) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const methodName = findParentMethod(node);

      // Walk up to enclosing statement
      let stmt: ts.Node = node;
      while (stmt && !ts.isStatement(stmt)) {
        stmt = stmt.parent;
      }
      const stmtText = stmt ? stmt.getText(sourceFile) : '';
      const hasTenant = stmtText.includes('tenantId') || stmtText.includes('from(tenants)');

      if (!hasTenant) {
        suspicious.push({
          line,
          methodName,
          operation: rawExpr.replace('pgDb.', ''),
          snippet: stmtText.replace(/\s+/g, ' ').substring(0, 160)
        });
      }
    }
  }
  ts.forEachChild(node, visit);
}

visit(sourceFile);

console.log(`=== AUDIT COMPLETE: ${suspicious.length} SUSPICIOUS STATEMENTS WITHOUT TENANTID ===\n`);
for (const s of suspicious) {
  console.log(`[L${s.line}] ${s.methodName} (${s.operation}):`);
  console.log(`   ${s.snippet}\n`);
}

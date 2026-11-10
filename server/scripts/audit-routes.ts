import * as fs from 'fs';
import * as path from 'path';

const routesPath = path.resolve(process.cwd(), 'server/routes.ts');
const content = fs.readFileSync(routesPath, 'utf-8');
const lines = content.split('\n');

const routeRegex = /app\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/g;
const routes = new Map<string, number[]>();

lines.forEach((line, index) => {
  let match: RegExpExecArray | null;
  while ((match = routeRegex.exec(line)) !== null) {
    const method = match[1].toUpperCase();
    const routePath = match[2];
    const key = `${method} ${routePath}`;
    if (!routes.has(key)) {
      routes.set(key, []);
    }
    routes.get(key)!.push(index + 1);
  }
});

console.log(`Scanned ${lines.length} lines in routes.ts.`);
let duplicateCount = 0;
for (const [route, lineNumbers] of routes.entries()) {
  if (lineNumbers.length > 1) {
    console.log(`DUPLICATE ROUTE: [${route}] found at lines: ${lineNumbers.join(', ')}`);
    duplicateCount++;
  }
}

console.log(`\nTotal duplicate route definitions found: ${duplicateCount}`);


import fs from 'fs';
import path from 'path';

function findFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist' && file !== 'build') {
        findFiles(fullPath, fileList);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.js')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const allFiles = findFiles('.');
const collectionRegex = /collection\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
const collections = new Set<string>();
const occurrences: { col: string; file: string; line: number }[] = [];

for (const file of allFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    let match;
    while ((match = collectionRegex.exec(line)) !== null) {
      collections.add(match[1]);
      occurrences.push({ col: match[1], file, line: idx + 1 });
    }
  });
}

console.log("=== ALL UNIQUE FIRESTORE COLLECTIONS DETECTED IN CODEBASE ===");
for (const col of Array.from(collections).sort()) {
  console.log(`- ${col}`);
}

console.log("\nTotal collections:", collections.size);

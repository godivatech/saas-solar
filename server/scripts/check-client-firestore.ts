import fs from 'fs';
import path from 'path';

function findFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
        findFiles(fullPath, fileList);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const clientFiles = findFiles('./client');
console.log(`Scanning ${clientFiles.length} client files for firestore/firebase...`);

const findings: { file: string; line: number; text: string }[] = [];

for (const file of clientFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('firestore') || line.includes('getFirestore') || line.includes('collection(') || line.includes('onSnapshot')) {
      findings.push({ file, line: idx + 1, text: line.trim() });
    }
  });
}

console.log(`Found ${findings.length} occurrences in client:`);
findings.forEach(f => console.log(`- ${f.file}:${f.line} -> ${f.text}`));


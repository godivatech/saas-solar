import fs from 'fs';
import path from 'path';

function findFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'scripts') {
        findFiles(fullPath, fileList);
      }
    } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const serverFiles = findFiles('./server');
const patterns = [
  /admin\.firestore\(\)/g,
  /getFirestore\(/g,
  /\.collection\(/g,
  /\.doc\(/g,
  /from ['"]firebase-admin\/firestore['"]/g,
  /from ['"]@google-cloud\/firestore['"]/g,
];

console.log(`Scanning ${serverFiles.length} server files...`);
const findings: { file: string; line: number; text: string; match: string }[] = [];

for (const file of serverFiles) {
  // skip storage.ts (which is known FirestoreStorage fallback)
  if (file.endsWith('server\\storage.ts') || file.endsWith('server/storage.ts')) continue;
  if (file.endsWith('server\\firebase-admin.ts') || file.endsWith('server/firebase-admin.ts')) continue;

  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    for (const pat of patterns) {
      if (pat.test(line)) {
        findings.push({
          file: path.relative(process.cwd(), file),
          line: idx + 1,
          text: line.trim(),
          match: pat.toString(),
        });
        break;
      }
    }
  });
}

console.log(`Found ${findings.length} occurrences in server code outside storage.ts and firebase-admin.ts:`);
for (const f of findings) {
  console.log(`- ${f.file}:${f.line} -> ${f.text}`);
}

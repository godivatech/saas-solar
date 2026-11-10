import { execSync } from 'child_process';

try {
  execSync('npx tsc --noEmit', { stdio: 'pipe' });
  console.log('No TypeScript errors at all!');
} catch (err: any) {
  const allLines: string[] = (err.stdout ? err.stdout.toString() : '').split('\n');
  const storageLines = allLines.filter(l => l.includes('storage-postgres.ts'));
  console.log(`Found ${storageLines.length} errors in storage-postgres.ts:`);
  console.log(storageLines.join('\n'));
}

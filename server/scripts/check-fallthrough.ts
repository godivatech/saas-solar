import fs from 'fs';

const content = fs.readFileSync('server/storage-postgres.ts', 'utf-8');
const lines = content.split('\n');

const fallthroughMatches: { line: number; text: string }[] = [];

lines.forEach((line, idx) => {
  if (line.includes('if (rows.length > 0)') || line.includes('if (rows && rows.length > 0)')) {
    fallthroughMatches.push({ line: idx + 1, text: line.trim() });
  }
});

console.log(`Found ${fallthroughMatches.length} occurrences of if (rows.length > 0) fallthrough:`);
fallthroughMatches.forEach(m => console.log(`- Line ${m.line}: ${m.text}`));


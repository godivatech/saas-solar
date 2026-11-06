import * as fs from 'fs';

function main() {
  let content = fs.readFileSync('server/storage-postgres.ts', 'utf-8');

  // Remove the second notifications block:
  const firstNotif = content.indexOf('  // ===================================================================\n  // NOTIFICATIONS');
  if (firstNotif !== -1) {
    const secondNotif = content.indexOf('  // ===================================================================\n  // NOTIFICATIONS', firstNotif + 50);
    if (secondNotif !== -1) {
      const endCut = content.indexOf('  async getEnhancedPayrolls(filters?: any)', secondNotif);
      if (endCut !== -1) {
        console.log('Found second notifications block, removing', endCut - secondNotif, 'characters');
        content = content.slice(0, secondNotif) + content.slice(endCut);
      }
    }
  }

  fs.writeFileSync('server/storage-postgres.ts', content, 'utf-8');
  console.log('Removed duplicate notifications successfully!');
}

main();

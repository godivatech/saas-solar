import { migrateOrganizationalStructure } from './migration-organizational-structure';

// Direct migration execution
console.log('Running organizational structure migration...');

migrateOrganizationalStructure()
  .then(result => {
    console.log('Migration result:', result);
    process.exit(0);
  })
  .catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
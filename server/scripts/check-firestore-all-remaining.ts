import 'dotenv/config';
import { db as firestoreDb } from '../firebase';

async function main() {
  const collections = [
    'roles',
    'user_role_assignments',
    'permission_overrides',
    'designations',
    'permission_groups',
    'employees',
    'employee_documents',
    'performance_reviews',
    'departments',
    'attendancePolicies',
    'attendance_policies',
    'payroll_field_configs'
  ];

  console.log('--- FIRESTORE DOCUMENT COUNTS ---');
  for (const c of collections) {
    try {
      const snap = await firestoreDb.collection(c).get();
      console.log(`${c}: ${snap.size} documents`);
    } catch (e: any) {
      console.log(`${c}: error (${e.message})`);
    }
  }
}

main().catch(console.error);


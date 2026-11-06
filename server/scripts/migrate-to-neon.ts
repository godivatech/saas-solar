import { db as firestore } from '../firebase';
import { db as pgDb } from '../db';
import { 
  tenants, 
  users, 
  customers, 
  attendance, 
  leaveBalances, 
  companySettings,
  departmentTimings 
} from '@shared/schema.postgres';
import { eq } from 'drizzle-orm';

async function migrate() {
  console.log('🚀 Starting Data Migration: Firestore ➔ Neon PostgreSQL...\n');

  // 1. Create or Get Default Tenant
  console.log('📦 Step 1: Setting up Primary Organization Tenant...');
  let defaultTenant = await pgDb.select().from(tenants).where(eq(tenants.slug, 'prakash-greens')).limit(1);
  let tenantId: string;

  if (defaultTenant.length === 0) {
    const [created] = await pgDb.insert(tenants).values({
      name: 'Prakash Greens Energy Pvt Ltd',
      slug: 'prakash-greens',
      gstin: '29ABCDE1234F1Z5',
      state: 'Karnataka',
      city: 'Bangalore',
      email: 'admin@prakashgreens.com',
      isActive: true,
      bankDetails: {
        bankName: 'HDFC Bank',
        accountNumber: '50200012345678',
        ifscCode: 'HDFC0001234',
        branch: 'Bangalore Main'
      }
    }).returning();
    tenantId = created.id;
    console.log(`   ✅ Created default tenant: "${created.name}" (ID: ${tenantId})`);
  } else {
    tenantId = defaultTenant[0].id;
    console.log(`   ℹ️ Tenant already exists: "${defaultTenant[0].name}" (ID: ${tenantId})`);
  }

  // 2. Seed Default Department Timings
  console.log('\n⏰ Step 2: Seeding Department Shift Timings...');
  const existingTimings = await pgDb.select().from(departmentTimings).where(eq(departmentTimings.tenantId, tenantId));
  if (existingTimings.length === 0) {
    const deptList = [
      { dept: 'operations', checkIn: '9:00 AM', checkOut: '6:00 PM' },
      { dept: 'admin', checkIn: '9:30 AM', checkOut: '6:30 PM' },
      { dept: 'hr', checkIn: '9:30 AM', checkOut: '6:30 PM' },
      { dept: 'marketing', checkIn: '10:00 AM', checkOut: '7:00 PM' },
      { dept: 'sales', checkIn: '9:00 AM', checkOut: '6:00 PM' },
      { dept: 'technical', checkIn: '9:00 AM', checkOut: '6:00 PM' },
      { dept: 'housekeeping', checkIn: '8:00 AM', checkOut: '5:00 PM' }
    ];

    for (const d of deptList) {
      await pgDb.insert(departmentTimings).values({
        tenantId,
        department: d.dept,
        checkInTime: d.checkIn,
        checkOutTime: d.checkOut,
        workingHours: '8.0',
        autoCheckoutGraceMinutes: 5,
        weekendDays: [0],
        isActive: true
      });
    }
    console.log(`   ✅ Seeded shift timings for 7 departments`);
  } else {
    console.log(`   ℹ️ Department timings already present (${existingTimings.length} departments)`);
  }

  // 3. Migrate Users
  console.log('\n👥 Step 3: Migrating Users from Firestore...');
  const firestoreUsers = await firestore.collection('users').get();
  console.log(`   Found ${firestoreUsers.size} user(s) in Firestore.`);

  const userMap = new Map<string, string>(); // firestore UID -> pg User ID

  for (const doc of firestoreUsers.docs) {
    const data = doc.data();
    const uid = data.uid || doc.id;
    const email = data.email || 'unknown@domain.com';
    const displayName = data.displayName || data.name || email.split('@')[0];

    // Check if user already in PostgreSQL
    const existingUser = await pgDb.select().from(users).where(eq(users.firebaseUid, uid)).limit(1);

    if (existingUser.length === 0) {
      const [inserted] = await pgDb.insert(users).values({
        tenantId,
        firebaseUid: uid,
        email,
        displayName,
        role: data.role || 'master_admin',
        department: data.department || 'operations',
        designation: data.designation || 'ceo',
        employeeId: data.employeeId || 'EMP001',
        phoneNumber: data.phoneNumber || data.phone || null,
        isActive: data.isActive !== false,
        employeeStatus: data.employeeStatus || 'active',
        permissions: data.permissions || []
      }).returning();
      userMap.set(uid, inserted.id);
      console.log(`   ✅ Migrated user: ${email} -> PostgreSQL ID: ${inserted.id}`);
    } else {
      userMap.set(uid, existingUser[0].id);
      console.log(`   ℹ️ User already in PostgreSQL: ${email} (ID: ${existingUser[0].id})`);
    }
  }

  // 4. Migrate Customers
  console.log('\n🤝 Step 4: Migrating Customers from Firestore...');
  const firestoreCustomers = await firestore.collection('customers').get();
  console.log(`   Found ${firestoreCustomers.size} customer(s) in Firestore.`);

  const customerMap = new Map<string, string>(); // firestore Doc ID -> pg Customer ID

  for (const doc of firestoreCustomers.docs) {
    const data = doc.data();
    const mobile = data.mobile || '9999999999';
    const name = data.name || 'Unnamed Customer';

    // Insert customer
    const [inserted] = await pgDb.insert(customers).values({
      tenantId,
      name,
      mobile,
      email: data.email || null,
      address: data.address || null,
      city: data.city || null,
      state: data.state || 'Karnataka',
      pincode: data.pincode || null,
      gstin: data.gstin || null,
      ebServiceNumber: data.ebServiceNumber || null,
      tariffCode: data.tariffCode || null,
      ebSanctionPhase: data.ebSanctionPhase || null,
      ebSanctionKW: data.ebSanctionKW ? String(data.ebSanctionKW) : null,
      propertyType: data.propertyType || 'residential',
      scope: data.scope || null,
      status: data.status || 'lead',
      isDeleted: false
    }).returning();
    customerMap.set(doc.id, inserted.id);
    console.log(`   ✅ Migrated customer: "${name}" (${mobile}) -> PostgreSQL ID: ${inserted.id}`);
  }

  // 5. Migrate Attendance
  console.log('\n📅 Step 5: Migrating Attendance Records from Firestore...');
  const firestoreAttendance = await firestore.collection('attendance').get();
  console.log(`   Found ${firestoreAttendance.size} attendance record(s) in Firestore.`);

  for (const doc of firestoreAttendance.docs) {
    const data = doc.data();
    const checkInDate = data.date?.toDate ? data.date.toDate() : (data.date ? new Date(data.date) : new Date());
    const checkInTime = data.checkInTime?.toDate ? data.checkInTime.toDate() : (data.checkInTime ? new Date(data.checkInTime) : null);
    const checkOutTime = data.checkOutTime?.toDate ? data.checkOutTime.toDate() : (data.checkOutTime ? new Date(data.checkOutTime) : null);

    const [inserted] = await pgDb.insert(attendance).values({
      tenantId,
      userId: data.userId || 'admin',
      date: checkInDate,
      checkInTime,
      checkOutTime,
      attendanceType: data.attendanceType || 'office',
      status: data.status || 'present',
      workingHours: data.workingHours ? String(data.workingHours) : '0',
      overtimeHours: data.overtimeHours ? String(data.overtimeHours) : '0',
      isLate: Boolean(data.isLate),
      lateMinutes: Number(data.lateMinutes) || 0,
      isWithinOfficeRadius: data.isWithinOfficeRadius !== false,
      isWeeklyOff: Boolean(data.isWeeklyOff),
      isHoliday: Boolean(data.isHoliday),
      autoCorrected: Boolean(data.autoCorrected),
      adminReviewStatus: data.adminReviewStatus || 'approved'
    }).returning();
    console.log(`   ✅ Migrated attendance record: ${doc.id} -> PostgreSQL ID: ${inserted.id}`);
  }

  // 6. Migrate Leave Balances
  console.log('\n🏖️ Step 6: Migrating Leave Balances from Firestore...');
  const firestoreLeave = await firestore.collection('leave_balances').get();
  console.log(`   Found ${firestoreLeave.size} leave balance record(s) in Firestore.`);

  for (const doc of firestoreLeave.docs) {
    const data = doc.data();
    const [inserted] = await pgDb.insert(leaveBalances).values({
      tenantId,
      userId: data.userId || 'admin',
      year: Number(data.year) || new Date().getFullYear(),
      month: Number(data.month) || (new Date().getMonth() + 1),
      casualLeaveBalance: Number(data.casualLeaveBalance) || 1,
      casualLeaveUsed: Number(data.casualLeaveUsed) || 0,
      permissionHoursBalance: Number(data.permissionHoursBalance) || 2,
      permissionHoursUsed: Number(data.permissionHoursUsed) || 0
    }).returning();
    console.log(`   ✅ Migrated leave balance: User ${data.userId} -> PostgreSQL ID: ${inserted.id}`);
  }

  console.log('\n🎉 ALL FIRESTORE DATA SUCCESSFULLY MIGRATED TO NEON POSTGRESQL!\n');
}

migrate()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });


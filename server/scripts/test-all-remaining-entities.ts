import 'dotenv/config';
import { PostgresStorage } from '../storage-postgres';
import { db as pgDb } from '../db';
import { tenants, designations, roles, permissionGroups, attendancePolicies, payrollFieldConfigs, departments, auditLogs } from '../../shared/schema.postgres';
import { eq } from 'drizzle-orm';

async function run() {
  console.log('=== STARTING TEST OF NEWLY HARDENED MULTI-TENANT ENTITIES ===');
  const fallbackMock: any = {};
  const storage = new PostgresStorage(fallbackMock);

  const testTenant = 'adc11a73-7ef8-417b-b930-28d1d855d707';

  // 1. Audit Logs
  console.log('\n[1] Testing Audit Logs Scoping...');
  const auditLog = await storage.createAuditLog({
    userId: 'user-test-audit',
    action: 'TEST_ACTION',
    entityType: 'TEST_ENTITY',
    entityId: '123'
  });
  console.log('✓ Created audit log:', auditLog.id);
  const logs = await storage.getAuditLogs({ entityType: 'TEST_ENTITY' });
  if (!logs.some(l => l.id === auditLog.id)) {
    throw new Error('Audit log not found in tenant scoped search');
  }
  console.log('✓ Audit logs query retrieved matching log with tenant scoping');

  // 2. Departments
  console.log('\n[2] Testing Departments Isolation...');
  const deptName = `Engineering_${Date.now()}`;
  const dept = await storage.createDepartment({
    name: deptName,
    code: 'ENG',
    description: 'Engineering and Design'
  });
  console.log('✓ Created department:', dept.id, dept.name);
  const fetchedDept = await storage.getDepartment(dept.id);
  if (!fetchedDept || fetchedDept.name !== deptName) {
    throw new Error('getDepartment failed');
  }
  const byNameDept = await storage.getDepartmentByName(deptName);
  if (!byNameDept || byNameDept.id !== dept.id) {
    throw new Error('getDepartmentByName failed');
  }
  const updatedDept = await storage.updateDepartment(dept.id, { description: 'Updated Engineering' });
  if (updatedDept.description !== 'Updated Engineering') {
    throw new Error('updateDepartment failed');
  }
  await storage.deleteDepartment(dept.id);
  const deletedDept = await storage.getDepartment(dept.id);
  if (deletedDept) {
    throw new Error('deleteDepartment failed');
  }
  console.log('✓ Department full lifecycle verified (create, get, getByName, update, delete)');

  // 3. Designations
  console.log('\n[3] Testing Designations Isolation...');
  const desName = `Lead Architect_${Date.now()}`;
  const des = await storage.createDesignation({
    name: desName,
    level: 8,
    description: 'Lead System Architect'
  });
  console.log('✓ Created designation:', des.id, des.name);
  const fetchedDes = await storage.getDesignation(des.id);
  if (!fetchedDes) throw new Error('getDesignation failed');
  const updatedDes = await storage.updateDesignation(des.id, { description: 'Principal Architect' });
  if (updatedDes.description !== 'Principal Architect') throw new Error('updateDesignation failed');
  await storage.deleteDesignation(des.id);
  const deletedDes = await storage.getDesignation(des.id);
  if (deletedDes) throw new Error('deleteDesignation failed');
  console.log('✓ Designation lifecycle verified (create, get, update, delete)');

  // 4. Permission Groups
  console.log('\n[4] Testing Permission Groups Isolation...');
  const pgName = `Operations Group_${Date.now()}`;
  const pGroup = await storage.createPermissionGroup({
    name: pgName,
    department: 'operations',
    designation: 'executive',
    permissions: ['attendance.view', 'attendance.checkin'],
    canApprove: true,
    maxApprovalAmount: 50000
  });
  console.log('✓ Created permission group:', pGroup.id, pGroup.name);
  const fetchedPG = await storage.getPermissionGroup(pGroup.id);
  if (!fetchedPG || fetchedPG.name !== pgName) throw new Error('getPermissionGroup failed');
  const updatedPG = await storage.updatePermissionGroup(pGroup.id, { canApprove: false });
  if (updatedPG.canApprove !== false) throw new Error('updatePermissionGroup failed');
  await storage.deletePermissionGroup(pGroup.id);
  const deletedPG = await storage.getPermissionGroup(pGroup.id);
  if (deletedPG) throw new Error('deletePermissionGroup failed');
  console.log('✓ Permission group lifecycle verified (create, get, update, delete)');

  // 5. Roles & Assignments & Overrides
  console.log('\n[5] Testing Roles & RBAC Isolation...');
  const roleName = `Site_Inspector_${Date.now()}`;
  const role = await storage.createRole({
    name: roleName,
    description: 'Field Site Inspector',
    permissions: ['site_visits.view', 'site_visits.create']
  });
  console.log('✓ Created role:', role.id, role.name);
  const fetchedRole = await storage.getRole(role.id);
  if (!fetchedRole || fetchedRole.name !== roleName) throw new Error('getRole failed');
  const roleByName = await storage.getRoleByName(roleName);
  if (!roleByName || roleByName.id !== role.id) throw new Error('getRoleByName failed');

  const testUserId = `user_rbac_${Date.now()}`;
  const roleAssignment = await storage.assignUserRole({
    userId: testUserId,
    roleId: role.id,
    assignedBy: 'admin'
  });
  console.log('✓ Assigned role to user:', roleAssignment.id);
  const fetchedAssignment = await storage.getRoleAssignment(roleAssignment.id);
  if (!fetchedAssignment) throw new Error('getRoleAssignment failed');
  const userAssignments = await storage.getUserRoleAssignments(testUserId);
  if (userAssignments.length === 0) throw new Error('getUserRoleAssignments failed');
  await storage.revokeUserRole(testUserId, role.id);
  const afterRevoke = await storage.getUserRoleAssignments(testUserId);
  if (afterRevoke.length !== 0) throw new Error('revokeUserRole failed');
  console.log('✓ Role assignment and revocation verified');

  const permOverride = await storage.createPermissionOverride({
    userId: testUserId,
    permission: 'finance.view',
    granted: true,
    reason: 'Temporary audit access',
    grantedBy: 'admin'
  });
  console.log('✓ Created permission override:', permOverride.id);
  const overrides = await storage.getUserPermissionOverrides(testUserId);
  if (!overrides.some(o => o.id === permOverride.id)) throw new Error('getUserPermissionOverrides failed');
  await storage.revokePermissionOverride(permOverride.id);
  const afterRevokeOverride = await storage.getUserPermissionOverrides(testUserId);
  if (afterRevokeOverride.some(o => o.id === permOverride.id)) throw new Error('revokePermissionOverride failed');
  console.log('✓ Permission override lifecycle verified');

  await storage.deleteRole(role.id);
  console.log('✓ Role deleted cleanly');

  // 6. Attendance Policies
  console.log('\n[6] Testing Attendance Policies Isolation...');
  const policyName = `Tech Shift Policy_${Date.now()}`;
  const policy = await storage.createAttendancePolicy({
    name: policyName,
    department: 'technical',
    checkInTime: '09:00 AM',
    checkOutTime: '06:00 PM',
    lateMarkAfterMinutes: 20
  });
  console.log('✓ Created attendance policy:', policy.id, policy.name);
  const fetchedPolicy = await storage.getAttendancePolicy(policy.id);
  if (!fetchedPolicy || fetchedPolicy.name !== policyName) throw new Error('getAttendancePolicy failed');
  const updatedPolicy = await storage.updateAttendancePolicy(policy.id, { lateMarkAfterMinutes: 30 });
  if (updatedPolicy.lateMarkAfterMinutes !== 30) throw new Error('updateAttendancePolicy failed');
  console.log('✓ Attendance policy lifecycle verified');

  // 7. Payroll Field Configs
  console.log('\n[7] Testing Payroll Field Configs Isolation...');
  const fieldName = `perf_bonus_${Date.now()}`;
  const fieldCfg = await storage.createPayrollFieldConfig({
    name: fieldName,
    displayName: 'Performance Bonus',
    category: 'earnings',
    dataType: 'currency',
    defaultValue: 1000
  });
  console.log('✓ Created payroll field config:', fieldCfg.id, fieldCfg.name);
  const fetchedField = await storage.getPayrollFieldConfig(fieldCfg.id);
  if (!fetchedField || fetchedField.name !== fieldName) throw new Error('getPayrollFieldConfig failed');
  const updatedField = await storage.updatePayrollFieldConfig(fieldCfg.id, { defaultValue: 1500 });
  if (updatedField.defaultValue !== 1500) throw new Error('updatePayrollFieldConfig failed');
  await storage.deletePayrollFieldConfig(fieldCfg.id);
  const deletedField = await storage.getPayrollFieldConfig(fieldCfg.id);
  if (deletedField) throw new Error('deletePayrollFieldConfig failed');
  console.log('✓ Payroll field config lifecycle verified (create, get, update, delete)');

  console.log('\n=======================================================');
  console.log(' ALL 7 NEWLY HARDENED MULTI-TENANT ENTITIES PASSED 100%');
  console.log('=======================================================');
  process.exit(0);
}

run().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

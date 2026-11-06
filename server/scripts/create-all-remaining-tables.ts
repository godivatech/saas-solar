import 'dotenv/config';
import { db } from '../db';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('🚀 Creating remaining relational tables on Neon PostgreSQL...');

  const ddlStatements = [
    // 1. departments
    sql`CREATE TABLE IF NOT EXISTS departments (
      id text PRIMARY KEY,
      tenant_id text NOT NULL REFERENCES tenants(id),
      name text NOT NULL,
      code text,
      description text,
      manager_id text,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamp with time zone DEFAULT now(),
      updated_at timestamp with time zone DEFAULT now()
    );`,
    sql`CREATE INDEX IF NOT EXISTS idx_departments_tenant ON departments(tenant_id);`,
    sql`CREATE INDEX IF NOT EXISTS idx_departments_name ON departments(tenant_id, name);`,

    // 2. designations
    sql`CREATE TABLE IF NOT EXISTS designations (
      id text PRIMARY KEY,
      tenant_id text NOT NULL REFERENCES tenants(id),
      name text NOT NULL,
      level integer NOT NULL DEFAULT 1,
      description text,
      permissions jsonb DEFAULT '[]'::jsonb,
      created_at timestamp with time zone DEFAULT now(),
      updated_at timestamp with time zone DEFAULT now()
    );`,
    sql`CREATE INDEX IF NOT EXISTS idx_designations_tenant ON designations(tenant_id);`,
    sql`CREATE INDEX IF NOT EXISTS idx_designations_name ON designations(tenant_id, name);`,

    // 3. permission_groups
    sql`CREATE TABLE IF NOT EXISTS permission_groups (
      id text PRIMARY KEY,
      tenant_id text NOT NULL REFERENCES tenants(id),
      name text NOT NULL,
      department text NOT NULL,
      designation text NOT NULL,
      permissions jsonb DEFAULT '[]'::jsonb,
      can_approve boolean DEFAULT false,
      max_approval_amount numeric(12, 2),
      created_at timestamp with time zone DEFAULT now(),
      updated_at timestamp with time zone DEFAULT now()
    );`,
    sql`CREATE INDEX IF NOT EXISTS idx_perm_groups_tenant ON permission_groups(tenant_id);`,
    sql`CREATE INDEX IF NOT EXISTS idx_perm_groups_dept_desig ON permission_groups(tenant_id, department, designation);`,

    // 4. roles
    sql`CREATE TABLE IF NOT EXISTS roles (
      id text PRIMARY KEY,
      tenant_id text NOT NULL REFERENCES tenants(id),
      name text NOT NULL,
      description text,
      is_system_role boolean NOT NULL DEFAULT false,
      department text,
      designation text,
      permissions jsonb DEFAULT '[]'::jsonb,
      approval_limits jsonb,
      created_at timestamp with time zone DEFAULT now(),
      updated_at timestamp with time zone DEFAULT now()
    );`,
    sql`CREATE INDEX IF NOT EXISTS idx_roles_tenant ON roles(tenant_id);`,
    sql`CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(tenant_id, name);`,

    // 5. user_role_assignments
    sql`CREATE TABLE IF NOT EXISTS user_role_assignments (
      id text PRIMARY KEY,
      tenant_id text NOT NULL REFERENCES tenants(id),
      user_id text NOT NULL,
      role_id text NOT NULL,
      assigned_by text NOT NULL,
      effective_from timestamp with time zone DEFAULT now(),
      effective_to timestamp with time zone,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamp with time zone DEFAULT now(),
      updated_at timestamp with time zone DEFAULT now()
    );`,
    sql`CREATE INDEX IF NOT EXISTS idx_user_roles_tenant ON user_role_assignments(tenant_id);`,
    sql`CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_role_assignments(user_id, is_active);`,

    // 6. permission_overrides
    sql`CREATE TABLE IF NOT EXISTS permission_overrides (
      id text PRIMARY KEY,
      tenant_id text NOT NULL REFERENCES tenants(id),
      user_id text NOT NULL,
      permission text NOT NULL,
      granted boolean NOT NULL,
      reason text NOT NULL,
      granted_by text NOT NULL,
      effective_from timestamp with time zone DEFAULT now(),
      effective_to timestamp with time zone,
      created_at timestamp with time zone DEFAULT now()
    );`,
    sql`CREATE INDEX IF NOT EXISTS idx_perm_overrides_tenant ON permission_overrides(tenant_id);`,
    sql`CREATE INDEX IF NOT EXISTS idx_perm_overrides_user ON permission_overrides(user_id);`,

    // 7. employees
    sql`CREATE TABLE IF NOT EXISTS employees (
      id text PRIMARY KEY,
      tenant_id text NOT NULL REFERENCES tenants(id),
      employee_id text NOT NULL,
      system_user_id text,
      personal_info jsonb NOT NULL,
      contact_info jsonb NOT NULL,
      employment_info jsonb NOT NULL,
      payroll_info jsonb,
      professional_info jsonb,
      emergency_contacts jsonb DEFAULT '[]'::jsonb,
      status text NOT NULL DEFAULT 'active',
      is_active boolean NOT NULL DEFAULT true,
      notes text,
      created_by text,
      last_updated_by text,
      created_at timestamp with time zone DEFAULT now(),
      updated_at timestamp with time zone DEFAULT now()
    );`,
    sql`CREATE INDEX IF NOT EXISTS idx_employees_tenant ON employees(tenant_id);`,
    sql`CREATE INDEX IF NOT EXISTS idx_employees_emp_id ON employees(tenant_id, employee_id);`,
    sql`CREATE INDEX IF NOT EXISTS idx_employees_sys_user ON employees(system_user_id);`,
    sql`CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status, is_active);`,

    // 8. employee_documents
    sql`CREATE TABLE IF NOT EXISTS employee_documents (
      id text PRIMARY KEY,
      tenant_id text NOT NULL REFERENCES tenants(id),
      employee_id text NOT NULL,
      document_type text NOT NULL,
      document_name text NOT NULL,
      document_url text NOT NULL,
      document_number text,
      expiry_date timestamp with time zone,
      is_verified boolean NOT NULL DEFAULT false,
      verified_by text,
      verified_at timestamp with time zone,
      uploaded_by text NOT NULL,
      notes text,
      created_at timestamp with time zone DEFAULT now(),
      updated_at timestamp with time zone DEFAULT now()
    );`,
    sql`CREATE INDEX IF NOT EXISTS idx_emp_docs_tenant ON employee_documents(tenant_id);`,
    sql`CREATE INDEX IF NOT EXISTS idx_emp_docs_employee ON employee_documents(employee_id);`,
    sql`CREATE INDEX IF NOT EXISTS idx_emp_docs_type ON employee_documents(employee_id, document_type);`,

    // 9. performance_reviews
    sql`CREATE TABLE IF NOT EXISTS performance_reviews (
      id text PRIMARY KEY,
      tenant_id text NOT NULL REFERENCES tenants(id),
      employee_id text NOT NULL,
      review_period jsonb NOT NULL,
      review_type text NOT NULL DEFAULT 'annual',
      overall_rating numeric(3, 1) NOT NULL,
      goals jsonb DEFAULT '[]'::jsonb,
      strengths jsonb DEFAULT '[]'::jsonb,
      improvement_areas jsonb DEFAULT '[]'::jsonb,
      reviewer_comments text,
      employee_comments text,
      reviewed_by text NOT NULL,
      next_review_date timestamp with time zone,
      created_at timestamp with time zone DEFAULT now(),
      updated_at timestamp with time zone DEFAULT now()
    );`,
    sql`CREATE INDEX IF NOT EXISTS idx_perf_reviews_tenant ON performance_reviews(tenant_id);`,
    sql`CREATE INDEX IF NOT EXISTS idx_perf_reviews_emp ON performance_reviews(employee_id);`,
    sql`CREATE INDEX IF NOT EXISTS idx_perf_reviews_reviewer ON performance_reviews(reviewed_by);`,

    // 10. attendance_policies
    sql`CREATE TABLE IF NOT EXISTS attendance_policies (
      id text PRIMARY KEY,
      tenant_id text NOT NULL REFERENCES tenants(id),
      name text NOT NULL,
      department text,
      designation text,
      check_in_time text DEFAULT '9:30 AM',
      check_out_time text DEFAULT '6:30 PM',
      flexible_timing boolean NOT NULL DEFAULT false,
      flexibility_minutes integer DEFAULT 0,
      overtime_allowed boolean NOT NULL DEFAULT true,
      max_overtime_hours numeric(4, 1) DEFAULT 4,
      overtime_approval_required boolean NOT NULL DEFAULT true,
      late_mark_after_minutes integer DEFAULT 15,
      half_day_mark_after_minutes integer DEFAULT 240,
      weekend_days jsonb DEFAULT '[0, 6]'::jsonb,
      holiday_policy text DEFAULT 'paid',
      is_active boolean NOT NULL DEFAULT true,
      created_by text NOT NULL,
      created_at timestamp with time zone DEFAULT now(),
      updated_at timestamp with time zone DEFAULT now()
    );`,
    sql`CREATE INDEX IF NOT EXISTS idx_att_policies_tenant ON attendance_policies(tenant_id);`,
    sql`CREATE INDEX IF NOT EXISTS idx_att_policies_dept ON attendance_policies(tenant_id, department);`,

    // 11. payroll_field_configs
    sql`CREATE TABLE IF NOT EXISTS payroll_field_configs (
      id text PRIMARY KEY,
      tenant_id text NOT NULL REFERENCES tenants(id),
      name text NOT NULL,
      display_name text NOT NULL,
      category text NOT NULL,
      data_type text NOT NULL,
      is_required boolean NOT NULL DEFAULT false,
      is_system_field boolean NOT NULL DEFAULT false,
      default_value numeric(12, 2),
      department text,
      sort_order integer NOT NULL DEFAULT 1,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamp with time zone DEFAULT now(),
      updated_at timestamp with time zone DEFAULT now()
    );`,
    sql`CREATE INDEX IF NOT EXISTS idx_payroll_configs_tenant ON payroll_field_configs(tenant_id);`,
    sql`CREATE INDEX IF NOT EXISTS idx_payroll_configs_cat ON payroll_field_configs(category, is_active);`
  ];

  for (const statement of ddlStatements) {
    await db.execute(statement);
  }

  console.log('✅ All 11 remaining tables & indexes created successfully in Neon PostgreSQL!');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Failed creating remaining tables:', err);
  process.exit(1);
});


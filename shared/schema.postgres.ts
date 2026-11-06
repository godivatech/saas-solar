import { pgTable, varchar, text, numeric, integer, timestamp, boolean, jsonb, doublePrecision } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ===================================================================
// 1. MULTI-TENANCY & COMPANY TENANTS
// ===================================================================
export const tenants = pgTable("tenants", {
  id: varchar("id", { length: 128 }).primaryKey().default(sql`gen_random_uuid()::text`),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).unique().notNull(),
  gstin: varchar("gstin", { length: 20 }),
  cin: varchar("cin", { length: 30 }),
  pan: varchar("pan", { length: 20 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 100 }).notNull().default("Karnataka"),
  pincode: varchar("pincode", { length: 20 }),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  logoUrl: text("logo_url"),
  bankDetails: jsonb("bank_details").default({}),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

// ===================================================================
// 2. USERS & EMPLOYEES
// ===================================================================
export const users = pgTable("users", {
  id: varchar("id", { length: 128 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 128 }).references(() => tenants.id, { onDelete: "restrict" }),
  firebaseUid: varchar("firebase_uid", { length: 128 }).unique().notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).default("employee").notNull(),
  department: varchar("department", { length: 50 }).default("operations").notNull(),
  designation: varchar("designation", { length: 50 }),
  employeeId: varchar("employee_id", { length: 50 }),
  reportingManagerId: varchar("reporting_manager_id", { length: 128 }),
  phoneNumber: varchar("phone_number", { length: 30 }),
  phone: varchar("phone", { length: 30 }),
  bankAccountNumber: varchar("bank_account_number", { length: 50 }),
  bankIfsc: varchar("bank_ifsc", { length: 20 }),
  panNumber: varchar("pan_number", { length: 20 }),
  uanNumber: varchar("uan_number", { length: 30 }),
  esiNumber: varchar("esi_number", { length: 30 }),
  payrollGrade: varchar("payroll_grade", { length: 20 }),
  profilePhotoUrl: text("profile_photo_url"),
  aadharCardUrl: text("aadhar_card_url"),
  panCardUrl: text("pan_card_url"),
  bankDetails: jsonb("bank_details").default({}),
  isActive: boolean("is_active").default(true).notNull(),
  employeeStatus: varchar("employee_status", { length: 30 }).default("active").notNull(),
  permissions: jsonb("permissions").default([]),
  joinDate: timestamp("join_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

// ===================================================================
// 3. CRM CUSTOMERS & LEADS
// ===================================================================
export const customers = pgTable("customers", {
  id: varchar("id", { length: 128 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 128 }).references(() => tenants.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 255 }).notNull(),
  mobile: varchar("mobile", { length: 20 }).notNull(),
  email: varchar("email", { length: 255 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 100 }).default("Karnataka"),
  pincode: varchar("pincode", { length: 20 }),
  gstin: varchar("gstin", { length: 20 }),
  ebServiceNumber: varchar("eb_service_number", { length: 50 }),
  tariffCode: varchar("tariff_code", { length: 50 }),
  ebSanctionPhase: varchar("eb_sanction_phase", { length: 20 }),
  ebSanctionKW: numeric("eb_sanction_kw", { precision: 8, scale: 2 }),
  propertyType: varchar("property_type", { length: 50 }).default("residential"),
  scope: text("scope"),
  status: varchar("status", { length: 50 }).default("lead"),
  assignedSalesExecId: varchar("assigned_sales_exec_id", { length: 128 }),
  isDeleted: boolean("is_deleted").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

// ===================================================================
// 4. OFFICE LOCATIONS (Geofencing)
// ===================================================================
export const officeLocations = pgTable("office_locations", {
  id: varchar("id", { length: 128 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 128 }).references(() => tenants.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 255 }).notNull(),
  latitude: numeric("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: numeric("longitude", { precision: 10, scale: 7 }).notNull(),
  radius: integer("radius").default(500).notNull(), // meters
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 100 }),
  pincode: varchar("pincode", { length: 20 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

// ===================================================================
// 5. DEPARTMENT SHIFT TIMINGS
// ===================================================================
export const departmentTimings = pgTable("department_timings", {
  id: varchar("id", { length: 128 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 128 }).references(() => tenants.id, { onDelete: "restrict" }),
  department: varchar("department", { length: 50 }).notNull(),
  checkInTime: varchar("check_in_time", { length: 10 }).notNull(),
  checkOutTime: varchar("check_out_time", { length: 10 }).notNull(),
  workingHours: numeric("working_hours", { precision: 4, scale: 2 }).default("8.00").notNull(),
  autoCheckoutGraceMinutes: integer("auto_checkout_grace_minutes").default(120),
  weekendDays: jsonb("weekend_days").default([0]),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

// ===================================================================
// 6. QUOTATIONS
// ===================================================================
export const quotations = pgTable("quotations", {
  id: varchar("id", { length: 128 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 128 }).references(() => tenants.id, { onDelete: "restrict" }),
  quotationNumber: varchar("quotation_number", { length: 100 }).notNull(),
  revision: integer("revision").default(1).notNull(),
  customerId: varchar("customer_id", { length: 128 }).references(() => customers.id, { onDelete: "restrict" }).notNull(),
  projectType: varchar("project_type", { length: 50 }).notNull(),
  systemKw: numeric("system_kw", { precision: 8, scale: 2 }).notNull(),
  ratePerKw: numeric("rate_per_kw", { precision: 10, scale: 2 }).default("0"),
  basePrice: numeric("base_price", { precision: 12, scale: 2 }).notNull(),
  gstPercentage: numeric("gst_percentage", { precision: 5, scale: 2 }).default("13.80").notNull(),
  gstAmount: numeric("gst_amount", { precision: 12, scale: 2 }).notNull(),
  totalCost: numeric("total_cost", { precision: 12, scale: 2 }).notNull(),
  subsidyAmount: numeric("subsidy_amount", { precision: 12, scale: 2 }).default("0").notNull(),
  customerPayment: numeric("customer_payment", { precision: 12, scale: 2 }).notNull(),
  roundoff: numeric("roundoff", { precision: 8, scale: 2 }).default("0"),
  status: varchar("status", { length: 50 }).default("draft").notNull(),
  source: varchar("source", { length: 50 }).default("manual"),
  preparedBy: varchar("prepared_by", { length: 128 }),
  projects: jsonb("projects").default([]),
  customBillOfMaterials: jsonb("custom_bill_of_materials"),
  customerNotes: text("customer_notes"),
  internalNotes: text("internal_notes"),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  createdBy: varchar("created_by", { length: 128 }),
  updatedBy: varchar("updated_by", { length: 128 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

// ===================================================================
// 7. INVOICES
// ===================================================================
export const invoices = pgTable("invoices", {
  id: varchar("id", { length: 128 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 128 }).references(() => tenants.id, { onDelete: "restrict" }),
  invoiceNumber: varchar("invoice_number", { length: 100 }).notNull(),
  quotationId: varchar("quotation_id", { length: 128 }).references(() => quotations.id, { onDelete: "set null" }),
  customerId: varchar("customer_id", { length: 128 }).references(() => customers.id, { onDelete: "restrict" }).notNull(),
  invoiceDate: timestamp("invoice_date", { withTimezone: true }).defaultNow(),
  dueDate: timestamp("due_date", { withTimezone: true }),
  baseAmount: numeric("base_amount", { precision: 12, scale: 2 }).default("0"),
  gstPercentage: numeric("gst_percentage", { precision: 5, scale: 2 }).default("13.80"),
  cgst: numeric("cgst", { precision: 12, scale: 2 }).default("0"),
  sgst: numeric("sgst", { precision: 12, scale: 2 }).default("0"),
  igst: numeric("igst", { precision: 12, scale: 2 }).default("0"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }).default("0"),
  balanceDue: numeric("balance_due", { precision: 12, scale: 2 }).default("0"),
  paymentTerms: varchar("payment_terms", { length: 50 }).default("immediate"),
  notes: text("notes"),
  items: jsonb("items").default([]),
  pdfUrl: text("pdf_url"),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

// ===================================================================
// 8. PAYMENTS
// ===================================================================
export const payments = pgTable("payments", {
  id: varchar("id", { length: 128 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 128 }).references(() => tenants.id, { onDelete: "restrict" }),
  invoiceId: varchar("invoice_id", { length: 128 }).references(() => invoices.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id", { length: 128 }).references(() => customers.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  paymentMethod: varchar("payment_method", { length: 50 }).notNull(), // cash, bank_transfer, upi, cheque
  referenceNumber: varchar("reference_number", { length: 100 }),
  status: varchar("status", { length: 50 }).default("completed").notNull(),
  paymentDate: timestamp("payment_date", { withTimezone: true }).defaultNow().notNull(),
  notes: text("notes"),
  receivedBy: varchar("received_by", { length: 128 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

// ===================================================================
// 9. PRODUCTS & INVENTORY
// ===================================================================
export const products = pgTable("products", {
  id: varchar("id", { length: 128 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 128 }).references(() => tenants.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 255 }).notNull(),
  sku: varchar("sku", { length: 100 }).unique().notNull(),
  category: varchar("category", { length: 50 }).notNull(), // panel, inverter, battery, structure, cable, earthing, accessories
  brand: varchar("brand", { length: 100 }),
  model: varchar("model", { length: 100 }),
  specifications: jsonb("specifications").default({}),
  unit: varchar("unit", { length: 30 }).default("Nos").notNull(),
  purchasePrice: numeric("purchase_price", { precision: 10, scale: 2 }).default("0"),
  sellingPrice: numeric("selling_price", { precision: 10, scale: 2 }).default("0"),
  currentStock: integer("current_stock").default(0).notNull(),
  minimumStock: integer("minimum_stock").default(5).notNull(),
  status: varchar("status", { length: 50 }).default("in_stock").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

// ===================================================================
// 10. SITE VISITS & SURVEYS
// ===================================================================
export const siteVisits = pgTable("site_visits", {
  id: varchar("id", { length: 128 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 128 }).references(() => tenants.id, { onDelete: "restrict" }),
  userId: varchar("user_id", { length: 128 }).notNull(),
  department: varchar("department", { length: 50 }).notNull(),
  visitPurpose: varchar("visit_purpose", { length: 100 }).notNull(),
  status: varchar("status", { length: 50 }).default("in_progress").notNull(),
  siteInTime: timestamp("site_in_time", { withTimezone: true }).notNull(),
  siteOutTime: timestamp("site_out_time", { withTimezone: true }),
  customer: jsonb("customer").notNull(),
  location: jsonb("location"),
  technicalData: jsonb("technical_data"),
  marketingData: jsonb("marketing_data"),
  adminData: jsonb("admin_data"),
  sitePhotos: jsonb("site_photos").default([]),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

// ===================================================================
// 11. ATTENDANCE
// ===================================================================
export const attendance = pgTable("attendance", {
  id: varchar("id", { length: 128 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 128 }).references(() => tenants.id, { onDelete: "restrict" }),
  userId: varchar("user_id", { length: 128 }).notNull(),
  date: timestamp("date", { withTimezone: true }).notNull(),
  checkInTime: timestamp("check_in_time", { withTimezone: true }),
  checkOutTime: timestamp("check_out_time", { withTimezone: true }),
  attendanceType: varchar("attendance_type", { length: 50 }).default("office").notNull(),
  status: varchar("status", { length: 50 }).default("present").notNull(), // present, late, half_day, absent, weekly_off, holiday, overtime
  workingHours: numeric("working_hours", { precision: 5, scale: 2 }).default("0"),
  overtimeHours: numeric("overtime_hours", { precision: 5, scale: 2 }).default("0"),
  isLate: boolean("is_late").default(false).notNull(),
  lateMinutes: integer("late_minutes").default(0),
  isWithinOfficeRadius: boolean("is_within_office_radius").default(true),
  isWeeklyOff: boolean("is_weekly_off").default(false),
  isHoliday: boolean("is_holiday").default(false),
  autoCorrected: boolean("auto_corrected").default(false),
  autoCorrectedAt: timestamp("auto_corrected_at", { withTimezone: true }),
  autoCorrectionReason: text("auto_correction_reason"),
  adminReviewStatus: varchar("admin_review_status", { length: 50 }).default("approved"), // approved, pending, rejected
  remarks: text("remarks"),
  otSessions: jsonb("ot_sessions").default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

// ===================================================================
// 12. OVERTIME SESSIONS
// ===================================================================
export const otSessions = pgTable("ot_sessions", {
  id: varchar("id", { length: 128 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 128 }).references(() => tenants.id, { onDelete: "restrict" }),
  attendanceId: varchar("attendance_id", { length: 128 }).references(() => attendance.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 128 }).notNull(),
  sessionNumber: integer("session_number").default(1).notNull(),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }),
  otHours: numeric("ot_hours", { precision: 5, scale: 2 }).default("0"),
  reason: text("reason"),
  status: varchar("status", { length: 50 }).default("PENDING_REVIEW").notNull(), // PENDING_REVIEW, APPROVED, REJECTED
  approvedBy: varchar("approved_by", { length: 128 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

// ===================================================================
// 13. LEAVE APPLICATIONS & BALANCES
// ===================================================================
export const leaveBalances = pgTable("leave_balances", {
  id: varchar("id", { length: 128 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 128 }).references(() => tenants.id, { onDelete: "restrict" }),
  userId: varchar("user_id", { length: 128 }).notNull(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  casualLeaveBalance: integer("casual_leave_balance").default(1).notNull(),
  casualLeaveUsed: integer("casual_leave_used").default(0).notNull(),
  permissionHoursBalance: integer("permission_hours_balance").default(2).notNull(),
  permissionHoursUsed: integer("permission_hours_used").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const leaveApplications = pgTable("leave_applications", {
  id: varchar("id", { length: 128 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 128 }).references(() => tenants.id, { onDelete: "restrict" }),
  userId: varchar("user_id", { length: 128 }).notNull(),
  leaveType: varchar("leave_type", { length: 50 }).notNull(), // casual_leave, permission, unpaid_leave
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  daysCount: numeric("days_count", { precision: 4, scale: 1 }),
  totalDays: numeric("total_days", { precision: 4, scale: 1 }),
  permissionDate: timestamp("permission_date", { withTimezone: true }),
  permissionHours: integer("permission_hours"),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 50 }).default("pending_manager").notNull(), // pending_manager, pending_hr, approved, rejected, cancelled
  managerApprovalStatus: varchar("manager_approval_status", { length: 50 }),
  hrApprovalStatus: varchar("hr_approval_status", { length: 50 }),
  managerRemarks: text("manager_remarks"),
  hrRemarks: text("hr_remarks"),
  rejectionReason: text("rejection_reason"),
  appliedAt: timestamp("applied_at", { withTimezone: true }).defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: varchar("reviewed_by", { length: 128 }),
  approvedBy: varchar("approved_by", { length: 128 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

// ===================================================================
// 14. PAYROLL & SALARY STRUCTURE
// ===================================================================
export const salaryStructures = pgTable("salary_structures", {
  id: varchar("id", { length: 128 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 128 }).references(() => tenants.id, { onDelete: "restrict" }),
  userId: varchar("user_id", { length: 128 }).notNull(),
  baseSalary: numeric("base_salary", { precision: 12, scale: 2 }).notNull(),
  hra: numeric("hra", { precision: 12, scale: 2 }).default("0").notNull(),
  specialAllowance: numeric("special_allowance", { precision: 12, scale: 2 }).default("0").notNull(),
  conveyance: numeric("conveyance", { precision: 12, scale: 2 }).default("0").notNull(),
  medicalAllowance: numeric("medical_allowance", { precision: 12, scale: 2 }).default("0").notNull(),
  pfEmployee: numeric("pf_employee", { precision: 12, scale: 2 }).default("0").notNull(),
  pfEmployer: numeric("pf_employer", { precision: 12, scale: 2 }).default("0").notNull(),
  esiEmployee: numeric("esi_employee", { precision: 12, scale: 2 }).default("0").notNull(),
  esiEmployer: numeric("esi_employer", { precision: 12, scale: 2 }).default("0").notNull(),
  professionalTax: numeric("professional_tax", { precision: 12, scale: 2 }).default("200.00").notNull(),
  monthlyGross: numeric("monthly_gross", { precision: 12, scale: 2 }).notNull(),
  monthlyNet: numeric("monthly_net", { precision: 12, scale: 2 }).notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const salaryAdvances = pgTable("salary_advances", {
  id: varchar("id", { length: 128 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 128 }).references(() => tenants.id, { onDelete: "restrict" }),
  userId: varchar("user_id", { length: 128 }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).default("0"),
  monthlyDeduction: numeric("monthly_deduction", { precision: 12, scale: 2 }).default("0"),
  repaidAmount: numeric("repaid_amount", { precision: 12, scale: 2 }).default("0"),
  deductionStartMonth: integer("deduction_start_month"),
  deductionStartYear: integer("deduction_start_year"),
  requestAmount: numeric("request_amount", { precision: 12, scale: 2 }).default("0"),
  approvedAmount: numeric("approved_amount", { precision: 12, scale: 2 }),
  emiCount: integer("emi_count").default(1),
  monthlyEmiAmount: numeric("monthly_emi_amount", { precision: 12, scale: 2 }),
  remainingBalance: numeric("remaining_balance", { precision: 12, scale: 2 }),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, approved, rejected, completed
  approvedBy: varchar("approved_by", { length: 128 }),
  approvalDate: timestamp("approval_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const payrolls = pgTable("payrolls", {
  id: varchar("id", { length: 128 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 128 }).references(() => tenants.id, { onDelete: "restrict" }),
  userId: varchar("user_id", { length: 128 }).notNull(),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  totalWorkingDays: integer("total_working_days").default(26).notNull(),
  daysWorked: numeric("days_worked", { precision: 5, scale: 2 }).notNull(),
  overtimeHours: numeric("overtime_hours", { precision: 5, scale: 2 }).default("0").notNull(),
  overtimePay: numeric("overtime_pay", { precision: 12, scale: 2 }).default("0").notNull(),
  grossSalary: numeric("gross_salary", { precision: 12, scale: 2 }).notNull(),
  netSalary: numeric("net_salary", { precision: 12, scale: 2 }).notNull(),
  pfDeduction: numeric("pf_deduction", { precision: 12, scale: 2 }).default("0").notNull(),
  esiDeduction: numeric("esi_deduction", { precision: 12, scale: 2 }).default("0").notNull(),
  ptDeduction: numeric("pt_deduction", { precision: 12, scale: 2 }).default("200.00").notNull(),
  advanceDeduction: numeric("advance_deduction", { precision: 12, scale: 2 }).default("0").notNull(),
  totalDeductions: numeric("total_deductions", { precision: 12, scale: 2 }).notNull(),
  status: varchar("status", { length: 50 }).default("draft").notNull(), // draft, processed, paid
  paymentDate: timestamp("payment_date", { withTimezone: true }),
  paymentReference: varchar("payment_reference", { length: 100 }),
  payslipUrl: text("payslip_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

// ===================================================================
// 15. COMPANY SETTINGS
// ===================================================================
export const companySettings = pgTable("company_settings", {
  id: varchar("id", { length: 128 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 128 }).references(() => tenants.id, { onDelete: "restrict" }),
  companyName: varchar("company_name", { length: 255 }).notNull(),
  logoUrl: text("logo_url"),
  supportEmail: varchar("support_email", { length: 255 }),
  supportPhone: varchar("support_phone", { length: 50 }),
  address: text("address"),
  gstin: varchar("gstin", { length: 20 }),
  defaultOTRate: numeric("default_ot_rate", { precision: 4, scale: 2 }).default("1.00"),
  weekendOTRate: numeric("weekend_ot_rate", { precision: 4, scale: 2 }).default("1.00"),
  maxOTHoursPerDay: integer("max_ot_hours_per_day").default(4),
  weekendDays: jsonb("weekend_days").default([0]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

// ===================================================================
// 16. AUDIT LOGS
// ===================================================================
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id", { length: 128 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 128 }).references(() => tenants.id, { onDelete: "restrict" }),
  userId: varchar("user_id", { length: 128 }).notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }).notNull(),
  entityId: varchar("entity_id", { length: 128 }).notNull(),
  details: jsonb("details"),
  changes: jsonb("changes"),
  ipAddress: varchar("ip_address", { length: 50 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

// ===================================================================
// 17. ACTIVITY LOGS (Recent Activity Feed for Dashboard)
// ===================================================================
export const activityLogs = pgTable("activity_logs", {
  id: varchar("id", { length: 128 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 128 }).references(() => tenants.id, { onDelete: "restrict" }),
  type: varchar("type", { length: 100 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  entityId: varchar("entity_id", { length: 128 }),
  entityType: varchar("entity_type", { length: 100 }),
  userId: varchar("user_id", { length: 128 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

// ===================================================================
// 18. FIXED HOLIDAYS
// ===================================================================
export const fixedHolidays = pgTable("fixed_holidays", {
  id: varchar("id", { length: 128 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 128 }).references(() => tenants.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 255 }).notNull(),
  date: timestamp("date", { withTimezone: true }).notNull(),
  year: integer("year").notNull(),
  type: varchar("type", { length: 50 }).default("mandatory"),
  isPaid: boolean("is_paid").default(true),
  isOptional: boolean("is_optional").default(false),
  applicableDepartments: jsonb("applicable_departments").default([]),
  description: text("description"),
  createdBy: varchar("created_by", { length: 128 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

// ===================================================================
// 19. PAYROLL PERIODS (Locking & Closing)
// ===================================================================
export const payrollPeriods = pgTable("payroll_periods", {
  id: varchar("id", { length: 128 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 128 }).references(() => tenants.id, { onDelete: "restrict" }),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  cutoffDate: timestamp("cutoff_date", { withTimezone: true }),
  status: varchar("status", { length: 50 }).default("draft"),
  isLocked: boolean("is_locked").default(false),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockedBy: varchar("locked_by", { length: 128 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

// ===================================================================
// 20. NOTIFICATIONS
// ===================================================================
export const notifications = pgTable("notifications", {
  id: varchar("id", { length: 128 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 128 }).references(() => tenants.id, { onDelete: "restrict" }),
  userId: varchar("user_id", { length: 128 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: varchar("type", { length: 50 }).default("info"),
  isRead: boolean("is_read").default(false),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

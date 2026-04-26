import { z } from "zod";

// Core enterprise user management schemas - Updated to match organizational chart
export const departments = [
  "operations", "admin", "hr", "marketing", "sales", "technical", "housekeeping"
] as const;

// Enterprise organizational hierarchy with levels - Updated to match organizational chart
export const designations = [
  "ceo", "gm", "officer", "executive", "cre", "team_leader", "technician", "welder", "house_man"
] as const;

// Designation hierarchy levels (higher number = more authority) - Fixed duplicates
export const designationLevels = {
  "ceo": 9,
  "gm": 8,
  "officer": 7,
  "team_leader": 6,
  "executive": 5,
  "cre": 4,
  "technician": 3,
  "welder": 2,
  "house_man": 1
} as const;

export const payrollGrades = [
  "A1", "A2", "B1", "B2", "C1", "C2", "D1", "D2"
] as const;

// Enterprise-grade granular permission system
export const systemPermissions = [
  // Dashboard access (Department-level feature access)
  "dashboard.view", "dashboard.analytics", "dashboard.full_access",

  // Customer Management (Sales & Marketing focus)
  "customers.view", "customers.create", "customers.edit", "customers.delete",
  "customers.export", "customers.import", "customers.archive",


  // Quotation Management (Sales primary, others view)
  "quotations.view", "quotations.create", "quotations.edit", "quotations.delete",
  "quotations.approve", "quotations.send", "quotations.convert",

  // Invoice Management (Accounts primary)
  "invoices.view", "invoices.create", "invoices.edit", "invoices.delete",
  "invoices.approve", "invoices.send", "invoices.payment_tracking",

  // Attendance Management (HR primary, self for employees)
  "attendance.view_own", "attendance.view_team", "attendance.view_all",
  "attendance.mark", "attendance.approve", "attendance.reports",

  // Leave Management (HR approvals, self requests)
  "leave.view_own", "leave.view_team", "leave.view_all",
  "leave.request", "leave.approve", "leave.reject", "leave.cancel",

  // User & Access Management (Admin roles)
  "users.view", "users.create", "users.edit", "users.delete",
  "users.permissions", "users.activate", "users.deactivate",

  // Department & Organization (Master Admin)
  "departments.view", "departments.create", "departments.edit", "departments.delete",
  "designations.view", "designations.create", "designations.edit", "designations.delete",
  "permissions.view", "permissions.manage", "permissions.assign",

  // Reporting & Analytics (Designation-based access levels)
  "reports.basic", "reports.advanced", "reports.financial", "reports.export",
  "analytics.view", "analytics.departmental", "analytics.enterprise",

  // Approval workflows (Designation-based limits)
  "approve.quotations.basic", "approve.quotations.advanced",
  "approve.invoices.basic", "approve.invoices.advanced",
  "approve.leave.team", "approve.leave.department",
  "approve.expenses.basic", "approve.expenses.advanced",
  "approve.overtime.team", "approve.overtime.department",

  // System Administration (Master Admin only)
  "system.settings", "system.backup", "system.audit", "system.integrations",

  // Site Visit Management (Field Operations)
  "site_visit.view", "site_visit.create", "site_visit.edit", "site_visit.delete",
  "site_visit.view_own", "site_visit.view_team", "site_visit.view_all",
  "site_visit.approve", "site_visit.reports"
] as const;

// Marital status options
export const maritalStatus = [
  "single", "married", "divorced", "widowed", "separated"
] as const;

// Blood group options
export const bloodGroups = [
  "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"
] as const;

// Employee status types for comprehensive lifecycle management
export const employeeStatus = [
  "active", "inactive", "probation", "notice_period", "terminated", "on_leave"
] as const;

// Payment mode options
export const paymentModes = ["cash", "bank", "cheque"] as const;

export const insertUserEnhancedSchema = z.object({
  uid: z.string(),
  email: z.string().email(),
  displayName: z.string().min(2, "Display name must be at least 2 characters"),
  role: z.enum(["master_admin", "admin", "employee"]).default("employee"),
  department: z.enum(departments).nullable().nullish(),
  designation: z.enum(designations).nullable().nullish(),
  employeeId: z.string().nullish(),
  reportingManagerId: z.string().nullable().nullish(),
  payrollGrade: z.enum(payrollGrades).nullable().nullish(),
  joinDate: z.date().nullish(),
  isActive: z.boolean().default(true),
  photoURL: z.string().nullable().nullish(),

  // Statutory Information
  esiNumber: z.string().nullish(),
  epfNumber: z.string().nullish(),
  aadharNumber: z.string().length(12, "AADHAR must be 12 digits").nullish(),
  panNumber: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, "Invalid PAN format").nullish(),

  // Personal Details
  fatherName: z.string().nullish(),
  spouseName: z.string().nullish(),
  dateOfBirth: z.date().nullish(),
  age: z.number().min(0).max(150).nullish(),
  gender: z.enum(["male", "female", "other"]).nullish(),
  maritalStatus: z.enum(maritalStatus).nullish(),
  bloodGroup: z.enum(bloodGroups).nullish(),

  // Employee Document URLs
  profilePhotoUrl: z.string().min(1, "Profile Photo is required"),
  aadharCardUrl: z.string().min(1, "Aadhar Card is required"),
  panCardUrl: z.string().min(1, "PAN Card is required"),

  // Professional Information
  educationalQualification: z.string().nullish(),
  experienceYears: z.number().min(0).nullish(),

  // Employment Lifecycle
  dateOfLeaving: z.date().nullish(),
  employeeStatus: z.enum(employeeStatus).default("active"),

  // Contact Information
  contactNumber: z.string().nullish(),
  emergencyContactPerson: z.string().nullish(),
  emergencyContactNumber: z.string().nullish(),
  permanentAddress: z.string().nullish(),
  presentAddress: z.string().nullish(),
  location: z.string().nullish(),

  // Payroll Information
  paymentMode: z.enum(paymentModes).nullish(),
  bankAccountNumber: z.string().nullish(),
  bankName: z.string().nullish(),
  ifscCode: z.string().nullish(),

  // Document Management
  documents: z.object({
    marksheets: z.array(z.string()).nullish(),
    certificates: z.array(z.string()).nullish(),
    idProofs: z.array(z.string()).nullish(),
    bankDocuments: z.array(z.string()).nullish(),
    others: z.array(z.string()).nullish()
  }).nullish()
});

export const insertDesignationSchema = z.object({
  name: z.string().min(2, "Designation name must be at least 2 characters"),
  level: z.number().min(1).max(10),
  description: z.string().nullish(),
  permissions: z.array(z.enum(systemPermissions)).default([])
});

export const insertPermissionGroupSchema = z.object({
  name: z.string().min(2, "Permission group name must be at least 2 characters"),
  department: z.enum(departments),
  designation: z.enum(designations),
  permissions: z.array(z.enum(systemPermissions)),
  canApprove: z.boolean().default(false),
  maxApprovalAmount: z.number().nullable().nullish()
});

// Enterprise HR Management Schemas

// Employment types for contractual management
export const employmentTypes = [
  "full_time", "part_time", "contract", "intern", "consultant", "freelancer"
] as const;

// ====== SITE VISIT MANAGEMENT SCHEMAS ======

// Site visit purpose categories
export const siteVisitPurposes = [
  "visit", "installation", "service", "purchase", "eb_office", "amc", "bank", "other"
] as const;

// Property types for customer classification
export const propertyTypes = [
  "residential", "commercial", "agri", "other"
] as const;

// Technical work types
export const technicalWorkTypes = [
  "installation", "wifi_configuration", "amc", "service", "electrical_fault",
  "inverter_fault", "solar_panel_fault", "wiring_issue", "structure",
  "welding_work", "site_visit", "light_installation", "camera_fault",
  "light_fault", "repair", "painting", "cleaning", "others"
] as const;

// Service types for multi-selection
export const serviceTypes = [
  "on_grid", "off_grid", "hybrid", "solar_panel", "camera", "water_pump",
  "water_heater", "lights_accessories", "others"
] as const;

// Working status
export const workingStatus = [
  "pending", "completed"
] as const;

// Visit outcome categories for business classification
export const visitOutcomes = [
  "converted", "on_process", "cancelled"
] as const;

// Solar product specifications
export const solarPanelBrands = [
  "renew", "premier", "utl_solar", "loom_solar", "kirloskar", "adani_solar", "vikram_solar"
] as const;

export const inverterMakes = [
  "growatt", "deye", "polycab", "utl", "microtech"
] as const;

export const inverterPhases = [
  "single_phase", "three_phase"
] as const;

export const earthingTypes = [
  "dc", "ac", "ac_dc"
] as const;

export const earthingTypesMulti = ["dc", "ac", "ac_dc"] as const;

export const panelWatts = [
  "210", "335", "410", "530", "535", "540", "550", "590", "610", "615"
] as const;

// Panel types for solar installations
export const panelTypes = [
  "bifacial", "topcon", "mono_perc"
] as const;

export const inverterWatts = [
  "3kw", "4kw", "5kw", "10kw", "15kw", "30kw"
] as const;

// Battery brand suggestions for UI autocomplete
// Note: This is no longer used for schema validation (accepts any string)
export const batteryBrands = [
  "exide", "utl", "exide_utl"
] as const;

// Display names for known battery brands
export const batteryBrandDisplayNames: Record<string, string> = {
  "exide": "Exide",
  "utl": "UTL",
  "exide_utl": "Exide/UTL"
};

export const batteryTypes = [
  "lead_acid", "lithium"
] as const;

export const batteryAHOptions = [
  "100", "120", "150", "200"
] as const;

export const inverterVoltOptions = [
  "48", "96", "120", "180", "240", "360"
] as const;

export const waterHeaterBrands = [
  "venus", "hykon", "supreme"
] as const;

// New schema additions for enhanced project specifications

// Floor levels for installations
export const floorLevels = [
  "0", "1", "2", "3", "4"
] as const;

// Structure types
export const structureTypes = [
  "gp_structure", "mono_rail", "gi_structure", "gi_round_pipe", "ms_square_pipe"
] as const;

// Mono rail options
export const monoRailOptions = [
  "mini_rail", "long_rail"
] as const;

// Height ranges for structures (0 to 14)
export const heightRange = Array.from({ length: 15 }, (_, i) => i.toString()) as [string, ...string[]];

// Scope options for work assignments
export const workScopeOptions = [
  "customer_scope", "company_scope"
] as const;

// Project types for marketing department
export const marketingProjectTypes = [
  "on_grid", "off_grid", "hybrid", "water_heater", "water_pump"
] as const;

// Admin process types
export const bankProcessSteps = [
  "registration", "document_verification", "site_inspection",
  "head_office_approval", "amount_credited"
] as const;

export const ebProcessTypes = [
  "new_connection", "tariff_change", "name_transfer", "load_upgrade",
  "inspection_before_net_meter", "net_meter_followup",
  "inspection_after_net_meter", "subsidy"
] as const;

// ====== SITE VISIT SCHEMAS ======

// Location schema for GPS tracking
export const locationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  accuracy: z.number().nullish(),
  address: z.string().nullish()
});

// Customer details schema
export const customerDetailsSchema = z.object({
  name: z.string().min(2, "Customer name is required"),
  mobile: z.string().min(10, "Valid mobile number is required"),
  address: z.string().min(3, "Address is required"),
  ebServiceNumber: z.string().nullish(),
  propertyType: z.enum(propertyTypes),
  location: z.string().nullish(),
  source: z.string().min(1, "Source is required")
});

// Technical site visit schema
export const technicalSiteVisitSchema = z.object({
  serviceTypes: z.array(z.enum(serviceTypes)),
  workType: z.enum(technicalWorkTypes),
  workingStatus: z.enum(workingStatus),
  pendingRemarks: z.string().nullish(),
  teamMembers: z.array(z.string()),
  description: z.string().nullish()
});

// Solar system configuration schemas
export const onGridConfigSchema = z.object({
  solarPanelMake: z.array(z.enum(solarPanelBrands)).default([]),
  panelWatts: z.string(), // Changed to string to allow custom values
  panelType: z.enum(panelTypes).nullish(),
  inverterMake: z.array(z.enum(inverterMakes)).default([]),
  inverterPhase: z.enum(inverterPhases),
  inverterKW: z.number().min(0).nullish(),
  inverterQty: z.number().min(1).nullish(),
  lightningArrest: z.boolean().default(false),
  electricalAccessories: z.boolean().default(false),
  electricalCount: z.number().min(0).nullish(),
  earth: z.array(z.enum(earthingTypes)).default([]),
  floor: z.enum(floorLevels).nullish(),
  dcrPanelCount: z.number().min(0).default(0),
  nonDcrPanelCount: z.number().min(0).default(0),
  panelCount: z.number().min(1),
  projectValue: z.number().min(0),
  others: z.string().nullish(),
  // New fields from client specification
  structureType: z.enum(structureTypes).nullish(),
  gpStructure: z.object({
    lowerEndHeight: z.string().nullish(),
    higherEndHeight: z.string().nullish()
  }).nullish(),
  monoRail: z.object({
    type: z.enum(monoRailOptions).nullish()
  }).nullish(),
  civilWorkScope: z.enum(workScopeOptions).nullish(),
  netMeterScope: z.enum(workScopeOptions).nullish()
});

export const offGridConfigSchema = onGridConfigSchema.extend({
  batteryBrand: z.string().min(1, "Battery brand is required"),
  batteryType: z.enum(batteryTypes).nullish(),
  batteryAH: z.enum(batteryAHOptions).nullish(),
  voltage: z.number().min(0),
  batteryCount: z.number().min(1),
  batteryStands: z.string().nullish(),
  inverterVolt: z.string().nullish(), // Changed to string to allow custom values
  inverterKVA: z.string().nullish(), // For off-grid systems, inverters are rated in KVA
  amcIncluded: z.boolean().default(false) // Annual Maintenance Contract checkbox
}).omit({ netMeterScope: true }); // Off-grid doesn't have net meter

export const hybridConfigSchema = offGridConfigSchema.extend({
  electricalWorkScope: z.enum(workScopeOptions).nullish(),
  netMeterScope: z.enum(workScopeOptions).nullish(), // Hybrid has net meter back
  inverterKVA: z.string().nullish() // For hybrid systems, inverters are rated in KVA
});

export const waterHeaterConfigSchema = z.object({
  brand: z.enum(waterHeaterBrands),
  litre: z.number().min(1),
  heatingCoil: z.string().nullish(),
  productImage: z.string().nullish(), // Optional product image URL
  projectValue: z.number().min(0),
  others: z.string().nullish(),
  // New fields from client specification
  floor: z.enum(floorLevels).nullish(),
  plumbingWorkScope: z.enum(workScopeOptions).nullish(),
  civilWorkScope: z.enum(workScopeOptions).nullish(),
  // New fields for quotation description changes
  qty: z.number().min(1).default(1),
  waterHeaterModel: z.enum(['pressurized', 'non_pressurized']).default('non_pressurized'),
  labourAndTransport: z.boolean().default(false)
});

export const waterPumpConfigSchema = z.object({
  driveHP: z.string().nullish(), // Renamed from 'hp'
  hp: z.string().nullish(), // Keep for backward compatibility
  drive: z.string(),
  solarPanel: z.string().nullish(),
  panelBrand: z.array(z.enum(solarPanelBrands)).default([]),
  panelWatts: z.string().nullish(),
  panelType: z.enum(panelTypes).nullish(),
  dcrPanelCount: z.number().min(0).default(0),
  nonDcrPanelCount: z.number().min(0).default(0),
  panelCount: z.number().min(1),
  projectValue: z.number().min(0),
  others: z.string().nullish(),
  // Quantity field for BOM generation
  qty: z.number().min(1).default(1),
  // Phase selection for inverter
  inverterPhase: z.enum(inverterPhases).nullish(),
  // New fields from client specification
  structureType: z.enum(structureTypes).nullish(),
  gpStructure: z.object({
    lowerEndHeight: z.string().nullish(),
    higherEndHeight: z.string().nullish()
  }).nullish(),
  monoRail: z.object({
    type: z.enum(monoRailOptions).nullish()
  }).nullish(),
  // Replaced field: plumbingWorkScope renamed to earthWork
  earthWork: z.enum(workScopeOptions).nullish(),
  plumbingWorkScope: z.enum(workScopeOptions).nullish(), // Keep for backward compatibility
  civilWorkScope: z.enum(workScopeOptions).nullish(),
  // New checkbox fields
  lightningArrest: z.boolean().default(false),
  dcCable: z.boolean().default(false),
  electricalAccessories: z.boolean().default(false),
  electricalCount: z.number().min(0).nullish(),
  earth: z.array(z.enum(earthingTypes)).default([]),
  labourAndTransport: z.boolean().default(false)
});

// Marketing site visit schema
export const marketingSiteVisitSchema = z.object({
  updateRequirements: z.boolean(),
  projectType: z.enum(marketingProjectTypes).nullish(),
  onGridConfig: onGridConfigSchema.nullish(),
  offGridConfig: offGridConfigSchema.nullish(),
  hybridConfig: hybridConfigSchema.nullish(),
  waterHeaterConfig: waterHeaterConfigSchema.nullish(),
  waterPumpConfig: waterPumpConfigSchema.nullish()
});

// Admin site visit schema
export const adminSiteVisitSchema = z.object({
  bankProcess: z.object({
    step: z.enum(bankProcessSteps),
    description: z.string().nullish()
  }).nullish(),
  ebProcess: z.object({
    type: z.enum(ebProcessTypes),
    description: z.string().nullish()
  }).nullish(),
  purchase: z.string().nullish(),
  driving: z.string().nullish(),
  officialCashTransactions: z.string().nullish(),
  officialPersonalWork: z.string().nullish(),
  others: z.string().nullish()
});

// Site photo schema
export const sitePhotoSchema = z.object({
  url: z.string().url(),
  location: locationSchema,
  timestamp: z.union([z.date(), z.string()]).transform((val) =>
    typeof val === 'string' ? new Date(val) : val
  ),
  description: z.string().nullish()
});

// Main site visit schema
export const insertSiteVisitSchema = z.object({
  userId: z.string(),
  department: z.enum(["technical", "marketing", "admin"]),
  visitPurpose: z.enum(siteVisitPurposes),

  // Location & Time Tracking
  siteInTime: z.date(),
  siteInLocation: locationSchema,
  siteInPhotoUrl: z.string().url().nullish(),
  siteOutTime: z.date().nullish(),
  siteOutLocation: locationSchema.nullish(),
  siteOutPhotoUrl: z.string().url().nullish(),

  // Customer Information
  customer: customerDetailsSchema,

  // Department-specific data
  technicalData: technicalSiteVisitSchema.nullish(),
  marketingData: marketingSiteVisitSchema.nullish(),
  adminData: adminSiteVisitSchema.nullish(),

  // Site Photos (1-20 photos)
  sitePhotos: z.array(sitePhotoSchema).max(20).default([]),

  // Checkout Site Photos (additional photos taken during checkout)
  siteOutPhotos: z.array(sitePhotoSchema).max(20).default([]).nullish(),

  // Follow-up System Enhancement
  isFollowUp: z.boolean().default(false),
  followUpOf: z.string().nullish(), // ID of original visit (if this is a follow-up)
  hasFollowUps: z.boolean().default(false), // True if this visit has follow-ups
  followUpCount: z.number().default(0), // Number of follow-ups for this site
  followUpReason: z.string().nullish(), // Why follow-up was needed
  followUpDescription: z.string().nullish(), // Simple description for follow-ups

  // Status and metadata
  status: z.enum(["in_progress", "completed", "cancelled", "auto_closed"]).default("in_progress"),

  // Auto-close metadata fields
  autoCorrected: z.boolean().default(false).nullish(),
  autoClosedAt: z.date().nullish(),
  autoCorrectionReason: z.string().nullish(),

  // Visit outcome for business classification (selected at checkout)
  visitOutcome: z.enum(visitOutcomes).nullish(),
  outcomeNotes: z.string().nullish(),
  scheduledFollowUpDate: z.date().nullish(),
  outcomeSelectedAt: z.date().nullish(),
  outcomeSelectedBy: z.string().nullish(),

  // Dynamic Status Management for Follow-up Workflow Enhancement
  customerCurrentStatus: z.enum(["converted", "on_process", "cancelled"]).nullish(), // Dynamic customer status based on latest activity
  lastActivityType: z.enum(["initial_visit", "follow_up"]).default("initial_visit"), // Type of last activity affecting customer status
  lastActivityDate: z.date().default(() => new Date()), // Timestamp of last status-affecting activity
  activeFollowUpId: z.string().nullish(), // Reference to active follow-up if customer is in follow-up process

  notes: z.string().nullish(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date())
});

// Simplified Follow-up Site Visit Schema
export const insertFollowUpSiteVisitSchema = z.object({
  originalVisitId: z.string().min(1, "Original visit ID is required"),

  // Essential fields for follow-ups
  userId: z.string(),
  department: z.enum(["technical", "marketing", "admin"]),
  siteInTime: z.date().default(() => new Date()),
  siteInLocation: locationSchema,
  siteInPhotoUrl: z.string().url().nullish(),
  siteOutTime: z.date().nullish(),
  siteOutLocation: locationSchema.nullish(),
  siteOutPhotoUrl: z.string().url().nullish(),

  // Follow-up specific data
  followUpReason: z.enum([
    "additional_work_required",
    "issue_resolution",
    "status_check",
    "customer_request",
    "maintenance",
    "other"
  ]).default("additional_work_required"),
  description: z.string().min(10, "Description must be at least 10 characters"),

  // Dynamic Status Management for Follow-up Impact Tracking
  originalCustomerStatus: z.enum(["converted", "on_process", "cancelled"]).nullish(), // Customer status before follow-up started
  affectsCustomerStatus: z.boolean().default(true), // Whether this follow-up impacts customer status
  newCustomerStatus: z.enum(["converted", "on_process", "cancelled"]).nullish(), // Customer status after follow-up completion

  // Photo documentation for follow-ups
  sitePhotos: z.array(z.string().url()).max(10).default([]), // Array of site "in" photo URLs
  siteOutPhotos: z.array(z.string().url()).max(10).default([]), // Array of site "out" photo URLs (checkout photos)

  // Status and metadata
  status: z.enum(["in_progress", "completed", "cancelled"]).default("in_progress"),

  // Visit outcome for business classification (follow-up specific outcomes)
  visitOutcome: z.enum(["completed", "on_process", "cancelled"]).nullish(),
  outcomeNotes: z.string().nullish(),
  scheduledFollowUpDate: z.date().nullish(),
  outcomeSelectedAt: z.date().nullish(),
  outcomeSelectedBy: z.string().nullish(),

  notes: z.string().nullish(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),

  // Customer info (copied from original)
  customer: customerDetailsSchema,
});

// Follow-up visit interface
export type InsertFollowUpSiteVisit = z.infer<typeof insertFollowUpSiteVisitSchema>;

export interface FollowUpSiteVisit extends InsertFollowUpSiteVisit {
  id: string;
}

// Type definitions
export type SiteVisitPurpose = typeof siteVisitPurposes[number];
export type PropertyType = typeof propertyTypes[number];
export type TechnicalWorkType = typeof technicalWorkTypes[number];
export type ServiceType = typeof serviceTypes[number];
export type WorkingStatus = typeof workingStatus[number];
export type SolarPanelBrand = typeof solarPanelBrands[number];
export type InverterMake = typeof inverterMakes[number];
export type InverterPhase = typeof inverterPhases[number];
export type EarthingType = typeof earthingTypes[number];
export type PanelWatt = typeof panelWatts[number];
export type PanelType = typeof panelTypes[number];
export type InverterWatt = typeof inverterWatts[number];
// Battery brand is now a flexible string (not limited to predefined values)
export type BatteryBrand = string;
export type BatteryType = typeof batteryTypes[number];
export type BatteryAH = typeof batteryAHOptions[number];
export type WaterHeaterBrand = typeof waterHeaterBrands[number];
export type MarketingProjectType = typeof marketingProjectTypes[number];
export type BankProcessStep = typeof bankProcessSteps[number];
export type EBProcessType = typeof ebProcessTypes[number];
export type VisitOutcome = typeof visitOutcomes[number];

export type Location = z.infer<typeof locationSchema>;
export type CustomerDetails = z.infer<typeof customerDetailsSchema>;
export type TechnicalSiteVisit = z.infer<typeof technicalSiteVisitSchema>;
export type OnGridConfig = z.infer<typeof onGridConfigSchema>;
export type OffGridConfig = z.infer<typeof offGridConfigSchema>;
export type HybridConfig = z.infer<typeof hybridConfigSchema>;
export type WaterHeaterConfig = z.infer<typeof waterHeaterConfigSchema>;
export type WaterPumpConfig = z.infer<typeof waterPumpConfigSchema>;
export type MarketingSiteVisit = z.infer<typeof marketingSiteVisitSchema>;
export type AdminSiteVisit = z.infer<typeof adminSiteVisitSchema>;
export type SitePhoto = z.infer<typeof sitePhotoSchema>;
export type InsertSiteVisit = z.infer<typeof insertSiteVisitSchema>;

export interface SiteVisit extends InsertSiteVisit {
  id: string;
}

// Quick Action Types for Site Visit Workflow Enhancement
export const quickActionTypes = [
  "convert", "cancel", "reschedule"
] as const;

export type QuickActionType = typeof quickActionTypes[number];

// Quick Update Request Schema
export const quickUpdateSiteVisitSchema = z.object({
  action: z.enum(quickActionTypes),
  scheduledFollowUpDate: z.coerce.date().nullish(), // Required for reschedule action - coerce for HTTP JSON compatibility
  outcomeNotes: z.string().nullish(), // Optional notes for any action
  reason: z.string().nullish() // Optional reason for cancel/reschedule
});

export type QuickUpdateSiteVisit = z.infer<typeof quickUpdateSiteVisitSchema>;

// Quick Update Response Interface
export interface QuickUpdateResponse {
  success: boolean;
  data: {
    id: string;
    visitOutcome: VisitOutcome;
    scheduledFollowUpDate?: Date;
    outcomeNotes?: string;
    updatedAt: Date;
  };
  message: string;
}

// Document types for employee document management
export const documentTypes = [
  "aadhar_card", "pan_card", "passport", "driving_license", "voter_id",
  "resume", "offer_letter", "joining_letter", "salary_certificate",
  "experience_certificate", "education_certificate", "photo", "other"
] as const;

// Comprehensive Employee Profile Schema
export const insertEmployeeSchema = z.object({
  // Basic Employee Information
  employeeId: z.string().min(1, "Employee ID is required"),
  systemUserId: z.string().nullish(), // Links to User Management system

  // Personal Information
  personalInfo: z.object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    middleName: z.string().nullish(),
    displayName: z.string().min(2, "Display name must be at least 2 characters"),
    dateOfBirth: z.date().nullish(),
    gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).nullish(),
    maritalStatus: z.enum(maritalStatus).nullish(),
    bloodGroup: z.enum(bloodGroups).nullish(),
    nationality: z.string().nullish(),
    photoURL: z.string().url().nullish(),
  }),

  // Contact Information
  contactInfo: z.object({
    primaryEmail: z.string().email("Valid email is required"),
    secondaryEmail: z.string().email().nullish(),
    primaryPhone: z.string().min(10, "Valid phone number is required"),
    secondaryPhone: z.string().nullish(),
    permanentAddress: z.object({
      street: z.string().nullish(),
      city: z.string().nullish(),
      state: z.string().nullish(),
      pincode: z.string().nullish(),
      country: z.string().default("India"),
    }).nullish(),
    currentAddress: z.object({
      street: z.string().nullish(),
      city: z.string().nullish(),
      state: z.string().nullish(),
      pincode: z.string().nullish(),
      country: z.string().default("India"),
      isSameAsPermanent: z.boolean().default(false),
    }).nullish(),
  }),

  // Employment Information
  employmentInfo: z.object({
    department: z.enum(departments),
    designation: z.enum(designations),
    employmentType: z.enum(employmentTypes).default("full_time"),
    joinDate: z.date(),
    confirmationDate: z.date().nullish(),
    probationPeriodMonths: z.number().min(0).max(24).default(6),
    reportingManagerId: z.string().nullish(),
    workLocation: z.string().nullish(),
    shiftPattern: z.string().nullish(),
    weeklyOffDays: z.array(z.number()).default([0, 6]), // Sunday, Saturday
  }),

  // Payroll Information
  payrollInfo: z.object({
    payrollGrade: z.enum(payrollGrades).nullish(),
    basicSalary: z.number().min(0).nullish(),
    currency: z.string().default("INR"),
    paymentMethod: z.enum(["bank_transfer", "cash", "cheque"]).default("bank_transfer"),
    bankDetails: z.object({
      accountNumber: z.string().nullish(),
      bankName: z.string().nullish(),
      ifscCode: z.string().nullish(),
      accountHolderName: z.string().nullish(),
    }).nullish(),
    pfNumber: z.string().nullish(),
    esiNumber: z.string().nullish(),
    panNumber: z.string().nullish(),
    aadharNumber: z.string().nullish(),
  }),

  // Professional Information
  professionalInfo: z.object({
    totalExperienceYears: z.number().min(0).nullish(),
    relevantExperienceYears: z.number().min(0).nullish(),
    highestQualification: z.string().nullish(),
    skills: z.array(z.string()).default([]),
    certifications: z.array(z.string()).default([]),
    languages: z.array(z.string()).default([]),
    previousEmployers: z.array(z.object({
      companyName: z.string(),
      designation: z.string(),
      duration: z.string(),
      reasonForLeaving: z.string().nullish(),
    })).default([]),
  }),

  // Emergency Contact Information
  emergencyContacts: z.array(z.object({
    name: z.string().min(1, "Emergency contact name is required"),
    relationship: z.string().min(1, "Relationship is required"),
    primaryPhone: z.string().min(10, "Valid phone number is required"),
    secondaryPhone: z.string().nullish(),
    address: z.string().nullish(),
  })).default([]),

  // System Information
  status: z.enum(employeeStatus).default("active"),
  isActive: z.boolean().default(true),
  notes: z.string().nullish(),
  createdBy: z.string().nullish(),
  lastUpdatedBy: z.string().nullish(),
});

// Employee Document Schema
export const insertEmployeeDocumentSchema = z.object({
  employeeId: z.string(),
  documentType: z.enum(documentTypes),
  documentName: z.string().min(1, "Document name is required"),
  documentUrl: z.string().url("Valid URL is required"),
  documentNumber: z.string().nullish(), // For ID documents
  expiryDate: z.date().nullish(),
  isVerified: z.boolean().default(false),
  verifiedBy: z.string().nullish(),
  verifiedAt: z.date().nullish(),
  uploadedBy: z.string(),
  notes: z.string().nullish(),
});

// Employee Performance Review Schema
export const insertPerformanceReviewSchema = z.object({
  employeeId: z.string(),
  reviewPeriod: z.object({
    startDate: z.date(),
    endDate: z.date(),
  }),
  reviewType: z.enum(["annual", "quarterly", "probation", "special"]).default("annual"),
  overallRating: z.number().min(1).max(5),
  goals: z.array(z.object({
    title: z.string(),
    description: z.string().nullish(),
    status: z.enum(["achieved", "partially_achieved", "not_achieved"]),
  })).default([]),
  strengths: z.array(z.string()).default([]),
  improvementAreas: z.array(z.string()).default([]),
  reviewerComments: z.string().nullish(),
  employeeComments: z.string().nullish(),
  reviewedBy: z.string(),
  nextReviewDate: z.date().nullish(),
});

export const insertAttendanceSchema = z.object({
  userId: z.string(),
  date: z.date().nullish(),
  checkInTime: z.date().nullish(),
  checkOutTime: z.date().nullish(),
  attendanceType: z.enum(["office", "remote", "field_work"]).default("office"),
  customerId: z.string().nullish(),
  customerName: z.string().nullish(),
  reason: z.string().nullish(),
  checkInLatitude: z.string().nullish(),
  checkInLongitude: z.string().nullish(),
  checkInImageUrl: z.string().nullish(),
  checkOutLatitude: z.string().nullish(),
  checkOutLongitude: z.string().nullish(),
  checkOutImageUrl: z.string().nullish(),
  status: z.enum(["present", "absent", "late", "leave", "holiday", "half_day"]).default("present"),
  overtimeHours: z.number().nullish(),
  otReason: z.string().nullish(),
  otImageUrl: z.string().nullish(),
  workingHours: z.number().nullish(),
  breakHours: z.number().nullish(),
  isLate: z.boolean().default(false),
  lateMinutes: z.number().nullish(),
  approvedBy: z.string().nullish(),
  remarks: z.string().nullish(),
  isWithinOfficeRadius: z.boolean().default(false),
  distanceFromOffice: z.number().nullish(),

  // Manual OT System Fields
  otStartTime: z.date().nullish(),
  otEndTime: z.date().nullish(),
  otStartLatitude: z.string().nullish(),
  otStartLongitude: z.string().nullish(),
  otStartImageUrl: z.string().nullish(),
  otEndLatitude: z.string().nullish(),
  otEndLongitude: z.string().nullish(),
  otEndImageUrl: z.string().nullish(),
  otStartAddress: z.string().nullish(),
  otEndAddress: z.string().nullish(),
  isManualOT: z.boolean().default(false),
  manualOTHours: z.number().nullish(),
  otStatus: z.enum(["not_started", "in_progress", "completed"]).default("not_started"),
  otType: z.enum(["early_arrival", "late_departure", "weekend", "holiday"]).nullish(),

  // Auto-Correction & Admin Review Fields (Phases 1-3)
  autoCorrected: z.boolean().default(false),
  autoCorrectedAt: z.date().nullish(),
  autoCorrectionReason: z.string().nullish(),
  adminReviewStatus: z.enum(["pending", "accepted", "adjusted", "rejected"]).nullish(),
  adminReviewedBy: z.string().nullish(),
  adminReviewedAt: z.date().nullish(),
  adminReviewNotes: z.string().nullish(),
  originalCheckOutTime: z.date().nullish(),
});

export const insertNotificationSchema = z.object({
  userId: z.string(),
  type: z.enum(["auto_checkout", "admin_review", "system", "general"]).default("general"),
  category: z.enum(["attendance", "leave", "ot", "general"]).default("general"),
  title: z.string(),
  message: z.string(),
  actionUrl: z.string().nullish(),
  actionLabel: z.string().nullish(),
  dismissible: z.boolean().default(true),
  status: z.enum(["unread", "read"]).default("unread"),
  dismissedAt: z.date().nullish(),
  expiresAt: z.date().nullish(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export const insertOfficeLocationSchema = z.object({
  name: z.string(),
  latitude: z.string(),
  longitude: z.string(),
  radius: z.number().default(100), // Default 100 meters radius
  address: z.string().nullish(),
  isActive: z.boolean().default(true),
});

// Department timing schema for attendance calculations
export const insertDepartmentTimingSchema = z.object({
  departmentId: z.string(),
  department: z.enum(departments),
  workingHours: z.number().min(1).max(24).default(8), // Standard working hours per day
  checkInTime: z.string().regex(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i, "Time must be in 12-hour format (h:mm AM/PM)"), // e.g., "9:00 AM"
  checkOutTime: z.string().regex(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i, "Time must be in 12-hour format (h:mm AM/PM)") // e.g., "6:00 PM"
    .superRefine((checkOut, ctx) => {
      const checkIn = (ctx as any).parent.checkInTime;
      if (checkIn && checkOut) {
        // Parse 12-hour format properly for validation
        const checkInMatch = checkIn.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        const checkOutMatch = checkOut.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);

        if (checkInMatch && checkOutMatch) {
          let [, checkInHour, checkInMin, checkInPeriod] = checkInMatch;
          let [, checkOutHour, checkOutMin, checkOutPeriod] = checkOutMatch;

          let checkInHour24 = parseInt(checkInHour);
          let checkOutHour24 = parseInt(checkOutHour);

          if (checkInPeriod.toUpperCase() === 'PM' && checkInHour24 !== 12) checkInHour24 += 12;
          if (checkInPeriod.toUpperCase() === 'AM' && checkInHour24 === 12) checkInHour24 = 0;
          if (checkOutPeriod.toUpperCase() === 'PM' && checkOutHour24 !== 12) checkOutHour24 += 12;
          if (checkOutPeriod.toUpperCase() === 'AM' && checkOutHour24 === 12) checkOutHour24 = 0;

          const checkInMinutes = checkInHour24 * 60 + parseInt(checkInMin);
          const checkOutMinutes = checkOutHour24 * 60 + parseInt(checkOutMin);

          // Allow overnight shifts (checkout next day)
          if (checkOutMinutes <= checkInMinutes && checkOutMinutes >= checkInMinutes) {
            ctx.addIssue({
              code: 'custom',
              message: 'Check out time must be after check in time'
            });
          }
        }
      }
    }),
  lateThresholdMinutes: z.number().min(0).default(15), // Grace period for late arrivals (flexible input)
  overtimeThresholdMinutes: z.number().min(0).default(30), // Minimum minutes to qualify for OT (flexible input)
  autoCheckoutGraceMinutes: z.number().min(0).default(120), // Grace period before auto-checkout triggers
  isFlexibleTiming: z.boolean().default(false),
  flexibleCheckInStart: z.string().nullish(), // e.g., "08:00"
  flexibleCheckInEnd: z.string().nullish(),   // e.g., "10:00"
  breakDurationMinutes: z.number().min(0).default(60), // Lunch break duration
  weeklyOffDays: z.array(z.number().min(0).max(6)).default([0]), // 0=Sunday, 1=Monday, etc.
  isActive: z.boolean().default(true),
  createdBy: z.string(),
  updatedBy: z.string().nullish(),
});

export const insertPermissionSchema = z.object({
  userId: z.string(),
  month: z.date(),
  minutesUsed: z.number().default(0),
});

// Phase 2: Enterprise Permission Matrix Schemas
export const insertRoleSchema = z.object({
  name: z.string().min(2, "Role name must be at least 2 characters"),
  description: z.string().nullish(),
  isSystemRole: z.boolean().default(false),
  department: z.enum(departments).nullable().nullish(),
  designation: z.enum(designations).nullable().nullish(),
  permissions: z.array(z.enum(systemPermissions)).default([]),
  approvalLimits: z.object({
    quotations: z.number().nullable().nullish(),
    invoices: z.number().nullable().nullish(),
    expenses: z.number().nullable().nullish(),
    leave: z.boolean().default(false),
    overtime: z.boolean().default(false)
  }).nullish()
});

export const insertUserRoleAssignmentSchema = z.object({
  userId: z.string(),
  roleId: z.string(),
  assignedBy: z.string(),
  effectiveFrom: z.date().default(() => new Date()),
  effectiveTo: z.date().nullable().nullish(),
  isActive: z.boolean().default(true)
});

export const insertPermissionOverrideSchema = z.object({
  userId: z.string(),
  permission: z.enum(systemPermissions),
  granted: z.boolean(),
  reason: z.string().min(10, "Reason must be at least 10 characters"),
  grantedBy: z.string(),
  effectiveFrom: z.date().default(() => new Date()),
  effectiveTo: z.date().nullable().nullish()
});

export const insertAuditLogSchema = z.object({
  userId: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  changes: z.record(z.any()).nullish(),
  ipAddress: z.string().nullish(),
  userAgent: z.string().nullish(),
  department: z.enum(departments).nullable().nullish(),
  designation: z.enum(designations).nullable().nullish()
});

// Payroll System Schemas
export const insertSalaryStructureSchema = z.object({
  userId: z.string(),
  employeeId: z.string(),
  fixedSalary: z.number().min(0),
  basicSalary: z.number().min(0),
  hra: z.number().min(0).nullish(),
  allowances: z.number().min(0).nullish(),
  variableComponent: z.number().min(0).nullish(),
  effectiveFrom: z.date(),
  effectiveTo: z.date().nullable().nullish(),
  isActive: z.boolean().default(true),
  createdBy: z.string(),
  approvedBy: z.string().nullish()
});

export const insertPayrollSchema = z.object({
  userId: z.string(),
  employeeId: z.string(),
  month: z.number().min(1).max(12),
  year: z.number().min(2020).max(new Date().getFullYear() + 1), // Prevent future years beyond next year
  workingDays: z.number().min(0).max(31),
  presentDays: z.number().min(0),
  absentDays: z.number().min(0),
  overtimeHours: z.number().min(0).default(0),
  leaveDays: z.number().min(0).default(0),

  // Salary Components
  fixedSalary: z.number().min(0),
  basicSalary: z.number().min(0),
  hra: z.number().min(0).default(0),
  allowances: z.number().min(0).default(0),
  variableComponent: z.number().min(0).default(0),
  overtimePay: z.number().min(0).default(0),

  // Gross Salary
  grossSalary: z.number().min(0),

  // Deductions
  pfDeduction: z.number().min(0).default(0),
  esiDeduction: z.number().min(0).default(0),
  tdsDeduction: z.number().min(0).default(0),
  advanceDeduction: z.number().min(0).default(0),
  loanDeduction: z.number().min(0).default(0),
  otherDeductions: z.number().min(0).default(0),
  totalDeductions: z.number().min(0),

  // Net Salary
  netSalary: z.number(),

  // Status
  status: z.enum(["draft", "pending", "approved", "paid", "cancelled"]).default("draft"),

  // Processing
  processedBy: z.string(),
  approvedBy: z.string().nullish(),
  paidOn: z.date().nullish(),
  paymentReference: z.string().nullish(),

  // Metadata
  remarks: z.string().nullish()
});

export const insertPayrollSettingsSchema = z.object({
  pfRate: z.number().min(0).max(100).default(12), // PF rate percentage
  esiRate: z.number().min(0).max(100).default(0.75), // ESI rate percentage
  tdsRate: z.number().min(0).max(100).default(0), // TDS rate percentage
  // Note: OT rate in CompanySettings.defaultOTRate (single source of truth)
  standardWorkingHours: z.number().min(1).default(8), // Standard working hours per day
  standardWorkingDays: z.number().min(1).default(26), // Standard working days per month
  leaveDeductionRate: z.number().min(0).max(100).default(100), // Percentage deduction for leaves
  autoCheckoutGraceMinutes: z.number().min(0).default(5), // Global auto-checkout grace period in minutes

  // Salary calculation rules
  pfApplicableFromSalary: z.number().min(0).default(15000), // PF applicable from this salary amount
  esiApplicableFromSalary: z.number().min(0).default(21000), // ESI applicable from this salary amount

  // Company details
  companyName: z.string().default("Godiva Solar"),
  companyAddress: z.string().nullish(),
  companyPan: z.string().nullish(),
  companyTan: z.string().nullish(),

  updatedBy: z.string()
});

export const insertSalaryAdvanceSchema = z.object({
  userId: z.string(),
  employeeId: z.string(),
  amount: z.number().min(0),
  reason: z.string(),
  requestDate: z.date().default(() => new Date()),
  approvedDate: z.date().nullish(),
  deductionStartMonth: z.number().min(1).max(12),
  deductionStartYear: z.number().min(2020),
  numberOfInstallments: z.number().min(1).default(1),
  monthlyDeduction: z.number().min(0),
  remainingAmount: z.number().min(0),
  status: z.enum(["pending", "approved", "rejected", "completed"]).default("pending"),
  approvedBy: z.string().nullish(),
  remarks: z.string().nullish()
});

export const insertAttendancePolicySchema = z.object({
  name: z.string(),
  department: z.enum(departments).nullable().nullish(),
  designation: z.enum(designations).nullable().nullish(),

  // Timing policies
  checkInTime: z.string().default("9:30 AM"), // 12-hour format (h:mm AM/PM)
  checkOutTime: z.string().default("6:30 PM"), // 12-hour format (h:mm AM/PM)
  flexibleTiming: z.boolean().default(false),
  flexibilityMinutes: z.number().min(0).default(0),

  // Overtime policies
  overtimeAllowed: z.boolean().default(true),
  maxOvertimeHours: z.number().min(0).default(4),
  overtimeApprovalRequired: z.boolean().default(true),

  // Leave policies
  lateMarkAfterMinutes: z.number().min(0).default(15),
  halfDayMarkAfterMinutes: z.number().min(0).default(240), // 4 hours

  // Weekend and holiday policies
  weekendDays: z.array(z.number().min(0).max(6)).default([0, 6]), // 0=Sunday, 6=Saturday
  holidayPolicy: z.enum(["paid", "unpaid", "optional"]).default("paid"),

  isActive: z.boolean().default(true),
  createdBy: z.string()
});

// Enhanced Payroll System Schemas
export const insertPayrollFieldConfigSchema = z.object({
  name: z.string().min(1, "Field name is required"),
  displayName: z.string().min(1, "Display name is required"),
  category: z.enum(["earnings", "deductions", "attendance"]),
  dataType: z.enum(["number", "percentage", "boolean", "text"]),
  isRequired: z.boolean().default(false),
  isSystemField: z.boolean().default(false),
  defaultValue: z.number().nullish(),
  department: z.enum(departments).nullish(),
  sortOrder: z.number().min(1).default(1),
  isActive: z.boolean().default(true)
});

export const insertEnhancedSalaryStructureSchema = z.object({
  userId: z.string(),
  employeeId: z.string(),
  fixedBasic: z.number().min(0),
  fixedHRA: z.number().min(0),
  fixedConveyance: z.number().min(0),
  customEarnings: z.record(z.number()).default({}),
  customDeductions: z.record(z.number()).default({}),
  perDaySalaryBase: z.enum(["basic", "basic_hra", "gross"]).default("basic_hra"),
  // Note: All employees use CompanySettings.defaultOTRate (no per-employee rates)
  epfApplicable: z.boolean().default(true),
  esiApplicable: z.boolean().default(true),
  vptAmount: z.number().min(0).default(0),
  templateId: z.string().nullish(),
  effectiveFrom: z.date(),
  effectiveTo: z.date().nullish(),
  isActive: z.boolean().default(true)
});

export const insertEnhancedPayrollSchema = z.object({
  userId: z.string(),
  employeeId: z.string(),
  month: z.number().min(1).max(12),
  year: z.number().min(2020).max(new Date().getFullYear() + 1),
  monthDays: z.number().min(1).max(31),
  presentDays: z.number().min(0),
  paidLeaveDays: z.number().min(0).default(0),
  overtimeHours: z.number().min(0).default(0),
  perDaySalary: z.number().min(0),
  earnedBasic: z.number().min(0),
  earnedHRA: z.number().min(0),
  earnedConveyance: z.number().min(0),
  overtimePay: z.number().min(0).default(0),
  betta: z.number().min(0).default(0), // BETTA allowance from manual system
  dynamicEarnings: z.record(z.number()).default({}),
  grossSalary: z.number().min(0), // Gross before BETTA
  finalGross: z.number().min(0), // Final gross after BETTA
  dynamicDeductions: z.record(z.number()).default({}),
  epfDeduction: z.number().min(0).default(0),
  esiDeduction: z.number().min(0).default(0),
  // Added Employer Contributions for CTC Calculation
  employerEPF: z.number().min(0).default(0),
  employerESI: z.number().min(0).default(0),
  ctc: z.number().min(0).default(0),
  vptDeduction: z.number().min(0).default(0),
  tdsDeduction: z.number().min(0).default(0),
  fineDeduction: z.number().min(0).default(0), // FINE from manual system
  salaryAdvance: z.number().min(0).default(0), // SALARY ADVANCE from manual system
  unpaidLeaveDeduction: z.number().min(0).default(0), // UNPAID LEAVE deduction
  creditAdjustment: z.number().min(0).default(0), // CREDIT from manual system
  esiEligible: z.boolean().default(true), // ESI eligibility status
  totalEarnings: z.number().min(0),
  totalDeductions: z.number().min(0),
  netSalary: z.number(),
  status: z.enum(["draft", "processed", "approved", "paid"]).default("draft"),
  processedBy: z.string().nullish(),
  processedAt: z.date().nullish(),
  approvedBy: z.string().nullish(),
  approvedAt: z.date().nullish(),
  remarks: z.string().nullish()
});

export const insertEnhancedPayrollSettingsSchema = z.object({
  epfEmployeeRate: z.number().min(0).max(100).default(12),
  epfEmployerRate: z.number().min(0).max(100).default(12),
  esiEmployeeRate: z.number().min(0).max(100).default(0.75),
  esiEmployerRate: z.number().min(0).max(100).default(3.25),
  epfCeiling: z.number().min(0).default(15000),
  esiThreshold: z.number().min(0).default(21000),
  tdsThreshold: z.number().min(0).default(250000),
  standardWorkingDays: z.number().min(1).default(26),
  standardWorkingHours: z.number().min(1).default(8),
  overtimeThresholdHours: z.number().min(0).default(8),
  autoCheckoutGraceMinutes: z.number().min(0).default(5), // Global auto-checkout grace period in minutes
  companyName: z.string().default("Godiva Solar"),
  companyAddress: z.string().nullish(),
  companyPan: z.string().nullish(),
  companyTan: z.string().nullish(),
  autoCalculateStatutory: z.boolean().default(true),
  allowManualOverride: z.boolean().default(true),
  requireApprovalForProcessing: z.boolean().default(false)
});

// Enterprise user types
export type Department = typeof departments[number];
export type Designation = typeof designations[number];
export type PayrollGrade = typeof payrollGrades[number];
export type SystemPermission = typeof systemPermissions[number];
export type DesignationLevel = typeof designationLevels[keyof typeof designationLevels];

// Phase 1 types (backward compatible)
export type InsertUserEnhanced = z.infer<typeof insertUserEnhancedSchema>;
export type InsertDesignation = z.infer<typeof insertDesignationSchema>;
export type InsertPermissionGroup = z.infer<typeof insertPermissionGroupSchema>;
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type InsertOfficeLocation = z.infer<typeof insertOfficeLocationSchema>;
export type InsertPermission = z.infer<typeof insertPermissionSchema>;

// Phase 2 types (enterprise RBAC)
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type InsertUserRoleAssignment = z.infer<typeof insertUserRoleAssignmentSchema>;
export type InsertPermissionOverride = z.infer<typeof insertPermissionOverrideSchema>;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

// Payroll System Types
export type InsertSalaryStructure = z.infer<typeof insertSalaryStructureSchema>;
export type InsertPayroll = z.infer<typeof insertPayrollSchema>;
export type InsertPayrollSettings = z.infer<typeof insertPayrollSettingsSchema>;
export type InsertSalaryAdvance = z.infer<typeof insertSalaryAdvanceSchema>;
export type InsertAttendancePolicy = z.infer<typeof insertAttendancePolicySchema>;

// Enterprise permission checking utilities
export const getDesignationLevel = (designation: Designation): number => {
  return designationLevels[designation];
};

export const canApproveForDesignation = (userDesignation: Designation, targetDesignation: Designation): boolean => {
  return getDesignationLevel(userDesignation) > getDesignationLevel(targetDesignation);
};

export const getDepartmentModuleAccess = (department: Department): SystemPermission[] => {
  // Basic permissions that ALL employees should have regardless of department
  const baseAccess: SystemPermission[] = [
    "dashboard.view",
    "attendance.view_own",      // All employees can view their own attendance
    "attendance.mark",          // All employees can mark their own attendance
    "leave.view_own",           // All employees can view their own leave
    "leave.request"             // All employees can request leave
  ];

  switch (department) {
    case "operations":
      return [...baseAccess, "dashboard.full_access", "analytics.enterprise", "reports.advanced", "reports.export", "users.view", "departments.view"];
    case "admin":
      return [...baseAccess, "users.view", "users.create", "users.edit", "departments.view", "designations.view", "analytics.departmental", "reports.basic", "site_visit.view", "site_visit.create", "site_visit.edit", "site_visit.view_team", "site_visit.reports"];
    case "hr":
      return [...baseAccess, "attendance.view_all", "leave.view_all", "leave.approve", "users.view", "users.create", "users.edit", "customers.view", "quotations.view", "invoices.view"];
    case "marketing":
      return [...baseAccess, "customers.view", "customers.create", "customers.edit", "quotations.view", "reports.basic", "site_visit.view", "site_visit.create", "site_visit.edit", "site_visit.view_team", "site_visit.reports"];
    case "sales":
      return [...baseAccess, "customers.view", "customers.create", "customers.edit", "quotations.view", "quotations.create", "quotations.edit", "reports.basic"];
    case "technical":
      return [...baseAccess, "site_visit.view", "site_visit.create", "site_visit.edit", "site_visit.view_team", "site_visit.reports"];
    case "housekeeping":
      return [...baseAccess, "attendance.view_own"];
    default:
      return baseAccess;
  }
};

// Designation-based Action Permissions (what actions they can perform within modules)
export const getDesignationActionPermissions = (designation: Designation): SystemPermission[] => {
  const level = getDesignationLevel(designation);

  // Higher designation = more action permissions
  const permissions: SystemPermission[] = [];

  // Basic permissions for all designations
  permissions.push("dashboard.view", "attendance.view_own", "leave.view_own", "leave.request");

  // Level 1 (House Man)
  if (level >= 1) {
    permissions.push("attendance.mark");
  }

  // Level 2+ (Welder and above)
  if (level >= 2) {

  }

  // Level 3+ (Technician and above)
  if (level >= 3) {
  }

  // Level 4+ (CRE and above)
  if (level >= 4) {
    permissions.push("customers.create", "customers.edit", "quotations.create", "quotations.edit");
  }

  // Level 5+ (Executive and above)
  if (level >= 5) {
    permissions.push("invoices.create", "approve.quotations.basic", "attendance.view_team");
  }

  // Level 6+ (Team Leader and above)
  if (level >= 6) {
    permissions.push("approve.quotations.advanced", "approve.leave.team", "users.view", "reports.advanced");
  }

  // Level 7+ (Officer and above)
  if (level >= 7) {
    permissions.push("approve.invoices.basic", "approve.leave.department", "users.create", "users.edit", "analytics.departmental");
  }

  // Level 8+ (GM and above)
  if (level >= 8) {
    permissions.push("approve.invoices.advanced", "users.permissions", "analytics.enterprise", "system.settings");
  }

  // Level 9 (CEO)
  if (level >= 9) {
    permissions.push("system.backup", "system.audit", "system.integrations", "users.delete", "departments.create", "departments.edit", "departments.delete");
  }

  return permissions;
};

// Default permissions for new employees without department/designation
export const getNewEmployeePermissions = (): SystemPermission[] => {
  return [
    "dashboard.view",
    "attendance.view_own",
    "leave.view_own",
    "leave.request"
  ];
};

// Combined Department + Designation permissions
// Updated: Department permissions are granted regardless of designation
// This allows users with a department to access department-specific features immediately
export const getEffectivePermissions = (department: Department | null, designation: Designation | null): SystemPermission[] => {
  // If no department assigned, return basic new employee permissions
  if (!department) {
    return getNewEmployeePermissions();
  }

  // Grant department-based permissions (designation is optional)
  const departmentPermissions = getDepartmentModuleAccess(department);
  const designationPermissions = designation ? getDesignationActionPermissions(designation) : [];

  // Combine and deduplicate permissions
  const combinedPermissions = new Set([...departmentPermissions, ...designationPermissions]);
  return Array.from(combinedPermissions);
};

// ====== UNIFIED CUSTOMER MANAGEMENT SCHEMAS ======

// Customer profile completeness tracking
export const customerProfileCompleteness = [
  "basic", "full"
] as const;

// Customer creation source tracking  
export const customerCreationSources = [
  "site_visit", "customers_page"
] as const;

// Unified Customer Schema - Single source of truth for customer data
// Uses mobile as unique identifier with proper validation and tracking fields
// IMPORTANT: Use .nullish() for optional fields to accept null/undefined but reject empty strings
// Frontend forms must use sanitizeFormData() utility to convert "" to null before submission
export const insertCustomerSchema = z.object({
  // Core required fields (minimum for any customer record)
  name: z.string().min(2, "Customer name must be at least 2 characters"),
  mobile: z.string().min(10, "Valid mobile number is required").max(15, "Mobile number cannot exceed 15 digits"),

  // Optional contact fields - using .nullish() to accept null/undefined but reject empty strings
  email: z.string().email("Please enter a valid email address").nullish(),
  address: z.string().min(3, "Address must be at least 3 characters").nullish(),

  // Site visit specific fields (optional for basic customer records)
  ebServiceNumber: z.string().nullish(),
  tariffCode: z.string().nullish(),
  ebSanctionPhase: z.enum(["1_phase", "3_phase"]).nullish(),
  ebSanctionKW: z.number().min(0, "EB Sanction KW must be a positive number").nullish(),
  propertyType: z.enum(propertyTypes).nullish(),
  location: z.string().nullish(),

  // Customer management specific fields
  scope: z.string().nullish(),

  // Data consistency tracking fields
  profileCompleteness: z.enum(customerProfileCompleteness).default("basic"),
  createdFrom: z.enum(customerCreationSources).default("customers_page")
});

// Customer interface derived from schema
export interface UnifiedCustomer {
  id: string;
  // Core required fields
  name: string;
  mobile: string;

  // Optional contact fields
  email?: string;
  address?: string;

  // Site visit specific fields
  ebServiceNumber?: string;
  tariffCode?: string;
  ebSanctionPhase?: "1_phase" | "3_phase";
  ebSanctionKW?: number;
  propertyType?: "residential" | "commercial" | "agri" | "other";
  location?: string;

  // Customer management specific fields
  scope?: string;

  // Data consistency tracking fields
  profileCompleteness: "basic" | "full";
  createdFrom: "site_visit" | "customers_page";

  // Timestamp fields
  createdAt: Date;
  updatedAt?: Date;
}

// Type exports for consistency
export type CustomerProfileCompleteness = typeof customerProfileCompleteness[number];
export type CustomerCreationSource = typeof customerCreationSources[number];
export type InsertUnifiedCustomer = z.infer<typeof insertCustomerSchema>;

// ====== COMPREHENSIVE QUOTATION SYSTEM SCHEMAS ======

// Quotation creation sources for workflow tracking
export const quotationSources = [
  "manual", "site_visit"
] as const;

// Quotation status lifecycle
export const quotationStatuses = [
  "draft", "pending_approval", "sent", "accepted", "rejected", "expired", "cancelled"
] as const;

// Project types for multi-project quotations
export const quotationProjectTypes = [
  "on_grid", "off_grid", "hybrid", "water_heater", "water_pump", "custom"
] as const;

// Terms and conditions templates
export const termsTemplates = [
  "standard", "residential", "commercial", "agri", "custom"
] as const;

// Payment terms
export const paymentTerms = [
  "advance_90_balance_10", "advance_50_balance_50", "full_advance", "credit_30_days", "custom"
] as const;

// Delivery timeframes
export const deliveryTimeframes = [
  "2_3_weeks", "3_4_weeks", "1_month", "6_8_weeks", "custom"
] as const;

// Warranty periods for different components
export const warrantyPeriods = [
  "1_year", "2_years", "5_years", "10_years", "25_years"
] as const;

// Pricing calculation mode
export const pricingModes = [
  "per_kw", "fixed_amount", "itemized"
] as const;

// Subsidy applicability
export const subsidyTypes = [
  "government", "state", "none", "custom"
] as const;

// Backup solutions schema for off-grid and hybrid systems
export const backupSolutionsSchema = z.object({
  backupWatts: z.number().min(0),
  usageWatts: z.array(z.number()).max(5).default([]),
  backupHours: z.array(z.number()).default([])
});

// Individual project configuration schemas for quotations
export const quotationOnGridProjectSchema = z.object({
  projectType: z.literal("on_grid"),
  systemKW: z.number().min(0.1),
  pricePerKW: z.number().min(0),
  solarPanelMake: z.array(z.enum(solarPanelBrands)).default([]),
  panelWatts: z.string(), // Changed to string to allow custom values
  panelType: z.enum(panelTypes).nullish(),
  dcrPanelCount: z.number().min(0).default(0),
  nonDcrPanelCount: z.number().min(0).default(0),
  panelCount: z.number().min(1),
  inverterMake: z.array(z.enum(inverterMakes)).default([]),
  inverterKW: z.number().min(0).nullish(),
  inverterQty: z.number().min(1).nullish(),
  inverterPhase: z.enum(inverterPhases),
  lightningArrest: z.boolean().default(false),
  electricalAccessories: z.boolean().default(false),
  electricalCount: z.number().min(0).nullish(),
  earth: z.array(z.enum(earthingTypes)).default([]),
  floor: z.enum(floorLevels).nullish(),
  structureType: z.enum(structureTypes).nullish(),
  gpStructure: z.object({
    lowerEndHeight: z.string().nullish(),
    higherEndHeight: z.string().nullish()
  }).nullish(),
  monoRail: z.object({
    type: z.enum(monoRailOptions).nullish()
  }).nullish(),
  civilWorkScope: z.enum(workScopeOptions).nullish(),
  netMeterScope: z.enum(workScopeOptions).nullish(),
  projectValue: z.number().min(0),
  gstPercentage: z.number().min(0).max(100).default(18),
  gstAmount: z.number().min(0).default(0),
  basePrice: z.number().min(0).default(0),
  subsidyAmount: z.number().min(0).default(0),
  customerPayment: z.number().min(0),
  customDescription: z.string().nullish(),
  installationNotes: z.string().nullish(),
  warranty: z.object({
    panel: z.enum(warrantyPeriods).default("25_years"),
    inverter: z.enum(warrantyPeriods).default("5_years"),
    installation: z.enum(warrantyPeriods).default("2_years")
  }).nullish()
});

export const quotationOffGridProjectSchema = z.object({
  projectType: z.literal("off_grid"),
  systemKW: z.number().min(0.1),
  pricePerKW: z.number().min(0),
  solarPanelMake: z.array(z.enum(solarPanelBrands)).default([]),
  panelWatts: z.string(), // Changed to string to allow custom values
  panelType: z.enum(panelTypes).nullish(),
  dcrPanelCount: z.number().min(0).default(0),
  nonDcrPanelCount: z.number().min(0).default(0),
  panelCount: z.number().min(1),
  inverterMake: z.array(z.enum(inverterMakes)).default([]),
  inverterKW: z.number().min(0).nullish(),
  inverterKVA: z.string().nullish(), // For off-grid systems, inverters are rated in KVA
  inverterQty: z.number().min(1).nullish(),
  inverterPhase: z.enum(inverterPhases),
  inverterVolt: z.string().nullish(), // Changed to string to allow custom values
  batteryBrand: z.string().min(1, "Battery brand is required"),
  batteryType: z.enum(batteryTypes).nullish(),
  batteryAH: z.enum(batteryAHOptions).nullish(),
  voltage: z.number().min(0),
  batteryCount: z.number().min(1),
  batteryStands: z.string().nullish(),
  lightningArrest: z.boolean().default(false),
  electricalAccessories: z.boolean().default(false),
  electricalCount: z.number().min(0).nullish(),
  earth: z.array(z.enum(earthingTypes)).default([]),
  floor: z.enum(floorLevels).nullish(),
  structureType: z.enum(structureTypes).nullish(),
  gpStructure: z.object({
    lowerEndHeight: z.string().nullish(),
    higherEndHeight: z.string().nullish()
  }).nullish(),
  monoRail: z.object({
    type: z.enum(monoRailOptions).nullish()
  }).nullish(),
  civilWorkScope: z.enum(workScopeOptions).nullish(),
  backupSolutions: backupSolutionsSchema.nullish(), // Backup solutions for off-grid systems
  amcIncluded: z.boolean().default(false), // Annual Maintenance Contract checkbox
  projectValue: z.number().min(0),
  gstPercentage: z.number().min(0).max(100).default(18),
  gstAmount: z.number().min(0).default(0),
  basePrice: z.number().min(0).default(0),
  subsidyAmount: z.number().min(0).default(0),
  customerPayment: z.number().min(0),
  customDescription: z.string().nullish(),
  installationNotes: z.string().nullish(),
  warranty: z.object({
    panel: z.enum(warrantyPeriods).default("25_years"),
    inverter: z.enum(warrantyPeriods).default("5_years"),
    battery: z.enum(warrantyPeriods).default("2_years"),
    installation: z.enum(warrantyPeriods).default("2_years")
  }).nullish()
});

export const quotationHybridProjectSchema = z.object({
  projectType: z.literal("hybrid"),
  systemKW: z.number().min(0.1),
  pricePerKW: z.number().min(0),
  solarPanelMake: z.array(z.enum(solarPanelBrands)).default([]),
  panelWatts: z.string(), // Changed to string to allow custom values
  panelType: z.enum(panelTypes).nullish(),
  dcrPanelCount: z.number().min(0).default(0),
  nonDcrPanelCount: z.number().min(0).default(0),
  panelCount: z.number().min(1),
  inverterMake: z.array(z.enum(inverterMakes)).default([]),
  inverterKW: z.number().min(0).nullish(),
  inverterKVA: z.string().nullish(), // For hybrid systems, inverters are rated in KVA
  inverterQty: z.number().min(1).nullish(),
  inverterPhase: z.enum(inverterPhases),
  inverterVolt: z.string().nullish(), // Changed to string to allow custom values
  batteryBrand: z.string().min(1, "Battery brand is required"),
  batteryType: z.enum(batteryTypes).nullish(),
  batteryAH: z.enum(batteryAHOptions).nullish(),
  voltage: z.number().min(0),
  batteryCount: z.number().min(1),
  batteryStands: z.string().nullish(),
  lightningArrest: z.boolean().default(false),
  electricalAccessories: z.boolean().default(false),
  electricalCount: z.number().min(0).nullish(),
  earth: z.array(z.enum(earthingTypes)).default([]),
  floor: z.enum(floorLevels).nullish(),
  structureType: z.enum(structureTypes).nullish(),
  gpStructure: z.object({
    lowerEndHeight: z.string().nullish(),
    higherEndHeight: z.string().nullish()
  }).nullish(),
  monoRail: z.object({
    type: z.enum(monoRailOptions).nullish()
  }).nullish(),
  civilWorkScope: z.enum(workScopeOptions).nullish(),
  electricalWorkScope: z.enum(workScopeOptions).nullish(),
  netMeterScope: z.enum(workScopeOptions).nullish(),
  backupSolutions: backupSolutionsSchema.nullish(), // Backup solutions for hybrid systems
  projectValue: z.number().min(0),
  gstPercentage: z.number().min(0).max(100).default(18),
  gstAmount: z.number().min(0).default(0),
  basePrice: z.number().min(0).default(0),
  subsidyAmount: z.number().min(0).default(0),
  customerPayment: z.number().min(0),
  customDescription: z.string().nullish(),
  installationNotes: z.string().nullish(),
  warranty: z.object({
    panel: z.enum(warrantyPeriods).default("25_years"),
    inverter: z.enum(warrantyPeriods).default("5_years"),
    battery: z.enum(warrantyPeriods).default("2_years"),
    installation: z.enum(warrantyPeriods).default("2_years")
  }).nullish()
});

export const quotationWaterHeaterProjectSchema = z.object({
  projectType: z.literal("water_heater"),
  brand: z.enum(waterHeaterBrands),
  litre: z.number().min(1),
  heatingCoil: z.string().nullish(),
  productImage: z.string().nullish(), // Optional product image URL
  floor: z.enum(floorLevels).nullish(),
  plumbingWorkScope: z.enum(workScopeOptions).nullish(),
  civilWorkScope: z.enum(workScopeOptions).nullish(),
  // New fields for quotation description changes
  qty: z.number().min(1).default(1),
  waterHeaterModel: z.enum(['pressurized', 'non_pressurized']).default('non_pressurized'),
  labourAndTransport: z.boolean().default(false),
  projectValue: z.number().min(0),
  gstPercentage: z.number().min(0).max(100).default(18),
  gstAmount: z.number().min(0).default(0),
  basePrice: z.number().min(0).default(0),
  subsidyAmount: z.number().min(0).default(0),
  customerPayment: z.number().min(0),
  customDescription: z.string().nullish(),
  installationNotes: z.string().nullish(),
  warranty: z.object({
    heater: z.enum(warrantyPeriods).default("5_years"),
    installation: z.enum(warrantyPeriods).default("1_year")
  }).nullish()
});

export const quotationWaterPumpProjectSchema = z.object({
  projectType: z.literal("water_pump"),
  driveHP: z.string().nullish(), // Renamed from 'hp'
  hp: z.string().nullish(), // Keep for backward compatibility
  drive: z.string(),
  solarPanel: z.string().nullish(),
  panelWatts: z.string().nullish(),
  panelType: z.enum(panelTypes).nullish(),
  panelBrand: z.array(z.enum(solarPanelBrands)).default([]),
  dcrPanelCount: z.number().min(0).default(0),
  nonDcrPanelCount: z.number().min(0).default(0),
  panelCount: z.number().min(1),
  structureType: z.enum(structureTypes).nullish(),
  gpStructure: z.object({
    lowerEndHeight: z.string().nullish(),
    higherEndHeight: z.string().nullish()
  }).nullish(),
  monoRail: z.object({
    type: z.enum(monoRailOptions).nullish()
  }).nullish(),
  // Replaced field: plumbingWorkScope renamed to earthWork
  earthWork: z.enum(workScopeOptions).nullish(),
  plumbingWorkScope: z.enum(workScopeOptions).nullish(), // Keep for backward compatibility
  civilWorkScope: z.enum(workScopeOptions).nullish(),
  // New checkbox fields
  lightningArrest: z.boolean().default(false),
  dcCable: z.boolean().default(false),
  electricalAccessories: z.boolean().default(false),
  electricalCount: z.number().min(0).nullish(),
  earth: z.array(z.enum(earthingTypes)).default([]),
  labourAndTransport: z.boolean().default(false),
  inverterPhase: z.enum(inverterPhases).nullish(), // Added for phase calculation in description
  qty: z.number().min(1).default(1), // Added quantity field for BOM
  projectValue: z.number().min(0),
  gstPercentage: z.number().min(0).max(100).default(18),
  gstAmount: z.number().min(0).default(0),
  basePrice: z.number().min(0).default(0),
  subsidyAmount: z.number().min(0).default(0),
  customerPayment: z.number().min(0),
  customDescription: z.string().nullish(),
  installationNotes: z.string().nullish(),
  warranty: z.object({
    pump: z.enum(warrantyPeriods).default("2_years"),
    panel: z.enum(warrantyPeriods).default("25_years"),
    installation: z.enum(warrantyPeriods).default("1_year")
  }).nullish()
});

// Union type for all project types
export const quotationProjectSchema = z.discriminatedUnion("projectType", [
  quotationOnGridProjectSchema,
  quotationOffGridProjectSchema,
  quotationHybridProjectSchema,
  quotationWaterHeaterProjectSchema,
  quotationWaterPumpProjectSchema
]);

// Site visit mapping metadata
export const siteVisitMappingSchema = z.object({
  sourceVisitId: z.string(),
  mappedAt: z.date().default(() => new Date()),
  mappedBy: z.string(),
  completenessScore: z.number().min(0).max(100), // Percentage of fields auto-filled
  missingCriticalFields: z.array(z.string()).default([]),
  missingOptionalFields: z.array(z.string()).default([]),
  dataQualityNotes: z.string().nullish()
});

// Follow-up tracking for quotations
export const quotationFollowUpSchema = z.object({
  followUpDate: z.date(),
  followUpType: z.enum(["call", "email", "whatsapp", "site_visit", "other"]),
  followUpNotes: z.string().nullish(),
  nextFollowUpDate: z.date().nullish(),
  followUpBy: z.string(),
  customerResponse: z.enum(["positive", "negative", "neutral", "no_response"]).nullish(),
  leadTemperature: z.enum(["hot", "warm", "cold"]).nullish()
});

// Comprehensive quotation schema
export const insertQuotationSchema = z.object({
  // Basic quotation information
  quotationNumber: z.string().min(1, "Quotation number is required"),
  customerId: z.string().min(1, "Customer ID is required"),

  // Source tracking (critical for workflow differentiation)
  source: z.enum(quotationSources),
  siteVisitMapping: siteVisitMappingSchema.nullish(), // Only for site_visit source

  // Multi-project support
  projects: z.array(quotationProjectSchema).min(1, "At least one project is required"),

  // Custom Bill of Materials (optional override)
  customBillOfMaterials: z.array(z.object({
    slNo: z.number(),
    description: z.string(),
    type: z.string(),
    volt: z.string(),
    rating: z.string(),
    make: z.string(),
    qty: z.union([z.literal("-"), z.number()]), // Allow "-" for user to decide or a number
    unit: z.string(),
    rate: z.number().nullish(),
    amount: z.number().nullish()
  })).nullish(),

  // Custom Scope of Work items (optional override)
  customCompanyScopeItems: z.record(z.array(z.string())).nullish(), // Key: projectIndex, Value: array of scope items
  customCustomerScopeItems: z.record(z.array(z.string())).nullish(), // Key: projectIndex, Value: array of scope items

  // Pricing and financial details
  totalSystemCost: z.number().min(0),
  totalSubsidyAmount: z.number().min(0).default(0),
  totalCustomerPayment: z.number().min(0),
  advancePaymentPercentage: z.number().min(0).max(100).default(90),
  advanceAmount: z.number().min(0),
  balanceAmount: z.number().min(0),

  // Terms and delivery
  paymentTerms: z.enum(paymentTerms).default("advance_90_balance_10"),
  deliveryTimeframe: z.enum(deliveryTimeframes).default("2_3_weeks"),
  termsTemplate: z.enum(termsTemplates).default("standard"),
  customTerms: z.string().nullish(),

  // Status and approval workflow
  status: z.enum(quotationStatuses).default("draft"),

  // Follow-up and communication tracking
  followUps: z.array(quotationFollowUpSchema).default([]),
  lastFollowUpDate: z.date().nullish(),
  nextFollowUpDate: z.date().nullish(),

  // Document and communication preferences
  communicationPreference: z.enum(["email", "whatsapp", "sms", "print"]).default("whatsapp"),
  documentVersion: z.number().default(1),

  // Administrative fields
  preparedBy: z.string(),
  refName: z.string().nullish(), // Reference name for "Discussion with" in PDF - defaults to preparedBy if not set
  contactPerson: z.string().default("Godiva Solar Management"),
  contactNumber: z.string().default("+91 99949 01500"),
  approvedBy: z.string().nullish(),
  approvedAt: z.date().nullish(),
  sentAt: z.date().nullish(),
  validUntil: z.date().nullish(),

  // Additional notes and attachments
  internalNotes: z.string().nullish(),
  customerNotes: z.string().nullish(),
  attachments: z.array(z.string().url()).default([]),

  // Account Details for payment
  accountDetails: z.object({
    bankName: z.string().default("State Bank of India"),
    accountNumber: z.string().default("31746205818"),
    ifscCode: z.string().default("SBIN0001766"),
    accountHolderName: z.string().default("Godiva Solar"),
    branch: z.string().default("Madurai Main Branch")
  }).nullish(),

  // Physical Damage Exclusions
  physicalDamageExclusions: z.object({
    enabled: z.boolean().default(true),
    disclaimerText: z.string().default("***Physical Damages will not be Covered***")
  }).nullish(),

  // Detailed Warranty Terms
  detailedWarrantyTerms: z.object({
    solarPanels: z.object({
      manufacturingDefect: z.string().default("15 Years Manufacturing defect Warranty"),
      serviceWarranty: z.string().default("15 Years Service Warranty"),
      performanceWarranty: z.array(z.string()).default([
        "90% Performance Warranty till the end of 15 years",
        "80% Performance Warranty till the end of 25 years"
      ])
    }).nullish(),
    inverter: z.object({
      replacementWarranty: z.string().default("Replacement Warranty for 10 Years"),
      serviceWarranty: z.string().default("Service Warranty for 5 Years")
    }).nullish(),
    installation: z.object({
      warrantyPeriod: z.string().default("2 Years Installation Warranty"),
      serviceWarranty: z.string().default("Complete service support during warranty period")
    }).nullish()
  }).nullish(),

  // Document Requirements for Subsidy
  documentRequirements: z.object({
    subsidyDocuments: z.array(z.string()).default([
      "Aadhar Card",
      "EB Bill (Last 3 Months)",
      "House Tax Receipt",
      "Land Patta",
      "Building Plan Approval",
      "Fire NOC (for Commercial)",
      "Pollution NOC (for Commercial)",
      "Bank Passbook",
      "Cancelled Cheque"
    ]),
    note: z.string().default("All Required Documents should be in the same name as mentioned in the EB Service Number.")
  }).nullish(),

  // EB Sanction fields (Electricity Board requirements - quotation-specific)
  tariffCode: z.string().nullish(),
  ebSanctionPhase: z.enum(["1_phase", "3_phase"]).nullish(),
  ebSanctionKW: z.number().min(0, "EB Sanction KW must be a positive number").nullish(),

  // Revision History Tracking
  revisionHistory: z.array(z.object({
    version: z.number(),
    updatedAt: z.date(),
    updatedBy: z.string(),
    changeNote: z.string().nullish()
  })).nullish().default([]),

  // Metadata
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date())
});

// Type definitions for quotation system
export type QuotationSource = typeof quotationSources[number];
export type QuotationStatus = typeof quotationStatuses[number];
export type QuotationProjectType = typeof quotationProjectTypes[number];
export type TermsTemplate = typeof termsTemplates[number];
export type PaymentTerms = typeof paymentTerms[number];
export type DeliveryTimeframe = typeof deliveryTimeframes[number];
export type WarrantyPeriod = typeof warrantyPeriods[number];
export type PricingMode = typeof pricingModes[number];
export type SubsidyType = typeof subsidyTypes[number];

export type QuotationOnGridProject = z.infer<typeof quotationOnGridProjectSchema>;
export type QuotationOffGridProject = z.infer<typeof quotationOffGridProjectSchema>;
export type QuotationHybridProject = z.infer<typeof quotationHybridProjectSchema>;
export type QuotationWaterHeaterProject = z.infer<typeof quotationWaterHeaterProjectSchema>;
export type QuotationWaterPumpProject = z.infer<typeof quotationWaterPumpProjectSchema>;
export type QuotationProject = z.infer<typeof quotationProjectSchema>;
export type SiteVisitMapping = z.infer<typeof siteVisitMappingSchema>;
export type QuotationFollowUp = z.infer<typeof quotationFollowUpSchema>;
export type InsertQuotation = z.infer<typeof insertQuotationSchema>;
export type UpdateQuotation = z.infer<typeof updateQuotationSchema>;

export interface Quotation extends InsertQuotation {
  id: string;
}

// Create insert schema from drizzle-zod (for API validation)
export const createInsertQuotationSchema = insertQuotationSchema;

// Update quotation schema - excludes immutable fields
export const updateQuotationSchema = insertQuotationSchema.omit({
  quotationNumber: true,  // Can't change quotation number
  customerId: true,       // Can't change customer
  createdAt: true,        // Can't change creation date
  source: true,           // Can't change original source
  siteVisitMapping: true, // Can't change original site visit mapping
  documentVersion: true,  // Server-controlled, auto-incremented
  revisionHistory: true   // Server-controlled, managed automatically
}).extend({
  // updatedAt will be set server-side automatically
  updatedAt: z.date().nullish()
});

// ================================
// LEAVE MANAGEMENT SYSTEM SCHEMAS
// ================================

// Leave types
export const leaveTypes = [
  "casual_leave",    // Monthly 1 day leave
  "permission",      // Monthly 2 hours permission
  "unpaid_leave"     // Any additional leave (unpaid)
] as const;

// Leave statuses for Employee → Reporting Manager → HR workflow
export const leaveStatuses = [
  "pending_manager",    // Waiting for Reporting Manager approval
  "pending_hr",         // Manager approved, waiting for HR
  "approved",           // Fully approved by HR
  "rejected_by_manager", // Rejected by Reporting Manager
  "rejected_by_hr",     // Rejected by HR
  "cancelled"           // Cancelled by employee
] as const;

// Fixed holidays for the year
export const FIXED_ANNUAL_HOLIDAYS = [
  { name: "May Day", month: 5, day: 1 },
  { name: "Independence Day", month: 8, day: 15 },
  { name: "Gandhi Jayanti", month: 10, day: 2 },
  { name: "Republic Day", month: 1, day: 26 }
] as const;

// Leave Balance Schema - Monthly allocation tracking
export const insertLeaveBalanceSchema = z.object({
  userId: z.string(),
  employeeId: z.string(),

  // Monthly balances (reset every month)
  casualLeaveBalance: z.number().default(1),        // 1 per month
  permissionHoursBalance: z.number().default(2),    // 2 hours per month

  // Used balances (current month)
  casualLeaveUsed: z.number().default(0),
  permissionHoursUsed: z.number().default(0),

  // Period tracking
  year: z.number(),
  month: z.number().min(1).max(12),

  // History
  casualLeaveHistory: z.array(z.object({
    date: z.date(),
    days: z.number(),
    leaveId: z.string()
  })).default([]),

  permissionHistory: z.array(z.object({
    date: z.date(),
    hours: z.number(),
    leaveId: z.string()
  })).default([]),

  // Metadata
  lastResetDate: z.date(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date())
});

export type InsertLeaveBalance = z.infer<typeof insertLeaveBalanceSchema>;

export interface LeaveBalance extends InsertLeaveBalance {
  id: string;
}

// Leave Application Schema - Employee → Reporting Manager → HR workflow
export const insertLeaveApplicationSchema = z.object({
  // Employee details
  userId: z.string(),
  employeeId: z.string(),
  userName: z.string(),
  userDepartment: z.enum(departments).nullable(),
  userDesignation: z.enum(designations).nullable(),

  // Leave details
  leaveType: z.enum(leaveTypes),

  // For casual_leave and unpaid_leave
  startDate: z.date().nullish(),
  endDate: z.date().nullish(),
  totalDays: z.number().min(0).nullish(),

  // For permission (2 hours)
  permissionDate: z.date().nullish(),
  permissionStartTime: z.string().nullish(),  // Format: "09:00 AM"
  permissionEndTime: z.string().nullish(),    // Format: "11:00 AM"
  permissionHours: z.number().min(0).max(2).nullish(),

  // Common fields
  reason: z.string().min(10, "Reason must be at least 10 characters"),

  // Approval workflow - Employee → Reporting Manager → HR
  status: z.enum(leaveStatuses).default("pending_manager"),

  // Reporting Manager approval
  reportingManagerId: z.string().nullable(),
  reportingManagerName: z.string().nullish(),
  managerApprovedAt: z.date().nullish(),
  managerApprovedBy: z.string().nullish(),
  managerRemarks: z.string().nullish(),

  // HR approval
  hrApprovedAt: z.date().nullish(),
  hrApprovedBy: z.string().nullish(),
  hrRemarks: z.string().nullish(),

  // Rejection handling
  rejectedAt: z.date().nullish(),
  rejectedBy: z.string().nullish(),
  rejectionReason: z.string().nullish(),

  // Balance validation (snapshot at time of application)
  balanceAtApplication: z.object({
    casualLeaveAvailable: z.number(),
    permissionHoursAvailable: z.number()
  }).nullish(),

  // Payroll impact (for unpaid leaves)
  affectsPayroll: z.boolean().default(false),
  deductionAmount: z.number().default(0),

  // Metadata
  applicationDate: z.date().default(() => new Date()),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date())
});

export type InsertLeaveApplication = z.infer<typeof insertLeaveApplicationSchema>;

export interface LeaveApplication extends InsertLeaveApplication {
  id: string;
}

// Fixed Holidays Schema
export const insertFixedHolidaySchema = z.object({
  name: z.string(),
  date: z.date(),
  year: z.number(),

  // Holiday types
  type: z.enum(["national", "company", "regional"]).default("national"),
  isPaid: z.boolean().default(true),
  isOptional: z.boolean().default(false),

  // OT Policy - Controls whether OT can be submitted on this holiday
  // Note: OT rate is calculated from employee salary (monthly salary / working days / working hours)
  // No need to store multiplier per-holiday - that's a payroll setting, not holiday config
  allowOT: z.boolean().default(false), // Safe default: block OT on holidays

  // Applicability
  applicableDepartments: z.array(z.enum(departments)).nullish(), // null = all departments

  description: z.string().nullish(),
  createdBy: z.string(),
  createdAt: z.date().default(() => new Date())
});

export type InsertFixedHoliday = z.infer<typeof insertFixedHolidaySchema>;

export interface FixedHoliday extends InsertFixedHoliday {
  id: string;
}

// Type exports for leave management
export type LeaveType = typeof leaveTypes[number];
export type LeaveStatus = typeof leaveStatuses[number];



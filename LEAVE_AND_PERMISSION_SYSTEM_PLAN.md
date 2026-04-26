# Leave and Permission Management System - Implementation Plan

## Document Version
**Version:** 1.2 (Updated - Reporting Manager Approach)  
**Date:** September 30, 2025  
**Status:** Planning Phase  
**Note:** Updated to use simple Reporting Manager workflow instead of Team Lead/designation-based approach.

---

## 1. SYSTEM OVERVIEW

### 1.1 Purpose
Design and implement a comprehensive Leave and Permission Management System for Prakash Greens Energy that handles leave applications, approvals, and balance tracking across all departments.

### 1.2 Key Requirements
- **Multi-level Approval Workflow**: Employee → Reporting Manager → HR
  - Uses `reportingManagerId` field (set manually in User Management)
  - Simple 3-person approval chain for 20-25 employee company
- **Leave Types**:
  - Monthly Casual Leave: 1 day per employee per month
  - Monthly Permission: 2 hours per employee per month (flexible timing)
- **Fixed Annual Holidays** (Paid, not deducted from salary):
  - May 1 (May Day)
  - October 2 (Gandhi Jayanti)
  - January 26 (Republic Day)
  - August 15 (Independence Day)
- **Weekly Holidays**: Every Sunday (already in system)
- **Visibility**: Clear leave balance display for employees and approvers
- **Payroll Integration**: System should connect with existing payroll for deductions
- **Reporting Manager Setup**: Admin assigns reporting manager to each employee via User Management UI

---

## 2. CURRENT SYSTEM ANALYSIS

### 2.1 What Already Exists ✅

#### **Pages & Navigation**
- ✅ `/leave` page exists at `client/src/pages/leave.tsx`
  - Basic table with search functionality
  - "Apply Leave" button (UI only, not functional)
  - **Status: Needs major enhancement**
- ✅ Sidebar navigation has "Leave Management" menu item (line 82-86 in `sidebar.tsx`)
- ✅ Route already configured in `App.tsx` with leave permissions

#### **Database & Backend**
- ✅ Basic leave schema exists in `server/storage.ts` (lines 95-101):
  ```typescript
  insertLeaveSchema = {
    userId, startDate, endDate, reason,
    status: "pending" | "approved" | "rejected"
  }
  ```
  - **Status: Needs enhancement for Manager/HR workflow**
  
- ✅ Basic storage methods exist:
  - `createLeave()` - Line 2469
  - `updateLeave()` - Line 2494  
  - `getLeave()` - Available
  - `listLeaves()` - Available

- ✅ Basic API endpoints exist in `server/routes.ts`:
  - `GET /api/leaves` - Line 3788 (with filters)
  - `GET /api/leaves/:id` - Line 3827
  - `POST /api/leaves` - Line 3850
  - `PATCH /api/leaves/:id` - Line 3871

#### **User Management & Hierarchy**
- ✅ User model has all required fields:
  - `reportingManagerId` - To identify Reporting Manager (field exists, nullable)
  - `department`, `designation` - For role-based access
  - HR department exists

- 🔨 **Needs Enhancement**: User Management UI
  - `reportingManagerId` field exists in schema but NOT in UI
  - Need to add "Reporting Manager" dropdown in edit user dialog (`client/src/pages/user-management.tsx`)

- ✅ Leave permissions already defined:
  - `leave.view_own`, `leave.view_team`, `leave.view_all`
  - `leave.request`, `leave.approve`, `leave.reject`, `leave.cancel`

#### **Reusable Components Available**
- ✅ Dashboard components:
  - `pending-approvals-card.tsx` - Can be used for leave approvals
  - `stats-card.tsx` - For leave statistics
  - `attendance-card.tsx` - Reference for balance widget
  
- ✅ UI components (Shadcn):
  - All form components (input, select, date-picker, time-input)
  - Dialog, Card, Table, Badge, Tabs
  - Calendar component available

#### **Integration Points Ready**
- ✅ Attendance System - Check-in/out tracking, working hours
- ✅ Payroll System - Monthly processing, EPF/ESI, deductions
- ✅ Sunday holiday tracking (day 0 in system)
- ✅ Enterprise RBAC permission system

### 2.2 What Needs to Be Built 🔨

#### **Database Schema Enhancements**
1. 🔨 **New: Leave Balance Collection** (doesn't exist)
   - Monthly balance tracking (1 CL, 2h permission)
   - Usage history
   - Auto-reset logic


3. 🔨 **New: Fixed Holidays Collection** (doesn't exist)
   - Annual holidays (May 1, Oct 2, Jan 26, Aug 15)
   - Holiday management

#### **Backend Services to Create**
1. 🔨 `server/services/leave-balance-service.ts` - New file
   - Monthly balance reset
   - Balance calculations
   - History management

2. 🔨 `server/services/leave-service.ts` - New file
   - Application validation
   - TL/HR approval workflow
   - Payroll integration

3. 🔨 Enhanced storage methods in `server/storage.ts`:
   - `getLeaveBalance()`, `updateLeaveBalance()`, `createLeaveBalance()`
   - `approveLeaveTL()`, `approveLeaveHR()`, `rejectLeave()`
   - `getFixedHolidays()`, `createFixedHoliday()`

#### **API Enhancements Needed**
1. 🔨 New endpoints in `server/routes.ts`:
   - `GET /api/leave-balance/:userId` - Current balance
   - `GET /api/leave-balance/team/:tlUserId` - Team balances
   - `GET /api/leave-balance/all` - All balances (HR)
   - `PUT /api/leaves/:id/approve-tl` - TL approval
   - `PUT /api/leaves/:id/approve-hr` - HR approval
   - `PUT /api/leaves/:id/reject-tl` - TL rejection
   - `PUT /api/leaves/:id/reject-hr` - HR rejection
   - `GET /api/holidays` - Fixed holidays

#### **Frontend Components to Create**
1. 🔨 New folder: `client/src/components/leave/`
   - `leave-application-form.tsx` - Multi-step form
   - `leave-balance-widget.tsx` - Dashboard widget
   - `leave-history-table.tsx` - User history
   - `tl-approval-list.tsx` - Team Lead approvals
   - `hr-approval-list.tsx` - HR approvals
   - `leave-calendar-view.tsx` - Calendar visualization
   - `permission-time-picker.tsx` - 2-hour time picker

2. 🔨 Page enhancements:
   - `client/src/pages/leave.tsx` - Add tabs, forms, approvals
   - `client/src/pages/dashboard.tsx` - Add leave widgets

### 2.3 Integration Strategy
1. **Attendance System**: Verify employee presence before leave approval
2. **Payroll System**: Calculate deductions for unpaid leaves using existing perDaySalary
3. **User Hierarchy**: Use reportingManagerId to identify Team Lead
4. **Permission System**: Leverage existing RBAC for feature access

---

## 3. DATABASE SCHEMA DESIGN

### 3.1 Leave Balance Schema
```typescript
export const insertLeaveBalanceSchema = z.object({
  userId: z.string(),
  employeeId: z.string(),
  
  // Monthly balances (reset every month)
  casualLeaveBalance: z.number().default(1),        // 1 per month
  permissionHoursBalance: z.number().default(2),    // 2 hours per month
  
  // Used balances (current month)
  casualLeaveUsed: z.number().default(0),
  permissionHoursUsed: z.number().default(0),
  
  // Annual tracking
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
```

### 3.2 Leave Application Schema
```typescript
export const leaveTypes = [
  "casual_leave",      // Monthly 1 day leave
  "permission",        // Monthly 2 hours permission
  "unpaid_leave"       // Any additional leave (unpaid)
] as const;

export const leaveStatuses = [
  "pending_tl",        // Waiting for Team Lead approval
  "pending_hr",        // TL approved, waiting for HR
  "approved",          // Fully approved by HR
  "rejected_by_tl",    // Rejected by Team Lead
  "rejected_by_hr",    // Rejected by HR
  "cancelled"          // Cancelled by employee
] as const;

export const insertLeaveApplicationSchema = z.object({
  // Employee details
  userId: z.string(),
  employeeId: z.string(),
  userName: z.string(),
  userDepartment: z.enum(departments),
  userDesignation: z.enum(designations),
  
  // Leave details
  leaveType: z.enum(leaveTypes),
  
  // For casual_leave and unpaid_leave
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  totalDays: z.number().min(0).optional(),
  
  // For permission (2 hours)
  permissionDate: z.date().optional(),
  permissionStartTime: z.string().optional(),  // 12-hour format
  permissionEndTime: z.string().optional(),    // 12-hour format
  permissionHours: z.number().min(0).max(2).optional(),
  
  // Common fields
  reason: z.string().min(10, "Reason must be at least 10 characters"),
  
  // Approval workflow
  status: z.enum(leaveStatuses).default("pending_tl"),
  
  // Team Lead approval
  reportingManagerId: z.string(),              // TL's user ID
  reportingManagerName: z.string().optional(),
  tlApprovedAt: z.date().optional(),
  tlApprovedBy: z.string().optional(),
  tlRemarks: z.string().optional(),
  
  // HR approval
  hrApprovedAt: z.date().optional(),
  hrApprovedBy: z.string().optional(),
  hrRemarks: z.string().optional(),
  
  // Rejection handling
  rejectedAt: z.date().optional(),
  rejectedBy: z.string().optional(),
  rejectionReason: z.string().optional(),
  
  // Balance validation (snapshot at time of application)
  balanceAtApplication: z.object({
    casualLeaveAvailable: z.number(),
    permissionHoursAvailable: z.number()
  }).optional(),
  
  // Payroll impact (for unpaid leaves)
  affectsPayroll: z.boolean().default(false),
  deductionAmount: z.number().default(0),
  
  // Metadata
  applicationDate: z.date().default(() => new Date()),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date())
});
```

### 3.3 Fixed Holidays Schema
```typescript
export const insertFixedHolidaySchema = z.object({
  name: z.string(),
  date: z.date(),
  year: z.number(),
  
  // Holiday types
  type: z.enum(["national", "company", "regional"]).default("national"),
  isPaid: z.boolean().default(true),
  isOptional: z.boolean().default(false),
  
  // Applicability
  applicableDepartments: z.array(z.enum(departments)).optional(), // null = all departments
  
  description: z.string().optional(),
  createdBy: z.string(),
  createdAt: z.date().default(() => new Date())
});

// Pre-configured fixed holidays
export const FIXED_ANNUAL_HOLIDAYS = [
  { name: "May Day", month: 5, day: 1 },
  { name: "Independence Day", month: 8, day: 15 },
  { name: "Gandhi Jayanti", month: 10, day: 2 },
  { name: "Republic Day", month: 1, day: 26 }
];
```

---

## 4. APPROVAL WORKFLOW DESIGN

### 4.1 Leave Application Flow

```
EMPLOYEE APPLIES LEAVE
        ↓
    [Validation]
    - Check balance availability
    - Verify dates (no overlap with existing leaves)
    - Ensure not a Sunday/Fixed holiday
        ↓
Status: pending_tl
        ↓
TEAM LEAD REVIEWS
    ├─→ APPROVE → Status: pending_hr → Go to HR
    └─→ REJECT  → Status: rejected_by_tl → End
        ↓
HR REVIEWS
    ├─→ APPROVE → Status: approved → Update balance → End
    └─→ REJECT  → Status: rejected_by_hr → End
```

### 4.2 Workflow Rules

**Team Lead (TL) Approval**
- TL can approve/reject leave for team members where TL = reportingManagerId
- TL sees leave applications with status: pending_tl
- Can view team member's leave balance and history
- Can add remarks/comments
- Designation level must be >= 6 (Team Leader)

**HR Approval**
- HR reviews all leaves with status: pending_hr
- Final approval authority
- Can override TL decision (reject even if TL approved)
- Can view all employees' leave balance across departments
- Must be from HR department

**Employee Actions**
- Can cancel leave if status = pending_tl or pending_hr
- Cannot cancel if status = approved (must apply new leave or contact HR)
- Can view own leave history and balance

### 4.3 Balance Deduction Logic

**On HR Approval (status → approved):**
1. **Casual Leave**: Deduct from casualLeaveBalance
   - If balance = 0, convert to unpaid_leave
2. **Permission**: Deduct from permissionHoursBalance
   - If balance < requested hours, reject or convert remaining to unpaid
3. **Unpaid Leave**: Calculate payroll deduction
   - perDaySalary = (Monthly Salary / 26 working days)
   - deduction = perDaySalary × days

---

## 5. LEAVE BALANCE MANAGEMENT

### 5.1 Monthly Reset Logic
```javascript
// Run on 1st of every month (cron job or scheduled function)
async function resetMonthlyLeaveBalance() {
  const allEmployees = await getAllActiveEmployees();
  
  for (const employee of allEmployees) {
    await createOrUpdateBalance({
      userId: employee.uid,
      employeeId: employee.employeeId,
      casualLeaveBalance: 1,
      permissionHoursBalance: 2,
      casualLeaveUsed: 0,
      permissionHoursUsed: 0,
      year: currentYear,
      month: currentMonth,
      lastResetDate: new Date()
    });
  }
}
```

### 5.2 Balance Carry Forward Rules
- **NO CARRY FORWARD**: Unused casual leaves and permission hours do NOT carry to next month
- Fresh allocation on 1st of each month
- History is maintained for reporting purposes

### 5.3 Leave Balance Calculation
```javascript
function getAvailableBalance(userId, month, year) {
  const balance = await getLeaveBalance(userId, month, year);
  
  return {
    casualLeave: {
      allocated: 1,
      used: balance.casualLeaveUsed,
      available: balance.casualLeaveBalance - balance.casualLeaveUsed
    },
    permission: {
      allocated: 2,
      used: balance.permissionHoursUsed,
      available: balance.permissionHoursBalance - balance.permissionHoursUsed
    }
  };
}
```

---

## 6. API ENDPOINTS DESIGN

### 6.1 Leave Balance APIs
```
GET    /api/leave-balance/:userId              - Get current month balance
GET    /api/leave-balance/:userId/history      - Get balance history
GET    /api/leave-balance/team/:tlUserId       - Get team's balances (for TL)
GET    /api/leave-balance/all                  - Get all balances (for HR)
POST   /api/leave-balance/reset                - Manual reset (admin only)
```

### 6.2 Leave Application APIs
```
POST   /api/leaves/apply                       - Apply new leave
GET    /api/leaves/my                          - Get own leave applications
GET    /api/leaves/pending-tl/:tlUserId        - Get leaves pending TL approval
GET    /api/leaves/pending-hr                  - Get leaves pending HR approval
GET    /api/leaves/:leaveId                    - Get leave details
PUT    /api/leaves/:leaveId/approve-tl         - TL approves leave
PUT    /api/leaves/:leaveId/reject-tl          - TL rejects leave
PUT    /api/leaves/:leaveId/approve-hr         - HR approves leave
PUT    /api/leaves/:leaveId/reject-hr          - HR rejects leave
PUT    /api/leaves/:leaveId/cancel             - Employee cancels leave
GET    /api/leaves/team/:tlUserId              - Get team leave history (for TL)
GET    /api/leaves/all                         - Get all leaves (for HR)
```

### 6.3 Fixed Holidays APIs
```
GET    /api/holidays                           - Get current year holidays
GET    /api/holidays/:year                     - Get specific year holidays
POST   /api/holidays                           - Create holiday (admin only)
PUT    /api/holidays/:id                       - Update holiday (admin only)
DELETE /api/holidays/:id                       - Delete holiday (admin only)
```

---

## 7. FRONTEND UI/UX DESIGN

### 7.1 Employee Dashboard Widget
```
┌─────────────────────────────────────┐
│  📅 My Leave Balance (September)    │
├─────────────────────────────────────┤
│  Casual Leave:    [▓▓▓▓▓░░░░░] 1/1  │
│  Permission:      [▓▓▓▓░░░░░░] 2/2h │
│                                      │
│  [Apply Leave] [View History]       │
└─────────────────────────────────────┘
```

### 7.2 Leave Application Form
```
┌─────────────────────────────────────────┐
│  Apply Leave                            │
├─────────────────────────────────────────┤
│                                          │
│  Leave Type: ○ Casual Leave (1 day)     │
│              ○ Permission (max 2 hours) │
│              ○ Unpaid Leave             │
│                                          │
│  [If Casual/Unpaid Leave]               │
│  Start Date:  [Date Picker]             │
│  End Date:    [Date Picker]             │
│  Total Days:  [Auto Calculate]          │
│                                          │
│  [If Permission]                        │
│  Date:        [Date Picker]             │
│  Start Time:  [Time Picker - 12h]       │
│  End Time:    [Time Picker - 12h]       │
│  Duration:    [Auto Calculate] hours    │
│                                          │
│  Reason:      [Text Area - Required]    │
│                                          │
│  Your Balance:                          │
│  - Casual Leave: 1 available            │
│  - Permission: 2 hours available        │
│                                          │
│  [Cancel]          [Submit Application] │
└─────────────────────────────────────────┘
```

### 7.3 Team Lead Approval Interface
```
┌──────────────────────────────────────────────┐
│  Pending Leave Approvals (5)                 │
├──────────────────────────────────────────────┤
│  ┌──────────────────────────────────────┐   │
│  │ Rajesh Kumar - Casual Leave          │   │
│  │ Sep 25, 2025 (1 day)                 │   │
│  │ Reason: Family function              │   │
│  │                                       │   │
│  │ Balance: CL: 1/1 | Permission: 2/2h  │   │
│  │ History: 0 leaves this month         │   │
│  │                                       │   │
│  │ Remarks: [Optional text field]       │   │
│  │ [Approve] [Reject]                   │   │
│  └──────────────────────────────────────┘   │
│                                               │
│  [Show More...]                              │
└──────────────────────────────────────────────┘
```

### 7.4 HR Final Approval Interface
```
┌──────────────────────────────────────────────┐
│  Leave Approvals - HR Review                 │
├──────────────────────────────────────────────┤
│  Status: TL Approved, Pending HR             │
│                                               │
│  ┌──────────────────────────────────────┐   │
│  │ Priya Sharma - Permission            │   │
│  │ Marketing Dept - CRE                 │   │
│  │ Sep 28, 2025 (2:00 PM - 4:00 PM)     │   │
│  │ Reason: Doctor appointment           │   │
│  │                                       │   │
│  │ TL Approval: ✓ Approved by Suresh    │   │
│  │ TL Remarks: Medical emergency        │   │
│  │                                       │   │
│  │ Current Balance:                     │   │
│  │ - Casual Leave: 1/1 available        │   │
│  │ - Permission: 2/2 hours available    │   │
│  │                                       │   │
│  │ September History:                   │   │
│  │ - 1 permission taken (2h on Sep 10)  │   │
│  │ - 0 casual leaves taken              │   │
│  │                                       │   │
│  │ HR Remarks: [Optional]               │   │
│  │ [Approve] [Reject]                   │   │
│  └──────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

### 7.5 Leave History & Balance View
```
┌─────────────────────────────────────────────┐
│  My Leave History - 2025                    │
├─────────────────────────────────────────────┤
│                                              │
│  [September ▼]                              │
│                                              │
│  Balance Summary:                           │
│  ┌─────────────────────────────────────┐   │
│  │ Casual Leave:    1 allocated        │   │
│  │                  0 used              │   │
│  │                  1 available         │   │
│  │                                      │   │
│  │ Permission:      2 hours allocated  │   │
│  │                  0 hours used        │   │
│  │                  2 hours available   │   │
│  └─────────────────────────────────────┘   │
│                                              │
│  Applications:                              │
│  ┌─────────────────────────────────────┐   │
│  │ Sep 15 | Casual Leave | 1 day       │   │
│  │ Status: Approved ✓                  │   │
│  │ Reason: Personal work               │   │
│  └─────────────────────────────────────┘   │
│                                              │
│  ┌─────────────────────────────────────┐   │
│  │ Sep 5  | Permission | 1.5 hours     │   │
│  │ Status: Approved ✓                  │   │
│  │ Reason: Bank work                   │   │
│  └─────────────────────────────────────┘   │
│                                              │
└─────────────────────────────────────────────┘
```

---

## 8. VALIDATION & BUSINESS RULES

### 8.1 Application Validation Rules
1. **Date Validations**
   - Start date cannot be in the past
   - End date must be >= start date
   - Cannot apply leave for Sundays (already holiday)
   - Cannot apply leave for fixed holidays (May 1, Oct 2, Jan 26, Aug 15)
   - No overlapping leave applications

2. **Balance Validations**
   - Casual leave: Must have available balance
   - Permission: Cannot exceed 2 hours in a day, must have available balance
   - Unpaid leave: No balance check, but warn user about salary deduction

3. **Timing Validations (Permission)**
   - Permission duration must be <= 2 hours
   - Permission time must be within working hours
   - Cannot take permission during check-in/check-out times

### 8.2 Approval Validation Rules
1. **Team Lead Approval**
   - Can only approve for direct reports (reportingManagerId matches)
   - Must have designation level >= 6
   - Must provide remarks for rejection

2. **HR Approval**
   - Must be from HR department
   - Must review all pending_hr applications
   - Can reject even if TL approved (with mandatory reason)

### 8.3 Cancellation Rules
- Employee can cancel if status = pending_tl or pending_hr
- After approval, employee must contact HR directly
- TL/HR can cancel approved leaves with remarks

---

## 9. PAYROLL INTEGRATION

### 9.1 Leave Deduction Calculation
```javascript
async function calculateLeaveDeduction(userId, month, year) {
  const leaves = await getApprovedLeaves(userId, month, year);
  const unpaidLeaves = leaves.filter(l => 
    l.leaveType === 'unpaid_leave' || 
    (l.leaveType === 'casual_leave' && l.affectsPayroll)
  );
  
  const salaryStructure = await getSalaryStructure(userId);
  const perDaySalary = calculatePerDaySalary(salaryStructure);
  
  const totalUnpaidDays = unpaidLeaves.reduce((sum, leave) => 
    sum + leave.totalDays, 0
  );
  
  return {
    unpaidDays: totalUnpaidDays,
    deductionAmount: perDaySalary * totalUnpaidDays,
    affectedLeaves: unpaidLeaves.map(l => l.id)
  };
}

function calculatePerDaySalary(salaryStructure) {
  const { perDaySalaryBase, fixedBasic, fixedHRA } = salaryStructure;
  
  switch (perDaySalaryBase) {
    case 'basic':
      return fixedBasic / 26;
    case 'basic_hra':
      return (fixedBasic + fixedHRA) / 26;
    case 'gross':
      const gross = fixedBasic + fixedHRA + fixedConveyance;
      return gross / 26;
  }
}
```

### 9.2 Payroll Display
In monthly payroll slip:
```
DEDUCTIONS:
- EPF:                ₹1,800
- ESI:                ₹150
- Leave Deduction:    ₹1,200  (2 days unpaid)
                      -------
Total Deductions:     ₹3,150
```

---

## 10. NOTIFICATION SYSTEM

### 10.1 Email/In-App Notifications

**On Leave Application**
- To Employee: "Your leave application has been submitted"
- To TL: "New leave application from [Name] requires your approval"

**On TL Approval**
- To Employee: "Your leave has been approved by your Team Lead"
- To HR: "New leave application from [Name] requires HR approval"

**On TL Rejection**
- To Employee: "Your leave has been rejected by Team Lead. Reason: [...]"

**On HR Approval (Final)**
- To Employee: "Your leave has been approved. Balance updated."
- To TL: "Leave for [Name] has been approved by HR"

**On HR Rejection**
- To Employee: "Your leave has been rejected by HR. Reason: [...]"
- To TL: "Leave for [Name] has been rejected by HR"

**Monthly Balance Reset**
- To All Employees: "Your leave balance has been refreshed for [Month]"

---

## 11. REPORTING & ANALYTICS

### 11.1 Leave Reports

**Team Lead Dashboard**
- Team leave calendar view
- Pending approvals count
- Team members on leave today
- Most common leave reasons

**HR Dashboard**
- Department-wise leave statistics
- Leave trend analysis (monthly/yearly)
- Employees with high absenteeism
- Leave balance summary for all employees
- Unpaid leave impact on payroll

**Sample Report Query**
```javascript
async function getLeaveStatistics(month, year, department) {
  return {
    totalApplications: count,
    approved: approvedCount,
    rejected: rejectedCount,
    pending: pendingCount,
    casualLeavesTaken: casualCount,
    permissionsTaken: permissionCount,
    unpaidLeavesTaken: unpaidCount,
    avgProcessingTime: avgTime,
    departmentWise: {
      [dept]: { applications, approved, rejected }
    }
  };
}
```

---

## 12. TECHNICAL IMPLEMENTATION PLAN

### 12.1 Backend Implementation (server/)

**Phase 1: Schema & Storage (Week 1)**
1. Add leave schemas to `shared/schema.ts`
2. Update `server/storage.ts` interface for leave operations
3. Implement Firestore collections:
   - `leave_balances`
   - `leave_applications`
   - `fixed_holidays`

**Phase 2: Services (Week 1)**
1. Create `server/services/leave-service.ts`
   - Balance management
   - Leave application logic
   - Approval workflow
2. Create `server/services/leave-balance-service.ts`
   - Monthly reset logic
   - Balance calculation
   - History tracking

**Phase 3: API Routes (Week 2)**
1. Add routes to `server/routes.ts`
2. Implement all leave APIs
3. Add permission middleware checks
4. Integrate with existing auth system

**Phase 4: Payroll Integration (Week 2)**
1. Update payroll service to include leave deductions
2. Modify payroll calculation to account for unpaid leaves
3. Add leave details to payroll slip

### 12.2 Frontend Implementation (client/)

**Phase 1: UI Components (Week 2)**
1. Create `client/src/components/leave/` directory
   - LeaveApplicationForm.tsx
   - LeaveBalanceWidget.tsx
   - LeaveHistoryTable.tsx
   - TLApprovalList.tsx
   - HRApprovalList.tsx

**Phase 2: Pages (Week 3)**
1. Update `client/src/pages/leave.tsx` with full functionality
2. Add leave widgets to dashboard
3. Integrate with TL and HR dashboards

**Phase 3: Integration (Week 3)**
1. Connect with TanStack Query for data fetching
2. Add real-time updates for approval workflow
3. Implement notifications

### 12.3 Automated Tasks

**Scheduled Jobs**
1. **Monthly Balance Reset** (1st of every month at 12:01 AM)
   ```javascript
   cron.schedule('1 0 1 * *', resetMonthlyLeaveBalance);
   ```

2. **Holiday Setup** (January 1st every year)
   ```javascript
   cron.schedule('0 0 1 1 *', setupAnnualHolidays);
   ```

3. **Leave Reminder** (Every Monday 9 AM)
   ```javascript
   cron.schedule('0 9 * * 1', sendWeeklyLeaveReminder);
   ```

---

## 13. SECURITY & PERMISSIONS

### 13.1 Access Control Matrix

| Role | Apply Leave | View Own | View Team | Approve TL | Approve HR | View All | Cancel Own | Cancel Any |
|------|-------------|----------|-----------|------------|------------|----------|------------|------------|
| Employee | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| Team Lead (TL) | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ (team) |
| HR | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ (all) |
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

### 13.2 Data Privacy
- Employees can only see their own leave data
- TL can see team member data only
- HR has full visibility
- Leave reasons are visible only to approvers and the applicant
- Audit log for all approval/rejection actions

---

## 14. TESTING STRATEGY

### 14.1 Unit Tests
- Leave balance calculation
- Date validations
- Approval workflow logic
- Payroll deduction calculation

### 14.2 Integration Tests
- Leave application → TL approval → HR approval flow
- Balance update on approval
- Payroll integration
- Monthly reset job

### 14.3 User Acceptance Testing
- Employee: Apply and track leave
- Team Lead: Approve team leaves with balance visibility
- HR: Final approval and reporting
- Admin: System configuration

---

## 15. MIGRATION & DEPLOYMENT

### 15.1 Data Migration
1. Create leave balance records for all active employees
2. Initialize with current month balance (1 CL, 2h permission)
3. Set up fixed holidays for current year
4. Migrate any existing leave data (if applicable)

### 15.2 Rollout Plan
1. **Week 1-2**: Backend development and testing
2. **Week 3**: Frontend development
3. **Week 4**: Integration and testing
4. **Week 5**: User training and documentation
5. **Week 6**: Soft launch with one department
6. **Week 7**: Full rollout to all departments

### 15.3 Training Requirements
- Employee training: How to apply leave and check balance
- Team Lead training: Approval process and team management
- HR training: Final approval and reporting tools
- Admin training: System configuration and maintenance

---

## 16. SUCCESS METRICS

### 16.1 Key Performance Indicators
- Average leave approval time (Target: < 24 hours)
- Leave balance accuracy (100%)
- User adoption rate (Target: 90%+ in 1 month)
- Reduction in manual leave tracking efforts
- Payroll integration accuracy (100%)

### 16.2 User Feedback Points
- Ease of leave application
- Clarity of approval process
- Balance visibility
- Mobile responsiveness
- Notification effectiveness

---

## 17. FUTURE ENHANCEMENTS

### Phase 2 Features (Post-Launch)
1. **Compensatory Off (Comp-Off)**
   - For overtime work or holiday work
   - Auto-credit based on attendance

2. **Leave Calendar Integration**
   - Team calendar view
   - Public holiday calendar
   - Department-wise leave planning

3. **Advanced Analytics**
   - Predictive leave patterns
   - Department capacity planning
   - Leave abuse detection

4. **Mobile App**
   - Quick leave application
   - Push notifications for approvals
   - Biometric integration

5. **Leave Encashment**
   - Year-end leave encashment
   - Resignation leave settlement

---

## 18. RISK MITIGATION

### 18.1 Identified Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Balance calculation errors | High | Extensive testing, audit logs |
| Approval workflow breakdown | High | Fallback to HR direct approval |
| Payroll integration issues | High | Separate deduction tracking |
| User resistance to new system | Medium | Training and gradual rollout |
| Performance issues with scale | Medium | Proper indexing, caching |

### 18.2 Fallback Procedures
- Manual leave approval override for HR
- Balance correction mechanism
- Audit trail for all changes
- Regular backup of leave data

---

## 19. SUPPORT & MAINTENANCE

### 19.1 Support Structure
- L1: Employee self-service help
- L2: HR support for leave queries
- L3: IT/Dev team for technical issues

### 19.2 Maintenance Tasks
- Monthly balance reset verification
- Quarterly leave data cleanup
- Annual holiday setup
- Performance monitoring

---

## 20. IMPLEMENTATION TIMELINE & FILE STRUCTURE

### 20.1 Development Timeline (5 Weeks)

| Week | Phase | Tasks | Files to Create/Modify |
|------|-------|-------|------------------------|
| **1** | Backend Schema & Services | - Add schemas to `shared/schema.ts`<br>- Create leave services<br>- Update storage interface | `shared/schema.ts` ✏️<br>`server/services/leave-service.ts` ✨<br>`server/services/leave-balance-service.ts` ✨<br>`server/storage.ts` ✏️ |
| **2** | API Layer | - Add approval endpoints<br>- Balance management APIs<br>- Holiday management | `server/routes.ts` ✏️ |
| **3** | Frontend Components | - Create leave components<br>- Build forms and approvals | `client/src/components/leave/*.tsx` ✨ (7 files) |
| **4** | Page Integration | - Complete leave page<br>- Dashboard widgets | `client/src/pages/leave.tsx` ✏️<br>`client/src/pages/dashboard.tsx` ✏️ |
| **5** | Testing & Deployment | - Integration testing<br>- User training<br>- Deployment | All files (testing & deployment) |

**Legend:** ✨ = New file, ✏️ = Modify existing

### 20.2 File Structure Summary

```
📁 Backend Files
server/
├── services/
│   ├── leave-service.ts                    ✨ NEW
│   ├── leave-balance-service.ts            ✨ NEW
│   └── payroll-service.ts                  ✏️ ENHANCE (add leave deduction)
├── routes.ts                                ✏️ ENHANCE (add leave routes)
└── storage.ts                               ✏️ ENHANCE (add leave methods)

shared/
└── schema.ts                                ✏️ ENHANCE (add complete leave schemas)

📁 Frontend Files
client/src/
├── components/
│   ├── leave/                               ✨ NEW FOLDER
│   │   ├── leave-application-form.tsx      ✨ NEW
│   │   ├── leave-balance-widget.tsx        ✨ NEW
│   │   ├── leave-history-table.tsx         ✨ NEW
│   │   ├── tl-approval-list.tsx            ✨ NEW
│   │   ├── hr-approval-list.tsx            ✨ NEW
│   │   ├── leave-calendar-view.tsx         ✨ NEW
│   │   └── permission-time-picker.tsx      ✨ NEW
│   └── dashboard/
│       └── pending-approvals-card.tsx       ♻️ REUSE (for leave)
├── pages/
│   ├── leave.tsx                            ✏️ MAJOR ENHANCEMENT
│   └── dashboard.tsx                        ✏️ ADD leave widgets
└── lib/
    └── leave-utils.ts                       ✨ NEW (helper functions)
```

### 20.3 Existing Infrastructure to Leverage

**Already Available (No Work Needed):**
- ✅ `/leave` route configured in `App.tsx`
- ✅ Sidebar menu item in `sidebar.tsx`
- ✅ Leave permissions in permission system
- ✅ Basic leave endpoints in `routes.ts`
- ✅ User hierarchy with `reportingManagerId`
- ✅ All UI components (Shadcn)
- ✅ Form handling (react-hook-form + zod)
- ✅ Data fetching (TanStack Query)

---

## 21. CONCLUSION & NEXT STEPS

### 21.1 Summary
This comprehensive leave and permission management system will:
- ✅ Streamline leave application and approval process (Employee → TL → HR)
- ✅ Provide clear visibility of leave balances (1 casual leave + 2h permission/month)
- ✅ Integrate seamlessly with existing payroll for unpaid leave deductions
- ✅ Ensure compliance with company leave policy
- ✅ Reduce manual administrative overhead
- ✅ Build on existing infrastructure (50% foundation already exists)

### 21.2 What's Already Done vs What's Needed

**Existing (50%):**
- Basic leave page, routes, navigation ✅
- User hierarchy and permissions ✅
- Basic schema and endpoints ✅
- UI component library ✅

**To Build (50%):**
- Enhanced schemas (leave balance, holidays) 🔨
- Approval workflow services 🔨
- Frontend components (7 new components) 🔨
- TL/HR approval interfaces 🔨

### 21.3 Immediate Next Steps
1. ✅ **Review Document**: Client review of consolidated plan
2. ✅ **Confirm Requirements**: 
   - Leave types correct? (1 casual + 2h permission/month)
   - Workflow correct? (Employee → TL → HR)
   - Holidays correct? (May 1, Oct 2, Jan 26, Aug 15)
3. 🔨 **Begin Phase 1**: Start backend schema and service development
4. 📅 **Weekly Updates**: Progress tracking and adjustments

### 21.4 Sign-off Checklist
- [ ] Approve leave types and monthly balances
- [ ] Approve TL → HR approval workflow
- [ ] Approve fixed annual holidays
- [ ] Approve payroll integration approach
- [ ] Approve 5-week implementation timeline
- [ ] Ready to start development

---

**Document Status:** ✅ Ready for Client Review & Implementation

**Next Action:** Awaiting client approval to begin Phase 1 development

*This is the single consolidated planning document. All updates will be made to this file.*

# Overtime (OT) System: Complete End-to-End Documentation

## Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Multi-Session Capability](#multi-session-capability)
4. [Employee Workflow](#employee-workflow)
5. [Admin & Management Features](#admin-management-features)
6. [User Interfaces](#user-interfaces)
7. [API Endpoints](#api-endpoints)
8. [Security & Audit Trail](#security-audit-trail)
9. [Payroll Integration](#payroll-integration)
10. [Migration from Old System](#migration-from-old-system)
11. [Use Cases & Examples](#use-cases-examples)

---

## Overview
The new Overtime (OT) System is a comprehensive, enterprise-grade solution designed to manage employee overtime with high accuracy, security, and seamless integration with payroll and leave management systems.

**Key Capabilities:**
- ✅ Multiple OT sessions per day
- ✅ Automated OT type detection (Holiday/Weekend/Early/Late)
- ✅ GPS + Photo verification for anti-fraud
- ✅ Payroll period locking to prevent retroactive tampering
- ✅ Department-specific holiday management
- ✅ **Holiday-level OT policy control** (`allowOT` field)
- ✅ **Uniform OT rate** - Pure salary-based calculation
- ✅ Real-time tracking with live timers


---

## System Architecture

### Database Layer (Firestore via Firebase Admin SDK)
- **`otSessions` (Array)**: Stored within the `attendance` collection document, each session contains:
  - `sessionId`: Unique identifier (e.g., `ot_20251218_uid_001`)
  - `sessionNumber`: Sequential number for the day (1, 2, 3...)
  - `otType`: `'early_arrival' | 'late_departure' | 'weekend' | 'holiday'`
  - `startTime`, `endTime`: ISO timestamps
  - `otHours`: Calculated duration in decimal hours
  - `startImageUrl`, `endImageUrl`: Cloudinary URLs
  - `startLatitude`, `startLongitude`, `endLatitude`, `endLongitude`: GPS coordinates
  - `status`: `'in_progress' | 'completed' | 'APPROVED' | 'PENDING_REVIEW' | 'REJECTED' | 'locked'`

- **`holidays` Collection**: Stores company/department-specific holidays with:
  - `allowOT`: Controls if OT submissions allowed
  - `applicableDepartments`: Department filtering (null = all departments)
  - **Integration**: Used for check-in blocking, OT validation, and attendance enrichment
  - **Note**: Per-holiday OT rate multipliers removed - uniform rate now applies
- **`company_settings` Collection**: Single document for global OT rules.
- **`payroll_periods` Collection**: Tracks locked/unlocked months with audit trail.

### Backend Services (Node.js/TypeScript)
| Service | Responsibility |
|---------|---------------|
| `OTSessionService` | CRUD operations for OT sessions, automatic type detection, daily cap validation, holiday OT policy enforcement |
| `UnifiedAttendanceService` | Holiday checking, check-in blocking on holidays, attendance enrichment with holiday status |
| `HolidayService` | Holiday CRUD, department filtering, multiplier management |
| `CompanySettingsService` | Weekend configuration, OT rates, daily limits |
| `PayrollLockService` | Lock/unlock periods, enforce 10-char reason, auto-freeze sessions |
| `ManualOTService` | Backward compatibility for single-session-per-day model (still active for legacy support) |

### Frontend Components (React)
- **`smart-ot-button.tsx`**: Main employee interface with intelligent START/END button
- **`holiday-management.tsx`**: Unified admin dashboard for Attendance & OT Management (formerly "OT Administration")
- **`employee-ot.tsx`**: Simple page wrapper for employee OT management

---

## Multi-Session Capability

### How It Works
Employees can start and complete **multiple OT sessions in a single day**. Each session is independently tracked with its own GPS coordinates, photos, and timestamps.

**Example Scenario:**
- **Session 1 (Early Arrival)**: 5:00 AM - 7:00 AM (2 hours)
- **Regular Work**: 9:00 AM - 5:00 PM
- **Session 2 (Late Departure)**: 7:00 PM - 10:00 PM (3 hours)
- **Total OT for Day**: 5 hours

### Session Numbering
Sessions are automatically numbered sequentially (1, 2, 3...) within the same day. The backend generates unique session IDs like:
```
ot_20251218_abc123uid_001
ot_20251218_abc123uid_002
```

### Daily Aggregation
At the end of each session, the system:
1. Calculates `otHours` for the completed session
2. Sums all `completed` sessions for the day
3. Updates `attendance.totalOTHours`
4. Validates against `maxOTHoursPerDay` cap

---

## Employee Workflow

### A. Starting an OT Session
**Pre-Flight Checks (Automatic):**
1. **Leave Status**: Blocks if on approved `Casual Leave` or `Unpaid Leave`. Allows if on `Permission`.
2. **Payroll Lock**: Blocks if the current month is locked.
3. **Holiday OT Policy**: **NEW** - Blocks if holiday has `allowOT = false` (strict holiday).
4. **Active Session**: Ensures no in-progress session exists.

**Holiday Integration:**
The system integrates holidays into both attendance and OT workflows:

1. **Check-In Blocking:**
   - `UnifiedAttendanceService.processCheckIn()` automatically checks for holidays
   - If current date is a company holiday for user's department → Check-in BLOCKED
   - User-friendly error: "Today is {holidayName} (company holiday). Check-in is not allowed on this holiday."
   - Prevents employees from being marked 'absent' on holidays

2. **Attendance Enrichment:**
   - `enrichAttendanceWithHolidays()` runs during report generation
   - Automatically adds holiday status to attendance records
   - Days with no check-in on holidays show:
     - `status: 'holiday'` (NOT 'absent')
     - `holidayName: "Republic Day"`
     - `isHoliday: true`
   - Ensures accurate attendance reporting

3. **OT Policy Enforcement:**
   - Before starting OT, `validateHolidayOT()` checks `allowOT` field
   - If holiday has `allowOT = false` → OT start BLOCKED
   - Clear message: "OT submissions are not allowed on {holidayName}. This is a strict holiday."

**OT Type Auto-Detection (Priority Order):**
1. **Holiday** (Highest): Checks holiday calendar for department-specific entries.
2. **Weekend**: Compares current day against `company_settings.weekendDays`.
3. **Early Arrival**: If current time < department `checkInTime`.
4. **Late Departure** (Default): If current time > department `checkOutTime`.

**Security Capture:**
- GPS coordinates with accuracy metadata
- Photo uploaded to Cloudinary
- Address reverse-geocoded (optional)

**Automated Attendance Creation:**
If no attendance record exists (e.g., Sunday work), the system creates:
```javascript
{
  userId: "...",
  date: "2025-12-18",
  attendanceType: "office",
  status: "present",
  otSessions: [newSession],
  totalOTHours: 0
}
```

### B. During the Session
- **Live Timer**: Updates every second showing `Xh Ym` elapsed time.
- **Status Badge**: Displays OT type (HOLIDAY, WEEKEND, EARLY ARRIVAL, LATE DEPARTURE).
- **Session Info**: Shows start time and current duration.

### C. Ending an OT Session
1. **Photo + GPS Capture**: Same security requirements as start.
2. **Duration Calculation**: 
   ```javascript
   otHours = (endTime - startTime) / 3600000  // milliseconds to hours
   otHours = Number(otHours.toFixed(2))       // e.g., 2.75
   ```
3. **Daily Cap Check**:
   - If `totalOTToday > maxOTHoursPerDay`: Warning displayed to employee
4. **Database Update**:
   - Session marked as `completed`
   - `attendance.totalOTHours` recalculated

---

## Admin & Management Features

### A. Company Settings
**Accessible By:** Admin, Master Admin  
**Configurable Parameters:**

| Setting | Type | Example | Description |
|---------|------|---------|-------------|
| `weekendDays` | `number[]` | `[0, 6]` | 0=Sunday, 6=Saturday |
| `defaultOTRate` | `number` | `1.0` | Uniform multiplier for ALL OT types |
| `weekendOTRate` | `number` | `1.0` | (Backward compatibility - auto-synced with defaultOTRate) |
| `maxOTHoursPerDay` | `number` | `5.0` | Daily cap before warning |


### B. Holiday Management
**Accessible By:** Admin, Master Admin  
**Features:**
- Create holidays with custom names (e.g., "Republic Day")
- **OT Rate**: Uniform rate applies to all holidays (no per-holiday multipliers)
- Filter by `applicableDepartments`:
  - `null` or `[]` = All departments
  - `["technical", "operations"]` = Specific departments only
- Soft delete: Sets `isActive: false` instead of hard delete

**Example Holiday:**
```json
{
  "id": "holiday_20250126",
  "name": "Republic Day",
  "date": "2025-01-26",
  "type": "national",
  "allowOT": false,
  "applicableDepartments": null,
  "isActive": true
}
```

**`allowOT` Field:**
- **`false` (default)**: Strict holiday - System blocks all OT submissions
  - Example: National holidays, religious festivals
  - Error message: "OT submissions are not allowed on Republic Day. This is a strict holiday."
- **`true`**: Flexible holiday - OT allowed at uniform rate (same as weekday)
  - Example: Year-end work days, project deadlines
  - Employees can submit OT at standard rate


### C. Payroll Locking
**Accessible By:** Master Admin ONLY  

**Lock Process:**
1. Admin selects month/year (e.g., December 2024)
2. System validates: `year >= 2024`, `month 1-12`
3. On lock:
   - Creates/updates `payroll_periods` with `status: 'locked'`
   - Calls `OTSessionService.lockSessionsForPeriod()`
   - All `completed` sessions → `locked` status
   - Activity log created

**Unlock Process (Audited):**
1. Master Admin provides reason (min 10 characters)
2. Reason logged: `"Payroll for 12/2024 unlocked by master admin. Reason: {reason}"`
3. Period status → `'open'`
4. OT sessions remain locked but can be manually adjusted if needed

**Security Rationale:**  
Prevents employees/admins from retroactively adding OT hours after payroll is processed, ensuring financial integrity.

---

## User Interfaces

### Employee OT Page (`/employee-ot`)
**URL:** `/employee-ot`  
**Access:** All authenticated employees

**Layout:**
```
┌─────────────────────────────────────┐
│ Overtime Management                 │
│ Start and end your overtime sessions│
├─────────────────────────────────────┤
│ [WARNING: No attendance today]      │  ← If no check-in
│ (Auto-creates attendance for OT)    │
├─────────────────────────────────────┤
│ ┌─ OT In Progress ────────────────┐│
│ │ 🟠 LATE DEPARTURE               ││
│ │ Started at 6:45 PM              ││
│ │ Duration: 2h 15m                ││  ← Live timer
│ │ [END OT NOW]                    ││
│ └─────────────────────────────────┘│
├─────────────────────────────────────┤
│ Today's OT Summary                  │
│ 5.25 hrs                            │
│                                     │
│ Session 1: EARLY ARRIVAL            │
│ 5:00 AM - 7:00 AM  │  2.00 hrs     │
│                                     │
│ Session 2: LATE DEPARTURE           │
│ 7:00 PM - 10:15 PM  │  3.25 hrs    │
└─────────────────────────────────────┘
```

### Attendance & OT Management (`/attendance-management`)
**URL:** `/attendance-management`  
**Access:** Admin, Master Admin  
**NOTE:** Unified management dashboard for attendance, holidays, and OT policies.

**3-Tab Interface:**

**Tab 1: Holiday Calendar**
- Table view of all holidays for selected year
- Filter by month
- Add/Edit/Delete holidays
- **OT Policy**: Set OT submission policy per holiday (`allowOT` checkbox)
  - **Unchecked (default)**: Strict holiday - OT submissions blocked
  - **Checked**: Flexible holiday - OT allowed at uniform rate
- Department filtering


**Tab 2: Company Settings**
- Weekend day selector (checkboxes for Sun-Sat)
- OT rate input fields (validated > 0)
- Daily cap sliders
- Save button with confirmation

**Tab 3: Payroll Lock**
- Year dropdown (2024+)
- Monthly lock status grid:
  ```
  Jan [LOCKED]   Feb [OPEN]    Mar [OPEN]
  Apr [OPEN]     ...           Dec [LOCKED]
  ```
- Lock/Unlock buttons (Master Admin only)
- Unlock requires reason input (10+ chars)

### D. Admin Review System (OT Approval Workflow)
**Accessible By:** Admin, Master Admin  
**URL:** `/ot-pending-review`

**6-State Status Lifecycle:**
```
Employee Action:
  in_progress → (END OT) → completed/PENDING_REVIEW

Auto-Close Cron:
  in_progress → (forgotten >16h) → PENDING_REVIEW

Admin Review:
  PENDING_REVIEW → (review) → APPROVED / REJECTED
```

**When Sessions Require Review:**
1. **Auto-Triggered:**
   - Employee ends OT and `totalOTToday > maxOTHoursPerDay`
   - System automatically sets `status = 'PENDING_REVIEW'`
   - `otHours` initially set to 0 (admin must approve)

2. **Auto-Close Triggered:**
   - Cron job detects forgotten sessions (>16 hours running)
   - Auto-closes with `status = 'PENDING_REVIEW'`

**Admin Dashboard Features:**
- **Pending Sessions Table:**
  - Employee name, department, date
  - Start/end times
  - Claimed hours
  - Auto-close indicator
  - Review button

- **Stats Cards:**
  - Total pending count
  - Auto-closed count  
  - Sessions exceeding daily limit

- **Review Modal (3 Actions):**
  
  **1. APPROVE** - Accept hours as-is
  - Session status → `APPROVED`
  - `otHours` added to `totalOTHours`
  - Counted in payroll
  
  **2. ADJUST** - Change  hours
  - Admin enters corrected hours
  - Records `originalOTHours` + `adjustedOTHours`
  - Session status → `APPROVED`
  - Adjusted hours counted in payroll
  
  **3. REJECT** - Deny claim
  - Session status → `REJECTED`
  - Hours NOT counted in payroll
  - Employee notified

**Review Metadata Captured:**
- `reviewedBy`: Admin UID
- `reviewedAt`: Timestamp
- `reviewAction`: `'APPROVED' | 'ADJUSTED' | 'REJECTED'`
- `reviewNotes`: Admin comments (optional)
- `originalOTHours` / `adjustedOTHours` (if adjusted)

**Payroll Integration:**
Only sessions with status `APPROVED` or `completed` count toward payroll. Sessions with `PENDING_REVIEW` or `REJECTED` are excluded.

### E. Auto-Close System (Zero-Fraud Protection)
**Service:** `OTAutoCloseService`  
**Schedule:** Daily at 12:05 AM

**Purpose:**
Automatically close OT sessions employees forgot to end, preventing indefinite open sessions and requiring admin verification for actual hours.

**How It Works:**

1. **3-Day Lookback Window:**
   - Scans attendance from last 3 days (not just yesterday)
   - Prevents "zombie sessions" that slip through first pass
   - Example: Late-night session (10 PM) may not be 16h old at 12:05 AM

2. **16-Hour Threshold Protection:**
   - Only closes sessions running >16 hours
   - Protects legitimate night shifts
   - Example: Session started at 10 PM won't be closed until 2 PM next day

3. **Auto-Close Behavior:**
   - Sets `endTime` to 11:59:59 PM of start day
   - Sets `otHours` to **0** (CRITICAL: prevents counting until verified)
   - Changes `status` to `'PENDING_REVIEW'`
   - Records auto-close metadata:
     - `autoClosedAt`: Current timestamp
     - `autoClosedNote`: Calculated hours description (for admin reference only)
   - Sends notification to employee
   - Creates activity log entry

4. **Employee Notification:**
   ```
   Title: "OT Session Auto-Closed"
   Message: "Your OT session from 6:45 PM was auto-closed because you 
            forgot to end it. An admin will review and verify your actual hours."
   ```

5. **Admin Review Required:**
   - Session appears in `/ot-pending-review`
   - Admin verifies actual hours worked (consult manager/logs)
   - Admin approves adjusted hours (e.g., 4.5h instead of calculated 5.2h)

**Example Scenario:**
- 6:00 PM: Employee starts OT
- 10:30 PM: Employee leaves, forgets to end session
- 12:05 AM (next day): Cron detects session >16h old
- **Auto-close:** `endTime = 11:59:59 PM`, `otHours = 0`, `status = PENDING_REVIEW`
- 9:00 AM: Admin reviews, confirms with manager: worked until 10:30 PM = 4.5h
- Admin adjusts to 4.5h and approves
- **Payroll counts:** 4.5 hours

**Security Benefits:**
- ✅ Prevents employees from leaving sessions open indefinitely
- ✅ Requires admin verification for forgotten sessions
- ✅ Sets hours to 0 until approved (no automatic pay)
- ✅ Creates audit trail with auto-close notes
- ✅ 3-day lookback catches edge cases

---

## API Endpoints

### Employee Endpoints

#### `POST /api/ot/sessions/start`
**Auth:** Required  
**Body:**
```json
{
  "latitude": 13.0827,
  "longitude": 80.2707,
  "accuracy": 20,
  "imageUrl": "https://res.cloudinary.com/...",
  "address": "123 Main St",
  "reason": "Emergency project work"
}
```
**Response:**
```json
{
  "success": true,
  "message": "OT session started successfully (late_departure)",
  "sessionId": "ot_20251218_uid_003",
  "otType": "late_departure",
  "startTime": "2025-12-18T18:45:00.000Z"
}
```

#### `POST /api/ot/sessions/:id/end`
**Auth:** Required  
**Body:** Same as start  
**Response:**
```json
{
  "success": true,
  "message": "OT session completed. 2.75 hours recorded.",
  "otHours": 2.75,
  "totalOTToday": 5.25,
  "exceedsDailyLimit": true
}
```

#### `GET /api/ot/sessions/active`
**Auth:** Required  
**Response:**
```json
{
  "success": true,
  "session": { /* active session object or null */ }
}
```

#### `GET /api/ot/sessions?date=2025-12-18`
**Auth:** Required  
**Response:**
```json
{
  "success": true,
  "sessions": [ /* array of OTSession objects */ ]
}
```

### Admin Endpoints

#### `GET /api/ot/holidays?year=2025&month=12`
**Auth:** Admin  
**Response:**
```json
{
  "holidays": [ /* array of Holiday objects */ ]
}
```

#### `POST /api/ot/holidays`
**Auth:** Admin  
**Body:**
```json
{
  "date": "2025-01-26",
  "name": "Republic Day",
  "type": "national",
  "allowOT": false,
  "applicableDepartments": null
}
```

#### `GET /api/attendance/holidays`
**Auth:** Required  
**Purpose:** Fetch holidays for attendance system integration  
**Query Parameters:**
- `startDate`: ISO date (e.g., "2025-01-01")
- `endDate`: ISO date (e.g., "2025-01-31")
- `department`: (optional) Filter by department

**Response:**
```json
{
  "success": true,
  "holidays": [
    {
      "id": "holiday_20250126",
      "name": "Republic Day",
      "date": "2025-01-26",
      "type": "national",
      "allowOT": false,
      "applicableDepartments": null
    }
  ]
}
```

#### `GET /api/ot/sessions/pending`
**Auth:** Admin, Master Admin  
**Purpose:** Fetch all OT sessions requiring admin review  
**Response:**
```json
{
  "success": true,
  "sessions": [
    {
      "sessionId": "ot_20251218_uid_001",
      "attendanceId": "att_123",
      "userId": "uid_456",
      "userName": "John Doe",
      "userDepartment": "technical",
      "date": "2025-12-18",
      "startTime": "2025-12-18T18:00:00Z",
      "endTime": "2025-12-18T23:59:59Z",
      "otHours": 0,
      "status": "PENDING_REVIEW",
      "autoClosedAt": "2025-12-19T00:05:00Z",
      "autoClosedNote": "Session auto-closed. Calculated 6.0h (needs verification)"
    }
  ]
}
```

#### `POST /api/ot/sessions/:sessionId/review`
**Auth:** Admin, Master Admin  
**Purpose:** Review and approve/adjust/reject an OT session  
**Body:**
```json
{
  "attendanceId": "att_123",
  "action": "APPROVED | ADJUSTED | REJECTED",
  "adjustedHours": 4.5,  // Required if action = ADJUSTED
  "notes": "Verified with manager - worked until 10:30 PM"  // Optional
}
```
**Response:**
```json
{
  "success": true,
  "message": "OT session approved successfully",
  "session": {
    "sessionId": "ot_20251218_uid_001",
    "status": "APPROVED",
    "otHours": 4.5,
    "reviewedBy": "admin_uid",
    "reviewedAt": "2025-12-19T09:30:00Z",
    "reviewAction": "ADJUSTED",
    "originalOTHours": 0,
    "adjustedOTHours": 4.5
  }
}
```


#### `GET /api/ot/settings`
**Auth:** Admin  
**Response:**
```json
{
  "settings": {
    "weekendDays": [0],
    "defaultOTRate": 1.0,
    "weekendOTRate": 1.0,
    "maxOTHoursPerDay": 5.0
  }
}
```

#### `PUT /api/ot/settings`
**Auth:** Admin  
**Body:** Partial settings object

#### `POST /api/ot/payroll/lock`
**Auth:** Master Admin ONLY  
**Body:**
```json
{
  "month": 12,
  "year": 2024
}
```

#### `POST /api/ot/payroll/unlock`
**Auth:** Master Admin ONLY  
**Body:**
```json
{
  "month": 12,
  "year": 2024,
  "reason": "Correcting calculation error in payroll processing"
}
```

---

## Security & Audit Trail

### Photo Verification
- **Required:** Start and end photos mandatory
- **Storage:** Cloudinary with secure upload URLs
- **Validation:** Server validates image URLs before accepting

### GPS Verification
- **Accuracy Tracking:** Stores GPS accuracy metadata
- **Geofencing:** Can be extended to validate within office radius
- **Prevents Spoofing:** High-accuracy requirement reduces fake locations

### Activity Logs
Every critical action creates an entry in `activity_logs`:

| Event | Type | Entity Type | Description |
|-------|------|-------------|-------------|
| OT Start | `attendance` | `ot_session` | "User started late_departure OT session" |
| OT End | `attendance` | `ot_session` | "User completed OT session: 2.75 hours" |
| Holiday Created | `holiday` | `holiday` | "Republic Day created with 2.5x OT rate" |
| Settings Updated | `attendance` | `company_settings` | "OT settings updated by admin" |
| Payroll Locked | `payroll` | `payroll_period` | "Payroll for 12/2024 locked by master admin" |
| Payroll Unlocked | `payroll` | `payroll_period` | "Payroll for 12/2024 unlocked. Reason: {reason}" |

---

## Payroll Integration

### OT Hours Calculation
The payroll system queries Firestore:
```javascript
// Query attendance records with OT hours for the month
const attendanceRef = db.collection("attendance");
const snapshot = await attendanceRef
  .where("date", ">=", startOfMonth)
  .where("date", "<=", endOfMonth)
  .where("totalOTHours", ">", 0)
  .get();

const otRecords = snapshot.docs.map(doc => ({
  id: doc.id,
  userId: doc.data().userId,
  date: doc.data().date.toDate(),
  totalOTHours: doc.data().totalOTHours,
  otSessions: doc.data().otSessions || [],
  status: doc.data().status
}));
```

### Rate Application
For each OT session:
1. Determine `otType` (for reporting/categorization)
2. Apply uniform rate:
   - **All OT Types**: `company_settings.defaultOTRate` (e.g., 1.0x)
   - **Calculation**: Pure salary-based
3. Calculate: `otPay = otHours × (monthlySalary / 26 / 8) × 1.0`

**Note**: Weekend and holiday types are tracked for reporting, but all use the same rate.

### Locking Enforcement
- Payroll can only process **locked** periods
- OT data is immutable once locked
- Unlocking requires documented justification

---

## Migration from Old System

### Old System (Deprecated: `ManualOTService`)
- **Limitation:** Single OT session per day
- **Storage:** Direct fields in `attendance` (`otStartTime`, `otEndTime`, `manualOTHours`)
- **Status:** `otStatus: 'in_progress' | 'completed'`

### New System (Current: `OTSessionService`)
- **Enhancement:** Unlimited sessions per day
- **Storage:** JSONB array `otSessions[]`
- **Backward Compatibility:** Reads old `manualOTHours` and migrates

### Migration Script
**Location:** `server/migrations/migrate-ot-to-sessions.ts`  
**Usage:**
```bash
npx tsx server/migrations/migrate-ot-to-sessions.ts
```

**What It Does:**
1. Finds all attendance records with `manualOTHours > 0`
2. Creates equivalent `otSession` object in `otSessions` array
3. Preserves original data in legacy fields
4. Sets `isManualOT: true` flag for audit

---

## Use Cases & Examples

### Use Case 1: Sunday Emergency Repair
**Scenario:** Technician works on Sunday for urgent site repair.

1. **Morning 8AM:** No regular attendance exists (Sunday).
2. **Start OT:** System auto-creates attendance, detects `weekend` OT type.
3. **Work 8AM - 2PM:** 6 hours logged.
4. **End OT:** Calculates 6h × 1.0x = 6h equivalent pay.

### Use Case 2: Multiple Sessions in One Day
**Scenario:** Sales executive works early morning and late night.

1. **5:30 AM:** Start OT → `early_arrival` type, Session #1
2. **7:00 AM:** End OT → 1.5h logged
3. **9:00 AM:** Regular check-in
4. **6:00 PM:** Regular check-out
5. **8:00 PM:** Start OT → `late_departure` type, Session #2
6. **11:00 PM:** End OT → 3h logged
7. **Total:** 4.5h OT (1.5h + 3h)

### Use Case 3: Payroll Period Lock
**Scenario:** Month-end payroll processing.

1. **Dec 31, 11:59 PM:** All December OT finalized.
2. **Jan 1, 9:00 AM:** Master Admin locks December 2024.
3. **Effect:** All 150 employees' OT sessions → `locked` status.
4. **Jan 5:** Employee realizes missed OT on Dec 28.
5. **Request:** Master Admin unlocks with reason: "Employee A reported missing OT entry for Dec 28 emergency work. Verified with manager."
6. **Correction:** OT added, period re-locked.

### Use Case 4: Holiday Check-In Blocking
**Scenario:** Employee attempts to check in on a company holiday.

1. **Jan 26 (Republic Day), 9:00 AM:** Employee Ramesh tries to check in at office.
2. **System Check:** `UnifiedAttendanceService.isHoliday()` detects Republic Day.
3. **Result:** ❌ Check-in BLOCKED
4. **User Message:** "Today is Republic Day (company holiday). Check-in is not allowed on this holiday."
5. **Effect:** Employee not marked absent; holiday status applied automatically.

### Use Case 5: Holiday in Attendance Report
**Scenario:** Manager views monthly attendance report.

1. **Report Period:** January 2025
2. **Jan 26 (Republic Day):** No check-in record exists for employee Priya
3. **Enrichment:** `enrichAttendanceWithHolidays()` runs during report generation
4. **Result:** Jan 26 shows:
   - Status: `'holiday'` (NOT 'absent')
   - Holiday Name: "Republic Day"
   - Appearance: Green badge with "Republic Day" label
5. **Effect:** Accurate attendance percentage; holidays not counted as absences.

### Use Case 6: Forgotten OT Session (Auto-Close + Review)
**Scenario:** Employee forgets to end OT session after long day.

1. **Tuesday 6:00 PM:** Ramesh starts OT session for urgent project work
2. **Tuesday 10:30 PM:** Ramesh leaves office, forgets to end OT (phone died)
3. **Wednesday 12:05 AM:** Auto-close cron runs:
   - Detects session running >16 hours
   - Sets `endTime =  11:59:59` PM Tuesday
   - Sets `otHours = 0`
   - Sets `status = 'PENDING_REVIEW'`
   - Notification sent: "Your OT session was auto-closed. Admin will review."
4. **Wednesday 9:00 AM:** Admin Priya reviews in `/ot-pending-review`:
   - Sees "Auto-Closed" badge
   - Note says: "Calculated 6.0h (needs verification)"
   - Contacts Ramesh's manager
5. **Manager confirms:** Ramesh worked until 10:30 PM = 4.5 hours
6. **Admin adjusts:** Enters 4.5h, adds note "Verified with manager"
7. **Result:** 
   - Session status → `APPROVED`
   - `adjustedOTHours = 4.5`
   - Payroll counts 4.5 hours
   - Activity log created with adjustment details

### Use Case 7: Admin Adjusts Excessive OT Hours
**Scenario:** Employee claims more hours than daily limit, admin adjusts.

1. **Saturday 8:00 AM:** Technician Suresh starts OT for site emergency
2. **Saturday 6:00 PM:** Suresh ends OT (10 hours claimed)
3. **System auto-triggers:** `totalOTToday = 10h > maxOTHoursPerDay = 5h`
   - Status automatically set to `PENDING_REVIEW`
   - Badge shows "Exceeds Limit"
4. **Monday:** Admin Lakshmi reviews:
   - Checks site visit logs
   - Finds Suresh took 2-hour lunch break (not logged)
5. **Admin adjusts:** 
   - Selects "ADJUST" action
   - Enters 8.0 hours (10h - 2h break)
   - Note: "Deducted unpaid lunch break per policy"
6. **Result:**
   - `originalOTHours = 10.0`
   - `adjustedOTHours = 8.0`
   - Payroll pays for 8 hours
   - Suresh notified of adjustment with reason

### Use Case 8: Admin Rejects Unauthorized OT
**Scenario:** Employee works OT without prior approval on strict holiday.

1. **January 26 (Republic Day):** Employee Arun starts OT
2. **System blocks:** "OT submissions not allowed on Republic Day (strict holiday)"
3. **Arun bypasses** by manipulating start time (security gap discovered)
4. **Next day:** Admin Sarah sees suspicious entry:
   - OT on Republic Day (strict holiday)
   - No manager approval in system
5. **Admin investigates:**
   - Contacts Arun's manager
   - Manager confirms: "No approval given, Arun should not have worked"
6 **Admin rejects:**
   - Selects "REJECT" action
   - Note: "No manager approval. Republic Day is strict holiday per policy."
7. **Result:**
   - Session status → `REJECTED`
   - `otHours = 0` (not counted in payroll)
   - Arun receives notification
   - Activity log flagged for security review

---

## Summary

This OT system provides:
- ✅ **Accuracy:** GPS + photo verification, multi-session tracking
- ✅ **Security:** Payroll locking, activity audit trails, auto-close cron protection
- ✅ **Flexibility:** Multiple sessions/day, department-specific holidays
- ✅ **Policy Control:** Holiday-level OT blocking/allowing via `allowOT` field
- ✅ **Attendance Integration:** Check-in blocking on holidays, automatic holiday status enrichment
- ✅ **Automation:** Auto-detection of OT types, attendance creation, auto-close forgotten sessions
- ✅ **Compliance:** Locked periods prevent retroactive fraud
- ✅ **Integration:** Clean API for payroll systems
- ✅ **Admin Review System:** 6-state workflow with approve/adjust/reject capabilities
- ✅ **Zero-Fraud Protection:** 3-day lookback window, 16-hour threshold before auto-close
- ✅ **Payroll Accuracy:** Only approved sessions counted, pending/rejected excluded

**Migration Status:** Fully deployed. Old `ManualOTService` still active for backward compatibility.

**Recent Updates:**
- **v3.0 (2026-01-02)**: 
  - ✨ **MAJOR:** Admin review system with 6-state status lifecycle
  - ✨ **MAJOR:** Auto-close cron job for forgotten sessions (zero-fraud protection)
  - ✨ Review workflow: APPROVED / ADJUSTED / REJECTED
  - ✨ Admin pending review dashboard (`/ot-pending-review`)
  - ✨ 3-day lookback window + 16-hour threshold protection
  - ✨ Added review API endpoints
  - ✨ Payroll filtering by session status
  - 📝 Complete documentation overhaul (fixed PostgreSQL→Firestore, added 15+ missing features)
- **v2.2 (2025-12-19)**: 
  - Added comprehensive holiday-attendance integration
  - `UnifiedAttendanceService` for centralized holiday logic
  - Check-in blocking on company holidays
  - Attendance enrichment with holiday status
  - Page renamed to "Attendance & OT Management"
- **v2.1 (2025-12-19)**: Added `allowOT` field to holidays for granular OT policy control

--- 
*Document Version: 3.0*  
*Last Updated: 2026-01-02*  
*Maintained By: Development Team*

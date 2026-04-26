# Comprehensive Attendance System Documentation
**Date**: December 2026
**Version**: 3.0 (Simplified System)
**Last Updated**: December 26, 2025

> **Quick Reference**: This documentation covers the COMPLETE attendance system including Auto-Checkout, Admin Review, Checkout Edge Cases, and all 20+ API endpoints. Use the table of contents to jump to specific sections.

---

## Critical Features at a Glance

| Feature | Status | Details |
|---------|--------|--------|
| **Check-in Type** | Simplified | Location + Selfie only (no office/remote/field selection) |
| **Auto-Checkout** | ✓ Active | 2-hour grace period after dept closing time |
| **Admin Review** | ✓ Required | All auto-corrected records need admin approval |
| **Payroll Locks** | ✓ Enforced | Cannot modify finalized periods |
| **OT Calculation** | Manual Only | Auto-OT disabled, use Manual OT system |
| **Rate Limiting** | ✓ Active | Check-in/out endpoints protected |

---

## 1. System Overview
The Attendance System is a **Simplified Enterprise Solution** for employee time tracking. It has been streamlined to remove complexity while maintaining data integrity and seamless Payroll integration.

**Key Characteristics**:
- **Simplified Check-in**: Only requires GPS location + Selfie photo (no attendance type selection).
- **Enterprise Time Management**: Sophisticated backend handling of shifts, late arrivals, and working hours.
- **Data Integrity**: UTC-based duplicate prevention and Payroll Lock enforcement.
- **Photo Verification**: All check-ins require mandatory selfie uploaded to Cloudinary.

---

## 2. Core Services

### 2.1 UnifiedAttendanceService
**File**: `server/services/unified-attendance-service.ts`

**Responsibilities**:
- Validates check-in prerequisites (User, Department, Holiday).
- Prevents duplicate check-ins using UTC date normalization.
- Uploads photos to Cloudinary.
- Records attendance with metadata (accuracy, device info).

**Key Methods**:
- `processCheckIn()`: Main check-in flow with validation.
- `processCheckOut()`: Calculates working hours.
- `isHoliday()`: Blocks check-in on company holidays.
- `enrichAttendanceWithHolidays()`: Adds holiday records to attendance history.
- `enrichAttendanceWithWeeklyOffs()`: Adds weekly-off (Sunday) records for payroll accuracy.
- `enrichAttendanceComprehensively()`: Master function combining holiday + weekly-off enrichment.

**Payroll Integration Features** *(New - Dec 2025)*:
- **Half-Day Auto-Tagging**: Automatically marks attendance as `half_day` if working hours < 50% of department shift.
- **Statutory Credit**: Ensures Sundays and Holidays are counted as paid days in payroll calculations.
- **Attendance Enrichment**: Adds virtual attendance records for non-working days to ensure accurate salary calculations.

### 2.2 EnterpriseTimeService
**File**: `server/services/enterprise-time-service.ts`

**Responsibilities**:
- Manages department-specific shift timings (12-hour format).
- Calculates late arrivals and working hours.
- Caches department timings for performance.

**Key Features**:
- **Department Timings**: Each department has configurable check-in/out times (e.g., "9:00 AM" - "6:00 PM").
- **Late Detection**: Compares actual check-in against expected time.
- **Working Hours**: Precise calculation using `checkOutTime - checkInTime`.
- **OT Disabled**: Automatic overtime calculation is turned OFF (manual OT only).

---

## 3. Check-In Workflow

### 3.1 Validation Pipeline
When a user attempts to check in, the system performs these checks **in order**:

1. **User Validation**: Must be a valid, active user.
2. **Department Assignment**: User must be assigned to a department.
3. **Department Timing**: Department must have configured shift timings.
4. **Holiday Check**: If today is a company holiday → **REJECT** with message "Enjoy your holiday!".
5. **Duplicate Check**: If a check-in record already exists for today's UTC date → **REJECT**.

### 3.2 Required Data
The frontend (`EnterpriseAttendanceCheckIn` component) collects:
- **GPS Location**: Latitude, Longitude, Accuracy.
- **Selfie Photo**: Captured via device camera, uploaded to Cloudinary.
- **Device Info**: Type (mobile/desktop), User Agent, Location capability rating.

### 3.3 Backend Processing
Once validated, `UnifiedAttendanceService.processCheckIn()`:
1. Uploads photo to Cloudinary (if base64 data provided).
2. Calculates timing info (is late? late minutes?).
3. Creates attendance record with `attendanceType: 'office'` (hardcoded).
4. Logs activity.

**Key Fields Stored**:
```typescript
{
  userId, date (UTC), checkInTime,
  attendanceType: 'office',
  status: 'present' | 'late',
  isLate, lateMinutes,
  checkInLatitude, checkInLongitude,
  checkInImageUrl, // Cloudinary URL
  locationAccuracy, locationConfidence,
  workingHours: 0 // Updated on checkout
}
```

---

## 4. Check-Out Workflow

### 4.1 Process
1. Find today's open attendance record (must have `checkInTime` and no `checkOutTime`).
2. Calculate `workingHours = (checkOutTime - checkInTime) / 60 minutes`.
3. Update record with checkout data.

### 4.2 Overtime Logic
**CRITICAL**: Automatic OT is **DIS ABLED**.
- `overtimeHours` is always set to `0` during checkout.
- Employees must use the **Manual OT System** to request OT approval.
- Admin can manually approve OT hours via the admin panel.

**Rationale**: Prevents accidental OT accumulation from users forgetting to check out.

### 4.3 Checkout Validations & Edge Cases

#### Midnight Boundary Handling
**Problem**: User checked in late (e.g., 11:30 PM) and checks out after midnight.
**Solution**: The system intelligently searches for attendance records:
1. First, tries to find record for **today**.
2. If not found AND current time is before **6:00 AM**, checks **yesterday**.

This prevents "No check-in found" errors for late-night workers.

#### OT Threshold Protection
If overtime exceeds department's `overtimeThresholdMinutes` (default: 30 min):
- **Photo Required**: System rejects checkout without photo verification.
- **Reason Required**: User must provide `otReason` field.

```typescript
// Example checkout request with OT
{
  userId, latitude, longitude,
  otReason: "Client emergency deployment",
  imageUrl: "cloudinary_url"
}
```

####Early Checkout Detection
If user checks out **before** completing standard working hours:
- System calculates `earlyMinutes`.
- Logs early checkout but **does not block** (no strict policy enforcement).

---

## 5. Auto-Checkout System

### 5.1 Overview
**Critical Feature**: Automatically closes forgotten attendance records to maintain data integrity.

**Trigger**: Cron job running every **2 hours** via `/api/cron/auto-checkout`.

### 5.2 How It Works
1. **Detection**: Finds all attendance records without `checkOutTime`.
2. **Grace Period**: Waits for **2 hours** past department's configured `checkOutTime`.
3. **Auto-Correction**: Sets checkout time to department's standard closing time.
4. **Admin Review**: Marks record as `adminReviewStatus: 'pending'`.
5. **Notification**: Notifies both employee and admin.

**Example Timeline**:
```
Department Closing: 6:00 PM
Grace Period: +2 hours = 8:00 PM
Cron runs at: 8:30 PM
→ Auto-checkout triggered, checkout set to 6:00 PM
```

###5.3 Auto-Checkout Fields
When a record is auto-corrected:
```typescript
{
  checkOutTime: departmentClosingTime,
  autoCorrected: true,
  autoCorrectedAt: Date,
  autoCorrectionReason: "Forgotten checkout...",
  adminReviewStatus: 'pending',
  workingHours: calculated
}
```

### 5.4 Why This Matters
- **Data Completeness**: Ensures payroll can run without manual intervention.
- **Fairness**: Uses standard hours instead of arbitrary late times.
- **Transparency**: Admin review ensures employees can contest incorrect corrections.

---

## 6. Admin Review Workflow

### 6.1 Purpose
All **auto-corrected** attendance records require admin verification before being used in payroll.

### 6.2 Review Actions
Admin can take 3 actions via `POST /api/admin/attendance/review/:id`:

| Action | Effect | Use Case |
|--------|--------|----------|
| **accepted** | Approves auto-correction as-is | User genuinely forgot to check out |
| **adjusted** | Manually sets correct times | User worked late, auto-correction wrong |
| **rejected** | Marks as absent, removes checkout | User never came to work |

### 6.3 Adjusted Example
If user actually worked till 8 PM but auto-checkout set 6 PM:
```json
{
  "action": "adjusted",
  "checkInTime": "2025-01-15T09:00:00Z",
  "checkOutTime": "2025-01-15T20:00:00Z",
  "notes": "Confirmed user worked late on client project"
}
```

System will:
- Store original auto-checkout time in `originalCheckOutTime`.
- Recalculate `workingHours` using adjusted times.
- Update `adminReviewStatus` to "adjusted".
- Notify employee of the adjustment.

### 6.4 Incomplete Attendance Detection
**Endpoint**: `GET /api/attendance/incomplete` (Admin only)

**Smart Filtering**:
- Gets all records without `checkOutTime`.
- **30-minute grace period**: Excludes records where current time < (dept closing + 30 min).
- Department-aware: Uses each user's specific department timing.

This prevents false positives (e.g., marking someone as "incomplete" at 5:45 PM when their shift ends at 6:00 PM).

---

## 6.5 Production Safeguards (P1/P2 Critical Features)

### 6.5.1 Payroll Lock Enforcement (P1.1)
**Rule**: Admins **cannot** review attendance for locked payroll periods.

**Implementation**: `POST /api/admin/attendance/:id/review` checks `PayrollLockService.isPeriodLocked(date)` before allowing any changes.

**Error Response**: HTTP 403 - "Cannot modify attendance for a locked payroll period. Unlock the period first."

**Workaround**: Master Admin must unlock the payroll period via Payroll Administration page.

---

### 6.5.2 Leave vs Attendance Conflict Resolution (P1.2)
**Rule**: Auto-checkout **skips** records where an approved leave exists for that day.

**Implementation**: `AutoCheckoutService` calls `LeaveService.hasLeaveOnDate()` before processing.

**Behavior**: If approved leave exists → Skip auto-checkout, leave remains as source of truth.

**Why**: Prevents payroll confusion where a day shows both "Leave" and "Present".

---

### 6.5.3 Pending Review Warning (P1.3)
**Rule**: Payroll generation is **blocked** if pending review records exist.

**Implementation**: `POST /api/payroll/calculate-all` returns HTTP 409 if pending records found.

**Override**: Include `forceProceed: true` to proceed (pending days excluded from salary).

---

### 6.5.4 Reports & Dashboard Consistency (P2)
**Rule**: Attendance reports and dashboards **exclude** pending review records.

**Filtered Endpoints**:
- `GET /api/attendance`
- `GET /api/attendance/report`
- `GET /api/attendance/range`
- `GET /api/attendance/department-stats`
- `GET /api/attendance/analytics`

**Result**: Reports show same present days count as payroll calculations.

---

### 6.5.5 Admin Review Status Workflow

**Key Statuses**:
- `pending` - Awaiting admin review (**excluded** from payroll & reports)
- `accepted` - Approved as-is (**included** in payroll & reports)
- `adjusted` - Manually corrected (**included** in payroll & reports)
- `rejected` - Marked absent (excluded from payroll)

**Flow**:
```
1. Auto-checkout runs → adminReviewStatus = 'pending'
2. Record excluded from:
   - Payroll calculations
   - Attendance reports
   - Dashboard stats
   - Excel exports
3. Admin reviews → Status changes to accepted/adjusted/rejected
4. If accepted/adjusted → Now included in all reports & payroll
```

---

## 7. Security & Payroll Integration

### 5.1 Payroll Locks
**Service**: `PayrollLockService`

**Enforcement Points** (in `server/routes.ts`):
- `PATCH /api/attendance/:id`: Blocked if period locked.
- `POST /api/attendance/bulk-action`: Blocked if period locked.
- `PATCH /api/leaves/:id`: Blocked if period locked.

**Use Case**: Once a payroll period (e.g., December 2025) is "finalized", no one (including admins) can modify attendance for that month until the lock is manually removed by Master Admin.

### 5.2 UTC Date Handling
**Problem**: Timezone bugs causing same-day check-ins to be rejected or different-day records to merge.

**Solution**: All date comparisons use **UTC midnight** as the boundary:
```typescript
const today = new Date(Date.UTC(
  now.getUTCFullYear(),
  now.getUTCMonth(),
  now.getUTCDate(),
  0, 0, 0, 0
));
```

This ensures consistent "today" across all timezones.

---

## 8. Removed Features (Deprecated)

**As of December 2025, the following features were REMOVED**:
- ❌ **Attendance Type Selection**: Users no longer choose "Office" / "Remote" / "Field Work".
- ❌ **Geofencing Validation**: Location is recorded but not validated against office radius.
- ❌ **Customer Name Field**: Removed (was for field work).
- ❌ **Reason Field**: Removed (was for remote work).

**Current Behavior**: All attendance is treated as standard check-in with location + photo verification.

---

## 9. API Reference (Complete)

### 9.1 User Endpoints
| Method | Path | Description | Rate Limit |
|--------|------|-------------|------------|
| POST | `/api/attendance/check-in` | Simplified check-in (location + photo) | ✓ Yes |
| POST | `/api/attendance/check-out` | Calculate hours and close today's record | ✓ Yes |
| POST | `/api/attendance/upload-photo` | Upload selfie to Cloudinary | - |
| POST | `/api/attendance/ot-start` | Start manual OT session | ✓ Yes |
| POST | `/api/attendance/ot-end` | End manual OT session | ✓ Yes |
| GET | `/api/attendance` | User's own attendance history | - |
| GET | `/api/attendance/holidays` | Company holidays affecting attendance | - |

### 9.2 Admin Endpoints
| Method | Path | Description | Access |
|--------|------|-------------|--------|
| GET | `/api/attendance/today` | Real-time today's attendance | Admin |
| GET | `/api/attendance/incomplete` | Records needing checkout (30-min grace) | Admin |
| GET | `/api/attendance` | All attendance (with filters: userId, date) | Admin |
| GET | `/api/attendance/range` | Attendance within date range | Admin |
| GET | `/api/attendance/live` | Live attendance dashboard | Admin |
| GET | `/api/attendance/analytics` | Attendance analytics & insights | Admin |
| GET | `/api/attendance/department-stats` | Department-wise statistics | Admin |
| PATCH | `/api/attendance/:id` | Correct attendance record (lock-aware) | Admin |
| POST | `/api/attendance/bulk-action` | Bulk approve/adjust (lock-aware) | Admin |
| POST | `/api/admin/attendance/review/:id` | Review auto-corrected records | Admin |

### 9.3 System Endpoints
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/cron/auto-checkout` | Trigger auto-checkout job | Secret Token |

### 9.4 Important Query Parameters
**GET `/api/attendance`**:
- `userId=<uid>`: Filter by specific user (admin only).
- `date=<YYYY-MM-DD>`: Filter by specific date (admin only).
- No params: Returns current user's own records.

---

## 10. Frontend Components

### 10.1 EnterpriseAttendanceCheckIn
**File**: `client/src/components/attendance/enterprise-attendance-check-in.tsx`

**Features**:
- Camera access for selfie capture.
- GPS location detection.
- Real-time form validation (location + photo required).
- Address reverse-geocoding (Google Maps API).
- Network status monitoring.

**Simplified Flow**:
1. User clicks "Check In" button.
2. Modal opens → requests camera/location permissions.
3. User captures selfie.
4. System validates (photo ✓, location ✓).
5. Photo uploaded to Cloudinary → Check-in API called.
6. Success toast displayed.

### 8.2 SmartUnifiedCheckout
**File**: `client/src/components/attendance/smart-unified-checkout.tsx`

Handles check-out with optional photo verification.

---

## 9. Data Flow Diagram

```
User Action (Check-in Button)
  ↓
EnterpriseAttendanceCheckIn Component
  ↓
Capture GPS + Selfie
  ↓
Upload Photo → Cloudinary
  ↓
POST /api/attendance/check-in
  ↓
UnifiedAttendanceService.processCheckIn()
  ↓
Validations (User, Dept, Holiday, Duplicate)
  ↓
EnterpriseTimeService.calculateTimingInfo()
  ↓
Create Attendance Record in Firestore
  ↓
Return Success
```

---

## 10. Developer Notes

### 10.1 Codebase Hygiene
- **Legacy Code**: References to `attendanceType: 'remote' | 'field_work'` still exist in the database schema for historical records but are not used in new check-ins.
- **Hardcoded Type**: Current system always sets `attendanceType: 'office'`.

### 10.2 Future Enhancements
1. **Re-enable Geofencing**: Uncomment/restore validation in `UnifiedAttendanceService` to enforce office radius checks.
2. **Custom Attendance Types**: Add dynamic attendance type configuration per department.
3. **Biometric Integration**: The backend already supports `deviceId` for future fingerprint/face ID devices.
4. **Offline Mode**: Store check-ins locally and sync when online.

### 10.3 Testing Checklist
- [ ] Check-in before department shift start time → Should BLOCK.
- [ ] Check-in after department shift end time → Should BLOCK.
- [ ] Check-in on company holiday → Should BLOCK.
- [ ] Check-in twice on same day → Second attempt should REJECT.
- [ ] Check-out without check-in → Should return error.
- [ ] Modify attendance for locked payroll period → Should return 403.

---

## 11. Troubleshooting

**Issue**: "You have already checked in today" but user hasn't.
- **Cause**: Old incomplete record from a previous day due to timezone bug.
- **Fix**: System now uses UTC date normalization (lines 282-320 in `unified-attendance-service.ts`).

**Issue**: Late calculation wrong.
- **Cause**: Department timing not configured or using 24-hour format.
- **Fix**: Ensure department timings use 12-hour format ("9:00 AM" not "09:00").

**Issue**: Photo upload fails.
- **Cause**: Cloudinary credentials missing or network issue.
- **Fix**: Check `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` in `.env`.


**Issue**: Auto-checkout not triggering.
- **Cause**: Cron job not configured or failing.
- **Fix**: Verify cron is calling `POST /api/cron/auto-checkout` every 2 hours with correct auth token.

---

## 12. Notification System

### 12.1 Notification Types
The system creates 3 types of attendance notifications:

| Type | Trigger | Recipients | Expiry |
|------|---------|------------|--------|
| `auto_checkout` | Auto-checkout runs | Employee only | 7 days |
| `admin_review` | Pending review created | All admins | None |
| `system` (adjustment) | Admin reviews record | Employee only | None |

### 12.2 Notification Flow
```
[Auto-Checkout] → Employee: "Auto-completed" + Admins: "Review required"
    ↓
[Admin Reviews] → Employee: "Accepted/Adjusted/Rejected + notes"
```

**actionUrl Routing**:
- Employee: `/attendance` (view own records)
- Admin: `/admin/attendance?tab=pending-review&id=<recordId>` (pre-filtered)

---

## 13. Department Timing Configuration

### 13.1 Configuration Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/departments/timings` | All department timings |
| GET | `/api/departments/:department/timing` | Specific department |
| POST/PUT | `/api/departments/:department/timing` | Create/update timing |
| POST | `/api/departments/timings/bulk` | Bulk update |
| POST | `/api/departments/timings/refresh-cache` | Clear 5-min cache |

### 13.2 Cache Refresh
Department timings are cached for **5 minutes**. After bulk updates, call `POST /api/departments/timings/refresh-cache` to force immediate invalidation.

---

## 14. Storage Layer Methods

### 14.1 Core Methods
- `createAttendance()`, `updateAttendance()`, `getAttendance(id)`
- `getAttendanceByUserAndDate(userId, date)` - Find today's record
- `listAttendanceByUser(userId)` - User history
- `listAttendanceByDate(date)` - All users for specific date
- `listAttendanceBetweenDates(start, end)` - Range query (all users)
- `listAttendanceByUserBetweenDates()` - User's range

### 14.2 Auto-Checkout Methods
- `listIncompleteAttendance(date)` - Records needing checkout
- `listAttendanceByReviewStatus(status)` - Pending admin review

### 14.3 Payroll Integration
- `listAttendanceByDateRange(start, end)` - For monthly payroll
- `getMonthlyAttendanceSummary(userId, month, year)` - Stats

---

## 15. Cross-Module Integrations

### 15.1 Payroll Integration
- Payroll calls `listAttendanceByDateRange()` for monthly data
- `present` + `late` = payable days
- `absent` = LOP (Loss of Pay)
- **OT comes from Manual OT System, NOT attendance.overtimeHours**

### 15.2 Leave System
- Approved leaves do NOT create attendance records
- Payroll queries leaves separately
- UI can merge via `enrichAttendanceWithHolidays()`

### 15.3 Site Visits
- Site visits have separate check-in/out
- Do NOT create attendance records
- Reuse `/api/attendance/upload-photo` endpoint with `attendanceType: 'site_visit_selfie'`

---

## 16. Performance & Optimization

### 16.1 Caching
| Layer | What's Cached | TTL |
|-------|---------------|-----|
| EnterpriseTimeService | Dept timings | 5 min |
| React Query | Attendance records | Until navigation |

### 16.2 Query Optimization
**Incomplete Detection**: Fetch all department timings once into Map → O(1) lookups (reduced from 100+ queries to 2 for 100 employees).

---

## 17. Error Handling

### 17.1 Common Errors

| Scenario | Status | Message | Guidance |
|----------|--------|---------|----------|
| No location | 400 | "Location required" | Enable GPS |
| No photo | 400 | "Selfie required" | Capture photo |
| Already checked in | 400 | " Already checked in today" | Once per day |
| Holiday | 400 | "Cannot check in on [Holiday]" | Enjoy holiday |
| No dept timing | 400 | "Dept timing not configured" | Contact admin |
| Locked period | 403 | "Locked payroll period" | Contact master admin |
| OT without photo | 400 | "Photo required" | Take photo for late checkout |

### 17.2 Error Format
```json
{
  "success": false,
  "message": "Human-readable error",
  "recommendations": ["Action to take"]
}
```

---

## 18. Security

### 18.1 Photo Upload
- **Cloudinary**: Photos uploaded to cloud (not local)
- **Public URLs**: ⚠️ Photos are publicly accessible
- **Security Gap**: No authentication on photo URLs - consider signed URLs for sensitive data

### 18.2 Authorization
- **User Actions**: `userId` must match `req.authenticatedUser.uid`
- **Admin**: Requires `admin` or `master_admin` role
- **Master Admin Only**: Payroll locks, bulk timing updates

---

## 19. Monitoring & Debugging

### 19.1 Log Patterns
| Pattern | Indicates |
|---------|-----------|
| `[AUTO-CHECKOUT]` | Cron job execution |
| `ENTERPRISE CHECK-IN` | Check-in validation |
| `INCOMPLETE DETECTION` | Admin viewing incomplete |
| `CHECKOUT: Early checkout` | User leaving early |

### 19.2 Key Metrics
1. **Auto-Checkout Rate**: Records auto-corrected daily
2. **Admin Review Lag**: Time from auto-checkout to approval
3. **Photo Upload Success**: Cloudinary upload rate
4. **Rate Limit Hits**: 429 responses on check-in/out

---

## 20. Known Limitations & Future

### 20.1 Limitations
1. **No Offline Support**: Requires internet
2. **No Biometric**: Planned (`deviceId` field exists)
3. **Photo Privacy**: Public Cloudinary URLs
4. **Geofencing Disabled**: Location not validated

### 20.2 Planned Features
1. **Dynamic Attendance Types**: Per-department configuration
2. **Biometric Integration**: Fingerprint scanner support
3. **Offline Mode**: Local storage + sync
4. **Geofencing**: Office radius validation


---

## 21. Expert Level Workflow Insights

### 21.1 Auto-Checkout vs. Manual OT Conflict
> [!WARNING]
> **Operational Risk**: If an employee forgets their regular checkout but is actively working on a **Manual OT** session, the `AutoCheckoutService` may still trigger 2 hours after the department's `checkOutTime`.
- **Result**: The main attendance record will be marked `autoCorrected: true` and the `checkOutTime` will be set to the department's scheduled closing time.
- **Impact on OT**: When the user eventually ends their Manual OT, the `totalWorkingHours` calculation will use the auto-corrected (earlier) checkout time instead of the actual OT end time. However, `overtimeHours` (calculated from `otStartTime` to `otEndTime`) will remain accurate.

### 21.2 Holiday Visualization Differences
- **Attendance History Tab**: Displays only actual database records. Holidays will **not** appear here unless the user performed a check-in.
- **Reports & Payroll Exports**: Uses `enrichAttendanceWithHolidays` to dynamically inject "Holiday" rows for all missing dates. This ensures payroll calculations are accurate even if the UI history looks "gappy".

### 21.3 Manual OT as Attendance Trigger
- Starting a Manual OT session is "Attendance-Aware".
- If a user starts OT on a day where they have **no attendance record** (e.g., coming in only for OT on a Sunday), the system automatically creates a `present` attendance record with `attendanceType: 'office'`.

### 21.4 UTC vs IST Boundary
- All storage and lookups use **Date.UTC** for the `date` field and `dateString` (YYYY-MM-DD) for indexed lookups.
- Time calculations for "Late Arrival" and "OT Type" are performed in **IST (UTC+5:30)** by converting the UTC timestamp to local string and parsing against department rules.

### 21.5 Note for Maintainers: Redundant Routes
- **Issue**: Admin review routes (`/api/admin/attendance/:id/review`) are defined twice in `server/routes.ts` (Lines 288 and 8016).
- **Behavior**: Express executes the first matching route. Currently, the implementation at Line 288 is the active one. Both implementations are logically consistent, but the duplication should be addressed in future refactoring to avoid confusion.

---

## 22. Summary: What You Need to Know

### For Employees
1. **Check-in**: Requires GPS + selfie photo. No type selection needed.
2. **Forgot to Check Out?**: System auto-checks you out 2 hours after shift end.
3. **Auto-Checkout Notification**: You'll get a notification - review and contact admin if incorrect.
4. **Late Checkout with OT**: If you work overtime, take a photo and provide reason when checking out.

### For Admins
1. **Auto-Checkout Review**: Check `GET /api/attendance/incomplete` daily to review pending records.
2. **3 Review Actions**: Accept (approve), Adjust (fix times), Reject (mark absent).
3. **Payroll Lock**: Lock periods after payroll finalization to prevent retroactive changes.
4. **Analytics**: Use `/api/attendance/analytics` and `/department-stats` for insights.

### For Developers
1. **Primary Service**: `UnifiedAttendanceService` handles all check-in/out logic.
2. **Time Calculations**: Always use `EnterpriseTimeService` for consistency.
3. **Auto-Checkout**: `AutoCheckoutService` runs via cron (`/api/cron/auto-checkout`).
4. **Admin Review**: `POST /api/admin/attendance/review/:id` for correcting auto-checkout records.
5. **Rate Limiting**: Check-in/out are rate-limited - handle 429 responses gracefully.

---

## 20. Payroll Precision Features (Dec 2025)

### 20.1 Overview
New payroll-integrated features ensure 100% accuracy in salary calculations by handling half-days, weekly-offs, and holidays correctly.

### 20.2 Half-Day Auto-Tagging

**Trigger**: Normal checkout (NOT auto-checkout)  
**File**: `server/routes.ts:1632-1649`

**Logic**:
```typescript
if (workingHours < (standardWorkingHours * 0.5)) {
  status = 'half_day';  // Auto-tagged
}
```

**Example**:
- **9-hour shift**: Half-day if worked < 4.5 hours
- **6-hour shift**: Half-day if worked < 3 hours
- **Department-specific**: Uses each department's configured working hours

**Safety**:
- ✅ Only applied during normal checkout
- ❌ NOT applied during auto-checkout (admin review instead)

### 20.3 Attendance Enrichment

**Purpose**: Add virtual records for Sundays and Holidays to ensure employees get paid for non-working days.

**Functions**:
1. `enrichAttendanceWithHolidays()`: Adds national/company holidays
2. `enrichAttendanceWithWeeklyOffs()`: Adds Sundays (or configured weekly-off days)
3. `enrichAttendanceComprehensively()`: Master function combining both

**Usage in Bulk Payroll**:
```typescript
// File: server/routes.ts:6653-6676
const enrichedAttendance = await UnifiedAttendanceService.enrichAttendanceComprehensively(
  userId,
  startDate,  // First day of month
  endDate,    // Last day of month
  monthAttendance  // Raw attendance records
);

// Pass enriched data to payroll calculator
const calculation = await payrollCalcService.calculateComprehensivePayroll(
  userId, month, year,
  enrichedAttendance,  // ← Contains Sundays + Holidays
  salaryStructure,
  department
);
```

**Example**:
- January 2025: 26 working days + 5 Sundays = 31 total records
- Employee gets paid for all 31 days (if present for working days)

### 20.4 Weighted Salary Calculation

**File**: `server/services/payroll-calculation-service.ts:308-317`

**Logic**:
```typescript
const presentDays = attendanceRecords.reduce((total, record) => {
  if (record.status === 'half_day') return total + 0.5;
  
  const fullPayStatuses = ['present', 'late', 'overtime', 
                           'early_checkout', 'holiday', 'weekly_off'];
  if (fullPayStatuses.includes(record.status)) return total + 1.0;
  
  return total;
}, 0);
```

**Result**:
- `half_day` = 0.5 salary units
- `present`, `late`, `weekly_off`, `holiday` = 1.0 salary units
- `absent` = 0.0 salary units

**Example Calculation**:
```
Basic Salary: ₹26,000
Per Day Rate: ₹26,000 / 26 = ₹1,000

Attendance in January:
- 24 present days = 24.0
- 1 half_day = 0.5
- 5 weekly_off (Sundays) = 5.0
Total: 29.5 days

Salary: ₹1,000 × 29.5 = ₹29,500
```

### 20.5 Integration Points

**Checkout Route**:
- Auto-tags `half_day` based on 50% threshold
- Updates attendance status in real-time

**Bulk Payroll Processing**:
- Enriches attendance before calculation
- Ensures Sundays and Holidays are counted
- Uses weighted calculation for accuracy

**Auto-Checkout Service**:
- Does NOT auto-tag status (safety feature)
- Leaves status unchanged for admin review

### 20.6 Configuration

**Department Timing** (`server/services/enterprise-time-service.ts`):
```typescript
{
  workingHours: 9,           // Used for 50% threshold (9 * 0.5 = 4.5h)
  weekendDays: [0],          // 0 = Sunday (used for enrichment)
  checkInTime: "9:00 AM",
  checkOutTime: "6:00 PM"
}
```

**Payroll Settings**:
- `standardWorkingDays: 26`: Used as salary divisor
- All departments use same 26-day standard

### 20.7 Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| Work exactly 50% (4.5h in 9h) | NOT tagged as half-day (keeps full status) |
| Auto-checkout with 4h worked | Status unchanged, flagged for admin review |
| Sunday + National Holiday | Only one record added (prevents duplicates) |
| Missing weekendDays config | Defaults to `[0]` (Sunday only) |

### 20.8 For Developers

**Key Files**:
1. `server/services/payroll-calculation-service.ts`: Weighted calculation
2. `server/services/unified-attendance-service.ts`: Enrichment functions
3. `server/routes.ts`: Checkout auto-tag + bulk payroll integration

**Testing**:
```bash
# Test half-day auto-tagging
1. Check in at 9:00 AM
2. Check out at 1:00 PM (4 hours)
3. Verify status = 'half_day' automatically

# Test enrichment
1. Process January 2025 payroll
2. Verify 26 actual + 5 Sundays = 31 records
3. Check presentDays includes Sunday count
```

**API Endpoints**:
- `POST /api/attendance/check-out`: Applies auto-tagging
- `POST /api/enhanced-payrolls/bulk-process`: Uses enrichment

---

**End of Documentation**

*For questions or issues, refer to specific sections above or contact the development team.*

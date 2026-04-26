# Employee Management System - Implementation Plan

## Executive Summary
Transforming the employee management system to support admin-controlled employee account creation with comprehensive employee data fields and document management.

---

## Current State Analysis

### ✅ Existing Infrastructure
- User Management page with CRUD operations
- Firebase Authentication system
- UserService with programmatic user creation
- Role-based access control (master_admin, admin, employee)
- Employee form with basic fields

### ❌ Gaps Identified
1. Public signup allows unauthorized registrations
2. Missing statutory fields (ESI, EPF, AADHAR, PAN)
3. No document upload for certificates/marksheets
4. Missing employee lifecycle fields (Date of Leaving, Status transitions)

---

## Implementation Strategy

### Phase 1: Schema Enhancement
**Goal:** Add all missing employee fields to support complete employee lifecycle management

**New Fields to Add:**
- `esiNumber` - ESI IP Number (optional)
- `epfNumber` - EPF UAN Number (optional)
- `aadharNumber` - AADHAR Number (12 digits, optional)
- `panNumber` - PAN Number (10 characters, optional)
- `fatherName` - Father's Name (optional)
- `spouseName` - Spouse Name (optional)
- `educationalQualification` - Education details (optional)
- `experienceYears` - Total experience in years (optional)
- `dateOfLeaving` - Date of leaving (optional)
- `paymentMode` - Payment mode (Cash/Bank/Cheque, optional)
- `documents` - Document URLs for certificates (optional)
- `employeeStatus` - Active/Inactive/On Leave/Resigned/Terminated

**Technical Approach:**
- Extend `shared/schema.ts` with new fields
- Keep all new fields optional for backward compatibility
- Add proper validation (AADHAR 12 digits, PAN format, etc.)

---

### Phase 2: Admin-Controlled User Creation
**Goal:** Remove public signup, give admins complete control over employee account creation

**Strategy: Auto-generate + Password Reset Link**
- When admin creates employee, automatically create Firebase Auth account
- Generate secure random password
- Send password reset email to employee
- Employee sets their own password on first login

**Implementation Steps:**
1. Modify employee creation flow in User Management
2. Add "Create Login Credentials" checkbox to employee form
3. Use existing `userService.createUser()` with auto-generated password
4. Trigger Firebase password reset email
5. Show success message to admin with instructions

**Public Signup Handling:**
- Restrict `/register` route to admin-only access
- Add role check: only master_admin and admin can access
- Regular users attempting to access get redirected to login

---

### Phase 3: Document Management
**Goal:** Allow uploading and managing employee documents (certificates, marksheets, etc.)

**Document Types:**
- Educational certificates (10th, 12th, Graduation, etc.)
- Convocation certificates
- Experience certificates
- ID proofs (AADHAR, PAN copies)
- Bank passbook/cheque copy
- Other relevant documents

**Storage Strategy:**
- Use Firebase Storage (already configured)
- Organized structure: `/employee-documents/{userId}/{documentType}/{filename}`
- Store URLs in user profile under `documents` field
- Support multiple files per category

**Features:**
- Upload multiple files
- Preview uploaded documents
- Delete/replace documents anytime
- Optional field - can be added later
- File type validation (PDF, JPG, PNG)
- File size limit (5MB per file)

---

### Phase 4: Enhanced Employee Form
**Goal:** Update employee form with all new fields, maintaining editability

**Form Sections:**
1. **Personal Information**
   - Name, Father Name, Spouse Name
   - DOB, Gender, Marital Status, Blood Group

2. **Statutory Information** (NEW)
   - ESI IP Number
   - EPF UAN Number
   - AADHAR Number
   - PAN Number

3. **Contact Information**
   - Phone, Emergency Contact
   - Present Address, Permanent Address

4. **Employment Information**
   - Employee Code, Department, Designation
   - Date of Joining, Date of Leaving
   - Status, Reporting Manager

5. **Payroll Information**
   - Payment Mode (Cash/Bank Transfer/Cheque)
   - Bank Details
   - Salary Grade

6. **Professional Information**
   - Educational Qualification
   - Experience Years
   - Skills, Certifications

7. **Document Management** (NEW)
   - Upload certificates
   - Upload marksheets
   - Upload ID proofs

**All fields remain editable at any time** (existing functionality preserved)

---

## Technical Implementation Details

### Database Schema Changes
```typescript
// Add to user schema
esiNumber?: string;
epfNumber?: string;
aadharNumber?: string; // 12 digits
panNumber?: string; // 10 characters uppercase
fatherName?: string;
spouseName?: string;
educationalQualification?: string;
experienceYears?: number;
dateOfLeaving?: Date;
paymentMode?: 'cash' | 'bank' | 'cheque';
employeeStatus?: 'active' | 'inactive' | 'on_leave' | 'resigned' | 'terminated';
documents?: {
  marksheets?: string[];
  certificates?: string[];
  idProofs?: string[];
  bankDocuments?: string[];
  others?: string[];
};
```

### API Endpoints
- `POST /api/users` - Create employee with auto login creation
- `PATCH /api/users/:id` - Update employee (existing, enhanced)
- `POST /api/users/:id/documents` - Upload document
- `DELETE /api/users/:id/documents/:docId` - Remove document

### Security Considerations
- Sensitive fields (AADHAR, PAN) encrypted at rest
- Document access restricted to admin and owner
- Audit trail for all employee data changes
- Password complexity requirements enforced
- Rate limiting on user creation endpoints

---

## Rollout Plan

### Step 1: Schema & Backend (30 mins)
- Update `shared/schema.ts`
- Extend user validation schemas
- Add document handling to storage interface

### Step 2: Backend Services (30 mins)
- Enhance UserService for auto login creation
- Add document upload/delete methods
- Update API routes

### Step 3: Frontend - Form Updates (45 mins)
- Update EmployeeForm with all new fields
- Add validation for AADHAR, PAN formats
- Group fields logically
- Add document upload UI

### Step 4: Frontend - Access Control (15 mins)
- Restrict register page to admins only
- Add user creation flow in User Management
- Update success messages

### Step 5: Testing & Validation (30 mins)
- Test employee creation with login
- Verify all fields are editable
- Test document upload/delete
- Verify access controls

**Total Estimated Time: 2.5 hours**

---

## Success Criteria
✅ Admin can create employee with automatic login credentials
✅ Employee receives password reset email
✅ All fields from images are present and editable
✅ Documents can be uploaded and managed
✅ Public signup is restricted
✅ Backward compatibility maintained
✅ All existing functionality preserved

---

## Risk Mitigation
- **Data Loss:** All changes are additive (new optional fields)
- **Breaking Changes:** Existing code continues to work
- **Security:** Proper validation and access control
- **User Experience:** Clear error messages and loading states

---

*Document Version: 1.0*
*Created: October 2025*
*Status: Ready for Implementation*

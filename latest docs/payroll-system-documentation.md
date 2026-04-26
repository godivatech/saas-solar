# Unified Payroll System Documentation

## 1. System Overview

The EnergyScope Payroll System is a robust, standardized engine designed to handle salary processing, statutory compliance, and financial reporting with high precision. It adheres to a strict "Single Source of Truth" architecture to ensure consistency across all modules.

### Core Principles
-   **Single Source of Truth**: All financial calculations (daily rates, hourly rates, deductions) are centralized in the backend `PayrollHelper` service.
-   **Backend Authority**: The server is the final authority on all numbers. Frontend forms provide "previews" that mimic backend logic but do not determine final payouts.
-   **Configurable Standards**: The system enforces a standard working day divisor (default **26 days**) which is globally configurable via settings.

---

## 2. Calculation Logic (The Math)

The system rejects arbitrary divisors (like 30, 31, or 22) in favor of a standardized approach.

### 2.1 Daily Salary
The daily rate is the foundational unit for all payroll math (leave deductions, pro-rating, etc.).

```typescript
// Formula
Daily Salary = (Fixed Basic + Fixed HRA + Fixed Conveyance) / Standard Working Days

// Example (Standard 26 Days)
// Fixed Salary: 26,000
// Daily Salary = 26,000 / 26 = 1,000
```
*Note: `Standard Working Days` defaults to 26 but can be changed in Payroll Settings.*

### 2.2 Hourly Rate
Used for Overtime (OT) calculations.

```typescript
// Formula
Hourly Rate = Daily Salary / Standard Working Hours

// Example (8 Hour Day)
// Daily Salary: 1,000
// Hourly Rate = 1,000 / 8 = 125
```

### 2.3 Pro-Rata Salary (Partial Months)
When an employee joins mid-month or takes unpaid leave, salary is pro-rated based on the ratio of "Days Worked" to "Standard Days".

```typescript
// Formula
ProRata Ratio = (Present Days + Paid Leave Days) / Standard Working Days
Earned Basic = Fixed Basic * ProRata Ratio
```

---

## 3. Salary Structure Components

An employee's salary is composed of fixed monthly entitlements and dynamic adjustments.

### Fixed Components (Monthly Entitlement)
1.  **Fixed Basic**: The base pay used for EPF calculations.
2.  **Fixed HRA**: House Rent Allowance.
3.  **Fixed Conveyance**: Travel allowance.
4.  **Allowances**: Other fixed monthly additives.

### Deductions
1.  **Statutory**: EPF, ESI, TDS, Professional Tax.
2.  **Organization Specific**:
    *   **Salary Advance**: Flat deduction amount (Not pro-rated).
    *   **Fines**: Flat penalty amount (Not pro-rated).
    *   **Loan Repayment**: EMI deduction.

---

## 4. Statutory Compliance

The system includes a dynamic statutory engine that calculates government-mandated deductions based on configurable rates and thresholds.

### 4.1 EPF (Employee Provident Fund)
-   **Basis**: Calculated on `Earned Basic`.
-   **Configuration**:
    -   `Employee Rate`: Default 12% (Configurable).
    -   `Ceiling Limit`: Default ₹15,000 (Configurable).
-   **Logic**:
    ```typescript
    EPF Basis = Math.min(Earned Basic, EPF Ceiling)
    EPF Deduction = EPF Basis * EPF Rate
    ```

### 4.2 ESI (Employee State Insurance)
-   **Basis**: Calculated on `Gross Salary`.
-   **Configuration**:
    -   `Employee Rate`: Default 0.75% (Configurable).
    -   `Eligibility Threshold`: Default ₹21,000 (Configurable).
-   **Logic**:
    ```typescript
    IF (Gross Salary <= ESI Threshold) THEN
        ESI Deduction = Gross Salary * ESI Rate
    ELSE
        ESI Deduction = 0
    ```

---

## 5. Overtime (OT) Module

Overtime is calculated using a precision-based approach linked to the `PayrollHelper` rates.

-   **Input**: Approved OT hours from the Attendance/OT System.
-   **Multiplier**: Configurable global setting (e.g., 1.0x, 1.5x, 2.0x).
-   **Formula**:
    ```typescript
    OT Pay = OT Hours * Hourly Rate * OT Multiplier
    ```

---

## 6. Implementation & Configuration

### 6.1 Global Settings
Admins can configure the entire engine from the **Payroll Settings** page without code changes:
-   Standard Working Days (26)
-   Standard Working Hours (8)
-   OT Multiplier
-   EPF/ESI Rates & Ceilings
-   Company Details (for Payslips)

### 6.2 Frontend Alignment
The frontend "Create Salary Structure" and "Edit Payroll" forms automatically fetch these global settings. This ensures that the "Preview" shown to HR matches the actual calculation that will happen on the backend.

### 6.3 Advance & Loan Recovery
The system handles salary advances and loans as fixed monthly deductions.

-   **Workflow**:
    1.  Loan approved with `Monthly Deduction Amount` and `Start Date`.
    2.  Each payroll cycle, the system checks active loans where `Current Date >= Start Date`.
    3.  The fixed `Monthly Deduction` is subtracted from Net Salary.
    4.  *Note: This is a flat deduction and is NOT pro-rated based on attendance.*

### 6.4 Leave & LOP (Loss of Pay) Logic
The system distinguishes between Paid Leave and Unpaid Leave (LOP).

-   **Paid Leave (Casual/Sick)**:
    -   Counted as "Present" for salary purposes.
    -   No deduction is made.
-   **Unpaid Leave (LOP)**:
    -   Deduction = `Daily Salary` * `LOP Days`.
    -   This is automatically removed from the `ProRata Ratio`.

### 6.5 Attendance Penalties (Lates/Half Days)
-   **Half Day**: Counted as **0.5 Present Days**.
-   **Late Arrival**: Currently tracked for reporting but counted as "Present" for salary (unless configured otherwise).
-   **Absent**: Counted as **0 Present Days** (Full LOP).

### 6.6 Auto-Checkout & Payroll Blocking
-   **Pending Review**: If an employee is auto-checked out, the record enters a **Pending Review** state.
-   **Impact**: These records are **BLOCKED** from payroll (Counted as 0 days) until an Admin reviews and accepts them.
-   **Reason**: Ensures "untrusted" system-generated data does not result in payouts without verification.

### 6.7 Payslip Generation
The final payslip is a synthesized document combining:
1.  **Earnings**: Basic, HRA, Conveyance, OT (from `PayrollHelper`).
2.  **Deductions**: EPF, ESI, TDS (from Statutory Engine) + Advances.
3.  **Attendance**: Total Days, LOP Days, OT Hours.

---

## 7. Verification Steps
To verify any calculation manually:

1.  **Determine Daily Rate**: Take `Fixed Monthly Salary` / `26` (or active setting).
2.  **Check Attendance**: active days = (Full Days + (Half Days * 0.5) + Paid Leaves).
3.  **Calculate Base**: `Daily Rate` * `active days`.
4.  **Add OT**: `OT Hours` * (`Daily Rate` / 8) * `Multiplier`.
5.  **Subtract Deductions**:
    -   Calculate EPF on Basic (capped).
    -   Calculate ESI on Gross (if eligible).
    -   Subtract flat Loan/Advance amounts.
6.  **Trace**: Compare this final number with the system output. They will match exactly.

---

## 8. Production Safeguards (P1 Fixes)

These safeguards were implemented to ensure data integrity:

### 8.1 Payroll Lock Enforcement (P1.1)
-   **Rule**: Admin cannot approve/reject/adjust attendance reviews for a **locked payroll period**.
-   **Error**: Returns HTTP 403 with message "Cannot modify attendance for a locked payroll period."
-   **Workaround**: Master Admin must unlock the period first.

### 8.2 Leave vs Attendance Conflict (P1.2)
-   **Rule**: Auto-checkout **skips** any record where an approved leave exists for that day.
-   **Logic**: Leave always wins over attendance.
-   **Log**: Console shows "Skipping record - Approved leave exists for this day".

### 8.3 Pending Review Warning (P1.3)
-   **Rule**: Payroll generation is **blocked** if pending review records exist for the target month.
-   **Error**: Returns HTTP 409 with `pendingCount` and list of affected records.
-   **Override**: Set `forceProceed: true` in the request body to generate payroll anyway (days will be excluded).

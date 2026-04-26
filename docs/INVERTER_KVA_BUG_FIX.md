# Inverter KVA Type Mismatch Bug - Technical Analysis & Solution

**Document Version:** 1.0  
**Date:** November 28, 2025  
**Author:** Senior Developer  
**Status:** Implementation Ready  

---

## Executive Summary

This document provides a comprehensive analysis of a critical type mismatch bug in the solar quotation system where `inverterKVA` (inverter capacity in KVA for off-grid and hybrid systems) is sent as a number from the form but the schema expects a string, causing validation failures during manual quotation creation.

---

## 1. Problem Statement

### 1.1 Primary Issue
When creating a manual quotation for **off-grid** or **hybrid** project types, the form's onChange handler uses `parseFloat()` to convert the inverterKVA input value, sending it as a **number** type to the backend. However, the Zod schema in `shared/schema.ts` expects `inverterKVA` to be a **string** type.

**Result:** Schema validation fails, quotation creation is rejected, and users cannot create off-grid/hybrid quotations manually.

### 1.2 Secondary Issue
The default project values in `quotation-creation.tsx` use `inverterKW: 3` (a number field) instead of `inverterKVA: "3"` (the string field) for off-grid and hybrid project types.

### 1.3 Impact on BOM (Bill of Materials)
The `inverterKVA` value directly affects:
- **Cable Quantity Calculations:** DC Cable (20m/40m) and AC Cable (15m/30m) based on >10 threshold
- **Component Ratings:** Inverter, ACDB, DCDB ratings in BOM table
- **Electrical Accessories:** Quantity calculations

---

## 2. Root Cause Analysis

### 2.1 Schema Definition (shared/schema.ts)

```typescript
// Off-grid project schema expects STRING for inverterKVA
export const quotationOffGridProjectSchema = z.object({
  // ... other fields
  inverterKVA: z.string(),  // ← Expects STRING
  // ...
});

// Hybrid project schema also expects STRING
export const quotationHybridProjectSchema = z.object({
  // ... other fields
  inverterKVA: z.string(),  // ← Expects STRING
  // ...
});
```

### 2.2 Form onChange Handler (quotation-creation.tsx, lines 1866-1872)

```typescript
// BUG: parseFloat sends NUMBER instead of STRING
onChange={(e) => {
  const value = e.target.value;
  form.setValue(
    `projects.${projectIndex}.inverterKVA`, 
    parseFloat(value) || 0  // ← WRONG: Sends NUMBER
  );
}}
```

### 2.3 Default Values (quotation-creation.tsx, lines 1002, 1039)

```typescript
// BUG: Uses inverterKW (number) instead of inverterKVA (string)
const defaultOffGridProject = {
  // ...
  inverterKW: 3,  // ← WRONG: Should be inverterKVA: "3"
  // ...
};

const defaultHybridProject = {
  // ...
  inverterKW: 3,  // ← WRONG: Should be inverterKVA: "3"
  // ...
};
```

---

## 3. Complete Data Flow Analysis

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           END-TO-END DATA FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STAGE 1: SITE VISIT FORM (Input)                                           │
│  └─ marketing-site-visit-form.tsx                                           │
│     ├─ Has BOTH inverterKW (number) AND inverterKVA (string) ⚠️             │
│     └─ Redundant/confusing for users                                        │
│                                                                             │
│  STAGE 2: SITE VISIT DISPLAY                                                │
│  └─ site-visit-details-modal.tsx                                            │
│     └─ Shows "Inverter KW" for off-grid/hybrid (should show KVA) ⚠️         │
│                                                                             │
│  STAGE 3: QUOTATION MAPPING SERVICE (Transformation)                        │
│  └─ quotation-mapping-service.ts                                            │
│     ├─ mapOffGridProject: Uses config.inverterKW but also maps              │
│     │  inverterKVA separately ⚠️                                            │
│     └─ mapHybridProject: Same issue ⚠️                                      │
│                                                                             │
│  STAGE 4: QUOTATION CREATION FORM (Manual Entry)                            │
│  └─ quotation-creation.tsx                                                  │
│     ├─ Default values use inverterKW: 3 (number) instead of                 │
│     │  inverterKVA: "3" (string) ❌ CRITICAL BUG                             │
│     └─ onChange handler sends inverterKVA as number ❌ CRITICAL BUG          │
│                                                                             │
│  STAGE 5: SCHEMA VALIDATION                                                 │
│  └─ shared/schema.ts                                                        │
│     ├─ quotationOffGridProjectSchema: inverterKVA: z.string()               │
│     └─ quotationHybridProjectSchema: inverterKVA: z.string()                │
│     └─ Form sends NUMBER → Schema expects STRING ❌ VALIDATION FAILS         │
│                                                                             │
│  STAGE 6: API ROUTE (Backend Validation)                                    │
│  └─ server/routes/quotations.ts                                             │
│     └─ Uses insertQuotationSchema.parse() → FAILS due to type mismatch      │
│                                                                             │
│  STAGE 7: TEMPLATE SERVICE (PDF/BOM Generation)                             │
│  └─ quotation-template-service.ts                                           │
│     ├─ Uses (project as any).inverterKVA || project.inverterKW ⚠️           │
│     └─ Fallback logic works but inconsistent                                │
│                                                                             │
│  STAGE 8: PDF SERVICE (Output)                                              │
│  └─ quotation-pdf-service.ts                                                │
│     └─ Displays inverterKVA or inverterKW based on availability             │
│                                                                             │
│  STAGE 9: QUOTATION LIST/VIEW                                               │
│  └─ quotations.tsx                                                          │
│     └─ Only shows inverterKW, never inverterKVA for off-grid/hybrid ⚠️      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. BOM (Bill of Materials) Impact

### 4.1 Cable Quantity Calculations

The `inverterKVA` value directly determines cable lengths:

```typescript
// quotation-template-service.ts, Lines 784, 797, 992, 1005

// DC Cable calculation
const dcCableQty = parseFloat(inverterKVA) > 10 ? 40 : 20;
// Result: 40 meters if inverter > 10 KVA, else 20 meters

// AC Cable calculation  
const acCableQty = parseFloat(inverterKVA) > 10 ? 30 : 15;
// Result: 30 meters if inverter > 10 KVA, else 15 meters
```

### 4.2 Component Ratings

| BOM Component | Field Usage | Impact |
|--------------|-------------|--------|
| Solar Inverter | `rating: \`${inverterKVA}\`` | Shows inverter capacity |
| ACDB with MCB | `rating: \`${inverterKVA}\`` | Circuit breaker sizing |
| DCDB with MCB | `rating: \`${inverterKVA}\`` | DC protection sizing |
| Electrical Accessories | `qty: inverterKVA` | Accessory count |

### 4.3 Current Fallback Logic

The template service has smart fallback that prevents complete failure:

```typescript
// Lines 693-694, 903-904
const inverterKVA = (project as any).inverterKVA || project.inverterKW || panelSystemKW;
```

**However:** This fallback masks the underlying issue - users don't get their intended values.

---

## 5. Affected Files Summary

| File | Issue | Severity | Fix Required |
|------|-------|----------|--------------|
| `client/src/pages/quotation-creation.tsx` | Sends inverterKVA as number, wrong defaults | 🔴 CRITICAL | Yes |
| `shared/schema.ts` | Has both inverterKW and inverterKVA | 🟡 MEDIUM | Review |
| `client/src/components/site-visit/site-visit-details-modal.tsx` | Shows "KW" instead of "KVA" | 🟡 MEDIUM | Yes |
| `client/src/components/site-visit/marketing-site-visit-form.tsx` | Redundant fields | 🟡 MEDIUM | Optional |
| `client/src/pages/quotations.tsx` | Only displays inverterKW | 🟡 MEDIUM | Yes |
| `server/services/quotation-mapping-service.ts` | Fallback logic | 🟢 LOW | Verify |
| `server/services/quotation-template-service.ts` | parseFloat handling | 🟢 LOW | Verify |
| `server/services/quotation-pdf-service.ts` | Handles both fields | 🟢 LOW | No change |

---

## 6. Solution Approach

### 6.1 Immediate Fix (Option A - Minimal Changes)

Fix the type mismatch while maintaining backward compatibility:

1. **Fix onChange handler** - Send string instead of number
2. **Fix default values** - Use inverterKVA: "3" for off-grid/hybrid
3. **Update UI displays** - Show correct unit labels
4. **Verify BOM calculations** - Ensure parseFloat handles strings correctly

### 6.2 Enterprise Solution (Option B - Future-Proof) [RECOMMENDED]

Unify the redundant fields with a single source of truth:

```typescript
// Proposed unified structure
inverterCapacity: {
  value: number,      // Numeric value for calculations
  unit: "KW" | "KVA"  // Auto-set based on project type
}

// Business Rules:
// on_grid   → unit = "KW"  (grid-tied, power factor ~1)
// off_grid  → unit = "KVA" (battery systems, PF varies)
// hybrid    → unit = "KVA" (battery + grid)
```

---

## 7. Implementation Plan

### Phase 1: Critical Bug Fixes (Immediate)

| Task | File | Change |
|------|------|--------|
| 1.1 | quotation-creation.tsx | Fix onChange to send string: `value` instead of `parseFloat(value)` |
| 1.2 | quotation-creation.tsx | Update off-grid default: `inverterKVA: "3"` |
| 1.3 | quotation-creation.tsx | Update hybrid default: `inverterKVA: "3"` |

### Phase 2: UI Consistency Fixes

| Task | File | Change |
|------|------|--------|
| 2.1 | site-visit-details-modal.tsx | Display "Inverter KVA" for off-grid/hybrid |
| 2.2 | quotations.tsx | Show inverterKVA in list view for off-grid/hybrid |

### Phase 3: Cleanup & Verification

| Task | File | Change |
|------|------|--------|
| 3.1 | quotation-template-service.ts | Verify parseFloat handles string correctly |
| 3.2 | marketing-site-visit-form.tsx | Consider consolidating KW/KVA fields |
| 3.3 | All | End-to-end testing |

---

## 8. Code Changes

### 8.1 Fix: quotation-creation.tsx - onChange Handler

**Before (BUGGY):**
```typescript
onChange={(e) => {
  const value = e.target.value;
  form.setValue(
    `projects.${projectIndex}.inverterKVA`, 
    parseFloat(value) || 0  // Sends NUMBER
  );
}}
```

**After (FIXED):**
```typescript
onChange={(e) => {
  const value = e.target.value;
  form.setValue(
    `projects.${projectIndex}.inverterKVA`, 
    value || "0"  // Sends STRING
  );
}}
```

### 8.2 Fix: quotation-creation.tsx - Default Values

**Before (BUGGY):**
```typescript
const defaultOffGridProject = {
  inverterKW: 3,  // Wrong field, wrong type
};
```

**After (FIXED):**
```typescript
const defaultOffGridProject = {
  inverterKVA: "3",  // Correct field, correct type (string)
};
```

---

## 9. Testing Checklist

### 9.1 Manual Testing

- [ ] Create off-grid quotation manually → Should succeed
- [ ] Create hybrid quotation manually → Should succeed
- [ ] Enter inverterKVA = 5 → BOM shows DC Cable: 20m, AC Cable: 15m
- [ ] Enter inverterKVA = 15 → BOM shows DC Cable: 40m, AC Cable: 30m
- [ ] Generate PDF → Shows correct inverter capacity
- [ ] View quotation list → Shows inverterKVA for off-grid/hybrid

### 9.2 Edge Cases

- [ ] Empty inverterKVA field → Should default to calculated value
- [ ] Decimal values (e.g., "7.5") → Should work correctly
- [ ] Very large values (e.g., "100") → Should trigger >10 cable logic

---

## 10. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Existing quotations with inverterKW | Medium | Low | Fallback logic preserves functionality |
| Schema validation breaks other flows | Low | High | Testing site visit → quotation flow |
| BOM calculations affected | Low | Medium | Verify parseFloat handling |

---

## 11. Rollback Plan

If issues arise post-implementation:

1. Revert the three changed files via git
2. Template service fallback will continue working
3. Users can continue using site visit → quotation flow

---

## 12. Implementation Summary

### Changes Made:

#### 1. quotation-creation.tsx
- **Fixed onChange handler (lines 1871-1897):** For off-grid/hybrid:
  - Sets `inverterKVA` as STRING (schema expects z.string())
  - Sets `inverterKW` as NUMBER (for pricing utilities compatibility)
  - For on-grid: Sets `inverterKW` as NUMBER only
- **Fixed default values (lines 1005-1006, 1043-1044):** Added BOTH fields for off-grid and hybrid:
  - `inverterKW: 3` (number for pricing calculations)
  - `inverterKVA: "3"` (string for schema validation)

#### 2. site-visit-details-modal.tsx
- **Fixed off-grid display (lines 950-955):** Now shows "Inverter KVA" with fallback to inverterKW
- **Fixed hybrid display (lines 1150-1155):** Now shows "Inverter KVA" with fallback to inverterKW

#### 3. quotations.tsx
- **Fixed capacity display (lines 962-976):** Conditionally shows KVA for off-grid/hybrid and kW for on-grid

### Not Changed (By Design):
- **marketing-site-visit-form.tsx:** Has both `inverterKW` (dropdown with phase auto-selection) and `inverterKVA` (text input) fields intentionally. The template service's fallback logic (`inverterKVA || inverterKW`) handles this correctly.

### BOM Cable Calculations Verified:
- `parseFloat(inverterKVA)` correctly handles string values
- DC Cable: 20m if ≤10 KVA, 40m if >10 KVA
- AC Cable: 15m if ≤10 KVA, 30m if >10 KVA

## 13. Conclusion

This bug fix addresses a critical validation failure that prevents manual quotation creation for off-grid and hybrid projects. The solution maintains backward compatibility through existing fallback logic while ensuring correct data types throughout the application.

**Implementation Date:** November 28, 2025  
**Risk Level:** Low (due to existing fallback logic)  
**Business Impact:** High (unblocks quotation creation)

---

*Document prepared for senior review and implementation approval.*

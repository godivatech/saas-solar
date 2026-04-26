# 🔍 COMPREHENSIVE ANALYSIS: Off-Grid & Hybrid Quotation Implementation

**Document Date:** October 24, 2025  
**Project:** Godiva Solar - Solar Quotation System  
**Purpose:** Deep analysis of all required changes for Off-Grid and Hybrid quotation enhancements

---

## 📊 TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [Current System Architecture](#current-system-architecture)
3. [Data Flow Analysis](#data-flow-analysis)
4. [Schema Analysis](#schema-analysis)
5. [Missing Features & Issues](#missing-features--issues)
6. [Files That Need Changes](#files-that-need-changes)
7. [Implementation Plan](#implementation-plan)
8. [Testing Checklist](#testing-checklist)
9. [Risk Analysis](#risk-analysis)

---

## 1. EXECUTIVE SUMMARY

### ✅ What's Working (On-Grid)
- Dynamic BOM generation with real site visit data
- Proper GST calculations (Base Price + GST = Total)
- Subsidy calculations for residential properties
- PDF generation with professional templates
- Quotation creation from site visits
- Form-based quotation entry
- Preview and download functionality

### ⚠️ What Needs Implementation (Off-Grid/Hybrid)
1. **Dynamic Description Generation** - Currently static, needs to be built from component values
2. **BOM Header Enhancement** - Missing Batt. AH and DC Volt columns
3. **Inverter KVA Support** - Currently only using KW, need KVA field
4. **Backup Solutions Table** - Completely new feature for off-grid/hybrid
5. **Water Pump Template** - Different format with consolidated description
6. **Water Heater Template** - Image-based format

---

## 2. CURRENT SYSTEM ARCHITECTURE

### 2.1 Backend Architecture

```
┌─────────────────────────────────────────────────────┐
│                  CLIENT REQUEST                      │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│         server/routes/quotations.ts                 │
│  - POST /api/quotations (Create)                    │
│  - GET /api/quotations/:id (Read)                   │
│  - GET /api/quotations/:id/pdf (Generate PDF)       │
│  - GET /api/quotations/:id/preview (HTML Preview)   │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│   server/services/quotation-mapping-service.ts     │
│  - Maps site visit data to quotation format         │
│  - Applies business rules (pricing, subsidy)        │
│  - Validates data completeness                      │
│  METHODS:                                           │
│    • mapToQuotation()                               │
│    • mapOnGridProject()                             │
│    • mapOffGridProject() ⚠️ NEEDS ENHANCEMENT       │
│    • mapHybridProject() ⚠️ NEEDS ENHANCEMENT        │
│    • mapWaterHeaterProject()                        │
│    • mapWaterPumpProject()                          │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  server/services/quotation-template-service.ts     │
│  - Generates BOM for each project type              │
│  - Calculates pricing breakdown                     │
│  - Prepares template data structure                 │
│  METHODS:                                           │
│    • generateBillOfMaterials()                      │
│    • generateOnGridBOM() ✅                         │
│    • generateOffGridBOM() ⚠️ NEEDS CHANGES          │
│    • generateHybridBOM() ⚠️ NEEDS CHANGES           │
│    • generateWaterHeaterBOM() ⚠️ NEEDS CHANGES      │
│    • generateWaterPumpBOM() ⚠️ NEEDS CHANGES        │
│    • calculatePricingBreakdown()                    │
│    • calculateSubsidy()                             │
│    • calculateSystemKW()                            │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│    server/services/quotation-pdf-service.ts        │
│  - Generates HTML content for PDF                   │
│  - Converts HTML to PDF (using Puppeteer)           │
│  METHODS:                                           │
│    • generateHTMLContent() ⚠️ NEEDS CHANGES         │
│    • generateHTMLPreview()                          │
│    • generatePDF()                                  │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│                   PDF OUTPUT                        │
└─────────────────────────────────────────────────────┘
```

### 2.2 Frontend Architecture

```
┌─────────────────────────────────────────────────────┐
│     client/src/pages/quotation-creation.tsx        │
│  - Main quotation creation page                     │
│  - Multi-step wizard interface                      │
│  - Handles both manual and site visit sources       │
│  FEATURES:                                          │
│    • Customer selection/creation                    │
│    • Project configuration forms ⚠️ NEEDS CHANGES   │
│    • Pricing calculations                           │
│    • Preview and submission                         │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  client/src/components/site-visit/                 │
│         marketing-site-visit-form.tsx              │
│  - Site visit form for marketing department         │
│  - Captures project configuration                   │
│  SECTIONS:                                          │
│    • On-Grid Configuration ✅                       │
│    • Off-Grid Configuration ⚠️ NEEDS inverterKVA    │
│    • Hybrid Configuration ⚠️ NEEDS inverterKVA      │
│    • Water Heater Configuration                     │
│    • Water Pump Configuration                       │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│         client/src/pages/quotations.tsx            │
│  - Lists all quotations                             │
│  - Provides preview and download actions            │
└─────────────────────────────────────────────────────┘
```

### 2.3 Data Schema Layer

```
┌─────────────────────────────────────────────────────┐
│              shared/schema.ts                       │
│  - Defines all Zod schemas                          │
│  CRITICAL SCHEMAS:                                  │
│    • marketingProjectTypes                          │
│    • onGridConfigSchema ✅                          │
│    • offGridConfigSchema ⚠️ NEEDS inverterKVA       │
│    • hybridConfigSchema ⚠️ NEEDS inverterKVA        │
│    • waterHeaterConfigSchema                        │
│    • waterPumpConfigSchema                          │
│    • quotationOnGridProjectSchema                   │
│    • quotationOffGridProjectSchema ⚠️               │
│    • quotationHybridProjectSchema ⚠️                │
│    • quotationWaterHeaterProjectSchema              │
│    • quotationWaterPumpProjectSchema                │
│    • insertQuotationSchema                          │
└─────────────────────────────────────────────────────┘
```

---

## 3. DATA FLOW ANALYSIS

### 3.1 Site Visit → Quotation Flow

```
1. User creates site visit
   ↓
2. Marketing form captures configuration
   - Panel details (watts, count, type, make)
   - Inverter details (KW/KVA, phase, make, qty)
   - Battery details (brand, AH, voltage, count) [OFF-GRID/HYBRID]
   - Structure type
   - Accessories (earthing, lightning, electrical)
   ↓
3. Site visit saved to Firestore
   ↓
4. User clicks "Create Quotation" from site visit
   ↓
5. quotation-mapping-service.ts processes data
   - Validates completeness
   - Applies business rules
   - Maps to quotation format
   ↓
6. quotation-template-service.ts generates template
   - Builds BOM ⚠️ NEEDS ENHANCEMENT
   - Calculates pricing
   - Prepares description ⚠️ NEEDS TO BE DYNAMIC
   ↓
7. quotation-pdf-service.ts renders PDF
   - HTML generation ⚠️ NEEDS NEW TABLES
   - PDF conversion
   ↓
8. User downloads/previews quotation
```

### 3.2 Manual Quotation Creation Flow

```
1. User goes to /quotations/new
   ↓
2. Fills quotation-creation form
   - Customer selection
   - Project configuration ⚠️ NEEDS inverterKVA FIELD
   - Pricing setup
   ↓
3. Form validates via Zod schema
   ↓
4. POST /api/quotations
   ↓
5. Same template generation process as above
```

---

## 4. SCHEMA ANALYSIS

### 4.1 Current Off-Grid Schema

**Location:** `shared/schema.ts` lines 382-390

```typescript
export const offGridConfigSchema = onGridConfigSchema.extend({
  batteryBrand: z.enum(batteryBrands),        // ✅ EXISTS
  batteryType: z.enum(batteryTypes).optional(), // ✅ EXISTS
  batteryAH: z.enum(batteryAHOptions).optional(), // ✅ EXISTS
  voltage: z.number().min(0),                 // ✅ EXISTS (Battery Voltage)
  batteryCount: z.number().min(1),            // ✅ EXISTS
  batteryStands: z.string().optional(),       // ✅ EXISTS
  inverterVolt: z.string().optional(),        // ✅ EXISTS
  // ❌ MISSING: inverterKVA
}).omit({ netMeterScope: true });
```

**Location:** `shared/schema.ts` lines 1493-1541

```typescript
export const quotationOffGridProjectSchema = z.object({
  projectType: z.literal("off_grid"),
  systemKW: z.number().min(0.1),
  pricePerKW: z.number().min(0),
  // ... all panel fields ...
  inverterMake: z.array(z.enum(inverterMakes)).default([]),
  inverterKW: z.number().min(0).optional(),   // ✅ EXISTS
  // ❌ MISSING: inverterKVA
  inverterQty: z.number().min(1).optional(),
  inverterPhase: z.enum(inverterPhases),
  inverterVolt: z.string().optional(),        // ✅ EXISTS
  batteryBrand: z.enum(batteryBrands),
  batteryType: z.enum(batteryTypes).optional(),
  batteryAH: z.enum(batteryAHOptions).optional(),
  voltage: z.number().min(0),
  batteryCount: z.number().min(1),
  // ... rest of fields ...
  // ❌ MISSING: backupSolutions object
});
```

### 4.2 What Needs to Be Added

#### A. inverterKVA Field

**Purpose:** Off-grid and hybrid inverters are rated in KVA, not KW

**Add to:**
1. `offGridConfigSchema` (for site visit form)
2. `hybridConfigSchema` (for site visit form)
3. `quotationOffGridProjectSchema` (for quotation projects)
4. `quotationHybridProjectSchema` (for quotation projects)

**Schema Definition:**
```typescript
inverterKVA: z.string().optional() // String to allow custom values like "1.5"
```

#### B. backupSolutions Schema

**Purpose:** Calculate backup hours based on battery capacity and load

**New Schema:**
```typescript
export const backupSolutionsSchema = z.object({
  backupWatts: z.number().min(0), // Calculated: (batteryAH × 10 × batteryQty) - 3%
  usageWatts: z.array(z.number()).max(5), // Manual input, up to 5 columns
  backupHours: z.array(z.number()) // Auto-calculated: backupWatts ÷ usageWatts[i]
});
```

**Add to:**
- `quotationOffGridProjectSchema`
- `quotationHybridProjectSchema`

---

## 5. MISSING FEATURES & ISSUES

### 5.1 Issue #1: Dynamic Description (Image 2)

**Current State:**
```typescript
// In quotation-template-service.ts line 1101
description = `Supply and Installation of ${Math.floor(kw)} kW Solar Off-Grid System with ${project.batteryCount || 1} x ${project.batteryAH || 100}AH Battery`;
```

**Required State:**
```typescript
description = `Supply and Installation of ${panelWatts}W X ${panelCount} Nos Panel, ${inverterKVA}KVA/${batteryVolt}v ${phase}PH MPPT Inverter, ${batteryAH}AH X ${batteryCount}, ${phase}-Phase Offgrid Solar System`;
```

**Example:**
- Current: "Supply and Installation of 0 kW Solar Off-Grid System with 2 x 100AH Battery"
- Required: "Supply and Installation of 340W X 2 Nos Panel, 1KVA/24v 1PH MPPT Inverter, 100AH X 2, 1-Phase Offgrid Solar System"

**Files to Change:**
- `server/services/quotation-template-service.ts` (calculatePricingBreakdown method, lines 1080-1102)

---

### 5.2 Issue #2: BOM Header Missing Columns (Image 3)

**Current BOM Header (On-Grid):**
```
| Phase | Inverter-KW | Panel Watts |
|   1   |      3      |    3240     |
```

**Required BOM Header (Off-Grid/Hybrid):**
```
| Phase | Inverter-KVA | Panel Watts | Batt. AH | DC Volt |
|   1   |      1       |     680     |   100    |   24    |
```

**Calculations:**
- **Phase:** From `inverterPhase` (single_phase = 1, three_phase = 3)
- **Inverter-KVA:** From new `inverterKVA` field
- **Panel Watts:** `panelWatts × panelCount`
- **Batt. AH:** From `batteryAH` field
- **DC Volt:** `batteryVolt × batteryQty`

**Files to Change:**
1. `server/services/quotation-template-service.ts`
   - Update `generateQuotationTemplate()` method (lines 1229-1248)
   - Create separate bomSummary for off-grid and hybrid
   
2. `server/services/quotation-pdf-service.ts`
   - Update HTML template generation (lines 453-466)
   - Add conditional rendering for off-grid/hybrid BOM header

---

### 5.3 Issue #3: Inverter Rating Display (Image 4)

**Current:**
```typescript
// In generateOffGridBOM() line 554
rating: `${inverterKW}KW`
```

**Required:**
- For OFF-GRID: Use KVA instead of KW
- For HYBRID: Use KVA instead of KW
- For ON-GRID: Continue using KW (no change needed)

**Example BOM Row:**
```
Sl.no: 2
Description: Solar Offgrid Inverter
Type: MPPT
Volt: 24 (from inverterVolt)
Rating: 1 KVA ← Changed from "1 KW"
Make: UTL
Qty: 1
Unit: Nos
```

**Files to Change:**
- `server/services/quotation-template-service.ts`
  - `generateOffGridBOM()` method (around line 545-558)
  - `generateHybridBOM()` method (around line 754-767)

---

### 5.4 Issue #4: Battery Row Format (Image 4)

**Current:**
```typescript
// Line 560-570
items.push({
  slNo: slNo++,
  description: `${project.batteryBrand || 'Exide'} Battery`,
  type: project.batteryType || 'Lead Acid',
  volt: `${project.voltage || 12}V`,
  rating: `${project.batteryAH || '100'}AH`, // ✅ Correct format
  make: project.batteryBrand || 'Exide',
  qty: project.batteryCount || 1,
  unit: "Nos"
});
```

**Required Changes:**
- Type: Should be "LA" for Lead Acid (not "Lead Acid")
- Rating: Already correct with AH unit

**Files to Change:**
- `server/services/quotation-template-service.ts`
  - Update type mapping in `generateOffGridBOM()` (line 564)
  - Update type mapping in `generateHybridBOM()` (line 773)

---

### 5.5 Issue #5: Backup Solutions Table (Image 5)

**Current State:** DOES NOT EXIST

**Required:**
```
┌─────────────────────────────────────────────────────┐
│              Backup Solutions                       │
├─────────────────────────────────────────────────────┤
│  *During fully Charged Condition                    │
│  *With Efficiency of 80%                            │
├─────────────────────────────────────────────────────┤
│  Back up Watts  │ 1920 (editable)                   │
├─────────────────┬───────┬───────┬───────┬───────────┤
│  Usage Watts    │  800  │  750  │  550  │  450  │ 200
├─────────────────┼───────┼───────┼───────┼───────────┤
│  Back up Hours  │ 2.40  │ 2.56  │ 3.49  │ 4.27  │ 9.60
└─────────────────┴───────┴───────┴───────┴───────────┘
```

**Calculation Logic:**
```typescript
// Step 1: Calculate Backup Watts
// Assume 1 AH = 10 Watts
const baseWatts = batteryAH * 10 * batteryQty;
// Subtract 3% loss
const backupWatts = baseWatts - (baseWatts * 0.03);
// Example: 100AH × 10 × 2 = 2000, then 2000 - 60 = 1940

// Step 2: Usage Watts (Manual Input)
// User enters up to 5 different load values

// Step 3: Backup Hours (Auto-calculated)
// For each usage watts column:
backupHours[i] = backupWatts / usageWatts[i];
```

**Where to Add:**
1. **Schema** (`shared/schema.ts`):
   ```typescript
   backupSolutions: z.object({
     backupWatts: z.number().min(0),
     usageWatts: z.array(z.number()).max(5),
     backupHours: z.array(z.number())
   }).optional()
   ```

2. **Backend Service** (`quotation-template-service.ts`):
   ```typescript
   static calculateBackupSolutions(project: any): BackupSolutions {
     const batteryAH = parseInt(project.batteryAH || '100');
     const batteryQty = project.batteryCount || 1;
     const baseWatts = batteryAH * 10 * batteryQty;
     const backupWatts = Math.round(baseWatts - (baseWatts * 0.03));
     
     // Default usage watts if not provided
     const usageWatts = project.backupSolutions?.usageWatts || [800, 750, 550, 450, 200];
     
     // Calculate backup hours
     const backupHours = usageWatts.map(usage => 
       Math.round((backupWatts / usage) * 100) / 100
     );
     
     return { backupWatts, usageWatts, backupHours };
   }
   ```

3. **PDF Template** (`quotation-pdf-service.ts`):
   - Add new HTML table rendering after BOM table
   - Only show for off-grid and hybrid projects

4. **Frontend Form** (`quotation-creation.tsx`):
   - Add backup solutions input section
   - Auto-calculate backup watts
   - Allow manual entry of up to 5 usage watts values
   - Display calculated backup hours

---

### 5.6 Issue #6: Water Pump Template (Images 6-7)

**Current:** Uses standard BOM table format

**Required:** Consolidated description format

**Example:**
```
┌────────────────────────────────────────────────────┐
│ Sl  │ Description                │ QTY │ Rate/Qty │
│ No  │                            │     │  Amount  │
├─────┼────────────────────────────┼─────┼──────────┤
│  1  │ Supply and Installation    │  1  │ 2,30,000 │
│     │ solar power                │     │ 2,30,000 │
│     │                            │     │          │
│     │ System Includes:5 hp Drive │     │          │
│     │                            │     │          │
│     │ 5 kw 540Wp x 10 Nos UTL    │     │          │
│     │ Panel, 5 hp Drive          │     │          │
│     │                            │     │          │
│     │ 3 phase, 5 kw Structure    │     │          │
│     │                            │     │          │
│     │ Structure 3 feet lower to  │     │          │
│     │ 4 feet higher              │     │          │
│     │                            │     │          │
│     │ Earth kit, Lighting        │     │          │
│     │ Arrester,                  │     │          │
│     │                            │     │          │
│     │ DC Cable, Electrical       │     │          │
│     │ Accessories,               │     │          │
│     │                            │     │          │
│     │ Labour and Transport       │     │          │
└─────┴────────────────────────────┴─────┴──────────┘
```

**Files to Change:**
1. `server/services/quotation-template-service.ts`
   - Create new method: `generateConsolidatedDescription(project: WaterPumpProject): string`

2. `server/services/quotation-pdf-service.ts`
   - Add special template rendering for water pump projects
   - Different table structure

---

### 5.7 Issue #7: Water Heater Template (Image 8)

**Current:** Standard BOM table

**Required:** Image-based format

**Table Structure:**
```
| SINo | Image | Description | Price | Qty | Amount |
```

**Description Format:**
```
Supply and Installation of
Venus make solar water
heater 500 LPD commercial
Non-Pressurized with
corrosion resistant epoxy
Coated inner tank and
powder coated outer tank.
Heating Coil
And Transport Including GST

Installation On - 2nd Floor
```

**Files to Change:**
1. **Schema** (`shared/schema.ts`):
   - Add `productImage: z.string().optional()` to waterHeaterConfigSchema

2. **PDF Service** (`quotation-pdf-service.ts`):
   - Add image column support in HTML template
   - Render product image if available
   - Format description properly

---

## 6. FILES THAT NEED CHANGES

### 6.1 Critical Files (MUST CHANGE)

| File | Lines | Changes Required |
|------|-------|------------------|
| `shared/schema.ts` | 382-395 | Add `inverterKVA` to offGridConfigSchema |
| `shared/schema.ts` | 392-395 | Add `inverterKVA` to hybridConfigSchema |
| `shared/schema.ts` | 1493-1541 | Add `inverterKVA` and `backupSolutions` to quotationOffGridProjectSchema |
| `shared/schema.ts` | 1543-1593 | Add `inverterKVA` and `backupSolutions` to quotationHybridProjectSchema |
| `shared/schema.ts` | NEW | Create `backupSolutionsSchema` |
| `shared/schema.ts` | 1595-1614 | Add `productImage` to quotationWaterHeaterProjectSchema |
| `server/services/quotation-template-service.ts` | 477-681 | Update `generateOffGridBOM()` to use KVA |
| `server/services/quotation-template-service.ts` | 686-890 | Update `generateHybridBOM()` to use KVA |
| `server/services/quotation-template-service.ts` | 1080-1102 | Update off-grid description to be dynamic |
| `server/services/quotation-template-service.ts` | 1104-1126 | Update hybrid description to be dynamic |
| `server/services/quotation-template-service.ts` | 1229-1248 | Create bomSummary for off-grid/hybrid with new columns |
| `server/services/quotation-template-service.ts` | NEW | Add `calculateBackupSolutions()` method |
| `server/services/quotation-template-service.ts` | 895-950 | Update `generateWaterHeaterBOM()` for image support |
| `server/services/quotation-template-service.ts` | 955-1033 | Update `generateWaterPumpBOM()` for consolidated description |
| `server/services/quotation-pdf-service.ts` | 453-466 | Update BOM header rendering for off-grid/hybrid |
| `server/services/quotation-pdf-service.ts` | NEW | Add backup solutions table rendering |
| `server/services/quotation-pdf-service.ts` | NEW | Add special water pump template |
| `server/services/quotation-pdf-service.ts` | NEW | Add special water heater template with image column |
| `client/src/components/site-visit/marketing-site-visit-form.tsx` | 1300-1550 | Add inverterKVA input for off-grid |
| `client/src/components/site-visit/marketing-site-visit-form.tsx` | 1550-1900 | Add inverterKVA input for hybrid |
| `client/src/pages/quotation-creation.tsx` | 2000-3000 | Add inverterKVA field to project forms |
| `client/src/pages/quotation-creation.tsx` | NEW | Add backup solutions input section |

### 6.2 Secondary Files (MAY NEED CHANGES)

| File | Purpose | Likelihood |
|------|---------|------------|
| `server/services/quotation-mapping-service.ts` | May need to map inverterKVA from site visit | HIGH |
| `server/services/site-visit-service.ts` | May need to handle new fields | MEDIUM |
| `server/storage.ts` | Type definitions may need updates | LOW |

---

## 7. IMPLEMENTATION PLAN

### Phase 1: Schema Foundation (Priority: CRITICAL)

**Duration:** 1-2 hours  
**Risk:** LOW (changes are additive, won't break existing)

**Tasks:**
1. Add `inverterKVA: z.string().optional()` to:
   - `offGridConfigSchema`
   - `hybridConfigSchema`
   - `quotationOffGridProjectSchema`
   - `quotationHybridProjectSchema`

2. Create new schema:
   ```typescript
   export const backupSolutionsSchema = z.object({
     backupWatts: z.number().min(0),
     usageWatts: z.array(z.number()).max(5).default([]),
     backupHours: z.array(z.number()).default([])
   });
   ```

3. Add `backupSolutions: backupSolutionsSchema.optional()` to:
   - `quotationOffGridProjectSchema`
   - `quotationHybridProjectSchema`

4. Add `productImage: z.string().optional()` to:
   - `waterHeaterConfigSchema`
   - `quotationWaterHeaterProjectSchema`

**Testing:**
- Run TypeScript compiler: `tsc --noEmit`
- Verify no type errors

---

### Phase 2: Backend Service Updates (Priority: CRITICAL)

**Duration:** 3-4 hours  
**Risk:** MEDIUM (affects quotation generation)

**Tasks:**

#### 2.1 Update `quotation-template-service.ts`

**A. Dynamic Description Generation**

Location: `calculatePricingBreakdown()` method

```typescript
// For off-grid (around line 1080-1102)
case 'off_grid':
  const panelWatts = project.panelWatts || '530';
  const panelCount = project.panelCount || 1;
  const inverterKVA = (project as any).inverterKVA || project.inverterKW || '1';
  const batteryVolt = project.voltage || 12;
  const batteryAH = project.batteryAH || '100';
  const batteryCount = project.batteryCount || 1;
  const phase = project.inverterPhase === 'three_phase' ? '3' : '1';
  
  description = `Supply and Installation of ${panelWatts}W X ${panelCount} Nos Panel, ${inverterKVA}KVA/${batteryVolt}v ${phase}PH MPPT Inverter, ${batteryAH}AH X ${batteryCount}, ${phase}-Phase Offgrid Solar System`;
  break;

// Similar for hybrid (around line 1104-1126)
```

**B. Update BOM Generation for KVA**

```typescript
// In generateOffGridBOM() around line 545-558
const inverterKVA = project.inverterKVA || project.inverterKW || 1;
items.push({
  slNo: slNo++,
  description: "Off-Grid Inverter (PCU)",
  type: "Pure Sine Wave",
  volt: inverterVoltage,
  rating: `${inverterKVA} KVA`, // Changed from KW
  make: project.inverterMake?.length > 0 ? project.inverterMake.join(' / ') : "As per MNRE LIST",
  qty: project.inverterQty || 1,
  unit: "Nos"
});

// Similar changes in generateHybridBOM()
```

**C. Update Battery Type**

```typescript
// Map battery type to short code
const batteryTypeMap: Record<string, string> = {
  'lead_acid': 'LA',
  'lithium': 'Li-ion'
};
const batteryTypeCode = batteryTypeMap[project.batteryType || 'lead_acid'] || 'LA';

items.push({
  slNo: slNo++,
  description: `${project.batteryBrand || 'Exide'} Battery`,
  type: batteryTypeCode, // Changed from full name
  volt: `${project.voltage || 12}V`,
  rating: `${project.batteryAH || '100'} AH`,
  make: project.batteryBrand || 'Exide',
  qty: project.batteryCount || 1,
  unit: "Nos"
});
```

**D. Create BOM Summary for Off-Grid/Hybrid**

```typescript
// In generateQuotationTemplate() around line 1229-1248
let bomSummary: { 
  phase: string; 
  inverterKW?: number; 
  inverterKVA?: string;
  panelWatts: number;
  batteryAH?: string;
  dcVolt?: number;
} | undefined = undefined;

if (project.projectType === 'on_grid') {
  // Existing on-grid logic
  bomSummary = {
    phase,
    inverterKW,
    panelWatts: totalPanelWatts
  };
} else if (project.projectType === 'off_grid' || project.projectType === 'hybrid') {
  const phase = (project as any).inverterPhase === 'three_phase' ? '3' : '1';
  const inverterKVA = (project as any).inverterKVA || (project as any).inverterKW || '1';
  const totalPanelWatts = parseInt((project as any).panelWatts || '530') * ((project as any).panelCount || 1);
  const batteryAH = (project as any).batteryAH || '100';
  const batteryVolt = (project as any).voltage || 12;
  const batteryQty = (project as any).batteryCount || 1;
  const dcVolt = batteryVolt * batteryQty;
  
  bomSummary = {
    phase,
    inverterKVA,
    panelWatts: totalPanelWatts,
    batteryAH,
    dcVolt
  };
}
```

**E. Add Backup Solutions Calculation**

```typescript
/**
 * Calculate backup solutions for off-grid/hybrid systems
 */
static calculateBackupSolutions(project: any): { 
  backupWatts: number; 
  usageWatts: number[]; 
  backupHours: number[] 
} {
  const batteryAH = parseInt(project.batteryAH || '100');
  const batteryQty = project.batteryCount || 1;
  
  // Calculate backup watts: (AH × 10 × Qty) - 3%
  const baseWatts = batteryAH * 10 * batteryQty;
  const backupWatts = Math.round(baseWatts - (baseWatts * 0.03));
  
  // Use provided usage watts or defaults
  const usageWatts = project.backupSolutions?.usageWatts || [800, 750, 550, 450, 200];
  
  // Calculate backup hours for each usage watts
  const backupHours = usageWatts.map((usage: number) => 
    Math.round((backupWatts / usage) * 100) / 100
  );
  
  return { backupWatts, usageWatts, backupHours };
}
```

**F. Update Water Pump BOM**

```typescript
private static generateWaterPumpBOM(project: any, startSlNo: number): BillOfMaterialsItem[] {
  const items: BillOfMaterialsItem[] = [];
  let slNo = startSlNo;

  // Generate consolidated description
  const hp = project.hp || '1';
  const drive = project.drive || 'DC Drive';
  const panelWatts = project.panelWatts || '540';
  const panelCount = project.panelCount || 10;
  const panelBrand = project.panelBrand?.length > 0 ? project.panelBrand.join('/') : 'UTL';
  const structureType = project.structureType ? formatStructureTypeLabel(project.structureType) : 'Standard';
  const lowerHeight = project.gpStructure?.lowerEndHeight || '3';
  const higherHeight = project.gpStructure?.higherEndHeight || '4';
  
  const consolidatedDescription = `Supply and Installation solar power

System Includes: ${hp} Drive

${Math.floor(parseInt(panelWatts) * panelCount / 1000)} kw ${panelWatts}Wp x ${panelCount} Nos ${panelBrand} Panel, ${hp} Drive

${project.inverterPhase === 'three_phase' ? '3' : '1'} phase, ${Math.floor(parseInt(panelWatts) * panelCount / 1000)} kw Structure

Structure ${lowerHeight} feet lower to ${higherHeight} feet higher

Earth kit, Lighting Arrester,

DC Cable, Electrical Accessories,

Labour and Transport`;

  items.push({
    slNo: slNo++,
    description: consolidatedDescription,
    type: "Complete System",
    volt: "NA",
    rating: `${hp} HP System`,
    make: panelBrand,
    qty: 1,
    unit: "Set"
  });

  return items;
}
```

**G. Update Water Heater BOM**

```typescript
private static generateWaterHeaterBOM(project: any, startSlNo: number): BillOfMaterialsItem[] {
  const items: BillOfMaterialsItem[] = [];
  let slNo = startSlNo;

  const brand = project.brand || 'Venus';
  const litres = project.litre || 100;
  const floor = project.floor ? `Installation On - ${project.floor}` : '';
  const heatingCoil = project.heatingCoil ? 'Heating Coil' : '';
  
  const description = `Supply and Installation of
${brand} make solar water
heater ${litres} LPD commercial
Non-Pressurized with
corrosion resistant epoxy
Coated inner tank and
powder coated outer tank.
${heatingCoil}
And Transport Including GST

${floor}`;

  items.push({
    slNo: slNo++,
    description: description,
    type: "FPC/ETC Type",
    volt: "NA",
    rating: `${litres} Litres`,
    make: brand,
    qty: 1,
    unit: "Nos"
  });

  return items;
}
```

**Testing:**
- Create test quotations for each project type
- Verify BOM generation
- Check calculations

---

#### 2.2 Update `quotation-pdf-service.ts`

**A. Update BOM Header Rendering**

Location: Around line 453-466

```typescript
${template.bomSummary ? `
<table style="width: 100%; margin: 10px 0; border-collapse: collapse; background-color: #90EE90;">
  <tr style="font-weight: bold; text-align: center;">
    <td style="border: 1px solid #000; padding: 5px;">Phase</td>
    ${template.bomSummary.inverterKW ? 
      `<td style="border: 1px solid #000; padding: 5px;">Inverter-KW</td>` : 
      `<td style="border: 1px solid #000; padding: 5px;">Inverter-KVA</td>`
    }
    <td style="border: 1px solid #000; padding: 5px;">Panel Watts</td>
    ${template.bomSummary.batteryAH ? 
      `<td style="border: 1px solid #000; padding: 5px;">Batt. AH</td>` : ''
    }
    ${template.bomSummary.dcVolt ? 
      `<td style="border: 1px solid #000; padding: 5px;">DC Volt</td>` : ''
    }
  </tr>
  <tr style="text-align: center;">
    <td style="border: 1px solid #000; padding: 5px;">${template.bomSummary.phase}</td>
    <td style="border: 1px solid #000; padding: 5px;">${template.bomSummary.inverterKW || template.bomSummary.inverterKVA}</td>
    <td style="border: 1px solid #000; padding: 5px;">${template.bomSummary.panelWatts}</td>
    ${template.bomSummary.batteryAH ? 
      `<td style="border: 1px solid #000; padding: 5px;">${template.bomSummary.batteryAH}</td>` : ''
    }
    ${template.bomSummary.dcVolt ? 
      `<td style="border: 1px solid #000; padding: 5px;">${template.bomSummary.dcVolt}</td>` : ''
    }
  </tr>
</table>
` : ''}
```

**B. Add Backup Solutions Table**

Location: After BOM table

```typescript
${template.backupSolutions ? `
<div style="margin-top: 30px;">
  <h3 style="color: #228B22; text-align: center;">Backup Solutions</h3>
  <div style="text-align: center; font-style: italic; margin: 10px 0;">
    *During fully Charged Condition<br>
    *With Efficiency of 80%
  </div>
  
  <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
    <tr style="background-color: #f0f0f0;">
      <td style="border: 1px solid #000; padding: 8px; font-weight: bold;">Back up Watts</td>
      <td colspan="${template.backupSolutions.usageWatts.length}" style="border: 1px solid #000; padding: 8px; text-align: center;">${template.backupSolutions.backupWatts}</td>
    </tr>
    <tr style="background-color: #f0f0f0;">
      <td style="border: 1px solid #000; padding: 8px; font-weight: bold;">Usage Watts</td>
      ${template.backupSolutions.usageWatts.map(watts => 
        `<td style="border: 1px solid #000; padding: 8px; text-align: center;">${watts}</td>`
      ).join('')}
    </tr>
    <tr>
      <td style="border: 1px solid #000; padding: 8px; font-weight: bold;">Back up Hours</td>
      ${template.backupSolutions.backupHours.map(hours => 
        `<td style="border: 1px solid #000; padding: 8px; text-align: center;">${hours}</td>`
      ).join('')}
    </tr>
  </table>
</div>
` : ''}
```

**Testing:**
- Generate PDFs for off-grid projects
- Generate PDFs for hybrid projects
- Verify all tables render correctly

---

### Phase 3: Frontend Form Updates (Priority: HIGH)

**Duration:** 2-3 hours  
**Risk:** LOW (UI changes only)

**Tasks:**

#### 3.1 Update `marketing-site-visit-form.tsx`

**Location:** Off-Grid Configuration section (around line 1300-1550)

```typescript
{/* Add after Inverter KW field */}
<div>
  <Label>Inverter KVA</Label>
  <Input
    type="text"
    value={formData.offGridConfig.inverterKVA || ''}
    onChange={(e) => updateConfig('offGridConfig', { inverterKVA: e.target.value })}
    placeholder="e.g., 1, 1.5, 2"
    data-testid="input-offgrid-inverter-kva"
  />
  <p className="text-xs text-muted-foreground">
    For off-grid systems, inverters are rated in KVA
  </p>
</div>
```

**Location:** Hybrid Configuration section (around line 1550-1900)

```typescript
{/* Add after Inverter KW field */}
<div>
  <Label>Inverter KVA</Label>
  <Input
    type="text"
    value={formData.hybridConfig.inverterKVA || ''}
    onChange={(e) => updateConfig('hybridConfig', { inverterKVA: e.target.value })}
    placeholder="e.g., 1, 1.5, 2"
    data-testid="input-hybrid-inverter-kva"
  />
  <p className="text-xs text-muted-foreground">
    For hybrid systems, inverters are rated in KVA
  </p>
</div>
```

**Testing:**
- Create new site visit with off-grid project
- Verify inverterKVA field saves correctly
- Create quotation from site visit
- Verify KVA appears in quotation

---

#### 3.2 Update `quotation-creation.tsx`

**Location:** Project configuration form section

Add inverterKVA field to project forms (similar to site visit form)

Add backup solutions section:

```typescript
{/* Backup Solutions Section - Only for Off-Grid and Hybrid */}
{(currentProject.projectType === 'off_grid' || currentProject.projectType === 'hybrid') && (
  <Card>
    <CardHeader>
      <CardTitle>Backup Solutions</CardTitle>
      <CardDescription>
        Configure backup power calculations
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div>
        <Label>Backup Watts (Auto-calculated)</Label>
        <Input
          type="number"
          value={calculatedBackupWatts}
          disabled
          className="bg-gray-100"
        />
        <p className="text-xs text-muted-foreground">
          Calculated as: (Battery AH × 10 × Qty) - 3%
        </p>
      </div>
      
      <div>
        <Label>Usage Watts (Enter up to 5 values)</Label>
        <div className="grid grid-cols-5 gap-2">
          {[0, 1, 2, 3, 4].map(index => (
            <Input
              key={index}
              type="number"
              placeholder={`Load ${index + 1}`}
              value={usageWatts[index] || ''}
              onChange={(e) => updateUsageWatts(index, parseFloat(e.target.value))}
            />
          ))}
        </div>
      </div>
      
      <div>
        <Label>Backup Hours (Auto-calculated)</Label>
        <div className="grid grid-cols-5 gap-2">
          {backupHours.map((hours, index) => (
            <Input
              key={index}
              type="number"
              value={hours || ''}
              disabled
              className="bg-gray-100"
            />
          ))}
        </div>
      </div>
    </CardContent>
  </Card>
)}
```

**Testing:**
- Create manual quotation for off-grid
- Enter different battery configurations
- Verify backup watts calculate correctly
- Enter usage watts
- Verify backup hours calculate correctly

---

### Phase 4: Mapping Service Updates (Priority: MEDIUM)

**Duration:** 1 hour  
**Risk:** LOW (data transformation only)

**Tasks:**

Update `quotation-mapping-service.ts`

```typescript
// In mapOffGridProject() around line 720-810
private static mapOffGridProject(config: any, warnings: string[], transformations: any[]): QuotationProject {
  // ... existing code ...
  
  return {
    // ... existing fields ...
    inverterKVA: config.inverterKVA || config.inverterKW?.toString() || "1",
    // ... rest of fields ...
  };
}

// Similar for mapHybridProject()
```

**Testing:**
- Create site visit with off-grid project
- Add inverterKVA value
- Generate quotation
- Verify KVA is mapped correctly

---

### Phase 5: Testing & Validation (Priority: CRITICAL)

**Duration:** 2-3 hours  
**Risk:** N/A

**Test Cases:**

1. **Off-Grid Quotation - Manual Entry**
   - Create quotation manually
   - Enter all fields including inverterKVA
   - Verify BOM header shows correct columns
   - Verify description is dynamic
   - Verify backup solutions table appears
   - Download PDF and verify formatting

2. **Off-Grid Quotation - From Site Visit**
   - Create site visit with off-grid config
   - Include inverterKVA
   - Create quotation from site visit
   - Verify all data transfers correctly
   - Verify PDF generation

3. **Hybrid Quotation - Manual Entry**
   - Same tests as off-grid
   - Verify both battery and grid features work

4. **Hybrid Quotation - From Site Visit**
   - Same tests as off-grid from site visit

5. **Water Pump Quotation**
   - Create water pump quotation
   - Verify consolidated description format
   - Verify PDF shows correct structure

6. **Water Heater Quotation**
   - Create water heater quotation
   - Verify description format
   - Test with and without product image

7. **Regression Testing**
   - Create on-grid quotation
   - Verify nothing broke
   - Verify on-grid BOM header unchanged

---

## 8. TESTING CHECKLIST

### Before Starting Implementation

- [ ] Backup current codebase
- [ ] Create new git branch: `feature/offgrid-hybrid-enhancements`
- [ ] Document current behavior with screenshots
- [ ] Set up test environment

### Schema Changes

- [ ] Add inverterKVA to schemas
- [ ] Create backupSolutionsSchema
- [ ] Add productImage to water heater schema
- [ ] Run TypeScript compiler
- [ ] Fix any type errors
- [ ] Update type exports

### Backend Service Changes

- [ ] Update generateOffGridBOM() for KVA
- [ ] Update generateHybridBOM() for KVA
- [ ] Fix battery type display (LA)
- [ ] Implement dynamic description for off-grid
- [ ] Implement dynamic description for hybrid
- [ ] Create calculateBackupSolutions() method
- [ ] Update generateQuotationTemplate() for new BOM headers
- [ ] Test all BOM generation methods individually
- [ ] Test pricing calculations

### PDF Template Changes

- [ ] Update BOM header rendering logic
- [ ] Add backup solutions table HTML
- [ ] Test PDF generation for off-grid
- [ ] Test PDF generation for hybrid
- [ ] Test PDF generation for on-grid (regression)
- [ ] Verify all tables align correctly
- [ ] Check page breaks

### Frontend Changes

- [ ] Add inverterKVA field to site visit form (off-grid)
- [ ] Add inverterKVA field to site visit form (hybrid)
- [ ] Add inverterKVA field to quotation creation (off-grid)
- [ ] Add inverterKVA field to quotation creation (hybrid)
- [ ] Add backup solutions input section
- [ ] Implement backup watts auto-calculation
- [ ] Implement backup hours auto-calculation
- [ ] Test form validation
- [ ] Test data submission

### Integration Testing

- [ ] Create site visit → quotation (off-grid)
- [ ] Create site visit → quotation (hybrid)
- [ ] Manual quotation creation (off-grid)
- [ ] Manual quotation creation (hybrid)
- [ ] Verify data persistence
- [ ] Verify PDF download
- [ ] Verify PDF preview

### Edge Cases

- [ ] Test with missing optional fields
- [ ] Test with maximum battery count
- [ ] Test with 5 usage watts entries
- [ ] Test with 0 usage watts entries
- [ ] Test with very large KVA values
- [ ] Test with very small KVA values
- [ ] Test with different battery types

### Browser Compatibility

- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Edge
- [ ] Mobile Chrome
- [ ] Mobile Safari

---

## 9. RISK ANALYSIS

### High Risk Areas

1. **PDF Generation**
   - **Risk:** HTML templates are complex, changes might break layout
   - **Mitigation:** Test thoroughly with different data sets, keep backups of working templates

2. **BOM Summary Logic**
   - **Risk:** Different project types have different header structures
   - **Mitigation:** Use discriminated unions, add comprehensive type guards

3. **Data Migration**
   - **Risk:** Existing quotations don't have new fields
   - **Mitigation:** Make all new fields optional, provide sensible defaults

### Medium Risk Areas

1. **Form Validation**
   - **Risk:** New fields might not validate correctly
   - **Mitigation:** Use Zod schemas consistently, test edge cases

2. **Type Safety**
   - **Risk:** Type mismatches between frontend and backend
   - **Mitigation:** Share schemas via shared/schema.ts, use strict TypeScript

### Low Risk Areas

1. **UI Changes**
   - **Risk:** Minimal, just adding input fields
   - **Mitigation:** Standard form patterns already established

2. **Database Changes**
   - **Risk:** None (using Firestore, schema-less)
   - **Mitigation:** N/A

---

## 10. DEPLOYMENT CHECKLIST

### Pre-Deployment

- [ ] All tests passing
- [ ] Code review completed
- [ ] Documentation updated
- [ ] Type definitions updated
- [ ] No console.log statements
- [ ] No commented code
- [ ] Git commit messages clear

### Deployment Steps

1. [ ] Merge feature branch to main
2. [ ] Deploy to staging environment
3. [ ] Run smoke tests on staging
4. [ ] Get stakeholder approval
5. [ ] Deploy to production
6. [ ] Monitor for errors
7. [ ] Verify PDF generation working
8. [ ] Verify quotation creation working

### Post-Deployment

- [ ] Create sample quotations for each type
- [ ] Archive in documentation
- [ ] Update user training materials
- [ ] Notify stakeholders of new features
- [ ] Monitor error logs for 48 hours
- [ ] Collect user feedback

---

## 11. APPENDIX

### A. Interface Definitions

```typescript
// BillOfMaterialsItem
interface BillOfMaterialsItem {
  slNo: number;
  description: string;
  type: string;
  volt: string;
  rating: string;
  make: string;
  qty: number;
  unit: string;
}

// BOM Summary (Extended)
interface BOMSummary {
  phase: string;
  inverterKW?: number;      // Only for on-grid
  inverterKVA?: string;     // Only for off-grid/hybrid
  panelWatts: number;
  batteryAH?: string;       // Only for off-grid/hybrid
  dcVolt?: number;          // Only for off-grid/hybrid
}

// Backup Solutions
interface BackupSolutions {
  backupWatts: number;
  usageWatts: number[];     // Max 5 entries
  backupHours: number[];    // Auto-calculated
}
```

### B. Calculation Formulas

```typescript
// System KW
systemKW = (panelWatts × panelCount) / 1000

// DC Volt
dcVolt = batteryVolt × batteryQty

// Backup Watts
baseWatts = batteryAH × 10 × batteryQty
backupWatts = baseWatts - (baseWatts × 0.03)

// Backup Hours
backupHours[i] = backupWatts / usageWatts[i]

// Subsidy (Residential Only, On-Grid/Hybrid)
if kW ≤ 1: subsidy = 30,000
if 1 < kW ≤ 2: subsidy = 60,000
if 2 < kW ≤ 10: subsidy = 78,000
if kW > 10: subsidy = 0

// GST Calculation
basePrice = totalWithGST / (1 + gstPercentage/100)
gstAmount = totalWithGST - basePrice

// Customer Payment
customerPayment = totalWithGST - subsidyAmount
```

### C. Business Rules Reference

```typescript
BUSINESS_RULES = {
  pricing: {
    onGridPerKW: 68000,
    offGridPerKW: 85000,
    hybridPerKW: 95000
  },
  subsidy: {
    onGridPerKW: 26000,
    hybridPerKW: 26000,
    offGridPerKW: 0
  },
  payment: {
    advancePercentage: 90,
    balancePercentage: 10
  },
  gst: {
    percentage: 8.9
  }
}
```

---

## CONCLUSION

This document provides a comprehensive analysis of all changes required for implementing Off-Grid and Hybrid quotation enhancements. The implementation is structured in phases to minimize risk and ensure thorough testing at each stage.

**Key Takeaways:**
1. All changes are additive - existing functionality won't break
2. Schema changes provide foundation for all other changes
3. Backend changes are isolated to service layer
4. Frontend changes follow existing patterns
5. Comprehensive testing is critical for PDF generation

**Estimated Total Implementation Time:** 12-15 hours

**Critical Success Factors:**
- Thorough testing of PDF generation
- Validation of all calculations
- Comprehensive edge case handling
- Clear documentation for future maintenance

---

**Document Version:** 1.0  
**Last Updated:** October 24, 2025  
**Next Review:** After Phase 1 Completion


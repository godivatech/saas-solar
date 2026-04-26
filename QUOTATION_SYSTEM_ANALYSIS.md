# Comprehensive Quotation System Analysis
## Prakash Green Energy Solar Management System

**Document Version:** 1.0  
**Last Updated:** November 22, 2025  
**Total Documentation:** 15+ comprehensive sections covering architecture, components, services, APIs, and operations

---

## TABLE OF CONTENTS

1. [System Overview](#1-system-overview)
2. [Data Models & Schemas](#2-data-models--schemas)
3. [Workflow Architecture](#3-workflow-architecture)
4. [API Endpoints & Routes](#4-api-endpoints--routes)
5. [Backend Services Architecture](#5-backend-services-architecture)
6. [Frontend Components](#6-frontend-components)
7. [Business Rules & Calculations](#7-business-rules--calculations)
8. [Pricing Calculation System](#8-pricing-calculation-system)
9. [Subsidy Calculation Logic](#9-subsidy-calculation-logic)
10. [Site Visit Data Integration](#10-site-visit-data-integration)
11. [PDF Generation System](#11-pdf-generation-system)
12. [Bill of Materials (BOM) Generation](#12-bill-of-materials-bom-generation)
13. [Project Type Configurations](#13-project-type-configurations)
14. [Error Handling & Validation](#14-error-handling--validation)
15. [Deployment & Configuration](#15-deployment--configuration)

---

## 1. SYSTEM OVERVIEW

### Purpose
The Quotation System is a comprehensive module within the Solar Energy Management System that handles:
- **Manual quotation creation** - Salespeople manually create quotations
- **Site visit-based quotations** - Automatically map site visit data to quotations
- **Multi-project support** - Single quotation can contain multiple solar/service projects
- **Pricing calculations** - Accurate per-kW calculations with GST
- **Subsidy management** - Automatic government subsidy calculations for residential properties
- **PDF generation** - Professional quotation documents with proper formatting
- **Customer management** - Unified customer creation/selection

### System Architecture Diagram
```
┌─────────────────────────────────────────────────────────────┐
│                    Quotation System                          │
├─────────────────────────────────────────────────────────────┤
│ Frontend (React)                                             │
│  • Quotation Creation (6,265 lines)                          │
│  • Quotation List/Dashboard (1,375 lines)                    │
│  • 5-Step Wizard UI                                          │
│  • Project Configuration Forms                               │
│  • PDF Preview & Download                                    │
├─────────────────────────────────────────────────────────────┤
│ API Routes (415 lines)                                       │
│  • POST /api/quotations (create)                             │
│  • GET /api/quotations (list with pagination)                │
│  • GET /api/quotations/:id (retrieve)                        │
│  • PATCH /api/quotations/:id (update)                        │
│  • POST /api/quotations/:id/generate-pdf (PDF generation)    │
│  • POST /api/quotations/from-site-visit/:id (site mapping)   │
├─────────────────────────────────────────────────────────────┤
│ Backend Services (3,734 lines total)                         │
│  • Quotation Mapping Service (1,310 lines)                   │
│  • Quotation PDF Service (750 lines)                         │
│  • Quotation Template Service (1,674 lines)                  │
├─────────────────────────────────────────────────────────────┤
│ Data Layer                                                    │
│  • Customer Management                                       │
│  • Quotation Storage                                         │
│  • Site Visit Integration                                    │
└─────────────────────────────────────────────────────────────┘
```

### Key Features
- **5-Step Wizard**: Source selection → Customer → Projects → Pricing → Review
- **Multi-Project Support**: Create quotations with up to 5 different project types simultaneously
- **Smart Customer Handling**: Auto-fill from database or create new customers
- **Intelligent Pricing**: Per-kW calculations with automatic GST and subsidy calculation
- **Site Visit Integration**: Automated data mapping from completed site visits
- **Professional PDF Output**: Client-side generation with print-to-PDF support
- **Real-time Calculations**: Instant updates as user modifies project parameters

---

## 2. DATA MODELS & SCHEMAS

### Core Quotation Schema
Located in: `shared/schema.ts` (lines 1429-1700+)

#### Quotation Status Lifecycle
```typescript
quotationStatuses = [
  "draft",              // Initial creation
  "pending_approval",   // Awaiting approval
  "sent",              // Sent to customer
  "accepted",          // Customer accepted
  "rejected",          // Customer rejected
  "expired",           // Quote validity expired
  "cancelled"          // Cancelled
]
```

#### Quotation Sources
```typescript
quotationSources = [
  "manual",            // Created manually by sales
  "site_visit"         // Auto-mapped from site visit
]
```

#### Project Types
```typescript
quotationProjectTypes = [
  "on_grid",          // Grid-connected solar system (₹68k/kW)
  "off_grid",         // Battery-backed system (₹85k/kW)
  "hybrid",           // Hybrid system (₹95k/kW)
  "water_heater",     // Solar water heater (₹350/litre)
  "water_pump",       // Solar water pump (₹45k/HP)
  "custom"            // Custom configuration
]
```

### Insert Quotation Schema
```typescript
insertQuotationSchema = z.object({
  customerId: z.string(),                           // Link to customer
  quotationNumber: z.string(),                      // Unique identifier
  source: z.enum(quotationSources),                 // Creation source
  status: z.enum(quotationStatuses),                // Current status
  projects: z.array(quotationProjectSchema),        // Array of projects
  
  // Pricing
  totalSystemCost: z.number(),                      // Total before subsidy
  totalSubsidyAmount: z.number(),                   // Government subsidy
  totalCustomerPayment: z.number(),                 // Final amount to pay
  totalGSTAmount: z.number(),                       // Total GST
  
  // Payment terms
  advancePaymentPercentage: z.number(),             // Default 90%
  advanceAmount: z.number(),                        // 90% of total
  balanceAmount: z.number(),                        // 10% of total
  paymentTerms: z.enum(paymentTerms),              // Payment structure
  
  // Delivery & Terms
  deliveryTimeframe: z.enum(deliveryTimeframes),    // Delivery schedule
  termsTemplate: z.enum(termsTemplates),            // T&C template
  
  // Documentation
  followUps: z.array(quotationFollowUpSchema),      // Follow-up tracking
  customerNotes: z.string().optional(),             // Visible to customer
  internalNotes: z.string().optional(),             // Internal only
  attachments: z.array(z.string()).optional(),      // Document URLs
  
  // Site Visit Integration
  siteVisitMapping: siteVisitMappingSchema.optional(),
  
  // Metadata
  preparedBy: z.string(),                           // Sales person
  createdAt: z.date(),
  updatedAt: z.date().optional(),
  updatedBy: z.string().optional()
});
```

### Individual Project Schemas

#### On-Grid Project Schema
```typescript
quotationOnGridProjectSchema = z.object({
  projectType: z.literal("on_grid"),
  systemKW: z.number(),                             // System capacity
  pricePerKW: z.number(),                           // Rate per kW
  
  // Panel configuration
  solarPanelMake: z.array(z.enum(solarPanelBrands)),
  panelWatts: z.string(),                           // Panel wattage
  panelType: z.enum(panelTypes),                    // Bifacial/Mono-PERC/Topcon
  dcrPanelCount: z.number(),                        // DCR compliant panels
  nonDcrPanelCount: z.number(),                     // Non-DCR panels
  panelCount: z.number(),                           // Total panels
  
  // Inverter configuration
  inverterMake: z.array(z.enum(inverterMakes)),
  inverterKW: z.number(),                           // Inverter capacity
  inverterQty: z.number(),                          // Number of inverters
  inverterPhase: z.enum(inverterPhases),            // Single/Three phase
  
  // Electrical
  lightningArrest: z.boolean(),                     // Lightning protection
  electricalAccessories: z.boolean(),
  electricalCount: z.number().optional(),
  earth: z.array(z.enum(earthingTypes)),
  
  // Structure
  floor: z.enum(floorLevels),                       // Mounting level
  structureType: z.enum(structureTypes),            // GI/Mono Rail/MS
  gpStructure: z.object({
    lowerEndHeight: z.enum(heightRange),
    higherEndHeight: z.enum(heightRange)
  }).optional(),
  monoRail: z.object({
    type: z.enum(monoRailOptions)
  }).optional(),
  
  // Scope of work
  civilWorkScope: z.enum(workScopeOptions),        // Company/Customer scope
  netMeterScope: z.enum(workScopeOptions),
  
  // Pricing
  projectValue: z.number(),                         // Total with GST
  basePrice: z.number(),                            // Before GST
  gstPercentage: z.number(),                        // GST rate (8.9%)
  gstAmount: z.number(),                            // Calculated GST
  subsidyAmount: z.number(),                        // Government subsidy
  customerPayment: z.number(),                      // After subsidy
  
  // Additional
  customDescription: z.string().optional(),
  installationNotes: z.string().optional(),
  warranty: z.object({
    panel: z.enum(warrantyPeriods),                 // 25 years default
    inverter: z.enum(warrantyPeriods),              // 5 years default
    installation: z.enum(warrantyPeriods)           // 2 years default
  }).optional()
});
```

#### Off-Grid Project Schema
Similar to On-Grid but includes:
```typescript
batteryBrand: z.enum(batteryBrands),
batteryType: z.enum(batteryTypes),                  // Lead Acid/Lithium
batteryAH: z.enum(batteryAHOptions),
voltage: z.number(),                                // 12V/24V/48V
batteryCount: z.number(),
batteryStands: z.string().optional(),
inverterKVA: z.string().optional(),                 // For off-grid inverters
inverterVolt: z.string().optional(),                // DC voltage
backupSolutions: backupSolutionsSchema              // Backup hours calculation
```

#### Water Heater Project Schema
```typescript
brand: z.string(),                                  // Venus/Others
litre: z.number(),                                  // Capacity in litres
heatingCoil: z.string().optional(),
waterHeaterModel: z.enum(['pressurized', 'non_pressurized']),
labourAndTransport: z.boolean(),
plumbingWorkScope: z.enum(workScopeOptions),
civilWorkScope: z.enum(workScopeOptions),
```

#### Water Pump Project Schema
```typescript
hp: z.string(),                                     // Motor HP
driveHP: z.string(),
drive: z.enum(['vfd', 'direct']),                  // Drive type
panelWatts: z.string(),
panelCount: z.number(),
panelBrand: z.array(z.string()),
structureType: z.enum(structureTypes),
// Plus GP structure configuration similar to on-grid
```

---

## 3. WORKFLOW ARCHITECTURE

### 5-Step Quotation Creation Wizard

#### Step 1: Source Selection
**Purpose**: Determine quotation creation method

```
┌─ Manual Creation
│   └─ User provides all data manually
│       └─ Leads to Step 2: Customer Details
│
└─ Site Visit Based
    └─ Select completed site visit
    └─ Auto-map data from site visit
    └─ User reviews/completes missing fields
    └─ Leads to Step 2: Customer Details (pre-filled)
```

**UI Component**: Source selection radio buttons
- Manual: "Create from scratch"
- Site Visit: "Map from existing site visit"

**Validation**: Must select one source

#### Step 2: Customer Details
**Purpose**: Confirm or create customer record

**For Manual Creation:**
- Customer search/autocomplete (existing customer lookup)
- If found: Auto-fill all customer fields with green highlight
- If not found: Manually enter customer details
- Fields: Name*, Mobile*, Address*, Property Type*, EB Number, Location

**For Site Visit Based:**
- Pre-filled from site visit data
- Green highlighted fields indicate "From Site Visit"
- User can edit/complete missing fields
- Fields same as manual

**Validation Rules:**
```
Name: >= 2 characters (required)
Mobile: >= 10 digits (required)
Address: >= 3 characters (required)
Property Type: One of [residential, commercial, agri, other] (required)
EB Service Number: Optional
Location: Optional
```

**Key Function**: Mobile is unique identifier for customer lookup

#### Step 3: Project Configuration
**Purpose**: Define project(s) and technical specifications

**Multi-Project Support:**
- Add up to 5 projects in single quotation
- Each project is independently configured
- All projects appear in single quotation

**Project Type Selection:**
```
For Each Project:
  1. Select project type (on_grid/off_grid/hybrid/water_heater/water_pump)
  2. Configure type-specific parameters
  3. System calculates pricing automatically
  4. Can add/remove additional projects
```

**For Solar Projects (on_grid, off_grid, hybrid):**
- Panel configuration: Brand, Watts, Type, Count, DCR/Non-DCR split
- Inverter configuration: Brand, KW/KVA, Quantity, Phase
- Structure configuration: Type, Height ranges
- Electrical configuration: Lightning arrest, Earthing, Accessories
- Scope of work: Who does civil/electrical/net meter work
- Auto-calculated fields: System KW, Base Price, GST, Customer Payment

**For Water Heater:**
- Brand selection
- Capacity in litres
- Model type (pressurized/non-pressurized)
- Labor & transport checkbox
- Fixed pricing: ₹350/litre

**For Water Pump:**
- Motor HP rating
- Drive type (VFD/Direct)
- Panel configuration (similar to solar)
- Fixed pricing: ₹45k/HP

**Automatic Calculations:**
```
For Solar (on_grid/off_grid/hybrid):
  systemKW = (panelWatts × panelCount) / 1000
  basePrice = systemKW × pricePerKW
  gstAmount = basePrice × 8.9%
  projectValue = basePrice + gstAmount
  subsidyAmount = calculateSubsidy(kw, propertyType, projectType)
  customerPayment = projectValue - subsidyAmount

For Water Heater:
  basePrice = litres × 350
  projectValue = basePrice (GST = 0%)
  customerPayment = basePrice

For Water Pump:
  basePrice = hp × 45000
  projectValue = basePrice (GST = 0%)
  customerPayment = basePrice
```

#### Step 4: Pricing & Terms
**Purpose**: Finalize financial and delivery terms

**Pricing Summary:**
- Total System Cost (sum of all projects)
- Total GST Amount (calculated from projects)
- Total Subsidy Amount (automatic calculation)
- Total Customer Payment (system cost - subsidy)

**Payment Terms:**
```
Options:
  - 90% Advance + 10% Balance (default, recommended)
  - 50% Advance + 50% Balance
  - 100% Advance
  - 30-day Credit Terms
  - Custom (manual entry)
```

**Delivery Terms:**
```
Options:
  - 2-3 weeks (default)
  - 3-4 weeks
  - 1 month
  - 6-8 weeks
  - Custom
```

**Terms & Conditions Template:**
```
Options:
  - Standard (default)
  - Residential
  - Commercial
  - Agricultural
  - Custom (free text)
```

**Bank Account Details:**
- Populated from quotation settings
- Account holder name
- Bank name
- Account number
- IFSC code
- Branch name

**Customer Communication Preference:**
- WhatsApp (default)
- Email
- Both

#### Step 5: Review & Submit
**Purpose**: Final validation and submission

**Review Content:**
1. Customer Information Summary
   - Name, Mobile, Address, Property Type
   
2. Projects Summary
   - Project count and types
   - Total system capacity
   - Description for each project
   
3. Pricing Summary
   - Item-wise pricing breakdown
   - GST calculation details
   - Subsidy breakdown
   - Payment terms
   - Advance/Balance amounts
   
4. Terms Summary
   - Selected T&C template
   - Delivery timeframe
   - Warranty information
   
5. Internal Notes (for operator reference)

**Validation Before Submission:**
```
✓ Customer details complete
✓ At least one project defined
✓ All required project fields filled
✓ Pricing calculated correctly
✓ Payment terms selected
✓ Terms template selected
```

**Error Handling:**
- Display specific validation errors for each section
- Prevent submission with incomplete data
- Show warning for missing recommended fields
- Highlight incomplete sections

**On Successful Submission:**
1. Generate quotation number: `Q-MM-XXXX` format
2. Create quotation record in database
3. Redirect to quotation details view
4. Show success toast notification

---

## 4. API ENDPOINTS & ROUTES

### Base Path: `/api/quotations`

#### 1. Create Quotation
```
POST /api/quotations
Authentication: Required (verifyAuth middleware)
Permission: quotations.create

Request Body: InsertQuotation
{
  customerId: string,
  quotationNumber: string (auto-generated),
  source: "manual" | "site_visit",
  status: "draft",
  projects: QuotationProject[],
  totalSystemCost: number,
  totalSubsidyAmount: number,
  totalCustomerPayment: number,
  advancePaymentPercentage: number,
  advanceAmount: number,
  balanceAmount: number,
  paymentTerms: string,
  deliveryTimeframe: string,
  termsTemplate: string,
  preparedBy: string (from auth),
  customerNotes: string,
  internalNotes: string,
  attachments: string[],
  followUps: QuotationFollowUp[]
}

Response: 201 Created
{
  id: string,
  quotationNumber: string,
  customerId: string,
  source: string,
  status: string,
  projects: QuotationProject[],
  totalSystemCost: number,
  totalSubsidyAmount: number,
  totalCustomerPayment: number,
  createdAt: Date,
  updatedAt: Date,
  preparedBy: string
}

Error Responses:
- 400: Validation error (Zod parsing failed)
- 403: Access denied (missing quotations.create permission)
- 500: Server error
```

#### 2. List Quotations (Paginated)
```
GET /api/quotations
Authentication: Required
Permission: quotations.view

Query Parameters:
- page: number (default 1)
- limit: number (default 20)
- search: string (searches quotation number, customer notes, internal notes)
- status: string (filter by status)
- source: string (filter by source: manual/site_visit)
- sortBy: string (field to sort by, default createdAt)
- sortOrder: "asc" | "desc" (default desc for dates)

Response: 200 OK
{
  data: Quotation[],
  pagination: {
    page: number,
    limit: number,
    total: number,
    totalPages: number,
    hasNextPage: boolean,
    hasPrevPage: boolean
  }
}
```

#### 3. Get Single Quotation
```
GET /api/quotations/:id
Authentication: Required
Permission: quotations.view

Response: 200 OK
{
  id: string,
  quotationNumber: string,
  customerId: string,
  customer: Customer (populated),
  source: string,
  status: string,
  projects: QuotationProject[],
  totalSystemCost: number,
  totalSubsidyAmount: number,
  totalCustomerPayment: number,
  ... (full quotation object)
}

Error Responses:
- 404: Quotation not found
```

#### 4. Update Quotation
```
PATCH /api/quotations/:id
Authentication: Required
Permission: quotations.edit

Request Body: Partial<InsertQuotation>
(Any fields can be updated partially)

Response: 200 OK
(Updated quotation object)

Error Responses:
- 404: Quotation not found
- 403: Access denied
```

#### 5. Generate PDF
```
POST /api/quotations/:id/generate-pdf
Authentication: Required
Permission: quotations.view

Response: 200 OK
{
  html: string,           // Full HTML document
  template: QuotationTemplate,  // Structured template data
  quotationNumber: string
}

Process:
1. Retrieve quotation and customer
2. Generate BOM using template service
3. Create HTML preview using PDF service
4. Return HTML for client-side printing

Client-Side Handling:
1. Create hidden iframe
2. Write HTML content to iframe document
3. Trigger window.print() on iframe
4. User saves as PDF from print dialog
```

#### 6. Generate Preview
```
GET /api/quotations/:id/preview
Authentication: Required
Permission: quotations.view

Response: 200 OK (text/html)
(Raw HTML document - opens in browser)

Use Case: User wants to preview before downloading
```

#### 7. Preview BOM
```
POST /api/quotations/preview-bom
Authentication: Required
Permission: quotations.view

Request Body:
{
  project: QuotationProject,
  propertyType: string
}

Response: 200 OK
{
  billOfMaterials: BillOfMaterialsItem[]
}

Use Case: User wants to see BOM during project configuration
```

#### 8. Create from Site Visit
```
POST /api/quotations/from-site-visit/:siteVisitId
Authentication: Required
Permission: quotations.create

Process:
1. Fetch site visit by ID
2. Analyze data completeness
3. Map site visit data to quotation
4. Calculate pricing with business rules
5. Create customer if needed
6. Create quotation record

Response: 201 Created
{
  quotation: Quotation,
  mappingAnalysis: CompletenessAnalysis,
  warnings: string[]
}

Error Responses:
- 404: Site visit not found
- 400: Incomplete site visit data
```

#### 9. Get Mappable Site Visits
```
GET /api/quotations/site-visits/mappable
Authentication: Required
Permission: quotations.create

Process:
1. Get all completed site visits
2. Analyze each for quotation readiness
3. Return with completeness analysis

Response: 200 OK
{
  data: (SiteVisit & {completenessAnalysis})[],
  count: number
}
```

#### 10. Get Site Visit Mapping Data
```
GET /api/quotations/site-visits/:siteVisitId/mapping-data
Authentication: Required
Permission: quotations.create

Response: 200 OK
{
  siteVisit: SiteVisit,
  completenessAnalysis: CompletenessAnalysis,
  mappingPreview: Partial<InsertQuotation>,
  warnings: string[],
  transformations: DataTransformation[]
}

Use Case: Preview what quotation will look like before creating
```

---

## 5. BACKEND SERVICES ARCHITECTURE

### A. Quotation Template Service (1,674 lines)
**File**: `server/services/quotation-template-service.ts`

**Purpose**: Generate professional quotation templates and BOM

**Key Methods:**

1. **generateQuotationNumber()**
   - Format: `Q-MM-XXXX`
   - MM = month (01-12)
   - XXXX = random 4-digit number
   - Ensures unique quotation IDs

2. **calculateSystemKW(panelWatts, panelCount)**
   - Formula: `(panelWatts × panelCount) / 1000`
   - Precision: 2 decimal places
   - Used for: Subsidy calculation, pricing

3. **formatKWForDisplay(kw)**
   - < 1 kW: Show decimals (e.g., 0.68)
   - >= 1 kW: Round to whole (e.g., 3.24 → 3)

4. **calculateSubsidy(kw, propertyType, projectType)**
   - Only for: Residential properties
   - Only for: on_grid and hybrid projects
   - Ranges:
     * ≤ 1 kW: ₹30,000
     * 1-2 kW: ₹60,000
     * 2-10 kW: ₹78,000
     * > 10 kW: No subsidy

5. **calculateBackupSolutions(project)**
   - For: off-grid and hybrid systems
   - Formula: `(AH × 10 × Qty) - 3% loss`
   - Calculates backup hours for different usage scenarios

6. **generateBillOfMaterials(project, propertyType)**
   - Returns: BillOfMaterialsItem[]
   - For each project type:
     * On-grid: Panels, Inverter, Structure, Electrical
     * Off-grid: Panels, Inverter, Battery, Electrical
     * Hybrid: Panels, Inverter, Battery, Structure
     * Water Heater: Heater unit, Piping, Installation
     * Water Pump: Panels, Inverter, Pump, Structure

**Company Details** (Hardcoded):
```typescript
name: "Prakash Green Energy"
phone: ["6374501500", "9585557516", "8925465011"]
email: "support@prakashgreenenergy.com"
website: "www.prakashgreenenergy.com"
address: "338ECOP5D95228, Madurai, Tamilnadu, India - 625 011"
```

**BOM Item Structure:**
```typescript
{
  slNo: number,           // Serial number
  description: string,    // Item description
  type: string,          // Item type/specification
  volt: string,          // Voltage rating
  rating: string,        // Power rating
  make: string,          // Manufacturer
  qty: number,           // Quantity
  unit: string,          // Unit (Nos/Sets/Feet)
  rate?: number,         // Unit rate (optional)
  amount?: number        // Total amount (optional)
}
```

### B. Quotation PDF Service (750 lines)
**File**: `server/services/quotation-pdf-service.ts`

**Purpose**: Generate HTML quotations for client-side PDF conversion

**Key Features:**
- Professional HTML formatting with Prakash Green Energy branding
- Colored tables and sections (Green theme #228B22)
- Bill of Materials display
- Warranty information
- Bank account details
- Terms & Conditions
- Number-to-words conversion (Indian numbering system)

**Main Method: generateHTMLContent(template)**
Returns complete HTML document with:

1. **Header Section:**
   - Company logo
   - Company name and contact info
   - Quotation metadata (number, date, validity)

2. **Customer Information:**
   - Customer name, address, contact
   - Sales person details
   - Reference information

3. **Pricing Table:**
   - kW capacity
   - Rate per kW
   - GST per kW
   - GST percentage
   - Value with GST
   - (Only for solar, not water utilities)

4. **Total Calculation:**
   - System cost
   - GST amount
   - Total cost
   - Amount in words (e.g., "Rupees Twenty-Five Thousand Only")
   - Subsidy deduction
   - Final customer payment

5. **Bill of Materials:**
   - Complete list for each project type
   - Specifications (brand, type, voltage, rating)
   - Quantities and units

6. **Backup Solutions Table:** (For off-grid/hybrid)
   - Backup watts
   - Backup hours for different usage scenarios

7. **Warranty Information:**
   - Solar panel warranty (25 years)
   - Inverter warranty (5-15 years)
   - Installation warranty (2 years)

8. **Scope of Work:**
   - Structure installation
   - Electrical work
   - Civil work
   - Customer scope items

9. **Terms & Conditions:**
   - Payment terms (90/10)
   - Delivery period
   - Bank account details
   - Document requirements for subsidy

10. **Styling:**
    - Green theme (#228B22) matching Prakash branding
    - Print-optimized CSS
    - Page breaks for multi-page documents

**Utility Functions:**
- `numberToWords()`: Converts numbers to Indian English words
- `formatNumber()`: Formats display numbers for kW
- `resolveUserName()`: Maps user UID to display name

### C. Quotation Mapping Service (1,310 lines)
**File**: `server/services/quotation-mapping-service.ts`

**Purpose**: Map site visit data to quotation structure with intelligence

#### Part 1: DataCompletenessAnalyzer
Analyzes how much site visit data is complete for quotation creation

**Field Categories:**
```
Critical (60% weight):
  - customer.name
  - customer.mobile
  - customer.address
  - marketingData.projectType
  - visitOutcome (must be 'converted')

Important (30% weight):
  - Property type, EB number
  - Project configurations (panels, inverters, batteries)
  - Technical data (team members, description)
  - Admin data (bank process, EB process)

Optional (10% weight):
  - Location, photos, notes
  - Technical description, follow-up date
  - Site photos and metadata
```

**Completeness Score Formula:**
```
score = (critical% × 0.6) + (important% × 0.3) + (optional% × 0.1)
```

**Quality Grades:**
- A: 90-100% complete
- B: 80-89% complete
- C: 70-79% complete
- D: 60-69% complete
- F: < 60% complete

**Quotation Readiness:**
Can create quotation in three scenarios:
1. **Traditional**: All critical fields + outcome='converted' + status='completed'
2. **Marketing**: Valid marketing config + basic customer info
3. **Partial**: Any customer info (name/mobile) + marketing department

#### Part 2: SiteVisitDataMapper
Maps site visit data to quotation structure

**Main Process:**
```
1. Analyze data completeness
   ↓
2. Map customer data → Create/find customer
   ↓
3. Map projects → Generate QuotationProject objects
   ↓
4. Calculate pricing with business rules
   ↓
5. Build comprehensive internal notes
   ↓
6. Extract attachments and photos
   ↓
7. Return complete quotation data
```

**Customer Mapping:**
- If customer exists: Use ID
- If new: Create customer with site visit data
- Properties: name, mobile, address, EB number, property type, location

**Project Mapping:**

On-Grid Mapping:
```
source.onGridConfig → quotationOnGridProjectSchema
- Panel count/watts from site visit
- Inverter specs from site visit
- Structure type and heights
- Scope of work (civil, net meter, electrical)
- Fixed rates: ₹68,000/kW
```

Off-Grid Mapping:
```
source.offGridConfig → quotationOffGridProjectSchema
- Panel and battery configuration from site visit
- Backup hours calculation from battery specs
- Fixed rates: ₹85,000/kW
```

Hybrid Mapping:
```
source.hybridConfig → quotationHybridProjectSchema
- Combines panel and battery config
- Fixed rates: ₹95,000/kW
```

Water Heater Mapping:
```
source.waterHeaterConfig → quotationWaterHeaterProjectSchema
- Brand and litres from site visit
- Fixed rates: ₹350/litre
- GST: 0% (by default)
```

Water Pump Mapping:
```
source.waterPumpConfig → quotationWaterPumpProjectSchema
- Motor HP from site visit
- Panel configuration
- Fixed rates: ₹45,000/HP
- GST: 0% (by default)
```

**Pricing Calculation:**
```
For Solar (on_grid/off_grid/hybrid):
  1. Calculate system KW from panels
  2. Determine rate per KW based on type
  3. Calculate base price = KW × rate
  4. Calculate GST = base × 8.9%
  5. Calculate subsidy if applicable
  6. Customer payment = base + GST - subsidy

For Water Heater:
  1. Base = litres × 350
  2. GST = 0%
  3. Customer payment = base

For Water Pump:
  1. Base = HP × 45000
  2. GST = 0%
  3. Customer payment = base

Payment Terms:
  1. Advance = Total × 90%
  2. Balance = Total × 10%
```

**Data Transformations Tracked:**
```
- Field: original value → transformed value (reason)
- Logged for audit trail
- Helps understand data mapping logic
```

**Warnings Generated:**
```
- Missing important fields
- Invalid configuration combinations
- Incomplete customer data
- Subsidy eligibility warnings
- GST applicability notes
```

---

## 6. FRONTEND COMPONENTS

### Main Components Location
- **Quotation Creation**: `client/src/pages/quotation-creation.tsx` (6,265 lines)
- **Quotations List**: `client/src/pages/quotations.tsx` (1,375 lines)
- **Recent Quotations Dashboard**: `client/src/components/dashboard/recent-quotations.tsx`

### A. Quotation Creation Page

**Component Structure:**
```
QuotationCreation (Main)
├── Header (navigation, status)
├── Wizard Container
│   ├── Step 1: Source Selection
│   │   ├── Manual Creation Option
│   │   └── Site Visit Option
│   │       └── Site Visit Selection Dropdown
│   │
│   ├── Step 2: Customer Details
│   │   ├── ManualCustomerDetailsForm
│   │   │   ├── Customer Search/Autocomplete
│   │   │   ├── Name Field
│   │   │   ├── Mobile Field
│   │   │   ├── Address Field
│   │   │   ├── Property Type Dropdown
│   │   │   ├── EB Service Number
│   │   │   └── Location Field
│   │   │
│   │   └── SiteVisitCustomerDetailsForm
│   │       └── Pre-filled fields with edit capability
│   │
│   ├── Step 3: Project Configuration
│   │   ├── Project Type Selector
│   │   │   ├── On-Grid
│   │   │   ├── Off-Grid
│   │   │   ├── Hybrid
│   │   │   ├── Water Heater
│   │   │   └── Water Pump
│   │   │
│   │   └── Project Configuration Form (varies by type)
│   │       ├── Panel/Battery Configuration
│   │       ├── Inverter Configuration
│   │       ├── Structure Configuration
│   │       ├── Electrical Configuration
│   │       ├── Pricing Display (auto-calculated)
│   │       └── Add/Remove Project Buttons
│   │
│   ├── Step 4: Pricing & Terms
│   │   ├── Pricing Summary Card
│   │   ├── Payment Terms Selector
│   │   ├── Delivery Timeframe Selector
│   │   ├── Terms Template Selector
│   │   ├── Bank Account Details
│   │   └── Communication Preference
│   │
│   └── Step 5: Review & Submit
│       ├── Customer Summary
│       ├── Projects Summary
│       ├── Pricing Summary
│       ├── Terms Summary
│       └── Submit Button
│
├── Navigation Buttons
│   ├── Previous Step
│   ├── Next Step
│   └── Submit (on final step)
│
└── Progress Indicator
    └── Visual progress bar and step indicators
```

**Key Features:**

1. **Wizard State Management:**
   - Current step tracking
   - Form data preservation across steps
   - Validation at each step
   - Ability to go back/forward

2. **Real-time Calculations:**
   - System KW updates as panel count changes
   - Pricing updates automatically
   - Subsidy calculated based on property type
   - GST applied automatically (8.9%)

3. **Smart Customer Handling:**
   - Autocomplete for existing customers
   - Mobile number as unique identifier
   - Auto-fill from database with visual indicator
   - New customer creation on submit

4. **Multi-Project Management:**
   - Add up to 5 projects
   - Each with independent configuration
   - Remove projects with confirmation
   - Summary of all projects on review step

5. **Responsive Design:**
   - Mobile-optimized forms
   - Tabs for complex sections
   - Expandable/collapsible sections
   - Touch-friendly controls

**Form Validation:**
```typescript
const quotationFormSchema = insertQuotationSchema.omit({
  quotationNumber: true,
  createdAt: true,
  updatedAt: true,
  customerId: true
}).extend({
  customerId: z.string().optional(),
  projects: z.array(quotationProjectSchemaWithGST).min(1),
  followUps: z.array(quotationFollowUpSchema).default([]),
  customerData: customerDetailsSchema.optional(),
  totalGSTAmount: z.number().min(0).default(0),
  totalWithGST: z.number().min(0).default(0)
});
```

### B. Quotations List Page (1,375 lines)

**Features:**
- Paginated table view (10/20/50/100 items per page)
- Search by quotation number, customer name, project type
- Filter by status (draft, review, approved, sent, etc.)
- Filter by source (manual, site visit)
- Filter by project type (on-grid, off-grid, hybrid, water heater, water pump)
- Sort by date, quotation number, customer payment, status
- View details dialog
- Download PDF button
- Edit quotation link

**Table Columns:**
```
1. Quotation #     - Unique identifier (Q-MM-XXXX)
2. Customer       - Customer name (truncated)
3. Projects       - Project types and count
4. System KW      - Total system capacity (solar projects only)
5. Source         - Manual or Site Visit (colored badge)
6. Customer Payment - Amount after subsidy (currency formatted)
7. Status         - Current status (colored badge)
8. Date           - Creation date
9. Actions        - View Details, Download PDF, Edit
```

**Filters:**
- Status dropdown (all, draft, review, approved, sent, customer_approved, converted, rejected)
- Source dropdown (all, manual, site_visit)
- Project type dropdown (all, on_grid, off_grid, hybrid, water_heater, water_pump)
- Items per page selector
- Sort field selector
- Sort order toggle (asc/desc)

**Search:**
- Debounced search (300ms)
- Searches: quotation number, customer name, notes
- Case-insensitive

**Actions:**
- **View Details**: Opens modal with full quotation data
- **Download PDF**: Generates and prints PDF
- **Edit**: Routes to edit page (if available)

---

## 7. BUSINESS RULES & CALCULATIONS

### A. Pricing Structure

**Per-kW Pricing (Solar Projects):**
```
On-Grid Systems:         ₹68,000 per kW
Off-Grid Systems:        ₹85,000 per kW
Hybrid Systems:          ₹95,000 per kW
```

**Fixed Pricing (Service Projects):**
```
Water Heater:            ₹350 per litre
Water Pump:              ₹45,000 per HP
```

**GST Application:**
```
Solar Projects (on_grid, off_grid, hybrid):  8.9% GST
Water Heater:                                 0% GST (by default)
Water Pump:                                   0% GST (by default)
```

**Calculation Example (On-Grid):**
```
System Size: 3.24 kW
Panel Configuration: 530W × 6 = 3180W = 3.18 kW
Rounded for rate calc: 3 kW (floor for 1-3.5 range)
Rate per kW: ₹68,000
Base Price: 3 × ₹68,000 = ₹204,000
GST (8.9%): ₹204,000 × 0.089 = ₹18,156
Total with GST: ₹222,156
Subsidy (residential): ₹78,000 (2-10 kW range)
Customer Payment: ₹222,156 - ₹78,000 = ₹144,156
```

### B. System kW Calculation

**Formula:**
```
systemKW = (panelWatts × panelCount) / 1000
Precision: 2 decimal places, rounded
Example: (530 × 6) / 1000 = 3.18 kW
```

**Display Format:**
```
< 1 kW:  Show decimals (0.68 kW)
>= 1 kW: Round to whole (3.24 kW → 3 kW)
```

**Rate Calculation:**
```
For values < 1 kW:   Use actual decimal (0.68 × ₹68k = ₹46.24k)
For 1-3.5 kW:        Use floor (3.24 → 3 × ₹68k = ₹204k)
For > 3.5 kW:        Use ceil (3.6 → 4 × ₹68k = ₹272k)
```

### C. Payment Terms

**Standard Structure:**
```
Advance Payment:     90% of total
Balance Payment:     10% of total
Due Date (balance):  Upon project completion
```

**Alternative Terms:**
- 50% Advance + 50% Balance
- 100% Advance (full payment)
- 30-day Credit Terms
- Custom terms (negotiated)

**Calculation Example:**
```
Total Cost:     ₹222,156
Advance (90%):  ₹199,940.40 → ₹199,940
Balance (10%):  ₹22,215.60 → ₹22,216
```

### D. Project Value Components

**For Solar (on_grid, off_grid, hybrid):**
```
Component 1: Base Price (before GST)
  - Calculated: systemKW × ratePerKW
  - Example: 3 × ₹68,000 = ₹204,000

Component 2: GST Amount
  - Calculated: basePrice × 8.9%
  - Example: ₹204,000 × 0.089 = ₹18,156

Component 3: Project Value (with GST)
  - Formula: basePrice + gstAmount
  - Example: ₹204,000 + ₹18,156 = ₹222,156

Component 4: Subsidy Amount
  - Conditional on: property type + project type + kW range
  - Example (residential, on-grid, 2-10kW): ₹78,000

Component 5: Customer Payment
  - Formula: projectValue - subsidyAmount
  - Example: ₹222,156 - ₹78,000 = ₹144,156
```

**For Water Heater:**
```
Component 1: Base Price
  - Calculated: litres × ₹350
  - Example: 100 × ₹350 = ₹35,000

Component 2: GST Amount
  - Always 0% for water heaters
  - Example: ₹0

Component 3: Project Value
  - Formula: basePrice + gstAmount
  - Example: ₹35,000 + ₹0 = ₹35,000

Component 4: Subsidy Amount
  - Always ₹0 (no subsidy for water heater)

Component 5: Customer Payment
  - Formula: projectValue - subsidyAmount
  - Example: ₹35,000 - ₹0 = ₹35,000
```

---

## 8. PRICING CALCULATION SYSTEM

### Frontend Calculation Flow

**When User Creates/Modifies Project:**

1. **Input Trigger**: User changes panel count, watts, property type, etc.

2. **System KW Calculation**:
   ```javascript
   const panelWatts = parseInt(form.panelWatts);
   const panelCount = form.panelCount;
   const systemKW = (panelWatts × panelCount) / 1000;
   ```

3. **Rate Selection**:
   ```javascript
   const ratePerKW = projectType === 'on_grid' ? 68000 :
                    projectType === 'off_grid' ? 85000 :
                    projectType === 'hybrid' ? 95000 : 0;
   ```

4. **Base Price Calculation**:
   ```javascript
   const roundedKW = systemKW <= 3.5 ? 
                    Math.floor(systemKW) : 
                    Math.ceil(systemKW);
   const basePrice = Math.round(roundedKW × ratePerKW);
   ```

5. **GST Calculation**:
   ```javascript
   const gstPercentage = 8.9;  // Default for solar
   const gstAmount = Math.round(basePrice × (gstPercentage / 100));
   ```

6. **Project Value**:
   ```javascript
   const projectValue = basePrice + gstAmount;
   ```

7. **Subsidy Calculation** (see section 9):
   ```javascript
   const subsidyAmount = calculateSubsidy(systemKW, propertyType, projectType);
   ```

8. **Customer Payment**:
   ```javascript
   const customerPayment = projectValue - subsidyAmount;
   ```

9. **Update Form**:
   ```javascript
   form.setValue("projects[index]", {
     ...project,
     systemKW,
     basePrice,
     gstAmount,
     projectValue,
     subsidyAmount,
     customerPayment
   });
   ```

### Multi-Project Totals

**Aggregate Calculation:**
```javascript
const projects = form.getValues("projects");

const totalSystemCost = projects.reduce((sum, p) => 
  sum + (p.projectValue || 0), 0);

const totalGSTAmount = projects.reduce((sum, p) => 
  sum + (p.gstAmount || 0), 0);

const totalSubsidyAmount = projects.reduce((sum, p) => 
  sum + (p.subsidyAmount || 0), 0);

const totalCustomerPayment = projects.reduce((sum, p) => 
  sum + (p.customerPayment || 0), 0);

// Payment terms
const advanceAmount = Math.round(totalCustomerPayment × 0.90);
const balanceAmount = Math.round(totalCustomerPayment × 0.10);
```

### Backend Validation

**API receives complete pricing data and validates:**
```typescript
// Verify calculations match backend formulas
const calculatedValue = calculateProjectValue(project);
if (Math.abs(project.projectValue - calculatedValue) > 1) {
  // Amounts don't match - potential tampering
  return 400 ValidationError;
}
```

---

## 9. SUBSIDY CALCULATION LOGIC

### Eligibility Criteria

**Mandatory Conditions:**
1. Property Type: **Residential ONLY**
2. Project Type: **On-Grid OR Hybrid ONLY**
3. System Size: **1 kW to 10 kW** (above 10 kW gets no subsidy)

**Not Eligible:**
- Off-Grid systems (no government subsidy available)
- Water Heater systems (no subsidy)
- Water Pump systems (no subsidy)
- Commercial properties (no subsidy)
- Agricultural properties (no subsidy)
- Other property types (no subsidy)

### Subsidy Amount Table

**Based on System Size:**
```
System Size         Subsidy Amount
≤ 1 kW             ₹30,000
> 1 kW to 2 kW     ₹60,000
> 2 kW to 10 kW    ₹78,000
> 10 kW            ₹0 (No subsidy)
```

### Implementation

**In Frontend (quotation-creation.tsx):**
```typescript
const calculateSubsidy = (kw: number, propertyType: string, projectType: string): number => {
  // Only residential
  if (propertyType !== 'residential') return 0;

  // Only on_grid and hybrid
  if (!['on_grid', 'hybrid'].includes(projectType)) return 0;

  // Range-based subsidy
  if (kw <= 1) return 30000;
  else if (kw > 1 && kw <= 2) return 60000;
  else if (kw > 2 && kw <= 10) return 78000;
  else return 0;  // > 10 kW: No subsidy
};
```

**In Backend (quotation-template-service.ts):**
```typescript
static calculateSubsidy(kw: number, propertyType: string, projectType: string): number {
  // Residential only
  if (propertyType !== 'residential') return 0;

  // On-grid and hybrid only
  if (!['on_grid', 'hybrid'].includes(projectType)) return 0;

  // Range-based calculation
  if (kw <= 1) return 30000;
  else if (kw > 1 && kw <= 2) return 60000;
  else if (kw > 2 && kw <= 10) return 78000;
  else return 0;
}
```

### Subsidy Calculation Example

**Scenario 1: Residential, On-Grid, 3.24 kW**
```
Property Type: Residential ✓
Project Type: On-Grid ✓
System Size: 3.24 kW ✓ (within 2-10 kW range)
Eligible: YES
Subsidy Amount: ₹78,000
```

**Scenario 2: Commercial, On-Grid, 3 kW**
```
Property Type: Commercial ✗
Project Type: On-Grid ✓
System Size: 3 kW ✓
Eligible: NO (commercial property)
Subsidy Amount: ₹0
```

**Scenario 3: Residential, Off-Grid, 3 kW**
```
Property Type: Residential ✓
Project Type: Off-Grid ✗
System Size: 3 kW ✓
Eligible: NO (off-grid not eligible)
Subsidy Amount: ₹0
```

**Scenario 4: Residential, On-Grid, 12 kW**
```
Property Type: Residential ✓
Project Type: On-Grid ✓
System Size: 12 kW ✗ (> 10 kW)
Eligible: NO (exceeds 10 kW limit)
Subsidy Amount: ₹0
```

---

## 10. SITE VISIT DATA INTEGRATION

### Data Mapping Architecture

**High-Level Flow:**
```
Site Visit Data
    ↓
Data Completeness Analysis
    ↓
[Decision Point]
    ├─ Can Create (90%+ critical fields) → Auto-map
    ├─ Partial (50-90%) → User completes missing
    └─ Invalid (< 50%) → Request more site visit data
    ↓
Map Customer → Quotation
Map Projects → Quotation
Calculate Pricing → Quotation
Build Internal Notes → Quotation
    ↓
Quotation Ready for Review
```

### Completeness Analysis Details

**Critical Fields (60% weight):**
```
✓ customer.name (required)
✓ customer.mobile (required)
✓ customer.address (required)
✓ marketingData.projectType (required)
✓ visitOutcome = 'converted' (required)
```

**Important Fields (30% weight):**
```
~ customer.propertyType
~ customer.ebServiceNumber
~ marketingData configurations (inverter KW, panel count, battery specs, water heater litre, water pump HP)
~ technicalData.serviceTypes, workType
~ adminData.bankProcess, ebProcess
```

**Optional Fields (10% weight):**
```
~ customer.location
~ technicalData.description, teamMembers
~ Site photos
~ Notes and follow-up dates
```

**Completeness Scoring:**
```
criticalScore% = (met critical / total critical) × 100
importantScore% = (met important / total important) × 100
optionalScore% = (met optional / total optional) × 100

finalScore = (criticalScore% × 0.6) + 
             (importantScore% × 0.3) + 
             (optionalScore% × 0.1)

Quality Grade:
  A: 90-100%
  B: 80-89%
  C: 70-79%
  D: 60-69%
  F: < 60%
```

**Quotation Readiness Logic:**
```
Can Create = (
  // Path 1: Traditional (strict)
  (allCriticalFieldsMet && 
   visitOutcome='converted' && 
   status='completed')
  OR
  // Path 2: Marketing (flexible)
  (validMarketingConfig && 
   hasBasicCustomerInfo)
  OR
  // Path 3: Partial (most flexible)
  (hasAnyCustomerInfo && 
   department='marketing')
)
```

### Project Configuration Mapping

**On-Grid Configuration Mapping:**
```
Site Visit Source → Quotation Field
─────────────────────────────────────
onGridConfig.solarPanelMake → solarPanelMake[]
onGridConfig.panelWatts → panelWatts
onGridConfig.panelType → panelType
onGridConfig.panelCount → panelCount
onGridConfig.inverterMake → inverterMake[]
onGridConfig.inverterKW → inverterKW
onGridConfig.inverterPhase → inverterPhase
onGridConfig.structureType → structureType
onGridConfig.heightRange → gpStructure.{lowerEndHeight, higherEndHeight}
onGridConfig.civilWorkScope → civilWorkScope
onGridConfig.netMeterScope → netMeterScope

Auto-Calculated:
– systemKW = (panelWatts × panelCount) / 1000
– basePrice = systemKW × 68000
– gstAmount = basePrice × 0.089
– projectValue = basePrice + gstAmount
– subsidyAmount = calculateSubsidy(...)
– customerPayment = projectValue - subsidyAmount
```

**Off-Grid Configuration Mapping:**
```
offGridConfig.solarPanelMake → solarPanelMake[]
offGridConfig.panelWatts → panelWatts
offGridConfig.panelCount → panelCount
offGridConfig.inverterMake → inverterMake[]
offGridConfig.inverterKVA → inverterKVA
offGridConfig.inverterPhase → inverterPhase
offGridConfig.batteryBrand → batteryBrand
offGridConfig.batteryType → batteryType
offGridConfig.batteryAH → batteryAH
offGridConfig.batteryCount → batteryCount

Auto-Calculated:
– systemKW = (panelWatts × panelCount) / 1000
– backupWatts = (batteryAH × 10 × batteryCount) × 0.97
– basePrice = systemKW × 85000
– gstAmount = basePrice × 0.089
– projectValue = basePrice + gstAmount
– subsidyAmount = 0 (no subsidy for off-grid)
– customerPayment = projectValue
```

### Customer Data Preservation

**Multi-Project Quotations:**
- Site visit may contain multiple project configurations
- Service automatically creates separate QuotationProject for each
- Each project independently calculated
- All projects linked to single quotation

**Example:**
```
Site Visit Contains:
  - On-Grid Configuration (3 kW)
  - Water Heater Configuration (100L)

Maps To Single Quotation With:
  - Project 1: On-Grid, ₹222,156 (₹78k subsidy)
  - Project 2: Water Heater, ₹35,000 (no subsidy)
  - Total: ₹257,156 (₹78k subsidy)
  - Customer Payment: ₹179,156
```

---

## 11. PDF GENERATION SYSTEM

### Client-Side PDF Generation Architecture

**Workflow:**
```
1. User clicks "Download PDF" button
2. Frontend makes POST request to /api/quotations/:id/generate-pdf
3. Backend generates HTML document
4. Backend returns HTML string
5. Frontend creates hidden iframe
6. Frontend writes HTML to iframe document
7. Frontend triggers window.print() on iframe
8. User sees print dialog
9. User selects "Save as PDF"
10. PDF file downloaded
```

### HTML Document Structure

**Page Layout:**
```
┌────────────────────────────────────────────────┐
│              HEADER (70px)                      │
│ [Logo] Company Name          [Quotation Metadata]
│ Contact Info                 Quotation #, Date
├────────────────────────────────────────────────┤
│ CUSTOMER SECTION (100px)                        │
│ Quotation Prepared for      Contact Us At
│ Customer Name               Sales Person
│ Address & Contact           Contact Number
├────────────────────────────────────────────────┤
│ REFERENCE SECTION (50px)                        │
│ Dear Sir, Sub: [project description]
│ Ref: Discussion with [sales person]
├────────────────────────────────────────────────┤
│ COMPANY INTRODUCTION                            │
│ [2-3 paragraphs about company]
├────────────────────────────────────────────────┤
│ QUOTATION FOR [PROJECT] (YELLOW HIGHLIGHT)
├────────────────────────────────────────────────┤
│ PRICING TABLE (for solar projects)
│ ┌─ Description, kW, Rate, GST%, Value + GST ─┐
│ │ Supply and install X kW solar system        │
│ │ Total Cost, GST, Total Amount, Amount Words │
│ └──────────────────────────────────────────────┘
├────────────────────────────────────────────────┤
│ SUBSIDY NOTE (green highlight, if applicable)
├────────────────────────────────────────────────┤
│                  [PAGE BREAK]
├────────────────────────────────────────────────┤
│ BILL OF MATERIALS                              │
│ ┌─ Sl No, Description, Type, Volt, Rating ──┐
│ │ ... detailed BOM items ...                  │
│ └──────────────────────────────────────────────┘
├────────────────────────────────────────────────┤
│ BACKUP SOLUTIONS (if off-grid/hybrid)          │
│ ┌─ Backup Watts, Usage Watts → Hours ────────┐
│ │ e.g., 1000W, 800W usage → 1.25 hours       │
│ └──────────────────────────────────────────────┘
├────────────────────────────────────────────────┤
│ SCOPE OF WORK                                  │
│ – Structure installation scope
│ – Electrical work scope
│ – Civil work scope
│ – Customer responsibility items
├────────────────────────────────────────────────┤
│ WARRANTY INFORMATION                           │
│ – Solar Panels: 25 Years
│ – Inverter: 5-15 Years
│ – Installation: 2 Years
├────────────────────────────────────────────────┤
│ TERMS & CONDITIONS                             │
│ – Payment Terms: 90% Advance, 10% Balance
│ – Bank Account Details
│ – Delivery Period
│ – Documents Required for Subsidy
└────────────────────────────────────────────────┘
```

### Styling & Branding

**Color Scheme:**
```
Primary Green: #228B22 (Prakash Green Energy brand)
  - Used for: Table headers, section titles, borders
  
Yellow Highlight: #ffff99
  - Used for: Important quotation title, total sections
  
Light Green: #90EE90
  - Used for: BOM summary background
  
Light Red: #fff3cd (tan/beige)
  - Used for: Document requirements, notes sections
```

**Print Optimization:**
```
– Page size: A4 (210mm × 297mm)
– Margins: 1cm all sides
– Font: Arial, 12px (default), 10px (BOM), 11px (headers)
– Line height: 1.4x
– Page breaks configured to avoid orphaned content
– Background colors enabled for printing
```

### Number-to-Words Conversion

**Indian Numbering System:**
```
Example: 222156
↓
Twenty-Two Lacs Twenty-One Thousand One Hundred Fifty-Six
↓
"Rupees Twenty-Two Lacs Twenty-One Thousand One Hundred Fifty-Six Only"

Breakdown:
- Crores (10,000,000)
- Lacs (100,000)
- Thousands (1,000)
- Hundreds
- Tens & Ones
```

**Logic:**
```typescript
const numberToWords = (num: number): string => {
  if (num === 0) return 'Zero';
  
  let crore = Math.floor(num / 10000000);
  let lakh = Math.floor((num % 10000000) / 100000);
  let thousand = Math.floor((num % 100000) / 1000);
  let remainder = num % 1000;
  
  let result = '';
  if (crore > 0) result += convertThreeDigit(crore) + ' Crore ';
  if (lakh > 0) result += convertTwoDigit(lakh) + ' Lacs ';
  if (thousand > 0) result += convertTwoDigit(thousand) + ' Thousand ';
  if (remainder > 0) result += convertThreeDigit(remainder);
  
  return 'Rupees ' + result.trim() + ' Only';
};
```

---

## 12. BILL OF MATERIALS (BOM) GENERATION

### BOM Item Structure

```typescript
interface BillOfMaterialsItem {
  slNo: number;           // Serial number (1, 2, 3...)
  description: string;    // Item name (Solar Panel, Inverter, etc.)
  type: string;          // Type/Specification (Bifacial, MPPT, etc.)
  volt: string;          // Voltage rating (24, 230, 415, etc.)
  rating: string;        // Power rating (530 WATTS, 3 KW, etc.)
  make: string;          // Manufacturer (Gautam, Growatt, etc.)
  qty: number;           // Quantity
  unit: string;          // Unit (Nos, Sets, Feet, etc.)
  rate?: number;         // Unit rate (optional, ₹)
  amount?: number;       // Total amount (optional, ₹)
}
```

### On-Grid BOM Generation

**Typical Structure:**

| Sl No | Description | Type | Volt | Rating | Make | Qty | Unit |
|-------|-------------|------|------|--------|------|-----|------|
| 1 | Solar Panel | Bifacial | 24 | 530 WATTS | Gautam/Premier | 6 | Nos |
| 2 | Solar Ongrid Inverter | MPPT | 230 | 3 KW | Growatt/Eastman | 1 | Nos |
| 3 | Panel Mounting Structure | GI | - | 3 KW | Local | 1 | Sets |
| 4 | AC & DC Electrical Accessories | - | - | As Req | Local | 1 | Sets |
| 5 | Earth Kit | - | DC | As Req | Local | 1 | Sets |
| 6 | Labour & Transport | - | - | 3 KW | Local | 1 | Sets |
| 7 | Civil Work | - | - | As Req | Customer | 1 | Sets |

**Generation Logic:**
```typescript
const generateOnGridBOM = (project: any): BillOfMaterialsItem[] => {
  const items: BillOfMaterialsItem[] = [];
  let slNo = 1;
  
  // 1. Solar Panel
  items.push({
    slNo: slNo++,
    description: "Solar Panel (D)",
    type: project.panelType === 'topcon' ? 'Topcon' : 'Bifacial',
    volt: "24",
    rating: `${project.panelWatts} WATTS`,
    make: project.solarPanelMake.join(' / '),
    qty: project.panelCount,
    unit: "Nos"
  });
  
  // 2. Inverter
  items.push({
    slNo: slNo++,
    description: "Solar Ongrid Inverter",
    type: "MPPT",
    volt: project.inverterPhase === 'three_phase' ? '415' : '230',
    rating: `${project.inverterKW} KW`,
    make: project.inverterMake.join(' / '),
    qty: project.inverterQty,
    unit: "Nos"
  });
  
  // 3. Structure (type-specific)
  const structureType = project.structureType === 'gp_structure' ? 'GI' : 'Aluminium';
  items.push({
    slNo: slNo++,
    description: "Panel Mounting Structure",
    type: structureType,
    volt: "-",
    rating: `${project.systemKW.toFixed(1)} KW`,
    make: "Local",
    qty: 1,
    unit: "Sets"
  });
  
  // 4-6. Electrical, Earthing, Labour...
  // ... additional items ...
  
  return items;
};
```

### Off-Grid BOM Generation

**Typical Structure:**

| Sl No | Description | Type | Volt | Rating | Make | Qty | Unit |
|-------|-------------|------|------|--------|------|-----|------|
| 1 | Solar Panel | Bifacial | 24 | 530 WATTS | Gautam/UTL | 6 | Nos |
| 2 | Solar Off-grid Inverter | MPPT | 24/48 | 3 KVA | Growatt/Eastman | 1 | Nos |
| 3 | Battery | Lead Acid | 12/24 | 100 AH | Exide/Luminous | 2 | Nos |
| 4 | Battery Stands | Steel | - | As Req | Local | 1 | Sets |
| 5 | Electrical Accessories | - | 24 | As Req | Local | 1 | Sets |
| 6 | Earth Kit | - | DC | As Req | Local | 1 | Sets |
| 7 | Structure | GI/MS | - | 3 KW | Local | 1 | Sets |
| 8 | Labour & Transport | - | - | As Req | Local | 1 | Sets |

### Water Heater BOM

**Typical Structure:**

| Sl No | Description | Type | Qty | Unit |
|-------|-------------|------|-----|------|
| 1 | Solar Water Heater Unit | Venus/Brand | 100L | Nos |
| 2 | Installation & Mounting | With Piping | 1 | Set |
| 3 | Piping Work | Up to 15 ft | 1 | Set |
| 4 | Labour & Transport | As Per Scope | 1 | Set |

### Water Pump BOM

**Typical Structure:**

| Sl No | Description | Type | Qty | Unit |
|-------|-------------|------|-----|------|
| 1 | Solar Panel | Bifacial | 10 | Nos |
| 2 | Inverter | Solar Inverter | 1 | Nos |
| 3 | Water Pump | 1 HP Motor | 1 | Nos |
| 4 | Structure | GI Structure | 1 | Set |
| 5 | Electrical Accessories | - | 1 | Set |
| 6 | Labour & Transport | - | 1 | Set |

---

## 13. PROJECT TYPE CONFIGURATIONS

### Configuration Options Available

#### A. On-Grid Solar System

**Mandatory Fields:**
- System KW (calculated from panels)
- Panel Make, Watts, Type, Count
- Inverter Make, KW, Quantity, Phase
- Inverter Phase (single or three phase)

**Optional Fields:**
- Lightning Arrest (yes/no)
- Electrical Accessories
- Earthing Type (DC/AC/Both)
- Floor Level
- Structure Type & Heights
- Mono Rail Type
- Civil Work Scope
- Net Meter Scope

**Output:**
- Bill of Materials (7-10 items)
- Pricing: ₹68,000/kW
- GST: 8.9%
- Subsidy: If residential (₹30k-78k)

#### B. Off-Grid Solar System

**Mandatory Fields:**
- System KW (calculated from panels)
- Panel Make, Watts, Type, Count
- Inverter Make, KVA, Phase
- Battery Brand, Type, AH, Count
- Voltage (12/24/48V)

**Optional Fields:**
- Lightning Arrest
- Electrical Accessories
- Earthing Type
- Floor Level
- Structure Type
- Battery Stands specification
- Civil Work Scope
- Electrical Work Scope

**Output:**
- Bill of Materials (8-10 items)
- Backup Solutions calculation
- Pricing: ₹85,000/kW
- GST: 8.9%
- Subsidy: ₹0 (not eligible for off-grid)

#### C. Hybrid Solar System

**Mandatory Fields:**
- System KW (calculated from panels)
- Panel Make, Watts, Type, Count
- Inverter Make, KVA, Phase
- Battery Brand, Type, AH, Count
- Voltage (12/24/48V)

**Optional Fields:**
- Similar to off-grid
- Plus: Net Meter Scope

**Output:**
- Bill of Materials (9-11 items)
- Backup Solutions calculation
- Pricing: ₹95,000/kW
- GST: 8.9%
- Subsidy: If residential (₹30k-78k)

#### D. Water Heater

**Mandatory Fields:**
- Brand (Venus, Racold, etc.)
- Capacity (100-500 liters)
- Model (Pressurized / Non-Pressurized)

**Optional Fields:**
- Labor & Transport (checkbox)
- Heating Coil Type
- Civil Work Scope
- Plumbing Work Scope

**Output:**
- Bill of Materials (3-4 items)
- Pricing: ₹350/litre
- GST: 0%
- Subsidy: ₹0

#### E. Water Pump

**Mandatory Fields:**
- Motor HP (1, 2, 3, 5 HP, etc.)
- Drive Type (VFD / Direct)
- Panel Make, Watts, Count
- Inverter Phase

**Optional Fields:**
- Panel Type
- Structure Type & Heights
- Lightning Arrest
- Electrical Accessories
- Labor & Transport
- Civil Work Scope
- Plumbing Work Scope

**Output:**
- Bill of Materials (6-8 items)
- Pricing: ₹45,000/HP
- GST: 0%
- Subsidy: ₹0

---

## 14. ERROR HANDLING & VALIDATION

### Frontend Validation

**Form-Level Validation (Zod Schemas):**
```typescript
// Customer validation
name: min 2 chars, required
mobile: min 10 digits, required
address: min 3 chars, required
propertyType: enum required

// Project validation
projectType: required
systemKW: > 0
panelCount: >= 1
inverterQty: >= 1
projectValue: >= 0

// Pricing validation
totalCustomerPayment: >= 0
advanceAmount: > 0
balanceAmount: >= 0
```

**Field-Level Validation (UI Feedback):**
```
✓ Real-time error messages
✓ Red highlighting of invalid fields
✓ Disabled submit button if form invalid
✓ Specific error messages (not "Field required")
✓ Field tooltips for complex fields
```

**Business Logic Validation:**
```
✓ Property type must be selected before calculating subsidy
✓ System KW must be within reasonable range (0.1 - 100 kW)
✓ Pricing must be recalculated when project parameters change
✓ At least one project required
✓ Customer must exist or be creatable
```

### API-Level Validation

**Request Validation:**
```typescript
// All requests validated with Zod
try {
  const validated = insertQuotationSchema.parse(req.body);
} catch (error: ZodError) {
  return res.status(400).json({
    message: "Validation error",
    errors: error.errors  // Detailed validation errors
  });
}
```

**Permission Validation:**
```typescript
// Every endpoint checks user permissions
const user = await storage.getUser(userId);
if (!user || !await storage.checkEffectiveUserPermission(user.uid, "quotations.create")) {
  return res.status(403).json({ message: "Access denied" });
}
```

**Data Consistency Validation:**
```typescript
// Backend recalculates to detect tampering
const calculatedCost = calculateProjectValue(project);
if (Math.abs(project.projectValue - calculatedCost) > 1) {
  return res.status(400).json({ message: "Pricing mismatch detected" });
}
```

### Error Response Format

**Standard Error Response:**
```json
{
  "message": "Human-readable error message",
  "statusCode": 400,
  "errors": [
    {
      "field": "projects[0].systemKW",
      "message": "System KW must be greater than 0"
    }
  ]
}
```

**Common Error Scenarios:**
```
400 Bad Request
  – Validation failed
  – Missing required fields
  – Invalid field format
  – Pricing inconsistency

403 Forbidden
  – User lacks permission
  – Department authorization failed

404 Not Found
  – Quotation not found
  – Customer not found
  – Site visit not found

500 Internal Server Error
  – Database error
  – Service processing error
  – Unexpected exception
```

---

## 15. DEPLOYMENT & CONFIGURATION

### Environment Variables Required

```env
# None specifically for quotation system
# Uses existing auth and storage infrastructure
```

### Configuration Files

**vite.config.ts** (Frontend):
```typescript
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
      '@shared': path.resolve(__dirname, 'shared'),
      '@lib': path.resolve(__dirname, 'client/src/lib'),
      '@components': path.resolve(__dirname, 'client/src/components'),
      '@hooks': path.resolve(__dirname, 'client/src/hooks'),
    }
  },
  plugins: [
    react(),
    tailwind(),
    cartographer(),
    runtimeErrorModal()
  ]
});
```

### Database Schema (if needed)

**Note:** Current implementation uses in-memory storage. For production:
```typescript
// Could use Drizzle ORM
export const quotations = pgTable('quotations', {
  id: text('id').primaryKey(),
  quotationNumber: text('quotation_number').unique(),
  customerId: text('customer_id').references(() => customers.id),
  source: text('source'),  // 'manual' or 'site_visit'
  status: text('status'),
  projects: jsonb('projects'),  // JSON array of projects
  totalSystemCost: numeric('total_system_cost'),
  totalSubsidyAmount: numeric('total_subsidy_amount'),
  totalCustomerPayment: numeric('total_customer_payment'),
  paymentTerms: text('payment_terms'),
  deliveryTimeframe: text('delivery_timeframe'),
  preparedBy: text('prepared_by'),
  createdAt: timestamp('created_at').default(now()),
  updatedAt: timestamp('updated_at'),
  updatedBy: text('updated_by')
});
```

### API Integration Points

**Required Services:**
- Authentication (`verifyAuth` middleware)
- Customer storage (`storage.getCustomer`, `storage.createCustomer`)
- Quotation storage (`storage.createQuotation`, `storage.getQuotation`, etc.)
- Site Visit service (for site visit mapping)
- User service (for resolving user names in PDFs)

**Optional Services:**
- PDF hosting/storage (for archiving generated PDFs)
- Email service (for sending quotations to customers)
- SMS service (for WhatsApp communication)

### Performance Considerations

**Optimization Strategies:**
```
✓ Pagination: 20 items per page default, max 100
✓ Search: Debounced 300ms on frontend
✓ Caching: React Query with stale-while-revalidate
✓ Lazy Loading: Projects loaded on demand
✓ Code Splitting: Large forms loaded as suspense boundaries
```

**Database Queries (if applicable):**
```
✓ Index on quotationNumber (unique)
✓ Index on customerId (foreign key)
✓ Index on status (filtering)
✓ Index on createdAt (sorting)
✓ Compound index on (customerId, createdAt)
```

### Testing Checklist

**Manual Testing:**
- [ ] Create manual quotation with all project types
- [ ] Create quotation from site visit
- [ ] Verify subsidy calculation (residential on-grid)
- [ ] Verify no subsidy (commercial, off-grid, water systems)
- [ ] Test multi-project quotations
- [ ] Download PDF and verify formatting
- [ ] Test pagination and filtering
- [ ] Test permission controls (create, view, edit)

**Edge Cases:**
- [ ] Sub-1 kW system display format
- [ ] Systems > 10 kW (no subsidy)
- [ ] Boundary cases (exactly 1 kW, 2 kW, 10 kW)
- [ ] Very large systems (50+ kW)
- [ ] Very small systems (0.1 kW)
- [ ] Multiple projects with different subsidy eligibility

---

## SUMMARY STATISTICS

| Metric | Value |
|--------|-------|
| Total Code Lines | 9,700+ |
| Frontend Lines | 7,640 |
| Backend Lines | 2,075 |
| Documentation Pages | 15+ |
| Data Models | 8+ |
| API Endpoints | 10 |
| Backend Services | 3 |
| Project Types Supported | 5 |
| Project Type Combinations | 50+ |
| User-Configurable Parameters | 100+ |

---

**Document Completion Date:** November 22, 2025  
**Next Review Date:** Recommended after next feature release  
**Version Control:** Git commit included with this documentation

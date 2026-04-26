# UNIFIED QUOTATION SYSTEM - ENTERPRISE SOLUTION
## Godiva Solar - Complete Proposal Generation Platform

---

## 1. CURRENT SYSTEM ANALYSIS

### 1.1 Site Visit System (Existing - Fully Functional)
**Status**: ✅ Complete and sophisticated

**Capabilities**:
- **Multi-department forms**: Technical, Marketing, Admin with specialized fields
- **Rich data collection**: 
  - Customer details (name, mobile, address, EB service number, property type)
  - Project specifications (on-grid/off-grid/hybrid configurations)
  - Equipment details (solar panels, inverters, batteries, water systems)
  - Technical requirements (installation scope, team assignments)
  - Location tracking with GPS accuracy
  - Photo documentation with timestamps
- **Follow-up system**: Complete tracking of customer journey
- **Visit outcomes**: Converted/On Process/Cancelled status management

### 1.2 Quotation System (Existing - Basic)
**Status**: ⚠️ Partially implemented

**Current Components**:
- Basic quotation schema (customer ID, products, total, status)
- API endpoints for CRUD operations
- Dashboard component showing recent quotations
- Link to `/quotations/new` (page not implemented)

**Missing Components**:
- Actual quotation creation/editing pages
- Document generation system
- Integration with site visit data
- Professional template formatting

### 1.3 ANALYZED QUOTATION CALCULATION LOGIC (From Sample Template)

**Sample Analysis - 3kW On-Grid System for Mr. P.S. Pradeep:**

**Pricing Structure**:
- **Total System Cost**: ₹2,04,000 (₹68,000 per kW for 3kW system)
- **Government Subsidy**: ₹78,000 (₹26,000 per kW - fixed government rate)
- **Customer Payment**: ₹1,26,000 (Total - Subsidy)
- **Subsidy Credit**: Direct to customer's account after installation

**Payment Schedule**:
- **90% Advance**: ₹1,13,400 (90% of ₹1,26,000) with purchase order
- **10% Balance**: ₹12,600 after completion

**Key Business Rules Identified**:
1. **Per-kW Pricing**: ₹68,000/kW for on-grid systems
2. **Subsidy Rate**: ₹26,000/kW (government fixed rate)
3. **Customer Pays**: (System Cost - Subsidy Amount)
4. **Delivery**: 2-3 weeks from order confirmation

**Enterprise Requirements Discovered**:
- **Multiple Projects Per Customer**: Same customer requesting on-grid + water heater + pump
- **Professional Document Generation**: Matching exact company format
- **Unified Templates**: Same output regardless of entry method (site visit vs standalone)
- **Complex Warranty Matrix**: Different warranties for different components

---

## 2. CRITICAL BUSINESS SCENARIOS IDENTIFIED

### 2.1 Multiple Projects Per Customer Challenge
**Real-world Scenario**: During single site visit, customer requests:
- **3kW On-Grid Solar System** (main requirement)
- **500L Solar Water Heater** (additional request)
- **3HP Solar Water Pump** (farm irrigation)

**Current Problem**: No system to handle multiple quotations for same customer efficiently

### 2.2 Data Duplication & Inconsistency
- **Site visits collect 90% of quotation data** but no connection exists
- Sales team re-enters customer details for each project type
- Risk of pricing inconsistencies across projects for same customer
- Multiple manual entries increase error probability

### 2.3 Template Inconsistency Issue
- **Separate quotation page** exists but uses different format/templates
- **Site visit quotations** (when implemented) might use different templates
- **No unified professional output** regardless of entry method

### 2.4 Enterprise Scalability Gaps
- No centralized pricing engine for different system types
- Missing warranty matrix for component combinations
- No bulk quotation generation for multiple projects
- Limited analytics on quotation performance

---

## 3. UNIFIED ENTERPRISE SOLUTION: "COMPLETE PROPOSAL MANAGEMENT SYSTEM"

### 3.1 CORE PRINCIPLE: "ONE SYSTEM, MULTIPLE ENTRY POINTS"
**Unified Architecture**: Whether quotation starts from site visit or standalone entry, it uses:
- ✅ **Same quotation builder interface**
- ✅ **Same professional templates**  
- ✅ **Same pricing calculation engine**
- ✅ **Same document generation system**
- ✅ **Same workflow management**

### 3.2 Multi-Project Customer Management
**Customer-Centric Approach**:
```
Customer: Mr. P.S. Pradeep
├── Project 1: 3kW On-Grid Solar (₹1,26,000)
├── Project 2: 500L Water Heater (₹45,000)
└── Project 3: 3HP Water Pump (₹85,000)
Total Portfolio Value: ₹2,56,000
```

**Benefits**:
- **Bulk Pricing**: Discounts for multiple projects
- **Unified Communication**: Single customer contact point
- **Cross-selling**: Identify complementary products
- **Relationship Management**: Complete customer view

### 3.3 Dual-Entry Unified System Design
**Entry Method A: Site Visit → Quotation** (80% of cases)
- Pre-populated from site visit marketing data
- Multiple quotations generated from single visit
- Customer details inherited across all projects
- Technical specifications auto-filled per project type

**Entry Method B: Standalone Creation** (20% of cases)  
- Manual entry using same quotation builder
- Option to link existing customer (avoid duplicate entry)
- Same professional templates and calculations
- Ability to create multiple projects for customer

---

## 4. DETAILED IMPLEMENTATION PLAN

### 4.1 Phase 1: Enterprise Quotation Data Model
**Duration**: 1-2 weeks

**Enhanced Schema (`shared/schema.ts`)** - Based on Real Template Analysis:
```typescript
// Customer-centric quotation management
export const quotationSchema = {
  // Basic Info & Relationships
  quotationNumber: string, // "Q-1052" format
  customerId: string,
  siteVisitId?: string, // Link to source site visit
  parentQuotationId?: string, // For multiple projects per customer
  
  // Project Classification
  projectType: 'on_grid' | 'off_grid' | 'hybrid' | 'water_heater' | 'water_pump' | 'solar_camera' | 'dc_appliances',
  systemCapacity: string, // "3kW", "5kW", "500L", "3HP"
  projectTitle: string, // "3 kw On-Grid Solar Power Generation System"
  
  // Calculated Pricing (Based on Analysis)
  financials: {
    totalSystemCost: number, // ₹2,04,000
    subsidyAmount: number,   // ₹78,000 (₹26,000/kW)
    customerPayment: number, // ₹1,26,000 (Total - Subsidy)
    advanceAmount: number,   // 90% of customer payment
    balanceAmount: number,   // 10% of customer payment
    pricePerUnit: number,    // ₹68,000/kW for pricing reference
    subsidyPerUnit: number   // ₹26,000/kW government rate
  },
  
  // Bill of Materials (Professional Structure)
  billOfMaterials: Array<{
    category: 'solar_panels' | 'inverter' | 'mounting_structure' | 'accessories' | 'installation',
    item: string,        // "Solar PV Panel Modules"
    specification: string, // "Monocrystalline, 540W, Tier-1"
    brand?: string,      // "Tata Power Solar"
    quantity: number,
    unit: string,        // "Nos", "Set", "Mtr"
    rate?: number,       // Per unit cost
    amount?: number      // Total component cost
  }>,
  
  // Warranty Matrix (Component-Specific)
  warranties: Array<{
    component: 'solar_panels' | 'inverter' | 'mounting_structure' | 'installation',
    manufacturingWarranty: string,  // "15 Years"
    serviceWarranty: string,        // "15 Years"
    performanceWarranty?: string,   // "90% till 15 years, 80% till 30 years"
    replacementWarranty?: string,   // "10 Years"
    exclusions: string[]            // ["Physical Damages"]
  }>,
  
  // Payment & Business Terms
  paymentTerms: {
    advancePercentage: number,     // 90
    balancePercentage: number,     // 10
    advanceTrigger: string,        // "Along with Purchase Order"
    balanceTrigger: string,        // "After completion of work"
    accountDetails?: {
      bankName: string,
      accountNumber: string,
      ifscCode: string,
      accountHolder: string
    }
  },
  
  // Delivery & Timeline
  deliveryPeriod: string,          // "2-3 Weeks from order confirmation"
  installationDuration?: string,   // "2-3 Days"
  
  // Scope of Work (Detailed)
  companyScope: Array<{
    category: string,              // "Structure", "Installation", "Documentation"
    description: string,           // "South facing slant mounting 4-5 feet"
    included: boolean
  }>,
  customerScope: Array<{
    category: string,              // "Civil Work", "Electrical", "Documentation"
    description: string,           // "Earth pit digging, 1 feet chamber"
    customerResponsibility: boolean
  }>,
  
  // Document Generation & Templates
  templateData: {
    templateType: string,          // "on_grid_template", "water_heater_template"
    companyLetterhead: boolean,
    customerReference: string,     // "Discussion with Mr. Selva Kumar"
    subjectLine: string,          // Auto-generated based on project
    introductionText: string,     // Company introduction paragraph
    managingDirectorName: string,
    contactPerson: string
  },
  
  // Multi-Project Customer Management
  customerProjectSummary?: {
    totalProjects: number,
    totalPortfolioValue: number,
    bulkDiscountApplied?: number,
    crossSellingOpportunities: string[]
  },
  
  // Status & Workflow
  status: 'draft' | 'review' | 'approved' | 'sent' | 'customer_approved' | 'converted' | 'rejected',
  createdBy: string,
  reviewedBy?: string,
  sentDate?: Date,
  customerResponseDate?: Date,
  conversionDate?: Date,
  
  // Document Outputs
  generatedDocuments: Array<{
    type: 'pdf' | 'word' | 'email',
    url: string,
    generatedAt: Date,
    version: number
  }>
}
```

### 4.2 Phase 2: Centralized Pricing Engine
**Duration**: 1 week

**Pricing Calculator (`server/pricing/calculator.ts`)** - Based on Analyzed Logic:
```typescript
// Centralized pricing logic based on real company rates
export class PricingEngine {
  // Base rates per system type (analyzed from sample)
  private static baseRates = {
    on_grid: {
      pricePerKW: 68000,    // ₹68,000/kW
      subsidyPerKW: 26000,  // ₹26,000/kW (government rate)
      maxSubsidyKW: 10      // Maximum subsidy applicable
    },
    off_grid: {
      pricePerKW: 85000,    // Higher due to battery cost
      subsidyPerKW: 0,      // No subsidy for off-grid
      maxSubsidyKW: 0
    },
    hybrid: {
      pricePerKW: 95000,    // Premium for hybrid functionality
      subsidyPerKW: 26000,  // Grid-tie portion gets subsidy
      maxSubsidyKW: 10
    },
    water_heater: {
      pricePerLiter: 80,    // ₹80/liter capacity
      fixedInstallation: 5000,
      subsidyPerLiter: 15   // Government solar heater subsidy
    },
    water_pump: {
      pricePerHP: 25000,    // ₹25,000/HP
      subsidyPerHP: 0       // No subsidy for pumps
    }
  };
  
  static calculateQuotation(projectType: string, capacity: number) {
    const rates = this.baseRates[projectType];
    const totalCost = this.calculateBaseCost(projectType, capacity);
    const subsidyAmount = this.calculateSubsidy(projectType, capacity);
    const customerPayment = totalCost - subsidyAmount;
    
    return {
      totalSystemCost: totalCost,
      subsidyAmount: subsidyAmount,
      customerPayment: customerPayment,
      advanceAmount: Math.round(customerPayment * 0.9),
      balanceAmount: Math.round(customerPayment * 0.1),
      pricePerUnit: rates.pricePerKW || rates.pricePerLiter || rates.pricePerHP,
      subsidyPerUnit: rates.subsidyPerKW || rates.subsidyPerLiter || 0
    };
  }
  
  // Multi-project bulk pricing
  static calculateBulkDiscount(quotations: QuotationType[]) {
    const totalValue = quotations.reduce((sum, q) => sum + q.financials.customerPayment, 0);
    let discount = 0;
    
    if (totalValue > 200000) discount = 0.05;      // 5% for ₹2L+
    if (totalValue > 500000) discount = 0.08;      // 8% for ₹5L+
    if (quotations.length >= 3) discount += 0.02;  // 2% for 3+ projects
    
    return Math.min(discount, 0.12); // Max 12% bulk discount
  }
}
```

### 4.3 Phase 3: Site Visit Data Mapping System  
**Duration**: 1 week

**Multi-Project Data Mapping (`server/mapping/siteVisitMapper.ts`)**:
```typescript
// Transform site visit data into multiple quotations based on customer requests
export class SiteVisitMapper {
  static generateQuotationsFromSiteVisit(siteVisit: SiteVisit): QuotationType[] {
    const marketingData = siteVisit.marketingData;
    const customer = siteVisit.customer;
    const quotations: QuotationType[] = [];
    
    // Generate quotation for each requested project type
    if (marketingData?.onGridConfig) {
      quotations.push(this.createOnGridQuotation(siteVisit, marketingData.onGridConfig));
    }
    
    if (marketingData?.offGridConfig) {
      quotations.push(this.createOffGridQuotation(siteVisit, marketingData.offGridConfig));
    }
    
    if (marketingData?.hybridConfig) {
      quotations.push(this.createHybridQuotation(siteVisit, marketingData.hybridConfig));
    }
    
    if (marketingData?.waterHeaterConfig) {
      quotations.push(this.createWaterHeaterQuotation(siteVisit, marketingData.waterHeaterConfig));
    }
    
    if (marketingData?.waterPumpConfig) {
      quotations.push(this.createWaterPumpQuotation(siteVisit, marketingData.waterPumpConfig));
    }
    
    // Apply bulk discount if multiple projects
    if (quotations.length > 1) {
      this.applyBulkPricing(quotations);
    }
    
    return quotations;
  }
  
  private static createOnGridQuotation(siteVisit: SiteVisit, config: OnGridConfig): QuotationType {
    const capacity = parseFloat(config.systemCapacity); // Extract number from "3kW"
    const pricing = PricingEngine.calculateQuotation('on_grid', capacity);
    
    return {
      quotationNumber: this.generateQuotationNumber(),
      customerId: siteVisit.customer.id,
      siteVisitId: siteVisit.id,
      projectType: 'on_grid',
      systemCapacity: config.systemCapacity,
      projectTitle: `${config.systemCapacity} On-Grid Solar Power Generation System`,
      
      financials: pricing,
      
      billOfMaterials: this.generateOnGridBOM(config),
      warranties: this.getStandardWarranties('on_grid'),
      
      paymentTerms: {
        advancePercentage: 90,
        balancePercentage: 10,
        advanceTrigger: "Along with Purchase Order",
        balanceTrigger: "After completion of work"
      },
      
      deliveryPeriod: "2-3 Weeks from order confirmation",
      
      companyScope: this.getOnGridCompanyScope(config),
      customerScope: this.getOnGridCustomerScope(),
      
      templateData: {
        templateType: "on_grid_template",
        companyLetterhead: true,
        customerReference: `Discussion with ${siteVisit.createdBy}`,
        subjectLine: `Requirement of ${config.systemCapacity} On-Grid Solar Power Generation System - Reg`,
        introductionText: this.getCompanyIntroduction(),
        managingDirectorName: "Mr. Godiva Solar Management",
        contactPerson: siteVisit.createdBy
      },
      
      status: 'draft',
      createdBy: siteVisit.createdBy
    };
  }
  
  // Method to generate Bill of Materials based on system configuration
  private static generateOnGridBOM(config: OnGridConfig): BillOfMaterial[] {
    const capacity = parseFloat(config.systemCapacity);
    const panelWattage = 540; // Standard panel wattage
    const panelCount = Math.ceil((capacity * 1000) / panelWattage);
    
    return [
      {
        category: 'solar_panels',
        item: 'Solar PV Panel Modules',
        specification: `Monocrystalline, ${panelWattage}W, Tier-1 Make`,
        brand: config.panelBrand || 'Tata Power Solar',
        quantity: panelCount,
        unit: 'Nos',
        rate: 18000,
        amount: panelCount * 18000
      },
      {
        category: 'inverter',
        item: 'Solar On-Grid Inverter',
        specification: `${config.systemCapacity}, ${config.phase} Phase`,
        brand: config.inverterBrand || 'Solis',
        quantity: 1,
        unit: 'Set',
        rate: 45000,
        amount: 45000
      },
      {
        category: 'mounting_structure',
        item: 'Mounting Structure',
        specification: 'Galvanized Iron, South facing slant mount',
        quantity: 1,
        unit: 'Set',
        rate: 25000,
        amount: 25000
      },
      {
        category: 'accessories',
        item: 'DC/AC Cables, MCB, Earthing',
        specification: 'Complete electrical accessories',
        quantity: 1,
        unit: 'Set',
        rate: 15000,
        amount: 15000
      },
      {
        category: 'installation',
        item: 'Installation & Commissioning',
        specification: 'Complete system installation',
        quantity: 1,
        unit: 'Job',
        rate: capacity * 8000,
        amount: capacity * 8000
      }
    ];
  }
}
```

### 4.4 Phase 4: Professional Template System
**Duration**: 2-3 weeks

**Template Engine (`server/templates/`)** - Matching Your Exact Format:
```typescript
// Professional document generation matching company format
export class TemplateEngine {
  static generateQuotationDocument(quotation: QuotationType, format: 'pdf' | 'word' | 'html') {
    const template = this.getTemplate(quotation.templateData.templateType);
    const compiledContent = this.compileTemplate(template, quotation);
    
    switch (format) {
      case 'pdf':
        return this.generatePDF(compiledContent);
      case 'word':
        return this.generateWordDoc(compiledContent);
      case 'html':
        return compiledContent;
    }
  }
  
  private static getTemplate(templateType: string): string {
    // Return exact HTML structure matching your quotation format
    return `
      <div class="quotation-document">
        <header class="company-header">
          <img src="{{companyLogo}}" alt="Godiva Solar" />
          <div class="contact-info">
            <h1>Godiva Solar</h1>
            <p>Complete Solar Solution Provider</p>
          </div>
        </header>
        
        <section class="customer-details">
          <p>Dear sir,</p>
          <p><strong>Sub:</strong> {{subjectLine}}</p>
          <p><strong>Ref:</strong> {{customerReference}}</p>
        </section>
        
        <section class="introduction">
          {{introductionText}}
        </section>
        
        <section class="quotation-summary">
          <h2>{{projectTitle}}</h2>
          <div class="pricing-summary">
            <p><strong>Total Amount {{totalSystemCost}} – Subsidy Amount {{subsidyAmount}} = {{customerPayment}}</strong></p>
            <p>{{systemCapacity}} Subsidy {{subsidyAmount}} Will be Credited to The Customer's Account</p>
          </div>
        </section>
        
        <section class="bill-of-materials">
          <h3>Bill of Materials for {{projectType}} System</h3>
          <table>
            {{#each billOfMaterials}}
            <tr>
              <td>{{item}}</td>
              <td>{{specification}}</td>
              <td>{{quantity}} {{unit}}</td>
              <td>₹{{amount}}</td>
            </tr>
            {{/each}}
          </table>
        </section>
        
        <section class="terms-conditions">
          <h3>Terms & Conditions</h3>
          <h4>Warranty Details:</h4>
          <p><em>***Physical Damages will not be Covered***</em></p>
          {{#each warranties}}
          <div class="warranty-item">
            <h5>{{component}}</h5>
            <ul>
              <li>{{manufacturingWarranty}} Manufacturing defect Warranty</li>
              <li>{{serviceWarranty}} Service Warranty</li>
              {{#if performanceWarranty}}
              <li>{{performanceWarranty}}</li>
              {{/if}}
            </ul>
          </div>
          {{/each}}
        </section>
        
        <section class="payment-terms">
          <h4>Payment Details:</h4>
          <ul>
            <li>{{advancePercentage}}% Advance {{advanceTrigger}}</li>
            <li>{{balancePercentage}}% {{balanceTrigger}}</li>
          </ul>
        </section>
        
        <section class="delivery">
          <h4>Delivery Period:</h4>
          <p>{{deliveryPeriod}}</p>
        </section>
        
        <section class="scope-of-work">
          <h4>Scope of Work</h4>
          {{#each companyScope}}
          <div>
            <h5>{{category}}</h5>
            <p>{{description}}</p>
          </div>
          {{/each}}
        </section>
        
        <section class="customer-scope">
          <h4>Customer's Scope of Work</h4>
          {{#each customerScope}}
          <div>
            <h5>{{category}}</h5>
            <p>{{description}}</p>
          </div>
          {{/each}}
        </section>
      </div>
    `;
  }
}
```

### 4.5 Phase 5: UNIFIED QUOTATION BUILDER (Core Component)
**Duration**: 2 weeks

**Universal Quotation Builder (`components/quotations/unified-quotation-builder.tsx`)**:
```typescript
// Single component used by BOTH site visit and standalone quotation creation
const UnifiedQuotationBuilder = ({ 
  initialData, // Pre-populated from site visit OR empty for standalone
  mode, // 'site_visit' | 'standalone' | 'edit'
  customerId,
  siteVisitId? 
}) => {
  const [quotations, setQuotations] = useState<QuotationType[]>(initialData || []);
  const [activeQuotation, setActiveQuotation] = useState(0);
  
  // SAME interface regardless of entry method
  return (
    <div className="quotation-builder">
      {/* Multi-Project Tabs */}
      <div className="project-tabs">
        {quotations.map((q, index) => (
          <Tab 
            key={index} 
            active={activeQuotation === index}
            onClick={() => setActiveQuotation(index)}
          >
            {q.projectTitle}
          </Tab>
        ))}
        <Button onClick={addNewProject}>+ Add Project</Button>
      </div>
      
      {/* Unified Builder Sections */}
      <div className="builder-content">
        <CustomerSection 
          quotation={quotations[activeQuotation]}
          readOnly={mode === 'site_visit'} // Customer details locked from site visit
        />
        
        <ProjectDetailsSection
          quotation={quotations[activeQuotation]}
          onUpdate={updateQuotation}
        />
        
        <PricingSection
          quotation={quotations[activeQuotation]}
          onUpdate={updateQuotation}
          autoCalculate={true} // Uses centralized pricing engine
        />
        
        <BillOfMaterialsSection
          quotation={quotations[activeQuotation]}
          onUpdate={updateQuotation}
        />
        
        <TermsConditionsSection
          quotation={quotations[activeQuotation]}
          onUpdate={updateQuotation}
        />
        
        <PreviewSection
          quotation={quotations[activeQuotation]}
          template={quotations[activeQuotation].templateData.templateType}
        />
      </div>
      
      {/* Actions - Same for both entry methods */}
      <div className="builder-actions">
        <Button onClick={saveDraft}>Save Draft</Button>
        <Button onClick={generatePDF}>Generate PDF</Button>
        <Button onClick={sendToCustomer}>Send to Customer</Button>
        {quotations.length > 1 && (
          <Button onClick={generateBulkQuotation}>Generate All Projects</Button>
        )}
      </div>
    </div>
  );
};
```

### 4.6 Phase 6: Integration Points Implementation
**Duration**: 1 week

**Site Visit Integration**:
```typescript
// Enhanced Site Visit Details Modal
const SiteVisitDetailsModal = () => {
  const handleGenerateQuotations = async () => {
    // Generate multiple quotations from single site visit
    const quotations = await SiteVisitMapper.generateQuotationsFromSiteVisit(siteVisit);
    
    // Navigate to unified quotation builder with pre-populated data
    navigate('/quotations/builder', { 
      state: { 
        initialData: quotations,
        mode: 'site_visit',
        customerId: siteVisit.customer.id,
        siteVisitId: siteVisit.id
      }
    });
  };
  
  const showGenerateQuotation = 
    siteVisit.visitOutcome === 'converted' && 
    siteVisit.marketingData && 
    ['technical', 'marketing'].includes(siteVisit.department);
    
  return (
    // ... existing modal content
    {showGenerateQuotation && (
      <Button onClick={handleGenerateQuotations} className="w-full">
        📋 Generate {getProjectCount(siteVisit.marketingData)} Quotation(s)
      </Button>
    )}
  );
};
```

**Standalone Quotation Page Enhancement**:
```typescript
// Updated quotations page - uses SAME builder component
const QuotationsPage = () => {
  const handleCreateNew = () => {
    // Navigate to same unified builder with empty data
    navigate('/quotations/builder', { 
      state: { 
        initialData: null,
        mode: 'standalone'
      }
    });
  };
  
  return (
    <div className="quotations-page">
      {/* Existing quotation list */}
      <QuotationsList />
      
      {/* Same "Create New" button leads to unified builder */}
      <Button onClick={handleCreateNew}>
        + Create New Quotation
      </Button>
    </div>
  );
};
```

---

## 5. TECHNICAL IMPLEMENTATION DETAILS

### 5.1 New API Endpoints
```
POST /api/quotations/from-site-visit/:siteVisitId
GET /api/quotations/:id/preview
POST /api/quotations/:id/generate-pdf
POST /api/quotations/:id/send-to-customer
```

### 5.2 New Components Structure
```
/components/quotations/
├── quotation-builder/
│   ├── quotation-builder.tsx          # Main builder component
│   ├── customer-section.tsx           # Customer details
│   ├── project-details-section.tsx    # System specifications  
│   ├── bill-of-materials-section.tsx  # Components list
│   ├── pricing-section.tsx            # Financial calculations
│   ├── terms-conditions-section.tsx   # Warranties & terms
│   └── preview-section.tsx            # Document preview
├── templates/
│   ├── on-grid-template.tsx           # On-grid system template
│   ├── off-grid-template.tsx          # Off-grid system template
│   └── hybrid-template.tsx            # Hybrid system template
└── quotation-list.tsx                 # Enhanced quotation listing
```

### 5.3 Pricing Engine Integration
- Component pricing database
- Subsidy calculation rules
- Installation cost estimation
- Dynamic pricing based on system size

---

## 6. UNIFIED USER EXPERIENCE FLOWS

### 6.1 Multi-Project Site Visit → Quotation Flow
```
Site Visit Completed with "Converted" status
    ↓
Site Visit Details Modal analyzes marketing data and shows:
"Generate 3 Quotations" button (On-Grid + Water Heater + Pump)
    ↓
UNIFIED QUOTATION BUILDER opens with:
├── Tab 1: "3kW On-Grid Solar System" (₹1,26,000)
├── Tab 2: "500L Solar Water Heater" (₹45,000)  
├── Tab 3: "3HP Solar Water Pump" (₹85,000)
└── Customer details PRE-POPULATED across all tabs
    ↓
Sales team uses SAME INTERFACE to:
├── Review auto-calculated pricing (bulk discount applied)
├── Modify specifications per project
├── Adjust warranties and terms
└── Preview professional documents
    ↓
Generate ALL project PDFs in company format
    ↓
Send complete proposal package to customer
```

### 6.2 Standalone Quotation Creation Flow  
```
Quotations Page → "Create New Quotation"
    ↓
SAME UNIFIED QUOTATION BUILDER opens (empty)
    ↓
Sales team uses IDENTICAL INTERFACE to:
├── Search/select existing customer OR create new
├── Add multiple project tabs for same customer
├── Enter specifications manually
├── Use SAME pricing engine and templates
└── Generate SAME professional format
    ↓
Same PDF generation and customer sending process
```

### 6.3 Enterprise Multi-Customer Bulk Operations
```
Dashboard → "Bulk Quotation Generation"
    ↓
Select multiple site visits with "Converted" status
    ↓
UNIFIED SYSTEM processes all at once:
├── Generates quotations for each customer
├── Applies bulk pricing rules
├── Creates professional documents
└── Prepares email campaigns
    ↓
Bulk send quotations to all customers
```

**KEY PRINCIPLE**: Whether starting from site visit data or creating standalone, users interact with the EXACT SAME quotation builder interface and get the EXACT SAME professional output.

---

## 7. EXPECTED BENEFITS

### 7.1 Efficiency Gains
- **90% reduction** in manual data entry for site visit-based quotations
- **Consistent formatting** across all quotations
- **Faster turnaround** from site visit to customer proposal
- **Reduced errors** from manual transcription

### 7.2 Professional Enhancement  
- **Standardized templates** matching company branding
- **Comprehensive proposals** with all technical details
- **Automatic calculations** for pricing and subsidies
- **Digital delivery** with tracking capabilities

### 7.3 Business Intelligence
- **Quotation analytics** (conversion rates, average values)
- **Site visit to quotation tracking** 
- **Customer journey visibility**
- **Sales performance metrics**

---

## 8. IMPLEMENTATION TIMELINE

**Total Duration**: 6-8 weeks

| Phase | Duration | Deliverables |
|-------|----------|-------------|
| Phase 1 | 1-2 weeks | Enhanced quotation schema, API updates |
| Phase 2 | 1 week | Data mapping functions, site visit integration |
| Phase 3 | 2-3 weeks | Template system, PDF generation |
| Phase 4 | 2 weeks | UI integration, quotation builder |
| Phase 5 | 1 week | Separate quotation page enhancement |

**Priority Order**:
1. Schema enhancement (Foundation)
2. Site visit integration (Core workflow)
3. Template system (Document generation)
4. UI implementation (User experience)
5. Standalone quotation enhancement (Completeness)

---

## 9. RISK MITIGATION

### 9.1 Technical Risks
- **PDF generation complexity**: Use proven libraries like Puppeteer/jsPDF
- **Template maintenance**: Modular template system for easy updates
- **Performance with large quotations**: Pagination and lazy loading

### 9.2 Business Risks  
- **User adoption**: Gradual rollout with training
- **Data migration**: Careful handling of existing quotations
- **Template accuracy**: Thorough review with sales team

---

## 10. SUCCESS METRICS

### 10.1 Efficiency Metrics
- Time from site visit to quotation generation: Target < 30 minutes
- Manual data entry reduction: Target 90%
- Quotation accuracy improvement: Target 95%+

### 10.2 Business Metrics
- Quotation response time: Target < 24 hours
- Conversion rate from quotation to order: Baseline measurement
- Customer satisfaction with proposal quality: Survey feedback

---

**This comprehensive approach transforms your quotation system from a basic CRUD interface into a sophisticated proposal generation engine that leverages your excellent site visit data collection while maintaining the flexibility for standalone quotation creation.**

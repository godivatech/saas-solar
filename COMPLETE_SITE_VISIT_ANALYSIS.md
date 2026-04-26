# Complete Site Visit System Analysis

## System Overview

The Site Visit Management System is a comprehensive field operations solution for **Prakash Greens Energy**, designed to handle field visits across three key departments: Technical, Marketing, and Administration. The system provides real-time GPS tracking, photo documentation, follow-up management, and role-based access control.

---

## 1. SCHEMA ARCHITECTURE (`shared/schema.ts`)

### Core Data Models

#### 1.1 Location Schema
```typescript
locationSchema = {
  latitude: number,
  longitude: number,
  accuracy?: number,
  address?: string
}
```
**Purpose**: GPS tracking for check-in/check-out locations with reverse geocoding support

#### 1.2 Customer Details Schema
```typescript
customerDetailsSchema = {
  name: string (min 2 chars),
  mobile: string (min 10 chars),
  address: string (min 3 chars),
  ebServiceNumber?: string,
  propertyType: enum ['residential', 'commercial', 'agri', 'other'],
  location?: string
}
```
**Purpose**: Customer information capture with validation

#### 1.3 Site Photo Schema
```typescript
sitePhotoSchema = {
  url: string (URL format),
  location: locationSchema,
  timestamp: Date,
  description?: string
}
```
**Purpose**: Photo documentation with GPS metadata and timestamps

#### 1.4 Department-Specific Schemas

**Technical Site Visit Schema:**
```typescript
technicalSiteVisitSchema = {
  serviceTypes: Array<enum>, // on_grid, off_grid, hybrid, solar_panel, camera, water_pump, water_heater, lights_accessories, others
  workType: enum, // installation, wifi_configuration, amc, service, electrical_fault, inverter_fault, etc.
  workingStatus: enum ['pending', 'completed'],
  pendingRemarks?: string,
  teamMembers: Array<string>,
  description?: string
}
```

**Marketing Site Visit Schema:**
```typescript
marketingSiteVisitSchema = {
  updateRequirements: boolean,
  projectType?: enum ['on_grid', 'off_grid', 'hybrid', 'water_heater', 'water_pump'],
  onGridConfig?: OnGridConfig,
  offGridConfig?: OffGridConfig,
  hybridConfig?: HybridConfig,
  waterHeaterConfig?: WaterHeaterConfig,
  waterPumpConfig?: WaterPumpConfig
}
```

**Admin Site Visit Schema:**
```typescript
adminSiteVisitSchema = {
  bankProcess?: {
    step: enum ['registration', 'document_verification', 'site_inspection', 'head_office_approval', 'amount_credited'],
    description?: string
  },
  ebProcess?: {
    type: enum ['new_connection', 'tariff_change', 'name_transfer', 'load_upgrade', 'inspection_before_net_meter', 'net_meter_followup', 'inspection_after_net_meter', 'subsidy'],
    description?: string
  },
  purchase?: string,
  driving?: string,
  officialCashTransactions?: string,
  officialPersonalWork?: string,
  others?: string
}
```

#### 1.5 Main Site Visit Schema
```typescript
insertSiteVisitSchema = {
  userId: string,
  department: enum ['technical', 'marketing', 'admin'],
  visitPurpose: enum ['visit', 'installation', 'service', 'purchase', 'eb_office', 'amc', 'bank', 'other'],
  
  // Location & Time Tracking
  siteInTime: Date,
  siteInLocation: locationSchema,
  siteInPhotoUrl?: string,
  siteOutTime?: Date,
  siteOutLocation?: locationSchema,
  siteOutPhotoUrl?: string,
  
  // Customer Information
  customer: customerDetailsSchema,
  
  // Department-specific data
  technicalData?: technicalSiteVisitSchema,
  marketingData?: marketingSiteVisitSchema,
  adminData?: adminSiteVisitSchema,
  
  // Site Photos (max 20)
  sitePhotos: Array<sitePhotoSchema>,
  siteOutPhotos?: Array<sitePhotoSchema>,
  
  // Follow-up System
  isFollowUp: boolean,
  followUpOf?: string,
  hasFollowUps: boolean,
  followUpCount: number,
  followUpReason?: string,
  followUpDescription?: string,
  
  // Status and metadata
  status: enum ['in_progress', 'completed', 'cancelled'],
  notes?: string,
  createdAt: Date,
  updatedAt: Date
}
```

#### 1.6 Follow-up Site Visit Schema
```typescript
insertFollowUpSiteVisitSchema = {
  originalVisitId: string,
  userId: string,
  department: enum ['technical', 'marketing', 'admin'],
  siteInTime: Date,
  siteInLocation: locationSchema,
  siteInPhotoUrl?: string,
  siteOutTime?: Date,
  siteOutLocation?: locationSchema,
  siteOutPhotoUrl?: string,
  
  followUpReason: enum ['additional_work_required', 'issue_resolution', 'status_check', 'customer_request', 'maintenance', 'other'],
  description: string (min 10 chars),
  
  sitePhotos: Array<string> (max 10),
  siteOutPhotos: Array<string> (max 10),
  
  status: enum ['in_progress', 'completed', 'cancelled'],
  notes?: string,
  customer: customerDetailsSchema
}
```

---

## 2. BACKEND SERVICE LAYER (`server/services/site-visit-service.ts`)

### 2.1 SiteVisitService Class

#### Core Methods:

**createSiteVisit(data: InsertSiteVisit)**
- **Logic**: Creates new site visit with Firestore timestamp conversion
- **Data Processing**:
  - Converts JavaScript dates to Firestore timestamps
  - Handles site photos array with timestamp conversion
  - Removes undefined values to prevent Firestore errors
- **Error Handling**: Comprehensive logging and error throwing
- **Returns**: SiteVisit with generated ID

**updateSiteVisit(id: string, updates: Partial<InsertSiteVisit>)**
- **Logic**: Updates existing site visit (primarily for check-out)
- **Key Features**:
  - Handles both Date objects and ISO strings for siteOutTime
  - Updates site photos with timestamp conversion
  - Automatic updatedAt timestamp
- **Use Cases**: Check-out, photo additions, status updates
- **Error Handling**: Robust timestamp conversion with fallbacks

**getSiteVisitsWithFilters(filters)**
- **Logic**: Ultra-simplified Firestore querying to avoid compound index issues
- **Filtering Strategy**:
  - Single Firestore equality filter (userId OR department)
  - In-memory filtering for other criteria (status, dates, purpose)
  - Prevents Firebase index requirement errors
- **Performance**: Optimized for small to medium datasets
- **Debugging**: Extensive logging for data structure validation

#### Data Conversion Logic:
The service includes `convertFirestoreToSiteVisit()` method that:
- Converts Firestore Timestamps back to JavaScript Dates
- Handles nested objects and arrays
- Ensures type consistency between database and application

#### Location-Based Queries:
- `getSiteVisitsByUser(userId, limit)`
- `getSiteVisitsByDepartment(department, limit)`
- `getActiveSiteVisits()` (status: 'in_progress')
- `getSiteVisitsByDateRange(startDate, endDate)`

#### Photo Management:
- `addSitePhotos(siteVisitId, photos)`: Adds photos to existing visit
- **Logic**: Max 20 photos limit, timestamp conversion, atomic updates

#### Analytics & Reporting:
- `getSiteVisitStats(filters)`: Comprehensive statistics
- `getAllSiteVisitsForMonitoring()`: For master admin dashboard
- `exportSiteVisitsToExcel(filters)`: Excel export functionality

---

## 3. API ROUTES LOGIC (`server/routes.ts`)

### 3.1 Authentication & Permission Flow:
1. **verifyAuth middleware**: Validates Firebase token
2. **Permission checking**: Role-based and department-based access
3. **User context**: Loads full user profile with permissions

### 3.2 Key Endpoints:

**POST /api/site-visits**
- **Permission**: site_visit.create
- **Validation**: Full schema validation using Zod
- **Logic**:
  - Validates request body against insertSiteVisitSchema
  - Adds userId from authenticated user
  - Automatic customer creation/lookup by phone and name
  - Department mapping (operations -> admin, administration -> admin)
  - Calls SiteVisitService.createSiteVisit()
- **Customer Integration**: Auto-creates customer record if not exists
- **Error Handling**: Zod validation errors, service errors, customer creation failures

**PATCH /api/site-visits/:id**
- **Permission**: site_visit.edit + ownership/team access
- **Use Cases**: Check-out, status updates, photo additions
- **Logic**:
  - Partial schema validation
  - Ownership validation (user can edit own visits OR team permission)
  - Team leader can edit team visits
  - Master admin can edit all visits
- **Checkout Logic**: Updates status to 'completed', adds siteOutTime and location

**GET /api/site-visits**
- **Permission**: Hierarchical view permissions
  - `view_all`: See all site visits (master admin)
  - `view_team`: See department site visits
  - `view_own`: See only own site visits
- **Query Parameters**:
  - userId, department, status, visitPurpose
  - startDate, endDate (with time normalization)
  - limit (default 50)
- **Logic**:
  - Permission-based filtering at service level
  - Date range normalization (start of day to end of day)
  - Returns data with count and applied filters

**GET /api/site-visits/active**
- **Permission**: site_visit.view_own minimum
- **Logic**: Returns only in_progress visits based on user permissions
- **Use Case**: Dashboard active visit counts

### 3.3 Follow-up System Routes:
- **POST /api/site-visits/follow-up**: Creates follow-up visit
- **GET /api/follow-ups**: Lists follow-ups for current user
- **PATCH /api/follow-ups/:id/checkout**: Follow-up checkout

---

## 4. FRONTEND ARCHITECTURE

### 4.1 Main Page (`client/src/pages/site-visit.tsx`)

#### Component Structure:
```
SiteVisitPage
├── Statistics Dashboard
├── Tabbed Interface
│   ├── Active Visits Tab
│   ├── Completed Visits Tab
│   └── All Visits Tab
├── Customer Grouping Logic
├── Action Modals
│   ├── SiteVisitStartModal
│   ├── SiteVisitDetailsModal
│   ├── SiteVisitCheckoutModal
│   └── FollowUpModal
```

#### Customer Grouping Logic:
```typescript
function groupVisitsByCustomer(visits: SiteVisit[]): CustomerVisitGroup[] {
  // Groups by mobile + name combination
  // Handles primary visit + follow-ups chronologically
  // Tracks active visit status per customer
}
```

**Key Features**:
- **Primary Visit**: Most recent visit becomes primary
- **Follow-ups**: Older visits grouped as follow-ups
- **Status Tracking**: Shows if customer has active visit
- **Visit Count**: Total visits per customer

#### State Management:
- **React Query**: Server state management and caching
- **Local State**: UI states, modals, filters
- **Authentication**: User permissions and department context

### 4.2 Core Components Analysis

#### SiteVisitStartModal (`site-visit-start-modal.tsx`)
**6-Step Workflow**:
1. **Visit Purpose Selection**: Choose from predefined purposes
2. **Customer Information**: Autocomplete + manual entry
3. **Location Capture**: GPS with accuracy validation
4. **Photo Capture**: Selfie + site photos with camera switching
5. **Department-specific Forms**: Dynamic based on user department
6. **Review & Submit**: Final validation and submission

**Key Logic**:
- **Camera Management**: Front/back camera switching, stream handling
- **Location Services**: GPS capture with error handling
- **Form Validation**: Multi-step validation with error states
- **Photo Processing**: Multiple photo capture with preview

**Technical Features**:
- **Error Boundary**: Wraps camera components
- **Memory Cleanup**: Stream disposal, canvas cleanup
- **Responsive Design**: Mobile-first camera interface

#### Department-Specific Forms

**TechnicalSiteVisitForm** (`technical-site-visit-form.tsx`):
- **Service Types** (Multi-select):
  - On-grid, Off-grid, Hybrid solar systems
  - Solar panel, Camera, Water pump, Water heater
  - Lights & accessories, Others
- **Work Type Categories**:
  - Installation & Setup: installation, wifi_configuration, structure, welding_work
  - Maintenance & Service: amc, service, repair, cleaning
  - Troubleshooting: electrical_fault, inverter_fault, solar_panel_fault, wiring_issue, camera_fault, light_fault
  - Other Services: site_visit, light_installation, painting, others
- **Working Status**: pending, completed (with pending remarks requirement)
- **Team Members**: Multi-select with custom member addition
- **Validation**: Service types, work type, working status, team members required

**MarketingSiteVisitForm** (`marketing-site-visit-form.tsx`):
- **Requirements Update**: Boolean to determine if updating customer requirements
- **Project Type Selection**: on_grid, off_grid, hybrid, water_heater, water_pump
- **Configuration Forms** (Dynamic based on project type):
  - OnGrid: Solar panel make, watts, inverter specs, lightning arrest, earthing
  - OffGrid: OnGrid config + battery brand, voltage, count
  - Hybrid: Same as OffGrid
  - Water Heater: Brand, litre capacity, heating coil
  - Water Pump: HP, drive type, solar panel specs, structure height
- **Project Value**: Required for all configurations

**AdminSiteVisitForm** (`admin-site-visit-form.tsx`):
- **Bank Process**: Registration, document verification, site inspection, approval, credit
- **EB Process**: New connection, tariff change, name transfer, load upgrade, inspections
- **Other Activities**: Purchase, driving, cash transactions, personal work

#### SiteVisitCheckoutModal (`site-visit-checkout-modal.tsx`)
**Checkout Process**:
1. **Location Capture**: GPS verification for checkout location
2. **Photo Capture**: Selfie + site exit photos
3. **Notes Addition**: Optional checkout notes
4. **Status Update**: Changes status to 'completed'

**Key Features**:
- **Duration Calculation**: Automatic work duration calculation
- **Location Validation**: Ensures proper checkout location
- **Photo Requirements**: Selfie and site photos for verification

### 4.3 Location Services (`client/src/lib/location-service.ts`)

#### LocationService Class Features:
- **GPS Detection**: High-accuracy location capture using browser geolocation API
- **Reverse Geocoding**: Automatic address lookup using Google Maps API
- **Fallback Handling**: Graceful degradation when API keys are missing
- **Error Recovery**: Comprehensive error handling with retry capabilities

#### Key Methods:
1. **detectLocation()**: Main location detection with address lookup
2. **getCurrentPosition()**: Raw GPS coordinate capture
3. **reverseGeocode()**: Address resolution from coordinates
4. **handleLocationError()**: Error categorization and recovery

#### Location Data Structure:
```typescript
interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;        // In meters
  address?: string;        // Short address (e.g., "Madurai, TN")
  formattedAddress?: string; // Full address from Google Maps
}
```

#### Error Handling Logic:
- Permission denied: Prompts user to enable location
- Timeout: Retry with different accuracy settings
- Unavailable: Falls back to manual location entry
- API failure: Uses coordinates as address

---

## 5. BUSINESS LOGIC FLOW

### 5.1 Site Visit Creation Flow
```
User Authentication → Permission Check → Department Detection → Start Modal
    ↓
Visit Purpose Selection → Customer Search/Entry → Location Capture
    ↓
Photo Capture (Selfie + Site) → Department Form → Review & Submit
    ↓
API Validation → Firestore Save → Cache Invalidation → UI Update
```

### 5.2 Check-out Flow
```
Active Visit Detection → Checkout Modal → Location Capture
    ↓
Exit Photo Capture → Status Update to 'completed' → Duration Calculation
    ↓
API Update → Firestore Update → Cache Refresh → UI Update
```

### 5.3 Follow-up Creation Flow
```
Original Visit Selection → Follow-up Modal → Reason Selection
    ↓
Location & Photo Capture → Link to Original Visit → Counter Update
    ↓
API Creation → Firestore Save → Relationship Update → Cache Refresh
```

---

## 6. PERMISSION SYSTEM

### 6.1 Role-Based Access Control (RBAC):
1. **Roles**: master_admin, admin, employee
2. **Departments**: Defines module access
3. **Designations**: Defines action permissions

### 6.2 Site Visit Permissions:
- `site_visit.view`: View site visits
- `site_visit.create`: Create new visits
- `site_visit.edit`: Edit visits (with ownership rules)
- `site_visit.view_team`: View team visits
- `site_visit.view_all`: View all department visits
- `site_visit.reports`: Access analytics and reports

### 6.3 Permission Logic:
```typescript
// Department-based module access
getDepartmentModuleAccess(department)

// Designation-based action permissions  
getDesignationActionPermissions(designation)

// Combined effective permissions
getEffectivePermissions(department, designation)
```

---

## 7. DATA FLOW ARCHITECTURE

### 7.1 Client-Side Flow:
1. **React Query**: Manages server state and caching
2. **API Client**: Centralized request handling with auth headers
3. **Local State**: UI states, form data, temporary data
4. **Cache Management**: Automatic invalidation on mutations

### 7.2 Server-Side Flow:
1. **Express Routes**: Handle HTTP requests and responses
2. **Authentication Middleware**: JWT validation and user context
3. **Service Layer**: Business logic and data processing
4. **Firestore Integration**: Document storage and querying

### 7.3 Data Persistence:
1. **Firestore Collections**:
   - `siteVisits`: Main visit documents
   - `users`: User profiles and permissions
   - `customers`: Customer information
2. **Cloudinary**: Photo and file storage
3. **Client Cache**: React Query cache for performance

---

## 8. TECHNICAL IMPLEMENTATION DETAILS

### 8.1 Frontend Technologies:
- **React 18**: Component framework with hooks
- **TanStack Query**: Server state management
- **Wouter**: Lightweight routing
- **Shadcn/UI**: Component library with Tailwind CSS
- **Zod**: Schema validation
- **Date-fns**: Date manipulation

### 8.2 Backend Technologies:
- **Node.js + Express**: Server framework
- **TypeScript**: Type safety
- **Firebase Admin SDK**: Authentication and Firestore
- **Cloudinary**: Media management
- **XLSX**: Excel export functionality

### 8.3 Mobile Considerations:
- **Camera API**: Native camera access with front/back switching
- **Geolocation API**: GPS positioning with high accuracy
- **Responsive Design**: Mobile-first approach
- **Error Handling**: Device-specific error messages

### 8.4 Performance Optimizations:
- **Query Caching**: React Query with stale-while-revalidate
- **Pagination**: Server-side pagination for large datasets
- **Image Optimization**: Cloudinary transformations
- **Memory Management**: Stream cleanup, canvas disposal

---

## 9. ERROR HANDLING & RECOVERY

### 9.1 Camera Integration:
- **Device Detection**: Enumerate available cameras
- **Constraint Fallbacks**: Progressive constraint reduction
- **Stream Management**: Proper cleanup and disposal
- **Error Recovery**: Retry mechanisms with different settings

### 9.2 Location Services:
- **Permission Handling**: Clear user guidance for permissions
- **Timeout Management**: Progressive timeout increases
- **Offline Fallback**: Manual location entry options
- **API Integration**: Backend key fetching for Maps API

### 9.3 Data Validation:
- **Schema Validation**: Zod validation on frontend and backend
- **Type Safety**: TypeScript throughout the stack
- **Error Boundaries**: React error boundaries for critical components
- **Firestore Errors**: Proper error handling for database operations

---

## 10. FOLLOW-UP SYSTEM

### 10.1 Follow-up Logic:
- **Original Visit Linking**: Links follow-ups to original visits
- **Reason Tracking**: Categorized follow-up reasons
- **Customer Grouping**: Groups all visits by customer
- **Counter Management**: Tracks number of follow-ups per site

### 10.2 Follow-up Features:
- **Simplified Forms**: Reduced data entry for follow-ups
- **Photo Documentation**: Site photos for each follow-up
- **Status Tracking**: Independent status for each follow-up
- **Relationship Management**: Maintains parent-child relationships

---

This comprehensive analysis covers every aspect of the Site Visit Management System, from data schemas and business logic to user interface components and error handling. The system is designed to be scalable, maintainable, and user-friendly while providing comprehensive field operation management capabilities.

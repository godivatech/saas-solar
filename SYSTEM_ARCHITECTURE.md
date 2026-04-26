# Prakash Greens Energy - Authentication & Permission System Architecture

## Overview
The system implements a sophisticated role-based access control (RBAC) with Firebase authentication and Firestore database storage. The architecture follows a dual-layer permission model:

1. **Department = Feature Access** (which modules/sections users can see)
2. **Designation = Action Permissions** (what actions they can perform within modules)

## User Roles Hierarchy

### Master Admin (Top Level)
- **Role**: `master_admin`
- **Access**: Unlimited access to all system features
- **Permissions**: All system permissions automatically granted
- **Setup**: Created directly in Firestore database by development team
- **Department**: Usually "operations" 
- **Designation**: Usually "ceo" or "gm"

### Admin (Middle Level)
- **Role**: `admin`
- **Access**: Department-specific administrative functions
- **Permissions**: Based on department + designation combination
- **Setup**: Assigned by master admin after registration

### Employee (Base Level)
- **Role**: `employee` (default for all new registrations)
- **Access**: Limited based on assigned department and designation
- **Permissions**: Calculated from department + designation
- **Setup**: Auto-assigned on registration, department/designation set by master admin

## Department-Based Module Access

Each department grants access to specific system modules:

### Operations Department
- **Users**: CEO, GM, Officer level positions
- **Access**: Full dashboard, enterprise analytics, advanced reports, user management
- **Modules**: All system modules

### Admin Department  
- **Users**: Administrative staff, executives
- **Access**: User management, department oversight, departmental analytics
- **Modules**: Users, departments, reports, analytics

### HR Department
- **Users**: Human resources staff
- **Access**: Employee management, attendance, leave management
- **Modules**: Attendance, leave, users, customers, products, quotations, invoices (view)

### Marketing Department
- **Users**: Marketing executives, team leaders
- **Access**: Customer management, product information, quotation viewing
- **Modules**: Customers, products, quotations, basic reports

### Sales Department
- **Users**: Sales executives, CRE (Customer Relationship Executive)
- **Access**: Customer management, quotation creation/editing
- **Modules**: Customers, quotations, products (view), basic reports

### Technical Department
- **Users**: Team leaders, technicians, welders
- **Access**: Product management, specifications, inventory
- **Modules**: Products (full access), inventory, specifications

### Housekeeping Department
- **Users**: House staff, maintenance
- **Access**: Basic attendance tracking only
- **Modules**: Attendance (own records only)

## Designation-Based Action Permissions

Designations have hierarchical levels that determine action permissions:

### Level 9: CEO
- **Permissions**: All system permissions, unlimited approval authority
- **Actions**: System settings, enterprise analytics, unlimited approvals

### Level 8: GM (General Manager)
- **Permissions**: Enterprise analytics, advanced approvals
- **Actions**: Department management, high-value approvals, strategic reports

### Level 7: Officer
- **Permissions**: Departmental management, invoice approvals
- **Actions**: User management, departmental analytics, approval workflows

### Level 6: Team Leader
- **Permissions**: Team management, advanced quotation approvals
- **Actions**: Team oversight, leave approvals, advanced reports

### Level 5: Executive & CRE
- **Permissions**: Invoice creation, basic quotation approvals
- **Actions**: Customer management, quotation handling, team attendance view

### Level 4: CRE (Customer Relationship Executive)
- **Permissions**: Customer and quotation management
- **Actions**: Customer creation/editing, quotation creation/editing

### Level 3: Technician
- **Permissions**: Product management
- **Actions**: Product creation/editing, technical specifications

### Level 2: Welder
- **Permissions**: Product viewing, basic operations
- **Actions**: Product information access, work order viewing

### Level 1: House Man
- **Permissions**: Basic attendance marking
- **Actions**: Personal attendance tracking only

## Authentication Flow

### New User Registration
1. User registers through Firebase Authentication
2. System automatically creates user profile with `employee` role
3. Department and designation are initially `null`
4. User gets default permissions (dashboard view, own attendance, leave requests)
5. Master admin assigns department and designation
6. System recalculates permissions based on assignment

### Master Admin Setup
1. Development team creates master admin directly in Firestore:
   ```javascript
   {
     uid: "firebase-auth-uid",
     email: "admin@prakashgreens.com",
     displayName: "Master Administrator",
     role: "master_admin",
     department: "operations",
     designation: "ceo",
     isActive: true
   }
   ```
2. Master admin logs in with pre-created Firebase credentials
3. System recognizes master_admin role and grants unlimited permissions

### Permission Calculation
The system uses a sophisticated permission calculation:

```typescript
// For master_admin: All permissions automatically
if (user.role === "master_admin") {
  permissions = ALL_SYSTEM_PERMISSIONS;
}

// For others: Department + Designation combination
else if (user.department && user.designation) {
  const departmentModules = getDepartmentModuleAccess(user.department);
  const designationActions = getDesignationActionPermissions(user.designation);
  permissions = [...departmentModules, ...designationActions]; // Combined & deduplicated
}

// For new employees: Basic permissions only
else {
  permissions = ["dashboard.view", "attendance.view_own", "leave.view_own", "leave.request"];
}
```

## Key System Features

### Multi-Layer Security
- Firebase Authentication for user identity
- Firestore for user profile and permissions storage
- Server-side permission validation on all API endpoints
- Client-side permission checks for UI elements

### Dynamic Permission Updates
- Permissions recalculated when department/designation changes
- Real-time permission refresh without logout/login
- Context-aware UI rendering based on current permissions

### Approval Workflows
- Designation-based approval limits
- Department-based approval routing
- Multi-level approval chains for high-value transactions

### Audit Trail
- All permission changes logged
- User action tracking
- Department/designation assignment history

## Default System Permissions

The system includes 50+ granular permissions covering:
- **User Management**: view, create, edit, delete, activate, deactivate
- **Customer Operations**: view, create, edit, manage relationships
- **Product Management**: view, create, edit, specifications, inventory
- **Financial Operations**: quotations, invoices, approvals with limits
- **HR Operations**: attendance, leave management, approvals
- **Reporting**: basic, advanced, financial, enterprise analytics
- **System Administration**: settings, backup, audit, integrations

## Integration Points

### Firebase Services
- **Authentication**: User identity and session management
- **Firestore**: User profiles, permissions, organizational data
- **Admin SDK**: Server-side user management and validation

### Backend Services
- **Express.js**: API endpoints with permission middleware
- **Storage Layer**: Abstracted data access with permission checks
- **Route Protection**: All endpoints validate user permissions

### Frontend Components
- **Auth Context**: Centralized permission state management
- **Protected Routes**: Component-level access control
- **Conditional Rendering**: Permission-based UI elements
- **Real-time Updates**: Permission changes reflect immediately

This architecture ensures scalable, secure, and maintainable role-based access control suitable for enterprise deployment.
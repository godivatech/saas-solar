import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  AlertTriangle,
  Plus,
  Search,
  FileText,
  Calculator,
  User,
  Settings,
  Zap,
  Battery,
  Droplets,
  Wrench,
  Info,
  Sun,
  Loader2,
  Edit2,
  Save,
  X,
  Table,
  Eye
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { sanitizeFormData } from "@shared/utils/form-sanitizer";
import { roundSystemKW, formatKWForDisplay } from "@shared/utils";
import CustomerAutocomplete from "@/components/ui/customer-autocomplete";
import { BatteryBrandCombobox } from "@/components/ui/battery-brand-combobox";
import { useAuthContext } from "@/contexts/auth-context";
import {
  insertQuotationSchema,
  type InsertQuotation,
  type QuotationProject,
  quotationProjectSchema,
  quotationFollowUpSchema,
  siteVisitMappingSchema,
  solarPanelBrands,
  inverterMakes,
  panelWatts,
  panelTypes,
  inverterWatts,
  inverterPhases,
  earthingTypes,
  floorLevels,
  structureTypes,
  monoRailOptions,
  workScopeOptions,
  propertyTypes,
  insertCustomerSchema
} from "@shared/schema";

// Create extended project schema with GST fields
const quotationProjectSchemaWithGST = quotationProjectSchema.and(z.object({
  gstAmount: z.number().min(0).default(0),
  totalWithGST: z.number().min(0).default(0)
}));

// Use the proper quotation schema for validation
const quotationFormSchema = insertQuotationSchema.omit({
  quotationNumber: true, // Generated server-side
  createdAt: true,       // Set server-side
  updatedAt: true,       // Set server-side
  customerId: true       // Will be set from customerData or existing customer
}).extend({
  // Override for frontend form compatibility
  customerId: z.string().nullish(), // Allow empty for new customers (will be created server-side)
  projects: z.array(quotationProjectSchemaWithGST).min(1, "At least one project is required"),
  followUps: z.array(quotationFollowUpSchema).default([]),
  siteVisitMapping: siteVisitMappingSchema.nullish(),
  // Add temporary customer data fields for site visit forms with email made optional
  customerData: insertCustomerSchema.omit({ email: true }).extend({
    email: z.string().email().or(z.literal("")).nullish().transform(v => v === "" ? null : v) // Convert empty string to null
  }).nullish(),
  // Add GST-related total fields
  totalGSTAmount: z.number().min(0).default(0),
  totalWithGST: z.number().min(0).default(0)
});

type QuotationFormData = z.infer<typeof quotationFormSchema>;

// Wizard steps configuration
const WIZARD_STEPS = [
  {
    id: "source",
    title: "Source Selection",
    description: "Choose how to create this quotation",
    icon: Search
  },
  {
    id: "customer",
    title: "Customer Details",
    description: "Customer information and contact details",
    icon: User
  },
  {
    id: "projects",
    title: "Project Configuration",
    description: "Solar systems and project specifications",
    icon: Zap
  },
  {
    id: "pricing",
    title: "Pricing & Terms",
    description: "Costs, payments, and delivery terms",
    icon: Calculator
  },
  {
    id: "review",
    title: "Review & Submit",
    description: "Final review before creating quotation",
    icon: FileText
  }
];

// Business rules from the directive
const BUSINESS_RULES = {
  pricing: {
    onGridPerKW: 68000,
    offGridPerKW: 85000,  // Off-grid costs more due to battery storage
    hybridPerKW: 95000,   // Hybrid costs most due to dual functionality
    waterPumpPerHP: 45000, // Water pump pricing per HP
    waterHeaterPerLitre: 350 // Water heater pricing per litre
  },
  subsidy: {
    waterHeater: 0,       // No subsidy for water heater
    waterPump: 0          // No subsidy for water pump
  },
  payment: {
    advancePercentage: 90,
    balancePercentage: 10
  },
  gst: {
    percentage: 8.9        // 8.9% GST as per business requirements
  }
};

// Subsidy calculation based on kW ranges (only for residential properties)
// For on_grid and hybrid projects:
// Up to 1 kW: ₹30,000
// 1-2 kW: ₹60,000
// 2-10 kW: ₹78,000
// Above 10 kW: No subsidy
const calculateSubsidy = (kw: number, propertyType: string, projectType: string): number => {
  // Subsidy only applies to residential properties for on_grid and hybrid
  if (propertyType !== 'residential') {
    return 0;
  }

  // Only on_grid and hybrid projects get subsidy
  if (!['on_grid', 'hybrid'].includes(projectType)) {
    return 0;
  }

  // Range-based subsidy with proper range comparisons
  if (kw <= 1) {
    return 30000;
  } else if (kw > 1 && kw <= 2) {
    return 60000;
  } else if (kw > 2 && kw <= 10) {
    return 78000;
  } else {
    // Above 10 kW: No subsidy
    return 0;
  }
};

// Helper function to generate project description based on project type and configuration
const generateProjectDescription = (project: QuotationProject): string => {
  const projectType = project.projectType;

  switch (projectType) {
    case 'on_grid': {
      const systemKW = (project as any).systemKW || 0;
      const kw = formatKWForDisplay(systemKW);
      const inverterKW = (project as any).inverterKW || kw;
      const phase = project.inverterPhase === 'three_phase' ? '3-Phase' : '1-Phase';
      return `Supply and Installation of ${kw} kw Solar Panel ${inverterKW} KW Inverter ${phase} ON-GRID Solar System`;
    }

    case 'off_grid': {
      const panelWatts = project.panelWatts || 530;
      const panelCount = project.panelCount || 1;
      const inverterKVA = (project as any).inverterKVA || (project as any).inverterKW || 1;
      const voltage = project.voltage || 24;
      const batteryCount = project.batteryCount || 1;
      const inverterVolt = (project as any).inverterVolt || (voltage * batteryCount);
      const inverterMake = project.inverterMake && project.inverterMake.length > 0
        ? project.inverterMake[0].toUpperCase()
        : 'MPPT';
      const batteryAH = project.batteryAH || 100;
      const phase = project.inverterPhase === 'three_phase' ? '3' : '1';
      return `Supply and Installation of ${panelWatts}W X ${panelCount} Nos Panel, ${inverterKVA}KVA/${inverterVolt}v ${inverterMake} Inverter, ${batteryAH}Ah Battery * ${batteryCount} nos, ${phase}-Phase Offgrid Solar System`;
    }

    case 'hybrid': {
      const systemKW = (project as any).systemKW || 0;
      const totalKW = formatKWForDisplay(systemKW);
      const inverterKVA = (project as any).inverterKVA || (project as any).inverterKW || 1;
      const voltage = project.voltage || 24;
      const batteryCount = project.batteryCount || 1;
      const inverterVolt = (project as any).inverterVolt || (voltage * batteryCount);
      const phase = project.inverterPhase === 'three_phase' ? '3' : '1';
      const batteryBrand = ((project as any).batteryBrand || 'Exide').toUpperCase();
      const batteryAH = project.batteryAH || 100;
      const batteryType = (project as any).batteryType === 'lithium' ? 'Lithium Battery' : 'Lead Acid Battery';
      return `Supply and Installation of ${totalKW} KW PANEL, ${inverterKVA}KVA/${inverterVolt}V ${phase} Phase Hybrid Inverter, ${batteryBrand} ${batteryAH}AH ${batteryType}-${batteryCount} Nos, Hybrid Solar System`;
    }

    case 'water_heater': {
      const brand = (project as any).brand || 'Standard';
      const litres = project.litre || 100;
      const model = (project as any).waterHeaterModel === 'pressurized' ? 'Pressurized' : 'Non-Pressurized';
      const heatingCoil = (project as any).heatingCoil || 'Heating Coil';
      const gstSuffix = (project as any).labourAndTransport ? '\nAnd Transport Including GST' : '\nIncluding GST';
      return `Supply and Installation of ${brand} make solar water heater ${litres} LPD commercial ${model} with corrosion resistant epoxy Coated Inner tank and powder coated outer tank.\n${heatingCoil}${gstSuffix}`;
    }

    case 'water_pump': {
      const driveHPRaw = (project as any).driveHP || (project as any).hp || 1;
      const driveHP = Math.floor(parseFloat(driveHPRaw));
      const panelWattsNum = Number(project.panelWatts) || 540;
      const panelCount = project.panelCount || 10;
      const calculatedKW = (panelWattsNum * panelCount) / 1000;
      const totalKW = formatKWForDisplay(calculatedKW);
      const panelBrand = (project as any).panelBrand && (project as any).panelBrand.length > 0
        ? (project as any).panelBrand[0].toUpperCase()
        : 'UTL';
      const phase = (project as any).inverterPhase === 'three_phase' ? '3' : '1';
      const lowerHeight = (project as any).gpStructure?.lowerEndHeight || 3;
      const higherHeight = (project as any).gpStructure?.higherEndHeight || 4;

      let description = `Supply and Installation solar power System Includes: ${driveHP} hp Drive ${totalKW} kw ${panelWattsNum}Wp x ${panelCount} Nos ${panelBrand} Panel, ${phase}-Phase, ${totalKW} kw Structure ${lowerHeight} feet lower to ${higherHeight} feet higher`;

      const conditionalItems = [];
      if ((project as any).earth && (project as any).earth.length > 0) {
        conditionalItems.push('Earth kit');
      }
      if ((project as any).lightningArrest) {
        conditionalItems.push('Lighting Arrester');
      }
      if ((project as any).electricalAccessories) {
        conditionalItems.push('Electrical Accessories');
      }
      if ((project as any).labourAndTransport) {
        conditionalItems.push('Labour and Transport');
      }

      if (conditionalItems.length > 0) {
        description += ' ' + conditionalItems.join(', ');
      }

      return description;
    }

    default:
      return `Supply and Installation of ${(project as any).projectType || 'Solar'} Solar System`;
  }
};

// Helper function to format structure type labels
const formatStructureTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    'gp_structure': 'GP Structure',
    'mono_rail': 'Mono Rail',
    'gi_structure': 'GI Structure',
    'gi_round_pipe': 'GI Round Pipe',
    'ms_square_pipe': 'MS Square Pipe'
  };
  return labels[type] || type;
};

// Site visit mapping interface
interface SiteVisitMapping {
  id: string;
  customer: {
    name: string;
    mobile: string;
    address: string;
  };
  visitOutcome: string;
  completenessAnalysis: {
    completenessScore: number;
    missingCriticalFields: string[];
    missingImportantFields: string[];
    missingOptionalFields: string[];
    qualityGrade: string;
    canCreateQuotation: boolean;
    recommendedAction: string;
  };
}

// Site Visit Customer Details Form Component
function SiteVisitCustomerDetailsForm({ form, siteVisitMapping, fallbackSiteVisitData, isEditMode = false, existingCustomer }: { form: any; siteVisitMapping: any; fallbackSiteVisitData?: any; isEditMode?: boolean; existingCustomer?: any }) {
  const [customerState, setCustomerState] = useState<any>({});

  // Extract customer data from site visit mapping with updated structure - be very flexible
  // In edit mode, prioritize existing customer data from the database
  const siteVisitCustomerData = (isEditMode && existingCustomer) ?
    existingCustomer :
    (siteVisitMapping?.originalSiteVisitData?.customer ??
      siteVisitMapping?.customer ??
      siteVisitMapping?.originalSiteVisitData?.customerData ??
      fallbackSiteVisitData?.customer ??
      fallbackSiteVisitData?.customerData ??
      {});

  useEffect(() => {
    // Initialize customer state with site visit data
    const initialCustomerData = {
      name: siteVisitCustomerData.name || "",
      mobile: siteVisitCustomerData.mobile || "",
      address: siteVisitCustomerData.address || "",
      ebServiceNumber: siteVisitCustomerData.ebServiceNumber || "",
      tariffCode: siteVisitCustomerData.tariffCode || "",
      ebSanctionPhase: siteVisitCustomerData.ebSanctionPhase || null,
      ebSanctionKW: siteVisitCustomerData.ebSanctionKW || null,
      propertyType: siteVisitCustomerData.propertyType || "",
      location: siteVisitCustomerData.location || "",
      source: "site_visit"
    };

    setCustomerState(initialCustomerData);

    // Update form with customer data
    form.setValue("customerData", initialCustomerData);

    // Set the real customerId from the mapping response, not sentinel values
    if (siteVisitMapping?.quotationData?.customerId) {
      form.setValue("customerId", siteVisitMapping.quotationData.customerId);
    } else if (siteVisitCustomerData.id) {
      form.setValue("customerId", siteVisitCustomerData.id);
    }
    // If no customer ID available, the backend will create/find the customer during submission
  }, [siteVisitMapping, form, siteVisitCustomerData]);

  const updateCustomerField = (field: string, value: any) => {
    const updatedCustomerData = { ...customerState, [field]: value };
    setCustomerState(updatedCustomerData);
    form.setValue("customerData", updatedCustomerData);

    // Keep the real customerId from mapping response, don't overwrite with sentinel strings
    // The backend will handle customer ID resolution when the quotation is submitted
  };

  const isFieldFromSiteVisit = (field: string) => {
    const value = siteVisitCustomerData[field];
    return value && typeof value === 'string' && value.trim() !== "";
  };

  const renderFieldStatus = (field: string) => {
    if (isFieldFromSiteVisit(field)) {
      return (
        <Badge variant="secondary" className="text-xs ml-2">
          <Check className="h-3 w-3 mr-1" />
          From Site Visit
        </Badge>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Site Visit Info Alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Customer information has been pre-filled from the site visit. You can review and complete any missing details below.
        </AlertDescription>
      </Alert>

      {/* Customer Form Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Customer Name */}
        <div className="space-y-2">
          <div className="flex items-center">
            <label className="text-sm font-medium">Customer Name *</label>
            {renderFieldStatus("name")}
          </div>
          <Input
            value={customerState.name || ""}
            onChange={(e) => updateCustomerField("name", e.target.value)}
            placeholder="Enter customer name"
            className={isFieldFromSiteVisit("name") ? "bg-green-50 border-green-200" : ""}
            data-testid="input-customer-name"
          />
          {!customerState.name && (
            <p className="text-xs text-red-600">Customer name is required</p>
          )}
        </div>

        {/* Mobile Number */}
        <div className="space-y-2">
          <div className="flex items-center">
            <label className="text-sm font-medium">Mobile Number *</label>
            {renderFieldStatus("mobile")}
          </div>
          <Input
            value={customerState.mobile || ""}
            onChange={(e) => updateCustomerField("mobile", e.target.value)}
            placeholder="Enter mobile number"
            className={isFieldFromSiteVisit("mobile") ? "bg-green-50 border-green-200" : ""}
            data-testid="input-customer-mobile"
          />
          {!customerState.mobile && (
            <p className="text-xs text-red-600">Mobile number is required</p>
          )}
        </div>

        {/* Address */}
        <div className="space-y-2 md:col-span-2">
          <div className="flex items-center">
            <label className="text-sm font-medium">Address *</label>
            {renderFieldStatus("address")}
          </div>
          <Textarea
            value={customerState.address || ""}
            onChange={(e) => updateCustomerField("address", e.target.value)}
            placeholder="Enter customer address"
            className={isFieldFromSiteVisit("address") ? "bg-green-50 border-green-200" : ""}
            data-testid="textarea-customer-address"
          />
          {!customerState.address && (
            <p className="text-xs text-red-600">Address is required</p>
          )}
        </div>

        {/* Property Type */}
        <div className="space-y-2">
          <div className="flex items-center">
            <label className="text-sm font-medium">Property Type *</label>
            {renderFieldStatus("propertyType")}
          </div>
          <Select value={customerState.propertyType || undefined} onValueChange={(value) => updateCustomerField("propertyType", value)}>
            <SelectTrigger
              className={isFieldFromSiteVisit("propertyType") ? "bg-green-50 border-green-200" : ""}
              data-testid="select-property-type"
            >
              <SelectValue placeholder="Select property type" />
            </SelectTrigger>
            <SelectContent>
              {propertyTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!customerState.propertyType && (
            <p className="text-xs text-red-600">Property type is required</p>
          )}
        </div>

        {/* EB Service Number */}
        <div className="space-y-2">
          <div className="flex items-center">
            <label className="text-sm font-medium">EB Service Number</label>
            {renderFieldStatus("ebServiceNumber")}
          </div>
          <Input
            value={customerState.ebServiceNumber || ""}
            onChange={(e) => updateCustomerField("ebServiceNumber", e.target.value)}
            placeholder="Enter EB service number (optional)"
            className={isFieldFromSiteVisit("ebServiceNumber") ? "bg-green-50 border-green-200" : ""}
            data-testid="input-eb-service-number"
          />
        </div>

        {/* Tariff Code */}
        <div className="space-y-2">
          <div className="flex items-center">
            <label className="text-sm font-medium">Tariff Code</label>
            {renderFieldStatus("tariffCode")}
          </div>
          <Input
            value={customerState.tariffCode || ""}
            onChange={(e) => updateCustomerField("tariffCode", e.target.value)}
            placeholder="e.g., LA1A/Domestic (optional)"
            className={isFieldFromSiteVisit("tariffCode") ? "bg-green-50 border-green-200" : ""}
            data-testid="input-tariff-code"
          />
        </div>

        {/* Load Phase */}
        <div className="space-y-2">
          <div className="flex items-center">
            <label className="text-sm font-medium">Load Phase</label>
            {renderFieldStatus("ebSanctionPhase")}
          </div>
          <Select value={customerState.ebSanctionPhase || undefined} onValueChange={(value) => updateCustomerField("ebSanctionPhase", value)}>
            <SelectTrigger
              className={isFieldFromSiteVisit("ebSanctionPhase") ? "bg-green-50 border-green-200" : ""}
              data-testid="select-eb-sanction-phase"
            >
              <SelectValue placeholder="Select load phase" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1_phase">1 Phase</SelectItem>
              <SelectItem value="3_phase">3 Phase</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Sanction Load */}
        <div className="space-y-2">
          <div className="flex items-center">
            <label className="text-sm font-medium">Sanction Load</label>
            {renderFieldStatus("ebSanctionKW")}
          </div>
          <Input
            type="number"
            inputMode="decimal"
            value={customerState.ebSanctionKW || ""}
            onChange={(e) => updateCustomerField("ebSanctionKW", e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="e.g., 4 (optional)"
            className={isFieldFromSiteVisit("ebSanctionKW") ? "bg-green-50 border-green-200" : ""}
            data-testid="input-eb-sanction-kw"
          />
        </div>

        {/* Location */}
        <div className="space-y-2 md:col-span-2">
          <div className="flex items-center">
            <label className="text-sm font-medium">Customer Location</label>
            {renderFieldStatus("location")}
          </div>
          <Input
            value={customerState.location || ""}
            onChange={(e) => updateCustomerField("location", e.target.value)}
            placeholder="Enter specific location details (optional)"
            className={isFieldFromSiteVisit("location") ? "bg-green-50 border-green-200" : ""}
            data-testid="input-customer-location"
          />
        </div>
      </div>

      {/* Help Text */}
      <Alert>
        <User className="h-4 w-4" />
        <AlertDescription>
          Fields with a green background were captured during the site visit.
          Please complete any missing required information to proceed.
        </AlertDescription>
      </Alert>
    </div>
  );
}

// Manual Customer Details Form Component
function ManualCustomerDetailsForm({ form, isEditMode = false }: { form: any; isEditMode?: boolean }) {
  const [customerState, setCustomerState] = useState<any>({
    name: "",
    mobile: "",
    address: "",
    email: "",
    propertyType: null,
    ebServiceNumber: null,
    tariffCode: null,
    ebSanctionPhase: null,
    ebSanctionKW: null,
    location: "",
    source: "manual"
  });
  const [isAutoFilled, setIsAutoFilled] = useState(false);

  // Watch form's customerData to keep local state in sync
  const formCustomerData = form.watch("customerData");
  const formCustomerId = form.watch("customerId");

  // Sync local state with form data when it changes
  useEffect(() => {
    if (formCustomerData && Object.keys(formCustomerData).length > 0) {
      // Ensure source field is always present
      const customerDataWithSource = {
        ...formCustomerData,
        source: formCustomerData.source || "manual"
      };
      setCustomerState(customerDataWithSource);

      // Update form if source was missing
      if (!formCustomerData.source) {
        form.setValue("customerData", customerDataWithSource, { shouldValidate: true });
      }

      // If there's a customerId, mark as auto-filled
      if (formCustomerId) {
        setIsAutoFilled(true);
      }
    } else {
      // Reset to empty state if no customer data
      setCustomerState({
        name: "",
        mobile: "",
        address: "",
        email: "",
        propertyType: null,
        ebServiceNumber: null,
        tariffCode: null,
        ebSanctionPhase: null,
        ebSanctionKW: null,
        location: "",
        source: "manual"
      });
      setIsAutoFilled(false);
    }
  }, [formCustomerData, formCustomerId, form]);

  const handleCustomerChange = (customerData: any) => {
    // Update local state
    setCustomerState(customerData);

    // Update form's customerData field
    form.setValue("customerData", {
      name: customerData.name || "",
      mobile: customerData.mobile || "",
      address: customerData.address || "",
      email: customerData.email || "",
      propertyType: customerData.propertyType || null,
      ebServiceNumber: customerData.ebServiceNumber || null,
      tariffCode: customerData.tariffCode || null,
      ebSanctionPhase: customerData.ebSanctionPhase || null,
      ebSanctionKW: customerData.ebSanctionKW || null,
      location: customerData.location || "",
      source: "manual"
    });

    // If customer has an ID, set it and mark as auto-filled
    if (customerData.id) {
      form.setValue("customerId", customerData.id);
      setIsAutoFilled(true);
    } else {
      form.setValue("customerId", "");
      setIsAutoFilled(false);
    }
  };

  const updateCustomerField = (field: string, value: any) => {
    const updatedCustomerData = {
      ...customerState,
      [field]: value,
      source: "manual" // Always set source for manual quotations
    };
    setCustomerState(updatedCustomerData);
    form.setValue("customerData", updatedCustomerData);

    // Keep the customerId even when editing - the backend will handle the update
    // Just remove the visual "Auto-filled" badge to indicate the field was modified
  };

  return (
    <div className="space-y-6">
      {/* Customer Search/Autocomplete */}
      {!isEditMode && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Search Customer</label>
          <CustomerAutocomplete
            value={customerState}
            onChange={handleCustomerChange}
            onCustomerSelected={(customerId) => {
              form.setValue("customerId", customerId);
            }}
            placeholder="Start typing customer name or mobile number..."
          />
          <p className="text-xs text-muted-foreground">
            Search for existing customer or enter new customer details below
          </p>
        </div>
      )}

      {/* Customer Details Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Name */}
        <div className="space-y-2">
          <div className="flex items-center">
            <label className="text-sm font-medium">Customer Name *</label>
            {isAutoFilled && customerState.name && (
              <Badge variant="secondary" className="text-xs ml-2">
                <Check className="h-3 w-3 mr-1" />
                Auto-filled
              </Badge>
            )}
          </div>
          <Input
            value={customerState.name || ""}
            onChange={(e) => updateCustomerField("name", e.target.value)}
            placeholder="Enter customer name"
            className={isAutoFilled && customerState.name ? "bg-green-50 border-green-200" : ""}
            data-testid="input-customer-name"
            disabled={isEditMode}
          />
          {customerState.name && customerState.name.trim().length < 2 && (
            <p className="text-xs text-red-600">Name must be at least 2 characters</p>
          )}
        </div>

        {/* Mobile */}
        <div className="space-y-2">
          <div className="flex items-center">
            <label className="text-sm font-medium">Mobile Number *</label>
            {isAutoFilled && customerState.mobile && (
              <Badge variant="secondary" className="text-xs ml-2">
                <Check className="h-3 w-3 mr-1" />
                Auto-filled
              </Badge>
            )}
          </div>
          <Input
            value={customerState.mobile || ""}
            onChange={(e) => updateCustomerField("mobile", e.target.value)}
            disabled={isEditMode}
            placeholder="Enter 10-digit mobile number"
            className={isAutoFilled && customerState.mobile ? "bg-green-50 border-green-200" : ""}
            data-testid="input-customer-mobile"
          />
          {customerState.mobile && customerState.mobile.trim().length < 10 && (
            <p className="text-xs text-red-600">Mobile number must be at least 10 digits</p>
          )}
        </div>

        {/* Address */}
        <div className="space-y-2 md:col-span-2">
          <div className="flex items-center">
            <label className="text-sm font-medium">Address *</label>
            {isAutoFilled && customerState.address && (
              <Badge variant="secondary" className="text-xs ml-2">
                <Check className="h-3 w-3 mr-1" />
                Auto-filled
              </Badge>
            )}
          </div>
          <Textarea
            value={customerState.address || ""}
            onChange={(e) => updateCustomerField("address", e.target.value)}
            placeholder="Enter full address"
            className={isAutoFilled && customerState.address ? "bg-green-50 border-green-200" : ""}
            data-testid="textarea-customer-address"
          />
          {customerState.address && customerState.address.trim().length < 3 && (
            <p className="text-xs text-red-600">Address must be at least 3 characters</p>
          )}
        </div>

        {/* Property Type */}
        <div className="space-y-2">
          <div className="flex items-center">
            <label className="text-sm font-medium">Property Type *</label>
            {isAutoFilled && customerState.propertyType && (
              <Badge variant="secondary" className="text-xs ml-2">
                <Check className="h-3 w-3 mr-1" />
                Auto-filled
              </Badge>
            )}
          </div>
          <Select
            value={customerState.propertyType || undefined}
            onValueChange={(value) => updateCustomerField("propertyType", value)}
          >
            <SelectTrigger
              className={isAutoFilled && customerState.propertyType ? "bg-green-50 border-green-200" : ""}
              data-testid="select-property-type"
            >
              <SelectValue placeholder="Select property type" />
            </SelectTrigger>
            <SelectContent>
              {propertyTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!customerState.propertyType && (
            <p className="text-xs text-red-600">Property type is required for subsidy calculation</p>
          )}
        </div>

        {/* EB Service Number */}
        <div className="space-y-2">
          <div className="flex items-center">
            <label className="text-sm font-medium">EB Service Number</label>
            {isAutoFilled && customerState.ebServiceNumber && (
              <Badge variant="secondary" className="text-xs ml-2">
                <Check className="h-3 w-3 mr-1" />
                Auto-filled
              </Badge>
            )}
          </div>
          <Input
            value={customerState.ebServiceNumber || ""}
            onChange={(e) => updateCustomerField("ebServiceNumber", e.target.value)}
            placeholder="Enter EB service number (optional)"
            className={isAutoFilled && customerState.ebServiceNumber ? "bg-green-50 border-green-200" : ""}
            data-testid="input-eb-service-number"
          />
        </div>

        {/* Tariff Code */}
        <div className="space-y-2">
          <div className="flex items-center">
            <label className="text-sm font-medium">Tariff Code</label>
            {isAutoFilled && customerState.tariffCode && (
              <Badge variant="secondary" className="text-xs ml-2">
                <Check className="h-3 w-3 mr-1" />
                Auto-filled
              </Badge>
            )}
          </div>
          <Input
            value={customerState.tariffCode || ""}
            onChange={(e) => updateCustomerField("tariffCode", e.target.value)}
            placeholder="e.g., LA1A/Domestic (optional)"
            className={isAutoFilled && customerState.tariffCode ? "bg-green-50 border-green-200" : ""}
            data-testid="input-tariff-code"
          />
        </div>

        {/* Load Phase */}
        <div className="space-y-2">
          <div className="flex items-center">
            <label className="text-sm font-medium">Load Phase</label>
            {isAutoFilled && customerState.ebSanctionPhase && (
              <Badge variant="secondary" className="text-xs ml-2">
                <Check className="h-3 w-3 mr-1" />
                Auto-filled
              </Badge>
            )}
          </div>
          <Select value={customerState.ebSanctionPhase || undefined} onValueChange={(value) => updateCustomerField("ebSanctionPhase", value)}>
            <SelectTrigger
              className={isAutoFilled && customerState.ebSanctionPhase ? "bg-green-50 border-green-200" : ""}
              data-testid="select-eb-sanction-phase"
            >
              <SelectValue placeholder="Select load phase" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1_phase">1 Phase</SelectItem>
              <SelectItem value="3_phase">3 Phase</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Sanction Load */}
        <div className="space-y-2">
          <div className="flex items-center">
            <label className="text-sm font-medium">Sanction Load</label>
            {isAutoFilled && customerState.ebSanctionKW && (
              <Badge variant="secondary" className="text-xs ml-2">
                <Check className="h-3 w-3 mr-1" />
                Auto-filled
              </Badge>
            )}
          </div>
          <Input
            type="number"
            inputMode="decimal"
            value={customerState.ebSanctionKW || ""}
            onChange={(e) => updateCustomerField("ebSanctionKW", e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="e.g., 4 (optional)"
            className={isAutoFilled && customerState.ebSanctionKW ? "bg-green-50 border-green-200" : ""}
            data-testid="input-eb-sanction-kw"
          />
        </div>

        {/* Location */}
        <div className="space-y-2 md:col-span-2">
          <div className="flex items-center">
            <label className="text-sm font-medium">Customer Location</label>
            {isAutoFilled && customerState.location && (
              <Badge variant="secondary" className="text-xs ml-2">
                <Check className="h-3 w-3 mr-1" />
                Auto-filled
              </Badge>
            )}
          </div>
          <Input
            value={customerState.location || ""}
            onChange={(e) => updateCustomerField("location", e.target.value)}
            placeholder="Enter specific location details (optional)"
            className={isAutoFilled && customerState.location ? "bg-green-50 border-green-200" : ""}
            data-testid="input-customer-location"
          />
        </div>
      </div>

      {/* Help Text */}
      {isAutoFilled && (
        <Alert>
          <Check className="h-4 w-4" />
          <AlertDescription>
            Customer details have been auto-filled from the database. You can modify any field as needed.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// Manual Project Configuration Component
function ManualProjectConfiguration({ form, isServiceOnlyQuotation }: { form: any; isServiceOnlyQuotation: boolean }) {
  const [selectedProjectType, setSelectedProjectType] = useState<string | null>(null);
  const [activeProjectIndex, setActiveProjectIndex] = useState<number | null>(null);

  const projects = form.watch("projects") || [];

  const addProject = (projectType: string) => {
    const currentProjects = form.getValues("projects") || [];
    let newProject: any = {
      projectType,
      projectValue: 0,
      subsidyAmount: 0,
      customerPayment: 0
    };

    // Add default fields based on project type
    switch (projectType) {
      case "on_grid":
        newProject = {
          ...newProject,
          systemKW: 1,
          pricePerKW: BUSINESS_RULES.pricing.onGridPerKW,
          solarPanelMake: [],
          panelWatts: "530",
          panelType: "bifacial",
          dcrPanelCount: 6,
          nonDcrPanelCount: 0,
          panelCount: 6,
          inverterMake: [],
          inverterKW: 3,
          inverterQty: 1,
          inverterPhase: "single_phase",
          lightningArrest: false,
          electricalAccessories: false,
          earth: ["dc"],
          floor: "0",
          structureType: "gp_structure",
          gpStructure: {
            lowerEndHeight: "0",
            higherEndHeight: "0"
          },
          monoRail: {
            type: "mini_rail"
          },
          civilWorkScope: "customer_scope",
          netMeterScope: "customer_scope",
          others: ""
        };
        break;
      case "off_grid":
        newProject = {
          ...newProject,
          systemKW: 1,
          pricePerKW: BUSINESS_RULES.pricing.offGridPerKW,
          solarPanelMake: [],
          panelWatts: "530",
          panelType: "bifacial",
          dcrPanelCount: 6,
          nonDcrPanelCount: 0,
          panelCount: 6,
          inverterMake: [],
          inverterKW: 3,
          inverterKVA: "3",
          inverterQty: 1,
          inverterPhase: "single_phase",
          lightningArrest: false,
          electricalAccessories: false,
          earth: ["dc"],
          floor: "0",
          structureType: "gp_structure",
          batteryBrand: "exide",
          batteryType: "lead_acid",
          batteryAH: "100",
          voltage: 12,
          batteryCount: 1,
          batteryStands: "1",
          electricalWorkScope: "customer_scope",
          civilWorkScope: "customer_scope",
          backupSolutions: {
            backupWatts: 0,
            usageWatts: [],
            backupHours: [],
            manuallyEdited: false
          },
          others: ""
        };
        break;
      case "hybrid":
        newProject = {
          ...newProject,
          systemKW: 1,
          pricePerKW: BUSINESS_RULES.pricing.hybridPerKW,
          solarPanelMake: [],
          panelWatts: "530",
          panelType: "bifacial",
          dcrPanelCount: 6,
          nonDcrPanelCount: 0,
          panelCount: 6,
          inverterMake: [],
          inverterKW: 3,
          inverterKVA: "3",
          inverterQty: 1,
          inverterPhase: "single_phase",
          lightningArrest: false,
          electricalAccessories: false,
          earth: ["dc"],
          floor: "0",
          structureType: "gp_structure",
          batteryBrand: "exide",
          batteryType: "lead_acid",
          batteryAH: "100",
          voltage: 12,
          batteryCount: 1,
          batteryStands: "1",
          electricalWorkScope: "customer_scope",
          netMeterScope: "customer_scope",
          backupSolutions: {
            backupWatts: 0,
            usageWatts: [],
            backupHours: [],
            manuallyEdited: false
          },
          others: ""
        };
        break;
      case "water_heater":
        newProject = {
          ...newProject,
          brand: "venus",
          litre: 100,
          heatingCoil: "",
          floor: "0",
          plumbingWorkScope: "customer_scope",
          civilWorkScope: "customer_scope",
          qty: 1,
          waterHeaterModel: "non_pressurized",
          labourAndTransport: false,
          others: ""
        };
        break;
      case "water_pump":
        newProject = {
          ...newProject,
          hp: "1",
          driveHP: "1",
          drive: "vfd",
          inverterPhase: "single_phase",
          panelWatts: "530",
          panelType: "bifacial",
          structureType: "gp_structure",
          panelBrand: [],
          dcrPanelCount: 6,
          nonDcrPanelCount: 0,
          panelCount: 6,
          qty: 1,
          gpStructure: {
            lowerEndHeight: "0",
            higherEndHeight: "0"
          },
          monoRail: {
            type: "mini_rail"
          },
          plumbingWorkScope: "customer_scope",
          earthWork: "customer_scope",
          civilWorkScope: "customer_scope",
          lightningArrest: false,
          electricalAccessories: false,
          electricalCount: 0,
          earth: [],
          labourAndTransport: false,
          others: ""
        };
        break;
    }

    // Calculate initial pricing for all project types
    if (["on_grid", "off_grid", "hybrid"].includes(projectType)) {
      newProject.gstPercentage = BUSINESS_RULES.gst.percentage;

      // Calculate system kW from panel data (this is the source of truth)
      // Safe parsing: remove non-digit characters, then parse
      const panelWattsStr = String(newProject.panelWatts || '').trim().replace(/[^\d]/g, '');
      const panelWattsNum = parseInt(panelWattsStr, 10) || 0;
      const calculatedKW = (panelWattsNum * newProject.panelCount) / 1000;
      newProject.systemKW = calculatedKW;

      // Calculate default project value based on systemKW and default rate
      const defaultRatePerKW = projectType === 'on_grid' ? BUSINESS_RULES.pricing.onGridPerKW :
        projectType === 'off_grid' ? BUSINESS_RULES.pricing.offGridPerKW :
          BUSINESS_RULES.pricing.hybridPerKW;

      // Calculate total value including GST
      const basePrice = Math.round(calculatedKW * defaultRatePerKW);
      const totalWithGST = Math.round(basePrice * (1 + newProject.gstPercentage / 100));

      newProject.projectValue = totalWithGST;
      newProject.basePrice = basePrice;
      newProject.gstAmount = totalWithGST - basePrice;
      newProject.pricePerKW = defaultRatePerKW;

      // Get propertyType from form - always use customerData as the source of truth
      const formValues = form.getValues();
      const propertyType = formValues.customerData?.propertyType || 'residential';

      // Defensive check: Log warning if propertyType is missing for subsidy calculation
      if (!formValues.customerData?.propertyType && ['on_grid', 'hybrid'].includes(projectType)) {
        console.warn('⚠️ Property type missing during project creation - using default "residential" for subsidy calculation');
      }

      // Use the new calculateSubsidy function
      newProject.subsidyAmount = calculateSubsidy(calculatedKW, propertyType, projectType);
      newProject.customerPayment = newProject.projectValue - newProject.subsidyAmount;
    } else if (projectType === "water_heater") {
      // Set default pricing for water heater - GST is 0% by default for service-only quotations
      // Default projectValue calculation (user can override this manually)
      const qty = newProject.qty || 1;
      const defaultBaseValue = newProject.litre * BUSINESS_RULES.pricing.waterHeaterPerLitre;
      newProject.projectValue = Math.round(defaultBaseValue);
      newProject.gstPercentage = 0; // Water heater has 0% GST by default

      // For water heater, projectValue = basePrice (since GST is 0%)
      newProject.basePrice = newProject.projectValue;
      newProject.gstAmount = 0;

      // No subsidy for water heater
      newProject.subsidyAmount = 0;
      newProject.customerPayment = newProject.projectValue;
    } else if (projectType === "water_pump") {
      // Set default pricing for water pump - GST is 0% by default for service-only quotations
      // Default projectValue calculation (user can override this manually)
      const hpValue = parseFloat(newProject.hp) || 1;
      const defaultBaseValue = hpValue * BUSINESS_RULES.pricing.waterPumpPerHP;
      newProject.projectValue = Math.round(defaultBaseValue);
      newProject.gstPercentage = 0; // Water pump has 0% GST by default

      // For water pump, projectValue = basePrice (since GST is 0%)
      newProject.basePrice = newProject.projectValue;
      newProject.gstAmount = 0;

      // No subsidy for water pump
      newProject.subsidyAmount = 0;
      newProject.customerPayment = newProject.projectValue;
    } else {
      // Fallback for unknown project types
      console.error(`Unknown project type: ${projectType}`);
      newProject.projectValue = 0;
      newProject.subsidyAmount = 0;
      newProject.customerPayment = 0;
    }

    form.setValue("projects", [...currentProjects, newProject]);
    setActiveProjectIndex(currentProjects.length);
    setSelectedProjectType(null);
  };

  const removeProject = (index: number) => {
    const currentProjects = form.getValues("projects") || [];
    const updatedProjects = currentProjects.filter((_: any, i: number) => i !== index);
    form.setValue("projects", updatedProjects);
    setActiveProjectIndex(null);
  };

  const updateProject = (index: number, updatedData: any) => {
    const currentProjects = form.getValues("projects") || [];
    const updatedProjects = [...currentProjects];

    // ✅ CRITICAL: Preserve user-entered inverterKW/KVA - these are MANUAL fields
    const previousInverterKW = updatedProjects[index]?.inverterKW;
    const previousInverterKVA = updatedProjects[index]?.inverterKVA;

    updatedProjects[index] = { ...updatedProjects[index], ...updatedData };

    // ✅ CRITICAL: Restore inverterKW/KVA if not explicitly changed in this update
    if (!updatedData.hasOwnProperty('inverterKW') && previousInverterKW !== undefined) {
      updatedProjects[index].inverterKW = previousInverterKW;
    }
    if (!updatedData.hasOwnProperty('inverterKVA') && previousInverterKVA !== undefined) {
      updatedProjects[index].inverterKVA = previousInverterKVA;
    }

    // Defensive check: Ensure we have the latest form values
    const formValues = form.getValues();

    // Recalculate pricing for all project types
    const project = updatedProjects[index];

    if (["on_grid", "off_grid", "hybrid"].includes(project.projectType)) {
      // STEP 1: Validate and normalize GST percentage
      if (project.gstPercentage === undefined || project.gstPercentage === null) {
        project.gstPercentage = BUSINESS_RULES.gst.percentage;
      }
      const effectiveGST = (project.gstPercentage === '' || project.gstPercentage === undefined || project.gstPercentage === null)
        ? BUSINESS_RULES.gst.percentage
        : parseFloat(project.gstPercentage) || 0;

      // STEP 2: Calculate system kW from panel specifications (source of truth)
      const panelWattsStr = String(project.panelWatts || '').trim().replace(/[^\d]/g, '');
      const panelWattsNum = parseInt(panelWattsStr, 10) || 0;
      const calculatedKW = panelWattsNum > 0 ? (panelWattsNum * (project.panelCount || 1)) / 1000 : 0;

      // Store system KW for backend compatibility
      project.systemKW = calculatedKW;

      // STEP 3: Calculate rounded kW using centralized utility
      const roundedKW = roundSystemKW(calculatedKW);

      // ✅ CRITICAL: DO NOT auto-overwrite inverterKW here!
      // inverterKW is a separate manual field - user enters it explicitly in the form
      // Using roundedKW only for rate calculations, NOT for overwriting user input

      // STEP 4: Calculate pricing breakdown (all solar projects follow same logic)
      const validProjectValue = Math.max(0, project.projectValue || 0);
      if (validProjectValue > 0) {
        const basePrice = Math.round(validProjectValue / (1 + effectiveGST / 100));
        const gstAmount = validProjectValue - basePrice;
        project.basePrice = basePrice;
        project.gstAmount = gstAmount;
        project.pricePerKW = roundedKW > 0 ? Math.round(basePrice / roundedKW) : 0;
      } else {
        project.basePrice = 0;
        project.gstAmount = 0;
        project.pricePerKW = 0;
      }

      // STEP 5: Calculate subsidy based on calculated kW (not rounded)
      const propertyType = formValues.customerData?.propertyType || 'residential';
      if (!formValues.customerData?.propertyType) {
        console.warn('⚠️ Property type missing - using "residential" for subsidy');
      }
      project.subsidyAmount = calculateSubsidy(calculatedKW, propertyType, project.projectType);
      project.customerPayment = project.projectValue - project.subsidyAmount;
    } else if (project.projectType === "water_heater") {
      // Ensure gstPercentage is set to 0% for water heater (only if undefined/null)
      if (project.gstPercentage === undefined || project.gstPercentage === null) {
        project.gstPercentage = 0;
      }

      // Water heater pricing: projectValue is per-unit price
      // Always recalculate to ensure values are available for PDF generation
      // Use 0% as default GST for water heater
      const effectiveGST = (project.gstPercentage === '' || project.gstPercentage === undefined || project.gstPercentage === null)
        ? 0
        : parseFloat(project.gstPercentage) || 0;
      const quantity = project.qty || 1;
      const basePrice = Math.round(project.projectValue / (1 + effectiveGST / 100));
      const gstAmount = project.projectValue - basePrice;

      project.basePrice = basePrice;
      project.gstAmount = gstAmount;

      // No subsidy for water heater
      project.subsidyAmount = 0;
      // customerPayment is total: projectValue (per unit) × quantity
      project.customerPayment = project.projectValue * quantity;
    } else if (project.projectType === "water_pump") {
      // Ensure gstPercentage is set to 0% for water pump (only if undefined/null)
      if (project.gstPercentage === undefined || project.gstPercentage === null) {
        project.gstPercentage = 0;
      }

      // Water pump pricing: projectValue is per-unit price
      // Always recalculate to ensure values are available for PDF generation
      // Use 0% as default GST for water pump
      const effectiveGST = (project.gstPercentage === '' || project.gstPercentage === undefined || project.gstPercentage === null)
        ? 0
        : parseFloat(project.gstPercentage) || 0;
      const quantity = project.qty || 1;
      const basePrice = Math.round(project.projectValue / (1 + effectiveGST / 100));
      const gstAmount = project.projectValue - basePrice;

      project.basePrice = basePrice;
      project.gstAmount = gstAmount;

      // No subsidy for water pump
      project.subsidyAmount = 0;
      // customerPayment is total: projectValue (per unit) × quantity
      project.customerPayment = project.projectValue * quantity;
    } else {
      // Fallback for unknown project types
      console.error(`Unknown project type during update: ${project.projectType}`);
    }

    form.setValue("projects", updatedProjects);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Add Project Type Selection */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h4 className="font-medium text-sm sm:text-base">Project Configuration</h4>
          <Select value={selectedProjectType || ""} onValueChange={setSelectedProjectType}>
            <SelectTrigger className="w-full sm:w-56" data-testid="select-project-type">
              <SelectValue placeholder="Add Project Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="on_grid">On-Grid Solar</SelectItem>
              <SelectItem value="off_grid">Off-Grid Solar</SelectItem>
              <SelectItem value="hybrid">Hybrid Solar</SelectItem>
              <SelectItem value="water_heater">Solar Water Heater</SelectItem>
              <SelectItem value="water_pump">Solar Water Pump</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {selectedProjectType && (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              onClick={() => addProject(selectedProjectType)}
              data-testid="button-add-project"
              className="w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add {selectedProjectType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} Project
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedProjectType(null)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>

      {/* Project List */}
      {projects.length === 0 && (
        <Alert>
          <Plus className="h-4 w-4" />
          <AlertDescription>
            No projects configured yet. Please add at least one project to continue.
          </AlertDescription>
        </Alert>
      )}

      {/* Validation Warnings for Projects */}
      {projects.length > 0 && projects.some((p: any) =>
        ['on_grid', 'off_grid', 'hybrid'].includes(p.projectType) &&
        (p.panelCount === 0 || p.projectValue === 0)
      ) && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Warning:</strong> Some solar projects have missing critical data:
              <ul className="list-disc list-inside mt-2 text-sm">
                {projects.map((p: any, idx: number) => {
                  if (['on_grid', 'off_grid', 'hybrid'].includes(p.projectType)) {
                    const issues = [];
                    if (p.panelCount === 0) issues.push('Panel count is 0');
                    if (p.projectValue === 0) issues.push('Project value is 0');
                    if (issues.length > 0) {
                      return (
                        <li key={idx}>
                          Project {idx + 1} ({p.projectType}): {issues.join(', ')}
                        </li>
                      );
                    }
                  }
                  return null;
                })}
              </ul>
            </AlertDescription>
          </Alert>
        )}

      {/* Property Type Warning */}
      {projects.length > 0 &&
        projects.some((p: any) => ['on_grid', 'hybrid'].includes(p.projectType)) &&
        !form.getValues().customerData?.propertyType && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Property Type Missing:</strong> Property type is required to calculate government subsidy for solar projects. Please complete customer details in Step 2.
            </AlertDescription>
          </Alert>
        )}

      {projects.length > 0 && (
        <div className="space-y-3 sm:space-y-4">
          <h5 className="font-medium text-sm sm:text-base">Configured Projects ({projects.length})</h5>
          <div className="grid gap-3 sm:gap-4">
            {projects.map((project: any, index: number) => (
              <Card key={index} className={`border transition-colors ${activeProjectIndex === index ? 'border-primary bg-primary/5' : 'border-border'
                }`}>
                <CardHeader className="p-3 sm:p-4 pb-3 sm:pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {project.projectType === 'on_grid' && <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 shrink-0" />}
                      {project.projectType === 'off_grid' && <Battery className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 shrink-0" />}
                      {project.projectType === 'hybrid' && <Settings className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 shrink-0" />}
                      {project.projectType === 'water_heater' && <Droplets className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600 shrink-0" />}
                      {project.projectType === 'water_pump' && <Wrench className="h-4 w-4 sm:h-5 sm:w-5 text-red-600 shrink-0" />}
                      <h4 className="font-medium text-sm sm:text-base capitalize">
                        {project.projectType.replace('_', ' ')} System
                      </h4>
                      <Badge variant="outline" className="text-xs">
                        ₹{project.projectValue?.toLocaleString() || 0}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setActiveProjectIndex(activeProjectIndex === index ? null : index)}
                        data-testid={`button-configure-project-${index}`}
                        className="text-xs sm:text-sm"
                      >
                        {activeProjectIndex === index ? 'Collapse' : 'Configure'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeProject(index)}
                        data-testid={`button-remove-project-${index}`}
                        className="text-xs sm:text-sm"
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {activeProjectIndex === index && (
                  <CardContent className="p-3 sm:p-4 pt-0">
                    <ProjectConfigurationForm
                      project={project}
                      projectIndex={index}
                      onUpdate={(updatedData) => updateProject(index, updatedData)}
                    />
                  </CardContent>
                )}

                {activeProjectIndex !== index && (
                  <CardContent className="p-3 sm:p-4 pt-0">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
                      {project.systemKW && (
                        <div>
                          <span className="text-muted-foreground">System Capacity:</span>
                          <div className="font-medium">{project.systemKW} kW</div>
                        </div>
                      )}
                      {project.panelCount && (
                        <div>
                          <span className="text-muted-foreground">Solar Panels:</span>
                          <div className="font-medium">{project.panelCount} panels</div>
                        </div>
                      )}
                      {project.subsidyAmount > 0 && (
                        <div>
                          <span className="text-muted-foreground">Govt. Subsidy:</span>
                          <div className="font-medium text-green-600">₹{project.subsidyAmount.toLocaleString()}</div>
                        </div>
                      )}
                      {project.customerPayment && (
                        <div>
                          <span className="text-muted-foreground">Customer Payment:</span>
                          <div className="font-medium">₹{project.customerPayment.toLocaleString()}</div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Project Configuration Form Component
function ProjectConfigurationForm({ project, projectIndex, onUpdate }: {
  project: any;
  projectIndex: number;
  onUpdate: (data: any) => void;
}) {
  const { toast } = useToast();

  const handleFieldChange = (field: string, value: any) => {
    // CRITICAL: Ensure inverterKVA is always STRING for schema validation
    if (field === 'inverterKVA' && value !== undefined && value !== null) {
      onUpdate({ [field]: String(value) });
    } else {
      onUpdate({ [field]: value });
    }
  };

  // Helper function to calculate backup watts
  const calculateBackupWatts = useCallback(() => {
    const batteryAH = parseInt(project.batteryAH) || 100;
    const batteryQty = project.batteryCount || 1;

    // Formula: Battery AH × Battery Qty × 10 - 3% loss
    const rawWatts = batteryAH * batteryQty * 10;
    const wattsAfterLoss = rawWatts - (rawWatts * 0.03);

    return Math.round(wattsAfterLoss);
  }, [project.batteryAH, project.batteryCount]);

  // Helper function to calculate backup hours for all usage watts
  const calculateBackupHours = useCallback((backupWatts: number, usageWattsList: number[]) => {
    return usageWattsList.map(usageWatts => {
      if (!backupWatts || !usageWatts || usageWatts === 0) {
        return 0;
      }
      return parseFloat((backupWatts / usageWatts).toFixed(2));
    });
  }, []);

  // Helper function to safely parse panel watts (remove whitespace and non-numeric chars, then parse)
  const parsePanelWatts = (value: any): number => {
    if (!value) return 0;
    const stringValue = String(value).trim();
    const numericOnly = stringValue.replace(/[^\d]/g, '');
    const parsed = parseInt(numericOnly, 10);
    return isNaN(parsed) ? 0 : parsed;
  };

  // ✅ NO AUTO-POPULATE: Inverter KW/KVA is a separate manual field
  // User must enter it explicitly, not auto-populated from panel specs

  // Auto-update backup solutions when battery specs change (for off_grid and hybrid only)
  useEffect(() => {
    // Only apply to off_grid and hybrid projects
    if (project.projectType !== 'off_grid' && project.projectType !== 'hybrid') {
      return;
    }

    // Check if battery specs are available
    if (!project.batteryAH || !project.batteryCount) {
      return;
    }

    const calculatedBackupWatts = calculateBackupWatts();
    const currentBackupSolutions = project.backupSolutions || {
      backupWatts: 0,
      usageWatts: [],
      backupHours: [],
      manuallyEdited: false
    };

    // Auto-update whenever battery specs change AND the calculated value differs
    // Reset manuallyEdited to false so auto-calculation continues working
    if (currentBackupSolutions.backupWatts !== calculatedBackupWatts) {
      const newUsageWatts = currentBackupSolutions.usageWatts || [];
      const newBackupHours = calculateBackupHours(calculatedBackupWatts, newUsageWatts);

      onUpdate({
        backupSolutions: {
          backupWatts: calculatedBackupWatts,
          usageWatts: newUsageWatts,
          backupHours: newBackupHours,
          manuallyEdited: false // Reset to allow future auto-calculations
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.projectType, project.batteryAH, project.batteryCount]);

  // Auto-calculate system kW from panel data (actual decimal value) - USING SAFE PARSING
  const panelWattsNumber = parsePanelWatts(project.panelWatts);
  const panelCountNumber = project.panelCount ? parseInt(String(project.panelCount), 10) : 0;
  const actualSystemKW = (panelWattsNumber && panelCountNumber)
    ? (panelWattsNumber * panelCountNumber) / 1000
    : 0;

  // Round system kW using centralized utility (Math.round for >= 1kW, preserve decimals for < 1kW)
  const roundedSystemKW = roundSystemKW(actualSystemKW);

  // Display actual kW with 2 decimals
  const calculatedSystemKW = actualSystemKW.toFixed(2);

  // Calculate rate per kW from base price using ROUNDED kW
  const calculatedRatePerKW = project.basePrice && roundedSystemKW > 0
    ? Math.round(project.basePrice / roundedSystemKW)
    : 0;

  // Calculate GST per kW using ROUNDED kW
  const calculatedGSTPerKW = project.gstAmount && roundedSystemKW > 0
    ? Math.round(project.gstAmount / roundedSystemKW)
    : 0;

  const renderSolarSystemFields = () => (
    <div className="space-y-6">
      {/* System Capacity & Calculations */}
      <div className="space-y-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="font-medium text-sm text-blue-900 dark:text-blue-100 flex items-center gap-2">
          <span className="text-lg">📊</span> System Capacity & Calculations
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">System Capacity (kW) <span className="text-xs text-muted-foreground">(Auto-calculated)</span></label>
            <Input
              type="text"
              value={`${calculatedSystemKW} (Rounded: ${roundedSystemKW} kW)`}
              disabled
              className="bg-muted cursor-not-allowed"
              data-testid={`input-system-kw-${projectIndex}`}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Rate per kW (₹) <span className="text-xs text-muted-foreground">(Auto-calculated)</span></label>
            <Input
              type="text"
              value={calculatedRatePerKW.toLocaleString()}
              disabled
              className="bg-muted cursor-not-allowed"
              data-testid={`input-price-per-kw-${projectIndex}`}
            />
          </div>
        </div>
      </div>

      {/* Panel Configuration */}
      <div className="space-y-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
        <h4 className="font-medium text-sm text-amber-900 dark:text-amber-100 flex items-center gap-2">
          <span className="text-lg">☀️</span> Panel Configuration
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Solar Panel Make * (Multiple Selection)</label>
            <div className="space-y-2 max-h-32 overflow-y-auto border rounded p-2" style={{ overscrollBehavior: 'contain' }}>
              {solarPanelBrands.map((brand) => (
                <div key={brand} className="flex items-center space-x-2">
                  <Checkbox
                    id={`panel-${brand}-${projectIndex}`}
                    checked={project.solarPanelMake?.includes(brand) || false}
                    onCheckedChange={(checked) => {
                      const currentMakes = project.solarPanelMake || [];
                      const newMakes = checked
                        ? [...currentMakes, brand]
                        : currentMakes.filter((m: string) => m !== brand);
                      handleFieldChange('solarPanelMake', newMakes);
                    }}
                  />
                  <label htmlFor={`panel-${brand}-${projectIndex}`} className="text-sm">
                    {brand.replace('_', ' ').toUpperCase()}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Panel Type *</label>
            <Select value={project.panelType || "bifacial"} onValueChange={(value) => handleFieldChange('panelType', value)}>
              <SelectTrigger data-testid={`select-panel-type-${projectIndex}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {panelTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type === 'bifacial' ? 'Bifacial' : type === 'topcon' ? 'Topcon' : 'Mono-PERC'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Panel Watts <span className="text-xs text-muted-foreground">(Type or select)</span></label>
            <Input
              type="text"
              list={`panel-watts-list-${projectIndex}`}
              value={project.panelWatts || ''}
              onChange={(e) => {
                let value = String(e.target.value).trim();
                // Remove 'W' suffix if present
                if (value.endsWith('W')) {
                  value = value.slice(0, -1).trim();
                }
                // Keep only digits
                value = value.replace(/[^\d]/g, '');
                // Validate it's a valid panel watts value
                if (value && !panelWatts.includes(value as any)) {
                  // If not in predefined list, still allow it (for custom values)
                  // but ensure it's clean numeric
                }
                handleFieldChange('panelWatts', value);
              }}
              placeholder="Enter panel wattage (e.g., 540)"
              data-testid={`input-panel-watts-${projectIndex}`}
            />
            <datalist id={`panel-watts-list-${projectIndex}`}>
              {panelWatts.map((watts) => (
                <option key={watts} value={watts}>{watts}W</option>
              ))}
            </datalist>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Total Panel Count *</label>
            <Input
              type="number"
              min="1"
              value={project.panelCount ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                const totalCount = value === '' ? '' : parseInt(value) || 0;
                handleFieldChange('panelCount', totalCount);
                if (totalCount !== '') {
                  const currentNonDcr = project.nonDcrPanelCount || 0;
                  if (totalCount < currentNonDcr) {
                    handleFieldChange('nonDcrPanelCount', totalCount);
                    handleFieldChange('dcrPanelCount', 0);
                  } else {
                    handleFieldChange('dcrPanelCount', totalCount - currentNonDcr);
                  }
                }
              }}
              onBlur={(e) => {
                if (e.target.value === '') {
                  handleFieldChange('panelCount', 0);
                  handleFieldChange('dcrPanelCount', 0);
                  handleFieldChange('nonDcrPanelCount', 0);
                }
              }}
              className={project.panelCount === 0 || project.panelCount === '' ? "border-red-500" : ""}
              data-testid={`input-panel-count-${projectIndex}`}
            />
            {(project.panelCount === 0 || project.panelCount === '') && (
              <p className="text-xs text-red-600">Panel count is required for calculations</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">DCR Panel Count <span className="text-xs text-muted-foreground">(Auto-calculated)</span></label>
            <Input
              type="number"
              min="0"
              value={project.dcrPanelCount ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                const dcrCount = value === '' ? '' : parseInt(value) || 0;
                handleFieldChange('dcrPanelCount', dcrCount);
                if (dcrCount !== '') {
                  const totalCount = dcrCount + (project.nonDcrPanelCount || 0);
                  handleFieldChange('panelCount', totalCount);
                }
              }}
              onBlur={(e) => {
                if (e.target.value === '') {
                  handleFieldChange('dcrPanelCount', 0);
                  const totalCount = 0 + (project.nonDcrPanelCount || 0);
                  handleFieldChange('panelCount', totalCount);
                }
              }}
              data-testid={`input-dcr-panel-count-${projectIndex}`}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">NON-DCR Panel Count</label>
            <Input
              type="number"
              min="0"
              value={project.nonDcrPanelCount ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                const nonDcrCount = value === '' ? '' : parseInt(value) || 0;
                handleFieldChange('nonDcrPanelCount', nonDcrCount);
                if (nonDcrCount !== '') {
                  const totalCount = (project.dcrPanelCount || 0) + nonDcrCount;
                  handleFieldChange('panelCount', totalCount);
                }
              }}
              onBlur={(e) => {
                if (e.target.value === '') {
                  handleFieldChange('nonDcrPanelCount', 0);
                  const totalCount = (project.dcrPanelCount || 0) + 0;
                  handleFieldChange('panelCount', totalCount);
                }
              }}
              data-testid={`input-non-dcr-panel-count-${projectIndex}`}
            />
          </div>
        </div>
      </div>

      {/* Inverter Configuration */}
      <div className="space-y-4 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
        <h4 className="font-medium text-sm text-purple-900 dark:text-purple-100 flex items-center gap-2">
          <span className="text-lg">⚡</span> Inverter Configuration
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Inverter Make * (Multiple Selection)</label>
            <div className="space-y-2 max-h-32 overflow-y-auto border rounded p-2" style={{ overscrollBehavior: 'contain' }}>
              {inverterMakes.map((make) => (
                <div key={make} className="flex items-center space-x-2">
                  <Checkbox
                    id={`inverter-${make}-${projectIndex}`}
                    checked={project.inverterMake?.includes(make) || false}
                    onCheckedChange={(checked) => {
                      const currentMakes = project.inverterMake || [];
                      const newMakes = checked
                        ? [...currentMakes, make]
                        : currentMakes.filter((m: string) => m !== make);
                      handleFieldChange('inverterMake', newMakes);
                    }}
                  />
                  <label htmlFor={`inverter-${make}-${projectIndex}`} className="text-sm">
                    {make.toUpperCase()}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {(project.projectType === 'off_grid' || project.projectType === 'hybrid') ? 'Inverter KVA *' : 'Inverter KW *'}
            </label>
            <Input
              type="number"
              value={
                (project.projectType === 'off_grid' || project.projectType === 'hybrid')
                  ? (project.inverterKVA ?? '')
                  : (project.inverterKW ?? '')
              }
              onChange={(e) => {
                const value = e.target.value;
                const capacity = parseFloat(value) || 0;
                const isOffGridOrHybrid = project.projectType === 'off_grid' || project.projectType === 'hybrid';

                if (isOffGridOrHybrid) {
                  // For off-grid and hybrid: 
                  // - inverterKVA as STRING (schema expects z.string())
                  // - inverterKW as NUMBER (for pricing utilities compatibility)
                  handleFieldChange('inverterKVA', value === '' ? undefined : value);
                  handleFieldChange('inverterKW', value === '' ? undefined : capacity);

                  // Auto-select phase based on numeric value
                  if (capacity > 0) {
                    const autoPhase = capacity < 6 ? 'single_phase' : 'three_phase';
                    handleFieldChange('inverterPhase', autoPhase);
                  }
                } else {
                  // For on-grid: send as NUMBER (schema expects z.number())
                  handleFieldChange('inverterKW', value === '' ? undefined : capacity);

                  if (capacity > 0) {
                    const autoPhase = capacity < 6 ? 'single_phase' : 'three_phase';
                    handleFieldChange('inverterPhase', autoPhase);
                  }
                }
              }}
              min="0"
              step="0.1"
              placeholder={
                (project.projectType === 'off_grid' || project.projectType === 'hybrid')
                  ? 'Enter inverter KVA rating'
                  : 'Enter inverter KW rating'
              }
              data-testid={`input-inverter-kw-${projectIndex}`}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Inverter Qty</label>
            <Input
              type="number"
              value={project.inverterQty ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '') {
                  handleFieldChange('inverterQty', '');
                } else {
                  const qty = parseInt(value) || 1;
                  handleFieldChange('inverterQty', qty);

                  if (project.electricalAccessories && qty > 0) {
                    handleFieldChange('electricalCount', qty);
                  }
                }
              }}
              min="1"
              placeholder="Enter inverter quantity"
              data-testid={`input-inverter-qty-${projectIndex}`}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Inverter Phase <span className="text-xs text-muted-foreground">(Auto-selected based on KW)</span></label>
            <Select
              value={project.inverterPhase || "single_phase"}
              onValueChange={(value) => handleFieldChange('inverterPhase', value)}
            >
              <SelectTrigger data-testid={`select-inverter-phase-${projectIndex}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {inverterPhases.map((phase) => (
                  <SelectItem key={phase} value={phase}>
                    {phase === 'single_phase' ? 'Single Phase' : 'Three Phase'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(project.projectType === 'off_grid' || project.projectType === 'hybrid') && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Inverter Volt <span className="text-xs text-muted-foreground">(Type or select)</span></label>
              <Input
                type="text"
                value={project.inverterVolt || ''}
                onChange={(e) => handleFieldChange('inverterVolt', e.target.value)}
                placeholder="Enter inverter voltage (e.g., 24V, 48V)"
                data-testid={`input-inverter-volt-${projectIndex}`}
              />
            </div>
          )}
        </div>
      </div>

      {/* Additional Components */}
      <div className="space-y-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
        <h4 className="font-medium text-sm text-green-900 dark:text-green-100 flex items-center gap-2">
          <span className="text-lg">🔧</span> Additional Components
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Checkbox
                id={`lightning-arrest-${projectIndex}`}
                checked={project.lightningArrest || false}
                onCheckedChange={(checked) => handleFieldChange('lightningArrest', checked)}
                data-testid={`checkbox-lightning-arrest-${projectIndex}`}
              />
              <span>Lightning Arrestor</span>
            </label>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Checkbox
                id={`electrical-accessories-${projectIndex}`}
                checked={project.electricalAccessories || false}
                onCheckedChange={(checked) => {
                  handleFieldChange('electricalAccessories', checked);
                  if (checked && project.inverterQty) {
                    handleFieldChange('electricalCount', project.inverterQty);
                  } else if (!checked) {
                    handleFieldChange('electricalCount', undefined);
                  }
                }}
                data-testid={`checkbox-electrical-accessories-${projectIndex}`}
              />
              <span>Electrical Accessories</span>
            </label>
            {project.electricalAccessories && (
              <Input
                type="number"
                value={project.electricalCount ?? ''}
                onChange={(e) => {
                  const value = e.target.value;
                  handleFieldChange('electricalCount', value === '' ? '' : parseInt(value) || 0);
                }}
                min="0"
                placeholder="Electrical count (auto-filled from Inverter Qty)"
                data-testid={`input-electrical-count-${projectIndex}`}
                className="mt-2"
              />
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">Earth Connection (Multiple Selection)</label>
            <div className="space-y-2 border rounded p-2">
              {earthingTypes.map((type) => (
                <div key={type} className="flex items-center space-x-2">
                  <Checkbox
                    id={`earth-${type}-${projectIndex}`}
                    checked={Array.isArray(project.earth) ? project.earth.includes(type) : project.earth === type}
                    onCheckedChange={(checked) => {
                      const currentEarth = Array.isArray(project.earth) ? project.earth : (project.earth ? [project.earth] : []);
                      const newEarth = checked
                        ? [...currentEarth, type]
                        : currentEarth.filter((e: string) => e !== type);
                      handleFieldChange('earth', newEarth);
                    }}
                    data-testid={`checkbox-earth-${type}-${projectIndex}`}
                  />
                  <label htmlFor={`earth-${type}-${projectIndex}`} className="text-sm cursor-pointer">
                    {type === 'ac_dc' ? 'AC/DC' : type.toUpperCase()}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Installation Details */}
      <div className="space-y-4 bg-slate-50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
        <h4 className="font-medium text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <span className="text-lg">🏗️</span> Installation Details
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Floor Level *</label>
            <Select value={project.floor || '0'} onValueChange={(value) => handleFieldChange('floor', value)}>
              <SelectTrigger data-testid={`select-floor-${projectIndex}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {floorLevels.map((floor) => (
                  <SelectItem key={floor} value={floor}>
                    {floor === '0' ? 'Ground Floor' : `${floor}${floor === '1' ? 'st' : floor === '2' ? 'nd' : floor === '3' ? 'rd' : 'th'} Floor`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Structure Type *</label>
            <Select value={project.structureType || 'gp_structure'} onValueChange={(value) => handleFieldChange('structureType', value)}>
              <SelectTrigger data-testid={`select-structure-type-${projectIndex}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {structureTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {formatStructureTypeLabel(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(project.structureType === 'gp_structure' ||
            project.structureType === 'gi_structure' ||
            project.structureType === 'gi_round_pipe' ||
            project.structureType === 'ms_square_pipe') && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Lower End Height (ft)</label>
                  <Input
                    type="number"
                    placeholder="e.g., 3"
                    value={project.gpStructure?.lowerEndHeight || ''}
                    onChange={(e) => handleFieldChange('gpStructure', {
                      ...project.gpStructure,
                      lowerEndHeight: e.target.value
                    })}
                    data-testid={`input-lower-height-${projectIndex}`}
                    className="text-base"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Higher End Height (ft)</label>
                  <Input
                    type="number"
                    placeholder="e.g., 4"
                    value={project.gpStructure?.higherEndHeight || ''}
                    onChange={(e) => handleFieldChange('gpStructure', {
                      ...project.gpStructure,
                      higherEndHeight: e.target.value
                    })}
                    data-testid={`input-higher-height-${projectIndex}`}
                    className="text-base"
                  />
                </div>
              </>
            )}

          {project.structureType === 'mono_rail' && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Mono Rail Type</label>
              <Select
                value={project.monoRail?.type || 'mini_rail'}
                onValueChange={(value) => handleFieldChange('monoRail', {
                  ...project.monoRail,
                  type: value
                })}
              >
                <SelectTrigger data-testid={`select-mono-rail-${projectIndex}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monoRailOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === 'mini_rail' ? 'Mini Rail' : 'Long Rail'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* Work Scope Section */}
      {project.projectType === 'on_grid' && (
        <div className="space-y-4 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
          <h4 className="font-medium text-sm text-indigo-900 dark:text-indigo-100 flex items-center gap-2">
            <span className="text-lg">📋</span> Work Scope
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Civil Work Scope</label>
              <Select value={project.civilWorkScope || 'customer_scope'} onValueChange={(value) => handleFieldChange('civilWorkScope', value)}>
                <SelectTrigger data-testid={`select-civil-work-${projectIndex}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workScopeOptions.map((scope) => (
                    <SelectItem key={scope} value={scope}>
                      {scope === 'customer_scope' ? 'Customer Scope' : 'Company Scope'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Net Meter Scope</label>
              <Select value={project.netMeterScope || 'customer_scope'} onValueChange={(value) => handleFieldChange('netMeterScope', value)}>
                <SelectTrigger data-testid={`select-net-meter-${projectIndex}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workScopeOptions.map((scope) => (
                    <SelectItem key={scope} value={scope}>
                      {scope === 'customer_scope' ? 'Customer Scope' : 'Company Scope'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* Hybrid specific scope */}
      {project.projectType === 'hybrid' && (
        <div className="space-y-4 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
          <h4 className="font-medium text-sm text-indigo-900 dark:text-indigo-100 flex items-center gap-2">
            <span className="text-lg">📋</span> Work Scope
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Electrical Work Scope</label>
              <Select value={project.electricalWorkScope || 'customer_scope'} onValueChange={(value) => handleFieldChange('electricalWorkScope', value)}>
                <SelectTrigger data-testid={`select-electrical-work-${projectIndex}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workScopeOptions.map((scope) => (
                    <SelectItem key={scope} value={scope}>
                      {scope === 'customer_scope' ? 'Customer Scope' : 'Company Scope'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Net Meter Scope</label>
              <Select value={project.netMeterScope || 'customer_scope'} onValueChange={(value) => handleFieldChange('netMeterScope', value)}>
                <SelectTrigger data-testid={`select-net-meter-hybrid-${projectIndex}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workScopeOptions.map((scope) => (
                    <SelectItem key={scope} value={scope}>
                      {scope === 'customer_scope' ? 'Customer Scope' : 'Company Scope'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* Off-Grid Work Scope Section */}
      {project.projectType === 'off_grid' && (
        <div className="space-y-4 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
          <h4 className="font-medium text-sm text-indigo-900 dark:text-indigo-100 flex items-center gap-2">
            <span className="text-lg">📋</span> Work Scope
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Electrical Work Scope</label>
              <Select value={project.electricalWorkScope || 'customer_scope'} onValueChange={(value) => handleFieldChange('electricalWorkScope', value)}>
                <SelectTrigger data-testid={`select-electrical-work-offgrid-${projectIndex}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workScopeOptions.map((scope) => (
                    <SelectItem key={scope} value={scope}>
                      {scope === 'customer_scope' ? 'Customer Scope' : 'Company Scope'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Civil Work Scope</label>
              <Select value={project.civilWorkScope || 'customer_scope'} onValueChange={(value) => handleFieldChange('civilWorkScope', value)}>
                <SelectTrigger data-testid={`select-civil-work-offgrid-${projectIndex}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workScopeOptions.map((scope) => (
                    <SelectItem key={scope} value={scope}>
                      {scope === 'customer_scope' ? 'Customer Scope' : 'Company Scope'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* AMC Checkbox */}
          <div className="mt-4 flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded">
            <input
              type="checkbox"
              id={`checkbox-amc-${projectIndex}`}
              checked={project.amcIncluded ?? false}
              onChange={(e) => handleFieldChange('amcIncluded', e.target.checked)}
              data-testid={`checkbox-amc-${projectIndex}`}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
            />
            <label htmlFor={`checkbox-amc-${projectIndex}`} className="text-sm font-medium text-blue-900 dark:text-blue-100 cursor-pointer flex-1">
              ✓ Include Annual Maintenance Contract (AMC)
            </label>
          </div>
        </div>
      )}

      {/* Pricing */}
      <div className="space-y-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
        <h4 className="font-medium text-sm text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
          <span className="text-lg">💰</span> Pricing
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Project Value (₹) <span className="text-xs text-muted-foreground">(Per Unit Price incl. GST)</span></label>
            <Input
              type="number"
              value={project.projectValue ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                handleFieldChange('projectValue', value === '' ? '' : parseFloat(value) || 0);
              }}
              onBlur={(e) => {
                if (e.target.value === '') {
                  handleFieldChange('projectValue', 0);
                }
              }}
              min="0"
              data-testid={`input-project-value-${projectIndex}`}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">GST Percentage (%)</label>
            <Input
              type="number"
              value={project.gstPercentage ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') {
                  handleFieldChange('gstPercentage', '');
                } else {
                  const parsed = parseFloat(val);
                  handleFieldChange('gstPercentage', isNaN(parsed) ? '' : parsed);
                }
              }}
              placeholder={`Default: ${BUSINESS_RULES.gst.percentage}%`}
              min="0"
              max="100"
              step="0.1"
              data-testid={`input-gst-percentage-${projectIndex}`}
            />
          </div>
        </div>
      </div>

      {/* Additional Notes */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-gray-700 flex items-center gap-2">
          <span className="text-lg">📝</span> Additional Notes
        </h4>
        <Textarea
          value={project.others || ''}
          onChange={(e) => handleFieldChange('others', e.target.value)}
          placeholder="Any additional specifications or notes..."
          data-testid={`textarea-notes-${projectIndex}`}
          className="min-h-[100px]"
        />
      </div>
    </div>
  );

  const renderBatteryFields = () => (
    <div className="space-y-4 mt-4">
      <h4 className="font-medium text-sm text-gray-700">Battery Configuration</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Battery Brand</label>
          <BatteryBrandCombobox
            value={project.batteryBrand || "exide"}
            onValueChange={(value) => handleFieldChange('batteryBrand', value)}
            placeholder="Select or type battery brand..."
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Battery Type</label>
          <Select value={project.batteryType || "lead_acid"} onValueChange={(value) => handleFieldChange('batteryType', value)}>
            <SelectTrigger data-testid={`select-battery-type-${projectIndex}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lead_acid">Lead Acid</SelectItem>
              <SelectItem value="lithium">Lithium</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Battery AH</label>
          <Select value={project.batteryAH || "100"} onValueChange={(value) => handleFieldChange('batteryAH', value)}>
            <SelectTrigger data-testid={`select-battery-ah-${projectIndex}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="100">100 AH</SelectItem>
              <SelectItem value="120">120 AH</SelectItem>
              <SelectItem value="150">150 AH</SelectItem>
              <SelectItem value="200">200 AH</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Voltage (V)</label>
          <Input
            type="number"
            min="0"
            value={project.voltage ?? ''}
            onChange={(e) => {
              const value = e.target.value;
              handleFieldChange('voltage', value === '' ? '' : parseFloat(value) || 0);
            }}
            onBlur={(e) => {
              if (e.target.value === '') {
                handleFieldChange('voltage', 12);
              }
            }}
            data-testid={`input-voltage-${projectIndex}`}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Battery Count</label>
          <Input
            type="number"
            min="1"
            value={project.batteryCount ?? ''}
            onChange={(e) => {
              const value = e.target.value;
              handleFieldChange('batteryCount', value === '' ? '' : parseInt(value) || 0);
            }}
            onBlur={(e) => {
              if (e.target.value === '') {
                handleFieldChange('batteryCount', 1);
              }
            }}
            data-testid={`input-battery-count-${projectIndex}`}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Battery Stands</label>
          <Input
            type="number"
            min="1"
            value={project.batteryStands ?? ''}
            onChange={(e) => {
              const value = e.target.value;
              handleFieldChange('batteryStands', value === '' ? '' : parseInt(value) || 0);
            }}
            onBlur={(e) => {
              if (e.target.value === '') {
                handleFieldChange('batteryStands', 1);
              }
            }}
            data-testid={`input-battery-stands-${projectIndex}`}
          />
        </div>
      </div>
    </div>
  );

  const renderBackupSolutionsFields = () => {
    // Initialize backupSolutions if not present
    const backupSolutions = project.backupSolutions || {
      backupWatts: 0,
      usageWatts: [],
      backupHours: [],
      manuallyEdited: false
    };

    // Calculate backup hours for a given usage watts
    const calculateBackupHours = (usageWatts: number) => {
      if (!backupSolutions.backupWatts || !usageWatts || usageWatts === 0) {
        return 0;
      }
      return parseFloat((backupSolutions.backupWatts / usageWatts).toFixed(2));
    };

    // Recalculate all backup hours when backup watts or usage watts change
    const recalculateBackupHours = (usageWattsList: number[]) => {
      return usageWattsList.map(watts => calculateBackupHours(watts));
    };

    // Add new usage watts column
    const addUsageWattsColumn = () => {
      if (backupSolutions.usageWatts.length >= 5) {
        toast({
          title: "Maximum Limit Reached",
          description: "You can add up to 5 usage watts columns only.",
          variant: "destructive"
        });
        return;
      }

      const newUsageWatts = [...backupSolutions.usageWatts, 0];
      const newBackupHours = recalculateBackupHours(newUsageWatts);

      handleFieldChange('backupSolutions', {
        ...backupSolutions,
        usageWatts: newUsageWatts,
        backupHours: newBackupHours
      });
    };

    // Remove usage watts column
    const removeUsageWattsColumn = (index: number) => {
      const newUsageWatts = backupSolutions.usageWatts.filter((_: any, i: number) => i !== index);
      const newBackupHours = recalculateBackupHours(newUsageWatts);

      handleFieldChange('backupSolutions', {
        ...backupSolutions,
        usageWatts: newUsageWatts,
        backupHours: newBackupHours
      });
    };

    // Update usage watts value
    const updateUsageWatts = (index: number, value: number) => {
      const newUsageWatts = [...backupSolutions.usageWatts];
      newUsageWatts[index] = value;
      const newBackupHours = recalculateBackupHours(newUsageWatts);

      handleFieldChange('backupSolutions', {
        ...backupSolutions,
        usageWatts: newUsageWatts,
        backupHours: newBackupHours
      });
    };

    // Update backup watts value
    const updateBackupWatts = (value: number) => {
      const newBackupHours = recalculateBackupHours(backupSolutions.usageWatts);

      handleFieldChange('backupSolutions', {
        ...backupSolutions,
        backupWatts: value,
        backupHours: newBackupHours,
        manuallyEdited: true // Mark as manually edited to prevent auto-updates
      });
    };

    return (
      <div className="space-y-4 mt-4 p-4 border border-dashed border-primary/30 rounded-lg bg-primary/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Battery className="h-4 w-4 text-primary" />
            <h4 className="font-medium text-sm text-gray-700">Backup Solutions</h4>
          </div>
          <Badge variant="outline" className="text-xs">
            <Info className="h-3 w-3 mr-1" />
            Auto-calculated from battery specs
          </Badge>
        </div>

        {/* Note about efficiency */}
        <div className="text-xs text-muted-foreground space-y-1 bg-white dark:bg-gray-900 p-3 rounded border">
          <p className="font-medium">*During Fully Charged Condition</p>
          <p className="font-medium">*With Efficiency of 80%</p>
        </div>

        {/* Backup Watts - Editable */}
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Backup Watts (W) *
            <span className="text-xs text-muted-foreground ml-2">(Auto-calculated, editable)</span>
          </label>
          <Input
            type="number"
            min="0"
            value={backupSolutions.backupWatts || ''}
            onChange={(e) => {
              const value = e.target.value;
              updateBackupWatts(value === '' ? 0 : parseInt(value) || 0);
            }}
            onBlur={(e) => {
              if (e.target.value === '') {
                updateBackupWatts(0);
              }
            }}
            placeholder="Calculated from Battery AH × Qty × 10 - 3%"
            data-testid={`input-backup-watts-${projectIndex}`}
            className="font-semibold text-primary"
          />
          <p className="text-xs text-muted-foreground">
            Formula: Battery AH ({project.batteryAH || 100}) × Qty ({project.batteryCount || 1}) × 10 - 3% loss
          </p>
        </div>

        {/* Usage Watts Columns */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Usage Watts Scenarios</label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addUsageWattsColumn}
              disabled={backupSolutions.usageWatts.length >= 5}
              data-testid={`button-add-usage-watts-${projectIndex}`}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Scenario ({backupSolutions.usageWatts.length}/5)
            </Button>
          </div>

          {backupSolutions.usageWatts.length === 0 && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Add usage watts scenarios to calculate backup hours. You can add up to 5 different scenarios.
              </AlertDescription>
            </Alert>
          )}

          {backupSolutions.usageWatts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {backupSolutions.usageWatts.map((watts: number, index: number) => (
                <Card key={index} className="p-3 bg-white dark:bg-gray-900">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-muted-foreground">
                        Scenario {index + 1}
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeUsageWattsColumn(index)}
                        className="h-6 w-6 p-0"
                        data-testid={`button-remove-usage-watts-${projectIndex}-${index}`}
                      >
                        <Wrench className="h-3 w-3" />
                      </Button>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium">Usage (W)</label>
                      <Input
                        type="number"
                        min="0"
                        value={watts || ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          updateUsageWatts(index, value === '' ? 0 : parseInt(value) || 0);
                        }}
                        onBlur={(e) => {
                          if (e.target.value === '') {
                            updateUsageWatts(index, 0);
                          }
                        }}
                        placeholder="Enter usage watts"
                        data-testid={`input-usage-watts-${projectIndex}-${index}`}
                        className="text-sm"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-green-600">Backup Hours</label>
                      <div className="p-2 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded text-sm font-semibold text-green-700 dark:text-green-300 text-center">
                        {backupSolutions.backupHours[index]?.toFixed(2) || '0.00'} hrs
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Summary Table - Only show if there are usage watts */}
        {backupSolutions.usageWatts.length > 0 && (
          <div className="mt-4">
            <h5 className="text-xs font-medium mb-2 text-muted-foreground">Backup Solutions Summary</h5>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse border border-gray-200 dark:border-gray-700">
                <thead>
                  <tr className="bg-primary/10">
                    <th className="border border-gray-200 dark:border-gray-700 p-2 text-left font-medium">
                      Backup Watts
                    </th>
                    {backupSolutions.usageWatts.map((watts: number, index: number) => (
                      <th key={index} className="border border-gray-200 dark:border-gray-700 p-2 text-center font-medium">
                        {watts}W Usage
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-200 dark:border-gray-700 p-2 font-semibold text-primary">
                      {backupSolutions.backupWatts}W
                    </td>
                    {backupSolutions.backupHours.map((hours: number, index: number) => (
                      <td key={index} className="border border-gray-200 dark:border-gray-700 p-2 text-center font-semibold text-green-600">
                        {hours.toFixed(2)} hrs
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (project.projectType === 'water_heater') {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Water Heater Brand *</label>
            <Select value={project.brand || "venus"} onValueChange={(value) => handleFieldChange('brand', value)}>
              <SelectTrigger data-testid={`select-heater-brand-${projectIndex}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="venus">Venus</SelectItem>
                <SelectItem value="hykon">Hykon</SelectItem>
                <SelectItem value="supreme">Supreme</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Capacity (Litre) *</label>
            <Input
              type="number"
              min="50"
              value={project.litre ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                handleFieldChange('litre', value === '' ? '' : parseInt(value) || 0);
              }}
              onBlur={(e) => {
                if (e.target.value === '') {
                  handleFieldChange('litre', 100);
                }
              }}
              placeholder="100, 150, 200, 300..."
              data-testid={`input-litre-${projectIndex}`}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Heating Coil Type</label>
            <Input
              value={project.heatingCoil || ''}
              onChange={(e) => handleFieldChange('heatingCoil', e.target.value)}
              placeholder="Standard, Premium, etc."
              data-testid={`input-heating-coil-${projectIndex}`}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Floor Level *</label>
            <Select value={project.floor || '0'} onValueChange={(value) => handleFieldChange('floor', value)}>
              <SelectTrigger data-testid={`select-floor-heater-${projectIndex}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {floorLevels.map((floor) => (
                  <SelectItem key={floor} value={floor}>
                    {floor === '0' ? 'Ground Floor' : `${floor}${floor === '1' ? 'st' : floor === '2' ? 'nd' : floor === '3' ? 'rd' : 'th'} Floor`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Project Value (₹) <span className="text-xs text-muted-foreground">(Per Unit Price incl. GST)</span></label>
            <Input
              type="number"
              min="0"
              value={project.projectValue ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                handleFieldChange('projectValue', value === '' ? '' : parseFloat(value) || 0);
              }}
              onBlur={(e) => {
                if (e.target.value === '') {
                  handleFieldChange('projectValue', 0);
                }
              }}
              data-testid={`input-project-value-${projectIndex}`}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">GST Percentage (%)</label>
            <Input
              type="number"
              value={project.gstPercentage ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '') {
                  handleFieldChange('gstPercentage', '');
                } else {
                  const parsed = parseFloat(value);
                  handleFieldChange('gstPercentage', isNaN(parsed) ? '' : parsed);
                }
              }}
              placeholder={`Default: ${BUSINESS_RULES.gst.percentage}%`}
              min="0"
              max="100"
              step="0.1"
              data-testid={`input-gst-percentage-${projectIndex}`}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Quantity *</label>
            <Input
              type="number"
              min="1"
              value={project.qty ?? 1}
              onChange={(e) => {
                const value = e.target.value;
                handleFieldChange('qty', value === '' ? 1 : parseInt(value) || 1);
              }}
              onBlur={(e) => {
                if (e.target.value === '' || parseInt(e.target.value) < 1) {
                  handleFieldChange('qty', 1);
                }
              }}
              placeholder="Number of units"
              data-testid={`input-heater-qty-${projectIndex}`}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Water Heater Model *</label>
            <Select value={project.waterHeaterModel || 'non_pressurized'} onValueChange={(value) => handleFieldChange('waterHeaterModel', value)}>
              <SelectTrigger data-testid={`select-heater-model-${projectIndex}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pressurized">Pressurized</SelectItem>
                <SelectItem value="non_pressurized">Non-Pressurized</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Checkbox
                id={`labour-transport-heater-${projectIndex}`}
                checked={project.labourAndTransport || false}
                onCheckedChange={(checked) => handleFieldChange('labourAndTransport', checked)}
                data-testid={`checkbox-labour-transport-heater-${projectIndex}`}
              />
              <span>Labour and Transport</span>
            </label>
          </div>
        </div>

        {/* Work Scope Section for Water Heater */}
        <div className="space-y-4">
          <h4 className="font-medium text-sm text-gray-700">Work Scope</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Plumbing Work Scope</label>
              <Select value={project.plumbingWorkScope || 'customer_scope'} onValueChange={(value) => handleFieldChange('plumbingWorkScope', value)}>
                <SelectTrigger data-testid={`select-plumbing-work-heater-${projectIndex}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workScopeOptions.map((scope) => (
                    <SelectItem key={scope} value={scope}>
                      {scope === 'customer_scope' ? 'Customer Scope' : 'Company Scope'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Civil Work Scope</label>
              <Select value={project.civilWorkScope || 'customer_scope'} onValueChange={(value) => handleFieldChange('civilWorkScope', value)}>
                <SelectTrigger data-testid={`select-civil-work-heater-${projectIndex}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workScopeOptions.map((scope) => (
                    <SelectItem key={scope} value={scope}>
                      {scope === 'customer_scope' ? 'Customer Scope' : 'Company Scope'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Additional Notes */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Additional Notes</label>
          <Textarea
            value={project.others || ''}
            onChange={(e) => handleFieldChange('others', e.target.value)}
            placeholder="Any additional specifications or notes..."
            data-testid={`textarea-heater-notes-${projectIndex}`}
          />
        </div>
      </div>
    );
  }

  if (project.projectType === 'water_pump') {
    return (
      <div className="space-y-6">
        {/* Pump Specification */}
        <div className="space-y-4 bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-800 rounded-lg p-4">
          <h4 className="font-medium text-sm text-cyan-900 dark:text-cyan-100 flex items-center gap-2">
            <span className="text-lg">⚙️</span> Pump Specification
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Drive HP *</label>
              <Select value={project.driveHP || project.hp || "1"} onValueChange={(value) => {
                handleFieldChange('driveHP', value);
                handleFieldChange('hp', value);
              }}>
                <SelectTrigger data-testid={`select-drivehp-${projectIndex}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.5">0.5 HP</SelectItem>
                  <SelectItem value="1">1 HP</SelectItem>
                  <SelectItem value="2">2 HP</SelectItem>
                  <SelectItem value="3">3 HP</SelectItem>
                  <SelectItem value="5">5 HP</SelectItem>
                  <SelectItem value="7.5">7.5 HP</SelectItem>
                  <SelectItem value="10">10 HP</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Drive Type</label>
              <Select value={project.drive || "vfd"} onValueChange={(value) => handleFieldChange('drive', value)}>
                <SelectTrigger data-testid={`select-drive-${projectIndex}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vfd">VFD (Variable Frequency Drive)</SelectItem>
                  <SelectItem value="direct">Direct Drive</SelectItem>
                  <SelectItem value="submersible">Submersible</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Phase *</label>
              <Select value={project.inverterPhase || "single_phase"} onValueChange={(value) => handleFieldChange('inverterPhase', value)}>
                <SelectTrigger data-testid={`select-pump-phase-${projectIndex}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single_phase">1 Phase (Single Phase)</SelectItem>
                  <SelectItem value="three_phase">3 Phase (Three Phase)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Quantity *</label>
              <Input
                type="number"
                min="1"
                value={project.qty || 1}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 1;
                  handleFieldChange('qty', value);
                }}
                data-testid={`input-pump-qty-${projectIndex}`}
              />
            </div>
          </div>
        </div>

        {/* Panel Configuration */}
        <div className="space-y-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <h4 className="font-medium text-sm text-amber-900 dark:text-amber-100 flex items-center gap-2">
            <span className="text-lg">☀️</span> Panel Configuration
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Panel Brand * (Multiple Selection)</label>
              <div className="space-y-2 max-h-32 overflow-y-auto border rounded p-2" style={{ overscrollBehavior: 'contain' }}>
                {solarPanelBrands.map((brand) => (
                  <div key={brand} className="flex items-center space-x-2">
                    <Checkbox
                      id={`pump-panel-${brand}-${projectIndex}`}
                      checked={project.panelBrand?.includes(brand) || false}
                      onCheckedChange={(checked) => {
                        const currentMakes = project.panelBrand || [];
                        const newMakes = checked
                          ? [...currentMakes, brand]
                          : currentMakes.filter((m: string) => m !== brand);
                        handleFieldChange('panelBrand', newMakes);
                      }}
                    />
                    <label htmlFor={`pump-panel-${brand}-${projectIndex}`} className="text-sm">
                      {brand.replace('_', ' ').toUpperCase()}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Panel Type *</label>
              <Select value={project.panelType || "bifacial"} onValueChange={(value) => handleFieldChange('panelType', value)}>
                <SelectTrigger data-testid={`select-pump-panel-type-${projectIndex}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {panelTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type === 'bifacial' ? 'Bifacial' : type === 'topcon' ? 'Topcon' : 'Mono-PERC'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Panel Watts <span className="text-xs text-muted-foreground">(Type or select)</span></label>
              <Input
                type="text"
                list={`pump-panel-watts-list-${projectIndex}`}
                value={project.panelWatts || ''}
                onChange={(e) => {
                  let value = String(e.target.value).trim();
                  if (value.endsWith('W')) {
                    value = value.slice(0, -1).trim();
                  }
                  value = value.replace(/[^\d]/g, '');
                  if (value && !panelWatts.includes(value as any)) {
                    // Allow custom values if needed
                  }
                  handleFieldChange('panelWatts', value);
                }}
                placeholder="Enter panel wattage (e.g., 540)"
                data-testid={`input-pump-panel-watts-${projectIndex}`}
              />
              <datalist id={`pump-panel-watts-list-${projectIndex}`}>
                {panelWatts.map((watts) => (
                  <option key={watts} value={watts}>{watts}W</option>
                ))}
              </datalist>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Total Panel Count *</label>
              <Input
                type="number"
                min="0"
                value={project.panelCount ?? ''}
                onChange={(e) => {
                  const value = e.target.value;
                  const totalCount = value === '' ? '' : parseInt(value) || 0;
                  handleFieldChange('panelCount', totalCount);
                  if (totalCount !== '') {
                    const currentNonDcr = project.nonDcrPanelCount || 0;
                    if (totalCount < currentNonDcr) {
                      handleFieldChange('nonDcrPanelCount', totalCount);
                      handleFieldChange('dcrPanelCount', 0);
                    } else {
                      handleFieldChange('dcrPanelCount', totalCount - currentNonDcr);
                    }
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value === '') {
                    handleFieldChange('panelCount', 0);
                    handleFieldChange('dcrPanelCount', 0);
                    handleFieldChange('nonDcrPanelCount', 0);
                  }
                }}
                data-testid={`input-pump-panel-count-${projectIndex}`}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">DCR Panel Count <span className="text-xs text-muted-foreground">(Auto-calculated)</span></label>
              <Input
                type="number"
                min="0"
                value={project.dcrPanelCount ?? ''}
                onChange={(e) => {
                  const value = e.target.value;
                  const dcrCount = value === '' ? '' : parseInt(value) || 0;
                  handleFieldChange('dcrPanelCount', dcrCount);
                  if (dcrCount !== '') {
                    const totalCount = dcrCount + (project.nonDcrPanelCount || 0);
                    handleFieldChange('panelCount', totalCount);
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value === '') {
                    handleFieldChange('dcrPanelCount', 0);
                    const totalCount = 0 + (project.nonDcrPanelCount || 0);
                    handleFieldChange('panelCount', totalCount);
                  }
                }}
                data-testid={`input-pump-dcr-panel-count-${projectIndex}`}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">NON-DCR Panel Count</label>
              <Input
                type="number"
                min="0"
                value={project.nonDcrPanelCount ?? ''}
                onChange={(e) => {
                  const value = e.target.value;
                  const nonDcrCount = value === '' ? '' : parseInt(value) || 0;
                  handleFieldChange('nonDcrPanelCount', nonDcrCount);
                  if (nonDcrCount !== '') {
                    const totalCount = (project.dcrPanelCount || 0) + nonDcrCount;
                    handleFieldChange('panelCount', totalCount);
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value === '') {
                    handleFieldChange('nonDcrPanelCount', 0);
                    const totalCount = (project.dcrPanelCount || 0) + 0;
                    handleFieldChange('panelCount', totalCount);
                  }
                }}
                data-testid={`input-pump-non-dcr-panel-count-${projectIndex}`}
              />
            </div>
          </div>
        </div>

        {/* Structure Details Section for Water Pump */}
        <div className="space-y-4 bg-slate-50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <h4 className="font-medium text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span className="text-lg">🏗️</span> Structure Details
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Structure Type *</label>
              <Select value={project.structureType || 'gp_structure'} onValueChange={(value) => handleFieldChange('structureType', value)}>
                <SelectTrigger data-testid={`select-pump-structure-type-${projectIndex}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {structureTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {formatStructureTypeLabel(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(project.structureType === 'gp_structure' ||
              project.structureType === 'gi_structure' ||
              project.structureType === 'gi_round_pipe' ||
              project.structureType === 'ms_square_pipe') && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Lower End Height (ft)</label>
                    <Input
                      type="number"
                      placeholder="e.g., 3"
                      value={project.gpStructure?.lowerEndHeight || ''}
                      onChange={(e) => handleFieldChange('gpStructure', {
                        ...project.gpStructure,
                        lowerEndHeight: e.target.value
                      })}
                      data-testid={`input-pump-lower-height-${projectIndex}`}
                      className="text-base"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Higher End Height (ft)</label>
                    <Input
                      type="number"
                      placeholder="e.g., 4"
                      value={project.gpStructure?.higherEndHeight || ''}
                      onChange={(e) => handleFieldChange('gpStructure', {
                        ...project.gpStructure,
                        higherEndHeight: e.target.value
                      })}
                      data-testid={`input-pump-higher-height-${projectIndex}`}
                      className="text-base"
                    />
                  </div>
                </>
              )}

            {project.structureType === 'mono_rail' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Mono Rail Type</label>
                <Select
                  value={project.monoRail?.type || 'mini_rail'}
                  onValueChange={(value) => handleFieldChange('monoRail', {
                    ...project.monoRail,
                    type: value
                  })}
                >
                  <SelectTrigger data-testid={`select-pump-mono-rail-${projectIndex}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monoRailOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option === 'mini_rail' ? 'Mini Rail' : 'Long Rail'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {/* Work Scope Section for Water Pump */}
        <div className="space-y-4 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
          <h4 className="font-medium text-sm text-indigo-900 dark:text-indigo-100 flex items-center gap-2">
            <span className="text-lg">📋</span> Work Scope
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Earth Work Scope</label>
              <Select value={project.earthWork || project.plumbingWorkScope || 'customer_scope'} onValueChange={(value) => {
                handleFieldChange('earthWork', value);
                handleFieldChange('plumbingWorkScope', value);
              }}>
                <SelectTrigger data-testid={`select-earth-work-pump-${projectIndex}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workScopeOptions.map((scope) => (
                    <SelectItem key={scope} value={scope}>
                      {scope === 'customer_scope' ? 'Customer Scope' : 'Company Scope'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Civil Work Scope</label>
              <Select value={project.civilWorkScope || 'customer_scope'} onValueChange={(value) => handleFieldChange('civilWorkScope', value)}>
                <SelectTrigger data-testid={`select-civil-work-pump-${projectIndex}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workScopeOptions.map((scope) => (
                    <SelectItem key={scope} value={scope}>
                      {scope === 'customer_scope' ? 'Customer Scope' : 'Company Scope'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Additional Options Section for Water Pump */}
        <div className="space-y-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <h4 className="font-medium text-sm text-green-900 dark:text-green-100 flex items-center gap-2">
            <span className="text-lg">🔧</span> Additional Options
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Checkbox
                  id={`lightning-arrest-pump-${projectIndex}`}
                  checked={project.lightningArrest || false}
                  onCheckedChange={(checked) => handleFieldChange('lightningArrest', checked)}
                  data-testid={`checkbox-lightning-arrest-pump-${projectIndex}`}
                />
                <span>Lightning Arrestor</span>
              </label>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Checkbox
                  id={`electrical-accessories-pump-${projectIndex}`}
                  checked={project.electricalAccessories || false}
                  onCheckedChange={(checked) => {
                    handleFieldChange('electricalAccessories', checked);
                    if (checked && project.driveHP) {
                      handleFieldChange('electricalCount', parseFloat(project.driveHP) || 1);
                    } else if (!checked) {
                      handleFieldChange('electricalCount', 0);
                    }
                  }}
                  data-testid={`checkbox-electrical-accessories-pump-${projectIndex}`}
                />
                <span>Electrical Accessories</span>
              </label>
              {project.electricalAccessories && (
                <Input
                  type="number"
                  value={project.electricalCount ?? ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    handleFieldChange('electricalCount', value === '' ? '' : parseInt(value) || 0);
                  }}
                  min="0"
                  placeholder="Electrical count (auto-filled from Drive HP)"
                  data-testid={`input-electrical-count-pump-${projectIndex}`}
                  className="mt-2"
                />
              )}
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Earth Connection (Multiple Selection)</label>
              <div className="space-y-2 border rounded p-2">
                {earthingTypes.map((type) => (
                  <div key={type} className="flex items-center space-x-2">
                    <Checkbox
                      id={`earth-${type}-pump-${projectIndex}`}
                      checked={Array.isArray(project.earth) ? project.earth.includes(type) : false}
                      onCheckedChange={(checked) => {
                        const currentEarth = Array.isArray(project.earth) ? project.earth : [];
                        const newEarth = checked
                          ? [...currentEarth, type]
                          : currentEarth.filter((e: string) => e !== type);
                        handleFieldChange('earth', newEarth);
                      }}
                      data-testid={`checkbox-earth-${type}-pump-${projectIndex}`}
                    />
                    <label htmlFor={`earth-${type}-pump-${projectIndex}`} className="text-sm cursor-pointer">
                      {type === 'ac_dc' ? 'AC/DC' : type.toUpperCase()}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Checkbox
                  id={`labour-transport-pump-${projectIndex}`}
                  checked={project.labourAndTransport || false}
                  onCheckedChange={(checked) => handleFieldChange('labourAndTransport', checked)}
                  data-testid={`checkbox-labour-transport-pump-${projectIndex}`}
                />
                <span>Labour and Transport</span>
              </label>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="space-y-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
          <h4 className="font-medium text-sm text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
            <span className="text-lg">💰</span> Pricing
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Project Value (₹) <span className="text-xs text-muted-foreground">(Per Unit Price incl. GST)</span></label>
              <Input
                type="number"
                min="0"
                value={project.projectValue ?? ''}
                onChange={(e) => {
                  const value = e.target.value;
                  handleFieldChange('projectValue', value === '' ? '' : parseFloat(value) || 0);
                }}
                onBlur={(e) => {
                  if (e.target.value === '') {
                    handleFieldChange('projectValue', 0);
                  }
                }}
                data-testid={`input-pump-project-value-${projectIndex}`}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">GST Percentage (%)</label>
              <Input
                type="number"
                value={project.gstPercentage ?? ''}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '') {
                    handleFieldChange('gstPercentage', '');
                  } else {
                    const parsed = parseFloat(value);
                    handleFieldChange('gstPercentage', isNaN(parsed) ? '' : parsed);
                  }
                }}
                placeholder={`Default: ${BUSINESS_RULES.gst.percentage}%`}
                min="0"
                max="100"
                step="0.1"
                data-testid={`input-pump-gst-percentage-${projectIndex}`}
              />
            </div>
          </div>
        </div>

        {/* Additional Notes */}
        <div className="space-y-4">
          <h4 className="font-medium text-sm text-gray-700 flex items-center gap-2">
            <span className="text-lg">📝</span> Additional Notes
          </h4>
          <Textarea
            value={project.others || ''}
            onChange={(e) => handleFieldChange('others', e.target.value)}
            placeholder="Any additional specifications or notes..."
            data-testid={`textarea-pump-notes-${projectIndex}`}
            className="min-h-[100px]"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {renderSolarSystemFields()}
      {(project.projectType === 'off_grid' || project.projectType === 'hybrid') && renderBatteryFields()}
      {(project.projectType === 'off_grid' || project.projectType === 'hybrid') && renderBackupSolutionsFields()}

      <Separator />

      {/* Pricing Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
        <div>
          <span className="text-sm text-muted-foreground">Base Price (Total Cost):</span>
          <div className="font-medium text-lg">₹{project.basePrice?.toLocaleString() || 0}</div>
        </div>
        <div>
          <span className="text-sm text-muted-foreground">GST {project.gstPercentage ?? BUSINESS_RULES.gst.percentage}% (₹{calculatedGSTPerKW?.toLocaleString()}/kW):</span>
          <div className="font-medium text-blue-600">₹{project.gstAmount?.toLocaleString() || 0}</div>
        </div>
        <div>
          <span className="text-sm text-muted-foreground">Total Amount (Value + GST):</span>
          <div className="font-medium text-lg text-green-600">₹{project.projectValue?.toLocaleString() || 0}</div>
        </div>
      </div>

      {/* Subsidy Information (if applicable) */}
      {project.subsidyAmount > 0 && (
        <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-green-800 dark:text-green-200">Government Subsidy (Residential Only):</span>
              <div className="text-xs text-green-600 dark:text-green-400 mt-1">This will be deducted in BOM section</div>
            </div>
            <div className="font-bold text-xl text-green-700 dark:text-green-300">₹{project.subsidyAmount?.toLocaleString() || 0}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function QuotationCreation() {
  const [, setLocation] = useLocation();
  const { user } = useAuthContext();

  // Detect edit mode using URL pattern
  const [isEditMode, params] = useRoute("/quotations/:id/edit");
  const quotationId = params?.id;

  // Initialize step to 2 (Project Configuration) in edit mode, 0 in create mode
  const [currentStep, setCurrentStep] = useState(isEditMode ? 2 : 0);
  const [quotationSource, setQuotationSource] = useState<"manual" | "site_visit">("manual");
  const [selectedSiteVisit, setSelectedSiteVisit] = useState<string | null>(null);
  const [siteVisitMapping, setSiteVisitMapping] = useState<any>(null);
  const [siteVisitSearchQuery, setSiteVisitSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [customDateFrom, setCustomDateFrom] = useState<string>("");
  const [customDateTo, setCustomDateTo] = useState<string>("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [bomItems, setBomItems] = useState<any[]>([]);
  const [isFetchingBom, setIsFetchingBom] = useState(false);
  const [editingBomItem, setEditingBomItem] = useState<number | null>(null);
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);

  // State for editable scope of work sections
  const [companyScopeItems, setCompanyScopeItems] = useState<{ [projectIndex: number]: string[] }>({});
  const [customerScopeItems, setCustomerScopeItems] = useState<{ [projectIndex: number]: string[] }>({});
  const [editingCompanyScope, setEditingCompanyScope] = useState<{ projectIndex: number, itemIndex: number } | null>(null);
  const [editingCustomerScope, setEditingCustomerScope] = useState<{ projectIndex: number, itemIndex: number } | null>(null);
  const [customFloorText, setCustomFloorText] = useState<{ [projectIndex: number]: string }>({});
  const [editingFloor, setEditingFloor] = useState<number | null>(null);

  const { toast } = useToast();

  // Fetch existing quotation data if in edit mode (FIX: Use proper URL string)
  const { data: existingQuotation, isLoading: isLoadingQuotation } = useQuery({
    queryKey: [`/api/quotations/${quotationId}`],
    enabled: isEditMode && !!quotationId,
  });

  // Fetch customer data for the quotation in edit mode (FIX: Use proper URL string)
  const customerId = (existingQuotation as any)?.customerId;
  const { data: existingCustomer, isLoading: isLoadingCustomer } = useQuery({
    queryKey: [`/api/customers/${customerId}`],
    enabled: isEditMode && !!customerId,
  });

  // Memoized filter function for site visits - DRY principle
  const filterSiteVisit = useCallback((visit: any) => {
    // Search filter
    const searchLower = siteVisitSearchQuery.toLowerCase();
    const matchesSearch = !siteVisitSearchQuery ||
      visit.customer?.name?.toLowerCase().includes(searchLower) ||
      visit.customer?.mobile?.includes(searchLower);

    // Date filter
    let matchesDate = true;
    if (dateFilter !== "all" && visit.siteInTime) {
      const visitDate = new Date(visit.siteInTime);
      const now = new Date();
      now.setHours(23, 59, 59, 999);

      if (dateFilter === "custom") {
        if (customDateFrom && customDateTo) {
          const fromDate = new Date(customDateFrom);
          fromDate.setHours(0, 0, 0, 0);
          const toDate = new Date(customDateTo);
          toDate.setHours(23, 59, 59, 999);
          matchesDate = visitDate >= fromDate && visitDate <= toDate;
        } else {
          matchesDate = false;
        }
      } else {
        const diffTime = now.getTime() - visitDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        switch (dateFilter) {
          case "today":
            matchesDate = diffDays === 0;
            break;
          case "last7days":
            matchesDate = diffDays <= 7;
            break;
          case "last30days":
            matchesDate = diffDays <= 30;
            break;
          case "thisMonth":
            matchesDate = visitDate.getMonth() === now.getMonth() &&
              visitDate.getFullYear() === now.getFullYear();
            break;
          case "lastMonth":
            const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            matchesDate = visitDate.getMonth() === lastMonth.getMonth() &&
              visitDate.getFullYear() === lastMonth.getFullYear();
            break;
          default:
            matchesDate = true;
        }
      }
    }

    // Department filter
    const matchesDepartment = departmentFilter === "all" ||
      visit.department === departmentFilter;

    return matchesSearch && matchesDate && matchesDepartment;
  }, [siteVisitSearchQuery, dateFilter, customDateFrom, customDateTo, departmentFilter]);

  // Fetch mappable site visits for selection
  const { data: siteVisits, isLoading: isLoadingSiteVisits } = useQuery({
    queryKey: ["/api/quotations/site-visits/mappable"],
    enabled: quotationSource === "site_visit"
  });

  // Memoized filtered site visits
  const filteredSiteVisits = useMemo(() => {
    return ((siteVisits as any)?.data || []).filter(filterSiteVisit);
  }, [siteVisits, filterSiteVisit]);

  // Form management
  const form = useForm<QuotationFormData>({
    resolver: zodResolver(quotationFormSchema),
    defaultValues: {
      customerId: "",
      source: "manual",
      projects: [],
      totalSystemCost: 0,
      totalGSTAmount: 0,
      totalWithGST: 0,
      totalSubsidyAmount: 0,
      totalCustomerPayment: 0,
      advancePaymentPercentage: 90,
      advanceAmount: 0,
      balanceAmount: 0,
      paymentTerms: "advance_90_balance_10",
      deliveryTimeframe: "2_3_weeks",
      termsTemplate: "standard",
      status: "draft",
      followUps: [],
      // Initialize critical business fields with defaults
      accountDetails: {
        bankName: "ICICI",
        accountNumber: "601305021400",
        ifscCode: "ICIC0006013",
        accountHolderName: "Godiva Solar",
        branch: "Subramanipuram, Madurai"
      },
      physicalDamageExclusions: {
        enabled: true,
        disclaimerText: "***Physical Damages will not be Covered***"
      },
      detailedWarrantyTerms: {
        solarPanels: {
          manufacturingDefect: "15 Years Manufacturing defect Warranty",
          serviceWarranty: "15 Years Service Warranty",
          performanceWarranty: [
            "90% Performance Warranty till the end of 15 years",
            "80% Performance Warranty till the end of 15 years"
          ]
        },
        inverter: {
          replacementWarranty: "Replacement Warranty for 10 Years",
          serviceWarranty: "Service Warranty for 5 Years"
        }
      },
      documentRequirements: {
        subsidyDocuments: [
          "EB Number",
          "EB Register Mobile Number",
          "Email ID",
          "Aadhar Card",
          "PAN Card",
          "Passport Size Photo -1",
          "Property Tax Copy",
          "Bank Passbook",
          "Cancelled Cheque"
        ],
        note: "*All Required Documents should be in the same name as mention EB Service Number"
      },
      communicationPreference: "whatsapp",
      documentVersion: 1,
      preparedBy: "",
      refName: "", // Reference name for "Discussion with" in PDF - defaults to preparedBy if not set
      contactPerson: "Godiva Solar Management",
      contactNumber: "+91 99949 01500",
      internalNotes: "",
      customerNotes: "",
      attachments: []
    }
  });

  // Check if all projects are water heater or water pump (service-only types)
  const projects = form.watch("projects") || [];
  const isServiceOnlyQuotation = useMemo(() =>
    projects.length > 0 && projects.every((p: any) =>
      ['water_heater', 'water_pump'].includes(p.projectType)
    ),
    [projects]
  );

  // Set default "Prepared By" to current user's name (only in create mode)
  useEffect(() => {
    if (!isEditMode && user?.displayName && !form.getValues("preparedBy")) {
      form.setValue("preparedBy", user.displayName);
    }
  }, [user, isEditMode, form]);

  // Fetch customers for manual entry
  const { data: customers, isLoading: isLoadingCustomers } = useQuery({
    queryKey: ["/api/customers"],
    enabled: quotationSource === "manual"
  });

  // Helper function to get property type for subsidy calculations
  const getPropertyType = (): string => {
    const formValues = form.getValues();

    if (quotationSource === "site_visit") {
      return formValues.customerData?.propertyType || 'residential';
    } else {
      // For manual quotations, find the selected customer from the customers list
      const selectedCustomer = (customers as any)?.data?.find(
        (c: any) => c.id === formValues.customerId
      );
      return selectedCustomer?.propertyType || 'residential';
    }
  };

  // Fetch complete site visit mapping data when selected - pulls ALL data without leaving anything
  const { data: mappingData, isLoading: isLoadingMapping, error: mappingError } = useQuery({
    queryKey: [`/api/quotations/site-visits/${selectedSiteVisit}/mapping-data`],
    enabled: !!selectedSiteVisit && quotationSource === "site_visit",
    retry: false // Don't retry on error, we'll handle it manually
  });

  // Fallback: Fetch basic site visit data if mapping fails OR in edit mode with siteVisitMapping
  const siteVisitIdForFallback = selectedSiteVisit || (isEditMode && (siteVisitMapping?.sourceVisitId || siteVisitMapping?.siteVisitId));
  const { data: fallbackSiteVisitData, isLoading: isLoadingFallback } = useQuery({
    queryKey: [`/api/site-visits/${siteVisitIdForFallback}`],
    enabled: !!siteVisitIdForFallback && ((quotationSource === "site_visit" && !!mappingError) || (isEditMode && !!siteVisitMapping)),
    retry: false
  });

  // Create/Update quotation mutation using proper apiRequest with auth
  const createQuotationMutation = useMutation({
    mutationFn: async (data: QuotationFormData) => {
      // Sanitize form data: convert empty strings to null for optional fields
      const sanitizedData = sanitizeFormData(data, [
        'email', 'location', 'ebServiceNumber', 'propertyType', 'scope', 'tariffCode', 'ebSanctionPhase', 'ebSanctionKW'
      ]);

      let finalCustomerId = sanitizedData.customerId;

      // For manual quotations (NOT in edit mode), handle customer creation/lookup
      if (!isEditMode && quotationSource === "manual" && sanitizedData.customerData) {
        // Check if customer already selected via customerId dropdown
        if (sanitizedData.customerId) {
          finalCustomerId = sanitizedData.customerId;
        } else {
          // Create new customer from customerData form
          console.log("Creating new customer:", sanitizedData.customerData);
          const customerResponse = await apiRequest("/api/customers", "POST", sanitizedData.customerData);
          const newCustomer = await customerResponse.json();
          finalCustomerId = newCustomer.id;
          console.log("New customer created with ID:", finalCustomerId);
        }
      }

      // In edit mode, use existing customer ID
      if (isEditMode && existingQuotation) {
        finalCustomerId = (existingQuotation as any).customerId;
      }

      // Prepare payload - customerData handling depends on quotation source
      const { totalGSTAmount, totalWithGST, ...basePayload } = sanitizedData;

      // Use PUT for edit mode, POST for create mode
      if (isEditMode && quotationId) {
        console.log("Updating quotation with ID:", quotationId);

        // For edit mode: remove ALL immutable fields (customerId, source, customerData)
        // The backend will enforce these values from the existing quotation
        // This prevents any client-side tampering and ensures data integrity
        const { customerId, source, siteVisitMapping, customerData, ...editableFields } = basePayload;

        console.log("Sending update payload (immutable fields excluded):", editableFields);
        const response = await apiRequest(`/api/quotations/${quotationId}`, "PUT", editableFields);
        return response.json();
      } else {
        // For create mode: include customerId and customerData (for overrides like EB number changes)
        const payloadWithCustomerId = {
          ...basePayload,
          customerId: finalCustomerId,
          // IMPORTANT: For site visit quotations, customerData allows user to override mapped values (e.g., EB number edits)
          // For manual quotations, customerData is already used for customer creation above
          // Include it in payload so backend can merge overrides: ...mappingResult.quotationData, ...req.body
          customerData: sanitizedData.customerData
        };
        const url = quotationSource === "site_visit" && selectedSiteVisit
          ? `/api/quotations/from-site-visit/${selectedSiteVisit}`
          : "/api/quotations";

        console.log("Sending quotation payload:", payloadWithCustomerId);
        const response = await apiRequest(url, "POST", payloadWithCustomerId);
        return response.json();
      }
    },
    onSuccess: (data: any) => {
      console.log(`✅ Quotation ${isEditMode ? 'updated' : 'created'} successfully:`, data);
      console.log("📄 Quotation Number:", data.quotation?.quotationNumber || data.quotationNumber);
      console.log("🆔 Quotation ID:", data.quotation?.id || data.id);
      toast({
        title: isEditMode ? "Quotation Updated" : "Quotation Created",
        description: `Quotation ${data.quotation?.quotationNumber || data.quotationNumber || 'new'} has been ${isEditMode ? 'updated' : 'created'} successfully.${isEditMode ? ` Revision: R${data.documentVersion || data.quotation?.documentVersion || 1}` : ''}`
      });
      // Invalidate all quotation-related queries (including filtered ones)
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"], exact: false });
      console.log("🔄 Invalidated queries, redirecting to /quotations");
      setLocation("/quotations");
    },
    onError: (error: any) => {
      console.error("\n❌❌❌ ERROR CREATING QUOTATION ❌❌❌");
      console.error("Error object:", error);
      console.error("Error status:", error.status);
      console.error("Error message:", error.message);
      console.error("Error name:", error.name);
      console.error("Full error stringified:", JSON.stringify(error, null, 2));

      // Try to extract validation errors from the response
      try {
        if (error.message && error.message.includes("400:")) {
          console.error("400 Validation Error - attempting to parse details");
          const errorText = error.message.substring(error.message.indexOf(":") + 1);
          console.error("Parsed error response:", errorText);
          try {
            const parsed = JSON.parse(errorText);
            console.error("Validation errors details:", JSON.stringify(parsed, null, 2));
          } catch (e) {
            console.error("Could not parse error as JSON:", errorText);
          }
        }
      } catch (e) {
        console.error("Error while trying to parse error details:", e);
      }

      // Handle structured validation errors
      if (error.status === 422 && error.completenessAnalysis) {
        toast({
          title: "Site Visit Data Incomplete",
          description: error.message,
          variant: "destructive"
        });
      } else if (error.status === 400 || error.message?.includes("400:")) {
        toast({
          title: "Validation Error",
          description: error.message || "Please check all required fields and try again.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Error Creating Quotation",
          description: error.message || "Please check all required fields and try again.",
          variant: "destructive"
        });
      }
    }
  });

  // PDF Preview handler - allows previewing PDF with current form values without saving
  const [isPreviewingPDF, setIsPreviewingPDF] = useState(false);

  const handlePreviewPDF = async () => {
    if (!quotationId && !isEditMode) {
      toast({
        title: "Save Required",
        description: "Please save the quotation first before previewing PDF.",
        variant: "destructive"
      });
      return;
    }

    setIsPreviewingPDF(true);

    try {
      const currentFormValues = form.getValues();

      // Send current form values as overrides to PDF endpoint
      const response = await apiRequest(
        `/api/quotations/${quotationId}/generate-pdf`,
        'POST',
        {
          preparedBy: currentFormValues.preparedBy,
          refName: currentFormValues.refName,
          contactPerson: currentFormValues.contactPerson,
          contactNumber: currentFormValues.contactNumber
        }
      );

      if (response.ok) {
        const data = await response.json();

        // Create a temporary iframe to render the HTML
        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.left = '-10000px';
        iframe.style.top = '-10000px';
        iframe.style.width = '210mm';
        iframe.style.height = '297mm';
        document.body.appendChild(iframe);

        // Write the HTML content to the iframe
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.open();
          iframeDoc.write(data.html);
          iframeDoc.close();

          // Wait for content to load then trigger print
          setTimeout(() => {
            // Set the title so the PDF uses the quotation number as filename
            iframeDoc.title = `Quotation-${data.quotationNumber || 'Preview'}`;
            iframe.contentWindow?.print();

            toast({
              title: "PDF Preview Ready",
              description: "PDF preview generated with your current changes. Please save or print from the dialog.",
            });

            // Clean up after a delay
            setTimeout(() => {
              document.body.removeChild(iframe);
            }, 1000);
          }, 500);
        }
      } else {
        throw new Error('Failed to generate PDF preview');
      }
    } catch (error: any) {
      console.error("Error previewing PDF:", error);
      toast({
        title: "Preview Failed",
        description: "Failed to generate PDF preview. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsPreviewingPDF(false);
    }
  };

  // Pre-fill form when in edit mode and quotation data is loaded
  useEffect(() => {
    if (isEditMode && existingQuotation && !isLoadingQuotation && existingCustomer && !isLoadingCustomer) {
      const quotation = existingQuotation as any;
      const customer = existingCustomer as any;
      console.log("📝 Pre-filling form with existing quotation data:", quotation);
      console.log("👤 Customer data:", customer);

      // Set the source and skip the source selection step in edit mode
      setQuotationSource(quotation.source || "manual");
      if (quotation.siteVisitMapping?.siteVisitId) {
        setSelectedSiteVisit(quotation.siteVisitMapping.siteVisitId);
        // Important: Also set siteVisitMapping so it's available when navigating back to step 1
        setSiteVisitMapping(quotation.siteVisitMapping);
      }

      // Note: currentStep is already initialized to 2 (Project Configuration) for edit mode
      // so we don't need to set it here

      // Prepare customer data from the fetched customer
      const customerData = {
        name: customer.name || "",
        mobile: customer.mobile || "",
        address: customer.address || "",
        email: customer.email || "",
        propertyType: customer.propertyType || "",
        ebServiceNumber: customer.ebServiceNumber || "",
        location: customer.location || "",
        source: quotation.source || "manual"
      };

      // Reset form with existing quotation data
      form.reset({
        customerId: quotation.customerId || "",
        customerData: customerData, // Add customer data for form population
        source: quotation.source || "manual",
        projects: quotation.projects || [],
        totalSystemCost: quotation.totalSystemCost || 0,
        totalGSTAmount: quotation.totalGSTAmount || 0,
        totalWithGST: quotation.totalWithGST || 0,
        totalSubsidyAmount: quotation.totalSubsidyAmount || 0,
        totalCustomerPayment: quotation.totalCustomerPayment || 0,
        advancePaymentPercentage: quotation.advancePaymentPercentage || 90,
        advanceAmount: quotation.advanceAmount || 0,
        balanceAmount: quotation.balanceAmount || 0,
        paymentTerms: quotation.paymentTerms || "advance_90_balance_10",
        deliveryTimeframe: quotation.deliveryTimeframe || "2_3_weeks",
        termsTemplate: quotation.termsTemplate || "standard",
        status: quotation.status || "draft",
        followUps: quotation.followUps || [],
        communicationPreference: quotation.communicationPreference || "whatsapp",
        internalNotes: quotation.internalNotes || "",
        customerNotes: quotation.customerNotes || "",
        attachments: quotation.attachments || [],
        preparedBy: quotation.preparedBy || "",
        validUntil: quotation.validUntil ? new Date(quotation.validUntil) : undefined,
        accountDetails: quotation.accountDetails || {
          bankName: "ICICI",
          accountNumber: "601305021400",
          ifscCode: "ICIC0006013",
          accountHolderName: "Godiva Solar",
          branch: "Subramanipuram, Madurai"
        },
        physicalDamageExclusions: quotation.physicalDamageExclusions || {
          enabled: true,
          disclaimerText: "***Physical Damages will not be Covered***"
        },
        detailedWarrantyTerms: quotation.detailedWarrantyTerms || {
          solarPanels: {
            manufacturingDefect: "5 Years Replacement Warranty",
            serviceWarranty: "25 Years Service Warranty",
            performanceWarranty: [
              "10 Years 90% performance Warranty",
              "25 Years 80% performance Warranty"
            ]
          },
          inverter: {
            replacementWarranty: "15 Years Replacement Warranty",
            serviceWarranty: "25 Years Service Warranty"
          },
          installation: {
            warrantyPeriod: "1 Year Warranty on Installation",
            serviceWarranty: "25 Years Service Warranty"
          }
        },
        documentRequirements: quotation.documentRequirements || {
          subsidyDocuments: [
            "EB Number",
            "EB Register Mobile Number",
            "Email ID",
            "Aadhar Card",
            "PAN Card",
            "Passport Size Photo -1",
            "Property Tax Copy",
            "Bank Passbook",
            "Cancelled Cheque"
          ],
          note: "*All Required Documents should be in the same name as mention EB Service Number"
        },
        contactPerson: quotation.contactPerson || "Godiva Solar Management",
        contactNumber: quotation.contactNumber || "+91 99949 01500",
        siteVisitMapping: quotation.siteVisitMapping
      });

      // Initialize custom scope items from existing quotation data
      if (quotation.customCompanyScopeItems) {
        setCompanyScopeItems(quotation.customCompanyScopeItems);
      }
      if (quotation.customCustomerScopeItems) {
        setCustomerScopeItems(quotation.customCustomerScopeItems);
      }

      // Also load custom BOM if it exists
      if (quotation.customBillOfMaterials && quotation.customBillOfMaterials.length > 0) {
        setBomItems(quotation.customBillOfMaterials);
      }

      toast({
        title: "Edit Mode",
        description: `Editing quotation ${quotation.quotationNumber}. Revision: R${quotation.documentVersion || 1}`,
      });
    }
  }, [isEditMode, existingQuotation, isLoadingQuotation, existingCustomer, isLoadingCustomer, form, toast]);

  // Handle site visit selection and auto-populate form (skip in edit mode)
  useEffect(() => {
    if (!isEditMode && mappingData && (mappingData as any).quotationData) {
      const data = (mappingData as any).quotationData;
      const metadata = (mappingData as any).mappingMetadata;
      const originalSiteVisitData = (mappingData as any).originalSiteVisitData;

      // Extract customer data from multiple possible paths - be flexible
      const customerData = originalSiteVisitData?.customer ||
        originalSiteVisitData?.customerData ||
        metadata?.originalSiteVisitData?.customer ||
        metadata?.customer ||
        data.customerData ||
        {}; // Default to empty object to allow manual entry

      // Auto-populate form with mapped data, ensuring proper QuotationProject structure
      const mappedProjects: QuotationProject[] = (data.projects || []).map((project: any) => {
        // Extract and normalize array fields first to avoid duplicates
        const earth = Array.isArray(project.earth) ? project.earth : (project.earth ? [project.earth] : []);
        const solarPanelMake = Array.isArray(project.solarPanelMake) ? project.solarPanelMake : (project.solarPanelMake ? [project.solarPanelMake] : []);
        const inverterMake = Array.isArray(project.inverterMake) ? project.inverterMake : (project.inverterMake ? [project.inverterMake] : []);

        // Ensure full QuotationProject compliance with all required fields
        return {
          projectType: project.projectType,
          projectValue: project.projectValue || 0,
          subsidyAmount: project.subsidyAmount || 0,
          customerPayment: project.customerPayment || 0,
          // Include all other QuotationProject fields as defined in schema
          systemKW: project.systemKW,
          pricePerKW: project.pricePerKW,
          panelWatts: project.panelWatts,
          panelCount: project.panelCount,
          inverterWatts: project.inverterWatts,
          inverterKW: project.inverterKW,
          inverterQty: project.inverterQty,
          inverterPhase: project.inverterPhase,
          ...project, // Include all other mapped fields from site visit
          // Override with normalized array fields
          earth,
          solarPanelMake,
          inverterMake
        } as QuotationProject;
      });

      // Set customer data in the form for site visit source
      const customerFormData = {
        name: customerData?.name || "",
        mobile: customerData?.mobile || "",
        address: customerData?.address || "",
        propertyType: customerData?.propertyType || "",
        ebServiceNumber: customerData?.ebServiceNumber || "",
        location: customerData?.location || ""
      };

      form.reset({
        ...form.getValues(),
        source: "site_visit", // Ensure source is properly set
        customerId: data.customerId || customerData?.id || "",
        customerData: customerFormData, // Add customer data for site visit form
        projects: mappedProjects,
        totalSystemCost: data.totalSystemCost || 0,
        totalGSTAmount: data.totalGSTAmount || 0,
        totalWithGST: data.totalWithGST || 0,
        totalSubsidyAmount: data.totalSubsidyAmount || 0,
        totalCustomerPayment: data.totalCustomerPayment || 0,
        advancePaymentPercentage: data.advancePaymentPercentage || 90,
        advanceAmount: data.advanceAmount || 0,
        balanceAmount: data.balanceAmount || 0,
        paymentTerms: data.paymentTerms || "advance_90_balance_10",
        deliveryTimeframe: data.deliveryTimeframe || "2_3_weeks",
        termsTemplate: data.termsTemplate || "standard",
        status: data.status || "draft",
        followUps: data.followUps || [],
        communicationPreference: data.communicationPreference || "whatsapp",
        documentVersion: data.documentVersion || 1,
        internalNotes: data.internalNotes || "",
        customerNotes: data.customerNotes || "",
        attachments: data.attachments || [],
        siteVisitMapping: metadata ? {
          ...metadata,
          mappedAt: metadata.mappedAt instanceof Date ? metadata.mappedAt : new Date(metadata.mappedAt)
        } : undefined
      });

      // Enhanced mapping data with customer info for SiteVisitCustomerDetailsForm
      const enhancedMapping = {
        ...mappingData,
        // Add customer data directly at the expected paths
        customer: customerData,
        originalSiteVisitData: {
          ...originalSiteVisitData,
          customerData: customerData
        },
        mappingMetadata: {
          ...metadata,
          // Add customer data for the form component from the original site visit
          customer: customerData,
          // Also add to originalSiteVisitData for compatibility
          originalSiteVisitData: {
            ...originalSiteVisitData,
            customerData: customerData
          }
        },
        // Include completeness analysis at the top level
        completenessAnalysis: metadata?.completenessAnalysis || (mappingData as any).completenessAnalysis
      };

      setSiteVisitMapping(enhancedMapping);

      toast({
        title: "Complete Site Visit Data Mapped",
        description: `All available data mapped with ${metadata?.completenessAnalysis?.completenessScore || 0}% completeness. Grade: ${metadata?.completenessAnalysis?.qualityGrade || 'Unknown'}`
      });
    }
  }, [mappingData, form]);

  // Handle fallback data when mapping fails but site visit data is available, or in edit mode
  useEffect(() => {
    if (fallbackSiteVisitData && ((mappingError && !mappingData) || isEditMode)) {
      const siteVisit = fallbackSiteVisitData as any;

      // Extract customer data - be flexible with missing data
      const customerData = siteVisit.customer || siteVisit.customerData || {};

      // Set customer data in the form for fallback case - allow partial data
      const customerFormData = {
        name: customerData?.name || "",
        mobile: customerData?.mobile || "",
        address: customerData?.address || "",
        propertyType: customerData?.propertyType || "",
        ebServiceNumber: customerData?.ebServiceNumber || "",
        location: customerData?.location || ""
      };

      // Create basic mapping metadata for partial data
      const partialMapping = {
        sourceVisitId: siteVisit.id,
        mappedAt: new Date(),
        completenessScore: Object.values(customerFormData).filter(v => v && v.trim()).length * 16, // Rough percentage based on filled fields
        missingCriticalFields: [],
        missingOptionalFields: [],
        dataQualityNotes: "Fallback mapping - allowing partial customer data completion by user.",
        customer: customerData,
        originalSiteVisitData: {
          visitInfo: {
            id: siteVisit.id,
            visitPurpose: siteVisit.visitPurpose,
            status: siteVisit.status,
            department: siteVisit.department,
            visitOutcome: siteVisit.visitOutcome
          },
          customer: customerData,
          customerData: customerData
        }
      };

      // Populate form with customer data only
      form.reset({
        ...form.getValues(),
        source: "site_visit",
        customerId: customerData?.id || "",
        customerData: customerFormData, // Add customer data for fallback case
        projects: [], // Empty projects - user will need to add manually
        siteVisitMapping: partialMapping ? {
          ...partialMapping,
          mappedAt: partialMapping.mappedAt instanceof Date ? partialMapping.mappedAt : new Date(partialMapping.mappedAt)
        } : undefined
      });

      setSiteVisitMapping(partialMapping);

      toast({
        title: "Site Visit Data Retrieved",
        description: "Available customer information loaded. Please complete any missing details below.",
        variant: "default"
      });
    }
  }, [fallbackSiteVisitData, mappingError, mappingData, form, isEditMode]);

  // Initialize scope items from project configuration
  useEffect(() => {
    const projects = form.watch("projects");
    if (!projects || projects.length === 0 || currentStep !== 4) return; // Only when on Review & Submit step

    // Helper to generate default company scope items for a project
    const generateCompanyScopeItems = (project: any, projectIndex: number): string[] => {
      const items: string[] = [];
      const floor = project.floor || '0';
      const lowerHeight = project.gpStructure?.lowerEndHeight || '7';
      const higherHeight = project.gpStructure?.higherEndHeight || '8';
      const floorMap: Record<string, string> = {
        '0': 'Ground Floor',
        '1': '1st Floor',
        '2': '2nd Floor',
        '3': '3rd Floor',
        '4': '4th Floor'
      };
      const floorText = customFloorText[projectIndex] || floorMap[floor] || 'Ground Floor';

      const projectTypeName = project.projectType === 'on_grid' ? 'On-Grid' :
        project.projectType === 'off_grid' ? 'Off-Grid' :
          project.projectType === 'hybrid' ? 'Hybrid' :
            project.projectType === 'water_heater' ? 'Solar Water Heater' :
              project.projectType === 'water_pump' ? 'Solar Water Pump' : project.projectType;

      // Structure item for solar projects
      if (['on_grid', 'off_grid', 'hybrid'].includes(project.projectType)) {
        items.push(`For ${projectTypeName}, South facing slant mounting of lower end height is ${lowerHeight} feet & ${higherHeight} feet at higher end. (${floorText})`);
      }

      // Civil work if company scope
      if (project.civilWorkScope === 'company_scope') {
        items.push('Civil work including earth pit digging and chamber construction');
      }

      // Net meter if company scope
      if (project.netMeterScope === 'company_scope') {
        items.push('Net (Bi-directional) Meter - Application and Installation');
      }

      // Electrical work if company scope
      if (project.electricalWorkScope === 'company_scope') {
        items.push('Complete electrical work and wiring');
      }

      // Plumbing work if company scope (for water heater/pump)
      if (project.plumbingWorkScope === 'company_scope') {
        items.push('Plumbing work and water connections');
      }

      return items;
    };

    // Helper to generate default customer scope items for a project
    const generateCustomerScopeItems = (project: any): string[] => {
      const items: string[] = [];

      // Civil work if customer scope
      if (project.civilWorkScope === 'customer_scope') {
        items.push('Earth pit digging');
        if (['gp_structure', 'gi_structure', 'gi_round_pipe', 'ms_square_pipe'].includes(project.structureType)) {
          items.push('1 feet chamber and concrete (for Structure)');
        }
      }

      // Net meter if customer scope
      if (project.netMeterScope === 'customer_scope') {
        items.push('Application and Installation charges for net meter to be paid by Customer');
      }

      // Electrical work if customer scope
      if (project.electricalWorkScope === 'customer_scope') {
        items.push('Electrical work and wiring');
      }

      // Plumbing work if customer scope (for water heater/pump)
      if (project.plumbingWorkScope === 'customer_scope') {
        items.push('Plumbing work and water connections');
      }

      return items;
    };

    // Initialize or update scope items for all projects
    setCompanyScopeItems(prev => {
      const updated = { ...prev };
      projects.forEach((project: any, index: number) => {
        // Only initialize if not already set (preserve user edits)
        if (!updated[index]) {
          updated[index] = generateCompanyScopeItems(project, index);
        }
      });
      return updated;
    });

    setCustomerScopeItems(prev => {
      const updated = { ...prev };
      projects.forEach((project: any, index: number) => {
        // Only initialize if not already set (preserve user edits)
        if (!updated[index]) {
          updated[index] = generateCustomerScopeItems(project);
        }
      });
      return updated;
    });
  }, [form, currentStep, customFloorText]); // Re-run when projects change or step changes

  // Scroll to top when step changes
  useEffect(() => {
    const mainElement = document.querySelector('main.overflow-y-auto');
    if (mainElement) {
      mainElement.scrollTo({ top: 30, behavior: 'smooth' });
    }
  }, [currentStep]);

  // Navigation functions
  const nextStep = () => {
    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceed = () => {
    const values = form.getValues();

    if (currentStep === 1) {
      console.log("🔍 CUSTOMER VALIDATION CHECK");
      console.log("Quotation Source:", quotationSource);
      console.log("Customer Data:", values.customerData);
      console.log("Customer ID:", values.customerId);
    }

    if (currentStep === 4) {
      console.log("🔍 FINAL STEP VALIDATION CHECK");
      console.log("Can proceed?", true);
      console.log("Form errors:", form.formState.errors);
    }

    switch (currentStep) {
      case 0: // Source selection (skipped in edit mode)
        return isEditMode || quotationSource === "manual" || (quotationSource === "site_visit" && selectedSiteVisit);
      case 1: // Customer details
        // In edit mode, customer data is locked and already validated - always allow proceeding
        if (isEditMode) {
          return true;
        }

        if (quotationSource === "manual") {
          // For manual creation, we ALWAYS need customerData to be properly filled
          // Whether selected from database or entered manually
          const customerData = values.customerData;

          if (!customerData) {
            console.log("❌ No customer data - button DISABLED");
            return false;
          }

          const isNameValid = customerData.name && customerData.name.trim().length >= 2;
          const isMobileValid = customerData.mobile && customerData.mobile.trim().length >= 10;
          const isAddressValid = customerData.address && customerData.address.trim().length >= 3;
          const isPropertyTypeValid = customerData.propertyType && customerData.propertyType.trim() !== "";

          console.log("Validation:", { isNameValid, isMobileValid, isAddressValid, isPropertyTypeValid });
          const result = isNameValid && isMobileValid && isAddressValid && isPropertyTypeValid;
          console.log(result ? "✅ All valid - button ENABLED" : "❌ Some invalid - button DISABLED");

          return result;
        } else {
          // For site visit source, check that customer data is complete and valid
          const customerData = values.customerData;
          if (!customerData) return false;

          const isNameValid = customerData.name && customerData.name.trim().length >= 2;
          const isMobileValid = customerData.mobile && customerData.mobile.trim().length >= 10;
          const isAddressValid = customerData.address && customerData.address.trim().length >= 3;
          const isPropertyTypeValid = customerData.propertyType && customerData.propertyType.trim() !== "";

          return isNameValid && isMobileValid && isAddressValid && isPropertyTypeValid;
        }
      case 2: // Projects
        if (!values.projects || values.projects.length === 0) {
          return false;
        }

        // Validate each project has required fields
        const hasValidProjects = values.projects.every((project: any) => {
          // For solar projects (on_grid, off_grid, hybrid)
          if (['on_grid', 'off_grid', 'hybrid'].includes(project.projectType)) {
            return (
              project.panelCount > 0 &&
              project.projectValue > 0 &&
              values.customerData?.propertyType // Property type is required for subsidy calculation
            );
          }
          // For water_heater and water_pump, just check projectValue
          return project.projectValue > 0;
        });

        return hasValidProjects;
      case 3: // Pricing
        return (values.totalCustomerPayment || 0) > 0;
      default:
        return true;
    }
  };

  // Watch form fields to trigger re-render when they change
  const watchedProjects = form.watch("projects");
  const watchedAdvancePercentage = form.watch("advancePaymentPercentage");
  const watchedCustomerData = form.watch("customerData");
  const watchedCustomerId = form.watch("customerId");
  useEffect(() => {
    const calculateTotals = () => {
      const values = form.getValues();
      const projects = values.projects || [];

      // totalSystemCost is now the sum of base prices (before GST)
      const totalSystemCost = projects.reduce((sum: number, project: any) => sum + (project.basePrice || 0), 0);
      const totalGSTAmount = projects.reduce((sum: number, project: any) => sum + (project.gstAmount || 0), 0);
      const totalWithGST = projects.reduce((sum: number, project: any) => sum + (project.projectValue || 0), 0);
      const totalSubsidyAmount = projects.reduce((sum: number, project: any) => sum + (project.subsidyAmount || 0), 0);
      const totalCustomerPayment = totalWithGST - totalSubsidyAmount;
      const advancePercentage = values.advancePaymentPercentage || 90;
      const advanceAmount = Math.round(totalCustomerPayment * (advancePercentage / 100));
      const balanceAmount = totalCustomerPayment - advanceAmount;

      form.setValue("totalSystemCost", totalSystemCost);
      form.setValue("totalGSTAmount", totalGSTAmount);
      form.setValue("totalWithGST", totalWithGST);
      form.setValue("totalSubsidyAmount", totalSubsidyAmount);
      form.setValue("totalCustomerPayment", totalCustomerPayment);
      form.setValue("advanceAmount", advanceAmount);
      form.setValue("balanceAmount", balanceAmount);
    };

    // Recalculate totals for both manual and site_visit sources
    calculateTotals();
  }, [watchedProjects, watchedAdvancePercentage, form]);

  // Fetch BOM preview when entering Review & Submit step (step 4)
  useEffect(() => {
    const fetchBomPreview = async () => {
      if (currentStep === 4 && form.watch("projects").length > 0) {
        console.log("📦 BOM FETCH useEffect triggered - currentStep:", currentStep);
        console.log("⚠️ WARNING: This useEffect should ONLY fetch BOM, NOT create quotation");

        // Check if we have custom BOM from edit mode
        if (isEditMode && existingQuotation && (existingQuotation as any).customBillOfMaterials) {
          setBomItems((existingQuotation as any).customBillOfMaterials);
          return;
        }

        setIsFetchingBom(true);
        try {
          // Get the first project for BOM generation (multi-project BOM coming later)
          const project = form.watch("projects")[0];
          const propertyType = getPropertyType();

          console.log("📦 Fetching BOM preview only (NOT creating quotation)");
          const response = await apiRequest("/api/quotations/preview-bom", "POST", {
            project,
            propertyType
          });

          const data = await response.json();
          setBomItems(data.billOfMaterials || []);
          console.log("✅ BOM preview fetched successfully");
        } catch (error) {
          console.error("Error fetching BOM preview:", error);
          toast({
            title: "Error Loading BOM",
            description: "Could not load Bill of Materials preview. Please try again.",
            variant: "destructive"
          });
        } finally {
          setIsFetchingBom(false);
        }
      }
    };

    fetchBomPreview();
  }, [currentStep, form, isEditMode, existingQuotation, toast]);

  // Handle back button navigation with smart step-back behavior
  const handleBack = () => {
    if (currentStep > 0) {
      // If not on first step, use the existing prevStep helper
      prevStep();
    } else {
      // If on first step, check if form is dirty before exiting
      if (form.formState.isDirty) {
        setShowExitConfirmation(true);
      } else {
        // Form is clean, exit immediately
        setLocation("/quotations");
      }
    }
  };

  const onSubmit = (data: QuotationFormData) => {
    // Sanitize form data: convert empty strings to null for optional fields
    const sanitizedData = sanitizeFormData(data, [
      'email', 'location', 'ebServiceNumber', 'propertyType', 'scope', 'tariffCode', 'ebSanctionPhase', 'ebSanctionKW'
    ]);

    // CRITICAL: Deep sanitize nested customerData fields
    if (sanitizedData.customerData) {
      sanitizedData.customerData = {
        ...sanitizedData.customerData,
        ebSanctionPhase: sanitizedData.customerData.ebSanctionPhase === "" ? null : sanitizedData.customerData.ebSanctionPhase,
        tariffCode: sanitizedData.customerData.tariffCode === "" ? null : sanitizedData.customerData.tariffCode,
        ebSanctionKW: sanitizedData.customerData.ebSanctionKW === "" ? null : sanitizedData.customerData.ebSanctionKW,
        ebServiceNumber: sanitizedData.customerData.ebServiceNumber === "" ? null : sanitizedData.customerData.ebServiceNumber,
        propertyType: sanitizedData.customerData.propertyType === "" ? null : sanitizedData.customerData.propertyType,
      };
    }

    console.log("═══════════════════════════════════════════");
    console.log("🚀🚀🚀 FORM SUBMIT - onSubmit triggered 🚀🚀🚀");
    console.log("⏰ Timestamp:", new Date().toISOString());
    console.log("📋 Current Step:", currentStep);
    console.log("📊 BOM Items Count:", bomItems.length);
    console.log("🔍 Stack trace to see WHO called this:");
    console.trace("Form submission trace");
    console.log("═══════════════════════════════════════════");
    console.log("Form data:", JSON.stringify(sanitizedData, null, 2));

    // Log each project in detail
    sanitizedData.projects?.forEach((project, idx) => {
      console.log(`\n📦 PROJECT ${idx} - Type: ${project.projectType}`);
      console.log("Project details:", JSON.stringify(project, null, 2));
    });

    // GUARD: Only allow submission if we're on the final step (Review & Submit)
    if (currentStep !== WIZARD_STEPS.length - 1) {
      console.log("❌ BLOCKED: Form submission prevented - not on final step");
      console.log("Current step:", currentStep, "Final step:", WIZARD_STEPS.length - 1);
      return;
    }

    // Validate business rules before submission
    const totalSystemCost = sanitizedData.projects.reduce((sum, p) => sum + (p.basePrice || 0), 0);
    const totalGSTAmount = sanitizedData.projects.reduce((sum, p) => sum + (p.gstAmount || 0), 0);
    const totalWithGST = sanitizedData.projects.reduce((sum, p) => sum + p.projectValue, 0);
    const totalSubsidyAmount = sanitizedData.projects.reduce((sum, p) => sum + p.subsidyAmount, 0);
    const calculatedCustomerPayment = totalWithGST - totalSubsidyAmount;

    console.log("💰 Pricing validation:", {
      totalCustomerPayment: sanitizedData.totalCustomerPayment,
      calculatedCustomerPayment,
      difference: Math.abs(sanitizedData.totalCustomerPayment - calculatedCustomerPayment)
    });

    // Ensure all pricing is consistent with business rules
    if (Math.abs(sanitizedData.totalCustomerPayment - calculatedCustomerPayment) > 1) {
      console.log("❌ Pricing validation failed - aborting submission");
      toast({
        title: "Pricing Error",
        description: "Pricing calculations don't match business rules. Please refresh the data.",
        variant: "destructive"
      });
      return;
    }

    // Extract EB Sanction fields from customerData and move to quotation top-level
    const ebFields = {
      tariffCode: sanitizedData.customerData?.tariffCode === "" ? null : (sanitizedData.customerData?.tariffCode || null),
      ebSanctionPhase: sanitizedData.customerData?.ebSanctionPhase === "" ? null : (sanitizedData.customerData?.ebSanctionPhase || null),
      ebSanctionKW: sanitizedData.customerData?.ebSanctionKW === "" ? null : (sanitizedData.customerData?.ebSanctionKW || null)
    };

    // Prepare final submission with proper QuotationProject validation
    // CRITICAL: Ensure inverterKVA is always STRING for off-grid and hybrid projects before schema validation
    const projectsWithFixedTypes = sanitizedData.projects.map((project: any) => {
      if (project.projectType === 'off_grid' || project.projectType === 'hybrid') {
        return {
          ...project,
          inverterKVA: project.inverterKVA ? String(project.inverterKVA) : undefined,
          inverterKW: project.inverterKW ? Number(project.inverterKW) : undefined
        };
      }
      return project;
    });

    const submissionData: QuotationFormData = {
      ...sanitizedData,
      // EB Sanction fields at quotation level (not in customerData)
      ...ebFields,
      source: quotationSource, // Use the actual selected source
      preparedBy: sanitizedData.preparedBy || user?.displayName || "", // Use form value, fallback to user name
      refName: sanitizedData.refName || null, // Reference name for "Discussion with" - null means use preparedBy
      projects: projectsWithFixedTypes, // Fixed types before validation
      customBillOfMaterials: bomItems.length > 0 ? bomItems : undefined, // Include custom BOM if edited
      customCompanyScopeItems: Object.keys(companyScopeItems).length > 0 ? companyScopeItems : undefined, // Include custom company scope if edited
      customCustomerScopeItems: Object.keys(customerScopeItems).length > 0 ? customerScopeItems : undefined, // Include custom customer scope if edited
      totalSystemCost,
      totalSubsidyAmount,
      totalCustomerPayment: calculatedCustomerPayment,
      advanceAmount: Math.round(calculatedCustomerPayment * (sanitizedData.advancePaymentPercentage / 100)),
      balanceAmount: calculatedCustomerPayment - Math.round(calculatedCustomerPayment * (sanitizedData.advancePaymentPercentage / 100))
    };

    console.log("🔍 PREPARED BY DEBUG:");
    console.log("  Form value (sanitizedData.preparedBy):", sanitizedData.preparedBy);
    console.log("  User display name:", user?.displayName);
    console.log("  Final value being sent:", submissionData.preparedBy);
    console.log("  Ref Name:", submissionData.refName);

    createQuotationMutation.mutate(submissionData);
  };

  // Show loading state while fetching data in edit mode
  if (isEditMode && (isLoadingQuotation || isLoadingCustomer)) {
    return (
      <div className="bg-gradient-to-b from-background to-muted/20 pb-8 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div>
                <h3 className="font-semibold text-lg">Loading Quotation Data</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Fetching quotation details and customer information...
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-b from-background to-muted/20" data-testid="quotation-creation-page">
      {/* Header Section */}
      <div className="bg-background border-b">
        <div className="container mx-auto px-4 py-6 md:py-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            data-testid="button-back"
            className="mb-4 -ml-2 hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {currentStep > 0 ? "Previous Step" : "Back to Quotations"}
          </Button>

          <div className="flex items-start gap-4">
            <div className="hidden sm:flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 shrink-0">
              <FileText className="h-8 w-8 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2" data-testid="text-page-title">
                {isEditMode ? "Edit Quotation" : "Create New Quotation"}
              </h1>
              <p className="text-base text-muted-foreground">
                Generate professional quotations for solar energy systems with our streamlined process
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 md:py-8 pb-8">
        {/* Progress indicator - Mobile: Simplified, Desktop: Full */}
        <div className="mb-6 md:mb-8">
          {/* Mobile Progress - Compact horizontal dots */}
          <div className="flex md:hidden items-center justify-between gap-2 mb-3">
            {WIZARD_STEPS.map((step, index) => {
              const isActive = index === currentStep;
              const isCompleted = index < currentStep;
              const IconComponent = step.icon;

              return (
                <div key={step.id} className="flex flex-col items-center flex-1">
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${isCompleted
                      ? "bg-primary border-primary text-primary-foreground"
                      : isActive
                        ? "border-primary text-primary"
                        : "border-muted-foreground text-muted-foreground"
                      }`}
                    data-testid={`step-indicator-${step.id}`}
                  >
                    {isCompleted ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <IconComponent className="h-4 w-4" />
                    )}
                  </div>
                  {isActive && (
                    <div className="mt-2 text-center">
                      <p className="text-xs font-medium text-primary truncate max-w-[80px]">
                        {step.title}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop Progress - Full stepper */}
          <div className="hidden lg:flex items-center gap-2">
            {WIZARD_STEPS.map((step, index) => {
              const isActive = index === currentStep;
              const isCompleted = index < currentStep;
              const IconComponent = step.icon;

              return (
                <div key={step.id} className="flex items-center flex-1 min-w-0">
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-full border-2 shrink-0 ${isCompleted
                      ? "bg-primary border-primary text-primary-foreground"
                      : isActive
                        ? "border-primary text-primary"
                        : "border-muted-foreground text-muted-foreground"
                      }`}
                    data-testid={`step-indicator-${step.id}`}
                  >
                    {isCompleted ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <IconComponent className="h-5 w-5" />
                    )}
                  </div>

                  <div className="ml-2 min-w-0 flex-1">
                    <p className={`text-sm font-medium truncate ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                      {step.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {step.description}
                    </p>
                  </div>

                  {index < WIZARD_STEPS.length - 1 && (
                    <div className={`mx-2 h-px bg-border w-8 shrink-0`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Tablet Progress - Compact vertical */}
          <div className="hidden md:grid lg:hidden grid-cols-5 gap-1.5">
            {WIZARD_STEPS.map((step, index) => {
              const isActive = index === currentStep;
              const isCompleted = index < currentStep;
              const IconComponent = step.icon;

              return (
                <div key={step.id} className="flex flex-col items-center text-center min-w-0">
                  <div
                    className={`flex items-center justify-center w-9 h-9 rounded-full border-2 mb-1.5 shrink-0 ${isCompleted
                      ? "bg-primary border-primary text-primary-foreground"
                      : isActive
                        ? "border-primary text-primary"
                        : "border-muted-foreground text-muted-foreground"
                      }`}
                    data-testid={`step-indicator-${step.id}`}
                  >
                    {isCompleted ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <IconComponent className="h-4 w-4" />
                    )}
                  </div>
                  <p className={`text-[10px] leading-tight font-medium truncate w-full px-1 ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                    {step.title}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            onKeyDown={(e) => {
              // Prevent Enter key from submitting form except on the submit button
              if (e.key === 'Enter' && e.target instanceof HTMLElement && e.target.tagName !== 'BUTTON') {
                e.preventDefault();
                e.stopPropagation();
                console.log("⚠️ Enter key pressed - prevented automatic form submission from:", e.target.tagName, e.target);
              }
            }}
            className="space-y-6"
          >
            {/* Step 0: Source Selection (skipped in edit mode) */}
            {currentStep === 0 && !isEditMode && (
              <Card data-testid="card-source-selection">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Search className="h-5 w-5" />
                    Choose Quotation Source
                  </CardTitle>
                  <CardDescription>
                    Select how you want to create this quotation
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Manual Creation Option */}
                    <Card
                      className={`cursor-pointer border-2 transition-colors ${quotationSource === "manual" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                        }`}
                      onClick={() => {
                        setQuotationSource("manual");
                        form.setValue("source", "manual");
                        // Clear customer data when switching to manual
                        form.setValue("customerData", undefined);
                        form.setValue("customerId", "");
                        setSelectedSiteVisit(null);
                        setSiteVisitMapping(null);
                      }}
                      data-testid="card-manual-creation"
                    >
                      <CardHeader className="p-4 sm:p-6">
                        <div className="flex items-start sm:items-center gap-3">
                          <div className="p-2 rounded-lg bg-blue-100 text-blue-600 shrink-0">
                            <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base sm:text-lg">Manual Creation</CardTitle>
                            <CardDescription className="text-sm mt-1">
                              Create quotation from scratch with custom inputs
                            </CardDescription>
                          </div>
                          <div className="shrink-0">
                            <div className={`w-4 h-4 rounded-full border-2 ${quotationSource === "manual" ? "border-primary bg-primary" : "border-muted-foreground"
                              }`} />
                          </div>
                        </div>
                      </CardHeader>
                    </Card>

                    {/* Site Visit Integration Option */}
                    <Card
                      className={`cursor-pointer border-2 transition-colors ${quotationSource === "site_visit" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                        }`}
                      onClick={() => {
                        setQuotationSource("site_visit");
                        form.setValue("source", "site_visit");
                        // Clear customer data when switching to site visit
                        form.setValue("customerData", undefined);
                        form.setValue("customerId", "");
                      }}
                      data-testid="card-site-visit-integration"
                    >
                      <CardHeader className="p-4 sm:p-6">
                        <div className="flex items-start sm:items-center gap-3">
                          <div className="p-2 rounded-lg bg-green-100 text-green-600 shrink-0">
                            <Zap className="h-5 w-5 sm:h-6 sm:w-6" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base sm:text-lg">From Site Visit</CardTitle>
                            <CardDescription className="text-sm mt-1">
                              Auto-populate from existing site visit data
                            </CardDescription>
                          </div>
                          <div className="shrink-0">
                            <div className={`w-4 h-4 rounded-full border-2 ${quotationSource === "site_visit" ? "border-primary bg-primary" : "border-muted-foreground"
                              }`} />
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  </div>

                  {/* Site Visit Selection */}
                  {quotationSource === "site_visit" && (
                    <div className="space-y-3 -mt-2">
                      <Separator />
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium">Select Site Visit</h4>
                          {(siteVisits as any)?.data?.length > 0 && (
                            <span className="text-sm text-muted-foreground">
                              {filteredSiteVisits.length} of {(siteVisits as any)?.data?.length} visits
                            </span>
                          )}
                        </div>

                        {isLoadingSiteVisits ? (
                          <div className="flex items-center justify-center p-8">
                            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
                          </div>
                        ) : (siteVisits as any)?.data?.length > 0 ? (
                          <>
                            {/* Search Bar */}
                            <div className="mb-4">
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                <Input
                                  placeholder="Search by customer name or mobile..."
                                  value={siteVisitSearchQuery}
                                  onChange={(e) => setSiteVisitSearchQuery(e.target.value)}
                                  className="pl-9"
                                  data-testid="input-site-visit-search"
                                  aria-label="Search site visits by customer name or mobile number"
                                />
                              </div>
                            </div>

                            {/* Filters */}
                            <div className="mb-4 space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                  <label className="text-xs font-medium text-muted-foreground">Date Range</label>
                                  <Select value={dateFilter} onValueChange={(value) => {
                                    setDateFilter(value);
                                    if (value !== "custom") {
                                      setCustomDateFrom("");
                                      setCustomDateTo("");
                                    }
                                  }}>
                                    <SelectTrigger className="w-full" data-testid="select-date-filter">
                                      <SelectValue placeholder="All Dates" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="all">All Dates</SelectItem>
                                      <SelectItem value="today">Today</SelectItem>
                                      <SelectItem value="last7days">Last 7 Days</SelectItem>
                                      <SelectItem value="last30days">Last 30 Days</SelectItem>
                                      <SelectItem value="thisMonth">This Month</SelectItem>
                                      <SelectItem value="lastMonth">Last Month</SelectItem>
                                      <SelectItem value="custom">Custom Range</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-1.5">
                                  <label className="text-xs font-medium text-muted-foreground">Department</label>
                                  <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                                    <SelectTrigger className="w-full" data-testid="select-department-filter">
                                      <SelectValue placeholder="All Departments" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="all">All Departments</SelectItem>
                                      <SelectItem value="technical">Technical</SelectItem>
                                      <SelectItem value="marketing">Marketing</SelectItem>
                                      <SelectItem value="admin">Admin</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              {/* Custom Date Range Inputs */}
                              {dateFilter === "custom" && (
                                <div className="space-y-3 pt-2">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                      <label className="text-xs font-medium text-muted-foreground">From Date</label>
                                      <Input
                                        type="date"
                                        value={customDateFrom}
                                        onChange={(e) => {
                                          setCustomDateFrom(e.target.value);
                                          // Auto-clear "To" date if it's before the new "From" date
                                          if (customDateTo && e.target.value && new Date(e.target.value) > new Date(customDateTo)) {
                                            setCustomDateTo("");
                                          }
                                        }}
                                        max={new Date().toISOString().split('T')[0]}
                                        className="w-full"
                                        data-testid="input-custom-date-from"
                                      />
                                    </div>
                                    <div className="space-y-1.5">
                                      <label className="text-xs font-medium text-muted-foreground">To Date</label>
                                      <Input
                                        type="date"
                                        value={customDateTo}
                                        onChange={(e) => setCustomDateTo(e.target.value)}
                                        min={customDateFrom || undefined}
                                        max={new Date().toISOString().split('T')[0]}
                                        disabled={!customDateFrom}
                                        className="w-full"
                                        data-testid="input-custom-date-to"
                                      />
                                    </div>
                                  </div>
                                  {customDateFrom && customDateTo && (
                                    <div className="text-xs text-muted-foreground bg-muted px-3 py-2 rounded-md">
                                      Showing site visits from {new Date(customDateFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} to {new Date(customDateTo).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </div>
                                  )}
                                  {customDateFrom && !customDateTo && (
                                    <div className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-md">
                                      Please select an end date to complete the range
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Site Visit List */}
                            <div
                              className="max-h-[300px] overflow-y-auto pr-2 space-y-2"
                              style={{ overscrollBehavior: 'contain' }}
                              role="list"
                              aria-label="Site visits list"
                            >
                              {filteredSiteVisits.map((visit: SiteVisitMapping) => (
                                <Card
                                  key={visit.id}
                                  className={`cursor-pointer border transition-colors ${selectedSiteVisit === visit.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                                    }`}
                                  onClick={() => setSelectedSiteVisit(visit.id)}
                                  data-testid={`card-site-visit-${visit.id}`}
                                >
                                  <CardContent className="p-3 sm:p-4">
                                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center flex-wrap gap-2 mb-2">
                                          <h5 className="font-medium text-sm sm:text-base">{visit.customer.name}</h5>
                                          <Badge
                                            variant={(visit as any).status === 'completed' ? 'default' : 'secondary'}
                                            className="text-xs"
                                          >
                                            {(visit as any).status === 'completed' ? 'Completed' :
                                              (visit as any).status === 'in_progress' ? 'In Progress' :
                                                (visit as any).status === 'cancelled' ? 'Cancelled' : 'Unknown'}
                                          </Badge>
                                          <Badge
                                            variant={(visit as any).visitOutcome === 'converted' ? 'default' : 'outline'}
                                            className="text-xs"
                                          >
                                            {(visit as any).visitOutcome === 'converted' ? 'Converted' : 'On Process'}
                                          </Badge>
                                        </div>
                                        <p className="text-xs sm:text-sm text-muted-foreground">{visit.customer.mobile}</p>
                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{visit.customer.address}</p>
                                        {(visit as any).visitDate && (
                                          <p className="text-xs text-muted-foreground mt-1">
                                            Visit: {new Date((visit as any).visitDate).toLocaleDateString('en-IN', {
                                              day: '2-digit',
                                              month: 'short',
                                              year: 'numeric'
                                            })}
                                          </p>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-primary">
                                          {visit.completenessAnalysis.completenessScore}%
                                        </span>
                                      </div>
                                    </div>

                                    {visit.completenessAnalysis.missingCriticalFields.length > 0 && (
                                      <Alert className="mt-3">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertDescription className="text-xs">
                                          Missing critical fields: {visit.completenessAnalysis.missingCriticalFields.join(", ")}
                                        </AlertDescription>
                                      </Alert>
                                    )}
                                  </CardContent>
                                </Card>
                              ))}
                            </div>

                            {/* No Results Message */}
                            {filteredSiteVisits.length === 0 && (siteVisitSearchQuery || dateFilter !== "all" || departmentFilter !== "all") && (
                              <Alert className="mt-3">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertDescription>
                                  No site visits found matching the selected filters. Try adjusting your search criteria.
                                </AlertDescription>
                              </Alert>
                            )}
                          </>
                        ) : (
                          <Alert>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>
                              No site visits available for quotation mapping. Please complete site visits first.
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Step 1: Customer Details */}
            {currentStep === 1 && (
              <Card data-testid="card-customer-details" className="h-fit">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Customer Information
                    {isEditMode && <Badge variant="secondary" className="ml-2">Locked</Badge>}
                  </CardTitle>
                  <CardDescription>
                    {isEditMode
                      ? "Customer and source cannot be changed when editing a quotation"
                      : quotationSource === "site_visit" && siteVisitMapping
                        ? "Review and complete customer details from site visit"
                        : "Enter customer details for the quotation"
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {isEditMode && (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        Customer and quotation source are locked in edit mode. Only project details, pricing, and terms can be modified. The revision number will be automatically incremented.
                      </AlertDescription>
                    </Alert>
                  )}
                  {quotationSource === "manual" ? (
                    <ManualCustomerDetailsForm form={form} isEditMode={isEditMode} />
                  ) : (
                    <SiteVisitCustomerDetailsForm
                      form={form}
                      siteVisitMapping={siteVisitMapping}
                      fallbackSiteVisitData={fallbackSiteVisitData}
                      isEditMode={isEditMode}
                      existingCustomer={isEditMode ? existingCustomer : undefined}
                    />
                  )}
                </CardContent>
              </Card>
            )}

            {/* Step 2: Project Configuration */}
            {currentStep === 2 && (
              <Card data-testid="card-project-configuration">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    Project Configuration
                  </CardTitle>
                  <CardDescription>
                    {quotationSource === "site_visit" && siteVisitMapping ?
                      "Review and update project specifications from site visit" :
                      "Configure solar systems and project specifications"
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Show helpful message for site visit projects */}
                  {quotationSource === "site_visit" && siteVisitMapping && (
                    <Alert>
                      <Check className="h-4 w-4" />
                      <AlertDescription>
                        Site visit data has been loaded. Review the details below and add any missing information to complete the quotation.
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Always show the full editable configuration for both manual and site visit projects */}
                  <ManualProjectConfiguration form={form} isServiceOnlyQuotation={isServiceOnlyQuotation} />
                </CardContent>
              </Card>
            )}

            {/* Step 3: Pricing & Terms */}
            {currentStep === 3 && (
              <Card data-testid="card-pricing-terms">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="h-5 w-5" />
                    Pricing & Payment Terms
                  </CardTitle>
                  <CardDescription>
                    Review and edit pricing calculations and payment terms
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Editable Pricing Table - Only shows solar projects (on-grid, off-grid, hybrid) */}
                  {(() => {
                    const projects = form.watch("projects");
                    // Filter to get only solar projects (exclude water heater and water pump)
                    const solarProjects = projects ? projects.filter((p: any) =>
                      ['on_grid', 'off_grid', 'hybrid'].includes(p.projectType)
                    ) : [];

                    // Hide entire table if there are no solar projects
                    if (!solarProjects || solarProjects.length === 0) {
                      return null;
                    }

                    return (
                      <div className="space-y-4">
                        <h4 className="font-medium text-base">Quotation Pricing Details</h4>

                        {/* Desktop Table View (hidden on mobile) */}
                        <div className="hidden lg:block border rounded-lg overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-muted">
                              <tr>
                                <th className="text-left p-3 text-sm font-medium">Description</th>
                                <th className="text-center p-3 text-sm font-medium w-24">kW</th>
                                <th className="text-right p-3 text-sm font-medium w-32">Rate/kW (₹)</th>
                                <th className="text-right p-3 text-sm font-medium w-36">Base Value (₹)</th>
                                <th className="text-right p-3 text-sm font-medium w-32">GST/kW (₹)</th>
                                <th className="text-right p-3 text-sm font-medium w-24">GST %</th>
                                <th className="text-right p-3 text-sm font-medium w-36">GST Amount (₹)</th>
                                <th className="text-right p-3 text-sm font-medium w-40">Total Value (₹)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {solarProjects.map((project: any, originalIndex: number) => {
                                // Get the actual index in the full projects array
                                const index = projects.indexOf(project);
                                const systemKW = project.systemKW || 0;
                                const basePrice = project.basePrice || 0;
                                const gstAmount = project.gstAmount || 0;
                                const gstPercentage = project.gstPercentage || 18;
                                const projectValue = project.projectValue || 0;

                                // Use centralized rounding utility
                                const roundedSystemKW = roundSystemKW(systemKW);

                                // Calculate Rate/kW and GST/kW using ROUNDED systemKW
                                const calculatedRatePerKW = basePrice && roundedSystemKW > 0
                                  ? Math.round(basePrice / roundedSystemKW)
                                  : 0;

                                const calculatedGSTPerKW = gstAmount && roundedSystemKW > 0
                                  ? Math.round(gstAmount / roundedSystemKW)
                                  : 0;

                                // Generate default description if custom one doesn't exist
                                const defaultDescription = generateProjectDescription(project);
                                const description = project.customDescription || defaultDescription;

                                return (
                                  <tr key={index} className="border-t">
                                    <td className="p-3 text-sm">
                                      <Input
                                        type="text"
                                        value={description}
                                        onChange={(e) => {
                                          form.setValue(`projects.${index}.customDescription`, e.target.value);
                                        }}
                                        className="w-full min-w-[300px]"
                                        data-testid={`input-description-${index}`}
                                      />
                                    </td>
                                    <td className="p-3 text-center">
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={formatKWForDisplay(systemKW)}
                                        onChange={(e) => {
                                          const value = e.target.value;
                                          const newKW = value === '' ? 0 : (parseFloat(value) || 0);
                                          const newRoundedKW = roundSystemKW(newKW);
                                          const newBasePrice = Math.round(newRoundedKW * calculatedRatePerKW);
                                          const newGSTAmount = Math.round(newBasePrice * (gstPercentage / 100));
                                          const newProjectValue = newBasePrice + newGSTAmount;

                                          // Recalculate subsidy based on new kW
                                          const propertyType = getPropertyType();
                                          const newSubsidy = calculateSubsidy(newKW, propertyType, project.projectType);
                                          const newCustomerPayment = newProjectValue - newSubsidy;

                                          // Update description if user hasn't customized it
                                          if (!project.customDescription) {
                                            const updatedProject = { ...project, systemKW: newKW };
                                            const newDescription = generateProjectDescription(updatedProject);
                                            form.setValue(`projects.${index}.customDescription`, newDescription);
                                          }

                                          form.setValue(`projects.${index}.systemKW`, newKW);
                                          form.setValue(`projects.${index}.basePrice`, newBasePrice);
                                          form.setValue(`projects.${index}.gstAmount`, newGSTAmount);
                                          form.setValue(`projects.${index}.projectValue`, newProjectValue);
                                          form.setValue(`projects.${index}.subsidyAmount`, newSubsidy);
                                          form.setValue(`projects.${index}.customerPayment`, newCustomerPayment);
                                        }}
                                        onBlur={(e) => {
                                          if (e.target.value === '') {
                                            form.setValue(`projects.${index}.systemKW`, 0);
                                          }
                                        }}
                                        className="w-20 text-center"
                                        data-testid={`input-systemkw-${index}`}
                                      />
                                    </td>
                                    <td className="p-3 text-right">
                                      <Input
                                        type="number"
                                        value={calculatedRatePerKW}
                                        onChange={(e) => {
                                          const value = e.target.value;
                                          const newPricePerKW = value === '' ? 0 : (isNaN(parseFloat(value)) ? 0 : parseFloat(value));
                                          const newBasePrice = Math.round(roundedSystemKW * newPricePerKW);
                                          const newGSTAmount = Math.round(newBasePrice * (gstPercentage / 100));
                                          const newProjectValue = newBasePrice + newGSTAmount;

                                          // Recalculate subsidy (subsidy doesn't change with price, only with kW)
                                          const propertyType = getPropertyType();
                                          const newSubsidy = calculateSubsidy(systemKW, propertyType, project.projectType);
                                          const newCustomerPayment = newProjectValue - newSubsidy;

                                          form.setValue(`projects.${index}.pricePerKW`, newPricePerKW);
                                          form.setValue(`projects.${index}.basePrice`, newBasePrice);
                                          form.setValue(`projects.${index}.gstAmount`, newGSTAmount);
                                          form.setValue(`projects.${index}.projectValue`, newProjectValue);
                                          form.setValue(`projects.${index}.subsidyAmount`, newSubsidy);
                                          form.setValue(`projects.${index}.customerPayment`, newCustomerPayment);
                                        }}
                                        onBlur={(e) => {
                                          if (e.target.value === '') {
                                            form.setValue(`projects.${index}.pricePerKW`, 0);
                                          }
                                        }}
                                        className="w-28 text-right"
                                        data-testid={`input-priceperkw-${index}`}
                                      />
                                    </td>
                                    <td className="p-3 text-right font-medium">
                                      ₹{basePrice.toLocaleString()}
                                    </td>
                                    <td className="p-3 text-right">
                                      <span className="text-sm">{calculatedGSTPerKW.toLocaleString()}</span>
                                    </td>
                                    <td className="p-3 text-right">
                                      <Input
                                        type="number"
                                        value={gstPercentage}
                                        onChange={(e) => {
                                          const value = e.target.value;
                                          const newGSTPercentage = value === '' ? 0 : (isNaN(parseFloat(value)) ? 0 : parseFloat(value));
                                          const newGSTAmount = Math.round(basePrice * (newGSTPercentage / 100));
                                          const newProjectValue = basePrice + newGSTAmount;

                                          // Recalculate subsidy (subsidy doesn't change with GST)
                                          const propertyType = getPropertyType();
                                          const newSubsidy = calculateSubsidy(systemKW, propertyType, project.projectType);
                                          const newCustomerPayment = newProjectValue - newSubsidy;

                                          form.setValue(`projects.${index}.gstPercentage`, newGSTPercentage);
                                          form.setValue(`projects.${index}.gstAmount`, newGSTAmount);
                                          form.setValue(`projects.${index}.projectValue`, newProjectValue);
                                          form.setValue(`projects.${index}.subsidyAmount`, newSubsidy);
                                          form.setValue(`projects.${index}.customerPayment`, newCustomerPayment);
                                        }}
                                        onBlur={(e) => {
                                          if (e.target.value === '') {
                                            form.setValue(`projects.${index}.gstPercentage`, BUSINESS_RULES.gst.percentage);
                                          }
                                        }}
                                        className="w-20 text-right"
                                        data-testid={`input-gstpercentage-${index}`}
                                      />
                                    </td>
                                    <td className="p-3 text-right font-medium">
                                      ₹{gstAmount.toLocaleString()}
                                    </td>
                                    <td className="p-3 text-right font-medium">
                                      ₹{projectValue.toLocaleString()}
                                    </td>
                                  </tr>
                                );
                              })}
                              <tr className="border-t-2 bg-muted/30">
                                <td colSpan={3} className="p-3 text-sm font-medium">Totals:</td>
                                <td className="p-3 text-right font-medium">₹{form.watch("totalSystemCost")?.toLocaleString()}</td>
                                <td colSpan={2} className="p-3 text-sm font-medium text-right">Total GST:</td>
                                <td className="p-3 text-right font-medium">₹{form.watch("totalGSTAmount")?.toLocaleString()}</td>
                                <td className="p-3 text-right font-medium">₹{form.watch("totalWithGST")?.toLocaleString()}</td>
                              </tr>
                              <tr className="border-t bg-primary/10">
                                <td colSpan={7} className="p-3 text-sm font-bold">Grand Total (Including GST):</td>
                                <td className="p-3 text-right font-bold text-lg text-primary">₹{form.watch("totalWithGST")?.toLocaleString()}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile/Tablet Card View (hidden on desktop) */}
                        <div className="lg:hidden space-y-4">
                          {solarProjects.map((project: any, originalIndex: number) => {
                            // Get the actual index in the full projects array
                            const index = projects.indexOf(project);
                            const systemKW = project.systemKW || 0;
                            const basePrice = project.basePrice || 0;
                            const gstAmount = project.gstAmount || 0;
                            const gstPercentage = project.gstPercentage || 18;
                            const projectValue = project.projectValue || 0;

                            const roundedSystemKW = roundSystemKW(systemKW);

                            const calculatedRatePerKW = basePrice && roundedSystemKW > 0
                              ? Math.round(basePrice / roundedSystemKW)
                              : 0;

                            const calculatedGSTPerKW = gstAmount && roundedSystemKW > 0
                              ? Math.round(gstAmount / roundedSystemKW)
                              : 0;

                            const defaultDescription = generateProjectDescription(project);
                            const description = project.customDescription || defaultDescription;

                            return (
                              <Card key={index} className="border-2" data-testid={`card-pricing-project-${index}`}>
                                <CardContent className="p-4 space-y-4">
                                  {/* Description */}
                                  <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Description</label>
                                    <Input
                                      type="text"
                                      value={description}
                                      onChange={(e) => {
                                        form.setValue(`projects.${index}.customDescription`, e.target.value);
                                      }}
                                      className="w-full"
                                      data-testid={`input-description-${index}`}
                                    />
                                  </div>

                                  {/* kW and Rate/kW */}
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                      <label className="text-xs font-medium text-muted-foreground">kW</label>
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={systemKW}
                                        onChange={(e) => {
                                          const value = e.target.value;
                                          const newKW = value === '' ? 0 : (parseFloat(value) || 0);
                                          const newRoundedKW = roundSystemKW(newKW);
                                          const newBasePrice = Math.round(newRoundedKW * calculatedRatePerKW);
                                          const newGSTAmount = Math.round(newBasePrice * (gstPercentage / 100));
                                          const newProjectValue = newBasePrice + newGSTAmount;

                                          const propertyType = getPropertyType();
                                          const newSubsidy = calculateSubsidy(newKW, propertyType, project.projectType);
                                          const newCustomerPayment = newProjectValue - newSubsidy;

                                          if (!project.customDescription) {
                                            const updatedProject = { ...project, systemKW: newKW };
                                            const newDescription = generateProjectDescription(updatedProject);
                                            form.setValue(`projects.${index}.customDescription`, newDescription);
                                          }

                                          form.setValue(`projects.${index}.systemKW`, newKW);
                                          form.setValue(`projects.${index}.basePrice`, newBasePrice);
                                          form.setValue(`projects.${index}.gstAmount`, newGSTAmount);
                                          form.setValue(`projects.${index}.projectValue`, newProjectValue);
                                          form.setValue(`projects.${index}.subsidyAmount`, newSubsidy);
                                          form.setValue(`projects.${index}.customerPayment`, newCustomerPayment);
                                        }}
                                        onBlur={(e) => {
                                          if (e.target.value === '') {
                                            form.setValue(`projects.${index}.systemKW`, 0);
                                          }
                                        }}
                                        className="w-full"
                                        data-testid={`input-systemkw-${index}`}
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <label className="text-xs font-medium text-muted-foreground">Rate/kW (₹)</label>
                                      <Input
                                        type="number"
                                        value={calculatedRatePerKW}
                                        onChange={(e) => {
                                          const value = e.target.value;
                                          const newPricePerKW = value === '' ? 0 : (isNaN(parseFloat(value)) ? 0 : parseFloat(value));
                                          const newBasePrice = Math.round(roundedSystemKW * newPricePerKW);
                                          const newGSTAmount = Math.round(newBasePrice * (gstPercentage / 100));
                                          const newProjectValue = newBasePrice + newGSTAmount;

                                          const propertyType = getPropertyType();
                                          const newSubsidy = calculateSubsidy(systemKW, propertyType, project.projectType);
                                          const newCustomerPayment = newProjectValue - newSubsidy;

                                          form.setValue(`projects.${index}.pricePerKW`, newPricePerKW);
                                          form.setValue(`projects.${index}.basePrice`, newBasePrice);
                                          form.setValue(`projects.${index}.gstAmount`, newGSTAmount);
                                          form.setValue(`projects.${index}.projectValue`, newProjectValue);
                                          form.setValue(`projects.${index}.subsidyAmount`, newSubsidy);
                                          form.setValue(`projects.${index}.customerPayment`, newCustomerPayment);
                                        }}
                                        onBlur={(e) => {
                                          if (e.target.value === '') {
                                            form.setValue(`projects.${index}.pricePerKW`, 0);
                                          }
                                        }}
                                        className="w-full"
                                        data-testid={`input-priceperkw-${index}`}
                                      />
                                    </div>
                                  </div>

                                  {/* Base Value */}
                                  <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Base Value (₹)</label>
                                    <div className="p-2 bg-muted rounded-md font-medium">₹{basePrice.toLocaleString()}</div>
                                  </div>

                                  {/* GST Details */}
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                      <label className="text-xs font-medium text-muted-foreground">GST %</label>
                                      <Input
                                        type="number"
                                        value={gstPercentage}
                                        onChange={(e) => {
                                          const value = e.target.value;
                                          const newGSTPercentage = value === '' ? 0 : (isNaN(parseFloat(value)) ? 0 : parseFloat(value));
                                          const newGSTAmount = Math.round(basePrice * (newGSTPercentage / 100));
                                          const newProjectValue = basePrice + newGSTAmount;

                                          const propertyType = getPropertyType();
                                          const newSubsidy = calculateSubsidy(systemKW, propertyType, project.projectType);
                                          const newCustomerPayment = newProjectValue - newSubsidy;

                                          form.setValue(`projects.${index}.gstPercentage`, newGSTPercentage);
                                          form.setValue(`projects.${index}.gstAmount`, newGSTAmount);
                                          form.setValue(`projects.${index}.projectValue`, newProjectValue);
                                          form.setValue(`projects.${index}.subsidyAmount`, newSubsidy);
                                          form.setValue(`projects.${index}.customerPayment`, newCustomerPayment);
                                        }}
                                        onBlur={(e) => {
                                          if (e.target.value === '') {
                                            form.setValue(`projects.${index}.gstPercentage`, BUSINESS_RULES.gst.percentage);
                                          }
                                        }}
                                        className="w-full"
                                        data-testid={`input-gstpercentage-${index}`}
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <label className="text-xs font-medium text-muted-foreground">GST/kW (₹)</label>
                                      <div className="p-2 bg-muted rounded-md text-sm">{calculatedGSTPerKW.toLocaleString()}</div>
                                    </div>
                                  </div>

                                  {/* GST Amount */}
                                  <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">GST Amount (₹)</label>
                                    <div className="p-2 bg-muted rounded-md font-medium">₹{gstAmount.toLocaleString()}</div>
                                  </div>

                                  {/* Total Value */}
                                  <div className="space-y-2 pt-2 border-t">
                                    <label className="text-xs font-medium text-muted-foreground">Total Value (₹)</label>
                                    <div className="p-3 bg-primary/10 rounded-md font-bold text-lg text-primary">₹{projectValue.toLocaleString()}</div>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}

                          {/* Totals Card for Mobile */}
                          <Card className="border-2 bg-primary/5">
                            <CardContent className="p-4 space-y-3">
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-medium">Total System Cost:</span>
                                <span className="font-bold">₹{form.watch("totalSystemCost")?.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-medium">Total GST:</span>
                                <span className="font-bold">₹{form.watch("totalGSTAmount")?.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between items-center pt-3 border-t-2">
                                <span className="text-base font-bold">Grand Total (Including GST):</span>
                                <span className="font-bold text-lg text-primary">₹{form.watch("totalWithGST")?.toLocaleString()}</span>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                        <div className="text-sm font-bold">
                          Amount in words: <span className="font-bold">Rupees {(() => {
                            const amount = Math.floor(form.watch("totalWithGST") || 0);

                            const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
                            const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
                            const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

                            const convertTwoDigit = (num: number): string => {
                              if (num === 0) return "";
                              if (num < 10) return ones[num];
                              if (num < 20) return teens[num - 10];
                              const tenDigit = Math.floor(num / 10);
                              const oneDigit = num % 10;
                              return tens[tenDigit] + (oneDigit > 0 ? " " + ones[oneDigit] : "");
                            };

                            if (amount === 0) return "Zero Only";

                            const crores = Math.floor(amount / 10000000);
                            const lakhs = Math.floor((amount % 10000000) / 100000);
                            const thousands = Math.floor((amount % 100000) / 1000);
                            const hundreds = Math.floor((amount % 1000) / 100);
                            const remainder = amount % 100;

                            let result = "";
                            if (crores > 0) result += convertTwoDigit(crores) + " Crore" + (crores > 1 ? "s" : "") + " ";
                            if (lakhs > 0) result += convertTwoDigit(lakhs) + " Lakh" + (lakhs > 1 ? "s" : "") + " ";
                            if (thousands > 0) result += convertTwoDigit(thousands) + " Thousand ";
                            if (hundreds > 0) result += ones[hundreds] + " Hundred ";
                            if (remainder > 0) result += convertTwoDigit(remainder) + " ";

                            return result.trim() + " Only";
                          })()}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Warranty Details - Hidden for service-only quotations (water heater and water pump) */}
                  {!isServiceOnlyQuotation && (() => {
                    // Check project types in quotation
                    const projects = form.watch("projects") || [];
                    const hasOffGrid = projects.some((p: any) => p.projectType === 'off_grid');
                    const hasHybrid = projects.some((p: any) => p.projectType === 'hybrid');

                    return (
                      <div className="space-y-3 p-4 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                        <h4 className="font-medium text-base flex items-center gap-2">
                          <Info className="h-4 w-4" />
                          Warranty Details
                        </h4>
                        <div className="text-sm space-y-2">
                          <p className="font-medium text-yellow-800 dark:text-yellow-200">***Physical Damages will not be Covered***</p>

                          {hasOffGrid ? (
                            // Off-Grid warranties
                            <>
                              <div className="space-y-1">
                                <p className="font-semibold">1. Solar (PV)Panel Modules (10-15 Years)</p>
                                <ul className="list-disc list-inside ml-4 space-y-0.5 text-muted-foreground">
                                  <li>10 Years Manufacturing defect Warranty</li>
                                  <li>15 Years performance Warranty</li>
                                  <li>90% Performance Warranty till the end of 10 years</li>
                                  <li>80% Performance Warranty till the end of 15 years</li>
                                </ul>
                              </div>
                              <div className="space-y-1">
                                <p className="font-semibold">2. Solar Off grid Inverter (2 Years)</p>
                                <ul className="list-disc list-inside ml-4 space-y-0.5 text-muted-foreground">
                                  <li>Replacement Warranty for 2 Years</li>
                                </ul>
                              </div>
                              <div className="space-y-1">
                                <p className="font-semibold">3. Solar Battery (5 Years)</p>
                                <ul className="list-disc list-inside ml-4 space-y-0.5 text-muted-foreground">
                                  <li>Replacement Warranty for 5 Years</li>
                                </ul>
                              </div>
                            </>
                          ) : hasHybrid ? (
                            // Hybrid warranties
                            <>
                              <div className="space-y-1">
                                <p className="font-semibold">1. Solar (PV)Panel Modules (30 Years)</p>
                                <ul className="list-disc list-inside ml-4 space-y-0.5 text-muted-foreground">
                                  <li>15 Years Manufacturing defect Warranty</li>
                                  <li>15 Years performance Warranty</li>
                                  <li>90% Performance Warranty till the end of 15 years</li>
                                  <li>80% Performance Warranty till the end of 15 years</li>
                                </ul>
                              </div>
                              <div className="space-y-1">
                                <p className="font-semibold">2. Solar Hybrid Inverter (5 Years)</p>
                                <ul className="list-disc list-inside ml-4 space-y-0.5 text-muted-foreground">
                                  <li>Warranty for 5 Years</li>
                                </ul>
                              </div>
                              <div className="space-y-1">
                                <p className="font-semibold">3. Solar Battery (5 Years)</p>
                                <ul className="list-disc list-inside ml-4 space-y-0.5 text-muted-foreground">
                                  <li>Replacement Warranty for 3 Years</li>
                                  <li>Service Warranty for 2 years</li>
                                </ul>
                              </div>
                            </>
                          ) : (
                            // On-Grid warranties
                            <>
                              <div className="space-y-1">
                                <p className="font-semibold">1. Solar (PV) Panel Modules (30 Years)</p>
                                <ul className="list-disc list-inside ml-4 space-y-0.5 text-muted-foreground">
                                  <li>15 Years Manufacturing defect Warranty</li>
                                  <li>15 Years Service Warranty</li>
                                  <li>90% Performance Warranty till the end of 15 years</li>
                                  <li>80% Performance Warranty till the end of 15 years</li>
                                </ul>
                              </div>
                              <div className="space-y-1">
                                <p className="font-semibold">2. Solar On grid Inverter (15 Years)</p>
                                <ul className="list-disc list-inside ml-4 space-y-0.5 text-muted-foreground">
                                  <li>Replacement Warranty for 10 Years</li>
                                  <li>Service Warranty for 5 Years</li>
                                </ul>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Payment Details */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Payment Terms */}
                    <div className="space-y-4">
                      <h4 className="font-medium text-base">Payment Details</h4>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <FormField
                            control={form.control}
                            name="advancePaymentPercentage"
                            render={({ field }) => (
                              <FormItem className="flex-1">
                                <FormLabel>Advance Percentage</FormLabel>
                                <FormControl>
                                  <div className="flex items-center gap-2">
                                    <Input
                                      type="number"
                                      min="0"
                                      max="100"
                                      {...field}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        const percentage = value === '' ? '' : (isNaN(parseFloat(value)) ? 0 : parseFloat(value));
                                        field.onChange(percentage);
                                        const totalCustomerPayment = form.watch("totalCustomerPayment") || 0;
                                        const advanceAmount = Math.round(totalCustomerPayment * ((percentage === '' ? 0 : percentage) / 100));
                                        const balanceAmount = totalCustomerPayment - advanceAmount;
                                        form.setValue("advanceAmount", advanceAmount);
                                        form.setValue("balanceAmount", balanceAmount);
                                      }}
                                      onBlur={(e) => {
                                        if (e.target.value === '') {
                                          field.onChange(90);
                                          const totalCustomerPayment = form.watch("totalCustomerPayment") || 0;
                                          const advanceAmount = Math.round(totalCustomerPayment * 0.9);
                                          const balanceAmount = totalCustomerPayment - advanceAmount;
                                          form.setValue("advanceAmount", advanceAmount);
                                          form.setValue("balanceAmount", balanceAmount);
                                        }
                                      }}
                                      className="w-24"
                                      data-testid="input-advance-percentage"
                                    />
                                    <span className="text-sm">%</span>
                                    <span className="text-sm text-muted-foreground flex-1 text-right">₹{form.watch("advanceAmount")?.toLocaleString() || 0}</span>
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {form.watch("advancePaymentPercentage")}% Advance along with Purchase Order
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <p className="text-sm font-medium mb-2">Balance Percentage</p>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                value={100 - (form.watch("advancePaymentPercentage") || 0)}
                                disabled
                                className="w-24"
                                data-testid="input-balance-percentage"
                              />
                              <span className="text-sm">%</span>
                              <span className="text-sm text-muted-foreground flex-1 text-right">₹{form.watch("balanceAmount")?.toLocaleString() || 0}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {100 - (form.watch("advancePaymentPercentage") || 0)}% Immediately after completion of work
                        </div>
                      </div>
                    </div>

                    {/* Bank Details */}
                    <div className="space-y-4">
                      <h4 className="font-medium text-base">Payment Account Details</h4>
                      <div className="space-y-3">
                        <FormField
                          control={form.control}
                          name="accountDetails.bankName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Select Bank</FormLabel>
                              <Select
                                onValueChange={(value) => {
                                  field.onChange(value);
                                  if (value === "ICICI") {
                                    form.setValue("accountDetails.branch", "Subramanipuram, Madurai");
                                    form.setValue("accountDetails.accountNumber", "601305021400");
                                    form.setValue("accountDetails.ifscCode", "ICIC0006013");
                                  } else if (value === "Axis Bank") {
                                    form.setValue("accountDetails.branch", "Madurai Main");
                                    form.setValue("accountDetails.accountNumber", "924020033201767");
                                    form.setValue("accountDetails.ifscCode", "UTIB0000109");
                                  }
                                }}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="select-bank">
                                    <SelectValue placeholder="Select bank" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="ICICI">ICICI</SelectItem>
                                  <SelectItem value="Axis Bank">Axis Bank</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <tbody>
                              <tr className="border-b">
                                <td className="p-2 font-medium bg-muted">Name</td>
                                <td className="p-2">Godiva Solar</td>
                              </tr>
                              <tr className="border-b">
                                <td className="p-2 font-medium bg-muted">Bank</td>
                                <td className="p-2">{form.watch("accountDetails.bankName") || "ICICI"}</td>
                              </tr>
                              <tr className="border-b">
                                <td className="p-2 font-medium bg-muted">Branch</td>
                                <td className="p-2">{form.watch("accountDetails.branch") || "Subramaniapuram,Madurai"}</td>
                              </tr>
                              <tr className="border-b">
                                <td className="p-2 font-medium bg-muted">Acct No</td>
                                <td className="p-2">{form.watch("accountDetails.accountNumber") || "60130521400"}</td>
                              </tr>
                              <tr>
                                <td className="p-2 font-medium bg-muted">IFS Code</td>
                                <td className="p-2">{form.watch("accountDetails.ifscCode") || "ICIC0006013"}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Delivery Period - Hidden for service-only quotations */}
                  {!isServiceOnlyQuotation && (
                    <div className="space-y-3">
                      <h4 className="font-medium text-base">Delivery Period</h4>
                      <FormField
                        control={form.control}
                        name="deliveryTimeframe"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Delivery Timeframe</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-delivery-timeframe" className="max-w-xs">
                                  <SelectValue placeholder="Select delivery timeframe" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="1_2_weeks">1-2 weeks from confirmation</SelectItem>
                                <SelectItem value="2_3_weeks">2-3 weeks from confirmation</SelectItem>
                                <SelectItem value="3_4_weeks">3-4 weeks from confirmation</SelectItem>
                                <SelectItem value="1_month">1 month from confirmation</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <p className="text-sm text-muted-foreground">
                        • {form.watch("deliveryTimeframe")?.replace(/_/g, '-') || '2-3 weeks'} from the date of confirmation of order
                      </p>
                    </div>
                  )}

                  {/* Additional Notes */}
                  <div className="space-y-4">
                    <h4 className="font-medium">Additional Information</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="internalNotes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Internal Notes</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Notes for internal team (not visible to customer)"
                                className="min-h-[80px]"
                                data-testid="textarea-internal-notes"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="customerNotes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Customer Notes</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Special instructions or notes for customer"
                                className="min-h-[80px]"
                                data-testid="textarea-customer-notes"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 4: Review & Submit */}
            {currentStep === 4 && (
              <Card data-testid="card-review-submit">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Review & Submit
                  </CardTitle>
                  <CardDescription>
                    Final review before creating the quotation
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 sm:space-y-6">
                  {/* Summary - Hidden for service-only quotations */}
                  {!isServiceOnlyQuotation && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                      <div className="space-y-3 sm:space-y-4">
                        <h4 className="font-medium text-sm sm:text-base">Quotation Summary</h4>
                        <div className="space-y-2 text-xs sm:text-sm">
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-muted-foreground">Source:</span>
                            <Badge variant="outline" className="text-xs">
                              {quotationSource === "site_visit" ? "Site Visit" : "Manual"}
                            </Badge>
                          </div>
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-muted-foreground">Projects:</span>
                            <span className="font-medium">{form.watch("projects").length} system(s)</span>
                          </div>
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-muted-foreground">Total Value:</span>
                            <span className="font-medium">₹{form.watch("totalWithGST")?.toLocaleString() || 0}</span>
                          </div>
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-muted-foreground">Delivery:</span>
                            <span className="font-medium">{form.watch("deliveryTimeframe")?.replace('_', '-') || 'TBD'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Customer EB Details - Display Only */}
                  {(form.watch("customerData")?.tariffCode || form.watch("customerData")?.ebSanctionPhase || form.watch("customerData")?.ebSanctionKW) && (
                    <div className="space-y-3 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <h4 className="font-medium text-sm sm:text-base">EB Sanction Details</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        {form.watch("customerData")?.tariffCode && (
                          <div>
                            <p className="text-muted-foreground mb-1">Tariff Code</p>
                            <p className="font-medium">{form.watch("customerData")?.tariffCode}</p>
                          </div>
                        )}
                        {form.watch("customerData")?.ebSanctionPhase && (
                          <div>
                            <p className="text-muted-foreground mb-1">Load Phase</p>
                            <p className="font-medium">{form.watch("customerData")?.ebSanctionPhase === '1_phase' ? '1 Phase' : '3 Phase'}</p>
                          </div>
                        )}
                        {form.watch("customerData")?.ebSanctionKW && (
                          <div>
                            <p className="text-muted-foreground mb-1">Sanction Load</p>
                            <p className="font-medium">{form.watch("customerData")?.ebSanctionKW} KW</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Prepared By & Contact Details - Editable Fields */}
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm sm:text-base">Quotation Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="preparedBy"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Prepared By</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter name of person preparing quotation"
                                data-testid="input-prepared-by"
                                {...field}
                                value={field.value || ""}
                              />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              This name will appear as "Prepared by" in the quotation PDF.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="refName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Ref Name</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Ref name"
                                data-testid="input-ref-name"
                                {...field}
                                value={field.value || ""}
                              />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              Name for "Ref: Discussion with" in PDF. Defaults to Prepared By if left empty.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="contactPerson"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contact Person</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Godiva Solar Management"
                                data-testid="input-contact-person"
                                {...field}
                              />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              Name of contact person. Defaults to "Godiva Solar Management" if left empty.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="contactNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contact Number</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="+91 99949 01500"
                                data-testid="input-contact-number"
                                {...field}
                              />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              Contact number for quotation. Defaults to "+91 99949 01500" if left empty.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Scope of Work */}
                  <div className="space-y-4 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-base">Scope of Work</h4>
                      <Badge variant="outline" className="text-xs">Company Responsibility</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Click on any item to edit. Items shown are marked as company scope.</p>

                    {form.watch("projects").map((project: any, projectIndex: number) => {
                      const items = companyScopeItems[projectIndex] || [];

                      return items.length > 0 ? (
                        <div key={projectIndex} className="space-y-3">
                          {projectIndex > 0 && <Separator className="my-3" />}

                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">
                                Project {projectIndex + 1}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {project.projectType === 'on_grid' ? 'On-Grid Solar' :
                                  project.projectType === 'off_grid' ? 'Off-Grid Solar' :
                                    project.projectType === 'hybrid' ? 'Hybrid Solar' :
                                      project.projectType === 'water_heater' ? 'Solar Water Heater' :
                                        project.projectType === 'water_pump' ? 'Solar Water Pump' : project.projectType}
                              </span>
                            </div>

                            <ul className="space-y-2 text-sm">
                              {items.map((item, itemIndex) => (
                                <li key={itemIndex} className="flex items-start gap-2 group">
                                  <span className="text-muted-foreground mt-0.5">•</span>
                                  {editingCompanyScope?.projectIndex === projectIndex && editingCompanyScope?.itemIndex === itemIndex ? (
                                    <Input
                                      value={item}
                                      onChange={(e) => {
                                        const newItems = [...items];
                                        newItems[itemIndex] = e.target.value;
                                        setCompanyScopeItems(prev => ({ ...prev, [projectIndex]: newItems }));
                                      }}
                                      onBlur={() => setEditingCompanyScope(null)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          setEditingCompanyScope(null);
                                        }
                                        if (e.key === 'Escape') {
                                          setEditingCompanyScope(null);
                                        }
                                      }}
                                      autoFocus
                                      className="flex-1 text-sm"
                                    />
                                  ) : (
                                    <>
                                      <span className="flex-1">{item}</span>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => setEditingCompanyScope({ projectIndex, itemIndex })}
                                      >
                                        <Edit2 className="h-3 w-3" />
                                      </Button>
                                    </>
                                  )}
                                </li>
                              ))}
                            </ul>

                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-xs mt-2"
                              onClick={() => {
                                const newItems = [...(companyScopeItems[projectIndex] || []), 'New scope item'];
                                setCompanyScopeItems(prev => ({ ...prev, [projectIndex]: newItems }));
                                setEditingCompanyScope({ projectIndex, itemIndex: newItems.length - 1 });
                              }}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add Item
                            </Button>
                          </div>
                        </div>
                      ) : null;
                    })}
                  </div>

                  {/* Customer's Scope of Work */}
                  <div className="space-y-4 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-base">Customer's Scope of Work</h4>
                      <Badge variant="outline" className="text-xs">Customer Responsibility</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Click on any item to edit. Items shown are marked as customer scope.</p>

                    {form.watch("projects").map((project: any, projectIndex: number) => {
                      const items = customerScopeItems[projectIndex] || [];

                      return items.length > 0 ? (
                        <div key={projectIndex} className="space-y-3">
                          {projectIndex > 0 && <Separator className="my-3" />}

                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">
                                Project {projectIndex + 1}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {project.projectType === 'on_grid' ? 'On-Grid Solar' :
                                  project.projectType === 'off_grid' ? 'Off-Grid Solar' :
                                    project.projectType === 'hybrid' ? 'Hybrid Solar' :
                                      project.projectType === 'water_heater' ? 'Solar Water Heater' :
                                        project.projectType === 'water_pump' ? 'Solar Water Pump' : project.projectType}
                              </span>
                            </div>

                            <ul className="space-y-2 text-sm">
                              {items.map((item, itemIndex) => (
                                <li key={itemIndex} className="flex items-start gap-2 group">
                                  <span className="text-muted-foreground mt-0.5">•</span>
                                  {editingCustomerScope?.projectIndex === projectIndex && editingCustomerScope?.itemIndex === itemIndex ? (
                                    <Input
                                      value={item}
                                      onChange={(e) => {
                                        const newItems = [...items];
                                        newItems[itemIndex] = e.target.value;
                                        setCustomerScopeItems(prev => ({ ...prev, [projectIndex]: newItems }));
                                      }}
                                      onBlur={() => setEditingCustomerScope(null)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          setEditingCustomerScope(null);
                                        }
                                        if (e.key === 'Escape') {
                                          setEditingCustomerScope(null);
                                        }
                                      }}
                                      autoFocus
                                      className="flex-1 text-sm"
                                    />
                                  ) : (
                                    <>
                                      <span className="flex-1">{item}</span>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => setEditingCustomerScope({ projectIndex, itemIndex })}
                                      >
                                        <Edit2 className="h-3 w-3" />
                                      </Button>
                                    </>
                                  )}
                                </li>
                              ))}
                            </ul>

                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-xs mt-2"
                              onClick={() => {
                                const newItems = [...(customerScopeItems[projectIndex] || []), 'New scope item'];
                                setCustomerScopeItems(prev => ({ ...prev, [projectIndex]: newItems }));
                                setEditingCustomerScope({ projectIndex, itemIndex: newItems.length - 1 });
                              }}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add Item
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div key={projectIndex} className="text-sm text-muted-foreground italic">
                          No customer scope items for Project {projectIndex + 1}. All work is company's responsibility.
                        </div>
                      );
                    })}
                  </div>

                  {/* Bill of Materials Preview */}
                  <div className="space-y-4 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-base flex items-center gap-2">
                        <Table className="h-5 w-5" />
                        Bill of Materials (BOM)
                      </h4>
                      {bomItems.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {bomItems.length} items
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Review and edit the bill of materials before generating the quotation. Click on any field to edit.
                    </p>

                    {isFetchingBom ? (
                      <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <span className="ml-2 text-sm">Loading BOM...</span>
                      </div>
                    ) : bomItems.length > 0 ? (
                      (() => {
                        // Check if all projects are water utilities (water heater/pump)
                        const projects = form.watch("projects");
                        const isWaterUtilityOnly = projects && projects.length > 0 && projects.every((p: any) =>
                          p.projectType === 'water_heater' || p.projectType === 'water_pump'
                        );

                        return (
                          <div className="overflow-x-auto border rounded-lg">
                            <table className="w-full text-xs sm:text-sm">
                              <thead className="bg-green-100 dark:bg-green-900/30">
                                {isWaterUtilityOnly ? (
                                  // Simplified header for water utilities
                                  <tr>
                                    <th className="p-2 text-left border-r">Sl.No</th>
                                    <th className="p-2 text-left border-r">Description</th>
                                    <th className="p-2 text-right border-r">Price (₹)</th>
                                    <th className="p-2 text-center border-r">Qty</th>
                                    <th className="p-2 text-right border-r">Amount (₹)</th>
                                    <th className="p-2 text-left">Actions</th>
                                  </tr>
                                ) : (
                                  // Full header for solar projects
                                  <tr>
                                    <th className="p-2 text-left border-r">Sl.No</th>
                                    <th className="p-2 text-left border-r">Description</th>
                                    <th className="p-2 text-left border-r">Type</th>
                                    <th className="p-2 text-left border-r">Volt</th>
                                    <th className="p-2 text-left border-r">Rating</th>
                                    <th className="p-2 text-left border-r">Make</th>
                                    <th className="p-2 text-left border-r">Qty</th>
                                    <th className="p-2 text-left border-r">Unit</th>
                                    <th className="p-2 text-left">Actions</th>
                                  </tr>
                                )}
                              </thead>
                              <tbody>
                                {bomItems.map((item, index) => (
                                  <tr key={index} className="border-t hover:bg-green-50/50 dark:hover:bg-green-900/10">
                                    <td className="p-2 border-r">{item.slNo}</td>
                                    <td className="p-2 border-r">
                                      {editingBomItem === index ? (
                                        <Input
                                          value={item.description}
                                          onChange={(e) => {
                                            const updated = [...bomItems];
                                            updated[index].description = e.target.value;
                                            setBomItems(updated);
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              setEditingBomItem(null);
                                            }
                                          }}
                                          className="min-w-[200px]"
                                        />
                                      ) : (
                                        item.description
                                      )}
                                    </td>

                                    {isWaterUtilityOnly ? (
                                      // Simplified columns for water utilities
                                      <>
                                        <td className="p-2 border-r text-right">
                                          {editingBomItem === index ? (
                                            <Input
                                              type="number"
                                              value={(item as any).rate || 0}
                                              onChange={(e) => {
                                                const updated = [...bomItems];
                                                (updated[index] as any).rate = parseFloat(e.target.value) || 0;
                                                (updated[index] as any).amount = ((updated[index] as any).rate || 0) * (updated[index].qty || 0);
                                                setBomItems(updated);
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                  e.preventDefault();
                                                  setEditingBomItem(null);
                                                }
                                              }}
                                              className="min-w-[100px] text-right"
                                            />
                                          ) : (
                                            ((item as any).rate || 0).toLocaleString()
                                          )}
                                        </td>
                                        <td className="p-2 border-r text-center">
                                          {editingBomItem === index ? (
                                            <Input
                                              type="text"
                                              inputMode="numeric"
                                              value={item.qty}
                                              placeholder="-"
                                              onChange={(e) => {
                                                const updated = [...bomItems];
                                                updated[index].qty = e.target.value;
                                                (updated[index] as any).amount = (e.target.value === '-' || e.target.value === '') ? 0 : ((updated[index] as any).rate || 0) * (parseInt(e.target.value) || 0);
                                                setBomItems(updated);
                                              }}
                                              onBlur={(e) => {
                                                const updated = [...bomItems];
                                                const val = e.target.value === '-' || e.target.value === '' ? '-' : parseInt(e.target.value) || 0;
                                                updated[index].qty = val;
                                                (updated[index] as any).amount = (val === '-' || val === 0) ? 0 : ((updated[index] as any).rate || 0) * val;
                                                setBomItems(updated);
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                  e.preventDefault();
                                                  const updated = [...bomItems];
                                                  const val = (e.target as any).value === '-' || (e.target as any).value === '' ? '-' : parseInt((e.target as any).value) || 0;
                                                  updated[index].qty = val;
                                                  (updated[index] as any).amount = (val === '-' || val === 0) ? 0 : ((updated[index] as any).rate || 0) * val;
                                                  setBomItems(updated);
                                                  setEditingBomItem(null);
                                                }
                                              }}
                                              className="min-w-[80px] text-center"
                                            />
                                          ) : (
                                            item.qty
                                          )}
                                        </td>
                                        <td className="p-2 border-r text-right font-medium">
                                          ₹{((item as any).amount || 0).toLocaleString()}
                                        </td>
                                      </>
                                    ) : (
                                      // Full columns for solar projects
                                      <>
                                        <td className="p-2 border-r">
                                          {editingBomItem === index ? (
                                            <Input
                                              value={item.type}
                                              onChange={(e) => {
                                                const updated = [...bomItems];
                                                updated[index].type = e.target.value;
                                                setBomItems(updated);
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                  e.preventDefault();
                                                  setEditingBomItem(null);
                                                }
                                              }}
                                              className="min-w-[100px]"
                                            />
                                          ) : (
                                            item.type
                                          )}
                                        </td>
                                        <td className="p-2 border-r">
                                          {editingBomItem === index ? (
                                            <Input
                                              value={item.volt}
                                              onChange={(e) => {
                                                const updated = [...bomItems];
                                                updated[index].volt = e.target.value;
                                                setBomItems(updated);
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                  e.preventDefault();
                                                  setEditingBomItem(null);
                                                }
                                              }}
                                              className="min-w-[80px]"
                                            />
                                          ) : (
                                            item.volt
                                          )}
                                        </td>
                                        <td className="p-2 border-r">
                                          {editingBomItem === index ? (
                                            <Input
                                              value={item.rating}
                                              onChange={(e) => {
                                                const updated = [...bomItems];
                                                updated[index].rating = e.target.value;
                                                setBomItems(updated);
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                  e.preventDefault();
                                                  setEditingBomItem(null);
                                                }
                                              }}
                                              className="min-w-[100px]"
                                            />
                                          ) : (
                                            item.rating
                                          )}
                                        </td>
                                        <td className="p-2 border-r">
                                          {editingBomItem === index ? (
                                            <Input
                                              value={item.make}
                                              onChange={(e) => {
                                                const updated = [...bomItems];
                                                updated[index].make = e.target.value;
                                                setBomItems(updated);
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                  e.preventDefault();
                                                  setEditingBomItem(null);
                                                }
                                              }}
                                              className="min-w-[120px]"
                                            />
                                          ) : (
                                            item.make
                                          )}
                                        </td>
                                        <td className="p-2 border-r">
                                          {editingBomItem === index ? (
                                            <Input
                                              type="text"
                                              inputMode="numeric"
                                              value={item.qty}
                                              placeholder="-"
                                              onChange={(e) => {
                                                const updated = [...bomItems];
                                                updated[index].qty = e.target.value;
                                                setBomItems(updated);
                                              }}
                                              onBlur={(e) => {
                                                const updated = [...bomItems];
                                                const val = e.target.value === '-' || e.target.value === '' ? '-' : parseInt(e.target.value) || 0;
                                                updated[index].qty = val;
                                                setBomItems(updated);
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                  e.preventDefault();
                                                  const updated = [...bomItems];
                                                  const val = (e.target as any).value === '-' || (e.target as any).value === '' ? '-' : parseInt((e.target as any).value) || 0;
                                                  updated[index].qty = val;
                                                  setBomItems(updated);
                                                  setEditingBomItem(null);
                                                }
                                              }}
                                              className="min-w-[80px]"
                                            />
                                          ) : (
                                            item.qty
                                          )}
                                        </td>
                                        <td className="p-2 border-r">
                                          {editingBomItem === index ? (
                                            <Input
                                              value={item.unit}
                                              onChange={(e) => {
                                                const updated = [...bomItems];
                                                updated[index].unit = e.target.value;
                                                setBomItems(updated);
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                  e.preventDefault();
                                                  setEditingBomItem(null);
                                                }
                                              }}
                                              className="min-w-[80px]"
                                            />
                                          ) : (
                                            item.unit
                                          )}
                                        </td>
                                      </>
                                    )}

                                    {/* Actions column - common for both */}
                                    <td className="p-2">
                                      <div className="flex gap-1">
                                        {editingBomItem === index ? (
                                          <>
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => setEditingBomItem(null)}
                                              className="h-7 w-7 p-0"
                                            >
                                              <Save className="h-4 w-4 text-green-600" />
                                            </Button>
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => {
                                                setEditingBomItem(null);
                                                // Reload BOM to cancel changes (you can store original state if needed)
                                              }}
                                              className="h-7 w-7 p-0"
                                            >
                                              <X className="h-4 w-4 text-red-600" />
                                            </Button>
                                          </>
                                        ) : (
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setEditingBomItem(index)}
                                            className="h-7 w-7 p-0"
                                          >
                                            <Edit2 className="h-4 w-4" />
                                          </Button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="text-center p-8 text-muted-foreground">
                        <Table className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No BOM items available</p>
                      </div>
                    )}
                  </div>

                  {/* Documents Required - Hidden for service-only quotations */}
                  {!isServiceOnlyQuotation && (
                    <div className="space-y-4 p-4 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                      <h4 className="font-medium text-base">Documents Required for PM Surya Ghar</h4>
                      <div className="space-y-2 text-sm">
                        <ol className="list-decimal list-inside space-y-1">
                          <li>EB Number</li>
                          <li>EB Register Mobile Number</li>
                          <li>Email ID</li>
                          <li>Aadhar Card</li>
                          <li>PAN Card</li>
                          <li>Passport Size Photo -1</li>
                          <li>Property Tax Copy</li>
                          <li>Bank Passbook</li>
                          <li>Cancelled Cheque</li>
                        </ol>
                        <div className="mt-3 p-2 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded">
                          <p className="text-xs font-medium text-yellow-800 dark:text-yellow-200">
                            *All Required Documents should be in the same name as mention EB Service Number
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Warnings and Recommendations */}
                  {quotationSource === "site_visit" && siteVisitMapping && (
                    (siteVisitMapping as any).businessRuleWarnings?.length > 0 && (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          <div className="font-medium mb-2">Business Rule Warnings:</div>
                          <ul className="list-disc list-inside text-sm space-y-1">
                            {(siteVisitMapping as any).businessRuleWarnings.map((warning: string, index: number) => (
                              <li key={index}>{warning}</li>
                            ))}
                          </ul>
                        </AlertDescription>
                      </Alert>
                    )
                  )}

                  <Alert>
                    <Check className="h-4 w-4" />
                    <AlertDescription>
                      Ready to create quotation. The document will be generated with all specifications and can be sent to the customer.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            )}

            {/* Navigation buttons */}
            <div className="flex flex-col sm:flex-row justify-between gap-3 sm:gap-4 pt-4 pb-2 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={prevStep}
                disabled={currentStep === 0}
                data-testid="button-previous"
                className="w-full sm:w-auto order-2 sm:order-1"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Previous
              </Button>

              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 order-1 sm:order-2">
                {/* Show Preview PDF button on final step if in edit mode or quotationId exists */}
                {currentStep === WIZARD_STEPS.length - 1 && (isEditMode || quotationId) && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePreviewPDF}
                    disabled={isPreviewingPDF}
                    data-testid="button-preview-pdf"
                    className="w-full sm:w-auto"
                  >
                    {isPreviewingPDF ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Eye className="h-4 w-4 mr-2" />
                        Preview PDF
                      </>
                    )}
                  </Button>
                )}

                {currentStep === WIZARD_STEPS.length - 1 ? (
                  <Button
                    key="submit-button"
                    type="submit"
                    disabled={!canProceed() || createQuotationMutation.isPending}
                    data-testid="button-submit"
                    className="w-full sm:w-auto"
                  >
                    {createQuotationMutation.isPending
                      ? (isEditMode ? "Updating..." : "Creating...")
                      : (isEditMode ? "Update Quotation" : "Create Quotation")
                    }
                  </Button>
                ) : (
                  <Button
                    key="next-button"
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      nextStep();
                    }}
                    disabled={!canProceed()}
                    data-testid="button-next"
                    className="w-full sm:w-auto"
                  >
                    Next
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                )}
              </div>
            </div>
          </form>
        </Form>
      </div>

      {/* Exit Confirmation Dialog */}
      <AlertDialog open={showExitConfirmation} onOpenChange={setShowExitConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard Quotation?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. If you leave now, all your progress will be lost. Are you sure you want to exit?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-exit">
              Continue Editing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowExitConfirmation(false);
                setLocation("/quotations");
              }}
              data-testid="button-confirm-exit"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard & Exit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


/**
 * Site Visit Data Mapping Service for Quotation System
 * Implements comprehensive data mapping and analysis as specified in the directive
 */

import { storage } from "../storage";
import {
  QuotationProject,
  SiteVisitMapping,
  InsertQuotation,
  QuotationSource,
  QuotationStatus
} from "@shared/schema";

// Comprehensive field mapping matrix as defined in the directive
const FIELD_MAPPING_MATRIX = {
  // Critical fields - Must be present for quotation creation
  critical: [
    'customer.name',
    'customer.mobile',
    'customer.address',
    'marketingData.projectType',
    'visitOutcome' // Must be 'converted' for quotation creation
  ],

  // Important fields - Significantly impact quotation quality
  important: [
    'customer.propertyType',
    'customer.ebServiceNumber',
    'marketingData.onGridConfig.inverterKW',
    'marketingData.onGridConfig.panelCount',
    'marketingData.onGridConfig.projectValue',
    'marketingData.offGridConfig.inverterKW',
    'marketingData.offGridConfig.batteryCount',
    'marketingData.hybridConfig.inverterKW',
    'marketingData.waterHeaterConfig.litre',
    'marketingData.waterPumpConfig.hp',
    'technicalData.serviceTypes',
    'technicalData.workType',
    'adminData.bankProcess',
    'adminData.ebProcess'
  ],

  // Optional fields - Enhance quotation completeness
  optional: [
    'customer.location',
    'marketingData.onGridConfig.solarPanelMake',
    'marketingData.onGridConfig.inverterMake',
    'marketingData.onGridConfig.structureType',
    'marketingData.onGridConfig.civilWorkScope',
    'marketingData.onGridConfig.netMeterScope',
    'technicalData.teamMembers',
    'technicalData.description',
    'technicalData.pendingRemarks',
    'adminData.purchase',
    'adminData.driving',
    'sitePhotos',
    'siteInLocation',
    'siteOutLocation',
    'notes',
    'outcomeNotes',
    'scheduledFollowUpDate'
  ]
};

// Business rules from directive
const BUSINESS_RULES = {
  pricing: {
    onGridPerKW: 68000,    // ₹68,000 per kW for on-grid systems
    offGridPerKW: 85000,   // Updated rate for off-grid
    hybridPerKW: 95000     // Updated rate for hybrid
  },
  subsidy: {
    onGridPerKW: 26000,    // ₹26,000 per kW government subsidy
    hybridPerKW: 26000,    // Hybrid also gets subsidy
    offGridPerKW: 0,       // Off-grid doesn't get subsidy
    waterHeater: 0,        // Water heater doesn't get subsidy
    waterPump: 0           // Water pump doesn't get subsidy
  },
  payment: {
    advancePercentage: 90, // 90% advance payment
    balancePercentage: 10  // 10% balance after completion
  },
  delivery: {
    standardWeeks: "2_3_weeks" // 2-3 weeks delivery timeframe
  }
};

export interface CompletenessAnalysis {
  completenessScore: number;
  missingCriticalFields: string[];
  missingImportantFields: string[];
  missingOptionalFields: string[];
  canCreateQuotation: boolean;
  recommendedAction: 'ready_for_quotation' | 'collect_missing_data' | 'invalid_for_quotation';
  fieldCoverage: {
    critical: number;
    important: number;
    optional: number;
  };
  qualityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface MappingResult {
  quotationData: Partial<InsertQuotation>;
  mappingMetadata: SiteVisitMapping;
  completenessAnalysis: CompletenessAnalysis;
  businessRuleWarnings: string[];
  dataTransformations: Array<{
    field: string;
    originalValue: any;
    transformedValue: any;
    reason: string;
  }>;
  originalSiteVisitData?: {
    customer: any;
    visitInfo: {
      id: string;
      department: string;
      visitPurpose: string;
      status: string;
    };
  };
}

export class DataCompletenessAnalyzer {
  /**
   * Analyze site visit data completeness using comprehensive field matrix
   */
  static analyze(siteVisit: any): CompletenessAnalysis {
    const missing = {
      critical: [] as string[],
      important: [] as string[],
      optional: [] as string[]
    };

    // Check critical fields
    FIELD_MAPPING_MATRIX.critical.forEach(fieldPath => {
      if (!this.getNestedValue(siteVisit, fieldPath)) {
        missing.critical.push(fieldPath);
      }
    });

    // Check important fields
    FIELD_MAPPING_MATRIX.important.forEach(fieldPath => {
      if (!this.getNestedValue(siteVisit, fieldPath)) {
        missing.important.push(fieldPath);
      }
    });

    // Check optional fields
    FIELD_MAPPING_MATRIX.optional.forEach(fieldPath => {
      if (!this.getNestedValue(siteVisit, fieldPath)) {
        missing.optional.push(fieldPath);
      }
    });

    // Calculate field coverage percentages
    const fieldCoverage = {
      critical: Math.round(((FIELD_MAPPING_MATRIX.critical.length - missing.critical.length) / FIELD_MAPPING_MATRIX.critical.length) * 100),
      important: Math.round(((FIELD_MAPPING_MATRIX.important.length - missing.important.length) / FIELD_MAPPING_MATRIX.important.length) * 100),
      optional: Math.round(((FIELD_MAPPING_MATRIX.optional.length - missing.optional.length) / FIELD_MAPPING_MATRIX.optional.length) * 100)
    };

    // Calculate overall completeness score with weighted importance
    const weightedScore = (
      fieldCoverage.critical * 0.6 +  // Critical fields weight 60%
      fieldCoverage.important * 0.3 + // Important fields weight 30%
      fieldCoverage.optional * 0.1    // Optional fields weight 10%
    );

    // Determine quality grade
    let qualityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
    if (weightedScore >= 90) qualityGrade = 'A';
    else if (weightedScore >= 80) qualityGrade = 'B';
    else if (weightedScore >= 70) qualityGrade = 'C';
    else if (weightedScore >= 60) qualityGrade = 'D';
    else qualityGrade = 'F';

    // Determine if quotation can be created
    // Allow quotation creation in three scenarios:
    // 1. Traditional: All critical fields + converted outcome + completed status
    // 2. Marketing: Valid marketing project config + basic customer info (more flexible)
    // 3. Partial: Allow partial data and let user complete missing fields (most flexible)
    const hasValidMarketingConfig = this.hasValidMarketingProjectConfig(siteVisit);
    const hasBasicCustomerInfo = siteVisit.customer?.name && siteVisit.customer?.mobile && siteVisit.customer?.address;
    const hasAnyCustomerInfo = siteVisit.customer?.name || siteVisit.customer?.mobile; // At least name or mobile

    const canCreateQuotation = (
      // Traditional strict path
      (missing.critical.length === 0 &&
        siteVisit.visitOutcome === 'converted' &&
        siteVisit.status === 'completed') ||
      // Marketing flexible path - allow when marketing data is complete
      (hasValidMarketingConfig && hasBasicCustomerInfo) ||
      // Partial data path - allow even with minimal customer info (let user complete the rest)
      (hasAnyCustomerInfo && siteVisit.department === 'marketing')
    );

    // Determine recommended action - be more flexible
    let recommendedAction: 'ready_for_quotation' | 'collect_missing_data' | 'invalid_for_quotation';
    if (!canCreateQuotation) {
      if (!hasAnyCustomerInfo) {
        recommendedAction = 'invalid_for_quotation';
      } else {
        recommendedAction = 'collect_missing_data'; // Allow partial data completion
      }
    } else {
      recommendedAction = 'ready_for_quotation';
    }

    return {
      completenessScore: Math.round(weightedScore),
      missingCriticalFields: missing.critical,
      missingImportantFields: missing.important,
      missingOptionalFields: missing.optional,
      canCreateQuotation,
      recommendedAction,
      fieldCoverage,
      qualityGrade
    };
  }

  /**
   * Check if marketing data has valid project configurations
   * Now allows quotation creation when project type is selected, even with incomplete config
   */
  private static hasValidMarketingProjectConfig(siteVisit: any): boolean {
    const marketingData = siteVisit.marketingData;
    if (!marketingData) return false;

    // Allow quotation creation if project type is selected (more permissive)
    // The mapProjects function will handle creating default projects for incomplete configurations
    if (marketingData.projectType) {
      return true; // Project type selected - allow quotation creation
    }

    // Legacy: Check for complete configurations (kept for backward compatibility)
    switch (marketingData.projectType) {
      case 'on_grid':
        return marketingData.onGridConfig &&
          marketingData.onGridConfig.solarPanelMake &&
          marketingData.onGridConfig.solarPanelMake.length > 0 &&
          marketingData.onGridConfig.inverterMake &&
          marketingData.onGridConfig.inverterMake.length > 0 &&
          (marketingData.onGridConfig.panelCount || 0) > 0;

      case 'off_grid':
        return marketingData.offGridConfig &&
          marketingData.offGridConfig.solarPanelMake &&
          marketingData.offGridConfig.solarPanelMake.length > 0 &&
          marketingData.offGridConfig.inverterMake &&
          marketingData.offGridConfig.inverterMake.length > 0 &&
          marketingData.offGridConfig.batteryBrand &&
          (marketingData.offGridConfig.panelCount || 0) > 0;

      case 'hybrid':
        return marketingData.hybridConfig &&
          marketingData.hybridConfig.solarPanelMake &&
          marketingData.hybridConfig.solarPanelMake.length > 0 &&
          marketingData.hybridConfig.inverterMake &&
          marketingData.hybridConfig.inverterMake.length > 0 &&
          marketingData.hybridConfig.batteryBrand &&
          (marketingData.hybridConfig.panelCount || 0) > 0;

      case 'water_heater':
        return marketingData.waterHeaterConfig &&
          marketingData.waterHeaterConfig.brand &&
          (marketingData.waterHeaterConfig.litre || 0) > 0;

      case 'water_pump':
        return marketingData.waterPumpConfig &&
          marketingData.waterPumpConfig.hp &&
          marketingData.waterPumpConfig.panelBrand &&
          marketingData.waterPumpConfig.panelBrand.length > 0 &&
          (marketingData.waterPumpConfig.panelCount || 0) > 0;

      default:
        return false;
    }
  }

  /**
   * Helper function to safely get nested object values
   */
  private static getNestedValue(obj: any, path: string): any {
    if (!obj || !path) return undefined;

    return path.split('.').reduce((current, key) => {
      return current && typeof current === 'object' ? current[key] : undefined;
    }, obj);
  }
}

export class SiteVisitDataMapper {
  /**
   * Map site visit data to comprehensive quotation format
   */
  static async mapToQuotation(siteVisit: any, userId: string): Promise<MappingResult> {
    // Analyze data completeness first
    const completenessAnalysis = DataCompletenessAnalyzer.analyze(siteVisit);

    if (!completenessAnalysis.canCreateQuotation) {
      const error = new Error(`Site visit cannot be converted to quotation: ${completenessAnalysis.recommendedAction}`);
      (error as any).completenessAnalysis = completenessAnalysis;
      (error as any).validationError = true;
      throw error;
    }

    const warnings: string[] = [];
    const transformations: Array<{ field: string; originalValue: any; transformedValue: any; reason: string }> = [];

    // Generate unique quotation number with proper format
    const quotationNumber = await this.generateQuotationNumber();

    // Map customer data - ensure customer exists or create
    const customerId = await this.ensureCustomerExists(siteVisit.customer, transformations);

    // Map projects with comprehensive business rules
    const projects = await this.mapProjects(siteVisit.marketingData, warnings, transformations);

    if (projects.length === 0) {
      const error = new Error("No valid projects found in site visit marketing data");
      (error as any).projectValidationError = true;
      (error as any).recommendedAction = "update_marketing_data";
      (error as any).missingData = "project_configurations";
      (error as any).completenessAnalysis = completenessAnalysis; // Include completeness data
      (error as any).validationError = true; // Mark as validation error for consistent handling
      throw error;
    }

    // Calculate comprehensive pricing with business rules
    const pricingCalculation = this.calculatePricing(projects, warnings);

    // Prepare comprehensive mapping metadata 
    const mappingMetadata: SiteVisitMapping = {
      sourceVisitId: siteVisit.id,
      mappedAt: new Date(),
      mappedBy: userId,
      completenessScore: completenessAnalysis.completenessScore,
      missingCriticalFields: completenessAnalysis.missingCriticalFields,
      missingOptionalFields: completenessAnalysis.missingOptionalFields,
      dataQualityNotes: `Auto-mapped from site visit ${siteVisit.id}. Quality Grade: ${completenessAnalysis.qualityGrade}. Important fields missing: ${completenessAnalysis.missingImportantFields.length}. ${warnings.length > 0 ? `Warnings: ${warnings.join('; ')}` : 'No warnings.'}`
    };

    // Extract ALL attachments from site visit - photos, documents, etc.
    const attachments = this.extractAllAttachments(siteVisit);

    // Build comprehensive internal notes from ALL departments and data sources
    const comprehensiveInternalNotes = this.buildComprehensiveInternalNotes(siteVisit);

    // Build comprehensive quotation data with ALL site visit data preserved
    const quotationData: Partial<InsertQuotation> = {
      quotationNumber,
      customerId,
      source: "site_visit" as QuotationSource,
      siteVisitMapping: mappingMetadata,
      projects,
      totalSystemCost: pricingCalculation.totalSystemCost,
      totalSubsidyAmount: pricingCalculation.totalSubsidyAmount,
      totalCustomerPayment: pricingCalculation.totalCustomerPayment,
      advancePaymentPercentage: BUSINESS_RULES.payment.advancePercentage,
      advanceAmount: pricingCalculation.advanceAmount,
      balanceAmount: pricingCalculation.balanceAmount,
      paymentTerms: "advance_90_balance_10",
      deliveryTimeframe: "2_3_weeks" as const,
      termsTemplate: this.selectTermsTemplate(siteVisit.customer.propertyType),
      status: "draft" as QuotationStatus,
      followUps: [], // Default empty array, can be enhanced later with actual follow-up mapping
      communicationPreference: "whatsapp",
      documentVersion: 1,
      preparedBy: await this.getUserDisplayName(userId),
      internalNotes: comprehensiveInternalNotes,
      customerNotes: this.extractCustomerNotes(siteVisit),
      attachments // Now contains ALL photos and attachments from site visit
    };

    return {
      quotationData,
      mappingMetadata,
      completenessAnalysis,
      businessRuleWarnings: warnings,
      dataTransformations: transformations,
      // Include original site visit data for frontend access
      originalSiteVisitData: {
        customer: siteVisit.customer,
        visitInfo: {
          id: siteVisit.id,
          department: siteVisit.department,
          visitPurpose: siteVisit.visitPurpose,
          status: siteVisit.status
        }
      }
    };
  }

  /**
   * Generate properly formatted quotation number
   */
  private static async generateQuotationNumber(): Promise<string> {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `Q-${timestamp}-${randomSuffix}`;
  }

  /**
   * Ensure customer exists in system or create from site visit data
   */
  private static async ensureCustomerExists(customerData: any, transformations: any[]): Promise<string> {
    if (customerData.id) {
      return customerData.id;
    }

    // Create customer from site visit data
    const newCustomerData = {
      name: customerData.name,
      mobile: customerData.mobile,
      address: customerData.address,
      ebServiceNumber: customerData.ebServiceNumber,
      propertyType: customerData.propertyType,
      location: customerData.location,
      profileCompleteness: "full" as const,
      createdFrom: "site_visit" as const
    };

    transformations.push({
      field: 'customer',
      originalValue: 'site_visit_customer_data',
      transformedValue: 'new_customer_created',
      reason: 'Customer did not exist, created from site visit data'
    });

    const customer = await storage.createCustomer(newCustomerData);
    return customer.id;
  }

  /**
   * Map marketing data to project configurations with multi-project support
   */
  private static async mapProjects(marketingData: any, warnings: string[], transformations: any[]): Promise<QuotationProject[]> {
    const projects: QuotationProject[] = [];

    if (!marketingData) {
      warnings.push("No marketing data found");
      return projects;
    }


    // Support multi-project quotations by checking all possible project configurations
    // A single site visit can have multiple project types configured

    // Map on-grid project if configured - be more flexible with partial data
    if (marketingData.onGridConfig && (
      marketingData.onGridConfig.inverterKW ||
      marketingData.onGridConfig.solarPanelMake?.length > 0 ||
      marketingData.onGridConfig.inverterMake?.length > 0 ||
      marketingData.onGridConfig.panelCount ||
      marketingData.onGridConfig.projectValue ||
      marketingData.onGridConfig.structureType ||
      marketingData.onGridConfig.civilWorkScope ||
      marketingData.onGridConfig.netMeterScope
    )) {
      projects.push(this.mapOnGridProject(marketingData.onGridConfig, warnings, transformations));
      transformations.push({
        field: 'projects.on_grid',
        originalValue: 'site_visit_marketing_data',
        transformedValue: 'on_grid_project_config',
        reason: 'On-grid configuration found and mapped from detailed site visit data'
      });
    }

    // Map off-grid project if configured - be more flexible with partial data
    if (marketingData.offGridConfig && (
      marketingData.offGridConfig.inverterKW ||
      marketingData.offGridConfig.solarPanelMake?.length > 0 ||
      marketingData.offGridConfig.inverterMake?.length > 0 ||
      marketingData.offGridConfig.batteryCount ||
      marketingData.offGridConfig.projectValue ||
      marketingData.offGridConfig.structureType
    )) {
      projects.push(this.mapOffGridProject(marketingData.offGridConfig, warnings, transformations));
      transformations.push({
        field: 'projects.off_grid',
        originalValue: 'site_visit_marketing_data',
        transformedValue: 'off_grid_project_config',
        reason: 'Off-grid configuration found and mapped from detailed site visit data'
      });
    }

    // Map hybrid project if configured - be more flexible with partial data
    if (marketingData.hybridConfig && (
      marketingData.hybridConfig.inverterKW ||
      marketingData.hybridConfig.solarPanelMake?.length > 0 ||
      marketingData.hybridConfig.inverterMake?.length > 0 ||
      marketingData.hybridConfig.batteryCount ||
      marketingData.hybridConfig.projectValue ||
      marketingData.hybridConfig.structureType
    )) {
      projects.push(this.mapHybridProject(marketingData.hybridConfig, warnings, transformations));
      transformations.push({
        field: 'projects.hybrid',
        originalValue: 'site_visit_marketing_data',
        transformedValue: 'hybrid_project_config',
        reason: 'Hybrid configuration found and mapped from detailed site visit data'
      });
    }

    // Map water heater project if configured
    if (marketingData.waterHeaterConfig && marketingData.waterHeaterConfig.litre) {
      projects.push(this.mapWaterHeaterProject(marketingData.waterHeaterConfig, warnings, transformations));
      transformations.push({
        field: 'projects.water_heater',
        originalValue: 'site_visit_marketing_data',
        transformedValue: 'water_heater_project_config',
        reason: 'Water heater configuration found and mapped'
      });
    }

    // Map water pump project if configured
    if (marketingData.waterPumpConfig && marketingData.waterPumpConfig.hp) {
      projects.push(this.mapWaterPumpProject(marketingData.waterPumpConfig, warnings, transformations));
      transformations.push({
        field: 'projects.water_pump',
        originalValue: 'site_visit_marketing_data',
        transformedValue: 'water_pump_project_config',
        reason: 'Water pump configuration found and mapped'
      });
    }

    // Handle case where projectType is selected but detailed configuration is missing
    // This happens when marketing team starts form but doesn't complete all details
    if (projects.length === 0 && marketingData.projectType) {
      warnings.push(`Project type '${marketingData.projectType}' selected but detailed configuration missing. Creating default project.`);

      // Create default project based on selected project type
      switch (marketingData.projectType) {
        case 'on_grid':
          projects.push(this.mapOnGridProject({}, warnings, transformations));
          transformations.push({
            field: 'projects.on_grid_default',
            originalValue: 'incomplete_marketing_data',
            transformedValue: 'default_on_grid_project',
            reason: 'Default on-grid project created due to incomplete marketing data'
          });
          break;

        case 'off_grid':
          projects.push(this.mapOffGridProject({}, warnings, transformations));
          transformations.push({
            field: 'projects.off_grid_default',
            originalValue: 'incomplete_marketing_data',
            transformedValue: 'default_off_grid_project',
            reason: 'Default off-grid project created due to incomplete marketing data'
          });
          break;

        case 'hybrid':
          projects.push(this.mapHybridProject({}, warnings, transformations));
          transformations.push({
            field: 'projects.hybrid_default',
            originalValue: 'incomplete_marketing_data',
            transformedValue: 'default_hybrid_project',
            reason: 'Default hybrid project created due to incomplete marketing data'
          });
          break;

        case 'water_heater':
          projects.push(this.mapWaterHeaterProject({ litre: 100 }, warnings, transformations));
          transformations.push({
            field: 'projects.water_heater_default',
            originalValue: 'incomplete_marketing_data',
            transformedValue: 'default_water_heater_project',
            reason: 'Default water heater project created due to incomplete marketing data'
          });
          break;

        case 'water_pump':
          projects.push(this.mapWaterPumpProject({ hp: '1' }, warnings, transformations));
          transformations.push({
            field: 'projects.water_pump_default',
            originalValue: 'incomplete_marketing_data',
            transformedValue: 'default_water_pump_project',
            reason: 'Default water pump project created due to incomplete marketing data'
          });
          break;
      }
    }

    // Warn if no projects were found
    if (projects.length === 0) {
      warnings.push("No valid project configurations found in marketing data");
    } else {
      transformations.push({
        field: 'projects.total',
        originalValue: marketingData.projectType || 'unknown',
        transformedValue: `${projects.length}_projects_mapped`,
        reason: `Multi-project quotation created with ${projects.length} project(s)`
      });
    }

    return projects;
  }

  /**
   * Map on-grid solar project with business rules
   */
  private static mapOnGridProject(config: any, warnings: string[], transformations: any[]): QuotationProject {
    // Extract inverter KW from multiple possible sources
    let systemKW = config.inverterKW || 3;

    // If inverterKW is 0 or missing, try to extract from inverterWatts
    if (!systemKW || systemKW === 0) {
      if (config.inverterWatts) {
        // Extract number from strings like "5kw", "3kW", "5000w", etc.
        const wattsStr = config.inverterWatts.toString().toLowerCase();
        const match = wattsStr.match(/(\d+(?:\.\d+)?)\s*(?:kw|k)?/);
        if (match) {
          systemKW = parseFloat(match[1]);
          transformations.push({
            field: 'onGridConfig.inverterKW',
            originalValue: config.inverterWatts,
            transformedValue: systemKW,
            reason: `Extracted ${systemKW}kW from inverterWatts: ${config.inverterWatts}`
          });
        }
      }
    }

    // Final fallback to 3kW if still no valid value
    if (!systemKW || systemKW === 0) {
      systemKW = 3;
      transformations.push({
        field: 'onGridConfig.inverterKW',
        originalValue: config.inverterKW,
        transformedValue: 3,
        reason: 'Default 3kW system applied due to missing inverter capacity'
      });
    }

    const defaultPricePerKW = BUSINESS_RULES.pricing.onGridPerKW;
    const subsidyPerKW = BUSINESS_RULES.subsidy.onGridPerKW;

    // Calculate project value - use provided value or calculate from system size
    let projectValue = config.projectValue;
    if (!projectValue || projectValue === 0) {
      projectValue = systemKW * defaultPricePerKW;
      transformations.push({
        field: 'onGridConfig.projectValue',
        originalValue: config.projectValue,
        transformedValue: projectValue,
        reason: `Calculated project value: ${systemKW}kW × ₹${defaultPricePerKW}/kW = ₹${projectValue}`
      });
    }

    const subsidyAmount = systemKW * subsidyPerKW;
    const customerPayment = projectValue - subsidyAmount;

    const panelWatts = config.panelWatts || "530";
    const panelWattsNum = parseFloat(panelWatts) || 530;

    // Auto-select inverter phase based on KW
    const autoPhase = systemKW < 6 ? "single_phase" : "three_phase";

    // Calculate GST fields
    const gstPercentage = 8.9; // Default GST percentage
    const basePrice = Math.round(projectValue / (1 + gstPercentage / 100));
    const gstAmount = projectValue - basePrice;

    // Calculate actual pricePerKW from basePrice (this reflects the actual rate, not the business rule)
    const pricePerKW = systemKW > 0 ? Math.round(basePrice / systemKW) : defaultPricePerKW;

    return {
      projectType: 'on_grid',
      systemKW,
      pricePerKW,
      solarPanelMake: config.solarPanelMake || [],
      panelWatts: panelWatts,
      panelType: config.panelType || "bifacial",
      dcrPanelCount: config.dcrPanelCount || 0,
      nonDcrPanelCount: config.nonDcrPanelCount || 0,
      panelCount: config.panelCount || Math.ceil(systemKW * 1000 / panelWattsNum),
      inverterMake: config.inverterMake || [],
      inverterKW: systemKW,
      inverterQty: config.inverterQty || 1,
      inverterPhase: config.inverterPhase || autoPhase,
      lightningArrest: config.lightningArrest || false,
      electricalAccessories: config.electricalAccessories || false,
      electricalCount: config.electricalCount,
      earth: config.earth || "ac_dc",
      floor: config.floor,
      structureType: config.structureType,
      gpStructure: config.gpStructure,
      monoRail: config.monoRail,
      civilWorkScope: config.civilWorkScope,
      netMeterScope: config.netMeterScope,
      projectValue,
      gstPercentage,
      gstAmount,
      basePrice,
      subsidyAmount,
      customerPayment,
      installationNotes: config.others,
      warranty: {
        panel: "25_years",
        inverter: "5_years",
        installation: "2_years"
      }
    };
  }

  /**
   * Map off-grid solar project with business rules
   */
  private static mapOffGridProject(config: any, warnings: string[], transformations: any[]): QuotationProject {
    const systemKW = config.inverterKW || 3;
    const defaultPricePerKW = BUSINESS_RULES.pricing.offGridPerKW;

    const projectValue = config.projectValue || (systemKW * defaultPricePerKW);
    const subsidyAmount = 0; // Off-grid doesn't get subsidy
    const customerPayment = projectValue;

    const panelWatts = config.panelWatts || "530";
    const panelWattsNum = parseFloat(panelWatts) || 530;

    // Auto-select inverter phase based on KW
    const autoPhase = systemKW < 6 ? "single_phase" : "three_phase";

    // Calculate GST fields
    const gstPercentage = 8.9; // Default GST percentage
    const basePrice = Math.round(projectValue / (1 + gstPercentage / 100));
    const gstAmount = projectValue - basePrice;

    // Calculate actual pricePerKW from basePrice (this reflects the actual rate, not the business rule)
    const pricePerKW = systemKW > 0 ? Math.round(basePrice / systemKW) : defaultPricePerKW;

    return {
      projectType: 'off_grid',
      systemKW,
      pricePerKW,
      solarPanelMake: config.solarPanelMake || [],
      panelWatts: panelWatts,
      panelType: config.panelType || "bifacial",
      dcrPanelCount: config.dcrPanelCount || 0,
      nonDcrPanelCount: config.nonDcrPanelCount || 0,
      panelCount: config.panelCount || Math.ceil(systemKW * 1000 / panelWattsNum),
      inverterMake: config.inverterMake || [],
      inverterKW: systemKW,
      inverterKVA: config.inverterKVA,
      inverterQty: config.inverterQty || 1,
      inverterPhase: config.inverterPhase || autoPhase,
      inverterVolt: config.inverterVolt,
      batteryBrand: config.batteryBrand || "exide",
      batteryType: config.batteryType || "lead_acid",
      batteryAH: config.batteryAH || "150",
      voltage: config.voltage || 12,
      batteryCount: config.batteryCount || 4,
      batteryStands: config.batteryStands,
      lightningArrest: config.lightningArrest || false,
      electricalAccessories: config.electricalAccessories || false,
      electricalCount: config.electricalCount,
      earth: config.earth || "ac_dc",
      floor: config.floor,
      structureType: config.structureType,
      gpStructure: config.gpStructure,
      monoRail: config.monoRail,
      civilWorkScope: config.civilWorkScope,
      amcIncluded: config.amcIncluded || false, // Annual Maintenance Contract
      projectValue,
      gstPercentage,
      gstAmount,
      basePrice,
      subsidyAmount,
      customerPayment,
      installationNotes: config.others,
      warranty: {
        panel: "25_years",
        inverter: "5_years",
        battery: "2_years",
        installation: "2_years"
      }
    };
  }

  /**
   * Map hybrid solar project with business rules
   */
  private static mapHybridProject(config: any, warnings: string[], transformations: any[]): QuotationProject {
    const systemKW = config.inverterKW || 3;
    const defaultPricePerKW = BUSINESS_RULES.pricing.hybridPerKW;
    const subsidyPerKW = BUSINESS_RULES.subsidy.hybridPerKW;

    const projectValue = config.projectValue || (systemKW * defaultPricePerKW);
    const subsidyAmount = systemKW * subsidyPerKW;
    const customerPayment = projectValue - subsidyAmount;

    const panelWatts = config.panelWatts || "530";
    const panelWattsNum = parseFloat(panelWatts) || 530;

    // Auto-select inverter phase based on KW
    const autoPhase = systemKW < 6 ? "single_phase" : "three_phase";

    // Calculate GST fields
    const gstPercentage = 8.9; // Default GST percentage
    const basePrice = Math.round(projectValue / (1 + gstPercentage / 100));
    const gstAmount = projectValue - basePrice;

    // Calculate actual pricePerKW from basePrice (this reflects the actual rate, not the business rule)
    const pricePerKW = systemKW > 0 ? Math.round(basePrice / systemKW) : defaultPricePerKW;

    return {
      projectType: 'hybrid',
      systemKW,
      pricePerKW,
      solarPanelMake: config.solarPanelMake || [],
      panelWatts: panelWatts,
      panelType: config.panelType || "bifacial",
      dcrPanelCount: config.dcrPanelCount || 0,
      nonDcrPanelCount: config.nonDcrPanelCount || 0,
      panelCount: config.panelCount || Math.ceil(systemKW * 1000 / panelWattsNum),
      inverterMake: config.inverterMake || [],
      inverterKW: systemKW,
      inverterKVA: config.inverterKVA,
      inverterQty: config.inverterQty || 1,
      inverterPhase: config.inverterPhase || autoPhase,
      inverterVolt: config.inverterVolt,
      batteryBrand: config.batteryBrand || "exide",
      batteryType: config.batteryType || "lead_acid",
      batteryAH: config.batteryAH || "150",
      voltage: config.voltage || 12,
      batteryCount: config.batteryCount || 4,
      batteryStands: config.batteryStands,
      lightningArrest: config.lightningArrest || false,
      electricalAccessories: config.electricalAccessories || false,
      electricalCount: config.electricalCount,
      earth: config.earth || "ac_dc",
      floor: config.floor,
      structureType: config.structureType,
      gpStructure: config.gpStructure,
      monoRail: config.monoRail,
      civilWorkScope: config.civilWorkScope,
      electricalWorkScope: config.electricalWorkScope,
      netMeterScope: config.netMeterScope,
      projectValue,
      gstPercentage,
      gstAmount,
      basePrice,
      subsidyAmount,
      customerPayment,
      installationNotes: config.others,
      warranty: {
        panel: "25_years",
        inverter: "5_years",
        battery: "2_years",
        installation: "2_years"
      }
    };
  }

  /**
   * Map water heater project
   */
  private static mapWaterHeaterProject(config: any, warnings: string[], transformations: any[]): QuotationProject {
    const totalValue = config.projectValue || 15000;
    const gstPercentage = 8.9; // Default GST percentage
    const basePrice = Math.round(totalValue / (1 + gstPercentage / 100));
    const gstAmount = totalValue - basePrice;
    const subsidyAmount = 0; // Water heater doesn't get subsidy
    const customerPayment = totalValue;

    return {
      projectType: 'water_heater',
      brand: config.brand || "venus",
      litre: config.litre || 100,
      heatingCoil: config.heatingCoil,
      floor: config.floor,
      plumbingWorkScope: config.plumbingWorkScope,
      civilWorkScope: config.civilWorkScope,
      qty: config.qty || 1,
      waterHeaterModel: config.waterHeaterModel || 'non_pressurized',
      labourAndTransport: config.labourAndTransport || false,
      projectValue: totalValue,
      gstPercentage,
      gstAmount,
      basePrice,
      subsidyAmount,
      customerPayment,
      installationNotes: config.others,
      warranty: {
        heater: "5_years",
        installation: "1_year"
      }
    };
  }

  /**
   * Map water pump project
   */
  private static mapWaterPumpProject(config: any, warnings: string[], transformations: any[]): QuotationProject {
    const totalValue = config.projectValue || 50000;
    const gstPercentage = 8.9; // Default GST percentage
    const basePrice = Math.round(totalValue / (1 + gstPercentage / 100));
    const gstAmount = totalValue - basePrice;
    const subsidyAmount = 0; // Water pump doesn't get subsidy
    const customerPayment = totalValue;

    // Determine inverter phase based on Drive HP (similar to off-grid logic)
    const driveHPValue = parseFloat(config.driveHP || config.hp || '1');
    const autoPhase = driveHPValue < 6 ? "single_phase" : "three_phase";

    return {
      projectType: 'water_pump',
      driveHP: config.driveHP || config.hp || "1",
      hp: config.hp || config.driveHP || "1",
      drive: config.drive || "AC Drive",
      solarPanel: config.solarPanel,
      panelWatts: config.panelWatts,
      panelType: config.panelType,
      panelBrand: config.panelBrand || [],
      dcrPanelCount: config.dcrPanelCount || 0,
      nonDcrPanelCount: config.nonDcrPanelCount || 0,
      panelCount: config.panelCount || 4,
      structureType: config.structureType,
      gpStructure: config.gpStructure,
      monoRail: config.monoRail,
      earthWork: config.earthWork || config.plumbingWorkScope,
      plumbingWorkScope: config.plumbingWorkScope || config.earthWork,
      civilWorkScope: config.civilWorkScope,
      lightningArrest: config.lightningArrest || false,
      electricalAccessories: config.electricalAccessories || false,
      electricalCount: config.electricalCount,
      earth: config.earth || [],
      labourAndTransport: config.labourAndTransport || false,
      inverterPhase: config.inverterPhase || autoPhase,
      qty: config.qty || 1,
      projectValue: totalValue,
      gstPercentage,
      gstAmount,
      basePrice,
      subsidyAmount,
      customerPayment,
      installationNotes: config.others,
      warranty: {
        pump: "2_years",
        panel: "25_years",
        installation: "1_year"
      }
    };
  }

  /**
   * Calculate comprehensive pricing with business rules
   */
  private static calculatePricing(projects: QuotationProject[], warnings: string[]) {
    // totalSystemCost is the sum of base prices (before GST)
    const totalSystemCost = projects.reduce((sum, project) => sum + (project.basePrice || 0), 0);
    const totalGSTAmount = projects.reduce((sum, project) => sum + (project.gstAmount || 0), 0);
    const totalWithGST = projects.reduce((sum, project) => sum + (project.projectValue || 0), 0);
    const totalSubsidyAmount = projects.reduce((sum, project) => sum + (project.subsidyAmount || 0), 0);
    const totalCustomerPayment = totalWithGST - totalSubsidyAmount;

    const advanceAmount = Math.round(totalCustomerPayment * (BUSINESS_RULES.payment.advancePercentage / 100));
    const balanceAmount = totalCustomerPayment - advanceAmount;

    if (totalSystemCost === 0) {
      warnings.push("Total system cost is zero - please verify project values");
    }

    return {
      totalSystemCost,
      totalGSTAmount,
      totalWithGST,
      totalSubsidyAmount,
      totalCustomerPayment,
      advanceAmount,
      balanceAmount
    };
  }

  /**
   * Select appropriate terms template based on property type
   */
  private static selectTermsTemplate(propertyType?: string) {
    switch (propertyType) {
      case 'residential': return "residential";
      case 'commercial': return "commercial";
      case 'agri': return "agri";
      default: return "standard";
    }
  }

  /**
   * Extract customer-facing notes from site visit
   */
  private static extractCustomerNotes(siteVisit: any): string {
    const notes: string[] = [];

    if (siteVisit.notes) {
      notes.push(siteVisit.notes);
    }

    if (siteVisit.outcomeNotes) {
      notes.push(`Visit outcome: ${siteVisit.outcomeNotes}`);
    }

    if (siteVisit.technicalData?.description) {
      notes.push(`Technical notes: ${siteVisit.technicalData.description}`);
    }

    return notes.join(' | ');
  }

  /**
   * Get user display name from user ID
   */
  private static async getUserDisplayName(userId: string): Promise<string> {
    try {
      // Try storage method - if it fails, fallback to userService
      let user;
      try {
        user = await storage.getUser(userId);
      } catch (storageError) {
        // Fallback to importing userService
        const { userService } = await import("../services/user-service");
        const allUsersResult = await userService.getAllUsers();
        if (allUsersResult.success && allUsersResult.users) {
          user = allUsersResult.users.find((u: any) => u.uid === userId);
        }
      }
      return user ? (user.displayName || user.email || userId) : userId;
    } catch (error) {
      console.error('Error getting user display name:', error);
      return userId; // Fallback to user ID if lookup fails
    }
  }

  /**
   * Extract ALL attachments from site visit including ALL photos and documents
   */
  private static extractAllAttachments(siteVisit: any): string[] {
    const attachments: string[] = [];

    console.log("ATTACHMENT_EXTRACTION: Starting comprehensive attachment extraction for site visit:", siteVisit.id);

    // Add check-in photo
    if (siteVisit.siteInPhotoUrl) {
      attachments.push(siteVisit.siteInPhotoUrl);
      console.log("ATTACHMENT_EXTRACTION: Added check-in photo");
    }

    // Add check-out photo
    if (siteVisit.siteOutPhotoUrl) {
      attachments.push(siteVisit.siteOutPhotoUrl);
      console.log("ATTACHMENT_EXTRACTION: Added check-out photo");
    }

    // Add all site photos from during visit
    if (siteVisit.sitePhotos && Array.isArray(siteVisit.sitePhotos)) {
      siteVisit.sitePhotos.forEach((photo: any, index: number) => {
        if (photo.url) {
          attachments.push(photo.url);
          console.log(`ATTACHMENT_EXTRACTION: Added site photo ${index + 1}`);
        }
      });
    }

    // Add all checkout photos
    if (siteVisit.siteOutPhotos && Array.isArray(siteVisit.siteOutPhotos)) {
      siteVisit.siteOutPhotos.forEach((photo: any, index: number) => {
        if (photo.url) {
          attachments.push(photo.url);
          console.log(`ATTACHMENT_EXTRACTION: Added checkout photo ${index + 1}`);
        }
      });
    }

    console.log(`ATTACHMENT_EXTRACTION: Extracted ${attachments.length} total attachments from site visit`);
    return attachments;
  }

  /**
   * Build comprehensive internal notes from ALL departments and data sources
   */
  private static buildComprehensiveInternalNotes(siteVisit: any): string {
    const notesSections: string[] = [];

    console.log("COMPREHENSIVE_NOTES: Building complete internal notes for site visit:", siteVisit.id);

    // === VISIT OVERVIEW ===
    notesSections.push("=== COMPREHENSIVE SITE VISIT DATA ===");
    notesSections.push(`Site Visit ID: ${siteVisit.id}`);
    notesSections.push(`Visit Date: ${siteVisit.siteInTime ? siteVisit.siteInTime.toISOString().split('T')[0] : 'Unknown'}`);
    notesSections.push(`Department: ${siteVisit.department || 'Unknown'}`);
    notesSections.push(`Purpose: ${siteVisit.visitPurpose || 'Unknown'}`);
    notesSections.push(`Status: ${siteVisit.status || 'Unknown'}`);
    notesSections.push(`Visit Outcome: ${siteVisit.visitOutcome || 'Not specified'}`);

    if (siteVisit.siteInTime && siteVisit.siteOutTime) {
      const duration = new Date(siteVisit.siteOutTime).getTime() - new Date(siteVisit.siteInTime).getTime();
      const hours = Math.floor(duration / (1000 * 60 * 60));
      const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
      notesSections.push(`Visit Duration: ${hours}h ${minutes}m`);
    }

    // === CUSTOMER INFORMATION ===
    if (siteVisit.customer) {
      notesSections.push("\n=== CUSTOMER INFORMATION ===");
      notesSections.push(`Customer Name: ${siteVisit.customer.name || 'Not provided'}`);
      notesSections.push(`Mobile: ${siteVisit.customer.mobile || 'Not provided'}`);
      notesSections.push(`Address: ${siteVisit.customer.address || 'Not provided'}`);
      notesSections.push(`EB Service Number: ${siteVisit.customer.ebServiceNumber || 'Not provided'}`);
      notesSections.push(`Property Type: ${siteVisit.customer.propertyType || 'Not specified'}`);
      if (siteVisit.customer.location) {
        notesSections.push(`Customer Location: Lat ${siteVisit.customer.location.latitude}, Lng ${siteVisit.customer.location.longitude}`);
      }
    }

    // === TECHNICAL ASSESSMENT ===
    if (siteVisit.technicalData) {
      notesSections.push("\n=== TECHNICAL ASSESSMENT ===");
      notesSections.push(`Service Types: ${siteVisit.technicalData.serviceTypes ? siteVisit.technicalData.serviceTypes.join(', ') : 'None specified'}`);
      notesSections.push(`Work Type: ${siteVisit.technicalData.workType || 'Not specified'}`);
      notesSections.push(`Working Status: ${siteVisit.technicalData.workingStatus || 'Not assessed'}`);

      if (siteVisit.technicalData.teamMembers && siteVisit.technicalData.teamMembers.length > 0) {
        notesSections.push(`Team Members: ${siteVisit.technicalData.teamMembers.join(', ')}`);
      }

      if (siteVisit.technicalData.pendingRemarks) {
        notesSections.push(`Pending Remarks: ${siteVisit.technicalData.pendingRemarks}`);
      }

      if (siteVisit.technicalData.description) {
        notesSections.push(`Technical Description: ${siteVisit.technicalData.description}`);
      }
    } else {
      notesSections.push("\n=== TECHNICAL ASSESSMENT ===");
      notesSections.push("No technical assessment data recorded");
    }

    // === MARKETING PROJECT DETAILS ===
    if (siteVisit.marketingData) {
      notesSections.push("\n=== MARKETING PROJECT DETAILS ===");
      notesSections.push(`Update Requirements: ${siteVisit.marketingData.updateRequirements ? 'Yes' : 'No'}`);
      notesSections.push(`Project Type: ${siteVisit.marketingData.projectType || 'Not specified'}`);

      // On-Grid Configuration
      if (siteVisit.marketingData.onGridConfig) {
        const config = siteVisit.marketingData.onGridConfig;
        notesSections.push("--- On-Grid System Configuration ---");
        notesSections.push(`Project Value: ₹${config.projectValue || 0}`);
        notesSections.push(`Inverter KW: ${config.inverterKW || 'Not specified'}`);
        notesSections.push(`Panel Count: ${config.panelCount || 'Not specified'}`);
        notesSections.push(`Panel Watts: ${config.panelWatts || 'Not specified'}`);
        notesSections.push(`Inverter Phase: ${config.inverterPhase || 'Not specified'}`);
        if (config.solarPanelMake && config.solarPanelMake.length > 0) {
          notesSections.push(`Solar Panel Makes: ${config.solarPanelMake.join(', ')}`);
        }
        if (config.inverterMake && config.inverterMake.length > 0) {
          notesSections.push(`Inverter Makes: ${config.inverterMake.join(', ')}`);
        }
        if (config.structureType) {
          notesSections.push(`Structure Type: ${config.structureType}`);
        }
        if (config.civilWorkScope) {
          notesSections.push(`Civil Work Scope: ${config.civilWorkScope}`);
        }
        if (config.netMeterScope) {
          notesSections.push(`Net Meter Scope: ${config.netMeterScope}`);
        }
      }

      // Off-Grid Configuration
      if (siteVisit.marketingData.offGridConfig) {
        const config = siteVisit.marketingData.offGridConfig;
        notesSections.push("--- Off-Grid System Configuration ---");
        notesSections.push(`Project Value: ₹${config.projectValue || 0}`);
        notesSections.push(`Inverter KW: ${config.inverterKW || 'Not specified'}`);
        notesSections.push(`Battery Brand: ${config.batteryBrand || 'Not specified'}`);
        notesSections.push(`Battery Type: ${config.batteryType || 'Not specified'}`);
        notesSections.push(`Battery AH: ${config.batteryAH || 'Not specified'}`);
        notesSections.push(`Battery Count: ${config.batteryCount || 'Not specified'}`);
      }

      // Hybrid Configuration
      if (siteVisit.marketingData.hybridConfig) {
        const config = siteVisit.marketingData.hybridConfig;
        notesSections.push("--- Hybrid System Configuration ---");
        notesSections.push(`Project Value: ₹${config.projectValue || 0}`);
        notesSections.push(`Inverter KW: ${config.inverterKW || 'Not specified'}`);
        notesSections.push(`Battery Configuration: ${config.batteryBrand || 'Unknown'} ${config.batteryAH || ''}Ah Battery * ${config.batteryCount || 0} nos`);
      }

      // Water Heater Configuration
      if (siteVisit.marketingData.waterHeaterConfig) {
        const config = siteVisit.marketingData.waterHeaterConfig;
        notesSections.push("--- Water Heater Configuration ---");
        notesSections.push(`Brand: ${config.brand || 'Not specified'}`);
        notesSections.push(`Capacity: ${config.litre || 'Not specified'} liters`);
        notesSections.push(`Floor Level: ${config.floor || 'Not specified'}`);
      }

      // Water Pump Configuration  
      if (siteVisit.marketingData.waterPumpConfig) {
        const config = siteVisit.marketingData.waterPumpConfig;
        notesSections.push("--- Water Pump Configuration ---");
        notesSections.push(`HP Rating: ${config.hp || 'Not specified'}`);
        notesSections.push(`Drive Type: ${config.drive || 'Not specified'}`);
        notesSections.push(`Panel Count: ${config.panelCount || 'Not specified'}`);
      }
    } else {
      notesSections.push("\n=== MARKETING PROJECT DETAILS ===");
      notesSections.push("No marketing project data recorded");
    }

    // === ADMINISTRATIVE DETAILS ===
    if (siteVisit.adminData) {
      notesSections.push("\n=== ADMINISTRATIVE DETAILS ===");

      if (siteVisit.adminData.bankProcess) {
        notesSections.push(`Bank Process: ${siteVisit.adminData.bankProcess.step || 'Not specified'}`);
        if (siteVisit.adminData.bankProcess.description) {
          notesSections.push(`Bank Process Details: ${siteVisit.adminData.bankProcess.description}`);
        }
      }

      if (siteVisit.adminData.ebProcess) {
        notesSections.push(`EB Process: ${siteVisit.adminData.ebProcess.type || 'Not specified'}`);
        if (siteVisit.adminData.ebProcess.description) {
          notesSections.push(`EB Process Details: ${siteVisit.adminData.ebProcess.description}`);
        }
      }

      if (siteVisit.adminData.purchase) {
        notesSections.push(`Purchase Information: ${siteVisit.adminData.purchase}`);
      }

      if (siteVisit.adminData.driving) {
        notesSections.push(`Driving Information: ${siteVisit.adminData.driving}`);
      }

      if (siteVisit.adminData.officialCashTransactions) {
        notesSections.push(`Official Cash Transactions: ${siteVisit.adminData.officialCashTransactions}`);
      }

      if (siteVisit.adminData.officialPersonalWork) {
        notesSections.push(`Official Personal Work: ${siteVisit.adminData.officialPersonalWork}`);
      }

      if (siteVisit.adminData.others) {
        notesSections.push(`Other Administrative Details: ${siteVisit.adminData.others}`);
      }
    } else {
      notesSections.push("\n=== ADMINISTRATIVE DETAILS ===");
      notesSections.push("No administrative data recorded");
    }

    // === LOCATION INFORMATION ===
    notesSections.push("\n=== LOCATION INFORMATION ===");
    if (siteVisit.siteInLocation) {
      notesSections.push(`Check-in Location: Lat ${siteVisit.siteInLocation.latitude}, Lng ${siteVisit.siteInLocation.longitude}`);
      if (siteVisit.siteInLocation.address) {
        notesSections.push(`Check-in Address: ${siteVisit.siteInLocation.address}`);
      }
    } else {
      notesSections.push("No check-in location recorded");
    }

    if (siteVisit.siteOutLocation) {
      notesSections.push(`Check-out Location: Lat ${siteVisit.siteOutLocation.latitude}, Lng ${siteVisit.siteOutLocation.longitude}`);
      if (siteVisit.siteOutLocation.address) {
        notesSections.push(`Check-out Address: ${siteVisit.siteOutLocation.address}`);
      }
    } else {
      notesSections.push("No check-out location recorded");
    }

    // === PHOTO DOCUMENTATION ===
    const totalPhotos = (siteVisit.sitePhotos?.length || 0) + (siteVisit.siteOutPhotos?.length || 0) +
      (siteVisit.siteInPhotoUrl ? 1 : 0) + (siteVisit.siteOutPhotoUrl ? 1 : 0);

    notesSections.push("\n=== PHOTO DOCUMENTATION ===");
    notesSections.push(`Total Photos Captured: ${totalPhotos}`);
    if (siteVisit.siteInPhotoUrl) notesSections.push("✓ Check-in selfie captured");
    if (siteVisit.siteOutPhotoUrl) notesSections.push("✓ Check-out selfie captured");
    if (siteVisit.sitePhotos?.length > 0) {
      notesSections.push(`✓ ${siteVisit.sitePhotos.length} site photos captured`);
    }
    if (siteVisit.siteOutPhotos?.length > 0) {
      notesSections.push(`✓ ${siteVisit.siteOutPhotos.length} checkout photos captured`);
    }

    // === VISIT NOTES & OUTCOMES ===
    notesSections.push("\n=== VISIT NOTES & OUTCOMES ===");
    if (siteVisit.notes) {
      notesSections.push(`Visit Notes: ${siteVisit.notes}`);
    }
    if (siteVisit.outcomeNotes) {
      notesSections.push(`Outcome Notes: ${siteVisit.outcomeNotes}`);
    }
    if (siteVisit.scheduledFollowUpDate) {
      notesSections.push(`Scheduled Follow-up: ${siteVisit.scheduledFollowUpDate.toISOString().split('T')[0]}`);
    }

    notesSections.push("\n=== END OF COMPREHENSIVE SITE VISIT DATA ===");
    notesSections.push(`Mapped on: ${new Date().toISOString()}`);

    const comprehensiveNotes = notesSections.join('\n');
    console.log(`COMPREHENSIVE_NOTES: Generated ${notesSections.length} note sections with ${comprehensiveNotes.length} characters`);

    return comprehensiveNotes;
  }
}
/**
 * Quotation API Routes
 * Handles quotation creation, management, and PDF generation
 */

import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { insertQuotationSchema } from "@shared/schema";
import { QuotationPDFService } from "../services/quotation-pdf-service";
import { QuotationTemplateService } from "../services/quotation-template-service";

export function registerQuotationRoutes(app: Express, verifyAuth: any) {
  // Get all quotations with filtering and pagination
  app.get("/api/quotations", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !(await storage.checkEffectiveUserPermission(user.uid, "quotations.view"))) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get pagination parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      // Get filters
      const filters: any = {};
      if (req.query.status && req.query.status !== "all") filters.status = req.query.status;
      if (req.query.source && req.query.source !== "all") filters.source = req.query.source;
      if (req.query.search) filters.search = req.query.search;

      // Get sort parameters
      const sortBy = (req.query.sortBy as string) || "createdAt";
      const sortOrder = (req.query.sortOrder as "asc" | "desc") || "desc";

      // Get all quotations and apply filters/sorting on the backend
      let quotations = await storage.listQuotations();

      // Apply search filter
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        quotations = quotations.filter(q =>
          q.quotationNumber?.toLowerCase().includes(searchTerm) ||
          q.customerNotes?.toLowerCase().includes(searchTerm) ||
          q.internalNotes?.toLowerCase().includes(searchTerm)
        );
      }

      // Apply status filter
      if (filters.status) {
        quotations = quotations.filter(q => q.status === filters.status);
      }

      // Apply source filter
      if (filters.source) {
        quotations = quotations.filter(q => q.source === filters.source);
      }

      // Apply sorting
      quotations.sort((a, b) => {
        let aVal: any = a[sortBy as keyof typeof a];
        let bVal: any = b[sortBy as keyof typeof b];

        // Handle date sorting
        if (sortBy === "createdAt" || sortBy === "updatedAt") {
          aVal = new Date(aVal).getTime();
          bVal = new Date(bVal).getTime();
        }

        // Handle numeric sorting
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
        }

        // Handle string sorting
        const aStr = String(aVal || '').toLowerCase();
        const bStr = String(bVal || '').toLowerCase();
        return sortOrder === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
      });

      // Calculate total before pagination
      const total = quotations.length;

      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedQuotations = quotations.slice(startIndex, endIndex);

      res.json({
        data: paginatedQuotations,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: endIndex < total,
          hasPrevPage: page > 1
        }
      });
    } catch (error) {
      console.error("Error fetching quotations:", error);
      res.status(500).json({ message: "Failed to fetch quotations" });
    }
  });

  // Get specific quotation by ID
  app.get("/api/quotations/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !(await storage.checkEffectiveUserPermission(user.uid, "quotations.view"))) {
        return res.status(403).json({ message: "Access denied" });
      }

      const quotation = await storage.getQuotation(req.params.id);
      if (!quotation) {
        return res.status(404).json({ message: "Quotation not found" });
      }

      res.json(quotation);
    } catch (error) {
      console.error("Error fetching quotation:", error);
      res.status(500).json({ message: "Failed to fetch quotation" });
    }
  });

  // Create new quotation
  app.post("/api/quotations", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !(await storage.checkEffectiveUserPermission(user.uid, "quotations.create"))) {
        return res.status(403).json({ message: "Access denied" });
      }

      const quotationData = insertQuotationSchema.parse({
        ...req.body,
        preparedBy: req.body.preparedBy || user.displayName || user.email || user.uid,
        quotationNumber: QuotationTemplateService.generateQuotationNumber()
      });

      // Convert "-" qty to 0 in customBillOfMaterials before saving (Installation & Commissioning)
      if (quotationData.customBillOfMaterials && Array.isArray(quotationData.customBillOfMaterials)) {
        quotationData.customBillOfMaterials = quotationData.customBillOfMaterials.map((item: any) => ({
          ...item,
          qty: item.qty === "-" ? 0 : item.qty
        }));
      }

      const quotation = await storage.createQuotation(quotationData);
      res.status(201).json(quotation);
    } catch (error) {
      console.error("\n❌❌❌ ERROR IN QUOTATION CREATION ❌❌❌");
      console.error("Error type:", error instanceof z.ZodError ? "ZodError" : error.constructor.name);
      console.error("Error message:", error instanceof Error ? error.message : String(error));

      if (error instanceof z.ZodError) {
        console.error("\n🔴 ZOD VALIDATION ERRORS:");
        error.errors.forEach((err, idx) => {
          console.error(`\nError ${idx}:`);
          console.error(`  Path: ${err.path.join(" > ")}`);
          console.error(`  Code: ${err.code}`);
          console.error(`  Message: ${err.message}`);
          console.error(`  Full error:`, JSON.stringify(err, null, 2));
        });
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors,
          errorDetails: error.errors.map((e: any) => ({
            path: e.path.join(" > "),
            code: e.code,
            message: e.message
          }))
        });
      }
      console.error("Full error object:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : "No stack");
      res.status(500).json({ message: "Failed to create quotation", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Update quotation
  app.patch("/api/quotations/:id", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !(await storage.checkEffectiveUserPermission(user.uid, "quotations.edit"))) {
        return res.status(403).json({ message: "Access denied" });
      }

      const quotation = await storage.getQuotation(req.params.id);
      if (!quotation) {
        return res.status(404).json({ message: "Quotation not found" });
      }

      // Prepare update data with "-" to 0 conversion
      const updateData = { ...req.body };

      // Convert "-" qty to 0 in customBillOfMaterials before saving (Installation & Commissioning)
      if (updateData.customBillOfMaterials && Array.isArray(updateData.customBillOfMaterials)) {
        updateData.customBillOfMaterials = updateData.customBillOfMaterials.map((item: any) => ({
          ...item,
          qty: item.qty === "-" ? 0 : item.qty
        }));
      }

      const updatedQuotation = await storage.updateQuotation(req.params.id, {
        ...updateData,
        updatedBy: user.uid,
        updatedAt: new Date()
      });

      res.json(updatedQuotation);
    } catch (error) {
      console.error("Error updating quotation:", error);
      res.status(500).json({ message: "Failed to update quotation" });
    }
  });

  // Generate quotation PDF
  app.post("/api/quotations/:id/generate-pdf", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !(await storage.checkEffectiveUserPermission(user.uid, "quotations.view"))) {
        return res.status(403).json({ message: "Access denied" });
      }

      const quotation = await storage.getQuotation(req.params.id);
      if (!quotation) {
        return res.status(404).json({ message: "Quotation not found" });
      }

      // Get customer details
      const customer = await storage.getCustomer(quotation.customerId);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      // Generate PDF for each project (for now, handle first project)
      if (!quotation.projects || quotation.projects.length === 0) {
        return res.status(400).json({ message: "No projects found in quotation" });
      }

      const project = quotation.projects[0]; // Handle first project for now

      // Accept optional override parameters from request body
      // This allows the frontend to send current form values that should be used in the PDF
      // instead of the saved database values - useful for preview before save
      const overrides = req.body || {};
      const quotationWithOverrides = {
        ...quotation,
        // Only override if explicitly provided (not undefined)
        ...(overrides.preparedBy !== undefined && { preparedBy: overrides.preparedBy }),
        ...(overrides.refName !== undefined && { refName: overrides.refName }),
        ...(overrides.contactPerson !== undefined && { contactPerson: overrides.contactPerson }),
        ...(overrides.contactNumber !== undefined && { contactNumber: overrides.contactNumber })
      };

      // Generate HTML content for client-side PDF generation
      const htmlResult = await QuotationPDFService.generateHTMLPreview(
        quotationWithOverrides,
        project,
        customer
      );

      // Return HTML content and template data for client-side PDF generation
      res.json({
        html: htmlResult.html,
        template: htmlResult.template,
        quotationNumber: quotation.quotationNumber || quotation.id
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      res.status(500).json({ message: "Failed to generate PDF" });
    }
  });

  // Generate quotation preview (HTML format)
  app.get("/api/quotations/:id/preview", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !(await storage.checkEffectiveUserPermission(user.uid, "quotations.view"))) {
        return res.status(403).json({ message: "Access denied" });
      }

      const quotation = await storage.getQuotation(req.params.id);
      if (!quotation) {
        return res.status(404).json({ message: "Quotation not found" });
      }

      const customer = await storage.getCustomer(quotation.customerId);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      if (!quotation.projects || quotation.projects.length === 0) {
        return res.status(400).json({ message: "No projects found in quotation" });
      }

      const project = quotation.projects[0];

      const htmlResult = await QuotationPDFService.generateHTMLPreview(
        quotation,
        project,
        customer
      );

      // Return HTML for preview
      res.setHeader('Content-Type', 'text/html');
      res.send(htmlResult.html);
    } catch (error) {
      console.error("Error generating preview:", error);
      res.status(500).json({ message: "Failed to generate preview" });
    }
  });

  // Preview BOM for project configuration (before creating quotation)
  app.post("/api/quotations/preview-bom", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !(await storage.checkEffectiveUserPermission(user.uid, "quotations.view"))) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { project, propertyType } = req.body;

      if (!project) {
        return res.status(400).json({ message: "Project configuration is required" });
      }

      // Generate BOM using the template service
      const billOfMaterials = QuotationTemplateService.generateBillOfMaterials(project, propertyType);

      res.json({ billOfMaterials });
    } catch (error) {
      console.error("Error generating BOM preview:", error);
      res.status(500).json({ message: "Failed to generate BOM preview" });
    }
  });

  // Create quotation from site visit
  app.post("/api/quotations/from-site-visit/:siteVisitId", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !(await storage.checkEffectiveUserPermission(user.uid, "quotations.create"))) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { DataCompletenessAnalyzer, SiteVisitDataMapper } = await import("../services/quotation-mapping-service");

      // Get site visit data
      const { siteVisitService } = await import("../services/site-visit-service");
      const siteVisit = await siteVisitService.getSiteVisitById(req.params.siteVisitId);

      if (!siteVisit) {
        return res.status(404).json({ message: "Site visit not found" });
      }

      // Check if user provided modified projects in request body
      const hasModifiedProjects = req.body.projects && Array.isArray(req.body.projects) && req.body.projects.length > 0;

      let quotationData: any;
      let mappingResult: any;
      let completenessAnalysis: any;

      if (hasModifiedProjects) {
        // User has modified the projects in the form - use those instead of mapping from site visit
        // Map site visit data for customer and other context, but use modified projects
        mappingResult = await SiteVisitDataMapper.mapToQuotation(siteVisit, user.uid);

        // Merge all user modifications from request body with mapped data
        quotationData = {
          ...mappingResult.quotationData,
          ...req.body, // Apply all user modifications (projects, customerData, contactPerson, etc.)
          createdBy: user.uid,
          quotationNumber: QuotationTemplateService.generateQuotationNumber(),
          source: 'site_visit' as const,
          status: mappingResult.quotationData.status || 'draft' as const,
          customerId: mappingResult.quotationData.customerId || siteVisit.customer?.id || (req.body.customerId || ''),
          siteVisitMapping: mappingResult.mappingMetadata,
          // CRITICAL: Ensure preparedBy from request body takes precedence
          preparedBy: req.body.preparedBy || mappingResult.quotationData.preparedBy || user.displayName || user.email || user.uid
        };
      } else {
        // No modifications - use standard site visit mapping with completeness check
        completenessAnalysis = DataCompletenessAnalyzer.analyze(siteVisit);

        if (!completenessAnalysis.canCreateQuotation) {
          return res.status(400).json({
            message: "Site visit data incomplete for quotation creation",
            analysis: completenessAnalysis
          });
        }

        // Map site visit data to quotation
        mappingResult = await SiteVisitDataMapper.mapToQuotation(siteVisit, user.uid);

        quotationData = {
          ...mappingResult.quotationData,
          createdBy: user.uid,
          quotationNumber: QuotationTemplateService.generateQuotationNumber(),
          source: 'site_visit' as const,
          status: mappingResult.quotationData.status || 'draft' as const,
          customerId: mappingResult.quotationData.customerId || siteVisit.customer?.id || '',
          siteVisitMapping: mappingResult.mappingMetadata,
          // CRITICAL: Ensure preparedBy from request body takes precedence
          preparedBy: req.body.preparedBy || mappingResult.quotationData.preparedBy || user.displayName || user.email || user.uid
        };
      }

      // Convert "-" qty to 0 in customBillOfMaterials before saving (Installation & Commissioning)
      if (quotationData.customBillOfMaterials && Array.isArray(quotationData.customBillOfMaterials)) {
        quotationData.customBillOfMaterials = quotationData.customBillOfMaterials.map((item: any) => ({
          ...item,
          qty: item.qty === "-" ? 0 : item.qty
        }));
      }

      const quotation = await storage.createQuotation(quotationData);
      res.status(201).json({
        quotation,
        mappingAnalysis: completenessAnalysis,
        warnings: mappingResult?.businessRuleWarnings
      });
    } catch (error) {
      console.error("\n❌❌❌ ERROR IN FROM SITE VISIT QUOTATION CREATION ❌❌❌");
      console.error("Error type:", error instanceof z.ZodError ? "ZodError" : error.constructor.name);
      console.error("Error message:", error instanceof Error ? error.message : String(error));

      if (error instanceof z.ZodError) {
        console.error("\n🔴 ZOD VALIDATION ERRORS:");
        error.errors.forEach((err, idx) => {
          console.error(`\nError ${idx}:`);
          console.error(`  Path: ${err.path.join(" > ")}`);
          console.error(`  Code: ${err.code}`);
          console.error(`  Message: ${err.message}`);
          console.error(`  Full error:`, JSON.stringify(err, null, 2));
        });
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors,
          errorDetails: error.errors.map((e: any) => ({
            path: e.path.join(" > "),
            code: e.code,
            message: e.message
          }))
        });
      }

      console.error("Full error object:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : "No stack");
      res.status(500).json({ message: "Failed to create quotation from site visit", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Get site visits that can be mapped to quotations
  app.get("/api/quotations/site-visits/mappable", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !(await storage.checkEffectiveUserPermission(user.uid, "quotations.create"))) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { siteVisitService } = await import("../services/site-visit-service");
      const { DataCompletenessAnalyzer } = await import("../services/quotation-mapping-service");

      // Get all completed site visits
      const siteVisits = await siteVisitService.getSiteVisitsWithFilters({
        status: 'completed'
      });

      // Analyze each for quotation readiness
      const mappableSiteVisits = siteVisits.map(siteVisit => {
        const analysis = DataCompletenessAnalyzer.analyze(siteVisit);
        return {
          ...siteVisit,
          completenessAnalysis: analysis
        };
      });

      res.json({
        data: mappableSiteVisits,
        count: mappableSiteVisits.length
      });
    } catch (error) {
      console.error("Error fetching mappable site visits:", error);
      res.status(500).json({ message: "Failed to fetch mappable site visits" });
    }
  });

  // Get site visit mapping data for quotation creation
  app.get("/api/quotations/site-visits/:siteVisitId/mapping-data", verifyAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.authenticatedUser?.uid || "");
      if (!user || !(await storage.checkEffectiveUserPermission(user.uid, "quotations.create"))) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { siteVisitService } = await import("../services/site-visit-service");
      const { DataCompletenessAnalyzer, SiteVisitDataMapper } = await import("../services/quotation-mapping-service");

      const siteVisit = await siteVisitService.getSiteVisitById(req.params.siteVisitId);

      if (!siteVisit) {
        return res.status(404).json({ message: "Site visit not found" });
      }

      // Analyze completeness
      const completenessAnalysis = DataCompletenessAnalyzer.analyze(siteVisit);

      // Get mapping preview
      const mappingResult = await SiteVisitDataMapper.mapToQuotation(siteVisit, user.uid);

      res.json({
        siteVisit,
        completenessAnalysis,
        mappingPreview: mappingResult.quotationData,
        warnings: mappingResult.businessRuleWarnings,
        transformations: mappingResult.dataTransformations
      });
    } catch (error) {
      console.error("Error fetching site visit mapping data:", error);
      res.status(500).json({ message: "Failed to fetch site visit mapping data" });
    }
  });
}
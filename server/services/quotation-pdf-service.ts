/**
 * Quotation PDF Generation Service
 * Creates professional PDF documents matching the reference format
 */

import { QuotationTemplate, QuotationTemplateService } from "./quotation-template-service";
import { Quotation, QuotationProject } from "@shared/schema";

export interface PDFGenerationOptions {
  format: 'A4';
  margin: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
  printBackground: boolean;
  displayHeaderFooter: boolean;
}

export class QuotationPDFService {
  private static readonly DEFAULT_OPTIONS: PDFGenerationOptions = {
    format: 'A4',
    margin: {
      top: '1cm',
      right: '1cm',
      bottom: '1cm',
      left: '1cm'
    },
    printBackground: true,
    displayHeaderFooter: false
  };

  /**
   * Convert number to words (Indian numbering system)
   */
  private static numberToWords(num: number): string {
    if (num === 0) return 'Zero';

    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

    const convertTwoDigit = (n: number): string => {
      if (n < 10) return ones[n];
      if (n >= 10 && n < 20) return teens[n - 10];
      return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
    };

    const convertThreeDigit = (n: number): string => {
      if (n === 0) return '';
      if (n < 100) return convertTwoDigit(n);
      return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convertTwoDigit(n % 100) : '');
    };

    // Indian numbering: ones, thousands, lacs, crores
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
  }

  /**
   * Resolve user name from user ID or return the input if it's already a name
   */
  private static async resolveUserName(preparedBy: string): Promise<string> {
    try {
      // If it looks like a Firebase UID (long random string), resolve it to a name
      if (preparedBy && preparedBy.length > 20 && preparedBy.includes('X')) {
        const { userService } = await import("../services/user-service");
        const allUsersResult = await userService.getAllUsers();

        // Handle both array and object response formats
        let users: any[] = [];
        if (Array.isArray(allUsersResult)) {
          users = allUsersResult;
        } else if (allUsersResult && allUsersResult.success && Array.isArray(allUsersResult.users)) {
          users = allUsersResult.users;
        }

        if (users.length > 0) {
          const user = users.find((u: any) => u.uid === preparedBy);
          return user ? (user.displayName || user.email || preparedBy) : preparedBy;
        } else {
          console.warn('No users found in getAllUsers result');
          return preparedBy || "SM";
        }
      }
      // Otherwise, assume it's already a name
      return preparedBy || "SM";
    } catch (error) {
      console.error('Error resolving user name:', error);
      return preparedBy || "SM";
    }
  }

  /**
   * Format number for display in PDF
   * For sub-1kW systems: show decimal (e.g., 0.68)
   * For >= 1kW systems: round to whole number (e.g., 3.24 → 3)
   */
  private static formatNumber(num: number): string {
    if (num < 1) {
      // For sub-1kW systems, show up to 2 decimal places
      return num.toFixed(2).replace(/\.?0+$/, ''); // Remove trailing zeros
    }
    // Round to nearest whole number for display in PDF
    return Math.round(num).toString();
  }

  /**
   * Generate HTML content for quotation PDF
   */
  static generateHTMLContent(template: QuotationTemplate): string {
    // Check if this is a service-only quotation (water heater or water pump)
    const isWaterUtility = ['water_heater', 'water_pump'].includes(template.projectType);

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${template.customer.name}-${template.customer.contactNumber}-${template.quotationNumber}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 20px;
          font-size: 12px;
          line-height: 1.4;
        }
        
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 20px;
          border-bottom: 2px solid #228B22;
          padding-bottom: 15px;
        }
        
        .company-info {
          flex: 1;
        }
        
        .company-logo {
          height: 60px;
          max-width: 200px;
          margin-right: 15px;
          object-fit: contain;
        }
        
        .company-logo-container {
          display: flex;
          align-items: center;
          margin-bottom: 10px;
        }
        
        .company-name {
          font-size: 24px;
          font-weight: bold;
          color: #228B22;
          margin-bottom: 5px;
        }
        
        .tagline {
          font-style: italic;
          color: #666;
          margin-bottom: 10px;
        }
        
        .contact-details {
          font-size: 10px;
          line-height: 1.3;
        }
        
        .quotation-meta {
          text-align: right;
          min-width: 200px;
        }
        
        .quotation-meta table {
          border-collapse: collapse;
          width: 100%;
        }
        
        .quotation-meta td {
          padding: 3px 8px;
          border: 1px solid #ccc;
          font-size: 11px;
        }
        
        .quotation-meta td:first-child {
          font-weight: bold;
          background: #f5f5f5;
        }
        
        .customer-section {
          display: flex;
          justify-content: space-between;
          margin: 20px 0;
        }
        
        .customer-details, .contact-info {
          flex: 1;
        }
        
        .section-title {
          font-weight: bold;
          margin-bottom: 10px;
          border-bottom: 1px solid #ccc;
          padding-bottom: 5px;
        }
        
        .reference {
          background: #f0f8f0;
          padding: 10px;
          margin: 15px 0;
          border-left: 4px solid #228B22;
        }
        
        .pricing-table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
        }
        
        .pricing-table th,
        .pricing-table td {
          border: 1px solid #333;
          padding: 8px;
          text-align: center;
        }
        
        .pricing-table th {
          background: #228B22;
          color: white;
          font-weight: bold;
        }
        
        .total-calculation {
          background: #fff3cd;
          padding: 15px;
          margin: 20px 0;
          border: 1px solid #ffeaa7;
          text-align: center;
        }
        
        .subsidy-note {
          background: #d4edda;
          padding: 10px;
          margin: 10px 0;
          border: 1px solid #c3e6cb;
          border-radius: 4px;
        }
        
        .bom-table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
        }
        
        .bom-table th,
        .bom-table td {
          border: 1px solid #333;
          padding: 6px;
          text-align: center;
          font-size: 10px;
        }
        
        .bom-table th {
          background: #228B22;
          color: white;
          font-weight: bold;
        }
        
        .terms-section {
          margin: 30px 0;
          page-break-inside: avoid;
        }
        
        .terms-section h3 {
          color: #228B22;
          border-bottom: 2px solid #228B22;
          padding-bottom: 5px;
        }
        
        .warranty-item {
          margin: 10px 0;
        }
        
        .warranty-header {
          font-weight: bold;
          font-size: 14px;
          margin-top: 12px;
          margin-bottom: 6px;
          color: #003366;
        }
        
        .warranty-category {
          font-weight: bold;
          font-size: 12px;
          margin-top: 8px;
          margin-bottom: 4px;
          color: #003366;
          margin-left: 10px;
        }
        
        .warranty-detail {
          font-size: 11px;
          margin-left: 25px;
          margin-bottom: 2px;
          line-height: 1.4;
        }
        
        .warranty-disclaimer {
          background: #ffff99;
          font-weight: bold;
          padding: 3px 6px;
          margin-bottom: 8px;
          display: inline-block;
        }
        
        .highlight {
          background: #ffff99;
          font-weight: bold;
        }
        
        .bank-details {
          background: #f8f9fa;
          padding: 10px;
          border: 1px solid #dee2e6;
          margin: 10px 0;
        }
        
        .scope-section {
          margin: 20px 0;
        }
        
        .scope-section ul {
          margin: 5px 0 15px 20px;
        }
        
        .documents-section {
          background: #fff3cd;
          padding: 15px;
          border: 1px solid #ffeaa7;
          margin: 20px 0;
        }
        
        .page-break {
          margin-top: 5px;
          page-break-inside: avoid;
        }
        
        @media print {
          .page-break {
            page-break-before: auto;
            margin-top: 5px;
          }
        }
      </style>
    </head>
    <body>
      <!-- Header -->
      <div class="header">
        <div class="company-info">
          <div class="company-logo-container">

            <div class="company-name">${template.header.name}</div>
          </div>
          <div class="tagline">PROVIDING PERFECT SOLAR SOLUTIONS</div>
          <div class="tagline">GOVT. AUTHORIZED VENDOR</div>
          <div class="contact-details">
            📞 ${template.header.contact.phone.join(', ')}<br>
            📧 ${template.header.contact.email}<br>
            🌐 ${template.header.contact.website}<br>
            📍 ${template.header.contact.address}
          </div>
        </div>
        
        <div class="quotation-meta">
          <table>
            <tr><td>Quotation No-</td><td>${template.quotationNumber}</td></tr>
            <tr><td>Quotation Date:</td><td>${template.quotationDate}</td></tr>
            <tr><td>Quote Revision:</td><td>${template.quoteRevision}</td></tr>
            <tr><td>Quote Validity:</td><td>${template.quoteValidity}</td></tr>
            <tr><td>Prepared by:</td><td>${template.preparedBy}</td></tr>
          </table>
        </div>
      </div>
      
      <!-- Customer Details -->
      <div class="customer-section">
        <div class="customer-details">
          <div class="section-title">Quotation Prepared for</div>
          <strong>Contact Person: Mr. ${template.customer.name}</strong><br>
          ${template.customer.address}<br>
          Contact Number: ${template.customer.contactNumber}
          ${template.customer.ebServiceNumber ? `<br>EB NO: ${template.customer.ebServiceNumber}` : ''}
          ${template.customer.tariffCode ? `<br>Tariff Code: ${template.customer.tariffCode}` : ''}
          ${template.customer.ebSanctionPhase ? `<br>Load Phase: ${template.customer.ebSanctionPhase === '1_phase' ? '1 Phase' : '3 Phase'}` : ''}
          ${template.customer.ebSanctionKW ? `<br>Sanction Load: ${template.customer.ebSanctionKW}` : ''}
        </div>
        
        <div class="contact-info">
          <div class="section-title">Contact us at</div>
          Contact Person: ${template.contactPerson || 'Godiva Solar Management'}<br>
          Contact Number: ${template.contactNumber || '+91 99949 01500'}<br>
          GST Number: 33BFOPS2085D2ZB
        </div>
      </div>
      
      <!-- Reference -->
      <div class="reference">
        <strong>Dear Sir,</strong><br>
        <strong>Sub: Requirement of ${template.reference}</strong><br>
        <strong>Ref: Discussion with ${template.refName || template.preparedBy}</strong><br>
        <strong>Godiva Solar, Madurai</strong>
      </div>
      
      <!-- Description -->
      <div style="margin: 20px 0;">
        We are delighted to introduce ourselves as the complete Solar Solutions provider to 
        and requirement. We are an expert in the field of solar energy systems, suggest and design 
        technique as solar solutions package to suit requirement. We are providing Solar On-Grid 
        system, solar water pump, solar water heater, solar charger and solar LED products like solar DC 
        lamps, DC Fan, BLDC Fan, solar street light, solar flood light and led decorative lights to 
        manage the customer's requirement.
        <br><br>
        We are promising Solar On-Grid System, Solar Off grid system, Solar Hybrid 
        systems, solar water pump, solar water heater, solar comers and solar gadgets like solar DC 
        bulbs, DC Fan, BLDC Fan, solar street light, solar flood light and led decorative lights.
        <br><br>
        We assure you of our best services always.
        <br><br>
        Thank you,<br>
        <strong>Godiva Solar Management,</strong><br>
        Managing Director<br>
        <strong>Godiva Solar.</strong>
      </div>
      
      <!-- Page Break - Move everything below to second page -->
      <div style="page-break-before: always;"></div>
      
      <!-- Yellow Highlighted Quotation Title -->
      <div style="background: #ffff99; padding: 10px; margin: 20px 0; text-align: center; font-weight: bold; border: 1px solid #e6e600;">
        Quotation for ${template.reference}
      </div>
      
      ${!isWaterUtility ? `
      <!-- Pricing Table -->
      <table class="pricing-table">
        <thead>
          <tr>
            <th>Sl NO</th>
            <th>Description</th>
            <th>kw</th>
            <th>Rate Per kw Rs</th>
            <th>GST per kw Rs</th>
            <th>GST %</th>
            <th>Value + GST</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td style="text-align: left; padding-left: 10px;">${template.pricingBreakdown.description}</td>
            <td>${this.formatNumber(template.pricingBreakdown.kw)}</td>
            <td>₹${template.pricingBreakdown.ratePerKw.toLocaleString()}</td>
            <td>₹${template.pricingBreakdown.gstPerKw.toLocaleString()}</td>
            <td>${template.pricingBreakdown.gstPercentage}</td>
            <td>₹${template.pricingBreakdown.valueWithGST.toLocaleString()}.00</td>
          </tr>
          <tr>
            <td colspan="6" style="text-align: right; font-weight: bold;">Roundoff:</td>
            <td>${template.pricingBreakdown.roundoff ? '₹' + template.pricingBreakdown.roundoff.toLocaleString() : '₹0.00'}</td>
          </tr>
        </tbody>
      </table>
      
      <!-- Total Calculation -->
      <div class="total-calculation">
        <strong>Total Cost: ₹${template.pricingBreakdown.basePrice.toLocaleString()}</strong><br>
        <strong>Total Gst ${template.pricingBreakdown.gstPercentage}%: ₹${template.pricingBreakdown.gstAmount.toLocaleString()}</strong><br>
        <strong>Total Amount in Rs: ₹${template.pricingBreakdown.totalCost.toLocaleString()}.00</strong><br>
        <strong>Amount in Words: ${this.numberToWords(template.pricingBreakdown.totalCost)}</strong>
      </div>

      
      <div style="text-align: center; margin: 10px 0; font-weight: bold; font-size: 16px;">
        <strong>Total Amount ${template.pricingBreakdown.totalCost.toLocaleString()} - Subsidy Amount ${template.pricingBreakdown.subsidyAmount.toLocaleString()} = ${template.pricingBreakdown.customerPayment.toLocaleString()}</strong>
      </div>
      
      ${template.pricingBreakdown.subsidyAmount > 0 ? `
      <div class="subsidy-note">
        <strong>${this.formatNumber(template.pricingBreakdown.kw)} kw Subsidy ${template.pricingBreakdown.subsidyAmount.toLocaleString()} Will be Credited to The Customer's Account</strong>
      </div>` : ''}
      ` : ''}
      
      <!-- Bill of Materials -->
      <div style="margin-top: 5px; page-break-inside: avoid;">
        <h3 style="color: #228B22; text-align: center;">Bill of Materials</h3>
        
        ${!isWaterUtility && template.bomSummary ? `
        <table style="width: 100%; margin: 10px 0; border-collapse: collapse; background-color: #90EE90;">
          <tr style="font-weight: bold; text-align: center;">
            <td style="border: 1px solid #000; padding: 5px;">Phase</td>
            <td style="border: 1px solid #000; padding: 5px;">${template.bomSummary.inverterKVA ? 'Inverter-KVA' : 'Inverter-KW'}</td>
            <td style="border: 1px solid #000; padding: 5px;">Panel Watts</td>
            ${template.bomSummary.batteryAH ? '<td style="border: 1px solid #000; padding: 5px;">Batt. AH</td>' : ''}
            ${template.bomSummary.dcVolt ? '<td style="border: 1px solid #000; padding: 5px;">DC Volt</td>' : ''}
          </tr>
          <tr style="text-align: center;">
            <td style="border: 1px solid #000; padding: 5px;">${template.bomSummary.phase}</td>
            <td style="border: 1px solid #000; padding: 5px;">${template.bomSummary.inverterKVA || template.bomSummary.inverterKW}</td>
            <td style="border: 1px solid #000; padding: 5px;">${template.bomSummary.panelWatts}</td>
            ${template.bomSummary.batteryAH ? `<td style="border: 1px solid #000; padding: 5px;">${template.bomSummary.batteryAH}</td>` : ''}
            ${template.bomSummary.dcVolt ? `<td style="border: 1px solid #000; padding: 5px;">${template.bomSummary.dcVolt}</td>` : ''}
          </tr>
        </table>
        ` : ''}
        
        ${template.backupSolutions ? `
        <h4 style="color: #228B22; text-align: center; margin-top: 15px;">Backup Solutions</h4>
        <table style="width: 100%; margin: 10px 0; border-collapse: collapse;">
          <thead>
            <tr style="background-color: #228B22; color: white; font-weight: bold; text-align: center;">
              <th style="border: 1px solid #000; padding: 5px;">Backup Watts</th>
              ${template.backupSolutions.usageWatts.map(usage => `
                <th style="border: 1px solid #000; padding: 5px;">${usage}W Usage</th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            <tr style="text-align: center;">
              <td style="border: 1px solid #000; padding: 5px; font-weight: bold;">${template.backupSolutions.backupWatts}W</td>
              ${template.backupSolutions.backupHours.map(hours => `
                <td style="border: 1px solid #000; padding: 5px;">${hours} hrs</td>
              `).join('')}
            </tr>
          </tbody>
        </table>
        ` : ''}
        
        ${isWaterUtility ? `
        <!-- Simplified BOM Table for Water Heater/Pump -->
        <table class="bom-table">
          <thead>
            <tr>
              <th>Sl No</th>
              <th>Description</th>
              <th>QTY</th>
              <th>Rate</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${(template.billOfMaterials || []).map(item => `
              <tr>
                <td>${item.slNo}</td>
                <td style="text-align: left;">${item.description}</td>
                <td>${item.qty || 0}</td>
                <td>${(item as any).rate != null ? '₹' + ((item as any).rate as number).toLocaleString() : '₹0'}</td>
                <td>${(item as any).amount != null ? '₹' + ((item as any).amount as number).toLocaleString() : '₹0'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${template.projectType === 'water_heater' && template.floor !== undefined ? `
        <div style="margin-top: 10px; padding: 8px; font-weight: bold; text-align: left;">
          Installation on ${(() => {
            const floor = template.floor || '0';
            if (floor === '0') return 'Ground Floor';
            const suffix = floor === '1' ? 'st' : floor === '2' ? 'nd' : floor === '3' ? 'rd' : 'th';
            return `${floor}${suffix} Floor`;
          })()}
        </div>
        ` : ''}
        ` : `
        <!-- Standard BOM Table -->
        <table class="bom-table">
          <thead>
            <tr>
              <th>Sl No</th>
              <th>Description / Component Name</th>
              <th>Type</th>
              <th>Volt</th>
              <th>Rating</th>
              <th>MAKE</th>
              <th>Qty</th>
              <th>Unit</th>
            </tr>
          </thead>
          <tbody>
            ${(template.billOfMaterials || []).map(item => `
              <tr>
                <td>${item.slNo}</td>
                <td style="text-align: left;">${item.description}</td>
                <td>${item.type}</td>
                <td>${item.volt}</td>
                <td>${item.rating}</td>
                <td>${item.make}</td>
                <td>${item.qty}</td>
                <td>${item.unit}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        `}
      </div>
      
      <!-- Terms & Conditions -->
      <div class="terms-section page-break">
        <h3>Terms & Conditions</h3>
        
        ${!isWaterUtility ? `
        <div class="warranty-item">
          <strong>✓ Warranty Details:</strong><br>
          ${(template.termsAndConditions.warrantyDetails || []).map(item => {
            if (item.includes('***')) {
              return `<div class="warranty-disclaimer">${item}</div>`;
            } else if (/^\d+\. /.test(item)) {
              // Category header (1. Solar..., 2. Inverter...)
              return `<div class="warranty-category">${item}</div>`;
            } else {
              // Detail item (   • ...)
              return `<div class="warranty-detail">${item}</div>`;
            }
          }).join('')}
        </div>
        ` : ''}
        
        ${!isWaterUtility ? `
        <div class="warranty-item">
          <strong>✓ Payment Details:</strong><br>
          • ${template.termsAndConditions.paymentDetails.advancePercentage}% Advance along with Purchase Order<br>
          • ${template.termsAndConditions.paymentDetails.balancePercentage}% Immediately after completion of work<br>
          
          <div class="bank-details">
            <strong>• Payment Account Details:</strong><br>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="border: 1px solid #ccc; padding: 5px;"><strong>Name</strong></td><td style="border: 1px solid #ccc; padding: 5px;">${template.termsAndConditions.paymentDetails.bankDetails.name}</td></tr>
              <tr><td style="border: 1px solid #ccc; padding: 5px;"><strong>Bank</strong></td><td style="border: 1px solid #ccc; padding: 5px;">${template.termsAndConditions.paymentDetails.bankDetails.bank}</td></tr>
              <tr><td style="border: 1px solid #ccc; padding: 5px;"><strong>Branch</strong></td><td style="border: 1px solid #ccc; padding: 5px;">${template.termsAndConditions.paymentDetails.bankDetails.branch}</td></tr>
              <tr><td style="border: 1px solid #ccc; padding: 5px;"><strong>A/C NO</strong></td><td style="border: 1px solid #ccc; padding: 5px;">${template.termsAndConditions.paymentDetails.bankDetails.accountNo}</td></tr>
              <tr><td style="border: 1px solid #ccc; padding: 5px;"><strong>IFSC Code</strong></td><td style="border: 1px solid #ccc; padding: 5px;">${template.termsAndConditions.paymentDetails.bankDetails.ifscCode}</td></tr>
            </table>
          </div>
        </div>
        
        <div class="warranty-item">
          <strong>✓ Delivery Period:</strong><br>
          • ${template.termsAndConditions.deliveryPeriod}
        </div>
        ` : ''}
      </div>
      
      ${!isWaterUtility ? `
      <!-- Scope of Work -->
      <div class="scope-section">
        <h3 style="color: #228B22;">Scope of Work</h3>
        
        <div>
          ${(template.scopeOfWork.structure || []).map((item, idx) => {
            // First, remove all leading bullets/dashes/spaces to expose actual text
            const cleanItem = item.trim().replace(/^[\s•\-\*–—]+/, '').trim();
            // Then check if it's a continuation word
            const isContinuation = cleanItem.match(/^(and|or|the|a|in)/i) && idx > 0;
            // Display with or without bullet based on continuation
            const displayText = isContinuation ? cleanItem : item;
            return `<div style="${isContinuation ? 'margin-left: 20px; margin-top: 0px; line-height: 1.6;' : ''}">${displayText}</div>`;
          }).join('')}
        </div>
        
        ${template.scopeOfWork.netBiDirectionalMeter && template.scopeOfWork.netBiDirectionalMeter.length > 0 ? `
        <div style="margin-top: 15px;">
          ${template.scopeOfWork.netBiDirectionalMeter.map(item => `<div>${item}</div>`).join('')}
        </div>` : ''}
        
        ${template.scopeOfWork.electricalWork && template.scopeOfWork.electricalWork.length > 0 ? `
        <div style="margin-top: 15px;">
          ${template.scopeOfWork.electricalWork.map(item => `<div>${item}</div>`).join('')}
        </div>` : ''}
        
        ${template.scopeOfWork.plumbingWork && template.scopeOfWork.plumbingWork.length > 0 ? `
        <div style="margin-top: 15px;">
          ${template.scopeOfWork.plumbingWork.map(item => `<div>${item}</div>`).join('')}
        </div>` : ''}
      </div>
      
      ${(template.scopeOfWork.customerScope.civilWork.length > 0 ||
          template.scopeOfWork.customerScope.netBiDirectionalMeter.length > 0 ||
          template.scopeOfWork.customerScope.electricalWork.length > 0 ||
          template.scopeOfWork.customerScope.plumbingWork.length > 0) ? `
      <!-- Customer's Scope of Work as separate section -->
      <div class="scope-section" style="margin-top: 30px;">
        <h3 style="color: #228B22;">Customer's Scope of Work</h3>
        <div>
          ${template.scopeOfWork.customerScope.civilWork.length > 0 ? template.scopeOfWork.customerScope.civilWork.map(item => `<div>${item}</div>`).join('') : ''}
          ${template.scopeOfWork.customerScope.netBiDirectionalMeter.length > 0 ? '<br>' + template.scopeOfWork.customerScope.netBiDirectionalMeter.map(item => `<div>${item}</div>`).join('') : ''}
          ${template.scopeOfWork.customerScope.electricalWork.length > 0 ? '<br>' + template.scopeOfWork.customerScope.electricalWork.map(item => `<div>${item}</div>`).join('') : ''}
          ${template.scopeOfWork.customerScope.plumbingWork.length > 0 ? '<br>' + template.scopeOfWork.customerScope.plumbingWork.map(item => `<div>${item}</div>`).join('') : ''}
        </div>
      </div>` : ''}
      ` : ''}
      
      ${!isWaterUtility ? `
      <!-- Documents Required -->
      <div class="documents-section">
        <h3 style="color: #228B22; margin-top: 0;">Documents Required for PM Surya Ghar</h3>
        ${(template.documentsRequiredForSubsidy.list || []).map(item => `<div>${item}</div>`).join('')}
        <br>
        <div class="highlight">${template.documentsRequiredForSubsidy.note}</div>
      </div>
      ` : ''}
      
      <!-- Footer -->
      <div style="text-align: center; margin-top: 30px; font-style: italic; color: #666; font-size: 12px;">
        Deals with Solar On-Grid System, Off-Grid System, Hybrid System,<br>
        Solar Water Heater, Solar Water Pump and<br>
        All kinds of Solar Lights
      </div>
    </body>
    </html>
    `;
  }

  /**
   * Generate PDF buffer from quotation data (deprecated - now handled client-side)
   */
  static async generatePDF(
    quotation: Quotation,
    project: QuotationProject,
    customer: any,
    options?: Partial<PDFGenerationOptions>
  ): Promise<Buffer> {
    // This method is now deprecated since we're handling PDF generation client-side
    throw new Error('PDF generation is now handled client-side');
  }

  /**
   * Generate HTML preview (for preview endpoint)
   */
  static async generateHTMLPreview(
    quotation: Quotation,
    project: QuotationProject,
    customer: any
  ): Promise<{ html: string; template: QuotationTemplate }> {
    try {
      // Debug logging for water heater and water pump projects
      if (project.projectType === 'water_heater' || project.projectType === 'water_pump') {
        console.log(`🔍 PDF Preview - ${project.projectType} Project Data:`, JSON.stringify({
          projectType: project.projectType,
          projectValue: (project as any).projectValue,
          basePrice: (project as any).basePrice,
          customerPayment: (project as any).customerPayment,
          qty: (project as any).qty,
          gstPercentage: (project as any).gstPercentage
        }, null, 2));
      }

      // Resolve user name if preparedBy contains a user ID
      const preparedByName = await this.resolveUserName(quotation.preparedBy);

      // Generate template
      const template = QuotationTemplateService.generateQuotationTemplate(
        quotation,
        project,
        customer,
        preparedByName // Pass the resolved user name
      );

      // Generate HTML content
      const html = this.generateHTMLContent(template);

      return {
        html,
        template
      };
    } catch (error) {
      console.error('Error generating HTML preview:', error);
      throw new Error('Failed to generate quotation HTML preview');
    }
  }
}
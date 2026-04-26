// Debug script to test the mapping logic for test8 data

// Simulate test8's actual site visit data based on our findings
const test8SiteVisitData = {
  id: "CyeEV1ZJCUds0Jbodva5",
  customer: {
    name: "test8",
    mobile: "9944325856", 
    address: "dwadawd",
    ebServiceNumber: "213123124adw",
    propertyType: "commercial"
  },
  status: "completed",
  visitOutcome: "converted",
  department: "marketing",
  marketingData: {
    updateRequirements: true,
    projectType: "on_grid",
    onGridConfig: {
      panelCount: 1,
      solarPanelMake: ["premier"],
      netMeterScope: "customer_scope", 
      lightningArrest: true,
      panelWatts: "530",
      gpStructure: {
        higherEndHeight: "0",
        lowerEndHeight: "0"
      },
      monoRail: {
        type: "mini_rail"
      },
      structureType: "gp_structure",
      others: "",
      inverterQty: 1,
      civilWorkScope: "customer_scope",
      projectValue: 0,  // The issue - this is 0
      structureHeight: 0,
      floor: "0",
      inverterWatts: "5kw",
      earth: "ac",
      inverterMake: ["deye"],
      inverterKW: 0,  // The issue - this is 0
      inverterPhase: "single_phase"
    }
  }
  // Note: technicalData and adminData are missing
};

console.log("=== TEST8 SITE VISIT DATA ANALYSIS ===");
console.log("Customer:", test8SiteVisitData.customer);
console.log("Marketing Data:", test8SiteVisitData.marketingData);

// Test the mapping condition from the service
const marketingData = test8SiteVisitData.marketingData;
const shouldMapOnGrid = marketingData.onGridConfig && (
  marketingData.onGridConfig.inverterKW ||
  marketingData.onGridConfig.solarPanelMake?.length > 0 ||
  marketingData.onGridConfig.inverterMake?.length > 0 ||
  marketingData.onGridConfig.panelCount ||
  marketingData.onGridConfig.projectValue ||
  marketingData.onGridConfig.structureType ||
  marketingData.onGridConfig.civilWorkScope ||
  marketingData.onGridConfig.netMeterScope
);

console.log("\n=== MAPPING CONDITION ANALYSIS ===");
console.log("Should create on-grid project:", shouldMapOnGrid);
console.log("Condition breakdown:");
console.log("- inverterKW:", !!marketingData.onGridConfig.inverterKW);
console.log("- solarPanelMake.length > 0:", marketingData.onGridConfig.solarPanelMake?.length > 0);
console.log("- inverterMake.length > 0:", marketingData.onGridConfig.inverterMake?.length > 0);
console.log("- panelCount:", !!marketingData.onGridConfig.panelCount);
console.log("- projectValue:", !!marketingData.onGridConfig.projectValue);
console.log("- structureType:", !!marketingData.onGridConfig.structureType);
console.log("- civilWorkScope:", !!marketingData.onGridConfig.civilWorkScope);
console.log("- netMeterScope:", !!marketingData.onGridConfig.netMeterScope);

// Simulate the mapping logic
if (shouldMapOnGrid) {
  console.log("\n=== SIMULATED PROJECT MAPPING ===");
  
  const config = marketingData.onGridConfig;
  
  // Extract system KW using the same logic as the service
  let systemKW = config.inverterKW || 3;
  
  if (!systemKW || systemKW === 0) {
    if (config.inverterWatts) {
      const wattsStr = config.inverterWatts.toString().toLowerCase();
      const match = wattsStr.match(/(\d+(?:\.\d+)?)\s*(?:kw|k)?/);
      if (match) {
        systemKW = parseFloat(match[1]);
        console.log(`Extracted ${systemKW}kW from inverterWatts: ${config.inverterWatts}`);
      }
    }
  }
  
  if (!systemKW || systemKW === 0) {
    systemKW = 3;
    console.log("Using default 3kW system");
  }
  
  const pricePerKW = 68000;
  const subsidyPerKW = 26000;
  
  let projectValue = config.projectValue;
  if (!projectValue || projectValue === 0) {
    projectValue = systemKW * pricePerKW;
    console.log(`Calculated project value: ${systemKW}kW × ₹${pricePerKW}/kW = ₹${projectValue}`);
  }
  
  const subsidyAmount = systemKW * subsidyPerKW;
  const customerPayment = projectValue - subsidyAmount;
  
  const simulatedProject = {
    projectType: 'on_grid',
    systemKW,
    pricePerKW,
    projectValue,
    subsidyAmount,
    customerPayment,
    solarPanelMake: config.solarPanelMake || [],
    panelWatts: config.panelWatts || "530",
    panelCount: config.panelCount || 1,
    inverterMake: config.inverterMake || [],
    inverterWatts: config.inverterWatts || `${systemKW}kw`,
    inverterKW: systemKW,
    inverterQty: config.inverterQty || 1,
    inverterPhase: config.inverterPhase || "single_phase"
  };
  
  console.log("Simulated mapped project:");
  console.log(JSON.stringify(simulatedProject, null, 2));
  
  console.log("\n=== PROJECT SUMMARY ===");
  console.log(`System: ${simulatedProject.systemKW}kW On-Grid Solar`);
  console.log(`Panels: ${simulatedProject.panelCount} × ${simulatedProject.panelWatts}W`);
  console.log(`Project Value: ₹${simulatedProject.projectValue.toLocaleString()}`);
  console.log(`Govt. Subsidy: ₹${simulatedProject.subsidyAmount.toLocaleString()}`);
  console.log(`Customer Payment: ₹${simulatedProject.customerPayment.toLocaleString()}`);
} else {
  console.log("\n❌ No project would be created - mapping condition failed");
}

console.log("\n=== EXPECTED UI DISPLAY ===");
console.log("The UI should show:");
console.log("1. Project Configuration with editable on-grid system details");
console.log("2. System capacity, panel count, and pricing that can be modified");
console.log("3. All the configuration fields from the site visit pre-populated");
console.log("4. User should be able to edit any field to complete missing data");
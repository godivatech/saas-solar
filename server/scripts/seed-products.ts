import { storage } from '../storage';
import * as dotenv from 'dotenv';
dotenv.config();

const standardSolarProducts = [
  {
    name: "Mono PERC Half-Cut Solar Panel 550Wp",
    sku: "PANEL-550-MONO",
    category: "panel",
    brand: "Waaree",
    model: "Aditya 550Wp",
    specifications: { wattage: 550, efficiency: "21.3%", cellType: "Mono PERC" },
    unit: "Nos",
    purchasePrice: 11000,
    sellingPrice: 13500,
    currentStock: 120,
    minimumStock: 20
  },
  {
    name: "TOPCon Bifacial Solar Module 580Wp",
    sku: "PANEL-580-TOPCON",
    category: "panel",
    brand: "Adani Solar",
    model: "Elan 580Wp Dual Glass",
    specifications: { wattage: 580, efficiency: "22.5%", cellType: "N-Type TOPCon" },
    unit: "Nos",
    purchasePrice: 12500,
    sellingPrice: 15200,
    currentStock: 80,
    minimumStock: 15
  },
  {
    name: "Single Phase On-Grid String Inverter 3.3kW",
    sku: "INV-3KW-1PH",
    category: "inverter",
    brand: "Growatt",
    model: "MIN 3300TL-X",
    specifications: { capacityKW: 3.3, phase: "Single Phase", efficiency: "98.2%", mpptCount: 1 },
    unit: "Nos",
    purchasePrice: 24000,
    sellingPrice: 29500,
    currentStock: 15,
    minimumStock: 3
  },
  {
    name: "Three Phase On-Grid Solar Inverter 5kW",
    sku: "INV-5KW-3PH",
    category: "inverter",
    brand: "Solis",
    model: "S5-GR3P5K",
    specifications: { capacityKW: 5, phase: "Three Phase", efficiency: "98.5%", mpptCount: 2 },
    unit: "Nos",
    purchasePrice: 42000,
    sellingPrice: 51000,
    currentStock: 10,
    minimumStock: 2
  },
  {
    name: "Three Phase Hybrid Solar Inverter 10kW",
    sku: "INV-10KW-HYB",
    category: "inverter",
    brand: "Deye",
    model: "SUN-10K-SG04LP3",
    specifications: { capacityKW: 10, phase: "Three Phase", batteryVoltage: "48V", mpptCount: 2 },
    unit: "Nos",
    purchasePrice: 115000,
    sellingPrice: 138000,
    currentStock: 6,
    minimumStock: 2
  },
  {
    name: "Lithium Ferro Phosphate (LiFePO4) Battery 5.12kWh 48V",
    sku: "BAT-5KWH-LIFEPO4",
    category: "battery",
    brand: "Pylontech",
    model: "US5000",
    specifications: { capacityKWh: 5.12, nominalVoltage: "48V", cycles: 6000, dod: "95%" },
    unit: "Nos",
    purchasePrice: 88000,
    sellingPrice: 108000,
    currentStock: 8,
    minimumStock: 2
  },
  {
    name: "Solar DC Cable 4 sq.mm (Tinned Copper XLPO)",
    sku: "CABLE-DC-4SQMM",
    category: "cable",
    brand: "Polycab",
    model: "Solar DC 1.5kV",
    specifications: { size: "4 sq.mm", insulation: "XLPO", voltageRating: "1500V DC" },
    unit: "Mtr",
    purchasePrice: 38,
    sellingPrice: 48,
    currentStock: 1500,
    minimumStock: 200
  },
  {
    name: "AC Armoured Cable 4 Core 16 sq.mm XLPE",
    sku: "CABLE-AC-16SQMM",
    category: "cable",
    brand: "Havells",
    model: "Aluminium Armoured",
    specifications: { size: "16 sq.mm", core: "4 Core", conductor: "Aluminium" },
    unit: "Mtr",
    purchasePrice: 110,
    sellingPrice: 145,
    currentStock: 450,
    minimumStock: 100
  },
  {
    name: "HDG Rooftop Solar Mounting Structure (Elevated 4 Panel)",
    sku: "STR-HDG-4P",
    category: "structure",
    brand: "Metalkraft",
    model: "HDG 80 Micron",
    specifications: { material: "Hot Dip Galvanized", tiltAngle: "15-20 Deg", windSpeed: "150 km/h" },
    unit: "Set",
    purchasePrice: 6500,
    sellingPrice: 8500,
    currentStock: 25,
    minimumStock: 5
  },
  {
    name: "Chemical Earthing Electrode with BFC 2 Meter",
    sku: "EARTH-2M-CHEM",
    category: "accessories",
    brand: "TruePower",
    model: "SafeEarthing 2000mm",
    specifications: { length: "2 Meter", diameter: "50mm", compound: "Bentonite Carbon" },
    unit: "Nos",
    purchasePrice: 2800,
    sellingPrice: 3600,
    currentStock: 30,
    minimumStock: 10
  }
];

async function main() {
  console.log("🌱 Seeding standard solar products into Neon PostgreSQL...");
  for (const item of standardSolarProducts) {
    const prod = await storage.createProduct(item);
    console.log(`   ✅ Seeded: ${prod.name} (${prod.sku}) - Price: ₹${prod.sellingPrice}, Stock: ${prod.currentStock}`);
  }
  const all = await storage.listProducts();
  console.log(`\n🎉 Total products in Neon PostgreSQL inventory: ${all.total}`);
}

main().then(() => process.exit(0)).catch(err => {
  console.error("Seeding error:", err);
  process.exit(1);
});


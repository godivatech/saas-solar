/**
 * Marketing Department Site Visit Form
 * Handles marketing-specific project details and configurations
 */

import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Combobox } from "@/components/ui/combobox";
import { BatteryBrandCombobox } from "@/components/ui/battery-brand-combobox";
import {
  TrendingUp,
  Zap,
  Battery,
  Droplets,
  Sun,
  Camera,
  MapPin,
  DollarSign,
  Waves,
  ArrowLeft
} from "lucide-react";
import {
  marketingProjectTypes,
  solarPanelBrands,
  inverterMakes,
  inverterPhases,
  earthingTypes,
  panelWatts,
  panelTypes,
  inverterWatts,
  batteryBrands,
  batteryTypes,
  batteryAHOptions,
  inverterVoltOptions,
  waterHeaterBrands,
  floorLevels,
  structureTypes,
  monoRailOptions,
  workScopeOptions
} from "@shared/schema";

interface MarketingSiteVisitFormProps {
  onSubmit: (data: MarketingFormData) => void;
  onBack?: () => void;
  isDisabled?: boolean;
  isLoading?: boolean;
  modalScrollRef?: React.RefObject<HTMLDivElement>;
}

interface MarketingFormData {
  updateRequirements: boolean;
  projectType?: string;
  onGridConfig?: OnGridConfig;
  offGridConfig?: OffGridConfig;
  hybridConfig?: HybridConfig;
  waterHeaterConfig?: WaterHeaterConfig;
  waterPumpConfig?: WaterPumpConfig;
}

interface BaseConfig {
  projectValue: number;
  others?: string;
}

interface OnGridConfig extends BaseConfig {
  solarPanelMake: string[];
  panelWatts: string;
  panelType?: string;
  inverterMake: string[];
  inverterPhase: string;
  inverterKW?: number;
  inverterQty?: number;
  lightningArrest: boolean;
  electricalAccessories?: boolean;
  electricalCount?: number;
  earth: string[];
  floor?: string;
  dcrPanelCount: number;
  nonDcrPanelCount: number;
  panelCount: number;
  // New fields from client specification
  structureType?: string;
  gpStructure?: {
    lowerEndHeight?: string;
    higherEndHeight?: string;
  };
  monoRail?: {
    type?: string;
  };
  civilWorkScope?: string;
  netMeterScope?: string;
}

interface OffGridConfig extends OnGridConfig {
  batteryBrand: string;
  batteryType?: string;
  batteryAH?: string;
  voltage: number;
  batteryCount: number;
  batteryStands?: string;
  inverterVolt?: string;
  inverterKVA?: string;
  amcIncluded?: boolean; // Annual Maintenance Contract checkbox
  // Off-grid doesn't have net meter scope
}

interface HybridConfig extends OffGridConfig {
  electricalWorkScope?: string;
  netMeterScope?: string; // Hybrid has net meter back
}

interface WaterHeaterConfig extends BaseConfig {
  brand: string;
  litre: number;
  heatingCoil?: string;
  // New fields from client specification
  floor?: string;
  plumbingWorkScope?: string;
  civilWorkScope?: string;
  // New fields for quotation description changes
  qty?: number;
  waterHeaterModel?: string;
  labourAndTransport?: boolean;
}

interface WaterPumpConfig extends BaseConfig {
  driveHP?: string; // Renamed from 'hp'
  hp?: string; // Keep for backward compatibility
  drive: string;
  solarPanel?: string;
  panelBrand: string[];
  panelWatts?: string;
  panelType?: string;
  dcrPanelCount: number;
  nonDcrPanelCount: number;
  panelCount: number;
  // Quantity field for BOM generation
  qty?: number;
  // Phase selection for inverter
  inverterPhase?: string;
  // New fields from client specification
  structureType?: string;
  gpStructure?: {
    lowerEndHeight?: string;
    higherEndHeight?: string;
  };
  monoRail?: {
    type?: string;
  };
  // Replaced field: plumbingWorkScope renamed to earthWork
  earthWork?: string;
  plumbingWorkScope?: string; // Keep for backward compatibility
  civilWorkScope?: string;
  // New checkbox fields
  lightningArrest?: boolean;
  dcCable?: boolean;
  electricalAccessories?: boolean;
  electricalCount?: number;
  earth?: string[];
  labourAndTransport?: boolean;
}

// Project type options with descriptions
const projectTypeOptions = [
  { value: 'on_grid', label: 'On-Grid Solar System', icon: Sun, description: 'Grid-tied solar power system' },
  { value: 'off_grid', label: 'Off-Grid Solar System', icon: Battery, description: 'Standalone solar system with battery storage' },
  { value: 'hybrid', label: 'Hybrid Solar System', icon: Zap, description: 'Grid-tied with battery backup' },
  { value: 'water_heater', label: 'Solar Water Heater', icon: Droplets, description: 'Solar water heating system' },
  { value: 'water_pump', label: 'Solar Water Pump', icon: Droplets, description: 'Solar-powered water pumping system' }
];

export function MarketingSiteVisitForm({ onSubmit, onBack, isDisabled, isLoading, modalScrollRef }: MarketingSiteVisitFormProps) {
  const [formData, setFormData] = useState<MarketingFormData>({
    updateRequirements: false
  });
  const projectTypeSelectionRef = useRef<HTMLDivElement>(null);
  const configurationSectionRef = useRef<HTMLDivElement>(null);

  const handleRequirementsUpdate = (value: string) => {
    const shouldUpdate = value === 'yes';
    setFormData(prev => ({
      ...prev,
      updateRequirements: shouldUpdate,
      projectType: shouldUpdate ? '' : undefined,
      onGridConfig: undefined,
      offGridConfig: undefined,
      hybridConfig: undefined,
      waterHeaterConfig: undefined,
      waterPumpConfig: undefined
    }));

    // Auto-scroll to Project Type Selection when "Yes" is selected
    if (shouldUpdate && projectTypeSelectionRef.current) {
      console.log('Marketing Form: Starting scroll to project type selection');
      setTimeout(() => {
        if (modalScrollRef?.current && projectTypeSelectionRef.current) {
          console.log('Marketing Form: Both refs available, calculating position');
          // Calculate the position of the Project Type Selection relative to the modal
          const modalRect = modalScrollRef.current.getBoundingClientRect();
          const targetRect = projectTypeSelectionRef.current.getBoundingClientRect();
          const relativeTop = targetRect.top - modalRect.top + modalScrollRef.current.scrollTop;

          console.log('Marketing Form: Scrolling to relativeTop:', relativeTop);

          // Scroll the modal to the target position
          modalScrollRef.current.scrollTo({
            top: relativeTop - 20, // 20px padding from top
            behavior: 'smooth'
          });
        } else {
          console.log('Marketing Form: Using fallback scrollIntoView - modalScrollRef:', !!modalScrollRef?.current, 'projectTypeRef:', !!projectTypeSelectionRef.current);
          // Fallback to regular scrollIntoView if modal ref is not available
          projectTypeSelectionRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
            inline: 'nearest'
          });
        }
      }, 150); // Slightly longer delay to ensure DOM update
    }
  };

  const handleProjectTypeChange = (projectType: string) => {
    setFormData(prev => ({
      ...prev,
      projectType,
      onGridConfig: projectType === 'on_grid' ? {
        solarPanelMake: ['premier'],
        panelWatts: '530',
        panelType: 'bifacial',
        inverterMake: ['deye'],
        inverterPhase: 'single_phase',
        inverterKW: 5,
        inverterQty: 1,
        lightningArrest: false,
        electricalAccessories: false,
        electricalCount: 0,
        earth: ['ac'],
        floor: '0',
        dcrPanelCount: 1,
        nonDcrPanelCount: 0,
        panelCount: 1,
        projectValue: 0,
        others: '',
        structureType: 'gp_structure',
        gpStructure: {
          lowerEndHeight: '0',
          higherEndHeight: '0'
        },
        monoRail: {
          type: 'mini_rail'
        },
        civilWorkScope: 'customer_scope',
        netMeterScope: 'customer_scope'
      } : undefined,
      offGridConfig: projectType === 'off_grid' ? {
        solarPanelMake: ['premier'],
        panelWatts: '530',
        panelType: 'bifacial',
        inverterMake: ['deye'],
        inverterPhase: 'single_phase',
        inverterKW: 5,
        inverterKVA: '5',
        inverterQty: 1,
        lightningArrest: false,
        electricalAccessories: false,
        electricalCount: 0,
        earth: ['ac'],
        floor: '0',
        dcrPanelCount: 1,
        nonDcrPanelCount: 0,
        panelCount: 1,
        batteryBrand: 'exide',
        batteryType: 'lead_acid',
        batteryAH: '100',
        voltage: 12,
        batteryCount: 1,
        batteryStands: '',
        inverterVolt: '48',
        projectValue: 0,
        others: '',
        structureType: 'gp_structure',
        gpStructure: {
          lowerEndHeight: '0',
          higherEndHeight: '0'
        },
        monoRail: {
          type: 'mini_rail'
        },
        civilWorkScope: 'customer_scope',
        amcIncluded: false
      } : undefined,
      hybridConfig: projectType === 'hybrid' ? {
        solarPanelMake: ['premier'],
        panelWatts: '530',
        panelType: 'bifacial',
        inverterMake: ['deye'],
        inverterPhase: 'single_phase',
        inverterKW: 5,
        inverterKVA: '5',
        inverterQty: 1,
        lightningArrest: false,
        electricalAccessories: false,
        electricalCount: 0,
        earth: ['ac'],
        floor: '0',
        dcrPanelCount: 1,
        nonDcrPanelCount: 0,
        panelCount: 1,
        batteryBrand: 'exide',
        batteryType: 'lead_acid',
        batteryAH: '100',
        voltage: 12,
        batteryCount: 1,
        batteryStands: '',
        inverterVolt: '48',
        projectValue: 0,
        others: '',
        structureType: 'gp_structure',
        gpStructure: {
          lowerEndHeight: '0',
          higherEndHeight: '0'
        },
        monoRail: {
          type: 'mini_rail'
        },
        civilWorkScope: 'customer_scope',
        electricalWorkScope: 'customer_scope',
        netMeterScope: 'customer_scope'
      } : undefined,
      waterHeaterConfig: projectType === 'water_heater' ? {
        brand: 'venus',
        litre: 100,
        heatingCoil: '',
        projectValue: 0,
        others: '',
        floor: '0',
        plumbingWorkScope: 'customer_scope',
        civilWorkScope: 'customer_scope',
        qty: 1,
        waterHeaterModel: 'non_pressurized',
        labourAndTransport: false
      } : undefined,
      waterPumpConfig: projectType === 'water_pump' ? {
        driveHP: '1',
        hp: '1', // Keep for backward compatibility
        drive: 'AC',
        solarPanel: '',
        panelBrand: ['premier'],
        panelWatts: '530',
        panelType: 'bifacial',
        dcrPanelCount: 1,
        nonDcrPanelCount: 0,
        panelCount: 1,
        qty: 1,
        projectValue: 0,
        others: '',
        structureType: 'gp_structure',
        gpStructure: {
          lowerEndHeight: '0',
          higherEndHeight: '0'
        },
        monoRail: {
          type: 'mini_rail'
        },
        earthWork: 'customer_scope',
        plumbingWorkScope: 'customer_scope', // Keep for backward compatibility
        civilWorkScope: 'customer_scope',
        lightningArrest: false,
        dcCable: false,
        electricalAccessories: false,
        electricalCount: 0,
        earth: [],
        labourAndTransport: false
      } : undefined
    }));

    // Auto-scroll to configuration section when a project type is selected
    if (projectType && configurationSectionRef.current) {
      console.log('Marketing Form: Starting scroll to configuration section for:', projectType);
      setTimeout(() => {
        if (modalScrollRef?.current && configurationSectionRef.current) {
          console.log('Marketing Form: Both refs available for config section, calculating position');
          // Calculate the position of the configuration section relative to the modal
          const modalRect = modalScrollRef.current.getBoundingClientRect();
          const targetRect = configurationSectionRef.current.getBoundingClientRect();
          const relativeTop = targetRect.top - modalRect.top + modalScrollRef.current.scrollTop;

          console.log('Marketing Form: Scrolling config section to relativeTop:', relativeTop);

          // Scroll the modal to the target position
          modalScrollRef.current.scrollTo({
            top: relativeTop - 20, // 20px padding from top
            behavior: 'smooth'
          });
        } else {
          console.log('Marketing Form: Using fallback scrollIntoView for config section - modalScrollRef:', !!modalScrollRef?.current, 'configRef:', !!configurationSectionRef.current);
          // Fallback to regular scrollIntoView if modal ref is not available
          configurationSectionRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
            inline: 'nearest'
          });
        }
      }, 200); // Delay to ensure DOM update for configuration section
    }
  };

  const updateConfig = (configType: keyof MarketingFormData, updates: any) => {
    setFormData(prev => {
      const currentConfig = prev[configType];
      return {
        ...prev,
        [configType]: currentConfig && typeof currentConfig === 'object'
          ? { ...currentConfig, ...updates }
          : updates
      };
    });
  };

  const handleSubmit = () => {
    onSubmit(formData);
  };

  const isFormValid = !formData.updateRequirements ||
    (formData.projectType &&
      ((formData.projectType === 'on_grid' && formData.onGridConfig?.solarPanelMake && formData.onGridConfig.solarPanelMake.length > 0 && formData.onGridConfig?.inverterMake && formData.onGridConfig.inverterMake.length > 0 && (formData.onGridConfig?.panelCount || 0) > 0) ||
        (formData.projectType === 'off_grid' && formData.offGridConfig?.solarPanelMake && formData.offGridConfig.solarPanelMake.length > 0 && formData.offGridConfig?.inverterMake && formData.offGridConfig.inverterMake.length > 0 && formData.offGridConfig?.batteryBrand && (formData.offGridConfig?.panelCount || 0) > 0) ||
        (formData.projectType === 'hybrid' && formData.hybridConfig?.solarPanelMake && formData.hybridConfig.solarPanelMake.length > 0 && formData.hybridConfig?.inverterMake && formData.hybridConfig.inverterMake.length > 0 && formData.hybridConfig?.batteryBrand && (formData.hybridConfig?.panelCount || 0) > 0) ||
        (formData.projectType === 'water_heater' && formData.waterHeaterConfig?.brand && (formData.waterHeaterConfig?.litre || 0) > 0) ||
        (formData.projectType === 'water_pump' && formData.waterPumpConfig?.hp && formData.waterPumpConfig?.panelBrand && formData.waterPumpConfig.panelBrand.length > 0 && (formData.waterPumpConfig?.panelCount || 0) > 0)));

  return (
    <div className="space-y-6">
      {/* Customer Requirements Update */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Customer Requirements Update
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Would you like to update customer requirements during this visit?
            </p>
            <RadioGroup
              value={formData.updateRequirements ? 'yes' : 'no'}
              onValueChange={handleRequirementsUpdate}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="yes" id="yes" />
                <Label htmlFor="yes">Yes - Update project requirements</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="no" id="no" />
                <Label htmlFor="no">No - Site visit only</Label>
              </div>
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      {/* Project Details (only if updating requirements) */}
      {formData.updateRequirements && (
        <>
          {/* Project Type Selection */}
          <Card ref={projectTypeSelectionRef}>
            <CardHeader>
              <CardTitle>Project Type Selection</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {projectTypeOptions.map((project) => {
                  const Icon = project.icon;
                  return (
                    <Card
                      key={project.value}
                      className={`cursor-pointer transition-colors hover:bg-accent ${formData.projectType === project.value ? 'ring-2 ring-primary bg-accent' : ''
                        }`}
                      onClick={() => handleProjectTypeChange(project.value)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <Icon className="h-6 w-6 mt-1" />
                          <div>
                            <h4 className="font-medium">{project.label}</h4>
                            <p className="text-sm text-muted-foreground">
                              {project.description}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Configuration Sections */}
          <div ref={configurationSectionRef}>
            {/* ON-GRID Configuration */}
            {formData.projectType === 'on_grid' && formData.onGridConfig && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sun className="h-5 w-5" />
                    On-Grid Solar System Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Solar Panel Make * (Multiple Selection)</Label>
                      <div className="space-y-2">
                        {solarPanelBrands.map((brand) => (
                          <div key={brand} className="flex items-center space-x-2">
                            <Checkbox
                              id={`on-grid-panel-${brand}`}
                              checked={formData.onGridConfig?.solarPanelMake?.includes(brand) || false}
                              onCheckedChange={(checked) => {
                                const currentMakes = formData.onGridConfig?.solarPanelMake || [];
                                const newMakes = checked
                                  ? [...currentMakes, brand]
                                  : currentMakes.filter(m => m !== brand);
                                updateConfig('onGridConfig', { solarPanelMake: newMakes });
                              }}
                            />
                            <Label htmlFor={`on-grid-panel-${brand}`} className="text-sm">
                              {brand.replace('_', ' ').toUpperCase()}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Label>Panel Watts</Label>
                      <Combobox
                        value={formData.onGridConfig.panelWatts}
                        onChange={(value) => {
                          const numericValue = value.replace(/W$/i, '').trim();
                          updateConfig('onGridConfig', { panelWatts: numericValue });
                        }}
                        options={panelWatts.map((watts) => ({ value: watts, label: `${watts}W` }))}
                        placeholder="Select or type wattage"
                        searchPlaceholder="Search wattage..."
                        emptyMessage="No wattage found."
                        allowCustom={true}
                        formatCustomValue={(val) => val ? `${val}W` : val}
                      />
                    </div>

                    <div>
                      <Label>Panel Type</Label>
                      <Select
                        value={formData.onGridConfig.panelType || 'bifacial'}
                        onValueChange={(value) => updateConfig('onGridConfig', { panelType: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select panel type" />
                        </SelectTrigger>
                        <SelectContent>
                          {panelTypes.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type === 'bifacial' ? 'Bifacial' :
                                type === 'topcon' ? 'Topcon' :
                                  'Mono-PERC'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Inverter Make * (Multiple Selection)</Label>
                      <div className="space-y-2">
                        {inverterMakes.map((make) => (
                          <div key={make} className="flex items-center space-x-2">
                            <Checkbox
                              id={`on-grid-inverter-${make}`}
                              checked={formData.onGridConfig?.inverterMake?.includes(make) || false}
                              onCheckedChange={(checked) => {
                                const currentMakes = formData.onGridConfig?.inverterMake || [];
                                const newMakes = checked
                                  ? [...currentMakes, make]
                                  : currentMakes.filter(m => m !== make);
                                updateConfig('onGridConfig', { inverterMake: newMakes });
                              }}
                            />
                            <Label htmlFor={`on-grid-inverter-${make}`} className="text-sm">
                              {make.toUpperCase()}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Label>Inverter KW</Label>
                      <Combobox
                        value={formData.onGridConfig.inverterKW?.toString() || ''}
                        onChange={(value) => {
                          const numericValue = value.replace(/KW$/i, '').trim();
                          const numValue = parseFloat(numericValue);
                          if (numericValue === '') {
                            updateConfig('onGridConfig', {
                              inverterKW: undefined,
                              inverterPhase: 'single_phase',
                              electricalCount: 0
                            });
                          } else if (!isNaN(numValue)) {
                            const phase = numValue < 6 ? 'single_phase' : 'three_phase';
                            const electricalCount = formData.onGridConfig?.electricalAccessories ? numValue : 0;
                            updateConfig('onGridConfig', {
                              inverterKW: numValue,
                              inverterPhase: phase,
                              electricalCount
                            });
                          }
                        }}
                        options={[
                          { value: '3', label: '3 KW' },
                          { value: '4', label: '4 KW' },
                          { value: '5', label: '5 KW' },
                          { value: '6', label: '6 KW' },
                          { value: '10', label: '10 KW' },
                          { value: '15', label: '15 KW' },
                          { value: '30', label: '30 KW' },
                        ]}
                        placeholder="Select or type KW (auto-selects phase)"
                        searchPlaceholder="Search KW..."
                        emptyMessage="No KW option found."
                        allowCustom={true}
                        formatCustomValue={(val) => val ? `${val} KW` : val}
                      />
                    </div>

                    <div>
                      <Label>Inverter Phase (Auto-selected)</Label>
                      <Select
                        value={formData.onGridConfig.inverterPhase}
                        onValueChange={(value) => updateConfig('onGridConfig', { inverterPhase: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Phase based on KW" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single_phase">Single Phase (&lt; 6 KW)</SelectItem>
                          <SelectItem value="three_phase">Three Phase (≥ 6 KW)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Inverter Qty</Label>
                      <Input
                        type="number"
                        value={formData.onGridConfig.inverterQty || ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          const qty = value === '' ? 1 : parseInt(value) || 1;
                          updateConfig('onGridConfig', {
                            inverterQty: qty
                          });
                        }}
                        min="1"
                        placeholder="Enter inverter quantity"
                      />
                    </div>

                    <div>
                      <Label>Earth Connection * (Multiple Selection)</Label>
                      <div className="space-y-2">
                        {earthingTypes.map((type) => (
                          <div key={type} className="flex items-center space-x-2">
                            <Checkbox
                              id={`on-grid-earth-${type}`}
                              checked={formData.onGridConfig?.earth?.includes(type) || false}
                              onCheckedChange={(checked) => {
                                const currentEarth = formData.onGridConfig?.earth || [];
                                const newEarth = checked
                                  ? [...currentEarth, type]
                                  : currentEarth.filter(e => e !== type);
                                updateConfig('onGridConfig', { earth: newEarth });
                              }}
                            />
                            <Label htmlFor={`on-grid-earth-${type}`} className="text-sm">
                              {type === 'ac_dc' ? 'AC/DC' : type.toUpperCase()}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Label>DCR Panel Count</Label>
                      <Input
                        type="number"
                        value={formData.onGridConfig.dcrPanelCount}
                        onChange={(e) => {
                          const value = e.target.value;
                          const dcrCount = value === '' ? '' : parseInt(value) || 0;
                          if (dcrCount !== '') {
                            const totalCount = dcrCount + (formData.onGridConfig?.nonDcrPanelCount || 0);
                            updateConfig('onGridConfig', {
                              dcrPanelCount: dcrCount,
                              panelCount: totalCount
                            });
                          } else {
                            updateConfig('onGridConfig', { dcrPanelCount: dcrCount });
                          }
                        }}
                        onBlur={(e) => {
                          if (e.target.value === '') {
                            const totalCount = 0 + (formData.onGridConfig?.nonDcrPanelCount || 0);
                            updateConfig('onGridConfig', {
                              dcrPanelCount: 0,
                              panelCount: totalCount
                            });
                          }
                        }}
                        min="0"
                        placeholder="Enter DCR panel count"
                      />
                    </div>

                    <div>
                      <Label>NON DCR Panel Count</Label>
                      <Input
                        type="number"
                        value={formData.onGridConfig.nonDcrPanelCount}
                        onChange={(e) => {
                          const value = e.target.value;
                          const nonDcrCount = value === '' ? '' : parseInt(value) || 0;
                          if (nonDcrCount !== '') {
                            const totalCount = (formData.onGridConfig?.dcrPanelCount || 0) + nonDcrCount;
                            updateConfig('onGridConfig', {
                              nonDcrPanelCount: nonDcrCount,
                              panelCount: totalCount
                            });
                          } else {
                            updateConfig('onGridConfig', { nonDcrPanelCount: nonDcrCount });
                          }
                        }}
                        onBlur={(e) => {
                          if (e.target.value === '') {
                            const totalCount = (formData.onGridConfig?.dcrPanelCount || 0) + 0;
                            updateConfig('onGridConfig', {
                              nonDcrPanelCount: 0,
                              panelCount: totalCount
                            });
                          }
                        }}
                        min="0"
                        placeholder="Enter NON DCR panel count"
                      />
                    </div>

                    <div>
                      <Label>Total Panel Count (Auto-calculated)</Label>
                      <Input
                        type="number"
                        value={formData.onGridConfig.panelCount}
                        disabled
                        className="bg-gray-100 cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <Label>Floor Level *</Label>
                      <Select
                        value={formData.onGridConfig.floor || '0'}
                        onValueChange={(value) => updateConfig('onGridConfig', { floor: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select floor level" />
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

                    <div>
                      <Label>Project Value (₹)</Label>
                      <Input
                        type="number"
                        value={formData.onGridConfig.projectValue}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '') {
                            updateConfig('onGridConfig', { projectValue: '' as any });
                          } else {
                            updateConfig('onGridConfig', { projectValue: parseInt(value) || 0 });
                          }
                        }}
                        onBlur={(e) => {
                          const value = e.target.value;
                          if (value === '') {
                            updateConfig('onGridConfig', { projectValue: 0 });
                          }
                        }}
                        min="0"
                      />
                    </div>
                  </div>

                  {/* Structure Details Section */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm text-gray-700">Structure Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Structure Type *</Label>
                        <Select
                          value={formData.onGridConfig.structureType || 'gp_structure'}
                          onValueChange={(value) => updateConfig('onGridConfig', { structureType: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select structure type" />
                          </SelectTrigger>
                          <SelectContent>
                            {structureTypes.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type === 'gp_structure' ? 'GP Structure' :
                                  type === 'mono_rail' ? 'Mono Rail' :
                                    type === 'gi_structure' ? 'GI Structure' :
                                      type === 'gi_round_pipe' ? 'GI Round Pipe' :
                                        'MS Square Pipe'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {(formData.onGridConfig.structureType === 'gp_structure' ||
                        formData.onGridConfig.structureType === 'gi_structure' ||
                        formData.onGridConfig.structureType === 'gi_round_pipe' ||
                        formData.onGridConfig.structureType === 'ms_square_pipe') && (
                          <>
                            <div>
                              <Label>Lower End Height (ft)</Label>
                              <Input
                                type="number"
                                placeholder="e.g., 3"
                                value={formData.onGridConfig?.gpStructure?.lowerEndHeight || ''}
                                onChange={(e) => updateConfig('onGridConfig', {
                                  gpStructure: {
                                    ...formData.onGridConfig?.gpStructure,
                                    lowerEndHeight: e.target.value
                                  }
                                })}
                              />
                            </div>
                            <div>
                              <Label>Higher End Height (ft)</Label>
                              <Input
                                type="number"
                                placeholder="e.g., 4"
                                value={formData.onGridConfig?.gpStructure?.higherEndHeight || ''}
                                onChange={(e) => updateConfig('onGridConfig', {
                                  gpStructure: {
                                    ...formData.onGridConfig?.gpStructure,
                                    higherEndHeight: e.target.value
                                  }
                                })}
                              />
                            </div>
                          </>
                        )}

                      {formData.onGridConfig.structureType === 'mono_rail' && (
                        <div>
                          <Label>Mono Rail Type</Label>
                          <Select
                            value={formData.onGridConfig?.monoRail?.type || 'mini_rail'}
                            onValueChange={(value) => updateConfig('onGridConfig', {
                              monoRail: {
                                ...formData.onGridConfig?.monoRail,
                                type: value
                              }
                            })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select mono rail type" />
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
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm text-gray-700">Work Scope</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Civil Work Scope</Label>
                        <Select
                          value={formData.onGridConfig.civilWorkScope || 'customer_scope'}
                          onValueChange={(value) => updateConfig('onGridConfig', { civilWorkScope: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select work scope" />
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

                      <div>
                        <Label>Net Meter Scope</Label>
                        <Select
                          value={formData.onGridConfig.netMeterScope || 'customer_scope'}
                          onValueChange={(value) => updateConfig('onGridConfig', { netMeterScope: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select net meter scope" />
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

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="lightningArrest"
                      checked={formData.onGridConfig.lightningArrest}
                      onCheckedChange={(checked) => updateConfig('onGridConfig', { lightningArrest: checked })}
                    />
                    <Label htmlFor="lightningArrest">Lightning Arrestor Required</Label>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="electricalAccessories"
                        checked={formData.onGridConfig.electricalAccessories || false}
                        onCheckedChange={(checked) => {
                          updateConfig('onGridConfig', {
                            electricalAccessories: checked as boolean,
                            electricalCount: checked ? (formData.onGridConfig?.inverterKW || 0) : 0
                          });
                        }}
                      />
                      <Label htmlFor="electricalAccessories">Electrical Accessories</Label>
                    </div>

                    {formData.onGridConfig.electricalAccessories && (
                      <div>
                        <Label>Electrical Count (Auto-filled from Inverter KW)</Label>
                        <Input
                          type="number"
                          value={formData.onGridConfig.electricalCount || 0}
                          disabled
                          className="bg-gray-100 cursor-not-allowed"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <Label>Additional Notes</Label>
                    <Textarea
                      value={formData.onGridConfig.others || ''}
                      onChange={(e) => updateConfig('onGridConfig', { others: e.target.value })}
                      placeholder="Any additional specifications or notes..."
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* OFF-GRID Configuration */}
            {formData.projectType === 'off_grid' && formData.offGridConfig && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Battery className="h-5 w-5" />
                    Off-Grid Solar System Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Solar Panel Make * (Multiple Selection)</Label>
                      <div className="space-y-2">
                        {solarPanelBrands.map((brand) => (
                          <div key={brand} className="flex items-center space-x-2">
                            <Checkbox
                              id={`off-grid-panel-${brand}`}
                              checked={formData.offGridConfig?.solarPanelMake?.includes(brand) || false}
                              onCheckedChange={(checked) => {
                                const currentMakes = formData.offGridConfig?.solarPanelMake || [];
                                const newMakes = checked
                                  ? [...currentMakes, brand]
                                  : currentMakes.filter(m => m !== brand);
                                updateConfig('offGridConfig', { solarPanelMake: newMakes });
                              }}
                            />
                            <Label htmlFor={`off-grid-panel-${brand}`} className="text-sm">
                              {brand.replace('_', ' ').toUpperCase()}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Label>Panel Type *</Label>
                      <Select
                        value={formData.offGridConfig.panelType}
                        onValueChange={(value) => updateConfig('offGridConfig', { panelType: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select panel type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bifacial">Bifacial</SelectItem>
                          <SelectItem value="topcon">Topcon</SelectItem>
                          <SelectItem value="mono_perc">Mono-PERC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Panel Watts</Label>
                      <Combobox
                        value={formData.offGridConfig.panelWatts}
                        onChange={(value) => {
                          const numericValue = value.replace(/W$/i, '').trim();
                          updateConfig('offGridConfig', { panelWatts: numericValue });
                        }}
                        options={panelWatts.map((watts) => ({ value: watts, label: `${watts}W` }))}
                        placeholder="Select or type wattage"
                        searchPlaceholder="Search wattage..."
                        emptyMessage="No wattage found."
                        allowCustom={true}
                        formatCustomValue={(val) => val ? `${val}W` : val}
                      />
                    </div>

                    <div>
                      <Label>DCR Panel Count</Label>
                      <Input
                        type="number"
                        value={formData.offGridConfig.dcrPanelCount ?? 0}
                        onChange={(e) => {
                          const value = e.target.value;
                          const dcrCount = value === '' ? null : parseInt(value);
                          const nonDcrCount = formData.offGridConfig?.nonDcrPanelCount ?? 0;
                          updateConfig('offGridConfig', {
                            dcrPanelCount: dcrCount,
                            panelCount: (dcrCount ?? 0) + nonDcrCount
                          });
                        }}
                        onBlur={(e) => {
                          if (e.target.value === '') {
                            const nonDcrCount = formData.offGridConfig?.nonDcrPanelCount ?? 0;
                            updateConfig('offGridConfig', {
                              dcrPanelCount: 0,
                              panelCount: nonDcrCount
                            });
                          }
                        }}
                        min="0"
                        placeholder="Enter DCR panel count"
                      />
                    </div>

                    <div>
                      <Label>NON-DCR Panel Count</Label>
                      <Input
                        type="number"
                        value={formData.offGridConfig.nonDcrPanelCount ?? 0}
                        onChange={(e) => {
                          const value = e.target.value;
                          const nonDcrCount = value === '' ? null : parseInt(value);
                          const dcrCount = formData.offGridConfig?.dcrPanelCount ?? 0;
                          updateConfig('offGridConfig', {
                            nonDcrPanelCount: nonDcrCount,
                            panelCount: dcrCount + (nonDcrCount ?? 0)
                          });
                        }}
                        onBlur={(e) => {
                          if (e.target.value === '') {
                            const dcrCount = formData.offGridConfig?.dcrPanelCount ?? 0;
                            updateConfig('offGridConfig', {
                              nonDcrPanelCount: 0,
                              panelCount: dcrCount
                            });
                          }
                        }}
                        min="0"
                        placeholder="Enter NON-DCR panel count"
                      />
                    </div>

                    <div>
                      <Label>Total Panel Count (Auto-calculated)</Label>
                      <Input
                        type="number"
                        value={formData.offGridConfig.panelCount || 0}
                        disabled
                        className="bg-gray-100 cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <Label>Inverter Make * (Multiple Selection)</Label>
                      <div className="space-y-2">
                        {inverterMakes.map((make) => (
                          <div key={make} className="flex items-center space-x-2">
                            <Checkbox
                              id={`off-grid-inverter-${make}`}
                              checked={formData.offGridConfig?.inverterMake?.includes(make) || false}
                              onCheckedChange={(checked) => {
                                const currentMakes = formData.offGridConfig?.inverterMake || [];
                                const newMakes = checked
                                  ? [...currentMakes, make]
                                  : currentMakes.filter(m => m !== make);
                                updateConfig('offGridConfig', { inverterMake: newMakes });
                              }}
                            />
                            <Label htmlFor={`off-grid-inverter-${make}`} className="text-sm">
                              {make.toUpperCase()}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Label>Inverter KW</Label>
                      <Combobox
                        value={formData.offGridConfig.inverterKW?.toString() || ''}
                        onChange={(value) => {
                          const numericValue = value.replace(/KW$/i, '').trim();
                          const numValue = parseFloat(numericValue);
                          if (numericValue === '') {
                            updateConfig('offGridConfig', {
                              inverterKW: undefined,
                              inverterPhase: 'single_phase',
                              electricalCount: 0
                            });
                          } else if (!isNaN(numValue)) {
                            const phase = numValue < 6 ? 'single_phase' : 'three_phase';
                            const electricalCount = formData.offGridConfig?.electricalAccessories ? numValue : 0;
                            updateConfig('offGridConfig', {
                              inverterKW: numValue,
                              inverterPhase: phase,
                              electricalCount
                            });
                          }
                        }}
                        options={[
                          { value: '3', label: '3 KW' },
                          { value: '4', label: '4 KW' },
                          { value: '5', label: '5 KW' },
                          { value: '6', label: '6 KW' },
                          { value: '10', label: '10 KW' },
                          { value: '15', label: '15 KW' },
                          { value: '30', label: '30 KW' },
                        ]}
                        placeholder="Select or type KW (auto-selects phase)"
                        searchPlaceholder="Search KW..."
                        emptyMessage="No KW option found."
                        allowCustom={true}
                        formatCustomValue={(val) => val ? `${val} KW` : val}
                      />
                    </div>

                    <div>
                      <Label>Inverter Phase (Auto-selected)</Label>
                      <Select
                        value={formData.offGridConfig.inverterPhase}
                        onValueChange={(value) => updateConfig('offGridConfig', { inverterPhase: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Phase based on KW" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single_phase">Single Phase (&lt; 6 KW)</SelectItem>
                          <SelectItem value="three_phase">Three Phase (≥ 6 KW)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Inverter Qty</Label>
                      <Input
                        type="number"
                        value={formData.offGridConfig.inverterQty || ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          const qty = value === '' ? 1 : parseInt(value) || 1;
                          updateConfig('offGridConfig', {
                            inverterQty: qty
                          });
                        }}
                        min="1"
                        placeholder="Enter inverter quantity"
                      />
                    </div>

                    <div>
                      <Label>Inverter KVA</Label>
                      <Input
                        type="text"
                        value={formData.offGridConfig.inverterKVA || ''}
                        onChange={(e) => {
                          updateConfig('offGridConfig', {
                            inverterKVA: e.target.value
                          });
                        }}
                        placeholder="Enter inverter KVA rating"
                        data-testid="input-offgrid-inverter-kva"
                      />
                    </div>

                    <div>
                      <Label>Inverter Volt</Label>
                      <Combobox
                        value={formData.offGridConfig.inverterVolt || ''}
                        onChange={(value) => {
                          const numericValue = value.replace(/V$/i, '').trim();
                          updateConfig('offGridConfig', { inverterVolt: numericValue });
                        }}
                        options={inverterVoltOptions.map((volt) => ({ value: volt, label: `${volt}V` }))}
                        placeholder="Select or type voltage"
                        searchPlaceholder="Search voltage..."
                        emptyMessage="No voltage option found."
                        allowCustom={true}
                        formatCustomValue={(val) => val ? `${val}V` : val}
                      />
                    </div>

                    <div>
                      <Label>Battery Brand *</Label>
                      <BatteryBrandCombobox
                        value={formData.offGridConfig.batteryBrand}
                        onValueChange={(value) => updateConfig('offGridConfig', { batteryBrand: value })}
                        placeholder="Select or type battery brand..."
                      />
                    </div>

                    <div>
                      <Label>Battery Type</Label>
                      <Select
                        value={formData.offGridConfig.batteryType || ''}
                        onValueChange={(value) => updateConfig('offGridConfig', { batteryType: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select battery type" />
                        </SelectTrigger>
                        <SelectContent>
                          {batteryTypes.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type === 'lead_acid' ? 'Lead Acid' : 'Lithium'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Battery AH</Label>
                      <Select
                        value={formData.offGridConfig.batteryAH || ''}
                        onValueChange={(value) => updateConfig('offGridConfig', { batteryAH: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select battery AH" />
                        </SelectTrigger>
                        <SelectContent>
                          {batteryAHOptions.map((ah) => (
                            <SelectItem key={ah} value={ah}>
                              {ah} AH
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Battery Count</Label>
                      <Input
                        type="number"
                        value={formData.offGridConfig.batteryCount}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '') {
                            updateConfig('offGridConfig', { batteryCount: '' as any });
                          } else {
                            updateConfig('offGridConfig', { batteryCount: parseInt(value) || 1 });
                          }
                        }}
                        onBlur={(e) => {
                          const value = e.target.value;
                          if (value === '' || value === '0') {
                            updateConfig('offGridConfig', { batteryCount: 1 });
                          }
                        }}
                        min="1"
                      />
                    </div>

                    <div>
                      <Label>Battery Voltage</Label>
                      <Input
                        type="number"
                        value={formData.offGridConfig.voltage}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '') {
                            updateConfig('offGridConfig', { voltage: '' as any });
                          } else {
                            updateConfig('offGridConfig', { voltage: parseInt(value) || 12 });
                          }
                        }}
                        onBlur={(e) => {
                          const value = e.target.value;
                          if (value === '') {
                            updateConfig('offGridConfig', { voltage: 12 });
                          }
                        }}
                        placeholder="12V, 24V, 48V etc"
                      />
                    </div>

                    <div>
                      <Label>Earth Connection * (Multiple Selection)</Label>
                      <div className="space-y-2">
                        {earthingTypes.map((type) => (
                          <div key={type} className="flex items-center space-x-2">
                            <Checkbox
                              id={`off-grid-earth-${type}`}
                              checked={formData.offGridConfig?.earth?.includes(type) || false}
                              onCheckedChange={(checked) => {
                                const currentEarth = formData.offGridConfig?.earth || [];
                                const newEarth = checked
                                  ? [...currentEarth, type]
                                  : currentEarth.filter(e => e !== type);
                                updateConfig('offGridConfig', { earth: newEarth });
                              }}
                            />
                            <Label htmlFor={`off-grid-earth-${type}`} className="text-sm">
                              {type === 'ac_dc' ? 'AC/DC' : type.toUpperCase()}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Label>Floor Level *</Label>
                      <Select
                        value={formData.offGridConfig.floor || '0'}
                        onValueChange={(value) => updateConfig('offGridConfig', { floor: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select floor level" />
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

                    <div>
                      <Label>Project Value (₹)</Label>
                      <Input
                        type="number"
                        value={formData.offGridConfig.projectValue}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '') {
                            updateConfig('offGridConfig', { projectValue: '' as any });
                          } else {
                            updateConfig('offGridConfig', { projectValue: parseInt(value) || 0 });
                          }
                        }}
                        onBlur={(e) => {
                          const value = e.target.value;
                          if (value === '') {
                            updateConfig('offGridConfig', { projectValue: 0 });
                          }
                        }}
                        min="0"
                      />
                    </div>
                  </div>

                  {/* Structure Details Section for Off-Grid */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm text-gray-700">Structure Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Structure Type *</Label>
                        <Select
                          value={formData.offGridConfig.structureType || 'gp_structure'}
                          onValueChange={(value) => updateConfig('offGridConfig', { structureType: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select structure type" />
                          </SelectTrigger>
                          <SelectContent>
                            {structureTypes.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type === 'gp_structure' ? 'GP Structure' :
                                  type === 'mono_rail' ? 'Mono Rail' :
                                    type === 'gi_structure' ? 'GI Structure' :
                                      type === 'gi_round_pipe' ? 'GI Round Pipe' :
                                        'MS Square Pipe'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {(formData.offGridConfig.structureType === 'gp_structure' ||
                        formData.offGridConfig.structureType === 'gi_structure' ||
                        formData.offGridConfig.structureType === 'gi_round_pipe' ||
                        formData.offGridConfig.structureType === 'ms_square_pipe') && (
                          <>
                            <div>
                              <Label>Lower End Height (ft)</Label>
                              <Input
                                type="number"
                                placeholder="e.g., 3"
                                value={formData.offGridConfig?.gpStructure?.lowerEndHeight || ''}
                                onChange={(e) => updateConfig('offGridConfig', {
                                  gpStructure: {
                                    ...formData.offGridConfig?.gpStructure,
                                    lowerEndHeight: e.target.value
                                  }
                                })}
                              />
                            </div>
                            <div>
                              <Label>Higher End Height (ft)</Label>
                              <Input
                                type="number"
                                placeholder="e.g., 4"
                                value={formData.offGridConfig?.gpStructure?.higherEndHeight || ''}
                                onChange={(e) => updateConfig('offGridConfig', {
                                  gpStructure: {
                                    ...formData.offGridConfig?.gpStructure,
                                    higherEndHeight: e.target.value
                                  }
                                })}
                              />
                            </div>
                          </>
                        )}

                      {formData.offGridConfig.structureType === 'mono_rail' && (
                        <div>
                          <Label>Mono Rail Type</Label>
                          <Select
                            value={formData.offGridConfig?.monoRail?.type || 'mini_rail'}
                            onValueChange={(value) => updateConfig('offGridConfig', {
                              monoRail: {
                                ...formData.offGridConfig?.monoRail,
                                type: value
                              }
                            })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select mono rail type" />
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

                  {/* Work Scope Section for Off-Grid */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm text-gray-700">Work Scope</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Civil Work Scope</Label>
                        <Select
                          value={formData.offGridConfig.civilWorkScope || 'customer_scope'}
                          onValueChange={(value) => updateConfig('offGridConfig', { civilWorkScope: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select work scope" />
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

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="offgrid-lightningArrest"
                      checked={formData.offGridConfig.lightningArrest}
                      onCheckedChange={(checked) => updateConfig('offGridConfig', { lightningArrest: checked })}
                    />
                    <Label htmlFor="offgrid-lightningArrest">Lightning Arrestor Required</Label>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="offgrid-electricalAccessories"
                        checked={formData.offGridConfig.electricalAccessories || false}
                        onCheckedChange={(checked) => {
                          updateConfig('offGridConfig', {
                            electricalAccessories: checked as boolean,
                            electricalCount: checked ? (formData.offGridConfig?.inverterKW || 0) : 0
                          });
                        }}
                      />
                      <Label htmlFor="offgrid-electricalAccessories">Electrical Accessories</Label>
                    </div>

                    {formData.offGridConfig.electricalAccessories && (
                      <div>
                        <Label>Electrical Count (Auto-filled from Inverter KW)</Label>
                        <Input
                          type="number"
                          value={formData.offGridConfig.electricalCount || 0}
                          disabled
                          className="bg-gray-100 cursor-not-allowed"
                        />
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded">
                    <Checkbox
                      id="offgrid-amc-checkbox"
                      checked={formData.offGridConfig?.amcIncluded ?? false}
                      onCheckedChange={(checked) => updateConfig('offGridConfig', { amcIncluded: checked })}
                      data-testid="checkbox-offgrid-amc"
                    />
                    <Label htmlFor="offgrid-amc-checkbox" className="text-sm font-medium text-blue-900 dark:text-blue-100 cursor-pointer flex-1">
                      ✓ Include Annual Maintenance Contract (AMC)
                    </Label>
                  </div>

                  <div>
                    <Label>Additional Notes</Label>
                    <Textarea
                      value={formData.offGridConfig.others || ''}
                      onChange={(e) => updateConfig('offGridConfig', { others: e.target.value })}
                      placeholder="Any additional specifications or notes..."
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* HYBRID Configuration */}
            {formData.projectType === 'hybrid' && formData.hybridConfig && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    Hybrid Solar System Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Solar Panel Make * (Multiple Selection)</Label>
                      <div className="space-y-2">
                        {solarPanelBrands.map((brand) => (
                          <div key={brand} className="flex items-center space-x-2">
                            <Checkbox
                              id={`hybrid-panel-${brand}`}
                              checked={formData.hybridConfig?.solarPanelMake?.includes(brand) || false}
                              onCheckedChange={(checked) => {
                                const currentMakes = formData.hybridConfig?.solarPanelMake || [];
                                const newMakes = checked
                                  ? [...currentMakes, brand]
                                  : currentMakes.filter(m => m !== brand);
                                updateConfig('hybridConfig', { solarPanelMake: newMakes });
                              }}
                            />
                            <Label htmlFor={`hybrid-panel-${brand}`} className="text-sm">
                              {brand.replace('_', ' ').toUpperCase()}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Label>Panel Type *</Label>
                      <Select
                        value={formData.hybridConfig.panelType}
                        onValueChange={(value) => updateConfig('hybridConfig', { panelType: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select panel type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bifacial">Bifacial</SelectItem>
                          <SelectItem value="topcon">Topcon</SelectItem>
                          <SelectItem value="mono_perc">Mono-PERC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Panel Watts</Label>
                      <Combobox
                        value={formData.hybridConfig.panelWatts}
                        onChange={(value) => {
                          const numericValue = value.replace(/W$/i, '').trim();
                          updateConfig('hybridConfig', { panelWatts: numericValue });
                        }}
                        options={panelWatts.map((watts) => ({ value: watts, label: `${watts}W` }))}
                        placeholder="Select or type wattage"
                        searchPlaceholder="Search wattage..."
                        emptyMessage="No wattage found."
                        allowCustom={true}
                        formatCustomValue={(val) => val ? `${val}W` : val}
                      />
                    </div>

                    <div>
                      <Label>DCR Panel Count</Label>
                      <Input
                        type="number"
                        value={formData.hybridConfig.dcrPanelCount ?? 0}
                        onChange={(e) => {
                          const value = e.target.value;
                          const dcrCount = value === '' ? null : parseInt(value);
                          const nonDcrCount = formData.hybridConfig?.nonDcrPanelCount ?? 0;
                          updateConfig('hybridConfig', {
                            dcrPanelCount: dcrCount,
                            panelCount: (dcrCount ?? 0) + nonDcrCount
                          });
                        }}
                        onBlur={(e) => {
                          if (e.target.value === '') {
                            const nonDcrCount = formData.hybridConfig?.nonDcrPanelCount ?? 0;
                            updateConfig('hybridConfig', {
                              dcrPanelCount: 0,
                              panelCount: nonDcrCount
                            });
                          }
                        }}
                        min="0"
                        placeholder="Enter DCR panel count"
                      />
                    </div>

                    <div>
                      <Label>NON-DCR Panel Count</Label>
                      <Input
                        type="number"
                        value={formData.hybridConfig.nonDcrPanelCount ?? 0}
                        onChange={(e) => {
                          const value = e.target.value;
                          const nonDcrCount = value === '' ? null : parseInt(value);
                          const dcrCount = formData.hybridConfig?.dcrPanelCount ?? 0;
                          updateConfig('hybridConfig', {
                            nonDcrPanelCount: nonDcrCount,
                            panelCount: dcrCount + (nonDcrCount ?? 0)
                          });
                        }}
                        onBlur={(e) => {
                          if (e.target.value === '') {
                            const dcrCount = formData.hybridConfig?.dcrPanelCount ?? 0;
                            updateConfig('hybridConfig', {
                              nonDcrPanelCount: 0,
                              panelCount: dcrCount
                            });
                          }
                        }}
                        min="0"
                        placeholder="Enter NON-DCR panel count"
                      />
                    </div>

                    <div>
                      <Label>Total Panel Count (Auto-calculated)</Label>
                      <Input
                        type="number"
                        value={formData.hybridConfig.panelCount || 0}
                        disabled
                        className="bg-gray-100 cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <Label>Inverter Make * (Multiple Selection)</Label>
                      <div className="space-y-2">
                        {inverterMakes.map((make) => (
                          <div key={make} className="flex items-center space-x-2">
                            <Checkbox
                              id={`hybrid-inverter-${make}`}
                              checked={formData.hybridConfig?.inverterMake?.includes(make) || false}
                              onCheckedChange={(checked) => {
                                const currentMakes = formData.hybridConfig?.inverterMake || [];
                                const newMakes = checked
                                  ? [...currentMakes, make]
                                  : currentMakes.filter(m => m !== make);
                                updateConfig('hybridConfig', { inverterMake: newMakes });
                              }}
                            />
                            <Label htmlFor={`hybrid-inverter-${make}`} className="text-sm">
                              {make.toUpperCase()}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Label>Inverter KW</Label>
                      <Combobox
                        value={formData.hybridConfig.inverterKW?.toString() || ''}
                        onChange={(value) => {
                          const numericValue = value.replace(/KW$/i, '').trim();
                          const numValue = parseFloat(numericValue);
                          if (numericValue === '') {
                            updateConfig('hybridConfig', {
                              inverterKW: undefined,
                              inverterPhase: 'single_phase',
                              electricalCount: 0
                            });
                          } else if (!isNaN(numValue)) {
                            const phase = numValue < 6 ? 'single_phase' : 'three_phase';
                            const electricalCount = formData.hybridConfig?.electricalAccessories ? numValue : 0;
                            updateConfig('hybridConfig', {
                              inverterKW: numValue,
                              inverterPhase: phase,
                              electricalCount
                            });
                          }
                        }}
                        options={[
                          { value: '3', label: '3 KW' },
                          { value: '4', label: '4 KW' },
                          { value: '5', label: '5 KW' },
                          { value: '6', label: '6 KW' },
                          { value: '10', label: '10 KW' },
                          { value: '15', label: '15 KW' },
                          { value: '30', label: '30 KW' },
                        ]}
                        placeholder="Select or type KW (auto-selects phase)"
                        searchPlaceholder="Search KW..."
                        emptyMessage="No KW option found."
                        allowCustom={true}
                        formatCustomValue={(val) => val ? `${val} KW` : val}
                      />
                    </div>

                    <div>
                      <Label>Inverter Phase (Auto-selected)</Label>
                      <Select
                        value={formData.hybridConfig.inverterPhase}
                        onValueChange={(value) => updateConfig('hybridConfig', { inverterPhase: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Phase based on KW" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single_phase">Single Phase (&lt; 6 KW)</SelectItem>
                          <SelectItem value="three_phase">Three Phase (≥ 6 KW)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Inverter Qty</Label>
                      <Input
                        type="number"
                        value={formData.hybridConfig.inverterQty || ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          const qty = value === '' ? 1 : parseInt(value) || 1;
                          updateConfig('hybridConfig', {
                            inverterQty: qty
                          });
                        }}
                        min="1"
                        placeholder="Enter inverter quantity"
                      />
                    </div>

                    <div>
                      <Label>Inverter KVA</Label>
                      <Input
                        type="text"
                        value={formData.hybridConfig.inverterKVA || ''}
                        onChange={(e) => {
                          updateConfig('hybridConfig', {
                            inverterKVA: e.target.value
                          });
                        }}
                        placeholder="Enter inverter KVA rating"
                        data-testid="input-hybrid-inverter-kva"
                      />
                    </div>

                    <div>
                      <Label>Inverter Volt</Label>
                      <Combobox
                        value={formData.hybridConfig.inverterVolt || ''}
                        onChange={(value) => {
                          const numericValue = value.replace(/V$/i, '').trim();
                          updateConfig('hybridConfig', { inverterVolt: numericValue });
                        }}
                        options={inverterVoltOptions.map((volt) => ({ value: volt, label: `${volt}V` }))}
                        placeholder="Select or type voltage"
                        searchPlaceholder="Search voltage..."
                        emptyMessage="No voltage option found."
                        allowCustom={true}
                        formatCustomValue={(val) => val ? `${val}V` : val}
                      />
                    </div>

                    <div>
                      <Label>Battery Brand *</Label>
                      <BatteryBrandCombobox
                        value={formData.hybridConfig.batteryBrand}
                        onValueChange={(value) => updateConfig('hybridConfig', { batteryBrand: value })}
                        placeholder="Select or type battery brand..."
                      />
                    </div>

                    <div>
                      <Label>Battery Type</Label>
                      <Select
                        value={formData.hybridConfig.batteryType || ''}
                        onValueChange={(value) => updateConfig('hybridConfig', { batteryType: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select battery type" />
                        </SelectTrigger>
                        <SelectContent>
                          {batteryTypes.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type === 'lead_acid' ? 'Lead Acid' : 'Lithium'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Battery AH</Label>
                      <Select
                        value={formData.hybridConfig.batteryAH || ''}
                        onValueChange={(value) => updateConfig('hybridConfig', { batteryAH: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select battery AH" />
                        </SelectTrigger>
                        <SelectContent>
                          {batteryAHOptions.map((ah) => (
                            <SelectItem key={ah} value={ah}>
                              {ah} AH
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Battery Count</Label>
                      <Input
                        type="number"
                        value={formData.hybridConfig.batteryCount}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '') {
                            updateConfig('hybridConfig', { batteryCount: '' as any });
                          } else {
                            updateConfig('hybridConfig', { batteryCount: parseInt(value) || 1 });
                          }
                        }}
                        onBlur={(e) => {
                          const value = e.target.value;
                          if (value === '' || value === '0') {
                            updateConfig('hybridConfig', { batteryCount: 1 });
                          }
                        }}
                        min="1"
                      />
                    </div>

                    <div>
                      <Label>Battery Voltage</Label>
                      <Input
                        type="number"
                        value={formData.hybridConfig.voltage}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '') {
                            updateConfig('hybridConfig', { voltage: '' as any });
                          } else {
                            updateConfig('hybridConfig', { voltage: parseInt(value) || 12 });
                          }
                        }}
                        onBlur={(e) => {
                          const value = e.target.value;
                          if (value === '') {
                            updateConfig('hybridConfig', { voltage: 12 });
                          }
                        }}
                        placeholder="12V, 24V, 48V etc"
                      />
                    </div>

                    <div>
                      <Label>Earth Connection * (Multiple Selection)</Label>
                      <div className="space-y-2">
                        {earthingTypes.map((type) => (
                          <div key={type} className="flex items-center space-x-2">
                            <Checkbox
                              id={`hybrid-earth-${type}`}
                              checked={formData.hybridConfig?.earth?.includes(type) || false}
                              onCheckedChange={(checked) => {
                                const currentEarth = formData.hybridConfig?.earth || [];
                                const newEarth = checked
                                  ? [...currentEarth, type]
                                  : currentEarth.filter(e => e !== type);
                                updateConfig('hybridConfig', { earth: newEarth });
                              }}
                            />
                            <Label htmlFor={`hybrid-earth-${type}`} className="text-sm">
                              {type === 'ac_dc' ? 'AC/DC' : type.toUpperCase()}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Label>Floor Level *</Label>
                      <Select
                        value={formData.hybridConfig.floor || '0'}
                        onValueChange={(value) => updateConfig('hybridConfig', { floor: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select floor level" />
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

                    <div>
                      <Label>Project Value (₹)</Label>
                      <Input
                        type="number"
                        value={formData.hybridConfig.projectValue}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '') {
                            updateConfig('hybridConfig', { projectValue: '' as any });
                          } else {
                            updateConfig('hybridConfig', { projectValue: parseInt(value) || 0 });
                          }
                        }}
                        onBlur={(e) => {
                          const value = e.target.value;
                          if (value === '') {
                            updateConfig('hybridConfig', { projectValue: 0 });
                          }
                        }}
                        min="0"
                      />
                    </div>
                  </div>

                  {/* Structure Details Section for Hybrid */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm text-gray-700">Structure Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Structure Type *</Label>
                        <Select
                          value={formData.hybridConfig.structureType || 'gp_structure'}
                          onValueChange={(value) => updateConfig('hybridConfig', { structureType: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select structure type" />
                          </SelectTrigger>
                          <SelectContent>
                            {structureTypes.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type === 'gp_structure' ? 'GP Structure' :
                                  type === 'mono_rail' ? 'Mono Rail' :
                                    type === 'gi_structure' ? 'GI Structure' :
                                      type === 'gi_round_pipe' ? 'GI Round Pipe' :
                                        'MS Square Pipe'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {(formData.hybridConfig.structureType === 'gp_structure' ||
                        formData.hybridConfig.structureType === 'gi_structure' ||
                        formData.hybridConfig.structureType === 'gi_round_pipe' ||
                        formData.hybridConfig.structureType === 'ms_square_pipe') && (
                          <>
                            <div>
                              <Label>Lower End Height (ft)</Label>
                              <Input
                                type="number"
                                placeholder="e.g., 3"
                                value={formData.hybridConfig?.gpStructure?.lowerEndHeight || ''}
                                onChange={(e) => updateConfig('hybridConfig', {
                                  gpStructure: {
                                    ...formData.hybridConfig?.gpStructure,
                                    lowerEndHeight: e.target.value
                                  }
                                })}
                              />
                            </div>
                            <div>
                              <Label>Higher End Height (ft)</Label>
                              <Input
                                type="number"
                                placeholder="e.g., 4"
                                value={formData.hybridConfig?.gpStructure?.higherEndHeight || ''}
                                onChange={(e) => updateConfig('hybridConfig', {
                                  gpStructure: {
                                    ...formData.hybridConfig?.gpStructure,
                                    higherEndHeight: e.target.value
                                  }
                                })}
                              />
                            </div>
                          </>
                        )}

                      {formData.hybridConfig.structureType === 'mono_rail' && (
                        <div>
                          <Label>Mono Rail Type</Label>
                          <Select
                            value={formData.hybridConfig?.monoRail?.type || 'mini_rail'}
                            onValueChange={(value) => updateConfig('hybridConfig', {
                              monoRail: {
                                ...formData.hybridConfig?.monoRail,
                                type: value
                              }
                            })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select mono rail type" />
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

                  {/* Work Scope Section for Hybrid */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm text-gray-700">Work Scope</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Civil Work Scope</Label>
                        <Select
                          value={formData.hybridConfig.civilWorkScope || 'customer_scope'}
                          onValueChange={(value) => updateConfig('hybridConfig', { civilWorkScope: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select work scope" />
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

                      <div>
                        <Label>Electrical Work Scope</Label>
                        <Select
                          value={formData.hybridConfig.electricalWorkScope || 'customer_scope'}
                          onValueChange={(value) => updateConfig('hybridConfig', { electricalWorkScope: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select electrical work scope" />
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

                      <div>
                        <Label>Net Meter Scope</Label>
                        <Select
                          value={formData.hybridConfig.netMeterScope || 'customer_scope'}
                          onValueChange={(value) => updateConfig('hybridConfig', { netMeterScope: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select net meter scope" />
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

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="hybrid-lightningArrest"
                      checked={formData.hybridConfig.lightningArrest}
                      onCheckedChange={(checked) => updateConfig('hybridConfig', { lightningArrest: checked })}
                    />
                    <Label htmlFor="hybrid-lightningArrest">Lightning Arrestor Required</Label>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="hybrid-electricalAccessories"
                        checked={formData.hybridConfig.electricalAccessories || false}
                        onCheckedChange={(checked) => {
                          updateConfig('hybridConfig', {
                            electricalAccessories: checked as boolean,
                            electricalCount: checked ? (formData.hybridConfig?.inverterKW || 0) : 0
                          });
                        }}
                      />
                      <Label htmlFor="hybrid-electricalAccessories">Electrical Accessories</Label>
                    </div>

                    {formData.hybridConfig.electricalAccessories && (
                      <div>
                        <Label>Electrical Count (Auto-filled from Inverter KW)</Label>
                        <Input
                          type="number"
                          value={formData.hybridConfig.electricalCount || 0}
                          disabled
                          className="bg-gray-100 cursor-not-allowed"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <Label>Additional Notes</Label>
                    <Textarea
                      value={formData.hybridConfig.others || ''}
                      onChange={(e) => updateConfig('hybridConfig', { others: e.target.value })}
                      placeholder="Any additional specifications or notes..."
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* WATER HEATER Configuration */}
            {formData.projectType === 'water_heater' && formData.waterHeaterConfig && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Droplets className="h-5 w-5" />
                    Solar Water Heater Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Water Heater Brand *</Label>
                      <Select
                        value={formData.waterHeaterConfig.brand}
                        onValueChange={(value) => updateConfig('waterHeaterConfig', { brand: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select water heater brand" />
                        </SelectTrigger>
                        <SelectContent>
                          {waterHeaterBrands.map((brand) => (
                            <SelectItem key={brand} value={brand}>
                              {brand.replace('_', ' ').toUpperCase()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Capacity (Litre) *</Label>
                      <Input
                        type="number"
                        value={formData.waterHeaterConfig.litre}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '') {
                            updateConfig('waterHeaterConfig', { litre: '' as any });
                          } else {
                            updateConfig('waterHeaterConfig', { litre: parseInt(value) || 100 });
                          }
                        }}
                        onBlur={(e) => {
                          const value = e.target.value;
                          if (value === '' || parseInt(value) < 50) {
                            updateConfig('waterHeaterConfig', { litre: 100 });
                          }
                        }}
                        min="50"
                        placeholder="100, 150, 200, 300..."
                      />
                    </div>

                    <div>
                      <Label>Heating Coil Type</Label>
                      <Input
                        value={formData.waterHeaterConfig.heatingCoil || ''}
                        onChange={(e) => updateConfig('waterHeaterConfig', { heatingCoil: e.target.value })}
                        placeholder="Standard, Premium, etc."
                      />
                    </div>

                    <div>
                      <Label>Floor Level *</Label>
                      <Select
                        value={formData.waterHeaterConfig.floor || '0'}
                        onValueChange={(value) => updateConfig('waterHeaterConfig', { floor: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select floor level" />
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

                    <div>
                      <Label>Project Value (₹)</Label>
                      <Input
                        type="number"
                        value={formData.waterHeaterConfig.projectValue}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '') {
                            updateConfig('waterHeaterConfig', { projectValue: '' as any });
                          } else {
                            updateConfig('waterHeaterConfig', { projectValue: parseInt(value) || 0 });
                          }
                        }}
                        onBlur={(e) => {
                          const value = e.target.value;
                          if (value === '') {
                            updateConfig('waterHeaterConfig', { projectValue: 0 });
                          }
                        }}
                        min="0"
                      />
                    </div>

                    <div>
                      <Label>Quantity *</Label>
                      <Input
                        type="number"
                        value={formData.waterHeaterConfig.qty ?? 1}
                        onChange={(e) => {
                          const value = e.target.value;
                          const parsedValue = value === '' ? null : parseInt(value);
                          updateConfig('waterHeaterConfig', { qty: parsedValue });
                        }}
                        onBlur={(e) => {
                          const value = e.target.value;
                          if (value === '' || parseInt(value) < 1) {
                            updateConfig('waterHeaterConfig', { qty: 1 });
                          }
                        }}
                        min="1"
                        placeholder="1"
                      />
                    </div>

                    <div>
                      <Label>Water Heater Model *</Label>
                      <Select
                        value={formData.waterHeaterConfig.waterHeaterModel || 'non_pressurized'}
                        onValueChange={(value) => updateConfig('waterHeaterConfig', { waterHeaterModel: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select model type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pressurized">Pressurized</SelectItem>
                          <SelectItem value="non_pressurized">Non-Pressurized</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="water-heater-labour-transport"
                        checked={formData.waterHeaterConfig.labourAndTransport || false}
                        onCheckedChange={(checked) => updateConfig('waterHeaterConfig', { labourAndTransport: checked as boolean })}
                        data-testid="checkbox-water-heater-labour-transport"
                      />
                      <Label htmlFor="water-heater-labour-transport" className="font-normal cursor-pointer">
                        Labour and Transport
                      </Label>
                    </div>
                  </div>

                  {/* Work Scope Section for Water Heater */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm text-gray-700">Work Scope</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Plumbing Work Scope</Label>
                        <Select
                          value={formData.waterHeaterConfig.plumbingWorkScope || 'customer_scope'}
                          onValueChange={(value) => updateConfig('waterHeaterConfig', { plumbingWorkScope: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select plumbing work scope" />
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

                      <div>
                        <Label>Civil Work Scope</Label>
                        <Select
                          value={formData.waterHeaterConfig.civilWorkScope || 'customer_scope'}
                          onValueChange={(value) => updateConfig('waterHeaterConfig', { civilWorkScope: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select civil work scope" />
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

                  <div>
                    <Label>Additional Notes</Label>
                    <Textarea
                      value={formData.waterHeaterConfig.others || ''}
                      onChange={(e) => updateConfig('waterHeaterConfig', { others: e.target.value })}
                      placeholder="Any additional specifications or notes..."
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* WATER PUMP Configuration */}
            {formData.projectType === 'water_pump' && formData.waterPumpConfig && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Waves className="h-5 w-5" />
                    Solar Water Pump Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Drive HP *</Label>
                      <Select
                        value={formData.waterPumpConfig.driveHP || formData.waterPumpConfig.hp}
                        onValueChange={(value) => updateConfig('waterPumpConfig', { driveHP: value, hp: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select drive horsepower" />
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

                    <div>
                      <Label>Drive Type</Label>
                      <Select
                        value={formData.waterPumpConfig.drive}
                        onValueChange={(value) => updateConfig('waterPumpConfig', { drive: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select drive type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="vfd">VFD (Variable Frequency Drive)</SelectItem>
                          <SelectItem value="direct">Direct Drive</SelectItem>
                          <SelectItem value="submersible">Submersible</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Phase *</Label>
                      <Select
                        value={formData.waterPumpConfig.inverterPhase || 'single_phase'}
                        onValueChange={(value) => updateConfig('waterPumpConfig', { inverterPhase: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select phase" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single_phase">1 Phase (Single Phase)</SelectItem>
                          <SelectItem value="three_phase">3 Phase (Three Phase)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Quantity *</Label>
                      <Input
                        type="number"
                        min="1"
                        value={formData.waterPumpConfig.qty ?? 1}
                        onChange={(e) => {
                          const value = e.target.value;
                          const parsedValue = value === '' ? null : parseInt(value);
                          updateConfig('waterPumpConfig', { qty: parsedValue });
                        }}
                        onBlur={(e) => {
                          const value = e.target.value;
                          if (value === '' || parseInt(value) < 1) {
                            updateConfig('waterPumpConfig', { qty: 1 });
                          }
                        }}
                        placeholder="1"
                        data-testid="input-water-pump-qty"
                      />
                    </div>

                    <div>
                      <Label>Panel Brand * (Multiple Selection)</Label>
                      <div className="space-y-2">
                        {solarPanelBrands.map((brand) => (
                          <div key={brand} className="flex items-center space-x-2">
                            <Checkbox
                              id={`water-pump-panel-${brand}`}
                              checked={formData.waterPumpConfig?.panelBrand?.includes(brand) || false}
                              onCheckedChange={(checked) => {
                                const currentMakes = formData.waterPumpConfig?.panelBrand || [];
                                const newMakes = checked
                                  ? [...currentMakes, brand]
                                  : currentMakes.filter(m => m !== brand);
                                updateConfig('waterPumpConfig', { panelBrand: newMakes });
                              }}
                            />
                            <Label htmlFor={`water-pump-panel-${brand}`} className="text-sm">
                              {brand.replace('_', ' ').toUpperCase()}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Label>Panel Type *</Label>
                      <Select
                        value={formData.waterPumpConfig.panelType}
                        onValueChange={(value) => updateConfig('waterPumpConfig', { panelType: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select panel type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bifacial">Bifacial</SelectItem>
                          <SelectItem value="topcon">Topcon</SelectItem>
                          <SelectItem value="mono_perc">Mono-PERC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Panel Watts</Label>
                      <Combobox
                        value={formData.waterPumpConfig.panelWatts || ''}
                        onChange={(value) => {
                          const numericValue = value.replace(/W$/i, '').trim();
                          updateConfig('waterPumpConfig', { panelWatts: numericValue });
                        }}
                        options={panelWatts.map((watts) => ({ value: watts, label: `${watts}W` }))}
                        placeholder="Select or type wattage"
                        searchPlaceholder="Search wattage..."
                        emptyMessage="No wattage found."
                        allowCustom={true}
                        formatCustomValue={(val) => val ? `${val}W` : val}
                      />
                    </div>

                    <div>
                      <Label>DCR Panel Count</Label>
                      <Input
                        type="number"
                        value={formData.waterPumpConfig.dcrPanelCount ?? 0}
                        onChange={(e) => {
                          const value = e.target.value;
                          const dcrCount = value === '' ? null : parseInt(value);
                          const nonDcrCount = formData.waterPumpConfig?.nonDcrPanelCount ?? 0;
                          updateConfig('waterPumpConfig', {
                            dcrPanelCount: dcrCount,
                            panelCount: (dcrCount ?? 0) + nonDcrCount
                          });
                        }}
                        onBlur={(e) => {
                          if (e.target.value === '') {
                            const nonDcrCount = formData.waterPumpConfig?.nonDcrPanelCount ?? 0;
                            updateConfig('waterPumpConfig', {
                              dcrPanelCount: 0,
                              panelCount: nonDcrCount
                            });
                          }
                        }}
                        min="0"
                        placeholder="Enter DCR panel count"
                      />
                    </div>

                    <div>
                      <Label>NON-DCR Panel Count</Label>
                      <Input
                        type="number"
                        value={formData.waterPumpConfig.nonDcrPanelCount ?? 0}
                        onChange={(e) => {
                          const value = e.target.value;
                          const nonDcrCount = value === '' ? null : parseInt(value);
                          const dcrCount = formData.waterPumpConfig?.dcrPanelCount ?? 0;
                          updateConfig('waterPumpConfig', {
                            nonDcrPanelCount: nonDcrCount,
                            panelCount: dcrCount + (nonDcrCount ?? 0)
                          });
                        }}
                        onBlur={(e) => {
                          if (e.target.value === '') {
                            const dcrCount = formData.waterPumpConfig?.dcrPanelCount ?? 0;
                            updateConfig('waterPumpConfig', {
                              nonDcrPanelCount: 0,
                              panelCount: dcrCount
                            });
                          }
                        }}
                        min="0"
                        placeholder="Enter NON-DCR panel count"
                      />
                    </div>

                    <div>
                      <Label>Total Panel Count (Auto-calculated)</Label>
                      <Input
                        type="number"
                        value={formData.waterPumpConfig.panelCount || 0}
                        disabled
                        className="bg-gray-100 cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <Label>Project Value (₹)</Label>
                      <Input
                        type="number"
                        value={formData.waterPumpConfig.projectValue}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '') {
                            updateConfig('waterPumpConfig', { projectValue: '' as any });
                          } else {
                            updateConfig('waterPumpConfig', { projectValue: parseInt(value) || 0 });
                          }
                        }}
                        onBlur={(e) => {
                          const value = e.target.value;
                          if (value === '') {
                            updateConfig('waterPumpConfig', { projectValue: 0 });
                          }
                        }}
                        min="0"
                      />
                    </div>
                  </div>

                  {/* Structure Details Section for Water Pump */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm text-gray-700">Structure Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Structure Type *</Label>
                        <Select
                          value={formData.waterPumpConfig.structureType || 'gp_structure'}
                          onValueChange={(value) => updateConfig('waterPumpConfig', { structureType: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select structure type" />
                          </SelectTrigger>
                          <SelectContent>
                            {structureTypes.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type === 'gp_structure' ? 'GP Structure' :
                                  type === 'mono_rail' ? 'Mono Rail' :
                                    type === 'gi_structure' ? 'GI Structure' :
                                      type === 'gi_round_pipe' ? 'GI Round Pipe' :
                                        'MS Square Pipe'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {(formData.waterPumpConfig.structureType === 'gp_structure' ||
                        formData.waterPumpConfig.structureType === 'gi_structure' ||
                        formData.waterPumpConfig.structureType === 'gi_round_pipe' ||
                        formData.waterPumpConfig.structureType === 'ms_square_pipe') && (
                          <>
                            <div>
                              <Label>Lower End Height (ft)</Label>
                              <Input
                                type="number"
                                placeholder="e.g., 3"
                                value={formData.waterPumpConfig?.gpStructure?.lowerEndHeight || ''}
                                onChange={(e) => updateConfig('waterPumpConfig', {
                                  gpStructure: {
                                    ...formData.waterPumpConfig?.gpStructure,
                                    lowerEndHeight: e.target.value
                                  }
                                })}
                              />
                            </div>
                            <div>
                              <Label>Higher End Height (ft)</Label>
                              <Input
                                type="number"
                                placeholder="e.g., 4"
                                value={formData.waterPumpConfig?.gpStructure?.higherEndHeight || ''}
                                onChange={(e) => updateConfig('waterPumpConfig', {
                                  gpStructure: {
                                    ...formData.waterPumpConfig?.gpStructure,
                                    higherEndHeight: e.target.value
                                  }
                                })}
                              />
                            </div>
                          </>
                        )}

                      {formData.waterPumpConfig.structureType === 'mono_rail' && (
                        <div>
                          <Label>Mono Rail Type</Label>
                          <Select
                            value={formData.waterPumpConfig?.monoRail?.type || 'mini_rail'}
                            onValueChange={(value) => updateConfig('waterPumpConfig', {
                              monoRail: {
                                ...formData.waterPumpConfig?.monoRail,
                                type: value
                              }
                            })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select mono rail type" />
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
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm text-gray-700">Work Scope</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Earth Work Scope</Label>
                        <Select
                          value={formData.waterPumpConfig.earthWork || formData.waterPumpConfig.plumbingWorkScope || 'customer_scope'}
                          onValueChange={(value) => updateConfig('waterPumpConfig', { earthWork: value, plumbingWorkScope: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select earth work scope" />
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

                      <div>
                        <Label>Civil Work Scope</Label>
                        <Select
                          value={formData.waterPumpConfig.civilWorkScope || 'customer_scope'}
                          onValueChange={(value) => updateConfig('waterPumpConfig', { civilWorkScope: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select civil work scope" />
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

                  {/* Additional Features for Water Pump */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm text-gray-700">Additional Features</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="water-pump-lightning"
                          checked={formData.waterPumpConfig.lightningArrest || false}
                          onCheckedChange={(checked) => updateConfig('waterPumpConfig', { lightningArrest: checked as boolean })}
                          data-testid="checkbox-water-pump-lightning"
                        />
                        <Label htmlFor="water-pump-lightning" className="font-normal cursor-pointer">
                          Lightening Arrest
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="water-pump-electrical"
                          checked={formData.waterPumpConfig?.electricalAccessories || false}
                          onCheckedChange={(checked) => {
                            const electricalCount = checked ? (formData.waterPumpConfig?.driveHP ? parseFloat(formData.waterPumpConfig.driveHP) : 1) : 0;
                            updateConfig('waterPumpConfig', {
                              electricalAccessories: checked as boolean,
                              electricalCount
                            });
                          }}
                          data-testid="checkbox-water-pump-electrical"
                        />
                        <Label htmlFor="water-pump-electrical" className="font-normal cursor-pointer">
                          Electrical Accessories
                        </Label>
                      </div>

                      <div className="col-span-full">
                        <Label>Earth Connection</Label>
                        <div className="grid grid-cols-3 gap-4 mt-2">
                          {earthingTypes.map((type) => (
                            <div key={type} className="flex items-center space-x-2">
                              <Checkbox
                                id={`water-pump-earth-${type}`}
                                checked={formData.waterPumpConfig?.earth?.includes(type) || false}
                                onCheckedChange={(checked) => {
                                  const currentEarth = formData.waterPumpConfig?.earth || [];
                                  const newEarth = checked
                                    ? [...currentEarth, type]
                                    : currentEarth.filter(e => e !== type);
                                  updateConfig('waterPumpConfig', { earth: newEarth });
                                }}
                                data-testid={`checkbox-water-pump-earth-${type}`}
                              />
                              <Label htmlFor={`water-pump-earth-${type}`} className="text-sm font-normal cursor-pointer">
                                {type.toUpperCase()}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="water-pump-labour-transport"
                          checked={formData.waterPumpConfig.labourAndTransport || false}
                          onCheckedChange={(checked) => updateConfig('waterPumpConfig', { labourAndTransport: checked as boolean })}
                          data-testid="checkbox-water-pump-labour-transport"
                        />
                        <Label htmlFor="water-pump-labour-transport" className="font-normal cursor-pointer">
                          Labour and Transport
                        </Label>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label>Additional Notes</Label>
                    <Textarea
                      value={formData.waterPumpConfig.others || ''}
                      onChange={(e) => updateConfig('waterPumpConfig', { others: e.target.value })}
                      placeholder="Any additional specifications or notes..."
                    />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

        </>
      )}

      {/* Navigation */}
      <div className="flex flex-col sm:flex-row justify-between gap-3 mt-6">
        {onBack && (
          <Button
            variant="outline"
            onClick={onBack}
            className="w-full sm:w-auto order-2 sm:order-1 h-10 sm:h-9 text-sm sm:text-base"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Back to Customer Details</span>
            <span className="sm:hidden">Back</span>
          </Button>
        )}
        <Button
          onClick={handleSubmit}
          disabled={!isFormValid || isDisabled || isLoading}
          className="w-full sm:w-auto order-1 sm:order-2 h-10 sm:h-9 text-sm sm:text-base flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span className="hidden sm:inline">Processing...</span>
              <span className="sm:hidden">Wait...</span>
            </>
          ) : (
            <>
              <Camera className="h-4 w-4" />
              <span className="hidden sm:inline">Continue to Site Photos</span>
              <span className="sm:hidden">Continue</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
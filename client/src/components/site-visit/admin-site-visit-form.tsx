/**
 * Admin Department Site Visit Form
 * Handles admin-specific processes like bank work, EB office visits, etc.
 */

import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  Building, 
  CreditCard, 
  Zap, 
  ShoppingCart,
  Car,
  DollarSign,
  User,
  FileText,
  Camera,
  ArrowLeft
} from "lucide-react";
import { bankProcessSteps, ebProcessTypes } from "@shared/schema";

interface AdminSiteVisitFormProps {
  onSubmit: (data: AdminFormData) => void;
  onBack?: () => void;
  isDisabled?: boolean;
  isLoading?: boolean;
}

interface AdminFormData {
  bankProcess?: {
    step: string;
    description?: string;
  };
  ebProcess?: {
    type: string;
    description?: string;
    tariffCode?: string;
    ebSanctionPhase?: string;
    ebSanctionKW?: string;
  };
  purchase?: string;
  driving?: string;
  officialCashTransactions?: string;
  officialPersonalWork?: string;
  others?: string;
}

// Bank process steps with descriptions
const bankProcessOptions = [
  { value: 'registration', label: 'Registration', description: 'Customer registration and documentation' },
  { value: 'document_verification', label: 'Document Verification', description: 'Verification of customer documents' },
  { value: 'site_inspection', label: 'Site Inspection', description: 'Physical site inspection by bank officials' },
  { value: 'head_office_approval', label: 'Head Office Approval', description: 'Final approval from head office' },
  { value: 'amount_credited', label: 'Amount Credited', description: 'Loan amount credited to customer account' }
];

// EB process types with descriptions
const ebProcessOptions = [
  { value: 'new_connection', label: 'New Connection', description: 'Apply for new electrical connection' },
  { value: 'tariff_change', label: 'Tariff Change', description: 'Change in electricity tariff structure' },
  { value: 'name_transfer', label: 'Name Transfer', description: 'Transfer of connection to new owner' },
  { value: 'load_upgrade', label: 'Load Upgrade', description: 'Increase in sanctioned load capacity' },
  { value: 'inspection_before_net_meter', label: 'Inspection Before Net Meter', description: 'Pre-installation inspection' },
  { value: 'net_meter_followup', label: 'Net Meter Follow-up', description: 'Follow-up on net meter installation' },
  { value: 'inspection_after_net_meter', label: 'Inspection After Net Meter', description: 'Post-installation verification' },
  { value: 'subsidy', label: 'Subsidy Processing', description: 'Solar subsidy application and processing' }
];

export function AdminSiteVisitForm({ onSubmit, onBack, isDisabled, isLoading }: AdminSiteVisitFormProps) {
  const [formData, setFormData] = useState<AdminFormData>({});
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const sectionDetailsRef = useRef<HTMLDivElement>(null);

  const handleSectionToggle = (section: string) => {
    if (activeSection === section) {
      setActiveSection(null);
      // Clear the section data
      setFormData(prev => {
        const newData = { ...prev };
        delete newData[section as keyof AdminFormData];
        return newData;
      });
    } else {
      setActiveSection(section);
      // Initialize section data
      if (section === 'bankProcess') {
        setFormData(prev => ({
          ...prev,
          bankProcess: { step: 'registration', description: '' }
        }));
      } else if (section === 'ebProcess') {
        setFormData(prev => ({
          ...prev,
          ebProcess: { type: 'new_connection', description: '', tariffCode: '', ebSanctionPhase: '', ebSanctionKW: '' }
        }));
      }

      // Auto-scroll to section details when a section is selected
      setTimeout(() => {
        sectionDetailsRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
          inline: 'nearest'
        });
      }, 100); // Small delay to ensure DOM update
    }
  };

  const updateBankProcess = (updates: Partial<{ step: string; description: string }>) => {
    setFormData(prev => ({
      ...prev,
      bankProcess: prev.bankProcess ? { ...prev.bankProcess, ...updates } : { step: 'registration', description: '', ...updates }
    }));
  };

  const updateEbProcess = (updates: Partial<{ type: string; description: string; tariffCode: string; ebSanctionPhase: string; ebSanctionKW: string }>) => {
    setFormData(prev => ({
      ...prev,
      ebProcess: prev.ebProcess ? { ...prev.ebProcess, ...updates } : { type: 'new_connection', description: '', tariffCode: '', ebSanctionPhase: '', ebSanctionKW: '', ...updates }
    }));
  };

  const handleSubmit = () => {
    onSubmit(formData);
  };

  const isFormValid = Object.keys(formData).length > 0 && (
    // Bank process validation: if selected, must have step and description (min 10 chars)
    (formData.bankProcess && formData.bankProcess.step && formData.bankProcess.description && formData.bankProcess.description.trim().length >= 10) ||
    // EB process validation: if selected, must have type and description (min 10 chars)
    (formData.ebProcess && formData.ebProcess.type && formData.ebProcess.description && formData.ebProcess.description.trim().length >= 10) ||
    // Other fields validation: must have at least one field with meaningful content (min 10 chars)
    Object.entries(formData).some(([key, value]) => {
      if (key === 'bankProcess' || key === 'ebProcess') return false;
      return typeof value === 'string' && value.trim().length >= 10;
    })
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="h-5 w-5" />
            Administrative Site Visit Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Select the type of administrative work performed during this site visit. 
            You can select multiple categories if applicable.
          </p>
        </CardContent>
      </Card>

      {/* Work Type Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bank Process */}
        <Card 
          className={`cursor-pointer transition-colors hover:bg-accent ${
            activeSection === 'bankProcess' ? 'ring-2 ring-primary bg-accent' : ''
          }`}
          onClick={() => handleSectionToggle('bankProcess')}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <CreditCard className="h-6 w-6" />
              <div>
                <h4 className="font-medium">Bank Process</h4>
                <p className="text-sm text-muted-foreground">
                  Loan processing and bank-related work
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* EB Office Process */}
        <Card 
          className={`cursor-pointer transition-colors hover:bg-accent ${
            activeSection === 'ebProcess' ? 'ring-2 ring-primary bg-accent' : ''
          }`}
          onClick={() => handleSectionToggle('ebProcess')}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Zap className="h-6 w-6" />
              <div>
                <h4 className="font-medium">EB Office Work</h4>
                <p className="text-sm text-muted-foreground">
                  Electricity board office visits
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Purchase */}
        <Card 
          className={`cursor-pointer transition-colors hover:bg-accent ${
            activeSection === 'purchase' ? 'ring-2 ring-primary bg-accent' : ''
          }`}
          onClick={() => handleSectionToggle('purchase')}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <ShoppingCart className="h-6 w-6" />
              <div>
                <h4 className="font-medium">Purchase</h4>
                <p className="text-sm text-muted-foreground">
                  Material procurement and purchasing
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Driving */}
        <Card 
          className={`cursor-pointer transition-colors hover:bg-accent ${
            activeSection === 'driving' ? 'ring-2 ring-primary bg-accent' : ''
          }`}
          onClick={() => handleSectionToggle('driving')}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Car className="h-6 w-6" />
              <div>
                <h4 className="font-medium">Driving</h4>
                <p className="text-sm text-muted-foreground">
                  Transportation and delivery services
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Official Cash Transactions */}
        <Card 
          className={`cursor-pointer transition-colors hover:bg-accent ${
            activeSection === 'officialCashTransactions' ? 'ring-2 ring-primary bg-accent' : ''
          }`}
          onClick={() => handleSectionToggle('officialCashTransactions')}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <DollarSign className="h-6 w-6" />
              <div>
                <h4 className="font-medium">Cash Transactions</h4>
                <p className="text-sm text-muted-foreground">
                  Official financial transactions
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Official Personal Work */}
        <Card 
          className={`cursor-pointer transition-colors hover:bg-accent ${
            activeSection === 'officialPersonalWork' ? 'ring-2 ring-primary bg-accent' : ''
          }`}
          onClick={() => handleSectionToggle('officialPersonalWork')}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <User className="h-6 w-6" />
              <div>
                <h4 className="font-medium">Personal Work</h4>
                <p className="text-sm text-muted-foreground">
                  Official personal errands
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section Details */}
      <div ref={sectionDetailsRef}>
      {/* Bank Process Details */}
      {activeSection === 'bankProcess' && formData.bankProcess && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Bank Process Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Process Step *</Label>
              <Select 
                value={formData.bankProcess.step}
                onValueChange={(value) => updateBankProcess({ step: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select bank process step" />
                </SelectTrigger>
                <SelectContent>
                  {bankProcessOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div>
                        <div className="font-medium">{option.label}</div>
                        <div className="text-sm text-muted-foreground">{option.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Process Description *</Label>
              <Textarea
                value={formData.bankProcess.description || ''}
                onChange={(e) => updateBankProcess({ description: e.target.value })}
                placeholder="Describe the bank process work performed (minimum 10 characters)..."
                rows={3}
              />
              {formData.bankProcess.description && formData.bankProcess.description.trim().length < 10 && (
                <p className="text-sm text-destructive mt-1">
                  Description must be at least 10 characters long
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* EB Process Details */}
      {activeSection === 'ebProcess' && formData.ebProcess && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              EB Office Process Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Process Type *</Label>
              <Select 
                value={formData.ebProcess.type}
                onValueChange={(value) => updateEbProcess({ type: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select EB process type" />
                </SelectTrigger>
                <SelectContent>
                  {ebProcessOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div>
                        <div className="font-medium">{option.label}</div>
                        <div className="text-sm text-muted-foreground">{option.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Process Description *</Label>
              <Textarea
                value={formData.ebProcess.description || ''}
                onChange={(e) => updateEbProcess({ description: e.target.value })}
                placeholder="Describe the EB office work performed (minimum 10 characters)..."
                rows={3}
              />
              {formData.ebProcess.description && formData.ebProcess.description.trim().length < 10 && (
                <p className="text-sm text-destructive mt-1">
                  Description must be at least 10 characters long
                </p>
              )}
            </div>

            {/* EB Sanction Details */}
            <div className="border-t pt-4 mt-4">
              <Label className="text-base font-medium mb-4 block">EB Sanction Details (Optional)</Label>
              
              <div className="space-y-4">
                <div>
                  <Label>Tariff Code</Label>
                  <Input
                    value={formData.ebProcess.tariffCode || ''}
                    onChange={(e) => updateEbProcess({ tariffCode: e.target.value })}
                    placeholder="e.g., LA1A/Domestic"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Tariff code from EB connection (optional)</p>
                </div>

                <div>
                  <Label>Load Phase</Label>
                  <Select 
                    value={formData.ebProcess.ebSanctionPhase || ''}
                    onValueChange={(value) => updateEbProcess({ ebSanctionPhase: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select load phase" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1_phase">1 Phase</SelectItem>
                      <SelectItem value="3_phase">3 Phase</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Sanction Load</Label>
                  <Input
                    value={formData.ebProcess.ebSanctionKW || ''}
                    onChange={(e) => updateEbProcess({ ebSanctionKW: e.target.value })}
                    placeholder="e.g., 4"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Sanction load in KW (optional)</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Simple Text Fields for Other Categories */}
      {['purchase', 'driving', 'officialCashTransactions', 'officialPersonalWork', 'others'].map((field) => (
        activeSection === field && (
          <Card key={field}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {field === 'officialCashTransactions' ? 'Official Cash Transactions' :
                 field === 'officialPersonalWork' ? 'Official Personal Work' :
                 field.charAt(0).toUpperCase() + field.slice(1)} Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <Label>Description *</Label>
                <Textarea
                  value={formData[field as keyof AdminFormData] as string || ''}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    [field]: e.target.value 
                  }))}
                  placeholder={`Describe the ${field === 'officialCashTransactions' ? 'cash transactions' :
                               field === 'officialPersonalWork' ? 'personal work' :
                               field} performed (minimum 10 characters)...`}
                  rows={4}
                />
                {formData[field as keyof AdminFormData] && 
                 typeof formData[field as keyof AdminFormData] === 'string' && 
                 (formData[field as keyof AdminFormData] as string).trim().length < 10 && (
                  <p className="text-sm text-destructive mt-1">
                    Description must be at least 10 characters long
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )
      ))}
      </div>

      {/* Others Section Toggle */}
      {!activeSection && (
        <Card 
          className="cursor-pointer transition-colors hover:bg-accent"
          onClick={() => handleSectionToggle('others')}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <FileText className="h-6 w-6" />
              <div>
                <h4 className="font-medium">Other Administrative Work</h4>
                <p className="text-sm text-muted-foreground">
                  Any other administrative tasks not listed above
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Selected Categories Summary */}
      {Object.keys(formData).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Selected Work Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.keys(formData).map((key) => (
                <Badge key={key} variant="secondary">
                  {key === 'bankProcess' ? 'Bank Process' :
                   key === 'ebProcess' ? 'EB Office Work' :
                   key === 'officialCashTransactions' ? 'Cash Transactions' :
                   key === 'officialPersonalWork' ? 'Personal Work' :
                   key.charAt(0).toUpperCase() + key.slice(1)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
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
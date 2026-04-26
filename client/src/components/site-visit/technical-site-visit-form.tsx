/**
 * Technical Department Site Visit Form
 * Handles technical-specific fields as per specifications
 */

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Zap,
  Users,
  CheckCircle,
  AlertTriangle,
  Wrench,
  Settings,
  Camera,
  MapPin,
  ArrowLeft
} from "lucide-react";
import { serviceTypes, technicalWorkTypes, workingStatus } from "@shared/schema";

interface TechnicalSiteVisitFormProps {
  onSubmit: (data: TechnicalFormData) => void;
  onBack?: () => void;
  isDisabled?: boolean;
  isLoading?: boolean;
}

interface TechnicalFormData {
  serviceTypes: string[];
  workType: string;
  workingStatus: string;
  pendingRemarks?: string;
  teamMembers: string[];
  description?: string;
}

// Service types with user-friendly labels - SCHEMA COMPLIANT
const serviceTypeOptions = serviceTypes.map(type => {
  const labels: Record<string, { label: string; description: string }> = {
    'on_grid': { label: 'On-grid', description: 'Grid-tied solar system' },
    'off_grid': { label: 'Off-grid', description: 'Standalone solar system' },
    'hybrid': { label: 'Hybrid', description: 'Grid-tied with battery backup' },
    'solar_panel': { label: 'Solar Panel', description: 'Panel installation/maintenance' },
    'camera': { label: 'Camera', description: 'Security camera systems' },
    'water_pump': { label: 'Water Pump', description: 'Solar water pumping system' },
    'water_heater': { label: 'Water Heater', description: 'Solar water heating system' },
    'lights_accessories': { label: 'Lights & Accessories', description: 'LED lights and accessories' },
    'others': { label: 'Others', description: 'Other technical services' }
  };
  return {
    value: type,
    label: labels[type]?.label || type.replace('_', ' ').toUpperCase(),
    description: labels[type]?.description || `${type.replace('_', ' ')} service`
  };
});

// Work types with categories - SCHEMA COMPLIANT
const workTypeOptions = [
  {
    category: 'Installation & Setup',
    items: technicalWorkTypes.filter(type =>
      ['installation', 'wifi_configuration', 'structure', 'welding_work'].includes(type)
    ).map(type => ({
      value: type,
      label: type.replace('_', ' ').split(' ').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ')
    }))
  },
  {
    category: 'Maintenance & Service',
    items: technicalWorkTypes.filter(type =>
      ['amc', 'service', 'repair', 'cleaning'].includes(type)
    ).map(type => ({
      value: type,
      label: type === 'amc' ? 'AMC (Annual Maintenance)' :
        type.charAt(0).toUpperCase() + type.slice(1)
    }))
  },
  {
    category: 'Troubleshooting',
    items: technicalWorkTypes.filter(type =>
      ['electrical_fault', 'inverter_fault', 'solar_panel_fault', 'wiring_issue', 'camera_fault', 'light_fault'].includes(type)
    ).map(type => ({
      value: type,
      label: type.replace('_', ' ').split(' ').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ')
    }))
  },
  {
    category: 'Other Services',
    items: technicalWorkTypes.filter(type =>
      ['site_visit', 'light_installation', 'painting', 'others'].includes(type)
    ).map(type => ({
      value: type,
      label: type.replace('_', ' ').split(' ').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ')
    }))
  }
];

// Common team members (can be customized per organization)
const commonTeamMembers = [
  'Team Leader',
  'Senior Technician',
  'Technician',
  'Junior Technician',
  'Welder',
  'Helper',
  'Electrician'
];

export function TechnicalSiteVisitForm({ onSubmit, onBack, isDisabled, isLoading }: TechnicalSiteVisitFormProps) {
  const [formData, setFormData] = useState<TechnicalFormData>({
    serviceTypes: [],
    workType: 'installation',
    workingStatus: 'pending',
    pendingRemarks: '',
    teamMembers: [],
    description: ''
  });

  const [customTeamMember, setCustomTeamMember] = useState('');
  const formTopRef = useRef<HTMLDivElement>(null);

  const handleServiceTypeChange = (serviceType: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      serviceTypes: checked
        ? [...prev.serviceTypes, serviceType]
        : prev.serviceTypes.filter(type => type !== serviceType)
    }));

    // Scroll to top when major form changes occur (like first service type selection)
    if (checked && formData.serviceTypes.length === 0) {
      setTimeout(() => {
        formTopRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
          inline: 'nearest'
        });
      }, 100);
    }
  };

  const handleTeamMemberChange = (member: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      teamMembers: checked
        ? [...prev.teamMembers, member]
        : prev.teamMembers.filter(m => m !== member)
    }));
  };

  const addCustomTeamMember = () => {
    if (customTeamMember.trim() && !formData.teamMembers.includes(customTeamMember.trim())) {
      setFormData(prev => ({
        ...prev,
        teamMembers: [...prev.teamMembers, customTeamMember.trim()]
      }));
      setCustomTeamMember('');
    }
  };

  const removeTeamMember = (member: string) => {
    setFormData(prev => ({
      ...prev,
      teamMembers: prev.teamMembers.filter(m => m !== member)
    }));
  };

  const handleSubmit = () => {
    onSubmit(formData);
  };

  const isFormValid = formData.serviceTypes.length > 0 &&
    formData.workType &&
    formData.workingStatus &&
    formData.teamMembers.length > 0 &&
    (formData.workingStatus === 'completed' || (formData.pendingRemarks?.trim() && formData.pendingRemarks.trim().length >= 10));

  return (
    <div ref={formTopRef} className="space-y-6">
      {/* Service Types Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Service Types
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Select all applicable service types for this site visit:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {serviceTypeOptions.map((service) => (
                <div key={service.value} className="flex items-start space-x-3">
                  <Checkbox
                    id={service.value}
                    checked={formData.serviceTypes.includes(service.value)}
                    onCheckedChange={(checked) =>
                      handleServiceTypeChange(service.value, checked as boolean)
                    }
                  />
                  <div className="space-y-1">
                    <Label htmlFor={service.value} className="text-sm font-medium">
                      {service.label}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {service.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {formData.serviceTypes.length > 0 && (
              <div className="mt-3">
                <p className="text-sm text-muted-foreground mb-2">Selected:</p>
                <div className="flex flex-wrap gap-2">
                  {formData.serviceTypes.map((type) => (
                    <Badge key={type} variant="secondary">
                      {serviceTypeOptions.find(s => s.value === type)?.label}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Type of Work */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Type of Work
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={formData.workType} onValueChange={(value) =>
            setFormData(prev => ({ ...prev, workType: value }))
          }>
            <SelectTrigger>
              <SelectValue placeholder="Select the type of work performed" />
            </SelectTrigger>
            <SelectContent>
              {workTypeOptions.map((category) => (
                <div key={category.category}>
                  <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                    {category.category}
                  </div>
                  {category.items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                  <Separator className="my-1" />
                </div>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Working Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Working Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={formData.workingStatus}
            onValueChange={(value) =>
              setFormData(prev => ({ ...prev, workingStatus: value }))
            }
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="pending" id="pending" />
              <Label htmlFor="pending" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                Pending
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="completed" id="completed" />
              <Label htmlFor="completed" className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Completed
              </Label>
            </div>
          </RadioGroup>

          {/* Pending Remarks */}
          {formData.workingStatus === 'pending' && (
            <div className="mt-4 space-y-2">
              <Label htmlFor="pendingRemarks">Pending Remarks *</Label>
              <Textarea
                id="pendingRemarks"
                value={formData.pendingRemarks}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  pendingRemarks: e.target.value
                }))}
                placeholder="Describe what work is pending and why..."
                className={`mt-1 ${formData.pendingRemarks && formData.pendingRemarks.trim().length < 10 ? 'border-red-500' : ''}`}
              />
              <div className="flex items-center justify-between text-xs">
                <span className={formData.pendingRemarks && formData.pendingRemarks.trim().length < 10 ? 'text-red-500' : 'text-muted-foreground'}>
                  {formData.pendingRemarks && formData.pendingRemarks.trim().length < 10
                    ? `Please enter at least 10 characters (${formData.pendingRemarks.trim().length}/10)`
                    : 'Minimum 10 characters required'
                  }
                </span>
                <span className="text-muted-foreground">
                  {formData.pendingRemarks?.trim().length || 0} characters
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Technical Team Members */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Technical Team Members
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              Select team members involved in this site visit:
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {commonTeamMembers.map((member) => (
                <div key={member} className="flex items-center space-x-2">
                  <Checkbox
                    id={member}
                    checked={formData.teamMembers.includes(member)}
                    onCheckedChange={(checked) =>
                      handleTeamMemberChange(member, checked as boolean)
                    }
                  />
                  <Label htmlFor={member} className="text-sm">
                    {member}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Custom Team Member Input */}
          <div className="space-y-2">
            <Label htmlFor="customMember">Add Custom Team Member</Label>
            <div className="flex gap-2">
              <Input
                id="customMember"
                value={customTeamMember}
                onChange={(e) => setCustomTeamMember(e.target.value)}
                placeholder="Enter team member name"
                onKeyPress={(e) => e.key === 'Enter' && addCustomTeamMember()}
              />
              <Button
                type="button"
                variant="outline"
                onClick={addCustomTeamMember}
                disabled={!customTeamMember.trim()}
              >
                Add
              </Button>
            </div>
          </div>

          {/* Selected Team Members */}
          {formData.teamMembers.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">Selected Team Members:</p>
              <div className="flex flex-wrap gap-2">
                {formData.teamMembers.map((member) => (
                  <Badge key={member} variant="secondary" className="flex items-center gap-1">
                    {member}
                    <button
                      onClick={() => removeTeamMember(member)}
                      className="ml-1 text-xs hover:text-destructive"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Additional Description */}
      <Card>
        <CardHeader>
          <CardTitle>Additional Description</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.description}
            onChange={(e) => setFormData(prev => ({
              ...prev,
              description: e.target.value
            }))}
            placeholder="Any additional details about the technical work performed..."
            rows={3}
          />
        </CardContent>
      </Card>

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
              <MapPin className="h-4 w-4" />
              <span className="hidden sm:inline">Continue to Site Photos</span>
              <span className="sm:hidden">Continue</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
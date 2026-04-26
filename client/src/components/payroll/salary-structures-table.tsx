import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency } from "@/lib/utils";
import { ChevronDown, ChevronRight, Edit, Trash2, Users } from "lucide-react";

interface SalaryStructuresTableProps {
  structures: any[];
  users: any[];
  earningsFields: any[];
  deductionsFields: any[];
}

export function SalaryStructuresTable({ structures, users, earningsFields, deductionsFields }: SalaryStructuresTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedStructures, setSelectedStructures] = useState<Set<string>>(new Set());

  const toggleRow = (structureId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(structureId)) {
      newExpanded.delete(structureId);
    } else {
      newExpanded.add(structureId);
    }
    setExpandedRows(newExpanded);
  };

  const calculateGrossSalary = (structure: any) => {
    const customEarningsTotal = Object.values(structure.customEarnings || {}).reduce((sum: number, val: any) => sum + val, 0);
    return structure.fixedBasic + structure.fixedHRA + structure.fixedConveyance + customEarningsTotal;
  };

  const calculateTotalDeductions = (structure: any) => {
    const customDeductionsTotal = Object.values(structure.customDeductions || {}).reduce((sum: number, val: any) => sum + val, 0);
    const epfAmount = structure.epfApplicable ? (structure.fixedBasic * 0.12) : 0;
    const esiAmount = structure.esiApplicable ? (calculateGrossSalary(structure) * 0.0075) : 0;
    return customDeductionsTotal + epfAmount + esiAmount + (structure.vptAmount || 0);
  };

  if (structures.length === 0) {
    return (
      <div className="text-center py-8">
        <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">No salary structures found</h3>
        <p className="text-muted-foreground">
          Create salary structures for employees to manage payroll.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {structures.map((structure) => {
        const structureUser = users.find((u: any) => u.id === structure.userId);
        const grossSalary = calculateGrossSalary(structure);
        const totalDeductions = calculateTotalDeductions(structure);
        const netSalary = grossSalary - totalDeductions;
        const isExpanded = expandedRows.has(structure.id);

        return (
          <Card key={structure.id} className="overflow-hidden">
            <CardHeader className="cursor-pointer hover:bg-gray-50" onClick={() => toggleRow(structure.id)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selectedStructures.has(structure.id)}
                    onCheckedChange={(checked) => {
                      const newSelected = new Set(selectedStructures);
                      if (checked) {
                        newSelected.add(structure.id);
                      } else {
                        newSelected.delete(structure.id);
                      }
                      setSelectedStructures(newSelected);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <div>
                    <CardTitle className="text-base">{structureUser?.displayName || `Employee #${structure.userId}`}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {structureUser?.department} • {structureUser?.designation} • Grade: {structureUser?.payrollGrade || 'N/A'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-semibold text-green-600">{formatCurrency(netSalary)}</p>
                    <p className="text-xs text-muted-foreground">Net Salary</p>
                  </div>
                  <Badge variant={structure.isActive ? 'default' : 'secondary'}>
                    {structure.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Fixed Salary Components */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-blue-600">Fixed Components</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span>Fixed Basic:</span>
                        <span className="font-medium">{formatCurrency(structure.fixedBasic)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Fixed HRA:</span>
                        <span className="font-medium">{formatCurrency(structure.fixedHRA)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Fixed Conveyance:</span>
                        <span className="font-medium">{formatCurrency(structure.fixedConveyance)}</span>
                      </div>
                      {Object.keys(structure.customEarnings || {}).length > 0 && (
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm text-green-600">Additional Earnings</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {Object.entries(structure.customEarnings).map(([key, value]) => {
                              const field = earningsFields.find(f => f.name === key);
                              return (
                                <div key={key} className="flex justify-between">
                                  <span>{field?.displayName || key}:</span>
                                  <span className="font-medium">{formatCurrency(value as number)}</span>
                                </div>
                              );
                            })}
                          </CardContent>
                        </Card>
                      )}
                      <hr className="my-2" />
                      <div className="flex justify-between font-semibold">
                        <span>Gross Total:</span>
                        <span className="text-green-600">{formatCurrency(grossSalary)}</span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Statutory & Deductions */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-red-600">Statutory & Deductions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span>EPF Applicable:</span>
                        <Badge variant={structure.epfApplicable ? 'default' : 'secondary'}>
                          {structure.epfApplicable ? 'Yes' : 'No'}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>ESI Applicable:</span>
                        <Badge variant={structure.esiApplicable ? 'default' : 'secondary'}>
                          {structure.esiApplicable ? 'Yes' : 'No'}
                        </Badge>
                      </div>
                      {structure.vptAmount > 0 && (
                        <div className="flex justify-between">
                          <span>VPF Amount:</span>
                          <span className="font-medium">{formatCurrency(structure.vptAmount)}</span>
                        </div>
                      )}
                      {Object.keys(structure.customDeductions || {}).length > 0 && (
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm text-red-600">Additional Deductions</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {Object.entries(structure.customDeductions).map(([key, value]) => {
                              const field = deductionsFields.find(f => f.name === key);
                              return (
                                <div key={key} className="flex justify-between">
                                  <span>{field?.displayName || key}:</span>
                                  <span className="font-medium">{formatCurrency(value as number)}</span>
                                </div>
                              );
                            })}
                          </CardContent>
                        </Card>
                      )}
                      <hr className="my-2" />
                      <div className="flex justify-between font-semibold">
                        <span>Total Deductions:</span>
                        <span className="text-red-600">{formatCurrency(totalDeductions)}</span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Configuration & Settings */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-purple-600">Configuration</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span>Per Day Rate:</span>
                        <span className="font-medium">{formatCurrency(structure.perDayRate || 0)}</span>
                      </div>
                      {/* OT Rate removed - company-wide 1.0x for all */}
                      <div className="flex justify-between">
                        <span>Status:</span>
                        <Badge variant={structure.isActive ? 'default' : 'secondary'}>
                          {structure.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Created:</span>
                        <span className="text-sm text-muted-foreground">
                          {new Date(structure.createdAt?.seconds * 1000).toLocaleDateString()}
                        </span>
                      </div>
                      <hr className="my-2" />
                      <div className="flex justify-between font-semibold">
                        <span>Final Net:</span>
                        <span className="text-blue-600">{formatCurrency(netSalary)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
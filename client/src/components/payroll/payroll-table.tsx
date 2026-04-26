import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { Eye, Edit, Trash2, ChevronDown, ChevronRight, FileSpreadsheet } from "lucide-react";
import { TimeDisplay } from "@/components/time/time-display";

interface PayrollTableProps {
  payrolls: any[];
  users: any[];
  earningsFields: any[];
  deductionsFields: any[];
  onEdit: (payrollId: string) => void;
}

export function PayrollTable({ payrolls, users, earningsFields, deductionsFields, onEdit }: PayrollTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (payrollId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(payrollId)) {
      newExpanded.delete(payrollId);
    } else {
      newExpanded.add(payrollId);
    }
    setExpandedRows(newExpanded);
  };

  if (payrolls.length === 0) {
    return (
      <div className="text-center py-8">
        <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">No payroll data found</h3>
        <p className="text-muted-foreground">
          Process payroll for the selected month to see data here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {payrolls.map((payroll) => {
        const user = users.find((u: any) => u.id === payroll.userId);
        const isExpanded = expandedRows.has(payroll.id);
        
        return (
          <Card key={payroll.id} className="overflow-hidden">
            <CardHeader className="cursor-pointer hover:bg-gray-50" onClick={() => toggleRow(payroll.id)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <div>
                    <CardTitle className="text-base">{user?.displayName || `Employee #${payroll.employeeId}`}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {user?.department} • {user?.designation} • Grade: {user?.payrollGrade || 'N/A'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-semibold text-green-600">{formatCurrency(payroll.netSalary)}</p>
                    <p className="text-xs text-muted-foreground">Net Salary</p>
                  </div>
                  <Badge variant={payroll.status === 'processed' ? 'default' : 'secondary'}>
                    {payroll.status}
                  </Badge>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(payroll.id);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>
            
            {isExpanded && (
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Earnings Breakdown */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-green-600">Earnings Components</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span>Basic Salary:</span>
                        <span className="font-medium">{formatCurrency(payroll.earnedBasic)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>HRA:</span>
                        <span className="font-medium">{formatCurrency(payroll.earnedHRA)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Conveyance:</span>
                        <span className="font-medium">{formatCurrency(payroll.earnedConveyance)}</span>
                      </div>
                      {payroll.overtimePay > 0 && (
                        <div className="flex justify-between">
                          <span>Overtime Pay:</span>
                          <span className="font-medium text-blue-600">{formatCurrency(payroll.overtimePay)}</span>
                        </div>
                      )}
                      {Object.keys(payroll.dynamicEarnings || {}).length > 0 && (
                        <>
                          <hr className="my-2" />
                          {Object.entries(payroll.dynamicEarnings).map(([key, value]) => {
                            const field = earningsFields.find(f => f.name === key);
                            return (
                              <div key={key} className="flex justify-between">
                                <span>{field?.displayName || key}:</span>
                                <span className="font-medium">{formatCurrency(value as number)}</span>
                              </div>
                            );
                          })}
                        </>
                      )}
                      <hr className="my-2" />
                      <div className="flex justify-between font-semibold">
                        <span>Gross Total:</span>
                        <span className="text-green-600">{formatCurrency(payroll.grossSalary)}</span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Deductions Breakdown */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-red-600">Deductions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {payroll.epfDeduction > 0 && (
                        <div className="flex justify-between">
                          <span>EPF (12%):</span>
                          <span className="font-medium">{formatCurrency(payroll.epfDeduction)}</span>
                        </div>
                      )}
                      {payroll.esiDeduction > 0 && (
                        <div className="flex justify-between">
                          <span>ESI (0.75%):</span>
                          <span className="font-medium">{formatCurrency(payroll.esiDeduction)}</span>
                        </div>
                      )}
                      {payroll.vptDeduction > 0 && (
                        <div className="flex justify-between">
                          <span>VPF:</span>
                          <span className="font-medium">{formatCurrency(payroll.vptDeduction)}</span>
                        </div>
                      )}
                      {Object.keys(payroll.dynamicDeductions || {}).length > 0 && (
                        <>
                          <hr className="my-2" />
                          {Object.entries(payroll.dynamicDeductions).map(([key, value]) => {
                            const field = deductionsFields.find(f => f.name === key);
                            return (
                              <div key={key} className="flex justify-between">
                                <span>{field?.displayName || key}:</span>
                                <span className="font-medium">{formatCurrency(value as number)}</span>
                              </div>
                            );
                          })}
                        </>
                      )}
                      <hr className="my-2" />
                      <div className="flex justify-between font-semibold">
                        <span>Total Deductions:</span>
                        <span className="text-red-600">{formatCurrency(payroll.totalDeductions)}</span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Attendance & Work Details */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-blue-600">Work Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span>Month Days:</span>
                        <span className="font-medium">{payroll.monthDays}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Present Days:</span>
                        <span className="font-medium">{payroll.presentDays}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Paid Leave:</span>
                        <span className="font-medium">{payroll.paidLeaveDays || 0}</span>
                      </div>
                      {payroll.overtimeHours > 0 && (
                        <div className="flex justify-between">
                          <span>Overtime Hours:</span>
                          <span className="font-medium text-orange-600">{payroll.overtimeHours}h</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Per Day Salary:</span>
                        <span className="font-medium">{formatCurrency(payroll.perDaySalary)}</span>
                      </div>
                      <hr className="my-2" />
                      <div className="flex justify-between font-semibold">
                        <span>Final Net:</span>
                        <span className="text-blue-600">{formatCurrency(payroll.netSalary)}</span>
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
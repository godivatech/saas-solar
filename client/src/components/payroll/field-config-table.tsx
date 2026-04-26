import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { Edit, Trash2, Plus, Settings2 } from "lucide-react";

interface FieldConfigTableProps {
  fieldConfigs: any[];
}

export function FieldConfigTable({ fieldConfigs }: FieldConfigTableProps) {
  const earningsFields = fieldConfigs.filter(field => field.type === 'earnings');
  const deductionsFields = fieldConfigs.filter(field => field.type === 'deductions');

  if (fieldConfigs.length === 0) {
    return (
      <div className="text-center py-8">
        <Settings2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">No field configurations found</h3>
        <p className="text-muted-foreground">
          Configure custom earnings and deduction fields for flexible payroll management.
        </p>
      </div>
    );
  }

  const FieldSection = ({ title, fields, type }: { title: string; fields: any[]; type: 'earnings' | 'deductions' }) => (
    <Card>
      <CardHeader>
        <CardTitle className={`text-sm ${type === 'earnings' ? 'text-green-600' : 'text-red-600'}`}>
          {title} ({fields.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No {type} fields configured
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field Name</TableHead>
                <TableHead>Display Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Default Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field) => (
                <TableRow key={field.id}>
                  <TableCell className="font-medium">{field.name}</TableCell>
                  <TableCell>{field.displayName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {field.department === 'all' ? 'All Departments' : field.department.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {field.defaultValue > 0 ? formatCurrency(field.defaultValue) : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={field.isActive ? 'default' : 'secondary'}>
                      {field.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <FieldSection 
        title="Earnings Fields" 
        fields={earningsFields} 
        type="earnings" 
      />
      <FieldSection 
        title="Deductions Fields" 
        fields={deductionsFields} 
        type="deductions" 
      />
    </div>
  );
}
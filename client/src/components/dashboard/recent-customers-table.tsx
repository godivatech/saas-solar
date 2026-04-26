import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowRight } from "lucide-react";
import { getInitials, formatDate } from "@/lib/utils";

interface Customer {
  id: number;
  name: string;
  email: string;
  location: string;
  addedOn: Date;
}

interface RecentCustomersTableProps {
  customers: Customer[];
}

export function RecentCustomersTable({ customers }: RecentCustomersTableProps) {
  return (
    <Card className="border border-gray-200 overflow-hidden h-full">
      <CardHeader className="flex flex-row items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200">
        <CardTitle className="font-semibold text-base sm:text-lg">Recent Customers</CardTitle>
      </CardHeader>

      {/* Mobile card view for small screens */}
      <div className="md:hidden">
        {customers.map((customer) => (
          <div key={customer.id} className="border-b border-gray-100 p-4">
            <div className="flex items-center mb-2">
              <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-xs">
                <span>{getInitials(customer.name)}</span>
              </div>
              <div className="ml-3">
                <div className="text-sm font-medium text-gray-900">{customer.name}</div>
                <div className="text-xs text-gray-500 truncate max-w-[150px]">{customer.email}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
              <div>
                <span className="text-gray-500">Location:</span>
                <span className="ml-1 text-gray-900">{customer.location}</span>
              </div>
              <div>
                <span className="text-gray-500">Added:</span>
                <span className="ml-1 text-gray-900">{formatDate(customer.addedOn)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Table view for larger screens */}
      <div className="hidden md:block overflow-x-auto">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</TableHead>
              <TableHead className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</TableHead>
              <TableHead className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Added On</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell className="px-4 lg:px-6 py-3 sm:py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600">
                      <span>{getInitials(customer.name)}</span>
                    </div>
                    <div className="ml-3 sm:ml-4">
                      <div className="text-sm font-medium text-gray-900">{customer.name}</div>
                      <div className="text-xs sm:text-sm text-gray-500">{customer.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-4 lg:px-6 py-3 sm:py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{customer.location}</div>
                </TableCell>
                <TableCell className="px-4 lg:px-6 py-3 sm:py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{formatDate(customer.addedOn)}</div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CardContent className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200">
        <Button variant="ghost" className="text-secondary text-xs sm:text-sm font-medium p-0 h-auto" asChild>
          <Link href="/customers" className="flex items-center">
            <span>View All Customers</span>
            <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 ml-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

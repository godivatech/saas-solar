import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlusCircle, ArrowRight, Battery, Plug, Activity } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

interface Product {
  id: number;
  name: string;
  type: string;
  icon: "battery" | "plug" | "dashboard";
  currentStock: number;
  price: number;
  status: "critical" | "low" | "normal";
}

interface LowStockProductsTableProps {
  products: Product[];
}

export function LowStockProductsTable({ products }: LowStockProductsTableProps) {
  // Function to render the appropriate icon based on product type
  const renderIcon = (type: string) => {
    switch (type) {
      case "battery":
        return <Battery className="h-5 w-5 text-gray-500" />;
      case "plug":
        return <Plug className="h-5 w-5 text-gray-500" />;
      default:
        return <Activity className="h-5 w-5 text-gray-500" />;
    }
  };

  // Status badge styles
  const statusStyles = {
    critical: "bg-red-100 text-red-800",
    low: "bg-yellow-100 text-yellow-800",
    normal: "bg-green-100 text-green-800"
  };

  // Status display text
  const statusText = {
    critical: "Critical",
    low: "Low",
    normal: "Normal"
  };

  return (
    <Card className="border border-gray-200 overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between px-6 py-4 border-b border-gray-200">
        <CardTitle className="font-semibold text-lg">Low Stock Products</CardTitle>
        <Button variant="ghost" size="icon" asChild>
          <Link href="/products/new">
            <PlusCircle className="h-5 w-5 text-secondary" />
          </Link>
        </Button>
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</TableHead>
              <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Stock</TableHead>
              <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</TableHead>
              <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center text-gray-500">
                      {renderIcon(product.icon)}
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">{product.name}</div>
                      <div className="text-sm text-gray-500">{product.type}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{product.currentStock} units</div>
                </TableCell>
                <TableCell className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{formatCurrency(product.price)}</div>
                </TableCell>
                <TableCell className="px-6 py-4 whitespace-nowrap">
                  <span className={cn(
                    "px-2 inline-flex text-xs leading-5 font-semibold rounded-full",
                    statusStyles[product.status]
                  )}>
                    {statusText[product.status]}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <CardContent className="px-6 py-4 border-t border-gray-200">
        <Button variant="ghost" className="text-secondary text-sm font-medium p-0" asChild>
          <Link href="/products">
            <span>View All Products</span>
            <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

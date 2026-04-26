import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

interface Invoice {
  id: string;
  number: string;
  amount: number;
  status: "paid" | "pending" | "overdue";
  customer: string;
  location: string;
}

interface RecentInvoicesProps {
  invoices: Invoice[];
  title?: string;
  period?: string;
}

export function RecentInvoices({ 
  invoices, 
  title = "Recent Invoices", 
  period = "Last 7 days" 
}: RecentInvoicesProps) {
  // Status badge styles with semantic colors
  const statusStyles = {
    paid: "bg-success/10 text-success",
    pending: "bg-warning/10 text-warning",
    overdue: "bg-destructive/10 text-destructive"
  };

  // Status display text
  const statusText = {
    paid: "Paid",
    pending: "Pending",
    overdue: "Overdue"
  };

  return (
    <Card className="border border-gray-200">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">{title}</h2>
          <span className="text-xs text-gray-500">{period}</span>
        </div>
        <div className="space-y-4">
          {invoices.map((invoice) => (
            <div key={invoice.id} className="flex items-center">
              <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center text-success">
                <i className="ri-bill-line text-lg"></i>
              </div>
              <div className="ml-3 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">{invoice.number}</h3>
                  <div className="flex items-center">
                    <span className={cn(
                      "px-2 inline-flex text-xs leading-5 font-semibold rounded-full mr-2",
                      statusStyles[invoice.status]
                    )}>
                      {statusText[invoice.status]}
                    </span>
                    <span className="text-xs text-gray-500">{formatCurrency(invoice.amount)}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500">{invoice.customer}, {invoice.location}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-gray-200">
          <Button 
            variant="ghost" 
            className="text-secondary text-sm font-medium p-0"
            asChild
          >
            <Link href="/invoices/new">
              <span>Create New Invoice</span>
              <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

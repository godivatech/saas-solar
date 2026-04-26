import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";

interface Quotation {
  id: string;
  number: string;
  amount: number;
  status?: string;
  customer: string;
  location: string;
}

interface RecentQuotationsProps {
  quotations: Quotation[];
  title?: string;
  period?: string;
}

export function RecentQuotations({
  quotations,
  title = "Recent Quotations",
  period = "Last 7 days"
}: RecentQuotationsProps) {
  const statusStyles = {
    draft: "bg-info/10 text-info",
    sent: "bg-warning/10 text-warning",
    approved: "bg-success/10 text-success",
    converted: "bg-success/10 text-success",
    rejected: "bg-destructive/10 text-destructive"
  };

  return (
    <Card className="border border-gray-200">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">{title}</h2>
          <span className="text-xs text-gray-500">{period}</span>
        </div>
        <div className="space-y-4">
          {quotations.map((quotation) => (
            <div key={quotation.id} className="flex items-center">
              <div className="h-10 w-10 rounded-full bg-info/10 flex items-center justify-center text-info">
                <i className="ri-file-list-3-line text-lg"></i>
              </div>
              <div className="ml-3 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">{quotation.number}</h3>
                  <div className="flex items-center gap-2">
                    {quotation.status && (
                      <span className={cn(
                        "px-2 py-0.5 text-xs font-medium rounded-full",
                        statusStyles[quotation.status as keyof typeof statusStyles] || "bg-gray-100 text-gray-600"
                      )}>
                        {quotation.status}
                      </span>
                    )}
                    <span className="text-xs text-gray-500">{formatCurrency(quotation.amount)}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500">{quotation.customer}, {quotation.location}</p>
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
            <Link href="/quotations/new">
              <span>Create New Quotation</span>
              <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

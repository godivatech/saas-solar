import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

interface SolarKPIProps {
  title: string;
  value: string;
  unit?: string;
  icon: React.ReactNode;
  trend?: {
    value: number;
    period: string;
  };
  color: "success" | "warning" | "info" | "primary";
}

const colorClasses = {
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  info: "bg-info text-info-foreground",
  primary: "bg-primary text-primary-foreground"
};

const badgeClasses = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
  primary: "bg-primary/10 text-primary"
};

export function SolarKPICard({ 
  title, 
  value, 
  unit, 
  icon, 
  trend, 
  color = "primary" 
}: SolarKPIProps) {
  return (
    <Card className="border border-gray-200 h-full">
      <CardContent className="p-4 sm:p-5 md:p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-foreground/60 mb-2">{title}</p>
            <div className="flex items-baseline gap-1">
              <p className="text-2xl sm:text-3xl font-bold">{value}</p>
              {unit && <span className="text-sm text-foreground/60">{unit}</span>}
            </div>
          </div>
          <div className={`h-12 w-12 rounded-lg ${badgeClasses[color]} flex items-center justify-center`}>
            {icon}
          </div>
        </div>
        
        {trend && (
          <div className="mt-3 flex items-center gap-1 text-success text-sm">
            <TrendingUp className="h-4 w-4" />
            <span>+{trend.value} from {trend.period}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

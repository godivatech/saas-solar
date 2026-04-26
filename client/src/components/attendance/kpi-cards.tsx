import { Card, CardContent } from "@/components/ui/card";
import { UserCheck, XCircle, Clock, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPICardsProps {
  totalPresent: number;
  totalAbsent: number;
  totalLate: number;
  totalIncomplete: number;
  previousPresent?: number;
  previousAbsent?: number;
  previousLate?: number;
}

export function KPICards({
  totalPresent,
  totalAbsent,
  totalLate,
  totalIncomplete,
  previousPresent = 0,
  previousAbsent = 0,
  previousLate = 0,
}: KPICardsProps) {
  const getTrend = (current: number, previous: number) => {
    if (previous === 0) return null;
    const change = ((current - previous) / previous) * 100;
    return {
      value: Math.abs(change).toFixed(1),
      isPositive: change > 0,
      isNegative: change < 0,
    };
  };

  const presentTrend = getTrend(totalPresent, previousPresent);
  const absentTrend = getTrend(totalAbsent, previousAbsent);
  const lateTrend = getTrend(totalLate, previousLate);

  const kpiData = [
    {
      title: "Present",
      value: totalPresent,
      icon: UserCheck,
      bgColor: "bg-green-50 dark:bg-green-950",
      iconColor: "text-green-600 dark:text-green-400",
      textColor: "text-green-900 dark:text-green-100",
      trend: presentTrend,
      trendGood: presentTrend?.isPositive,
    },
    {
      title: "Absent",
      value: totalAbsent,
      icon: XCircle,
      bgColor: "bg-red-50 dark:bg-red-950",
      iconColor: "text-red-600 dark:text-red-400",
      textColor: "text-red-900 dark:text-red-100",
      trend: absentTrend,
      trendGood: absentTrend?.isNegative,
    },
    {
      title: "Late",
      value: totalLate,
      icon: Clock,
      bgColor: "bg-amber-50 dark:bg-amber-950",
      iconColor: "text-amber-600 dark:text-amber-400",
      textColor: "text-amber-900 dark:text-amber-100",
      trend: lateTrend,
      trendGood: lateTrend?.isNegative,
    },
    {
      title: "Incomplete",
      value: totalIncomplete,
      icon: AlertTriangle,
      bgColor: "bg-orange-50 dark:bg-orange-950",
      iconColor: "text-orange-600 dark:text-orange-400",
      textColor: "text-orange-900 dark:text-orange-100",
      trend: null,
      trendGood: false,
      pulse: totalIncomplete > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {kpiData.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <Card
            key={kpi.title}
            className={cn(
              "border-2 transition-all hover:shadow-md",
              kpi.bgColor,
              kpi.pulse && "animate-pulse"
            )}
            data-testid={`kpi-card-${kpi.title.toLowerCase()}`}
          >
            <CardContent className="p-4 md:p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs md:text-sm font-medium text-muted-foreground mb-1">
                    {kpi.title}
                  </p>
                  <div className="flex items-baseline gap-2">
                    <h3 className={cn("text-2xl md:text-3xl font-bold", kpi.textColor)}>
                      {kpi.value}
                    </h3>
                    {kpi.trend && (
                      <div
                        className={cn(
                          "flex items-center text-xs font-medium",
                          kpi.trendGood ? "text-green-600" : "text-red-600"
                        )}
                      >
                        {kpi.trendGood ? (
                          <TrendingUp className="h-3 w-3 mr-1" />
                        ) : (
                          <TrendingDown className="h-3 w-3 mr-1" />
                        )}
                        {kpi.trend.value}%
                      </div>
                    )}
                  </div>
                </div>
                <div className={cn("p-2 md:p-3 rounded-full", kpi.bgColor)}>
                  <Icon className={cn("h-5 w-5 md:h-6 md:w-6", kpi.iconColor)} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

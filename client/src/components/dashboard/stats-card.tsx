import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

interface StatsCardProps {
  title: string;
  growthPercent: number;
  stats: {
    label: string;
    value: string;
    change: {
      value: number;
      period: string;
    };
  }[];
}

export function StatsCard({ title, growthPercent, stats }: StatsCardProps) {
  return (
    <Card className="border border-gray-200 h-full">
      <CardContent className="p-4 sm:p-5 md:p-6">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h2 className="font-semibold text-base sm:text-lg">{title}</h2>
          <div className="bg-success/10 text-success px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-medium flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            +{growthPercent}%
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {stats.map((stat, index) => (
            <div 
              key={index} 
              className={
                `${index < stats.length - 1 && 'sm:border-r sm:border-gray-200 sm:pr-4'} 
                 ${index === 0 && 'pb-2 border-b border-gray-200 sm:border-b-0 sm:pb-0'}`
              }
            >
              <p className="text-foreground/60 text-xs sm:text-sm mb-0.5 sm:mb-1">{stat.label}</p>
              <p className="text-xl sm:text-2xl font-bold">{stat.value}</p>
              <p className="text-success text-[10px] sm:text-xs mt-0.5 sm:mt-1 flex items-center">
                <TrendingUp className="mr-0.5 sm:mr-1 h-2.5 w-2.5 sm:h-3 sm:w-3" /> 
                <span className="truncate">{stat.change.value}% from {stat.change.period}</span>
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

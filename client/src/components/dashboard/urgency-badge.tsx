import { AlertCircle, Clock, CheckCircle2 } from "lucide-react";

interface UrgencyBadgeProps {
  type: "critical" | "warning" | "info" | "success";
  count: number;
  label: string;
}

const typeConfig = {
  critical: {
    icon: AlertCircle,
    bgColor: "bg-destructive/10",
    textColor: "text-destructive",
    borderColor: "border-destructive/20"
  },
  warning: {
    icon: Clock,
    bgColor: "bg-warning/10",
    textColor: "text-warning",
    borderColor: "border-warning/20"
  },
  info: {
    icon: Clock,
    bgColor: "bg-info/10",
    textColor: "text-info",
    borderColor: "border-info/20"
  },
  success: {
    icon: CheckCircle2,
    bgColor: "bg-success/10",
    textColor: "text-success",
    borderColor: "border-success/20"
  }
};

export function UrgencyBadge({ type, count, label }: UrgencyBadgeProps) {
  const config = typeConfig[type];
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${config.bgColor} border ${config.borderColor}`}>
      <Icon className={`h-4 w-4 ${config.textColor}`} />
      <span className={`text-sm font-medium ${config.textColor}`}>
        {count} {label}
      </span>
    </div>
  );
}

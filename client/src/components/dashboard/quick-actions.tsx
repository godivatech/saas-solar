import { useLocation } from "wouter";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface QuickAction {
  id: string;
  label: string;
  icon: ReactNode;
  iconColor: string;
  href: string;
  onClick?: () => void;
  category?: "primary" | "secondary";
}

interface QuickActionsProps {
  actions: QuickAction[];
  title?: string;
}

export function QuickActions({ actions, title = "Quick Actions" }: QuickActionsProps) {
  const [, setLocation] = useLocation();
  const primaryActions = actions.filter(a => a.category !== "secondary");
  const secondaryActions = actions.filter(a => a.category === "secondary");

  const handleActionClick = (action: QuickAction) => {
    if (action.onClick) {
      action.onClick();
    } else {
      setLocation(action.href);
    }
  };

  return (
    <Card className="border border-gray-200">
      <CardContent className="p-4 sm:p-5 md:p-6">
        <CardTitle className="font-semibold text-base sm:text-lg mb-3 sm:mb-4">{title}</CardTitle>

        {/* All Actions in One Row */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4">
          {actions.map((action) => (
            <button
              key={action.id}
              onClick={() => handleActionClick(action)}
              data-testid={`button-quick-action-${action.id}`}
              className="flex flex-col items-center justify-center p-4 sm:p-5 md:p-6 bg-white hover:bg-gray-50 rounded-lg sm:rounded-xl transition-colors cursor-pointer active:scale-95 touch-manipulation border border-gray-200 hover:border-gray-300 hover:shadow-sm"
            >
              <div className={cn("mb-2 sm:mb-3", action.iconColor)}>
                {action.icon}
              </div>
              <span className="text-xs sm:text-sm font-medium text-gray-900 text-center leading-tight">{action.label}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

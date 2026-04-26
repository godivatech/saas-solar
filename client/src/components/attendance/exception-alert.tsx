import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExceptionAlertProps {
  incompleteCount: number;
  onFixAll: () => void;
  onViewCorrections: () => void;
  isFixing?: boolean;
}

export function ExceptionAlert({
  incompleteCount,
  onFixAll,
  onViewCorrections,
  isFixing = false,
}: ExceptionAlertProps) {
  if (incompleteCount === 0) return null;

  return (
    <Alert
      className={cn(
        "border-2 border-red-200 bg-red-50 dark:bg-red-950/20",
        "shadow-lg animate-in slide-in-from-top duration-300"
      )}
      data-testid="alert-exceptions"
    >
      <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
      <AlertDescription className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 ml-6">
        <div className="flex-1">
          <p className="font-semibold text-red-900 dark:text-red-100">
            {incompleteCount} Incomplete Record{incompleteCount !== 1 ? "s" : ""} Need Attention
          </p>
          <p className="text-sm text-red-700 dark:text-red-300 mt-1">
            Employee(s) forgot to check out. This requires immediate correction to maintain accurate attendance data.
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onViewCorrections}
            className="border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300"
            data-testid="button-view-corrections"
          >
            <AlertTriangle className="h-4 w-4 mr-2" />
            View All
          </Button>
          <Button
            size="sm"
            onClick={onFixAll}
            disabled={isFixing}
            className="bg-red-600 hover:bg-red-700 text-white"
            data-testid="button-fix-all"
          >
            <Clock className="h-4 w-4 mr-2" />
            Fix All Now
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

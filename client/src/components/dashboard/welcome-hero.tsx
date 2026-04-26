import { Card, CardContent } from "@/components/ui/card";
import { Sun, Zap } from "lucide-react";

interface WelcomeHeroProps {
  userName: string;
  department?: string;
  greeting?: string;
}

export function WelcomeHero({ userName, department, greeting }: WelcomeHeroProps) {
  // Get time-based greeting
  const getGreeting = () => {
    if (greeting) return greeting;
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  // Get role-based message
  const getRoleMessage = (dept?: string) => {
    switch (dept?.toLowerCase()) {
      case "technical":
        return "Let's keep those solar systems running smoothly";
      case "marketing":
        return "Ready to close some solar deals?";
      case "sales":
        return "Time to bring in some new solar projects";
      case "hr":
        return "Managing your team's energy";
      case "admin":
        return "Running the solar show";
      case "operations":
        return "Keeping operations on track";
      default:
        return "Let's power up your day";
    }
  };

  return (
    <Card className="border border-gray-200 bg-gradient-to-r from-primary/5 to-secondary/5 overflow-hidden">
      <CardContent className="p-6 sm:p-8">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Sun className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-primary">Solar Energy Dashboard</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-1">
              {getGreeting()}, {userName}
            </h1>
            <p className="text-sm sm:text-base text-foreground/70">
              {getRoleMessage(department)}
            </p>
          </div>
          <div className="hidden sm:flex items-center justify-center h-16 w-16 rounded-full bg-primary/10">
            <Zap className="h-8 w-8 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

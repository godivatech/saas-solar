import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

interface Activity {
  id: string;
  icon: string;
  iconBgColor: string;
  title: string;
  description: string;
  time: string;
}

interface ActivityTimelineProps {
  activities: Activity[];
  title?: string;
  period?: string;
}

export function ActivityTimeline({ 
  activities, 
  title = "Recent Activity", 
  period = "Today" 
}: ActivityTimelineProps) {
  return (
    <Card className="border border-gray-200">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">{title}</h2>
          <span className="text-xs text-gray-500">{period}</span>
        </div>
        
        {/* Activity Timeline */}
        <div className="relative">
          {/* Timeline Line */}
          <div className="absolute top-0 left-4 bottom-0 w-0.5 bg-gray-200"></div>
          
          {/* Timeline Items */}
          <div className="space-y-6 relative z-10">
            {activities.map((activity) => (
              <div key={activity.id} className="flex">
                <div 
                  className={`h-8 w-8 rounded-full ${activity.iconBgColor} flex items-center justify-center text-white relative z-10`}
                >
                  <i className={`${activity.icon} text-sm`}></i>
                </div>
                <div className="ml-4">
                  <p className="text-sm">{activity.title}</p>
                  <p className="text-xs text-gray-500 mt-1">{activity.description}</p>
                  <p className="text-xs text-gray-400 mt-1">{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="mt-4 pt-4 border-t border-gray-200">
          <Button 
            variant="ghost" 
            className="text-secondary text-sm font-medium p-0"
            asChild
          >
            <Link href="/activity">
              <span>View All Activity</span>
              <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

interface PendingApproval {
  id: string;
  type: string;
  description: string;
  time: string;
}

interface PendingApprovalsCardProps {
  approvals: PendingApproval[];
  onViewAll: () => void;
}

export function PendingApprovalsCard({ approvals, onViewAll }: PendingApprovalsCardProps) {
  return (
    <Card className="border border-gray-200">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">Pending Approvals</h2>
          <div className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-medium">
            {approvals.length} pending
          </div>
        </div>
        
        <div className="space-y-3">
          {approvals.map((approval) => (
            <div key={approval.id} className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{approval.type}</span>
                <span className="text-xs text-gray-500">{approval.time}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">{approval.description}</p>
            </div>
          ))}
        </div>
        
        <div className="flex justify-end mt-3">
          <Button 
            variant="ghost" 
            className="text-secondary text-sm font-medium"
            onClick={onViewAll}
          >
            <span>View All</span>
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Employee OT Page
 * Page wrapper for SmartOTButton component
 */

import { SmartOTButton } from '@/components/attendance/smart-ot-button';
import { useAuthContext } from '@/contexts/auth-context';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

export default function EmployeeOT() {
    const { user } = useAuthContext();

    if (!user) {
        return (
            <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>You must be logged in to access this page.</AlertDescription>
            </Alert>
        );
    }

    return (
        <div className="container mx-auto py-6 space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Overtime Management</h1>
                <p className="text-muted-foreground">Start and end your overtime sessions</p>
            </div>

            <SmartOTButton userId={user.uid} />
        </div>
    );
}

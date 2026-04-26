/**
 * Attendance & OT Management Page
 * Unified admin page for workforce management: holidays, overtime, and attendance settings
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HolidayManagement } from '@/components/admin/holiday-management';
import { CompanySettings } from '@/components/admin/company-settings';
import { PayrollLockManager } from '@/components/admin/payroll-lock';
import { useAuthContext } from '@/contexts/auth-context';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

export default function AttendanceOTManagement() {
    const { user, hasRole } = useAuthContext();

    // Check if user is admin or master_admin
    const isAdmin = hasRole(['admin', 'master_admin']);

    if (!isAdmin) {
        return (
            <div className="container mx-auto py-6">
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>Access denied. Admin privileges required.</AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-6 space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Attendance & OT Management</h1>
                <p className="text-muted-foreground">Manage company-wide holidays, overtime policies, and workforce settings</p>
            </div>

            <Tabs defaultValue="holidays" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="holidays">📅 Company Holidays</TabsTrigger>
                    <TabsTrigger value="settings">⚙️ OT Policies</TabsTrigger>
                    <TabsTrigger value="payroll">🔒 Payroll Lock</TabsTrigger>
                </TabsList>

                <TabsContent value="holidays">
                    <HolidayManagement />
                </TabsContent>

                <TabsContent value="settings">
                    <CompanySettings />
                </TabsContent>

                <TabsContent value="payroll">
                    <PayrollLockManager />
                </TabsContent>
            </Tabs>
        </div>
    );
}

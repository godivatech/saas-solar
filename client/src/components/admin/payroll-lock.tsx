/**
 * Payroll Lock Management Component
 * Master admin-only UI for locking/unlocking payroll periods
 * 
 * Features:
 * - Lock payroll periods (master_admin only)
 * - Unlock with mandatory reason
 * - Period status indicators
 * - Lock history
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Lock, Unlock, AlertTriangle, Clock, Calendar, ShieldAlert, Shield, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getOTAuthToken } from '@/hooks/use-ot-auth';
import { format } from 'date-fns';

interface PayrollPeriod {
    id: string;
    month: number;
    year: number;
    status: 'open' | 'locked' | 'processed';
    lockedAt?: string;
    lockedBy?: string;
}

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

export function PayrollLockManager() {
    const { toast } = useToast();
    const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [isLoading, setIsLoading] = useState(false);
    const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
    const [unlockReason, setUnlockReason] = useState('');
    const [selectedPeriod, setSelectedPeriod] = useState<PayrollPeriod | null>(null);

    // Fetch periods
    const fetchPeriods = async () => {
        setIsLoading(true);
        try {
            const token = await getOTAuthToken();
            const response = await fetch(`/api/ot/payroll/periods/${selectedYear}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const { periods: data } = await response.json();
                setPeriods(data || []);
            }
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to fetch payroll periods'
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchPeriods();
    }, [selectedYear]);

    // Lock period
    const handleLock = async () => {
        if (!confirm(`Lock payroll for ${monthNames[selectedMonth - 1]} ${selectedYear}? This will prevent all OT edits for this period.`)) {
            return;
        }

        setIsLoading(true);
        try {
            const token = await getOTAuthToken();
            const response = await fetch('/api/ot/payroll/lock', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    month: selectedMonth,
                    year: selectedYear
                })
            });

            const result = await response.json();

            if (result.success) {
                toast({
                    title: 'Payroll Locked',
                    description: result.message
                });
                await fetchPeriods();
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: result.message
                });
            }
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to lock payroll period'
            });
        } finally {
            setIsLoading(false);
        }
    };

    // Unlock period
    const handleUnlock = async () => {
        if (!selectedPeriod) return;

        if (!unlockReason || unlockReason.trim().length < 10) {
            toast({
                variant: 'destructive',
                title: 'Reason Required',
                description: 'Please provide a reason (minimum 10 characters)'
            });
            return;
        }

        setIsLoading(true);
        try {
            const token = await getOTAuthToken();
            const response = await fetch('/api/ot/payroll/unlock', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    month: selectedPeriod.month,
                    year: selectedPeriod.year,
                    reason: unlockReason
                })
            });

            const result = await response.json();

            if (result.success) {
                toast({
                    title: 'Payroll Unlocked',
                    description: result.message
                });
                setUnlockDialogOpen(false);
                setUnlockReason('');
                setSelectedPeriod(null);
                await fetchPeriods();
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: result.message
                });
            }
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to unlock payroll period'
            });
        } finally {
            setIsLoading(false);
        }
    };

    // Get period status
    const getPeriodStatus = (month: number): PayrollPeriod | null => {
        return periods.find(p => p.month === month && p.year === selectedYear) || null;
    };

    // Get status badge
    const getStatusBadge = (status: string) => {
        const configs: Record<string, { color: string; icon: any }> = {
            'open': { color: 'bg-green-500', icon: CheckCircle },
            'locked': { color: 'bg-red-500', icon: Lock },
            'processed': { color: 'bg-blue-500', icon: Shield }
        };

        const config = configs[status] || configs['open'];
        const Icon = config.icon;

        return (
            <Badge className={`${config.color} text-white`}>
                <Icon className="h-3 w-3 mr-1" />
                {status.toUpperCase()}
            </Badge>
        );
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Shield className="h-5 w-5" />
                                Payroll Period Management
                            </CardTitle>
                            <CardDescription>
                                Lock/unlock payroll periods (Master Admin Only)
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Period Selector */}
                    <div className="grid md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label>Year</Label>
                            <Select
                                value={selectedYear.toString()}
                                onValueChange={(value) => setSelectedYear(parseInt(value))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {[2024, 2025, 2026].map((year) => (
                                        <SelectItem key={year} value={year.toString()}>
                                            {year}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Month</Label>
                            <Select
                                value={selectedMonth.toString()}
                                onValueChange={(value) => setSelectedMonth(parseInt(value))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {monthNames.map((month, index) => (
                                        <SelectItem key={index + 1} value={(index + 1).toString()}>
                                            {month}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>&nbsp;</Label>
                            <Button
                                onClick={handleLock}
                                disabled={isLoading}
                                className="w-full"
                                variant="destructive"
                            >
                                <Lock className="mr-2 h-4 w-4" />
                                Lock Period
                            </Button>
                        </div>
                    </div>

                    <Separator />

                    {/* Periods List */}
                    <div className="space-y-3">
                        <h4 className="font-semibold">Periods for {selectedYear}</h4>
                        <div className="grid gap-3">
                            {monthNames.map((month, index) => {
                                const period = getPeriodStatus(index + 1);
                                const status = period?.status || 'open';

                                return (
                                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <h5 className="font-medium">{month} {selectedYear}</h5>
                                                {getStatusBadge(status)}
                                            </div>
                                            {period?.lockedAt && (
                                                <p className="text-sm text-gray-600">
                                                    Locked on {format(new Date(period.lockedAt), 'MMM d, yyyy h:mm a')}
                                                </p>
                                            )}
                                        </div>
                                        {period?.status === 'locked' && (
                                            <Dialog open={unlockDialogOpen && selectedPeriod?.id === period.id} onOpenChange={(open) => {
                                                setUnlockDialogOpen(open);
                                                if (!open) {
                                                    setUnlockReason('');
                                                    setSelectedPeriod(null);
                                                }
                                            }}>
                                                <DialogTrigger asChild>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => {
                                                            setSelectedPeriod(period);
                                                            setUnlockDialogOpen(true);
                                                        }}
                                                    >
                                                        <Unlock className="mr-2 h-4 w-4" />
                                                        Unlock
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent>
                                                    <DialogHeader>
                                                        <DialogTitle>Unlock Payroll Period</DialogTitle>
                                                        <DialogDescription>
                                                            Unlocking {month} {selectedYear} will allow OT edits again.
                                                            This action requires a mandatory reason.
                                                        </DialogDescription>
                                                    </DialogHeader>

                                                    <div className="space-y-4 py-4">
                                                        <div className="space-y-2">
                                                            <Label htmlFor="reason">Reason for Unlocking * (min 10 chars)</Label>
                                                            <Textarea
                                                                id="reason"
                                                                value={unlockReason}
                                                                onChange={(e) => setUnlockReason(e.target.value)}
                                                                placeholder="e.g., Correction needed for payroll discrepancy in technical department..."
                                                                rows={4}
                                                                required
                                                            />
                                                        </div>
                                                    </div>

                                                    <DialogFooter>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            onClick={() => {
                                                                setUnlockDialogOpen(false);
                                                                setUnlockReason('');
                                                                setSelectedPeriod(null);
                                                            }}
                                                        >
                                                            Cancel
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="destructive"
                                                            onClick={handleUnlock}
                                                            disabled={isLoading || unlockReason.trim().length < 10}
                                                        >
                                                            <Unlock className="mr-2 h-4 w-4" />
                                                            Unlock Period
                                                        </Button>
                                                    </DialogFooter>
                                                </DialogContent>
                                            </Dialog>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Warning Notice */}
            <Card className="border-orange-200 bg-orange-50">
                <CardContent className="pt-6">
                    <div className="flex gap-3">
                        <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                        <div className="space-y-1">
                            <p className="font-medium text-orange-900">Critical Payroll Security</p>
                            <ul className="text-sm text-orange-800 space-y-1 list-disc list-inside">
                                <li>Only <strong>master_admin</strong> can lock/unlock payroll periods</li>
                                <li>Locked periods prevent ALL OT edits to avoid payroll disputes</li>
                                <li>Unlock requires <strong>mandatory reason</strong> (minimum 10 characters)</li>
                                <li>All lock/unlock actions are logged for audit trail</li>
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

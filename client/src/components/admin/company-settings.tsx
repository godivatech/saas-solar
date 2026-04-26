/**
 * Company Settings Component
 * Admin UI for configuring company-wide OT rules
 * 
 * Features:
 * - Configurable weekend days (NO hardcoded Sat/Sun)
 * - Uniform OT rate for all types (weekday, weekend, holiday)
 * - Daily OT cap settings
 * - Pure salary-based calculation (Monthly/26/8)
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, AlertCircle, Settings, Calendar, CheckCircle, Lock, Unlock, AlertTriangle, Clock, ShieldAlert, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getOTAuthToken } from '@/hooks/use-ot-auth';

interface CompanySettings {
    id: string;
    weekendDays: number[];
    defaultOTRate: number;
    weekendOTRate: number; // Kept for backward compatibility, auto-synced with defaultOTRate
    maxOTHoursPerDay: number;
    updatedAt: string;
}

const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function CompanySettings() {
    const { toast } = useToast();
    const [settings, setSettings] = useState<CompanySettings | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Form state
    const [weekendDays, setWeekendDays] = useState<number[]>([]);
    const [otRate, setOTRate] = useState(''); // Single rate for all OT types
    const [maxOTHoursPerDay, setMaxOTHoursPerDay] = useState('');

    // Fetch settings
    const fetchSettings = async () => {
        setIsLoading(true);
        try {
            const token = await getOTAuthToken();
            const response = await fetch('/api/ot/settings', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const { settings: data } = await response.json();
                setSettings(data);

                // Populate form
                setWeekendDays(data.weekendDays || []);
                setOTRate(data.defaultOTRate?.toString() || '1.0');
                setMaxOTHoursPerDay(data.maxOTHoursPerDay?.toString() || '');
            }
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to fetch settings'
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    // Handle save
    const handleSave = async () => {
        // Validation
        const otRateNum = parseFloat(otRate);
        const maxOTNum = parseFloat(maxOTHoursPerDay);

        const rates = {
            defaultOTRate: otRateNum,
            weekendOTRate: otRateNum, // Same as default for uniform rate
            maxOTHoursPerDay: maxOTNum
        };

        if (isNaN(otRateNum) || otRateNum <= 0 || isNaN(maxOTNum) || maxOTNum <= 0) {
            toast({
                variant: 'destructive',
                title: 'Invalid Input',
                description: 'OT rate and max hours must be greater than 0'
            });
            return;
        }

        setIsSaving(true);
        try {
            const token = await getOTAuthToken();
            const response = await fetch('/api/ot/settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    weekendDays,
                    ...rates
                })
            });

            const result = await response.json();

            if (result.success) {
                toast({
                    title: 'Settings Updated',
                    description: 'Company OT settings saved successfully'
                });
                await fetchSettings();
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
                description: 'Failed to save settings'
            });
        } finally {
            setIsSaving(false);
        }
    };

    // Toggle weekend day
    const toggleWeekendDay = (day: number) => {
        if (weekendDays.includes(day)) {
            setWeekendDays(weekendDays.filter(d => d !== day));
        } else {
            setWeekendDays([...weekendDays, day].sort());
        }
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>Company OT Settings</CardTitle>
                    <CardDescription>
                        Configure company-wide overtime rules and rates
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Weekend Days Configuration */}
                    <div className="space-y-3">
                        <Label className="text-base font-semibold">Weekend Days (Configurable)</Label>
                        <p className="text-sm text-gray-600">
                            Select which days are considered weekends for your company. NO days are hardcoded.
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {weekdayNames.map((day, index) => (
                                <div key={index} className="flex items-center space-x-2">
                                    <Switch
                                        checked={weekendDays.includes(index)}
                                        onCheckedChange={() => toggleWeekendDay(index)}
                                        id={`day-${index}`}
                                    />
                                    <Label htmlFor={`day-${index}`} className="cursor-pointer">
                                        {day}
                                    </Label>
                                </div>
                            ))}
                        </div>
                        <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                            <p className="text-sm text-blue-900">
                                <strong>Selected weekends:</strong>{' '}
                                {weekendDays.length === 0
                                    ? 'No weekends (all days are working days)'
                                    : weekendDays.map(d => weekdayNames[d]).join(', ')}
                            </p>
                        </div>
                    </div>

                    <Separator />

                    {/* OT Rate */}
                    <div className="space-y-3">
                        <Label className="text-base font-semibold">OT Rate Multiplier</Label>
                        <div className="max-w-md space-y-2">
                            <Label htmlFor="otRate">Uniform OT Rate *</Label>
                            <Input
                                id="otRate"
                                type="number"
                                step="0.1"
                                min="0.1"
                                value={otRate}
                                onChange={(e) => setOTRate(e.target.value)}
                                placeholder="e.g., 1.0"
                            />
                            <p className="text-xs text-gray-500">
                                Applies to ALL OT types: weekday, weekend, and holiday (e.g., 1.0 = 1.0x base pay from salary)
                            </p>
                        </div>
                    </div>

                    <Separator />

                    {/* Daily OT Caps */}
                    <div className="space-y-3">
                        <Label className="text-base font-semibold">Daily OT Controls</Label>
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="maxOTHoursPerDay">Max OT Hours Per Day *</Label>
                                <Input
                                    id="maxOTHoursPerDay"
                                    type="number"
                                    step="0.5"
                                    min="1"
                                    value={maxOTHoursPerDay}
                                    onChange={(e) => setMaxOTHoursPerDay(e.target.value)}
                                    placeholder="e.g., 5.0"
                                />
                                <p className="text-xs text-gray-500">
                                    System will warn if OT exceeds this limit
                                </p>
                            </div>
                        </div>
                    </div>


                    <Separator />

                    {/* Save Button */}
                    <Button
                        onClick={handleSave}
                        disabled={isSaving || isLoading}
                        className="w-full md:w-auto"
                    >
                        <Save className="mr-2 h-4 w-4" />
                        {isSaving ? 'Saving...' : 'Save Settings'}
                    </Button>
                </CardContent >
            </Card >
        </div >
    );
}

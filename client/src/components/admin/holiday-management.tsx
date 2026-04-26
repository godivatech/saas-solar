/**
 * Holiday Management Component
 * Admin UI for managing company holidays
 * 
 * Features:
 * - Calendar view of holidays
 * - Add/Edit/Delete functionality
 * - OT submission control (allow/block per holiday)
 * - Department-specific holidays
 * - Month/Year navigation
 * 
 * Note: OT rate is calculated from employee salary (monthly / days / hours)
 * No need to configure per-holiday multipliers
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
import { Calendar as CalendarIcon, Plus, Pencil, Trash2, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { getOTAuthToken } from '@/hooks/use-ot-auth';

interface Holiday {
    id: string;
    date: string;
    name: string;
    type: 'national' | 'regional' | 'company';
    year: number;
    isPaid: boolean;
    isOptional: boolean;
    allowOT: boolean;  // Controls whether OT can be submitted on this holiday
    applicableDepartments?: string[];
    description?: string;
    createdBy: string;
    createdAt: string;
}

const departments = ['operations', 'admin', 'hr', 'marketing', 'sales', 'technical', 'housekeeping'];

export function HolidayManagement() {
    const { toast } = useToast();
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        date: '',
        name: '',
        type: 'national' as 'national' | 'regional' | 'company',
        applicableDepartments: [] as string[],
        allowOT: false, // Default: strict holiday (no OT allowed)
        notes: ''  // Ensure default value
    });

    // Fetch holidays
    const fetchHolidays = async () => {
        setIsLoading(true);
        try {
            const token = await getOTAuthToken();
            const url = selectedMonth
                ? `/api/holidays?month=${selectedMonth}&year=${selectedYear}`
                : `/api/holidays?year=${selectedYear}`;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const { holidays: data } = await response.json();
                setHolidays(data || []);
            }
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to fetch holidays'
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchHolidays();
    }, [selectedYear, selectedMonth]);

    // Handle form submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        if (!formData.date || !formData.name) {
            toast({
                variant: 'destructive',
                title: 'Missing Fields',
                description: 'Please fill in all required fields'
            });
            return;
        }

        setIsLoading(true);
        try {
            const token = await getOTAuthToken();
            const url = editingHoliday
                ? `/api/holidays/${editingHoliday.id}`
                : '/api/holidays';

            const method = editingHoliday ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    date: formData.date,
                    name: formData.name,
                    type: formData.type,
                    allowOT: formData.allowOT,
                    applicableDepartments: formData.applicableDepartments.length > 0
                        ? formData.applicableDepartments
                        : null,
                    notes: formData.notes || null
                })
            });

            const result = await response.json();

            if (result.success) {
                toast({
                    title: editingHoliday ? 'Holiday Updated' : 'Holiday Created',
                    description: result.message
                });
                setIsDialogOpen(false);
                resetForm();
                await fetchHolidays();
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: result.message || 'Failed to save holiday'
                });
            }
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to save holiday'
            });
        } finally {
            setIsLoading(false);
        }
    };

    // Handle delete
    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this holiday?')) return;

        setIsLoading(true);
        try {
            const token = await getOTAuthToken();
            const response = await fetch(`/api/holidays/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const result = await response.json();

            if (result.success) {
                toast({
                    title: 'Holiday Deleted',
                    description: 'Holiday removed successfully'
                });
                await fetchHolidays();
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
                description: 'Failed to delete holiday'
            });
        } finally {
            setIsLoading(false);
        }
    };

    // Edit holiday
    const handleEdit = (holiday: Holiday) => {
        setEditingHoliday(holiday);
        setFormData({
            date: format(new Date(holiday.date), 'yyyy-MM-dd'),
            name: holiday.name,
            type: holiday.type,
            applicableDepartments: holiday.applicableDepartments || [],
            allowOT: holiday.allowOT || false,
            notes: holiday.description || ''
        });
        setIsDialogOpen(true);
    };

    // Reset form
    const resetForm = () => {
        setFormData({
            date: '',
            name: '',
            type: 'national',
            applicableDepartments: [],
            allowOT: false,
            notes: ''
        });
        setEditingHoliday(null);
    };

    // Get type badge
    const getTypeBadge = (type: string) => {
        const colors: Record<string, string> = {
            'national': 'bg-red-500',
            'regional': 'bg-blue-500',
            'company': 'bg-green-500'
        };
        return (
            <Badge className={colors[type] || 'bg-gray-500'}>
                {type.toUpperCase()}
            </Badge>
        );
    };

    return (
        <div className="space-y-4">
            {/* Header with Controls */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Holiday Management</CardTitle>
                            <CardDescription>
                                Configure company holidays and OT submission policy
                            </CardDescription>
                        </div>
                        <Dialog open={isDialogOpen} onOpenChange={(open) => {
                            setIsDialogOpen(open);
                            if (!open) resetForm();
                        }}>
                            <DialogTrigger asChild>
                                <Button>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add Holiday
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                                <form onSubmit={handleSubmit}>
                                    <DialogHeader>
                                        <DialogTitle>
                                            {editingHoliday ? 'Edit Holiday' : 'Add New Holiday'}
                                        </DialogTitle>
                                        <DialogDescription>
                                            Configure holiday details and OT submission policy
                                        </DialogDescription>
                                    </DialogHeader>

                                    <div className="grid gap-4 py-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="date">Date *</Label>
                                                <Input
                                                    id="date"
                                                    type="date"
                                                    value={formData.date}
                                                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                                    required
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="type">Type *</Label>
                                                <Select
                                                    value={formData.type}
                                                    onValueChange={(value: any) => setFormData({ ...formData, type: value })}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="national">National</SelectItem>
                                                        <SelectItem value="regional">Regional</SelectItem>
                                                        <SelectItem value="company">Company</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="name">Holiday Name *</Label>
                                            <Input
                                                id="name"
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                placeholder="e.g., Republic Day, Diwali"
                                                required
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Applicable Departments (leave empty for all)</Label>
                                            <div className="grid grid-cols-2 gap-2">
                                                {departments.map((dept) => (
                                                    <label key={dept} className="flex items-center space-x-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={formData.applicableDepartments.includes(dept)}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setFormData({
                                                                        ...formData,
                                                                        applicableDepartments: [...formData.applicableDepartments, dept]
                                                                    });
                                                                } else {
                                                                    setFormData({
                                                                        ...formData,
                                                                        applicableDepartments: formData.applicableDepartments.filter(d => d !== dept)
                                                                    });
                                                                }
                                                            }}
                                                            className="rounded"
                                                        />
                                                        <span className="text-sm capitalize">{dept}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-center space-x-2">
                                                <input
                                                    id="allowOT"
                                                    type="checkbox"
                                                    checked={formData.allowOT}
                                                    onChange={(e) => setFormData({
                                                        ...formData,
                                                        allowOT: e.target.checked
                                                    })}
                                                    className="rounded border-gray-300"
                                                />
                                                <Label htmlFor="allowOT" className="font-normal cursor-pointer">
                                                    Allow employees to submit OT on this holiday
                                                </Label>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                {formData.allowOT
                                                    ? "✅ Employees can work and submit OT at the configured rate"
                                                    : "🚫 This is a strict holiday - no OT submissions allowed"
                                                }
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="notes">Notes (optional)</Label>
                                            <Textarea
                                                id="notes"
                                                value={formData.notes}
                                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                                placeholder="Additional information about this holiday"
                                            />
                                        </div>
                                    </div>

                                    <DialogFooter>
                                        <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                                            Cancel
                                        </Button>
                                        <Button type="submit" disabled={isLoading}>
                                            {editingHoliday ? 'Update' : 'Create'} Holiday
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Year/Month Filter */}
                    <div className="flex gap-4 mb-4">
                        <Select
                            value={selectedYear.toString()}
                            onValueChange={(value) => setSelectedYear(parseInt(value))}
                        >
                            <SelectTrigger className="w-32">
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

                        <Select
                            value={selectedMonth?.toString() || 'all'}
                            onValueChange={(value) => setSelectedMonth(value === 'all' ? null : parseInt(value))}
                        >
                            <SelectTrigger className="w-40">
                                <SelectValue placeholder="All Months" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Months</SelectItem>
                                {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                                    <SelectItem key={month} value={month.toString()}>
                                        {format(new Date(2000, month - 1), 'MMMM')}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Holidays List */}
                    <div className="space-y-3">
                        {isLoading ? (
                            <p className="text-center text-gray-500 py-8">Loading holidays...</p>
                        ) : holidays.length === 0 ? (
                            <div className="text-center text-gray-500 py-8">
                                <CalendarIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                                <p>No holidays configured</p>
                            </div>
                        ) : (
                            holidays.map((holiday, index) => (
                                <div key={holiday.id}>
                                    {index > 0 && <Separator className="my-2" />}
                                    <div className="flex items-start justify-between">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-semibold">{holiday.name}</h4>
                                                {getTypeBadge(holiday.type)}
                                            </div>
                                            <p className="text-sm text-gray-600">
                                                {format(new Date(holiday.date), 'EEEE, MMMM d, yyyy')}
                                            </p>
                                            <div className="flex items-center gap-4 text-sm">
                                                {holiday.applicableDepartments && holiday.applicableDepartments.length > 0 && (
                                                    <span className="text-gray-500">
                                                        Applies to: {holiday.applicableDepartments.join(', ')}
                                                    </span>
                                                )}
                                            </div>
                                            {holiday.description && (
                                                <p className="text-sm text-gray-500">{holiday.description}</p>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleEdit(holiday)}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDelete(holiday.id)}
                                            >
                                                <Trash2 className="h-4 w-4 text-red-600" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

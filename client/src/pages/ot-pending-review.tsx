import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthContext } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, CheckCircle, XCircle, Edit3, AlertCircle, Loader2, Calendar, User, MapPin, RefreshCw } from "lucide-react";

export default function OTPendingReview() {
    const { user } = useAuthContext();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [showReviewModal, setShowReviewModal] = useState(false);
    const [selectedSession, setSelectedSession] = useState<any>(null);
    const [reviewAction, setReviewAction] = useState<'APPROVED' | 'ADJUSTED' | 'REJECTED'>('APPROVED');
    const [adjustedHours, setAdjustedHours] = useState('');
    const [reviewNotes, setReviewNotes] = useState('');

    // Fetch pending OT sessions
    const { data: response, isLoading, refetch } = useQuery({
        queryKey: ['/api/ot/sessions/pending'],
        enabled: !!user && (user.role === "master_admin" || user.role === "admin"),
        refetchInterval: 60000,
        queryFn: async () => {
            const res = await apiRequest('/api/ot/sessions/pending', 'GET');
            return res.json();
        },
    });

    const pendingSessions = response?.sessions || [];

    // Review mutation
    const reviewMutation = useMutation({
        mutationFn: async ({ sessionId, action, adjustedHours, notes, attendanceId }: {
            sessionId: string;
            action: 'APPROVED' | 'ADJUSTED' | 'REJECTED';
            adjustedHours?: number;
            notes?: string;
            attendanceId: string;
        }) => {
            const res = await apiRequest(`/api/ot/sessions/${sessionId}/review`, 'POST', {
                action,
                adjustedHours,
                notes,
                attendanceId
            });
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['/api/ot/sessions/pending'] });
            queryClient.invalidateQueries({ queryKey: ['/api/ot/reports'] }); // ✅ FIX: Invalidate reports cache
            refetch();
            setShowReviewModal(false);
            resetForm();
            toast({
                title: "Review Processed",
                description: "OT session reviewed successfully",
            });
        },
        onError: (error: any) => {
            toast({
                title: "Review Failed",
                description: error.message || "Failed to process review",
                variant: "destructive",
            });
        },
    });

    // ✅ FIX: Calculate hours from timestamps (otHours is 0 for pending review)
    // MUST be defined before handleReview to avoid "undefined" error
    const calculateHours = (session: any) => {
        if (!session.startTime || !session.endTime) return 0;

        const start = new Date(session.startTime);
        const end = new Date(session.endTime);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;

        const durationMs = end.getTime() - start.getTime();
        const hours = durationMs / (1000 * 60 * 60);

        return Math.max(0, hours); // Prevent negative hours
    };

    const resetForm = () => {
        setSelectedSession(null);
        setReviewAction('APPROVED');
        setAdjustedHours('');
        setReviewNotes('');
    };

    const handleReview = (session: any) => {
        setSelectedSession(session);
        setReviewAction('APPROVED');
        setAdjustedHours(calculateHours(session).toFixed(2));  // ✅ FIX: Pre-fill with calculated hours
        setReviewNotes('');
        setShowReviewModal(true);
    };

    const handleSubmitReview = () => {
        if (!selectedSession) return;

        if (reviewAction === 'ADJUSTED' && (!adjustedHours || parseFloat(adjustedHours) < 0)) {
            toast({
                title: "Invalid Hours",
                description: "Please enter valid adjusted hours",
                variant: "destructive",
            });
            return;
        }

        reviewMutation.mutate({
            sessionId: selectedSession.sessionId,
            action: reviewAction,
            adjustedHours: reviewAction === 'ADJUSTED' ? parseFloat(adjustedHours) : undefined,
            notes: reviewNotes,
            attendanceId: selectedSession.attendanceId
        });
    };

    const formatDate = (date: any) => {
        return new Date(date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const formatTime = (date: any) => {
        return new Date(date).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    const getStatusBadge = (session: any) => {
        if (session.autoClosedAt) {
            return <Badge variant="destructive" className="gap-1">
                <AlertCircle className="h-3 w-3" />
                Auto-Closed
            </Badge>;
        }
        if (calculateHours(session) > 5) {  // ✅ FIX: Use calculated hours
            return <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" />
                Exceeds Limit
            </Badge>;
        }
        return <Badge variant="secondary">Pending</Badge>;
    };

    if (!user || (user.role !== "master_admin" && user.role !== "admin")) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Card className="w-96">
                    <CardHeader>
                        <CardTitle>Access Denied</CardTitle>
                        <CardDescription>You don't have permission to view this page</CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">OT Pending Review</h1>
                    <p className="text-gray-600 mt-1">
                        Review and approve overtime sessions requiring verification
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={() => refetch()}
                    disabled={isLoading}
                >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Pending</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{pendingSessions.length}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Auto-Closed</CardTitle>
                        <AlertCircle className="h-4 w-4 text-destructive" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {pendingSessions.filter((s: any) => s.autoClosedAt).length}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Over Limit</CardTitle>
                        <Clock className="h-4 w-4 text-orange-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {pendingSessions.filter((s: any) => calculateHours(s) > 5).length}  {/* ✅ FIX: Use calculated hours */}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Pending Sessions Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Pending Sessions</CardTitle>
                    <CardDescription>
                        Review each session to approve, adjust, or reject overtime claims
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                        </div>
                    ) : pendingSessions.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500 opacity-50" />
                            <p className="text-lg font-medium">All Clear!</p>
                            <p className="text-sm mt-2">No pending OT sessions requiring review</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Employee</TableHead>
                                    <TableHead>Department</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Start Time</TableHead>
                                    <TableHead>End Time</TableHead>
                                    <TableHead className="text-right">Hours</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {pendingSessions.map((session: any) => (
                                    <TableRow key={session.sessionId}>
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                <User className="h-4 w-4 text-gray-400" />
                                                {session.userName}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{session.userDepartment}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Calendar className="h-4 w-4 text-gray-400" />
                                                {formatDate(session.date)}
                                            </div>
                                        </TableCell>
                                        <TableCell>{formatTime(session.startTime)}</TableCell>
                                        <TableCell>
                                            {session.endTime ? formatTime(session.endTime) :
                                                <span className="text-gray-400 italic">Auto-closed</span>
                                            }
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-semibold">
                                            {calculateHours(session).toFixed(2)}h  {/* ✅ FIX: Calculate from timestamps */}
                                        </TableCell>
                                        <TableCell>{getStatusBadge(session)}</TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                size="sm"
                                                onClick={() => handleReview(session)}
                                                disabled={reviewMutation.isPending}
                                            >
                                                <Edit3 className="h-4 w-4 mr-1" />
                                                Review
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Review Modal */}
            <Dialog open={showReviewModal} onOpenChange={setShowReviewModal}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Review OT Session</DialogTitle>
                        <DialogDescription>
                            Approve, adjust, or reject this overtime claim
                        </DialogDescription>
                    </DialogHeader>

                    {selectedSession && (
                        <div className="space-y-4">
                            {/* Session Details */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-sm">Session Details</CardTitle>
                                </CardHeader>
                                <CardContent className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-gray-600">Employee:</span>
                                        <p className="font-medium">{selectedSession.userName}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Department:</span>
                                        <p className="font-medium">{selectedSession.userDepartment}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Date:</span>
                                        <p className="font-medium">{formatDate(selectedSession.date)}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Hours Claimed:</span>
                                        <p className="font-mono font-bold text-lg">{calculateHours(selectedSession).toFixed(2)}h</p>  {/* ✅ FIX: Show calculated hours */}
                                    </div>
                                    {selectedSession.autoClosedAt && (
                                        <div className="col-span-2">
                                            <Badge variant="destructive" className="gap-1">
                                                <AlertCircle className="h-3 w-3" />
                                                Auto-Closed: {selectedSession.autoClosedNote}
                                            </Badge>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Review Action */}
                            <div className="space-y-4">
                                <div>
                                    <Label>Action</Label>
                                    <Select value={reviewAction} onValueChange={(v: any) => setReviewAction(v)}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="APPROVED">
                                                <div className="flex items-center gap-2">
                                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                                    Approve - Accept as is
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="ADJUSTED">
                                                <div className="flex items-center gap-2">
                                                    <Edit3 className="h-4 w-4 text-orange-500" />
                                                    Adjust - Change hours
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="REJECTED">
                                                <div className="flex items-center gap-2">
                                                    <XCircle className="h-4 w-4 text-red-500" />
                                                    Reject - Deny claim
                                                </div>
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {reviewAction === 'ADJUSTED' && (
                                    <div>
                                        <Label>Adjusted Hours</Label>
                                        <Input
                                            type="number"
                                            step="0.25"
                                            min="0"
                                            max="12"
                                            value={adjustedHours}
                                            onChange={(e) => setAdjustedHours(e.target.value)}
                                            placeholder="Enter corrected hours"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Calculated: {calculateHours(selectedSession).toFixed(2)}h  {/* ✅ FIX: Show calculated hours */}
                                        </p>
                                    </div>
                                )}

                                <div>
                                    <Label>Notes (Optional)</Label>
                                    <Textarea
                                        value={reviewNotes}
                                        onChange={(e) => setReviewNotes(e.target.value)}
                                        placeholder="Add any notes about this review decision..."
                                        rows={3}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowReviewModal(false)}
                            disabled={reviewMutation.isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmitReview}
                            disabled={reviewMutation.isPending}
                        >
                            {reviewMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {reviewAction === 'APPROVED' && <CheckCircle className="h-4 w-4 mr-2" />}
                            {reviewAction === 'ADJUSTED' && <Edit3 className="h-4 w-4 mr-2" />}
                            {reviewAction === 'REJECTED' && <XCircle className="h-4 w-4 mr-2" />}
                            Confirm {reviewAction.charAt(0) + reviewAction.slice(1).toLowerCase()}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

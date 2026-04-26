/**
 * Smart OT Button Component
 * Field-worker friendly interface with intelligent state management
 * 
 * Features:
 * - Shows only START or END based on active session
 * - Live timer for in-progress sessions
 * - Clear visual states
 * - No confusion about session numbers
 */

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Clock, Zap, StopCircle, MapPin, Camera, AlertCircle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, differenceInMinutes, differenceInHours } from 'date-fns';
import { CameraCaptureModal } from '@/components/ui/camera-capture-modal';
import { getOTAuthToken } from '@/hooks/use-ot-auth';
import { apiRequest } from '@/lib/queryClient';

interface OTSession {
    sessionId: string;
    sessionNumber: number;
    otType: 'regular' | 'weekend' | 'holiday' | 'early_arrival' | 'late_departure';
    startTime: string;
    endTime?: string;
    otHours: number;
    startImageUrl: string;
    endImageUrl?: string;
    startLatitude: string;
    startLongitude: string;
    endLatitude?: string;
    endLongitude?: string;
    startAddress?: string;
    endAddress?: string;
    reason?: string;
    status: 'in_progress' | 'completed' | 'locked';
    createdAt: string;
}

interface SmartOTButtonProps {
    userId: string;
    onSuccess?: () => void;
}

export function SmartOTButton({ userId, onSuccess }: SmartOTButtonProps) {
    const { toast } = useToast();
    const [activeSession, setActiveSession] = useState<OTSession | null>(null);
    const [todaySessions, setTodaySessions] = useState<OTSession[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [totalOTToday, setTotalOTToday] = useState(0);
    const [cameraOpen, setCameraOpen] = useState(false);

    const [otAvailable, setOTAvailable] = useState(false); // Fail-safe: default to disabled
    const [otUnavailableReason, setOTUnavailableReason] = useState<string>("");
    const [nextAvailableTime, setNextAvailableTime] = useState<string>("");
    const [otSystemError, setOTSystemError] = useState(false); // Track if it's a technical error
    const cameraResolveRef = useRef<((value: string) => void) | null>(null);
    const cameraRejectRef = useRef<((reason: Error) => void) | null>(null);

    // Live clock update
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Fetch active session and today's sessions
    const fetchOTSessions = async () => {
        try {
            // Get OT status and availability (fail-safe: disable on error)
            try {
                const statusRes = await apiRequest('/api/ot/status', 'GET');
                const statusData = await statusRes.json();
                setOTAvailable(statusData.buttonAvailable ?? false);
                setOTUnavailableReason(statusData.buttonReason || "");
                setNextAvailableTime(statusData.nextAvailableTime || "");
                setOTSystemError(false); // Clear any previous errors
            } catch (statusError) {
                console.error('Error fetching OT status:', statusError);
                // Technical error: Network/system failure
                setOTAvailable(false);
                setOTSystemError(true);
                setOTUnavailableReason("System error. Please contact support if this persists.");
            }

            // Get active session
            try {
                const activeRes = await apiRequest('/api/ot/sessions/active', 'GET');
                const { session } = await activeRes.json();
                console.log('[FETCH] Active session from API:', session);
                setActiveSession(session);
                console.log('[FETCH] Active session state updated to:', session ? 'ACTIVE' : 'NULL');
            } catch (error) {
                // Silently handle - no active session is not an error
                console.error('[FETCH] Error fetching active session:', error);
            }

            // Get today's sessions
            const today = format(new Date(), 'yyyy-MM-dd');
            try {
                const sessionsRes = await apiRequest(`/api/ot/sessions?date=${today}`, 'GET');
                const { sessions } = await sessionsRes.json();
                setTodaySessions(sessions || []);

                // Calculate total OT
                const total = sessions?.reduce((sum: number, s: OTSession) =>
                    s.status === 'completed' ? sum + s.otHours : sum, 0) || 0;
                setTotalOTToday(total);
            } catch (error) {
                console.error('Error fetching today sessions:', error);
                setTodaySessions([]);
                setTotalOTToday(0);
            }


        } catch (error) {
            console.error('Error fetching OT sessions:', error);
        }
    };

    useEffect(() => {
        fetchOTSessions();
        // Refresh every 30 seconds
        const interval = setInterval(fetchOTSessions, 30000);
        return () => clearInterval(interval);
    }, [userId]);

    // Get geolocation and capture photo
    const getLocationAndPhoto = async (): Promise<{
        latitude: number;
        longitude: number;
        accuracy: number;
        imageUrl: string;
        address?: string;
    } | null> => {
        try {
            // Get location
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 10000
                });
            });

            // Capture photo using camera modal
            const imageUrl = await new Promise<string>((resolve, reject) => {
                setCameraOpen(true);
                cameraResolveRef.current = resolve;
                cameraRejectRef.current = reject;
            });

            return {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                imageUrl,
                address: '' // TODO: Add reverse geocoding if needed
            };
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Location/Photo Required',
                description: 'Please enable location and camera access to record OT.'
            });
            return null;
        }
    };

    // Handle camera capture
    const handleCameraCapture = (imageUrl: string) => {
        setCameraOpen(false);
        if (cameraResolveRef.current) {
            cameraResolveRef.current(imageUrl);
            cameraResolveRef.current = null;
        }
    };

    // Handle camera cancel
    const handleCameraCancel = () => {
        setCameraOpen(false);
        if (cameraRejectRef.current) {
            cameraRejectRef.current(new Error('Camera cancelled'));
            cameraRejectRef.current = null;
        }
    };

    // Start OT
    const handleStartOT = async () => {
        setIsLoading(true);

        try {
            const locationData = await getLocationAndPhoto();
            if (!locationData) {
                setIsLoading(false);
                return;
            }

            console.log('[OT START] Sending request with data:', locationData);

            const response = await apiRequest('/api/ot/sessions/start', 'POST', locationData);

            console.log('[OT START] Response status:', response.status);

            const result = await response.json();
            console.log('[OT START] Result:', result);

            if (result.success) {
                console.log('[OT START] Success! Session ID:', result.sessionId);
                toast({
                    title: 'OT Started',
                    description: `${result.otType} OT session started successfully.`
                });
                console.log('[OT START] Fetching updated sessions...');
                await fetchOTSessions();
                console.log('[OT START] Active session after fetch:', activeSession);
                onSuccess?.();
            } else {
                console.error('[OT START] Failed:', result.message);
                toast({
                    variant: 'destructive',
                    title: 'Failed to Start OT',
                    description: result.message
                });
            }
        } catch (error) {
            console.error('[OT START] Error:', error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to start OT session. Please try again.'
            });
        } finally {
            setIsLoading(false);
        }
    };

    // End OT
    const handleEndOT = async () => {
        if (!activeSession) return;

        setIsLoading(true);

        try {
            const locationData = await getLocationAndPhoto();
            if (!locationData) {
                setIsLoading(false);
                return;
            }

            const response = await apiRequest(`/api/ot/sessions/${activeSession.sessionId}/end`, 'POST', locationData);

            const result = await response.json();

            if (result.success) {
                toast({
                    title: 'OT Completed',
                    description: `Recorded ${result.otHours?.toFixed(2)} hours of OT.`,
                    variant: 'default'
                });
                await fetchOTSessions();
                onSuccess?.();
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Failed to End OT',
                    description: result.message
                });
            }
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to end OT session. Please try again.'
            });
        } finally {
            setIsLoading(false);
        }
    };

    // Calculate duration for active session
    const getActiveDuration = (): string => {
        if (!activeSession) return '0h 0m';

        const start = new Date(activeSession.startTime);
        const minutes = differenceInMinutes(currentTime, start);
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;

        return `${hours}h ${mins}m`;
    };

    // Get OT type badge
    const getOTTypeBadge = (type: string) => {
        const colors: Record<string, string> = {
            'holiday': 'bg-red-500',
            'weekend': 'bg-blue-500',
            'early_arrival': 'bg-green-500',
            'late_departure': 'bg-yellow-500',
            'regular': 'bg-gray-500'
        };

        return (
            <Badge className={colors[type] || 'bg-gray-500'}>
                {type.replace('_', ' ').toUpperCase()}
            </Badge>
        );
    };

    return (
        <>
            <CameraCaptureModal
                isOpen={cameraOpen}
                onClose={handleCameraCancel}
                onCapture={handleCameraCapture}
                title="Capture OT Photo"
                description="Take a photo for OT verification"
            />
            <div className="space-y-4">
                {/* Active Session Alert */}
                {activeSession ? (
                    <Alert className="border-orange-500 bg-orange-50">
                        <Clock className="h-5 w-5 text-orange-600" />
                        <AlertTitle className="text-orange-900 font-semibold">
                            OT In Progress
                        </AlertTitle>
                        <AlertDescription className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    {getOTTypeBadge(activeSession.otType)}
                                    <p className="text-sm text-gray-700 mt-1">
                                        Started at {(() => {
                                            try {
                                                const date = new Date(activeSession.startTime);
                                                if (isNaN(date.getTime())) return "Invalid Time";
                                                return format(date, 'h:mm a');
                                            } catch (e) {
                                                return "Invalid Time";
                                            }
                                        })()}
                                    </p>
                                    <p className="text-lg font-bold text-orange-900 mt-1">
                                        Duration: {getActiveDuration()}
                                    </p>
                                </div>
                            </div>

                            <Button
                                variant="destructive"
                                size="lg"
                                className="w-full mt-3"
                                onClick={handleEndOT}
                                disabled={isLoading}
                            >
                                <StopCircle className="mr-2 h-5 w-5" />
                                END OT NOW
                            </Button>
                        </AlertDescription>
                    </Alert>
                ) : (
                    <>
                        {/* OT Unavailability Message */}
                        {!otAvailable && (
                            otSystemError ? (
                                // Technical Error: Show error-styled alert
                                <Alert variant="destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle className="font-semibold">
                                        System Error
                                    </AlertTitle>
                                    <AlertDescription className="text-sm">
                                        {otUnavailableReason}
                                    </AlertDescription>
                                </Alert>
                            ) : (
                                // Business Rule: Show informational alert
                                <Alert className="border-blue-200 bg-blue-50">
                                    <Clock className="h-4 w-4 text-blue-600" />
                                    <AlertTitle className="text-blue-900 font-semibold">
                                        OT Not Available Right Now
                                    </AlertTitle>
                                    <AlertDescription className="text-blue-800 text-sm">
                                        {otUnavailableReason || "OT is only available before or after your department's regular work hours"}
                                        {nextAvailableTime && (
                                            <p className="mt-2 font-medium">
                                                Available after: <strong>{nextAvailableTime}</strong>
                                            </p>
                                        )}
                                    </AlertDescription>
                                </Alert>
                            )
                        )}

                        {/* OT Available - Start Button */}
                        <Button
                            size="lg"
                            className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
                            onClick={handleStartOT}
                            disabled={isLoading || !otAvailable}
                        >
                            <Zap className="mr-2 h-5 w-5" />
                            START OT
                        </Button>
                    </>
                )}

                {/* Today's OT Summary */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center justify-between">
                            Today's OT Summary
                            <Badge variant="outline" className="text-lg">
                                {totalOTToday.toFixed(2)} hrs
                            </Badge>
                        </CardTitle>
                        <CardDescription>
                            {format(new Date(), 'EEEE, MMMM d, yyyy')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {todaySessions.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-4">
                                No OT sessions recorded today
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {todaySessions.map((session, index) => (
                                    <div key={session.sessionId}>
                                        {index > 0 && <Separator className="my-2" />}
                                        <div className="flex items-start justify-between">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    {getOTTypeBadge(session.otType)}
                                                    {session.status === 'completed' && (
                                                        <CheckCircle className="h-4 w-4 text-green-600" />
                                                    )}
                                                    {session.status === 'locked' && (
                                                        <AlertCircle className="h-4 w-4 text-orange-600" />
                                                    )}
                                                </div>
                                                <p className="text-sm text-gray-600">
                                                    {format(new Date(session.startTime), 'h:mm a')} -
                                                    {session.endTime ? format(new Date(session.endTime), 'h:mm a') : 'In Progress'}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-semibold">
                                                    {session.otHours.toFixed(2)} hrs
                                                </p>
                                                {session.status === 'locked' && (
                                                    <p className="text-xs text-orange-600">Locked</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

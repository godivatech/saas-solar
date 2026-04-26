/**
 * Camera Capture Modal
 * Reusable camera modal for OT photo verification
 */

import { useState, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, X, RotateCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface CameraCaptureModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCapture: (imageUrl: string) => void;
    title?: string;
    description?: string;
}

export function CameraCaptureModal({
    isOpen,
    onClose,
    onCapture,
    title = 'Capture Photo',
    description = 'Take a photo for verification'
}: CameraCaptureModalProps) {
    const webcamRef = useRef<Webcam>(null);
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
    const [error, setError] = useState<string | null>(null);

    const videoConstraints = {
        width: 1280,
        height: 720,
        facingMode: facingMode
    };
    const handleCapture = useCallback(() => {
        const imageSrc = webcamRef.current?.getScreenshot();
        if (imageSrc) {
            setCapturedImage(imageSrc);
            setError(null);
        } else {
            setError('Failed to capture image. Please try again.');
        }
    }, [webcamRef]);

    const handleRetake = () => {
        setCapturedImage(null);
        setError(null);
    };

    const handleConfirm = () => {
        if (capturedImage) {
            onCapture(capturedImage);
            handleClose();
        }
    };

    const handleClose = () => {
        setCapturedImage(null);
        setError(null);
        onClose();
    };

    const toggleCamera = () => {
        setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
        setCapturedImage(null);
    };

    const handleUserMediaError = (error: string | DOMException) => {
        console.error('Camera error:', error);
        setError('Camera access denied. Please enable camera permissions in your browser.');
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {error && (
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                        {capturedImage ? (
                            <img
                                src={capturedImage}
                                alt="Captured"
                                className="w-full h-full object-contain"
                            />
                        ) : (
                            <Webcam
                                ref={webcamRef}
                                audio={false}
                                screenshotFormat="image/jpeg"
                                videoConstraints={videoConstraints}
                                className="w-full h-full object-contain"
                                onUserMediaError={handleUserMediaError}
                            />
                        )}
                    </div>

                    <div className="flex gap-2 justify-center">
                        {capturedImage ? (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={handleRetake}
                                >
                                    <X className="mr-2 h-4 w-4" />
                                    Retake
                                </Button>
                                <Button onClick={handleConfirm}>
                                    <Camera className="mr-2 h-4 w-4" />
                                    Use This Photo
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={toggleCamera}
                                >
                                    <RotateCw className="mr-2 h-4 w-4" />
                                    Switch Camera
                                </Button>
                                <Button onClick={handleCapture}>
                                    <Camera className="mr-2 h-4 w-4" />
                                    Capture Photo
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleClose}>
                        Cancel
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

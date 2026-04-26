/**
 * Offline Indicator Component
 * Shows connection status and pending actions in user-friendly way
 */

import React, { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WifiOff, Wifi, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useOfflineHandler } from '@/utils/offline-handler';

export function OfflineIndicator() {
  const { state, message, isHealthy } = useOfflineHandler();
  const { toast } = useToast();
  
  // Listen for custom toast events from offline handler
  useEffect(() => {
    const handleOfflineToast = (event: CustomEvent) => {
      toast({
        title: event.detail.title,
        description: event.detail.description,
        variant: event.detail.variant
      });
    };

    const handleOnlineToast = (event: CustomEvent) => {
      toast({
        title: event.detail.title,
        description: event.detail.description,
        variant: event.detail.variant
      });
    };

    const handleSyncCompleteToast = (event: CustomEvent) => {
      toast({
        title: event.detail.title,
        description: event.detail.description,
        variant: event.detail.variant
      });
    };

    window.addEventListener('show-offline-toast', handleOfflineToast as EventListener);
    window.addEventListener('show-online-toast', handleOnlineToast as EventListener);
    window.addEventListener('show-sync-complete-toast', handleSyncCompleteToast as EventListener);

    return () => {
      window.removeEventListener('show-offline-toast', handleOfflineToast as EventListener);
      window.removeEventListener('show-online-toast', handleOnlineToast as EventListener);
      window.removeEventListener('show-sync-complete-toast', handleSyncCompleteToast as EventListener);
    };
  }, [toast]);

  // Don't show indicator when everything is working normally
  if (isHealthy && state.retryQueue.length === 0) {
    return null;
  }

  const getStatusIcon = () => {
    if (!state.isOnline) {
      return <WifiOff className="h-4 w-4 text-red-500" />;
    }
    if (state.retryQueue.length > 0) {
      return <Clock className="h-4 w-4 text-amber-500" />;
    }
    return <Wifi className="h-4 w-4 text-green-500" />;
  };

  const getStatusColor = () => {
    if (!state.isOnline) return 'destructive';
    if (state.retryQueue.length > 0) return 'default';
    return 'default';
  };

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm">
      <Alert variant={getStatusColor()} className="shadow-lg">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <AlertDescription className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {!state.isOnline ? 'You\'re offline' : 'Syncing changes'}
              </span>
              {state.retryQueue.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {state.retryQueue.length} pending
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {message}
            </div>
          </AlertDescription>
        </div>
      </Alert>
    </div>
  );
}

// Health check endpoint for the server
export async function addHealthCheckRoute() {
  // This would be added to server routes
  return {
    path: '/api/health',
    method: 'HEAD',
    handler: (_req: any, res: any) => {
      res.status(200).end();
    }
  };
}
/**
 * Undo Manager Component
 * Provides undo capabilities for bulk operations with user-friendly interface
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Undo2, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export interface UndoAction {
  id: string;
  description: string;
  timestamp: Date;
  undoFunction: () => Promise<void>;
  affectedCount: number;
  category: 'attendance' | 'payroll' | 'users' | 'departments';
  canUndo: boolean;
  expiresAt?: Date;
}

interface UndoManagerProps {
  actions: UndoAction[];
  onUndo: (actionId: string) => Promise<void>;
  onClear: () => void;
  maxActions?: number;
}

export function UndoManager({ actions, onUndo, onClear, maxActions = 5 }: UndoManagerProps) {
  const { toast } = useToast();
  const [isUndoing, setIsUndoing] = useState<string | null>(null);

  // Auto-cleanup expired actions
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const hasExpired = actions.some(action => 
        action.expiresAt && action.expiresAt < now
      );
      
      if (hasExpired) {
        onClear();
        toast({
          title: "Some undo options have expired",
          description: "You can only undo recent changes within a short time window",
          variant: "default"
        });
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [actions, onClear, toast]);

  const handleUndo = async (action: UndoAction) => {
    if (!action.canUndo) {
      toast({
        title: "Cannot undo this action",
        description: "This change can no longer be reversed",
        variant: "destructive"
      });
      return;
    }

    setIsUndoing(action.id);
    
    try {
      await onUndo(action.id);
      toast({
        title: "Action undone successfully",
        description: `Reversed: ${action.description}`,
        variant: "default"
      });
    } catch (error) {
      toast({
        title: "Failed to undo action",
        description: "Something went wrong while reversing the changes",
        variant: "destructive"
      });
    } finally {
      setIsUndoing(null);
    }
  };

  const getCategoryIcon = (category: UndoAction['category']) => {
    switch (category) {
      case 'attendance': return '👥';
      case 'payroll': return '💰';
      case 'users': return '👤';
      case 'departments': return '🏢';
      default: return '📝';
    }
  };

  const getTimeRemaining = (expiresAt?: Date): string => {
    if (!expiresAt) return '';
    
    const now = new Date();
    const remaining = expiresAt.getTime() - now.getTime();
    
    if (remaining <= 0) return 'Expired';
    
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s left`;
    }
    return `${seconds}s left`;
  };

  if (actions.length === 0) {
    return null;
  }

  const recentActions = actions.slice(0, maxActions);

  return (
    <Card className="fixed bottom-4 right-4 w-96 z-50 shadow-lg border-orange-200 bg-orange-50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Undo2 className="h-4 w-4 text-orange-600" />
            <span className="font-medium text-orange-800">Recent Changes</span>
            <Badge variant="secondary" className="text-xs">
              {actions.length} action{actions.length !== 1 ? 's' : ''}
            </Badge>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="text-orange-600 hover:text-orange-800 h-6 px-2"
          >
            Clear All
          </Button>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {recentActions.map((action) => {
            const timeRemaining = getTimeRemaining(action.expiresAt);
            const isExpired = action.expiresAt && action.expiresAt < new Date();
            
            return (
              <div
                key={action.id}
                className={`p-3 rounded-lg border transition-colors ${
                  isExpired 
                    ? 'bg-gray-100 border-gray-200' 
                    : 'bg-white border-orange-100 hover:border-orange-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{getCategoryIcon(action.category)}</span>
                      <span className="text-sm font-medium text-gray-800 truncate">
                        {action.description}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      <span>{action.timestamp.toLocaleTimeString()}</span>
                      
                      <Badge variant="outline" className="text-xs">
                        {action.affectedCount} item{action.affectedCount !== 1 ? 's' : ''}
                      </Badge>
                      
                      {timeRemaining && (
                        <Badge 
                          variant={isExpired ? "destructive" : "secondary"} 
                          className="text-xs"
                        >
                          {timeRemaining}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleUndo(action)}
                    disabled={!action.canUndo || isExpired || isUndoing === action.id}
                    className="ml-2 h-7 px-2 text-xs"
                  >
                    {isUndoing === action.id ? (
                      <>
                        <div className="w-3 h-3 border-2 border-gray-600 border-t-transparent rounded-full animate-spin mr-1" />
                        Undoing...
                      </>
                    ) : (
                      <>
                        <Undo2 className="h-3 w-3 mr-1" />
                        Undo
                      </>
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {actions.length > maxActions && (
          <div className="mt-2 text-xs text-center text-gray-500">
            ... and {actions.length - maxActions} more action{actions.length - maxActions !== 1 ? 's' : ''}
          </div>
        )}

        <Alert className="mt-3 border-orange-200 bg-orange-50">
          <AlertCircle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-xs text-orange-700">
            You can undo recent bulk changes within a few minutes of making them
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

// Hook for managing undo actions
export function useUndoManager() {
  const [actions, setActions] = useState<UndoAction[]>([]);
  
  const addAction = (action: Omit<UndoAction, 'id' | 'timestamp'>) => {
    const newAction: UndoAction = {
      ...action,
      id: `undo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes from now
    };
    
    setActions(prev => [newAction, ...prev].slice(0, 10)); // Keep max 10 actions
  };
  
  const executeUndo = async (actionId: string) => {
    const action = actions.find(a => a.id === actionId);
    if (!action) throw new Error('Action not found');
    
    await action.undoFunction();
    
    // Remove the action after successful undo
    setActions(prev => prev.filter(a => a.id !== actionId));
  };
  
  const clearActions = () => {
    setActions([]);
  };
  
  return {
    actions,
    addAction,
    executeUndo,
    clearActions
  };
}
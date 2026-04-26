/**
 * Offline Handler Utility
 * Provides graceful offline handling with user-friendly messages
 */

import { useToast } from "@/hooks/use-toast";

export interface OfflineState {
  isOnline: boolean;
  wasOffline: boolean;
  retryQueue: Array<() => Promise<any>>;
}

export class OfflineHandler {
  private static instance: OfflineHandler;
  private isOnline = navigator.onLine;
  private wasOffline = false;
  private retryQueue: Array<() => Promise<any>> = [];
  private listeners: Array<(state: OfflineState) => void> = [];

  static getInstance(): OfflineHandler {
    if (!OfflineHandler.instance) {
      OfflineHandler.instance = new OfflineHandler();
    }
    return OfflineHandler.instance;
  }

  constructor() {
    // Listen for online/offline events
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));
    
    // Check connection periodically
    setInterval(this.checkConnection.bind(this), 30000);
  }

  private async checkConnection(): Promise<void> {
    try {
      // Try to fetch a small resource to verify real connectivity
      const response = await fetch('/api/health', { 
        method: 'HEAD',
        cache: 'no-cache',
        signal: AbortSignal.timeout(5000)
      });
      
      if (!response.ok) {
        throw new Error('Server unreachable');
      }
      
      if (!this.isOnline) {
        this.handleOnline();
      }
    } catch (error) {
      if (this.isOnline) {
        this.handleOffline();
      }
    }
  }

  private handleOnline(): void {
    const wasOfflineBeforeReconnect = this.wasOffline;
    this.isOnline = true;
    this.wasOffline = false;
    
    this.notifyListeners();
    
    if (wasOfflineBeforeReconnect) {
      this.showReconnectedMessage();
      this.processRetryQueue();
    }
  }

  private handleOffline(): void {
    this.isOnline = false;
    this.wasOffline = true;
    this.notifyListeners();
    this.showOfflineMessage();
  }

  private showOfflineMessage(): void {
    // Show user-friendly offline message
    const event = new CustomEvent('show-offline-toast', {
      detail: {
        title: "You're currently offline",
        description: "Don't worry - your work will be saved when you reconnect",
        variant: "destructive"
      }
    });
    window.dispatchEvent(event);
  }

  private showReconnectedMessage(): void {
    const event = new CustomEvent('show-online-toast', {
      detail: {
        title: "You're back online!",
        description: "Syncing your data now...",
        variant: "default"
      }
    });
    window.dispatchEvent(event);
  }

  private async processRetryQueue(): Promise<void> {
    const queue = [...this.retryQueue];
    this.retryQueue = [];

    for (const retryFn of queue) {
      try {
        await retryFn();
      } catch (error) {
        console.error('Retry failed:', error);
        // Re-add to queue if still failing
        this.retryQueue.push(retryFn);
      }
    }

    if (this.retryQueue.length === 0) {
      const event = new CustomEvent('show-sync-complete-toast', {
        detail: {
          title: "All caught up!",
          description: "Your data has been synced successfully",
          variant: "default"
        }
      });
      window.dispatchEvent(event);
    }
  }

  public addToRetryQueue(retryFn: () => Promise<any>): void {
    this.retryQueue.push(retryFn);
  }

  public subscribe(listener: (state: OfflineState) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(): void {
    const state: OfflineState = {
      isOnline: this.isOnline,
      wasOffline: this.wasOffline,
      retryQueue: [...this.retryQueue]
    };
    
    this.listeners.forEach(listener => listener(state));
  }

  public getState(): OfflineState {
    return {
      isOnline: this.isOnline,
      wasOffline: this.wasOffline,
      retryQueue: [...this.retryQueue]
    };
  }

  public isConnectionHealthy(): boolean {
    return this.isOnline && !this.wasOffline;
  }

  public getOfflineMessage(): string {
    if (this.isOnline) {
      return this.retryQueue.length > 0 
        ? "Syncing your changes..." 
        : "Connected";
    }
    
    return this.retryQueue.length > 0
      ? `You're offline - ${this.retryQueue.length} changes will sync when you reconnect`
      : "You're offline - changes will be saved when you reconnect";
  }
}

// React hook for offline handling
export function useOfflineHandler() {
  const offlineHandler = OfflineHandler.getInstance();
  
  return {
    state: offlineHandler.getState(),
    addToRetryQueue: offlineHandler.addToRetryQueue.bind(offlineHandler),
    subscribe: offlineHandler.subscribe.bind(offlineHandler),
    isHealthy: offlineHandler.isConnectionHealthy(),
    message: offlineHandler.getOfflineMessage()
  };
}

// Wrapper function for API calls with offline handling
export async function callWithOfflineHandling<T>(
  apiCall: () => Promise<T>,
  retryFn?: () => Promise<T>
): Promise<T> {
  const offlineHandler = OfflineHandler.getInstance();
  
  try {
    const result = await apiCall();
    return result;
  } catch (error: any) {
    // Check if it's a network error
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      // Network error - likely offline
      if (retryFn) {
        offlineHandler.addToRetryQueue(retryFn);
      }
      
      throw new Error("You're offline - this action will be retried when you reconnect");
    }
    
    // Re-throw other errors as-is
    throw error;
  }
}
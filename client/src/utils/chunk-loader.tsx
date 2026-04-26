import { lazy, Suspense, ComponentType } from 'react';
import { Loader2 } from 'lucide-react';

// Simplified loading fallback
const ChunkLoadingFallback = ({ message = "Loading..." }: { message?: string }) => (
  <div className="flex items-center justify-center min-h-[40vh] w-full">
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  </div>
);

// Fixed chunk loading wrapper with error boundary
export function withChunkLoading(
  importFn: () => Promise<{ default: ComponentType<any> }>,
  fallbackMessage?: string
) {
  const LazyComponent = lazy(() => {
    return importFn().catch(error => {
      console.error('Chunk loading failed:', error);
      // Return a simple error component instead of crashing
      return {
        default: () => (
          <div className="flex items-center justify-center min-h-[40vh] w-full">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Page temporarily unavailable</p>
              <button 
                onClick={() => window.location.reload()} 
                className="mt-2 text-xs text-primary hover:underline"
              >
                Refresh page
              </button>
            </div>
          </div>
        )
      };
    });
  });
  
  return function ChunkLoadedComponent(props: any) {
    return (
      <Suspense fallback={<ChunkLoadingFallback message={fallbackMessage} />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}

// Simplified preload utility - no aggressive preloading to prevent timeouts
export function preloadChunk(importFn: () => Promise<any>) {
  // Only preload on user interaction to prevent timeout issues
  try {
    importFn().catch(() => {
      // Silently fail preloading - it's optional
    });
  } catch (error) {
    // Ignore preload errors
  }
}

// Minimal route preloading - only essential pages
export function preloadRouteChunks() {
  // Minimal preloading after a delay to prevent blocking
  setTimeout(() => {
    try {
      // Only preload dashboard-adjacent pages
      preloadChunk(() => import('@/pages/attendance'));
    } catch (error) {
      // Ignore preload errors
    }
  }, 3000);
}

// Progressive loading utility for large components
export function createProgressiveLoader(
  imports: {
    main: () => Promise<{ default: ComponentType<any> }>;
    fallback?: () => Promise<{ default: ComponentType<any> }>;
  }
) {
  return function ProgressiveComponent(props: any) {
    const MainComponent = lazy(imports.main);
    
    return (
      <Suspense 
        fallback={
          <ChunkLoadingFallback message="Loading advanced features..." />
        }
      >
        <MainComponent {...props} />
      </Suspense>
    );
  };
}
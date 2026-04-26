import { Loader2 } from 'lucide-react';

/**
 * A consistent loading component for authentication transitions
 * This prevents UI flashing between login and dashboard
 */
export function AuthLoading() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-white z-50">
      <div className="flex flex-col items-center space-y-4">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </div>
          <div className="absolute -bottom-2 left-0 right-0 text-center">
            <span className="inline-block px-4 py-1 bg-white text-primary font-medium rounded-full shadow-sm">
              Godiva Solar
            </span>
          </div>
        </div>
        <h2 className="text-xl font-medium text-gray-700 mt-4">Preparing your dashboard</h2>
        <p className="text-sm text-gray-500">Please wait while we securely sign you in</p>
      </div>
    </div>
  );
}
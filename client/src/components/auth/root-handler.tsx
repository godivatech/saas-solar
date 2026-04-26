import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuthContext } from "@/contexts/auth-context";
import { AppLoader } from "@/components/app-loader";

/**
 * Intelligent root route handler
 * Provides seamless UX by redirecting users based on authentication state
 */
export function RootHandler() {
  const { user, loading } = useAuthContext();
  const [, navigate] = useLocation();

  useEffect(() => {
    // Wait for auth state to be determined
    if (loading) return;

    // Redirect based on authentication status
    if (user) {
      // User is authenticated - go to dashboard
      navigate("/dashboard", { replace: true });
    } else {
      // User is not authenticated - go to login
      navigate("/login", { replace: true });
    }
  }, [user, loading, navigate]);

  // Show loading screen while determining auth state and redirecting
  return <AppLoader />;
}
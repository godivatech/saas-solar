import { ReactNode, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuthContext } from "@/contexts/auth-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { AuthLoading } from "@/components/auth/auth-loading";
import type { SystemPermission, Department } from "@shared/schema";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredPermissions?: SystemPermission | SystemPermission[];
  requiredRole?: "master_admin" | "admin" | "employee" | Array<"master_admin" | "admin" | "employee">;
  requiredDepartment?: Department | Department[];
  fallbackUrl?: string;
  requiresApproval?: boolean;
  minApprovalAmount?: number;
  allowMasterAdmin?: boolean;
}

export function ProtectedRoute({ 
  children, 
  requiredPermissions,
  requiredRole,
  requiredDepartment,
  fallbackUrl = "/dashboard",
  requiresApproval = false,
  minApprovalAmount,
  allowMasterAdmin = false
}: ProtectedRouteProps) {
  const { user, loading, hasPermission, hasRole, isDepartmentMember, canApprove, maxApprovalAmount } = useAuthContext();
  const [, setLocation] = useLocation();

  // Track if we're in the process of redirecting
  const [isRedirecting, setIsRedirecting] = useState(false);
  
  // This effect handles the redirect to login with proper React navigation
  useEffect(() => {
    if (!user && !loading && !isRedirecting) {
      // Set redirecting state to prevent multiple redirects
      setIsRedirecting(true);
      
      // Use React Router navigation instead of full page reload
      setLocation("/login");
    }
  }, [user, loading, isRedirecting, setLocation]);

  // Show custom loading state during authentication check or redirect
  if (loading || isRedirecting || !user) {
    return <AuthLoading />;
  }

  // Enterprise RBAC Permission Checking
  
  // Check role-based access if required
  if (requiredRole && !hasRole(requiredRole)) {
    return renderAccessDenied(setLocation, fallbackUrl);
  }

  // Check department-based access if required
  // Master admin can bypass department requirements if allowMasterAdmin is true
  if (requiredDepartment && !isDepartmentMember(requiredDepartment)) {
    if (!(allowMasterAdmin && user?.role === "master_admin")) {
      return renderAccessDenied(setLocation, fallbackUrl);
    }
  }

  // Check enterprise permissions using the sophisticated permission system
  if (requiredPermissions) {
    console.log("=== PROTECTED ROUTE DEBUG ===");
    console.log("Route:", window.location.pathname);
    console.log("Required permissions:", requiredPermissions);
    console.log("User:", user?.uid);
    console.log("User role:", user?.role);
    console.log("User department:", user?.department);
    console.log("User designation:", user?.designation);
    console.log("Permission check result:", hasPermission(requiredPermissions));
    console.log("===========================");
    
    if (!hasPermission(requiredPermissions)) {
      return renderAccessDenied(setLocation, fallbackUrl);
    }
  }

  // Check approval limits if required
  if (requiresApproval) {
    if (!canApprove) {
      return renderAccessDenied(setLocation, fallbackUrl, "You don't have approval permissions for this action.");
    }
    
    if (minApprovalAmount && maxApprovalAmount && maxApprovalAmount < minApprovalAmount) {
      return renderAccessDenied(setLocation, fallbackUrl, `Your approval limit (₹${maxApprovalAmount}) is insufficient for this action (requires ₹${minApprovalAmount}).`);
    }
  }

  // User is authenticated and has required permissions, render children
  return <>{children}</>;
}

// Helper function to render access denied message with enterprise messaging
function renderAccessDenied(setLocation: (url: string) => void, fallbackUrl: string, customMessage?: string) {
  return (
    <div className="container mx-auto py-6">
      <Alert variant="destructive" className="mb-6">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Access Denied</AlertTitle>
        <AlertDescription>
          {customMessage || "You don't have the required permissions to access this feature. Contact your administrator if you believe this is an error."}
          {fallbackUrl && (
            <button 
              className="ml-2 text-primary underline"
              onClick={() => setLocation(fallbackUrl)}
            >
              Go back
            </button>
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
}
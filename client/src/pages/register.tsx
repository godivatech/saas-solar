import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { RegisterForm } from "@/components/auth/register-form";
import { useAuthContext } from "@/contexts/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { UserX } from "lucide-react";
import { AuthLayout } from "@/components/auth/auth-layout";

export default function Register() {
  const { user, loading } = useAuthContext();
  const [, setLocation] = useLocation();

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (user && user.role !== "master_admin" && user.role !== "admin") {
      setLocation("/dashboard");
    }
  }, [user, setLocation]);

  // Show loading state while checking auth
  if (loading) {
    return null;
  }

  // Only master_admin and admin can access the registration page
  if (user && user.role !== "master_admin" && user.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-10">
            <div className="text-center">
              <UserX className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Access Restricted</h3>
              <p className="text-sm text-gray-500 mb-6">
                Public registration is disabled. Please contact your administrator to create an account.
              </p>
              <Link href="/login" className="text-secondary hover:underline">
                Back to Login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <AuthLayout
      title="Create an account"
      subtitle="Enter your details to create your account"
      footer={
        <div className="w-full flex flex-col items-center gap-4">
          <div className="text-sm text-center text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary font-medium hover:underline transition-all">
              Log in
            </Link>
          </div>
          <div className="text-center">
            <a
              href="https://godivatech.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground/60 hover:text-primary transition-colors duration-200"
            >
              Powered by Godivatech
            </a>
          </div>
        </div>
      }
    >
      <RegisterForm />
    </AuthLayout>
  );
}

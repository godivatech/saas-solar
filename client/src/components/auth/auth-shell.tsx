import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { LoginForm } from "@/components/auth/login-form";
import { RegisterForm } from "@/components/auth/register-form";
import ForgotPassword from "@/pages/forgot-password";
import { AuthLayout } from "@/components/auth/auth-layout";
import { auth } from "@/lib/firebase";
import { AuthLoading } from "@/components/auth/auth-loading";
import { useAuthContext } from "@/contexts/auth-context";

export function AuthShell() {
    const [location, setLocation] = useLocation();
    const { user, loading } = useAuthContext();

    // Initialize state synchronously to avoid flicker
    const [isTransitioning, setIsTransitioning] = useState<boolean>(() => {
        return sessionStorage.getItem('auth_transitioning') === 'true';
    });

    const [showContent, setShowContent] = useState<boolean>(() => {
        // If we are transitioning, don't show content yet
        // If not transitioning, show content immediately
        return sessionStorage.getItem('auth_transitioning') !== 'true';
    });

    const isLogin = location === "/login";
    const isForgotPassword = location === "/forgot-password";

    // Handle auth transition cleanup
    useEffect(() => {
        // Check for auth transitioning flag
        const authTransitioning = sessionStorage.getItem('auth_transitioning');

        if (authTransitioning === 'true') {
            sessionStorage.removeItem('auth_transitioning');

            // Keep showing the loading screen for a smooth experience
            const timer = setTimeout(() => {
                setIsTransitioning(false);
                setShowContent(true);
            }, 500);

            return () => clearTimeout(timer);
        }
    }, []);

    // Redirect if already authenticated (except for forgot password page)
    useEffect(() => {
        // If loading context, wait
        if (loading) return;

        // Forgot password page is always accessible
        if (isForgotPassword) return;

        if (user) {
            // Special check for register page logic (admin only)
            // But wait, if user is logged in, they shouldn't be on /login.
            // Only Master Admin can be on /register? 
            // The previous register.tsx logic had: 
            // if (user && user.role !== "master_admin" && user.role !== "admin") -> redirect dashboard

            if (location === "/register") {
                if (user.role !== "master_admin" && user.role !== "admin") {
                    setLocation("/dashboard");
                }
                // If admin, they can stay on /register (to create new users)
                // But wait, Register form creates a NEW session? 
                // Usually registering creates a new user and signs them in, replacing current user.
                // Or is it "Create User" functionality for admin?
                // Looking at register-form.tsx might clarify. 
            } else {
                // Default for /login or others: redirect to dashboard
                setIsTransitioning(true);
                setTimeout(() => setLocation("/dashboard"), 100);
            }
        }
    }, [user, loading, location, setLocation, isForgotPassword]);

    // Handle Loading States
    if (loading || isTransitioning || !showContent) {
        return <AuthLoading />;
    }

    // For forgot password page, render it directly without AuthLayout wrapper
    if (isForgotPassword) {
        return <ForgotPassword />;
    }

    // Define content based on route
    const title = isLogin ? "Welcome back" : "Create an account";
    const subtitle = isLogin
        ? "Enter your credentials to access your account"
        : "Enter your details to create your account";

    const footer = isLogin ? (
        <div className="text-sm text-center text-muted-foreground">
            Don't have an account?{" "}
            <Link href="/register" className="text-primary font-medium hover:underline transition-all">
                Create an account
            </Link>
        </div>
    ) : (
        <div className="text-sm text-center text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary font-medium hover:underline transition-all">
                Log in
            </Link>
        </div>
    );

    return (
        <AuthLayout
            title={title}
            subtitle={subtitle}
            footer={footer}
        >
            {isLogin ? <LoginForm /> : <RegisterForm />}
        </AuthLayout>
    );
}

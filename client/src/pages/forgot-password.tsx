import { useState, useEffect } from "react";
import { Link } from "wouter";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, Loader2, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";
import { sendPasswordReset } from "@/lib/firebase";
import { validateGmailAddress } from "@/lib/email-utils";

export default function ForgotPassword() {
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [emailSuggestion, setEmailSuggestion] = useState("");
    const [success, setSuccess] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);

    // Prefill email from query parameter
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const emailParam = params.get("email");
        if (emailParam) {
            setEmail(emailParam);
        }
    }, []);

    // Cooldown timer
    useEffect(() => {
        if (resendCooldown > 0) {
            const timer = setTimeout(() => {
                setResendCooldown(resendCooldown - 1);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [resendCooldown]);

    const validateEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setEmailSuggestion("");

        // Gmail validation
        const emailValidation = validateGmailAddress(email);
        if (!emailValidation.valid) {
            setError(emailValidation.error || "Invalid email");
            setEmailSuggestion(emailValidation.suggestion || "");
            return;
        }

        // Client-side validation
        if (!email.trim()) {
            setError("Email address is required");
            return;
        }

        if (!validateEmail(email)) {
            setError("Please enter a valid email address");
            return;
        }

        setIsLoading(true);

        try {
            await sendPasswordReset(email);

            // Always show success message (security: prevent user enumeration)
            setSuccess(true);
            setResendCooldown(60); // 60 second cooldown
            setEmail(""); // Clear email for security
        } catch (error: any) {
            // Handle specific Firebase errors
            let errorMessage = "Failed to send password reset email. Please try again.";

            switch (error.code) {
                case "auth/invalid-email":
                    errorMessage = "Invalid email address format";
                    break;
                case "auth/user-not-found":
                    // Don't reveal if user exists (security)
                    setSuccess(true);
                    setResendCooldown(60);
                    setEmail("");
                    return;
                case "auth/too-many-requests":
                    errorMessage = "Too many requests. Please try again in a few minutes";
                    setResendCooldown(300); // 5 minute cooldown for rate limiting
                    break;
                case "auth/network-request-failed":
                    errorMessage = "Network error. Please check your connection and try again";
                    break;
                case "auth/user-disabled":
                    errorMessage = "This account has been disabled. Please contact support";
                    break;
                default:
                    // Log unexpected errors for debugging
                    console.error("Password reset error:", error);
            }

            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    const handleResend = () => {
        setSuccess(false);
        setError("");
    };

    return (
        <AuthLayout
            title="Forgot Password"
            subtitle="Enter your email to receive a password reset link"
            footer={
                <div className="text-sm text-center text-muted-foreground">
                    Remember your password?{" "}
                    <Link href="/login" className="text-primary font-medium hover:underline transition-all">
                        Back to login
                    </Link>
                </div>
            }
        >
            {success ? (
                <div className="space-y-4">
                    <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20">
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <AlertDescription className="text-green-800 dark:text-green-300">
                            <strong className="block mb-1">Email Sent!</strong>
                            If an account exists with this email, you will receive a password reset link shortly.
                        </AlertDescription>
                    </Alert>

                    <div className="text-sm text-muted-foreground space-y-2">
                        <p>Please check your email inbox and follow the instructions to reset your password.</p>
                        <p className="text-xs">
                            <strong>Note:</strong> If you don't see the email, please check your spam or junk folder.
                        </p>
                    </div>

                    {resendCooldown > 0 ? (
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            disabled
                        >
                            Resend in {resendCooldown}s
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            onClick={handleResend}
                            variant="outline"
                            className="w-full"
                        >
                            Send Another Email
                        </Button>
                    )}

                    <Link href="/login">
                        <Button variant="ghost" className="w-full">
                            Return to Login
                        </Button>
                    </Link>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                                {error}
                                {emailSuggestion && <div className="mt-1 text-sm font-medium">{emailSuggestion}</div>}
                            </AlertDescription>
                        </Alert>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="email">Email Address</Label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <Input
                                id="email"
                                type="email"
                                placeholder="Enter your email"
                                className="pl-10"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={isLoading || resendCooldown > 0}
                                required
                                autoComplete="email"
                                autoFocus
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            We'll send you a link to reset your password
                        </p>
                    </div>

                    <Button
                        type="submit"
                        className="w-full bg-primary hover:bg-primary-dark text-white"
                        disabled={isLoading || resendCooldown > 0}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Sending...
                            </>
                        ) : resendCooldown > 0 ? (
                            `Wait ${resendCooldown}s`
                        ) : (
                            "Send Reset Link"
                        )}
                    </Button>

                    <div className="text-xs text-center text-muted-foreground">
                        Need help?{" "}
                        <a
                            href="mailto:support@godivatech.com"
                            className="text-primary hover:underline"
                        >
                            Contact Support
                        </a>
                    </div>
                </form>
            )}
        </AuthLayout>
    );
}

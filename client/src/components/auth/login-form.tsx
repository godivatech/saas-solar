import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useBasicAuth } from "@/hooks/use-basic-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, Lock, Loader2, AlertCircle } from "lucide-react";
import { validateGmailAddress } from "@/lib/email-utils";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [emailSuggestion, setEmailSuggestion] = useState("");
  const { login, isLoading } = useBasicAuth();
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); // Clear previous errors
    setEmailSuggestion("");

    // Basic validation
    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    if (!password.trim()) {
      setError("Password is required");
      return;
    }

    // Gmail validation
    const emailValidation = validateGmailAddress(email);
    if (!emailValidation.valid) {
      setError(emailValidation.error || "Invalid email");
      setEmailSuggestion(emailValidation.suggestion || "");
      return;
    }

    const result = await login(email, password);

    if (result.success) {
      setLocation("/dashboard");
    } else {
      // Display inline error message
      setError(result.error || "Login failed. Please check your credentials and try again.");
    }
  };

  return (
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
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            id="email"
            type="email"
            placeholder="Enter your email"
            className="pl-10"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(""); // Clear error on input
            }}
            required
            autoComplete="email"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link href="/forgot-password" className="text-xs text-secondary hover:underline">
            Forgot password?
          </Link>
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            id="password"
            type="password"
            placeholder="Enter your password"
            className="pl-10"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(""); // Clear error on input
            }}
            required
            autoComplete="current-password"
          />
        </div>
      </div>

      <Button
        type="submit"
        className="w-full bg-primary hover:bg-primary-dark text-white"
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Logging in...
          </>
        ) : (
          "Log In"
        )}
      </Button>
    </form>
  );
}

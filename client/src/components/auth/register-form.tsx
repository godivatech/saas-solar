import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { User, Mail, Lock, Loader2, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";
import { validateGmailAddress } from "@/lib/email-utils";

type RegistrationStep = 'email' | 'otp' | 'details' | 'success';

export function RegisterForm() {
  // Step management
  const [currentStep, setCurrentStep] = useState<RegistrationStep>('email');

  // Form data
  const [email, setEmail] = useState("");
  const [otp, setOTP] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [emailSuggestion, setEmailSuggestion] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpExpiresIn, setOtpExpiresIn] = useState(0);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // OTP expiry timer
  useEffect(() => {
    if (otpExpiresIn > 0) {
      const timer = setTimeout(() => setOtpExpiresIn(otpExpiresIn - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpExpiresIn]);

  // Validate Gmail email
  const validateEmail = () => {
    const result = validateGmailAddress(email);
    if (!result.valid) {
      setError(result.error || "Invalid email");
      setEmailSuggestion(result.suggestion || "");
      return false;
    }
    setError("");
    setEmailSuggestion("");
    return true;
  };

  // Step 1: Send OTP
  const handleSendOTP = async () => {
    if (!validateEmail()) return;

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() })
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          setError(data.message);
          setResendCooldown(data.retryAfter || 60);
        } else {
          setError(data.message || "Failed to send verification code");
        }
        return;
      }

      // Success - move to OTP step
      setCurrentStep('otp');
      setOtpExpiresIn(data.expiresIn || 600);
      setResendCooldown(60); // 60 second cooldown for resend
    } catch (err) {
      setError("Network error. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOTP = async () => {
    if (otp.length !== 6) {
      setError("Please enter the 6-digit code");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Invalid verification code");
        return;
      }

      // Success - move to details step
      setCurrentStep('details');
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Complete registration
  const handleCompleteRegistration = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate passwords
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch('/api/auth/register-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          displayName: name
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Registration failed");
        return;
      }

      // Success!
      setCurrentStep('success');
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Format time remaining
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Step 1: Email Input */}
      {currentStep === 'email' && (
        <>
          <Alert>
            <Mail className="h-4 w-4" />
            <AlertDescription>
              Enter your Gmail address to get started
            </AlertDescription>
          </Alert>

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
            <Label htmlFor="email">Gmail Address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                id="email"
                type="email"
                placeholder="your.email@gmail.com"
                className="pl-10"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                  setEmailSuggestion('');
                }}
                onBlur={validateEmail}
                autoFocus
                disabled={isLoading}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Only Gmail addresses are accepted
            </p>
          </div>

          <Button
            onClick={handleSendOTP}
            disabled={isLoading || !email || resendCooldown > 0}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending Code...
              </>
            ) : resendCooldown > 0 ? (
              `Wait ${resendCooldown}s`
            ) : (
              'Send Verification Code'
            )}
          </Button>
        </>
      )}

      {/* Step 2: OTP Verification */}
      {currentStep === 'otp' && (
        <>
          <Alert>
            <Mail className="h-4 w-4" />
            <AlertDescription>
              We sent a 6-digit code to <strong>{email}</strong>
            </AlertDescription>
          </Alert>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="otp">Verification Code</Label>
            <Input
              id="otp"
              type="text"
              placeholder="000000"
              maxLength={6}
              value={otp}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '');
                setOTP(value);
                setError('');
              }}
              className="text-center text-2xl tracking-widest font-mono"
              autoFocus
              disabled={isLoading}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Enter the 6-digit code</span>
              {otpExpiresIn > 0 && (
                <span className="font-medium">Expires in {formatTime(otpExpiresIn)}</span>
              )}
            </div>
          </div>

          <Button
            onClick={handleVerifyOTP}
            disabled={isLoading || otp.length !== 6}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              'Verify Code'
            )}
          </Button>

          <div className="flex gap-2">
            {resendCooldown > 0 ? (
              <Button variant="outline" className="flex-1" disabled>
                Resend in {resendCooldown}s
              </Button>
            ) : (
              <Button variant="outline" onClick={handleSendOTP} className="flex-1" disabled={isLoading}>
                Resend Code
              </Button>
            )}

            <Button
              variant="ghost"
              onClick={() => {
                setCurrentStep('email');
                setOTP('');
                setError('');
              }}
              className="flex-1"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Change Email
            </Button>
          </div>
        </>
      )}

      {/* Step 3: Complete Registration */}
      {currentStep === 'details' && (
        <form onSubmit={handleCompleteRegistration} className="space-y-4">
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Email verified! Complete your registration
            </AlertDescription>
          </Alert>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                id="name"
                type="text"
                placeholder="Enter your name"
                className="pl-10"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError('');
                }}
                required
                autoFocus
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                id="password"
                type="password"
                placeholder="Create a password"
                className="pl-10"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                required
                disabled={isLoading}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              At least 6 characters
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                className="pl-10"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError('');
                }}
                required
                disabled={isLoading}
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
                Creating Account...
              </>
            ) : (
              'Complete Registration'
            )}
          </Button>
        </form>
      )}

      {/* Step 4: Success */}
      {currentStep === 'success' && (
        <div className="text-center space-y-4 py-8">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>

          <div>
            <h3 className="text-xl font-semibold text-gray-900">Registration Successful!</h3>
            <p className="text-gray-600 mt-2">
              Your account has been created successfully.
            </p>
          </div>

          <Alert>
            <AlertDescription>
              You can now log in with your email and password.
            </AlertDescription>
          </Alert>

          <Link href="/login">
            <Button className="w-full">
              Go to Login
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { updateProfile } from "firebase/auth";
import {
  loginWithEmail,
  registerWithEmail,
  logoutUser
} from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { useAuthContext } from "@/contexts/auth-context";

export function useAuth() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user, createUserProfile } = useAuthContext();

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      await loginWithEmail(email, password);
      toast({
        title: "Login Successful",
        description: "Welcome back!",
        variant: "default",
      });
      return true;
    } catch (error: any) {
      let message = "Failed to login. Please try again.";

      if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password") {
        message = "Invalid email or password.";
      } else if (error.code === "auth/too-many-requests") {
        message = "Too many failed login attempts. Please try again later.";
      } else if (error.code === "auth/network-request-failed") {
        message = "Network error. Please check your connection.";
      }

      toast({
        title: "Login Failed",
        description: message,
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, displayName: string) => {
    setIsLoading(true);
    try {
      const userCredential = await registerWithEmail(email, password);

      // Update user profile with display name (Firebase v9 modular)
      await updateProfile(userCredential.user, {
        displayName: displayName,
      });

      // Force refresh the Firebase user to get updated profile
      await userCredential.user.reload();

      // Get the user's auth token for backend sync
      const token = await userCredential.user.getIdToken();

      // Sync user profile with backend using the new endpoint
      const response = await fetch('/api/sync-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          uid: userCredential.user.uid,
          displayName,
          role: "employee"
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to sync user profile');
      }

      toast({
        title: "Registration Successful",
        description: "Your account has been created.",
        variant: "default",
      });
      return true;
    } catch (error: any) {
      let message = "Failed to create account. Please try again.";

      if (error.code === "auth/email-already-in-use") {
        message = "Email already in use. Please try another email.";
      } else if (error.code === "auth/invalid-email") {
        message = "Invalid email address.";
      } else if (error.code === "auth/weak-password") {
        message = "Password is too weak. Please use a stronger password.";
      }

      toast({
        title: "Registration Failed",
        description: message,
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await logoutUser();
      toast({
        title: "Logout Successful",
        description: "You have been logged out.",
        variant: "default",
      });
      return true;
    } catch (error) {
      toast({
        title: "Logout Failed",
        description: "Failed to logout. Please try again.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    user,
    isLoading,
    login,
    register,
    logout,
  };
}

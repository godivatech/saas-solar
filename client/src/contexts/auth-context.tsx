import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { User } from "firebase/auth";
import { apiRequest } from "@/lib/queryClient";
import { onAuthChange, syncUser, auth } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import type { Department, Designation, PayrollGrade, SystemPermission } from "@shared/schema";
import { getEffectivePermissions, systemPermissions } from "@shared/schema";

type UserRole = "master_admin" | "admin" | "employee";

interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
  department: Department | null;
  designation: Designation | null;
  employeeId?: string;
  reportingManagerId?: string | null;
  payrollGrade?: PayrollGrade | null;
  joinDate?: Date;
  isActive: boolean;
  id?: number;
  isManager?: boolean; // ✅ FIX: Add manager status flag
  firebaseUser?: User;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  permissions: SystemPermission[];
  canApprove: boolean;
  maxApprovalAmount: number | null;
  createUserProfile: (userData: Partial<AuthUser>) => Promise<void>;
  updateUserProfile: (userData: Partial<AuthUser>) => Promise<void>;
  hasPermission: (permission: SystemPermission | SystemPermission[]) => boolean;
  hasRole: (role: UserRole[] | UserRole) => boolean;
  isDepartmentMember: (department: Department[] | Department) => boolean;
  hasDesignation: (designation: Designation[] | Designation) => boolean;
  canAccessModule: (module: string) => boolean;
  refreshPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<SystemPermission[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [maxApprovalAmount, setMaxApprovalAmount] = useState<number | null>(null);
  const { toast } = useToast();

  // Helper function for basic auth with unified data sync
  const handleBasicAuth = async (firebaseUser: User) => {
    try {
      // Get user data from our unified backend API
      const token = await firebaseUser.getIdToken();
      const response = await fetch(`/api/users/${firebaseUser.uid}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const userData = await response.json();
        setUser({
          uid: userData.uid,
          email: userData.email,
          displayName: userData.displayName,
          photoURL: firebaseUser.photoURL,
          role: userData.role,
          department: userData.department,
          designation: userData.designation || null,
          employeeId: userData.employeeId,
          reportingManagerId: userData.reportingManagerId || null,
          payrollGrade: userData.payrollGrade || null,
          joinDate: userData.joinDate ? new Date(userData.joinDate) : undefined,
          isActive: userData.isActive !== false,
          id: userData.id,
          isManager: userData.isManager || false, // ✅ FIX: Include isManager
          firebaseUser: firebaseUser
        });
      } else {
        // If user doesn't exist in our system, sync them
        const syncResponse = await fetch('/api/auth/sync', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            displayName: firebaseUser.displayName,
            role: "employee"
          })
        });

        if (syncResponse.ok) {
          const syncData = await syncResponse.json();
          setUser({
            uid: syncData.user.uid,
            email: syncData.user.email,
            displayName: syncData.user.displayName,
            photoURL: firebaseUser.photoURL,
            role: syncData.user.role,
            department: syncData.user.department,
            designation: syncData.user.designation || null,
            employeeId: syncData.user.employeeId,
            reportingManagerId: syncData.user.reportingManagerId || null,
            payrollGrade: syncData.user.payrollGrade || null,
            joinDate: syncData.user.joinDate ? new Date(syncData.user.joinDate) : undefined,
            isActive: syncData.user.isActive !== false,
            id: syncData.user.id
          });
        } else {
          // Fallback to basic user data
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            role: "employee",
            department: null,
            designation: null,
            isActive: true
          });
        }
      }
    } catch (error) {
      console.error("Error syncing user data:", error);
      // Fallback to basic user data
      setUser({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        photoURL: firebaseUser.photoURL,
        role: "employee",
        department: null,
        designation: null,
        isActive: true
      });
    }

    setLoading(false);
  };

  // Helper function to create a new user
  const handleNewUser = (firebaseUser: User) => {
    // Create a new user in the backend
    fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User",
        role: "employee", // Default role
        department: null,
      }),
      credentials: 'include'
    })
      .then(response => {
        if (response.ok) {
          return response.json();
        } else {
          throw new Error(`Failed to create user: ${response.statusText}`);
        }
      })
      .then(newUserData => {
        console.log("Created new user:", newUserData);

        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || newUserData.displayName,
          photoURL: firebaseUser.photoURL,
          role: newUserData.role,
          department: newUserData.department,
          designation: newUserData.designation || null,
          employeeId: newUserData.employeeId,
          reportingManagerId: newUserData.reportingManagerId || null,
          payrollGrade: newUserData.payrollGrade || null,
          joinDate: newUserData.joinDate ? new Date(newUserData.joinDate) : undefined,
          isActive: newUserData.isActive !== false,
          id: newUserData.id,
        });

        // Show success toast
        toast({
          title: "Account created",
          description: "Your account has been successfully set up.",
          variant: "success" as any,
        });
      })
      .catch(error => {
        console.error("Error creating user:", error);
        handleBasicAuth(firebaseUser);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    // Keep existing user during transitions to prevent UI flicker
    let currentUser: AuthUser | null = null;
    let isInitialAuth = true;

    // Keep track of auth state in localStorage to prevent flashes
    const persistedAuth = localStorage.getItem('authState');
    if (persistedAuth) {
      try {
        const parsedAuth = JSON.parse(persistedAuth);
        // Set the persisted user immediately to prevent login screen flash
        setUser(parsedAuth);
      } catch (e) {
        // If parsing fails, ignore the persisted data
        console.error("Failed to parse persisted auth state");
      }
    }

    const unsubscribe = onAuthChange(async (firebaseUser) => {
      // Handle logout
      if (!firebaseUser) {
        setUser(null);
        localStorage.removeItem('authState');
        setLoading(false);
        return;
      }

      // If this is the first auth event or we're changing users
      if (isInitialAuth || !currentUser || currentUser.uid !== firebaseUser.uid) {
        // Don't set loading to true if we already have a user (prevents login screen flash)
        if (!user) {
          setLoading(true);
        }

        // Create temporary user object
        currentUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          role: "employee", // Default role, will be updated
          department: null,
          designation: null,
          isActive: true
        };

        // For initial auth, don't update user state if we already have persisted data
        // This prevents unnecessary re-renders and UI flicker
        if (!isInitialAuth || !user) {
          setUser(currentUser);
        }

        try {
          // Sync this user with our database
          const result = await syncUser(firebaseUser.uid, true);

          if (result.status === 'error') {
            // If there was an error syncing, fall back to basic auth
            handleBasicAuth(firebaseUser);
            return;
          }

          // Get the user data and update state
          const userData = result.user;

          // Update our current user reference
          currentUser = {
            uid: firebaseUser.uid,
            email: userData?.email || firebaseUser.email,
            displayName: userData?.displayName || firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            role: (userData?.role || 'employee') as 'master_admin' | 'admin' | 'employee',
            department: userData?.department || null,
            designation: userData?.designation || null,
            employeeId: userData?.employeeId,
            reportingManagerId: userData?.reportingManagerId || null,
            payrollGrade: userData?.payrollGrade || null,
            joinDate: userData?.joinDate ? new Date(userData.joinDate) : undefined,
            isActive: userData.isActive !== false,
            id: userData.id,
            isManager: userData?.isManager || false, // ✅ FIX: Include isManager
          };

          // Set the complete user data
          setUser(currentUser);

          // Persist the auth state to prevent login flashes on page refresh
          localStorage.setItem('authState', JSON.stringify(currentUser));

          // Mark that we've completed the initial auth
          isInitialAuth = false;
        } catch (error) {
          console.error("Error syncing user data:", error);
          // Fall back to basic auth if there was an error
          handleBasicAuth(firebaseUser);
        } finally {
          setLoading(false);
        }
      }
    });

    // ✅ Add periodic sync to catch admin-initiated changes
    const syncInterval = setInterval(async () => {
      if (currentUser?.uid) {
        try {
          // Get token from the Firebase auth instance
          const firebaseUser = auth.currentUser;
          if (!firebaseUser) return;

          const token = await firebaseUser.getIdToken();
          if (!token) return;

          const response = await fetch(`/api/users/${currentUser.uid}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });

          if (response.ok) {
            const userData = await response.json();

            // Only update if data actually changed (prevent unnecessary re-renders)
            if (
              userData.department !== currentUser.department ||
              userData.designation !== currentUser.designation ||
              userData.role !== currentUser.role
            ) {
              const updatedUser = {
                ...currentUser,
                department: userData.department,
                designation: userData.designation,
                role: userData.role,
                displayName: userData.displayName,
                employeeId: userData.employeeId,
                reportingManagerId: userData.reportingManagerId,
              };

              setUser(updatedUser);
              localStorage.setItem('authState', JSON.stringify(updatedUser));
            }
          }
        } catch (error) {
          // Silently fail - don't disrupt user experience
          console.debug("Periodic sync failed:", error);
        }
      }
    }, 30000); // Sync every 30 seconds

    return () => {
      unsubscribe();
      clearInterval(syncInterval);
    };
  }, [toast]);

  const createUserProfile = async (userData: Partial<AuthUser>) => {
    if (!user) return;

    try {
      const response = await apiRequest("POST", "/api/users", {
        ...userData,
        uid: user.uid,
      });

      if (response.ok) {
        const updatedUser = await response.json();
        setUser((prevUser) => prevUser ? { ...prevUser, ...updatedUser } : null);

        toast({
          title: "Profile updated",
          description: "Your profile has been successfully updated.",
          variant: "success" as any,
        });
      }
    } catch (error) {
      console.error("Error creating user profile:", error);

      toast({
        title: "Error",
        description: "There was an error updating your profile.",
        variant: "destructive",
      });
    }
  };

  const updateUserProfile = async (userData: Partial<AuthUser>) => {
    if (!user || !user.id) return;

    try {
      const response = await apiRequest("PATCH", `/api/users/${user.id}`, userData);

      if (response.ok) {
        const updatedUser = await response.json();
        setUser((prevUser) => prevUser ? { ...prevUser, ...updatedUser } : null);

        toast({
          title: "Profile updated",
          description: "Your profile has been successfully updated.",
          variant: "success" as any,
        });
      }
    } catch (error) {
      console.error("Error updating user profile:", error);

      toast({
        title: "Error",
        description: "There was an error updating your profile.",
        variant: "destructive",
      });
    }
  };

  // Department-based permission check
  const isDepartmentMember = (departments: Department[] | Department): boolean => {
    if (!user || !user.department) return false;

    if (Array.isArray(departments)) {
      return departments.includes(user.department);
    }

    return user.department === departments;
  };

  // Enterprise permission functions
  const hasPermission = (permission: SystemPermission | SystemPermission[]): boolean => {
    if (!user) return false;
    if (user.role === "master_admin") return true; // Master admin has all permissions

    if (Array.isArray(permission)) {
      return permission.some(p => permissions.includes(p));
    }

    return permissions.includes(permission);
  };

  const hasRole = (role: UserRole | UserRole[]): boolean => {
    if (!user) return false;

    if (Array.isArray(role)) {
      return role.includes(user.role);
    }

    return user.role === role;
  };

  const hasDesignation = (designation: Designation | Designation[]): boolean => {
    if (!user || !user.designation) return false;

    if (Array.isArray(designation)) {
      return designation.includes(user.designation);
    }

    return user.designation === designation;
  };

  const canAccessModule = (module: string): boolean => {
    if (!user) return false;
    if (user.role === "master_admin") return true;

    const viewPermission = `${module}.view` as SystemPermission;
    const fullAccessPermission = `${module}.full_access` as SystemPermission;

    return permissions.includes(viewPermission) || permissions.includes(fullAccessPermission);
  };

  const refreshPermissions = async (): Promise<void> => {
    if (!user?.uid) return;

    try {
      // Calculate permissions based on department + designation (or default for new employees)
      const effectivePermissions = getEffectivePermissions(user.department, user.designation);

      setPermissions(effectivePermissions);

      // Set approval capabilities based on designation level
      if (user.designation) {
        const designationLevels = {
          "trainee": 1,
          "intern": 2,
          "junior_executive": 3,
          "executive": 4,
          "senior_executive": 5,
          "assistant_manager": 6,
          "manager": 7,
          "director": 8
        };

        const level = designationLevels[user.designation] || 1;
        setCanApprove(level >= 5); // Senior Executive and above can approve
        setMaxApprovalAmount(level >= 7 ? 1000000 : level >= 6 ? 500000 : level >= 5 ? 100000 : null);
      } else {
        // New employees cannot approve anything
        setCanApprove(false);
        setMaxApprovalAmount(null);
      }

    } catch (error) {
      console.error("Error calculating permissions:", error);
      setPermissions([]);
      setCanApprove(false);
      setMaxApprovalAmount(null);
    }
  };

  // Load permissions when user changes
  useEffect(() => {
    if (user?.uid) {
      refreshPermissions();
    } else {
      setPermissions([]);
      setCanApprove(false);
      setMaxApprovalAmount(null);
    }
  }, [user?.uid, user?.department, user?.designation]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        permissions,
        canApprove,
        maxApprovalAmount,
        createUserProfile,
        updateUserProfile,
        hasPermission,
        hasRole,
        isDepartmentMember,
        hasDesignation,
        canAccessModule,
        refreshPermissions,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }

  return context;
}
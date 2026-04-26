/**
 * Unified Firebase Authentication Middleware
 * Single source of truth for JWT verification and permission calculation
 * 
 * PHASE 2: This middleware consolidates duplicate verifyAuth implementations
 * from routes.ts and ot-routes.ts, ensuring consistent permission calculation
 * across all routes.
 * 
 * Architecture: Roles exist ONLY for permission mapping in schema.ts.
 * This middleware calculates permissions, routes use requirePermission() for authorization.
 */

import { Request, Response, NextFunction } from "express";
import { auth } from "../firebase";
import { storage } from "../storage";
import type { SystemPermission } from "@shared/schema";

/**
 * Authenticated user data attached to Express Request
 */
export interface AuthenticatedUser {
    uid: string;
    user: any; // Full user profile from storage
    permissions: SystemPermission[];
    canApprove: boolean;
    maxApprovalAmount: number | null;
}

// Extend Express Request type globally
declare global {
    namespace Express {
        interface Request {
            authenticatedUser?: AuthenticatedUser;
            user?: any; // Decoded JWT token
        }
    }
}

/**
 * Designation levels for approval capability calculation
 */
const DESIGNATION_LEVELS: Record<string, number> = {
    "house_man": 1,
    "welder": 2,
    "technician": 3,
    "cre": 4,
    "executive": 5,
    "team_leader": 6,
    "officer": 7,
    "gm": 8,
    "ceo": 9
};

/**
 * Calculate approval amount limit based on designation level
 * Higher designation levels have higher approval limits
 */
function getMaxApprovalAmount(level: number): number | null {
    if (level >= 8) return null; // Unlimited for GM and above
    if (level >= 7) return 1000000; // 1M for Officer
    if (level >= 6) return 500000; // 500K for Team Leader
    if (level >= 5) return 100000; // 100K for Executive
    return null; // No approval capability
}

/**
 * Verify Firebase JWT token and calculate effective permissions
 * 
 * This middleware:
 * 1. Validates the Bearer token from Authorization header
 * 2. Verifies the token with Firebase Admin SDK
 * 3. Loads the user profile from storage
 * 4. Calculates effective permissions based on role/department/designation
 * 5. Attaches authenticated user data to the request
 * 
 * Permission Calculation Logic:
 * - master_admin role → ALL permissions (bypass for super admin)
 * - Other roles → Calculate from department + designation via getEffectivePermissions()
 * - New employees (no dept/designation) → Basic default permissions
 * 
 * @example
 * app.get('/api/protected', verifyAuth, requirePermission('resource.view'), handler);
 */
export const verifyAuth = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    // Check for Bearer token
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Authentication required" });
    }

    const token = authHeader.split("Bearer ")[1];

    try {
        // Verify token with Firebase Admin SDK
        const decodedToken = await auth.verifyIdToken(token);
        req.user = decodedToken; // Attach decoded token to request

        // Load user profile from storage
        const userProfile = await storage.getUser(decodedToken.uid);
        if (!userProfile) {
            console.warn(`[AUTH] User profile not found for UID: ${decodedToken.uid}`);
            return res.status(401).json({ message: "User profile not found" });
        }

        // Initialize authenticated user object
        req.authenticatedUser = {
            uid: decodedToken.uid,
            user: userProfile,
            permissions: [],
            canApprove: false,
            maxApprovalAmount: null
        };

        // PERMISSION CALCULATION
        // Master admin gets ALL permissions (bypass)
        if (userProfile.role === "master_admin") {
            const { systemPermissions } = await import("@shared/schema");
            req.authenticatedUser.permissions = [...systemPermissions];
            req.authenticatedUser.canApprove = true;
            req.authenticatedUser.maxApprovalAmount = null; // Unlimited approval

            console.log(`[AUTH] Master admin authenticated: ${userProfile.email || userProfile.displayName}`);
        }
        // Users with department and designation → calculate from schema
        else if (userProfile.department && userProfile.designation) {
            try {
                const { getEffectivePermissions } = await import("@shared/schema");
                const effectivePermissions = getEffectivePermissions(
                    userProfile.department,
                    userProfile.designation
                );
                req.authenticatedUser.permissions = effectivePermissions;

                // Calculate approval capabilities based on designation level
                const level = DESIGNATION_LEVELS[userProfile.designation] || 1;
                req.authenticatedUser.canApprove = level >= 5; // Executive and above can approve
                req.authenticatedUser.maxApprovalAmount = getMaxApprovalAmount(level);

                console.log(`[AUTH] User authenticated: ${userProfile.email || userProfile.displayName} - ${effectivePermissions.length} permissions`);
            } catch (error) {
                console.error("[AUTH] Error calculating permissions:", error);
                // Fall through to default permissions on error
            }
        }
        // New employee without department/designation → default permissions
        else {
            try {
                const { getNewEmployeePermissions } = await import("@shared/schema");
                req.authenticatedUser.permissions = getNewEmployeePermissions();

                console.log(`[AUTH] New employee authenticated: ${userProfile.email || userProfile.displayName} - default permissions`);
            } catch (error) {
                console.error("[AUTH] Error loading default permissions:", error);
                // Hardcoded fallback to minimal permissions
                req.authenticatedUser.permissions = [
                    "dashboard.view",
                    "attendance.view_own",
                    "leave.view_own",
                    "leave.request"
                ] as SystemPermission[];
            }
        }

        next();
    } catch (error) {
        console.error("[AUTH] Token verification error:", error);
        // Generic error message to avoid information disclosure
        res.status(401).json({ message: "Invalid or expired token" });
    }
};

/**
 * Check if authenticated user has a specific permission
 * Helper function for route handlers that need to check permissions inline
 * 
 * @param req - Express request with authenticatedUser
 * @param permission - Single permission or array of permissions (OR logic)
 * @returns true if user has at least one of the permissions
 * 
 * @example
 * if (!hasPermission(req, 'payroll.view')) {
 *   return res.status(403).json({ message: "Access denied" });
 * }
 */
export const hasPermission = (
    req: Request,
    permission: SystemPermission | SystemPermission[]
): boolean => {
    if (!req.authenticatedUser) return false;

    const perms = Array.isArray(permission) ? permission : [permission];
    return perms.some(p => req.authenticatedUser!.permissions.includes(p));
};

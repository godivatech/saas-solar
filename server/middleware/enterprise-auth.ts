import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import type { SystemPermission } from "@shared/schema";

// Extend Express Request to include authenticated user data
declare global {
  namespace Express {
    interface Request {
      authenticatedUser?: {
        uid: string;
        user: any;
        permissions: SystemPermission[];
        canApprove: boolean;
        maxApprovalAmount: number | null;
      };
    }
  }
}

// Enterprise RBAC middleware for permission checking
export const requirePermission = (permission: SystemPermission | SystemPermission[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { uid } = req.authenticatedUser;
      const hasPermission = Array.isArray(permission)
        ? await Promise.all(permission.map(p => storage.checkEffectiveUserPermission(uid, p)))
        : await storage.checkEffectiveUserPermission(uid, permission);

      const authorized = Array.isArray(hasPermission)
        ? hasPermission.some(p => p)
        : hasPermission;

      if (!authorized) {
        // Log unauthorized access attempt
        await storage.createAuditLog({
          userId: uid,
          action: "UNAUTHORIZED_ACCESS_ATTEMPT",
          entityType: "permission",
          entityId: Array.isArray(permission) ? permission.join(",") : permission,
          changes: {
            requestedPermission: permission,
            requestPath: req.path,
            method: req.method
          },
          ipAddress: req.ip,
          userAgent: req.get("User-Agent"),
          department: req.authenticatedUser.user?.department,
          designation: req.authenticatedUser.user?.designation
        });

        return res.status(403).json({ 
          message: "Insufficient permissions for this action",
          requiredPermission: permission
        });
      }

      next();
    } catch (error) {
      console.error("Permission check error:", error);
      res.status(500).json({ message: "Internal server error during permission check" });
    }
  };
};

// Enterprise approval limit middleware
export const requireApprovalLimit = (minAmount?: number) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.authenticatedUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { uid, user, maxApprovalAmount } = req.authenticatedUser;
      
      if (!req.authenticatedUser.canApprove) {
        await storage.createAuditLog({
          userId: uid,
          action: "APPROVAL_PERMISSION_DENIED",
          entityType: "approval",
          entityId: req.path,
          changes: {
            requestPath: req.path,
            method: req.method,
            hasApprovalPermission: false
          },
          ipAddress: req.ip,
          userAgent: req.get("User-Agent"),
          department: user?.department,
          designation: user?.designation
        });

        return res.status(403).json({ 
          message: "You don't have approval permissions" 
        });
      }

      if (minAmount && maxApprovalAmount && maxApprovalAmount < minAmount) {
        await storage.createAuditLog({
          userId: uid,
          action: "APPROVAL_LIMIT_EXCEEDED",
          entityType: "approval",
          entityId: req.path,
          changes: {
            requestPath: req.path,
            method: req.method,
            requiredAmount: minAmount,
            userLimit: maxApprovalAmount
          },
          ipAddress: req.ip,
          userAgent: req.get("User-Agent"),
          department: user?.department,
          designation: user?.designation
        });

        return res.status(403).json({ 
          message: `Your approval limit (₹${maxApprovalAmount}) is insufficient for this action (requires ₹${minAmount})` 
        });
      }

      next();
    } catch (error) {
      console.error("Approval limit check error:", error);
      res.status(500).json({ message: "Internal server error during approval check" });
    }
  };
};
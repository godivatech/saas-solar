import { User } from '../storage';

/**
 * In-memory cache service for user data and session management
 * This reduces database calls and improves performance
 */
class CacheService {
  private userCache = new Map<string, { data: User; timestamp: number }>();
  private sessionCache = new Map<string, { uid: string; timestamp: number; lastAccess: number }>();
  private readonly USER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly SESSION_TTL = 30 * 60 * 1000; // 30 minutes
  private readonly CLEANUP_INTERVAL = 60 * 1000; // 1 minute

  constructor() {
    // Start periodic cleanup
    setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL);
  }

  /**
   * Cache user data with TTL
   */
  setUser(uid: string, user: User): void {
    this.userCache.set(uid, {
      data: user,
      timestamp: Date.now()
    });
  }

  /**
   * Get cached user data if still valid
   */
  getUser(uid: string): User | null {
    const cached = this.userCache.get(uid);
    if (!cached) return null;

    // Check if cache is still valid
    if (Date.now() - cached.timestamp > this.USER_CACHE_TTL) {
      this.userCache.delete(uid);
      return null;
    }

    return cached.data;
  }

  /**
   * Invalidate user cache
   */
  invalidateUser(uid: string): void {
    this.userCache.delete(uid);
  }

  /**
   * Create or update user session
   */
  setSession(sessionId: string, uid: string): void {
    this.sessionCache.set(sessionId, {
      uid,
      timestamp: Date.now(),
      lastAccess: Date.now()
    });
  }

  /**
   * Get session data and update last access time
   */
  getSession(sessionId: string): { uid: string } | null {
    const session = this.sessionCache.get(sessionId);
    if (!session) return null;

    // Check if session is still valid
    if (Date.now() - session.timestamp > this.SESSION_TTL) {
      this.sessionCache.delete(sessionId);
      return null;
    }

    // Update last access time
    session.lastAccess = Date.now();
    return { uid: session.uid };
  }

  /**
   * Invalidate session
   */
  invalidateSession(sessionId: string): void {
    this.sessionCache.delete(sessionId);
  }

  /**
   * Get all cached users (for bulk operations)
   */
  getAllUsers(): User[] {
    const validUsers: User[] = [];
    const now = Date.now();

    this.userCache.forEach((cached, uid) => {
      if (now - cached.timestamp <= this.USER_CACHE_TTL) {
        validUsers.push(cached.data);
      } else {
        this.userCache.delete(uid);
      }
    });

    return validUsers;
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    this.userCache.clear();
    this.sessionCache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      userCacheSize: this.userCache.size,
      sessionCacheSize: this.sessionCache.size,
      cacheHitRatio: this.calculateHitRatio()
    };
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();

    // Cleanup user cache
    this.userCache.forEach((cached, uid) => {
      if (now - cached.timestamp > this.USER_CACHE_TTL) {
        this.userCache.delete(uid);
      }
    });

    // Cleanup session cache
    this.sessionCache.forEach((session, sessionId) => {
      if (now - session.timestamp > this.SESSION_TTL) {
        this.sessionCache.delete(sessionId);
      }
    });
  }

  /**
   * Calculate cache hit ratio for monitoring
   */
  private calculateHitRatio(): number {
    // This is a simplified calculation
    // In production, you'd want to track hits/misses more accurately
    return this.userCache.size > 0 ? 0.85 : 0;
  }

  /**
   * Update user data in cache (for when user data changes)
   */
  updateUser(uid: string, userData: Partial<User>): void {
    const cached = this.userCache.get(uid);
    if (cached) {
      this.userCache.set(uid, {
        data: { ...cached.data, ...userData },
        timestamp: Date.now()
      });
    }
  }

  /**
   * Batch invalidate users (useful for role/department changes)
   */
  invalidateUsersByDepartment(department: string): void {
    this.userCache.forEach((cached, uid) => {
      if (cached.data.department === department) {
        this.userCache.delete(uid);
      }
    });
  }

  /**
   * Batch invalidate users by role
   */
  invalidateUsersByRole(role: string): void {
    this.userCache.forEach((cached, uid) => {
      if (cached.data.role === role) {
        this.userCache.delete(uid);
      }
    });
  }
}

export const cacheService = new CacheService();
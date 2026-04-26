// Simple in-memory rate limiter to prevent abuse
interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

class RateLimiter {
  private store: RateLimitStore = {};
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number = 60000, maxRequests: number = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    
    // Clean up expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const record = this.store[identifier];

    if (!record || now > record.resetTime) {
      this.store[identifier] = {
        count: 1,
        resetTime: now + this.windowMs
      };
      return true;
    }

    if (record.count >= this.maxRequests) {
      return false;
    }

    record.count++;
    return true;
  }

  private cleanup(): void {
    const now = Date.now();
    Object.keys(this.store).forEach(key => {
      if (now > this.store[key].resetTime) {
        delete this.store[key];
      }
    });
  }
}

// Create rate limiters for different endpoints
export const attendanceRateLimiter = new RateLimiter(60000, 20); // 20 requests per minute
export const generalRateLimiter = new RateLimiter(60000, 100); // 100 requests per minute

export function createRateLimitMiddleware(limiter: RateLimiter) {
  return (req: any, res: any, next: any) => {
    const identifier = req.ip || req.connection.remoteAddress || 'unknown';
    
    if (!limiter.isAllowed(identifier)) {
      return res.status(429).json({
        message: "Too many requests. Please try again later.",
        retryAfter: 60
      });
    }
    
    next();
  };
}
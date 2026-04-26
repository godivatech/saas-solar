import crypto from 'crypto';

/**
 * Generate a cryptographically secure OTP
 */
export function generateOTP(length: number = 6): string {
    const digits = '0123456789';
    let otp = '';

    const randomBytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
        otp += digits[randomBytes[i] % 10];
    }

    return otp;
}

/**
 * Validate OTP format (6 digits)
 */
export function validateOTPFormat(otp: string): boolean {
    return /^\d{6}$/.test(otp);
}

/**
 * OTP Configuration
 */
export const OTP_CONFIG = {
    EXPIRY_MINUTES: 5,
    MAX_ATTEMPTS: 3,
    RATE_LIMIT_MINUTES: 1,
    LENGTH: 6
} as const;

/**
 * OTP Record structure
 */
export interface OTPRecord {
    email: string;
    otp: string;
    expiresAt: Date;
    attempts: number;
    createdAt: Date;
    verified?: boolean;
}

/**
 * In-memory OTP store
 * For production, consider using Redis for distributed systems
 */
export class OTPStore {
    private store = new Map<string, OTPRecord>();

    /**
     * Store new OTP
     */
    set(email: string, otp: string): OTPRecord {
        const record: OTPRecord = {
            email,
            otp,
            expiresAt: new Date(Date.now() + OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000),
            attempts: 0,
            createdAt: new Date(),
            verified: false
        };

        this.store.set(email, record);

        // Auto-cleanup after expiry
        setTimeout(() => {
            this.delete(email);
        }, OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000);

        return record;
    }

    /**
     * Get OTP record
     */
    get(email: string): OTPRecord | undefined {
        return this.store.get(email);
    }

    /**
     * Delete OTP record
     */
    delete(email: string): boolean {
        return this.store.delete(email);
    }

    /**
     * Update OTP record
     */
    update(email: string, updates: Partial<OTPRecord>): void {
        const record = this.store.get(email);
        if (record) {
            this.store.set(email, { ...record, ...updates });
        }
    }

    /**
     * Check if OTP is expired
     */
    isExpired(email: string): boolean {
        const record = this.store.get(email);
        if (!record) return true;
        return new Date() > record.expiresAt;
    }

    /**
     * Check if can request new OTP (rate limiting)
     */
    canRequestNew(email: string): { allowed: boolean; retryAfter?: number } {
        const record = this.store.get(email);
        if (!record) return { allowed: true };

        const timeSinceLastRequest = Date.now() - record.createdAt.getTime();
        const rateLimitMs = OTP_CONFIG.RATE_LIMIT_MINUTES * 60 * 1000;

        if (timeSinceLastRequest < rateLimitMs) {
            return {
                allowed: false,
                retryAfter: Math.ceil((rateLimitMs - timeSinceLastRequest) / 1000)
            };
        }

        return { allowed: true };
    }
}

// Export singleton instance
export const otpStore = new OTPStore();

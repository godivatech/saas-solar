export interface EmailValidationResult {
    valid: boolean;
    error?: string;
    suggestion?: string;
}

/**
 * Normalize email to lowercase and trim whitespace
 */
export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

/**
 * Validate if email is a valid Gmail address
 * Accepts @gmail.com and @googlemail.com (legacy)
 */
export function validateGmailAddress(email: string): EmailValidationResult {
    const normalized = normalizeEmail(email);

    // Empty check
    if (!normalized) {
        return { valid: false, error: "Email address is required" };
    }

    // Basic format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalized)) {
        return { valid: false, error: "Please enter a valid email address" };
    }

    // Gmail domain check
    const isGmail = normalized.endsWith('@gmail.com');
    const isGooglemail = normalized.endsWith('@googlemail.com');

    if (!isGmail && !isGooglemail) {
        // Check for common typos
        const domain = normalized.split('@')[1];
        const typos = ['gmil.com', 'gmai.com', 'gmail.con', 'gmal.com', 'gmaill.com'];

        if (typos.some(typo => domain?.includes(typo))) {
            return {
                valid: false,
                error: "Only Gmail addresses are accepted",
                suggestion: "Did you mean @gmail.com?"
            };
        }

        return {
            valid: false,
            error: "Only Gmail addresses are accepted"
        };
    }

    return { valid: true };
}

/**
 * OT Auth Hook
 * Integrates with existing Firebase auth for OT API calls
 */

import { getAuth } from 'firebase/auth';

export async function getOTAuthToken(): Promise<string> {
    const auth = getAuth();
    const currentUser = auth.currentUser;

    if (!currentUser) {
        throw new Error('No authenticated user');
    }

    try {
        const token = await currentUser.getIdToken();
        return token;
    } catch (error) {
        console.error('Error getting auth token:', error);
        throw new Error('Failed to get authentication token');
    }
}

export function useOTAuth() {
    return {
        getAuthToken: getOTAuthToken
    };
}

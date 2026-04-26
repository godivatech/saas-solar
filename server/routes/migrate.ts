/**
 * Migration Route
 * Provides API endpoint to run OT migration
 */

import { Router } from 'express';
import { migrateLegacyOTSessions } from '../migrations/migrate-legacy-ot';
import { verifyAuth } from '../routes';

const router = Router();

/**
 * POST /api/migrate/legacy-ot
 * Run legacy OT migration (Admin only)
 */
router.post('/legacy-ot', verifyAuth, async (req, res) => {
    try {
        // Verify user is admin
        const user = (req as any).user;
        if (user.role !== 'master_admin') {
            return res.status(403).json({
                success: false,
                message: 'Only master admin can run migrations'
            });
        }

        console.log(`[MIGRATION-ROUTE] Migration triggered by admin: ${user.email}`);

        // Import storage from the main server context
        const { storage } = await import('../storage');
        const result = await migrateLegacyOTSessions(storage);

        res.json(result);
    } catch (error) {
        console.error('[MIGRATION-ROUTE] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Migration failed',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

export default router;

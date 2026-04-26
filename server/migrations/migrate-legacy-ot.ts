/**
 * Migration Script: Legacy OT to Session-Based OT
 * 
 * This migration should be run via the API endpoint, not standalone
 * Use: POST /api/migrate/legacy-ot (with admin auth)
 */

import type { OTSession } from '../types/ot-types';

export async function migrateLegacyOTSessions(storage: any) {
    console.log('[MIGRATION] ========================================');
    console.log('[MIGRATION] Starting Legacy OT Migration...');
    console.log('[MIGRATION] Converting old OT format to session-based format');

    try {
        // Get all attendance records
        const allAttendance = await storage.listAttendance({});
        console.log(`[MIGRATION] Found ${allAttendance.length} total attendance records`);

        let migratedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const record of allAttendance) {
            try {
                // Check if this record has legacy OT data
                const hasLegacyOT = record.otStartTime || record.otStatus === 'in_progress' || record.otStatus === 'completed';

                // Skip if no legacy OT
                if (!hasLegacyOT) {
                    skippedCount++;
                    continue;
                }

                // Skip if already has otSessions array
                if (record.otSessions && Array.isArray(record.otSessions) && record.otSessions.length > 0) {
                    console.log(`[MIGRATION] ⏭️  Skipping ${record.id} - already has otSessions`);
                    skippedCount++;
                    continue;
                }

                console.log(`[MIGRATION] 🔄 Migrating record ${record.id} for user ${record.userId}`);

                // Create new OT session from legacy data
                const timestamp = record.otStartTime ? new Date(record.otStartTime).getTime() : Date.now();
                const sessionId = `ot_migrated_${record.userId}_${timestamp}`;

                const newSession: OTSession = {
                    sessionId,
                    sessionNumber: 1,
                    otType: record.otType || 'late_departure',
                    startTime: record.otStartTime ? new Date(record.otStartTime) : new Date(),
                    otHours: 0,
                    startImageUrl: record.otStartImageUrl || '',
                    startLatitude: record.otStartLatitude || '',
                    startLongitude: record.otStartLongitude || '',
                    startAddress: record.otStartAddress || '',
                    reason: record.otReason || '',
                    employeeId: record.userId,
                    status: record.otStatus === 'in_progress' ? 'in_progress' : 'completed',
                    createdAt: record.otStartTime ? new Date(record.otStartTime) : new Date()
                };

                // If OT is completed, add end data
                if (record.otStatus === 'completed' && record.otEndTime) {
                    newSession.endTime = new Date(record.otEndTime);
                    newSession.endImageUrl = record.otEndImageUrl || '';
                    newSession.endLatitude = record.otEndLatitude || '';
                    newSession.endLongitude = record.otEndLongitude || '';
                    newSession.endAddress = record.otEndAddress || '';

                    // Calculate OT hours if not already set
                    if (record.manualOTHours) {
                        newSession.otHours = record.manualOTHours;
                        newSession.status = 'APPROVED'; // Legacy completed OT is assumed approved
                    } else {
                        const durationMs = newSession.endTime.getTime() - newSession.startTime.getTime();
                        newSession.otHours = Number((durationMs / (1000 * 60 * 60)).toFixed(2));
                        newSession.status = 'PENDING_REVIEW'; // Needs admin review
                    }

                    newSession.updatedAt = new Date(record.otEndTime);
                }

                // Update the attendance record with new session
                await storage.updateAttendance(record.id, {
                    otSessions: [newSession],
                    // Keep legacy fields for reference but mark as migrated
                    _legacyOTMigrated: true,
                    _legacyOTMigratedAt: new Date()
                });

                console.log(`[MIGRATION] ✅ Migrated ${record.id} - Session: ${sessionId}, Status: ${newSession.status}`);
                migratedCount++;

            } catch (error) {
                console.error(`[MIGRATION] ❌ Error migrating record ${record.id}:`, error);
                errorCount++;
            }
        }

        console.log('[MIGRATION] ========================================');
        console.log('[MIGRATION] Migration Complete!');
        console.log(`[MIGRATION] 📊 Results:`);
        console.log(`[MIGRATION]    ✅ Migrated: ${migratedCount}`);
        console.log(`[MIGRATION]    ⏭️  Skipped: ${skippedCount}`);
        console.log(`[MIGRATION]    ❌ Errors: ${errorCount}`);
        console.log('[MIGRATION] ========================================');

        return {
            success: true,
            migratedCount,
            skippedCount,
            errorCount
        };

    } catch (error) {
        console.error('[MIGRATION] Fatal error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// Allow running directly
if (require.main === module) {
    migrateLegacyOTSessions()
        .then(result => {
            console.log('Migration result:', result);
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}

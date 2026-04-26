/**
 * Firestore Data Migration Script
 * Migrates existing OT data from single fields to JSONB array format
 * 
 * Usage: npx tsx server/migrations/migrate-ot-to-sessions.ts
 */

import admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
        })
    });
}

const db = admin.firestore();

interface OldAttendance {
    id: string;
    userId: string;
    date: Timestamp;
    otStartTime?: Timestamp;
    otEndTime?: Timestamp;
    overtimeHours?: number;
    manualOTHours?: number;
    otType?: string;
    otReason?: string;
    otStartImageUrl?: string;
    otEndImageUrl?: string;
    otStartLatitude?: string;
    otStartLongitude?: string;
    otEndLatitude?: string;
    otEndLongitude?: string;
    otStartAddress?: string;
    otEndAddress?: string;
}

async function migrateOTToSessions() {
    console.log('🚀 Starting OT migration to sessions...\n');

    try {
        // Get all attendance records
        const attendanceSnapshot = await db.collection('attendance').get();

        let migrated = 0;
        let skipped = 0;
        let errors = 0;

        const batch = db.batch();
        let batchCount = 0;
        const BATCH_SIZE = 500; // Firestore limit

        for (const doc of attendanceSnapshot.docs) {
            const data = doc.data() as OldAttendance;

            // Skip if already has otSessions
            if (data.hasOwnProperty('otSessions')) {
                skipped++;
                continue;
            }

            // Skip if no OT data
            if (!data.otStartTime && !data.overtimeHours && !data.manualOTHours) {
                // Just add empty otSessions array
                batch.update(doc.ref, {
                    otSessions: [],
                    totalOTHours: 0
                });
                batchCount++;
                migrated++;
                continue;
            }

            try {
                // Build OT session from old data
                const dateStr = data.date.toDate().toISOString().split('T')[0].replace(/-/g, '');
                const sessionId = `ot_${dateStr}_${data.userId}_001`;

                const otSession = {
                    sessionId,
                    sessionNumber: 1,
                    otType: data.otType || 'late_departure',
                    startTime: data.otStartTime?.toDate() || new Date(),
                    endTime: data.otEndTime?.toDate(),
                    otHours: data.overtimeHours || data.manualOTHours || 0,
                    startImageUrl: data.otStartImageUrl || '',
                    endImageUrl: data.otEndImageUrl || '',
                    startLatitude: data.otStartLatitude || '',
                    startLongitude: data.otStartLongitude || '',
                    endLatitude: data.otEndLatitude || '',
                    endLongitude: data.otEndLongitude || '',
                    startAddress: data.otStartAddress || '',
                    endAddress: data.otEndAddress || '',
                    reason: data.otReason || '',
                    employeeId: data.userId,
                    status: data.otEndTime ? 'completed' : 'in_progress',
                    createdAt: data.otStartTime?.toDate() || new Date()
                };

                // Update document with otSessions array
                batch.update(doc.ref, {
                    otSessions: [otSession],
                    totalOTHours: otSession.otHours
                });

                batchCount++;
                migrated++;

                // Commit batch if reached limit
                if (batchCount >= BATCH_SIZE) {
                    await batch.commit();
                    console.log(`✅ Committed batch of ${batchCount} records`);
                    batchCount = 0;
                }

            } catch (err) {
                console.error(`❌ Error migrating doc ${doc.id}:`, err);
                errors++;
            }
        }

        // Commit remaining batch
        if (batchCount > 0) {
            await batch.commit();
            console.log(`✅ Committed final batch of ${batchCount} records`);
        }

        console.log('\n📊 Migration Summary:');
        console.log(`Total records: ${attendanceSnapshot.size}`);
        console.log(`Migrated: ${migrated}`);
        console.log(`Skipped: ${skipped}`);
        console.log(`Errors: ${errors}`);
        console.log('\n✅ Migration complete!\n');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
}

// Run migration
migrateOTToSessions()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });

"use strict";
/**
 * Expired Booking Link Cleanup - Scheduled Cloud Function
 *
 * Runs daily to:
 * 1. Find expired booking links that are still 'active'
 * 2. Mark them as 'expired'
 * 3. Update corresponding candidate status to 'withdrawn'
 * 4. Log activity for audit trail
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerExpiredBookingCleanup = exports.checkCandidateBookingExpiry = exports.cleanupExpiredBookingLinks = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
// ============================================================================
// SCHEDULED FUNCTION - Runs daily at 2 AM
// ============================================================================
exports.cleanupExpiredBookingLinks = (0, scheduler_1.onSchedule)({
    schedule: '0 2 * * *', // Every day at 2 AM
    timeZone: 'Europe/London',
    retryCount: 3,
}, async () => {
    console.log('Starting expired booking link cleanup...');
    const now = admin.firestore.Timestamp.now();
    const results = {
        linksExpired: 0,
        candidatesWithdrawn: 0,
        errors: 0,
    };
    try {
        // Find all active booking links that have expired
        const expiredLinksSnapshot = await db
            .collection('bookingLinks')
            .where('status', '==', 'active')
            .where('expiresAt', '<', now)
            .get();
        console.log(`Found ${expiredLinksSnapshot.size} expired active booking links`);
        for (const linkDoc of expiredLinksSnapshot.docs) {
            try {
                const link = linkDoc.data();
                const candidateId = link.candidateId;
                // Update link status to expired
                await linkDoc.ref.update({
                    status: 'expired',
                    expiredAt: now,
                });
                results.linksExpired++;
                // Check if candidate should be withdrawn
                if (candidateId) {
                    const candidateRef = db.collection('candidates').doc(candidateId);
                    const candidateDoc = await candidateRef.get();
                    if (candidateDoc.exists) {
                        const candidate = candidateDoc.data();
                        const currentStatus = candidate?.status;
                        // Only withdraw if they're still waiting (invite_sent, trial_invited)
                        // Don't withdraw if they've already progressed or been processed
                        const withdrawableStatuses = ['invite_sent', 'trial_invited'];
                        if (withdrawableStatuses.includes(currentStatus)) {
                            await candidateRef.update({
                                status: 'withdrawn',
                                withdrawalReason: `Booking link expired without booking (${link.type || 'interview'})`,
                                withdrawnAt: now,
                                updatedAt: now,
                            });
                            // Log activity
                            await db.collection('activityLog').add({
                                entityType: 'candidate',
                                entityId: candidateId,
                                action: 'status_changed',
                                description: `Auto-withdrawn: ${link.type || 'Interview'} booking link expired without booking`,
                                previousValue: { status: currentStatus },
                                newValue: { status: 'withdrawn' },
                                userId: 'system',
                                userName: 'System (Auto-cleanup)',
                                createdAt: now,
                            });
                            results.candidatesWithdrawn++;
                            console.log(`Candidate ${candidateId} withdrawn due to expired ${link.type} link`);
                        }
                    }
                }
            }
            catch (err) {
                console.error(`Error processing link ${linkDoc.id}:`, err);
                results.errors++;
            }
        }
        console.log('Expired booking link cleanup complete:', results);
        return results;
    }
    catch (err) {
        console.error('Error in cleanup function:', err);
        throw err;
    }
});
// ============================================================================
// CALLABLE FUNCTION - For lazy check on candidate view
// ============================================================================
exports.checkCandidateBookingExpiry = (0, https_1.onCall)({
    cors: true,
}, async (request) => {
    const { candidateId } = request.data;
    if (!candidateId) {
        throw new https_1.HttpsError('invalid-argument', 'candidateId is required');
    }
    const now = admin.firestore.Timestamp.now();
    try {
        // Find any active booking links for this candidate that have expired
        const expiredLinksSnapshot = await db
            .collection('bookingLinks')
            .where('candidateId', '==', candidateId)
            .where('status', '==', 'active')
            .where('expiresAt', '<', now)
            .get();
        if (expiredLinksSnapshot.empty) {
            return { updated: false, message: 'No expired links found' };
        }
        // Get candidate current status
        const candidateRef = db.collection('candidates').doc(candidateId);
        const candidateDoc = await candidateRef.get();
        if (!candidateDoc.exists) {
            return { updated: false, message: 'Candidate not found' };
        }
        const candidate = candidateDoc.data();
        const currentStatus = candidate?.status;
        const withdrawableStatuses = ['invite_sent', 'trial_invited'];
        // Mark all expired links
        for (const linkDoc of expiredLinksSnapshot.docs) {
            await linkDoc.ref.update({
                status: 'expired',
                expiredAt: now,
            });
        }
        // Withdraw candidate if appropriate
        if (withdrawableStatuses.includes(currentStatus)) {
            const linkType = expiredLinksSnapshot.docs[0].data().type || 'interview';
            await candidateRef.update({
                status: 'withdrawn',
                withdrawalReason: `Booking link expired without booking (${linkType})`,
                withdrawnAt: now,
                updatedAt: now,
            });
            // Log activity
            await db.collection('activityLog').add({
                entityType: 'candidate',
                entityId: candidateId,
                action: 'status_changed',
                description: `Auto-withdrawn: ${linkType} booking link expired without booking`,
                previousValue: { status: currentStatus },
                newValue: { status: 'withdrawn' },
                userId: 'system',
                userName: 'System (Auto-check)',
                createdAt: now,
            });
            return {
                updated: true,
                newStatus: 'withdrawn',
                message: `Candidate withdrawn due to expired ${linkType} booking link`
            };
        }
        return {
            updated: false,
            message: `Links expired but candidate status (${currentStatus}) not withdrawable`
        };
    }
    catch (err) {
        console.error('Error checking candidate booking expiry:', err);
        throw new https_1.HttpsError('internal', err.message || 'Error checking booking expiry');
    }
});
// ============================================================================
// MANUAL TRIGGER - For running cleanup on demand
// ============================================================================
exports.triggerExpiredBookingCleanup = (0, https_1.onCall)({
    cors: true,
}, async (request) => {
    // Require authentication
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be authenticated');
    }
    console.log('Manual expired booking link cleanup triggered by:', request.auth.uid);
    const now = admin.firestore.Timestamp.now();
    const results = {
        linksExpired: 0,
        candidatesWithdrawn: 0,
        errors: 0,
    };
    try {
        const expiredLinksSnapshot = await db
            .collection('bookingLinks')
            .where('status', '==', 'active')
            .where('expiresAt', '<', now)
            .get();
        console.log(`Found ${expiredLinksSnapshot.size} expired active booking links`);
        for (const linkDoc of expiredLinksSnapshot.docs) {
            try {
                const link = linkDoc.data();
                const candidateId = link.candidateId;
                await linkDoc.ref.update({
                    status: 'expired',
                    expiredAt: now,
                });
                results.linksExpired++;
                if (candidateId) {
                    const candidateRef = db.collection('candidates').doc(candidateId);
                    const candidateDoc = await candidateRef.get();
                    if (candidateDoc.exists) {
                        const candidate = candidateDoc.data();
                        const currentStatus = candidate?.status;
                        const withdrawableStatuses = ['invite_sent', 'trial_invited'];
                        if (withdrawableStatuses.includes(currentStatus)) {
                            await candidateRef.update({
                                status: 'withdrawn',
                                withdrawalReason: `Booking link expired without booking (${link.type || 'interview'})`,
                                withdrawnAt: now,
                                updatedAt: now,
                            });
                            await db.collection('activityLog').add({
                                entityType: 'candidate',
                                entityId: candidateId,
                                action: 'status_changed',
                                description: `Auto-withdrawn: ${link.type || 'Interview'} booking link expired without booking`,
                                previousValue: { status: currentStatus },
                                newValue: { status: 'withdrawn' },
                                userId: request.auth?.uid || 'system',
                                userName: 'System (Manual trigger)',
                                createdAt: now,
                            });
                            results.candidatesWithdrawn++;
                        }
                    }
                }
            }
            catch (err) {
                console.error(`Error processing link ${linkDoc.id}:`, err);
                results.errors++;
            }
        }
        console.log('Manual cleanup complete:', results);
        return results;
    }
    catch (err) {
        console.error('Error in manual cleanup:', err);
        throw new https_1.HttpsError('internal', err.message || 'Cleanup failed');
    }
});
//# sourceMappingURL=expiredBookingCleanup.js.map
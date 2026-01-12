"use strict";
/**
 * Lapsed Interviews Functions
 *
 * Handles marking interviews as lapsed when they pass their scheduled date
 * without being completed, and resolving them when appropriate.
 *
 * Updated: Auto-resolve lapsed interviews when candidate status changes
 * Updated: Run at 6am, 12pm, 6pm and midnight for faster status updates
 * Updated: Auto-complete past interviews and update candidate status
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
exports.processInterviewsNow = exports.onCandidateWithdrawnOrRejected = exports.onCandidateStatusChange = exports.resolveLapsedInterview = exports.markLapsedInterviews = exports.processInterviewsMidnight = exports.processInterviews6pm = exports.processInterviews12pm = exports.processInterviews6am = void 0;
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const db = admin.firestore();
// ============================================================================
// Statuses that should auto-resolve lapsed interviews
// ============================================================================
const AUTO_RESOLVE_STATUSES = [
    'withdrawn',
    'rejected',
    'trial_scheduled',
    'trial_complete',
    'approved',
    'hired'
];
// ============================================================================
// Process Past Interviews (Core Logic)
// Marks past interviews as completed and updates candidate status
// ============================================================================
async function processPassedInterviews() {
    const now = new Date();
    let completedCount = 0;
    let lapsedCount = 0;
    let candidatesUpdated = 0;
    try {
        // Find interviews that are scheduled/confirmed but past their date+time
        const interviewsSnapshot = await db
            .collection('interviews')
            .where('status', 'in', ['scheduled', 'confirmed'])
            .where('scheduledAt', '<', admin.firestore.Timestamp.fromDate(now))
            .get();
        if (interviewsSnapshot.empty) {
            logger.info('No past interviews to process');
            return { completed: 0, lapsed: 0, candidatesUpdated: 0 };
        }
        const batch = db.batch();
        const candidatesToUpdate = new Map(); // candidateId -> newStatus
        for (const doc of interviewsSnapshot.docs) {
            const interview = doc.data();
            const scheduledAt = interview.scheduledAt?.toDate?.() || new Date(0);
            const hoursSinceInterview = (now.getTime() - scheduledAt.getTime()) / (1000 * 60 * 60);
            // Check if candidate status should prevent processing
            if (interview.candidateId) {
                const candidateDoc = await db.collection('candidates').doc(interview.candidateId).get();
                if (candidateDoc.exists) {
                    const candidate = candidateDoc.data();
                    if (candidate && AUTO_RESOLVE_STATUSES.includes(candidate.status)) {
                        // Auto-resolve instead of completing
                        batch.update(doc.ref, {
                            status: 'resolved',
                            resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
                            resolvedReason: `Auto-resolved: candidate status is ${candidate.status}`,
                        });
                        lapsedCount++;
                        continue;
                    }
                }
            }
            // If interview was less than 2 hours ago, mark as completed and update candidate
            if (hoursSinceInterview < 48) {
                batch.update(doc.ref, {
                    status: 'completed',
                    completedAt: admin.firestore.FieldValue.serverTimestamp(),
                    autoCompleted: true,
                });
                completedCount++;
                // Track candidate for status update
                if (interview.candidateId && interview.type) {
                    const newStatus = interview.type === 'trial' ? 'trial_complete' : 'interview_complete';
                    candidatesToUpdate.set(interview.candidateId, newStatus);
                }
            }
            else {
                // If more than 48 hours, mark as lapsed (needs manual resolution)
                batch.update(doc.ref, {
                    status: 'lapsed',
                    lapsedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                lapsedCount++;
            }
        }
        await batch.commit();
        // Update candidate statuses
        for (const [candidateId, newStatus] of candidatesToUpdate) {
            try {
                const candidateRef = db.collection('candidates').doc(candidateId);
                const candidateDoc = await candidateRef.get();
                if (candidateDoc.exists) {
                    const currentStatus = candidateDoc.data()?.status;
                    // Only update if moving forward in the workflow
                    const statusOrder = ['new', 'screening', 'interview_scheduled', 'interview_complete', 'trial_scheduled', 'trial_complete', 'approved'];
                    const currentIndex = statusOrder.indexOf(currentStatus);
                    const newIndex = statusOrder.indexOf(newStatus);
                    if (newIndex > currentIndex || currentStatus === 'interview_scheduled' || currentStatus === 'trial_scheduled') {
                        await candidateRef.update({
                            status: newStatus,
                            statusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
                            statusUpdatedBy: 'system',
                        });
                        candidatesUpdated++;
                        logger.info(`Updated candidate ${candidateId} status to ${newStatus}`);
                    }
                }
            }
            catch (err) {
                logger.error(`Failed to update candidate ${candidateId}:`, err);
            }
        }
        return { completed: completedCount, lapsed: lapsedCount, candidatesUpdated };
    }
    catch (error) {
        logger.error('Error processing passed interviews:', error);
        throw error;
    }
}
// ============================================================================
// Scheduled Functions - Run at 6am, 12pm, 6pm, and midnight
// ============================================================================
exports.processInterviews6am = (0, scheduler_1.onSchedule)({
    schedule: '0 6 * * *', // Daily at 6 AM
    timeZone: 'Europe/London',
    region: 'europe-west2',
}, async () => {
    logger.info('Running 6am interview processing');
    const result = await processPassedInterviews();
    logger.info(`6am run: Completed ${result.completed}, Lapsed ${result.lapsed}, Candidates updated ${result.candidatesUpdated}`);
});
exports.processInterviews12pm = (0, scheduler_1.onSchedule)({
    schedule: '0 12 * * *', // Daily at 12 PM (noon)
    timeZone: 'Europe/London',
    region: 'europe-west2',
}, async () => {
    logger.info('Running 12pm interview processing');
    const result = await processPassedInterviews();
    logger.info(`12pm run: Completed ${result.completed}, Lapsed ${result.lapsed}, Candidates updated ${result.candidatesUpdated}`);
});
exports.processInterviews6pm = (0, scheduler_1.onSchedule)({
    schedule: '0 18 * * *', // Daily at 6 PM
    timeZone: 'Europe/London',
    region: 'europe-west2',
}, async () => {
    logger.info('Running 6pm interview processing');
    const result = await processPassedInterviews();
    logger.info(`6pm run: Completed ${result.completed}, Lapsed ${result.lapsed}, Candidates updated ${result.candidatesUpdated}`);
});
exports.processInterviewsMidnight = (0, scheduler_1.onSchedule)({
    schedule: '0 0 * * *', // Daily at midnight
    timeZone: 'Europe/London',
    region: 'europe-west2',
}, async () => {
    logger.info('Running midnight interview processing');
    const result = await processPassedInterviews();
    logger.info(`Midnight run: Completed ${result.completed}, Lapsed ${result.lapsed}, Candidates updated ${result.candidatesUpdated}`);
});
// Keep the old function name for backwards compatibility (will be removed later)
exports.markLapsedInterviews = exports.processInterviews6am;
exports.resolveLapsedInterview = (0, https_1.onCall)({ region: 'us-central1' }, async (request) => {
    const { interviewId, resolution, notes, newDate } = request.data;
    if (!interviewId || !resolution) {
        throw new https_1.HttpsError('invalid-argument', 'Missing interviewId or resolution');
    }
    try {
        const interviewRef = db.collection('interviews').doc(interviewId);
        const interviewDoc = await interviewRef.get();
        if (!interviewDoc.exists) {
            throw new https_1.HttpsError('not-found', 'Interview not found');
        }
        const interview = interviewDoc.data();
        // Determine new status based on resolution
        let newStatus;
        const updateData = {
            resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
            resolvedBy: request.auth?.uid || 'system',
            resolutionNotes: notes || '',
        };
        switch (resolution) {
            case 'rescheduled':
                if (!newDate) {
                    throw new https_1.HttpsError('invalid-argument', 'New date required for rescheduling');
                }
                newStatus = 'scheduled';
                updateData.scheduledAt = admin.firestore.Timestamp.fromDate(new Date(newDate));
                updateData.rescheduledFrom = interview?.scheduledAt;
                break;
            case 'completed':
                newStatus = 'completed';
                break;
            case 'cancelled':
                newStatus = 'cancelled';
                break;
            case 'no_show':
                newStatus = 'no_show';
                break;
            default:
                throw new https_1.HttpsError('invalid-argument', 'Invalid resolution type');
        }
        updateData.status = newStatus;
        await interviewRef.update(updateData);
        // If no_show, update candidate status
        if (resolution === 'no_show' && interview?.candidateId) {
            await db.collection('candidates').doc(interview.candidateId).update({
                lastInterviewNoShow: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        logger.info(`Lapsed interview ${interviewId} resolved as ${resolution}`);
        return { success: true, newStatus };
    }
    catch (error) {
        logger.error('Error resolving lapsed interview:', error);
        if (error instanceof https_1.HttpsError)
            throw error;
        throw new https_1.HttpsError('internal', error.message || 'Failed to resolve interview');
    }
});
// ============================================================================
// Auto-resolve lapsed interviews when candidate status changes
// ============================================================================
exports.onCandidateStatusChange = (0, firestore_1.onDocumentUpdated)({
    document: 'candidates/{candidateId}',
    region: 'europe-west2',
}, async (event) => {
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();
    const candidateId = event.params.candidateId;
    if (!beforeData || !afterData)
        return;
    const oldStatus = beforeData.status;
    const newStatus = afterData.status;
    // Only proceed if status changed to an auto-resolve status
    if (oldStatus === newStatus || !AUTO_RESOLVE_STATUSES.includes(newStatus)) {
        return;
    }
    logger.info(`Candidate ${candidateId} status changed from ${oldStatus} to ${newStatus}`);
    try {
        // Find all lapsed interviews for this candidate
        const lapsedInterviews = await db
            .collection('interviews')
            .where('candidateId', '==', candidateId)
            .where('status', '==', 'lapsed')
            .get();
        if (lapsedInterviews.empty) {
            logger.info(`No lapsed interviews found for candidate ${candidateId}`);
            return;
        }
        const batch = db.batch();
        let count = 0;
        for (const doc of lapsedInterviews.docs) {
            batch.update(doc.ref, {
                status: 'resolved',
                resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
                resolvedBy: 'system',
                resolvedReason: `Auto-resolved: candidate status changed to ${newStatus}`,
            });
            count++;
        }
        await batch.commit();
        logger.info(`Auto-resolved ${count} lapsed interviews for candidate ${candidateId}`);
    }
    catch (error) {
        logger.error(`Error auto-resolving lapsed interviews for ${candidateId}:`, error);
    }
});
// ============================================================================
// Also resolve scheduled (not yet lapsed) interviews when candidate withdraws/rejected
// ============================================================================
exports.onCandidateWithdrawnOrRejected = (0, firestore_1.onDocumentUpdated)({
    document: 'candidates/{candidateId}',
    region: 'europe-west2',
}, async (event) => {
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();
    const candidateId = event.params.candidateId;
    if (!beforeData || !afterData)
        return;
    const oldStatus = beforeData.status;
    const newStatus = afterData.status;
    // Only proceed if status changed to withdrawn or rejected
    if (oldStatus === newStatus || !['withdrawn', 'rejected'].includes(newStatus)) {
        return;
    }
    try {
        // Find all scheduled interviews for this candidate
        const scheduledInterviews = await db
            .collection('interviews')
            .where('candidateId', '==', candidateId)
            .where('status', '==', 'scheduled')
            .get();
        if (scheduledInterviews.empty) {
            return;
        }
        const batch = db.batch();
        let count = 0;
        for (const doc of scheduledInterviews.docs) {
            batch.update(doc.ref, {
                status: 'cancelled',
                cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                cancelledReason: `Candidate ${newStatus}`,
            });
            count++;
        }
        await batch.commit();
        logger.info(`Cancelled ${count} scheduled interviews for ${newStatus} candidate ${candidateId}`);
    }
    catch (error) {
        logger.error(`Error cancelling interviews for ${candidateId}:`, error);
    }
});
// ============================================================================
// Manual Trigger - For immediate processing without waiting for schedule
// ============================================================================
exports.processInterviewsNow = (0, https_1.onCall)({
    region: 'europe-west2',
    timeoutSeconds: 120,
}, async (request) => {
    // Require authentication
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
    }
    logger.info('Manual trigger: Processing past interviews');
    try {
        const result = await processPassedInterviews();
        logger.info(`Manual run complete: Completed ${result.completed}, Lapsed ${result.lapsed}, Candidates updated ${result.candidatesUpdated}`);
        return {
            success: true,
            completed: result.completed,
            lapsed: result.lapsed,
            candidatesUpdated: result.candidatesUpdated,
            message: `Processed interviews: ${result.completed} completed, ${result.lapsed} lapsed, ${result.candidatesUpdated} candidates updated`
        };
    }
    catch (error) {
        logger.error('Manual trigger failed:', error);
        throw new https_1.HttpsError('internal', error.message || 'Failed to process interviews');
    }
});
//# sourceMappingURL=lapsedInterviews.js.map
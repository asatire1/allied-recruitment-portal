"use strict";
/**
 * Cascade Deletion & Archive Functions
 *
 * - Archives candidates instead of deleting (soft delete)
 * - Cleans up related data when documents are permanently deleted
 * - Detects returning candidates when CV is uploaded
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
exports.onCandidateDeleted = exports.permanentlyDeleteCandidate = exports.reactivateCandidate = exports.checkReturningCandidate = exports.restoreCandidate = exports.archiveCandidate = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
/**
 * Archive a candidate (soft delete)
 * Called from the UI instead of delete
 */
exports.archiveCandidate = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (request) => {
    // Check authentication
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { candidateId, reason } = request.data;
    if (!candidateId) {
        throw new https_1.HttpsError('invalid-argument', 'Candidate ID is required');
    }
    // Get user role
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    const userData = userDoc.data();
    if (!userData || !['super_admin', 'recruiter'].includes(userData.role)) {
        throw new https_1.HttpsError('permission-denied', 'Not authorized to archive candidates');
    }
    // Get candidate
    const candidateRef = db.collection('candidates').doc(candidateId);
    const candidateDoc = await candidateRef.get();
    if (!candidateDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Candidate not found');
    }
    const candidateData = candidateDoc.data();
    // Archive the candidate
    await candidateRef.update({
        archived: true,
        archivedAt: admin.firestore.FieldValue.serverTimestamp(),
        archivedBy: request.auth.uid,
        archivedReason: reason || null,
        previousStatus: candidateData.status,
        status: 'archived',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // Cancel any scheduled interviews (don't delete - keep for history)
    const interviewsSnapshot = await db
        .collection('interviews')
        .where('candidateId', '==', candidateId)
        .where('status', '==', 'scheduled')
        .get();
    if (!interviewsSnapshot.empty) {
        const batch = db.batch();
        interviewsSnapshot.docs.forEach(doc => {
            batch.update(doc.ref, {
                status: 'cancelled',
                cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                cancellationReason: 'Candidate archived',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });
        await batch.commit();
    }
    // Revoke any active booking links
    const bookingLinksSnapshot = await db
        .collection('bookingLinks')
        .where('candidateId', '==', candidateId)
        .where('status', '==', 'active')
        .get();
    if (!bookingLinksSnapshot.empty) {
        const batch = db.batch();
        bookingLinksSnapshot.docs.forEach(doc => {
            batch.update(doc.ref, {
                status: 'revoked',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });
        await batch.commit();
    }
    // Log the archive
    await db.collection('activityLog').add({
        type: 'candidate_archived',
        candidateId,
        candidateName: `${candidateData.firstName} ${candidateData.lastName}`,
        archivedBy: request.auth.uid,
        reason: reason || null,
        interviewsCancelled: interviewsSnapshot.size,
        bookingLinksRevoked: bookingLinksSnapshot.size,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`Candidate archived: ${candidateId} (${candidateData.firstName} ${candidateData.lastName})`);
    return {
        success: true,
        message: 'Candidate archived successfully',
        interviewsCancelled: interviewsSnapshot.size,
        bookingLinksRevoked: bookingLinksSnapshot.size,
    };
});
/**
 * Restore an archived candidate
 */
exports.restoreCandidate = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { candidateId } = request.data;
    if (!candidateId) {
        throw new https_1.HttpsError('invalid-argument', 'Candidate ID is required');
    }
    // Get user role
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    const userData = userDoc.data();
    if (!userData || !['super_admin', 'recruiter'].includes(userData.role)) {
        throw new https_1.HttpsError('permission-denied', 'Not authorized to restore candidates');
    }
    // Get candidate
    const candidateRef = db.collection('candidates').doc(candidateId);
    const candidateDoc = await candidateRef.get();
    if (!candidateDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Candidate not found');
    }
    const candidateData = candidateDoc.data();
    if (!candidateData.archived) {
        throw new https_1.HttpsError('failed-precondition', 'Candidate is not archived');
    }
    // Restore the candidate
    await candidateRef.update({
        archived: false,
        archivedAt: admin.firestore.FieldValue.delete(),
        archivedBy: admin.firestore.FieldValue.delete(),
        archivedReason: admin.firestore.FieldValue.delete(),
        status: candidateData.previousStatus || 'new',
        previousStatus: admin.firestore.FieldValue.delete(),
        restoredAt: admin.firestore.FieldValue.serverTimestamp(),
        restoredBy: request.auth.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // Log the restore
    await db.collection('activityLog').add({
        type: 'candidate_restored',
        candidateId,
        candidateName: `${candidateData.firstName} ${candidateData.lastName}`,
        restoredBy: request.auth.uid,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`Candidate restored: ${candidateId} (${candidateData.firstName} ${candidateData.lastName})`);
    return {
        success: true,
        message: 'Candidate restored successfully',
    };
});
/**
 * Check for returning candidate by email
 * Called when a new CV is uploaded or application is submitted
 */
exports.checkReturningCandidate = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (request) => {
    const { email, phone } = request.data;
    if (!email) {
        return { isReturning: false, candidate: null };
    }
    // Check for existing candidate by email (including archived)
    const emailQuery = await db
        .collection('candidates')
        .where('email', '==', email.toLowerCase().trim())
        .limit(1)
        .get();
    if (!emailQuery.empty) {
        const doc = emailQuery.docs[0];
        const data = doc.data();
        return {
            isReturning: true,
            candidate: {
                id: doc.id,
                firstName: data.firstName,
                lastName: data.lastName,
                email: data.email,
                phone: data.phone,
                archived: data.archived || false,
                previousApplicationDate: data.createdAt?.toDate?.()?.toISOString() || null,
                previousStatus: data.archived ? data.previousStatus : data.status,
                applicationCount: (data.applicationCount || 1),
            }
        };
    }
    // Also check by phone if provided
    if (phone) {
        const phoneQuery = await db
            .collection('candidates')
            .where('phone', '==', phone.replace(/\s/g, ''))
            .limit(1)
            .get();
        if (!phoneQuery.empty) {
            const doc = phoneQuery.docs[0];
            const data = doc.data();
            return {
                isReturning: true,
                candidate: {
                    id: doc.id,
                    firstName: data.firstName,
                    lastName: data.lastName,
                    email: data.email,
                    phone: data.phone,
                    archived: data.archived || false,
                    previousApplicationDate: data.createdAt?.toDate?.()?.toISOString() || null,
                    previousStatus: data.archived ? data.previousStatus : data.status,
                    applicationCount: (data.applicationCount || 1),
                }
            };
        }
    }
    return { isReturning: false, candidate: null };
});
/**
 * Reactivate an archived candidate with new CV
 */
exports.reactivateCandidate = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { candidateId, cvUrl, cvFileName, newData } = request.data;
    if (!candidateId) {
        throw new https_1.HttpsError('invalid-argument', 'Candidate ID is required');
    }
    const candidateRef = db.collection('candidates').doc(candidateId);
    const candidateDoc = await candidateRef.get();
    if (!candidateDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Candidate not found');
    }
    const candidateData = candidateDoc.data();
    // Update candidate - unarchive and mark as returning
    const updateData = {
        archived: false,
        status: 'new',
        isReturningCandidate: true,
        applicationCount: (candidateData.applicationCount || 1) + 1,
        lastApplicationAt: admin.firestore.FieldValue.serverTimestamp(),
        reactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
        reactivatedBy: request.auth.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    // Add new CV if provided
    if (cvUrl) {
        updateData.cvUrl = cvUrl;
        updateData.cvFileName = cvFileName || 'CV';
        updateData.cvUploadedAt = admin.firestore.FieldValue.serverTimestamp();
    }
    // Merge any new data (like updated phone, address, etc.)
    if (newData) {
        Object.assign(updateData, newData);
    }
    // Remove archive fields
    updateData.archivedAt = admin.firestore.FieldValue.delete();
    updateData.archivedBy = admin.firestore.FieldValue.delete();
    updateData.archivedReason = admin.firestore.FieldValue.delete();
    updateData.previousStatus = admin.firestore.FieldValue.delete();
    await candidateRef.update(updateData);
    // Log the reactivation
    await db.collection('activityLog').add({
        type: 'candidate_reactivated',
        candidateId,
        candidateName: `${candidateData.firstName} ${candidateData.lastName}`,
        reactivatedBy: request.auth.uid,
        applicationCount: (candidateData.applicationCount || 1) + 1,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`Candidate reactivated: ${candidateId} (${candidateData.firstName} ${candidateData.lastName}) - Application #${(candidateData.applicationCount || 1) + 1}`);
    return {
        success: true,
        message: 'Candidate reactivated successfully',
        applicationCount: (candidateData.applicationCount || 1) + 1,
    };
});
/**
 * Permanently delete a candidate (hard delete)
 * Only for super admins, and only after archiving
 */
exports.permanentlyDeleteCandidate = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { candidateId, confirmDelete } = request.data;
    if (!candidateId || !confirmDelete) {
        throw new https_1.HttpsError('invalid-argument', 'Candidate ID and confirmation required');
    }
    // Only super admins can permanently delete
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    const userData = userDoc.data();
    if (!userData || userData.role !== 'super_admin') {
        throw new https_1.HttpsError('permission-denied', 'Only super admins can permanently delete candidates');
    }
    const candidateRef = db.collection('candidates').doc(candidateId);
    const candidateDoc = await candidateRef.get();
    if (!candidateDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Candidate not found');
    }
    const candidateData = candidateDoc.data();
    // Must be archived first
    if (!candidateData.archived) {
        throw new https_1.HttpsError('failed-precondition', 'Candidate must be archived before permanent deletion');
    }
    // Delete all related interviews
    const interviewsSnapshot = await db
        .collection('interviews')
        .where('candidateId', '==', candidateId)
        .get();
    // Delete all booking links
    const bookingLinksSnapshot = await db
        .collection('bookingLinks')
        .where('candidateId', '==', candidateId)
        .get();
    // Perform deletions in a batch
    const batch = db.batch();
    interviewsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    bookingLinksSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    batch.delete(candidateRef);
    await batch.commit();
    // Log the permanent deletion
    await db.collection('activityLog').add({
        type: 'candidate_permanently_deleted',
        candidateId,
        candidateName: `${candidateData.firstName} ${candidateData.lastName}`,
        deletedBy: request.auth.uid,
        interviewsDeleted: interviewsSnapshot.size,
        bookingLinksDeleted: bookingLinksSnapshot.size,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`Candidate permanently deleted: ${candidateId} (${candidateData.firstName} ${candidateData.lastName})`);
    return {
        success: true,
        message: 'Candidate permanently deleted',
        interviewsDeleted: interviewsSnapshot.size,
        bookingLinksDeleted: bookingLinksSnapshot.size,
    };
});
/**
 * When a candidate is permanently deleted (via direct Firestore delete),
 * clean up all their associated data
 */
exports.onCandidateDeleted = (0, firestore_1.onDocumentDeleted)({
    document: 'candidates/{candidateId}',
    region: 'europe-west2',
}, async (event) => {
    const candidateId = event.params.candidateId;
    const candidateData = event.data?.data();
    console.log(`Candidate deleted: ${candidateId} (${candidateData?.firstName} ${candidateData?.lastName})`);
    // Find all interviews for this candidate
    const interviewsSnapshot = await db
        .collection('interviews')
        .where('candidateId', '==', candidateId)
        .get();
    if (interviewsSnapshot.empty) {
        console.log(`No interviews found for candidate ${candidateId}`);
    }
    else {
        console.log(`Found ${interviewsSnapshot.size} interviews to delete for candidate ${candidateId}`);
        // Delete in batches
        const batch = db.batch();
        interviewsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        console.log(`Successfully deleted ${interviewsSnapshot.size} interviews for candidate ${candidateId}`);
    }
    // Also delete any booking links for this candidate
    const bookingLinksSnapshot = await db
        .collection('bookingLinks')
        .where('candidateId', '==', candidateId)
        .get();
    if (!bookingLinksSnapshot.empty) {
        const linkBatch = db.batch();
        bookingLinksSnapshot.docs.forEach(doc => linkBatch.delete(doc.ref));
        await linkBatch.commit();
        console.log(`Deleted ${bookingLinksSnapshot.size} booking links for candidate ${candidateId}`);
    }
    // Log the cascade deletion in activity log
    await db.collection('activityLog').add({
        type: 'cascade_deletion',
        candidateId,
        candidateName: candidateData ? `${candidateData.firstName} ${candidateData.lastName}` : 'Unknown',
        interviewsDeleted: interviewsSnapshot.size,
        bookingLinksDeleted: bookingLinksSnapshot.size,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
});
//# sourceMappingURL=cascadeDeletion.js.map
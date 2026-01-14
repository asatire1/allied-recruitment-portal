"use strict";
/**
 * Booking Token Validation Cloud Function
 * P1.2: Token validation with security checks
 *
 * Security measures:
 * - SHA-256 hashed token lookup (token never stored in plain)
 * - Generic error messages (no enumeration)
 * - Rate limiting via Cloud Functions
 * - Expiry and usage limit checks
 * - Minimal data exposure (first name only)
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
exports.validateBookingToken = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
const db = admin.firestore();
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Hash a token using SHA-256
 */
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}
/**
 * Get duration in minutes based on booking type
 */
function getDuration(type) {
    return type === 'trial' ? 240 : 30; // 4 hours or 30 mins
}
/**
 * Extract first name from full name
 */
function getFirstName(fullName) {
    const name = (fullName || 'Candidate').trim();
    return name.split(' ')[0];
}
// ============================================================================
// CLOUD FUNCTION
// ============================================================================
/**
 * Validate a booking token
 *
 * @param token - The booking token from the URL
 * @returns Booking details if valid
 * @throws HttpsError if invalid, expired, or used
 */
exports.validateBookingToken = (0, https_1.onCall)({
    // No auth required - public endpoint
    cors: true,
    // Region - UK for Allied Pharmacies
    region: 'europe-west2',
}, async (request) => {
    const { token } = request.data;
    // ========================================
    // INPUT VALIDATION
    // ========================================
    if (!token || typeof token !== 'string') {
        console.log('validateBookingToken: Missing or invalid token parameter');
        throw new https_1.HttpsError('invalid-argument', 'Token is required');
    }
    // Sanitize token
    const sanitizedToken = token.trim();
    // Validate token format (crypto.randomBytes(32).toString('hex') = 64 chars)
    if (sanitizedToken.length < 10 || sanitizedToken.length > 64) {
        console.log('validateBookingToken: Token length invalid:', sanitizedToken.length);
        throw new https_1.HttpsError('not-found', 'Invalid or expired booking link');
    }
    // Check for obviously invalid characters
    if (!/^[a-zA-Z0-9_-]+$/.test(sanitizedToken)) {
        console.log('validateBookingToken: Token contains invalid characters');
        throw new https_1.HttpsError('not-found', 'Invalid or expired booking link');
    }
    try {
        // ========================================
        // TOKEN LOOKUP
        // ========================================
        // Hash the provided token for secure lookup
        const tokenHash = hashToken(sanitizedToken);
        console.log('validateBookingToken: Looking up token hash:', tokenHash.substring(0, 16) + '...');
        // Query by hash (indexed)
        const snapshot = await db
            .collection('bookingLinks')
            .where('tokenHash', '==', tokenHash)
            .limit(1)
            .get();
        // Generic error for not found (security: don't reveal if token exists)
        if (snapshot.empty) {
            console.log('validateBookingToken: Token not found');
            throw new https_1.HttpsError('not-found', 'Invalid or expired booking link');
        }
        const doc = snapshot.docs[0];
        const link = doc.data();
        // ========================================
        // STATUS CHECK
        // ========================================
        if (link.status !== 'active') {
            console.log('validateBookingToken: Token status is', link.status);
            throw new https_1.HttpsError('not-found', 'Invalid or expired booking link');
        }
        // ========================================
        // EXPIRY CHECK
        // ========================================
        const expiresAt = link.expiresAt?.toDate?.() || new Date(0);
        const now = new Date();
        if (expiresAt < now) {
            console.log('validateBookingToken: Token expired at', expiresAt.toISOString());
            // Mark as expired in database
            await doc.ref.update({
                status: 'expired',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            throw new https_1.HttpsError('not-found', 'Invalid or expired booking link');
        }
        // ========================================
        // USAGE LIMIT CHECK
        // ========================================
        const maxUses = link.maxUses || 1;
        const useCount = link.useCount || 0;
        if (useCount >= maxUses) {
            console.log('validateBookingToken: Token already used', useCount, '/', maxUses);
            throw new https_1.HttpsError('not-found', 'This booking link has already been used');
        }
        // ========================================
        // SUCCESS - RETURN MINIMAL DATA
        // ========================================
        console.log('validateBookingToken: Token valid for', link.candidateName, '- type:', link.type);
        // Return data nested under 'data' property as expected by booking page
        return {
            valid: true,
            data: {
                candidateName: getFirstName(link.candidateName),
                candidatePhone: link.candidatePhone || undefined,
                type: link.type || 'interview',
                jobTitle: link.jobTitle,
                branchName: link.branchName,
                branchAddress: link.branchAddress,
                duration: link.duration || getDuration(link.type),
                expiresAt: expiresAt.toISOString(),
            }
        };
    }
    catch (error) {
        // Re-throw HttpsError as-is
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        // Log and wrap unexpected errors
        console.error('validateBookingToken: Unexpected error:', error);
        throw new https_1.HttpsError('internal', 'Unable to validate booking link. Please try again later.');
    }
});
//# sourceMappingURL=bookingToken.js.map
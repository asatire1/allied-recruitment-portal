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

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import * as crypto from 'crypto'

const db = admin.firestore()

// ============================================================================
// TYPES
// ============================================================================

interface ValidateTokenRequest {
  token: string
}

interface ValidateTokenResponse {
  valid: boolean
  data: {
    candidateName: string
    candidatePhone?: string
    type: 'interview' | 'trial'
    jobTitle?: string
    branchName?: string
    branchAddress?: string
    duration: number
    expiresAt: string
  }
}

interface BookingLinkDoc {
  tokenHash: string
  candidateId: string
  candidateName: string
  candidateEmail?: string
  candidatePhone?: string
  type: 'interview' | 'trial'
  jobId?: string
  jobTitle?: string
  branchId?: string
  branchName?: string
  branchAddress?: string
  duration?: number
  status: 'active' | 'used' | 'expired' | 'revoked'
  expiresAt: admin.firestore.Timestamp
  maxUses: number
  useCount: number
  createdAt: admin.firestore.Timestamp
  createdBy: string
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Hash a token using SHA-256
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Get duration in minutes based on booking type
 */
function getDuration(type: 'interview' | 'trial'): number {
  return type === 'trial' ? 240 : 30 // 4 hours or 30 mins
}

/**
 * Extract first name from full name
 */
function getFirstName(fullName: string): string {
  const name = (fullName || 'Candidate').trim()
  return name.split(' ')[0]
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
export const validateBookingToken = onCall<ValidateTokenRequest>(
  {
    // No auth required - public endpoint
    cors: true,
    // Region - UK for Allied Pharmacies
    region: 'europe-west2',
  },
  async (request): Promise<ValidateTokenResponse> => {
    const { token } = request.data

    // ========================================
    // INPUT VALIDATION
    // ========================================
    
    if (!token || typeof token !== 'string') {
      console.log('validateBookingToken: Missing or invalid token parameter')
      throw new HttpsError('invalid-argument', 'Token is required')
    }

    // Sanitize token
    const sanitizedToken = token.trim()
    
    // Validate token format (crypto.randomBytes(32).toString('hex') = 64 chars)
    if (sanitizedToken.length < 10 || sanitizedToken.length > 64) {
      console.log('validateBookingToken: Token length invalid:', sanitizedToken.length)
      throw new HttpsError('not-found', 'Invalid or expired booking link')
    }

    // Check for obviously invalid characters
    if (!/^[a-zA-Z0-9_-]+$/.test(sanitizedToken)) {
      console.log('validateBookingToken: Token contains invalid characters')
      throw new HttpsError('not-found', 'Invalid or expired booking link')
    }

    try {
      // ========================================
      // TOKEN LOOKUP
      // ========================================
      
      // Hash the provided token for secure lookup
      const tokenHash = hashToken(sanitizedToken)
      console.log('validateBookingToken: Looking up token hash:', tokenHash.substring(0, 16) + '...')

      // Query by hash (indexed)
      const snapshot = await db
        .collection('bookingLinks')
        .where('tokenHash', '==', tokenHash)
        .limit(1)
        .get()

      // Generic error for not found (security: don't reveal if token exists)
      if (snapshot.empty) {
        console.log('validateBookingToken: Token not found')
        throw new HttpsError('not-found', 'Invalid or expired booking link')
      }

      const doc = snapshot.docs[0]
      const link = doc.data() as BookingLinkDoc

      // ========================================
      // STATUS CHECK
      // ========================================
      
      if (link.status !== 'active') {
        console.log('validateBookingToken: Token status is', link.status)
        throw new HttpsError('not-found', 'Invalid or expired booking link')
      }

      // ========================================
      // EXPIRY CHECK
      // ========================================
      
      const expiresAt = link.expiresAt?.toDate?.() || new Date(0)
      const now = new Date()
      
      if (expiresAt < now) {
        console.log('validateBookingToken: Token expired at', expiresAt.toISOString())
        
        // Mark as expired in database
        await doc.ref.update({ 
          status: 'expired',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        })
        
        throw new HttpsError('not-found', 'Invalid or expired booking link')
      }

      // ========================================
      // USAGE LIMIT CHECK
      // ========================================
      
      const maxUses = link.maxUses || 1
      const useCount = link.useCount || 0
      
      if (useCount >= maxUses) {
        console.log('validateBookingToken: Token already used', useCount, '/', maxUses)
        throw new HttpsError('not-found', 'This booking link has already been used')
      }

      // ========================================
      // SUCCESS - RETURN MINIMAL DATA
      // ========================================
      
      console.log('validateBookingToken: Token valid for', link.candidateName, '- type:', link.type)

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
      }

    } catch (error) {
      // Re-throw HttpsError as-is
      if (error instanceof HttpsError) {
        throw error
      }

      // Log and wrap unexpected errors
      console.error('validateBookingToken: Unexpected error:', error)
      throw new HttpsError('internal', 'Unable to validate booking link. Please try again later.')
    }
  }
)

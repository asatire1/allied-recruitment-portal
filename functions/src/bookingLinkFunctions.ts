/**
 * Booking Link Functions
 * Creates and manages booking links for interview/trial invitations
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import * as crypto from 'crypto'

const db = admin.firestore()

// ============================================================================
// TYPES
// ============================================================================

interface CreateBookingLinkRequest {
  candidateId: string
  candidateName: string
  candidateEmail: string
  type: 'interview' | 'trial'
  branchId?: string
  branchName?: string
  duration?: number
  expiresInDays?: number
  maxUses?: number
}

interface CreateBookingLinkResponse {
  success: boolean
  bookingLink?: string
  token?: string
  expiresAt?: string
  error?: string
}

// ============================================================================
// CREATE BOOKING LINK
// ============================================================================

/**
 * Create a booking link for a candidate to self-schedule an interview or trial
 */
export const createBookingLink = onCall<CreateBookingLinkRequest, Promise<CreateBookingLinkResponse>>(
  {
    cors: true,
    region: 'europe-west2',
    timeoutSeconds: 30,
    memory: '256MiB',
    enforceAppCheck: false,
  },
  async (request) => {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const {
      candidateId,
      candidateName,
      candidateEmail,
      type,
      branchId,
      branchName,
      duration,
      expiresInDays = 7,
      maxUses = 1,
    } = request.data

    // Validate required fields
    if (!candidateId || !candidateName || !type) {
      throw new HttpsError('invalid-argument', 'Missing required fields: candidateId, candidateName, type')
    }

    if (!['interview', 'trial'].includes(type)) {
      throw new HttpsError('invalid-argument', 'Type must be "interview" or "trial"')
    }

    console.log(`Creating ${type} booking link for candidate: ${candidateName} (${candidateId})`)

    try {
      // Get duration from settings if not provided
      let slotDuration = duration
      if (!slotDuration) {
        if (type === 'trial') {
          // Trials are always 4 hours
          slotDuration = 240
        } else {
          // Get interview duration from settings
          try {
            const settingsDoc = await db.collection('settings').doc('interviewAvailability').get()
            if (settingsDoc.exists) {
              slotDuration = settingsDoc.data()?.slotDuration || 30
              console.log(`Using slot duration from settings: ${slotDuration} minutes`)
            } else {
              slotDuration = 30
            }
          } catch (error) {
            console.error('Failed to get slot duration from settings:', error)
            slotDuration = 30
          }
        }
      }

      // Generate secure random token
      const token = crypto.randomBytes(32).toString('hex')

      // Hash the token for storage (we only store the hash)
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

      // Calculate expiry date
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + expiresInDays)

      // Create booking link document
      const bookingLinkData = {
        candidateId,
        candidateName,
        candidateEmail: candidateEmail || null,
        type,
        branchId: branchId || null,
        branchName: branchName || null,
        duration: slotDuration,
        tokenHash,
        status: 'active',
        maxUses,
        useCount: 0,
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
      }

      const docRef = await db.collection('bookingLinks').add(bookingLinkData)
      console.log(`Booking link created with ID: ${docRef.id}`)

      // Update candidate with booking link reference
      await db.collection('candidates').doc(candidateId).update({
        [`${type}BookingLinkId`]: docRef.id,
        [`${type}BookingLinkCreatedAt`]: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      // Generate the full booking URL
      // The token is passed in the URL, not the hash
      const bookingLink = `https://allied-booking.web.app/book/${token}`

      console.log(`Booking link generated successfully for ${candidateName}`)

      return {
        success: true,
        bookingLink,
        url: bookingLink,  // Alias for frontend compatibility
        token,
        expiresAt: expiresAt.toISOString(),
      }
    } catch (error) {
      console.error('Error creating booking link:', error)
      
      if (error instanceof HttpsError) {
        throw error
      }
      
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new HttpsError('internal', `Failed to create booking link: ${message}`)
    }
  }
)

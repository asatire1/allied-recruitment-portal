/**
 * Booking Service
 * Handles token validation and booking operations
 */

import { httpsCallable } from 'firebase/functions'
import { functionsEU } from '../lib/firebase'

// ============================================================================
// TYPES
// ============================================================================

export interface BookingLinkData {
  valid: boolean
  candidateName: string
  candidatePhone?: string  // Added for WhatsApp confirmation
  type: 'interview' | 'trial'
  jobTitle?: string
  branchName?: string
  branchAddress?: string
  duration: number
  expiresAt: string
}

export interface ValidationError {
  code: 'invalid' | 'expired' | 'used' | 'rate-limited' | 'error'
  message: string
}

export type ValidationResult = 
  | { success: true; data: BookingLinkData }
  | { success: false; error: ValidationError }

// ============================================================================
// TOKEN VALIDATION
// ============================================================================

/**
 * Validate a booking token
 * Calls the Cloud Function to securely validate
 */
export async function validateBookingToken(token: string): Promise<ValidationResult> {
  try {
    const validateToken = httpsCallable<{ token: string }, { valid: boolean; data?: BookingLinkData; error?: string }>(
      functionsEU,
      'validateBookingToken'
    )
    
    const result = await validateToken({ token })
    const response = result.data
    
    if (response.valid && response.data) {
      return {
        success: true,
        data: {
          ...response.data,
          valid: true
        }
      }
    } else {
      return {
        success: false,
        error: {
          code: 'invalid',
          message: response.error || 'Invalid booking link.'
        }
      }
    }
  } catch (error: unknown) {
    console.error('Token validation error:', error)
    
    // Parse Firebase error
    const firebaseError = error as { code?: string; message?: string }
    const errorCode = firebaseError.code || ''
    const errorMessage = firebaseError.message || ''
    
    // Handle specific error codes
    if (errorCode === 'functions/not-found' || errorCode.includes('not-found')) {
      return {
        success: false,
        error: {
          code: 'invalid',
          message: 'This booking link is invalid or has expired.'
        }
      }
    }
    
    if (errorCode === 'functions/resource-exhausted' || errorCode.includes('resource-exhausted')) {
      return {
        success: false,
        error: {
          code: 'rate-limited',
          message: 'Too many requests. Please wait a moment and try again.'
        }
      }
    }
    
    if (errorCode === 'functions/invalid-argument' || errorCode.includes('invalid-argument')) {
      return {
        success: false,
        error: {
          code: 'invalid',
          message: 'Invalid booking link format.'
        }
      }
    }
    
    // Check error message for hints
    if (errorMessage.includes('already been used')) {
      return {
        success: false,
        error: {
          code: 'used',
          message: 'This booking link has already been used.'
        }
      }
    }
    
    // Generic error
    return {
      success: false,
      error: {
        code: 'error',
        message: 'Unable to validate booking link. Please try again later.'
      }
    }
  }
}

/**
 * Extract token from URL
 * Supports both query param and path formats
 */
export function extractTokenFromUrl(): string | null {
  // Check query parameter: ?token=xxx
  const params = new URLSearchParams(window.location.search)
  const queryToken = params.get('token')
  if (queryToken) return queryToken
  
  // Check path format: /book/xxx
  const pathMatch = window.location.pathname.match(/\/book\/([a-zA-Z0-9_-]+)/)
  if (pathMatch) return pathMatch[1]
  
  return null
}

// ============================================================================
// BOOKING SUBMISSION (P2.6)
// ============================================================================

export interface SubmitBookingRequest {
  token: string
  date: string      // ISO date string
  time: string      // "09:00"
}

export interface SubmitBookingResponse {
  teamsJoinUrl?: string
  success: boolean
  interviewId: string
  confirmationCode: string
}

export interface SubmitBookingError {
  code: 'conflict' | 'expired' | 'used' | 'invalid' | 'error'
  message: string
}

export type SubmitBookingResult =
  | { success: true; data: SubmitBookingResponse }
  | { success: false; error: SubmitBookingError }

/**
 * Submit a booking
 * P2.6: Create interview record, mark link used
 */
export async function submitBooking(
  token: string,
  date: Date,
  time: string
): Promise<SubmitBookingResult> {
  try {
    const submitBookingFn = httpsCallable<SubmitBookingRequest, SubmitBookingResponse>(
      functionsEU,
      'submitBooking'
    )
    
    const result = await submitBookingFn({
      token,
      date: date.toISOString().split('T')[0],
      time
    })
    
    return {
      success: true,
      data: result.data
    }
  } catch (error: unknown) {
    console.error('Booking submission error:', error)
    
    const firebaseError = error as { code?: string; message?: string }
    const errorCode = firebaseError.code || ''
    const errorMessage = firebaseError.message || ''
    
    // Handle specific errors
    if (errorCode.includes('already-exists') || errorMessage.includes('conflict')) {
      return {
        success: false,
        error: {
          code: 'conflict',
          message: 'This time slot has just been booked by someone else. Please select another time.'
        }
      }
    }
    
    if (errorCode.includes('not-found') || errorMessage.includes('expired')) {
      return {
        success: false,
        error: {
          code: 'expired',
          message: 'This booking link has expired. Please request a new link.'
        }
      }
    }
    
    if (errorMessage.includes('already been used')) {
      return {
        success: false,
        error: {
          code: 'used',
          message: 'This booking link has already been used.'
        }
      }
    }
    
    return {
      success: false,
      error: {
        code: 'error',
        message: 'Unable to complete booking. Please try again.'
      }
    }
  }
}

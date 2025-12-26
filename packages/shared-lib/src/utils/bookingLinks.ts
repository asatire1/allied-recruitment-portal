/**
 * Booking Link Utilities
 * 
 * NOTE: The primary booking link generation is done via Cloud Function
 * (functions/src/index.ts -> createBookingLink) for better security.
 * 
 * This module provides:
 * - Client-side helpers for URL formatting
 * - Types for booking link data
 * - Utility functions that may be useful for the public booking page
 */

import { 
  collection, 
  query, 
  where, 
  getDocs,
  updateDoc,
  doc,
  Timestamp,
  type Firestore
} from 'firebase/firestore'

// ============================================================================
// Types
// ============================================================================

export type BookingLinkType = 'interview' | 'trial'
export type BookingLinkStatus = 'active' | 'used' | 'expired' | 'revoked'

export interface BookingLinkData {
  candidateId: string
  candidateName: string
  candidateEmail?: string
  type: BookingLinkType
  jobId?: string
  jobTitle?: string
  location?: string
  expiryDays?: number  // Default: 3 days
  maxUses?: number     // Default: 1
}

export interface BookingLink {
  id: string
  tokenHash: string
  candidateId: string
  candidateName: string
  candidateEmail?: string
  type: BookingLinkType
  jobId?: string
  jobTitle?: string
  location?: string
  status: BookingLinkStatus
  expiresAt: Timestamp
  maxUses: number
  useCount: number
  requireEmailVerification: boolean
  createdAt: Timestamp
  createdBy: string
}

export interface CreateBookingLinkResult {
  id: string
  token: string
  url: string
  expiresAt: Date
}

// ============================================================================
// URL Helpers (Client-side utilities)
// ============================================================================

/**
 * Get the base booking URL from environment or default
 */
export function getBookingBaseUrl(): string {
  // In production, this would come from environment config
  // For GitHub Pages deployment:
  if (typeof window !== 'undefined' && window.location.hostname.includes('github.io')) {
    return `${window.location.origin}/allied-recruitment-portal/#/book`
  }
  
  return 'https://alliedpharmacies.com/book'
}

/**
 * Format a booking link for display (shortened)
 */
export function formatBookingLinkForDisplay(url: string): string {
  try {
    const parsed = new URL(url)
    const token = parsed.pathname.split('/').pop() || ''
    return `${parsed.host}/...${token.substring(token.length - 6)}`
  } catch {
    return url.substring(0, 40) + '...'
  }
}

// ============================================================================
// Client-side Token Utilities (for public booking page)
// ============================================================================

/**
 * Hash a token using Web Crypto API (browser-compatible)
 * Used by the public booking page to validate tokens locally before API call
 */
export async function hashTokenClient(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(token)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Get all active booking links for a candidate
 * Useful for showing existing links before generating new ones
 */
export async function getCandidateBookingLinks(
  db: Firestore,
  candidateId: string
): Promise<BookingLink[]> {
  const q = query(
    collection(db, 'bookingLinks'),
    where('candidateId', '==', candidateId),
    where('status', '==', 'active')
  )
  
  const snapshot = await getDocs(q)
  
  return snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data(),
  })) as BookingLink[]
}

/**
 * Revoke a booking link (client-side, for admin use)
 */
export async function revokeBookingLink(
  db: Firestore,
  linkId: string
): Promise<void> {
  const linkRef = doc(db, 'bookingLinks', linkId)
  await updateDoc(linkRef, { status: 'revoked' })
}

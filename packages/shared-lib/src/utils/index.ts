// Utility functions for Allied Recruitment Portal

// Re-export duplicate detection module (excluding types that are in ../types)
export { 
  findDuplicates, 
  checkDuplicateMatch, 
  isLikelyDuplicate,
  normalizePhone as normalizePhoneForDuplicates,
  normalizeName,
  normalizeEmail,
  generateDuplicateKey,
  calculateStringSimilarity,
  calculateNameSimilarity,
  type DuplicateMatchType,
  type DuplicateCheckResult,
  type DuplicateCheckInput,
  type ExistingCandidateData,
  type DuplicateCheckResponse,
} from './duplicateDetection'

// Import checkDuplicateMatch for use in legacy wrapper
import { checkDuplicateMatch } from './duplicateDetection'

/**
 * Format UK phone number for display
 */
export function formatPhone(phone: string): string {
  if (!phone) return ''
  
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '')
  
  // Handle UK mobile (07xxx)
  if (digits.startsWith('07') && digits.length === 11) {
    return `${digits.slice(0, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`
  }
  
  // Handle UK landline with area code
  if (digits.startsWith('0') && digits.length === 11) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
  }
  
  // Handle +44 format
  if (digits.startsWith('44') && digits.length === 12) {
    return `+44 ${digits.slice(2, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`
  }
  
  return phone
}

/**
 * Normalize phone number for comparison/storage
 */
export function normalizePhone(phone: string): string {
  if (!phone) return ''
  
  // Remove all non-digits
  let digits = phone.replace(/\D/g, '')
  
  // Convert +44 to 0
  if (digits.startsWith('44')) {
    digits = '0' + digits.slice(2)
  }
  
  return digits
}

/**
 * Format UK postcode
 */
export function formatPostcode(postcode: string): string {
  if (!postcode) return ''
  
  // Remove spaces and uppercase
  const clean = postcode.replace(/\s/g, '').toUpperCase()
  
  // Insert space before last 3 characters
  if (clean.length >= 5) {
    return `${clean.slice(0, -3)} ${clean.slice(-3)}`
  }
  
  return clean
}

/**
 * Validate UK postcode format
 */
export function isValidPostcode(postcode: string): boolean {
  const pattern = /^[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}$/i
  return pattern.test(postcode)
}

/**
 * Validate UK phone number
 */
export function isValidUKPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '')
  
  // UK mobile or landline starting with 0
  if (digits.startsWith('0') && digits.length === 11) return true
  
  // International format +44
  if (digits.startsWith('44') && digits.length === 12) return true
  
  return false
}

/**
 * Get initials from name
 */
export function getInitials(firstName: string, lastName: string): string {
  const first = firstName?.trim()?.[0] || ''
  const last = lastName?.trim()?.[0] || ''
  return (first + last).toUpperCase()
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Format date and time for display
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`
  if (diffHours < 24) return

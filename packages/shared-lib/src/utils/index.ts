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
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
  
  return formatDate(d)
}

/**
 * Capitalize first letter of each word
 */
export function titleCase(str: string): string {
  if (!str) return ''
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Truncate text with ellipsis
 */
export function truncate(str: string, length: number): string {
  if (!str || str.length <= length) return str
  return str.slice(0, length).trim() + '...'
}

/**
 * Generate a random ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

/**
 * Status display labels and colors
 */
export const STATUS_CONFIG = {
  new: { label: 'New', color: '#8b5cf6', bgColor: '#f5f3ff' },
  screening: { label: 'Screening', color: '#06b6d4', bgColor: '#ecfeff' },
  interview_scheduled: { label: 'Interview Scheduled', color: '#3b82f6', bgColor: '#eff6ff' },
  interview_complete: { label: 'Interview Complete', color: '#6366f1', bgColor: '#e0e7ff' },
  trial_scheduled: { label: 'Trial Scheduled', color: '#f59e0b', bgColor: '#fffbeb' },
  trial_complete: { label: 'Trial Complete', color: '#a855f7', bgColor: '#f3e8ff' },
  approved: { label: 'Approved', color: '#10b981', bgColor: '#ecfdf5' },
  rejected: { label: 'Rejected', color: '#ef4444', bgColor: '#fef2f2' },
  withdrawn: { label: 'Withdrawn', color: '#6b7280', bgColor: '#f3f4f6' },
} as const

// ============================================================================
// DUPLICATE DETECTION (Legacy exports for backwards compatibility)
// Full implementation in ./duplicateDetection.ts
// ============================================================================

// Legacy type - kept for backwards compatibility
export interface DuplicateMatch {
  candidateId: string
  matchType: 'exact' | 'email' | 'phone' | 'name_fuzzy' | 'partial'
  confidence: number
  matchedFields: string[]
}

/**
 * Legacy findDuplicates wrapper for backwards compatibility
 * @deprecated Use findDuplicates from duplicateDetection.ts for full functionality
 */
export function findDuplicatesLegacy(
  candidate: { firstName: string; lastName: string; phone: string; email: string; id?: string },
  existingCandidates: Array<{ id: string; firstName: string; lastName: string; phone: string; email: string; duplicateKey?: string }>
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = []
  
  for (const existing of existingCandidates) {
    const result = checkDuplicateMatch(
      { ...candidate, jobId: undefined, branchId: undefined },
      { ...existing, status: 'new', phoneNormalized: undefined }
    )
    
    if (result) {
      matches.push({
        candidateId: result.candidateId,
        matchType: result.matchType as DuplicateMatch['matchType'],
        confidence: result.confidence,
        matchedFields: result.matchedFields,
      })
    }
  }
  
  return matches.sort((a, b) => b.confidence - a.confidence)
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return pattern.test(email)
}

/**
 * Validate required string field
 */
export function isValidString(value: unknown, minLength = 1): boolean {
  return typeof value === 'string' && value.trim().length >= minLength
}

/**
 * Validate number in range
 */
export function isValidNumber(
  value: unknown,
  min?: number,
  max?: number
): boolean {
  if (typeof value !== 'number' || isNaN(value)) return false
  if (min !== undefined && value < min) return false
  if (max !== undefined && value > max) return false
  return true
}

// ============================================================================
// CURRENCY & SALARY FORMATTING
// ============================================================================

/**
 * Format salary for display
 */
export function formatSalary(
  amount: number,
  period: 'hourly' | 'annual' = 'annual'
): string {
  const formatter = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: period === 'hourly' ? 2 : 0,
    maximumFractionDigits: period === 'hourly' ? 2 : 0,
  })
  
  return formatter.format(amount)
}

/**
 * Format salary range for display
 */
export function formatSalaryRange(
  min: number | undefined,
  max: number | undefined,
  period: 'hourly' | 'annual' = 'annual'
): string {
  if (!min && !max) return 'Competitive'
  
  const suffix = period === 'hourly' ? '/hr' : '/year'
  
  if (min && max) {
    if (min === max) {
      return `${formatSalary(min, period)}${suffix}`
    }
    return `${formatSalary(min, period)} - ${formatSalary(max, period)}${suffix}`
  }
  
  if (min) return `From ${formatSalary(min, period)}${suffix}`
  if (max) return `Up to ${formatSalary(max, period)}${suffix}`
  
  return 'Competitive'
}

// ============================================================================
// ARRAY UTILITIES
// ============================================================================

/**
 * Remove duplicates from array
 */
export function unique<T>(array: T[]): T[] {
  return [...new Set(array)]
}

/**
 * Group array by key
 */
export function groupBy<T, K extends string | number>(
  array: T[],
  keyFn: (item: T) => K
): Record<K, T[]> {
  return array.reduce((acc, item) => {
    const key = keyFn(item)
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {} as Record<K, T[]>)
}

/**
 * Sort array by key
 */
export function sortBy<T>(
  array: T[],
  keyFn: (item: T) => string | number | Date,
  direction: 'asc' | 'desc' = 'asc'
): T[] {
  const sorted = [...array].sort((a, b) => {
    const aVal = keyFn(a)
    const bVal = keyFn(b)
    
    if (aVal < bVal) return -1
    if (aVal > bVal) return 1
    return 0
  })
  
  return direction === 'desc' ? sorted.reverse() : sorted
}

// ============================================================================
// OBJECT UTILITIES
// ============================================================================

/**
 * Remove undefined values from object
 */
export function removeUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as T
}

/**
 * Pick specific keys from object
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  return keys.reduce((acc, key) => {
    if (key in obj) acc[key] = obj[key]
    return acc
  }, {} as Pick<T, K>)
}

/**
 * Omit specific keys from object
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj }
  keys.forEach((key) => delete result[key])
  return result
}

// ============================================================================
// ASYNC UTILITIES
// ============================================================================

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: Error | undefined
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      if (attempt < maxAttempts) {
        await sleep(baseDelayMs * Math.pow(2, attempt - 1))
      }
    }
  }
  
  throw lastError
}

// ============================================================================
// BOOKING LINKS
// NOTE: Primary booking link generation is via Cloud Function
// This module provides client-side helpers only
// Types BookingLinkStatus and BookingLink are in ../types/index.ts
// ============================================================================

export {
  type BookingLinkType,
  type BookingLinkData,
  type CreateBookingLinkResult,
  getBookingBaseUrl,
  formatBookingLinkForDisplay,
  hashTokenClient,
  getCandidateBookingLinks,
  revokeBookingLink,
} from './bookingLinks'

// ============================================================================
// WHATSAPP PLACEHOLDERS (Comprehensive module)
// Full implementation in ./placeholders.ts
// ============================================================================

export {
  type PlaceholderDefinition,
  type PlaceholderData,
  type PlaceholderResult,
  PLACEHOLDER_DEFINITIONS,
  PLACEHOLDER_MAP,
  extractPlaceholders as extractTemplatePlaceholders,
  extractPlaceholderKeys,
  replacePlaceholders as replaceTemplatePlaceholders,
  getMissingPlaceholders,
  validatePlaceholders,
  highlightPlaceholdersHTML,
  generateBookingLinkPlaceholder,
  usesBookingLink,
  prepareCandidateData,
  prepareInterviewData,
  combinePlaceholderData,
  formatPhoneForWhatsApp,
  generateWhatsAppURL,
  getPlaceholdersByCategory,
  getUnfilledSummary,
} from './placeholders'

// ============================================================================
// WHATSAPP UTILITIES (Legacy - kept for backwards compatibility)
// ============================================================================

/**
 * Generate WhatsApp URL for sending message
 * @deprecated Use generateWhatsAppURL from placeholders.ts for new code
 */
export function generateWhatsAppUrl(phone: string, message?: string): string {
  const normalizedPhone = normalizePhone(phone)
  
  let intlPhone = normalizedPhone
  if (normalizedPhone.startsWith('0')) {
    intlPhone = '44' + normalizedPhone.slice(1)
  }
  
  let url = `https://wa.me/${intlPhone}`
  
  if (message) {
    url += `?text=${encodeURIComponent(message)}`
  }
  
  return url
}

/**
 * Replace placeholders in template string
 * @deprecated Use replaceTemplatePlaceholders from placeholders.ts
 */
export function replacePlaceholders(
  template: string,
  values: Record<string, string | undefined>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return values[key] || match
  })
}

/**
 * Extract placeholder names from template
 * @deprecated Use extractTemplatePlaceholders from placeholders.ts
 */
export function extractPlaceholders(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g) || []
  return matches.map((match) => match.replace(/\{\{|\}\}/g, ''))
}

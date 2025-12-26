// ============================================================================
// Allied Recruitment Portal - Duplicate Detection Service
// Release 4.1: Comprehensive Duplicate Detection Logic
// ============================================================================

import type { Candidate, CandidateStatus, DuplicateStatus, DuplicateSeverity, DuplicateScenario } from '../types'

// Re-export types for convenience
export type { DuplicateSeverity, DuplicateScenario }

// ============================================================================
// TYPES
// ============================================================================

/** Match type classification */
export type DuplicateMatchType = 
  | 'exact'       // Name + Phone + Email all match
  | 'name_phone'  // Name + Phone match (primary detection)
  | 'email'       // Email match only
  | 'phone'       // Phone match with fuzzy name
  | 'name_fuzzy'  // Fuzzy name match with other indicators
  | 'partial'     // Partial match on multiple fields

/** Result from checking a single candidate */
export interface DuplicateCheckResult {
  candidateId: string
  matchType: DuplicateMatchType
  confidence: number           // 0-100
  severity: DuplicateSeverity
  matchedFields: string[]
  scenario: DuplicateScenario
  message: string              // Human-readable message
  daysSinceApplication: number
  existingCandidate: {
    id: string
    firstName: string
    lastName: string
    email: string
    phone: string
    status: CandidateStatus
    jobTitle?: string
    branchName?: string
    createdAt?: Date
    duplicateStatus?: DuplicateStatus
  }
}

/** Input for duplicate checking */
export interface DuplicateCheckInput {
  firstName: string
  lastName: string
  phone: string
  email: string
  jobId?: string
  branchId?: string
  id?: string // Current candidate ID (to exclude from matches)
}

/** Existing candidate data for comparison */
export interface ExistingCandidateData {
  id: string
  firstName: string
  lastName: string
  phone: string
  email: string
  phoneNormalized?: string
  duplicateKey?: string
  status: CandidateStatus
  jobId?: string
  jobTitle?: string
  branchId?: string
  branchName?: string
  createdAt?: any // Firestore Timestamp or Date
  duplicateStatus?: DuplicateStatus
}

/** Result from batch duplicate check */
export interface DuplicateCheckResponse {
  hasDuplicates: boolean
  matches: DuplicateCheckResult[]
  highestSeverity: DuplicateSeverity | null
  recommendedAction: 'block' | 'warn' | 'allow'
}

// ============================================================================
// NORMALIZATION FUNCTIONS
// ============================================================================

/**
 * Normalize phone number for comparison
 * Handles: +447123456789, 07123 456 789, 07123-456-789, (0)7123456789, etc.
 */
export function normalizePhone(phone: string): string {
  if (!phone) return ''
  
  // Remove all non-digits
  let digits = phone.replace(/\D/g, '')
  
  // Convert UK +44 to 0
  if (digits.startsWith('44') && digits.length >= 11) {
    digits = '0' + digits.substring(2)
  }
  
  // Handle common UK prefixes without leading 0
  if (digits.length === 10 && digits.startsWith('7')) {
    digits = '0' + digits
  }
  
  return digits
}

/**
 * Normalize name for comparison
 * Removes whitespace, special chars, lowercases
 */
export function normalizeName(name: string): string {
  if (!name) return ''
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '') // Remove non-alphanumeric
}

/**
 * Normalize email for comparison
 * Lowercases, trims, handles plus addressing
 */
export function normalizeEmail(email: string): string {
  if (!email) return ''
  let normalized = email.toLowerCase().trim()
  
  // Handle Gmail plus addressing (user+tag@gmail.com -> user@gmail.com)
  if (normalized.includes('@gmail.com') || normalized.includes('@googlemail.com')) {
    const [local, domain] = normalized.split('@')
    const cleanLocal = local.split('+')[0].replace(/\./g, '') // Remove dots and plus
    normalized = `${cleanLocal}@${domain}`
  }
  
  return normalized
}

/**
 * Generate duplicate key for fast matching
 * Format: normalized firstName|lastName|phone
 */
export function generateDuplicateKey(
  firstName: string,
  lastName: string,
  phone: string
): string {
  const normalizedFirst = normalizeName(firstName)
  const normalizedLast = normalizeName(lastName)
  const normalizedPhone = normalizePhone(phone)
  
  return `${normalizedFirst}|${normalizedLast}|${normalizedPhone}`
}

// ============================================================================
// STRING SIMILARITY FUNCTIONS
// ============================================================================

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length
  const n = str2.length
  
  if (m === 0) return n
  if (n === 0) return m
  
  // Create matrix
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0))
  
  // Initialize first row and column
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  
  // Fill matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j - 1] + 1, // substitution
          dp[i - 1][j] + 1,     // deletion
          dp[i][j - 1] + 1      // insertion
        )
      }
    }
  }
  
  return dp[m][n]
}

/**
 * Calculate similarity percentage between two strings (0-100)
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
  const s1 = normalizeName(str1)
  const s2 = normalizeName(str2)
  
  if (s1 === s2) return 100
  if (!s1 || !s2) return 0
  
  const distance = levenshteinDistance(s1, s2)
  const maxLen = Math.max(s1.length, s2.length)
  
  return Math.round((1 - distance / maxLen) * 100)
}

/**
 * Calculate name similarity with first/last name handling
 */
export function calculateNameSimilarity(
  firstName1: string,
  lastName1: string,
  firstName2: string,
  lastName2: string
): number {
  // Compare first + last as full name
  const fullName1 = `${normalizeName(firstName1)}${normalizeName(lastName1)}`
  const fullName2 = `${normalizeName(firstName2)}${normalizeName(lastName2)}`
  
  if (fullName1 === fullName2) return 100
  if (!fullName1 || !fullName2) return 0
  
  // Calculate full name similarity
  const fullNameSimilarity = calculateStringSimilarity(fullName1, fullName2)
  
  // Also check if names might be swapped
  const swappedName2 = `${normalizeName(lastName2)}${normalizeName(firstName2)}`
  const swappedSimilarity = calculateStringSimilarity(fullName1, swappedName2)
  
  // Return the better match
  return Math.max(fullNameSimilarity, swappedSimilarity)
}

// ============================================================================
// SCENARIO DETECTION
// ============================================================================

/**
 * Determine the duplicate scenario based on context
 */
function determineScenario(
  input: DuplicateCheckInput,
  existing: ExistingCandidateData
): DuplicateScenario {
  // Check if same job AND same location
  if (input.jobId && input.branchId) {
    if (input.jobId === existing.jobId && input.branchId === existing.branchId) {
      return 'same_job_same_location'
    }
    if (input.jobId === existing.jobId) {
      return 'same_job_diff_location'
    }
  }
  
  // Check previous outcomes
  if (existing.status === 'rejected') {
    return 'previously_rejected'
  }
  
  if (existing.status === 'approved') {
    return 'previously_hired'
  }
  
  // Different job application
  if (input.jobId && existing.jobId && input.jobId !== existing.jobId) {
    return 'different_job'
  }
  
  return 'general_duplicate'
}

/**
 * Get human-readable message for scenario
 */
function getScenarioMessage(scenario: DuplicateScenario, existing: ExistingCandidateData): string {
  const name = `${existing.firstName} ${existing.lastName}`
  
  switch (scenario) {
    case 'same_job_same_location':
      return `${name} has already applied for this exact role and location`
    case 'same_job_diff_location':
      return `${name} has applied for the same role at ${existing.branchName || 'another location'}`
    case 'different_job':
      return `${name} has a previous application on file for ${existing.jobTitle || 'a different role'}`
    case 'previously_rejected':
      return `${name} was previously rejected. Review history before proceeding.`
    case 'previously_hired':
      return `${name} is already employed at ${existing.branchName || 'a branch'}. This may be an internal transfer.`
    case 'general_duplicate':
    default:
      return `${name} may have applied before. Check existing record.`
  }
}

/**
 * Determine severity based on scenario and match type
 */
function determineSeverity(
  matchType: DuplicateMatchType,
  scenario: DuplicateScenario,
  confidence: number
): DuplicateSeverity {
  // High severity cases
  if (scenario === 'same_job_same_location') return 'high'
  if (scenario === 'previously_hired') return 'high'
  if (matchType === 'exact' && confidence >= 90) return 'high'
  
  // Medium severity cases
  if (scenario === 'same_job_diff_location') return 'medium'
  if (scenario === 'previously_rejected') return 'medium'
  if (matchType === 'name_phone' && confidence >= 80) return 'medium'
  if (matchType === 'email' && confidence >= 85) return 'medium'
  
  // Low severity for everything else
  return 'low'
}

/**
 * Determine recommended action based on matches
 */
function determineRecommendedAction(
  matches: DuplicateCheckResult[]
): 'block' | 'warn' | 'allow' {
  if (matches.length === 0) return 'allow'
  
  // Block if any high severity match for same job+location
  const hasBlocker = matches.some(m => 
    m.severity === 'high' && m.scenario === 'same_job_same_location'
  )
  if (hasBlocker) return 'block'
  
  // Warn for any high severity match or medium+ matches
  const hasHighSeverity = matches.some(m => m.severity === 'high')
  const hasMediumSeverity = matches.some(m => m.severity === 'medium')
  if (hasHighSeverity || hasMediumSeverity) return 'warn'
  
  // Allow with info for low severity
  return 'allow'
}

// ============================================================================
// MAIN DUPLICATE DETECTION FUNCTIONS
// ============================================================================

/**
 * Check a single candidate against one existing candidate
 */
export function checkDuplicateMatch(
  input: DuplicateCheckInput,
  existing: ExistingCandidateData
): DuplicateCheckResult | null {
  // Don't match with self
  if (input.id && input.id === existing.id) return null
  
  const matchedFields: string[] = []
  let matchType: DuplicateMatchType = 'partial'
  let confidence = 0
  
  // === PRIMARY CHECK: Duplicate Key Match (Name + Phone) ===
  const inputKey = generateDuplicateKey(input.firstName, input.lastName, input.phone)
  const existingKey = existing.duplicateKey || generateDuplicateKey(
    existing.firstName,
    existing.lastName,
    existing.phone
  )
  
  if (inputKey === existingKey && inputKey !== '||') {
    matchedFields.push('firstName', 'lastName', 'phone')
    matchType = 'name_phone'
    confidence = 100
  }
  
  // === PHONE CHECK ===
  const inputPhone = normalizePhone(input.phone)
  const existingPhone = existing.phoneNormalized || normalizePhone(existing.phone)
  
  if (inputPhone && existingPhone && inputPhone === existingPhone) {
    if (!matchedFields.includes('phone')) {
      matchedFields.push('phone')
    }
    if (matchType === 'partial') {
      matchType = 'phone'
      confidence = Math.max(confidence, 75)
    }
  }
  
  // === EMAIL CHECK ===
  const inputEmail = normalizeEmail(input.email)
  const existingEmail = normalizeEmail(existing.email)
  
  if (inputEmail && existingEmail && inputEmail === existingEmail) {
    matchedFields.push('email')
    if (matchType === 'partial') {
      matchType = 'email'
      confidence = 85
    } else if (matchType === 'name_phone') {
      matchType = 'exact'
      confidence = 100
    } else {
      confidence = Math.max(confidence, 90)
    }
  }
  
  // === NAME SIMILARITY CHECK ===
  const nameSimilarity = calculateNameSimilarity(
    input.firstName,
    input.lastName,
    existing.firstName,
    existing.lastName
  )
  
  if (nameSimilarity >= 85) {
    if (!matchedFields.includes('firstName')) matchedFields.push('firstName')
    if (!matchedFields.includes('lastName')) matchedFields.push('lastName')
    
    if (matchType === 'partial') {
      matchType = 'name_fuzzy'
      confidence = nameSimilarity
    } else {
      // Boost confidence for phone/email matches with high name similarity
      confidence = Math.min(100, confidence + 10)
    }
  } else if (nameSimilarity >= 70 && matchedFields.length > 0) {
    // Moderate name match with other matching fields
    if (!matchedFields.includes('firstName')) matchedFields.push('firstName')
    if (!matchedFields.includes('lastName')) matchedFields.push('lastName')
    confidence = Math.min(100, confidence + 5)
  }
  
  // === MINIMUM MATCH THRESHOLD ===
  // Need either phone/email match OR very high name similarity
  if (matchedFields.length === 0) return null
  if (confidence < 50) return null
  
  // Only name fuzzy match without phone/email is not enough
  if (matchType === 'name_fuzzy' && !matchedFields.includes('phone') && !matchedFields.includes('email')) {
    if (confidence < 90) return null
  }
  
  // === BUILD RESULT ===
  const scenario = determineScenario(input, existing)
  const severity = determineSeverity(matchType, scenario, confidence)
  const message = getScenarioMessage(scenario, existing)
  
  // Calculate days since application
  let daysSinceApplication = 0
  if (existing.createdAt) {
    const createdDate = existing.createdAt.toDate 
      ? existing.createdAt.toDate() 
      : new Date(existing.createdAt)
    daysSinceApplication = Math.floor(
      (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
    )
  }
  
  return {
    candidateId: existing.id,
    matchType,
    confidence,
    severity,
    matchedFields: [...new Set(matchedFields)],
    scenario,
    message,
    daysSinceApplication,
    existingCandidate: {
      id: existing.id,
      firstName: existing.firstName,
      lastName: existing.lastName,
      email: existing.email,
      phone: existing.phone,
      status: existing.status,
      jobTitle: existing.jobTitle,
      branchName: existing.branchName,
      createdAt: existing.createdAt?.toDate ? existing.createdAt.toDate() : existing.createdAt,
      duplicateStatus: existing.duplicateStatus,
    },
  }
}

/**
 * Find all potential duplicates for a candidate
 */
export function findDuplicates(
  input: DuplicateCheckInput,
  existingCandidates: ExistingCandidateData[]
): DuplicateCheckResponse {
  const matches: DuplicateCheckResult[] = []
  
  for (const existing of existingCandidates) {
    const match = checkDuplicateMatch(input, existing)
    if (match) {
      matches.push(match)
    }
  }
  
  // Sort by confidence (highest first), then by severity
  matches.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 }
    if (a.severity !== b.severity) {
      return severityOrder[a.severity] - severityOrder[b.severity]
    }
    return b.confidence - a.confidence
  })
  
  const highestSeverity = matches.length > 0 
    ? matches[0].severity 
    : null
  
  const recommendedAction = determineRecommendedAction(matches)
  
  return {
    hasDuplicates: matches.length > 0,
    matches,
    highestSeverity,
    recommendedAction,
  }
}

/**
 * Quick check if a candidate is likely a duplicate
 * Returns true if any match found with confidence >= 70
 */
export function isLikelyDuplicate(
  input: DuplicateCheckInput,
  existingCandidates: ExistingCandidateData[]
): boolean {
  for (const existing of existingCandidates) {
    const match = checkDuplicateMatch(input, existing)
    if (match && match.confidence >= 70) {
      return true
    }
  }
  return false
}

/**
 * Generate a unique duplicate check ID for caching
 */
export function generateDuplicateCheckId(input: DuplicateCheckInput): string {
  return generateDuplicateKey(input.firstName, input.lastName, input.phone) + 
    '|' + normalizeEmail(input.email)
}

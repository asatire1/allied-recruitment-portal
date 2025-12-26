/**
 * WhatsApp Template Placeholder System
 * 
 * Handles placeholder replacement, validation, and booking link generation
 * for WhatsApp message templates.
 */

// ============================================================================
// Types
// ============================================================================

export interface PlaceholderDefinition {
  key: string           // e.g., '{{firstName}}'
  label: string         // e.g., 'First Name'
  description: string   // e.g., 'Candidate first name'
  required?: boolean    // Whether this placeholder must be filled
  category?: 'candidate' | 'job' | 'interview' | 'branch' | 'system'
}

export interface PlaceholderData {
  // Candidate fields
  firstName?: string
  lastName?: string
  fullName?: string
  email?: string
  phone?: string
  
  // Job fields
  jobTitle?: string
  companyName?: string
  
  // Branch fields
  branchName?: string
  branchAddress?: string
  
  // Interview fields
  interviewDate?: string    // Formatted date string
  interviewTime?: string    // Formatted time string
  interviewLocation?: string
  
  // System-generated
  interviewBookingLink?: string
  
  // Allow custom placeholders
  [key: string]: string | undefined
}

export interface PlaceholderResult {
  text: string                          // Final text with replacements
  replacedCount: number                 // Number of placeholders replaced
  unfilledPlaceholders: string[]        // Placeholders that couldn't be filled
  allFilled: boolean                    // Whether all placeholders were filled
}

// ============================================================================
// Placeholder Definitions
// ============================================================================

export const PLACEHOLDER_DEFINITIONS: PlaceholderDefinition[] = [
  // Candidate category
  { 
    key: '{{firstName}}', 
    label: 'First Name', 
    description: 'Candidate first name',
    required: true,
    category: 'candidate'
  },
  { 
    key: '{{lastName}}', 
    label: 'Last Name', 
    description: 'Candidate last name',
    category: 'candidate'
  },
  { 
    key: '{{fullName}}', 
    label: 'Full Name', 
    description: 'Candidate full name',
    category: 'candidate'
  },
  
  // Job category
  { 
    key: '{{jobTitle}}', 
    label: 'Job Title', 
    description: 'Applied position',
    category: 'job'
  },
  { 
    key: '{{companyName}}', 
    label: 'Company Name', 
    description: 'Entity name (Allied Pharmacies, etc.)',
    category: 'job'
  },
  
  // Branch category
  { 
    key: '{{branchName}}', 
    label: 'Branch Name', 
    description: 'Branch/location name',
    category: 'branch'
  },
  { 
    key: '{{branchAddress}}', 
    label: 'Branch Address', 
    description: 'Branch full address',
    category: 'branch'
  },
  
  // Interview category
  { 
    key: '{{interviewDate}}', 
    label: 'Interview Date', 
    description: 'Scheduled date (e.g., Monday, 15th January)',
    category: 'interview'
  },
  { 
    key: '{{interviewTime}}', 
    label: 'Interview Time', 
    description: 'Scheduled time (e.g., 2:00 PM)',
    category: 'interview'
  },
  
  // System category
  { 
    key: '{{interviewBookingLink}}', 
    label: 'Booking Link', 
    description: 'Self-service interview booking URL',
    category: 'system'
  },
]

// Quick lookup map
export const PLACEHOLDER_MAP = new Map(
  PLACEHOLDER_DEFINITIONS.map(p => [p.key, p])
)

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Extract all placeholders from a template string
 */
export function extractPlaceholders(template: string): string[] {
  const regex = /\{\{(\w+)\}\}/g
  const matches = template.match(regex) || []
  // Return unique placeholders (without the braces for the key name)
  return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))]
}

/**
 * Extract placeholders with their full key format
 */
export function extractPlaceholderKeys(template: string): string[] {
  const regex = /\{\{(\w+)\}\}/g
  const matches = template.match(regex) || []
  return [...new Set(matches)]
}

/**
 * Replace placeholders in a template with actual data
 */
export function replacePlaceholders(
  template: string, 
  data: PlaceholderData
): PlaceholderResult {
  const placeholders = extractPlaceholders(template)
  const unfilled: string[] = []
  let replacedCount = 0
  
  let result = template
  
  for (const placeholder of placeholders) {
    const key = `{{${placeholder}}}`
    const value = data[placeholder]
    
    if (value !== undefined && value !== null && value !== '') {
      result = result.replace(new RegExp(escapeRegex(key), 'g'), value)
      replacedCount++
    } else {
      unfilled.push(key)
    }
  }
  
  return {
    text: result,
    replacedCount,
    unfilledPlaceholders: unfilled,
    allFilled: unfilled.length === 0
  }
}

/**
 * Check which placeholders in a template are missing from the provided data
 */
export function getMissingPlaceholders(
  template: string,
  data: PlaceholderData
): PlaceholderDefinition[] {
  const placeholders = extractPlaceholderKeys(template)
  const missing: PlaceholderDefinition[] = []
  
  for (const key of placeholders) {
    const fieldName = key.replace(/\{\{|\}\}/g, '')
    const value = data[fieldName]
    
    if (value === undefined || value === null || value === '') {
      const definition = PLACEHOLDER_MAP.get(key)
      if (definition) {
        missing.push(definition)
      } else {
        // Custom placeholder not in our definitions
        missing.push({
          key,
          label: fieldName,
          description: 'Custom placeholder'
        })
      }
    }
  }
  
  return missing
}

/**
 * Validate that all required placeholders have data
 */
export function validatePlaceholders(
  template: string,
  data: PlaceholderData
): { valid: boolean; errors: string[] } {
  const placeholders = extractPlaceholderKeys(template)
  const errors: string[] = []
  
  for (const key of placeholders) {
    const definition = PLACEHOLDER_MAP.get(key)
    const fieldName = key.replace(/\{\{|\}\}/g, '')
    const value = data[fieldName]
    
    if (definition?.required && (!value || value === '')) {
      errors.push(`${definition.label} is required`)
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Highlight placeholders in content for display
 * Returns HTML with span elements around placeholders
 */
export function highlightPlaceholdersHTML(
  content: string,
  options: {
    filledClass?: string
    unfilledClass?: string
    data?: PlaceholderData
  } = {}
): string {
  const { 
    filledClass = 'placeholder-filled', 
    unfilledClass = 'placeholder-unfilled',
    data 
  } = options
  
  return content.replace(/\{\{(\w+)\}\}/g, (match, fieldName) => {
    const isFilled = data ? (data[fieldName] !== undefined && data[fieldName] !== '') : false
    const className = isFilled ? filledClass : unfilledClass
    return `<span class="${className}">${match}</span>`
  })
}

// ============================================================================
// Booking Link Generation
// ============================================================================

/**
 * Generate a booking link URL
 * Note: In production, this should call a Cloud Function that generates
 * a secure token and stores it in Firestore
 */
export function generateBookingLinkPlaceholder(
  candidateId: string,
  type: 'interview' | 'trial' = 'interview'
): string {
  // This is a placeholder URL format
  // The actual implementation will use Cloud Functions to generate secure tokens
  return `https://book.alliedpharmacies.com/${type}/${candidateId}`
}

/**
 * Check if a template uses the booking link placeholder
 */
export function usesBookingLink(template: string): boolean {
  return template.includes('{{interviewBookingLink}}')
}

// ============================================================================
// Data Preparation Helpers
// ============================================================================

/**
 * Prepare placeholder data from a candidate object
 */
export function prepareCandidateData(candidate: {
  firstName?: string
  lastName?: string
  name?: string
  email?: string
  phone?: string
  jobTitle?: string
  entity?: string
}): Partial<PlaceholderData> {
  const firstName = candidate.firstName || candidate.name?.split(' ')[0] || ''
  const lastName = candidate.lastName || candidate.name?.split(' ').slice(1).join(' ') || ''
  
  return {
    firstName,
    lastName,
    fullName: candidate.name || `${firstName} ${lastName}`.trim(),
    email: candidate.email,
    phone: candidate.phone,
    jobTitle: candidate.jobTitle,
    companyName: candidate.entity || 'Allied Pharmacies',
  }
}

/**
 * Prepare placeholder data from an interview object
 */
export function prepareInterviewData(interview: {
  date?: Date | string
  time?: string
  location?: string
  branchName?: string
  branchAddress?: string
}): Partial<PlaceholderData> {
  let formattedDate = ''
  let formattedTime = interview.time || ''
  
  if (interview.date) {
    const date = interview.date instanceof Date ? interview.date : new Date(interview.date)
    formattedDate = date.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
    
    // If no separate time provided, extract from date
    if (!formattedTime && date.getHours() !== 0) {
      formattedTime = date.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit'
      })
    }
  }
  
  return {
    interviewDate: formattedDate,
    interviewTime: formattedTime,
    interviewLocation: interview.location,
    branchName: interview.branchName,
    branchAddress: interview.branchAddress,
  }
}

/**
 * Combine multiple data sources into a single PlaceholderData object
 */
export function combinePlaceholderData(
  ...sources: Partial<PlaceholderData>[]
): PlaceholderData {
  return Object.assign({}, ...sources)
}

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format a phone number for WhatsApp (remove spaces, ensure country code)
 */
export function formatPhoneForWhatsApp(phone: string, defaultCountryCode = '44'): string {
  // Remove all non-numeric characters except +
  let cleaned = phone.replace(/[^\d+]/g, '')
  
  // Remove leading + if present
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1)
  }
  
  // If starts with 0, replace with country code
  if (cleaned.startsWith('0')) {
    cleaned = defaultCountryCode + cleaned.substring(1)
  }
  
  // If no country code, add default
  if (!cleaned.startsWith(defaultCountryCode) && cleaned.length <= 10) {
    cleaned = defaultCountryCode + cleaned
  }
  
  return cleaned
}

/**
 * Generate a WhatsApp URL for sending a message
 */
export function generateWhatsAppURL(phone: string, message: string): string {
  const formattedPhone = formatPhoneForWhatsApp(phone)
  const encodedMessage = encodeURIComponent(message)
  return `https://wa.me/${formattedPhone}?text=${encodedMessage}`
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Escape special regex characters in a string
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Get placeholder definitions grouped by category
 */
export function getPlaceholdersByCategory(): Record<string, PlaceholderDefinition[]> {
  const grouped: Record<string, PlaceholderDefinition[]> = {}
  
  for (const def of PLACEHOLDER_DEFINITIONS) {
    const category = def.category || 'other'
    if (!grouped[category]) {
      grouped[category] = []
    }
    grouped[category].push(def)
  }
  
  return grouped
}

/**
 * Get a human-readable summary of unfilled placeholders
 */
export function getUnfilledSummary(unfilled: string[]): string {
  if (unfilled.length === 0) return ''
  
  const labels = unfilled.map(key => {
    const def = PLACEHOLDER_MAP.get(key)
    return def?.label || key.replace(/\{\{|\}\}/g, '')
  })
  
  if (labels.length === 1) {
    return `Missing: ${labels[0]}`
  }
  
  return `Missing: ${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}

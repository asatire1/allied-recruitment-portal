/**
 * Status Utilities
 * Helper functions for status labels and CSS classes
 * Import this in Candidates.tsx, Jobs.tsx, Interviews.tsx
 */

// ============================================================================
// CANDIDATE STATUSES
// ============================================================================

export const CANDIDATE_STATUSES = [
  { value: 'new', label: 'New', color: '#3b82f6' },
  { value: 'invite_sent', label: 'Invite Sent', color: '#f97316' },
  { value: 'shortlisted', label: 'Shortlisted', color: '#6366f1' },
  { value: 'interview_scheduled', label: 'Interview Scheduled', color: '#06b6d4' },
  { value: 'interview_complete', label: 'Interview Complete', color: '#0ea5e9' },
  { value: 'interview_completed', label: 'Interview Completed', color: '#0ea5e9' },
  { value: 'trial_invited', label: 'Trial Invited', color: '#d946ef' },
  { value: 'trial_scheduled', label: 'Trial Scheduled', color: '#8b5cf6' },
  { value: 'trial_complete', label: 'Trial Complete', color: '#a78bfa' },
  { value: 'trial_completed', label: 'Trial Completed', color: '#a78bfa' },
  { value: 'approved', label: 'Approved', color: '#22c55e' },
  { value: 'offered', label: 'Offered', color: '#f59e0b' },
  { value: 'hired', label: 'Hired', color: '#22c55e' },
  { value: 'rejected', label: 'Rejected', color: '#ef4444' },
  { value: 'withdrawn', label: 'Withdrawn', color: '#9ca3af' },
  { value: 'on_hold', label: 'On Hold', color: '#eab308' },
  // Legacy - keep for backward compatibility but map to invite_sent
  { value: 'screening', label: 'Invite Sent', color: '#f97316' },
] as const

export type CandidateStatus = typeof CANDIDATE_STATUSES[number]['value']

// ============================================================================
// JOB STATUSES
// ============================================================================

export const JOB_STATUSES = [
  { value: 'draft', label: 'Draft', color: '#9ca3af' },
  { value: 'open', label: 'Open', color: '#22c55e' },
  { value: 'active', label: 'Active', color: '#22c55e' },
  { value: 'paused', label: 'Paused', color: '#f59e0b' },
  { value: 'closed', label: 'Closed', color: '#3b82f6' },
  { value: 'filled', label: 'Filled', color: '#3b82f6' },
  { value: 'cancelled', label: 'Cancelled', color: '#ef4444' },
] as const

export type JobStatus = typeof JOB_STATUSES[number]['value']

// ============================================================================
// INTERVIEW STATUSES
// ============================================================================

export const INTERVIEW_STATUSES = [
  { value: 'scheduled', label: 'Scheduled', color: '#06b6d4' },
  { value: 'confirmed', label: 'Confirmed', color: '#3b82f6' },
  { value: 'in_progress', label: 'In Progress', color: '#6366f1' },
  { value: 'completed', label: 'Completed', color: '#22c55e' },
  { value: 'cancelled', label: 'Cancelled', color: '#ef4444' },
  { value: 'no_show', label: 'No Show', color: '#ef4444' },
  { value: 'rescheduled', label: 'Rescheduled', color: '#8b5cf6' },
] as const

export type InterviewStatus = typeof INTERVIEW_STATUSES[number]['value']

// ============================================================================
// BOOKING LINK STATUSES
// ============================================================================

export const BOOKING_LINK_STATUSES = [
  { value: 'active', label: 'Active', color: '#22c55e' },
  { value: 'used', label: 'Used', color: '#3b82f6' },
  { value: 'expired', label: 'Expired', color: '#9ca3af' },
  { value: 'cancelled', label: 'Cancelled', color: '#ef4444' },
] as const

export type BookingLinkStatus = typeof BOOKING_LINK_STATUSES[number]['value']

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the display label for a status
 */
export function getStatusLabel(status: string): string {
  // Check all status arrays
  const allStatuses = [
    ...CANDIDATE_STATUSES,
    ...JOB_STATUSES,
    ...INTERVIEW_STATUSES,
    ...BOOKING_LINK_STATUSES,
  ]
  
  const found = allStatuses.find(s => s.value === status)
  if (found) return found.label
  
  // Fallback: convert snake_case to Title Case
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Get the CSS class for a status badge
 * Use like: className={`status-badge ${getStatusClass(status)}`}
 */
export function getStatusClass(status: string): string {
  return `status-${status.replace(/_/g, '-')}`
}

/**
 * Get the color for a status (for inline styles or charts)
 */
export function getStatusColor(status: string): string {
  const allStatuses = [
    ...CANDIDATE_STATUSES,
    ...JOB_STATUSES,
    ...INTERVIEW_STATUSES,
    ...BOOKING_LINK_STATUSES,
  ]
  
  const found = allStatuses.find(s => s.value === status)
  return found?.color || '#6b7280' // Default gray
}

/**
 * Check if a status is considered "negative" (rejected, withdrawn, cancelled, no_show)
 */
export function isNegativeStatus(status: string): boolean {
  return ['rejected', 'withdrawn', 'cancelled', 'canceled', 'no_show'].includes(status)
}

/**
 * Check if a status is considered "positive" (hired, completed, filled)
 */
export function isPositiveStatus(status: string): boolean {
  return ['hired', 'completed', 'filled', 'accepted'].includes(status)
}

/**
 * Check if a status indicates the candidate is "active" in the pipeline
 */
export function isActiveStatus(status: string): boolean {
  return [
    'new',
    'shortlisted',
    'invite_sent',
    'interview_scheduled',
    'interview_completed',
    'trial_invited',
    'trial_scheduled',
    'trial_completed',
    'offered',
  ].includes(status)
}

/**
 * Get candidate statuses for filter dropdown
 */
export function getCandidateStatusOptions() {
  return CANDIDATE_STATUSES.map(s => ({
    value: s.value,
    label: s.label,
  }))
}

/**
 * Get job statuses for filter dropdown
 */
export function getJobStatusOptions() {
  return JOB_STATUSES.map(s => ({
    value: s.value,
    label: s.label,
  }))
}

/**
 * Get interview statuses for filter dropdown
 */
export function getInterviewStatusOptions() {
  return INTERVIEW_STATUSES.map(s => ({
    value: s.value,
    label: s.label,
  }))
}

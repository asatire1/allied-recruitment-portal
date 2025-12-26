import { useState } from 'react'
import { Button } from './Button'
import { Badge } from './Badge'

// Local type definitions (to avoid circular dependency with shared-lib)
type CandidateStatus = 'new' | 'screening' | 'interview_scheduled' | 'interview_complete' | 'trial_scheduled' | 'trial_complete' | 'approved' | 'rejected' | 'withdrawn'
type DuplicateSeverity = 'high' | 'medium' | 'low'
type DuplicateScenario = 'same_job_same_location' | 'same_job_diff_location' | 'different_job' | 'previously_rejected' | 'previously_hired' | 'general_duplicate'

// ============================================================================
// TYPES
// ============================================================================

export interface DuplicateCandidate {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  status: CandidateStatus
  jobTitle?: string
  branchName?: string
  createdAt?: Date
}

export interface DuplicateMatchInfo {
  candidateId: string
  matchType: 'exact' | 'name_phone' | 'email' | 'phone' | 'name_fuzzy' | 'partial'
  confidence: number
  severity: DuplicateSeverity
  matchedFields: string[]
  scenario: DuplicateScenario
  message: string
  daysSinceApplication: number
  candidate: DuplicateCandidate
}

interface DuplicateAlertBannerProps {
  matches: DuplicateMatchInfo[]
  onViewCandidate: (candidateId: string) => void
  onMerge: (candidateId: string) => void
  onLink: (candidateId: string) => void
  onMarkNotDuplicate: (candidateId: string) => void
  onDismiss: (candidateId: string) => void
  /** Recommended action from duplicate detection */
  recommendedAction?: 'block' | 'warn' | 'allow'
  /** Whether to show in compact mode */
  compact?: boolean
}

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  banner: {
    padding: '16px',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  bannerLow: {
    background: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
    border: '1px solid #0ea5e9',
  },
  bannerMedium: {
    background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
    border: '1px solid #f59e0b',
  },
  bannerHigh: {
    background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
    border: '1px solid #ef4444',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
  },
  icon: {
    fontSize: '20px',
  },
  title: {
    fontWeight: 600,
    fontSize: '14px',
    margin: 0,
  },
  titleLow: {
    color: '#0369a1',
  },
  titleMedium: {
    color: '#92400e',
  },
  titleHigh: {
    color: '#b91c1c',
  },
  recommendedAction: {
    marginLeft: 'auto',
    fontSize: '12px',
    padding: '4px 8px',
    borderRadius: '4px',
    fontWeight: 600,
  },
  actionBlock: {
    background: '#fef2f2',
    color: '#b91c1c',
    border: '1px solid #ef4444',
  },
  actionWarn: {
    background: '#fffbeb',
    color: '#92400e',
    border: '1px solid #f59e0b',
  },
  actionAllow: {
    background: '#f0fdf4',
    color: '#166534',
    border: '1px solid #22c55e',
  },
  matchList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  matchItem: {
    background: 'rgba(255, 255, 255, 0.8)',
    borderRadius: '6px',
    padding: '12px',
    border: '1px solid rgba(0, 0, 0, 0.1)',
  },
  matchHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  matchInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  candidateName: {
    fontWeight: 600,
    fontSize: '14px',
    color: '#1f2937',
  },
  matchTypeBadge: {
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '12px',
    fontWeight: 500,
  },
  severityBadge: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
  },
  confidenceBadge: {
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '12px',
    fontWeight: 600,
  },
  scenarioMessage: {
    fontSize: '13px',
    color: '#374151',
    fontStyle: 'italic' as const,
    marginBottom: '8px',
    padding: '8px',
    background: 'rgba(0, 0, 0, 0.03)',
    borderRadius: '4px',
  },
  candidateDetails: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
    fontSize: '12px',
    color: '#6b7280',
    marginBottom: '8px',
  },
  detail: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  matchedFieldsContainer: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px',
    marginBottom: '12px',
  },
  matchedFieldTag: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    background: '#e0e7ff',
    color: '#4338ca',
    fontWeight: 500,
  },
  actionHelp: {
    fontSize: '12px',
    color: '#6b7280',
    marginBottom: '8px',
    padding: '6px 10px',
    background: 'rgba(139, 92, 246, 0.08)',
    borderRadius: '4px',
    borderLeft: '3px solid #8b5cf6',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  daysAgo: {
    fontSize: '11px',
    color: '#9ca3af',
    marginLeft: '8px',
  },
}

// ============================================================================
// HELPERS
// ============================================================================

const getMatchTypeLabel = (matchType: DuplicateMatchInfo['matchType']): string => {
  switch (matchType) {
    case 'exact': return 'Exact Match'
    case 'name_phone': return 'Name + Phone'
    case 'email': return 'Email Match'
    case 'phone': return 'Phone Match'
    case 'name_fuzzy': return 'Similar Name'
    case 'partial': return 'Partial Match'
    default: return 'Match'
  }
}

const getMatchTypeColor = (matchType: DuplicateMatchInfo['matchType']): string => {
  switch (matchType) {
    case 'exact': return '#dc2626'
    case 'name_phone': return '#dc2626'
    case 'email': return '#7c3aed'
    case 'phone': return '#2563eb'
    case 'name_fuzzy': return '#d97706'
    case 'partial': return '#6b7280'
    default: return '#6b7280'
  }
}

const getSeverityColor = (severity: DuplicateSeverity): string => {
  switch (severity) {
    case 'high': return '#dc2626'
    case 'medium': return '#d97706'
    case 'low': return '#0ea5e9'
    default: return '#6b7280'
  }
}

const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 90) return '#dc2626'
  if (confidence >= 70) return '#d97706'
  return '#6b7280'
}

const getScenarioIcon = (scenario: DuplicateScenario): string => {
  switch (scenario) {
    case 'same_job_same_location': return '🔴'
    case 'same_job_diff_location': return '🟡'
    case 'previously_rejected': return '⛔'
    case 'previously_hired': return '👔'
    case 'different_job': return '📋'
    case 'general_duplicate': return '⚠️'
    default: return '⚠️'
  }
}

const formatDaysAgo = (days: number): string => {
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  return `${Math.floor(days / 365)} years ago`
}

const STATUS_COLORS: Record<CandidateStatus, string> = {
  new: 'info',
  screening: 'warning',
  interview_scheduled: 'info',
  interview_complete: 'info',
  trial_scheduled: 'warning',
  trial_complete: 'warning',
  approved: 'success',
  rejected: 'error',
  withdrawn: 'neutral',
}

// ============================================================================
// COMPONENT
// ============================================================================

export function DuplicateAlertBanner({
  matches,
  onViewCandidate,
  onMerge,
  onLink,
  onMarkNotDuplicate,
  onDismiss,
  recommendedAction,
  compact = false,
}: DuplicateAlertBannerProps) {
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(new Set())

  if (matches.length === 0) return null

  // Determine highest severity for banner styling
  const highestSeverity = matches.reduce<DuplicateSeverity>((highest, m) => {
    const order = { high: 2, medium: 1, low: 0 }
    const severity = m.severity || 'low'
    return order[severity] > order[highest] ? severity : highest
  }, 'low')

  const getBannerStyle = () => {
    const base = styles.banner
    switch (highestSeverity) {
      case 'high': return { ...base, ...styles.bannerHigh }
      case 'medium': return { ...base, ...styles.bannerMedium }
      default: return { ...base, ...styles.bannerLow }
    }
  }

  const getTitleStyle = () => {
    const base = styles.title
    switch (highestSeverity) {
      case 'high': return { ...base, ...styles.titleHigh }
      case 'medium': return { ...base, ...styles.titleMedium }
      default: return { ...base, ...styles.titleLow }
    }
  }

  const getActionBadgeStyle = () => {
    const base = styles.recommendedAction
    switch (recommendedAction) {
      case 'block': return { ...base, ...styles.actionBlock }
      case 'warn': return { ...base, ...styles.actionWarn }
      default: return { ...base, ...styles.actionAllow }
    }
  }

  const getActionLabel = () => {
    switch (recommendedAction) {
      case 'block': return '⛔ Review Required'
      case 'warn': return '⚠️ Caution'
      default: return '✓ Proceed with Care'
    }
  }

  const toggleExpand = (candidateId: string) => {
    setExpandedMatches(prev => {
      const next = new Set(prev)
      if (next.has(candidateId)) {
        next.delete(candidateId)
      } else {
        next.add(candidateId)
      }
      return next
    })
  }

  return (
    <div style={getBannerStyle()}>
      <div style={styles.header}>
        <span style={styles.icon}>
          {highestSeverity === 'high' ? '🚨' : highestSeverity === 'medium' ? '⚠️' : 'ℹ️'}
        </span>
        <h4 style={getTitleStyle()}>
          {matches.length === 1
            ? 'Potential duplicate found!'
            : `${matches.length} potential duplicates found!`}
        </h4>
        {recommendedAction && (
          <span style={getActionBadgeStyle()}>
            {getActionLabel()}
          </span>
        )}
      </div>

      <div style={styles.matchList}>
        {matches.map((match) => {
          const isExpanded = expandedMatches.has(match.candidateId) || !compact
          const severity = match.severity || 'low'
          
          return (
            <div key={match.candidateId} style={styles.matchItem}>
              <div style={styles.matchHeader}>
                <div style={styles.matchInfo}>
                  <span style={styles.candidateName}>
                    {match.candidate.firstName} {match.candidate.lastName}
                  </span>
                  <span
                    style={{
                      ...styles.severityBadge,
                      background: `${getSeverityColor(severity)}20`,
                      color: getSeverityColor(severity),
                    }}
                  >
                    {severity}
                  </span>
                  <span
                    style={{
                      ...styles.matchTypeBadge,
                      background: `${getMatchTypeColor(match.matchType)}20`,
                      color: getMatchTypeColor(match.matchType),
                    }}
                  >
                    {getMatchTypeLabel(match.matchType)}
                  </span>
                  <span
                    style={{
                      ...styles.confidenceBadge,
                      background: `${getConfidenceColor(match.confidence)}20`,
                      color: getConfidenceColor(match.confidence),
                    }}
                  >
                    {match.confidence}% match
                  </span>
                  {match.daysSinceApplication > 0 && (
                    <span style={styles.daysAgo}>
                      Applied {formatDaysAgo(match.daysSinceApplication)}
                    </span>
                  )}
                </div>
                {compact && (
                  <button
                    type="button"
                    onClick={() => toggleExpand(match.candidateId)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: '#6b7280',
                    }}
                  >
                    {isExpanded ? '▼' : '▶'}
                  </button>
                )}
              </div>

              {isExpanded && (
                <>
                  {/* Scenario message */}
                  {match.message && (
                    <div style={styles.scenarioMessage}>
                      {getScenarioIcon(match.scenario)} {match.message}
                    </div>
                  )}

                  <div style={styles.candidateDetails}>
                    <span style={styles.detail}>
                      📧 {match.candidate.email}
                    </span>
                    <span style={styles.detail}>
                      📱 {match.candidate.phone}
                    </span>
                    {match.candidate.jobTitle && (
                      <span style={styles.detail}>
                        💼 {match.candidate.jobTitle}
                      </span>
                    )}
                    {match.candidate.branchName && (
                      <span style={styles.detail}>
                        📍 {match.candidate.branchName}
                      </span>
                    )}
                    <Badge variant={STATUS_COLORS[match.candidate.status] as any}>
                      {match.candidate.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>

                  <div style={styles.matchedFieldsContainer}>
                    <span style={{ fontSize: '11px', color: '#6b7280', marginRight: '4px' }}>
                      Matched on:
                    </span>
                    {match.matchedFields.map((field) => (
                      <span key={field} style={styles.matchedFieldTag}>
                        {field}
                      </span>
                    ))}
                  </div>

                  {/* Action explanation based on scenario */}
                  <div style={styles.actionHelp}>
                    {match.scenario === 'same_job_same_location' ? (
                      <span>⚠️ Consider merging or reviewing before proceeding</span>
                    ) : match.scenario === 'previously_rejected' || match.scenario === 'previously_hired' ? (
                      <span>💡 Link records to track this person's application history</span>
                    ) : (
                      <span>💡 Link creates a new record connected to the existing one</span>
                    )}
                  </div>

                  <div style={styles.actions}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onViewCandidate(match.candidateId)}
                      title="Open existing record in new tab"
                    >
                      👁️ View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onMerge(match.candidateId)}
                      title="Combine data from both records into one"
                    >
                      🔀 Merge
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onLink(match.candidateId)}
                      title="Create new application record linked to existing candidate"
                      style={{ 
                        background: '#8b5cf6',
                        borderColor: '#8b5cf6',
                      }}
                    >
                      🔗 Link & Add
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onMarkNotDuplicate(match.candidateId)}
                      title="This is a different person - proceed with adding"
                    >
                      ✓ Not Same Person
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDismiss(match.candidateId)}
                      title="Dismiss this warning"
                    >
                      ✕
                    </Button>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default DuplicateAlertBanner

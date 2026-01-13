// ============================================================================
// Application History Component
// Extracted from CandidateDetail.tsx for better maintainability
// Location: apps/recruitment-portal/src/components/candidate/ApplicationHistory.tsx
// ============================================================================

import type { Candidate, CandidateStatus } from '@allied/shared-lib'
import { Card, Badge, Spinner } from '@allied/shared-ui'

// ============================================================================
// CONSTANTS
// ============================================================================

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
// HELPERS
// ============================================================================

const formatDate = (timestamp: any): string => {
  if (!timestamp) return '-'
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// ============================================================================
// TYPES
// ============================================================================

interface ApplicationHistoryProps {
  candidate: Candidate
  linkedCandidates: Candidate[]
  loading: boolean
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ApplicationHistory({ 
  candidate, 
  linkedCandidates, 
  loading 
}: ApplicationHistoryProps) {
  // Only show if there are linked records or application history
  const shouldShow = linkedCandidates.length > 0 || 
                     candidate.applicationHistory?.length > 0 || 
                     candidate.duplicateStatus

  if (!shouldShow) return null

  return (
    <Card className="application-history-card">
      <div className="application-history-header">
        <h2>📋 Application History</h2>
        {candidate.duplicateStatus && (
          <Badge variant={candidate.duplicateStatus === 'primary' ? 'success' : 'info'}>
            {candidate.duplicateStatus === 'primary' ? '🔵 Primary Record' : '🔗 Linked Record'}
          </Badge>
        )}
      </div>
      
      {loading ? (
        <div className="application-history-loading">
          <Spinner size="sm" />
          <span>Loading application history...</span>
        </div>
      ) : (
        <div className="application-history-content">
          {/* Current Application */}
          <div className="application-timeline">
            <div className="application-item current">
              <div className="application-timeline-dot current" />
              <div className="application-card">
                <div className="application-card-header">
                  <span className="application-job">{candidate.jobTitle || 'Position not specified'}</span>
                  <Badge variant={STATUS_COLORS[candidate.status] as any} size="sm">
                    {candidate.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <div className="application-card-details">
                  <span className="application-detail">
                    📍 {candidate.branchName || candidate.location || 'Branch not specified'}
                  </span>
                  <span className="application-detail">📅 {formatDate(candidate.createdAt)}</span>
                  {candidate.source && (
                    <span className="application-detail">📥 via {candidate.source}</span>
                  )}
                </div>
                <div className="application-card-badge">
                  <span className="current-badge">Current Application</span>
                </div>
              </div>
            </div>

            {/* Linked Applications */}
            {linkedCandidates.map((linked) => (
              <div key={linked.id} className="application-item">
                <div className="application-timeline-dot" />
                <div 
                  className="application-card clickable"
                  onClick={() => window.open(`/candidates/${linked.id}`, '_blank')}
                  title="Click to view this application"
                >
                  <div className="application-card-header">
                    <span className="application-job">{linked.jobTitle || 'Position not specified'}</span>
                    <Badge variant={STATUS_COLORS[linked.status] as any} size="sm">
                      {linked.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <div className="application-card-details">
                    <span className="application-detail">
                      📍 {linked.branchName || linked.location || 'Branch not specified'}
                    </span>
                    <span className="application-detail">📅 {formatDate(linked.createdAt)}</span>
                    {linked.source && (
                      <span className="application-detail">📥 via {linked.source}</span>
                    )}
                  </div>
                  <div className="application-card-footer">
                    <span className="view-link">View Application →</span>
                  </div>
                </div>
              </div>
            ))}

            {/* Historical Application Records (from applicationHistory array) */}
            {candidate.applicationHistory?.filter(app => 
              !linkedCandidates.some(lc => lc.id === app.candidateId)
            ).map((app, index) => (
              <div key={`history-${index}`} className="application-item historical">
                <div className="application-timeline-dot historical" />
                <div className="application-card historical">
                  <div className="application-card-header">
                    <span className="application-job">{app.jobTitle || 'Position not specified'}</span>
                    <Badge variant={STATUS_COLORS[app.status as CandidateStatus] as any} size="sm">
                      {app.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <div className="application-card-details">
                    <span className="application-detail">
                      📍 {app.branchName || 'Branch not specified'}
                    </span>
                    <span className="application-detail">📅 {formatDate(app.appliedAt)}</span>
                  </div>
                  {app.outcome && (
                    <div className="application-outcome">
                      <Badge 
                        variant={
                          app.outcome === 'hired' ? 'success' : 
                          app.outcome === 'rejected' ? 'error' : 
                          'neutral'
                        }
                      >
                        {app.outcome}
                      </Badge>
                      {app.outcomeNotes && (
                        <span className="outcome-notes">{app.outcomeNotes}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {linkedCandidates.length === 0 && !candidate.applicationHistory?.length && (
            <p className="no-linked-records">
              This is the only application record for this candidate.
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

export default ApplicationHistory

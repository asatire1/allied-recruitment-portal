// ============================================================================
// Candidate Header Component
// Extracted from CandidateDetail.tsx for better maintainability
// Location: apps/recruitment-portal/src/components/candidate/CandidateHeader.tsx
// ============================================================================

import type { Candidate, CandidateStatus } from '@allied/shared-lib'
import { Badge, Button } from '@allied/shared-ui'

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

const getInitials = (firstName: string, lastName: string): string => {
  return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase()
}

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

interface CandidateHeaderProps {
  candidate: Candidate
  onChangeStatus: () => void
  onEdit: () => void
  onDelete: () => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CandidateHeader({ 
  candidate, 
  onChangeStatus, 
  onEdit, 
  onDelete 
}: CandidateHeaderProps) {
  return (
    <div className="candidate-header">
      <div className="candidate-avatar">
        {getInitials(candidate.firstName, candidate.lastName)}
      </div>
      <div className="candidate-header-info">
        <h1>{candidate.firstName} {candidate.lastName}</h1>
        <p className="candidate-job">{candidate.jobTitle || 'No job assigned'}</p>
        <div className="candidate-header-meta">
          <Badge variant={STATUS_COLORS[candidate.status] as any}>
            {candidate.status.replace(/_/g, ' ')}
          </Badge>
          {candidate.source && (
            <span className="source-tag">via {candidate.source}</span>
          )}
          <span className="applied-date">Applied {formatDate(candidate.createdAt)}</span>
        </div>
      </div>
      <div className="candidate-header-actions">
        <Button 
          variant="primary"
          onClick={onChangeStatus}
        >
          Change Status
        </Button>
        <Button variant="outline" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="danger" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  )
}

export default CandidateHeader

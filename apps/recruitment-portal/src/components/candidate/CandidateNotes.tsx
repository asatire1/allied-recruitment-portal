// ============================================================================
// Candidate Notes Component
// Extracted from CandidateDetail.tsx for better maintainability
// Location: apps/recruitment-portal/src/components/candidate/CandidateNotes.tsx
// ============================================================================

import type { Candidate } from '@allied/shared-lib'
import { Card } from '@allied/shared-ui'

// ============================================================================
// TYPES
// ============================================================================

interface CandidateNotesProps {
  candidate: Candidate
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CandidateNotes({ candidate }: CandidateNotesProps) {
  const hasCvSummary = candidate.cvParsedData?.summary
  const hasNotes = candidate.notes

  return (
    <Card className="detail-card">
      <h2>Notes</h2>
      
      {/* CV Summary from AI Parsing */}
      {hasCvSummary && (
        <div className="cv-summary-notes">
          <h4>📄 CV Summary</h4>
          <p>{candidate.cvParsedData!.summary}</p>
        </div>
      )}
      
      {/* User Notes */}
      {hasNotes ? (
        <div className="notes-content">
          <h4>📝 Notes</h4>
          <p>{candidate.notes}</p>
        </div>
      ) : !hasCvSummary ? (
        <div className="no-notes">
          <p>No notes added yet</p>
        </div>
      ) : null}
    </Card>
  )
}

export default CandidateNotes

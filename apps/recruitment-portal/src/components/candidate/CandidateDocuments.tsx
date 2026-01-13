// ============================================================================
// Candidate Documents Component (CV Upload/View/Parse)
// Extracted from CandidateDetail.tsx for better maintainability
// Location: apps/recruitment-portal/src/components/candidate/CandidateDocuments.tsx
// ============================================================================

import { useRef } from 'react'
import type { Candidate } from '@allied/shared-lib'
import { Card, Button, Spinner } from '@allied/shared-ui'

// ============================================================================
// TYPES
// ============================================================================

type ParseStatus = 'idle' | 'success' | 'error' | 'partial'

interface CandidateDocumentsProps {
  candidate: Candidate
  uploading: boolean
  parsing: boolean
  uploadProgress: string
  parseStatus: ParseStatus
  parseError: string | null
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
  onParse: () => void
  onDelete: () => void
  onManualEntry: () => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CandidateDocuments({ 
  candidate,
  uploading,
  parsing,
  uploadProgress,
  parseStatus,
  parseError,
  onUpload,
  onParse,
  onDelete,
  onManualEntry
}: CandidateDocumentsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const triggerFileUpload = () => {
    fileInputRef.current?.click()
  }

  return (
    <Card className="detail-card">
      <h2>CV / Resume</h2>
      
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={onUpload}
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={{ display: 'none' }}
      />
      
      {uploading || parsing ? (
        <div className="cv-uploading">
          <Spinner size="sm" />
          <span>{uploadProgress || 'Processing...'}</span>
        </div>
      ) : candidate.cvUrl ? (
        <div className="cv-section">
          <div className="cv-file">
            <span className="cv-icon">📄</span>
            <div className="cv-info">
              <span className="cv-filename">{candidate.cvFileName || 'CV Document'}</span>
              <span className="cv-meta">Click to view or download</span>
            </div>
            <div className="cv-actions">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.open(candidate.cvUrl, '_blank')}
              >
                View
              </Button>
              <Button 
                variant="primary" 
                size="sm"
                onClick={onParse}
                disabled={parsing}
              >
                🤖 Parse CV
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={triggerFileUpload}
              >
                Replace
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={onDelete}
              >
                🗑️
              </Button>
            </div>
          </div>
          
          {parseStatus !== 'idle' && (
            <div className={`parse-status parse-status-${parseStatus}`}>
              {parseStatus === 'success' && '✅ CV parsed successfully'}
              {parseStatus === 'partial' && '⚠️ CV parsed with low confidence - you may need to verify the extracted data'}
              {parseStatus === 'error' && (
                <div className="parse-error-container">
                  <div className="parse-error-message">
                    <span className="error-icon">❌</span>
                    <span>{parseError || 'CV parsing failed'}</span>
                  </div>
                  <div className="parse-error-actions">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={onParse}
                    >
                      🔄 Retry
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={onManualEntry}
                    >
                      Enter Manually
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="no-cv">
          <div className="upload-dropzone" onClick={triggerFileUpload}>
            <span className="upload-icon">📤</span>
            <p>Click to upload CV</p>
            <span className="upload-hint">PDF, DOC, DOCX (max 10MB)</span>
          </div>
        </div>
      )}
    </Card>
  )
}

export default CandidateDocuments

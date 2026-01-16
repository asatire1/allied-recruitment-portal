// ============================================================================
// CandidateDetail Page - Refactored
// Uses extracted components and hooks for better maintainability
// Original: 3,734 lines → Refactored: ~400 lines
// Location: apps/recruitment-portal/src/pages/CandidateDetail.tsx
// ============================================================================

import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Card, Badge, Spinner, Modal } from '@allied/shared-ui'
import type { Candidate, CandidateStatus } from '@allied/shared-lib'

// Hooks
import { 
  useCandidateData, 
  useCVOperations, 
  useModalState, 
  useExpandedSections 
} from '../hooks'

// Components
import {
  // Modals
  WhatsAppModal,
  EmailModal,
  ParsedCVModal,
  StatusChangeModal,
  EditCandidateModal,
  DeleteCandidateModal,
  // Page Sections
  CandidateHeader,
  ContactInfoCard,
  CandidateDocuments,
  CandidateNotes,
  CandidateFeedback,
  MeetingSummarySection,
  ActivityTimeline,
  ApplicationHistory,
  CandidateMessaging,
} from '../components/candidate'

import './CandidateDetail.css'

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
// COMPONENT
// ============================================================================

export function CandidateDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  // ========== HOOKS ==========
  
  // Data fetching
  const {
    candidate,
    setCandidate,
    loading,
    error,
    activities,
    loadingActivities,
    logActivity,
    linkedCandidates,
    loadingLinkedCandidates,
    latestInterview,
  } = useCandidateData({
    candidateId: id,
    userId: user?.id || '',
    userName: user?.displayName || user?.email || 'Unknown',
  })

  // CV operations
  const {
    uploading,
    uploadProgress,
    parsing,
    parseStatus,
    parsedData,
    parseError,
    handleCvUpload,
    handleParseCv,
    handleDeleteCv,
    handleApplyParsedData,
    showParsedModal,
    setShowParsedModal,
  } = useCVOperations({
    candidate,
    onCandidateUpdated: (updates) => {
      setCandidate(prev => prev ? { ...prev, ...updates } : null)
    },
    onLogActivity: logActivity,
  })

  // Modal states
  const modals = useModalState()

  // Expandable sections
  const sections = useExpandedSections()

  // ========== HANDLERS ==========

  const handleStatusChanged = (newStatus: CandidateStatus) => {
    setCandidate(prev => prev ? { ...prev, status: newStatus } : null)
  }

  const handleCandidateUpdated = (updates: Partial<Candidate>) => {
    setCandidate(prev => prev ? { ...prev, ...updates } : null)
  }

  const handleCall = () => {
    if (candidate?.phone) {
      window.location.href = `tel:${candidate.phone}`
    }
  }

  const handleManualEntry = () => {
    alert('You can manually edit the candidate details using the Edit button.')
  }

  // ========== LOADING & ERROR STATES ==========

  if (loading) {
    return (
      <div className="candidate-detail-loading">
        <Spinner size="lg" />
        <p>Loading candidate...</p>
      </div>
    )
  }

  if (error || !candidate) {
    return (
      <div className="candidate-detail-error">
        <div className="error-content">
          <span className="error-icon">⚠️</span>
          <h2>Error</h2>
          <p>{error || 'Candidate not found'}</p>
          <button onClick={() => navigate('/candidates')} className="back-btn">
            ← Back to Candidates
          </button>
        </div>
      </div>
    )
  }

  // ========== RENDER ==========

  return (
    <div className="candidate-detail">
      {/* Back Button */}
      <button onClick={() => navigate('/candidates')} className="back-link">
        ← Back to Candidates
      </button>

      {/* Header */}
      <CandidateHeader
        candidate={candidate}
        latestInterview={latestInterview}
        onChangeStatus={modals.openStatusModal}
        onEdit={modals.openEditModal}
        onDelete={modals.openDeleteModal}
      />

      {/* Content Grid */}
      <div className="candidate-content">
        {/* Left Column - Main Content */}
        <div className="candidate-main">
          {/* Contact Information */}
          <ContactInfoCard
            candidate={candidate}
            onCall={handleCall}
            onEmail={modals.openEmailModal}
            onWhatsApp={modals.openWhatsAppModal}
          />

          {/* Interview Feedback with Meeting Summary */}
          <CandidateFeedback
            candidate={candidate}
            expanded={sections.feedbackExpanded}
            onToggleExpand={sections.toggleFeedback}
            userId={user?.id || ''}
            userName={user?.displayName || user?.email || 'Unknown'}
            onLogActivity={logActivity}
            onCandidateUpdated={handleCandidateUpdated}
          >
            {/* Meeting Summary (nested inside feedback card) */}
            <MeetingSummarySection
              candidate={candidate}
              expanded={sections.meetingSummaryExpanded}
              onToggleExpand={sections.toggleMeetingSummary}
              latestInterview={latestInterview}
              onLogActivity={logActivity}
              onCandidateUpdated={handleCandidateUpdated}
            />
          </CandidateFeedback>

          {/* CV / Documents */}
          <CandidateDocuments
            candidate={candidate}
            uploading={uploading}
            parsing={parsing}
            uploadProgress={uploadProgress}
            parseStatus={parseStatus}
            parseError={parseError}
            onUpload={(e) => {
              const file = e.target.files?.[0]
              if (file) handleCvUpload(file)
            }}
            onParse={handleParseCv}
            onDelete={handleDeleteCv}
            onManualEntry={handleManualEntry}
          />

          {/* Notes */}
          <CandidateNotes candidate={candidate} />

          {/* Activity Timeline */}
          <ActivityTimeline
            activities={activities}
            loading={loadingActivities}
          />
        </div>

        {/* Right Column - Sidebar */}
        <div className="candidate-sidebar">
          {/* Messaging */}
          <CandidateMessaging
            candidateId={candidate.id}
            candidateName={candidate.name}
            candidateEmail={candidate.email}
          />

          {/* Skills */}
          {candidate.skills && candidate.skills.length > 0 && (
            <Card className="sidebar-card">
              <h3>Skills</h3>
              <div className="skills-list">
                {candidate.skills.map((skill, index) => (
                  <span key={index} className="skill-tag">{skill}</span>
                ))}
              </div>
            </Card>
          )}

          {/* Experience */}
          <Card className="sidebar-card">
            <h3>Experience</h3>
            <div className="experience-info">
              <div className="exp-item">
                <span className="exp-label">Years of Experience</span>
                <span className="exp-value">
                  {candidate.cvParsedData?.totalYearsExperience ?? candidate.yearsExperience ?? '-'}
                </span>
              </div>
              <div className="exp-item">
                <span className="exp-label">Pharmacy Experience</span>
                <span className="exp-value">
                  {candidate.cvParsedData?.pharmacyYearsExperience != null 
                    ? `${candidate.cvParsedData.pharmacyYearsExperience} years`
                    : candidate.pharmacyExperience === true ? 'Yes' 
                    : candidate.pharmacyExperience === false ? 'No' 
                    : '-'}
                </span>
              </div>
              <div className="exp-item">
                <span className="exp-label">Right to Work</span>
                <span className="exp-value">
                  {candidate.rightToWork === true ? 'Yes' : 
                   candidate.rightToWork === false ? 'No' : '-'}
                </span>
              </div>
            </div>
          </Card>

          {/* CV Summary */}
          {candidate.cvParsedData && (
            <Card className="sidebar-card cv-summary-card">
              <h3>CV Summary</h3>
              <div className="cv-summary">
                <div className="cv-parse-method">
                  {candidate.cvParsedData.usedAI === true ? (
                    <span className="parse-badge ai">🤖 AI Parsed</span>
                  ) : (
                    <span className="parse-badge regex">📝 Basic Parse</span>
                  )}
                </div>
                {(candidate.cvParsedData.totalYearsExperience != null || 
                  candidate.cvParsedData.pharmacyYearsExperience != null) && (
                  <div className="experience-stats">
                    {candidate.cvParsedData.totalYearsExperience != null && (
                      <div className="stat-item">
                        <span className="stat-value">{candidate.cvParsedData.totalYearsExperience}</span>
                        <span className="stat-label">Years Experience</span>
                      </div>
                    )}
                    {candidate.cvParsedData.pharmacyYearsExperience != null && (
                      <div className="stat-item">
                        <span className="stat-value">{candidate.cvParsedData.pharmacyYearsExperience}</span>
                        <span className="stat-label">Years in Pharmacy</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Timestamps */}
          <Card className="sidebar-card">
            <h3>Dates</h3>
            <div className="timestamps">
              <div className="timestamp-item">
                <span className="timestamp-label">Created</span>
                <span className="timestamp-value">{formatDateTime(candidate.createdAt)}</span>
              </div>
              <div className="timestamp-item">
                <span className="timestamp-label">Last Updated</span>
                <span className="timestamp-value">{formatDateTime(candidate.updatedAt)}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Application History */}
      <ApplicationHistory
        candidate={candidate}
        linkedCandidates={linkedCandidates}
        loading={loadingLinkedCandidates}
      />

      {/* ========== MODALS ========== */}

      {/* Status Change Modal */}
      <StatusChangeModal
        isOpen={modals.showStatusModal}
        onClose={modals.closeStatusModal}
        candidate={candidate}
        onStatusChanged={handleStatusChanged}
        onLogActivity={logActivity}
        onPromptRejectionEmail={modals.openEmailModal}
      />

      {/* Edit Candidate Modal */}
      <EditCandidateModal
        isOpen={modals.showEditModal}
        onClose={modals.closeEditModal}
        candidate={candidate}
        onCandidateUpdated={handleCandidateUpdated}
        onLogActivity={logActivity}
      />

      {/* Delete Candidate Modal */}
      <DeleteCandidateModal
        isOpen={modals.showDeleteModal}
        onClose={modals.closeDeleteModal}
        candidate={candidate}
        onLogActivity={logActivity}
      />

      {/* WhatsApp Modal */}
      <WhatsAppModal
        isOpen={modals.showWhatsAppModal}
        onClose={modals.closeWhatsAppModal}
        candidate={candidate}
        onLogActivity={logActivity}
      />

      {/* Email Modal */}
      <EmailModal
        isOpen={modals.showEmailModal}
        onClose={modals.closeEmailModal}
        candidate={candidate}
        onLogActivity={logActivity}
      />

      {/* Parsed CV Modal */}
      {showParsedModal && parsedData && (
        <Modal
          isOpen={showParsedModal}
          onClose={() => setShowParsedModal(false)}
          title="CV Parsed Successfully"
          size="lg"
        >
          <ParsedCVModal
            parsedData={parsedData}
            currentCandidate={candidate}
            onApply={handleApplyParsedData}
            onCancel={() => setShowParsedModal(false)}
            saving={false}
          />
        </Modal>
      )}
    </div>
  )
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const formatDateTime = (timestamp: any): string => {
  if (!timestamp) return '-'
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default CandidateDetail

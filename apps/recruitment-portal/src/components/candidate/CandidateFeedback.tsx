// ============================================================================
// Candidate Feedback Component
// Extracted from CandidateDetail.tsx for better maintainability
// Location: apps/recruitment-portal/src/components/candidate/CandidateFeedback.tsx
// ============================================================================

import { useState, useEffect } from 'react'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { getFirebaseDb, COLLECTIONS } from '@allied/shared-lib'
import type { Candidate, ActivityAction } from '@allied/shared-lib'
import { Card, Button, Textarea } from '@allied/shared-ui'

// ============================================================================
// TYPES
// ============================================================================

interface FeedbackEntry {
  id: string
  ratings: Record<string, number>
  notes: string
  submittedAt: any
  submittedBy: string
  submittedByName: string
}

interface CandidateFeedbackProps {
  candidate: Candidate
  expanded: boolean
  onToggleExpand: () => void
  userId: string
  userName: string
  onLogActivity: (
    entityId: string,
    action: ActivityAction,
    description: string
  ) => Promise<void>
  onCandidateUpdated: (updates: Partial<Candidate>) => void
  children?: React.ReactNode
}

// ============================================================================
// CONSTANTS
// ============================================================================

const FEEDBACK_CRITERIA = [
  { key: 'communication', label: 'Communication Skills', icon: '💬' },
  { key: 'experience', label: 'Relevant Experience', icon: '📋' },
  { key: 'attitude', label: 'Attitude & Enthusiasm', icon: '✨' },
  { key: 'availability', label: 'Availability & Flexibility', icon: '📅' },
  { key: 'overall', label: 'Overall Impression', icon: '⭐' },
]

// ============================================================================
// COMPONENT
// ============================================================================

export function CandidateFeedback({ 
  candidate, 
  expanded,
  onToggleExpand,
  userId,
  userName,
  onLogActivity,
  onCandidateUpdated,
  children
}: CandidateFeedbackProps) {
  const db = getFirebaseDb()
  
  // State
  const [feedbackRatings, setFeedbackRatings] = useState<Record<string, number>>({
    communication: 0,
    experience: 0,
    attitude: 0,
    availability: 0,
    overall: 0,
  })
  const [feedbackNotes, setFeedbackNotes] = useState('')
  const [savingFeedback, setSavingFeedback] = useState(false)
  const [feedbackSaved, setFeedbackSaved] = useState(false)
  const [allFeedbacks, setAllFeedbacks] = useState<FeedbackEntry[]>([])
  const [selectedFeedbackIndex, setSelectedFeedbackIndex] = useState<number | 'new'>('new')

  // Load existing feedbacks
  useEffect(() => {
    if (candidate.feedbacks && candidate.feedbacks.length > 0) {
      setAllFeedbacks(candidate.feedbacks)
    } else if (candidate.feedback) {
      // Legacy single feedback
      setAllFeedbacks([{
        id: 'legacy',
        ratings: candidate.feedback.ratings || {},
        notes: candidate.feedback.notes || '',
        submittedAt: candidate.feedback.submittedAt,
        submittedBy: candidate.feedback.submittedBy || '',
        submittedByName: candidate.feedback.submittedByName || 'Unknown',
      }])
    } else {
      setAllFeedbacks([])
    }
  }, [candidate.feedbacks, candidate.feedback])

  // Handle selecting a feedback tab
  const handleSelectFeedback = (index: number | 'new') => {
    setSelectedFeedbackIndex(index)
    
    if (index === 'new') {
      // Reset form for new entry
      setFeedbackRatings({
        communication: 0,
        experience: 0,
        attitude: 0,
        availability: 0,
        overall: 0,
      })
      setFeedbackNotes('')
      setFeedbackSaved(false)
    } else {
      // Load existing feedback data
      const fb = allFeedbacks[index]
      if (fb) {
        setFeedbackRatings(fb.ratings || {
          communication: 0,
          experience: 0,
          attitude: 0,
          availability: 0,
          overall: 0,
        })
        setFeedbackNotes(fb.notes || '')
      }
    }
  }

  // Save feedback
  const handleSaveFeedback = async () => {
    if (!candidate) return

    setSavingFeedback(true)
    try {
      const newFeedback: FeedbackEntry = {
        id: `feedback_${Date.now()}`,
        ratings: feedbackRatings,
        notes: feedbackNotes,
        submittedAt: new Date().toISOString(),
        submittedBy: userId,
        submittedByName: userName,
      }

      const existingFeedbacks = candidate.feedbacks || []
      const updatedFeedbacks = [...existingFeedbacks, newFeedback]

      await updateDoc(doc(db, COLLECTIONS.CANDIDATES, candidate.id), {
        feedbacks: updatedFeedbacks,
        // Keep legacy feedback field for backwards compatibility
        feedback: {
          ratings: feedbackRatings,
          notes: feedbackNotes,
          submittedAt: newFeedback.submittedAt,
          submittedBy: userId,
          submittedByName: userName,
        },
        updatedAt: serverTimestamp(),
      })

      // Log activity
      await onLogActivity(
        candidate.id,
        'feedback_submitted',
        `Submitted interview feedback (Overall: ${feedbackRatings.overall}/5)`
      )

      // Update local state
      setAllFeedbacks(updatedFeedbacks)
      onCandidateUpdated({ feedbacks: updatedFeedbacks })
      
      setFeedbackSaved(true)
      setTimeout(() => {
        setFeedbackSaved(false)
        // Reset form
        setFeedbackRatings({
          communication: 0,
          experience: 0,
          attitude: 0,
          availability: 0,
          overall: 0,
        })
        setFeedbackNotes('')
      }, 2000)
    } catch (err) {
      console.error('Error saving feedback:', err)
      alert('Failed to save feedback. Please try again.')
    } finally {
      setSavingFeedback(false)
    }
  }

  return (
    <Card className="detail-card feedback-card">
      <button 
        className={`section-toggle ${expanded ? 'expanded' : ''}`}
        onClick={onToggleExpand}
      >
        <div className="toggle-left">
          <span className="toggle-icon">📝</span>
          <span className="toggle-title">Interview Feedback</span>
          {allFeedbacks.length > 0 && (
            <span className="has-content-badge">
              {allFeedbacks.length} feedback{allFeedbacks.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <span className={`toggle-arrow ${expanded ? 'expanded' : ''}`}>
          ▼
        </span>
      </button>

      {expanded && (
        <div className="feedback-expanded-content">
          {/* Feedback Tabs */}
          {allFeedbacks.length > 0 && (
            <div className="feedback-tabs">
              {allFeedbacks.map((fb, index) => {
                const fbDate = fb.submittedAt ? new Date(fb.submittedAt) : new Date()
                return (
                  <button
                    key={fb.id}
                    className={`feedback-tab ${selectedFeedbackIndex === index ? 'active' : ''}`}
                    onClick={() => handleSelectFeedback(index)}
                  >
                    <span className="tab-name">{fb.submittedByName?.split(' ')[0] || 'Unknown'}</span>
                    <span className="tab-date">
                      {fbDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                    <span className="tab-rating">⭐ {fb.ratings?.overall || '-'}</span>
                  </button>
                )
              })}
              <button
                className={`feedback-tab add-new ${selectedFeedbackIndex === 'new' ? 'active' : ''}`}
                onClick={() => handleSelectFeedback('new')}
              >
                <span className="tab-icon">+</span>
                <span className="tab-name">Add New</span>
              </button>
            </div>
          )}

          <div className="feedback-form">
            {/* Viewing existing feedback indicator */}
            {selectedFeedbackIndex !== 'new' && allFeedbacks[selectedFeedbackIndex as number] && (
              <div className="viewing-feedback-info">
                📋 Viewing feedback from {allFeedbacks[selectedFeedbackIndex as number].submittedByName}
                {allFeedbacks[selectedFeedbackIndex as number].submittedAt && (
                  <> on {new Date(allFeedbacks[selectedFeedbackIndex as number].submittedAt).toLocaleDateString('en-GB', { 
                    day: 'numeric', 
                    month: 'long', 
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}</>
                )}
              </div>
            )}

            {/* Star Ratings */}
            <div className="feedback-criteria-list">
              {FEEDBACK_CRITERIA.map(({ key, label, icon }) => (
                <div key={key} className="feedback-criterion">
                  <div className="criterion-label">
                    <span className="criterion-icon">{icon}</span>
                    <span>{label}</span>
                  </div>
                  <div className="star-rating">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        className={`star-btn ${feedbackRatings[key] >= star ? 'active' : ''}`}
                        onClick={() => selectedFeedbackIndex === 'new' && setFeedbackRatings(prev => ({ ...prev, [key]: star }))}
                        disabled={selectedFeedbackIndex !== 'new'}
                      >
                        ★
                      </button>
                    ))}
                    <span className="rating-value">
                      {feedbackRatings[key] > 0 ? feedbackRatings[key] : '-'}/5
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Notes Section */}
            <div className="feedback-notes-section">
              <label className="notes-label">Additional Notes</label>
              <Textarea
                value={feedbackNotes}
                onChange={(e) => setFeedbackNotes(e.target.value)}
                placeholder={selectedFeedbackIndex === 'new' ? "Add any additional observations, strengths, concerns..." : "No notes added"}
                rows={4}
                disabled={selectedFeedbackIndex !== 'new'}
                className="feedback-notes-input"
              />
            </div>

            {/* Save Button - only show for new feedback */}
            {selectedFeedbackIndex === 'new' && (
              <div className="feedback-actions">
                <Button
                  variant="primary"
                  onClick={handleSaveFeedback}
                  disabled={savingFeedback || feedbackRatings.overall === 0}
                >
                  {savingFeedback ? 'Saving...' : feedbackSaved ? '✓ Saved!' : 'Save Feedback'}
                </Button>
                {feedbackRatings.overall === 0 && (
                  <span className="feedback-hint">Please rate "Overall Impression" to save</span>
                )}
              </div>
            )}

            {/* No feedbacks yet message */}
            {allFeedbacks.length === 0 && selectedFeedbackIndex === 'new' && (
              <div className="no-feedbacks-yet">
                <p>No feedback has been submitted yet. Be the first to add feedback!</p>
              </div>
            )}
          </div>
          
          {/* Additional content (e.g., Meeting Summary) */}
          {children}
        </div>
      )}
    </Card>
  )
}

export default CandidateFeedback

// ============================================================================
// Candidate Feedback Component (Interview-Based)
// Shows feedback per interview/trial, stored in interviews collection
// Location: apps/recruitment-portal/src/components/candidate/CandidateFeedback.tsx
// ============================================================================

import { useState, useEffect } from 'react'
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { getFirebaseDb, COLLECTIONS } from '@allied/shared-lib'
import type { Candidate, Interview, FeedbackRecommendation, ActivityAction } from '@allied/shared-lib'
import { Card, Button, Textarea } from '@allied/shared-ui'

// ============================================================================
// TYPES
// ============================================================================

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

const RECOMMENDATION_OPTIONS: { value: FeedbackRecommendation; label: string; color: string }[] = [
  { value: 'hire', label: 'Hire', color: '#059669' },
  { value: 'maybe', label: 'Maybe', color: '#d97706' },
  { value: 'do_not_hire', label: 'Do Not Hire', color: '#dc2626' },
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
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [loadingInterviews, setLoadingInterviews] = useState(true)
  const [selectedInterviewId, setSelectedInterviewId] = useState<string | null>(null)
  const [savingFeedback, setSavingFeedback] = useState(false)
  const [feedbackSaved, setFeedbackSaved] = useState(false)

  // Feedback form state (matches PendingFeedback form)
  const [rating, setRating] = useState(3)
  const [recommendation, setRecommendation] = useState<FeedbackRecommendation>('maybe')
  const [strengths, setStrengths] = useState('')
  const [weaknesses, setWeaknesses] = useState('')
  const [comments, setComments] = useState('')

  // Load interviews for this candidate
  useEffect(() => {
    if (!candidate?.id) return

    const interviewsRef = collection(db, COLLECTIONS.INTERVIEWS)
    // Simple query without orderBy to avoid index requirement
    const q = query(
      interviewsRef,
      where('candidateId', '==', candidate.id)
    )

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Interview[]

      // Sort client-side by scheduledAt descending
      data.sort((a, b) => {
        const dateA = a.scheduledAt?.toDate?.() || new Date(0)
        const dateB = b.scheduledAt?.toDate?.() || new Date(0)
        return dateB.getTime() - dateA.getTime()
      })

      setInterviews(data)
      setLoadingInterviews(false)

      // Auto-select most recent interview that can have feedback
      if (data.length > 0 && !selectedInterviewId) {
        const feedbackEligible = data.filter(i =>
          ['completed', 'lapsed', 'no_show', 'scheduled'].includes(i.status)
        )
        if (feedbackEligible.length > 0) {
          setSelectedInterviewId(feedbackEligible[0].id)
        } else {
          // If no eligible interviews, just select the first one
          setSelectedInterviewId(data[0].id)
        }
      }
    }, (error) => {
      console.error('Error fetching interviews:', error)
      setLoadingInterviews(false)
    })

    return () => unsubscribe()
  }, [db, candidate?.id])

  // Load feedback when interview is selected
  useEffect(() => {
    if (!selectedInterviewId) return

    const interview = interviews.find(i => i.id === selectedInterviewId)
    if (interview?.feedback) {
      // Load existing feedback into form
      setRating(interview.feedback.rating || 3)
      setRecommendation(interview.feedback.recommendation || 'maybe')
      setStrengths(interview.feedback.strengths || '')
      setWeaknesses(interview.feedback.weaknesses || '')
      setComments(interview.feedback.comments || '')
    } else {
      // Reset form for new feedback
      resetForm()
    }
  }, [selectedInterviewId, interviews])

  const resetForm = () => {
    setRating(3)
    setRecommendation('maybe')
    setStrengths('')
    setWeaknesses('')
    setComments('')
  }

  // Save feedback to interview document
  const handleSaveFeedback = async () => {
    if (!selectedInterviewId || !recommendation) return

    const interview = interviews.find(i => i.id === selectedInterviewId)
    if (!interview) return

    setSavingFeedback(true)
    try {
      const feedbackData = {
        rating,
        recommendation,
        strengths: strengths.trim() || null,
        weaknesses: weaknesses.trim() || null,
        comments: comments.trim() || null,
        submittedAt: serverTimestamp(),
        submittedBy: userId,
      }

      await updateDoc(doc(db, COLLECTIONS.INTERVIEWS, selectedInterviewId), {
        feedback: feedbackData,
        status: 'completed', // Ensure status is completed when feedback is submitted
        updatedAt: serverTimestamp(),
      })

      // Log activity
      await onLogActivity(
        candidate.id,
        'feedback_submitted',
        `Submitted ${interview.type} feedback: ${recommendation} (Rating: ${rating}/5)`
      )

      setFeedbackSaved(true)
      setTimeout(() => setFeedbackSaved(false), 2000)
    } catch (err) {
      console.error('Error saving feedback:', err)
      alert('Failed to save feedback. Please try again.')
    } finally {
      setSavingFeedback(false)
    }
  }

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '-'
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const selectedInterview = interviews.find(i => i.id === selectedInterviewId)
  const hasFeedback = selectedInterview?.feedback?.submittedAt

  // Check if scheduled time has passed (allow feedback from scheduled time onwards)
  const scheduledTime = selectedInterview?.scheduledAt?.toDate?.() || selectedInterview?.scheduledDate?.toDate?.()
  const hasTimePasssed = scheduledTime ? scheduledTime <= new Date() : false

  const canSubmitFeedback = selectedInterview &&
    ['completed', 'lapsed', 'no_show', 'scheduled'].includes(selectedInterview.status) &&
    hasTimePasssed

  // Count interviews with feedback
  const feedbackCount = interviews.filter(i => i.feedback?.submittedAt).length

  // Legacy feedback from candidate document (old system)
  const legacyFeedbacks = candidate.feedbacks || (candidate.feedback ? [candidate.feedback] : [])
  const hasLegacyFeedback = legacyFeedbacks.length > 0

  // Total feedback count (interviews + legacy)
  const totalFeedbackCount = feedbackCount + legacyFeedbacks.length

  return (
    <Card className="detail-card feedback-card">
      <button
        className={`section-toggle ${expanded ? 'expanded' : ''}`}
        onClick={onToggleExpand}
      >
        <div className="toggle-left">
          <span className="toggle-icon">📝</span>
          <span className="toggle-title">Interview Feedback</span>
          {totalFeedbackCount > 0 && (
            <span className="has-content-badge">
              {totalFeedbackCount} feedback{totalFeedbackCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <span className={`toggle-arrow ${expanded ? 'expanded' : ''}`}>
          ▼
        </span>
      </button>

      {expanded && (
        <div className="feedback-expanded-content">
          {/* Legacy Feedback Section (from old system) */}
          {hasLegacyFeedback && (
            <div className="legacy-feedback-section">
              <div className="legacy-feedback-header">
                <span className="legacy-icon">📋</span>
                <span>Previous Feedback (Legacy)</span>
              </div>
              {legacyFeedbacks.map((fb: any, index: number) => (
                <div key={fb.id || index} className="legacy-feedback-item">
                  <div className="legacy-feedback-meta">
                    <span className="legacy-author">{fb.submittedByName || 'Unknown'}</span>
                    {fb.submittedAt && (
                      <span className="legacy-date">
                        {new Date(fb.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                    {fb.ratings?.overall && (
                      <span className="legacy-rating">⭐ {fb.ratings.overall}/5</span>
                    )}
                  </div>
                  {fb.notes && <p className="legacy-notes">{fb.notes}</p>}
                </div>
              ))}
            </div>
          )}

          {loadingInterviews ? (
            <div className="feedback-loading">Loading interviews...</div>
          ) : interviews.length === 0 ? (
            <div className="no-feedbacks-yet">
              <p>No interviews or trials scheduled yet.</p>
              <p className="hint">Schedule an interview to leave feedback linked to a specific interview/trial.</p>
            </div>
          ) : (
            <>
              {/* Interview Tabs */}
              <div className="feedback-tabs">
                {interviews.map((interview) => {
                  const hasInterviewFeedback = !!interview.feedback?.submittedAt
                  return (
                    <button
                      key={interview.id}
                      className={`feedback-tab ${selectedInterviewId === interview.id ? 'active' : ''} ${hasInterviewFeedback ? 'has-feedback' : ''}`}
                      onClick={() => setSelectedInterviewId(interview.id)}
                    >
                      <span className="tab-type">
                        {interview.type === 'trial' ? '👔' : '📅'}
                      </span>
                      <span className="tab-date">
                        {formatDate(interview.scheduledAt)}
                      </span>
                      {hasInterviewFeedback && (
                        <span className="tab-rating">
                          ⭐ {interview.feedback?.rating || '-'}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {selectedInterview && (
                <div className="feedback-form">
                  {/* Interview Info Header */}
                  <div className="interview-info-header">
                    <span className="interview-type-badge">
                      {selectedInterview.type === 'trial' ? '👔 Trial' : '📅 Interview'}
                    </span>
                    <span className="interview-branch">{selectedInterview.branchName || 'No branch'}</span>
                    <span className={`interview-status status-${selectedInterview.status}`}>
                      {selectedInterview.status}
                    </span>
                  </div>

                  {/* Existing Feedback Display */}
                  {hasFeedback && (
                    <div className="existing-feedback-info">
                      <div className="feedback-summary">
                        <span className={`rec-badge rec-${selectedInterview.feedback?.recommendation}`}>
                          {selectedInterview.feedback?.recommendation === 'hire' ? '✓ Hire' :
                           selectedInterview.feedback?.recommendation === 'maybe' ? '? Maybe' : '✗ Do Not Hire'}
                        </span>
                        <span className="rating-display">
                          Rating: {selectedInterview.feedback?.rating}/5
                        </span>
                      </div>
                      {selectedInterview.feedback?.strengths && (
                        <div className="feedback-detail">
                          <strong>Strengths:</strong> {selectedInterview.feedback.strengths}
                        </div>
                      )}
                      {selectedInterview.feedback?.weaknesses && (
                        <div className="feedback-detail">
                          <strong>Areas to Improve:</strong> {selectedInterview.feedback.weaknesses}
                        </div>
                      )}
                      {selectedInterview.feedback?.comments && (
                        <div className="feedback-detail">
                          <strong>Comments:</strong> {selectedInterview.feedback.comments}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Feedback Form (only if no existing feedback) */}
                  {!hasFeedback && canSubmitFeedback && (
                    <div className="feedback-form-fields">
                      {/* Recommendation */}
                      <div className="feedback-field">
                        <label>Recommendation *</label>
                        <div className="recommendation-buttons">
                          {RECOMMENDATION_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={`recommendation-btn ${recommendation === option.value ? 'active' : ''}`}
                              style={{
                                '--btn-color': option.color,
                                borderColor: recommendation === option.value ? option.color : undefined,
                                backgroundColor: recommendation === option.value ? `${option.color}15` : undefined,
                              } as React.CSSProperties}
                              onClick={() => setRecommendation(option.value)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Rating Slider */}
                      <div className="feedback-field">
                        <label>Overall Rating: {rating}/5</label>
                        <div className="rating-slider">
                          <input
                            type="range"
                            min="1"
                            max="5"
                            value={rating}
                            onChange={(e) => setRating(parseInt(e.target.value))}
                          />
                          <div className="rating-labels">
                            <span>Poor</span>
                            <span>Below Avg</span>
                            <span>Average</span>
                            <span>Good</span>
                            <span>Excellent</span>
                          </div>
                        </div>
                      </div>

                      {/* Strengths */}
                      <div className="feedback-field">
                        <label>Strengths</label>
                        <Textarea
                          value={strengths}
                          onChange={(e) => setStrengths(e.target.value)}
                          placeholder="What were the candidate's key strengths?"
                          rows={3}
                        />
                      </div>

                      {/* Weaknesses */}
                      <div className="feedback-field">
                        <label>Areas for Improvement</label>
                        <Textarea
                          value={weaknesses}
                          onChange={(e) => setWeaknesses(e.target.value)}
                          placeholder="Any concerns or areas for development?"
                          rows={3}
                        />
                      </div>

                      {/* Comments */}
                      <div className="feedback-field">
                        <label>Additional Comments</label>
                        <Textarea
                          value={comments}
                          onChange={(e) => setComments(e.target.value)}
                          placeholder="Any other notes or observations..."
                          rows={3}
                        />
                      </div>

                      {/* Save Button */}
                      <div className="feedback-actions">
                        <Button
                          variant="primary"
                          onClick={handleSaveFeedback}
                          disabled={savingFeedback}
                        >
                          {savingFeedback ? 'Submitting...' : feedbackSaved ? '✓ Saved!' : 'Submit Feedback'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* No feedback allowed message */}
                  {!hasFeedback && !canSubmitFeedback && (
                    <div className="no-feedback-allowed">
                      {!hasTimePasssed && scheduledTime ? (
                        <p>Feedback can be submitted from {scheduledTime.toLocaleString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })} onwards.</p>
                      ) : (
                        <p>Feedback can be submitted after the {selectedInterview.type} is completed.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Additional content (e.g., Meeting Summary) */}
          {children}
        </div>
      )}
    </Card>
  )
}

export default CandidateFeedback

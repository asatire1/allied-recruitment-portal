// ============================================================================
// Allied Recruitment Portal - Ready for Decision Page
// Location: apps/recruitment-portal/src/pages/ReadyForDecision.tsx
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, addDoc, getDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getFirebaseDb, getFirebaseFunctions, COLLECTIONS } from '@allied/shared-lib'
import type { Interview, Candidate, CandidateStatus } from '@allied/shared-lib'
import { Card, Button, Spinner, Input, Modal, Select } from '@allied/shared-ui'
import { useAuth } from '../contexts/AuthContext'
import './ReadyForDecision.css'

// ============================================================================
// TYPES
// ============================================================================

interface DecisionCandidate {
  id: string
  candidate: Candidate
  interview: Interview
  recommendation: 'hire' | 'maybe' | 'do_not_hire'
  rating: number
  strengths?: string
  weaknesses?: string
  comments?: string
  completedDate: Date
  interviewType: 'interview' | 'trial'
}

interface Branch {
  id: string
  name: string
}

type RecommendationFilter = 'all' | 'hire' | 'maybe'
type TypeFilter = 'all' | 'interview' | 'trial'
type SortField = 'name' | 'date' | 'rating' | 'recommendation'
type SortDirection = 'asc' | 'desc'

// ============================================================================
// CONSTANTS
// ============================================================================

const RECOMMENDATION_STYLES = {
  hire: { label: 'Hire', color: '#059669', bgColor: 'rgba(5, 150, 105, 0.1)', icon: '✓' },
  maybe: { label: 'Maybe', color: '#d97706', bgColor: 'rgba(217, 119, 6, 0.1)', icon: '?' },
  do_not_hire: { label: 'Do Not Hire', color: '#dc2626', bgColor: 'rgba(220, 38, 38, 0.1)', icon: '✗' },
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function ReadyForDecision() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const db = getFirebaseDb()

  // Data state
  const [candidates, setCandidates] = useState<DecisionCandidate[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)

  // Filter state
  const [searchTerm, setSearchTerm] = useState('')
  const [recommendationFilter, setRecommendationFilter] = useState<RecommendationFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [branchFilter, setBranchFilter] = useState<string>('all')

  // Sort state
  const [sortField, setSortField] = useState<SortField>('recommendation')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // Modal state
  const [showActionModal, setShowActionModal] = useState(false)
  const [selectedCandidate, setSelectedCandidate] = useState<DecisionCandidate | null>(null)
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'trial' | null>(null)
  const [processing, setProcessing] = useState(false)
  const [sendEmail, setSendEmail] = useState(true)

  // Expanded feedback state
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  const loadData = useCallback(async () => {
    try {
      setLoading(true)

      // Load branches
      const branchesSnap = await getDocs(collection(db, 'branches'))
      const branchesData = branchesSnap.docs
        .map(d => ({ id: d.id, name: d.data().name || d.data().branchName || '' }))
        .filter(b => b.name)
        .sort((a, b) => a.name.localeCompare(b.name))
      setBranches(branchesData)

      // Load candidates with interview_complete or trial_complete status
      const candidatesQuery = query(
        collection(db, 'candidates'),
        where('status', 'in', ['interview_complete', 'trial_complete'])
      )
      const candidatesSnap = await getDocs(candidatesQuery)
      const candidatesMap = new Map<string, Candidate>()
      candidatesSnap.docs.forEach(d => {
        candidatesMap.set(d.id, { id: d.id, ...d.data() } as Candidate)
      })

      // Load completed interviews with feedback
      const interviewsQuery = query(
        collection(db, 'interviews'),
        where('status', '==', 'completed')
      )
      const interviewsSnap = await getDocs(interviewsQuery)
      const interviews = interviewsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }) as Interview)
        .filter(i => 
          i.feedback?.submittedAt && 
          (i.feedback?.recommendation === 'hire' || i.feedback?.recommendation === 'maybe') &&
          candidatesMap.has(i.candidateId)
        )

      // Group by candidate - get most recent interview per candidate
      const candidateInterviewMap = new Map<string, Interview>()
      for (const interview of interviews) {
        const existing = candidateInterviewMap.get(interview.candidateId)
        if (!existing) {
          candidateInterviewMap.set(interview.candidateId, interview)
        } else {
          const existingDate = existing.scheduledDate?.toDate?.() || new Date(0)
          const newDate = interview.scheduledDate?.toDate?.() || new Date(0)
          if (newDate > existingDate) {
            candidateInterviewMap.set(interview.candidateId, interview)
          }
        }
      }

      // Build decision candidates list
      const decisionCandidates: DecisionCandidate[] = []
      for (const [candidateId, interview] of candidateInterviewMap) {
        const candidate = candidatesMap.get(candidateId)
        if (candidate) {
          decisionCandidates.push({
            id: candidateId,
            candidate,
            interview,
            recommendation: interview.feedback?.recommendation as 'hire' | 'maybe' | 'do_not_hire',
            rating: interview.feedback?.rating || 0,
            strengths: interview.feedback?.strengths,
            weaknesses: interview.feedback?.weaknesses,
            comments: interview.feedback?.comments,
            completedDate: interview.scheduledDate?.toDate?.() || new Date(),
            interviewType: interview.type,
          })
        }
      }

      setCandidates(decisionCandidates)

    } catch (err) {
      console.error('Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }, [db])

  useEffect(() => { loadData() }, [loadData])

  // ============================================================================
  // FILTERING & SORTING
  // ============================================================================

  const filteredCandidates = useMemo(() => {
    let result = [...candidates]

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(c =>
        `${c.candidate.firstName} ${c.candidate.lastName}`.toLowerCase().includes(term) ||
        c.candidate.jobTitle?.toLowerCase().includes(term) ||
        c.interview.branchName?.toLowerCase().includes(term)
      )
    }

    // Recommendation filter
    if (recommendationFilter !== 'all') {
      result = result.filter(c => c.recommendation === recommendationFilter)
    }

    // Type filter
    if (typeFilter !== 'all') {
      result = result.filter(c => c.interviewType === typeFilter)
    }

    // Branch filter
    if (branchFilter !== 'all') {
      result = result.filter(c => c.interview.branchId === branchFilter)
    }

    // Sorting
    result.sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'name':
          comparison = `${a.candidate.firstName} ${a.candidate.lastName}`.localeCompare(
            `${b.candidate.firstName} ${b.candidate.lastName}`
          )
          break
        case 'date':
          comparison = a.completedDate.getTime() - b.completedDate.getTime()
          break
        case 'rating':
          comparison = a.rating - b.rating
          break
        case 'recommendation':
          const recOrder = { hire: 0, maybe: 1, do_not_hire: 2 }
          comparison = (recOrder[a.recommendation] || 2) - (recOrder[b.recommendation] || 2)
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return result
  }, [candidates, searchTerm, recommendationFilter, typeFilter, branchFilter, sortField, sortDirection])

  // Stats
  const stats = useMemo(() => ({
    total: candidates.length,
    hire: candidates.filter(c => c.recommendation === 'hire').length,
    maybe: candidates.filter(c => c.recommendation === 'maybe').length,
    interviewComplete: candidates.filter(c => c.interviewType === 'interview').length,
    trialComplete: candidates.filter(c => c.interviewType === 'trial').length,
  }), [candidates])

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleAction = (candidate: DecisionCandidate, action: 'approve' | 'reject' | 'trial') => {
    setSelectedCandidate(candidate)
    setActionType(action)
    setSendEmail(true)
    setShowActionModal(true)
  }

  const handleConfirmAction = async () => {
    if (!selectedCandidate || !actionType) return

    setProcessing(true)
    try {
      const candidateRef = doc(db, 'candidates', selectedCandidate.id)
      let newStatus: CandidateStatus

      switch (actionType) {
        case 'approve':
          newStatus = 'approved'
          break
        case 'reject':
          newStatus = 'rejected'
          break
        case 'trial':
          newStatus = 'trial_scheduled'
          break
        default:
          return
      }

      // Update candidate status
      await updateDoc(candidateRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
      })

      // Log activity
      await addDoc(collection(db, COLLECTIONS.ACTIVITY_LOG || 'activityLog'), {
        entityType: 'candidate',
        entityId: selectedCandidate.id,
        action: 'status_changed',
        description: `Status changed to ${newStatus.replace(/_/g, ' ')} from Ready for Decision`,
        userId: user?.id || user?.uid || '',
        userName: user?.name || user?.email || 'Unknown',
        createdAt: serverTimestamp(),
      })

      // Send email if rejection and checkbox is ticked
      if (actionType === 'reject' && sendEmail) {
        try {
          const functions = getFirebaseFunctions()
          const sendEmailFn = httpsCallable(functions, 'sendCandidateEmail')
          await sendEmailFn({
            candidateId: selectedCandidate.id,
            templateType: 'rejection',
            customData: {
              candidateName: `${selectedCandidate.candidate.firstName} ${selectedCandidate.candidate.lastName}`,
              jobTitle: selectedCandidate.candidate.jobTitle,
            }
          })
        } catch (emailErr) {
          console.error('Error sending email:', emailErr)
        }
      }

      // Remove from local list
      setCandidates(prev => prev.filter(c => c.id !== selectedCandidate.id))
      setShowActionModal(false)
      setSelectedCandidate(null)
      setActionType(null)

      // Navigate to candidate page if scheduling trial
      if (actionType === 'trial') {
        navigate(`/candidates/${selectedCandidate.id}`)
      }

    } catch (err) {
      console.error('Error processing action:', err)
    } finally {
      setProcessing(false)
    }
  }

  const toggleExpanded = (id: string) => {
    setExpandedId(prev => prev === id ? null : id)
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-GB', { 
      day: 'numeric', 
      month: 'short',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    })
  }

  const formatRelativeDate = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    return formatDate(date)
  }

  const clearFilters = () => {
    setSearchTerm('')
    setRecommendationFilter('all')
    setTypeFilter('all')
    setBranchFilter('all')
  }

  const hasActiveFilters = searchTerm || recommendationFilter !== 'all' || typeFilter !== 'all' || branchFilter !== 'all'

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div className="page ready-for-decision-page">
        <div className="loading-state">
          <Spinner size="lg" />
          <p>Loading candidates...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page ready-for-decision-page">
      {/* Header */}
      <div className="page-header">
        <div className="header-content">
          <h1>⏳ Ready for Decision</h1>
          <p className="header-subtitle">
            Candidates who have completed interviews or trials and are awaiting a hiring decision
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-row">
        <Card className={`stat-card ${recommendationFilter === 'all' ? 'active' : ''}`} onClick={() => setRecommendationFilter('all')}>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total Awaiting</div>
        </Card>
        <Card className={`stat-card hire ${recommendationFilter === 'hire' ? 'active' : ''}`} onClick={() => setRecommendationFilter('hire')}>
          <div className="stat-icon">✓</div>
          <div className="stat-value">{stats.hire}</div>
          <div className="stat-label">Recommended Hire</div>
        </Card>
        <Card className={`stat-card maybe ${recommendationFilter === 'maybe' ? 'active' : ''}`} onClick={() => setRecommendationFilter('maybe')}>
          <div className="stat-icon">?</div>
          <div className="stat-value">{stats.maybe}</div>
          <div className="stat-label">Maybe</div>
        </Card>
        <Card className={`stat-card interview ${typeFilter === 'interview' ? 'active' : ''}`} onClick={() => setTypeFilter('interview')}>
          <div className="stat-value">{stats.interviewComplete}</div>
          <div className="stat-label">Interview Complete</div>
        </Card>
        <Card className={`stat-card trial ${typeFilter === 'trial' ? 'active' : ''}`} onClick={() => setTypeFilter('trial')}>
          <div className="stat-value">{stats.trialComplete}</div>
          <div className="stat-label">Trial Complete</div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="filters-card">
        <div className="filters-row">
          <Input
            placeholder="Search by name, job, or branch..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          
          <select 
            value={branchFilter} 
            onChange={(e) => setBranchFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Branches</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear Filters
            </Button>
          )}
        </div>
      </Card>

      {/* Results */}
      {filteredCandidates.length === 0 ? (
        <Card className="empty-state-card">
          <div className="empty-state">
            <div className="empty-icon">✅</div>
            <h3>No Candidates Awaiting Decision</h3>
            <p>
              {hasActiveFilters 
                ? 'No candidates match your current filters. Try adjusting your search.'
                : 'All candidates have been processed. Great work!'}
            </p>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters}>
                Clear Filters
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="candidates-list">
          {filteredCandidates.map(candidate => {
            const recStyle = RECOMMENDATION_STYLES[candidate.recommendation]
            const isExpanded = expandedId === candidate.id
            
            return (
              <Card key={candidate.id} className={`candidate-card ${isExpanded ? 'expanded' : ''}`}>
                <div className="candidate-main" onClick={() => toggleExpanded(candidate.id)}>
                  {/* Recommendation Badge */}
                  <div 
                    className="recommendation-badge"
                    style={{ backgroundColor: recStyle.bgColor }}
                  >
                    <span className="rec-icon" style={{ color: recStyle.color }}>{recStyle.icon}</span>
                    <span className="rec-label" style={{ color: recStyle.color }}>{recStyle.label}</span>
                  </div>

                  {/* Candidate Info */}
                  <div className="candidate-info">
                    <div className="candidate-name">
                      {candidate.candidate.firstName} {candidate.candidate.lastName}
                    </div>
                    <div className="candidate-meta">
                      <span className="type-badge">{candidate.interviewType === 'trial' ? '🏪 Trial' : '💼 Interview'}</span>
                      <span className="job-title">{candidate.candidate.jobTitle}</span>
                      {candidate.interview.branchName && (
                        <span className="branch">📍 {candidate.interview.branchName}</span>
                      )}
                    </div>
                  </div>

                  {/* Rating */}
                  <div className="rating-section">
                    <div className="rating-stars">
                      {'★'.repeat(candidate.rating)}{'☆'.repeat(5 - candidate.rating)}
                    </div>
                    <div className="rating-date">{formatRelativeDate(candidate.completedDate)}</div>
                  </div>

                  {/* Expand Toggle */}
                  <div className="expand-toggle">
                    <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>▼</span>
                  </div>
                </div>

                {/* Expanded Feedback Details */}
                {isExpanded && (
                  <div className="candidate-expanded">
                    <div className="feedback-details">
                      {candidate.strengths && (
                        <div className="feedback-section">
                          <h4>💪 Strengths</h4>
                          <p>{candidate.strengths}</p>
                        </div>
                      )}
                      {candidate.weaknesses && (
                        <div className="feedback-section">
                          <h4>⚠️ Areas for Improvement</h4>
                          <p>{candidate.weaknesses}</p>
                        </div>
                      )}
                      {candidate.comments && (
                        <div className="feedback-section">
                          <h4>💬 Additional Comments</h4>
                          <p>{candidate.comments}</p>
                        </div>
                      )}
                      {!candidate.strengths && !candidate.weaknesses && !candidate.comments && (
                        <p className="no-feedback">No detailed feedback provided</p>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="action-buttons">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/candidates/${candidate.id}`)
                        }}
                      >
                        👤 View Profile
                      </Button>
                      
                      {candidate.interviewType === 'interview' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleAction(candidate, 'trial')
                          }}
                          className="action-trial"
                        >
                          🏪 Schedule Trial
                        </Button>
                      )}
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleAction(candidate, 'reject')
                        }}
                        className="action-reject"
                      >
                        ✗ Reject
                      </Button>
                      
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleAction(candidate, 'approve')
                        }}
                        className="action-approve"
                      >
                        ✓ Approve
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Action Confirmation Modal */}
      <Modal
        isOpen={showActionModal}
        onClose={() => setShowActionModal(false)}
        title={
          actionType === 'approve' ? 'Approve Candidate' :
          actionType === 'reject' ? 'Reject Candidate' :
          'Schedule Trial'
        }
      >
        {selectedCandidate && (
          <div className="action-modal-content">
            <div className="modal-candidate-info">
              <strong>{selectedCandidate.candidate.firstName} {selectedCandidate.candidate.lastName}</strong>
              <span>{selectedCandidate.candidate.jobTitle}</span>
            </div>

            {actionType === 'approve' && (
              <div className="modal-message">
                <p>This will mark the candidate as <strong>Approved</strong> and move them to the approved stage.</p>
                <p className="modal-hint">You can then proceed with onboarding from their profile.</p>
              </div>
            )}

            {actionType === 'reject' && (
              <div className="modal-message">
                <p>This will mark the candidate as <strong>Rejected</strong>.</p>
                <label className="email-checkbox">
                  <input
                    type="checkbox"
                    checked={sendEmail}
                    onChange={(e) => setSendEmail(e.target.checked)}
                  />
                  <span>Send rejection email to candidate</span>
                </label>
              </div>
            )}

            {actionType === 'trial' && (
              <div className="modal-message">
                <p>This will change the candidate's status to <strong>Trial Scheduled</strong> and take you to their profile to schedule a trial.</p>
              </div>
            )}

            <div className="modal-actions">
              <Button 
                variant="outline" 
                onClick={() => setShowActionModal(false)}
                disabled={processing}
              >
                Cancel
              </Button>
              <Button 
                variant={actionType === 'reject' ? 'primary' : 'primary'}
                onClick={handleConfirmAction}
                disabled={processing}
                className={`confirm-btn ${actionType}`}
              >
                {processing ? 'Processing...' : 
                  actionType === 'approve' ? 'Approve' :
                  actionType === 'reject' ? 'Reject' :
                  'Schedule Trial'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ============================================================================
// Allied Recruitment Portal - Pending Feedback Page (Redesigned)
// Location: apps/recruitment-portal/src/pages/PendingFeedback.tsx
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, addDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getFirebaseDb, getFirebaseFunctions, COLLECTIONS } from '@allied/shared-lib'
import type { Interview, FeedbackRecommendation } from '@allied/shared-lib'
import { INTERVIEW_TYPE_LABELS } from '@allied/shared-lib'
import { Card, Button, Spinner, Input, Modal, Textarea } from '@allied/shared-ui'
import { useAuth } from '../contexts/AuthContext'
import './PendingFeedback.css'

// ============================================================================
// TYPES
// ============================================================================

interface PendingItem {
  interview: Interview
  daysOverdue: number
  interviewDate: Date
}

interface Branch {
  id: string
  name: string
}

type SortField = 'candidateName' | 'date' | 'type' | 'branch' | 'overdue'
type SortDirection = 'asc' | 'desc'
type TimeFilter = 'all' | 'today' | 'week' | 'overdue'
type TypeFilter = 'all' | 'interview' | 'trial'

// ============================================================================
// CONSTANTS
// ============================================================================

const ITEMS_PER_PAGE = 20

const RECOMMENDATION_OPTIONS: { value: FeedbackRecommendation; label: string; color: string }[] = [
  { value: 'hire', label: 'Hire', color: '#059669' },
  { value: 'maybe', label: 'Maybe', color: '#d97706' },
  { value: 'do_not_hire', label: 'Do Not Hire', color: '#dc2626' },
]

// ============================================================================
// COMPONENT
// ============================================================================

export default function PendingFeedback() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const db = getFirebaseDb()

  // Data state
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [interviewers, setInterviewers] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)

  // Filter state
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [branchFilter, setBranchFilter] = useState<string>('all')
  const [interviewerFilter, setInterviewerFilter] = useState<string>('all')

  // Sort state
  const [sortField, setSortField] = useState<SortField>('overdue')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)

  // Feedback modal state
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null)
  const [feedbackForm, setFeedbackForm] = useState({
    rating: 3,
    recommendation: 'maybe' as FeedbackRecommendation,
    strengths: '',
    weaknesses: '',
    comments: '',
  })
  const [submittingFeedback, setSubmittingFeedback] = useState(false)
  const [showRejectConfirm, setShowRejectConfirm] = useState(false)
  const [sendRejectionEmail, setSendRejectionEmail] = useState(true)

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

      // Load interviews needing feedback
      const interviewsQuery = query(
        collection(db, 'interviews'),
        where('status', 'in', ['scheduled', 'completed', 'pending_feedback'])
      )
      const interviewsSnap = await getDocs(interviewsQuery)
      const allInterviews = interviewsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Interview[]

      const now = new Date()
      const items: PendingItem[] = []
      const interviewerMap = new Map<string, string>()

      for (const interview of allInterviews) {
        const scheduledDate = (interview as any).scheduledDate?.toDate?.() || new Date(0)
        
        // Only include if interview date has passed and no feedback submitted
        if (scheduledDate < now && !interview.feedback?.submittedAt) {
          // 2-day grace period before considered overdue
          const daysOverdue = Math.floor((now.getTime() - scheduledDate.getTime()) / (1000 * 60 * 60 * 24)) - 2
          items.push({ 
            interview, 
            daysOverdue: Math.max(0, daysOverdue),
            interviewDate: scheduledDate
          })

          // Collect unique interviewers
          if (interview.interviewerId && interview.interviewerName) {
            interviewerMap.set(interview.interviewerId, interview.interviewerName)
          }
        }
      }

      setPendingItems(items)
      setInterviewers(
        Array.from(interviewerMap.entries())
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name))
      )

    } catch (err) {
      console.error('Error loading pending feedback:', err)
    } finally {
      setLoading(false)
    }
  }, [db])

  useEffect(() => { loadData() }, [loadData])

  // ============================================================================
  // FILTERING & SORTING
  // ============================================================================

  const filteredItems = useMemo(() => {
    let result = [...pendingItems]

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(item =>
        item.interview.candidateName?.toLowerCase().includes(term) ||
        item.interview.jobTitle?.toLowerCase().includes(term) ||
        item.interview.branchName?.toLowerCase().includes(term)
      )
    }

    // Type filter
    if (typeFilter !== 'all') {
      result = result.filter(item => item.interview.type === typeFilter)
    }

    // Time filter
    if (timeFilter !== 'all') {
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)

      if (timeFilter === 'today') {
        result = result.filter(item => {
          const itemDate = new Date(item.interviewDate)
          return itemDate >= today
        })
      } else if (timeFilter === 'week') {
        result = result.filter(item => item.interviewDate >= weekAgo)
      } else if (timeFilter === 'overdue') {
        result = result.filter(item => item.daysOverdue > 0)
      }
    }

    // Branch filter
    if (branchFilter !== 'all') {
      result = result.filter(item => item.interview.branchId === branchFilter)
    }

    // Interviewer filter
    if (interviewerFilter !== 'all') {
      if (interviewerFilter === 'mine') {
        result = result.filter(item => item.interview.interviewerId === user?.uid)
      } else {
        result = result.filter(item => item.interview.interviewerId === interviewerFilter)
      }
    }

    // Sorting
    result.sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'candidateName':
          comparison = (a.interview.candidateName || '').localeCompare(b.interview.candidateName || '')
          break
        case 'date':
          comparison = a.interviewDate.getTime() - b.interviewDate.getTime()
          break
        case 'type':
          comparison = (a.interview.type || '').localeCompare(b.interview.type || '')
          break
        case 'branch':
          comparison = (a.interview.branchName || '').localeCompare(b.interview.branchName || '')
          break
        case 'overdue':
          comparison = a.daysOverdue - b.daysOverdue
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return result
  }, [pendingItems, searchTerm, typeFilter, timeFilter, branchFilter, interviewerFilter, sortField, sortDirection, user?.uid])

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE)
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  // Stats
  const stats = useMemo(() => ({
    total: pendingItems.length,
    overdue: pendingItems.filter(i => i.daysOverdue > 0).length,
    dueToday: pendingItems.filter(i => {
      const today = new Date()
      return i.interviewDate.toDateString() === today.toDateString()
    }).length,
    mine: pendingItems.filter(i => i.interview.interviewerId === user?.uid).length,
  }), [pendingItems, user?.uid])

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const handleOpenFeedback = (interview: Interview) => {
    setSelectedInterview(interview)
    setFeedbackForm({
      rating: 3,
      recommendation: 'maybe',
      strengths: '',
      weaknesses: '',
      comments: '',
    })
    setShowFeedbackModal(true)
  }

  const handleSubmitFeedback = async (skipRejectionPrompt = false) => {
    if (!selectedInterview) return

    // If "Do Not Hire" and haven't shown prompt yet, show confirmation
    if (feedbackForm.recommendation === 'do_not_hire' && !skipRejectionPrompt && !showRejectConfirm) {
      setShowRejectConfirm(true)
      return
    }

    setSubmittingFeedback(true)
    try {
      const interviewRef = doc(db, 'interviews', selectedInterview.id)
      await updateDoc(interviewRef, {
        status: 'completed',
        feedback: {
          rating: feedbackForm.rating,
          recommendation: feedbackForm.recommendation,
          strengths: feedbackForm.strengths || null,
          weaknesses: feedbackForm.weaknesses || null,
          comments: feedbackForm.comments || null,
          submittedAt: serverTimestamp(),
          submittedBy: user?.id || user?.uid || '',
        },
        updatedAt: serverTimestamp(),
      })

      // Log activity
      await addDoc(collection(db, COLLECTIONS.ACTIVITY_LOG || 'activityLog'), {
        entityType: 'interview',
        entityId: selectedInterview.id,
        action: 'feedback_submitted',
        description: `Feedback submitted: ${feedbackForm.recommendation}`,
        userId: user?.id || user?.uid || '',
        userName: user?.name || user?.email || 'Unknown',
        createdAt: serverTimestamp(),
      })

      // Update candidate status based on recommendation
      if (selectedInterview.candidateId) {
        const candidateRef = doc(db, 'candidates', selectedInterview.candidateId)
        
        let newStatus: string
        if (feedbackForm.recommendation === 'do_not_hire') {
          newStatus = 'rejected'
        } else {
          newStatus = selectedInterview.type === 'interview' 
            ? 'interview_complete' 
            : 'trial_complete'
        }
        
        await updateDoc(candidateRef, {
          status: newStatus,
          updatedAt: serverTimestamp(),
        })

        // Send rejection email if requested
        if (feedbackForm.recommendation === 'do_not_hire' && sendRejectionEmail) {
          try {
            const functions = getFirebaseFunctions()
            const sendEmailFn = httpsCallable(functions, 'sendCandidateEmail')
            await sendEmailFn({
              candidateId: selectedInterview.candidateId,
              templateType: 'rejection',
              customData: {
                candidateName: selectedInterview.candidateName,
                jobTitle: selectedInterview.jobTitle,
              }
            })
            
            // Log email activity
            await addDoc(collection(db, COLLECTIONS.ACTIVITY_LOG || 'activityLog'), {
              entityType: 'candidate',
              entityId: selectedInterview.candidateId,
              action: 'email_sent',
              description: 'Rejection email sent',
              userId: user?.id || user?.uid || '',
              userName: user?.name || user?.email || 'Unknown',
              createdAt: serverTimestamp(),
            })
          } catch (emailErr) {
            console.error('Error sending rejection email:', emailErr)
            // Don't fail the whole operation if email fails
          }
        }
      }

      // Remove from local list
      setPendingItems(prev => prev.filter(item => item.interview.id !== selectedInterview.id))
      setShowFeedbackModal(false)
      setShowRejectConfirm(false)
      setSendRejectionEmail(true)
      setSelectedInterview(null)

    } catch (err) {
      console.error('Error submitting feedback:', err)
    } finally {
      setSubmittingFeedback(false)
    }
  }

  const handleMarkNA = async (interview: Interview) => {
    if (!window.confirm('Mark this interview as N/A? This will remove it from pending feedback.')) return

    try {
      const interviewRef = doc(db, 'interviews', interview.id)
      await updateDoc(interviewRef, {
        status: 'cancelled',
        cancellationReason: 'Marked as N/A from pending feedback',
        cancelledAt: serverTimestamp(),
        cancelledBy: user?.id || user?.uid || '',
        updatedAt: serverTimestamp(),
      })

      setPendingItems(prev => prev.filter(item => item.interview.id !== interview.id))
    } catch (err) {
      console.error('Error marking as N/A:', err)
    }
  }

  const clearFilters = () => {
    setSearchTerm('')
    setTypeFilter('all')
    setTimeFilter('all')
    setBranchFilter('all')
    setInterviewerFilter('all')
    setCurrentPage(1)
  }

  const hasActiveFilters = searchTerm || typeFilter !== 'all' || timeFilter !== 'all' || branchFilter !== 'all' || interviewerFilter !== 'all'

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-GB', { 
      day: 'numeric', 
      month: 'short',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    })
  }

  const getOverdueClass = (days: number) => {
    if (days > 7) return 'overdue-critical'
    if (days > 0) return 'overdue-warning'
    return ''
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="sort-icon">↕</span>
    return <span className="sort-icon active">{sortDirection === 'asc' ? '↑' : '↓'}</span>
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div className="page pending-feedback-page">
        <div className="loading-state">
          <Spinner size="lg" />
          <p>Loading pending feedback...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page pending-feedback-page">
      {/* Header */}
      <div className="page-header">
        <div className="header-content">
          <h1 className="page-title">📝 Pending Feedback</h1>
          <p className="page-description">Review and submit feedback for completed interviews</p>
        </div>
        <div className="header-actions">
          <Button variant="outline" onClick={() => navigate('/interviews')}>
            View All Interviews
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <Card 
          className={`stat-card ${timeFilter === 'all' && interviewerFilter === 'all' ? 'active' : ''}`}
          onClick={() => { setTimeFilter('all'); setInterviewerFilter('all'); }}
        >
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total Pending</div>
        </Card>
        <Card 
          className={`stat-card stat-overdue ${timeFilter === 'overdue' ? 'active' : ''}`}
          onClick={() => setTimeFilter('overdue')}
        >
          <div className="stat-value">{stats.overdue}</div>
          <div className="stat-label">Overdue</div>
        </Card>
        <Card 
          className={`stat-card stat-today ${timeFilter === 'today' ? 'active' : ''}`}
          onClick={() => setTimeFilter('today')}
        >
          <div className="stat-value">{stats.dueToday}</div>
          <div className="stat-label">Due Today</div>
        </Card>
        <Card 
          className={`stat-card ${interviewerFilter === 'mine' ? 'active' : ''}`}
          onClick={() => setInterviewerFilter('mine')}
        >
          <div className="stat-value">{stats.mine}</div>
          <div className="stat-label">My Queue</div>
        </Card>
      </div>

      {/* Filters */}
      <div className="filters-section">
        <div className="search-box">
          <Input
            placeholder="Search candidate, job, or branch..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          />
        </div>

        <div className="filter-row">
          <select 
            className="filter-select"
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value as TypeFilter); setCurrentPage(1); }}
          >
            <option value="all">All Types</option>
            <option value="interview">Interviews</option>
            <option value="trial">Trials</option>
          </select>

          <select 
            className="filter-select"
            value={timeFilter}
            onChange={(e) => { setTimeFilter(e.target.value as TimeFilter); setCurrentPage(1); }}
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="overdue">Overdue Only</option>
          </select>

          <select 
            className="filter-select"
            value={branchFilter}
            onChange={(e) => { setBranchFilter(e.target.value); setCurrentPage(1); }}
          >
            <option value="all">All Branches</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          <select 
            className="filter-select"
            value={interviewerFilter}
            onChange={(e) => { setInterviewerFilter(e.target.value); setCurrentPage(1); }}
          >
            <option value="all">All Interviewers</option>
            <option value="mine">My Interviews</option>
            {interviewers.map(i => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      {/* Results */}
      {filteredItems.length === 0 ? (
        <Card className="empty-state">
          <div className="empty-icon">✓</div>
          <h3>{hasActiveFilters ? 'No matching results' : 'All caught up!'}</h3>
          <p>{hasActiveFilters ? 'Try adjusting your filters' : 'No pending feedback at the moment.'}</p>
          {hasActiveFilters && (
            <Button variant="outline" onClick={clearFilters}>Clear Filters</Button>
          )}
        </Card>
      ) : (
        <>
          {/* Table */}
          <div className="table-container">
            <table className="feedback-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('candidateName')} className="sortable">
                    Candidate <SortIcon field="candidateName" />
                  </th>
                  <th onClick={() => handleSort('type')} className="sortable">
                    Type <SortIcon field="type" />
                  </th>
                  <th onClick={() => handleSort('date')} className="sortable">
                    Date <SortIcon field="date" />
                  </th>
                  <th onClick={() => handleSort('branch')} className="sortable">
                    Branch <SortIcon field="branch" />
                  </th>
                  <th>Job</th>
                  <th>Interviewer</th>
                  <th onClick={() => handleSort('overdue')} className="sortable">
                    Status <SortIcon field="overdue" />
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map(item => (
                  <tr 
                    key={item.interview.id} 
                    className={getOverdueClass(item.daysOverdue)}
                  >
                    <td>
                      <span 
                        className="candidate-link"
                        onClick={() => navigate(`/candidates/${item.interview.candidateId}`)}
                      >
                        {item.interview.candidateName}
                      </span>
                    </td>
                    <td>
                      <span className={`type-badge type-${item.interview.type}`}>
                        {INTERVIEW_TYPE_LABELS[item.interview.type as keyof typeof INTERVIEW_TYPE_LABELS] || item.interview.type}
                      </span>
                    </td>
                    <td>{formatDate(item.interviewDate)}</td>
                    <td>{item.interview.branchName || '-'}</td>
                    <td>{item.interview.jobTitle || '-'}</td>
                    <td>{item.interview.interviewerName || '-'}</td>
                    <td>
                      {item.daysOverdue > 0 ? (
                        <span className={`overdue-badge ${item.daysOverdue > 7 ? 'critical' : ''}`}>
                          {item.daysOverdue} day{item.daysOverdue !== 1 ? 's' : ''} overdue
                        </span>
                      ) : (
                        <span className="pending-badge">Pending</span>
                      )}
                    </td>
                    <td>
                      <div className="action-buttons">
                        <Button 
                          variant="primary" 
                          size="sm" 
                          onClick={() => handleOpenFeedback(item.interview)}
                        >
                          Add Feedback
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleMarkNA(item.interview)}
                          title="Mark as N/A"
                        >
                          N/A
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <div className="pagination-info">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length)} of {filteredItems.length}
              </div>
              <div className="pagination-controls">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  First
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => p - 1)}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="page-indicator">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => p + 1)}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  Last
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Feedback Modal */}
      <Modal
        isOpen={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        title="Submit Feedback"
      >
        {selectedInterview && (
          <div className="feedback-modal-content">
            <div className="feedback-candidate-info">
              <h3>{selectedInterview.candidateName}</h3>
              <p>
                {INTERVIEW_TYPE_LABELS[selectedInterview.type as keyof typeof INTERVIEW_TYPE_LABELS]} 
                {' • '}{selectedInterview.jobTitle}
                {selectedInterview.branchName && ` • ${selectedInterview.branchName}`}
              </p>
            </div>

            {/* Recommendation */}
            <div className="feedback-field">
              <label>Recommendation *</label>
              <div className="recommendation-buttons">
                {RECOMMENDATION_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`recommendation-btn ${feedbackForm.recommendation === opt.value ? 'active' : ''}`}
                    style={{ 
                      '--btn-color': opt.color,
                      borderColor: feedbackForm.recommendation === opt.value ? opt.color : undefined,
                      backgroundColor: feedbackForm.recommendation === opt.value ? `${opt.color}15` : undefined,
                    } as React.CSSProperties}
                    onClick={() => setFeedbackForm(prev => ({ ...prev, recommendation: opt.value }))}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Rating */}
            <div className="feedback-field">
              <label>Overall Rating: {feedbackForm.rating}/5</label>
              <div className="rating-slider">
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={feedbackForm.rating}
                  onChange={(e) => setFeedbackForm(prev => ({ ...prev, rating: parseInt(e.target.value) }))}
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
                value={feedbackForm.strengths}
                onChange={(e) => setFeedbackForm(prev => ({ ...prev, strengths: e.target.value }))}
                placeholder="What were the candidate's key strengths?"
                rows={3}
              />
            </div>

            {/* Weaknesses */}
            <div className="feedback-field">
              <label>Areas for Improvement</label>
              <Textarea
                value={feedbackForm.weaknesses}
                onChange={(e) => setFeedbackForm(prev => ({ ...prev, weaknesses: e.target.value }))}
                placeholder="Any concerns or areas for development?"
                rows={3}
              />
            </div>

            {/* Comments */}
            <div className="feedback-field">
              <label>Additional Comments</label>
              <Textarea
                value={feedbackForm.comments}
                onChange={(e) => setFeedbackForm(prev => ({ ...prev, comments: e.target.value }))}
                placeholder="Any other notes or observations..."
                rows={3}
              />
            </div>

            {/* Rejection Confirmation */}
            {showRejectConfirm && (
              <div className="rejection-confirm-section">
                <div className="rejection-confirm-header">
                  <span className="rejection-confirm-icon">⚠️</span>
                  <strong>Reject Candidate?</strong>
                </div>
                <p>This will mark {selectedInterview.candidateName} as rejected.</p>
                <label className="rejection-email-checkbox">
                  <input
                    type="checkbox"
                    checked={sendRejectionEmail}
                    onChange={(e) => setSendRejectionEmail(e.target.checked)}
                  />
                  <span>Send rejection email to candidate</span>
                </label>
              </div>
            )}

            {/* Actions */}
            <div className="feedback-actions">
              <Button 
                variant="outline" 
                onClick={() => {
                  if (showRejectConfirm) {
                    setShowRejectConfirm(false)
                  } else {
                    setShowFeedbackModal(false)
                  }
                }}
                disabled={submittingFeedback}
              >
                {showRejectConfirm ? 'Back' : 'Cancel'}
              </Button>
              <Button 
                variant={showRejectConfirm ? 'primary' : 'primary'}
                onClick={() => handleSubmitFeedback(showRejectConfirm)}
                disabled={submittingFeedback}
              >
                {submittingFeedback ? 'Submitting...' : showRejectConfirm ? 'Confirm & Submit' : 'Submit Feedback'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

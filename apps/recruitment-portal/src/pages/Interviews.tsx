/**
 * Interviews Page - R6.10
 * 
 * Table view of all interviews with filters, sorting, and search.
 */

import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { collection, query, orderBy, getDocs, doc, updateDoc, addDoc, Timestamp, serverTimestamp, limit, where } from 'firebase/firestore'
import { 
  getFirebaseDb,
  INTERVIEW_STATUS_LABELS,
  INTERVIEW_STATUS_COLORS,
  INTERVIEW_TYPE_LABELS,
  INTERVIEW_TYPE_COLORS,
  formatDuration,
  FEEDBACK_LABELS,
  FEEDBACK_COLORS,
} from '@allied/shared-lib'
import type { Interview, InterviewStatus, InterviewType } from '@allied/shared-lib'
import { Card, Button, Spinner, Badge, Modal, Input, Textarea } from '@allied/shared-ui'
import { useAuth } from '../contexts/AuthContext'
import './Interviews.css'

// ============================================================================
// Types
// ============================================================================

type SortField = 'scheduledDate' | 'candidateName' | 'type' | 'status' | 'branchName'
type SortDirection = 'asc' | 'desc'

// ============================================================================
// Component
// ============================================================================

export function Interviews() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const db = getFirebaseDb()

  // State
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '')
  
  // Filters
  const [filterType, setFilterType] = useState<InterviewType | 'all'>(
    (searchParams.get('type') as InterviewType) || 'all'
  )
  const [filterStatus, setFilterStatus] = useState<InterviewStatus | 'all'>(
    (searchParams.get('status') as InterviewStatus) || 'all'
  )
  const [filterDateRange, setFilterDateRange] = useState<'all' | 'today' | 'week' | 'month' | 'past'>('all')
  
  // Sorting
  const [sortField, setSortField] = useState<SortField>('scheduledDate')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  
  // Modal state
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showRescheduleModal, setShowRescheduleModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')

  // Fetch interviews
  useEffect(() => {
    async function fetchInterviews() {
      try {
        setLoading(true)
        
        const interviewsRef = collection(db, 'interviews')
        const q = query(
          interviewsRef,
          orderBy('scheduledDate', 'desc'),
          limit(500)
        )
        
        const snapshot = await getDocs(q)
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Interview[]
        
        setInterviews(data)
      } catch (err) {
        console.error('Error fetching interviews:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchInterviews()
  }, [db])

  // Update URL params when filters change
  useEffect(() => {
    const params: Record<string, string> = {}
    if (searchTerm) params.search = searchTerm
    if (filterType !== 'all') params.type = filterType
    if (filterStatus !== 'all') params.status = filterStatus
    setSearchParams(params)
  }, [searchTerm, filterType, filterStatus, setSearchParams])

  // Filter and sort interviews
  const filteredInterviews = useMemo(() => {
    let result = [...interviews]
    
    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(i => 
        i.candidateName?.toLowerCase().includes(term) ||
        i.jobTitle?.toLowerCase().includes(term) ||
        i.branchName?.toLowerCase().includes(term)
      )
    }
    
    // Type filter
    if (filterType !== 'all') {
      result = result.filter(i => i.type === filterType)
    }
    
    // Status filter
    if (filterStatus !== 'all') {
      result = result.filter(i => i.status === filterStatus)
    }
    
    // Date range filter
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    
    if (filterDateRange === 'today') {
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      result = result.filter(i => {
        const date = i.scheduledDate.toDate()
        return date >= today && date < tomorrow
      })
    } else if (filterDateRange === 'week') {
      const weekLater = new Date(today)
      weekLater.setDate(weekLater.getDate() + 7)
      result = result.filter(i => {
        const date = i.scheduledDate.toDate()
        return date >= today && date < weekLater
      })
    } else if (filterDateRange === 'month') {
      const monthLater = new Date(today)
      monthLater.setMonth(monthLater.getMonth() + 1)
      result = result.filter(i => {
        const date = i.scheduledDate.toDate()
        return date >= today && date < monthLater
      })
    } else if (filterDateRange === 'past') {
      result = result.filter(i => {
        const date = i.scheduledDate.toDate()
        return date < today
      })
    }
    
    // Sort
    result.sort((a, b) => {
      let comparison = 0
      
      switch (sortField) {
        case 'scheduledDate':
          comparison = (a.scheduledDate?.toDate()?.getTime() || 0) - (b.scheduledDate?.toDate()?.getTime() || 0)
          break
        case 'candidateName':
          comparison = (a.candidateName || '').localeCompare(b.candidateName || '')
          break
        case 'type':
          comparison = (a.type || '').localeCompare(b.type || '')
          break
        case 'status':
          comparison = (a.status || '').localeCompare(b.status || '')
          break
        case 'branchName':
          comparison = (a.branchName || '').localeCompare(b.branchName || '')
          break
      }
      
      return sortDirection === 'asc' ? comparison : -comparison
    })
    
    return result
  }, [interviews, searchTerm, filterType, filterStatus, filterDateRange, sortField, sortDirection])

  // Stats
  const stats = useMemo(() => {
    return {
      total: interviews.length,
      scheduled: interviews.filter(i => i.status === 'scheduled').length,
      completed: interviews.filter(i => i.status === 'completed').length,
      cancelled: interviews.filter(i => i.status === 'cancelled').length,
      interviews: interviews.filter(i => i.type === 'interview').length,
      trials: interviews.filter(i => i.type === 'trial').length,
    }
  }, [interviews])

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // Format date/time
  const formatDateTime = (timestamp: Timestamp) => {
    const date = timestamp.toDate()
    return {
      date: date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      }),
      time: date.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit'
      })
    }
  }

  // Modal handlers
  const handleOpenDetail = (interview: Interview) => {
    setSelectedInterview(interview)
    setShowDetailModal(true)
    setActionError('')
  }

  const handleCloseModals = () => {
    setShowDetailModal(false)
    setShowRescheduleModal(false)
    setShowCancelModal(false)
    setSelectedInterview(null)
    setRescheduleDate('')
    setRescheduleTime('')
    setCancelReason('')
    setActionError('')
  }

  const handleOpenReschedule = () => {
    if (selectedInterview) {
      const scheduledDate = selectedInterview.scheduledDate.toDate()
      setRescheduleDate(scheduledDate.toISOString().split('T')[0])
      setRescheduleTime(scheduledDate.toTimeString().slice(0, 5))
    }
    setShowDetailModal(false)
    setShowRescheduleModal(true)
  }

  const handleOpenCancel = () => {
    setShowDetailModal(false)
    setShowCancelModal(true)
    setCancelReason('')
  }

  const handleReschedule = async () => {
    if (!selectedInterview || !rescheduleDate || !rescheduleTime) {
      setActionError('Please select a new date and time')
      return
    }

    setActionLoading(true)
    setActionError('')

    try {
      const newDateTime = new Date(`${rescheduleDate}T${rescheduleTime}`)
      const interviewRef = doc(db, 'interviews', selectedInterview.id)
      
      await updateDoc(interviewRef, {
        scheduledDate: Timestamp.fromDate(newDateTime),
        rescheduledFrom: selectedInterview.scheduledDate,
        rescheduledCount: (selectedInterview.rescheduledCount || 0) + 1,
        updatedAt: serverTimestamp(),
      })

      setInterviews(prev => prev.map(i => 
        i.id === selectedInterview.id 
          ? { 
              ...i, 
              scheduledDate: Timestamp.fromDate(newDateTime),
              rescheduledFrom: selectedInterview.scheduledDate,
              rescheduledCount: (selectedInterview.rescheduledCount || 0) + 1,
            } 
          : i
      ))

      handleCloseModals()
    } catch (err) {
      console.error('Error rescheduling interview:', err)
      setActionError('Failed to reschedule interview')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!selectedInterview) return

    setActionLoading(true)
    setActionError('')

    try {
      const interviewRef = doc(db, 'interviews', selectedInterview.id)
      
      await updateDoc(interviewRef, {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        cancelledBy: user?.id,
        ...(cancelReason && { cancellationReason: cancelReason }),
        updatedAt: serverTimestamp(),
      })

      setInterviews(prev => prev.map(i => 
        i.id === selectedInterview.id 
          ? { ...i, status: 'cancelled' as InterviewStatus }
          : i
      ))

      handleCloseModals()
    } catch (err) {
      console.error('Error cancelling interview:', err)
      setActionError('Failed to cancel interview')
    } finally {
      setActionLoading(false)
    }
  }

  const handleMarkCompleted = async (interview: Interview) => {
    try {
      const interviewRef = doc(db, 'interviews', interview.id)
      await updateDoc(interviewRef, {
        status: 'completed',
        updatedAt: serverTimestamp(),
      })
      setInterviews(prev => prev.map(i => 
        i.id === interview.id ? { ...i, status: 'completed' as InterviewStatus } : i
      ))
    } catch (err) {
      console.error('Error updating interview:', err)
    }
  }

  const handleMarkNoShow = async (interview: Interview) => {
    try {
      const interviewRef = doc(db, 'interviews', interview.id)
      await updateDoc(interviewRef, {
        status: 'no_show',
        updatedAt: serverTimestamp(),
      })
      setInterviews(prev => prev.map(i => 
        i.id === interview.id ? { ...i, status: 'no_show' as InterviewStatus } : i
      ))

      // Also update candidate status to withdrawn
      if (interview.candidateId) {
        const candidateRef = doc(db, 'candidates', interview.candidateId)
        await updateDoc(candidateRef, {
          status: 'withdrawn',
          withdrawalReason: `No show to ${interview.type || 'interview'}`,
          withdrawnAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })

        // Log activity
        await addDoc(collection(db, 'activityLog'), {
          entityType: 'candidate',
          entityId: interview.candidateId,
          action: 'status_changed',
          description: `Withdrawn: No show to ${interview.type || 'interview'}`,
          previousValue: { status: 'interview_scheduled' },
          newValue: { status: 'withdrawn' },
          userId: user?.id || '',
          userName: user?.name || user?.email || 'Unknown',
          createdAt: serverTimestamp(),
        })
      }
    } catch (err) {
      console.error('Error updating interview:', err)
    }
  }

  // Check if interview is in the past
  const isPast = (timestamp: Timestamp) => {
    return timestamp.toDate() < new Date()
  }

  return (
    <div className="interviews-page">
      {/* Header */}
      <div className="interviews-header">
        <div className="header-title">
          <h1>📋 Interviews</h1>
          <p>Manage all interviews and trial shifts</p>
        </div>
        <div className="header-actions">
          <Button variant="outline" onClick={() => navigate('/calendar')}>
            📅 Calendar View
          </Button>
          <Button variant="primary" onClick={() => navigate('/candidates')}>
            + Schedule New
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="interviews-stats">
        <Card className="stat-card">
          <span className="stat-value">{stats.total}</span>
          <span className="stat-label">Total</span>
        </Card>
        <Card className="stat-card scheduled">
          <span className="stat-value">{stats.scheduled}</span>
          <span className="stat-label">Scheduled</span>
        </Card>
        <Card className="stat-card completed">
          <span className="stat-value">{stats.completed}</span>
          <span className="stat-label">Completed</span>
        </Card>
        <Card className="stat-card cancelled">
          <span className="stat-value">{stats.cancelled}</span>
          <span className="stat-label">Cancelled</span>
        </Card>
        <Card className="stat-card interviews">
          <span className="stat-value">{stats.interviews}</span>
          <span className="stat-label">Interviews</span>
        </Card>
        <Card className="stat-card trials">
          <span className="stat-value">{stats.trials}</span>
          <span className="stat-label">Trials</span>
        </Card>
      </div>

      {/* Filters */}
      <Card className="filters-card">
        <div className="filters-row">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search by candidate, job, or branch..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            {searchTerm && (
              <button className="clear-search" onClick={() => setSearchTerm('')}>
                ✕
              </button>
            )}
          </div>
          
          <div className="filter-group">
            <select 
              value={filterType} 
              onChange={(e) => setFilterType(e.target.value as InterviewType | 'all')}
              className="filter-select"
            >
              <option value="all">All Types</option>
              <option value="interview">Interviews</option>
              <option value="trial">Trials</option>
            </select>
            
            <select 
              value={filterStatus} 
              onChange={(e) => setFilterStatus(e.target.value as InterviewStatus | 'all')}
              className="filter-select"
            >
              <option value="all">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No Show</option>
            </select>
            
            <select 
              value={filterDateRange} 
              onChange={(e) => setFilterDateRange(e.target.value as typeof filterDateRange)}
              className="filter-select"
            >
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="past">Past</option>
            </select>
          </div>
        </div>
        
        <div className="filters-summary">
          Showing {filteredInterviews.length} of {interviews.length} interviews
        </div>
      </Card>

      {/* Table */}
      <Card className="table-card">
        {loading ? (
          <div className="loading-state">
            <Spinner size="lg" />
            <p>Loading interviews...</p>
          </div>
        ) : filteredInterviews.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📋</span>
            <h3>No interviews found</h3>
            <p>
              {searchTerm || filterType !== 'all' || filterStatus !== 'all'
                ? 'Try adjusting your filters'
                : 'Schedule your first interview from a candidate profile'}
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table className="interviews-table">
              <thead>
                <tr>
                  <th 
                    className={`sortable ${sortField === 'scheduledDate' ? 'active' : ''}`}
                    onClick={() => handleSort('scheduledDate')}
                  >
                    Date/Time
                    <span className="sort-icon">{sortField === 'scheduledDate' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
                  </th>
                  <th 
                    className={`sortable ${sortField === 'candidateName' ? 'active' : ''}`}
                    onClick={() => handleSort('candidateName')}
                  >
                    Candidate
                    <span className="sort-icon">{sortField === 'candidateName' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
                  </th>
                  <th 
                    className={`sortable ${sortField === 'type' ? 'active' : ''}`}
                    onClick={() => handleSort('type')}
                  >
                    Type
                    <span className="sort-icon">{sortField === 'type' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
                  </th>
                  <th 
                    className={`sortable ${sortField === 'branchName' ? 'active' : ''}`}
                    onClick={() => handleSort('branchName')}
                  >
                    Location
                    <span className="sort-icon">{sortField === 'branchName' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
                  </th>
                  <th 
                    className={`sortable ${sortField === 'status' ? 'active' : ''}`}
                    onClick={() => handleSort('status')}
                  >
                    Status
                    <span className="sort-icon">{sortField === 'status' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
                  </th>
                  <th>Duration</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInterviews.map(interview => {
                  const { date, time } = formatDateTime(interview.scheduledDate)
                  const past = isPast(interview.scheduledDate)
                  
                  return (
                    <tr 
                      key={interview.id} 
                      className={`${past && interview.status === 'scheduled' ? 'past-scheduled' : ''}`}
                    >
                      <td className="datetime-cell">
                        <span className="cell-date">{date}</span>
                        <span className="cell-time">{time}</span>
                      </td>
                      <td className="candidate-cell">
                        <span 
                          className="candidate-link"
                          onClick={() => navigate(`/candidates/${interview.candidateId}`)}
                        >
                          {interview.candidateName}
                        </span>
                        {interview.jobTitle && (
                          <span className="job-title">{interview.jobTitle}</span>
                        )}
                      </td>
                      <td>
                        <span 
                          className={`type-badge ${interview.type}`}
                          style={{ 
                            backgroundColor: `${INTERVIEW_TYPE_COLORS[interview.type]}20`,
                            color: INTERVIEW_TYPE_COLORS[interview.type]
                          }}
                        >
                          {interview.type === 'interview' ? '📋' : '🏪'} {INTERVIEW_TYPE_LABELS[interview.type]}
                        </span>
                      </td>
                      <td className="location-cell">
                        {interview.branchName || '-'}
                      </td>
                      <td>
                        <span 
                          className={`status-badge status-${interview.status}`}
                          style={{ 
                            backgroundColor: `${INTERVIEW_STATUS_COLORS[interview.status]}20`,
                            color: INTERVIEW_STATUS_COLORS[interview.status]
                          }}
                        >
                          {INTERVIEW_STATUS_LABELS[interview.status]}
                        </span>
                      </td>
                      <td className="duration-cell">
                        {formatDuration(interview.duration)}
                      </td>
                      <td className="actions-cell">
                        <button 
                          className="action-btn view"
                          onClick={() => handleOpenDetail(interview)}
                          title="View Details"
                        >
                          👁️
                        </button>
                        {interview.status === 'scheduled' && (
                          <>
                            <button 
                              className="action-btn complete"
                              onClick={() => handleMarkCompleted(interview)}
                              title="Mark Completed"
                            >
                              ✓
                            </button>
                            <button 
                              className="action-btn no-show"
                              onClick={() => handleMarkNoShow(interview)}
                              title="Mark No Show"
                            >
                              !
                            </button>
                          </>
                        )}
                        <button 
                          className="action-btn candidate"
                          onClick={() => navigate(`/candidates/${interview.candidateId}`)}
                          title="View Candidate"
                        >
                          👤
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={handleCloseModals}
        title="Interview Details"
        size="lg"
      >
        {selectedInterview && (
          <div className="interview-detail-content">
            <div className="detail-header">
              <span className={`detail-type ${selectedInterview.type}`}>
                {selectedInterview.type === 'interview' ? '📋' : '🏪'} {INTERVIEW_TYPE_LABELS[selectedInterview.type]}
              </span>
              <span 
                className={`detail-status status-${selectedInterview.status}`}
                style={{ 
                  backgroundColor: `${INTERVIEW_STATUS_COLORS[selectedInterview.status]}20`,
                  color: INTERVIEW_STATUS_COLORS[selectedInterview.status]
                }}
              >
                {INTERVIEW_STATUS_LABELS[selectedInterview.status]}
              </span>
            </div>

            <div className="detail-section">
              <h4>Candidate</h4>
              <div className="detail-candidate">
                <div className="candidate-avatar">
                  {selectedInterview.candidateName?.split(' ').map(n => n[0]).join('') || '?'}
                </div>
                <div className="candidate-info">
                  <span className="candidate-name">{selectedInterview.candidateName}</span>
                  {selectedInterview.jobTitle && (
                    <span className="candidate-job">{selectedInterview.jobTitle}</span>
                  )}
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    handleCloseModals()
                    navigate(`/candidates/${selectedInterview.candidateId}`)
                  }}
                >
                  View Profile
                </Button>
              </div>
            </div>

            <div className="detail-section">
              <h4>Schedule</h4>
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-label">📅 Date</span>
                  <span className="detail-value">
                    {selectedInterview.scheduledDate.toDate().toLocaleDateString('en-GB', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">🕐 Time</span>
                  <span className="detail-value">
                    {formatDateTime(selectedInterview.scheduledDate).time}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">⏱️ Duration</span>
                  <span className="detail-value">
                    {formatDuration(selectedInterview.duration)}
                  </span>
                </div>
                {selectedInterview.branchName && (
                  <div className="detail-item">
                    <span className="detail-label">📍 Location</span>
                    <span className="detail-value">{selectedInterview.branchName}</span>
                  </div>
                )}
              </div>
            </div>

            {selectedInterview.notes && (
              <div className="detail-section">
                <h4>Notes</h4>
                <p className="detail-notes">{selectedInterview.notes}</p>
              </div>
            )}

            {selectedInterview.feedback && (
              <div className="detail-section">
                <h4>Feedback</h4>
                <div className="detail-feedback">
                  <div className="feedback-rating">
                    {'⭐'.repeat(selectedInterview.feedback.rating)}
                    {'☆'.repeat(5 - selectedInterview.feedback.rating)}
                  </div>
                  <span 
                    className="feedback-recommendation"
                    style={{ 
                      backgroundColor: `${FEEDBACK_COLORS[selectedInterview.feedback.recommendation]}20`,
                      color: FEEDBACK_COLORS[selectedInterview.feedback.recommendation]
                    }}
                  >
                    {FEEDBACK_LABELS[selectedInterview.feedback.recommendation]}
                  </span>
                  {selectedInterview.feedback.comments && (
                    <p className="feedback-comments">{selectedInterview.feedback.comments}</p>
                  )}
                </div>
              </div>
            )}

            {actionError && (
              <div className="detail-error">{actionError}</div>
            )}

            <div className="detail-actions">
              {selectedInterview.status === 'scheduled' && (
                <>
                  <Button variant="outline" onClick={handleOpenReschedule}>
                    📅 Reschedule
                  </Button>
                  <Button variant="outline" onClick={handleOpenCancel}>
                    ❌ Cancel
                  </Button>
                </>
              )}
              <Button variant="secondary" onClick={handleCloseModals}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reschedule Modal */}
      <Modal
        isOpen={showRescheduleModal}
        onClose={handleCloseModals}
        title="Reschedule Interview"
        size="sm"
      >
        <div className="reschedule-modal">
          <p className="reschedule-info">
            Rescheduling interview with <strong>{selectedInterview?.candidateName}</strong>
          </p>
          
          <div className="form-group">
            <label>New Date</label>
            <Input
              type="date"
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
            />
          </div>
          
          <div className="form-group">
            <label>New Time</label>
            <Input
              type="time"
              value={rescheduleTime}
              onChange={(e) => setRescheduleTime(e.target.value)}
            />
          </div>

          {actionError && (
            <div className="modal-error">{actionError}</div>
          )}

          <div className="modal-actions">
            <Button variant="secondary" onClick={handleCloseModals}>
              Cancel
            </Button>
            <Button 
              variant="primary" 
              onClick={handleReschedule}
              disabled={actionLoading || !rescheduleDate || !rescheduleTime}
            >
              {actionLoading ? 'Saving...' : 'Reschedule'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Cancel Modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={handleCloseModals}
        title="Cancel Interview"
        size="sm"
      >
        <div className="cancel-modal">
          <p className="cancel-warning">
            Are you sure you want to cancel the interview with <strong>{selectedInterview?.candidateName}</strong>?
          </p>
          
          <div className="form-group">
            <label>Reason (optional)</label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Enter cancellation reason..."
              rows={3}
            />
          </div>

          {actionError && (
            <div className="modal-error">{actionError}</div>
          )}

          <div className="modal-actions">
            <Button variant="secondary" onClick={handleCloseModals}>
              Keep Interview
            </Button>
            <Button 
              variant="danger" 
              onClick={handleCancel}
              disabled={actionLoading}
            >
              {actionLoading ? 'Cancelling...' : 'Cancel Interview'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default Interviews
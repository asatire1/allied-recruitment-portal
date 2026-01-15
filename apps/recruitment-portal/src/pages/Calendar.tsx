/**
 * Calendar Page - R6.7 + R6.9
 * 
 * Month view calendar showing all interviews and trials
 * with a day detail panel and interview detail modal.
 */

import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { collection, query, where, orderBy, getDocs, doc, updateDoc, addDoc, Timestamp, serverTimestamp } from 'firebase/firestore'
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
import type { Interview, InterviewStatus, InterviewType, FeedbackRecommendation } from '@allied/shared-lib'
import { Card, Button, Spinner, Badge, Modal, Input, Textarea, Select } from '@allied/shared-ui'
import { useAuth } from '../contexts/AuthContext'
import './Calendar.css'

// ============================================================================
// Types
// ============================================================================

interface CalendarDay {
  date: Date
  isCurrentMonth: boolean
  isToday: boolean
  interviews: Interview[]
}

// ============================================================================
// Constants
// ============================================================================

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

// ============================================================================
// Component
// ============================================================================

export function Calendar() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const db = getFirebaseDb()

  // State
  const [currentDate, setCurrentDate] = useState(() => {
    const yearParam = searchParams.get('year')
    const monthParam = searchParams.get('month')
    if (yearParam && monthParam) {
      return new Date(parseInt(yearParam), parseInt(monthParam) - 1, 1)
    }
    return new Date()
  })
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<InterviewType | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<InterviewStatus | 'all'>('all')

  // R6.9: Interview detail modal state
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showRescheduleModal, setShowRescheduleModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')

  // Get the start and end of the current month view (including padding days)
  const { startDate, endDate } = useMemo(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    
    // First day of the month
    const firstDay = new Date(year, month, 1)
    // Last day of the month
    const lastDay = new Date(year, month + 1, 0)
    
    // Start from the Sunday before the first day
    const start = new Date(firstDay)
    start.setDate(start.getDate() - start.getDay())
    
    // End on the Saturday after the last day
    const end = new Date(lastDay)
    end.setDate(end.getDate() + (6 - end.getDay()))
    end.setHours(23, 59, 59, 999)
    
    return { startDate: start, endDate: end }
  }, [currentDate])

  // Fetch interviews for the current view
  useEffect(() => {
    async function fetchInterviews() {
      try {
        setLoading(true)
        
        const interviewsRef = collection(db, 'interviews')
        const q = query(
          interviewsRef,
          where('scheduledDate', '>=', Timestamp.fromDate(startDate)),
          where('scheduledDate', '<=', Timestamp.fromDate(endDate)),
          orderBy('scheduledDate', 'asc')
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
  }, [db, startDate, endDate])

  // Update URL when month changes
  useEffect(() => {
    setSearchParams({
      year: String(currentDate.getFullYear()),
      month: String(currentDate.getMonth() + 1),
    })
  }, [currentDate, setSearchParams])

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const days: CalendarDay[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const current = new Date(startDate)
    
    while (current <= endDate) {
      const dayDate = new Date(current)
      const isCurrentMonth = dayDate.getMonth() === currentDate.getMonth()
      const isToday = dayDate.getTime() === today.getTime()
      
      // Get interviews for this day
      const dayStart = new Date(dayDate)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(dayDate)
      dayEnd.setHours(23, 59, 59, 999)
      
      let dayInterviews = interviews.filter(interview => {
        const interviewDate = interview.scheduledDate.toDate()
        return interviewDate >= dayStart && interviewDate <= dayEnd
      })
      
      // Apply filters
      if (filterType !== 'all') {
        dayInterviews = dayInterviews.filter(i => i.type === filterType)
      }
      if (filterStatus !== 'all') {
        dayInterviews = dayInterviews.filter(i => i.status === filterStatus)
      }
      
      days.push({
        date: dayDate,
        isCurrentMonth,
        isToday,
        interviews: dayInterviews,
      })
      
      current.setDate(current.getDate() + 1)
    }
    
    return days
  }, [startDate, endDate, currentDate, interviews, filterType, filterStatus])

  // Get interviews for selected day
  const selectedDayInterviews = useMemo(() => {
    if (!selectedDate) return []
    
    const dayStart = new Date(selectedDate)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(selectedDate)
    dayEnd.setHours(23, 59, 59, 999)
    
    let filtered = interviews.filter(interview => {
      const interviewDate = interview.scheduledDate.toDate()
      return interviewDate >= dayStart && interviewDate <= dayEnd
    })
    
    if (filterType !== 'all') {
      filtered = filtered.filter(i => i.type === filterType)
    }
    if (filterStatus !== 'all') {
      filtered = filtered.filter(i => i.status === filterStatus)
    }
    
    return filtered.sort((a, b) => 
      a.scheduledDate.toDate().getTime() - b.scheduledDate.toDate().getTime()
    )
  }, [selectedDate, interviews, filterType, filterStatus])

  // Navigation handlers
  const goToPreviousMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  const goToNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  const goToToday = () => {
    const today = new Date()
    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelectedDate(today)
  }

  // Handle day click
  const handleDayClick = (day: CalendarDay) => {
    setSelectedDate(day.date)
  }

  // Navigate to candidate
  const handleViewCandidate = (candidateId: string) => {
    navigate(`/candidates/${candidateId}`)
  }

  // Format time
  const formatTime = (timestamp: Timestamp) => {
    return timestamp.toDate().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // R6.9: Open interview detail modal
  const handleOpenDetail = (interview: Interview) => {
    setSelectedInterview(interview)
    setShowDetailModal(true)
    setActionError('')
  }

  // R6.9: Close all modals
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

  // R6.9: Open reschedule modal
  const handleOpenReschedule = () => {
    if (selectedInterview) {
      const scheduledDate = selectedInterview.scheduledDate.toDate()
      setRescheduleDate(scheduledDate.toISOString().split('T')[0])
      setRescheduleTime(scheduledDate.toTimeString().slice(0, 5))
    }
    setShowDetailModal(false)
    setShowRescheduleModal(true)
    setActionError('')
  }

  // R6.9: Open cancel modal
  const handleOpenCancel = () => {
    setShowDetailModal(false)
    setShowCancelModal(true)
    setCancelReason('')
    setActionError('')
  }

  // R6.9: Reschedule interview
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

      // Update local state
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

  // R6.9: Cancel interview
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

      // Update local state
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

  // R6.9: Mark as completed
  const handleMarkCompleted = async () => {
    if (!selectedInterview) return

    setActionLoading(true)
    setActionError('')

    try {
      const interviewRef = doc(db, 'interviews', selectedInterview.id)
      
      await updateDoc(interviewRef, {
        status: 'completed',
        updatedAt: serverTimestamp(),
      })

      // Update local state
      setInterviews(prev => prev.map(i => 
        i.id === selectedInterview.id 
          ? { ...i, status: 'completed' as InterviewStatus }
          : i
      ))

      handleCloseModals()
    } catch (err) {
      console.error('Error updating interview:', err)
      setActionError('Failed to update interview')
    } finally {
      setActionLoading(false)
    }
  }

  // R6.9: Mark as no-show
  const handleMarkNoShow = async () => {
    if (!selectedInterview) return

    setActionLoading(true)
    setActionError('')

    try {
      const interviewRef = doc(db, 'interviews', selectedInterview.id)
      
      await updateDoc(interviewRef, {
        status: 'no_show',
        updatedAt: serverTimestamp(),
      })

      // Also update candidate status to withdrawn
      if (selectedInterview.candidateId) {
        const candidateRef = doc(db, 'candidates', selectedInterview.candidateId)
        await updateDoc(candidateRef, {
          status: 'withdrawn',
          withdrawalReason: `No show to ${selectedInterview.type || 'interview'}`,
          withdrawnAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })

        // Log activity
        await addDoc(collection(db, 'activityLog'), {
          entityType: 'candidate',
          entityId: selectedInterview.candidateId,
          action: 'status_changed',
          description: `Withdrawn: No show to ${selectedInterview.type || 'interview'}`,
          previousValue: { status: 'interview_scheduled' },
          newValue: { status: 'withdrawn' },
          userId: user?.id || '',
          userName: user?.name || user?.email || 'Unknown',
          createdAt: serverTimestamp(),
        })
      }

      // Update local state
      setInterviews(prev => prev.map(i => 
        i.id === selectedInterview.id 
          ? { ...i, status: 'no_show' as InterviewStatus }
          : i
      ))

      handleCloseModals()
    } catch (err) {
      console.error('Error updating interview:', err)
      setActionError('Failed to update interview')
    } finally {
      setActionLoading(false)
    }
  }

  // Stats for current month
  const monthStats = useMemo(() => {
    const monthInterviews = interviews.filter(i => {
      const date = i.scheduledDate.toDate()
      return date.getMonth() === currentDate.getMonth() && 
             date.getFullYear() === currentDate.getFullYear()
    })
    
    return {
      total: monthInterviews.length,
      interviews: monthInterviews.filter(i => i.type === 'interview').length,
      trials: monthInterviews.filter(i => i.type === 'trial').length,
      scheduled: monthInterviews.filter(i => i.status === 'scheduled').length,
      completed: monthInterviews.filter(i => i.status === 'completed').length,
    }
  }, [interviews, currentDate])

  return (
    <div className="calendar-page">
      {/* Header */}
      <div className="calendar-header">
        <div className="calendar-title">
          <h1>📅 Calendar</h1>
          <p>View and manage all interviews and trials</p>
        </div>
        
        <div className="calendar-actions">
          <Button variant="primary" onClick={() => navigate('/interviews/new')}>
            + Schedule Interview
          </Button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="calendar-stats">
        <div className="stat-item">
          <span className="stat-value">{monthStats.total}</span>
          <span className="stat-label">Total</span>
        </div>
        <div className="stat-item">
          <span className="stat-value stat-interviews">{monthStats.interviews}</span>
          <span className="stat-label">Interviews</span>
        </div>
        <div className="stat-item">
          <span className="stat-value stat-trials">{monthStats.trials}</span>
          <span className="stat-label">Trials</span>
        </div>
        <div className="stat-item">
          <span className="stat-value stat-scheduled">{monthStats.scheduled}</span>
          <span className="stat-label">Scheduled</span>
        </div>
        <div className="stat-item">
          <span className="stat-value stat-completed">{monthStats.completed}</span>
          <span className="stat-label">Completed</span>
        </div>
      </div>

      <div className="calendar-layout">
        {/* Calendar Grid */}
        <Card className="calendar-card">
          {/* Navigation & Filters */}
          <div className="calendar-nav">
            <div className="nav-controls">
              <button className="nav-btn" onClick={goToPreviousMonth}>
                ← Prev
              </button>
              <h2 className="current-month">
                {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h2>
              <button className="nav-btn" onClick={goToNextMonth}>
                Next →
              </button>
              <button className="today-btn" onClick={goToToday}>
                Today
              </button>
            </div>
            
            <div className="filter-controls">
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
            </div>
          </div>

          {loading ? (
            <div className="calendar-loading">
              <Spinner size="lg" />
              <p>Loading calendar...</p>
            </div>
          ) : (
            <>
              {/* Weekday Headers */}
              <div className="calendar-weekdays">
                {WEEKDAYS.map(day => (
                  <div key={day} className="weekday-header">{day}</div>
                ))}
              </div>

              {/* Calendar Grid */}
              <div className="calendar-grid">
                {calendarDays.map((day, index) => (
                  <div
                    key={index}
                    className={`calendar-day ${!day.isCurrentMonth ? 'other-month' : ''} ${day.isToday ? 'today' : ''} ${selectedDate?.toDateString() === day.date.toDateString() ? 'selected' : ''}`}
                    onClick={() => handleDayClick(day)}
                  >
                    <span className="day-number">{day.date.getDate()}</span>
                    
                    {day.interviews.length > 0 && (
                      <div className="day-events">
                        {day.interviews.slice(0, 3).map(interview => {
                          const typeLabel = INTERVIEW_TYPE_LABELS[interview.type]
                          const statusLabel = INTERVIEW_STATUS_LABELS[interview.status]
                          const tooltip = `${formatTime(interview.scheduledDate)} - ${interview.candidateName}\n${typeLabel} • ${statusLabel}${interview.branchName ? `\n📍 ${interview.branchName}` : ''}`
                          
                          return (
                            <div 
                              key={interview.id}
                              className={`event-dot ${interview.type} status-${interview.status}`}
                              title={tooltip}
                              onClick={(e) => {
                                e.stopPropagation()
                                // Select the day and scroll to this interview
                                handleDayClick(day)
                              }}
                            >
                              <span className="event-time">{formatTime(interview.scheduledDate)}</span>
                            </div>
                          )
                        })}
                        {day.interviews.length > 3 && (
                          <div className="more-events" title={`${day.interviews.length - 3} more appointments`}>
                            +{day.interviews.length - 3} more
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        {/* Day Detail Panel */}
        <Card className="day-detail-card">
          {selectedDate ? (
            <>
              <div className="day-detail-header">
                <h3>
                  {selectedDate.toLocaleDateString('en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </h3>
                <span className="event-count">
                  {selectedDayInterviews.length} appointment{selectedDayInterviews.length !== 1 ? 's' : ''}
                </span>
              </div>

              {selectedDayInterviews.length === 0 ? (
                <div className="no-events">
                  <span className="no-events-icon">📅</span>
                  <p>No appointments scheduled for this day</p>
                  <Button 
                    variant="outline" 
                    onClick={() => navigate('/interviews/new')}
                  >
                    Schedule an Interview
                  </Button>
                </div>
              ) : (
                <div className="day-events-list">
                  {selectedDayInterviews.map(interview => (
                    <div 
                      key={interview.id}
                      id={`event-${interview.id}`}
                      className={`event-card type-${interview.type} status-${interview.status}`}
                    >
                      <div className="event-time-block">
                        <span className="event-start-time">
                          {formatTime(interview.scheduledDate)}
                        </span>
                        <span className="event-duration">
                          {formatDuration(interview.duration)}
                        </span>
                      </div>
                      
                      <div className="event-details">
                        <div className="event-header">
                          <span className={`event-type-badge ${interview.type}`}>
                            {interview.type === 'interview' ? '📋' : '🏪'} {INTERVIEW_TYPE_LABELS[interview.type]}
                          </span>
                          <span 
                            className={`event-status-badge status-${interview.status}`}
                            style={{ backgroundColor: `${INTERVIEW_STATUS_COLORS[interview.status]}20`, color: INTERVIEW_STATUS_COLORS[interview.status] }}
                          >
                            {INTERVIEW_STATUS_LABELS[interview.status]}
                          </span>
                        </div>
                        
                        <h4 className="event-candidate-name">
                          {interview.candidateName}
                        </h4>
                        
                        {interview.jobTitle && (
                          <p className="event-job-title">{interview.jobTitle}</p>
                        )}
                        
                        {interview.branchName && (
                          <p className="event-location">
                            📍 {interview.branchName}
                          </p>
                        )}
                        
                        <div className="event-actions">
                          <button 
                            className="event-action-btn"
                            onClick={() => handleViewCandidate(interview.candidateId)}
                          >
                            View Candidate
                          </button>
                          <button 
                            className="event-action-btn primary"
                            onClick={() => handleOpenDetail(interview)}
                          >
                            View Details
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="no-date-selected">
              <span className="no-date-icon">👆</span>
              <p>Select a day to view appointments</p>
            </div>
          )}
        </Card>
      </div>

      {/* R6.9: Interview Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={handleCloseModals}
        title="Interview Details"
        size="lg"
      >
        {selectedInterview && (
          <div className="interview-detail-modal">
            {/* Header */}
            <div className="detail-header">
              <div className="detail-type-status">
                <span className={`detail-type ${selectedInterview.type}`}>
                  {selectedInterview.type === 'interview' ? '📋' : '🏪'} {INTERVIEW_TYPE_LABELS[selectedInterview.type]}
                </span>
                <span 
                  className={`detail-status status-${selectedInterview.status}`}
                  style={{ backgroundColor: `${INTERVIEW_STATUS_COLORS[selectedInterview.status]}20`, color: INTERVIEW_STATUS_COLORS[selectedInterview.status] }}
                >
                  {INTERVIEW_STATUS_LABELS[selectedInterview.status]}
                </span>
              </div>
            </div>

            {/* Candidate Info */}
            <div className="detail-section">
              <h4>Candidate</h4>
              <div className="detail-candidate">
                <div className="candidate-avatar">
                  {selectedInterview.candidateName.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="candidate-info">
                  <span className="candidate-name">{selectedInterview.candidateName}</span>
                  {selectedInterview.jobTitle && (
                    <span className="candidate-job">{selectedInterview.jobTitle}</span>
                  )}
                  {selectedInterview.candidateEmail && (
                    <span className="candidate-email">{selectedInterview.candidateEmail}</span>
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

            {/* Schedule Info */}
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
                    {formatTime(selectedInterview.scheduledDate)}
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
                    <span className="detail-value">
                      {selectedInterview.branchName}
                      {selectedInterview.branchAddress && (
                        <small>{selectedInterview.branchAddress}</small>
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            {selectedInterview.notes && (
              <div className="detail-section">
                <h4>Notes</h4>
                <p className="detail-notes">{selectedInterview.notes}</p>
              </div>
            )}

            {/* Feedback (if completed) */}
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

            {/* Rescheduled info */}
            {selectedInterview.rescheduledCount && selectedInterview.rescheduledCount > 0 && (
              <div className="detail-rescheduled">
                ⚠️ This interview has been rescheduled {selectedInterview.rescheduledCount} time{selectedInterview.rescheduledCount > 1 ? 's' : ''}
              </div>
            )}

            {actionError && (
              <div className="detail-error">{actionError}</div>
            )}

            {/* Actions */}
            <div className="detail-actions">
              {selectedInterview.status === 'scheduled' && (
                <>
                  <Button variant="outline" onClick={handleOpenReschedule}>
                    📅 Reschedule
                  </Button>
                  <Button variant="outline" onClick={handleOpenCancel}>
                    ❌ Cancel
                  </Button>
                  <Button variant="primary" onClick={handleMarkCompleted}>
                    ✓ Mark Completed
                  </Button>
                  <Button variant="secondary" onClick={handleMarkNoShow}>
                    ! No Show
                  </Button>
                </>
              )}
              {selectedInterview.status === 'completed' && !selectedInterview.feedback && (
                <Button variant="primary" onClick={() => navigate(`/interviews/${selectedInterview.id}/feedback`)}>
                  📝 Add Feedback
                </Button>
              )}
              <Button variant="secondary" onClick={handleCloseModals}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* R6.9: Reschedule Modal */}
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

      {/* R6.9: Cancel Modal */}
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

      {/* Legend */}
      <div className="calendar-legend">
        <span className="legend-title">Legend:</span>
        <div className="legend-section">
          <span className="legend-label">Type:</span>
          <div className="legend-item">
            <span className="legend-marker interview"></span>
            <span>Interview</span>
          </div>
          <div className="legend-item">
            <span className="legend-marker trial"></span>
            <span>Trial</span>
          </div>
        </div>
        <div className="legend-section">
          <span className="legend-label">Status:</span>
          <div className="legend-item">
            <span className="legend-marker scheduled"></span>
            <span>Scheduled</span>
          </div>
          <div className="legend-item">
            <span className="legend-marker completed"></span>
            <span>Completed</span>
          </div>
          <div className="legend-item">
            <span className="legend-marker cancelled"></span>
            <span>Cancelled</span>
          </div>
          <div className="legend-item">
            <span className="legend-marker no-show"></span>
            <span>No Show</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Calendar
// ============================================================================
// Allied Recruitment Portal - Pending Feedback Queue (R10.5)
// Location: apps/recruitment-portal/src/pages/PendingFeedback.tsx
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore'
import { getFirebaseDb } from '@allied/shared-lib'
import type { Interview } from '@allied/shared-lib'
import { INTERVIEW_TYPE_LABELS } from '@allied/shared-lib'
import { Card, Button, Spinner } from '@allied/shared-ui'
import { useAuth } from '../contexts/AuthContext'
import './PendingFeedback.css'

interface PendingItem {
  interview: Interview
  daysOverdue: number
}

export default function PendingFeedback() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'overdue' | 'mine'>('all')

  const loadPendingFeedback = useCallback(async () => {
    try {
      setLoading(true)
      const db = getFirebaseDb()
      
      // Get all scheduled and completed interviews, filter in memory
      const interviewsQuery = query(
        collection(db, 'interviews'),
        where('status', 'in', ['scheduled', 'completed', 'pending_feedback'])
      )
      
      const interviewsSnap = await getDocs(interviewsQuery)
      const allInterviews = interviewsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Interview[]
      
      const now = new Date()
      const items: PendingItem[] = []
      
      for (const interview of allInterviews) {
        const scheduledDate = (interview as any).scheduledDate?.toDate?.() || new Date(0)
        // Only include if interview date has passed and no feedback submitted
        if (scheduledDate < now && !interview.feedback?.submittedAt) {
          const daysOverdue = Math.floor((now.getTime() - scheduledDate.getTime()) / (1000 * 60 * 60 * 24)) - 2
          items.push({ interview, daysOverdue: Math.max(0, daysOverdue) })
        }
      }
      
      items.sort((a, b) => b.daysOverdue - a.daysOverdue)
      setPendingItems(items)
    } catch (err) {
      console.error('Error loading pending feedback:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPendingFeedback() }, [loadPendingFeedback])

  const filteredItems = pendingItems.filter(item => {
    if (filter === 'overdue') return item.daysOverdue > 0
    if (filter === 'mine') return item.interview.interviewerId === user?.uid
    return true
  })

  const stats = {
    total: pendingItems.length,
    overdue: pendingItems.filter(i => i.daysOverdue > 0).length,
    mine: pendingItems.filter(i => i.interview.interviewerId === user?.uid).length,
  }

  const handleAddFeedback = (interview: Interview) => {
    navigate(`/candidates/${interview.candidateId}`)
  }

  if (loading) {
    return (
      <div className="page pending-feedback-page">
        <div className="loading-state"><Spinner size="lg" /><p>Loading pending feedback...</p></div>
      </div>
    )
  }

  return (
    <div className="page pending-feedback-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pending Feedback</h1>
          <p className="page-description">Interviews awaiting your feedback</p>
        </div>
      </div>

      <div className="stats-row">
        <Card className={`stat-card ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total Pending</div>
        </Card>
        <Card className={`stat-card overdue ${filter === 'overdue' ? 'active' : ''}`} onClick={() => setFilter('overdue')}>
          <div className="stat-value">{stats.overdue}</div>
          <div className="stat-label">Overdue</div>
        </Card>
        <Card className={`stat-card ${filter === 'mine' ? 'active' : ''}`} onClick={() => setFilter('mine')}>
          <div className="stat-value">{stats.mine}</div>
          <div className="stat-label">My Interviews</div>
        </Card>
      </div>

      {filteredItems.length === 0 ? (
        <Card className="empty-state">
          <div className="empty-icon">✓</div>
          <h3>All caught up!</h3>
          <p>No pending feedback at the moment.</p>
        </Card>
      ) : (
        <div className="pending-list">
          {filteredItems.map(item => {
            const interviewDate = (item.interview as any).scheduledDate?.toDate?.() || new Date()
            return (
              <Card key={item.interview.id} className="pending-item">
                <div className="pending-item-left">
                  <div className="candidate-name">{item.interview.candidateName}</div>
                  <div className="interview-details">
                    <span className="interview-type">{INTERVIEW_TYPE_LABELS[item.interview.type as keyof typeof INTERVIEW_TYPE_LABELS] || item.interview.type}</span>
                    <span className="separator">•</span>
                    <span className="interview-date">{interviewDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                    {item.interview.jobTitle && <><span className="separator">•</span><span className="job-title">{item.interview.jobTitle}</span></>}
                  </div>
                  {item.interview.interviewerName && <div className="interviewer">Interviewer: {item.interview.interviewerName}</div>}
                </div>
                <div className="pending-item-right">
                  {item.daysOverdue > 0 && <span className="overdue-badge">{item.daysOverdue} day{item.daysOverdue !== 1 ? 's' : ''} overdue</span>}
                  <Button variant="primary" size="sm" onClick={() => handleAddFeedback(item.interview)}>Add Feedback</Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

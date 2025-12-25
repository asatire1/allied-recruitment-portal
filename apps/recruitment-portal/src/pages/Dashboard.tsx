import { useEffect, useState } from 'react'
import { collection, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore'
import { getFirebaseDb, COLLECTIONS } from '@allied/shared-lib'
import type { Candidate, Interview, Job, CandidateStatus } from '@allied/shared-lib'
import { Card, Spinner, Badge } from '@allied/shared-ui'
import { useAuth } from '../contexts/AuthContext'
import './Dashboard.css'

// ============================================================================
// TYPES
// ============================================================================

interface DashboardStats {
  totalCandidates: number
  newCandidates: number
  interviewsThisWeek: number
  trialsThisWeek: number
  activeJobs: number
  pendingFeedback: number
}

interface RecentCandidate {
  id: string
  name: string
  status: CandidateStatus
  jobTitle?: string
  createdAt: Date
}

interface UpcomingInterview {
  id: string
  candidateName: string
  type: 'interview' | 'trial'
  scheduledAt: Date
  branchName: string
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getStatusColor = (status: CandidateStatus): string => {
  const colors: Record<CandidateStatus, string> = {
    new: 'info',
    screening: 'warning',
    interview_scheduled: 'info',
    interview_complete: 'info',
    trial_scheduled: 'info',
    trial_complete: 'info',
    approved: 'success',
    rejected: 'error',
    withdrawn: 'neutral',
  }
  return colors[status] || 'neutral'
}

const formatDate = (date: Date): string => {
  const now = new Date()
  const diff = date.getTime() - now.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  
  if (days === 0) {
    return 'Today, ' + date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  } else if (days === 1) {
    return 'Tomorrow, ' + date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  } else if (days < 7) {
    return date.toLocaleDateString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const formatRelativeDate = (date: Date): string => {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ============================================================================
// COMPONENT
// ============================================================================

export function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentCandidates, setRecentCandidates] = useState<RecentCandidate[]>([])
  const [upcomingInterviews, setUpcomingInterviews] = useState<UpcomingInterview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const db = getFirebaseDb()

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        setLoading(true)
        setError(null)

        const now = new Date()
        const startOfWeek = new Date(now)
        startOfWeek.setDate(now.getDate() - now.getDay())
        startOfWeek.setHours(0, 0, 0, 0)
        
        const endOfWeek = new Date(startOfWeek)
        endOfWeek.setDate(startOfWeek.getDate() + 7)

        // Fetch candidates
        const candidatesRef = collection(db, COLLECTIONS.CANDIDATES)
        const candidatesSnapshot = await getDocs(candidatesRef)
        const candidates = candidatesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Candidate[]

        // Calculate candidate stats
        const totalCandidates = candidates.length
        const newCandidates = candidates.filter(c => c.status === 'new').length

        // Fetch interviews
        const interviewsRef = collection(db, COLLECTIONS.INTERVIEWS)
        const interviewsQuery = query(
          interviewsRef,
          where('scheduledAt', '>=', Timestamp.fromDate(now)),
          orderBy('scheduledAt', 'asc'),
          limit(20)
        )
        
        let interviews: Interview[] = []
        try {
          const interviewsSnapshot = await getDocs(interviewsQuery)
          interviews = interviewsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Interview[]
        } catch (e) {
          console.log('Interviews query failed, trying without index:', e)
          // Fallback without complex query
          const simpleInterviewsSnapshot = await getDocs(interviewsRef)
          interviews = simpleInterviewsSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }) as Interview)
            .filter(i => i.scheduledAt && i.scheduledAt.toDate() >= now)
            .sort((a, b) => a.scheduledAt.toDate().getTime() - b.scheduledAt.toDate().getTime())
            .slice(0, 20)
        }

        const interviewsThisWeek = interviews.filter(i => 
          i.type === 'interview' && 
          i.scheduledAt.toDate() >= startOfWeek && 
          i.scheduledAt.toDate() < endOfWeek
        ).length

        const trialsThisWeek = interviews.filter(i => 
          i.type === 'trial' && 
          i.scheduledAt.toDate() >= startOfWeek && 
          i.scheduledAt.toDate() < endOfWeek
        ).length

        // Fetch jobs
        const jobsRef = collection(db, COLLECTIONS.JOBS)
        const jobsSnapshot = await getDocs(jobsRef)
        const jobs = jobsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Job[]
        const activeJobs = jobs.filter(j => j.status === 'active').length

        // Pending feedback (trials completed but no feedback)
        const pendingFeedback = interviews.filter(i => 
          i.type === 'trial' && 
          i.status === 'completed' && 
          !i.feedback
        ).length

        // Set stats
        setStats({
          totalCandidates,
          newCandidates,
          interviewsThisWeek,
          trialsThisWeek,
          activeJobs,
          pendingFeedback,
        })

        // Recent candidates (last 5)
        const sortedCandidates = [...candidates]
          .sort((a, b) => {
            const aDate = a.createdAt?.toDate?.() || new Date(0)
            const bDate = b.createdAt?.toDate?.() || new Date(0)
            return bDate.getTime() - aDate.getTime()
          })
          .slice(0, 5)

        setRecentCandidates(sortedCandidates.map(c => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}`,
          status: c.status,
          jobTitle: c.jobTitle,
          createdAt: c.createdAt?.toDate?.() || new Date(),
        })))

        // Upcoming interviews (next 5)
        setUpcomingInterviews(
          interviews
            .filter(i => i.status === 'scheduled')
            .slice(0, 5)
            .map(i => ({
              id: i.id,
              candidateName: i.candidateName,
              type: i.type,
              scheduledAt: i.scheduledAt.toDate(),
              branchName: i.branchName,
            }))
        )

      } catch (err) {
        console.error('Error fetching dashboard data:', err)
        setError('Failed to load dashboard data')
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [db])

  if (loading) {
    return (
      <div className="dashboard-loading">
        <Spinner size="lg" />
        <p>Loading dashboard...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="dashboard-error">
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <p className="dashboard-welcome">Welcome back, {user?.displayName || 'User'}</p>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <Card className="stat-card">
          <div className="stat-icon candidates">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats?.totalCandidates || 0}</span>
            <span className="stat-label">Total Candidates</span>
          </div>
        </Card>

        <Card className="stat-card">
          <div className="stat-icon new">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats?.newCandidates || 0}</span>
            <span className="stat-label">New Candidates</span>
          </div>
        </Card>

        <Card className="stat-card">
          <div className="stat-icon interviews">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats?.interviewsThisWeek || 0}</span>
            <span className="stat-label">Interviews This Week</span>
          </div>
        </Card>

        <Card className="stat-card">
          <div className="stat-icon trials">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats?.trialsThisWeek || 0}</span>
            <span className="stat-label">Trials This Week</span>
          </div>
        </Card>

        <Card className="stat-card">
          <div className="stat-icon jobs">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats?.activeJobs || 0}</span>
            <span className="stat-label">Active Jobs</span>
          </div>
        </Card>

        <Card className="stat-card">
          <div className="stat-icon feedback">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats?.pendingFeedback || 0}</span>
            <span className="stat-label">Pending Feedback</span>
          </div>
        </Card>
      </div>

      {/* Content Grid */}
      <div className="dashboard-content">
        {/* Recent Candidates */}
        <Card className="dashboard-card">
          <div className="card-header">
            <h2>Recent Candidates</h2>
            <a href="/candidates" className="view-all">View all →</a>
          </div>
          <div className="card-content">
            {recentCandidates.length === 0 ? (
              <p className="empty-message">No candidates yet</p>
            ) : (
              <ul className="candidate-list">
                {recentCandidates.map(candidate => (
                  <li key={candidate.id} className="candidate-item">
                    <div className="candidate-info">
                      <span className="candidate-name">{candidate.name}</span>
                      <span className="candidate-job">{candidate.jobTitle || 'No job assigned'}</span>
                    </div>
                    <div className="candidate-meta">
                      <Badge variant={getStatusColor(candidate.status) as any}>
                        {candidate.status.replace(/_/g, ' ')}
                      </Badge>
                      <span className="candidate-date">{formatRelativeDate(candidate.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        {/* Upcoming Interviews */}
        <Card className="dashboard-card">
          <div className="card-header">
            <h2>Upcoming Interviews & Trials</h2>
            <a href="/interviews" className="view-all">View all →</a>
          </div>
          <div className="card-content">
            {upcomingInterviews.length === 0 ? (
              <p className="empty-message">No upcoming interviews or trials</p>
            ) : (
              <ul className="interview-list">
                {upcomingInterviews.map(interview => (
                  <li key={interview.id} className="interview-item">
                    <div className="interview-type">
                      <Badge variant={interview.type === 'interview' ? 'info' : 'success'}>
                        {interview.type}
                      </Badge>
                    </div>
                    <div className="interview-info">
                      <span className="interview-candidate">{interview.candidateName}</span>
                      <span className="interview-branch">{interview.branchName}</span>
                    </div>
                    <div className="interview-date">
                      {formatDate(interview.scheduledAt)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

export default Dashboard

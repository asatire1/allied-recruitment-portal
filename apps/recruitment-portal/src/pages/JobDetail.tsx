import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore'
import { getFirebaseDb, COLLECTIONS } from '@allied/shared-lib'
import type { Job, Candidate, CandidateStatus, JobStatus } from '@allied/shared-lib'
import { Card, Button, Badge, Spinner, Modal, Select } from '@allied/shared-ui'
import { useAuth } from '../contexts/AuthContext'
import './JobDetail.css'

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_COLORS: Record<CandidateStatus, string> = {
  new: 'info',
  invite_sent: 'warning',
  screening: 'warning',
  interview_scheduled: 'info',
  interview_complete: 'info',
  trial_scheduled: 'info',
  trial_complete: 'info',
  approved: 'success',
  offer_made: 'success',
  hired: 'success',
  rejected: 'danger',
  withdrawn: 'danger',
  on_hold: 'warning',
}

const JOB_STATUS_COLORS: Record<JobStatus, string> = {
  active: 'success',
  draft: 'warning',
  closed: 'danger',
}

const PIPELINE_STAGES: { status: CandidateStatus | 'all'; label: string }[] = [
  { status: 'all', label: 'All' },
  { status: 'new', label: 'New' },
  { status: 'invite_sent', label: 'Invite Sent' },
  { status: 'interview_scheduled', label: 'Interview' },
  { status: 'trial_scheduled', label: 'Trial' },
  { status: 'approved', label: 'Approved' },
  { status: 'hired', label: 'Hired' },
]

const CATEGORY_LABELS: Record<string, string> = {
  clinical: 'Clinical',
  dispensary: 'Dispensary',
  retail: 'Retail',
  management: 'Management',
  support: 'Support',
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const formatDate = (timestamp: any): string => {
  if (!timestamp) return '-'
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

const formatSalary = (min?: number, max?: number, period?: string, notes?: string): string => {
  if (!min && !max) return 'Not specified'
  const formatNum = (n: number) => n >= 1000 ? `£${(n / 1000).toFixed(0)}k` : `£${n}`
  const suffix = period === 'hourly' ? '/hr' : '/yr'
  
  let salary = ''
  if (min && max) {
    salary = `${formatNum(min)} - ${formatNum(max)}${suffix}`
  } else if (min) {
    salary = `From ${formatNum(min)}${suffix}`
  } else if (max) {
    salary = `Up to ${formatNum(max)}${suffix}`
  }
  
  if (notes) {
    salary += ` (${notes})`
  }
  
  return salary || 'Not specified'
}

const getEmploymentTypeLabel = (type: string): string => {
  // Handle both old and new format
  if (!type) return '-'
  if (!type.includes('_')) return type // New format - already a label
  const labels: Record<string, string> = {
    full_time: 'Full-time',
    part_time: 'Part-time',
    contract: 'Contract',
    locum: 'Locum',
  }
  return labels[type] || type
}

// ============================================================================
// COMPONENT
// ============================================================================

export function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  
  const [job, setJob] = useState<Job | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Candidate filtering
  const [statusFilter, setStatusFilter] = useState<string>('all')
  
  // Status modal
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [newStatus, setNewStatus] = useState<JobStatus>('active')
  const [closedReason, setClosedReason] = useState<string>('')
  const [updatingStatus, setUpdatingStatus] = useState(false)
  
  // Internal notes visibility
  const [showInternalNotes, setShowInternalNotes] = useState(false)

  const db = getFirebaseDb()

  // Fetch job and candidates
  useEffect(() => {
    async function fetchData() {
      if (!jobId) {
        setError('Job not found')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        // Fetch job
        const jobDoc = await getDoc(doc(db, COLLECTIONS.JOBS, jobId))
        if (!jobDoc.exists()) {
          setError('Job not found')
          setLoading(false)
          return
        }
        
        const jobData = { id: jobDoc.id, ...jobDoc.data() } as Job
        setJob(jobData)

        // Fetch candidates for this job
        // Query by multiple possible fields since legacy data may use different fields
        const candidatesRef = collection(db, COLLECTIONS.CANDIDATES)
        
        // Query 1: By assignedJobId (proper job document ID)
        const q1 = query(candidatesRef, where('assignedJobId', '==', jobId))
        const snap1 = await getDocs(q1)
        
        // Query 2: By jobId matching job document ID
        const q2 = query(candidatesRef, where('jobId', '==', jobId))
        const snap2 = await getDocs(q2)
        
        // Query 3: By jobTitle matching the job's title (legacy data)
        const q3 = query(candidatesRef, where('jobTitle', '==', jobData.title))
        const snap3 = await getDocs(q3)
        
        // Combine and deduplicate results, filtering by branch for legacy data
        const allDocs = [...snap1.docs, ...snap2.docs, ...snap3.docs]
        const uniqueCandidates = new Map<string, Candidate>()
        allDocs.forEach(doc => {
          if (!uniqueCandidates.has(doc.id)) {
            const candidateData = { id: doc.id, ...doc.data() } as Candidate
            
            // If candidate has correct jobId (matches job document ID), include them
            if (candidateData.jobId === jobId || candidateData.assignedJobId === jobId) {
              uniqueCandidates.set(doc.id, candidateData)
            } 
            // For legacy data (matched by title only), check if branch also matches
            else {
              const candidateBranch = (candidateData.branchName || candidateData.location || '').toLowerCase().trim()
              const jobBranch = (jobData.branchName || '').toLowerCase().trim()
              if (candidateBranch === jobBranch) {
                uniqueCandidates.set(doc.id, candidateData)
              }
            }
          }
        })
        
        setCandidates(Array.from(uniqueCandidates.values()))
      } catch (err) {
        console.error('Error fetching job:', err)
        setError('Failed to load job')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [db, jobId])

  // Group candidates by status for pipeline view
  const candidatesByStatus = PIPELINE_STAGES.reduce((acc, stage) => {
    if (stage.status === 'all') {
      acc['all'] = candidates
    } else if (stage.status === 'invite_sent') {
      // Include both invite_sent and legacy screening status
      acc[stage.status] = candidates.filter(c => c.status === 'invite_sent' || c.status === 'screening')
    } else if (stage.status === 'interview_scheduled') {
      acc[stage.status] = candidates.filter(c => c.status === 'interview_scheduled' || c.status === 'interview_complete')
    } else if (stage.status === 'trial_scheduled') {
      acc[stage.status] = candidates.filter(c => c.status === 'trial_scheduled' || c.status === 'trial_complete')
    } else if (stage.status === 'approved') {
      acc[stage.status] = candidates.filter(c => c.status === 'approved' || c.status === 'offer_made')
    } else {
      acc[stage.status] = candidates.filter(c => c.status === stage.status)
    }
    return acc
  }, {} as Record<CandidateStatus | 'all', Candidate[]>)

  // Filter candidates by selected status
  const filteredCandidates = statusFilter === 'all' 
    ? candidates 
    : candidates.filter(c => c.status === statusFilter)

  // Update job status
  const handleStatusChange = async () => {
    if (!job) return
    
    setUpdatingStatus(true)
    try {
      const jobRef = doc(db, COLLECTIONS.JOBS, job.id)
      
      const updateData: Record<string, any> = {
        status: newStatus,
        updatedAt: serverTimestamp(),
      }
      
      // Add workflow-specific fields
      if (newStatus === 'active' && job.status === 'draft') {
        // Publishing: set publishedAt
        updateData.publishedAt = serverTimestamp()
      }
      
      if (newStatus === 'closed') {
        // Closing: set closedAt and reason
        updateData.closedAt = serverTimestamp()
        updateData.closedReason = closedReason || 'manually_closed'
      }
      
      if (newStatus === 'active' && job.status === 'closed') {
        // Reopening: clear closed fields
        updateData.closedAt = null
        updateData.closedReason = null
      }
      
      await updateDoc(jobRef, updateData)
      
      setJob(prev => prev ? { ...prev, status: newStatus } : null)
      setShowStatusModal(false)
      setClosedReason('')
    } catch (err) {
      console.error('Error updating status:', err)
    } finally {
      setUpdatingStatus(false)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="job-detail-page">
        <div className="loading-container">
          <Spinner size="lg" />
          <p>Loading job...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error || !job) {
    return (
      <div className="job-detail-page">
        <div className="error-container">
          <p>{error || 'Job not found'}</p>
          <Button onClick={() => navigate('/jobs')}>Back to Jobs</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="job-detail-page">
      {/* Back Button */}
      <button className="back-button" onClick={() => navigate('/jobs')}>
        ← Back to Jobs
      </button>

      {/* Header */}
      <div className="job-header">
        <div className="job-header-info">
          <div className="job-title-row">
            <h1>{job.title}</h1>
            <Badge variant={JOB_STATUS_COLORS[job.status] as any}>
              {job.status}
            </Badge>
          </div>
          <div className="job-meta">
            <span className="job-type-badge">{getEmploymentTypeLabel(job.employmentType)}</span>
            <span className="job-branch">📍 {job.branchName}</span>
            {job.branchAddress && (
              <span className="job-address">{job.branchAddress}</span>
            )}
            <span className="job-entity">{job.entity}</span>
          </div>
          <div className="job-quick-info">
            <span className="quick-info-item">
              💰 {formatSalary(job.salaryMin, job.salaryMax, job.salaryPeriod)}
            </span>
            {job.hoursPerWeek && (
              <span className="quick-info-item">
                ⏰ {job.hoursPerWeek} hrs/week
              </span>
            )}
            <span className="quick-info-item">
              👥 {candidates.length} candidate{candidates.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <div className="job-header-actions">
          <Button 
            variant="outline"
            onClick={() => {
              setNewStatus(job.status)
              setShowStatusModal(true)
            }}
          >
            Change Status
          </Button>
          <Button variant="outline" onClick={() => navigate(`/jobs?edit=${job.id}`)}>
            Edit Job
          </Button>
        </div>
      </div>

      {/* Content Grid */}
      <div className="job-content">
        {/* Main Column */}
        <div className="job-main">
          {/* Pipeline Overview */}
          <Card className="pipeline-card">
            <h2>Candidate Pipeline</h2>
            <div className="pipeline-stages">
              {PIPELINE_STAGES.map(stage => (
                <div 
                  key={stage.status} 
                  className={`pipeline-stage ${statusFilter === stage.status ? 'active' : ''}`}
                  onClick={() => setStatusFilter(statusFilter === stage.status ? 'all' : stage.status)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="stage-count">
                    {candidatesByStatus[stage.status]?.length || 0}
                  </div>
                  <div className="stage-label">{stage.label}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Candidates List */}
          <Card className="candidates-card">
            <div className="card-header">
              <h2>Candidates ({candidates.length})</h2>
              <div className="card-header-actions">
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  options={[
                    { value: 'all', label: 'All Statuses' },
                    { value: 'new', label: 'New' },
                    { value: 'invite_sent', label: 'Invite Sent' },
                    { value: 'interview_scheduled', label: 'Interview Scheduled' },
                    { value: 'interview_complete', label: 'Interview Complete' },
                    { value: 'trial_scheduled', label: 'Trial Scheduled' },
                    { value: 'trial_complete', label: 'Trial Complete' },
                    { value: 'approved', label: 'Approved' },
                    { value: 'offer_made', label: 'Offer Made' },
                    { value: 'hired', label: 'Hired' },
                    { value: 'rejected', label: 'Rejected' },
                    { value: 'withdrawn', label: 'Withdrawn' },
                    { value: 'on_hold', label: 'On Hold' },
                  ]}
                />
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => navigate(`/candidates?job=${job.id}`)}
                >
                  View All
                </Button>
              </div>
            </div>
            
            {candidates.length === 0 ? (
              <div className="empty-candidates">
                <p>No candidates have applied to this job yet</p>
                <Button 
                  variant="outline"
                  onClick={() => navigate('/candidates')}
                >
                  Browse Candidates
                </Button>
              </div>
            ) : filteredCandidates.length === 0 ? (
              <div className="empty-candidates">
                <p>No candidates with status "{statusFilter.replace(/_/g, ' ')}"</p>
                <Button 
                  variant="outline"
                  onClick={() => setStatusFilter('all')}
                >
                  Clear Filter
                </Button>
              </div>
            ) : (
              <div className="candidates-list">
                {filteredCandidates.slice(0, 10).map(candidate => (
                  <div 
                    key={candidate.id} 
                    className="candidate-row"
                    onClick={() => navigate(`/candidates/${candidate.id}`)}
                  >
                    <div className="candidate-avatar">
                      {candidate.firstName?.[0]}{candidate.lastName?.[0]}
                    </div>
                    <div className="candidate-info">
                      <span className="candidate-name">
                        {candidate.firstName} {candidate.lastName}
                      </span>
                      <span className="candidate-email">{candidate.email}</span>
                    </div>
                    <Badge variant={STATUS_COLORS[candidate.status] as any}>
                      {candidate.status.replace(/_/g, ' ')}
                    </Badge>
                    <span className="candidate-date">
                      {formatDate(candidate.createdAt)}
                    </span>
                  </div>
                ))}
                
                {filteredCandidates.length > 10 && (
                  <div className="view-more">
                    <Button 
                      variant="outline"
                      onClick={() => navigate(`/candidates?job=${job.id}`)}
                    >
                      View all {filteredCandidates.length} candidates
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="job-sidebar">
          {/* Job Details */}
          <Card className="details-card">
            <h3>Job Details</h3>
            <div className="detail-list">
              <div className="detail-item">
                <span className="detail-label">Employment Type</span>
                <span className="detail-value">
                  {getEmploymentTypeLabel(job.employmentType)}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Category</span>
                <span className="detail-value">
                  {CATEGORY_LABELS[job.category] || job.category}
                </span>
              </div>
              {job.hoursPerWeek && (
                <div className="detail-item">
                  <span className="detail-label">Hours/Week</span>
                  <span className="detail-value">{job.hoursPerWeek}</span>
                </div>
              )}
              {(job as any).shiftPattern && (
                <div className="detail-item">
                  <span className="detail-label">Shift Pattern</span>
                  <span className="detail-value">{(job as any).shiftPattern}</span>
                </div>
              )}
              <div className="detail-item">
                <span className="detail-label">Salary</span>
                <span className="detail-value">
                  {formatSalary(job.salaryMin, job.salaryMax, job.salaryPeriod, (job as any).salaryNotes)}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Posted</span>
                <span className="detail-value">{formatDate(job.createdAt)}</span>
              </div>
              {job.closingDate && (
                <div className="detail-item">
                  <span className="detail-label">Closing Date</span>
                  <span className="detail-value closing-date">
                    {formatDate(job.closingDate)}
                    {job.closingDate.toDate && job.closingDate.toDate() < new Date() && (
                      <span className="date-warning">Expired</span>
                    )}
                  </span>
                </div>
              )}
              {job.startDate && (
                <div className="detail-item">
                  <span className="detail-label">Start Date</span>
                  <span className="detail-value">{formatDate(job.startDate)}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Compliance Requirements */}
          {(job.requiresDBS || job.requiresGPhC || (job as any).requiresRightToWork) && (
            <Card className="requirements-card">
              <h3>Compliance Requirements</h3>
              <div className="requirements-list">
                {job.requiresDBS && (
                  <span className="requirement-badge dbs">✓ DBS Check Required</span>
                )}
                {job.requiresGPhC && (
                  <span className="requirement-badge gphc">✓ GPhC Registration</span>
                )}
                {(job as any).requiresRightToWork && (
                  <span className="requirement-badge rtw">✓ UK Right to Work</span>
                )}
              </div>
            </Card>
          )}

          {/* Qualifications */}
          {job.qualificationsRequired && job.qualificationsRequired.length > 0 && (
            <Card className="qualifications-card">
              <h3>Qualifications Required</h3>
              <ul className="qual-list">
                {job.qualificationsRequired.map((qual, i) => (
                  <li key={i}>{qual}</li>
                ))}
              </ul>
            </Card>
          )}

          {/* Requirements */}
          {job.requirements && job.requirements.length > 0 && (
            <Card className="qualifications-card">
              <h3>Requirements</h3>
              <ul className="qual-list">
                {job.requirements.map((req, i) => (
                  <li key={i}>{req}</li>
                ))}
              </ul>
            </Card>
          )}

          {/* Desirable Skills */}
          {(job as any).desirable && (job as any).desirable.length > 0 && (
            <Card className="qualifications-card desirable-card">
              <h3>Desirable Skills</h3>
              <ul className="qual-list desirable-list">
                {(job as any).desirable.map((skill: string, i: number) => (
                  <li key={i}>{skill}</li>
                ))}
              </ul>
            </Card>
          )}

          {/* Description */}
          {job.description && (
            <Card className="description-card">
              <h3>Description</h3>
              <p className="description-text">{job.description}</p>
            </Card>
          )}

          {/* Internal Notes - Recruiter Only */}
          {(job as any).internalNotes && (
            <Card className="internal-notes-card">
              <div className="internal-notes-header">
                <h3>🔒 Internal Notes</h3>
                <button 
                  className="toggle-notes-btn"
                  onClick={() => setShowInternalNotes(!showInternalNotes)}
                >
                  {showInternalNotes ? 'Hide' : 'Show'}
                </button>
              </div>
              {showInternalNotes && (
                <p className="internal-notes-text">{(job as any).internalNotes}</p>
              )}
              {!showInternalNotes && (
                <p className="internal-notes-hidden">Click "Show" to view internal notes</p>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Status Change Modal */}
      <Modal
        isOpen={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        title="Change Job Status"
        size="sm"
      >
        <div className="status-modal-content">
          <div className="status-options">
            <label>Select new status</label>
            <div className="status-buttons">
              <button
                className={`status-option draft ${newStatus === 'draft' ? 'selected' : ''}`}
                onClick={() => setNewStatus('draft')}
                disabled={job.status === 'draft'}
              >
                <span className="status-icon">📝</span>
                <span className="status-name">Draft</span>
                <span className="status-desc">Not visible to candidates</span>
              </button>
              <button
                className={`status-option active ${newStatus === 'active' ? 'selected' : ''}`}
                onClick={() => setNewStatus('active')}
                disabled={job.status === 'active'}
              >
                <span className="status-icon">🚀</span>
                <span className="status-name">Active</span>
                <span className="status-desc">Visible and accepting applications</span>
              </button>
              <button
                className={`status-option closed ${newStatus === 'closed' ? 'selected' : ''}`}
                onClick={() => setNewStatus('closed')}
                disabled={job.status === 'closed'}
              >
                <span className="status-icon">🔒</span>
                <span className="status-name">Closed</span>
                <span className="status-desc">No longer accepting applications</span>
              </button>
            </div>
          </div>

          {newStatus === 'closed' && job.status !== 'closed' && (
            <div className="close-reason">
              <label htmlFor="close-reason">Reason for closing</label>
              <Select
                id="close-reason"
                value={closedReason}
                onChange={(e) => setClosedReason(e.target.value)}
                options={[
                  { value: '', label: 'Select a reason...' },
                  { value: 'filled', label: 'Position filled' },
                  { value: 'cancelled', label: 'Position cancelled' },
                  { value: 'on_hold', label: 'Put on hold' },
                  { value: 'expired', label: 'Posting expired' },
                  { value: 'duplicate', label: 'Duplicate posting' },
                  { value: 'other', label: 'Other reason' },
                ]}
              />
            </div>
          )}

          {newStatus === 'active' && job.status === 'draft' && (
            <div className="publish-info">
              <div className="info-box success">
                <span className="info-icon">✅</span>
                <p>Publishing this job will make it visible and start accepting applications.</p>
              </div>
            </div>
          )}

          {newStatus === 'active' && job.status === 'closed' && (
            <div className="reopen-info">
              <div className="info-box warning">
                <span className="info-icon">⚠️</span>
                <p>Reopening this job will make it visible again and resume accepting applications.</p>
              </div>
            </div>
          )}

          <div className="modal-actions">
            <Button variant="outline" onClick={() => setShowStatusModal(false)}>
              Cancel
            </Button>
            <Button 
              variant="primary" 
              onClick={handleStatusChange}
              disabled={
                updatingStatus || 
                newStatus === job.status ||
                (newStatus === 'closed' && !closedReason)
              }
            >
              {updatingStatus ? 'Updating...' : 
                newStatus === 'active' && job.status === 'draft' ? 'Publish Job' :
                newStatus === 'active' && job.status === 'closed' ? 'Reopen Job' :
                newStatus === 'closed' ? 'Close Job' :
                'Update Status'
              }
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default JobDetail

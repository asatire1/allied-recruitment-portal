// ============================================================================
// Allied Recruitment Portal - Ready for Decision Page (Compact Layout)
// Location: apps/recruitment-portal/src/pages/ReadyForDecision.tsx
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, addDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getFirebaseDb, getFirebaseFunctions, COLLECTIONS } from '@allied/shared-lib'
import type { Interview, Candidate, CandidateStatus } from '@allied/shared-lib'
import { Card, Button, Spinner, Modal } from '@allied/shared-ui'
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
  decisionStatus: 'pending' | 'hired' | 'rejected'
}

interface Branch {
  id: string
  name: string
}

type RecommendationFilter = 'all' | 'hire' | 'maybe'
type TypeFilter = 'all' | 'interview' | 'trial'
type StatusFilter = 'pending' | 'hired' | 'rejected'
type SortField = 'name' | 'type' | 'branch' | 'job' | 'rating' | 'recommendation' | 'date'
type SortDirection = 'asc' | 'desc'

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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [recommendationFilter, setRecommendationFilter] = useState<RecommendationFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [branchFilter, setBranchFilter] = useState<string>('all')

  // Sort state
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  // Modal state
  const [showActionModal, setShowActionModal] = useState(false)
  const [selectedCandidate, setSelectedCandidate] = useState<DecisionCandidate | null>(null)
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'trial' | null>(null)
  const [processing, setProcessing] = useState(false)
  const [sendEmail, setSendEmail] = useState(true)

  // Expanded row state
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

      // Load all interviews that have positive feedback (hire/maybe)
      // Note: We can't filter by nested feedback fields in Firestore, so we fetch
      // interviews with any status and filter client-side for those with feedback
      const interviewsSnap = await getDocs(collection(db, 'interviews'))
      const interviews = interviewsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }) as Interview)
        .filter(i =>
          i.feedback?.submittedAt &&
          (i.feedback?.recommendation === 'hire' || i.feedback?.recommendation === 'maybe')
        )

      // Get unique candidate IDs from interviews with feedback
      const candidateIds = [...new Set(interviews.map(i => i.candidateId))]

      // Load all candidates with feedback (including hired and rejected)
      const candidatesMap = new Map<string, Candidate>()

      // Firestore 'in' queries are limited to 30 items, so batch if needed
      for (let i = 0; i < candidateIds.length; i += 30) {
        const batch = candidateIds.slice(i, i + 30)
        const candidatesQuery = query(
          collection(db, 'candidates'),
          where('__name__', 'in', batch)
        )
        const candidatesSnap = await getDocs(candidatesQuery)
        candidatesSnap.docs.forEach(d => {
          const candidate = { id: d.id, ...d.data() } as Candidate
          // Exclude withdrawn and candidates currently scheduled for interview/trial
          // They'll come back after their scheduled interview/trial is completed with feedback
          const excludedStatuses = ['withdrawn', 'trial_scheduled', 'interview_scheduled']
          if (!excludedStatuses.includes(candidate.status)) {
            candidatesMap.set(d.id, candidate)
          }
        })
      }

      // Filter interviews to only those with valid candidates
      const validInterviews = interviews.filter(i => candidatesMap.has(i.candidateId))

      // Group by candidate - get most recent interview per candidate
      const candidateInterviewMap = new Map<string, Interview>()
      for (const interview of validInterviews) {
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
          // Determine decision status based on candidate status
          let decisionStatus: 'pending' | 'hired' | 'rejected' = 'pending'
          if (candidate.status === 'approved') {
            decisionStatus = 'hired'
          } else if (candidate.status === 'rejected') {
            decisionStatus = 'rejected'
          }

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
            decisionStatus,
          })
        }
      }

      // Sort by recommendation (hire first) then by date
      decisionCandidates.sort((a, b) => {
        const recOrder = { hire: 0, maybe: 1, do_not_hire: 2 }
        const aOrder = recOrder[a.recommendation] ?? 2
        const bOrder = recOrder[b.recommendation] ?? 2
        if (aOrder !== bOrder) return aOrder - bOrder
        return b.completedDate.getTime() - a.completedDate.getTime()
      })

      setCandidates(decisionCandidates)

    } catch (err) {
      console.error('Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }, [db])

  useEffect(() => { loadData() }, [loadData])

  // ============================================================================
  // FILTERING
  // ============================================================================

  const filteredCandidates = useMemo(() => {
    let result = [...candidates]

    // Always filter by status first
    result = result.filter(c => c.decisionStatus === statusFilter)

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(c =>
        `${c.candidate.firstName} ${c.candidate.lastName}`.toLowerCase().includes(term) ||
        c.candidate.jobTitle?.toLowerCase().includes(term) ||
        c.interview.branchName?.toLowerCase().includes(term)
      )
    }

    if (recommendationFilter !== 'all') {
      result = result.filter(c => c.recommendation === recommendationFilter)
    }

    if (typeFilter !== 'all') {
      result = result.filter(c => c.interviewType === typeFilter)
    }

    if (branchFilter !== 'all') {
      result = result.filter(c => c.interview.branchId === branchFilter)
    }

    // Sort
    result.sort((a, b) => {
      let aVal: any, bVal: any

      switch (sortField) {
        case 'name':
          aVal = `${a.candidate.firstName} ${a.candidate.lastName}`.toLowerCase()
          bVal = `${b.candidate.firstName} ${b.candidate.lastName}`.toLowerCase()
          break
        case 'type':
          aVal = a.interviewType
          bVal = b.interviewType
          break
        case 'branch':
          aVal = a.interview.branchName?.toLowerCase() || ''
          bVal = b.interview.branchName?.toLowerCase() || ''
          break
        case 'job':
          aVal = a.candidate.jobTitle?.toLowerCase() || ''
          bVal = b.candidate.jobTitle?.toLowerCase() || ''
          break
        case 'rating':
          aVal = a.rating
          bVal = b.rating
          break
        case 'recommendation':
          const recOrder = { hire: 0, maybe: 1, do_not_hire: 2 }
          aVal = recOrder[a.recommendation] ?? 2
          bVal = recOrder[b.recommendation] ?? 2
          break
        case 'date':
        default:
          aVal = a.completedDate.getTime()
          bVal = b.completedDate.getTime()
          break
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [candidates, searchTerm, statusFilter, recommendationFilter, typeFilter, branchFilter, sortField, sortDirection])

  // Stats
  const stats = useMemo(() => {
    const pending = candidates.filter(c => c.decisionStatus === 'pending')
    const hired = candidates.filter(c => c.decisionStatus === 'hired')
    const rejected = candidates.filter(c => c.decisionStatus === 'rejected')

    return {
      pending: pending.length,
      hired: hired.length,
      rejected: rejected.length,
      // Stats for current filter
      hire: pending.filter(c => c.recommendation === 'hire').length,
      maybe: pending.filter(c => c.recommendation === 'maybe').length,
    }
  }, [candidates])

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleAction = (candidate: DecisionCandidate, action: 'approve' | 'reject' | 'trial', e: React.MouseEvent) => {
    e.stopPropagation()
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

      await updateDoc(candidateRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
      })

      await addDoc(collection(db, COLLECTIONS.ACTIVITY_LOG || 'activityLog'), {
        entityType: 'candidate',
        entityId: selectedCandidate.id,
        action: 'status_changed',
        description: `Status changed to ${newStatus.replace(/_/g, ' ')} from Ready for Decision`,
        userId: user?.id || user?.uid || '',
        userName: user?.name || user?.email || 'Unknown',
        createdAt: serverTimestamp(),
      })

      if (actionType === 'reject' && sendEmail) {
        try {
          const functions = getFirebaseFunctions()
          const sendEmailFn = httpsCallable(functions, 'sendCandidateEmail')
          await sendEmailFn({
            candidateId: selectedCandidate.id,
            templateType: 'rejection',
          })
        } catch (emailErr) {
          console.error('Error sending email:', emailErr)
        }
      }

      // Update local state - move to new status instead of removing
      if (actionType === 'approve') {
        setCandidates(prev => prev.map(c =>
          c.id === selectedCandidate.id
            ? { ...c, decisionStatus: 'hired' as const }
            : c
        ))
      } else if (actionType === 'reject') {
        setCandidates(prev => prev.map(c =>
          c.id === selectedCandidate.id
            ? { ...c, decisionStatus: 'rejected' as const }
            : c
        ))
      } else if (actionType === 'trial') {
        // Remove from list if sending to trial (they'll come back after trial feedback)
        setCandidates(prev => prev.filter(c => c.id !== selectedCandidate.id))
      }

      setShowActionModal(false)
      setSelectedCandidate(null)
      setActionType(null)

      if (actionType === 'trial') {
        navigate(`/candidates/${selectedCandidate.id}`)
      }

    } catch (err) {
      console.error('Error processing action:', err)
    } finally {
      setProcessing(false)
    }
  }

  const formatDate = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  const clearFilters = () => {
    setSearchTerm('')
    setRecommendationFilter('all')
    setTypeFilter('all')
    setBranchFilter('all')
  }

  const hasActiveFilters = searchTerm || recommendationFilter !== 'all' || typeFilter !== 'all' || branchFilter !== 'all'

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const getSortIndicator = (field: SortField) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? ' ▲' : ' ▼'
  }

  // Get page title based on status filter
  const getPageTitle = () => {
    switch (statusFilter) {
      case 'hired': return '✅ Hired Candidates'
      case 'rejected': return '❌ Rejected Candidates'
      default: return '⏳ Ready for Decision'
    }
  }

  const getPageDescription = () => {
    switch (statusFilter) {
      case 'hired': return 'Candidates that have been approved and hired'
      case 'rejected': return 'Candidates that were not selected'
      default: return 'Candidates awaiting hiring decision after interview/trial feedback'
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div className="rfd-page">
        <div className="rfd-loading">
          <Spinner size="lg" />
          <p>Loading candidates...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rfd-page">
      {/* Header */}
      <div className="rfd-header">
        <div className="rfd-header-left">
          <h1>{getPageTitle()}</h1>
          <p>{getPageDescription()}</p>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="rfd-status-tabs">
        <button
          className={`rfd-status-tab ${statusFilter === 'pending' ? 'active' : ''}`}
          onClick={() => setStatusFilter('pending')}
        >
          <span className="tab-icon">⏳</span>
          <span className="tab-label">Pending</span>
          <span className="tab-count">{stats.pending}</span>
        </button>
        <button
          className={`rfd-status-tab hired ${statusFilter === 'hired' ? 'active' : ''}`}
          onClick={() => setStatusFilter('hired')}
        >
          <span className="tab-icon">✅</span>
          <span className="tab-label">Hired</span>
          <span className="tab-count">{stats.hired}</span>
        </button>
        <button
          className={`rfd-status-tab rejected ${statusFilter === 'rejected' ? 'active' : ''}`}
          onClick={() => setStatusFilter('rejected')}
        >
          <span className="tab-icon">❌</span>
          <span className="tab-label">Rejected</span>
          <span className="tab-count">{stats.rejected}</span>
        </button>
      </div>

      {/* Stats Bar - only show for pending */}
      {statusFilter === 'pending' && (
        <div className="rfd-stats-bar">
          <div
            className={`rfd-stat ${recommendationFilter === 'all' ? 'active' : ''}`}
            onClick={() => setRecommendationFilter('all')}
          >
            <span className="rfd-stat-value">{stats.pending}</span>
            <span className="rfd-stat-label">Total</span>
          </div>
          <div
            className={`rfd-stat hire ${recommendationFilter === 'hire' ? 'active' : ''}`}
            onClick={() => setRecommendationFilter('hire')}
          >
            <span className="rfd-stat-value">{stats.hire}</span>
            <span className="rfd-stat-label">Hire</span>
          </div>
          <div
            className={`rfd-stat maybe ${recommendationFilter === 'maybe' ? 'active' : ''}`}
            onClick={() => setRecommendationFilter('maybe')}
          >
            <span className="rfd-stat-value">{stats.maybe}</span>
            <span className="rfd-stat-label">Maybe</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="rfd-filters">
        <input
          type="text"
          placeholder="Search candidate, job, or branch..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="rfd-search"
        />
        
        <select 
          value={typeFilter} 
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          className="rfd-select"
        >
          <option value="all">All Types</option>
          <option value="interview">Interview</option>
          <option value="trial">Trial</option>
        </select>

        <select 
          value={branchFilter} 
          onChange={(e) => setBranchFilter(e.target.value)}
          className="rfd-select"
        >
          <option value="all">All Branches</option>
          {branches.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        {hasActiveFilters && (
          <button className="rfd-clear-btn" onClick={clearFilters}>
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      {filteredCandidates.length === 0 ? (
        <Card className="rfd-empty">
          <div className="rfd-empty-icon">✅</div>
          <h3>No Candidates Awaiting Decision</h3>
          <p>{hasActiveFilters ? 'Try adjusting your filters' : 'All caught up!'}</p>
        </Card>
      ) : (
        <div className="rfd-table-container">
          <table className="rfd-table">
            <thead>
              <tr>
                <th className={`sortable ${sortField === 'name' ? 'sorted' : ''}`} onClick={() => handleSort('name')}>
                  Candidate{getSortIndicator('name')}
                </th>
                <th className={`sortable ${sortField === 'type' ? 'sorted' : ''}`} onClick={() => handleSort('type')}>
                  Type{getSortIndicator('type')}
                </th>
                <th className={`sortable ${sortField === 'branch' ? 'sorted' : ''}`} onClick={() => handleSort('branch')}>
                  Branch{getSortIndicator('branch')}
                </th>
                <th className={`sortable ${sortField === 'job' ? 'sorted' : ''}`} onClick={() => handleSort('job')}>
                  Job{getSortIndicator('job')}
                </th>
                <th className={`sortable ${sortField === 'rating' ? 'sorted' : ''}`} onClick={() => handleSort('rating')}>
                  Rating{getSortIndicator('rating')}
                </th>
                <th className={`sortable ${sortField === 'recommendation' ? 'sorted' : ''}`} onClick={() => handleSort('recommendation')}>
                  Rec{getSortIndicator('recommendation')}
                </th>
                <th className={`sortable ${sortField === 'date' ? 'sorted' : ''}`} onClick={() => handleSort('date')}>
                  Date{getSortIndicator('date')}
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCandidates.map(candidate => {
                const isExpanded = expandedId === candidate.id
                return (
                  <>
                    <tr 
                      key={candidate.id} 
                      className={`rfd-row ${isExpanded ? 'expanded' : ''}`}
                      onClick={() => setExpandedId(isExpanded ? null : candidate.id)}
                    >
                      <td className="rfd-candidate-cell">
                        <span className="rfd-candidate-name">
                          {candidate.candidate.firstName} {candidate.candidate.lastName}
                        </span>
                      </td>
                      <td>
                        <span className={`rfd-type-badge ${candidate.interviewType}`}>
                          {candidate.interviewType === 'trial' ? 'Trial' : 'Interview'}
                        </span>
                      </td>
                      <td className="rfd-branch-cell">
                        {candidate.interview.branchName || '-'}
                      </td>
                      <td className="rfd-job-cell">
                        {candidate.candidate.jobTitle || '-'}
                      </td>
                      <td>
                        <span className="rfd-stars">
                          {'★'.repeat(candidate.rating)}{'☆'.repeat(5 - candidate.rating)}
                        </span>
                      </td>
                      <td>
                        <span className={`rfd-rec-badge ${candidate.recommendation}`}>
                          {candidate.recommendation === 'hire' ? '✓ Hire' : '? Maybe'}
                        </span>
                      </td>
                      <td className="rfd-date-cell">
                        {formatDate(candidate.completedDate)}
                      </td>
                      <td className="rfd-actions-cell" onClick={(e) => e.stopPropagation()}>
                        {candidate.interviewType === 'interview' && (
                          <button 
                            className="rfd-action-btn trial"
                            onClick={(e) => handleAction(candidate, 'trial', e)}
                            title="Schedule Trial"
                          >
                            🏪
                          </button>
                        )}
                        <button 
                          className="rfd-action-btn reject"
                          onClick={(e) => handleAction(candidate, 'reject', e)}
                          title="Reject"
                        >
                          ✗
                        </button>
                        <button 
                          className="rfd-action-btn approve"
                          onClick={(e) => handleAction(candidate, 'approve', e)}
                          title="Approve"
                        >
                          ✓
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="rfd-expanded-row">
                        <td colSpan={8}>
                          <div className="rfd-feedback-panel">
                            {candidate.strengths && (
                              <div className="rfd-feedback-item">
                                <strong>💪 Strengths:</strong> {candidate.strengths}
                              </div>
                            )}
                            {candidate.weaknesses && (
                              <div className="rfd-feedback-item">
                                <strong>⚠️ Areas to Improve:</strong> {candidate.weaknesses}
                              </div>
                            )}
                            {candidate.comments && (
                              <div className="rfd-feedback-item">
                                <strong>💬 Comments:</strong> {candidate.comments}
                              </div>
                            )}
                            {!candidate.strengths && !candidate.weaknesses && !candidate.comments && (
                              <div className="rfd-feedback-item muted">No detailed feedback provided</div>
                            )}
                            <button 
                              className="rfd-view-profile-btn"
                              onClick={() => navigate(`/candidates/${candidate.id}`)}
                            >
                              View Full Profile →
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Action Modal */}
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
          <div className="rfd-modal">
            <div className="rfd-modal-candidate">
              <strong>{selectedCandidate.candidate.firstName} {selectedCandidate.candidate.lastName}</strong>
              <span>{selectedCandidate.candidate.jobTitle}</span>
            </div>

            {actionType === 'approve' && (
              <p>Mark this candidate as <strong>Approved</strong>?</p>
            )}

            {actionType === 'reject' && (
              <>
                <p>Mark this candidate as <strong>Rejected</strong>?</p>
                <label className="rfd-checkbox">
                  <input
                    type="checkbox"
                    checked={sendEmail}
                    onChange={(e) => setSendEmail(e.target.checked)}
                  />
                  Send rejection email
                </label>
              </>
            )}

            {actionType === 'trial' && (
              <p>Change status to <strong>Trial Scheduled</strong> and go to profile to schedule?</p>
            )}

            <div className="rfd-modal-actions">
              <Button variant="outline" onClick={() => setShowActionModal(false)} disabled={processing}>
                Cancel
              </Button>
              <Button 
                variant="primary" 
                onClick={handleConfirmAction} 
                disabled={processing}
                className={`rfd-confirm-btn ${actionType}`}
              >
                {processing ? 'Processing...' : 'Confirm'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

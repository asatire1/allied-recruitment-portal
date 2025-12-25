import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs, query, orderBy, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore'
import { getFirebaseDb, COLLECTIONS } from '@allied/shared-lib'
import type { Candidate, CandidateStatus, ActivityAction } from '@allied/shared-lib'
import { Card, Input, Select, Badge, Button, Spinner, Modal, Textarea } from '@allied/shared-ui'
import { useAuth } from '../contexts/AuthContext'
import './Candidates.css'

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_OPTIONS: { value: CandidateStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'new', label: 'New' },
  { value: 'screening', label: 'Screening' },
  { value: 'interview_scheduled', label: 'Interview Scheduled' },
  { value: 'interview_complete', label: 'Interview Complete' },
  { value: 'trial_scheduled', label: 'Trial Scheduled' },
  { value: 'trial_complete', label: 'Trial Complete' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
]

const STATUS_COLORS: Record<CandidateStatus, string> = {
  new: 'info',
  screening: 'warning',
  interview_scheduled: 'info',
  interview_complete: 'info',
  trial_scheduled: 'warning',
  trial_complete: 'warning',
  approved: 'success',
  rejected: 'error',
  withdrawn: 'neutral',
}

const SOURCE_OPTIONS = [
  { value: '', label: 'Select source...' },
  { value: 'indeed', label: 'Indeed' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'referral', label: 'Referral' },
  { value: 'website', label: 'Website' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'agency', label: 'Agency' },
  { value: 'other', label: 'Other' },
]

// ============================================================================
// TYPES
// ============================================================================

interface AddCandidateForm {
  firstName: string
  lastName: string
  email: string
  phone: string
  address: string
  postcode: string
  source: string
  jobTitle: string
  notes: string
}

interface FormErrors {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  postcode?: string
}

const INITIAL_FORM: AddCandidateForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  postcode: '',
  source: '',
  jobTitle: '',
  notes: '',
}

const ITEMS_PER_PAGE = 10

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

const formatPhone = (phone: string): string => {
  if (!phone) return '-'
  // Remove non-digits
  const digits = phone.replace(/\D/g, '')
  // Format UK mobile
  if (digits.length === 11 && digits.startsWith('07')) {
    return `${digits.slice(0, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`
  }
  return phone
}

// Normalize UK phone number
const normalizePhone = (phone: string): string => {
  // Remove all non-digits
  let digits = phone.replace(/\D/g, '')
  
  // Handle +44 prefix
  if (digits.startsWith('44') && digits.length > 10) {
    digits = '0' + digits.slice(2)
  }
  
  return digits
}

// Validate UK phone number
const validateUKPhone = (phone: string): boolean => {
  const normalized = normalizePhone(phone)
  // UK mobile: 07xxx or landline: 01xxx, 02xxx, 03xxx
  return /^0[1-37]\d{8,9}$/.test(normalized)
}

// Validate UK postcode
const validateUKPostcode = (postcode: string): boolean => {
  const cleaned = postcode.replace(/\s/g, '').toUpperCase()
  // UK postcode regex
  return /^[A-Z]{1,2}[0-9][0-9A-Z]?[0-9][A-Z]{2}$/.test(cleaned)
}

// Format UK postcode
const formatPostcode = (postcode: string): string => {
  const cleaned = postcode.replace(/\s/g, '').toUpperCase()
  if (cleaned.length > 3) {
    return cleaned.slice(0, -3) + ' ' + cleaned.slice(-3)
  }
  return cleaned
}

// Validate email
const validateEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// Generate duplicate key from name and phone
const generateDuplicateKey = (firstName: string, lastName: string, phone: string): string => {
  const normalizedName = `${firstName}${lastName}`.toLowerCase().replace(/\s/g, '')
  const normalizedPhone = normalizePhone(phone)
  return `${normalizedName}_${normalizedPhone}`
}

// ============================================================================
// COMPONENT
// ============================================================================

export function Candidates() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<CandidateStatus | 'all'>('all')
  
  // Selected candidate for status change
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [newStatus, setNewStatus] = useState<CandidateStatus | ''>('')
  const [updating, setUpdating] = useState(false)

  // Add candidate modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState<AddCandidateForm>(INITIAL_FORM)
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)

  const db = getFirebaseDb()

  // Fetch candidates
  useEffect(() => {
    async function fetchCandidates() {
      try {
        setLoading(true)
        setError(null)

        const candidatesRef = collection(db, COLLECTIONS.CANDIDATES)
        let candidatesQuery
        
        try {
          candidatesQuery = query(candidatesRef, orderBy('createdAt', 'desc'))
          const snapshot = await getDocs(candidatesQuery)
          const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Candidate[]
          setCandidates(data)
        } catch (e) {
          // Fallback without ordering if index doesn't exist
          console.log('Ordered query failed, using simple query:', e)
          const snapshot = await getDocs(candidatesRef)
          const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Candidate[]
          // Sort in memory
          data.sort((a, b) => {
            const aDate = a.createdAt?.toDate?.()?.getTime() || 0
            const bDate = b.createdAt?.toDate?.()?.getTime() || 0
            return bDate - aDate
          })
          setCandidates(data)
        }
      } catch (err) {
        console.error('Error fetching candidates:', err)
        setError('Failed to load candidates')
      } finally {
        setLoading(false)
      }
    }

    fetchCandidates()
  }, [db])

  // Filtered candidates
  const filteredCandidates = useMemo(() => {
    return candidates.filter(candidate => {
      // Status filter
      if (statusFilter !== 'all' && candidate.status !== statusFilter) {
        return false
      }

      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase()
        const fullName = `${candidate.firstName} ${candidate.lastName}`.toLowerCase()
        const email = candidate.email?.toLowerCase() || ''
        const phone = candidate.phone?.toLowerCase() || ''
        const jobTitle = candidate.jobTitle?.toLowerCase() || ''
        
        if (!fullName.includes(search) && 
            !email.includes(search) && 
            !phone.includes(search) &&
            !jobTitle.includes(search)) {
          return false
        }
      }

      return true
    })
  }, [candidates, statusFilter, searchTerm])

  // Pagination calculations
  const totalPages = Math.ceil(filteredCandidates.length / ITEMS_PER_PAGE)
  const paginatedCandidates = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredCandidates.slice(startIndex, startIndex + ITEMS_PER_PAGE)
  }, [filteredCandidates, currentPage])

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [statusFilter, searchTerm])

  // Log activity to Firestore
  const logActivity = async (
    entityId: string,
    action: ActivityAction,
    description: string,
    previousValue?: Record<string, unknown>,
    newValue?: Record<string, unknown>
  ) => {
    try {
      await addDoc(collection(db, COLLECTIONS.ACTIVITY_LOG), {
        entityType: 'candidate',
        entityId,
        action,
        description,
        previousValue,
        newValue,
        userId: user?.id || '',
        userName: user?.displayName || user?.email || 'Unknown',
        createdAt: serverTimestamp(),
      })
    } catch (err) {
      console.error('Error logging activity:', err)
      // Don't throw - activity logging should not block main operations
    }
  }

  // Update candidate status
  const handleStatusChange = async () => {
    if (!selectedCandidate || !newStatus) return

    const previousStatus = selectedCandidate.status

    try {
      setUpdating(true)
      const candidateRef = doc(db, COLLECTIONS.CANDIDATES, selectedCandidate.id)
      await updateDoc(candidateRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
      })

      // Log the status change
      await logActivity(
        selectedCandidate.id,
        'status_changed',
        `Status changed from "${previousStatus.replace(/_/g, ' ')}" to "${newStatus.replace(/_/g, ' ')}"`,
        { status: previousStatus },
        { status: newStatus }
      )

      // Update local state
      setCandidates(prev => prev.map(c => 
        c.id === selectedCandidate.id 
          ? { ...c, status: newStatus as CandidateStatus }
          : c
      ))

      setShowStatusModal(false)
      setSelectedCandidate(null)
      setNewStatus('')
    } catch (err) {
      console.error('Error updating status:', err)
      alert('Failed to update status. Please try again.')
    } finally {
      setUpdating(false)
    }
  }

  // Validate add candidate form
  const validateForm = (): boolean => {
    const errors: FormErrors = {}

    if (!addForm.firstName.trim()) {
      errors.firstName = 'First name is required'
    }

    if (!addForm.lastName.trim()) {
      errors.lastName = 'Last name is required'
    }

    if (!addForm.email.trim()) {
      errors.email = 'Email is required'
    } else if (!validateEmail(addForm.email)) {
      errors.email = 'Please enter a valid email address'
    }

    if (!addForm.phone.trim()) {
      errors.phone = 'Phone number is required'
    } else if (!validateUKPhone(addForm.phone)) {
      errors.phone = 'Please enter a valid UK phone number'
    }

    if (addForm.postcode && !validateUKPostcode(addForm.postcode)) {
      errors.postcode = 'Please enter a valid UK postcode'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Handle form field change
  const handleFormChange = (field: keyof AddCandidateForm, value: string) => {
    setAddForm(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (formErrors[field as keyof FormErrors]) {
      setFormErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  // Submit new candidate
  const handleAddCandidate = async () => {
    if (!validateForm()) return

    try {
      setSubmitting(true)

      const phoneNormalized = normalizePhone(addForm.phone)
      const duplicateKey = generateDuplicateKey(addForm.firstName, addForm.lastName, addForm.phone)

      const candidateData = {
        firstName: addForm.firstName.trim(),
        lastName: addForm.lastName.trim(),
        email: addForm.email.trim().toLowerCase(),
        phone: addForm.phone.trim(),
        phoneNormalized,
        address: addForm.address.trim(),
        postcode: addForm.postcode ? formatPostcode(addForm.postcode) : '',
        source: addForm.source,
        jobTitle: addForm.jobTitle.trim(),
        notes: addForm.notes.trim(),
        status: 'new' as CandidateStatus,
        duplicateKey,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user?.id || '',
      }

      const docRef = await addDoc(collection(db, COLLECTIONS.CANDIDATES), candidateData)

      // Log the creation
      await logActivity(
        docRef.id,
        'created',
        `Candidate "${addForm.firstName.trim()} ${addForm.lastName.trim()}" was added`,
        undefined,
        { 
          firstName: candidateData.firstName,
          lastName: candidateData.lastName,
          email: candidateData.email,
          status: candidateData.status,
        }
      )

      // Add to local state
      const newCandidate: Candidate = {
        id: docRef.id,
        ...candidateData,
        createdAt: { toDate: () => new Date() } as any,
        updatedAt: { toDate: () => new Date() } as any,
      }
      setCandidates(prev => [newCandidate, ...prev])

      // Reset form and close modal
      setShowAddModal(false)
      setAddForm(INITIAL_FORM)
      setFormErrors({})
    } catch (err) {
      console.error('Error adding candidate:', err)
      alert('Failed to add candidate. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Close add modal
  const handleCloseAddModal = () => {
    setShowAddModal(false)
    setAddForm(INITIAL_FORM)
    setFormErrors({})
  }

  if (loading) {
    return (
      <div className="candidates-loading">
        <Spinner size="lg" />
        <p>Loading candidates...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="candidates-error">
        <p>{error}</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    )
  }

  return (
    <div className="candidates-page">
      <div className="candidates-header">
        <div className="header-title">
          <h1>Candidates</h1>
          <span className="candidate-count">{filteredCandidates.length} candidates</span>
        </div>
        <Button variant="primary" onClick={() => setShowAddModal(true)}>
          + Add Candidate
        </Button>
      </div>

      {/* Filters */}
      <Card className="filters-card">
        <div className="filters">
          <div className="filter-item search">
            <div className="search-input-wrapper">
              <Input
                placeholder="Search by name, email, phone, or job..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button 
                  className="search-clear-btn"
                  onClick={() => setSearchTerm('')}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
          </div>
          <div className="filter-item">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as CandidateStatus | 'all')}
              options={STATUS_OPTIONS}
            />
          </div>
        </div>
        {(searchTerm || statusFilter !== 'all') && (
          <div className="active-filters">
            <span className="filter-label">Active filters:</span>
            {searchTerm && (
              <span className="filter-tag">
                Search: "{searchTerm}"
                <button onClick={() => setSearchTerm('')}>×</button>
              </span>
            )}
            {statusFilter !== 'all' && (
              <span className="filter-tag">
                Status: {statusFilter.replace(/_/g, ' ')}
                <button onClick={() => setStatusFilter('all')}>×</button>
              </span>
            )}
            <button 
              className="clear-all-filters"
              onClick={() => { setSearchTerm(''); setStatusFilter('all'); }}
            >
              Clear all
            </button>
          </div>
        )}
      </Card>

      {/* Candidates Table */}
      <Card className="candidates-table-card">
        {filteredCandidates.length === 0 ? (
          <div className="empty-state">
            <p>No candidates found</p>
            {(searchTerm || statusFilter !== 'all') && (
              <Button 
                variant="ghost" 
                onClick={() => { setSearchTerm(''); setStatusFilter('all'); }}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="table-wrapper">
              <table className="candidates-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Contact</th>
                    <th>Job</th>
                    <th>Status</th>
                    <th>Applied</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedCandidates.map(candidate => (
                    <tr key={candidate.id} className="clickable-row" onClick={() => navigate(`/candidates/${candidate.id}`)}>
                      <td>
                        <div className="candidate-name-cell">
                          <span className="name clickable">{candidate.firstName} {candidate.lastName}</span>
                          {candidate.source && (
                            <span className="source">{candidate.source}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="contact-cell">
                          <span className="email">{candidate.email}</span>
                          <span className="phone">{formatPhone(candidate.phone)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="job-cell">
                          <span className="job-title">{candidate.jobTitle || '-'}</span>
                          {candidate.branchName && (
                            <span className="branch">{candidate.branchName}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <Badge variant={STATUS_COLORS[candidate.status] as any}>
                          {candidate.status.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="date-cell">
                        {formatDate(candidate.createdAt)}
                      </td>
                      <td>
                        <div className="actions-cell" onClick={(e) => e.stopPropagation()}>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                              setSelectedCandidate(candidate)
                              setNewStatus(candidate.status)
                              setShowStatusModal(true)
                            }}
                          >
                            Change Status
                          </Button>
                          {candidate.cvUrl && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => window.open(candidate.cvUrl, '_blank')}
                            >
                              View CV
                            </Button>
                          )}
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
                  Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredCandidates.length)} of {filteredCandidates.length} candidates
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
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
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
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
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
      </Card>

      {/* Status Change Modal */}
      <Modal
        isOpen={showStatusModal}
        onClose={() => {
          setShowStatusModal(false)
          setSelectedCandidate(null)
          setNewStatus('')
        }}
        title="Change Candidate Status"
      >
        {selectedCandidate && (
          <div className="status-modal-content">
            <p>
              Update status for <strong>{selectedCandidate.firstName} {selectedCandidate.lastName}</strong>
            </p>
            <div className="status-select">
              <label>New Status</label>
              <Select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as CandidateStatus)}
                options={STATUS_OPTIONS.filter(o => o.value !== 'all')}
              />
            </div>
            <div className="modal-actions">
              <Button 
                variant="secondary" 
                onClick={() => {
                  setShowStatusModal(false)
                  setSelectedCandidate(null)
                  setNewStatus('')
                }}
              >
                Cancel
              </Button>
              <Button 
                variant="primary" 
                onClick={handleStatusChange}
                disabled={!newStatus || newStatus === selectedCandidate.status || updating}
              >
                {updating ? 'Updating...' : 'Update Status'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Candidate Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={handleCloseAddModal}
        title="Add New Candidate"
      >
        <div className="add-candidate-form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="firstName">First Name *</label>
              <Input
                id="firstName"
                value={addForm.firstName}
                onChange={(e) => handleFormChange('firstName', e.target.value)}
                placeholder="Enter first name"
                error={formErrors.firstName}
              />
            </div>
            <div className="form-group">
              <label htmlFor="lastName">Last Name *</label>
              <Input
                id="lastName"
                value={addForm.lastName}
                onChange={(e) => handleFormChange('lastName', e.target.value)}
                placeholder="Enter last name"
                error={formErrors.lastName}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="email">Email Address *</label>
              <Input
                id="email"
                type="email"
                value={addForm.email}
                onChange={(e) => handleFormChange('email', e.target.value)}
                placeholder="candidate@example.com"
                error={formErrors.email}
              />
            </div>
            <div className="form-group">
              <label htmlFor="phone">Phone Number *</label>
              <Input
                id="phone"
                type="tel"
                value={addForm.phone}
                onChange={(e) => handleFormChange('phone', e.target.value)}
                placeholder="07123 456 789"
                error={formErrors.phone}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="address">Address</label>
            <Input
              id="address"
              value={addForm.address}
              onChange={(e) => handleFormChange('address', e.target.value)}
              placeholder="Enter address"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="postcode">Postcode</label>
              <Input
                id="postcode"
                value={addForm.postcode}
                onChange={(e) => handleFormChange('postcode', e.target.value)}
                placeholder="SW1A 1AA"
                error={formErrors.postcode}
              />
            </div>
            <div className="form-group">
              <label htmlFor="source">Source</label>
              <Select
                id="source"
                value={addForm.source}
                onChange={(e) => handleFormChange('source', e.target.value)}
                options={SOURCE_OPTIONS}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="jobTitle">Job Title / Position Applied For</label>
            <Input
              id="jobTitle"
              value={addForm.jobTitle}
              onChange={(e) => handleFormChange('jobTitle', e.target.value)}
              placeholder="e.g. Pharmacist, Pharmacy Technician"
            />
          </div>

          <div className="form-group">
            <label htmlFor="notes">Notes</label>
            <Textarea
              id="notes"
              value={addForm.notes}
              onChange={(e) => handleFormChange('notes', e.target.value)}
              placeholder="Any additional notes about this candidate..."
              rows={3}
            />
          </div>

          <div className="modal-actions">
            <Button variant="secondary" onClick={handleCloseAddModal}>
              Cancel
            </Button>
            <Button 
              variant="primary" 
              onClick={handleAddCandidate}
              disabled={submitting}
            >
              {submitting ? 'Adding...' : 'Add Candidate'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default Candidates

import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { collection, getDocs, query, orderBy, doc, updateDoc, addDoc, serverTimestamp, where, writeBatch, deleteDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { httpsCallable } from 'firebase/functions'
import { 
  getFirebaseDb, 
  getFirebaseStorage, 
  getFirebaseFunctions, 
  COLLECTIONS, 
  getCvPath, 
  generateDuplicateKey, 
  normalizePhone,
  findDuplicates,
  type DuplicateCheckResult,
  type DuplicateCheckResponse,
  type ExistingCandidateData
} from '@allied/shared-lib'
import type { Candidate, CandidateStatus, ActivityAction } from '@allied/shared-lib'
import { Card, Input, Select, Badge, Button, Spinner, Modal, Textarea, DuplicateAlertBanner, MergeRecordsModal } from '@allied/shared-ui'
import type { DuplicateMatchInfo, MergeCandidate, CombinedFieldsData } from '@allied/shared-ui'
import { useAuth } from '../contexts/AuthContext'
import './Candidates.css'
import '../styles/status-colors.css'
import '../styles/bulk-invite.css'
import { getStatusLabel, getStatusClass } from '../utils/statusUtils'

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_OPTIONS: { value: CandidateStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'new', label: 'New' },
  { value: 'invite_sent', label: 'Invite Sent' },
  { value: 'interview_scheduled', label: 'Interview Scheduled' },
  { value: 'interview_complete', label: 'Interview Complete' },
  { value: 'trial_scheduled', label: 'Trial Scheduled' },
  { value: 'trial_complete', label: 'Trial Complete' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
]

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
  location: string
  notes: string
}

interface FormErrors {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  postcode?: string
  jobTitle?: string
  location?: string
}

interface BulkUploadProgress {
  fileName: string
  status: 'pending' | 'uploading' | 'parsing' | 'creating' | 'success' | 'error' | 'retrying' | 'duplicate'
  message?: string
  candidateId?: string
  parsedName?: string
  retryCount?: number
  errorDetails?: string
  duplicateOf?: string // ID of the existing candidate if duplicate
  duplicateConfidence?: number
  // Store data for duplicate resolution
  parsedData?: any
  cvUrl?: string
  cvStoragePath?: string
  fileIndex?: number
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
  location: '',
  notes: '',
}

const ITEMS_PER_PAGE = 10

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Remove undefined values from object (Firestore doesn't accept undefined)
const removeUndefined = (obj: any): any => {
  if (obj === null || obj === undefined) return null
  if (Array.isArray(obj)) return obj.map(removeUndefined)
  if (typeof obj !== 'object') return obj
  
  const cleaned: any = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = typeof value === 'object' ? removeUndefined(value) : value
    }
  }
  return cleaned
}

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

// ============================================================================
// COMPONENT
// ============================================================================

export function Candidates() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Filters - initialize from URL params
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<CandidateStatus | 'all' | 'all_including_rejected'>('all')
  const [jobFilter, setJobFilter] = useState<string[]>(() => {
    // Load saved job filters from localStorage
    try {
      const saved = localStorage.getItem('candidatesJobFilter')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) return parsed
      }
    } catch (e) {
      console.error('Error loading saved job filter:', e)
    }
    return []
  })
  const [jobDropdownOpen, setJobDropdownOpen] = useState(false)
  const [jobSearchTerm, setJobSearchTerm] = useState('')
  
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
  
  // CV upload in Add modal
  const [addCvFile, setAddCvFile] = useState<File | null>(null)
  const [addCvParsing, setAddCvParsing] = useState(false)
  const [addCvError, setAddCvError] = useState<string | null>(null)
  const [addCvUploading, setAddCvUploading] = useState(false)
  const [addCvUrl, setAddCvUrl] = useState<string | null>(null)
  const [addParsedData, setAddParsedData] = useState<any>(null)
  const addCvInputRef = useRef<HTMLInputElement>(null)

  // Bulk upload
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkFiles, setBulkFiles] = useState<File[]>([])
  const [bulkJobTitle, setBulkJobTitle] = useState('')
  const [bulkLocation, setBulkLocation] = useState('')
  const [bulkSource, setBulkSource] = useState('indeed')
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<BulkUploadProgress[]>([])
  const bulkFileInputRef = useRef<HTMLInputElement>(null)

  // Job titles from settings
  const [jobTitles, setJobTitles] = useState<Array<{ id: string; title: string; category: string; isActive: boolean }>>([])
  const [activeJobs, setActiveJobs] = useState<Array<{ id: string; title: string; branchId: string; branchName: string }>>([])
  const [selectedJobId, setSelectedJobId] = useState<string>('')

  const [loadingJobTitles, setLoadingJobTitles] = useState(true)

  // Locations from settings
  const [locations, setLocations] = useState<Array<{ id: string; name: string; isActive: boolean }>>([])
  const [loadingLocations, setLoadingLocations] = useState(true)

  // Duplicate detection
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateCheckResult[]>([])
  const [duplicateRecommendedAction, setDuplicateRecommendedAction] = useState<'block' | 'warn' | 'allow'>('allow')
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false)
  const [checkingDuplicates, setCheckingDuplicates] = useState(false)
  
  // Merge modal
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [mergeTargetCandidate, setMergeTargetCandidate] = useState<Candidate | null>(null)
  const [merging, setMerging] = useState(false)

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)

  // Bulk invite
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set())
  const [showBulkInviteModal, setShowBulkInviteModal] = useState(false)
  const [bulkInviteType, setBulkInviteType] = useState<'interview' | 'trial'>('interview')
  const [bulkInviteProcessing, setBulkInviteProcessing] = useState(false)
  const [bulkInviteResults, setBulkInviteResults] = useState<Array<{
    candidateId: string
    candidateName: string
    candidatePhone: string
    candidateEmail: string
    jobTitle: string
    branchName: string
    success: boolean
    bookingUrl?: string
    error?: string
    emailSent?: boolean
    emailError?: string
  }>>([])
  const [sendingBulkEmails, setSendingBulkEmails] = useState(false)

  const db = getFirebaseDb()

  // Load active jobs with branch info
  useEffect(() => {
    const loadActiveJobs = async () => {
      try {
        const jobsRef = collection(db, 'jobs')
        const snapshot = await getDocs(jobsRef)
        const jobs = snapshot.docs
          .map(doc => ({
            id: doc.id,
            title: doc.data().title || '',
            branchId: doc.data().branchId || '',
            branchName: doc.data().branchName || '',
            isActive: doc.data().isActive
          }))
          .filter(j => j.isActive !== false)
          .sort((a, b) => (a.title + ' - ' + a.branchName).localeCompare(b.title + ' - ' + b.branchName))
        setActiveJobs(jobs)
      } catch (err) {
        console.error('Error loading jobs:', err)
      }
    }
    loadActiveJobs()
  }, [db])
  
  // Save job filter to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem('candidatesJobFilter', JSON.stringify(jobFilter))
    } catch (e) {
      console.error('Error saving job filter:', e)
    }
  }, [jobFilter])
  
  const storage = getFirebaseStorage()
  const functions = getFirebaseFunctions()

  // Read URL params on mount
  useEffect(() => {
    const statusParam = searchParams.get('status')
    if (statusParam) {
      // Handle comma-separated statuses (e.g., "interview_complete,trial_complete")
      const statuses = statusParam.split(',')
      if (statuses.length === 1 && STATUS_OPTIONS.some(opt => opt.value === statuses[0])) {
        setStatusFilter(statuses[0] as CandidateStatus)
      }
      // For multiple statuses, we'd need to enhance the filter - for now just use first one
      else if (statuses.length > 1) {
        // Set to first valid status
        const validStatus = statuses.find(s => STATUS_OPTIONS.some(opt => opt.value === s))
        if (validStatus) {
          setStatusFilter(validStatus as CandidateStatus)
        }
      }
    }
    
    const searchParam = searchParams.get('search')
    if (searchParam) {
      setSearchTerm(searchParam)
    }
  }, []) // Only run on mount

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

  // Fetch job titles from settings
  useEffect(() => {
    async function fetchJobTitles() {
      try {
        setLoadingJobTitles(true)
        const jobTitlesRef = collection(db, 'jobTitles')
        const snapshot = await getDocs(jobTitlesRef)
        
        console.log('Job titles fetch - documents found:', snapshot.size)
        
        const data = snapshot.docs.map(doc => {
          const docData = doc.data()
          console.log('Job title doc:', doc.id, docData)
          return {
            id: doc.id,
            title: docData.title || '',
            category: docData.category || 'clinical',
            isActive: docData.isActive !== false // default to true if not set
          }
        })
        
        // Only show active job titles, sort in memory
        const activeTitles = data
          .filter(jt => jt.isActive && jt.title)
          .sort((a, b) => a.title.localeCompare(b.title))
        
        console.log('Active job titles:', activeTitles)
        setJobTitles(activeTitles)
      } catch (err) {
        console.error('Error fetching job titles:', err)
        setJobTitles([])
      } finally {
        setLoadingJobTitles(false)
      }
    }

    fetchJobTitles()
  }, [db])

  // Fetch branches for location dropdown
  useEffect(() => {
    async function fetchBranches() {
      try {
        setLoadingLocations(true)
        const branchesRef = collection(db, 'branches')
        const snapshot = await getDocs(branchesRef)
        
        console.log('Branches fetch - documents found:', snapshot.size)
        
        const data = snapshot.docs.map(doc => {
          const docData = doc.data()
          return {
            id: doc.id,
            name: docData.name || docData.branchName || '',
            isActive: docData.isActive !== false && docData.status !== 'inactive'
          }
        })
        
        // Only show active branches, sort in memory
        const activeBranches = data
          .filter(branch => branch.isActive && branch.name)
          .sort((a, b) => a.name.localeCompare(b.name))
        
        console.log('Active branches:', activeBranches)
        setLocations(activeBranches)
      } catch (err) {
        console.error('Error fetching branches:', err)
        setLocations([])
      } finally {
        setLoadingLocations(false)
      }
    }

    fetchBranches()
  }, [db])

  // Status priority for sorting (lower number = higher priority)
  // Status priority for sorting: new at top, then invite_sent, interview_scheduled, then rest
  const STATUS_PRIORITY: Record<string, number> = {
    'new': 1,
    'invite_sent': 2,
    'screening': 2, // Map screening to same priority as invite_sent
    'interview_scheduled': 3,
    'interview_complete': 4,
    'trial_scheduled': 5,
    'trial_complete': 6,
    'approved': 7,
    'offered': 8,
    'hired': 9,
    'shortlisted': 10,
    'on_hold': 11,
    'withdrawn': 12,
    'rejected': 13,
  }

  // Filtered candidates - UPDATED: excludes rejected by default, sorted by status priority
  const filteredCandidates = useMemo(() => {
    const filtered = candidates.filter(candidate => {
      // Status filter with special handling for 'all' (excludes rejected) and 'all_including_rejected'
      if (statusFilter === 'all') {
        // 'all' now means "all active" - excludes rejected candidates
        if (candidate.status === 'rejected') {
          return false
        }
      } else if (statusFilter === 'all_including_rejected') {
        // Show everything including rejected
        // No status filtering needed
      } else {
        // Specific status filter
        if (candidate.status !== statusFilter) {
          return false
        }
      }

      // Job filter - check multiple fields since candidates can be linked by jobId, assignedJobId, or jobTitle
      if (jobFilter.length > 0) {
        const matchesAnyJob = jobFilter.some(filterId => {
          const matchesJobId = candidate.jobId === filterId
          const matchesAssignedJobId = candidate.assignedJobId === filterId
          // Also check if the job title matches (for backwards compatibility)
          const selectedJob = activeJobs.find(j => j.id === filterId)
          const matchesJobTitle = selectedJob && candidate.jobTitle === selectedJob.title
          
          return matchesJobId || matchesAssignedJobId || matchesJobTitle
        })
        
        if (!matchesAnyJob) {
          return false
        }
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

    // Sort by date only (newest first) - regardless of status
    return filtered.sort((a, b) => {
      const dateA = a.createdAt?.toDate?.()?.getTime() || 0
      const dateB = b.createdAt?.toDate?.()?.getTime() || 0
      return dateB - dateA
    })
  }, [candidates, statusFilter, searchTerm, jobFilter, activeJobs])

  // Count of rejected candidates (for showing in filter)
  const rejectedCount = useMemo(() => {
    return candidates.filter(c => c.status === 'rejected').length
  }, [candidates])

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
      const activityData: Record<string, any> = {
        entityType: 'candidate',
        entityId,
        action,
        description,
        userId: user?.id || '',
        userName: user?.displayName || user?.email || 'Unknown',
        createdAt: serverTimestamp(),
      }
      
      // Only include previousValue and newValue if they exist
      if (previousValue !== undefined) {
        activityData.previousValue = removeUndefined(previousValue)
      }
      if (newValue !== undefined) {
        activityData.newValue = removeUndefined(newValue)
      }
      
      await addDoc(collection(db, COLLECTIONS.ACTIVITY_LOG), activityData)
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

    if (!selectedJobId) {
      errors.jobTitle = 'Please select a job posting'
    }

    if (!addForm.location.trim()) {
      errors.location = 'Branch is required - candidates must be assigned to a branch'
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

  // Handle job selection - auto-fill title and branch
  const handleJobSelect = (jobId: string) => {
    setSelectedJobId(jobId)
    const job = activeJobs.find(j => j.id === jobId)
    if (job) {
      setAddForm(prev => ({
        ...prev,
        jobTitle: job.title,
        location: job.branchName
      }))
    } else {
      setAddForm(prev => ({
        ...prev,
        jobTitle: '',
        location: ''
      }))
    }
  }

  // Check for duplicates before adding - returns DuplicateCheckResponse with full data
  const checkForDuplicates = (): DuplicateCheckResponse => {
    if (!addForm.firstName && !addForm.lastName && !addForm.phone && !addForm.email) {
      return { hasDuplicates: false, matches: [], highestSeverity: null, recommendedAction: 'allow' }
    }

    // Find the branch ID for the selected location
    const selectedBranch = locations.find(loc => loc.name === addForm.location)

    // Prepare existing candidates data for duplicate detection
    // Exclude candidates that have already been marked as "not duplicate" in this session
    const existingCandidatesData: ExistingCandidateData[] = candidates
      .filter(c => !notDuplicateIds.includes(c.id)) // Exclude already-dismissed duplicates
      .map(c => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        email: c.email,
        phoneNormalized: c.phoneNormalized,
        duplicateKey: c.duplicateKey,
        status: c.status,
        jobId: c.jobId,
        jobTitle: c.jobTitle,
        branchId: c.branchId,
        branchName: c.branchName || c.location,
        createdAt: c.createdAt,
        duplicateStatus: c.duplicateStatus,
      }))

    // Use the new comprehensive duplicate detection
    const result = findDuplicates(
      {
        firstName: addForm.firstName,
        lastName: addForm.lastName,
        phone: addForm.phone,
        email: addForm.email,
        jobId: undefined, // Could be set if job is selected
        branchId: selectedBranch?.id,
      },
      existingCandidatesData
    )

    return result
  }

  // Submit new candidate (with optional force add)
  const handleAddCandidate = async (forceAdd = false) => {
    if (!validateForm()) return

    // Check for duplicates unless forcing
    if (!forceAdd) {
      setCheckingDuplicates(true)
      const result = checkForDuplicates()
      setCheckingDuplicates(false)

      if (result.hasDuplicates) {
        setDuplicateMatches(result.matches)
        setDuplicateRecommendedAction(result.recommendedAction)
        setShowDuplicateWarning(true)
        return
      }
    }

    // Clear any duplicate warnings
    setShowDuplicateWarning(false)
    setDuplicateMatches([])
    setDuplicateRecommendedAction('allow')

    try {
      setSubmitting(true)

      const phoneNormalized = normalizePhone(addForm.phone)
      const duplicateKey = generateDuplicateKey(addForm.firstName, addForm.lastName, addForm.phone)

      // Prepare candidate data
      const candidateData: any = {
        firstName: addForm.firstName.trim(),
        lastName: addForm.lastName.trim(),
        email: addForm.email.trim().toLowerCase(),
        phone: addForm.phone.trim(),
        phoneNormalized,
        address: addForm.address.trim(),
        postcode: addForm.postcode ? formatPostcode(addForm.postcode) : '',
        source: addForm.source,
        jobTitle: addForm.jobTitle.trim(),
        location: addForm.location,
        notes: addForm.notes.trim(),
        status: 'new' as CandidateStatus,
        duplicateKey,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user?.id || '',
      }

      // If there were "not duplicate" decisions made, store them
      if (notDuplicateIds.length > 0) {
        candidateData.notDuplicateOf = notDuplicateIds
        candidateData.duplicateStatus = 'reviewed'
        candidateData.duplicateReviewedAt = serverTimestamp()
        candidateData.duplicateReviewedBy = user?.id || ''
      }

      // If we have a CV, include it
      if (addCvUrl && addCvFile) {
        candidateData.cvUrl = addCvUrl
        candidateData.cvFileName = addCvFile.name
        candidateData.cvUploadedAt = serverTimestamp()
        
        // Include parsed data if available
        if (addParsedData) {
          candidateData.cvParsedData = addParsedData
          candidateData.cvParsedAt = serverTimestamp()
          candidateData.skills = addParsedData.skills || []
          candidateData.parsedQualifications = addParsedData.qualifications || []
        }
      }

      const docRef = await addDoc(collection(db, COLLECTIONS.CANDIDATES), candidateData)

      // If we have a CV, move it to the permanent location
      if (addCvUrl && addCvFile) {
        try {
          // Fetch the file from temp location
          const response = await fetch(addCvUrl)
          const blob = await response.blob()
          
          // Upload to permanent location
          const permanentPath = getCvPath(docRef.id, addCvFile.name)
          const permanentRef = ref(storage, permanentPath)
          await uploadBytes(permanentRef, blob)
          const permanentUrl = await getDownloadURL(permanentRef)
          
          // Update candidate with permanent URL
          await updateDoc(doc(db, COLLECTIONS.CANDIDATES, docRef.id), {
            cvUrl: permanentUrl,
          })
          
          candidateData.cvUrl = permanentUrl
        } catch (cvErr) {
          console.error('Error moving CV to permanent location:', cvErr)
          // Continue anyway, the temp URL will still work
        }
      }

      // Log the creation
      await logActivity(
        docRef.id,
        'created',
        `Candidate "${addForm.firstName.trim()} ${addForm.lastName.trim()}" was added${addCvFile ? ' with CV' : ''}`,
        undefined,
        { 
          firstName: candidateData.firstName,
          lastName: candidateData.lastName,
          email: candidateData.email,
          status: candidateData.status,
          hasCV: !!addCvFile,
        }
      )

      // Update existing candidates with the new candidate ID in their notDuplicateOf
      if (notDuplicateIds.length > 0) {
        for (const existingId of notDuplicateIds) {
          try {
            const existingCandidate = candidates.find(c => c.id === existingId)
            const existingNotDuplicateOf = existingCandidate?.notDuplicateOf || []
            const existingRef = doc(db, COLLECTIONS.CANDIDATES, existingId)
            await updateDoc(existingRef, {
              notDuplicateOf: [...existingNotDuplicateOf, docRef.id],
              updatedAt: serverTimestamp(),
            })
          } catch (err) {
            console.error('Error updating notDuplicateOf for', existingId, err)
          }
        }
      }

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
      setAddCvFile(null)
      setAddCvUrl(null)
      setAddCvError(null)
      setAddParsedData(null)
      setShowDuplicateWarning(false)
      setDuplicateMatches([])
      setNotDuplicateIds([]) // Reset the not-duplicate tracking
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
    setAddCvFile(null)
    setAddCvError(null)
    setAddCvUrl(null)
    setAddParsedData(null)
    setShowDuplicateWarning(false)
    setDuplicateMatches([])
    setDuplicateRecommendedAction('allow')
    setNotDuplicateIds([])
  }

  // ==========================================================================
  // DUPLICATE HANDLING FUNCTIONS
  // ==========================================================================

  // View duplicate candidate in new tab
  const handleViewDuplicateCandidate = (candidateId: string) => {
    window.open(`/candidates/${candidateId}`, '_blank')
  }

  // Start merge process
  const handleStartMerge = (candidateId: string) => {
    const targetCandidate = candidates.find(c => c.id === candidateId)
    if (targetCandidate) {
      setMergeTargetCandidate(targetCandidate)
      setShowMergeModal(true)
    }
  }

  // Link records (creates new candidate linked to existing)
  const handleLinkRecords = async (existingCandidateId: string) => {
    if (!validateForm()) return

    const existingCandidate = candidates.find(c => c.id === existingCandidateId)
    if (!existingCandidate) {
      alert('Could not find the existing candidate record.')
      return
    }

    try {
      setSubmitting(true)
      const batch = writeBatch(db)

      const phoneNormalized = normalizePhone(addForm.phone)
      const duplicateKey = generateDuplicateKey(addForm.firstName, addForm.lastName, addForm.phone)
      const now = serverTimestamp()

      // Find the branch info for the new application
      const selectedBranch = locations.find(loc => loc.name === addForm.location)

      // Create application record for the new application
      const newApplicationRecord = {
        candidateId: '', // Will be set after we get the new doc ID
        jobId: selectedJobId,
        jobTitle: addForm.jobTitle.trim(),
        branchId: selectedBranch?.id || '',
        branchName: addForm.location,
        appliedAt: now,
        status: 'new' as CandidateStatus,
      }

      // Create the new candidate with link
      const candidateData: any = {
        firstName: addForm.firstName.trim(),
        lastName: addForm.lastName.trim(),
        email: addForm.email.trim().toLowerCase(),
        phone: addForm.phone.trim(),
        phoneNormalized,
        address: addForm.address.trim(),
        postcode: addForm.postcode ? formatPostcode(addForm.postcode) : '',
        source: addForm.source,
        jobId: selectedJobId,
        jobTitle: addForm.jobTitle.trim(),
        branchId: selectedBranch?.id || '',
        branchName: addForm.location,
        location: addForm.location,
        notes: addForm.notes.trim(),
        status: 'new' as CandidateStatus,
        duplicateKey,
        duplicateStatus: 'linked',
        primaryRecordId: existingCandidateId,
        linkedCandidateIds: [existingCandidateId],
        createdAt: now,
        updatedAt: now,
        createdBy: user?.id || '',
      }

      // Add CV if present
      if (addCvUrl && addCvFile) {
        candidateData.cvUrl = addCvUrl
        candidateData.cvFileName = addCvFile.name
        candidateData.cvUploadedAt = now
        if (addParsedData) {
          candidateData.cvParsedData = addParsedData
          candidateData.cvParsedAt = now
          candidateData.skills = addParsedData.skills || []
          candidateData.parsedQualifications = addParsedData.qualifications || []
        }
      }

      const newDocRef = doc(collection(db, COLLECTIONS.CANDIDATES))
      
      // Update the application record with the new candidate ID
      newApplicationRecord.candidateId = newDocRef.id
      candidateData.applicationHistory = [removeUndefined(newApplicationRecord)]

      batch.set(newDocRef, removeUndefined(candidateData))

      // Build existing candidate's application history
      const existingApplicationHistory = (existingCandidate.applicationHistory || []).map(removeUndefined)
      
      // Add the existing candidate's current job as an application record if not already present
      const existingHasCurrentJob = existingApplicationHistory.some(
        app => app.jobTitle === existingCandidate.jobTitle && app.branchName === (existingCandidate.branchName || existingCandidate.location)
      )
      
      if (!existingHasCurrentJob && existingCandidate.jobTitle) {
        existingApplicationHistory.push(removeUndefined({
          candidateId: existingCandidateId,
          jobId: existingCandidate.jobId || existingCandidate.jobTitle || '',
          jobTitle: existingCandidate.jobTitle || '',
          branchId: existingCandidate.branchId || '',
          branchName: existingCandidate.branchName || existingCandidate.location || '',
          appliedAt: existingCandidate.createdAt || serverTimestamp(),
          status: existingCandidate.status,
        }))
      }

      // Update existing candidate to link back
      const existingRef = doc(db, COLLECTIONS.CANDIDATES, existingCandidateId)
      const existingLinkedIds = existingCandidate.linkedCandidateIds || []
      batch.update(existingRef, removeUndefined({
        linkedCandidateIds: [...existingLinkedIds, newDocRef.id],
        duplicateStatus: 'primary',
        applicationHistory: existingApplicationHistory,
        updatedAt: now,
      }))

      await batch.commit()

      // Log the creation activity
      await logActivity(
        newDocRef.id,
        'created',
        `New application linked to existing record for ${existingCandidate.firstName} ${existingCandidate.lastName}`,
        undefined,
        { 
          linkedTo: existingCandidateId,
          jobTitle: addForm.jobTitle,
          branchName: addForm.location,
        }
      )

      // Log link activity on existing record
      await logActivity(
        existingCandidateId,
        'updated',
        `New application linked: ${addForm.jobTitle} at ${addForm.location}`,
        undefined,
        { 
          linkedFrom: newDocRef.id,
          newJobTitle: addForm.jobTitle,
          newBranchName: addForm.location,
        }
      )

      // Add to local state
      const newCandidate: Candidate = {
        id: newDocRef.id,
        ...candidateData,
        createdAt: { toDate: () => new Date() } as any,
        updatedAt: { toDate: () => new Date() } as any,
      }
      setCandidates(prev => {
        // Update the existing candidate in local state
        const updated = prev.map(c => 
          c.id === existingCandidateId 
            ? { 
                ...c, 
                linkedCandidateIds: [...existingLinkedIds, newDocRef.id],
                duplicateStatus: 'primary' as const,
                applicationHistory: existingApplicationHistory,
                updatedAt: { toDate: () => new Date() } as any,
              }
            : c
        )
        return [newCandidate, ...updated]
      })

      // Close modal and reset
      handleCloseAddModal()
      alert(`✅ New application created and linked!\n\nCandidate: ${addForm.firstName} ${addForm.lastName}\nJob: ${addForm.jobTitle}\nLocation: ${addForm.location}\n\nLinked to existing record for ${existingCandidate.firstName} ${existingCandidate.lastName}`)
    } catch (err) {
      console.error('Error linking records:', err)
      alert('Failed to link records. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Mark as not duplicate and proceed
  const handleMarkNotDuplicate = async (existingCandidateId: string) => {
    const matchInfo = duplicateMatches.find(m => m.candidateId === existingCandidateId)
    
    // Remove from current matches
    setDuplicateMatches(prev => prev.filter(m => m.candidateId !== existingCandidateId))
    
    // Store the "not duplicate" decision when we actually create the candidate
    // We'll add this to the candidate data during creation
    // For now, store in a local list
    setNotDuplicateIds(prev => [...prev, existingCandidateId])
    
    // Also update the existing candidate to mark this combination as reviewed
    try {
      const existingRef = doc(db, COLLECTIONS.CANDIDATES, existingCandidateId)
      const existingCandidate = candidates.find(c => c.id === existingCandidateId)
      const existingNotDuplicateOf = existingCandidate?.notDuplicateOf || []
      
      // We'll add a placeholder - the actual new candidate ID will be added after creation
      // For now, mark as reviewed with a note
      await updateDoc(existingRef, {
        duplicateReviewedAt: serverTimestamp(),
        duplicateReviewedBy: user?.id || '',
        updatedAt: serverTimestamp(),
      })

      // Log the decision
      await logActivity(
        existingCandidateId,
        'updated',
        `Marked as "not a duplicate" of new candidate being added (${addForm.firstName} ${addForm.lastName})`,
        undefined,
        { 
          action: 'not_duplicate',
          newCandidateName: `${addForm.firstName} ${addForm.lastName}`,
          newCandidateEmail: addForm.email,
          newCandidatePhone: addForm.phone,
        }
      )
    } catch (err) {
      console.error('Error updating not-duplicate status:', err)
    }

    if (duplicateMatches.length <= 1) {
      // Last one dismissed, proceed with add
      handleAddCandidate(true)
    }
  }

  // State to track "not duplicate" decisions during add flow
  const [notDuplicateIds, setNotDuplicateIds] = useState<string[]>([])

  // Dismiss a specific duplicate match
  const handleDismissDuplicateMatch = (candidateId: string) => {
    setDuplicateMatches(prev => prev.filter(m => m.candidateId !== candidateId))
    if (duplicateMatches.length <= 1) {
      setShowDuplicateWarning(false)
    }
  }

  // Handle merge completion
  const handleMergeComplete = async (
    mergedData: Partial<MergeCandidate>, 
    deleteSecondary: boolean,
    combinedFields: CombinedFieldsData
  ) => {
    if (!mergeTargetCandidate) return

    // For now, the "secondary" is the new candidate being added from the form
    // The "primary" is the existing record (mergeTargetCandidate)
    // We're updating the primary with selected/combined data

    try {
      setMerging(true)

      // Prepare update data, applying combined fields
      const updateData: Record<string, any> = {
        ...mergedData,
        updatedAt: serverTimestamp(),
      }

      // Apply combined fields (these override the merged data)
      if (combinedFields.notes) {
        updateData.notes = combinedFields.notes
      }
      if (combinedFields.skills) {
        updateData.skills = combinedFields.skills
      }
      if (combinedFields.qualifications) {
        updateData.parsedQualifications = combinedFields.qualifications
      }

      // Update phone normalized if phone changed
      if (updateData.phone) {
        updateData.phoneNormalized = normalizePhone(updateData.phone)
        updateData.duplicateKey = generateDuplicateKey(
          updateData.firstName || mergeTargetCandidate.firstName,
          updateData.lastName || mergeTargetCandidate.lastName,
          updateData.phone
        )
      }

      // Track that this record has been merged
      updateData.duplicateStatus = 'primary'
      updateData.duplicateReviewedAt = serverTimestamp()
      updateData.duplicateReviewedBy = user?.id || ''

      // Remove undefined values before saving to Firestore
      const cleanedUpdateData = removeUndefined(updateData)

      // Update the existing candidate with merged data
      const existingRef = doc(db, COLLECTIONS.CANDIDATES, mergeTargetCandidate.id)
      await updateDoc(existingRef, cleanedUpdateData)

      // Log the merge activity
      await logActivity(
        mergeTargetCandidate.id,
        'updated',
        `Candidate record merged. ${Object.keys(cleanedUpdateData).length} fields updated.${deleteSecondary ? ' Source record deleted.' : ''}`,
        undefined,
        { 
          mergedFields: Object.keys(mergedData),
          combinedFields: Object.keys(combinedFields),
          deletedSecondary: deleteSecondary,
        }
      )

      // Update local state
      setCandidates(prev => prev.map(c => 
        c.id === mergeTargetCandidate.id 
          ? { ...c, ...cleanedUpdateData, updatedAt: { toDate: () => new Date() } as any }
          : c
      ))

      // Close modals
      setShowMergeModal(false)
      setMergeTargetCandidate(null)
      handleCloseAddModal()
      
      // Show success message
      const message = deleteSecondary 
        ? 'Records merged successfully. The duplicate was not saved.'
        : 'Records merged successfully.'
      alert(message)
    } catch (err) {
      console.error('Error merging records:', err)
      alert('Failed to merge records. Please try again.')
    } finally {
      setMerging(false)
    }
  }

  // ==========================================================================
  // END DUPLICATE HANDLING FUNCTIONS
  // ==========================================================================

  // ==========================================================================
  // BULK INVITE FUNCTIONS
  // ==========================================================================

  // Toggle selection for a single candidate
  const toggleCandidateSelection = (candidateId: string) => {
    setSelectedCandidateIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(candidateId)) {
        newSet.delete(candidateId)
      } else {
        newSet.add(candidateId)
      }
      return newSet
    })
  }

  // Select/deselect all visible candidates
  const toggleSelectAll = () => {
    if (selectedCandidateIds.size === paginatedCandidates.length) {
      setSelectedCandidateIds(new Set())
    } else {
      setSelectedCandidateIds(new Set(paginatedCandidates.map(c => c.id)))
    }
  }

  // Clear selection
  const clearSelection = () => {
    setSelectedCandidateIds(new Set())
  }

  // Get selected candidates
  const selectedCandidates = useMemo(() => {
    return candidates.filter(c => selectedCandidateIds.has(c.id))
  }, [candidates, selectedCandidateIds])

  // Open bulk invite modal and start processing immediately
  const openBulkInviteModal = (type: 'interview' | 'trial') => {
    setBulkInviteType(type)
    setBulkInviteResults([])
    setShowBulkInviteModal(true)
    // Start processing immediately
    setBulkInviteProcessing(true)
  }

  // Effect to start processing when modal opens
  useEffect(() => {
    if (showBulkInviteModal && bulkInviteProcessing && bulkInviteResults.length === 0) {
      processBulkInvites()
    }
  }, [showBulkInviteModal, bulkInviteProcessing])

  // Process bulk invites - uses Cloud Function for consistent token hashing
  const processBulkInvites = async () => {
    if (selectedCandidates.length === 0) return

    const results: typeof bulkInviteResults = []
    const functions = getFirebaseFunctions()

    // Use the same Cloud Function that EmailModal/WhatsAppModal use
    const createBookingLinkFn = httpsCallable<{
      candidateId: string
      candidateName: string
      candidateEmail?: string
      type: 'interview' | 'trial'
      branchId?: string
      branchName?: string
    }, {
      success: boolean
      bookingLink?: string
      token?: string
      expiresAt?: string
      error?: string
    }>(functions, 'createBookingLink')

    for (const candidate of selectedCandidates) {
      try {
        // Call Cloud Function to create booking link (ensures consistent token hashing)
        const result = await createBookingLinkFn({
          candidateId: candidate.id,
          candidateName: `${candidate.firstName} ${candidate.lastName}`,
          candidateEmail: candidate.email || undefined,
          type: bulkInviteType,
          branchId: candidate.branchId || undefined,
          branchName: candidate.branchName || candidate.location || undefined,
        })

        if (!result.data.success || !result.data.bookingLink) {
          throw new Error(result.data.error || 'Failed to create booking link')
        }

        const bookingUrl = result.data.bookingLink

        // Update candidate status to invite_sent
        const candidateRef = doc(db, COLLECTIONS.CANDIDATES, candidate.id)
        await updateDoc(candidateRef, {
          status: 'invite_sent',
          updatedAt: serverTimestamp(),
        })

        // Log activity
        await logActivity(
          candidate.id,
          'status_changed',
          `${bulkInviteType === 'interview' ? 'Interview' : 'Trial'} booking link sent (bulk invite)`,
          { status: candidate.status },
          { status: 'invite_sent' }
        )

        // Update local candidate state
        setCandidates(prev => prev.map(c =>
          c.id === candidate.id ? { ...c, status: 'invite_sent' as CandidateStatus } : c
        ))

        results.push({
          candidateId: candidate.id,
          candidateName: `${candidate.firstName} ${candidate.lastName}`,
          candidatePhone: candidate.phone || '',
          candidateEmail: candidate.email || '',
          jobTitle: candidate.jobTitle || '-',
          branchName: candidate.branchName || candidate.location || '-',
          success: true,
          bookingUrl,
        })

      } catch (err: any) {
        console.error(`Error creating booking link for ${candidate.firstName} ${candidate.lastName}:`, err)
        results.push({
          candidateId: candidate.id,
          candidateName: `${candidate.firstName} ${candidate.lastName}`,
          candidatePhone: candidate.phone || '',
          candidateEmail: candidate.email || '',
          jobTitle: candidate.jobTitle || '-',
          branchName: candidate.branchName || candidate.location || '-',
          success: false,
          error: err.message || 'Failed to create booking link',
        })
      }

      // Update results as we go
      setBulkInviteResults([...results])
    }

    setBulkInviteProcessing(false)
    // Don't clear selection here - let user see results and click WhatsApp buttons
    // Selection will be cleared when modal is closed
  }

  // Generate WhatsApp message
  const getWhatsAppMessage = (candidateName: string, bookingUrl: string, type: 'interview' | 'trial') => {
    const firstName = candidateName.split(' ')[0]
    if (type === 'interview') {
      return `Hi ${firstName}, thank you for your application to Allied Pharmacies! We'd like to invite you for an interview. Please book a convenient time using this link: ${bookingUrl}`
    } else {
      return `Hi ${firstName}, following your interview with Allied Pharmacies, we'd like to invite you for a trial shift. Please book a convenient time using this link: ${bookingUrl}`
    }
  }

  // Open WhatsApp with pre-filled message
  const openWhatsApp = (phone: string, message: string) => {
    // Format phone for WhatsApp (remove spaces, ensure country code)
    let formattedPhone = phone.replace(/\s/g, '').replace(/[^\d+]/g, '')
    
    // If UK number starting with 0, convert to +44
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '44' + formattedPhone.substring(1)
    }
    // If doesn't start with +, assume it needs country code
    if (!formattedPhone.startsWith('+') && !formattedPhone.startsWith('44')) {
      formattedPhone = '44' + formattedPhone
    }
    // Remove + for WhatsApp URL
    formattedPhone = formattedPhone.replace('+', '')

    const encodedMessage = encodeURIComponent(message)
    window.open(`https://wa.me/${formattedPhone}?text=${encodedMessage}`, '_blank')
  }

  // Copy booking link to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      alert('Link copied to clipboard!')
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Close bulk invite modal
  const closeBulkInviteModal = () => {
    setShowBulkInviteModal(false)
    setBulkInviteResults([])
    clearSelection() // Clear selection when modal closes
  }

  // Get email message body
  const getEmailMessage = (candidateName: string, bookingUrl: string, type: 'interview' | 'trial') => {
    const firstName = candidateName.split(' ')[0]
    if (type === 'interview') {
      return `Dear ${firstName},

Thank you for your application to Allied Pharmacies!

We would like to invite you for an interview. Please book a convenient time using the link below:

${bookingUrl}

If you have any questions, please don't hesitate to contact us.

Best regards,
Allied Recruitment Team`
    } else {
      return `Dear ${firstName},

Following your interview with Allied Pharmacies, we are pleased to invite you for a trial shift.

Please book a convenient time using the link below:

${bookingUrl}

What to bring:
• GPhC registration (if applicable)
• Photo ID
• Smart professional attire

Best regards,
Allied Recruitment Team`
    }
  }

  // Get email subject
  const getEmailSubject = (type: 'interview' | 'trial') => {
    if (type === 'interview') {
      return 'Interview Invitation - Allied Pharmacies'
    } else {
      return 'Trial Shift Invitation - Allied Pharmacies'
    }
  }

  // Send single email
  const sendSingleEmail = async (result: typeof bulkInviteResults[0]) => {
    if (!result.candidateEmail || !result.bookingUrl) return

    try {
      const functions = getFirebaseFunctions()
      const sendEmailFn = httpsCallable(functions, 'sendCandidateEmail')
      
      await sendEmailFn({
        to: result.candidateEmail,
        candidateId: result.candidateId,
        candidateName: result.candidateName,
        subject: getEmailSubject(bulkInviteType),
        body: getEmailMessage(result.candidateName, result.bookingUrl, bulkInviteType),
        type: bulkInviteType,
      })
      
      // Update result with email sent status
      setBulkInviteResults(prev => prev.map(r => 
        r.candidateId === result.candidateId 
          ? { ...r, emailSent: true }
          : r
      ))
    } catch (error: any) {
      console.error('Error sending email:', error)
      // Update result with email error
      setBulkInviteResults(prev => prev.map(r => 
        r.candidateId === result.candidateId 
          ? { ...r, emailSent: false, emailError: error.message }
          : r
      ))
    }
  }

  // Send all emails - sends individually and updates each with tick
  const sendAllEmails = async () => {
    const emailableResults = bulkInviteResults.filter(r => r.success && r.candidateEmail && r.bookingUrl && !r.emailSent)
    if (emailableResults.length === 0) return

    setSendingBulkEmails(true)

    const functions = getFirebaseFunctions()
    const sendEmailFn = httpsCallable(functions, 'sendCandidateEmail')

    for (const result of emailableResults) {
      try {
        await sendEmailFn({
          to: result.candidateEmail,
          candidateId: result.candidateId,
          candidateName: result.candidateName,
          subject: getEmailSubject(bulkInviteType),
          body: getEmailMessage(result.candidateName, result.bookingUrl!, bulkInviteType),
          type: bulkInviteType,
        })
        
        // Update with success tick
        setBulkInviteResults(prev => prev.map(r => 
          r.candidateId === result.candidateId 
            ? { ...r, emailSent: true }
            : r
        ))
      } catch (error: any) {
        console.error(`Error sending email to ${result.candidateName}:`, error)
        // Update with error
        setBulkInviteResults(prev => prev.map(r => 
          r.candidateId === result.candidateId 
            ? { ...r, emailSent: false, emailError: error.message }
            : r
        ))
      }
    }

    setSendingBulkEmails(false)
  }

  // ==========================================================================
  // END BULK INVITE FUNCTIONS
  // ==========================================================================

  // Handle CV file selection in Add modal
  const handleAddCvSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!validTypes.includes(file.type)) {
      setAddCvError('Please upload a PDF or Word document')
      return
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setAddCvError('File size must be less than 10MB')
      return
    }

    setAddCvFile(file)
    setAddCvError(null)

    // Upload the CV and then parse it with AI
    try {
      setAddCvUploading(true)

      // Upload to temporary location
      const tempPath = `temp-cvs/${user?.id || 'anonymous'}/${Date.now()}_${file.name}`
      const storageRef = ref(storage, tempPath)
      await uploadBytes(storageRef, file)
      const downloadUrl = await getDownloadURL(storageRef)
      setAddCvUrl(downloadUrl)
      setAddCvUploading(false)

      // Now parse the CV with AI
      setAddCvParsing(true)
      try {
        const parseCV = httpsCallable(functions, 'parseCV')
        
        // Determine mime type
        let mimeType = 'application/pdf'
        const ext = file.name.split('.').pop()?.toLowerCase()
        if (ext === 'doc') mimeType = 'application/msword'
        if (ext === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

        const result = await parseCV({
          fileUrl: downloadUrl,
          fileName: file.name,
          mimeType,
        })

        const response = result.data as { success: boolean; data?: any; usedAI?: boolean; error?: string }

        if (response.success && response.data) {
          const parsed = response.data
          
          // Auto-fill the form with parsed data
          setAddForm(prev => ({
            ...prev,
            firstName: parsed.firstName || prev.firstName,
            lastName: parsed.lastName || prev.lastName,
            email: parsed.email || prev.email,
            phone: parsed.phone || prev.phone,
            address: parsed.address || prev.address,
            postcode: parsed.postcode || prev.postcode,
            jobTitle: parsed.jobTitle || prev.jobTitle,
          }))
          
          // Store parsed data for later use
          setAddParsedData({
            ...parsed,
            usedAI: response.usedAI ?? false
          })
        }
      } catch (parseErr: any) {
        console.error('CV parse error:', parseErr)
        // Don't show error - just continue without auto-fill
      } finally {
        setAddCvParsing(false)
      }
    } catch (err: any) {
      console.error('CV upload error:', err)
      setAddCvError(err.message || 'Failed to upload CV')
      setAddCvUploading(false)
    }

    // Reset file input
    if (addCvInputRef.current) {
      addCvInputRef.current.value = ''
    }
  }

  // Remove CV from Add modal
  const handleRemoveAddCv = () => {
    setAddCvFile(null)
    setAddCvUrl(null)
    setAddCvError(null)
    setAddParsedData(null)
  }

  // ============================================================================
  // BULK UPLOAD HANDLERS
  // ============================================================================

  const handleBulkFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    const validFiles = files.filter(file => {
      const validTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ]
      return validTypes.includes(file.type) && file.size <= 10 * 1024 * 1024
    })
    
    if (validFiles.length !== files.length) {
      alert(`${files.length - validFiles.length} files were skipped (invalid type or >10MB)`)
    }
    
    setBulkFiles(prev => [...prev, ...validFiles])
    
    // Reset input
    if (bulkFileInputRef.current) {
      bulkFileInputRef.current.value = ''
    }
  }

  const removeBulkFile = (index: number) => {
    setBulkFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleCloseBulkModal = () => {
    setShowBulkModal(false)
    setBulkFiles([])
    setBulkJobTitle('')
    setBulkLocation('')
    setBulkSource('indeed')
    setBulkProgress([])
  }

  // Process a single file - try AI parsing first, fallback to filename parsing
  const processFileWithRetry = async (
    file: File, 
    index: number, 
    retryCount = 0
  ): Promise<boolean> => {
    try {
      // Update status: uploading
      setBulkProgress(prev => prev.map((p, idx) => 
        idx === index ? { ...p, status: 'uploading' as const, message: 'Uploading CV...' } : p
      ))

      // Create a temporary candidate ID for storage
      const tempId = `temp_${Date.now()}_${index}`
      const fileName = `${Date.now()}_${file.name}`
      const storagePath = getCvPath(tempId, fileName)
      const storageRef = ref(storage, storagePath)

      // Upload file
      await uploadBytes(storageRef, file)
      const downloadUrl = await getDownloadURL(storageRef)

      // Try AI parsing first
      let parsed: any = null
      let usedAiParsing = false

      try {
        // Update status: parsing with AI
        setBulkProgress(prev => prev.map((p, idx) => 
          idx === index ? { ...p, status: 'parsing' as const, message: 'Parsing with AI...' } : p
        ))

        const parseCV = httpsCallable(functions, 'parseCV', { timeout: 120000 })
        
        const ext = file.name.toLowerCase().split('.').pop()
        let mimeType = 'application/pdf'
        if (ext === 'doc') mimeType = 'application/msword'
        if (ext === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

        const parseResult = await parseCV({
          fileUrl: downloadUrl,
          fileName: file.name,
          mimeType,
        })

        const response = parseResult.data as { success: boolean; data?: any; error?: string }

        if (response.success && response.data) {
          parsed = response.data
          usedAiParsing = true
        } else {
          console.log(`AI parsing failed for ${file.name}: ${response.error}, using fallback`)
        }
      } catch (aiErr: any) {
        console.log(`AI parsing error for ${file.name}: ${aiErr.message}, using fallback`)
        // AI parsing failed - continue with fallback
      }

      // Fallback: extract name from filename if AI didn't work
      if (!parsed) {
        setBulkProgress(prev => prev.map((p, idx) => 
          idx === index ? { ...p, status: 'parsing' as const, message: 'Extracting from filename...' } : p
        ))

        const nameFromFile = file.name
          .replace(/\.(pdf|doc|docx)$/i, '')
          .replace(/^(resume|cv|curriculum.?vitae)[-_\s]*/i, '')
          .replace(/[-_]/g, ' ')
          .replace(/\s*\d{4}\s*/g, ' ')
          .replace(/\s*(copy|\(\d+\))\s*/gi, '')
          .trim()

        const nameParts = nameFromFile.split(/\s+/)
        parsed = {
          firstName: nameParts[0] || 'Unknown',
          lastName: nameParts.slice(1).join(' ') || '(CV Upload)',
          email: '',
          phone: '',
          address: '',
          postcode: '',
        }
      }

      // Update status: creating
      setBulkProgress(prev => prev.map((p, idx) => 
        idx === index ? { 
          ...p, 
          status: 'creating' as const, 
          message: 'Checking for duplicates...',
          parsedName: `${parsed.firstName || ''} ${parsed.lastName || ''}`.trim() || file.name
        } : p
      ))

      // Check for duplicates before creating
      const phoneNormalized = normalizePhone(parsed.phone || '')
      const duplicateKey = generateDuplicateKey(
        parsed.firstName || 'Unknown',
        parsed.lastName || 'Candidate',
        parsed.phone || ''
      )

      // Prepare data for duplicate check
      const existingCandidatesData: ExistingCandidateData[] = candidates.map(c => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        email: c.email,
        phoneNormalized: c.phoneNormalized,
        duplicateKey: c.duplicateKey,
        status: c.status,
        jobId: c.jobId,
        jobTitle: c.jobTitle,
        branchId: c.branchId,
        branchName: c.branchName || c.location,
        createdAt: c.createdAt,
        duplicateStatus: c.duplicateStatus,
      }))

      // Check for duplicates
      const duplicateCheck = findDuplicates(
        {
          firstName: parsed.firstName || 'Unknown',
          lastName: parsed.lastName || 'Candidate',
          phone: parsed.phone || '',
          email: parsed.email || '',
          jobId: bulkJobTitle,
          branchId: activeJobs.find(j => j.id === bulkJobTitle)?.branchId || '',
        },
        existingCandidatesData
      )

      // If high-confidence duplicate found, flag it instead of creating
      if (duplicateCheck.hasDuplicates && duplicateCheck.highestSeverity === 'high') {
        const topMatch = duplicateCheck.matches[0]
        setBulkProgress(prev => prev.map((p, idx) => 
          idx === index ? { 
            ...p, 
            status: 'duplicate' as const, 
            message: `Duplicate of ${topMatch.existingCandidate.firstName} ${topMatch.existingCandidate.lastName} (${topMatch.confidence}% match)`,
            parsedName: `${parsed.firstName || ''} ${parsed.lastName || ''}`.trim(),
            duplicateOf: topMatch.candidateId,
            duplicateConfidence: topMatch.confidence,
            // Store data for later resolution
            parsedData: { ...parsed, usedAiParsing },
            cvUrl: downloadUrl,
            cvStoragePath: storagePath,
            fileIndex: index,
          } : p
        ))
        return false // Don't create
      }

      // Update status: creating (no high-confidence duplicates)
      setBulkProgress(prev => prev.map((p, idx) => 
        idx === index ? { 
          ...p, 
          status: 'creating' as const, 
          message: 'Creating candidate...',
        } : p
      ))

      // Create candidate
      const selectedJob = activeJobs.find(j => j.id === bulkJobTitle)
      const candidateData: any = {
        firstName: parsed.firstName || 'Unknown',
        lastName: parsed.lastName || 'Candidate',
        email: parsed.email || '',
        phone: parsed.phone || '',
        phoneNormalized,
        address: parsed.address || '',
        postcode: parsed.postcode || '',
        source: bulkSource,
        jobId: bulkJobTitle,
        jobTitle: selectedJob?.title || '',
        branchId: selectedJob?.branchId || '',
        branchName: selectedJob?.branchName || '',
        location: selectedJob?.branchName || '',
        status: 'new' as CandidateStatus,
        cvUrl: downloadUrl,
        cvFileName: file.name,
        cvStoragePath: storagePath,
        duplicateKey,
        needsReview: !usedAiParsing,  // Flag if AI parsing wasn't used
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user?.id || '',
      }

      // Add extra parsed data if AI parsing was used
      if (usedAiParsing && parsed) {
        candidateData.cvParsedData = parsed
        candidateData.cvParsedAt = serverTimestamp()
        if (parsed.skills) candidateData.skills = parsed.skills
        if (parsed.qualifications) candidateData.parsedQualifications = parsed.qualifications
        if (parsed.experience) candidateData.experience = parsed.experience
        if (parsed.education) candidateData.education = parsed.education
      }

      const docRef = await addDoc(collection(db, COLLECTIONS.CANDIDATES), candidateData)

      // Log activity
      await addDoc(collection(db, COLLECTIONS.ACTIVITY_LOG), {
        entityType: 'candidate',
        entityId: docRef.id,
        action: 'created',
        description: `Candidate created via bulk upload from ${file.name}${usedAiParsing ? ' (AI parsed)' : ' (filename only)'}`,
        userId: user?.id || '',
        userName: user?.displayName || user?.email || 'Unknown',
        createdAt: serverTimestamp(),
      })

      // Update status: success
      setBulkProgress(prev => prev.map((p, idx) => 
        idx === index ? { 
          ...p, 
          status: 'success' as const, 
          message: usedAiParsing ? 'Created (AI parsed)' : 'Created (needs review)',
          candidateId: docRef.id,
        } : p
      ))

      // Add to local candidates list
      setCandidates(prev => [{
        id: docRef.id,
        ...candidateData,
        createdAt: { toDate: () => new Date() } as any,
        updatedAt: { toDate: () => new Date() } as any,
      } as Candidate, ...prev])

      return true

    } catch (err: any) {
      console.error(`Error processing ${file.name}:`, err)
      
      setBulkProgress(prev => prev.map((p, idx) => 
        idx === index ? { 
          ...p, 
          status: 'error' as const, 
          message: 'Upload failed: ' + (err.message || 'Unknown error'),
          errorDetails: err.message,
        } : p
      ))

      return false
    }
  }

  // Retry failed files
  const retryFailedFiles = async () => {
    const failedIndices = bulkProgress
      .map((p, i) => p.status === 'error' ? i : -1)
      .filter(i => i !== -1)

    if (failedIndices.length === 0) return

    setBulkProcessing(true)

    for (const index of failedIndices) {
      await processFileWithRetry(bulkFiles[index], index, 0)
    }

    setBulkProcessing(false)
  }

  const processBulkUpload = async () => {
    if (bulkFiles.length === 0) return

    setBulkProcessing(true)
    
    // Initialize progress
    setBulkProgress(bulkFiles.map(f => ({
      fileName: f.name,
      status: 'pending' as const,
    })))

    for (let i = 0; i < bulkFiles.length; i++) {
      await processFileWithRetry(bulkFiles[i], i, 0)
    }

    setBulkProcessing(false)
  }

  // Handle "Add Anyway" for bulk duplicate
  const handleBulkAddAnyway = async (progressIndex: number) => {
    const item = bulkProgress[progressIndex]
    if (!item.parsedData || !item.cvUrl) return

    try {
      setBulkProgress(prev => prev.map((p, idx) => 
        idx === progressIndex ? { ...p, status: 'creating' as const, message: 'Creating candidate...' } : p
      ))

      const parsed = item.parsedData
      const phoneNormalized = normalizePhone(parsed.phone || '')
      const duplicateKey = generateDuplicateKey(
        parsed.firstName || 'Unknown',
        parsed.lastName || 'Candidate',
        parsed.phone || ''
      )

      const candidateData: any = {
        firstName: parsed.firstName || 'Unknown',
        lastName: parsed.lastName || 'Candidate',
        email: parsed.email || '',
        phone: parsed.phone || '',
        phoneNormalized,
        address: parsed.address || '',
        postcode: parsed.postcode || '',
        source: bulkSource,
        jobTitle: bulkJobTitle,
        location: bulkLocation,
        status: 'new' as CandidateStatus,
        cvUrl: item.cvUrl,
        cvFileName: item.fileName,
        cvStoragePath: item.cvStoragePath,
        duplicateKey,
        duplicateStatus: 'reviewed',
        notDuplicateOf: item.duplicateOf ? [item.duplicateOf] : [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user?.id || '',
      }

      if (parsed.usedAiParsing) {
        candidateData.cvParsedData = parsed
        candidateData.cvParsedAt = serverTimestamp()
        if (parsed.skills) candidateData.skills = parsed.skills
        if (parsed.qualifications) candidateData.parsedQualifications = parsed.qualifications
      } else {
        candidateData.needsReview = true
      }

      const docRef = await addDoc(collection(db, COLLECTIONS.CANDIDATES), removeUndefined(candidateData))

      // Update progress
      setBulkProgress(prev => prev.map((p, idx) => 
        idx === progressIndex ? { 
          ...p, 
          status: 'success' as const, 
          message: 'Created (marked not duplicate)',
          candidateId: docRef.id,
        } : p
      ))

      // Add to local state
      setCandidates(prev => [{
        id: docRef.id,
        ...candidateData,
        createdAt: { toDate: () => new Date() } as any,
        updatedAt: { toDate: () => new Date() } as any,
      } as Candidate, ...prev])

    } catch (err) {
      console.error('Error adding duplicate anyway:', err)
      setBulkProgress(prev => prev.map((p, idx) => 
        idx === progressIndex ? { ...p, status: 'error' as const, message: 'Failed to create' } : p
      ))
    }
  }

  // Handle "Link" for bulk duplicate
  const handleBulkLink = async (progressIndex: number) => {
    const item = bulkProgress[progressIndex]
    if (!item.parsedData || !item.cvUrl || !item.duplicateOf) return

    const existingCandidate = candidates.find(c => c.id === item.duplicateOf)
    if (!existingCandidate) {
      alert('Could not find existing candidate')
      return
    }

    try {
      setBulkProgress(prev => prev.map((p, idx) => 
        idx === progressIndex ? { ...p, status: 'creating' as const, message: 'Linking records...' } : p
      ))

      const parsed = item.parsedData
      const phoneNormalized = normalizePhone(parsed.phone || '')
      const duplicateKey = generateDuplicateKey(
        parsed.firstName || 'Unknown',
        parsed.lastName || 'Candidate',
        parsed.phone || ''
      )
      const now = serverTimestamp()

      const batch = writeBatch(db)

      // Application record for new candidate
      const newApplicationRecord = removeUndefined({
        candidateId: '', // Will be set after doc created
        jobId: bulkJobTitle || '',
        jobTitle: bulkJobTitle || '',
        branchId: bulkLocation || '',
        branchName: bulkLocation || '',
        appliedAt: now,
        status: 'new' as CandidateStatus,
      })

      // Create new linked candidate
      const candidateData: any = removeUndefined({
        firstName: parsed.firstName || 'Unknown',
        lastName: parsed.lastName || 'Candidate',
        email: parsed.email || '',
        phone: parsed.phone || '',
        phoneNormalized,
        address: parsed.address || '',
        postcode: parsed.postcode || '',
        source: bulkSource,
        jobTitle: bulkJobTitle,
        location: bulkLocation,
        branchName: bulkLocation,
        status: 'new' as CandidateStatus,
        cvUrl: item.cvUrl,
        cvFileName: item.fileName,
        cvStoragePath: item.cvStoragePath,
        duplicateKey,
        duplicateStatus: 'linked',
        primaryRecordId: existingCandidate.id,
        linkedCandidateIds: [existingCandidate.id],
        createdAt: now,
        updatedAt: now,
        createdBy: user?.id || '',
      })

      if (parsed.usedAiParsing) {
        candidateData.cvParsedData = parsed
        candidateData.cvParsedAt = now
        if (parsed.skills) candidateData.skills = parsed.skills
        if (parsed.qualifications) candidateData.parsedQualifications = parsed.qualifications
      }

      const newDocRef = doc(collection(db, COLLECTIONS.CANDIDATES))
      newApplicationRecord.candidateId = newDocRef.id
      candidateData.applicationHistory = [newApplicationRecord]

      batch.set(newDocRef, candidateData)

      // Update existing candidate
      const existingRef = doc(db, COLLECTIONS.CANDIDATES, existingCandidate.id)
      const existingLinkedIds = existingCandidate.linkedCandidateIds || []
      batch.update(existingRef, removeUndefined({
        linkedCandidateIds: [...existingLinkedIds, newDocRef.id],
        duplicateStatus: 'primary',
        updatedAt: now,
      }))

      await batch.commit()

      // Update progress
      setBulkProgress(prev => prev.map((p, idx) => 
        idx === progressIndex ? { 
          ...p, 
          status: 'success' as const, 
          message: `Linked to ${existingCandidate.firstName} ${existingCandidate.lastName}`,
          candidateId: newDocRef.id,
        } : p
      ))

      // Add to local state
      setCandidates(prev => [{
        id: newDocRef.id,
        ...candidateData,
        createdAt: { toDate: () => new Date() } as any,
        updatedAt: { toDate: () => new Date() } as any,
      } as Candidate, ...prev])

    } catch (err) {
      console.error('Error linking duplicate:', err)
      setBulkProgress(prev => prev.map((p, idx) => 
        idx === progressIndex ? { ...p, status: 'error' as const, message: 'Failed to link' } : p
      ))
    }
  }

  // Handle "Merge" for bulk duplicate - merges parsed data into existing record
  const handleBulkMerge = async (progressIndex: number) => {
    const item = bulkProgress[progressIndex]
    if (!item.parsedData || !item.duplicateOf) return

    const existingCandidate = candidates.find(c => c.id === item.duplicateOf)
    if (!existingCandidate) {
      alert('Could not find existing candidate')
      return
    }

    try {
      setBulkProgress(prev => prev.map((p, idx) => 
        idx === progressIndex ? { ...p, status: 'creating' as const, message: 'Merging records...' } : p
      ))

      const parsed = item.parsedData

      // Build update data - only update fields that are empty in existing or have new data
      const updateData: Record<string, any> = {
        updatedAt: serverTimestamp(),
        duplicateStatus: 'primary',
        duplicateReviewedAt: serverTimestamp(),
        duplicateReviewedBy: user?.id || '',
      }

      // Add CV if existing doesn't have one
      if (item.cvUrl && !existingCandidate.cvUrl) {
        updateData.cvUrl = item.cvUrl
        updateData.cvFileName = item.fileName
        updateData.cvStoragePath = item.cvStoragePath
      }

      // Add parsed data if AI parsed
      if (parsed.usedAiParsing && !existingCandidate.cvParsedData) {
        updateData.cvParsedData = parsed
        updateData.cvParsedAt = serverTimestamp()
      }

      // Merge skills
      if (parsed.skills?.length > 0) {
        const existingSkills = existingCandidate.skills || []
        const combinedSkills = [...new Set([...existingSkills, ...parsed.skills])]
        updateData.skills = combinedSkills
      }

      // Merge qualifications
      if (parsed.qualifications?.length > 0) {
        const existingQuals = existingCandidate.parsedQualifications || []
        const combinedQuals = [...new Set([...existingQuals, ...parsed.qualifications])]
        updateData.parsedQualifications = combinedQuals
      }

      // Fill in empty address/postcode
      if (!existingCandidate.address && parsed.address) {
        updateData.address = parsed.address
      }
      if (!existingCandidate.postcode && parsed.postcode) {
        updateData.postcode = parsed.postcode
      }

      const existingRef = doc(db, COLLECTIONS.CANDIDATES, existingCandidate.id)
      await updateDoc(existingRef, removeUndefined(updateData))

      // Log activity
      await logActivity(
        existingCandidate.id,
        'updated',
        `Record merged with bulk uploaded CV (${item.fileName})`,
        undefined,
        { mergedFrom: item.fileName, hasCv: !!item.cvUrl }
      )

      // Update progress
      setBulkProgress(prev => prev.map((p, idx) => 
        idx === progressIndex ? { 
          ...p, 
          status: 'success' as const, 
          message: `Merged into ${existingCandidate.firstName} ${existingCandidate.lastName}`,
          candidateId: existingCandidate.id,
        } : p
      ))

      // Update local state
      setCandidates(prev => prev.map(c => 
        c.id === existingCandidate.id 
          ? { ...c, ...updateData, updatedAt: { toDate: () => new Date() } as any }
          : c
      ))

    } catch (err) {
      console.error('Error merging duplicate:', err)
      setBulkProgress(prev => prev.map((p, idx) => 
        idx === progressIndex ? { ...p, status: 'error' as const, message: 'Failed to merge' } : p
      ))
    }
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
          <span className="candidate-count">
            {filteredCandidates.length} candidates
            {statusFilter === 'all' && rejectedCount > 0 && (
              <span className="rejected-note"> ({rejectedCount} rejected hidden)</span>
            )}
          </span>
        </div>
        <div className="header-actions">
          <Button variant="outline" onClick={() => setShowBulkModal(true)}>
            📁 Bulk Upload CVs
          </Button>
          <Button variant="primary" onClick={() => setShowAddModal(true)}>
            + Add Candidate
          </Button>
        </div>
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
          <div className="filter-item job-filter-multi">
            <div className="multi-select-wrapper" ref={(el) => {
              if (el && jobDropdownOpen) {
                const rect = el.getBoundingClientRect()
                const dropdown = el.querySelector('.multi-select-dropdown') as HTMLElement
                if (dropdown) {
                  dropdown.style.top = `${rect.bottom + 4}px`
                  dropdown.style.left = `${rect.left}px`
                }
              }
            }}>
              <button 
                className="multi-select-trigger"
                onClick={() => setJobDropdownOpen(!jobDropdownOpen)}
              >
                {jobFilter.length === 0 
                  ? 'All Jobs' 
                  : jobFilter.length === 1 
                    ? activeJobs.find(j => j.id === jobFilter[0])?.title || '1 Job'
                    : `${jobFilter.length} Jobs Selected`
                }
                <span className={`dropdown-arrow ${jobDropdownOpen ? 'open' : ''}`}>▼</span>
              </button>
              {jobDropdownOpen && (
                <>
                  <div 
                    className="multi-select-backdrop" 
                    onClick={() => {
                      setJobDropdownOpen(false)
                      setJobSearchTerm('')
                    }}
                  />
                  <div className="multi-select-dropdown open">
                    <div className="multi-select-search">
                      <input
                        type="text"
                        placeholder="Search jobs..."
                        value={jobSearchTerm}
                        onChange={(e) => setJobSearchTerm(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                      />
                      {jobSearchTerm && (
                        <button 
                          className="clear-search-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            setJobSearchTerm('')
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <div className="multi-select-header">
                      <span className="selected-count">
                        {jobFilter.length} selected
                      </span>
                      <button 
                        className="select-all-btn"
                        onClick={() => setJobFilter([])}
                      >
                        Clear All
                      </button>
                    </div>
                    <div className="multi-select-options">
                      {activeJobs.length === 0 ? (
                        <div className="multi-select-empty">No jobs available</div>
                      ) : (
                        activeJobs
                          .filter(job => {
                            if (!jobSearchTerm) return true
                            const search = jobSearchTerm.toLowerCase()
                            return job.title.toLowerCase().includes(search) || 
                                   job.branchName?.toLowerCase().includes(search)
                          })
                          .map(job => (
                            <label key={job.id} className="multi-select-option">
                              <input
                                type="checkbox"
                                checked={jobFilter.includes(job.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setJobFilter(prev => [...prev, job.id])
                                  } else {
                                    setJobFilter(prev => prev.filter(id => id !== job.id))
                                  }
                                }}
                              />
                              <span>{job.title}{job.branchName ? ` - ${job.branchName}` : ''}</span>
                            </label>
                          ))
                      )}
                      {activeJobs.length > 0 && jobSearchTerm && 
                        activeJobs.filter(job => {
                          const search = jobSearchTerm.toLowerCase()
                          return job.title.toLowerCase().includes(search) || 
                                 job.branchName?.toLowerCase().includes(search)
                        }).length === 0 && (
                          <div className="multi-select-empty">No jobs match "{jobSearchTerm}"</div>
                        )
                      }
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        {(searchTerm || statusFilter !== 'all' || jobFilter.length > 0) && (
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
                Status: {statusFilter === 'all_including_rejected' ? 'All (incl. Rejected)' : statusFilter.replace(/_/g, ' ')}
                <button onClick={() => setStatusFilter('all')}>×</button>
              </span>
            )}
            {jobFilter.length > 0 && (
              <span className="filter-tag">
                Jobs: {jobFilter.length === 1 
                  ? activeJobs.find(j => j.id === jobFilter[0])?.title 
                  : `${jobFilter.length} selected`}
                <button onClick={() => setJobFilter([])}>×</button>
              </span>
            )}
            <button 
              className="clear-all-filters"
              onClick={() => { setSearchTerm(''); setStatusFilter('all'); setJobFilter([]); }}
            >
              Clear all
            </button>
          </div>
        )}
      </Card>

      {/* Bulk Actions Bar */}
      {selectedCandidateIds.size > 0 && (
        <div className="bulk-actions-bar">
          <div className="bulk-actions-info">
            <span className="selected-count">
              {selectedCandidateIds.size} candidate{selectedCandidateIds.size !== 1 ? 's' : ''} selected
            </span>
            <button className="clear-selection-btn" onClick={clearSelection}>
              Clear selection
            </button>
          </div>
          <div className="bulk-actions-buttons">
            <Button 
              variant="primary" 
              size="sm"
              onClick={() => openBulkInviteModal('interview')}
            >
              📅 Send Interview Invites
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => openBulkInviteModal('trial')}
            >
              🏥 Send Trial Invites
            </Button>
          </div>
        </div>
      )}

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
                    <th className="checkbox-col">
                      <input 
                        type="checkbox"
                        checked={paginatedCandidates.length > 0 && selectedCandidateIds.size === paginatedCandidates.length}
                        onChange={toggleSelectAll}
                        title="Select all on this page"
                      />
                    </th>
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
                    <tr 
                      key={candidate.id} 
                      className={`clickable-row ${selectedCandidateIds.has(candidate.id) ? 'selected-row' : ''}`}
                      onClick={() => navigate(`/candidates/${candidate.id}`)}
                    >
                      <td className="checkbox-col" onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox"
                          checked={selectedCandidateIds.has(candidate.id)}
                          onChange={() => toggleCandidateSelection(candidate.id)}
                        />
                      </td>
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
                        <span className={`status-badge ${getStatusClass(candidate.status)}`}>
                          {getStatusLabel(candidate.status)}
                        </span>
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
        size="lg"
      >
        <div className="add-candidate-form">
          {/* Duplicate Warning Banner */}
          {showDuplicateWarning && duplicateMatches.length > 0 && (
            <DuplicateAlertBanner
              matches={duplicateMatches.map(match => ({
                candidateId: match.candidateId,
                matchType: match.matchType,
                confidence: match.confidence,
                severity: match.severity,
                matchedFields: match.matchedFields,
                scenario: match.scenario,
                message: match.message,
                daysSinceApplication: match.daysSinceApplication,
                candidate: {
                  id: match.existingCandidate.id,
                  firstName: match.existingCandidate.firstName,
                  lastName: match.existingCandidate.lastName,
                  email: match.existingCandidate.email,
                  phone: match.existingCandidate.phone,
                  status: match.existingCandidate.status,
                  jobTitle: match.existingCandidate.jobTitle,
                  branchName: match.existingCandidate.branchName,
                  createdAt: match.existingCandidate.createdAt,
                }
              }))}
              onViewCandidate={handleViewDuplicateCandidate}
              onMerge={handleStartMerge}
              onLink={handleLinkRecords}
              onMarkNotDuplicate={handleMarkNotDuplicate}
              onDismiss={handleDismissDuplicateMatch}
              recommendedAction={duplicateRecommendedAction}
              compact
            />
          )}

          {/* CV Upload Section */}
          <div className="cv-upload-section">
            <input
              type="file"
              ref={addCvInputRef}
              onChange={handleAddCvSelect}
              accept=".pdf,.doc,.docx"
              style={{ display: 'none' }}
            />
            
            {!addCvFile && !addCvUploading && !addCvParsing ? (
              <div 
                className="cv-upload-box"
                onClick={() => addCvInputRef.current?.click()}
              >
                <div className="cv-upload-icon">📄</div>
                <p className="cv-upload-text">
                  <strong>Upload CV to auto-fill</strong>
                </p>
                <p className="cv-upload-hint">
                  Drop a PDF or Word document here, or click to browse
                </p>
              </div>
            ) : (
              <div className="cv-upload-status">
                {addCvUploading && (
                  <div className="cv-status-item uploading">
                    <Spinner size="sm" />
                    <span>Uploading CV...</span>
                  </div>
                )}
                {addCvParsing && (
                  <div className="cv-status-item parsing">
                    <Spinner size="sm" />
                    <span>Reading CV and extracting details...</span>
                  </div>
                )}
                {addCvFile && !addCvUploading && !addCvParsing && (
                  <div className="cv-status-item success">
                    <span className="cv-file-icon">✅</span>
                    <span className="cv-file-name">{addCvFile.name}</span>
                    {addParsedData && (
                      <span className="cv-autofill-badge">
                        {addParsedData.usedAI ? '🤖 AI filled' : '📝 Auto-filled'}
                      </span>
                    )}
                    <button 
                      type="button"
                      className="cv-remove-btn"
                      onClick={handleRemoveAddCv}
                    >
                      ✕
                    </button>
                  </div>
                )}
                {addCvError && (
                  <div className="cv-status-item error">
                    <span>⚠️ {addCvError}</span>
                    <button 
                      type="button"
                      className="cv-retry-btn"
                      onClick={() => addCvInputRef.current?.click()}
                    >
                      Try another file
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="form-divider">
            <span>Candidate Details</span>
          </div>

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
            <label htmlFor="jobPosting">Job Posting *</label>
            <Select
              id="jobPosting"
              value={selectedJobId}
              onChange={(e) => handleJobSelect(e.target.value)}
              options={[
                { value: '', label: 'Select job posting...' },
                ...activeJobs.map(job => ({ 
                  value: job.id, 
                  label: job.title + (job.branchName ? ' - ' + job.branchName : '')
                }))
              ]}
            />
            {formErrors.jobTitle && (
              <span className="field-error">{formErrors.jobTitle}</span>
            )}
            {activeJobs.length === 0 && (
              <p className="field-hint">
                No active job postings. <a href="/jobs" target="_blank">Create a job posting first</a>
              </p>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="location">Branch</label>
            <Select
              id="location"
              value={addForm.location}
              disabled={!!selectedJobId}
              onChange={(e) => handleFormChange('location', e.target.value)}
              options={[
                { value: '', label: selectedJobId ? '(Auto-filled from job)' : 'Select branch...' },
                ...locations.map(loc => ({ value: loc.name, label: loc.name }))
              ]}
            />
            {formErrors.location && (
              <span className="field-error">{formErrors.location}</span>
            )}
            {locations.length === 0 && !loadingLocations && (
              <p className="field-hint">
                No branches configured. <a href="/branches" target="_blank">Add branches first</a>
              </p>
            )}
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
              onClick={() => handleAddCandidate(showDuplicateWarning)}
              disabled={submitting || checkingDuplicates}
            >
              {checkingDuplicates ? 'Checking...' : 
               submitting ? 'Adding...' : 
               showDuplicateWarning ? 'Add Anyway' : 'Add Candidate'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Merge Records Modal */}
      {mergeTargetCandidate && (
        <MergeRecordsModal
          isOpen={showMergeModal}
          onClose={() => {
            setShowMergeModal(false)
            setMergeTargetCandidate(null)
          }}
          primaryCandidate={{
            id: mergeTargetCandidate.id,
            firstName: mergeTargetCandidate.firstName,
            lastName: mergeTargetCandidate.lastName,
            email: mergeTargetCandidate.email,
            phone: mergeTargetCandidate.phone,
            address: mergeTargetCandidate.address,
            postcode: mergeTargetCandidate.postcode,
            jobTitle: mergeTargetCandidate.jobTitle,
            branchName: mergeTargetCandidate.branchName || mergeTargetCandidate.location,
            source: mergeTargetCandidate.source,
            status: mergeTargetCandidate.status,
            notes: mergeTargetCandidate.notes,
            skills: mergeTargetCandidate.skills,
            qualifications: mergeTargetCandidate.parsedQualifications,
            yearsExperience: mergeTargetCandidate.yearsExperience,
            cvUrl: mergeTargetCandidate.cvUrl,
            cvFileName: mergeTargetCandidate.cvFileName,
            createdAt: mergeTargetCandidate.createdAt?.toDate?.(),
            updatedAt: mergeTargetCandidate.updatedAt?.toDate?.(),
          }}
          secondaryCandidate={{
            id: 'new',
            firstName: addForm.firstName,
            lastName: addForm.lastName,
            email: addForm.email,
            phone: addForm.phone,
            address: addForm.address,
            postcode: addForm.postcode,
            jobTitle: addForm.jobTitle,
            branchName: addForm.location,
            source: addForm.source,
            status: 'new',
            notes: addForm.notes,
            skills: addParsedData?.skills || [],
            qualifications: addParsedData?.qualifications || [],
            cvUrl: addCvUrl || undefined,
            cvFileName: addCvFile?.name,
            createdAt: new Date(),
          }}
          onMerge={handleMergeComplete}
          loading={merging}
        />
      )}

      {/* Bulk Invite Modal */}
      <Modal
        isOpen={showBulkInviteModal}
        onClose={closeBulkInviteModal}
        title={`Send ${bulkInviteType === 'interview' ? 'Interview' : 'Trial'} Invites`}
        size="lg"
        closeOnOverlayClick={!bulkInviteProcessing}
        closeOnEscape={!bulkInviteProcessing}
      >
        <div className="bulk-invite-modal">
          {bulkInviteProcessing && (
            <div className="bulk-invite-processing">
              <Spinner size="lg" />
              <p>Creating booking links... ({bulkInviteResults.length}/{selectedCandidates.length})</p>
            </div>
          )}

          {!bulkInviteProcessing && bulkInviteResults.length > 0 && (
            <div className="bulk-invite-results">
              <div className="results-summary">
                <span className="success-count">
                  ✅ {bulkInviteResults.filter(r => r.success).length} successful
                </span>
                {bulkInviteResults.some(r => !r.success) && (
                  <span className="error-count">
                    ❌ {bulkInviteResults.filter(r => !r.success).length} failed
                  </span>
                )}
              </div>

              <div className="results-list">
                {bulkInviteResults.map((result, index) => (
                  <div 
                    key={result.candidateId} 
                    className={`result-item ${result.success ? 'success' : 'error'}`}
                  >
                    <div className="result-info">
                      <span className="result-icon">{result.success ? '✅' : '❌'}</span>
                      <div className="result-details">
                        <span className="result-name">{result.candidateName}</span>
                        <span className="result-job">{result.jobTitle} • {result.branchName}</span>
                        {!result.success && (
                          <span className="result-error">{result.error}</span>
                        )}
                      </div>
                    </div>
                    {result.success && result.bookingUrl && (
                      <div className="result-actions">
                        {result.candidatePhone ? (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => openWhatsApp(
                              result.candidatePhone,
                              getWhatsAppMessage(result.candidateName, result.bookingUrl!, bulkInviteType)
                            )}
                          >
                            📱 WhatsApp
                          </Button>
                        ) : (
                          <span className="no-phone">No phone</span>
                        )}
                        {result.candidateEmail ? (
                          result.emailSent ? (
                            <span className="email-sent">✅ Sent</span>
                          ) : result.emailError ? (
                            <span className="email-error" title={result.emailError}>❌ Failed</span>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => sendSingleEmail(result)}
                            >
                              ✉️ Email
                            </Button>
                          )
                        ) : (
                          <span className="no-email">No email</span>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(result.bookingUrl!)}
                        >
                          📋 Copy
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="modal-actions">
                {bulkInviteResults.filter(r => r.success && r.candidateEmail && !r.emailSent).length > 0 && (
                  <Button 
                    variant="secondary" 
                    onClick={sendAllEmails}
                    disabled={sendingBulkEmails}
                  >
                    {sendingBulkEmails ? '✉️ Sending...' : `✉️ Send All Emails (${bulkInviteResults.filter(r => r.success && r.candidateEmail && !r.emailSent).length})`}
                  </Button>
                )}
                {bulkInviteResults.filter(r => r.emailSent).length > 0 && (
                  <span className="emails-sent-count">
                    ✅ {bulkInviteResults.filter(r => r.emailSent).length} email{bulkInviteResults.filter(r => r.emailSent).length !== 1 ? 's' : ''} sent
                  </span>
                )}
                {bulkInviteResults.filter(r => r.success && r.candidatePhone).length > 0 && (
                  <Button 
                    variant="secondary" 
                    onClick={() => {
                      // Open WhatsApp for each successful result with a delay
                      const successfulResults = bulkInviteResults.filter(r => r.success && r.candidatePhone && r.bookingUrl)
                      successfulResults.forEach((result, index) => {
                        setTimeout(() => {
                          openWhatsApp(
                            result.candidatePhone,
                            getWhatsAppMessage(result.candidateName, result.bookingUrl!, bulkInviteType)
                          )
                        }, index * 500) // 500ms delay between each
                      })
                    }}
                  >
                    📱 Open All WhatsApp ({bulkInviteResults.filter(r => r.success && r.candidatePhone).length})
                  </Button>
                )}
                <Button variant="primary" onClick={closeBulkInviteModal}>
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Bulk Upload Modal */}
      <Modal
        isOpen={showBulkModal}
        onClose={handleCloseBulkModal}
        title="Bulk Upload CVs"
        size="lg"
      >
        <div className="bulk-upload-modal">
          {/* Hidden file input */}
          <input
            type="file"
            ref={bulkFileInputRef}
            onChange={handleBulkFileSelect}
            accept=".pdf,.doc,.docx"
            multiple
            style={{ display: 'none' }}
          />

          {!bulkProcessing && bulkProgress.length === 0 && (
            <>
              {/* Job Details */}
              <div className="bulk-config">
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="bulk-job">Job *</label>
                    <Select
                      id="bulk-job"
                      value={bulkJobTitle}
                      onChange={(e) => setBulkJobTitle(e.target.value)}
                      options={[
                        { value: '', label: 'Select job...' },
                        ...activeJobs.map(job => ({ value: job.id, label: `${job.title} - ${job.branchName}` }))
                      ]}
                    />
                    {activeJobs.length === 0 && (
                      <p className="field-hint">
                        No active jobs found. <a href="/jobs" target="_blank">Create a job first</a>
                      </p>
                    )}
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="bulk-source">Source</label>
                    <Select
                      id="bulk-source"
                      value={bulkSource}
                      onChange={(e) => setBulkSource(e.target.value)}
                      options={SOURCE_OPTIONS.filter(o => o.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Drop Zone */}
              <div 
                className="bulk-dropzone"
                onClick={() => bulkFileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('dragover') }}
                onDragLeave={(e) => { e.currentTarget.classList.remove('dragover') }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.currentTarget.classList.remove('dragover')
                  const files = Array.from(e.dataTransfer.files)
                  const validFiles = files.filter(file => {
                    const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
                    return validTypes.includes(file.type) && file.size <= 10 * 1024 * 1024
                  })
                  setBulkFiles(prev => [...prev, ...validFiles])
                }}
              >
                <div className="dropzone-icon">📁</div>
                <p className="dropzone-text">Drag & drop CVs here or click to browse</p>
                <p className="dropzone-hint">PDF, DOC, DOCX • Max 10MB each</p>
              </div>

              {/* File List */}
              {bulkFiles.length > 0 && (
                <div className="bulk-file-list">
                  <div className="file-list-header">
                    <span>{bulkFiles.length} file{bulkFiles.length !== 1 ? 's' : ''} selected</span>
                    <button 
                      className="clear-all-btn"
                      onClick={() => setBulkFiles([])}
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="file-list-items">
                    {bulkFiles.map((file, index) => (
                      <div key={index} className="file-item">
                        <span className="file-icon">📄</span>
                        <span className="file-name">{file.name}</span>
                        <span className="file-size">{(file.size / 1024).toFixed(0)} KB</span>
                        <button 
                          className="file-remove-btn"
                          onClick={() => removeBulkFile(index)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="modal-actions">
                <Button variant="secondary" onClick={handleCloseBulkModal}>
                  Cancel
                </Button>
                <Button 
                  variant="primary" 
                  onClick={processBulkUpload}
                  disabled={bulkFiles.length === 0 || !bulkJobTitle}
                >
                  🤖 Process {bulkFiles.length} CV{bulkFiles.length !== 1 ? 's' : ''}
                </Button>
              </div>
              {(bulkFiles.length > 0 && !bulkJobTitle) && (
                <p className="bulk-validation-warning">
                  ⚠️ Please select a job title before processing CVs
                </p>
              )}
            </>
          )}

          {/* Processing Progress */}
          {(bulkProcessing || bulkProgress.length > 0) && (
            <div className="bulk-progress">
              <div className="progress-header">
                <h3>
                  {bulkProcessing ? 'Processing CVs...' : 'Processing Complete'}
                </h3>
                <div className="progress-stats">
                  <span className="stat success">
                    ✅ {bulkProgress.filter(p => p.status === 'success').length}
                  </span>
                  <span className="stat duplicate">
                    ⚠️ {bulkProgress.filter(p => p.status === 'duplicate').length}
                  </span>
                  <span className="stat error">
                    ❌ {bulkProgress.filter(p => p.status === 'error').length}
                  </span>
                  <span className="stat pending">
                    ⏳ {bulkProgress.filter(p => !['success', 'error', 'duplicate'].includes(p.status)).length}
                  </span>
                </div>
              </div>

              <div className="progress-list">
                {bulkProgress.map((item, index) => (
                  <div key={index} className={`progress-item progress-${item.status}`}>
                    <div className="progress-item-icon">
                      {item.status === 'pending' && '⏳'}
                      {item.status === 'uploading' && '⬆️'}
                      {item.status === 'parsing' && '🤖'}
                      {item.status === 'creating' && '📝'}
                      {item.status === 'retrying' && '🔄'}
                      {item.status === 'success' && '✅'}
                      {item.status === 'error' && '❌'}
                      {item.status === 'duplicate' && '⚠️'}
                    </div>
                    <div className="progress-item-content">
                      <span className="progress-item-name">
                        {item.parsedName || item.fileName}
                      </span>
                      <span className="progress-item-message">
                        {item.message || item.status}
                      </span>
                    </div>
                    {item.status === 'success' && item.candidateId && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => navigate(`/candidates/${item.candidateId}`)}
                      >
                        View
                      </Button>
                    )}
                    {item.status === 'duplicate' && item.duplicateOf && (
                      <div className="duplicate-actions">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => window.open(`/candidates/${item.duplicateOf}`, '_blank')}
                        >
                          View
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleBulkMerge(index)}
                          title="Add CV/skills to existing record"
                        >
                          Merge
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleBulkLink(index)}
                          title="Create linked application"
                        >
                          Link
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleBulkAddAnyway(index)}
                        >
                          Add Anyway
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {!bulkProcessing && (
                <div className="modal-actions">
                  {bulkProgress.some(p => p.status === 'error') && (
                    <Button 
                      variant="outline" 
                      onClick={retryFailedFiles}
                    >
                      🔄 Retry Failed ({bulkProgress.filter(p => p.status === 'error').length})
                    </Button>
                  )}
                  <Button variant="primary" onClick={handleCloseBulkModal}>
                    Done
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

export default Candidates

import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  doc, 
  query, 
  where, 
  orderBy,
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore'
import { httpsCallable, getFunctions } from 'firebase/functions'
import { 
  getFirebaseDb,
  getFirebaseApp,
  COLLECTIONS 
} from '@allied/shared-lib'
import { useEntities } from '../hooks/useEntities'
import type { 
  Job, 
  JobStatus, 
  JobCategory, 
  EmploymentType, 
  SalaryPeriod,
  EntityType,
  Candidate 
} from '@allied/shared-lib'
import { Card, Button, Badge, Spinner, Modal, Input, Select, Textarea } from '@allied/shared-ui'
import { useAuth } from '../contexts/AuthContext'
import './Jobs.css'

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'closed', label: 'Closed' },
]

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Categories' },
  { value: 'clinical', label: 'Clinical' },
  { value: 'dispensary', label: 'Dispensary' },
  { value: 'retail', label: 'Retail' },
  { value: 'management', label: 'Management' },
  { value: 'support', label: 'Support' },
]

// Legacy employment type options (for display if no jobTypes loaded)
const EMPLOYMENT_TYPE_OPTIONS = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'locum', label: 'Locum' },
]

const SALARY_PERIOD_OPTIONS = [
  { value: 'hourly', label: 'Per Hour' },
  { value: 'annual', label: 'Per Year' },
]

// Entity options loaded from Firestore via useEntities hook

const STATUS_COLORS: Record<JobStatus, string> = {
  active: 'success',
  draft: 'warning',
  closed: 'danger',
}

const ITEMS_PER_PAGE = 10

// Sort configuration types
type JobSortColumn = 'title' | 'branch' | 'type' | 'salary' | 'candidates' | 'status' | 'posted'
type SortDirection = 'asc' | 'desc'

interface JobSortConfig {
  column: JobSortColumn
  direction: SortDirection
}

const JOBS_SORT_STORAGE_KEY = 'jobsPageSortConfig'

// ============================================================================
// TYPES
// ============================================================================

interface JobTitle {
  id: string
  title: string
  category: JobCategory
  descriptionTemplate?: string
  isActive: boolean
}

interface JobTypeConfig {
  id: string
  name: string
  description?: string
  isDefault: boolean
  isActive: boolean
  sortOrder: number
}

interface Branch {
  id: string
  name: string
  address?: string
  entity?: EntityType
  isActive: boolean
}

// Indeed Import Types
interface ParsedIndeedJob {
  jobTitle: string
  description: string
  employmentType: 'Full-time' | 'Part-time' | 'Temporary' | 'Contract' | 'Locum' | null
  hoursPerWeek: number | null
  shiftPattern: string | null
  salaryMin: number | null
  salaryMax: number | null
  salaryPeriod: 'hourly' | 'annual' | null
  salaryNotes: string | null
  benefits: string[] | null
  location: string | null
  requirements: string | null
  qualificationsRequired: string | null
  desirable: string | null
  inferredJobType: string | null
  inferredCategory: 'clinical' | 'dispensary' | 'retail' | 'management' | 'support' | null
  requiresGPhC: boolean
  requiresDBS: boolean
  sourceUrl: string
}

interface IndeedImportResponse {
  success: boolean
  data?: ParsedIndeedJob
  error?: {
    code: 'INVALID_URL' | 'FETCH_FAILED' | 'PARSE_FAILED' | 'NOT_FOUND' | 'BLOCKED'
    message: string
  }
}

interface JobFormData {
  jobTypeId: string
  jobTypeName: string
  category: JobCategory
  branchId: string
  branchName: string
  branchAddress: string
  title: string
  description: string
  employmentType: string  // Now uses job type names from Settings
  hoursPerWeek: string
  shiftPattern: string    // e.g., "Mon-Fri 9-5", "Includes weekends"
  salaryMin: string
  salaryMax: string
  salaryPeriod: SalaryPeriod
  salaryNotes: string     // e.g., "DOE", "Plus benefits"
  entity: EntityType
  requirements: string
  qualificationsRequired: string
  desirable: string       // Nice to have skills
  requiresDBS: boolean
  requiresGPhC: boolean
  requiresRightToWork: boolean
  status: JobStatus
  startDate: string
  closingDate: string
  internalNotes: string   // Notes visible only to recruiters
}

const INITIAL_FORM: JobFormData = {
  jobTypeId: '',
  jobTypeName: '',
  category: 'clinical',
  branchId: '',
  branchName: '',
  branchAddress: '',
  title: '',
  description: '',
  employmentType: 'Full-time',  // Default to Full-time
  hoursPerWeek: '',
  shiftPattern: '',
  salaryMin: '',
  salaryMax: '',
  salaryPeriod: 'annual',
  salaryNotes: '',
  entity: 'allied',
  requirements: '',
  qualificationsRequired: '',
  desirable: '',
  requiresDBS: false,
  requiresGPhC: false,
  requiresRightToWork: true,
  status: 'draft',
  startDate: '',
  closingDate: '',
  internalNotes: '',
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

const formatSalary = (min?: number, max?: number, period?: SalaryPeriod): string => {
  if (!min && !max) return '-'
  const formatNum = (n: number) => n >= 1000 ? `£${(n / 1000).toFixed(0)}k` : `£${n}`
  const suffix = period === 'hourly' ? '/hr' : '/yr'
  
  if (min && max) {
    return `${formatNum(min)} - ${formatNum(max)}${suffix}`
  }
  if (min) return `From ${formatNum(min)}${suffix}`
  if (max) return `Up to ${formatNum(max)}${suffix}`
  return '-'
}

// ============================================================================
// COMPONENT
// ============================================================================

export function Jobs() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { entityOptions, defaultEntity, loading: loadingEntities } = useEntities()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<JobCategory | 'all'>('all')
  const [branchFilter, setBranchFilter] = useState<string>('all')
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState<string>('all')
  
  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingJob, setEditingJob] = useState<Job | null>(null)
  const [formData, setFormData] = useState<JobFormData>(INITIAL_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  
  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletingJob, setDeletingJob] = useState<Job | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  
  // Status change modal
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [statusChangeJob, setStatusChangeJob] = useState<Job | null>(null)
  const [newStatus, setNewStatus] = useState<JobStatus>('active')
  const [closedReason, setClosedReason] = useState<string>('')
  const [statusChangeLoading, setStatusChangeLoading] = useState(false)
  
  // Reference data
  const [jobTitles, setJobTitles] = useState<JobTitle[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [jobTypes, setJobTypes] = useState<JobTypeConfig[]>([])
  const [candidateCounts, setCandidateCounts] = useState<Record<string, number>>({})
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1)

  // Sorting - load initial state from localStorage
  const [sortConfig, setSortConfig] = useState<JobSortConfig>(() => {
    try {
      const saved = localStorage.getItem(JOBS_SORT_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.column && parsed.direction) {
          return parsed as JobSortConfig
        }
      }
    } catch (e) {
      console.error('Error loading saved sort config:', e)
    }
    return { column: 'posted', direction: 'desc' }
  })

  // Save sort config to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem(JOBS_SORT_STORAGE_KEY, JSON.stringify(sortConfig))
    } catch (e) {
      console.error('Error saving sort config:', e)
    }
  }, [sortConfig])

  // Handle column header click for sorting
  const handleSort = (column: JobSortColumn) => {
    setSortConfig(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  // Indeed Import state
  const [indeedUrl, setIndeedUrl] = useState('')
  const [indeedText, setIndeedText] = useState('')
  const [indeedImage, setIndeedImage] = useState<string | null>(null)
  const [importMode, setImportMode] = useState<'url' | 'text' | 'screenshot'>('url')
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState(false)
  const [importExpanded, setImportExpanded] = useState(false)
  const [importedLocation, setImportedLocation] = useState<string | null>(null)
  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set())

  const db = getFirebaseDb()

  // Fetch jobs
  useEffect(() => {
    async function fetchJobs() {
      try {
        setLoading(true)
        setError(null)

        const jobsRef = collection(db, COLLECTIONS.JOBS)
        const snapshot = await getDocs(query(jobsRef, orderBy('createdAt', 'desc')))
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Job[]
        setJobs(data)
      } catch (err) {
        console.error('Error fetching jobs:', err)
        setError('Failed to load jobs')
      } finally {
        setLoading(false)
      }
    }

    fetchJobs()
  }, [db])

  // Fetch job titles
  useEffect(() => {
    async function fetchJobTitles() {
      try {
        const jobTitlesRef = collection(db, 'jobTitles')
        const snapshot = await getDocs(jobTitlesRef)
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          title: doc.data().title || '',
          category: doc.data().category || 'clinical',
          descriptionTemplate: doc.data().descriptionTemplate || '',
          isActive: doc.data().isActive !== false
        })) as JobTitle[]
        setJobTitles(data.filter(jt => jt.isActive))
      } catch (err) {
        console.error('Error fetching job titles:', err)
      }
    }

    fetchJobTitles()
  }, [db])

  // Fetch branches
  useEffect(() => {
    async function fetchBranches() {
      try {
        const branchesRef = collection(db, 'branches')
        const snapshot = await getDocs(branchesRef)
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || '',
          address: doc.data().address || '',
          entity: doc.data().entity || 'allied',
          isActive: doc.data().isActive !== false
        })) as Branch[]
        setBranches(data.filter(b => b.isActive))
      } catch (err) {
        console.error('Error fetching branches:', err)
      }
    }

    fetchBranches()
  }, [db])

  // Fetch job types (employment types from Settings)
  useEffect(() => {
    async function fetchJobTypes() {
      try {
        const jobTypesRef = collection(db, 'jobTypes')
        const snapshot = await getDocs(jobTypesRef)
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || '',
          description: doc.data().description || '',
          isDefault: doc.data().isDefault || false,
          isActive: doc.data().isActive !== false,
          sortOrder: doc.data().sortOrder || 0
        })) as JobTypeConfig[]
        // Sort by sortOrder and filter active ones
        data.sort((a, b) => a.sortOrder - b.sortOrder)
        setJobTypes(data.filter(jt => jt.isActive))
      } catch (err) {
        console.error('Error fetching job types:', err)
      }
    }

    fetchJobTypes()
  }, [db])

  // Fetch candidate counts per job
  useEffect(() => {
    async function fetchCandidateCounts() {
      try {
        const candidatesRef = collection(db, COLLECTIONS.CANDIDATES)
        const snapshot = await getDocs(candidatesRef)
        const counts: Record<string, number> = {}
        
        snapshot.docs.forEach(doc => {
          const data = doc.data()
          if (data.jobId) {
            counts[data.jobId] = (counts[data.jobId] || 0) + 1
          }
        })
        
        setCandidateCounts(counts)
      } catch (err) {
        console.error('Error fetching candidate counts:', err)
      }
    }

    fetchCandidateCounts()
  }, [db])

  // Filtered and sorted jobs
  const filteredJobs = useMemo(() => {
    const filtered = jobs.filter(job => {
      // Status filter
      if (statusFilter !== 'all' && job.status !== statusFilter) {
        return false
      }

      // Category filter
      if (categoryFilter !== 'all' && job.category !== categoryFilter) {
        return false
      }

      // Branch filter
      if (branchFilter !== 'all' && job.branchId !== branchFilter) {
        return false
      }

      // Employment type filter
      if (employmentTypeFilter !== 'all' && job.employmentType !== employmentTypeFilter) {
        return false
      }

      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase()
        const title = job.title?.toLowerCase() || ''
        const jobType = (job as any).jobTypeName?.toLowerCase() || ''
        const branch = job.branchName?.toLowerCase() || ''
        const empType = job.employmentType?.toLowerCase() || ''

        if (!title.includes(search) && !jobType.includes(search) && !branch.includes(search) && !empType.includes(search)) {
          return false
        }
      }

      return true
    })

    // Sort the filtered results
    const sorted = [...filtered].sort((a, b) => {
      const direction = sortConfig.direction === 'asc' ? 1 : -1

      switch (sortConfig.column) {
        case 'title':
          return direction * (a.title || '').localeCompare(b.title || '')
        case 'branch':
          return direction * (a.branchName || '').localeCompare(b.branchName || '')
        case 'type':
          return direction * (a.employmentType || '').localeCompare(b.employmentType || '')
        case 'salary': {
          const salaryA = a.salaryMin || a.salaryMax || 0
          const salaryB = b.salaryMin || b.salaryMax || 0
          return direction * (salaryA - salaryB)
        }
        case 'candidates': {
          const countA = candidateCounts[a.id] || 0
          const countB = candidateCounts[b.id] || 0
          return direction * (countA - countB)
        }
        case 'status': {
          const statusOrder: Record<JobStatus, number> = { active: 1, draft: 2, closed: 3 }
          return direction * ((statusOrder[a.status] || 0) - (statusOrder[b.status] || 0))
        }
        case 'posted': {
          const dateA = a.createdAt?.toDate?.()?.getTime() || 0
          const dateB = b.createdAt?.toDate?.()?.getTime() || 0
          return direction * (dateA - dateB)
        }
        default:
          return 0
      }
    })

    return sorted
  }, [jobs, statusFilter, categoryFilter, branchFilter, employmentTypeFilter, searchTerm, sortConfig, candidateCounts])

  // Pagination calculations
  const totalPages = Math.ceil(filteredJobs.length / ITEMS_PER_PAGE)
  const paginatedJobs = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredJobs.slice(startIndex, startIndex + ITEMS_PER_PAGE)
  }, [filteredJobs, currentPage])

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [statusFilter, categoryFilter, branchFilter, employmentTypeFilter, searchTerm])

  // Open create modal
  const handleCreate = () => {
    setEditingJob(null)
    setFormData(INITIAL_FORM)
    setFormError('')
    resetImportState()
    setShowModal(true)
  }

  // Open edit modal
  const handleEdit = (job: Job) => {
    setEditingJob(job)
    // Convert old employment type format to new format if needed
    const getEmploymentTypeDisplay = (empType: any): string => {
      if (!empType) return 'Full-time'
      // If it's already a display name (new format), return as is
      if (typeof empType === 'string' && !empType.includes('_')) return empType
      // Convert old format to display name
      const mapping: Record<string, string> = {
        'full_time': 'Full-time',
        'part_time': 'Part-time',
        'contract': 'Fixed-term',
        'locum': 'Locum'
      }
      return mapping[empType] || empType
    }
    
    setFormData({
      jobTypeId: (job as any).jobTypeId || '',
      jobTypeName: (job as any).jobTypeName || '',
      category: job.category || 'clinical',
      branchId: job.branchId || '',
      branchName: job.branchName || '',
      branchAddress: job.branchAddress || '',
      title: job.title || '',
      description: job.description || '',
      employmentType: getEmploymentTypeDisplay(job.employmentType),
      hoursPerWeek: job.hoursPerWeek?.toString() || '',
      shiftPattern: (job as any).shiftPattern || '',
      salaryMin: job.salaryMin?.toString() || '',
      salaryMax: job.salaryMax?.toString() || '',
      salaryPeriod: job.salaryPeriod || 'annual',
      salaryNotes: (job as any).salaryNotes || '',
      entity: job.entity || 'allied',
      requirements: job.requirements?.join('\n') || '',
      qualificationsRequired: job.qualificationsRequired?.join('\n') || '',
      desirable: (job as any).desirable?.join('\n') || '',
      requiresDBS: job.requiresDBS || false,
      requiresGPhC: job.requiresGPhC || false,
      requiresRightToWork: (job as any).requiresRightToWork !== false,
      status: job.status || 'draft',
      startDate: job.startDate ? new Date(job.startDate.toDate()).toISOString().split('T')[0] : '',
      closingDate: job.closingDate ? new Date(job.closingDate.toDate()).toISOString().split('T')[0] : '',
      internalNotes: (job as any).internalNotes || '',
    })
    setFormError('')
    setShowModal(true)
  }

  // Handle job type selection
  const handleJobTypeChange = (jobTypeId: string) => {
    const jobType = jobTitles.find(jt => jt.id === jobTypeId)
    if (jobType) {
      setFormData(prev => {
        const updates: Partial<typeof prev> = {
          jobTypeId,
          jobTypeName: jobType.title,
          category: jobType.category,
          title: prev.title || jobType.title,
        }
        
        // Auto-fill description from template if description is empty and template exists
        if (!prev.description && jobType.descriptionTemplate) {
          updates.description = jobType.descriptionTemplate
        }
        
        return { ...prev, ...updates }
      })
    }
  }

  // Handle branch selection
  const handleBranchChange = (branchId: string) => {
    const branch = branches.find(b => b.id === branchId)
    if (branch) {
      setFormData(prev => ({
        ...prev,
        branchId,
        branchName: branch.name,
        branchAddress: branch.address || '',
        entity: branch.entity || prev.entity,
      }))
    }
  }

  // Handle Indeed import
  const handleImportFromIndeed = async () => {
    // Validate based on mode
    if (importMode === 'url') {
      if (!indeedUrl.trim()) {
        setImportError('Please enter an Indeed job URL')
        return
      }

      // Basic URL validation
      try {
        const url = new URL(indeedUrl)
        if (!url.hostname.includes('indeed')) {
          setImportError('Please enter a valid Indeed URL')
          return
        }
      } catch {
        setImportError('Please enter a valid URL')
        return
      }
    } else if (importMode === 'text') {
      if (!indeedText.trim()) {
        setImportError('Please paste the job description text')
        return
      }
      if (indeedText.trim().length < 100) {
        setImportError('Please paste more of the job description (at least a few paragraphs)')
        return
      }
    } else if (importMode === 'screenshot') {
      if (!indeedImage) {
        setImportError('Please upload or paste a screenshot of the job listing')
        return
      }
    }

    setIsImporting(true)
    setImportError(null)
    setImportSuccess(false)

    try {
      // Use europe-west2 region for this function
      const functionsEU = getFunctions(getFirebaseApp(), 'europe-west2')
      const parseIndeedJob = httpsCallable<{ url?: string; text?: string; image?: string }, IndeedImportResponse>(
        functionsEU, 
        'parseIndeedJob'
      )
      
      // Send data based on mode
      let requestData: { url?: string; text?: string; image?: string }
      if (importMode === 'url') {
        requestData = { url: indeedUrl.trim() }
      } else if (importMode === 'text') {
        requestData = { text: indeedText.trim() }
      } else {
        requestData = { image: indeedImage! }
      }
      
      const result = await parseIndeedJob(requestData)
      
      if (!result.data.success || !result.data.data) {
        setImportError(result.data.error?.message || 'Failed to import job listing')
        setIsImporting(false)
        return
      }

      const job = result.data.data
      const filledFields = new Set<string>()

      // Map employment type
      let employmentType = 'Full-time'
      if (job.employmentType) {
        const mapping: Record<string, string> = {
          'Full-time': 'Full-time',
          'Part-time': 'Part-time',
          'Temporary': 'Fixed-term',
          'Contract': 'Fixed-term',
          'Locum': 'Locum',
        }
        employmentType = mapping[job.employmentType] || job.employmentType
      }

      // Try to match job type from jobTitles
      let matchedJobTypeId = ''
      let matchedJobTypeName = ''
      let matchedCategory: JobCategory = 'clinical'
      
      if (job.inferredJobType) {
        // Try exact match first
        const exactMatch = jobTitles.find(jt => 
          jt.title.toLowerCase() === job.inferredJobType?.toLowerCase()
        )
        if (exactMatch) {
          matchedJobTypeId = exactMatch.id
          matchedJobTypeName = exactMatch.title
          matchedCategory = exactMatch.category
          filledFields.add('jobTypeId')
        } else {
          // Try partial match
          const partialMatch = jobTitles.find(jt => 
            jt.title.toLowerCase().includes(job.inferredJobType?.toLowerCase() || '') ||
            job.inferredJobType?.toLowerCase().includes(jt.title.toLowerCase())
          )
          if (partialMatch) {
            matchedJobTypeId = partialMatch.id
            matchedJobTypeName = partialMatch.title
            matchedCategory = partialMatch.category
            filledFields.add('jobTypeId')
          }
        }
      }

      // If no job type matched but we have category, use that
      if (!matchedJobTypeId && job.inferredCategory) {
        matchedCategory = job.inferredCategory
      }

      // Build salary notes including benefits
      let salaryNotes = job.salaryNotes || ''
      if (job.benefits && job.benefits.length > 0) {
        const benefitsText = job.benefits.join(', ')
        salaryNotes = salaryNotes 
          ? `${salaryNotes}. Benefits: ${benefitsText}`
          : `Benefits: ${benefitsText}`
      }

      // Update form data
      setFormData(prev => {
        const newData = { ...prev }
        
        if (job.jobTitle) {
          newData.title = job.jobTitle
          filledFields.add('title')
        }
        if (job.description) {
          newData.description = job.description
          filledFields.add('description')
        }
        if (employmentType) {
          newData.employmentType = employmentType
          filledFields.add('employmentType')
        }
        if (job.hoursPerWeek) {
          newData.hoursPerWeek = job.hoursPerWeek.toString()
          filledFields.add('hoursPerWeek')
        }
        if (job.shiftPattern) {
          newData.shiftPattern = job.shiftPattern
          filledFields.add('shiftPattern')
        }
        if (job.salaryMin) {
          newData.salaryMin = job.salaryMin.toString()
          filledFields.add('salaryMin')
        }
        if (job.salaryMax) {
          newData.salaryMax = job.salaryMax.toString()
          filledFields.add('salaryMax')
        }
        if (job.salaryPeriod) {
          newData.salaryPeriod = job.salaryPeriod
          filledFields.add('salaryPeriod')
        }
        if (salaryNotes) {
          newData.salaryNotes = salaryNotes
          filledFields.add('salaryNotes')
        }
        if (job.requirements) {
          newData.requirements = job.requirements
          filledFields.add('requirements')
        }
        if (job.qualificationsRequired) {
          newData.qualificationsRequired = job.qualificationsRequired
          filledFields.add('qualificationsRequired')
        }
        if (job.desirable) {
          newData.desirable = job.desirable
          filledFields.add('desirable')
        }
        if (matchedJobTypeId) {
          newData.jobTypeId = matchedJobTypeId
          newData.jobTypeName = matchedJobTypeName
          newData.category = matchedCategory
        } else if (job.inferredCategory) {
          newData.category = job.inferredCategory
          filledFields.add('category')
        }
        
        newData.requiresGPhC = job.requiresGPhC
        newData.requiresDBS = job.requiresDBS
        if (job.requiresGPhC) filledFields.add('requiresGPhC')
        if (job.requiresDBS) filledFields.add('requiresDBS')

        return newData
      })

      setAiFilledFields(filledFields)
      setImportedLocation(job.location || null)
      setImportSuccess(true)
      setImportExpanded(false) // Collapse after success

    } catch (err) {
      console.error('Import error:', err)
      setImportError(
        err instanceof Error 
          ? err.message 
          : 'Failed to import job. Please try again.'
      )
    } finally {
      setIsImporting(false)
    }
  }

  // Reset import state when modal closes or new job is created
  const resetImportState = () => {
    setIndeedUrl('')
    setIndeedText('')
    setIndeedImage(null)
    setImportMode('url')
    setIsImporting(false)
    setImportError(null)
    setImportSuccess(false)
    setImportExpanded(false)
    setImportedLocation(null)
    setAiFilledFields(new Set())
  }

  // Submit form
  const handleSubmit = async () => {
    // Validation
    if (!formData.jobTypeId) {
      setFormError('Please select a job type')
      return
    }
    if (!formData.branchId) {
      setFormError('Please select a branch')
      return
    }
    if (!formData.title.trim()) {
      setFormError('Please enter a job title')
      return
    }

    setSubmitting(true)
    setFormError('')

    try {
      const jobData = {
        jobTypeId: formData.jobTypeId,
        jobTypeName: formData.jobTypeName,
        category: formData.category,
        branchId: formData.branchId,
        branchName: formData.branchName,
        branchAddress: formData.branchAddress,
        title: formData.title.trim(),
        description: formData.description.trim(),
        employmentType: formData.employmentType,
        hoursPerWeek: formData.hoursPerWeek ? parseInt(formData.hoursPerWeek) : null,
        shiftPattern: formData.shiftPattern.trim() || null,
        salaryMin: formData.salaryMin ? parseInt(formData.salaryMin) : null,
        salaryMax: formData.salaryMax ? parseInt(formData.salaryMax) : null,
        salaryPeriod: formData.salaryPeriod,
        salaryNotes: formData.salaryNotes.trim() || null,
        entity: formData.entity,
        requirements: formData.requirements.split('\n').map(r => r.trim()).filter(Boolean),
        qualificationsRequired: formData.qualificationsRequired.split('\n').map(q => q.trim()).filter(Boolean),
        desirable: formData.desirable.split('\n').map(d => d.trim()).filter(Boolean),
        requiresDBS: formData.requiresDBS,
        requiresGPhC: formData.requiresGPhC,
        requiresRightToWork: formData.requiresRightToWork,
        status: formData.status,
        startDate: formData.startDate ? Timestamp.fromDate(new Date(formData.startDate)) : null,
        closingDate: formData.closingDate ? Timestamp.fromDate(new Date(formData.closingDate)) : null,
        internalNotes: formData.internalNotes.trim() || null,
        updatedAt: serverTimestamp(),
      }

      if (editingJob) {
        // Update existing job
        const jobRef = doc(db, COLLECTIONS.JOBS, editingJob.id)
        await updateDoc(jobRef, {
          ...jobData,
          ...(formData.status === 'closed' && editingJob.status !== 'closed' 
            ? { closedAt: serverTimestamp() } 
            : {}
          ),
        })
        
        setJobs(prev => prev.map(j => 
          j.id === editingJob.id 
            ? { ...j, ...jobData, id: editingJob.id } as Job
            : j
        ))
      } else {
        // Create new job
        const docRef = await addDoc(collection(db, COLLECTIONS.JOBS), {
          ...jobData,
          createdAt: serverTimestamp(),
          createdBy: user?.uid || null,
        })
        
        const newJob = {
          id: docRef.id,
          ...jobData,
          createdAt: Timestamp.now(),
          createdBy: user?.uid || null,
        } as Job
        
        setJobs(prev => [newJob, ...prev])
      }

      setShowModal(false)
    } catch (err) {
      console.error('Error saving job:', err)
      setFormError('Failed to save job. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Delete job
  const handleDelete = async () => {
    if (!deletingJob) return

    setDeleteLoading(true)
    try {
      await deleteDoc(doc(db, COLLECTIONS.JOBS, deletingJob.id))
      setJobs(prev => prev.filter(j => j.id !== deletingJob.id))
      setShowDeleteModal(false)
      setDeletingJob(null)
    } catch (err) {
      console.error('Error deleting job:', err)
    } finally {
      setDeleteLoading(false)
    }
  }

  // Quick status change
  // Open status change modal
  const openStatusModal = (job: Job) => {
    setStatusChangeJob(job)
    setNewStatus(job.status)
    setClosedReason('')
    setShowStatusModal(true)
  }

  // Handle status change with workflow
  const handleStatusChange = async () => {
    if (!statusChangeJob) return
    
    try {
      setStatusChangeLoading(true)
      const jobRef = doc(db, COLLECTIONS.JOBS, statusChangeJob.id)
      
      const updateData: Record<string, any> = {
        status: newStatus,
        updatedAt: serverTimestamp(),
      }
      
      // Add workflow-specific fields
      if (newStatus === 'active' && statusChangeJob.status === 'draft') {
        // Publishing: set publishedAt
        updateData.publishedAt = serverTimestamp()
      }
      
      if (newStatus === 'closed') {
        // Closing: set closedAt and reason
        updateData.closedAt = serverTimestamp()
        updateData.closedReason = closedReason || 'manually_closed'
      }
      
      if (newStatus === 'active' && statusChangeJob.status === 'closed') {
        // Reopening: clear closed fields
        updateData.closedAt = null
        updateData.closedReason = null
      }
      
      await updateDoc(jobRef, updateData)
      
      setJobs(prev => prev.map(j => 
        j.id === statusChangeJob.id 
          ? { ...j, status: newStatus } as Job
          : j
      ))
      
      setShowStatusModal(false)
      setStatusChangeJob(null)
    } catch (err) {
      console.error('Error updating job status:', err)
      alert('Failed to update job status. Please try again.')
    } finally {
      setStatusChangeLoading(false)
    }
  }

  // Quick status change (from table actions)
  const handleQuickStatusChange = async (job: Job, targetStatus: JobStatus) => {
    // For closing, open modal to get reason
    if (targetStatus === 'closed') {
      openStatusModal(job)
      setNewStatus('closed')
      return
    }
    
    try {
      const jobRef = doc(db, COLLECTIONS.JOBS, job.id)
      const updateData: Record<string, any> = {
        status: targetStatus,
        updatedAt: serverTimestamp(),
      }
      
      if (targetStatus === 'active' && job.status === 'draft') {
        updateData.publishedAt = serverTimestamp()
      }
      
      if (targetStatus === 'active' && job.status === 'closed') {
        updateData.closedAt = null
        updateData.closedReason = null
      }
      
      await updateDoc(jobRef, updateData)
      
      setJobs(prev => prev.map(j => 
        j.id === job.id 
          ? { ...j, status: targetStatus } as Job
          : j
      ))
    } catch (err) {
      console.error('Error updating job status:', err)
    }
  }

  // Duplicate job
  const handleDuplicate = (job: Job) => {
    // Convert old employment type format to new format if needed
    const getEmploymentTypeDisplay = (empType: any): string => {
      if (!empType) return 'Full-time'
      if (typeof empType === 'string' && !empType.includes('_')) return empType
      const mapping: Record<string, string> = {
        'full_time': 'Full-time',
        'part_time': 'Part-time',
        'contract': 'Fixed-term',
        'locum': 'Locum'
      }
      return mapping[empType] || empType
    }
    
    setEditingJob(null)
    setFormData({
      jobTypeId: (job as any).jobTypeId || '',
      jobTypeName: (job as any).jobTypeName || '',
      category: job.category || 'clinical',
      branchId: '', // Clear branch for new selection
      branchName: '',
      branchAddress: '',
      title: `${job.title} (Copy)`,
      description: job.description || '',
      employmentType: getEmploymentTypeDisplay(job.employmentType),
      hoursPerWeek: job.hoursPerWeek?.toString() || '',
      shiftPattern: (job as any).shiftPattern || '',
      salaryMin: job.salaryMin?.toString() || '',
      salaryMax: job.salaryMax?.toString() || '',
      salaryPeriod: job.salaryPeriod || 'annual',
      salaryNotes: (job as any).salaryNotes || '',
      entity: job.entity || 'allied',
      requirements: job.requirements?.join('\n') || '',
      qualificationsRequired: job.qualificationsRequired?.join('\n') || '',
      desirable: (job as any).desirable?.join('\n') || '',
      requiresDBS: job.requiresDBS || false,
      requiresGPhC: job.requiresGPhC || false,
      requiresRightToWork: (job as any).requiresRightToWork !== false,
      status: 'draft',
      startDate: '',
      closingDate: '',
      internalNotes: '', // Clear internal notes for duplicate
    })
    setFormError('')
    setShowModal(true)
  }

  // Loading state
  if (loading) {
    return (
      <div className="jobs-page">
        <div className="loading-container">
          <Spinner size="lg" />
          <p>Loading jobs...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="jobs-page">
        <div className="error-container">
          <p>{error}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="jobs-page">
      {/* Header */}
      <div className="jobs-header">
        <div className="header-content">
          <h1>Jobs</h1>
          <p className="header-subtitle">
            Manage job postings across all branches
          </p>
        </div>
        <Button variant="primary" onClick={handleCreate}>
          + Create Job
        </Button>
      </div>

      {/* Stats - Clickable Filters */}
      <div className="jobs-stats">
        <Card 
          className={`stat-card clickable ${statusFilter === 'all' ? 'active' : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          <span className="stat-value">{jobs.length}</span>
          <span className="stat-label">All Jobs</span>
        </Card>
        <Card 
          className={`stat-card clickable ${statusFilter === 'active' ? 'active' : ''}`}
          onClick={() => setStatusFilter('active')}
        >
          <span className="stat-value">{jobs.filter(j => j.status === 'active').length}</span>
          <span className="stat-label">Active Jobs</span>
        </Card>
        <Card 
          className={`stat-card clickable ${statusFilter === 'draft' ? 'active' : ''}`}
          onClick={() => setStatusFilter('draft')}
        >
          <span className="stat-value">{jobs.filter(j => j.status === 'draft').length}</span>
          <span className="stat-label">Drafts</span>
        </Card>
        <Card 
          className={`stat-card clickable ${statusFilter === 'closed' ? 'active' : ''}`}
          onClick={() => setStatusFilter('closed')}
        >
          <span className="stat-value">{jobs.filter(j => j.status === 'closed').length}</span>
          <span className="stat-label">Closed</span>
        </Card>
        <Card className="stat-card">
          <span className="stat-value">{Object.values(candidateCounts).reduce((a, b) => a + b, 0)}</span>
          <span className="stat-label">Total Candidates</span>
        </Card>
      </div>

      {/* Filters */}
      <Card className="filters-card">
        <div className="filters">
          <div className="filter-item search">
            <Input
              placeholder="Search jobs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="filter-item">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as JobStatus | 'all')}
              options={STATUS_OPTIONS}
            />
          </div>
          <div className="filter-item">
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as JobCategory | 'all')}
              options={CATEGORY_OPTIONS}
            />
          </div>
          <div className="filter-item">
            <Select
              value={employmentTypeFilter}
              onChange={(e) => setEmploymentTypeFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Job Types' },
                ...(jobTypes.length > 0 
                  ? jobTypes.map(jt => ({ value: jt.name, label: jt.name }))
                  : EMPLOYMENT_TYPE_OPTIONS.map(o => ({ value: o.label, label: o.label }))
                )
              ]}
            />
          </div>
          <div className="filter-item">
            <Select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Branches' },
                ...branches.map(b => ({ value: b.id, label: b.name }))
              ]}
            />
          </div>
        </div>
        <div className="filter-results">
          <span>{filteredJobs.length} job{filteredJobs.length !== 1 ? 's' : ''} found</span>
          {(statusFilter !== 'all' || categoryFilter !== 'all' || branchFilter !== 'all' || employmentTypeFilter !== 'all' || searchTerm) && (
            <button 
              className="clear-filters-btn"
              onClick={() => {
                setStatusFilter('all')
                setCategoryFilter('all')
                setBranchFilter('all')
                setEmploymentTypeFilter('all')
                setSearchTerm('')
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      </Card>

      {/* Jobs List */}
      <Card className="jobs-list-card">
        {filteredJobs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💼</div>
            <h3>No jobs found</h3>
            <p>
              {searchTerm || statusFilter !== 'all' || categoryFilter !== 'all' || branchFilter !== 'all' || employmentTypeFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Create your first job posting'}
            </p>
            {!searchTerm && statusFilter === 'all' && categoryFilter === 'all' && branchFilter === 'all' && employmentTypeFilter === 'all' && (
              <Button variant="primary" onClick={handleCreate}>
                + Create Job
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="jobs-table">
              <div className="table-header">
                <div className={`col-title sortable ${sortConfig.column === 'title' ? 'sorted' : ''}`} onClick={() => handleSort('title')}>
                  Job Title
                  <span className="sort-icon">{sortConfig.column === 'title' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '⇅'}</span>
                </div>
                <div className={`col-branch sortable ${sortConfig.column === 'branch' ? 'sorted' : ''}`} onClick={() => handleSort('branch')}>
                  Branch
                  <span className="sort-icon">{sortConfig.column === 'branch' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '⇅'}</span>
                </div>
                <div className={`col-type sortable ${sortConfig.column === 'type' ? 'sorted' : ''}`} onClick={() => handleSort('type')}>
                  Type
                  <span className="sort-icon">{sortConfig.column === 'type' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '⇅'}</span>
                </div>
                <div className={`col-salary sortable ${sortConfig.column === 'salary' ? 'sorted' : ''}`} onClick={() => handleSort('salary')}>
                  Salary
                  <span className="sort-icon">{sortConfig.column === 'salary' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '⇅'}</span>
                </div>
                <div className={`col-candidates sortable ${sortConfig.column === 'candidates' ? 'sorted' : ''}`} onClick={() => handleSort('candidates')}>
                  Candidates
                  <span className="sort-icon">{sortConfig.column === 'candidates' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '⇅'}</span>
                </div>
                <div className={`col-status sortable ${sortConfig.column === 'status' ? 'sorted' : ''}`} onClick={() => handleSort('status')}>
                  Status
                  <span className="sort-icon">{sortConfig.column === 'status' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '⇅'}</span>
                </div>
                <div className={`col-date sortable ${sortConfig.column === 'posted' ? 'sorted' : ''}`} onClick={() => handleSort('posted')}>
                  Posted
                  <span className="sort-icon">{sortConfig.column === 'posted' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '⇅'}</span>
                </div>
                <div className="col-actions">Actions</div>
              </div>
              
              {paginatedJobs.map(job => (
                <div key={job.id} className="table-row" onClick={() => navigate(`/jobs/${job.id}`)}>
                  <div className="col-title">
                    <span className="job-title">{job.title}</span>
                    <span className="job-type">{job.jobTypeName}</span>
                  </div>
                  <div className="col-branch">
                    <span className="branch-name">{job.branchName || '-'}</span>
                  </div>
                  <div className="col-type">
                    <span className="employment-type">
                      {job.employmentType || '-'}
                    </span>
                  </div>
                  <div className="col-salary">
                    {formatSalary(job.salaryMin, job.salaryMax, job.salaryPeriod)}
                  </div>
                  <div className="col-candidates">
                    <span className="candidate-count">{candidateCounts[job.id] || 0}</span>
                  </div>
                  <div className="col-status">
                    <Badge variant={STATUS_COLORS[job.status] as any}>
                      {job.status}
                    </Badge>
                  </div>
                  <div className="col-date">
                    {formatDate(job.createdAt)}
                  </div>
                  <div className="col-actions" onClick={(e) => e.stopPropagation()}>
                    <div className="action-buttons">
                      <button 
                        className="action-btn edit" 
                        onClick={() => handleEdit(job)}
                        title="Edit"
                      >
                        ✏️
                      </button>
                      <button 
                        className="action-btn duplicate" 
                        onClick={() => handleDuplicate(job)}
                        title="Duplicate"
                      >
                        📋
                      </button>
                      {job.status === 'active' ? (
                        <button 
                          className="action-btn close" 
                          onClick={() => openStatusModal(job)}
                          title="Close Job"
                        >
                          🔒
                        </button>
                      ) : job.status === 'closed' ? (
                        <button 
                          className="action-btn reopen" 
                          onClick={() => handleQuickStatusChange(job, 'active')}
                          title="Reopen Job"
                        >
                          🔓
                        </button>
                      ) : (
                        <button 
                          className="action-btn publish" 
                          onClick={() => handleQuickStatusChange(job, 'active')}
                          title="Publish Job"
                        >
                          🚀
                        </button>
                      )}
                      <button 
                        className="action-btn status-menu" 
                        onClick={() => openStatusModal(job)}
                        title="Change Status"
                      >
                        ⚙️
                      </button>
                      <button 
                        className="action-btn delete" 
                        onClick={() => {
                          setDeletingJob(job)
                          setShowDeleteModal(true)
                        }}
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="page-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                >
                  ← Previous
                </button>
                <span className="page-info">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="page-btn"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingJob ? 'Edit Job' : 'Create Job'}
        size="lg"
      >
        <div className="job-form">
          {formError && (
            <div className="form-error">{formError}</div>
          )}

          {/* Indeed Import Section - only show for new jobs */}
          {!editingJob && (
            <div className={`indeed-import-section ${importSuccess ? 'success' : ''}`}>
              <button 
                className="indeed-import-header"
                onClick={() => !importSuccess && setImportExpanded(!importExpanded)}
                type="button"
              >
                <span className="indeed-import-title">
                  {importSuccess ? '✅ Imported from Indeed' : '🔗 Import from Indeed'}
                </span>
                {!importSuccess && (
                  <span className={`indeed-import-chevron ${importExpanded ? 'expanded' : ''}`}>
                    ▼
                  </span>
                )}
                {importSuccess && (
                  <button 
                    className="import-another-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      resetImportState()
                      setImportExpanded(true)
                    }}
                    type="button"
                  >
                    Import Another
                  </button>
                )}
              </button>

              {importSuccess && importedLocation && (
                <div className="import-success-message">
                  <p>Successfully imported job details. Location detected: <strong>{importedLocation}</strong></p>
                  <p className="import-hint">Please select a Branch below and review all fields.</p>
                </div>
              )}

              {importExpanded && !importSuccess && (
                <div className="indeed-import-content">
                  {/* Mode tabs */}
                  <div className="import-mode-tabs">
                    <button
                      className={`import-mode-tab ${importMode === 'url' ? 'active' : ''}`}
                      onClick={() => setImportMode('url')}
                      type="button"
                    >
                      🔗 Paste URL
                    </button>
                    <button
                      className={`import-mode-tab ${importMode === 'text' ? 'active' : ''}`}
                      onClick={() => setImportMode('text')}
                      type="button"
                    >
                      📝 Paste Text
                    </button>
                    <button
                      className={`import-mode-tab ${importMode === 'screenshot' ? 'active' : ''}`}
                      onClick={() => setImportMode('screenshot')}
                      type="button"
                    >
                      📷 Screenshot
                    </button>
                  </div>
                  
                  {importError && (
                    <div className="import-error">
                      <span className="import-error-icon">⚠️</span>
                      {importError}
                    </div>
                  )}

                  {importMode === 'url' && (
                    <>
                      <p className="indeed-import-hint">
                        Paste an Indeed UK job URL to auto-fill the form
                      </p>
                      <div className="indeed-import-input-row">
                        <input
                          type="url"
                          className="indeed-url-input"
                          placeholder="https://uk.indeed.com/viewjob?jk=..."
                          value={indeedUrl}
                          onChange={(e) => setIndeedUrl(e.target.value)}
                          disabled={isImporting}
                        />
                        <button
                          className="indeed-paste-btn"
                          onClick={async () => {
                            try {
                              const text = await navigator.clipboard.readText()
                              if (text && text.includes('indeed')) {
                                setIndeedUrl(text.trim())
                              }
                            } catch (err) {
                              console.log('Clipboard access denied')
                            }
                          }}
                          disabled={isImporting}
                          type="button"
                          title="Paste from clipboard"
                        >
                          📋
                        </button>
                        <button
                          className="indeed-import-btn"
                          onClick={handleImportFromIndeed}
                          disabled={isImporting || !indeedUrl.trim()}
                          type="button"
                        >
                          {isImporting ? (
                            <>
                              <span className="import-spinner"></span>
                              Importing...
                            </>
                          ) : (
                            <>✨ Import</>
                          )}
                        </button>
                      </div>
                      <p className="indeed-import-supported">
                        Supported: uk.indeed.com job URLs
                      </p>
                    </>
                  )}

                  {importMode === 'text' && (
                    <>
                      <p className="indeed-import-hint">
                        Copy the job description from Indeed and paste it below
                      </p>
                      <textarea
                        className="indeed-text-input"
                        placeholder="Paste the full job description here...

Include: job title, description, requirements, salary, location, etc."
                        value={indeedText}
                        onChange={(e) => setIndeedText(e.target.value)}
                        disabled={isImporting}
                        rows={6}
                      />
                      <div className="indeed-text-actions">
                        <span className="char-count">{indeedText.length} characters</span>
                        <button
                          className="indeed-import-btn"
                          onClick={handleImportFromIndeed}
                          disabled={isImporting || indeedText.trim().length < 100}
                          type="button"
                        >
                          {isImporting ? (
                            <>
                              <span className="import-spinner"></span>
                              Parsing...
                            </>
                          ) : (
                            <>✨ Parse & Import</>
                          )}
                        </button>
                      </div>
                      <p className="indeed-import-supported">
                        Tip: Select all text from the job page (Cmd+A) and paste here
                      </p>
                    </>
                  )}

                  {importMode === 'screenshot' && (
                    <>
                      <p className="indeed-import-hint">
                        Take a screenshot of the job listing and paste or upload it here
                      </p>
                      <div 
                        className={`screenshot-drop-zone ${indeedImage ? 'has-image' : ''}`}
                        onPaste={async (e) => {
                          const items = e.clipboardData?.items
                          if (items) {
                            for (const item of items) {
                              if (item.type.startsWith('image/')) {
                                const file = item.getAsFile()
                                if (file) {
                                  const reader = new FileReader()
                                  reader.onload = (event) => {
                                    setIndeedImage(event.target?.result as string)
                                  }
                                  reader.readAsDataURL(file)
                                }
                              }
                            }
                          }
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault()
                          const file = e.dataTransfer.files[0]
                          if (file && file.type.startsWith('image/')) {
                            const reader = new FileReader()
                            reader.onload = (event) => {
                              setIndeedImage(event.target?.result as string)
                            }
                            reader.readAsDataURL(file)
                          }
                        }}
                      >
                        {indeedImage ? (
                          <div className="screenshot-preview">
                            <img src={indeedImage} alt="Job listing screenshot" />
                            <button 
                              className="remove-screenshot-btn"
                              onClick={() => setIndeedImage(null)}
                              type="button"
                            >
                              ✕ Remove
                            </button>
                          </div>
                        ) : (
                          <div className="screenshot-placeholder">
                            <span className="screenshot-icon">📷</span>
                            <p>Paste screenshot here (Cmd+V)</p>
                            <p className="screenshot-hint">or drag & drop an image</p>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) {
                                  const reader = new FileReader()
                                  reader.onload = (event) => {
                                    setIndeedImage(event.target?.result as string)
                                  }
                                  reader.readAsDataURL(file)
                                }
                              }}
                              className="screenshot-file-input"
                            />
                            <button 
                              className="screenshot-upload-btn"
                              onClick={() => {
                                const input = document.querySelector('.screenshot-file-input') as HTMLInputElement
                                input?.click()
                              }}
                              type="button"
                            >
                              📁 Choose File
                            </button>
                          </div>
                        )}
                      </div>
                      {indeedImage && (
                        <div className="indeed-text-actions">
                          <span className="char-count">Screenshot ready</span>
                          <button
                            className="indeed-import-btn"
                            onClick={handleImportFromIndeed}
                            disabled={isImporting}
                            type="button"
                          >
                            {isImporting ? (
                              <>
                                <span className="import-spinner"></span>
                                Analyzing...
                              </>
                            ) : (
                              <>✨ Parse Screenshot</>
                            )}
                          </button>
                        </div>
                      )}
                      <p className="indeed-import-supported">
                        Tip: Use Cmd+Shift+4 (Mac) or Win+Shift+S (Windows) to capture
                      </p>
                    </>
                  )}

                  {isImporting && (
                    <div className="import-loading-message">
                      <p>{importMode === 'url' ? 'Fetching job details...' : importMode === 'screenshot' ? 'Analyzing screenshot with AI...' : 'Parsing job description with AI...'}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Divider between import and form */}
          {!editingJob && (
            <div className="import-form-divider">
              <span>{importSuccess ? 'Review imported details' : 'or fill manually'}</span>
            </div>
          )}

          <div className="form-section">
            <h3>Job Details</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label>
                  Job Type *
                  {aiFilledFields.has('jobTypeId') && <span className="ai-badge">AI</span>}
                </label>
                <Select
                  value={formData.jobTypeId}
                  onChange={(e) => handleJobTypeChange(e.target.value)}
                  options={[
                    { value: '', label: 'Select job type...' },
                    ...jobTitles.map(jt => ({ value: jt.id, label: jt.title }))
                  ]}
                />
              </div>
              <div className="form-group">
                <label>Category</label>
                <Select
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value as JobCategory }))}
                  options={CATEGORY_OPTIONS.filter(o => o.value !== 'all')}
                />
              </div>
            </div>

            <div className="form-group">
              <label>
                Job Title *
                {aiFilledFields.has('title') && <span className="ai-badge">AI</span>}
              </label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Senior Pharmacist"
              />
            </div>

            <div className="form-group">
              <label>
                Description
                {aiFilledFields.has('description') && <span className="ai-badge">AI</span>}
              </label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Job description..."
                rows={4}
              />
            </div>
          </div>

          <div className="form-section">
            <h3>Location & Entity</h3>
            
            <div className="form-row">
              <div className={`form-group ${importSuccess && !formData.branchId ? 'needs-attention' : ''}`}>
                <label>
                  Branch *
                  {importSuccess && !formData.branchId && <span className="required-badge">Required</span>}
                </label>
                <Select
                  value={formData.branchId}
                  onChange={(e) => handleBranchChange(e.target.value)}
                  options={[
                    { value: '', label: 'Select branch...' },
                    ...branches.map(b => ({ value: b.id, label: b.name }))
                  ]}
                />
              </div>
              <div className="form-group">
                <label>Entity</label>
                <Select
                  value={formData.entity}
                  onChange={(e) => setFormData(prev => ({ ...prev, entity: e.target.value as EntityType }))}
                  options={entityOptions}
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>Employment Details</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label>
                  Employment Type
                  {aiFilledFields.has('employmentType') && <span className="ai-badge">AI</span>}
                </label>
                <Select
                  value={formData.employmentType}
                  onChange={(e) => setFormData(prev => ({ ...prev, employmentType: e.target.value as any }))}
                  options={
                    jobTypes.length > 0 
                      ? jobTypes.map(jt => ({ value: jt.name, label: jt.name }))
                      : EMPLOYMENT_TYPE_OPTIONS
                  }
                />
              </div>
              <div className="form-group">
                <label>
                  Hours Per Week
                  {aiFilledFields.has('hoursPerWeek') && <span className="ai-badge">AI</span>}
                </label>
                <Input
                  type="number"
                  value={formData.hoursPerWeek}
                  onChange={(e) => setFormData(prev => ({ ...prev, hoursPerWeek: e.target.value }))}
                  placeholder="e.g., 40"
                />
              </div>
            </div>

            <div className="form-group">
              <label>
                Shift Pattern
                {aiFilledFields.has('shiftPattern') && <span className="ai-badge">AI</span>}
              </label>
              <Input
                value={formData.shiftPattern}
                onChange={(e) => setFormData(prev => ({ ...prev, shiftPattern: e.target.value }))}
                placeholder="e.g., Mon-Fri 9am-5pm, Includes weekends"
              />
            </div>

            <div className="form-row three-col">
              <div className="form-group">
                <label>
                  Salary Min (£)
                  {aiFilledFields.has('salaryMin') && <span className="ai-badge">AI</span>}
                </label>
                <Input
                  type="number"
                  value={formData.salaryMin}
                  onChange={(e) => setFormData(prev => ({ ...prev, salaryMin: e.target.value }))}
                  placeholder="e.g., 35000"
                />
              </div>
              <div className="form-group">
                <label>
                  Salary Max (£)
                  {aiFilledFields.has('salaryMax') && <span className="ai-badge">AI</span>}
                </label>
                <Input
                  type="number"
                  value={formData.salaryMax}
                  onChange={(e) => setFormData(prev => ({ ...prev, salaryMax: e.target.value }))}
                  placeholder="e.g., 45000"
                />
              </div>
              <div className="form-group">
                <label>
                  Salary Period
                  {aiFilledFields.has('salaryPeriod') && <span className="ai-badge">AI</span>}
                </label>
                <Select
                  value={formData.salaryPeriod}
                  onChange={(e) => setFormData(prev => ({ ...prev, salaryPeriod: e.target.value as SalaryPeriod }))}
                  options={SALARY_PERIOD_OPTIONS}
                />
              </div>
            </div>

            <div className="form-group">
              <label>
                Salary Notes
                {aiFilledFields.has('salaryNotes') && <span className="ai-badge">AI</span>}
              </label>
              <Input
                value={formData.salaryNotes}
                onChange={(e) => setFormData(prev => ({ ...prev, salaryNotes: e.target.value }))}
                placeholder="e.g., DOE, Plus benefits, Negotiable"
              />
            </div>
          </div>

          <div className="form-section">
            <h3>Requirements</h3>
            
            <div className="form-group">
              <label>
                Requirements (one per line)
                {aiFilledFields.has('requirements') && <span className="ai-badge">AI</span>}
              </label>
              <Textarea
                value={formData.requirements}
                onChange={(e) => setFormData(prev => ({ ...prev, requirements: e.target.value }))}
                placeholder="e.g., 2+ years pharmacy experience&#10;Excellent communication skills"
                rows={3}
              />
            </div>

            <div className="form-group">
              <label>
                Qualifications Required (one per line)
                {aiFilledFields.has('qualificationsRequired') && <span className="ai-badge">AI</span>}
              </label>
              <Textarea
                value={formData.qualificationsRequired}
                onChange={(e) => setFormData(prev => ({ ...prev, qualificationsRequired: e.target.value }))}
                placeholder="e.g., GPhC registration&#10;MPharm degree"
                rows={3}
              />
            </div>

            <div className="form-group">
              <label>
                Desirable Skills (one per line)
                {aiFilledFields.has('desirable') && <span className="ai-badge">AI</span>}
              </label>
              <Textarea
                value={formData.desirable}
                onChange={(e) => setFormData(prev => ({ ...prev, desirable: e.target.value }))}
                placeholder="e.g., Experience with Cegedim&#10;Additional language skills"
                rows={2}
              />
            </div>

            <div className="form-row three-col">
              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.requiresDBS}
                    onChange={(e) => setFormData(prev => ({ ...prev, requiresDBS: e.target.checked }))}
                  />
                  Requires DBS Check
                  {aiFilledFields.has('requiresDBS') && <span className="ai-badge">AI</span>}
                </label>
              </div>
              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.requiresGPhC}
                    onChange={(e) => setFormData(prev => ({ ...prev, requiresGPhC: e.target.checked }))}
                  />
                  Requires GPhC Registration
                  {aiFilledFields.has('requiresGPhC') && <span className="ai-badge">AI</span>}
                </label>
              </div>
              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.requiresRightToWork}
                    onChange={(e) => setFormData(prev => ({ ...prev, requiresRightToWork: e.target.checked }))}
                  />
                  Requires UK Right to Work
                </label>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>Status & Dates</h3>
            
            <div className="form-row three-col">
              <div className="form-group">
                <label>Status</label>
                <Select
                  value={formData.status}
                  onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as JobStatus }))}
                  options={STATUS_OPTIONS.filter(o => o.value !== 'all')}
                />
              </div>
              <div className="form-group">
                <label>Start Date</label>
                <Input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Closing Date</label>
                <Input
                  type="date"
                  value={formData.closingDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, closingDate: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>Internal Notes</h3>
            <p className="section-hint">These notes are only visible to recruiters and will not be shared with candidates.</p>
            
            <div className="form-group">
              <Textarea
                value={formData.internalNotes}
                onChange={(e) => setFormData(prev => ({ ...prev, internalNotes: e.target.value }))}
                placeholder="Add any internal notes about this position..."
                rows={3}
              />
            </div>
          </div>

          <div className="form-actions">
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button 
              variant="primary" 
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Saving...' : editingJob ? 'Update Job' : 'Create Job'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Job"
        size="sm"
      >
        <div className="delete-modal-content">
          <p>
            Are you sure you want to delete <strong>{deletingJob?.title}</strong>?
          </p>
          <p className="warning-text">
            This action cannot be undone. Candidates assigned to this job will not be deleted.
          </p>
          <div className="modal-actions">
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button 
              variant="danger" 
              onClick={handleDelete}
              disabled={deleteLoading}
            >
              {deleteLoading ? 'Deleting...' : 'Delete Job'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Status Change Modal */}
      <Modal
        isOpen={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        title="Change Job Status"
        size="sm"
      >
        <div className="status-modal-content">
          {statusChangeJob && (
            <>
              <div className="status-job-info">
                <h3>{statusChangeJob.title}</h3>
                <p>📍 {statusChangeJob.branchName}</p>
                <div className="current-status">
                  Current status: <Badge variant={STATUS_COLORS[statusChangeJob.status] as any}>{statusChangeJob.status}</Badge>
                </div>
              </div>

              <div className="status-options">
                <label>New Status</label>
                <div className="status-buttons">
                  <button
                    className={`status-option draft ${newStatus === 'draft' ? 'selected' : ''}`}
                    onClick={() => setNewStatus('draft')}
                    disabled={statusChangeJob.status === 'draft'}
                  >
                    <span className="status-icon">📝</span>
                    <span className="status-name">Draft</span>
                    <span className="status-desc">Not visible to candidates</span>
                  </button>
                  <button
                    className={`status-option active ${newStatus === 'active' ? 'selected' : ''}`}
                    onClick={() => setNewStatus('active')}
                    disabled={statusChangeJob.status === 'active'}
                  >
                    <span className="status-icon">🚀</span>
                    <span className="status-name">Active</span>
                    <span className="status-desc">Visible and accepting applications</span>
                  </button>
                  <button
                    className={`status-option closed ${newStatus === 'closed' ? 'selected' : ''}`}
                    onClick={() => setNewStatus('closed')}
                    disabled={statusChangeJob.status === 'closed'}
                  >
                    <span className="status-icon">🔒</span>
                    <span className="status-name">Closed</span>
                    <span className="status-desc">No longer accepting applications</span>
                  </button>
                </div>
              </div>

              {newStatus === 'closed' && statusChangeJob.status !== 'closed' && (
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

              {newStatus === 'active' && statusChangeJob.status === 'draft' && (
                <div className="publish-info">
                  <div className="info-box success">
                    <span className="info-icon">✅</span>
                    <p>Publishing this job will make it visible and start accepting applications.</p>
                  </div>
                </div>
              )}

              {newStatus === 'active' && statusChangeJob.status === 'closed' && (
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
                    statusChangeLoading || 
                    newStatus === statusChangeJob.status ||
                    (newStatus === 'closed' && !closedReason)
                  }
                >
                  {statusChangeLoading ? 'Updating...' : 
                    newStatus === 'active' && statusChangeJob.status === 'draft' ? 'Publish Job' :
                    newStatus === 'active' && statusChangeJob.status === 'closed' ? 'Reopen Job' :
                    newStatus === 'closed' ? 'Close Job' :
                    'Update Status'
                  }
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}

export default Jobs

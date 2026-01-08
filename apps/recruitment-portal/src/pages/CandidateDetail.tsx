import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc, updateDoc, deleteDoc, addDoc, collection, query, where, orderBy, getDocs, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { httpsCallable } from 'firebase/functions'
import { 
  getFirebaseDb, 
  getFirebaseStorage, 
  getFirebaseFunctions, 
  COLLECTIONS, 
  getCvPath, 
  normalizePhone,
  PLACEHOLDER_DEFINITIONS,
  replaceTemplatePlaceholders,
  prepareCandidateData,
  prepareInterviewData,
  combinePlaceholderData,
  generateWhatsAppURL,
  formatPhoneForWhatsApp,
  type PlaceholderData
} from '@allied/shared-lib'
import type { Candidate, CandidateStatus, ActivityAction, ActivityLog } from '@allied/shared-lib'
import { Card, Badge, Button, Spinner, Modal, Select, Input, Textarea } from '@allied/shared-ui'
import { useAuth } from '../contexts/AuthContext'
import './CandidateDetail.css'

// ============================================================================
// CONSTANTS
// ============================================================================

// WhatsApp Template Types
type TemplateCategory = 'interview' | 'trial' | 'offer' | 'rejection' | 'reminder' | 'general'

interface WhatsAppTemplate {
  id: string
  name: string
  category: TemplateCategory
  content: string
  placeholders: string[]
  active: boolean
}

const TEMPLATE_CATEGORIES = [
  { value: 'interview', label: 'Interview', color: '#3b82f6' },
  { value: 'trial', label: 'Trial', color: '#f59e0b' },
  { value: 'offer', label: 'Offer', color: '#10b981' },
  { value: 'rejection', label: 'Rejection', color: '#ef4444' },
  { value: 'reminder', label: 'Reminder', color: '#8b5cf6' },
  { value: 'general', label: 'General', color: '#6b7280' },
]

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_OPTIONS: { value: CandidateStatus; label: string }[] = [
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

interface EditCandidateForm {
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const formatDate = (timestamp: any): string => {
  if (!timestamp) return '-'
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    if (isNaN(date.getTime())) return '-'
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return '-'
  }
}

const formatDateTime = (timestamp: any): string => {
  if (!timestamp) return '-'
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    if (isNaN(date.getTime())) return '-'
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '-'
  }
}

const formatPhone = (phone: string): string => {
  if (!phone) return '-'
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('07')) {
    return `${digits.slice(0, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`
  }
  return phone
}

const getInitials = (firstName: string, lastName: string): string => {
  return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase()
}

// Validate UK phone number
const validateUKPhone = (phone: string): boolean => {
  const normalized = normalizePhone(phone)
  return /^0[1-37]\d{8,9}$/.test(normalized)
}

// Validate UK postcode
const validateUKPostcode = (postcode: string): boolean => {
  const cleaned = postcode.replace(/\s/g, '').toUpperCase()
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

// Get activity icon based on action type
const getActivityIcon = (action: ActivityAction): string => {
  const icons: Record<ActivityAction, string> = {
    created: '➕',
    updated: '✏️',
    deleted: '🗑️',
    status_changed: '🔄',
    cv_uploaded: '📄',
    cv_parsed: '🤖',
    interview_scheduled: '📅',
    feedback_submitted: '📝',
    message_sent: '💬',
    booking_link_created: '🔗',
    booking_link_used: '✅',
  }
  return icons[action] || '📌'
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CandidateDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Status change modal
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [newStatus, setNewStatus] = useState<CandidateStatus | ''>('')
  const [updating, setUpdating] = useState(false)

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false)
  const [editForm, setEditForm] = useState<EditCandidateForm>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    postcode: '',
    source: '',
    jobTitle: '',
    notes: '',
  })
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // CV upload
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // CV parsing
  const [parsing, setParsing] = useState(false)
  const [parseStatus, setParseStatus] = useState<'idle' | 'success' | 'error' | 'partial'>('idle')
  const [parsedData, setParsedData] = useState<any>(null)
  const [showParsedModal, setShowParsedModal] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [parseRetryCount, setParseRetryCount] = useState(0)
  const MAX_PARSE_RETRIES = 3

  // Activity timeline
  const [activities, setActivities] = useState<ActivityLog[]>([])
  const [loadingActivities, setLoadingActivities] = useState(false)

  // Linked candidates / Application history
  const [linkedCandidates, setLinkedCandidates] = useState<Candidate[]>([])
  const [loadingLinkedCandidates, setLoadingLinkedCandidates] = useState(false)

  // WhatsApp Modal state
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false)
  const [whatsappTemplates, setWhatsappTemplates] = useState<WhatsAppTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null)
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<TemplateCategory | 'all'>('all')
  const [messageContent, setMessageContent] = useState('')
  const [isEditingMessage, setIsEditingMessage] = useState(false)
  const [messageCopied, setMessageCopied] = useState(false)
  const [generatedBookingLink, setGeneratedBookingLink] = useState<string | null>(null)
  const [generatingBookingLink, setGeneratingBookingLink] = useState(false)

  // Scheduled interviews/trials for this candidate
  const [candidateInterviews, setCandidateInterviews] = useState<any[]>([])
  const [loadingInterviews, setLoadingInterviews] = useState(false)

  // Job assignment
  const [jobs, setJobs] = useState<any[]>([])
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [showJobAssignModal, setShowJobAssignModal] = useState(false)

  // Schedule Interview/Trial Modal state
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleType, setScheduleType] = useState<'interview' | 'trial'>('interview')
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [scheduleDuration, setScheduleDuration] = useState(30)
  const [scheduleNotes, setScheduleNotes] = useState('')
  const [sendScheduleConfirmation, setSendScheduleConfirmation] = useState(true)
  const [scheduling, setScheduling] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [branches, setBranches] = useState<any[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [availableDates, setAvailableDates] = useState<Date[]>([])
  const [selectedScheduleDate, setSelectedScheduleDate] = useState<Date | null>(null)
  const [timeSlots, setTimeSlots] = useState<Array<{ time: string; available: boolean }>>([])
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('')
  const [loadingAvailability, setLoadingAvailability] = useState(false)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedJobId, setSelectedJobId] = useState<string>('')
  const [assigningJob, setAssigningJob] = useState(false)

  const db = getFirebaseDb()

  

  // Fetch availability when schedule modal opens
  useEffect(() => {
    const fetchAvailability = async () => {
      if (!showScheduleModal) return
      
      setLoadingAvailability(true)
      try {
        const functions = getFirebaseFunctions()
        const getAvailability = httpsCallable(functions, 'getBookingAvailability')
        
        // Create a temporary token for internal scheduling
        const result = await getAvailability({ token: '__internal__', type: scheduleType })
        
        if (result.data) {
          // Generate available dates for next 14 days based on settings
          const settings = result.data.settings || {}
          const fullyBookedDates = result.data.fullyBookedDates || []
          const dates: Date[] = []
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          
          const schedule = settings.schedule || {
            monday: { enabled: true }, tuesday: { enabled: true },
            wednesday: { enabled: true }, thursday: { enabled: true },
            friday: { enabled: true }, saturday: { enabled: false },
            sunday: { enabled: false }
          }
          
          const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
          
          for (let i = 0; i < 30; i++) {
            const date = new Date(today)
            date.setDate(today.getDate() + i)
            const dayName = dayNames[date.getDay()]
            const daySchedule = schedule[dayName]
            
            if (daySchedule?.enabled) {
              const dateStr = date.toISOString().split('T')[0]
              if (!fullyBookedDates.includes(dateStr)) {
                dates.push(new Date(date))
              }
            }
          }
          
          setAvailableDates(dates)
          setScheduleDuration(settings.slotDuration || (scheduleType === 'interview' ? 30 : 240))
        }
      } catch (err) {
        console.error('Error fetching availability:', err)
        // Fallback: enable all weekdays
        const dates: Date[] = []
        const today = new Date()
        for (let i = 0; i < 30; i++) {
          const date = new Date(today)
          date.setDate(today.getDate() + i)
          if (date.getDay() !== 0 && date.getDay() !== 6) {
            dates.push(date)
          }
        }
        setAvailableDates(dates)
      } finally {
        setLoadingAvailability(false)
      }
    }
    
    fetchAvailability()
  }, [showScheduleModal, scheduleType])

  // Fetch time slots when date is selected
  useEffect(() => {
    const fetchTimeSlots = async () => {
      if (!selectedScheduleDate) {
        setTimeSlots([])
        return
      }
      
      setLoadingSlots(true)
      setSelectedTimeSlot('')
      
      try {
        const functions = getFirebaseFunctions()
        const getSlots = httpsCallable(functions, 'getBookingTimeSlots')
        
        const result = await getSlots({
          token: '__internal__',
          date: selectedScheduleDate.toISOString().split('T')[0],
          type: scheduleType
        })
        
        if (result.data?.slots) {
          setTimeSlots(result.data.slots)
        }
      } catch (err) {
        console.error('Error fetching time slots:', err)
        // Generate fallback slots
        const slots = []
        for (let h = 9; h < 17; h++) {
          slots.push({ time: h.toString().padStart(2, '0') + ':00', available: true })
          slots.push({ time: h.toString().padStart(2, '0') + ':30', available: true })
        }
        setTimeSlots(slots)
      } finally {
        setLoadingSlots(false)
      }
    }
    
    fetchTimeSlots()
  }, [selectedScheduleDate, scheduleType])

  // Load branches for direct scheduling
  useEffect(() => {
    const fetchBranches = async () => {
      if (!showScheduleModal) return
      setLoadingBranches(true)
      try {
        const branchesRef = collection(db, 'branches')
        const snapshot = await getDocs(branchesRef)
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter((b) => b.isActive !== false)
        setBranches(data)
      } catch (err) {
        console.error('Error fetching branches:', err)
      } finally {
        setLoadingBranches(false)
      }
    }
    fetchBranches()
  }, [db, showScheduleModal])

  // Open schedule modal
  const openScheduleModal = (type: 'interview' | 'trial') => {
    setScheduleType(type)
    setScheduleDate('')
    setScheduleTime('')
    setScheduleDuration(type === 'interview' ? 30 : 240)
    setScheduleNotes('')
    setSendScheduleConfirmation(true)
    setScheduleError(null)
    setSelectedBranchId(candidate?.branchId || '')
    setSelectedScheduleDate(null)
    setSelectedTimeSlot('')
    setTimeSlots([])
    setCurrentMonth(new Date())
    setShowScheduleModal(true)
  }

  // Handle direct scheduling
  const handleDirectSchedule = async () => {
    if (!candidate || !selectedScheduleDate || !selectedTimeSlot) {
      setScheduleError('Please select a date and time')
      return
    }
    if (scheduleType === 'trial' && !selectedBranchId) {
      setScheduleError('Please select a branch for the trial')
      return
    }
    setScheduling(true)
    setScheduleError(null)
    try {
      const functions = getFirebaseFunctions()
      const scheduleDirectInterview = httpsCallable(functions, 'scheduleDirectInterview')
      const selectedBranch = branches.find(b => b.id === selectedBranchId)
      const result = await scheduleDirectInterview({
        candidateId: candidate.id,
        candidateName: `${candidate.firstName} ${candidate.lastName}`,
        candidateEmail: candidate.email || undefined,
        candidatePhone: candidate.phone || undefined,
        type: scheduleType,
        date: selectedScheduleDate.toISOString().split('T')[0],
        time: selectedTimeSlot,
        duration: scheduleDuration,
        jobId: candidate.jobId || undefined,
        jobTitle: candidate.jobTitle || undefined,
        branchId: selectedBranchId || candidate.branchId || undefined,
        branchName: selectedBranch?.name || candidate.branchName || undefined,
        branchAddress: selectedBranch?.address || undefined,
        notes: scheduleNotes || undefined,
        sendConfirmation: sendScheduleConfirmation,
      })
      if (result.data.success) {
        setCandidate(prev => prev ? { ...prev, status: result.data.newStatus } : null)
        const interviewsRef = collection(db, 'interviews')
        const q = query(interviewsRef, where('candidateId', '==', candidate.id), orderBy('scheduledDate', 'desc'))
        const snapshot = await getDocs(q)
        setCandidateInterviews(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
        setShowScheduleModal(false)
        alert((scheduleType === 'interview' ? 'Interview' : 'Trial') + ' scheduled successfully!' + (result.data.teamsJoinUrl ? ' Teams meeting created.' : ''))
      }
    } catch (err) {
      console.error('Error scheduling:', err)
      setScheduleError(err instanceof Error ? err.message : 'Failed to schedule. Please try again.')
    } finally {
      setScheduling(false)
    }
  }

  // Load branches for direct scheduling
  useEffect(() => {
    const fetchBranches = async () => {
      if (!showScheduleModal) return
      setLoadingBranches(true)
      try {
        const branchesRef = collection(db, 'branches')
        const snapshot = await getDocs(branchesRef)
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter((b) => b.isActive !== false)
        setBranches(data)
      } catch (err) {
        console.error('Error fetching branches:', err)
      } finally {
        setLoadingBranches(false)
      }
    }
    fetchBranches()
  }, [db, showScheduleModal])
  const storage = getFirebaseStorage()

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
      
      // Only include previousValue and newValue if they're defined
      if (previousValue !== undefined) {
        activityData.previousValue = previousValue
      }
      if (newValue !== undefined) {
        activityData.newValue = newValue
      }
      
      const docRef = await addDoc(collection(db, COLLECTIONS.ACTIVITY_LOG), activityData)
      
      // Add to local state immediately for instant UI update
      const newActivity: ActivityLog = {
        id: docRef.id,
        ...activityData,
        createdAt: { toDate: () => new Date() } as any,
      }
      setActivities(prev => [newActivity, ...prev])
    } catch (err) {
      console.error('Error logging activity:', err)
    }
  }

  // Fetch candidate
  useEffect(() => {
    async function fetchCandidate() {
      if (!id) {
        setError('No candidate ID provided')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        const candidateRef = doc(db, COLLECTIONS.CANDIDATES, id)
        const candidateSnap = await getDoc(candidateRef)

        if (!candidateSnap.exists()) {
          setError('Candidate not found')
          setLoading(false)
          return
        }

        setCandidate({
          id: candidateSnap.id,
          ...candidateSnap.data()
        } as Candidate)
      } catch (err) {
        console.error('Error fetching candidate:', err)
        setError('Failed to load candidate')
      } finally {
        setLoading(false)
      }
    }

    fetchCandidate()
  }, [db, id])

  // Fetch activity logs
  useEffect(() => {
    async function fetchActivities() {
      if (!id) return

      try {
        setLoadingActivities(true)
        
        const activitiesRef = collection(db, COLLECTIONS.ACTIVITY_LOG)
        let activitiesQuery
        
        try {
          // Try with ordering (requires index)
          activitiesQuery = query(
            activitiesRef,
            where('entityId', '==', id),
            where('entityType', '==', 'candidate'),
            orderBy('createdAt', 'desc')
          )
          const snapshot = await getDocs(activitiesQuery)
          const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as ActivityLog[]
          setActivities(data)
        } catch (e) {
          // Fallback without ordering
          console.log('Ordered activity query failed, using simple query:', e)
          activitiesQuery = query(
            activitiesRef,
            where('entityId', '==', id),
            where('entityType', '==', 'candidate')
          )
          const snapshot = await getDocs(activitiesQuery)
          const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as ActivityLog[]
          // Sort in memory
          data.sort((a, b) => {
            const aDate = a.createdAt?.toDate?.()?.getTime() || 0
            const bDate = b.createdAt?.toDate?.()?.getTime() || 0
            return bDate - aDate
          })
          setActivities(data)
        }
      } catch (err) {
        console.error('Error fetching activities:', err)
      } finally {
        setLoadingActivities(false)
      }
    }

    fetchActivities()
  }, [db, id])

  // Fetch scheduled interviews/trials for this candidate
  useEffect(() => {
    async function fetchCandidateInterviews() {
      if (!id) return

      try {
        setLoadingInterviews(true)
        
        const interviewsRef = collection(db, 'interviews')
        const interviewsQuery = query(
          interviewsRef,
          where('candidateId', '==', id),
          orderBy('scheduledDate', 'desc')
        )
        
        const snapshot = await getDocs(interviewsQuery)
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        setCandidateInterviews(data)
      } catch (err) {
        console.error('Error fetching candidate interviews:', err)
        // Try without ordering if index doesn't exist
        try {
          const interviewsRef = collection(db, 'interviews')
          const interviewsQuery = query(
            interviewsRef,
            where('candidateId', '==', id)
          )
          const snapshot = await getDocs(interviewsQuery)
          const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }))
          // Sort client-side
          data.sort((a: any, b: any) => {
            const aDate = a.scheduledDate?.toDate?.()?.getTime() || 0
            const bDate = b.scheduledDate?.toDate?.()?.getTime() || 0
            return bDate - aDate
          })
          setCandidateInterviews(data)
        } catch (e) {
          console.error('Error fetching interviews (fallback):', e)
        }
      } finally {
        setLoadingInterviews(false)
      }
    }

    fetchCandidateInterviews()
  }, [db, id])

  // Fetch linked candidates for application history
  useEffect(() => {
    async function fetchLinkedCandidates() {
      if (!candidate) return
      
      // Get all linked candidate IDs
      const linkedIds = candidate.linkedCandidateIds || []
      const primaryId = candidate.primaryRecordId
      
      // Combine all IDs (excluding current candidate)
      const allLinkedIds = [...new Set([...linkedIds, ...(primaryId ? [primaryId] : [])])]
        .filter(linkedId => linkedId !== candidate.id)
      
      if (allLinkedIds.length === 0) {
        setLinkedCandidates([])
        return
      }

      try {
        setLoadingLinkedCandidates(true)
        
        // Fetch each linked candidate
        const fetchPromises = allLinkedIds.map(async (linkedId) => {
          const linkedRef = doc(db, COLLECTIONS.CANDIDATES, linkedId)
          const linkedSnap = await getDoc(linkedRef)
          if (linkedSnap.exists()) {
            return { id: linkedSnap.id, ...linkedSnap.data() } as Candidate
          }
          return null
        })
        
        const results = await Promise.all(fetchPromises)
        const validCandidates = results.filter((c): c is Candidate => c !== null)
        
        // Sort by creation date (newest first)
        validCandidates.sort((a, b) => {
          const aDate = a.createdAt?.toDate?.()?.getTime() || 0
          const bDate = b.createdAt?.toDate?.()?.getTime() || 0
          return bDate - aDate
        })
        
        setLinkedCandidates(validCandidates)
      } catch (err) {
        console.error('Error fetching linked candidates:', err)
      } finally {
        setLoadingLinkedCandidates(false)
      }
    }

    fetchLinkedCandidates()
  }, [db, candidate?.id, candidate?.linkedCandidateIds, candidate?.primaryRecordId])

  // Fetch active jobs for assignment dropdown
  useEffect(() => {
    async function fetchJobs() {
      try {
        setLoadingJobs(true)
        const jobsRef = collection(db, COLLECTIONS.JOBS)
        const jobsQuery = query(
          jobsRef,
          where('status', '==', 'active'),
          orderBy('createdAt', 'desc')
        )
        const snapshot = await getDocs(jobsQuery)
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        setJobs(data)
      } catch (err) {
        console.error('Error fetching jobs:', err)
        // Fallback without ordering
        try {
          const jobsRef = collection(db, COLLECTIONS.JOBS)
          const jobsQuery = query(jobsRef, where('status', '==', 'active'))
          const snapshot = await getDocs(jobsQuery)
          const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }))
          setJobs(data)
        } catch (e) {
          console.error('Error fetching jobs (fallback):', e)
        }
      } finally {
        setLoadingJobs(false)
      }
    }

    fetchJobs()
  }, [db])

  // Assign candidate to job
  const handleAssignJob = async () => {
    if (!candidate || !selectedJobId) return

    try {
      setAssigningJob(true)
      
      const selectedJob = jobs.find(j => j.id === selectedJobId)
      if (!selectedJob) {
        alert('Job not found')
        return
      }

      const previousJobId = (candidate as any).jobId || null
      const previousJobTitle = candidate.jobTitle || null

      // Update candidate with job reference
      const candidateRef = doc(db, COLLECTIONS.CANDIDATES, candidate.id)
      await updateDoc(candidateRef, {
        jobId: selectedJobId,
        jobTitle: selectedJob.title,
        branchId: selectedJob.branchId,
        branchName: selectedJob.branchName,
        updatedAt: serverTimestamp(),
      })

      // Update job's candidate count (increment)
      const jobRef = doc(db, COLLECTIONS.JOBS, selectedJobId)
      const jobDoc = await getDoc(jobRef)
      if (jobDoc.exists()) {
        const currentCount = jobDoc.data().candidateCount || 0
        await updateDoc(jobRef, {
          candidateCount: currentCount + 1,
          updatedAt: serverTimestamp(),
        })
      }

      // If candidate was previously assigned to a different job, decrement that job's count
      if (previousJobId && previousJobId !== selectedJobId) {
        try {
          const prevJobRef = doc(db, COLLECTIONS.JOBS, previousJobId)
          const prevJobDoc = await getDoc(prevJobRef)
          if (prevJobDoc.exists()) {
            const prevCount = prevJobDoc.data().candidateCount || 0
            await updateDoc(prevJobRef, {
              candidateCount: Math.max(0, prevCount - 1),
              updatedAt: serverTimestamp(),
            })
          }
        } catch (e) {
          console.error('Error updating previous job count:', e)
        }
      }

      // Log the activity
      await logActivity(
        candidate.id,
        'updated',
        `Assigned to job: ${selectedJob.title} at ${selectedJob.branchName}`,
        previousJobTitle ? { jobId: previousJobId, jobTitle: previousJobTitle } : undefined,
        { jobId: selectedJobId, jobTitle: selectedJob.title }
      )

      // Update local state
      setCandidate(prev => prev ? {
        ...prev,
        jobId: selectedJobId,
        jobTitle: selectedJob.title,
        branchId: selectedJob.branchId,
        branchName: selectedJob.branchName,
      } as any : null)

      setShowJobAssignModal(false)
      setSelectedJobId('')
    } catch (err) {
      console.error('Error assigning job:', err)
      alert('Failed to assign job. Please try again.')
    } finally {
      setAssigningJob(false)
    }
  }

  // Remove candidate from job
  const handleRemoveFromJob = async () => {
    if (!candidate || !(candidate as any).jobId) return

    if (!confirm('Are you sure you want to remove this candidate from the assigned job?')) {
      return
    }

    try {
      setAssigningJob(true)
      
      const previousJobId = (candidate as any).jobId
      const previousJobTitle = candidate.jobTitle

      // Update candidate to remove job reference
      const candidateRef = doc(db, COLLECTIONS.CANDIDATES, candidate.id)
      await updateDoc(candidateRef, {
        jobId: null,
        jobTitle: null,
        updatedAt: serverTimestamp(),
      })

      // Decrement job's candidate count
      if (previousJobId) {
        try {
          const jobRef = doc(db, COLLECTIONS.JOBS, previousJobId)
          const jobDoc = await getDoc(jobRef)
          if (jobDoc.exists()) {
            const currentCount = jobDoc.data().candidateCount || 0
            await updateDoc(jobRef, {
              candidateCount: Math.max(0, currentCount - 1),
              updatedAt: serverTimestamp(),
            })
          }
        } catch (e) {
          console.error('Error updating job count:', e)
        }
      }

      // Log the activity
      await logActivity(
        candidate.id,
        'updated',
        `Removed from job: ${previousJobTitle}`,
        { jobId: previousJobId, jobTitle: previousJobTitle },
        { jobId: null, jobTitle: null }
      )

      // Update local state
      setCandidate(prev => prev ? {
        ...prev,
        jobId: null,
        jobTitle: null,
      } as any : null)

    } catch (err) {
      console.error('Error removing from job:', err)
      alert('Failed to remove from job. Please try again.')
    } finally {
      setAssigningJob(false)
    }
  }

  // Update status
  const handleStatusChange = async () => {
    if (!candidate || !newStatus) return

    const previousStatus = candidate.status

    try {
      setUpdating(true)
      const candidateRef = doc(db, COLLECTIONS.CANDIDATES, candidate.id)
      await updateDoc(candidateRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
      })

      // Log the status change
      await logActivity(
        candidate.id,
        'status_changed',
        `Status changed from "${previousStatus.replace(/_/g, ' ')}" to "${newStatus.replace(/_/g, ' ')}"`,
        { status: previousStatus },
        { status: newStatus }
      )

      setCandidate(prev => prev ? { ...prev, status: newStatus } : null)
      setShowStatusModal(false)
      setNewStatus('')
    } catch (err) {
      console.error('Error updating status:', err)
      alert('Failed to update status. Please try again.')
    } finally {
      setUpdating(false)
    }
  }

  // Open edit modal
  const openEditModal = () => {
    if (!candidate) return
    setEditForm({
      firstName: candidate.firstName || '',
      lastName: candidate.lastName || '',
      email: candidate.email || '',
      phone: candidate.phone || '',
      address: candidate.address || '',
      postcode: candidate.postcode || '',
      source: candidate.source || '',
      jobTitle: candidate.jobTitle || '',
      notes: candidate.notes || '',
    })
    setFormErrors({})
    setShowEditModal(true)
  }

  // Close edit modal
  const closeEditModal = () => {
    setShowEditModal(false)
    setFormErrors({})
  }

  // Handle edit form field change
  const handleEditFormChange = (field: keyof EditCandidateForm, value: string) => {
    setEditForm(prev => ({ ...prev, [field]: value }))
    if (formErrors[field as keyof FormErrors]) {
      setFormErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  // Validate edit form
  const validateEditForm = (): boolean => {
    const errors: FormErrors = {}

    if (!editForm.firstName.trim()) {
      errors.firstName = 'First name is required'
    }

    if (!editForm.lastName.trim()) {
      errors.lastName = 'Last name is required'
    }

    if (!editForm.email.trim()) {
      errors.email = 'Email is required'
    } else if (!validateEmail(editForm.email)) {
      errors.email = 'Please enter a valid email address'
    }

    if (!editForm.phone.trim()) {
      errors.phone = 'Phone number is required'
    } else if (!validateUKPhone(editForm.phone)) {
      errors.phone = 'Please enter a valid UK phone number'
    }

    if (editForm.postcode && !validateUKPostcode(editForm.postcode)) {
      errors.postcode = 'Please enter a valid UK postcode'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Save edited candidate
  const handleSaveEdit = async () => {
    if (!candidate || !validateEditForm()) return

    try {
      setSaving(true)

      // Track what changed for audit log
      const changes: string[] = []
      const previousValues: Record<string, unknown> = {}
      const newValues: Record<string, unknown> = {}

      if (editForm.firstName !== candidate.firstName) {
        changes.push('first name')
        previousValues.firstName = candidate.firstName
        newValues.firstName = editForm.firstName.trim()
      }
      if (editForm.lastName !== candidate.lastName) {
        changes.push('last name')
        previousValues.lastName = candidate.lastName
        newValues.lastName = editForm.lastName.trim()
      }
      if (editForm.email !== candidate.email) {
        changes.push('email')
        previousValues.email = candidate.email
        newValues.email = editForm.email.trim().toLowerCase()
      }
      if (editForm.phone !== candidate.phone) {
        changes.push('phone')
        previousValues.phone = candidate.phone
        newValues.phone = editForm.phone.trim()
      }
      if (editForm.address !== (candidate.address || '')) {
        changes.push('address')
        previousValues.address = candidate.address
        newValues.address = editForm.address.trim()
      }
      if (editForm.postcode !== (candidate.postcode || '')) {
        changes.push('postcode')
        previousValues.postcode = candidate.postcode
        newValues.postcode = editForm.postcode ? formatPostcode(editForm.postcode) : ''
      }
      if (editForm.source !== (candidate.source || '')) {
        changes.push('source')
        previousValues.source = candidate.source
        newValues.source = editForm.source
      }
      if (editForm.jobTitle !== (candidate.jobTitle || '')) {
        changes.push('job title')
        previousValues.jobTitle = candidate.jobTitle
        newValues.jobTitle = editForm.jobTitle.trim()
      }
      if (editForm.notes !== (candidate.notes || '')) {
        changes.push('notes')
        previousValues.notes = candidate.notes
        newValues.notes = editForm.notes.trim()
      }

      // Update Firestore
      const updateData = {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        email: editForm.email.trim().toLowerCase(),
        phone: editForm.phone.trim(),
        phoneNormalized: normalizePhone(editForm.phone),
        address: editForm.address.trim(),
        postcode: editForm.postcode ? formatPostcode(editForm.postcode) : '',
        source: editForm.source,
        jobTitle: editForm.jobTitle.trim(),
        notes: editForm.notes.trim(),
        updatedAt: serverTimestamp(),
      }

      const candidateRef = doc(db, COLLECTIONS.CANDIDATES, candidate.id)
      await updateDoc(candidateRef, updateData)

      // Log the update if there were changes
      if (changes.length > 0) {
        await logActivity(
          candidate.id,
          'updated',
          `Updated ${changes.join(', ')}`,
          previousValues,
          newValues
        )
      }

      // Update local state
      setCandidate(prev => prev ? {
        ...prev,
        ...updateData,
        updatedAt: { toDate: () => new Date() } as any,
      } : null)

      setShowEditModal(false)
    } catch (err) {
      console.error('Error saving candidate:', err)
      alert('Failed to save changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Open WhatsApp Modal
  const openWhatsAppModal = async () => {
    setShowWhatsAppModal(true)
    setSelectedTemplate(null)
    setMessageContent('')
    setIsEditingMessage(false)
    setTemplateCategoryFilter('all')
    setMessageCopied(false)
    setGeneratedBookingLink(null)
    setGeneratingBookingLink(false)
    
    // Load templates if not already loaded
    if (whatsappTemplates.length === 0) {
      await loadWhatsAppTemplates()
    }
  }

  // Load WhatsApp templates from Firestore
  const loadWhatsAppTemplates = async () => {
    setLoadingTemplates(true)
    try {
      const templatesRef = collection(db, 'whatsappTemplates')
      const q = query(templatesRef, where('active', '==', true), orderBy('name'))
      const snapshot = await getDocs(q)
      
      const loadedTemplates: WhatsAppTemplate[] = []
      snapshot.forEach(doc => {
        loadedTemplates.push({
          id: doc.id,
          ...doc.data()
        } as WhatsAppTemplate)
      })
      
      setWhatsappTemplates(loadedTemplates)
    } catch (error) {
      console.error('Error loading WhatsApp templates:', error)
    } finally {
      setLoadingTemplates(false)
    }
  }

  // Get placeholder data for the current candidate
  const getPlaceholderData = (): PlaceholderData => {
    if (!candidate) return {}
    
    const candidateData = prepareCandidateData({
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      name: `${candidate.firstName} ${candidate.lastName}`,
      email: candidate.email,
      phone: candidate.phone,
      jobTitle: candidate.jobTitle,
      entity: candidate.entity || 'Allied Pharmacies'
    })
    
    // TODO: Add interview data when scheduling is implemented
    // const interviewData = prepareInterviewData({ ... })
    
    return combinePlaceholderData(candidateData, {
      // Use generated booking link if available, otherwise placeholder
      interviewBookingLink: generatedBookingLink || '[Booking link will be generated]',
      companyName: candidate.entity || 'Allied Pharmacies',
      branchName: candidate.branchId || '',
      branchAddress: ''  // Would come from branch lookup
    })
  }

  // Generate a booking link for the candidate via Cloud Function
  const generateBookingLinkForCandidate = async (type: 'interview' | 'trial'): Promise<string> => {
    if (!candidate || !user) return ''
    
    // If we already generated one, return it
    if (generatedBookingLink) return generatedBookingLink
    
    setGeneratingBookingLink(true)
    try {
      const functions = getFirebaseFunctions()
      const createBookingLinkFn = httpsCallable<{
        candidateId: string
        candidateName: string
        candidateEmail?: string
        candidatePhone?: string
        type: 'interview' | 'trial'
        jobTitle?: string
        expiryDays?: number
        maxUses?: number
      }, {
        success: boolean
        id: string
        url: string
        expiresAt: string
      }>(functions, 'createBookingLink')
      
      const result = await createBookingLinkFn({
        candidateId: candidate.id,
        candidateName: `${candidate.firstName} ${candidate.lastName}`,
        candidateEmail: candidate.email,
        candidatePhone: candidate.phone,
        type,
        jobTitle: candidate.jobTitle,
        expiryDays: 3,
        maxUses: 1,
      })
      
      if (result.data.success) {
        setGeneratedBookingLink(result.data.url)
        
        // Log activity
        logActivity(
          candidate.id,
          'create',
          `Generated ${type} booking link (expires ${new Date(result.data.expiresAt).toLocaleDateString()})`
        )
        
        return result.data.url
      }
      
      return ''
    } catch (error) {
      console.error('Error generating booking link:', error)
      return ''
    } finally {
      setGeneratingBookingLink(false)
    }
  }

  // Select a template and fill placeholders
  const handleSelectTemplate = async (template: WhatsAppTemplate) => {
    setSelectedTemplate(template)
    setIsEditingMessage(false)
    
    // Check if template uses booking link placeholder
    const usesBookingLink = template.content.includes('{{interviewBookingLink}}')
    
    // Generate booking link if needed and get the URL directly
    let bookingUrl = generatedBookingLink
    if (usesBookingLink && !generatedBookingLink) {
      const linkType = template.category === 'trial' ? 'trial' : 'interview'
      bookingUrl = await generateBookingLinkForCandidate(linkType)
    }
    
    // Replace placeholders with candidate data
    // Pass the booking URL directly since state update may not have completed
    const data = getPlaceholderData()
    if (bookingUrl) {
      data.interviewBookingLink = bookingUrl
    }
    const result = replaceTemplatePlaceholders(template.content, data)
    setMessageContent(result.text)
  }

  // Quick action: Interview invitation
  const handleQuickInterviewInvite = async () => {
    // Generate booking link first
    const bookingUrl = await generateBookingLinkForCandidate('interview')
    
    const template = whatsappTemplates.find(t => 
      t.category === 'interview' && t.name.toLowerCase().includes('invitation')
    )
    if (template) {
      // Now select template (booking link already generated)
      setSelectedTemplate(template)
      setIsEditingMessage(false)
      const data = getPlaceholderData()
      // Use the returned bookingUrl directly since state may not have updated yet
      if (bookingUrl) {
        data.interviewBookingLink = bookingUrl
      }
      const result = replaceTemplatePlaceholders(template.content, data)
      setMessageContent(result.text)
    } else {
      // Fallback if no template found
      const data = getPlaceholderData()
      setMessageContent(`Hi ${data.firstName},\n\nThank you for applying for the ${data.jobTitle} position at Allied Pharmacies.\n\nWe would like to invite you for an interview. Please use the following link to book a convenient time:\n\n${bookingUrl || data.interviewBookingLink}\n\nBest regards,\nAllied Recruitment Team`)
      setSelectedTemplate(null)
    }
  }

  // Quick action: Trial invitation
  const handleQuickTrialInvite = async () => {
    // Generate booking link first
    const bookingUrl = await generateBookingLinkForCandidate('trial')
    
    const template = whatsappTemplates.find(t => 
      t.category === 'trial' && t.name.toLowerCase().includes('invitation')
    )
    if (template) {
      // Now select template (booking link already generated)
      setSelectedTemplate(template)
      setIsEditingMessage(false)
      const data = getPlaceholderData()
      // Use the returned bookingUrl directly since state may not have updated yet
      if (bookingUrl) {
        data.interviewBookingLink = bookingUrl
      }
      const result = replaceTemplatePlaceholders(template.content, data)
      setMessageContent(result.text)
    } else {
      // Fallback if no template found
      const data = getPlaceholderData()
      setMessageContent(`Hi ${data.firstName},\n\nCongratulations! Following your successful interview, we would like to invite you for a trial shift.\n\nPlease use this link to book your trial: ${bookingUrl || '[Booking link]'}\n\nPlease bring your GPhC registration, ID, and wear smart clothing.\n\nBest regards,\nAllied Recruitment Team`)
      setSelectedTemplate(null)
    }
  }

  // Copy message to clipboard
  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(messageContent)
      setMessageCopied(true)
      setTimeout(() => setMessageCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  // Send via WhatsApp
  const handleSendWhatsApp = () => {
    if (!candidate?.phone || !messageContent) return
    
    const url = generateWhatsAppURL(candidate.phone, messageContent)
    window.open(url, '_blank')
    
    // Log activity
    logActivity(
      candidate.id,
      'update',
      `Sent WhatsApp message${selectedTemplate ? ` using template "${selectedTemplate.name}"` : ''}`
    )
    
    // Close modal
    setShowWhatsAppModal(false)
  }

  // Filter templates by category
  const filteredWhatsappTemplates = whatsappTemplates.filter(t => 
    templateCategoryFilter === 'all' || t.category === templateCategoryFilter
  )

  // Render a line with unfilled placeholders highlighted
  const renderLineWithPlaceholders = (line: string): React.ReactNode => {
    const parts = line.split(/(\{\{[^}]+\}\})/g)
    return parts.map((part, index) => {
      if (part.match(/^\{\{[^}]+\}\}$/)) {
        // This is an unfilled placeholder - highlight it
        return (
          <span key={index} className="unfilled-placeholder">
            {part}
          </span>
        )
      }
      return part
    })
  }

  // Send email
  const sendEmail = () => {
    if (!candidate?.email) return
    window.location.href = `mailto:${candidate.email}`
  }

  // Call phone
  const callPhone = () => {
    if (!candidate?.phone) return
    window.location.href = `tel:${candidate.phone}`
  }

  // Delete candidate
  const handleDelete = async () => {
    if (!candidate) return

    try {
      setDeleting(true)

      // Log the deletion before deleting
      await logActivity(
        candidate.id,
        'deleted',
        `Candidate "${candidate.firstName} ${candidate.lastName}" was deleted`,
        {
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          email: candidate.email,
          phone: candidate.phone,
          status: candidate.status,
        },
        undefined
      )

      // Delete the candidate document
      const candidateRef = doc(db, COLLECTIONS.CANDIDATES, candidate.id)
      await deleteDoc(candidateRef)

      // Navigate back to candidates list
      navigate('/candidates')
    } catch (err) {
      console.error('Error deleting candidate:', err)
      alert('Failed to delete candidate. Please try again.')
      setDeleting(false)
    }
  }

  // Trigger file input click
  const triggerFileUpload = () => {
    fileInputRef.current?.click()
  }

  // Handle CV file selection
  const handleCvUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !candidate) return

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
    if (!allowedTypes.includes(file.type)) {
      alert('Please upload a PDF or Word document (.pdf, .doc, .docx)')
      return
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      alert('File size must be less than 10MB')
      return
    }

    try {
      setUploading(true)
      setUploadProgress('Uploading...')

      // Create storage reference
      const fileName = `${Date.now()}_${file.name}`
      const storagePath = getCvPath(candidate.id, fileName)
      const storageRef = ref(storage, storagePath)

      // Upload file
      await uploadBytes(storageRef, file)
      setUploadProgress('Getting download URL...')

      // Get download URL
      const downloadUrl = await getDownloadURL(storageRef)

      // Update candidate document
      const candidateRef = doc(db, COLLECTIONS.CANDIDATES, candidate.id)
      await updateDoc(candidateRef, {
        cvUrl: downloadUrl,
        cvFileName: file.name,
        cvStoragePath: storagePath,
        updatedAt: serverTimestamp(),
      })

      // Log the upload
      await logActivity(
        candidate.id,
        'cv_uploaded',
        `CV uploaded: ${file.name}`,
        candidate.cvUrl ? { cvFileName: candidate.cvFileName } : undefined,
        { cvFileName: file.name }
      )

      // Update local state
      setCandidate(prev => prev ? {
        ...prev,
        cvUrl: downloadUrl,
        cvFileName: file.name,
        cvStoragePath: storagePath,
      } : null)

      setUploadProgress('')
    } catch (err) {
      console.error('Error uploading CV:', err)
      alert('Failed to upload CV. Please try again.')
    } finally {
      setUploading(false)
      setUploadProgress('')
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Parse CV with AI
  const handleParseCv = async (retryAttempt = 0) => {
    if (!candidate?.cvUrl || !candidate?.cvFileName) return

    try {
      setParsing(true)
      setParseStatus('idle')
      setParseError(null)
      setParseRetryCount(retryAttempt)
      
      if (retryAttempt > 0) {
        setUploadProgress(`Retrying... (attempt ${retryAttempt + 1}/${MAX_PARSE_RETRIES + 1})`)
      } else {
        setUploadProgress('Parsing CV with AI...')
      }

      const functions = getFirebaseFunctions()
      const parseCV = httpsCallable(functions, 'parseCV', {
        timeout: 120000, // 2 minute timeout
      })

      // Determine mime type from filename
      const ext = candidate.cvFileName.toLowerCase().split('.').pop()
      let mimeType = 'application/pdf'
      if (ext === 'doc') mimeType = 'application/msword'
      if (ext === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

      const result = await parseCV({
        fileUrl: candidate.cvUrl,
        fileName: candidate.cvFileName,
        mimeType,
      })

      const response = result.data as { success: boolean; data?: any; usedAI?: boolean; error?: string }

      if (response.success && response.data) {
        // Include usedAI flag in parsed data
        const dataWithAIFlag = {
          ...response.data,
          usedAI: response.usedAI ?? false
        }
        setParsedData(dataWithAIFlag)
        setParseStatus(response.data.confidence.overall >= 70 ? 'success' : 'partial')
        setShowParsedModal(true)
        setParseRetryCount(0)

        // Log the parse
        await logActivity(
          candidate.id,
          'cv_parsed',
          `CV parsed with ${response.data.confidence.overall}% confidence`,
          undefined,
          { confidence: response.data.confidence.overall }
        )
      } else {
        throw new Error(response.error || 'Failed to parse CV')
      }
    } catch (err: any) {
      console.error('Error parsing CV:', err)
      
      // Determine if error is retryable
      const errorMessage = err.message || 'Unknown error'
      const isRetryable = 
        errorMessage.includes('timeout') ||
        errorMessage.includes('DEADLINE_EXCEEDED') ||
        errorMessage.includes('UNAVAILABLE') ||
        errorMessage.includes('INTERNAL') ||
        errorMessage.includes('network') ||
        err.code === 'functions/deadline-exceeded' ||
        err.code === 'functions/unavailable' ||
        err.code === 'functions/internal'

      if (isRetryable && retryAttempt < MAX_PARSE_RETRIES) {
        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, retryAttempt), 10000)
        setUploadProgress(`Error occurred. Retrying in ${delay / 1000}s...`)
        
        await new Promise(resolve => setTimeout(resolve, delay))
        
        // Retry
        return handleParseCv(retryAttempt + 1)
      }

      // Max retries reached or non-retryable error
      setParseStatus('error')
      setParseError(getReadableErrorMessage(err))
    } finally {
      if (parseStatus !== 'idle') {
        setParsing(false)
        setUploadProgress('')
      }
    }
  }

  // Get human-readable error message
  const getReadableErrorMessage = (err: any): string => {
    const code = err.code || ''
    const message = err.message || ''

    if (code === 'functions/unauthenticated' || message.includes('unauthenticated')) {
      return 'You need to be logged in to parse CVs. Please refresh the page and try again.'
    }
    if (code === 'functions/permission-denied') {
      return 'You don\'t have permission to parse CVs.'
    }
    if (code === 'functions/not-found' || message.includes('not-found')) {
      return 'The CV file could not be found. It may have been deleted.'
    }
    if (code === 'functions/deadline-exceeded' || message.includes('timeout')) {
      return 'The parsing took too long. The CV may be too large or complex. Try a smaller file.'
    }
    if (code === 'functions/resource-exhausted') {
      return 'Too many requests. Please wait a moment and try again.'
    }
    if (code === 'functions/unavailable' || message.includes('UNAVAILABLE')) {
      return 'The parsing service is temporarily unavailable. Please try again in a few minutes.'
    }
    if (message.includes('ANTHROPIC_API_KEY')) {
      return 'AI parsing is not configured. Please contact your administrator.'
    }
    if (message.includes('extract') || message.includes('text')) {
      return 'Could not read the CV file. The file may be corrupted, password-protected, or contain only images.'
    }

    return message || 'An unexpected error occurred. Please try again.'
  }

  // Manual entry fallback
  const handleManualEntry = () => {
    setParseStatus('idle')
    setParseError(null)
    // Could open edit form here
    alert('You can manually edit the candidate details using the Edit button in the Info section.')
  }

  // Apply parsed data to candidate
  const handleApplyParsedData = async (fieldsToApply: string[]) => {
    if (!candidate || !parsedData) return

    try {
      setSaving(true)
      
      console.log('Applying parsed data:', parsedData)
      console.log('Fields to apply:', fieldsToApply)

      const updates: Record<string, any> = {
        updatedAt: serverTimestamp(),
      }

      // Build updates based on selected fields
      if (fieldsToApply.includes('firstName') && parsedData.firstName) {
        updates.firstName = parsedData.firstName
      }
      if (fieldsToApply.includes('lastName') && parsedData.lastName) {
        updates.lastName = parsedData.lastName
      }
      if (fieldsToApply.includes('email') && parsedData.email) {
        updates.email = parsedData.email
      }
      if (fieldsToApply.includes('phone') && parsedData.phone) {
        updates.phone = parsedData.phone
      }
      if (fieldsToApply.includes('address') && parsedData.address) {
        updates.address = parsedData.address
      }
      if (fieldsToApply.includes('postcode') && parsedData.postcode) {
        updates.postcode = parsedData.postcode
      }
      if (fieldsToApply.includes('skills') && parsedData.skills?.length > 0) {
        updates.skills = parsedData.skills
      }
      if (fieldsToApply.includes('qualifications') && parsedData.qualifications?.length > 0) {
        updates.parsedQualifications = parsedData.qualifications
      }
      if (fieldsToApply.includes('experience') && parsedData.experience?.length > 0) {
        updates.experience = parsedData.experience
      }
      if (fieldsToApply.includes('education') && parsedData.education?.length > 0) {
        updates.education = parsedData.education
      }

      // Store full parsed data for reference - remove null/undefined values
      const cleanParsedData = JSON.parse(JSON.stringify(parsedData, (key, value) => 
        value === null || value === undefined ? undefined : value
      ))
      updates.cvParsedData = cleanParsedData
      updates.cvParsedAt = serverTimestamp()

      console.log('Updates to save:', updates)

      const candidateRef = doc(db, COLLECTIONS.CANDIDATES, candidate.id)
      await updateDoc(candidateRef, updates)
      
      console.log('Firestore update complete')

      // Log the update
      await logActivity(
        candidate.id,
        'updated',
        `Applied ${fieldsToApply.length} fields from parsed CV`,
        undefined,
        { fields: fieldsToApply }
      )

      // Refetch candidate to get the updated data from Firestore
      const refreshedSnap = await getDoc(candidateRef)
      console.log('Refreshed data:', refreshedSnap.data())
      if (refreshedSnap.exists()) {
        setCandidate({ id: refreshedSnap.id, ...refreshedSnap.data() } as Candidate)
      }
      
      setShowParsedModal(false)
      setParsedData(null)

    } catch (err) {
      console.error('Error applying parsed data:', err)
      alert('Failed to apply parsed data. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Delete CV
  const handleDeleteCv = async () => {
    if (!candidate || !candidate.cvUrl) return

    if (!confirm('Are you sure you want to delete this CV?')) return

    try {
      setUploading(true)
      setUploadProgress('Deleting...')

      // Delete from storage if we have the path
      if (candidate.cvStoragePath) {
        try {
          const storageRef = ref(storage, candidate.cvStoragePath)
          await deleteObject(storageRef)
        } catch (storageErr) {
          console.warn('Could not delete file from storage:', storageErr)
          // Continue anyway - file might already be deleted
        }
      }

      // Update candidate document
      const candidateRef = doc(db, COLLECTIONS.CANDIDATES, candidate.id)
      await updateDoc(candidateRef, {
        cvUrl: null,
        cvFileName: null,
        cvStoragePath: null,
        updatedAt: serverTimestamp(),
      })

      // Log the deletion
      await logActivity(
        candidate.id,
        'updated',
        `CV deleted: ${candidate.cvFileName}`,
        { cvFileName: candidate.cvFileName },
        undefined
      )

      // Update local state
      setCandidate(prev => prev ? {
        ...prev,
        cvUrl: undefined,
        cvFileName: undefined,
        cvStoragePath: undefined,
      } : null)

    } catch (err) {
      console.error('Error deleting CV:', err)
      alert('Failed to delete CV. Please try again.')
    } finally {
      setUploading(false)
      setUploadProgress('')
    }
  }

  if (loading) {
    return (
      <div className="candidate-detail-loading">
        <Spinner size="lg" />
        <p>Loading candidate...</p>
      </div>
    )
  }

  if (error || !candidate) {
    return (
      <div className="candidate-detail-error">
        <h2>Error</h2>
        <p>{error || 'Candidate not found'}</p>
        <Button onClick={() => navigate('/candidates')}>
          Back to Candidates
        </Button>
      </div>
    )
  }

  return (
    <div className="candidate-detail">
      {/* Back Button */}
      <button className="back-button" onClick={() => navigate('/candidates')}>
        ← Back to Candidates
      </button>

      {/* Header */}
      <div className="candidate-header">
        <div className="candidate-avatar">
          {getInitials(candidate.firstName, candidate.lastName)}
        </div>
        <div className="candidate-header-info">
          <h1>{candidate.firstName} {candidate.lastName}</h1>
          <p className="candidate-job">{candidate.jobTitle || 'No job assigned'}</p>
          <div className="candidate-header-meta">
            <Badge variant={STATUS_COLORS[candidate.status] as any}>
              {candidate.status.replace(/_/g, ' ')}
            </Badge>
            {candidate.source && (
              <span className="source-tag">via {candidate.source}</span>
            )}
            <span className="applied-date">Applied {formatDate(candidate.createdAt)}</span>
          </div>
        </div>
        <div className="candidate-header-actions">
          <Button 
            variant="primary"
            onClick={() => {
              setNewStatus(candidate.status)
              setShowStatusModal(true)
            }}
          >
            Change Status
          </Button>
          <Button variant="outline" onClick={openEditModal}>
            Edit
          </Button>
          <Button variant="danger" onClick={() => setShowDeleteModal(true)}>
            Delete
          </Button>
        </div>
      </div>

      {/* Content Grid */}
      <div className="candidate-content">
        {/* Left Column */}
        <div className="candidate-main">
          {/* Contact Card */}
          <Card className="detail-card">
            <h2>Contact Information</h2>
            <div className="contact-grid">
              <div className="contact-item">
                <span className="contact-label">Email</span>
                <a href={`mailto:${candidate.email}`} className="contact-value email-link">
                  {candidate.email}
                </a>
              </div>
              <div className="contact-item">
                <span className="contact-label">Phone</span>
                <a href={`tel:${candidate.phone}`} className="contact-value phone-link">
                  {formatPhone(candidate.phone)}
                </a>
              </div>
              {candidate.address && (
                <div className="contact-item full-width">
                  <span className="contact-label">Address</span>
                  <span className="contact-value">{candidate.address}</span>
                </div>
              )}
              {candidate.postcode && (
                <div className="contact-item">
                  <span className="contact-label">Postcode</span>
                  <span className="contact-value">{candidate.postcode}</span>
                </div>
              )}
            </div>
            <div className="contact-actions">
              <Button variant="outline" size="sm" onClick={callPhone}>
                📞 Call
              </Button>
              <Button variant="outline" size="sm" onClick={sendEmail}>
                ✉️ Email
              </Button>
              <Button variant="outline" size="sm" onClick={openWhatsAppModal}>
                💬 WhatsApp
              </Button>
            </div>
          </Card>

          {/* Notes & CV Summary Card */}
          <Card className="detail-card notes-card">
            <h2>Notes & Summary</h2>
            
            {/* CV Summary from AI Parsing */}
            {candidate.cvParsedData && (
              <div className="cv-summary-section">
                {/* AI Badge & Summary Text */}
                <div className="cv-summary-header">
                  {candidate.cvParsedData.usedAI === true ? (
                    <span className="parse-badge ai">🤖 AI Parsed</span>
                  ) : (
                    <span className="parse-badge regex">📝 Basic Parse</span>
                  )}
                  {candidate.cvParsedData.confidence?.overall != null && (
                    <span className={`confidence-badge ${candidate.cvParsedData.confidence.overall >= 70 ? 'high' : candidate.cvParsedData.confidence.overall >= 40 ? 'medium' : 'low'}`}>
                      {candidate.cvParsedData.confidence.overall}% confidence
                    </span>
                  )}
                </div>

                {/* Summary Text */}
                {candidate.cvParsedData.summary && (
                  <div className="cv-summary-text">
                    <p>{candidate.cvParsedData.summary}</p>
                  </div>
                )}

                {/* Experience Stats */}
                {(candidate.cvParsedData.totalYearsExperience != null || candidate.cvParsedData.pharmacyYearsExperience != null) && (
                  <div className="cv-experience-stats">
                    {candidate.cvParsedData.totalYearsExperience != null && (
                      <div className="exp-stat-card">
                        <span className="exp-stat-value">{candidate.cvParsedData.totalYearsExperience}</span>
                        <span className="exp-stat-label">Years Experience</span>
                      </div>
                    )}
                    {candidate.cvParsedData.pharmacyYearsExperience != null && (
                      <div className="exp-stat-card">
                        <span className="exp-stat-value">{candidate.cvParsedData.pharmacyYearsExperience}</span>
                        <span className="exp-stat-label">Years in Pharmacy</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Qualifications */}
                {candidate.cvParsedData.qualifications?.length > 0 && (
                  <div className="cv-qualifications-section">
                    <span className="section-label">Qualifications</span>
                    <div className="qual-tags">
                      {candidate.cvParsedData.qualifications.map((qual: string, i: number) => (
                        <span key={i} className="qual-tag">{qual}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* User Notes */}
            {candidate.notes && (
              <div className="user-notes-section">
                <span className="section-label">📝 Notes</span>
                <p>{candidate.notes}</p>
              </div>
            )}

            {/* Empty State */}
            {!candidate.cvParsedData && !candidate.notes && (
              <div className="no-notes">
                <p>No notes or CV summary available</p>
              </div>
            )}
          </Card>

          {/* CV Card */}
          <Card className="detail-card">
            <h2>CV / Resume</h2>
            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleCvUpload}
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              style={{ display: 'none' }}
            />
            
            {uploading || parsing ? (
              <div className="cv-uploading">
                <Spinner size="sm" />
                <span>{uploadProgress || 'Processing...'}</span>
              </div>
            ) : candidate.cvUrl ? (
              <div className="cv-section">
                <div className="cv-file">
                  <span className="cv-icon">📄</span>
                  <div className="cv-info">
                    <span className="cv-filename">{candidate.cvFileName || 'CV Document'}</span>
                    <span className="cv-meta">Click to view or download</span>
                  </div>
                  <div className="cv-actions">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => window.open(candidate.cvUrl, '_blank')}
                    >
                      View
                    </Button>
                    <Button 
                      variant="primary" 
                      size="sm"
                      onClick={handleParseCv}
                      disabled={parsing}
                    >
                      🤖 Parse CV
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={triggerFileUpload}
                    >
                      Replace
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={handleDeleteCv}
                    >
                      🗑️
                    </Button>
                  </div>
                </div>
                {parseStatus !== 'idle' && (
                  <div className={`parse-status parse-status-${parseStatus}`}>
                    {parseStatus === 'success' && '✅ CV parsed successfully'}
                    {parseStatus === 'partial' && '⚠️ CV parsed with low confidence - you may need to verify the extracted data'}
                    {parseStatus === 'error' && (
                      <div className="parse-error-container">
                        <div className="parse-error-message">
                          <span className="error-icon">❌</span>
                          <span>{parseError || 'CV parsing failed'}</span>
                        </div>
                        <div className="parse-error-actions">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleParseCv()}
                          >
                            🔄 Retry
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={handleManualEntry}
                          >
                            Enter Manually
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="no-cv">
                <div className="upload-dropzone" onClick={triggerFileUpload}>
                  <span className="upload-icon">📤</span>
                  <p>Click to upload CV</p>
                  <span className="upload-hint">PDF, DOC, DOCX (max 10MB)</span>
                </div>
              </div>
            )}
          </Card>

          {/* Application Details Card */}
          <Card className="detail-card">
            <h2>Application Details</h2>
            
            <div className="details-grid">
              <div className="detail-item">
                <span className="detail-label">Position Applied</span>
                <span className="detail-value">{candidate.jobTitle || '-'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Branch</span>
                <span className="detail-value">{candidate.branchName || '-'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Source</span>
                <span className="detail-value">{candidate.source || '-'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Current Status</span>
                <Badge variant={STATUS_COLORS[candidate.status] as any}>
                  {candidate.status.replace(/_/g, ' ')}
                </Badge>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column - Sidebar */}
        <div className="candidate-sidebar">
          {/* Quick Actions */}
          <Card className="sidebar-card">
            <h3>Quick Actions</h3>
            <div className="quick-actions">
              <Button variant="outline" fullWidth onClick={() => {
                setNewStatus(candidate.status)
                setShowStatusModal(true)
              }}>
                Change Status
              </Button>
              <Button variant="outline" fullWidth onClick={() => openScheduleModal('interview')}>
                Schedule Interview
              </Button>
              <Button variant="outline" fullWidth onClick={() => openScheduleModal('trial')}>
                Schedule Trial
              </Button>
              <Button variant="outline" fullWidth onClick={openWhatsAppModal}>
                Send WhatsApp
              </Button>
            </div>
          </Card>

          {/* Scheduled Interviews/Trials Card */}
          <Card className="sidebar-card scheduled-appointments-card">
            <h3>📅 Scheduled Appointments</h3>
            {loadingInterviews ? (
              <div className="loading-appointments">
                <Spinner size="sm" />
              </div>
            ) : candidateInterviews.length === 0 ? (
              <div className="no-appointments">
                <p>No scheduled interviews or trials</p>
              </div>
            ) : (
              <div className="appointments-list">
                {candidateInterviews.map((interview: any) => {
                  const scheduledDate = interview.scheduledDate?.toDate?.()
                  const isUpcoming = scheduledDate && scheduledDate > new Date()
                  const isPast = scheduledDate && scheduledDate <= new Date()
                  
                  return (
                    <div 
                      key={interview.id} 
                      className={`appointment-item ${interview.type} ${interview.status} ${isUpcoming ? 'upcoming' : ''} ${isPast ? 'past' : ''}`}
                    >
                      <div className="appointment-type-badge">
                        {interview.type === 'trial' ? '🏥 Trial' : '📅 Interview'}
                      </div>
                      <div className="appointment-details">
                        <div className="appointment-datetime">
                          {scheduledDate ? (
                            <>
                              <span className="appointment-date">
                                {scheduledDate.toLocaleDateString('en-GB', { 
                                  weekday: 'short', 
                                  day: 'numeric', 
                                  month: 'short',
                                  year: 'numeric'
                                })}
                              </span>
                              <span className="appointment-time">
                                {scheduledDate.toLocaleTimeString('en-GB', { 
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                })}
                                {interview.duration && ` (${interview.duration >= 60 ? `${interview.duration / 60}h` : `${interview.duration}m`})`}
                              </span>
                            </>
                          ) : (
                            <span>Date not set</span>
                          )}
                        </div>
                        {interview.branchName && (
                          <div className="appointment-location">
                            📍 {interview.branchName}
                          </div>
                        )}
                        <div className="appointment-status">
                          <span className={`status-badge ${interview.status}`}>
                            {interview.status === 'scheduled' && isUpcoming ? '⏳ Upcoming' :
                             interview.status === 'scheduled' && isPast ? '⚠️ Pending' :
                             interview.status === 'completed' ? '✅ Completed' :
                             interview.status === 'cancelled' ? '❌ Cancelled' :
                             interview.status === 'no_show' ? '🚫 No Show' :
                             interview.status}
                          </span>
                        </div>
                      </div>
                      <button 
                        className="view-appointment-btn"
                        onClick={() => navigate(`/interviews?highlight=${interview.id}`)}
                        title="View in Calendar"
                      >
                        →
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Skills Card */}
          {candidate.skills && candidate.skills.length > 0 && (
            <Card className="sidebar-card">
              <h3>Skills</h3>
              <div className="skills-list">
                {candidate.skills.map((skill, index) => (
                  <span key={index} className="skill-tag">{skill}</span>
                ))}
              </div>
            </Card>
          )}

          {/* Experience Card */}
          <Card className="sidebar-card">
            <h3>Experience</h3>
            <div className="experience-info">
              <div className="exp-item">
                <span className="exp-label">Years of Experience</span>
                <span className="exp-value">
                  {candidate.cvParsedData?.totalYearsExperience ?? candidate.yearsExperience ?? '-'}
                </span>
              </div>
              <div className="exp-item">
                <span className="exp-label">Pharmacy Experience</span>
                <span className="exp-value">
                  {candidate.cvParsedData?.pharmacyYearsExperience != null 
                    ? `${candidate.cvParsedData.pharmacyYearsExperience} years`
                    : candidate.pharmacyExperience === true ? 'Yes' 
                    : candidate.pharmacyExperience === false ? 'No' 
                    : '-'}
                </span>
              </div>
              <div className="exp-item">
                <span className="exp-label">Right to Work</span>
                <span className="exp-value">
                  {candidate.rightToWork === true ? 'Yes' : 
                   candidate.rightToWork === false ? 'No' : '-'}
                </span>
              </div>
            </div>
          </Card>

          {/* CV Summary Card */}
          <Card className="sidebar-card cv-summary-card">
            <h3>CV Summary</h3>
            {candidate.cvParsedData ? (
              <div className="cv-summary">
                {/* AI Indicator */}
                <div className="cv-parse-method">
                  {candidate.cvParsedData.usedAI === true ? (
                    <span className="parse-badge ai">🤖 AI Parsed</span>
                  ) : (
                    <span className="parse-badge regex">📝 Basic Parse</span>
                  )}
                </div>

                {/* Years of Experience */}
                <div className="experience-stats">
                  {candidate.cvParsedData.totalYearsExperience != null && (
                    <div className="stat-item">
                      <span className="stat-value">{candidate.cvParsedData.totalYearsExperience}</span>
                      <span className="stat-label">Years Experience</span>
                    </div>
                  )}
                  {candidate.cvParsedData.pharmacyYearsExperience != null && (
                    <div className="stat-item">
                      <span className="stat-value">{candidate.cvParsedData.pharmacyYearsExperience}</span>
                      <span className="stat-label">Years in Pharmacy</span>
                    </div>
                  )}
                </div>

                {/* Qualifications */}
                {candidate.cvParsedData.qualifications?.length > 0 && (
                  <div className="cv-qualifications">
                    <span className="qual-label">Qualifications:</span>
                    <div className="qual-tags">
                      {candidate.cvParsedData.qualifications.slice(0, 5).map((qual: string, i: number) => (
                        <span key={i} className="qual-tag">{qual}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Confidence Score */}
                {candidate.cvParsedData.confidence?.overall != null && (
                  <div className="confidence-score">
                    <span className="confidence-label">Confidence:</span>
                    <span className={`confidence-value ${candidate.cvParsedData.confidence.overall >= 70 ? 'high' : candidate.cvParsedData.confidence.overall >= 40 ? 'medium' : 'low'}`}>
                      {candidate.cvParsedData.confidence.overall}%
                    </span>
                  </div>
                )}
              </div>
            ) : candidate.cvUrl ? (
              <div className="cv-not-parsed">
                <p>CV not yet parsed</p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleParseCv}
                  disabled={parsing}
                >
                  🤖 Parse CV
                </Button>
              </div>
            ) : (
              <div className="cv-not-uploaded">
                <p>No CV uploaded</p>
              </div>
            )}
          </Card>

          {/* Timestamps Card - Only show if dates exist */}
          {(candidate.createdAt || candidate.updatedAt) && (
            <Card className="sidebar-card">
              <h3>Dates</h3>
              <div className="timestamps">
                {candidate.createdAt && formatDateTime(candidate.createdAt) !== '-' && (
                  <div className="timestamp-item">
                    <span className="timestamp-label">Created</span>
                    <span className="timestamp-value">{formatDateTime(candidate.createdAt)}</span>
                  </div>
                )}
                {candidate.updatedAt && formatDateTime(candidate.updatedAt) !== '-' && (
                  <div className="timestamp-item">
                    <span className="timestamp-label">Last Updated</span>
                    <span className="timestamp-value">{formatDateTime(candidate.updatedAt)}</span>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Application History - Only show if there are linked records */}
      {(linkedCandidates.length > 0 || candidate.applicationHistory?.length > 0 || candidate.duplicateStatus) && (
        <Card className="application-history-card">
          <div className="application-history-header">
            <h2>📋 Application History</h2>
            {candidate.duplicateStatus && (
              <Badge variant={candidate.duplicateStatus === 'primary' ? 'success' : 'info'}>
                {candidate.duplicateStatus === 'primary' ? '🔵 Primary Record' : '🔗 Linked Record'}
              </Badge>
            )}
          </div>
          
          {loadingLinkedCandidates ? (
            <div className="application-history-loading">
              <Spinner size="sm" />
              <span>Loading application history...</span>
            </div>
          ) : (
            <div className="application-history-content">
              {/* Current Application */}
              <div className="application-timeline">
                <div className="application-item current">
                  <div className="application-timeline-dot current" />
                  <div className="application-card">
                    <div className="application-card-header">
                      <span className="application-job">{candidate.jobTitle || 'Position not specified'}</span>
                      <Badge variant={STATUS_COLORS[candidate.status] as any} size="sm">
                        {candidate.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <div className="application-card-details">
                      <span className="application-detail">📍 {candidate.branchName || candidate.location || 'Branch not specified'}</span>
                      <span className="application-detail">📅 {formatDate(candidate.createdAt)}</span>
                      {candidate.source && <span className="application-detail">📥 via {candidate.source}</span>}
                    </div>
                    <div className="application-card-badge">
                      <span className="current-badge">Current Application</span>
                    </div>
                  </div>
                </div>

                {/* Linked Applications */}
                {linkedCandidates.map((linked) => (
                  <div key={linked.id} className="application-item">
                    <div className="application-timeline-dot" />
                    <div 
                      className="application-card clickable"
                      onClick={() => window.open(`/candidates/${linked.id}`, '_blank')}
                      title="Click to view this application"
                    >
                      <div className="application-card-header">
                        <span className="application-job">{linked.jobTitle || 'Position not specified'}</span>
                        <Badge variant={STATUS_COLORS[linked.status] as any} size="sm">
                          {linked.status.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <div className="application-card-details">
                        <span className="application-detail">📍 {linked.branchName || linked.location || 'Branch not specified'}</span>
                        <span className="application-detail">📅 {formatDate(linked.createdAt)}</span>
                        {linked.source && <span className="application-detail">📥 via {linked.source}</span>}
                      </div>
                      <div className="application-card-footer">
                        <span className="view-link">View Application →</span>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Historical Application Records (from applicationHistory array) */}
                {candidate.applicationHistory?.filter(app => 
                  !linkedCandidates.some(lc => lc.id === app.candidateId)
                ).map((app, index) => (
                  <div key={`history-${index}`} className="application-item historical">
                    <div className="application-timeline-dot historical" />
                    <div className="application-card historical">
                      <div className="application-card-header">
                        <span className="application-job">{app.jobTitle || 'Position not specified'}</span>
                        <Badge variant={STATUS_COLORS[app.status] as any} size="sm">
                          {app.status.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <div className="application-card-details">
                        <span className="application-detail">📍 {app.branchName || 'Branch not specified'}</span>
                        <span className="application-detail">📅 {formatDate(app.appliedAt)}</span>
                      </div>
                      {app.outcome && (
                        <div className="application-outcome">
                          <Badge variant={app.outcome === 'hired' ? 'success' : app.outcome === 'rejected' ? 'error' : 'neutral'}>
                            {app.outcome}
                          </Badge>
                          {app.outcomeNotes && <span className="outcome-notes">{app.outcomeNotes}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {linkedCandidates.length === 0 && !candidate.applicationHistory?.length && (
                <p className="no-linked-records">
                  This is the only application record for this candidate.
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Activity Timeline */}
      <Card className="activity-timeline-card">
        <h2>Activity Timeline</h2>
        {loadingActivities ? (
          <div className="activity-loading">
            <Spinner size="sm" />
            <span>Loading activity...</span>
          </div>
        ) : activities.length === 0 ? (
          <div className="activity-empty">
            <p>No activity recorded yet</p>
          </div>
        ) : (
          <div className="activity-list">
            {activities.map((activity) => (
              <div key={activity.id} className="activity-item">
                <div className="activity-icon">
                  {getActivityIcon(activity.action)}
                </div>
                <div className="activity-content">
                  <div className="activity-description">
                    {activity.description}
                  </div>
                  <div className="activity-meta">
                    <span className="activity-user">{activity.userName}</span>
                    <span className="activity-separator">•</span>
                    <span className="activity-time">{formatDateTime(activity.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Status Change Modal */}
      <Modal
        isOpen={showStatusModal}
        onClose={() => {
          setShowStatusModal(false)
          setNewStatus('')
        }}
        title="Change Candidate Status"
      >
        <div className="status-modal-content">
          <p>
            Update status for <strong>{candidate.firstName} {candidate.lastName}</strong>
          </p>
          <div className="status-select">
            <label>New Status</label>
            <Select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as CandidateStatus)}
              options={STATUS_OPTIONS}
            />
          </div>
          <div className="modal-actions">
            <Button 
              variant="secondary" 
              onClick={() => {
                setShowStatusModal(false)
                setNewStatus('')
              }}
            >
              Cancel
            </Button>
            <Button 
              variant="primary" 
              onClick={handleStatusChange}
              disabled={!newStatus || newStatus === candidate.status || updating}
            >
              {updating ? 'Updating...' : 'Update Status'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Job Assignment Modal */}
      <Modal
        isOpen={showJobAssignModal}
        onClose={() => setShowJobAssignModal(false)}
        title="Assign to Job"
        size="md"
      >
        <div className="job-assign-modal">
          <p className="modal-description">
            Select an active job posting to assign this candidate to.
          </p>
          
          {loadingJobs ? (
            <div className="loading-jobs">
              <Spinner size="sm" />
              <span>Loading available jobs...</span>
            </div>
          ) : jobs.length === 0 ? (
            <div className="no-jobs-available">
              <p>No active jobs available.</p>
              <Button variant="outline" onClick={() => navigate('/jobs')}>
                Create a Job
              </Button>
            </div>
          ) : (
            <>
              <div className="job-select-container">
                <label htmlFor="job-select">Select Job</label>
                <Select
                  id="job-select"
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  options={[
                    { value: '', label: 'Choose a job...' },
                    ...jobs.map(job => ({
                      value: job.id,
                      label: `${job.title} - ${job.branchName} (${job.employmentType || 'Full-time'})`
                    }))
                  ]}
                />
              </div>

              {selectedJobId && (
                <div className="selected-job-preview">
                  {(() => {
                    const job = jobs.find(j => j.id === selectedJobId)
                    if (!job) return null
                    return (
                      <>
                        <h4>{job.title}</h4>
                        <div className="job-preview-details">
                          <span>📍 {job.branchName}</span>
                          <span>💼 {job.employmentType || 'Full-time'}</span>
                          {job.salaryMin && job.salaryMax && (
                            <span>💰 £{(job.salaryMin / 1000).toFixed(0)}k - £{(job.salaryMax / 1000).toFixed(0)}k</span>
                          )}
                          {job.candidateCount !== undefined && (
                            <span>👥 {job.candidateCount} candidate{job.candidateCount !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                      </>
                    )
                  })()}
                </div>
              )}
            </>
          )}

          <div className="modal-actions">
            <Button variant="outline" onClick={() => setShowJobAssignModal(false)}>
              Cancel
            </Button>
            <Button 
              variant="primary" 
              onClick={handleAssignJob}
              disabled={!selectedJobId || assigningJob}
            >
              {assigningJob ? 'Assigning...' : 'Assign to Job'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Candidate Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={closeEditModal}
        title="Edit Candidate"
      >
        <div className="edit-candidate-form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="edit-firstName">First Name *</label>
              <Input
                id="edit-firstName"
                value={editForm.firstName}
                onChange={(e) => handleEditFormChange('firstName', e.target.value)}
                placeholder="Enter first name"
                error={formErrors.firstName}
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-lastName">Last Name *</label>
              <Input
                id="edit-lastName"
                value={editForm.lastName}
                onChange={(e) => handleEditFormChange('lastName', e.target.value)}
                placeholder="Enter last name"
                error={formErrors.lastName}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="edit-email">Email Address *</label>
              <Input
                id="edit-email"
                type="email"
                value={editForm.email}
                onChange={(e) => handleEditFormChange('email', e.target.value)}
                placeholder="candidate@example.com"
                error={formErrors.email}
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-phone">Phone Number *</label>
              <Input
                id="edit-phone"
                type="tel"
                value={editForm.phone}
                onChange={(e) => handleEditFormChange('phone', e.target.value)}
                placeholder="07123 456 789"
                error={formErrors.phone}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="edit-address">Address</label>
            <Input
              id="edit-address"
              value={editForm.address}
              onChange={(e) => handleEditFormChange('address', e.target.value)}
              placeholder="Enter address"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="edit-postcode">Postcode</label>
              <Input
                id="edit-postcode"
                value={editForm.postcode}
                onChange={(e) => handleEditFormChange('postcode', e.target.value)}
                placeholder="SW1A 1AA"
                error={formErrors.postcode}
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-source">Source</label>
              <Select
                id="edit-source"
                value={editForm.source}
                onChange={(e) => handleEditFormChange('source', e.target.value)}
                options={SOURCE_OPTIONS}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="edit-jobTitle">Job Title / Position Applied For</label>
            <Input
              id="edit-jobTitle"
              value={editForm.jobTitle}
              onChange={(e) => handleEditFormChange('jobTitle', e.target.value)}
              placeholder="e.g. Pharmacist, Pharmacy Technician"
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-notes">Notes</label>
            <Textarea
              id="edit-notes"
              value={editForm.notes}
              onChange={(e) => handleEditFormChange('notes', e.target.value)}
              placeholder="Any additional notes about this candidate..."
              rows={3}
            />
          </div>

          <div className="modal-actions">
            <Button variant="secondary" onClick={closeEditModal}>
              Cancel
            </Button>
            <Button 
              variant="primary" 
              onClick={handleSaveEdit}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Candidate"
      >
        <div className="delete-modal-content">
          <div className="delete-warning">
            <span className="warning-icon">⚠️</span>
            <p>
              Are you sure you want to delete <strong>{candidate.firstName} {candidate.lastName}</strong>?
            </p>
          </div>
          <p className="delete-description">
            This action cannot be undone. All candidate data including their application history will be permanently removed.
          </p>
          <div className="modal-actions">
            <Button 
              variant="secondary" 
              onClick={() => setShowDeleteModal(false)}
            >
              Cancel
            </Button>
            <Button 
              variant="danger" 
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete Candidate'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Parsed CV Modal */}
      <Modal
        isOpen={showParsedModal}
        onClose={() => setShowParsedModal(false)}
        title="CV Parsed Successfully"
        size="lg"
      >
        {parsedData && (
          <ParsedCVModal
            parsedData={parsedData}
            currentCandidate={candidate}
            onApply={handleApplyParsedData}
            onCancel={() => setShowParsedModal(false)}
            saving={saving}
          />
        )}
      </Modal>

      {/* WhatsApp Modal */}
      <Modal
        isOpen={showWhatsAppModal}
        onClose={() => setShowWhatsAppModal(false)}
        title="Send WhatsApp Message"
        size="lg"
      >
        <div className="whatsapp-modal">
          {/* Candidate info header */}
          <div className="whatsapp-recipient">
            <div className="recipient-avatar">
              {candidate?.firstName?.[0]}{candidate?.lastName?.[0]}
            </div>
            <div className="recipient-info">
              <span className="recipient-name">{candidate?.firstName} {candidate?.lastName}</span>
              <span className="recipient-phone">{candidate?.phone}</span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="whatsapp-quick-actions">
            <h4>Quick Actions</h4>
            <div className="quick-action-buttons">
              <button 
                className="quick-action-btn"
                onClick={handleQuickInterviewInvite}
                disabled={generatingBookingLink}
              >
                <span className="quick-action-icon">📅</span>
                <span>{generatingBookingLink ? 'Generating link...' : 'Invite to Interview'}</span>
              </button>
              <button 
                className="quick-action-btn"
                onClick={handleQuickTrialInvite}
                disabled={generatingBookingLink}
              >
                <span className="quick-action-icon">📋</span>
                <span>{generatingBookingLink ? 'Generating link...' : 'Invite to Trial'}</span>
              </button>
            </div>
          </div>

          <div className="whatsapp-divider">
            <span>or choose a template</span>
          </div>

          {/* Booking link generated indicator */}
          {generatedBookingLink && (
            <div className="booking-link-generated">
              ✅ Booking link generated and ready to send
            </div>
          )}

          {/* Template Selection */}
          <div className="template-selection">
            <div className="template-header">
              <h4>Choose a template</h4>
              <Select
                value={templateCategoryFilter}
                onChange={(e) => setTemplateCategoryFilter(e.target.value as TemplateCategory | 'all')}
                options={[
                  { value: 'all', label: 'All Categories' },
                  ...TEMPLATE_CATEGORIES.map(c => ({ value: c.value, label: c.label }))
                ]}
              />
            </div>

            {loadingTemplates ? (
              <div className="template-loading">
                <Spinner size="md" />
              </div>
            ) : (
              <div className="template-grid">
                {filteredWhatsappTemplates.length === 0 ? (
                  <p className="no-templates">No templates available in this category.</p>
                ) : (
                  filteredWhatsappTemplates.map(template => {
                    const category = TEMPLATE_CATEGORIES.find(c => c.value === template.category)
                    return (
                      <button
                        key={template.id}
                        className={`template-option ${selectedTemplate?.id === template.id ? 'selected' : ''}`}
                        onClick={() => handleSelectTemplate(template)}
                      >
                        <span 
                          className="template-option-category"
                          style={{ backgroundColor: `${category?.color}20`, color: category?.color }}
                        >
                          {category?.label}
                        </span>
                        <span className="template-option-name">{template.name}</span>
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>

          {/* Message Preview/Edit */}
          {messageContent && (
            <div className="message-section">
              <div className="message-header">
                <h4>Message</h4>
                <div className="message-actions">
                  <button 
                    className={`message-action-btn ${isEditingMessage ? 'active' : ''}`}
                    onClick={() => setIsEditingMessage(!isEditingMessage)}
                  >
                    {isEditingMessage ? '👁 Preview' : '✏️ Edit'}
                  </button>
                </div>
              </div>

              {isEditingMessage ? (
                <Textarea
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  rows={10}
                  className="message-editor"
                />
              ) : (
                <div className="message-preview">
                  {messageContent.split('\n').map((line, i) => (
                    <p key={i}>
                      {line ? renderLineWithPlaceholders(line) : '\u00A0'}
                    </p>
                  ))}
                </div>
              )}

              {/* Unfilled placeholders warning */}
              {messageContent.includes('{{') && (
                <div className="unfilled-warning">
                  ⚠️ Some placeholders couldn't be filled automatically. Please edit the message to complete them.
                </div>
              )}
            </div>
          )}

          {/* Modal Actions */}
          <div className="whatsapp-modal-actions">
            <Button variant="secondary" onClick={() => setShowWhatsAppModal(false)}>
              Cancel
            </Button>
            <Button 
              variant="secondary" 
              onClick={handleCopyMessage}
              disabled={!messageContent}
            >
              {messageCopied ? '✓ Copied!' : '📋 Copy'}
            </Button>
            <Button 
              variant="primary" 
              onClick={handleSendWhatsApp}
              disabled={!messageContent || !candidate?.phone}
            >
              💬 Send via WhatsApp
            </Button>
          </div>
        </div>
      </Modal>

      
      {/* Direct Scheduling Modal */}
      <Modal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        title={`Schedule ${scheduleType === 'interview' ? 'Interview' : 'Trial'}`}
        size="lg"
      >
        <div className="schedule-modal" style={{ minHeight: '500px' }}>
          <div style={{ marginBottom: '16px', padding: '12px', background: '#f5f5f5', borderRadius: '8px' }}>
            <p style={{ margin: '4px 0' }}><strong>Candidate:</strong> {candidate?.firstName} {candidate?.lastName}</p>
            {candidate?.email && <p style={{ margin: '4px 0' }}><strong>Email:</strong> {candidate.email}</p>}
            {candidate?.jobTitle && <p style={{ margin: '4px 0' }}><strong>Position:</strong> {candidate.jobTitle}</p>}
          </div>

          {scheduleError && <div style={{ padding: '12px', background: '#fee', color: '#c00', borderRadius: '8px', marginBottom: '16px' }}>{scheduleError}</div>}

          {loadingAvailability ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Spinner size="md" />
              <p>Loading availability...</p>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
              {/* Calendar */}
              <div style={{ flex: '1', minWidth: '280px' }}>
                <h4 style={{ marginBottom: '12px' }}>Select a Date</h4>
                <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))} style={{ padding: '8px', cursor: 'pointer', border: '1px solid #ddd', borderRadius: '4px', background: 'white' }}>&lt;</button>
                    <strong>{currentMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</strong>
                    <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))} style={{ padding: '8px', cursor: 'pointer', border: '1px solid #ddd', borderRadius: '4px', background: 'white' }}>&gt;</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center' }}>
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                      <div key={i} style={{ padding: '8px', fontWeight: 'bold', color: '#666' }}>{d}</div>
                    ))}
                    {(() => {
                      const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
                      const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)
                      const days = []
                      for (let i = 0; i < firstDay.getDay(); i++) {
                        days.push(<div key={'empty-' + i} />)
                      }
                      for (let d = 1; d <= lastDay.getDate(); d++) {
                        const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d)
                        const isAvailable = availableDates.some(ad => ad.toDateString() === date.toDateString())
                        const isSelected = selectedScheduleDate?.toDateString() === date.toDateString()
                        const isPast = date < new Date(new Date().setHours(0, 0, 0, 0))
                        days.push(
                          <button
                            key={d}
                            onClick={() => isAvailable && !isPast && setSelectedScheduleDate(date)}
                            disabled={!isAvailable || isPast}
                            style={{
                              padding: '8px',
                              border: isSelected ? '2px solid #0d9488' : '1px solid transparent',
                              borderRadius: '4px',
                              background: isSelected ? '#0d9488' : isAvailable && !isPast ? '#e6fffa' : '#f5f5f5',
                              color: isSelected ? 'white' : isAvailable && !isPast ? '#0d9488' : '#999',
                              cursor: isAvailable && !isPast ? 'pointer' : 'not-allowed',
                              fontWeight: isSelected ? 'bold' : 'normal'
                            }}
                          >
                            {d}
                          </button>
                        )
                      }
                      return days
                    })()}
                  </div>
                </div>
              </div>

              {/* Time Slots */}
              <div style={{ flex: '1', minWidth: '200px' }}>
                <h4 style={{ marginBottom: '12px' }}>
                  {selectedScheduleDate ? `Available Times - ${selectedScheduleDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}` : 'Select a date first'}
                </h4>
                {loadingSlots ? (
                  <div style={{ textAlign: 'center', padding: '20px' }}><Spinner size="sm" /></div>
                ) : selectedScheduleDate ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                    {timeSlots.filter(s => s.available).length === 0 ? (
                      <p style={{ color: '#666' }}>No available slots for this date</p>
                    ) : (
                      timeSlots.filter(s => s.available).map(slot => (
                        <button
                          key={slot.time}
                          onClick={() => setSelectedTimeSlot(slot.time)}
                          style={{
                            padding: '12px 16px',
                            border: selectedTimeSlot === slot.time ? '2px solid #0d9488' : '1px solid #ddd',
                            borderRadius: '6px',
                            background: selectedTimeSlot === slot.time ? '#0d9488' : 'white',
                            color: selectedTimeSlot === slot.time ? 'white' : '#333',
                            cursor: 'pointer',
                            textAlign: 'left'
                          }}
                        >
                          {slot.time} - {(() => {
                            const [h, m] = slot.time.split(':').map(Number)
                            const endMinutes = h * 60 + m + scheduleDuration
                            return Math.floor(endMinutes / 60).toString().padStart(2, '0') + ':' + (endMinutes % 60).toString().padStart(2, '0')
                          })()}
                        </button>
                      ))
                    )}
                  </div>
                ) : (
                  <p style={{ color: '#666', padding: '20px', background: '#f9f9f9', borderRadius: '8px' }}>Please select a date from the calendar</p>
                )}
              </div>
            </div>
          )}

          {/* Additional Options */}
          {selectedScheduleDate && selectedTimeSlot && (
            <div style={{ marginTop: '24px', padding: '16px', background: '#f9f9f9', borderRadius: '8px' }}>
              <div style={{ marginBottom: '16px' }}>
                <p style={{ margin: '0 0 8px 0' }}><strong>Duration:</strong> {scheduleDuration} minutes</p>
              </div>
              
              {scheduleType === 'trial' && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Branch *</label>
                  <select value={selectedBranchId} onChange={(e) => setSelectedBranchId(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}>
                    <option value="">Select a branch...</option>
                    {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                  </select>
                </div>
              )}
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Notes (optional)</label>
                <textarea value={scheduleNotes} onChange={(e) => setScheduleNotes(e.target.value)} placeholder="Any additional notes..." rows={2} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }} />
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" id="sendConfirmation" checked={sendScheduleConfirmation} onChange={(e) => setSendScheduleConfirmation(e.target.checked)} />
                <label htmlFor="sendConfirmation">Send confirmation email to candidate</label>
              </div>
              
              {scheduleType === 'interview' && (
                <p style={{ fontSize: '14px', color: '#666', margin: '12px 0 0 0' }}>📅 A Microsoft Teams meeting will be created and added to your calendar</p>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
            <Button variant="outline" onClick={() => setShowScheduleModal(false)} disabled={scheduling}>Cancel</Button>
            <Button 
              variant="primary" 
              onClick={handleDirectSchedule} 
              disabled={scheduling || !selectedScheduleDate || !selectedTimeSlot || (scheduleType === 'trial' && !selectedBranchId)}
            >
              {scheduling ? 'Scheduling...' : `Schedule ${scheduleType === 'interview' ? 'Interview' : 'Trial'}`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ============================================================================
// PARSED CV MODAL COMPONENT
// ============================================================================

interface ParsedCVModalProps {
  parsedData: any
  currentCandidate: Candidate
  onApply: (fields: string[]) => void
  onCancel: () => void
  saving: boolean
}

function ParsedCVModal({ parsedData, currentCandidate, onApply, onCancel, saving }: ParsedCVModalProps) {
  const [selectedFields, setSelectedFields] = useState<string[]>([
    'firstName', 'lastName', 'email', 'phone', 'address', 'postcode',
    'skills', 'qualifications', 'experience', 'education'
  ])

  const toggleField = (field: string) => {
    setSelectedFields(prev => 
      prev.includes(field) 
        ? prev.filter(f => f !== field)
        : [...prev, field]
    )
  }

  const getConfidenceColor = (score: number) => {
    if (score >= 80) return 'confidence-high'
    if (score >= 50) return 'confidence-medium'
    return 'confidence-low'
  }

  const renderFieldRow = (
    field: string, 
    label: string, 
    parsedValue: any, 
    currentValue: any,
    confidence?: number
  ) => {
    const hasValue = parsedValue !== null && parsedValue !== undefined && parsedValue !== ''
    const isDifferent = hasValue && parsedValue !== currentValue
    
    if (!hasValue) return null

    return (
      <div key={field} className="parsed-field-row">
        <div className="parsed-field-checkbox">
          <input
            type="checkbox"
            id={`field-${field}`}
            checked={selectedFields.includes(field)}
            onChange={() => toggleField(field)}
          />
        </div>
        <div className="parsed-field-content">
          <label htmlFor={`field-${field}`} className="parsed-field-label">
            {label}
            {confidence !== undefined && (
              <span className={`confidence-badge ${getConfidenceColor(confidence)}`}>
                {confidence}%
              </span>
            )}
          </label>
          <div className="parsed-field-values">
            <div className="parsed-value">
              <span className="value-label">Parsed:</span>
              <span className="value-text">{String(parsedValue)}</span>
            </div>
            {currentValue && isDifferent && (
              <div className="current-value">
                <span className="value-label">Current:</span>
                <span className="value-text">{String(currentValue)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="parsed-cv-modal">
      <div className="parsed-cv-header">
        <div className="overall-confidence">
          <span>Overall Confidence:</span>
          <span className={`confidence-score ${getConfidenceColor(parsedData.confidence.overall)}`}>
            {parsedData.confidence.overall}%
          </span>
        </div>
        <p className="parsed-cv-description">
          Select the fields you want to apply to this candidate's profile.
        </p>
      </div>

      <div className="parsed-fields-list">
        {renderFieldRow('firstName', 'First Name', parsedData.firstName, currentCandidate.firstName, parsedData.confidence.firstName)}
        {renderFieldRow('lastName', 'Last Name', parsedData.lastName, currentCandidate.lastName, parsedData.confidence.lastName)}
        {renderFieldRow('email', 'Email', parsedData.email, currentCandidate.email, parsedData.confidence.email)}
        {renderFieldRow('phone', 'Phone', parsedData.phone, currentCandidate.phone, parsedData.confidence.phone)}
        {renderFieldRow('address', 'Address', parsedData.address, currentCandidate.address)}
        {renderFieldRow('postcode', 'Postcode', parsedData.postcode, currentCandidate.postcode)}
        
        {parsedData.qualifications?.length > 0 && (
          <div className="parsed-field-row">
            <div className="parsed-field-checkbox">
              <input
                type="checkbox"
                id="field-qualifications"
                checked={selectedFields.includes('qualifications')}
                onChange={() => toggleField('qualifications')}
              />
            </div>
            <div className="parsed-field-content">
              <label htmlFor="field-qualifications" className="parsed-field-label">
                Qualifications
              </label>
              <div className="parsed-tags">
                {parsedData.qualifications.map((q: string, i: number) => (
                  <span key={i} className="parsed-tag qualification-tag">{q}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {parsedData.skills?.length > 0 && (
          <div className="parsed-field-row">
            <div className="parsed-field-checkbox">
              <input
                type="checkbox"
                id="field-skills"
                checked={selectedFields.includes('skills')}
                onChange={() => toggleField('skills')}
              />
            </div>
            <div className="parsed-field-content">
              <label htmlFor="field-skills" className="parsed-field-label">
                Skills
              </label>
              <div className="parsed-tags">
                {parsedData.skills.slice(0, 10).map((s: string, i: number) => (
                  <span key={i} className="parsed-tag skill-tag">{s}</span>
                ))}
                {parsedData.skills.length > 10 && (
                  <span className="parsed-tag more-tag">+{parsedData.skills.length - 10} more</span>
                )}
              </div>
            </div>
          </div>
        )}

        {parsedData.experience?.length > 0 && (
          <div className="parsed-field-row">
            <div className="parsed-field-checkbox">
              <input
                type="checkbox"
                id="field-experience"
                checked={selectedFields.includes('experience')}
                onChange={() => toggleField('experience')}
              />
            </div>
            <div className="parsed-field-content">
              <label htmlFor="field-experience" className="parsed-field-label">
                Experience ({parsedData.experience.length} positions)
              </label>
              <div className="parsed-experience">
                {parsedData.experience.slice(0, 3).map((exp: any, i: number) => (
                  <div key={i} className="experience-item">
                    <strong>{exp.title}</strong> at {exp.company}
                    {exp.current && <span className="current-badge">Current</span>}
                  </div>
                ))}
                {parsedData.experience.length > 3 && (
                  <span className="more-text">+{parsedData.experience.length - 3} more positions</span>
                )}
              </div>
            </div>
          </div>
        )}

        {parsedData.education?.length > 0 && (
          <div className="parsed-field-row">
            <div className="parsed-field-checkbox">
              <input
                type="checkbox"
                id="field-education"
                checked={selectedFields.includes('education')}
                onChange={() => toggleField('education')}
              />
            </div>
            <div className="parsed-field-content">
              <label htmlFor="field-education" className="parsed-field-label">
                Education ({parsedData.education.length} entries)
              </label>
              <div className="parsed-education">
                {parsedData.education.map((edu: any, i: number) => (
                  <div key={i} className="education-item">
                    <strong>{edu.qualification}</strong> - {edu.institution}
                    {edu.year && <span className="year-badge">{edu.year}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="modal-actions">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button 
          variant="primary" 
          onClick={() => onApply(selectedFields)}
          disabled={saving || selectedFields.length === 0}
        >
          {saving ? 'Applying...' : `Apply ${selectedFields.length} Fields`}
        </Button>
      </div>
    </div>
  )
}

export default CandidateDetail

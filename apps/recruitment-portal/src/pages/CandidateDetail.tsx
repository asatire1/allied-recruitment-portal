import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc, updateDoc, deleteDoc, addDoc, collection, query, where, orderBy, getDocs, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { getFirebaseDb, getFirebaseStorage, COLLECTIONS, getCvPath } from '@allied/shared-lib'
import type { Candidate, CandidateStatus, ActivityAction, ActivityLog } from '@allied/shared-lib'
import { Card, Badge, Button, Spinner, Modal, Select, Input, Textarea } from '@allied/shared-ui'
import { useAuth } from '../contexts/AuthContext'
import './CandidateDetail.css'

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
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const formatDateTime = (timestamp: any): string => {
  if (!timestamp) return '-'
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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

// Normalize UK phone number
const normalizePhone = (phone: string): string => {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('44') && digits.length > 10) {
    digits = '0' + digits.slice(2)
  }
  return digits
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

  // Activity timeline
  const [activities, setActivities] = useState<ActivityLog[]>([])
  const [loadingActivities, setLoadingActivities] = useState(false)

  const db = getFirebaseDb()
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
      const activityData = {
        entityType: 'candidate',
        entityId,
        action,
        description,
        previousValue,
        newValue,
        userId: user?.id || '',
        userName: user?.displayName || user?.email || 'Unknown',
        createdAt: serverTimestamp(),
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

  // Open WhatsApp
  const openWhatsApp = () => {
    if (!candidate?.phone) return
    const phone = candidate.phone.replace(/\D/g, '')
    // Convert UK format to international
    const intlPhone = phone.startsWith('0') ? '44' + phone.slice(1) : phone
    window.open(`https://wa.me/${intlPhone}`, '_blank')
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
              <Button variant="outline" size="sm" onClick={openWhatsApp}>
                💬 WhatsApp
              </Button>
            </div>
          </Card>

          {/* Job Details Card */}
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
            
            {uploading ? (
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

          {/* Notes Card */}
          <Card className="detail-card">
            <h2>Notes</h2>
            {candidate.notes ? (
              <div className="notes-content">
                <p>{candidate.notes}</p>
              </div>
            ) : (
              <div className="no-notes">
                <p>No notes added yet</p>
              </div>
            )}
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
              <Button variant="outline" fullWidth>
                Schedule Interview
              </Button>
              <Button variant="outline" fullWidth>
                Schedule Trial
              </Button>
              <Button variant="outline" fullWidth onClick={openWhatsApp}>
                Send WhatsApp
              </Button>
            </div>
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
                <span className="exp-value">{candidate.yearsExperience ?? '-'}</span>
              </div>
              <div className="exp-item">
                <span className="exp-label">Pharmacy Experience</span>
                <span className="exp-value">
                  {candidate.pharmacyExperience === true ? 'Yes' : 
                   candidate.pharmacyExperience === false ? 'No' : '-'}
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

          {/* Timestamps Card */}
          <Card className="sidebar-card">
            <h3>Dates</h3>
            <div className="timestamps">
              <div className="timestamp-item">
                <span className="timestamp-label">Created</span>
                <span className="timestamp-value">{formatDateTime(candidate.createdAt)}</span>
              </div>
              <div className="timestamp-item">
                <span className="timestamp-label">Last Updated</span>
                <span className="timestamp-value">{formatDateTime(candidate.updatedAt)}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

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
    </div>
  )
}

export default CandidateDetail

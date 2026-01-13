// ============================================================================
// useCVOperations Hook
// Handles CV upload, parsing, and deletion
// Location: apps/recruitment-portal/src/hooks/useCVOperations.ts
// ============================================================================

import { useState, useCallback } from 'react'
import { doc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { httpsCallable } from 'firebase/functions'
import { 
  getFirebaseDb, 
  getFirebaseStorage, 
  getFirebaseFunctions,
  COLLECTIONS, 
  getCvPath 
} from '@allied/shared-lib'
import type { Candidate, ActivityAction } from '@allied/shared-lib'

// ============================================================================
// TYPES
// ============================================================================

type ParseStatus = 'idle' | 'success' | 'error' | 'partial'

interface UseCVOperationsReturn {
  // Upload state
  uploading: boolean
  uploadProgress: string
  
  // Parse state
  parsing: boolean
  parseStatus: ParseStatus
  parsedData: any
  parseError: string | null
  
  // Actions
  handleCvUpload: (file: File) => Promise<void>
  handleParseCv: () => Promise<void>
  handleDeleteCv: () => Promise<void>
  handleApplyParsedData: (fieldsToApply: string[]) => Promise<void>
  
  // Modal control
  showParsedModal: boolean
  setShowParsedModal: (show: boolean) => void
  
  // Reset
  resetParseState: () => void
}

interface UseCVOperationsProps {
  candidate: Candidate | null
  onCandidateUpdated: (updates: Partial<Candidate>) => void
  onLogActivity: (
    entityId: string,
    action: ActivityAction,
    description: string,
    previousValue?: Record<string, unknown>,
    newValue?: Record<string, unknown>
  ) => Promise<void>
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_PARSE_RETRIES = 3

// ============================================================================
// HELPERS
// ============================================================================

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

// ============================================================================
// HOOK
// ============================================================================

export function useCVOperations({ 
  candidate, 
  onCandidateUpdated,
  onLogActivity 
}: UseCVOperationsProps): UseCVOperationsReturn {
  const db = getFirebaseDb()
  const storage = getFirebaseStorage()
  
  // Upload state
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  
  // Parse state
  const [parsing, setParsing] = useState(false)
  const [parseStatus, setParseStatus] = useState<ParseStatus>('idle')
  const [parsedData, setParsedData] = useState<any>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [parseRetryCount, setParseRetryCount] = useState(0)
  const [showParsedModal, setShowParsedModal] = useState(false)

  // Reset parse state
  const resetParseState = useCallback(() => {
    setParseStatus('idle')
    setParsedData(null)
    setParseError(null)
    setParseRetryCount(0)
  }, [])

  // Handle CV upload
  const handleCvUpload = useCallback(async (file: File) => {
    if (!candidate) return

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
      await onLogActivity(
        candidate.id,
        'cv_uploaded',
        `CV uploaded: ${file.name}`,
        candidate.cvUrl ? { cvFileName: candidate.cvFileName } : undefined,
        { cvFileName: file.name }
      )

      // Update local state
      onCandidateUpdated({
        cvUrl: downloadUrl,
        cvFileName: file.name,
        cvStoragePath: storagePath,
      })

      setUploadProgress('')
    } catch (err) {
      console.error('Error uploading CV:', err)
      alert('Failed to upload CV. Please try again.')
    } finally {
      setUploading(false)
      setUploadProgress('')
    }
  }, [candidate, db, storage, onCandidateUpdated, onLogActivity])

  // Handle CV parsing
  const handleParseCv = useCallback(async (retryAttempt = 0) => {
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
        await onLogActivity(
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
  }, [candidate, onLogActivity, parseStatus])

  // Apply parsed data to candidate
  const handleApplyParsedData = useCallback(async (fieldsToApply: string[]) => {
    if (!candidate || !parsedData) return

    try {
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

      // Store full parsed data for reference
      const cleanParsedData = JSON.parse(JSON.stringify(parsedData, (key, value) => 
        value === null || value === undefined ? undefined : value
      ))
      updates.cvParsedData = cleanParsedData
      updates.cvParsedAt = serverTimestamp()

      const candidateRef = doc(db, COLLECTIONS.CANDIDATES, candidate.id)
      await updateDoc(candidateRef, updates)

      // Log the update
      await onLogActivity(
        candidate.id,
        'updated',
        `Applied ${fieldsToApply.length} fields from parsed CV`,
        undefined,
        { fields: fieldsToApply }
      )

      // Refetch candidate to get updated data
      const refreshedSnap = await getDoc(candidateRef)
      if (refreshedSnap.exists()) {
        onCandidateUpdated({ id: refreshedSnap.id, ...refreshedSnap.data() } as Candidate)
      }
      
      setShowParsedModal(false)
      setParsedData(null)
    } catch (err) {
      console.error('Error applying parsed data:', err)
      alert('Failed to apply parsed data. Please try again.')
    }
  }, [candidate, parsedData, db, onLogActivity, onCandidateUpdated])

  // Delete CV
  const handleDeleteCv = useCallback(async () => {
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
      await onLogActivity(
        candidate.id,
        'updated',
        `CV deleted: ${candidate.cvFileName}`,
        { cvFileName: candidate.cvFileName },
        undefined
      )

      // Update local state
      onCandidateUpdated({
        cvUrl: undefined,
        cvFileName: undefined,
        cvStoragePath: undefined,
      })
    } catch (err) {
      console.error('Error deleting CV:', err)
      alert('Failed to delete CV. Please try again.')
    } finally {
      setUploading(false)
      setUploadProgress('')
    }
  }, [candidate, db, storage, onLogActivity, onCandidateUpdated])

  return {
    uploading,
    uploadProgress,
    parsing,
    parseStatus,
    parsedData,
    parseError,
    handleCvUpload,
    handleParseCv,
    handleDeleteCv,
    handleApplyParsedData,
    showParsedModal,
    setShowParsedModal,
    resetParseState,
  }
}

export default useCVOperations

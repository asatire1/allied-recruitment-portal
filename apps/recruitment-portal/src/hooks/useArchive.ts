/**
 * useArchive Hook
 * 
 * Provides archive/restore/delete functionality for candidates
 */

import { useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { getFirebaseFunctions } from '@allied/shared-lib'

interface ArchiveResult {
  success: boolean
  message: string
  interviewsCancelled?: number
  bookingLinksRevoked?: number
}

interface RestoreResult {
  success: boolean
  message: string
}

interface DeleteResult {
  success: boolean
  message: string
  interviewsDeleted?: number
  bookingLinksDeleted?: number
}

export function useArchive() {
  const [archiving, setArchiving] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const functions = getFirebaseFunctions()

  const archiveCandidate = async (candidateId: string, reason?: string): Promise<ArchiveResult> => {
    setArchiving(true)
    setError(null)
    
    try {
      const archiveFn = httpsCallable<{ candidateId: string; reason?: string }, ArchiveResult>(
        functions, 
        'archiveCandidate'
      )
      const result = await archiveFn({ candidateId, reason })
      return result.data
    } catch (err: any) {
      const message = err.message || 'Failed to archive candidate'
      setError(message)
      throw new Error(message)
    } finally {
      setArchiving(false)
    }
  }

  const restoreCandidate = async (candidateId: string): Promise<RestoreResult> => {
    setRestoring(true)
    setError(null)
    
    try {
      const restoreFn = httpsCallable<{ candidateId: string }, RestoreResult>(
        functions, 
        'restoreCandidate'
      )
      const result = await restoreFn({ candidateId })
      return result.data
    } catch (err: any) {
      const message = err.message || 'Failed to restore candidate'
      setError(message)
      throw new Error(message)
    } finally {
      setRestoring(false)
    }
  }

  const permanentlyDeleteCandidate = async (candidateId: string): Promise<DeleteResult> => {
    setDeleting(true)
    setError(null)
    
    try {
      const deleteFn = httpsCallable<{ candidateId: string; confirmDelete: boolean }, DeleteResult>(
        functions, 
        'permanentlyDeleteCandidate'
      )
      const result = await deleteFn({ candidateId, confirmDelete: true })
      return result.data
    } catch (err: any) {
      const message = err.message || 'Failed to delete candidate'
      setError(message)
      throw new Error(message)
    } finally {
      setDeleting(false)
    }
  }

  return {
    archiveCandidate,
    restoreCandidate,
    permanentlyDeleteCandidate,
    archiving,
    restoring,
    deleting,
    error,
    clearError: () => setError(null),
  }
}

export default useArchive

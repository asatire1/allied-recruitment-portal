// ============================================================================
// useCandidateData Hook
// Handles fetching candidate data, activities, and linked candidates
// Location: apps/recruitment-portal/src/hooks/useCandidateData.ts
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs,
  addDoc,
  serverTimestamp
} from 'firebase/firestore'
import { getFirebaseDb, COLLECTIONS } from '@allied/shared-lib'
import type { Candidate, ActivityLog, ActivityAction } from '@allied/shared-lib'

// ============================================================================
// TYPES
// ============================================================================

interface UseCandidateDataReturn {
  // Candidate data
  candidate: Candidate | null
  setCandidate: React.Dispatch<React.SetStateAction<Candidate | null>>
  loading: boolean
  error: string | null
  
  // Activities
  activities: ActivityLog[]
  loadingActivities: boolean
  logActivity: (
    entityId: string,
    action: ActivityAction,
    description: string,
    previousValue?: Record<string, unknown>,
    newValue?: Record<string, unknown>
  ) => Promise<void>
  
  // Linked candidates
  linkedCandidates: Candidate[]
  loadingLinkedCandidates: boolean
  
  // Latest interview (for Copilot)
  latestInterview: any | null
  
  // Refetch
  refetchCandidate: () => Promise<void>
}

interface UseCandidateDataProps {
  candidateId: string | undefined
  userId: string
  userName: string
}

// ============================================================================
// HOOK
// ============================================================================

export function useCandidateData({ 
  candidateId, 
  userId, 
  userName 
}: UseCandidateDataProps): UseCandidateDataReturn {
  const db = getFirebaseDb()
  
  // Candidate state
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Activities state
  const [activities, setActivities] = useState<ActivityLog[]>([])
  const [loadingActivities, setLoadingActivities] = useState(false)
  
  // Linked candidates state
  const [linkedCandidates, setLinkedCandidates] = useState<Candidate[]>([])
  const [loadingLinkedCandidates, setLoadingLinkedCandidates] = useState(false)
  
  // Latest interview state
  const [latestInterview, setLatestInterview] = useState<any | null>(null)

  // Fetch candidate
  const fetchCandidate = useCallback(async () => {
    if (!candidateId) {
      setError('No candidate ID provided')
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const candidateRef = doc(db, COLLECTIONS.CANDIDATES, candidateId)
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
  }, [db, candidateId])

  // Fetch activities
  const fetchActivities = useCallback(async () => {
    if (!candidateId) return

    try {
      setLoadingActivities(true)
      
      const activitiesRef = collection(db, COLLECTIONS.ACTIVITY_LOG)
      let activitiesQuery
      
      try {
        // Try with ordering (requires index)
        activitiesQuery = query(
          activitiesRef,
          where('entityId', '==', candidateId),
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
          where('entityId', '==', candidateId),
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
  }, [db, candidateId])

  // Fetch linked candidates
  const fetchLinkedCandidates = useCallback(async () => {
    if (!candidate) return
    
    const linkedIds = candidate.linkedCandidateIds || []
    const primaryId = candidate.primaryRecordId
    
    const allLinkedIds = [...new Set([...linkedIds, ...(primaryId ? [primaryId] : [])])]
      .filter(linkedId => linkedId !== candidate.id)
    
    if (allLinkedIds.length === 0) {
      setLinkedCandidates([])
      return
    }

    try {
      setLoadingLinkedCandidates(true)
      
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
  }, [db, candidate])

  // Fetch latest interview/trial for this candidate
  const fetchLatestInterview = useCallback(async () => {
    if (!candidateId) return

    try {
      const interviewsRef = collection(db, 'interviews')
      // Simple query without orderBy to avoid index requirement
      const q = query(
        interviewsRef,
        where('candidateId', '==', candidateId)
      )
      const snapshot = await getDocs(q)

      if (!snapshot.empty) {
        // Find the most recent scheduled interview/trial
        let latest: any = null
        let latestDate: Date | null = null

        snapshot.docs.forEach(doc => {
          const data = doc.data()
          // Check both scheduledDate (new) and scheduledAt (legacy) field names
          const dateField = data.scheduledDate || data.scheduledAt
          const scheduledAt = dateField?.toDate?.() || (dateField ? new Date(dateField) : null)

          if (scheduledAt && (!latestDate || scheduledAt > latestDate)) {
            latestDate = scheduledAt
            // Normalize the field name to scheduledAt for the component
            latest = {
              id: doc.id,
              ...data,
              scheduledAt: dateField // Ensure scheduledAt is set
            }
          }
        })

        if (latest) {
          setLatestInterview(latest)
        }
      }
    } catch (err) {
      console.error('Error fetching latest interview:', err)
    }
  }, [db, candidateId])

  // Log activity
  const logActivity = useCallback(async (
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
        userId,
        userName,
        createdAt: serverTimestamp(),
      }
      
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
  }, [db, userId, userName])

  // Initial fetch
  useEffect(() => {
    fetchCandidate()
  }, [fetchCandidate])

  // Fetch activities when candidate ID changes
  useEffect(() => {
    fetchActivities()
  }, [fetchActivities])

  // Fetch linked candidates when candidate changes
  useEffect(() => {
    fetchLinkedCandidates()
  }, [fetchLinkedCandidates])

  // Fetch latest interview when candidate ID changes
  useEffect(() => {
    fetchLatestInterview()
  }, [fetchLatestInterview])

  return {
    candidate,
    setCandidate,
    loading,
    error,
    activities,
    loadingActivities,
    logActivity,
    linkedCandidates,
    loadingLinkedCandidates,
    latestInterview,
    refetchCandidate: fetchCandidate,
  }
}

export default useCandidateData

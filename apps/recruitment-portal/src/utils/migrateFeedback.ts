// ============================================================================
// One-time Migration Scripts
// ============================================================================

import { collection, getDocs, doc, updateDoc, getDoc, query, where, serverTimestamp } from 'firebase/firestore'
import { getFirebaseDb, COLLECTIONS } from '@allied/shared-lib'

interface MigrationResult {
  total: number
  migrated: number
  skipped: number
  errors: string[]
  details: string[]
}

export async function migrateLegacyFeedback(): Promise<MigrationResult> {
  const db = getFirebaseDb()
  const result: MigrationResult = {
    total: 0,
    migrated: 0,
    skipped: 0,
    errors: [],
    details: []
  }

  try {
    // 1. Get all candidates
    const candidatesSnap = await getDocs(collection(db, COLLECTIONS.CANDIDATES))

    for (const candidateDoc of candidatesSnap.docs) {
      const candidate = candidateDoc.data()
      const candidateId = candidateDoc.id
      const candidateName = `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim()

      // Check for legacy feedback
      const legacyFeedbacks = candidate.feedbacks || (candidate.feedback ? [candidate.feedback] : [])

      if (legacyFeedbacks.length === 0) continue

      result.total += legacyFeedbacks.length

      // 2. Find interviews for this candidate
      const interviewsQuery = query(
        collection(db, COLLECTIONS.INTERVIEWS),
        where('candidateId', '==', candidateId)
      )
      const interviewsSnap = await getDocs(interviewsQuery)

      if (interviewsSnap.empty) {
        result.skipped += legacyFeedbacks.length
        result.details.push(`${candidateName}: No interviews found - skipped ${legacyFeedbacks.length} feedback(s)`)
        continue
      }

      // Sort interviews by date (most recent first)
      const interviews = interviewsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => {
          const dateA = a.scheduledAt?.toDate?.() || new Date(0)
          const dateB = b.scheduledAt?.toDate?.() || new Date(0)
          return dateB.getTime() - dateA.getTime()
        })

      // 3. For each legacy feedback, try to match to an interview
      for (let i = 0; i < legacyFeedbacks.length; i++) {
        const legacyFb = legacyFeedbacks[i]

        // Find interview without feedback (or use the i-th interview)
        let targetInterview: any = null

        // First, try to find an interview without feedback
        for (const interview of interviews) {
          if (!(interview as any).feedback?.submittedAt) {
            targetInterview = interview
            break
          }
        }

        // If all interviews have feedback, skip
        if (!targetInterview) {
          // Use the most recent interview if it's the only legacy feedback
          if (legacyFeedbacks.length === 1 && interviews.length > 0) {
            targetInterview = interviews[0]
            // Only overwrite if the interview feedback is empty
            if ((targetInterview as any).feedback?.submittedAt) {
              result.skipped++
              result.details.push(`${candidateName}: Interview already has feedback - skipped`)
              continue
            }
          } else {
            result.skipped++
            result.details.push(`${candidateName}: All interviews already have feedback - skipped`)
            continue
          }
        }

        // 4. Calculate recommendation from rating
        const overallRating = legacyFb.ratings?.overall || 0
        let recommendation: 'hire' | 'maybe' | 'do_not_hire' = 'maybe'

        if (overallRating >= 4) {
          recommendation = 'hire'
        } else if (overallRating <= 2 && overallRating > 0) {
          recommendation = 'do_not_hire'
        }

        // 5. Build new feedback object
        const newFeedback = {
          rating: overallRating,
          recommendation,
          strengths: legacyFb.notes || null,
          weaknesses: null,
          comments: `Migrated from legacy feedback. Original ratings: ${JSON.stringify(legacyFb.ratings || {})}`,
          submittedAt: legacyFb.submittedAt ? new Date(legacyFb.submittedAt) : serverTimestamp(),
          submittedBy: legacyFb.submittedBy || 'migration',
        }

        // 6. Update the interview document
        try {
          await updateDoc(doc(db, COLLECTIONS.INTERVIEWS, targetInterview.id), {
            feedback: newFeedback,
            status: 'completed',
            updatedAt: serverTimestamp(),
          })

          result.migrated++
          result.details.push(`${candidateName}: Migrated to interview ${targetInterview.id} (${(targetInterview as any).type || 'unknown'}) → ${recommendation}`)
        } catch (err: any) {
          result.errors.push(`${candidateName}: Failed to update interview - ${err.message}`)
        }
      }
    }
  } catch (err: any) {
    result.errors.push(`Migration failed: ${err.message}`)
  }

  return result
}

// ============================================================================
// Assign Branches to Candidates Without Branches
// ============================================================================

interface BranchMigrationResult {
  total: number
  assigned: number
  skipped: number
  errors: string[]
  details: string[]
  needsManualAssignment: Array<{ id: string; name: string; jobTitle: string }>
}

// ============================================================================
// Fix Future Interviews Incorrectly Marked as Completed
// ============================================================================

interface FutureInterviewFixResult {
  total: number
  fixed: number
  skipped: number
  errors: string[]
  details: string[]
}

export async function fixFutureCompletedInterviews(): Promise<FutureInterviewFixResult> {
  const db = getFirebaseDb()
  const result: FutureInterviewFixResult = {
    total: 0,
    fixed: 0,
    skipped: 0,
    errors: [],
    details: []
  }

  try {
    const now = new Date()

    // Get all interviews
    const interviewsSnap = await getDocs(collection(db, COLLECTIONS.INTERVIEWS))

    for (const interviewDoc of interviewsSnap.docs) {
      const interview = interviewDoc.data()
      const interviewId = interviewDoc.id
      const scheduledDate = interview.scheduledDate?.toDate?.()

      if (!scheduledDate) continue

      // Check if this is a future interview
      if (scheduledDate > now) {
        // Check if it's incorrectly marked as completed or pending_feedback
        const badStatuses = ['completed', 'pending_feedback']

        if (badStatuses.includes(interview.status)) {
          result.total++

          const candidateName = interview.candidateName || 'Unknown'
          const dateStr = scheduledDate.toLocaleDateString('en-GB')
          const typeStr = interview.type || 'interview'

          // Only fix if there's no actual feedback submitted
          if (!interview.feedback?.submittedAt) {
            try {
              await updateDoc(doc(db, COLLECTIONS.INTERVIEWS, interviewId), {
                status: 'scheduled',
                updatedAt: serverTimestamp(),
              })

              result.fixed++
              result.details.push(`${candidateName} (${typeStr} on ${dateStr}): Reset from "${interview.status}" to "scheduled"`)
            } catch (err: any) {
              result.errors.push(`${candidateName}: Failed to update - ${err.message}`)
            }
          } else {
            // Has feedback but is in the future - weird, skip but log
            result.skipped++
            result.details.push(`${candidateName} (${typeStr} on ${dateStr}): Has feedback but scheduled in future - skipped`)
          }
        }
      }
    }
  } catch (err: any) {
    result.errors.push(`Fix failed: ${err.message}`)
  }

  return result
}

export async function assignBranchesToCandidates(): Promise<BranchMigrationResult> {
  const db = getFirebaseDb()
  const result: BranchMigrationResult = {
    total: 0,
    assigned: 0,
    skipped: 0,
    errors: [],
    details: [],
    needsManualAssignment: []
  }

  try {
    // 1. Get all candidates
    const candidatesSnap = await getDocs(collection(db, COLLECTIONS.CANDIDATES))

    // 2. Build a cache of jobs for lookup
    const jobsSnap = await getDocs(collection(db, 'jobs'))
    const jobsMap = new Map<string, { branchId: string; branchName: string }>()
    jobsSnap.docs.forEach(d => {
      const data = d.data()
      if (data.branchId) {
        jobsMap.set(d.id, { branchId: data.branchId, branchName: data.branchName || '' })
      }
    })

    // 3. Process each candidate without a branch
    for (const candidateDoc of candidatesSnap.docs) {
      const candidate = candidateDoc.data()
      const candidateId = candidateDoc.id
      const candidateName = `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || 'Unknown'

      // Skip if already has a branch
      if (candidate.branchId) {
        continue
      }

      result.total++

      // Try to get branch from their job
      const jobId = candidate.jobId
      if (jobId && jobsMap.has(jobId)) {
        const jobBranch = jobsMap.get(jobId)!

        try {
          await updateDoc(doc(db, COLLECTIONS.CANDIDATES, candidateId), {
            branchId: jobBranch.branchId,
            branchName: jobBranch.branchName,
            location: jobBranch.branchName, // Also update location field
            updatedAt: serverTimestamp(),
          })

          result.assigned++
          result.details.push(`${candidateName}: Assigned to ${jobBranch.branchName} (from job)`)
        } catch (err: any) {
          result.errors.push(`${candidateName}: Failed to update - ${err.message}`)
        }
      } else {
        // No job or job has no branch - needs manual assignment
        result.skipped++
        result.needsManualAssignment.push({
          id: candidateId,
          name: candidateName,
          jobTitle: candidate.jobTitle || 'No job assigned'
        })
        result.details.push(`${candidateName}: No job with branch found - needs manual assignment`)
      }
    }
  } catch (err: any) {
    result.errors.push(`Migration failed: ${err.message}`)
  }

  return result
}

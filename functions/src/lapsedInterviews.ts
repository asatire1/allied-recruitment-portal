/**
 * Lapsed Interviews Functions
 * 
 * Handles marking interviews as lapsed when they pass their scheduled date
 * without being completed, and resolving them when appropriate.
 * 
 * Updated: Auto-resolve lapsed interviews when candidate status changes
 * Updated: Run at 6am, 12pm, 6pm and midnight for faster status updates
 * Updated: Auto-complete past interviews and update candidate status
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import * as admin from 'firebase-admin'
import * as logger from 'firebase-functions/logger'

const db = admin.firestore()

// ============================================================================
// Statuses that should auto-resolve lapsed interviews
// ============================================================================

const AUTO_RESOLVE_STATUSES = [
  'withdrawn',
  'rejected', 
  'trial_scheduled',
  'trial_complete',
  'approved',
  'hired'
]

// ============================================================================
// Process Past Interviews (Core Logic)
// Marks past interviews as completed and updates candidate status
// ============================================================================

async function processPassedInterviews(): Promise<{ completed: number; lapsed: number; candidatesUpdated: number }> {
  const now = new Date()
  let completedCount = 0
  let lapsedCount = 0
  let candidatesUpdated = 0

  try {
    // Find interviews that are scheduled/confirmed but past their date+time
    const interviewsSnapshot = await db
      .collection('interviews')
      .where('status', 'in', ['scheduled', 'confirmed'])
      .where('scheduledDate', '<', admin.firestore.Timestamp.fromDate(now))
      .get()

    if (interviewsSnapshot.empty) {
      logger.info('No past interviews to process')
      return { completed: 0, lapsed: 0, candidatesUpdated: 0 }
    }

    const batch = db.batch()
    const candidatesToUpdate = new Map<string, string>() // candidateId -> newStatus

    for (const doc of interviewsSnapshot.docs) {
      const interview = doc.data()
      const scheduledDate = interview.scheduledDate?.toDate?.() || new Date(0)
      const hoursSinceInterview = (now.getTime() - scheduledDate.getTime()) / (1000 * 60 * 60)
      
      // Check if candidate status should prevent processing
      if (interview.candidateId) {
        const candidateDoc = await db.collection('candidates').doc(interview.candidateId).get()
        if (candidateDoc.exists) {
          const candidate = candidateDoc.data()
          if (candidate && AUTO_RESOLVE_STATUSES.includes(candidate.status)) {
            // Auto-resolve instead of completing
            batch.update(doc.ref, {
              status: 'resolved',
              resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
              resolvedReason: `Auto-resolved: candidate status is ${candidate.status}`,
            })
            lapsedCount++
            continue
          }
        }
      }

      // If interview was less than 48 hours ago, mark as pending_feedback
      if (hoursSinceInterview < 48) {
        batch.update(doc.ref, {
          status: 'pending_feedback',
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          autoCompleted: true,
        })
        completedCount++

        // Track candidate for status update
        if (interview.candidateId && interview.type) {
          const newStatus = interview.type === 'trial' ? 'trial_complete' : 'interview_complete'
          candidatesToUpdate.set(interview.candidateId, newStatus)
        }
      } else {
        // If more than 48 hours, mark as lapsed (needs manual resolution)
        batch.update(doc.ref, {
          status: 'lapsed',
          lapsedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        lapsedCount++
      }
    }

    await batch.commit()

    // Update candidate statuses
    for (const [candidateId, newStatus] of candidatesToUpdate) {
      try {
        const candidateRef = db.collection('candidates').doc(candidateId)
        const candidateDoc = await candidateRef.get()
        
        if (candidateDoc.exists) {
          const currentStatus = candidateDoc.data()?.status
          // Only update if moving forward in the workflow
          const statusOrder = ['new', 'screening', 'interview_scheduled', 'interview_complete', 'trial_scheduled', 'trial_complete', 'approved']
          const currentIndex = statusOrder.indexOf(currentStatus)
          const newIndex = statusOrder.indexOf(newStatus)
          
          // Only update if the new status moves forward in the workflow
          // Special case: interview_scheduled -> interview_complete is allowed
          // Special case: trial_scheduled -> trial_complete is allowed
          // But trial_scheduled -> interview_complete is NOT allowed (would be going backwards)
          const isForwardProgress = newIndex > currentIndex
          const isInterviewCompletion = currentStatus === 'interview_scheduled' && newStatus === 'interview_complete'
          const isTrialCompletion = currentStatus === 'trial_scheduled' && newStatus === 'trial_complete'

          if (isForwardProgress || isInterviewCompletion || isTrialCompletion) {
            await candidateRef.update({
              status: newStatus,
              statusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
              statusUpdatedBy: 'system',
            })
            candidatesUpdated++
            logger.info(`Updated candidate ${candidateId} status to ${newStatus}`)
          }
        }
      } catch (err) {
        logger.error(`Failed to update candidate ${candidateId}:`, err)
      }
    }

    return { completed: completedCount, lapsed: lapsedCount, candidatesUpdated }
  } catch (error) {
    logger.error('Error processing passed interviews:', error)
    throw error
  }
}

// ============================================================================
// Scheduled Functions - Run at 6am, 12pm, 6pm, and midnight
// ============================================================================

export const processInterviews6am = onSchedule(
  {
    schedule: '0 6 * * *', // Daily at 6 AM
    timeZone: 'Europe/London',
    region: 'europe-west2',
  },
  async () => {
    logger.info('Running 6am interview processing')
    const result = await processPassedInterviews()
    logger.info(`6am run: Completed ${result.completed}, Lapsed ${result.lapsed}, Candidates updated ${result.candidatesUpdated}`)
  }
)

export const processInterviews12pm = onSchedule(
  {
    schedule: '0 12 * * *', // Daily at 12 PM (noon)
    timeZone: 'Europe/London',
    region: 'europe-west2',
  },
  async () => {
    logger.info('Running 12pm interview processing')
    const result = await processPassedInterviews()
    logger.info(`12pm run: Completed ${result.completed}, Lapsed ${result.lapsed}, Candidates updated ${result.candidatesUpdated}`)
  }
)

export const processInterviews6pm = onSchedule(
  {
    schedule: '0 18 * * *', // Daily at 6 PM
    timeZone: 'Europe/London',
    region: 'europe-west2',
  },
  async () => {
    logger.info('Running 6pm interview processing')
    const result = await processPassedInterviews()
    logger.info(`6pm run: Completed ${result.completed}, Lapsed ${result.lapsed}, Candidates updated ${result.candidatesUpdated}`)
  }
)

export const processInterviewsMidnight = onSchedule(
  {
    schedule: '0 0 * * *', // Daily at midnight
    timeZone: 'Europe/London',
    region: 'europe-west2',
  },
  async () => {
    logger.info('Running midnight interview processing')
    const result = await processPassedInterviews()
    logger.info(`Midnight run: Completed ${result.completed}, Lapsed ${result.lapsed}, Candidates updated ${result.candidatesUpdated}`)
  }
)

// Keep the old function name for backwards compatibility (will be removed later)
export const markLapsedInterviews = processInterviews6am

// ============================================================================
// Resolve Lapsed Interview (Manual)
// ============================================================================

interface ResolveLapsedRequest {
  interviewId: string
  resolution: 'rescheduled' | 'completed' | 'cancelled' | 'no_show'
  notes?: string
  newDate?: string // ISO date string for rescheduled
}

export const resolveLapsedInterview = onCall<ResolveLapsedRequest>(
  { region: 'us-central1' },
  async (request) => {
    const { interviewId, resolution, notes, newDate } = request.data

    if (!interviewId || !resolution) {
      throw new HttpsError('invalid-argument', 'Missing interviewId or resolution')
    }

    try {
      const interviewRef = db.collection('interviews').doc(interviewId)
      const interviewDoc = await interviewRef.get()

      if (!interviewDoc.exists) {
        throw new HttpsError('not-found', 'Interview not found')
      }

      const interview = interviewDoc.data()

      // Determine new status based on resolution
      let newStatus: string
      const updateData: any = {
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        resolvedBy: request.auth?.uid || 'system',
        resolutionNotes: notes || '',
      }

      switch (resolution) {
        case 'rescheduled':
          if (!newDate) {
            throw new HttpsError('invalid-argument', 'New date required for rescheduling')
          }
          newStatus = 'scheduled'
          updateData.scheduledDate = admin.firestore.Timestamp.fromDate(new Date(newDate))
          updateData.rescheduledFrom = interview?.scheduledDate
          break
        case 'completed':
          newStatus = 'completed'
          break
        case 'cancelled':
          newStatus = 'cancelled'
          break
        case 'no_show':
          newStatus = 'no_show'
          break
        default:
          throw new HttpsError('invalid-argument', 'Invalid resolution type')
      }

      updateData.status = newStatus

      await interviewRef.update(updateData)

      // If no_show, update candidate status
      if (resolution === 'no_show' && interview?.candidateId) {
        await db.collection('candidates').doc(interview.candidateId).update({
          lastInterviewNoShow: admin.firestore.FieldValue.serverTimestamp(),
        })
      }

      logger.info(`Lapsed interview ${interviewId} resolved as ${resolution}`)

      return { success: true, newStatus }
    } catch (error: any) {
      logger.error('Error resolving lapsed interview:', error)
      if (error instanceof HttpsError) throw error
      throw new HttpsError('internal', error.message || 'Failed to resolve interview')
    }
  }
)

// ============================================================================
// Auto-resolve lapsed interviews when candidate status changes
// ============================================================================

export const onCandidateStatusChange = onDocumentUpdated(
  {
    document: 'candidates/{candidateId}',
    region: 'europe-west2',
  },
  async (event) => {
    const beforeData = event.data?.before?.data()
    const afterData = event.data?.after?.data()
    const candidateId = event.params.candidateId

    if (!beforeData || !afterData) return

    const oldStatus = beforeData.status
    const newStatus = afterData.status

    // Only proceed if status changed to an auto-resolve status
    if (oldStatus === newStatus || !AUTO_RESOLVE_STATUSES.includes(newStatus)) {
      return
    }

    logger.info(`Candidate ${candidateId} status changed from ${oldStatus} to ${newStatus}`)

    try {
      // Find all lapsed interviews for this candidate
      const lapsedInterviews = await db
        .collection('interviews')
        .where('candidateId', '==', candidateId)
        .where('status', '==', 'lapsed')
        .get()

      if (lapsedInterviews.empty) {
        logger.info(`No lapsed interviews found for candidate ${candidateId}`)
        return
      }

      const batch = db.batch()
      let count = 0

      for (const doc of lapsedInterviews.docs) {
        batch.update(doc.ref, {
          status: 'resolved',
          resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
          resolvedBy: 'system',
          resolvedReason: `Auto-resolved: candidate status changed to ${newStatus}`,
        })
        count++
      }

      await batch.commit()
      logger.info(`Auto-resolved ${count} lapsed interviews for candidate ${candidateId}`)
    } catch (error) {
      logger.error(`Error auto-resolving lapsed interviews for ${candidateId}:`, error)
    }
  }
)

// ============================================================================
// Also resolve scheduled (not yet lapsed) interviews when candidate withdraws/rejected
// ============================================================================

export const onCandidateWithdrawnOrRejected = onDocumentUpdated(
  {
    document: 'candidates/{candidateId}',
    region: 'europe-west2',
  },
  async (event) => {
    const beforeData = event.data?.before?.data()
    const afterData = event.data?.after?.data()
    const candidateId = event.params.candidateId

    if (!beforeData || !afterData) return

    const oldStatus = beforeData.status
    const newStatus = afterData.status

    // Only proceed if status changed to withdrawn or rejected
    if (oldStatus === newStatus || !['withdrawn', 'rejected'].includes(newStatus)) {
      return
    }

    try {
      // Find all scheduled interviews for this candidate
      const scheduledInterviews = await db
        .collection('interviews')
        .where('candidateId', '==', candidateId)
        .where('status', '==', 'scheduled')
        .get()

      if (scheduledInterviews.empty) {
        return
      }

      const batch = db.batch()
      let count = 0

      for (const doc of scheduledInterviews.docs) {
        batch.update(doc.ref, {
          status: 'cancelled',
          cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
          cancelledReason: `Candidate ${newStatus}`,
        })
        count++
      }

      await batch.commit()
      logger.info(`Cancelled ${count} scheduled interviews for ${newStatus} candidate ${candidateId}`)
    } catch (error) {
      logger.error(`Error cancelling interviews for ${candidateId}:`, error)
    }
  }
)

// ============================================================================
// Manual Trigger - For immediate processing without waiting for schedule
// ============================================================================

export const processInterviewsNow = onCall(
  { 
    region: 'europe-west2',
    timeoutSeconds: 120,
  },
  async (request) => {
    // Require authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    logger.info('Manual trigger: Processing past interviews')
    
    try {
      const result = await processPassedInterviews()
      logger.info(`Manual run complete: Completed ${result.completed}, Lapsed ${result.lapsed}, Candidates updated ${result.candidatesUpdated}`)
      
      return {
        success: true,
        completed: result.completed,
        lapsed: result.lapsed,
        candidatesUpdated: result.candidatesUpdated,
        message: `Processed interviews: ${result.completed} completed, ${result.lapsed} lapsed, ${result.candidatesUpdated} candidates updated`
      }
    } catch (error: any) {
      logger.error('Manual trigger failed:', error)
      throw new HttpsError('internal', error.message || 'Failed to process interviews')
    }
  }
)

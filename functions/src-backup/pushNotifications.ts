/**
 * Allied Recruitment Portal - Push Notification Cloud Functions
 * B4.3: New trial assigned notification
 * B4.4: Feedback reminder notification (24h after trial)
 */

import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { setGlobalOptions } from 'firebase-functions/v2/options'
import * as admin from 'firebase-admin'

// Set global options
setGlobalOptions({
  region: 'europe-west2', // UK region for Allied Pharmacies
  maxInstances: 10,
})

const db = admin.firestore()
const messaging = admin.messaging()

// ============================================================================
// TYPES
// ============================================================================

interface Interview {
  id: string
  candidateId: string
  candidateName: string
  type: 'interview' | 'trial'
  status: string
  branchId?: string
  branchName?: string
  scheduledAt: admin.firestore.Timestamp
  feedback?: {
    rating: number
    recommendation: string
    submittedAt: admin.firestore.Timestamp
  }
}

// ============================================================================
// B4.3: NEW TRIAL ASSIGNED NOTIFICATION
// ============================================================================

/**
 * Triggered when a new trial is created
 * Sends push notification to branch managers of the assigned branch
 */
export const onTrialCreated = onDocumentCreated(
  'interviews/{interviewId}',
  async (event) => {
    const snapshot = event.data
    if (!snapshot) {
      console.log('No data in snapshot')
      return
    }

    const interview = { id: event.params.interviewId, ...snapshot.data() } as Interview

    // Only process trials
    if (interview.type !== 'trial') {
      console.log('Not a trial, skipping')
      return
    }

    // Only notify for scheduled trials
    if (interview.status !== 'scheduled') {
      console.log('Trial not scheduled, skipping')
      return
    }

    const branchId = interview.branchId
    if (!branchId) {
      console.log('No branchId, skipping')
      return
    }

    console.log(`New trial created: ${interview.id} for branch ${branchId}`)

    try {
      // Find branch managers for this branch
      const usersSnapshot = await db
        .collection('users')
        .where('role', '==', 'branch_manager')
        .where('branchIds', 'array-contains', branchId)
        .get()

      if (usersSnapshot.empty) {
        console.log('No branch managers found for this branch')
        return
      }

      const userIds = usersSnapshot.docs.map((doc) => doc.id)
      console.log(`Found ${userIds.length} branch managers to notify`)

      // Get FCM tokens for these users (handle Firestore 'in' limit of 10)
      const tokensSnapshot = await db
        .collection('fcmTokens')
        .where('userId', 'in', userIds.slice(0, 10))
        .get()

      if (tokensSnapshot.empty) {
        console.log('No FCM tokens found for branch managers')
        // Still create in-app notifications
      }

      const tokens = tokensSnapshot.docs.map((doc) => doc.data().token as string)
      console.log(`Found ${tokens.length} FCM tokens`)

      // Format scheduled date
      const scheduledDate = interview.scheduledAt.toDate()
      const formattedDate = scheduledDate.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })

      // Send push notifications if we have tokens
      if (tokens.length > 0) {
        const notification: admin.messaging.MulticastMessage = {
          tokens,
          notification: {
            title: 'New Trial Scheduled',
            body: `${interview.candidateName} - ${formattedDate}`,
          },
          data: {
            type: 'trial_scheduled',
            interviewId: interview.id,
            candidateId: interview.candidateId,
            candidateName: interview.candidateName,
            branchId: branchId,
            branchName: interview.branchName || '',
            scheduledAt: interview.scheduledAt.toDate().toISOString(),
            link: `/feedback/${interview.id}`,
            tag: `trial-${interview.id}`,
          },
          webpush: {
            fcmOptions: {
              link: `/feedback/${interview.id}`,
            },
            notification: {
              icon: '/icons/icon-192x192.png',
              badge: '/icons/badge-72x72.png',
            },
          },
        }

        const response = await messaging.sendEachForMulticast(notification)
        console.log(`Sent ${response.successCount} notifications, ${response.failureCount} failed`)

        // Clean up invalid tokens
        if (response.failureCount > 0) {
          const invalidTokens: string[] = []
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              const errorCode = resp.error?.code
              if (
                errorCode === 'messaging/invalid-registration-token' ||
                errorCode === 'messaging/registration-token-not-registered'
              ) {
                invalidTokens.push(tokens[idx])
              }
            }
          })

          // Delete invalid tokens
          for (const token of invalidTokens) {
            await db.collection('fcmTokens').doc(token).delete()
            console.log(`Deleted invalid token: ${token.substring(0, 20)}...`)
          }
        }
      }

      // Create in-app notification records
      for (const userId of userIds) {
        await db.collection('notifications').add({
          userId,
          type: 'trial_scheduled',
          title: 'New Trial Scheduled',
          message: `${interview.candidateName} has a trial on ${formattedDate}`,
          entityType: 'interview',
          entityId: interview.id,
          link: `/feedback/${interview.id}`,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      }

      console.log('In-app notifications created')
    } catch (error) {
      console.error('Error sending trial notification:', error)
    }
  }
)

// ============================================================================
// B4.4: FEEDBACK REMINDER NOTIFICATION (24h after trial)
// ============================================================================

/**
 * Scheduled function that runs every hour
 * Checks for completed trials that need feedback reminders
 */
export const sendFeedbackReminders = onSchedule(
  {
    schedule: '0 * * * *', // Every hour at minute 0
    timeZone: 'Europe/London',
    retryCount: 3,
  },
  async () => {
    console.log('Running feedback reminder check...')

    const now = new Date()
    
    // Look for trials completed 24-25 hours ago (1 hour window)
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000)

    try {
      // Find completed trials without feedback in the 24h window
      const trialsSnapshot = await db
        .collection('interviews')
        .where('type', '==', 'trial')
        .where('status', '==', 'completed')
        .where('scheduledAt', '<=', admin.firestore.Timestamp.fromDate(twentyFourHoursAgo))
        .where('scheduledAt', '>=', admin.firestore.Timestamp.fromDate(twentyFiveHoursAgo))
        .get()

      console.log(`Found ${trialsSnapshot.size} trials in the 24h window`)

      for (const doc of trialsSnapshot.docs) {
        const interview = { id: doc.id, ...doc.data() } as Interview

        // Skip if feedback already submitted
        if (interview.feedback) {
          console.log(`Trial ${interview.id} already has feedback, skipping`)
          continue
        }

        // Check if reminder already sent
        const reminderSent = doc.data().feedbackReminderSent
        if (reminderSent) {
          console.log(`Reminder already sent for ${interview.id}, skipping`)
          continue
        }

        const branchId = interview.branchId
        if (!branchId) continue

        console.log(`Sending feedback reminder for trial ${interview.id}`)

        // Find branch managers
        const usersSnapshot = await db
          .collection('users')
          .where('role', '==', 'branch_manager')
          .where('branchIds', 'array-contains', branchId)
          .get()

        if (usersSnapshot.empty) continue

        const userIds = usersSnapshot.docs.map((d) => d.id)

        // Get FCM tokens
        const tokensSnapshot = await db
          .collection('fcmTokens')
          .where('userId', 'in', userIds.slice(0, 10))
          .get()

        if (!tokensSnapshot.empty) {
          const tokens = tokensSnapshot.docs.map((d) => d.data().token as string)

          // Send push notification
          const notification: admin.messaging.MulticastMessage = {
            tokens,
            notification: {
              title: 'Feedback Required',
              body: `Please submit feedback for ${interview.candidateName}'s trial`,
            },
            data: {
              type: 'feedback_required',
              interviewId: interview.id,
              candidateId: interview.candidateId,
              candidateName: interview.candidateName,
              link: `/feedback/${interview.id}`,
              tag: `feedback-${interview.id}`,
              requireInteraction: 'true',
            },
            webpush: {
              fcmOptions: {
                link: `/feedback/${interview.id}`,
              },
              notification: {
                icon: '/icons/icon-192x192.png',
                badge: '/icons/badge-72x72.png',
                requireInteraction: true,
              },
            },
          }

          const response = await messaging.sendEachForMulticast(notification)
          console.log(`Sent ${response.successCount} feedback reminders for ${interview.id}`)
        }

        // Create in-app notification
        for (const userId of userIds) {
          await db.collection('notifications').add({
            userId,
            type: 'feedback_required',
            title: 'Feedback Required',
            message: `Please submit feedback for ${interview.candidateName}'s trial`,
            entityType: 'interview',
            entityId: interview.id,
            link: `/feedback/${interview.id}`,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          })
        }

        // Mark reminder as sent
        await doc.ref.update({
          feedbackReminderSent: true,
          feedbackReminderSentAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      }

      console.log('Feedback reminder check complete')
    } catch (error) {
      console.error('Error in feedback reminder job:', error)
      throw error
    }
  }
)

// ============================================================================
// HELPER: Trigger when trial status changes to completed
// ============================================================================

/**
 * Triggered when a trial is updated
 * Logs when status changes to completed
 */
export const onTrialCompleted = onDocumentUpdated(
  'interviews/{interviewId}',
  async (event) => {
    const before = event.data?.before.data() as Interview | undefined
    const after = event.data?.after.data() as Interview | undefined

    if (!before || !after) return

    // Only process trials
    if (after.type !== 'trial') return

    // Check if status changed to completed
    if (before.status === 'completed' || after.status !== 'completed') return

    console.log(`Trial ${event.params.interviewId} marked as completed`)
    // The scheduled job will handle sending the 24h reminder
  }
)

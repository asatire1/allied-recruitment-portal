/**
 * Trial Notifications Cloud Functions
 * Handles branch notifications and feedback requests for trial bookings
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineSecret } from 'firebase-functions/params'
import * as admin from 'firebase-admin'
import * as crypto from 'crypto'

const db = admin.firestore()

// Microsoft Graph API secrets
const msClientId = defineSecret('MS_CLIENT_ID')
const msClientSecret = defineSecret('MS_CLIENT_SECRET')
const msTenantId = defineSecret('MS_TENANT_ID')
const msOrganizerUserId = defineSecret('MS_ORGANIZER_USER_ID')

// ============================================================================
// TYPES
// ============================================================================

interface SendTrialBranchNotificationRequest {
  candidateName: string
  candidateEmail?: string
  branchId: string
  branchName: string
  branchEmail: string
  scheduledDate: string // ISO string
  duration: number
  jobTitle?: string
  interviewId: string
}

interface FeedbackTokenData {
  interviewId: string
  branchId: string
  candidateId: string
  candidateName: string
  createdAt: admin.firestore.Timestamp
  expiresAt: admin.firestore.Timestamp
  used: boolean
}

// ============================================================================
// HELPER: Get Access Token
// ============================================================================

async function getAccessToken(
  clientId: string,
  clientSecret: string,
  tenantId: string
): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })
  
  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.status}`)
  }
  
  const data = await response.json() as { access_token: string }
  return data.access_token
}

// ============================================================================
// HELPER: Send Email via Graph API
// ============================================================================

async function sendEmailViaGraph(
  accessToken: string,
  organizerUserId: string,
  to: string,
  subject: string,
  htmlBody: string
): Promise<void> {
  const graphUrl = `https://graph.microsoft.com/v1.0/users/${organizerUserId}/sendMail`
  
  const response = await fetch(graphUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: htmlBody },
        toRecipients: [{ emailAddress: { address: to } }]
      }
    })
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to send email: ${response.status} - ${errorText}`)
  }
}

// ============================================================================
// FUNCTION: Send Trial Branch Notification
// ============================================================================

export const sendTrialBranchNotification = onCall<SendTrialBranchNotificationRequest>(
  {
    cors: true,
    region: 'europe-west2',
    secrets: [msClientId, msClientSecret, msTenantId, msOrganizerUserId],
  },
  async (request) => {
    const { 
      candidateName, 
      // branchName, // unused 
      branchEmail, 
      scheduledDate, 
      duration, 
      jobTitle 
    } = request.data

    try {
      const clientId = msClientId.value()
      const clientSecret = msClientSecret.value()
      const tenantId = msTenantId.value()
      const organizerUserId = msOrganizerUserId.value()

      if (!clientId || !clientSecret || !tenantId || !organizerUserId) {
        throw new HttpsError('failed-precondition', 'Email not configured')
      }

      const accessToken = await getAccessToken(clientId, clientSecret, tenantId)
      
      const date = new Date(scheduledDate)
      const formattedDate = date.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
      const formattedTime = date.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit'
      })

      const htmlBody = `
        <h2>New Trial Booking</h2>
        <p>A candidate has booked a trial at your branch:</p>
        <ul>
          <li><strong>Candidate:</strong> ${candidateName}</li>
          <li><strong>Date:</strong> ${formattedDate}</li>
          <li><strong>Time:</strong> ${formattedTime}</li>
          <li><strong>Duration:</strong> ${duration} minutes</li>
          ${jobTitle ? `<li><strong>Position:</strong> ${jobTitle}</li>` : ''}
        </ul>
        <p>Please ensure someone is available to supervise the trial.</p>
      `

      await sendEmailViaGraph(
        accessToken,
        organizerUserId,
        branchEmail,
        `Trial Booking: ${candidateName} - ${formattedDate}`,
        htmlBody
      )

      console.log(`Branch notification sent to ${branchEmail} for ${candidateName}`)
      return { success: true }

    } catch (error) {
      console.error('Error sending branch notification:', error)
      throw new HttpsError('internal', 'Failed to send notification')
    }
  }
)

// ============================================================================
// FUNCTION: Send Daily Feedback Requests (Scheduled)
// ============================================================================

export const sendDailyFeedbackRequests = onSchedule(
  {
    schedule: '0 9 * * *', // 9 AM daily
    timeZone: 'Europe/London',
    region: 'europe-west2',
    secrets: [msClientId, msClientSecret, msTenantId, msOrganizerUserId],
  },
  async () => {
    try {
      const clientId = msClientId.value()
      const clientSecret = msClientSecret.value()
      const tenantId = msTenantId.value()
      const organizerUserId = msOrganizerUserId.value()

      if (!clientId || !clientSecret || !tenantId || !organizerUserId) {
        console.error('Email not configured for feedback requests')
        return
      }

      const accessToken = await getAccessToken(clientId, clientSecret, tenantId)

      // Find trials from yesterday that haven't received feedback
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      yesterday.setHours(0, 0, 0, 0)
      
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const trialsSnapshot = await db.collection('interviews')
        .where('type', '==', 'trial')
        .where('status', '==', 'confirmed')
        .where('scheduledAt', '>=', admin.firestore.Timestamp.fromDate(yesterday))
        .where('scheduledAt', '<', admin.firestore.Timestamp.fromDate(today))
        .where('feedbackRequested', '==', false)
        .get()

      console.log(`Found ${trialsSnapshot.size} trials needing feedback requests`)

      for (const trialDoc of trialsSnapshot.docs) {
        const trial = trialDoc.data()
        
        if (!trial.branchId) continue

        // Get branch email
        const branchDoc = await db.collection('branches').doc(trial.branchId).get()
        if (!branchDoc.exists) continue
        
        const branch = branchDoc.data()
        if (!branch?.email) continue

        // Generate feedback token
        const token = crypto.randomBytes(32).toString('hex')
        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + 7) // 7 day expiry

        await db.collection('feedbackTokens').doc(token).set({
          interviewId: trialDoc.id,
          branchId: trial.branchId,
          candidateId: trial.candidateId,
          candidateName: trial.candidateName,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
          used: false
        })

        const feedbackUrl = `https://allied-booking.web.app/feedback/${token}`

        const htmlBody = `
          <h2>Trial Feedback Request</h2>
          <p>Please provide feedback for the following trial:</p>
          <ul>
            <li><strong>Candidate:</strong> ${trial.candidateName}</li>
            <li><strong>Date:</strong> ${trial.scheduledAt.toDate().toLocaleDateString('en-GB')}</li>
            ${trial.jobTitle ? `<li><strong>Position:</strong> ${trial.jobTitle}</li>` : ''}
          </ul>
          <p><a href="${feedbackUrl}" style="display:inline-block;background:#3b82f6;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;">Submit Feedback</a></p>
          <p>This link expires in 7 days.</p>
        `

        await sendEmailViaGraph(
          accessToken,
          organizerUserId,
          branch.email,
          `Feedback Request: ${trial.candidateName}`,
          htmlBody
        )

        // Mark as feedback requested
        await trialDoc.ref.update({
          feedbackRequested: true,
          feedbackRequestedAt: admin.firestore.FieldValue.serverTimestamp()
        })

        console.log(`Feedback request sent to ${branch.email} for ${trial.candidateName}`)
      }

    } catch (error) {
      console.error('Error sending feedback requests:', error)
    }
  }
)

// ============================================================================
// FUNCTION: Validate Feedback Token
// ============================================================================

export const validateFeedbackToken = onCall<{ token: string }>(
  {
    cors: true,
    region: 'europe-west2',
  },
  async (request) => {
    const { token } = request.data

    if (!token) {
      throw new HttpsError('invalid-argument', 'Token is required')
    }

    const tokenDoc = await db.collection('feedbackTokens').doc(token).get()
    
    if (!tokenDoc.exists) {
      return { valid: false, error: 'Invalid token' }
    }

    const tokenData = tokenDoc.data() as FeedbackTokenData

    if (tokenData.used) {
      return { valid: false, error: 'Feedback already submitted' }
    }

    if (tokenData.expiresAt.toDate() < new Date()) {
      return { valid: false, error: 'Token expired' }
    }

    // Get trial details
    const interviewDoc = await db.collection('interviews').doc(tokenData.interviewId).get()
    const interview = interviewDoc.data()

    return {
      valid: true,
      candidateName: tokenData.candidateName,
      candidateId: tokenData.candidateId,
      interviewId: tokenData.interviewId,
      branchId: tokenData.branchId,
      trialDate: interview?.scheduledAt?.toDate()?.toISOString(),
      jobTitle: interview?.jobTitle
    }
  }
)

// ============================================================================
// FUNCTION: Submit Trial Feedback
// ============================================================================

export const submitTrialFeedback = onCall<{
  token: string
  rating: number
  recommend: boolean
  strengths?: string
  improvements?: string
  comments?: string
}>(
  {
    cors: true,
    region: 'europe-west2',
  },
  async (request) => {
    const { token, rating, recommend, strengths, improvements, comments } = request.data

    if (!token || rating === undefined || recommend === undefined) {
      throw new HttpsError('invalid-argument', 'Missing required fields')
    }

    const tokenDoc = await db.collection('feedbackTokens').doc(token).get()
    
    if (!tokenDoc.exists) {
      throw new HttpsError('not-found', 'Invalid token')
    }

    const tokenData = tokenDoc.data() as FeedbackTokenData

    if (tokenData.used) {
      throw new HttpsError('already-exists', 'Feedback already submitted')
    }

    if (tokenData.expiresAt.toDate() < new Date()) {
      throw new HttpsError('deadline-exceeded', 'Token expired')
    }

    // Save feedback
    await db.collection('trialFeedback').add({
      interviewId: tokenData.interviewId,
      candidateId: tokenData.candidateId,
      candidateName: tokenData.candidateName,
      branchId: tokenData.branchId,
      rating,
      recommend,
      strengths: strengths || null,
      improvements: improvements || null,
      comments: comments || null,
      submittedAt: admin.firestore.FieldValue.serverTimestamp()
    })

    // Mark token as used
    await tokenDoc.ref.update({ used: true })

    // Update interview with feedback status
    await db.collection('interviews').doc(tokenData.interviewId).update({
      feedbackReceived: true,
      feedbackReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
      feedbackRating: rating,
      feedbackRecommend: recommend
    })

    // Update candidate with latest feedback
    await db.collection('candidates').doc(tokenData.candidateId).update({
      lastTrialRating: rating,
      lastTrialRecommend: recommend,
      lastTrialFeedbackAt: admin.firestore.FieldValue.serverTimestamp()
    })

    console.log(`Feedback submitted for ${tokenData.candidateName}: ${rating}/5, recommend: ${recommend}`)
    
    return { success: true }
  }
)

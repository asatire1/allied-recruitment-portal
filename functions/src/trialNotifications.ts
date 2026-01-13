/**
 * Trial Notifications & Feedback System
 * 
 * Functions for:
 * - Notifying branches when trials are booked
 * - Sending feedback request emails after trials
 * - Handling feedback submission from branch managers
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import * as admin from 'firebase-admin'
import { ConfidentialClientApplication } from '@azure/msal-node'
import { Client } from '@microsoft/microsoft-graph-client'
import { defineSecret } from 'firebase-functions/params'

// ============================================================================
// SECRETS
// ============================================================================

const MS_CLIENT_ID = defineSecret('MS_CLIENT_ID')
const MS_CLIENT_SECRET = defineSecret('MS_CLIENT_SECRET')
const MS_TENANT_ID = defineSecret('MS_TENANT_ID')

// ============================================================================
// TYPES
// ============================================================================

interface TrialNotificationData {
  candidateId: string
  candidateName: string
  candidateEmail?: string
  jobTitle: string
  branchId: string
  branchName: string
  branchEmail?: string
  trialDate: string
  trialTime: string
  duration: string
  interviewId: string
}

interface FeedbackSubmission {
  token: string
  rating: number
  recommendation: 'hire' | 'maybe' | 'do_not_hire'
  strengths?: string
  improvements?: string
  notes?: string
  submittedBy?: string
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get Microsoft Graph client for sending emails
 */
async function getGraphClient(): Promise<Client> {
  const msalConfig = {
    auth: {
      clientId: MS_CLIENT_ID.value(),
      clientSecret: MS_CLIENT_SECRET.value(),
      authority: `https://login.microsoftonline.com/${MS_TENANT_ID.value()}`,
    },
  }

  const cca = new ConfidentialClientApplication(msalConfig)
  const tokenResponse = await cca.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  })

  if (!tokenResponse?.accessToken) {
    throw new Error('Failed to acquire access token')
  }

  return Client.init({
    authProvider: (done) => {
      done(null, tokenResponse.accessToken)
    },
  })
}

/**
 * Send email via Microsoft Graph
 */
async function sendEmail(
  to: string,
  subject: string,
  htmlBody: string
): Promise<void> {
  const client = await getGraphClient()
  
  const message = {
    message: {
      subject,
      body: {
        contentType: 'HTML',
        content: htmlBody,
      },
      toRecipients: [
        {
          emailAddress: {
            address: to,
          },
        },
      ],
    },
    saveToSentItems: true,
  }

  // Send from recruitment@alliedpharmacies.com
  await client
    .api('/users/recruitment@alliedpharmacies.com/sendMail')
    .post(message)
}

/**
 * Generate feedback token
 */
function generateFeedbackToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let token = ''
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return token
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

/**
 * Send notification to branch when a trial is booked
 */
export const sendTrialBranchNotification = onCall<
  TrialNotificationData,
  Promise<{ success: boolean; error?: string }>
>(
  {
    cors: true,
    region: 'europe-west2',
    secrets: [MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID],
  },
  async (request) => {
    const data = request.data
    
    if (!data.branchEmail) {
      console.log('No branch email provided, skipping notification')
      return { success: true }
    }

    try {
      const subject = `New Trial Shift Booked - ${data.trialDate}`
      
      const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
    .details-box { background: #f8fafc; border-left: 4px solid #8b5cf6; padding: 15px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New Trial Shift Booked</h1>
      <p>${data.trialDate}</p>
    </div>
    <div class="content">
      <p>Hello,</p>
      <p>A new trial shift has been booked at your branch.</p>
      
      <div class="details-box">
        <p><strong>👤 Candidate:</strong> ${data.candidateName}</p>
        <p><strong>📋 Position:</strong> ${data.jobTitle}</p>
        <p><strong>📅 Date:</strong> ${data.trialDate}</p>
        <p><strong>⏰ Time:</strong> ${data.trialTime}</p>
        <p><strong>⏱️ Duration:</strong> ${data.duration}</p>
      </div>

      <p>Please ensure someone is available to welcome the candidate and supervise their trial.</p>
      
      <p><em>You will receive a feedback request after the trial is complete.</em></p>
      
      <p>Best regards,<br>Allied Pharmacies Recruitment Team</p>
    </div>
    <div class="footer">
      <p>This is an automated message from the Allied Recruitment Portal.</p>
    </div>
  </div>
</body>
</html>`

      await sendEmail(data.branchEmail, subject, htmlBody)
      
      console.log(`Trial notification sent to ${data.branchEmail} for ${data.candidateName}`)
      return { success: true }
    } catch (error) {
      console.error('Error sending trial notification:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  }
)

/**
 * Scheduled function to send daily feedback requests
 * Runs every day at 9am UK time
 */
export const sendDailyFeedbackRequests = onSchedule(
  {
    schedule: '0 9 * * *',
    timeZone: 'Europe/London',
    region: 'europe-west2',
    secrets: [MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID],
  },
  async () => {
    const db = admin.firestore()
    
    // Get yesterday's date
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(0, 0, 0, 0)
    
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    try {
      // Find completed trials from yesterday that don't have feedback
      const trialsSnapshot = await db.collection('interviews')
        .where('type', '==', 'trial')
        .where('status', '==', 'completed')
        .where('date', '>=', admin.firestore.Timestamp.fromDate(yesterday))
        .where('date', '<', admin.firestore.Timestamp.fromDate(today))
        .get()

      console.log(`Found ${trialsSnapshot.size} completed trials from yesterday`)

      for (const trialDoc of trialsSnapshot.docs) {
        const trial = trialDoc.data()
        
        // Check if feedback already exists
        const feedbackSnapshot = await db.collection('interviewFeedback')
          .where('interviewId', '==', trialDoc.id)
          .limit(1)
          .get()

        if (!feedbackSnapshot.empty) {
          console.log(`Feedback already exists for trial ${trialDoc.id}, skipping`)
          continue
        }

        // Get branch email
        if (!trial.branchId) continue
        
        const branchDoc = await db.collection('branches').doc(trial.branchId).get()
        const branch = branchDoc.data()
        
        if (!branch?.email) {
          console.log(`No email for branch ${trial.branchId}, skipping`)
          continue
        }

        // Generate feedback token
        const token = generateFeedbackToken()
        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + 7) // Token valid for 7 days

        // Save token
        await db.collection('feedbackTokens').doc(token).set({
          interviewId: trialDoc.id,
          candidateId: trial.candidateId,
          branchId: trial.branchId,
          createdAt: admin.firestore.Timestamp.now(),
          expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
          used: false,
        })

        // Get candidate info
        const candidateDoc = await db.collection('candidates').doc(trial.candidateId).get()
        const candidate = candidateDoc.data()
        const candidateName = candidate 
          ? `${candidate.firstName} ${candidate.lastName}` 
          : 'Unknown Candidate'

        // Send feedback request email
        const feedbackUrl = `https://allied-booking.web.app/feedback/${token}`
        const trialDate = trial.date?.toDate?.()?.toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        }) || 'Unknown date'

        const subject = `Feedback Required - Trial Shift for ${candidateName}`
        
        const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #ea580c 0%, #f97316 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
    .details-box { background: #f8fafc; border-left: 4px solid #f97316; padding: 15px; margin: 20px 0; }
    .btn { display: inline-block; padding: 12px 24px; background: #f97316; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Feedback Required</h1>
      <p>Trial completed yesterday</p>
    </div>
    <div class="content">
      <p>Hello,</p>
      <p>A trial shift was completed at your branch and we'd like your feedback.</p>
      
      <div class="details-box">
        <p><strong>👤 Candidate:</strong> ${candidateName}</p>
        <p><strong>📋 Position:</strong> ${trial.jobTitle || 'Not specified'}</p>
        <p><strong>📅 Trial Date:</strong> ${trialDate}</p>
      </div>

      <p style="text-align: center;">
        <a href="${feedbackUrl}" class="btn">Submit Feedback</a>
      </p>

      <p>Your feedback helps us make informed hiring decisions.</p>
      
      <p>Thank you!</p>
      <p>Best regards,<br>Allied Pharmacies Recruitment Team</p>
    </div>
    <div class="footer">
      <p>This link expires in 7 days.</p>
      <p>This is an automated message from the Allied Recruitment Portal.</p>
    </div>
  </div>
</body>
</html>`

        await sendEmail(branch.email, subject, htmlBody)
        console.log(`Feedback request sent to ${branch.email} for trial ${trialDoc.id}`)
      }

      console.log('Daily feedback requests completed')
    } catch (error) {
      console.error('Error sending daily feedback requests:', error)
      throw error
    }
  }
)

/**
 * Validate a feedback token
 */
export const validateFeedbackToken = onCall<
  { token: string },
  Promise<{ 
    valid: boolean
    candidateName?: string
    jobTitle?: string
    trialDate?: string
    branchName?: string
    error?: string 
  }>
>(
  {
    cors: true,
    region: 'europe-west2',
  },
  async (request) => {
    const { token } = request.data
    
    if (!token) {
      return { valid: false, error: 'Token is required' }
    }

    const db = admin.firestore()

    try {
      const tokenDoc = await db.collection('feedbackTokens').doc(token).get()
      
      if (!tokenDoc.exists) {
        return { valid: false, error: 'Invalid token' }
      }

      const tokenData = tokenDoc.data()!
      
      // Check if expired
      if (tokenData.expiresAt.toDate() < new Date()) {
        return { valid: false, error: 'Token has expired' }
      }

      // Check if already used
      if (tokenData.used) {
        return { valid: false, error: 'Feedback has already been submitted' }
      }

      // Get trial and candidate info
      const interviewDoc = await db.collection('interviews').doc(tokenData.interviewId).get()
      const interview = interviewDoc.data()

      const candidateDoc = await db.collection('candidates').doc(tokenData.candidateId).get()
      const candidate = candidateDoc.data()

      const branchDoc = await db.collection('branches').doc(tokenData.branchId).get()
      const branch = branchDoc.data()

      return {
        valid: true,
        candidateName: candidate ? `${candidate.firstName} ${candidate.lastName}` : 'Unknown',
        jobTitle: interview?.jobTitle || candidate?.jobTitle || 'Not specified',
        trialDate: interview?.date?.toDate?.()?.toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        }),
        branchName: branch?.name || 'Unknown branch',
      }
    } catch (error) {
      console.error('Error validating feedback token:', error)
      return { valid: false, error: 'Error validating token' }
    }
  }
)

/**
 * Submit trial feedback from branch manager
 */
export const submitTrialFeedback = onCall<
  FeedbackSubmission,
  Promise<{ success: boolean; error?: string }>
>(
  {
    cors: true,
    region: 'europe-west2',
  },
  async (request) => {
    const data = request.data
    
    if (!data.token) {
      throw new HttpsError('invalid-argument', 'Token is required')
    }

    const db = admin.firestore()

    try {
      // Validate token
      const tokenDoc = await db.collection('feedbackTokens').doc(data.token).get()
      
      if (!tokenDoc.exists) {
        throw new HttpsError('not-found', 'Invalid token')
      }

      const tokenData = tokenDoc.data()!
      
      if (tokenData.expiresAt.toDate() < new Date()) {
        throw new HttpsError('failed-precondition', 'Token has expired')
      }

      if (tokenData.used) {
        throw new HttpsError('already-exists', 'Feedback has already been submitted')
      }

      // Save feedback
      const feedbackRef = db.collection('interviewFeedback').doc()
      await feedbackRef.set({
        interviewId: tokenData.interviewId,
        candidateId: tokenData.candidateId,
        branchId: tokenData.branchId,
        rating: data.rating,
        recommendation: data.recommendation,
        strengths: data.strengths || null,
        improvements: data.improvements || null,
        notes: data.notes || null,
        submittedBy: data.submittedBy || 'Branch Manager',
        submittedAt: admin.firestore.Timestamp.now(),
        source: 'feedback_link',
      })

      // Mark token as used
      await tokenDoc.ref.update({
        used: true,
        usedAt: admin.firestore.Timestamp.now(),
      })

      // Update interview with feedback reference
      await db.collection('interviews').doc(tokenData.interviewId).update({
        feedbackId: feedbackRef.id,
        feedbackStatus: 'submitted',
      })

      console.log(`Feedback submitted for interview ${tokenData.interviewId}`)
      return { success: true }
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error
      }
      console.error('Error submitting feedback:', error)
      throw new HttpsError('internal', 'Failed to submit feedback')
    }
  }
)

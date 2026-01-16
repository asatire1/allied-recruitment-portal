/**
 * Candidate Messaging Functions
 * Send messages to candidates via email with one-time reply links
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import * as crypto from 'crypto'
import { msClientId, msClientSecret, msTenantId, msOrganizerUserId, getAccessToken } from './teamsMeeting'

const db = admin.firestore()

// ============================================================================
// TYPES
// ============================================================================

interface SendMessageRequest {
  candidateId: string
  candidateName: string
  candidateEmail: string
  content: string
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateReplyToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

async function sendEmailViaGraph(
  accessToken: string,
  organizerUserId: string,
  to: string,
  toName: string,
  subject: string,
  htmlBody: string
): Promise<{ success: boolean; error?: string }> {
  const graphUrl = `https://graph.microsoft.com/v1.0/users/${organizerUserId}/sendMail`

  const emailRequest = {
    message: {
      subject,
      body: {
        contentType: 'HTML',
        content: htmlBody
      },
      toRecipients: [
        {
          emailAddress: {
            address: to,
            name: toName
          }
        }
      ],
      importance: 'normal'
    },
    saveToSentItems: true
  }

  const response = await fetch(graphUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailRequest),
  })

  if (!response.ok) {
    const errorData = await response.text()
    console.error('Failed to send email via Graph:', errorData)
    return { success: false, error: `Failed to send email: ${response.status}` }
  }

  return { success: true }
}

function buildMessageEmailHtml(
  content: string,
  candidateName: string,
  replyUrl: string
): string {
  const firstName = candidateName?.split(' ')[0] || candidateName || 'there'
  const escapedContent = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
    .container { background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { border-bottom: 2px solid #0d4f5c; padding-bottom: 16px; margin-bottom: 24px; }
    .header h1 { color: #0d4f5c; font-size: 20px; margin: 0; }
    .greeting { font-size: 16px; color: #333; margin-bottom: 20px; }
    .message-content { background: #f8f9fa; border-left: 4px solid #0d4f5c; padding: 16px 20px; margin: 20px 0; border-radius: 0 8px 8px 0; font-size: 15px; }
    .reply-section { background: linear-gradient(135deg, #0d4f5c 0%, #1a6b7a 100%); border-radius: 12px; padding: 24px; margin: 28px 0; text-align: center; }
    .reply-section p { color: rgba(255,255,255,0.9); margin: 0 0 16px 0; font-size: 14px; }
    .reply-button { display: inline-block; background: white; color: #0d4f5c; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
    .reply-button:hover { background: #f0f0f0; }
    .notice { font-size: 12px; color: #888; margin-top: 8px; }
    .footer { border-top: 1px solid #eee; padding-top: 20px; margin-top: 28px; text-align: center; color: #666; font-size: 13px; }
    .footer a { color: #0d4f5c; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Allied Pharmacies Recruitment</h1>
    </div>

    <p class="greeting">Hi ${firstName},</p>

    <div class="message-content">
      ${escapedContent}
    </div>

    <div class="reply-section">
      <p>Click the button below to send us a reply</p>
      <a href="${replyUrl}" class="reply-button">Reply to Message</a>
      <p class="notice">This link can only be used once</p>
    </div>

    <div class="footer">
      <p>Allied Pharmacies Recruitment Team</p>
      <p><a href="mailto:recruitment@alliedpharmacies.com">recruitment@alliedpharmacies.com</a></p>
    </div>
  </div>
</body>
</html>`
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

// ============================================================================
// VALIDATE REPLY TOKEN
// ============================================================================

interface ValidateReplyTokenRequest {
  token: string
}

export const validateMessageReplyToken = onCall<ValidateReplyTokenRequest>(
  {
    cors: true,
    region: 'europe-west2',
  },
  async (request) => {
    const { token } = request.data

    if (!token) {
      return { valid: false, error: 'Token is required' }
    }

    try {
      const tokenDoc = await db.collection('messageReplyTokens').doc(token).get()

      if (!tokenDoc.exists) {
        return { valid: false, error: 'Invalid token' }
      }

      const tokenData = tokenDoc.data()!

      if (tokenData.used) {
        return { valid: false, error: 'This link has already been used' }
      }

      // Check expiry
      const expiresAt = tokenData.expiresAt?.toDate()
      if (expiresAt && expiresAt < new Date()) {
        return { valid: false, error: 'This link has expired' }
      }

      // Get the original message
      const messageDoc = await db.collection('candidateMessages').doc(tokenData.messageId).get()
      const originalMessage = messageDoc.exists ? messageDoc.data()?.content : null

      return {
        valid: true,
        candidateName: tokenData.candidateName,
        originalMessage,
      }
    } catch (error) {
      console.error('Error validating reply token:', error)
      return { valid: false, error: 'Failed to validate token' }
    }
  }
)

// ============================================================================
// SUBMIT MESSAGE REPLY
// ============================================================================

interface SubmitReplyRequest {
  token: string
  content: string
}

export const submitMessageReply = onCall<SubmitReplyRequest>(
  {
    cors: true,
    region: 'europe-west2',
  },
  async (request) => {
    const { token, content } = request.data

    if (!token || !content?.trim()) {
      throw new HttpsError('invalid-argument', 'Token and content are required')
    }

    try {
      const tokenDoc = await db.collection('messageReplyTokens').doc(token).get()

      if (!tokenDoc.exists) {
        throw new HttpsError('not-found', 'Invalid token')
      }

      const tokenData = tokenDoc.data()!

      if (tokenData.used) {
        throw new HttpsError('already-exists', 'This link has already been used')
      }

      // Check expiry
      const expiresAt = tokenData.expiresAt?.toDate()
      if (expiresAt && expiresAt < new Date()) {
        throw new HttpsError('deadline-exceeded', 'This link has expired')
      }

      // Create the reply message
      await db.collection('candidateMessages').add({
        candidateId: tokenData.candidateId,
        type: 'inbound',
        content: content.trim(),
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        replyToToken: token,
      })

      // Mark token as used
      await db.collection('messageReplyTokens').doc(token).update({
        used: true,
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      // Log activity
      await db.collection('candidates').doc(tokenData.candidateId).collection('activity').add({
        type: 'message_received',
        description: 'Candidate replied to message',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        performedBy: 'candidate',
      })

      console.log(`Reply received from candidate ${tokenData.candidateId}`)

      return { success: true }
    } catch (error) {
      if (error instanceof HttpsError) throw error
      console.error('Error submitting reply:', error)
      throw new HttpsError('internal', 'Failed to submit reply')
    }
  }
)

// ============================================================================
// SEND CANDIDATE MESSAGE
// ============================================================================

export const sendCandidateMessage = onCall<SendMessageRequest>(
  {
    cors: true,
    region: 'europe-west2',
    secrets: [msClientId, msClientSecret, msTenantId, msOrganizerUserId],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in to send messages')
    }

    const { candidateId, candidateEmail, content } = request.data
    const candidateName = request.data.candidateName || 'Candidate'

    if (!candidateId || !candidateEmail || !content) {
      throw new HttpsError('invalid-argument', 'Missing required fields')
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(candidateEmail)) {
      throw new HttpsError('invalid-argument', 'Invalid email address')
    }

    try {
      const clientId = msClientId.value()
      const clientSecret = msClientSecret.value()
      const tenantId = msTenantId.value()
      const organizerUserId = msOrganizerUserId.value()

      if (!clientId || !clientSecret || !tenantId || !organizerUserId) {
        throw new HttpsError('failed-precondition', 'Email integration not configured')
      }

      // Get sender info
      const userDoc = await db.collection('users').doc(request.auth.uid).get()
      const userData = userDoc.data()
      const senderName = userData?.displayName || userData?.email || 'Recruitment Team'

      // Generate reply token
      const replyToken = generateReplyToken()
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7) // 7 day expiry

      // Create message document
      const messageRef = await db.collection('candidateMessages').add({
        candidateId,
        type: 'outbound',
        content: content.trim(),
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        sentBy: request.auth.uid,
        sentByName: senderName,
        replyToken,
        emailSent: false, // Will be set to true after email sends
      })

      // Store reply token
      await db.collection('messageReplyTokens').doc(replyToken).set({
        messageId: messageRef.id,
        candidateId,
        candidateName,
        candidateEmail,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        used: false,
      })

      // Build email
      const replyUrl = `https://allied-booking.web.app/reply/${replyToken}`
      const subject = 'Message from Allied Pharmacies Recruitment'
      const htmlBody = buildMessageEmailHtml(content, candidateName, replyUrl)

      // Send email
      const accessToken = await getAccessToken(clientId, clientSecret, tenantId)
      const result = await sendEmailViaGraph(
        accessToken,
        organizerUserId,
        candidateEmail,
        candidateName,
        subject,
        htmlBody
      )

      if (!result.success) {
        // Mark message as failed
        await messageRef.update({ emailSent: false, emailError: result.error })
        throw new Error(result.error || 'Failed to send email')
      }

      // Mark email as sent
      await messageRef.update({ emailSent: true })

      // Log activity
      await db.collection('candidates').doc(candidateId).collection('activity').add({
        type: 'message_sent',
        description: `Message sent to candidate`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        performedBy: request.auth.uid,
        metadata: {
          messageId: messageRef.id,
        },
      })

      console.log(`Message sent to ${candidateEmail} (message: ${messageRef.id})`)

      return {
        success: true,
        messageId: messageRef.id,
      }

    } catch (error) {
      console.error('Error sending message:', error)
      throw new HttpsError('internal', error instanceof Error ? error.message : 'Failed to send message')
    }
  }
)

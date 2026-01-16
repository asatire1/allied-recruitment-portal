/**
 * User Invite Functions
 * Handles user invitations and password resets via email links
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import * as crypto from 'crypto'
import { msClientId, msClientSecret, msTenantId, msOrganizerUserId, getAccessToken } from './teamsMeeting'

const db = admin.firestore()

// ============================================================================
// TYPES
// ============================================================================

interface CreateUserInviteRequest {
  email: string
  role: string
  branchIds?: string[]
  entityIds?: string[]
}

interface ValidateTokenRequest {
  token: string
}

interface CompleteRegistrationRequest {
  token: string
  firstName: string
  lastName: string
  password: string
  phone?: string
}

interface RequestPasswordResetRequest {
  email: string
}

interface CompletePasswordResetRequest {
  token: string
  newPassword: string
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generate a secure random token
 */
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Hash a token for secure storage
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Validate token format
 */
function isValidTokenFormat(token: string): boolean {
  return /^[a-zA-Z0-9]{10,64}$/.test(token)
}

/**
 * Send email via Microsoft Graph
 */
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

/**
 * Format role for display
 */
function formatRole(role: string): string {
  const roleMap: Record<string, string> = {
    'super_admin': 'Super Admin',
    'admin': 'Admin',
    'recruiter': 'Recruiter',
    'branch_manager': 'Branch Manager',
    'viewer': 'Viewer',
  }
  return roleMap[role] || role
}

// ============================================================================
// CREATE USER INVITE
// ============================================================================

export const createUserInvite = onCall<CreateUserInviteRequest>(
  {
    cors: [
      'https://allied-recruitment.web.app',
      'https://recruitment-633bd.web.app',
      'http://localhost:3000',
      'http://localhost:5173',
    ],
    region: 'europe-west2',
    secrets: [msClientId, msClientSecret, msTenantId, msOrganizerUserId],
  },
  async (request) => {
    // Require authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated to invite users')
    }

    const { email, role, branchIds, entityIds } = request.data

    // Validate required fields
    if (!email || !role) {
      throw new HttpsError('invalid-argument', 'Missing required fields: email, role')
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      throw new HttpsError('invalid-argument', 'Invalid email format')
    }

    // Check if caller has admin privileges
    const callerDoc = await db.collection('users').doc(request.auth.uid).get()
    const callerRole = callerDoc.data()?.role
    if (!['super_admin', 'admin'].includes(callerRole)) {
      throw new HttpsError('permission-denied', 'Only admins can invite users')
    }

    // Check if user already exists
    const existingUsers = await db.collection('users')
      .where('email', '==', email.toLowerCase())
      .limit(1)
      .get()

    if (!existingUsers.empty) {
      throw new HttpsError('already-exists', 'A user with this email already exists')
    }

    // Check for existing active invite
    const existingInvites = await db.collection('userInvites')
      .where('email', '==', email.toLowerCase())
      .where('status', '==', 'active')
      .limit(1)
      .get()

    if (!existingInvites.empty) {
      // Delete old invite and create new one
      await existingInvites.docs[0].ref.delete()
    }

    try {
      // Generate token
      const token = generateToken()
      const tokenHash = hashToken(token)

      // Calculate expiry (7 days)
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7)

      // Create invite document
      const inviteRef = await db.collection('userInvites').add({
        tokenHash,
        email: email.toLowerCase(),
        role,
        branchIds: branchIds || [],
        entityIds: entityIds || [],
        status: 'active',
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
      })

      // Create pending user document so they appear in user list
      await db.collection('users').doc(`pending_${inviteRef.id}`).set({
        email: email.toLowerCase(),
        displayName: email.toLowerCase(), // Will be updated when they register
        role,
        branchIds: branchIds || [],
        entities: entityIds || [],
        status: 'invited',
        active: false,
        inviteId: inviteRef.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
      })

      // Build registration link
      const registrationLink = `https://allied-recruitment.web.app/register/${token}`

      // Get access token for MS Graph
      const accessToken = await getAccessToken(
        msClientId.value(),
        msClientSecret.value(),
        msTenantId.value()
      )

      // Build email HTML
      const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
    <h1 style="color: #0d4f5c; margin-bottom: 20px;">You're Invited!</h1>

    <p>You've been invited to join the <strong>Allied Recruitment Portal</strong> as a <strong>${formatRole(role)}</strong>.</p>

    <p>Click the button below to complete your registration:</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${registrationLink}"
         style="background-color: #0d4f5c; color: white !important; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        Complete Registration
      </a>
    </div>

    <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: #0066cc; font-size: 14px;">
      <a href="${registrationLink}" style="color: #0066cc !important;">${registrationLink}</a>
    </p>

    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

    <p style="color: #888; font-size: 12px;">
      This invitation expires in 7 days. If you didn't expect this invitation, you can safely ignore this email.
    </p>
  </div>
</body>
</html>
      `.trim()

      // Send email
      const emailResult = await sendEmailViaGraph(
        accessToken,
        msOrganizerUserId.value(),
        email,
        email,
        "You're invited to Allied Recruitment Portal",
        htmlBody
      )

      if (!emailResult.success) {
        throw new Error(emailResult.error || 'Failed to send invitation email')
      }

      console.log(`User invite created and sent to: ${email}`)

      return {
        success: true,
        message: `Invitation sent to ${email}`,
      }
    } catch (error: any) {
      console.error('Error creating user invite:', error)
      throw new HttpsError('internal', error.message || 'Failed to create invitation')
    }
  }
)

// ============================================================================
// RESEND USER INVITE
// ============================================================================

interface ResendUserInviteRequest {
  email: string
}

export const resendUserInvite = onCall<ResendUserInviteRequest>(
  {
    cors: [
      'https://allied-recruitment.web.app',
      'https://recruitment-633bd.web.app',
      'http://localhost:3000',
      'http://localhost:5173',
    ],
    region: 'europe-west2',
    secrets: [msClientId, msClientSecret, msTenantId, msOrganizerUserId],
  },
  async (request) => {
    // Require authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated to resend invites')
    }

    const { email } = request.data

    if (!email) {
      throw new HttpsError('invalid-argument', 'Email is required')
    }

    // Check if caller has admin privileges
    const callerDoc = await db.collection('users').doc(request.auth.uid).get()
    const callerRole = callerDoc.data()?.role
    if (!['super_admin', 'admin'].includes(callerRole)) {
      throw new HttpsError('permission-denied', 'Only admins can resend invites')
    }

    try {
      // Find existing active invite for this email
      const existingInvites = await db.collection('userInvites')
        .where('email', '==', email.toLowerCase())
        .where('status', '==', 'active')
        .limit(1)
        .get()

      if (existingInvites.empty) {
        throw new HttpsError('not-found', 'No active invitation found for this email')
      }

      const inviteDoc = existingInvites.docs[0]
      const inviteData = inviteDoc.data()

      // Generate new token
      const token = generateToken()
      const tokenHash = hashToken(token)

      // Calculate new expiry (7 days)
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7)

      // Update invite with new token and expiry
      await inviteDoc.ref.update({
        tokenHash,
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        resentBy: request.auth.uid,
        resentAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      // Build registration link
      const registrationLink = `https://allied-recruitment.web.app/register/${token}`

      // Get access token for MS Graph
      const accessToken = await getAccessToken(
        msClientId.value(),
        msClientSecret.value(),
        msTenantId.value()
      )

      // Build email HTML
      const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
    <h1 style="color: #0d4f5c; margin-bottom: 20px;">Invitation Reminder</h1>

    <p>This is a reminder that you've been invited to join the <strong>Allied Recruitment Portal</strong> as a <strong>${formatRole(inviteData.role)}</strong>.</p>

    <p>Click the button below to complete your registration:</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${registrationLink}"
         style="background-color: #0d4f5c; color: white !important; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        Complete Registration
      </a>
    </div>

    <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: #0066cc; font-size: 14px;">
      <a href="${registrationLink}" style="color: #0066cc !important;">${registrationLink}</a>
    </p>

    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

    <p style="color: #888; font-size: 12px;">
      This invitation expires in 7 days. If you didn't expect this invitation, you can safely ignore this email.
    </p>
  </div>
</body>
</html>
      `.trim()

      // Send email
      const emailResult = await sendEmailViaGraph(
        accessToken,
        msOrganizerUserId.value(),
        email,
        email,
        "Reminder: You're invited to Allied Recruitment Portal",
        htmlBody
      )

      if (!emailResult.success) {
        throw new Error(emailResult.error || 'Failed to send invitation email')
      }

      console.log(`User invite resent to: ${email}`)

      return {
        success: true,
        message: `Invitation resent to ${email}`,
      }
    } catch (error: any) {
      console.error('Error resending user invite:', error)
      if (error instanceof HttpsError) throw error
      throw new HttpsError('internal', error.message || 'Failed to resend invitation')
    }
  }
)

// ============================================================================
// VALIDATE USER INVITE
// ============================================================================

export const validateUserInvite = onCall<ValidateTokenRequest>(
  {
    cors: true,
    region: 'europe-west2',
    invoker: 'public',
  },
  async (request) => {
    const { token } = request.data

    // Validate token format
    if (!token || !isValidTokenFormat(token)) {
      throw new HttpsError('not-found', 'Invalid or expired invitation link')
    }

    try {
      // Hash and lookup
      const tokenHash = hashToken(token)
      const snapshot = await db.collection('userInvites')
        .where('tokenHash', '==', tokenHash)
        .limit(1)
        .get()

      if (snapshot.empty) {
        throw new HttpsError('not-found', 'Invalid or expired invitation link')
      }

      const doc = snapshot.docs[0]
      const invite = doc.data()

      // Check status
      if (invite.status !== 'active') {
        throw new HttpsError('not-found', 'Invalid or expired invitation link')
      }

      // Check expiry
      if (invite.expiresAt.toDate() < new Date()) {
        await doc.ref.update({ status: 'expired' })
        throw new HttpsError('not-found', 'Invalid or expired invitation link')
      }

      return {
        valid: true,
        data: {
          email: invite.email,
          role: formatRole(invite.role),
        }
      }
    } catch (error: any) {
      if (error instanceof HttpsError) throw error
      console.error('Error validating invite:', error)
      throw new HttpsError('not-found', 'Invalid or expired invitation link')
    }
  }
)

// ============================================================================
// COMPLETE USER REGISTRATION
// ============================================================================

export const completeUserRegistration = onCall<CompleteRegistrationRequest>(
  {
    cors: true,
    region: 'europe-west2',
    invoker: 'public',
  },
  async (request) => {
    const { token, firstName, lastName, password, phone } = request.data

    // Validate required fields
    if (!token || !firstName || !lastName || !password) {
      throw new HttpsError('invalid-argument', 'Missing required fields')
    }

    // Validate password
    if (password.length < 6) {
      throw new HttpsError('invalid-argument', 'Password must be at least 6 characters')
    }

    // Validate token format
    if (!isValidTokenFormat(token)) {
      throw new HttpsError('not-found', 'Invalid or expired invitation link')
    }

    try {
      // Hash and lookup
      const tokenHash = hashToken(token)
      const snapshot = await db.collection('userInvites')
        .where('tokenHash', '==', tokenHash)
        .limit(1)
        .get()

      if (snapshot.empty) {
        throw new HttpsError('not-found', 'Invalid or expired invitation link')
      }

      const doc = snapshot.docs[0]
      const invite = doc.data()

      // Check status
      if (invite.status !== 'active') {
        throw new HttpsError('not-found', 'Invalid or expired invitation link')
      }

      // Check expiry
      if (invite.expiresAt.toDate() < new Date()) {
        await doc.ref.update({ status: 'expired' })
        throw new HttpsError('not-found', 'Invalid or expired invitation link')
      }

      // Create Firebase Auth user
      const userRecord = await admin.auth().createUser({
        email: invite.email,
        password,
        displayName: `${firstName} ${lastName}`,
      })

      // Delete the pending user document (created when invite was sent)
      const pendingUserRef = db.collection('users').doc(`pending_${doc.id}`)
      await pendingUserRef.delete()

      // Create Firestore user document with real UID
      await db.collection('users').doc(userRecord.uid).set({
        email: invite.email,
        displayName: `${firstName} ${lastName}`,
        firstName,
        lastName,
        phone: phone || null,
        role: invite.role,
        entities: invite.entityIds || [],
        branchIds: invite.branchIds || [],
        emailNotifications: true,
        pushNotifications: true,
        status: 'active',
        active: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      // Mark invite as used
      await doc.ref.update({
        status: 'used',
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
        userId: userRecord.uid,
      })

      console.log(`User registered: ${invite.email} (${userRecord.uid})`)

      return {
        success: true,
        message: 'Registration complete! You can now sign in.',
      }
    } catch (error: any) {
      console.error('Error completing registration:', error)

      if (error.code === 'auth/email-already-exists') {
        throw new HttpsError('already-exists', 'An account with this email already exists')
      }

      if (error instanceof HttpsError) throw error
      throw new HttpsError('internal', 'Failed to complete registration')
    }
  }
)

// ============================================================================
// REQUEST PASSWORD RESET
// ============================================================================

export const requestPasswordReset = onCall<RequestPasswordResetRequest>(
  {
    cors: true,
    region: 'europe-west2',
    invoker: 'public',
    secrets: [msClientId, msClientSecret, msTenantId, msOrganizerUserId],
  },
  async (request) => {
    const { email } = request.data

    // Validate email
    if (!email) {
      throw new HttpsError('invalid-argument', 'Email is required')
    }

    // Always return success for security (don't reveal if email exists)
    try {
      // Find user
      const usersSnapshot = await db.collection('users')
        .where('email', '==', email.toLowerCase())
        .limit(1)
        .get()

      if (usersSnapshot.empty) {
        // Don't reveal that user doesn't exist
        console.log(`Password reset requested for non-existent email: ${email}`)
        return { success: true, message: 'If an account exists with this email, a reset link has been sent.' }
      }

      const userDoc = usersSnapshot.docs[0]
      const userData = userDoc.data()

      // Delete any existing reset tokens for this user
      const existingTokens = await db.collection('passwordResets')
        .where('email', '==', email.toLowerCase())
        .where('status', '==', 'active')
        .get()

      const batch = db.batch()
      existingTokens.docs.forEach(doc => {
        batch.update(doc.ref, { status: 'expired' })
      })
      await batch.commit()

      // Generate token
      const token = generateToken()
      const tokenHash = hashToken(token)

      // Calculate expiry (24 hours)
      const expiresAt = new Date()
      expiresAt.setHours(expiresAt.getHours() + 24)

      // Create reset document
      await db.collection('passwordResets').add({
        tokenHash,
        email: email.toLowerCase(),
        userId: userDoc.id,
        status: 'active',
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      // Build reset link
      const resetLink = `https://allied-recruitment.web.app/reset-password/${token}`

      // Get access token for MS Graph
      const accessToken = await getAccessToken(
        msClientId.value(),
        msClientSecret.value(),
        msTenantId.value()
      )

      // Build email HTML
      const firstName = userData.firstName || userData.displayName?.split(' ')[0] || 'there'
      const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
    <h1 style="color: #0d4f5c; margin-bottom: 20px;">Reset Your Password</h1>

    <p>Hi ${firstName},</p>

    <p>We received a request to reset your password for the Allied Recruitment Portal.</p>

    <p>Click the button below to set a new password:</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetLink}"
         style="background-color: #0d4f5c; color: white !important; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        Reset Password
      </a>
    </div>

    <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: #0066cc; font-size: 14px;">
      <a href="${resetLink}" style="color: #0066cc !important;">${resetLink}</a>
    </p>

    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

    <p style="color: #888; font-size: 12px;">
      This link expires in 24 hours. If you didn't request a password reset, you can safely ignore this email.
    </p>
  </div>
</body>
</html>
      `.trim()

      // Send email
      await sendEmailViaGraph(
        accessToken,
        msOrganizerUserId.value(),
        email,
        userData.displayName || email,
        'Reset your Allied Recruitment Portal password',
        htmlBody
      )

      console.log(`Password reset email sent to: ${email}`)

      return { success: true, message: 'If an account exists with this email, a reset link has been sent.' }
    } catch (error: any) {
      console.error('Error requesting password reset:', error)
      // Still return success for security
      return { success: true, message: 'If an account exists with this email, a reset link has been sent.' }
    }
  }
)

// ============================================================================
// VALIDATE PASSWORD RESET
// ============================================================================

export const validatePasswordReset = onCall<ValidateTokenRequest>(
  {
    cors: true,
    region: 'europe-west2',
    invoker: 'public',
  },
  async (request) => {
    const { token } = request.data

    // Validate token format
    if (!token || !isValidTokenFormat(token)) {
      throw new HttpsError('not-found', 'Invalid or expired reset link')
    }

    try {
      // Hash and lookup
      const tokenHash = hashToken(token)
      const snapshot = await db.collection('passwordResets')
        .where('tokenHash', '==', tokenHash)
        .limit(1)
        .get()

      if (snapshot.empty) {
        throw new HttpsError('not-found', 'Invalid or expired reset link')
      }

      const doc = snapshot.docs[0]
      const reset = doc.data()

      // Check status
      if (reset.status !== 'active') {
        throw new HttpsError('not-found', 'Invalid or expired reset link')
      }

      // Check expiry
      if (reset.expiresAt.toDate() < new Date()) {
        await doc.ref.update({ status: 'expired' })
        throw new HttpsError('not-found', 'Invalid or expired reset link')
      }

      return {
        valid: true,
        data: {
          email: reset.email,
        }
      }
    } catch (error: any) {
      if (error instanceof HttpsError) throw error
      console.error('Error validating reset token:', error)
      throw new HttpsError('not-found', 'Invalid or expired reset link')
    }
  }
)

// ============================================================================
// COMPLETE PASSWORD RESET
// ============================================================================

export const completePasswordReset = onCall<CompletePasswordResetRequest>(
  {
    cors: true,
    region: 'europe-west2',
    invoker: 'public',
  },
  async (request) => {
    const { token, newPassword } = request.data

    // Validate required fields
    if (!token || !newPassword) {
      throw new HttpsError('invalid-argument', 'Missing required fields')
    }

    // Validate password
    if (newPassword.length < 6) {
      throw new HttpsError('invalid-argument', 'Password must be at least 6 characters')
    }

    // Validate token format
    if (!isValidTokenFormat(token)) {
      throw new HttpsError('not-found', 'Invalid or expired reset link')
    }

    try {
      // Hash and lookup
      const tokenHash = hashToken(token)
      const snapshot = await db.collection('passwordResets')
        .where('tokenHash', '==', tokenHash)
        .limit(1)
        .get()

      if (snapshot.empty) {
        throw new HttpsError('not-found', 'Invalid or expired reset link')
      }

      const doc = snapshot.docs[0]
      const reset = doc.data()

      // Check status
      if (reset.status !== 'active') {
        throw new HttpsError('not-found', 'Invalid or expired reset link')
      }

      // Check expiry
      if (reset.expiresAt.toDate() < new Date()) {
        await doc.ref.update({ status: 'expired' })
        throw new HttpsError('not-found', 'Invalid or expired reset link')
      }

      // Update password in Firebase Auth
      await admin.auth().updateUser(reset.userId, {
        password: newPassword,
      })

      // Mark token as used
      await doc.ref.update({
        status: 'used',
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      // Update user's updatedAt
      await db.collection('users').doc(reset.userId).update({
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      console.log(`Password reset completed for: ${reset.email}`)

      return {
        success: true,
        message: 'Password updated successfully! You can now sign in.',
      }
    } catch (error: any) {
      console.error('Error completing password reset:', error)
      if (error instanceof HttpsError) throw error
      throw new HttpsError('internal', 'Failed to reset password')
    }
  }
)

// ============================================================================
// ADMIN SEND PASSWORD RESET (for admins to trigger reset for any user)
// ============================================================================

interface AdminSendPasswordResetRequest {
  email: string
}

export const adminSendPasswordReset = onCall<AdminSendPasswordResetRequest>(
  {
    cors: [
      'https://allied-recruitment.web.app',
      'https://recruitment-633bd.web.app',
      'http://localhost:3000',
      'http://localhost:5173',
    ],
    region: 'europe-west2',
    secrets: [msClientId, msClientSecret, msTenantId, msOrganizerUserId],
  },
  async (request) => {
    // Require authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated')
    }

    const { email } = request.data

    if (!email) {
      throw new HttpsError('invalid-argument', 'Email is required')
    }

    // Check if caller has admin privileges
    const callerDoc = await db.collection('users').doc(request.auth.uid).get()
    const callerRole = callerDoc.data()?.role
    if (!['super_admin', 'admin'].includes(callerRole)) {
      throw new HttpsError('permission-denied', 'Only admins can send password resets')
    }

    try {
      // Find user
      const usersSnapshot = await db.collection('users')
        .where('email', '==', email.toLowerCase())
        .limit(1)
        .get()

      if (usersSnapshot.empty) {
        throw new HttpsError('not-found', 'User not found')
      }

      const userDoc = usersSnapshot.docs[0]
      const userData = userDoc.data()

      // Delete any existing reset tokens for this user
      const existingTokens = await db.collection('passwordResets')
        .where('email', '==', email.toLowerCase())
        .where('status', '==', 'active')
        .get()

      const batch = db.batch()
      existingTokens.docs.forEach(doc => {
        batch.update(doc.ref, { status: 'expired' })
      })
      await batch.commit()

      // Generate token
      const token = generateToken()
      const tokenHash = hashToken(token)

      // Calculate expiry (24 hours)
      const expiresAt = new Date()
      expiresAt.setHours(expiresAt.getHours() + 24)

      // Create reset document
      await db.collection('passwordResets').add({
        tokenHash,
        email: email.toLowerCase(),
        userId: userDoc.id,
        status: 'active',
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        triggeredBy: request.auth.uid,
        isAdminTriggered: true,
      })

      // Build reset link
      const resetLink = `https://allied-recruitment.web.app/reset-password/${token}`

      // Get access token for MS Graph
      const accessToken = await getAccessToken(
        msClientId.value(),
        msClientSecret.value(),
        msTenantId.value()
      )

      // Build email HTML
      const firstName = userData.firstName || userData.displayName?.split(' ')[0] || 'there'
      const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
    <h1 style="color: #0d4f5c; margin-bottom: 20px;">Reset Your Password</h1>

    <p>Hi ${firstName},</p>

    <p>An administrator has requested a password reset for your Allied Recruitment Portal account.</p>

    <p>Click the button below to set a new password:</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetLink}"
         style="background-color: #0d4f5c; color: white !important; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        Reset Password
      </a>
    </div>

    <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: #0066cc; font-size: 14px;">
      <a href="${resetLink}" style="color: #0066cc !important;">${resetLink}</a>
    </p>

    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

    <p style="color: #888; font-size: 12px;">
      This link expires in 24 hours. If you didn't expect this, please contact your administrator.
    </p>
  </div>
</body>
</html>
      `.trim()

      // Send email
      const emailResult = await sendEmailViaGraph(
        accessToken,
        msOrganizerUserId.value(),
        email,
        userData.displayName || email,
        'Reset your Allied Recruitment Portal password',
        htmlBody
      )

      if (!emailResult.success) {
        throw new Error(emailResult.error || 'Failed to send password reset email')
      }

      console.log(`Admin-triggered password reset email sent to: ${email}`)

      return {
        success: true,
        message: `Password reset email sent to ${email}`
      }
    } catch (error: any) {
      console.error('Error sending admin password reset:', error)
      if (error instanceof HttpsError) throw error
      throw new HttpsError('internal', error.message || 'Failed to send password reset email')
    }
  }
)

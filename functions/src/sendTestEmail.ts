/**
 * Send Test Email Cloud Function
 * Phase 5: Allows users to test email templates with sample data
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'

// Define secrets for Microsoft Graph API
const msClientId = defineSecret('MS_CLIENT_ID')
const msClientSecret = defineSecret('MS_CLIENT_SECRET')
const msTenantId = defineSecret('MS_TENANT_ID')
const msOrganizerUserId = defineSecret('MS_ORGANIZER_USER_ID')

// ============================================================================
// EMAIL WRAPPER (inlined)
// ============================================================================

const DEFAULT_EMAIL_WRAPPER = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{subject}}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .email-container { max-width: 600px; margin: 0 auto; background: white; }
    .header { background-color: #003366; color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .header p { margin: 8px 0 0; opacity: 0.9; }
    .content { padding: 32px 24px; }
    .content p { margin: 0 0 16px; }
    .details-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0; }
    .btn { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 8px 0; }
    .footer { background: #f8fafc; padding: 24px; text-align: center; color: #64748b; font-size: 14px; border-top: 1px solid #e2e8f0; }
    .footer p { margin: 4px 0; }
  </style>
</head>
<body>
  <div class="email-container">
    {{content}}
    <div class="footer">
      <p><strong>Allied Pharmacies</strong></p>
      <p>recruitment@alliedpharmacies.com</p>
      <p style="font-size: 12px; margin-top: 12px;">This is an automated message from the Allied Recruitment Portal.</p>
    </div>
  </div>
</body>
</html>`

// ============================================================================
// TYPES
// ============================================================================

interface SendTestEmailRequest {
  to: string
  subject: string
  plainContent: string
  htmlContent?: string
  templateName: string
}

interface SendTestEmailResponse {
  success: boolean
  error?: string
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
    const errorText = await response.text()
    console.error('Token request failed:', errorText)
    throw new Error(`Failed to get access token: ${response.status}`)
  }
  
  const data = await response.json() as { access_token: string }
  return data.access_token
}

// ============================================================================
// CLOUD FUNCTION
// ============================================================================

export const sendTestEmail = onCall<SendTestEmailRequest, Promise<SendTestEmailResponse>>(
  {
    cors: true,
    region: 'europe-west2',
    secrets: [msClientId, msClientSecret, msTenantId, msOrganizerUserId],
  },
  async (request) => {
    // Require authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated to send test emails')
    }

    const { to, subject, plainContent, htmlContent, templateName } = request.data

    // Validate inputs
    if (!to || !subject || !plainContent) {
      throw new HttpsError('invalid-argument', 'Missing required fields: to, subject, plainContent')
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(to)) {
      throw new HttpsError('invalid-argument', 'Invalid email address')
    }

    try {
      // Get secrets
      const clientId = msClientId.value()
      const clientSecret = msClientSecret.value()
      const tenantId = msTenantId.value()
      const organizerUserId = msOrganizerUserId.value()

      if (!clientId || !clientSecret || !tenantId || !organizerUserId) {
        console.error('Microsoft Graph API secrets not configured')
        return { success: false, error: 'Email integration not configured' }
      }

      // Get access token
      const accessToken = await getAccessToken(clientId, clientSecret, tenantId)

      // Build email body
      let emailBody: string
      if (htmlContent) {
        // Wrap HTML content in email wrapper
        emailBody = DEFAULT_EMAIL_WRAPPER
          .replace('{{subject}}', subject)
          .replace('{{content}}', htmlContent)
      } else {
        // Convert plain text to HTML
        const htmlParagraphs = plainContent
          .split('\n\n')
          .map((para: string) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
          .join('\n')
        
        emailBody = DEFAULT_EMAIL_WRAPPER
          .replace('{{subject}}', subject)
          .replace('{{content}}', `<div class="header"><h1>Test Email</h1><p>${templateName}</p></div><div class="content">${htmlParagraphs}</div>`)
      }

      // Send email via Graph API
      const graphUrl = `https://graph.microsoft.com/v1.0/users/${organizerUserId}/sendMail`

      const emailRequest = {
        message: {
          subject,
          body: {
            contentType: 'HTML',
            content: emailBody
          },
          toRecipients: [
            {
              emailAddress: {
                address: to
              }
            }
          ],
          importance: 'normal'
        },
        saveToSentItems: false
      }

      console.log(`Sending test email to: ${to} for template: ${templateName}`)

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
        console.error('Failed to send test email:', errorData)
        return { success: false, error: `Failed to send email: ${response.status}` }
      }

      console.log(`Test email sent successfully to ${to}`)
      return { success: true }

    } catch (error) {
      console.error('Error sending test email:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error sending email'
      }
    }
  }
)

/**
 * Email Functions
 * Send emails via Microsoft Graph API with tracking
 * Updated: Now uses HTML templates from Firestore messageTemplates collection
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import * as crypto from 'crypto'
import { msClientId, msClientSecret, msTenantId, msOrganizerUserId, getAccessToken } from './teamsMeeting'

const db = admin.firestore()

// ============================================================================
// TYPES
// ============================================================================

interface SendEmailRequest {
  to: string
  candidateId: string
  candidateName: string
  subject: string
  body: string
  templateId?: string
  templateName?: string
  type: 'interview' | 'trial' | 'offer' | 'rejection' | 'reminder' | 'general'
  // Optional fields for placeholder replacement
  bookingUrl?: string
  jobTitle?: string
  branchName?: string
}

interface SendBulkEmailRequest {
  candidates: Array<{
    id: string
    email: string
    firstName: string
    lastName: string
    jobTitle?: string
    branchName?: string
    bookingUrl?: string
  }>
  subject: string
  body: string
  templateId?: string
  templateName?: string
  type: 'interview' | 'trial'
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateTrackingId(): string {
  return crypto.randomBytes(16).toString('hex')
}

function replacePlaceholders(content: string, data: Record<string, string>): string {
  let result = content
  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
    result = result.replace(regex, value || '')
  }
  return result
}

function addTrackingToHtml(html: string, trackingId: string, baseUrl: string): string {
  const trackingPixel = '<img src="' + baseUrl + '/trackOpen?id=' + trackingId + '" width="1" height="1" style="display:none;" alt="" />'

  if (html.includes('{{trackingPixel}}')) {
    html = html.replace(/\{\{trackingPixel\}\}/g, trackingPixel)
  } else {
    html = html.replace('</body>', trackingPixel + '</body>')
  }

  // Add tracking to href URLs
  const urlRegex = /href="(https?:\/\/[^"]+)"/g
  html = html.replace(urlRegex, (match, url) => {
    if (url.includes('/trackClick?')) return match
    const encodedUrl = encodeURIComponent(url)
    return 'href="' + baseUrl + '/trackClick?id=' + trackingId + '&url=' + encodedUrl + '"'
  })

  // Ensure all links have visible styling (blue, underlined, bold)
  // This handles <a> tags that might have dark or invisible colors
  html = html.replace(/<a\s+([^>]*?)>/gi, (match, attrs) => {
    // Check if style attribute already exists
    if (attrs.includes('style=')) {
      // Add our styles to existing style attribute
      return match.replace(/style="([^"]*)"/i, 'style="$1; color: #0066cc !important; text-decoration: underline !important;"')
    } else {
      // Add new style attribute
      return '<a ' + attrs + ' style="color: #0066cc !important; text-decoration: underline !important;">'
    }
  })

  return html
}

function textToHtmlWithTracking(text: string, trackingId: string, baseUrl: string): string {
  let html = text.replace(/\n/g, '<br>')
  
  const urlRegex = /(https?:\/\/[^\s<]+)/g
  html = html.replace(urlRegex, (url) => {
    const encodedUrl = encodeURIComponent(url)
    return '<a href="' + baseUrl + '/trackClick?id=' + trackingId + '&url=' + encodedUrl + '" target="_blank" style="color: #0066cc; text-decoration: underline; font-weight: 600;">' + url + '</a>'
  })
  
  const trackingPixel = '<img src="' + baseUrl + '/trackOpen?id=' + trackingId + '" width="1" height="1" style="display:none;" alt="" />'
  
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; } a { color: #0d4f5c; }</style></head><body>' + html + '<br><br><p style="color: #666; font-size: 12px; border-top: 1px solid #eee; padding-top: 10px;">Allied Pharmacies Recruitment<br><a href="mailto:recruitment@alliedpharmacies.com">recruitment@alliedpharmacies.com</a></p>' + trackingPixel + '</body></html>'
}

async function getHtmlTemplate(templateId: string): Promise<string | null> {
  try {
    const templateDoc = await db.collection('messageTemplates').doc(templateId).get()
    if (templateDoc.exists) {
      const data = templateDoc.data()
      if (data?.htmlContent && data.htmlContent.trim() !== '') {
        return data.htmlContent
      }
    }
    return null
  } catch (error) {
    console.error('Error fetching HTML template:', error)
    return null
  }
}

async function getHtmlTemplateByType(emailType: string): Promise<{ htmlContent: string; templateId: string; templateName: string } | null> {
  try {
    const templateTypeMap: Record<string, string> = {
      'interview': 'interview_invitation',
      'trial': 'trial_invitation',
      'offer': 'job_offer',
      'rejection': 'rejection',
      'reminder': 'interview_reminder',
    }
    
    const templateType = templateTypeMap[emailType] || emailType
    
    const templatesQuery = await db.collection('messageTemplates')
      .where('templateType', '==', templateType)
      .where('active', '==', true)
      .limit(5)
      .get()
    
    for (const doc of templatesQuery.docs) {
      const data = doc.data()
      if (data.htmlContent && data.htmlContent.trim() !== '') {
        console.log('Auto-selected HTML template: ' + doc.id + ' (' + data.name + ') for type: ' + emailType)
        return {
          htmlContent: data.htmlContent,
          templateId: doc.id,
          templateName: data.name || 'Unknown Template'
        }
      }
    }
    
    console.log('No HTML template found for type: ' + emailType)
    return null
  } catch (error) {
    console.error('Error fetching HTML template by type:', error)
    return null
  }
}

async function sendEmailViaGraph(
  accessToken: string,
  organizerUserId: string,
  to: string,
  toName: string,
  subject: string,
  htmlBody: string,
  textBody: string
): Promise<{ success: boolean; error?: string }> {
  const graphUrl = 'https://graph.microsoft.com/v1.0/users/' + organizerUserId + '/sendMail'
  
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
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailRequest),
  })
  
  if (!response.ok) {
    const errorData = await response.text()
    console.error('Failed to send email via Graph:', errorData)
    return { success: false, error: 'Failed to send email: ' + response.status }
  }
  
  return { success: true }
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

export const sendCandidateEmail = onCall<SendEmailRequest>(
  {
    cors: true,
    region: 'europe-west2',
    secrets: [msClientId, msClientSecret, msTenantId, msOrganizerUserId],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in to send emails')
    }

    const { to, candidateId, candidateName, subject, body, templateId, templateName, type, bookingUrl, jobTitle, branchName } = request.data

    if (!to || !candidateId || !subject || !body) {
      throw new HttpsError('invalid-argument', 'Missing required fields')
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(to)) {
      throw new HttpsError('invalid-argument', 'Invalid email address')
    }

    try {
      const clientId = msClientId.value()
      const clientSecret = msClientSecret.value()
      const tenantId = msTenantId.value()
      const organizerUserId = msOrganizerUserId.value()
      
      if (!clientId || !clientSecret || !tenantId || !organizerUserId) {
        throw new HttpsError('failed-precondition', 'Email integration not configured. Microsoft Graph API credentials missing.')
      }
      
      const accessToken = await getAccessToken(clientId, clientSecret, tenantId)
      const trackingId = generateTrackingId()
      const baseUrl = 'https://europe-west2-recruitment-633bd.cloudfunctions.net'
      
      let htmlBody: string
      let usedTemplateId = templateId || null
      let usedTemplateName = templateName || null
      
      // Build placeholder data matching bulk email function for consistency
      const placeholderData: Record<string, string> = {
        firstName: candidateName.split(' ')[0] || candidateName,
        lastName: candidateName.split(' ').slice(1).join(' ') || '',
        fullName: candidateName,
        candidateName: candidateName,
        jobTitle: jobTitle || 'the position',
        branchName: branchName || 'Allied Pharmacies',
        interviewBookingLink: bookingUrl || '',
        trialBookingLink: bookingUrl || '',
        bookingLink: bookingUrl || '',
      }

      if (templateId) {
        const htmlTemplate = await getHtmlTemplate(templateId)
        if (htmlTemplate) {
          let personalizedHtml = replacePlaceholders(htmlTemplate, placeholderData)
          htmlBody = addTrackingToHtml(personalizedHtml, trackingId, baseUrl)
          console.log('Using HTML template: ' + templateId)
        } else {
          htmlBody = textToHtmlWithTracking(body, trackingId, baseUrl)
          console.log('Template ' + templateId + ' has no HTML content, using plain text')
        }
      } else {
        const autoTemplate = await getHtmlTemplateByType(type)
        if (autoTemplate) {
          let personalizedHtml = replacePlaceholders(autoTemplate.htmlContent, placeholderData)
          htmlBody = addTrackingToHtml(personalizedHtml, trackingId, baseUrl)
          usedTemplateId = autoTemplate.templateId
          usedTemplateName = autoTemplate.templateName
          console.log('Auto-selected HTML template: ' + autoTemplate.templateName)
        } else {
          htmlBody = textToHtmlWithTracking(body, trackingId, baseUrl)
        }
      }

      const result = await sendEmailViaGraph(
        accessToken,
        organizerUserId,
        to,
        candidateName,
        subject,
        htmlBody,
        body
      )
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to send email')
      }

      await db.collection('emailTracking').doc(trackingId).set({
        candidateId,
        candidateName,
        to,
        subject,
        templateId: usedTemplateId,
        templateName: usedTemplateName,
        type,
        sentBy: request.auth.uid,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        opened: false,
        openedAt: null,
        openCount: 0,
        clicked: false,
        clickedAt: null,
        clickCount: 0,
        clicks: [],
      })

      await db.collection('candidates').doc(candidateId).collection('activity').add({
        type: 'email_sent',
        description: 'Email sent: "' + subject + '"' + (usedTemplateName ? ' (template: ' + usedTemplateName + ')' : ''),
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        performedBy: request.auth.uid,
        metadata: {
          trackingId,
          templateId: usedTemplateId,
          templateName: usedTemplateName,
          emailType: type || null,
        },
      })

      console.log('Email sent to ' + to + ' (tracking: ' + trackingId + ')')

      return {
        success: true,
        trackingId,
      }

    } catch (error) {
      console.error('Error sending email:', error)
      throw new HttpsError('internal', error instanceof Error ? error.message : 'Failed to send email')
    }
  }
)

export const sendBulkCandidateEmails = onCall<SendBulkEmailRequest>(
  {
    cors: true,
    region: 'europe-west2',
    secrets: [msClientId, msClientSecret, msTenantId, msOrganizerUserId],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in to send emails')
    }

    const { candidates, subject, body, templateId, templateName, type } = request.data

    if (!candidates || candidates.length === 0) {
      throw new HttpsError('invalid-argument', 'No candidates provided')
    }

    if (candidates.length > 50) {
      throw new HttpsError('invalid-argument', 'Maximum 50 emails per batch')
    }

    const clientId = msClientId.value()
    const clientSecret = msClientSecret.value()
    const tenantId = msTenantId.value()
    const organizerUserId = msOrganizerUserId.value()
    
    if (!clientId || !clientSecret || !tenantId || !organizerUserId) {
      throw new HttpsError('failed-precondition', 'Email integration not configured')
    }
    
    const accessToken = await getAccessToken(clientId, clientSecret, tenantId)
    
    let htmlTemplate: string | null = null
    let usedTemplateId = templateId || null
    let usedTemplateName = templateName || null
    
    if (templateId) {
      htmlTemplate = await getHtmlTemplate(templateId)
      if (htmlTemplate) {
        console.log('Using HTML template for bulk email: ' + templateId)
      } else {
        console.log('Template ' + templateId + ' has no HTML content, using plain text for bulk')
      }
    } else {
      const autoTemplate = await getHtmlTemplateByType(type)
      if (autoTemplate) {
        htmlTemplate = autoTemplate.htmlContent
        usedTemplateId = autoTemplate.templateId
        usedTemplateName = autoTemplate.templateName
        console.log('Auto-selected HTML template for bulk: ' + autoTemplate.templateName)
      }
    }

    const results: Array<{
      candidateId: string
      success: boolean
      error?: string
      trackingId?: string
    }> = []

    const baseUrl = 'https://europe-west2-recruitment-633bd.cloudfunctions.net'

    for (const candidate of candidates) {
      try {
        if (!candidate.email) {
          results.push({
            candidateId: candidate.id,
            success: false,
            error: 'No email address',
          })
          continue
        }

        const placeholderData: Record<string, string> = {
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          fullName: candidate.firstName + ' ' + candidate.lastName,
          candidateName: candidate.firstName + ' ' + candidate.lastName,
          jobTitle: candidate.jobTitle || 'the position',
          branchName: candidate.branchName || 'Allied Pharmacies',
          interviewBookingLink: candidate.bookingUrl || '',
          trialBookingLink: candidate.bookingUrl || '',
          bookingLink: candidate.bookingUrl || '',
        }

        const personalizedSubject = replacePlaceholders(subject, placeholderData)
        const personalizedBody = replacePlaceholders(body, placeholderData)
        const trackingId = generateTrackingId()
        
        let htmlBody: string
        
        if (htmlTemplate) {
          let personalizedHtml = replacePlaceholders(htmlTemplate, placeholderData)
          htmlBody = addTrackingToHtml(personalizedHtml, trackingId, baseUrl)
        } else {
          htmlBody = textToHtmlWithTracking(personalizedBody, trackingId, baseUrl)
        }

        const sendResult = await sendEmailViaGraph(
          accessToken,
          organizerUserId,
          candidate.email,
          candidate.firstName + ' ' + candidate.lastName,
          personalizedSubject,
          htmlBody,
          personalizedBody
        )
        
        if (!sendResult.success) {
          results.push({
            candidateId: candidate.id,
            success: false,
            error: sendResult.error,
          })
          continue
        }

        await db.collection('emailTracking').doc(trackingId).set({
          candidateId: candidate.id,
          candidateName: candidate.firstName + ' ' + candidate.lastName,
          to: candidate.email,
          subject: personalizedSubject,
          templateId: usedTemplateId,
          templateName: usedTemplateName,
          type,
          sentBy: request.auth.uid,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          opened: false,
          openedAt: null,
          openCount: 0,
          clicked: false,
          clickedAt: null,
          clickCount: 0,
          clicks: [],
        })

        await db.collection('candidates').doc(candidate.id).collection('activity').add({
          type: 'email_sent',
          description: 'Email sent: "' + personalizedSubject + '"' + (usedTemplateName ? ' (template: ' + usedTemplateName + ')' : '') + ' (bulk)',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          performedBy: request.auth.uid,
          metadata: {
            trackingId,
            templateId: usedTemplateId,
            templateName: usedTemplateName,
            emailType: type || null,
            bulk: true,
          },
        })

        results.push({
          candidateId: candidate.id,
          success: true,
          trackingId,
        })

      } catch (error: any) {
        console.error('Error sending email to ' + candidate.email + ':', error)
        results.push({
          candidateId: candidate.id,
          success: false,
          error: error.message || 'Failed to send',
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    console.log('Bulk email: ' + successCount + '/' + candidates.length + ' sent successfully')

    return {
      success: true,
      total: candidates.length,
      sent: successCount,
      failed: candidates.length - successCount,
      results,
    }
  }
)

export const trackOpen = onRequest(
  {
    cors: true,
    region: 'europe-west2',
  },
  async (req, res) => {
    const trackingId = req.query.id as string

    if (trackingId) {
      try {
        const trackingRef = db.collection('emailTracking').doc(trackingId)
        const trackingDoc = await trackingRef.get()

        if (trackingDoc.exists) {
          await trackingRef.update({
            opened: true,
            openedAt: trackingDoc.data()?.openedAt || admin.firestore.FieldValue.serverTimestamp(),
            openCount: admin.firestore.FieldValue.increment(1),
          })
        }
      } catch (error) {
        console.error('Error tracking open:', error)
      }
    }

    const transparentGif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
    res.setHeader('Content-Type', 'image/gif')
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.send(transparentGif)
  }
)

export const trackClick = onRequest(
  {
    cors: true,
    region: 'europe-west2',
  },
  async (req, res) => {
    const trackingId = req.query.id as string
    const url = req.query.url as string

    if (!url) {
      res.status(400).send('Missing URL parameter')
      return
    }

    const decodedUrl = decodeURIComponent(url)

    if (trackingId) {
      try {
        const trackingRef = db.collection('emailTracking').doc(trackingId)
        const trackingDoc = await trackingRef.get()

        if (trackingDoc.exists) {
          await trackingRef.update({
            clicked: true,
            clickedAt: trackingDoc.data()?.clickedAt || admin.firestore.FieldValue.serverTimestamp(),
            clickCount: admin.firestore.FieldValue.increment(1),
            clicks: admin.firestore.FieldValue.arrayUnion({
              url: decodedUrl,
              timestamp: new Date().toISOString(),
            }),
          })
        }
      } catch (error) {
        console.error('Error tracking click:', error)
      }
    }

    res.redirect(302, decodedUrl)
  }
)

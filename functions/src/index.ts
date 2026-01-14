/**
 * Allied Recruitment Portal - Cloud Functions
 * R3.1: CV Parsing Cloud Function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { setGlobalOptions } from 'firebase-functions/v2/options'
import { defineSecret } from 'firebase-functions/params'
import * as admin from 'firebase-admin'
import Anthropic from '@anthropic-ai/sdk'
import * as mammoth from 'mammoth'
import pdfParse from 'pdf-parse'

// Define the secret
const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY')

// Initialize Firebase Admin
admin.initializeApp()

// Set global options
setGlobalOptions({
  region: 'us-central1', // Default region (matching existing functions)
  maxInstances: 10,
})

// Types
interface ParsedCV {
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  address: string | null
  postcode: string | null
  summary: string | null
  experience: ExperienceItem[]
  education: EducationItem[]
  qualifications: string[]
  skills: string[]
  rightToWork: boolean | null
  hasDriversLicense: boolean | null
  totalYearsExperience: number | null
  pharmacyYearsExperience: number | null
  confidence: {
    firstName: number
    lastName: number
    email: number
    phone: number
    overall: number
  }
  rawText: string
  usedAI?: boolean
}

interface ExperienceItem {
  title: string
  company: string
  startDate: string | null
  endDate: string | null
  current: boolean
  description: string | null
}

interface EducationItem {
  institution: string
  qualification: string
  field: string | null
  year: string | null
}

interface ParseCVRequest {
  fileUrl: string
  fileName: string
  mimeType: string
}

interface ParseCVResponse {
  success: boolean
  data?: ParsedCV
  error?: string
}

// ============================================================================
// TEXT EXTRACTION
// ============================================================================

/**
 * Extract text from PDF using pdf-parse
 */
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(buffer)
    return data.text
  } catch (error) {
    console.error('PDF extraction error:', error)
    throw new Error('Failed to extract text from PDF')
  }
}

/**
 * Extract text from DOCX using mammoth
 */
async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  } catch (error) {
    console.error('DOCX extraction error:', error)
    throw new Error('Failed to extract text from Word document')
  }
}

/**
 * Extract text from file based on MIME type
 */
async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf') {
    return extractTextFromPDF(buffer)
  } else if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    return extractTextFromDOCX(buffer)
  } else if (mimeType === 'text/plain') {
    return buffer.toString('utf-8')
  } else {
    throw new Error(`Unsupported file type: ${mimeType}`)
  }
}

// ============================================================================
// REGEX-BASED FALLBACK PARSING (No AI)
// ============================================================================

/**
 * Parse CV text using regex patterns (fallback when AI is unavailable)
 */
function parseWithRegex(text: string): ParsedCV {
  // Email pattern
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i)
  const email = emailMatch ? emailMatch[0].toLowerCase() : null

  // UK Phone patterns (mobile and landline)
  const phonePatterns = [
    /(?:(?:\+44\s?|0)7\d{3}\s?\d{3}\s?\d{3})/,  // Mobile: 07xxx xxx xxx or +44 7xxx xxx xxx
    /(?:(?:\+44\s?|0)\d{2,4}\s?\d{3}\s?\d{4})/,  // Landline: 01onal xxx xxxx
    /07\d{9}/,  // Mobile no spaces
    /(?:\+44|0)\s*\d[\d\s]{9,}/,  // General UK
  ]
  
  let phone: string | null = null
  for (const pattern of phonePatterns) {
    const match = text.match(pattern)
    if (match) {
      phone = match[0].replace(/\s+/g, ' ').trim()
      break
    }
  }

  // UK Postcode pattern
  const postcodeMatch = text.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i)
  const postcode = postcodeMatch ? postcodeMatch[0].toUpperCase().replace(/\s*/g, ' ').trim() : null

  // Name extraction - look for name at the start or after common headers
  let firstName: string | null = null
  let lastName: string | null = null

  // Try to find name at the very beginning (first line that looks like a name)
  const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 0)
  
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i]
    // Skip lines that look like headers, emails, phones, addresses
    if (line.match(/^(curriculum|resume|cv|profile|contact|email|phone|address|summary|objective)/i)) continue
    if (line.includes('@')) continue
    if (line.match(/^\d/) || line.match(/^[\+\(]/)) continue
    if (line.length > 50) continue
    
    // Check if line looks like a name (2-4 words, each starting with capital)
    const words = line.split(/\s+/).filter(w => w.length > 1)
    if (words.length >= 2 && words.length <= 4) {
      const looksLikeName = words.every(w => /^[A-Z][a-z]+$/.test(w) || /^[A-Z]+$/.test(w))
      if (looksLikeName) {
        firstName = words[0]
        lastName = words.slice(1).join(' ')
        break
      }
    }
    
    // Also try: if first line is just a capitalized phrase
    if (i === 0 && words.length >= 2 && words.length <= 4) {
      const allCaps = words.every(w => /^[A-Z]/.test(w))
      if (allCaps) {
        firstName = words[0]
        lastName = words.slice(1).join(' ')
        break
      }
    }
  }

  // Try name extraction from "Name:" pattern
  if (!firstName) {
    const nameMatch = text.match(/(?:name|full\s*name)\s*[:\-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i)
    if (nameMatch) {
      const nameParts = nameMatch[1].trim().split(/\s+/)
      firstName = nameParts[0]
      lastName = nameParts.slice(1).join(' ')
    }
  }

  // Extract address (look for street-like patterns)
  let address: string | null = null
  const addressMatch = text.match(/\d+\s+[A-Za-z]+(?:\s+[A-Za-z]+)*(?:\s+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Close|Way|Court|Ct|Place|Pl|Crescent|Gardens?))/i)
  if (addressMatch) {
    address = addressMatch[0]
  }

  // Look for pharmacy qualifications
  const qualifications: string[] = []
  const qualPatterns = [
    /GPhC(?:\s+(?:registered|registration))?/gi,
    /NVQ\s*(?:Level\s*)?\d/gi,
    /BTEC(?:\s+in\s+[A-Za-z\s]+)?/gi,
    /MPharm/gi,
    /(?:Accuracy\s+Checking\s+)?Technician/gi,
    /ACT(?:\s+qualified)?/gi,
    /Dispensing\s+(?:Assistant|Technician)/gi,
    /Medicine[s]?\s+Counter\s+Assistant/gi,
    /MCA/g,
    /DBS\s+(?:Check(?:ed)?|Cleared)/gi,
  ]

  for (const pattern of qualPatterns) {
    const matches = text.match(pattern)
    if (matches) {
      matches.forEach(m => {
        if (!qualifications.includes(m.trim())) {
          qualifications.push(m.trim())
        }
      })
    }
  }

  // Extract skills (common pharmacy/healthcare terms)
  const skills: string[] = []
  const skillTerms = [
    'dispensing', 'customer service', 'patient care', 'stock control',
    'prescription', 'medication', 'pharmaceutical', 'NHS', 'retail',
    'communication', 'team work', 'attention to detail', 'pharmacy',
    'healthcare', 'clinical', 'counter sales', 'stock management',
  ]

  const textLower = text.toLowerCase()
  skillTerms.forEach(skill => {
    if (textLower.includes(skill.toLowerCase()) && !skills.includes(skill)) {
      skills.push(skill.charAt(0).toUpperCase() + skill.slice(1))
    }
  })

  // Look for experience years
  let totalYearsExperience: number | null = null
  let pharmacyYearsExperience: number | null = null
  
  const yearsMatch = text.match(/(\d+)\+?\s*years?\s*(?:of\s+)?experience/i)
  if (yearsMatch) {
    totalYearsExperience = parseInt(yearsMatch[1], 10)
  }
  
  const pharmacyYearsMatch = text.match(/(\d+)\+?\s*years?\s*(?:of\s+)?(?:pharmacy|dispensing)/i)
  if (pharmacyYearsMatch) {
    pharmacyYearsExperience = parseInt(pharmacyYearsMatch[1], 10)
  }

  // Check for right to work
  const rightToWork = text.match(/right\s+to\s+work|eligible\s+to\s+work|work\s+permit|visa|british\s+citizen/i) !== null

  // Check for driver's license
  const hasDriversLicense = text.match(/driv(?:er'?s?|ing)\s*licen[cs]e|full\s+uk\s+licen[cs]e|clean\s+licen[cs]e/i) !== null

  // Calculate confidence scores (basic heuristics)
  const confidence = {
    firstName: firstName ? (firstName.length > 1 ? 0.7 : 0.4) : 0,
    lastName: lastName ? (lastName.length > 1 ? 0.7 : 0.4) : 0,
    email: email ? 0.95 : 0,
    phone: phone ? 0.85 : 0,
    overall: 0
  }
  
  // Calculate overall confidence
  const weights = { firstName: 0.2, lastName: 0.2, email: 0.35, phone: 0.25 }
  confidence.overall = 
    confidence.firstName * weights.firstName +
    confidence.lastName * weights.lastName +
    confidence.email * weights.email +
    confidence.phone * weights.phone

  return {
    firstName,
    lastName,
    email,
    phone,
    address,
    postcode,
    summary: null,
    experience: [],
    education: [],
    qualifications,
    skills,
    rightToWork,
    hasDriversLicense,
    totalYearsExperience,
    pharmacyYearsExperience,
    confidence,
    rawText: text,
    usedAI: false,
  }
}

// ============================================================================
// AI-POWERED CV PARSING
// ============================================================================

/**
 * Parse CV using Claude AI for better extraction
 */
async function parseWithAI(text: string, apiKey: string): Promise<ParsedCV> {
  const client = new Anthropic({ apiKey })

  const systemPrompt = `You are a CV/resume parser specializing in UK pharmacy and healthcare recruitment.
Extract the following information from the CV text. Be precise and only extract what you can find.

IMPORTANT NOTES:
- Phone numbers should be in UK format
- Look for pharmacy-specific qualifications (GPhC, NVQ, ACT, MPharm, etc.)
- "Right to work" can be implied from citizenship statements
- Parse dates as strings in "MMM YYYY" format where possible
- If information is not clearly present, use null

Return a JSON object with this exact structure:
{
  "firstName": string | null,
  "lastName": string | null,
  "email": string | null,
  "phone": string | null,
  "address": string | null,
  "postcode": string | null,
  "summary": string | null (brief professional summary if present),
  "experience": [{ "title": string, "company": string, "startDate": string | null, "endDate": string | null, "current": boolean, "description": string | null }],
  "education": [{ "institution": string, "qualification": string, "field": string | null, "year": string | null }],
  "qualifications": string[] (professional certifications like GPhC, NVQ, etc.),
  "skills": string[],
  "rightToWork": boolean | null,
  "hasDriversLicense": boolean | null,
  "totalYearsExperience": number | null,
  "pharmacyYearsExperience": number | null,
  "confidence": { "firstName": number (0-1), "lastName": number (0-1), "email": number (0-1), "phone": number (0-1), "overall": number (0-1) }
}

Only return the JSON object, no other text.`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `Parse this CV:\n\n${text.substring(0, 15000)}` // Limit text length
        }
      ],
      system: systemPrompt
    })

    // Extract text from response
    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude')
    }

    // Parse JSON from response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response')
    }

    const parsed = JSON.parse(jsonMatch[0])
    
    return {
      ...parsed,
      rawText: text,
      usedAI: true,
    }
  } catch (error) {
    console.error('AI parsing error:', error)
    throw error
  }
}

// ============================================================================
// MAIN CV PARSING FUNCTION
// ============================================================================

/**
 * Parse CV Cloud Function
 * 
 * Extracts structured data from uploaded CV files.
 * Uses Claude AI when available, falls back to regex parsing.
 */
export const parseCV = onCall<ParseCVRequest, Promise<ParseCVResponse>>(
  {
    cors: true,
    region: 'europe-west2',
    timeoutSeconds: 120,
    memory: '1GiB',
    secrets: [anthropicApiKey],
    enforceAppCheck: false,
  },
  async (request) => {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const { fileUrl, fileName, mimeType } = request.data

    // Validate required fields
    if (!fileUrl || !fileName || !mimeType) {
      throw new HttpsError('invalid-argument', 'Missing required fields: fileUrl, fileName, mimeType')
    }

    console.log(`Parsing CV: ${fileName} (${mimeType})`)

    try {
      // Download file from Firebase Storage URL
      const response = await fetch(fileUrl)
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status}`)
      }
      
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Extract text from document
      const text = await extractText(buffer, mimeType)
      
      if (!text || text.trim().length < 50) {
        throw new Error('Could not extract sufficient text from document')
      }

      console.log(`Extracted ${text.length} characters from CV`)

      // Try AI parsing first, fall back to regex
      let parsedData: ParsedCV

      const apiKey = anthropicApiKey.value()
      if (apiKey) {
        try {
          console.log('Attempting AI-powered CV parsing...')
          parsedData = await parseWithAI(text, apiKey)
          console.log('AI parsing successful')
        } catch (aiError) {
          console.warn('AI parsing failed, falling back to regex:', aiError)
          parsedData = parseWithRegex(text)
        }
      } else {
        console.log('No API key configured, using regex parsing')
        parsedData = parseWithRegex(text)
      }

      console.log(`CV parsed successfully. Name: ${parsedData.firstName} ${parsedData.lastName}, Email: ${parsedData.email}`)

      return {
        success: true,
        data: parsedData
      }
    } catch (error) {
      console.error('CV parsing error:', error)
      
      if (error instanceof HttpsError) {
        throw error
      }
      
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new HttpsError('internal', `Failed to parse CV: ${message}`)
    }
  }
)

// ============================================================================
// MARK BOOKING LINK AS USED
// ============================================================================

/**
 * Mark Booking Link as Used
 * 
 * Called when a candidate completes a booking.
 */
interface MarkBookingUsedRequest {
  bookingLinkId: string
  interviewId?: string
}

export const markBookingLinkUsed = onCall<MarkBookingUsedRequest, Promise<{ success: boolean }>>(
  {
    cors: true,
    region: 'europe-west2',
    timeoutSeconds: 10,
    memory: '256MiB',
    enforceAppCheck: false,
  },
  async (request) => {
    const { bookingLinkId, interviewId } = request.data

    if (!bookingLinkId) {
      throw new HttpsError('invalid-argument', 'bookingLinkId is required')
    }

    console.log(`Marking booking link as used: ${bookingLinkId}`)

    try {
      const db = admin.firestore()
      const linkRef = db.collection('bookingLinks').doc(bookingLinkId)
      
      const linkDoc = await linkRef.get()
      if (!linkDoc.exists) {
        throw new HttpsError('not-found', 'Booking link not found')
      }
      
      await linkRef.update({
        useCount: admin.firestore.FieldValue.increment(1),
        status: 'used',
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(interviewId && { interviewId }),
      })
      
      console.log('Booking link marked as used')
      
      return { success: true }
    } catch (error) {
      console.error('Error marking booking link used:', error)
      
      if (error instanceof HttpsError) {
        throw error
      }
      
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new HttpsError('internal', `Failed to mark booking link used: ${message}`)
    }
  }
)

// ============================================================================
// MICROSOFT GRAPH EMAIL FUNCTION
// ============================================================================

// Use existing Microsoft Graph secrets (same as Teams integration)
const msClientId = defineSecret('MS_CLIENT_ID')
const msClientSecret = defineSecret('MS_CLIENT_SECRET')
const msTenantId = defineSecret('MS_TENANT_ID')
const msOrganizerUserId = defineSecret('MS_ORGANIZER_USER_ID')

interface SendEmailRequest {
  to: string
  subject: string
  body: string
  candidateId: string
  candidateName: string
}

interface SendEmailResponse {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Send Email via Microsoft Graph API
 * 
 * Sends an email using Microsoft Graph API with application permissions.
 * Uses existing MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID secrets
 * and sends from the organizer user (recruitment@alliedpharmacies.co.uk).
 */
export const sendEmail = onCall<SendEmailRequest, Promise<SendEmailResponse>>(
  {
    cors: true,
    region: 'europe-west2',
    timeoutSeconds: 30,
    memory: '256MiB',
    secrets: [msClientId, msClientSecret, msTenantId, msOrganizerUserId],
    enforceAppCheck: false,
  },
  async (request) => {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const { to, subject, body, candidateId, candidateName } = request.data

    // Validate required fields
    if (!to || !subject || !body) {
      throw new HttpsError('invalid-argument', 'Missing required fields: to, subject, body')
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(to)) {
      throw new HttpsError('invalid-argument', 'Invalid email address format')
    }

    console.log(`Sending email to: ${to}, subject: "${subject}"`)

    try {
      // Get Microsoft Graph access token using existing credentials
      const tokenUrl = `https://login.microsoftonline.com/${msTenantId.value()}/oauth2/v2.0/token`
      
      const tokenParams = new URLSearchParams({
        client_id: msClientId.value(),
        client_secret: msClientSecret.value(),
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      })

      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tokenParams.toString(),
      })

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text()
        console.error('Token error:', errorText)
        throw new Error(`Failed to get access token: ${tokenResponse.status}`)
      }

      const tokenData = await tokenResponse.json()
      const accessToken = tokenData.access_token

      // Send email via Microsoft Graph using organizer user ID
      const organizerUserId = msOrganizerUserId.value()
      const graphUrl = `https://graph.microsoft.com/v1.0/users/${organizerUserId}/sendMail`

      // Convert plain text body to HTML with line breaks and clickable links
      let htmlBody = body
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

      // Convert URLs to clickable links (must be done before newline replacement)
      const urlRegex = /(https?:\/\/[^\s<]+)/g
      htmlBody = htmlBody.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank" style="color: #0066cc; text-decoration: underline; font-weight: 600;">${url}</a>`
      })

      // Replace newlines with <br>
      htmlBody = htmlBody.replace(/\n/g, '<br>')

      const emailPayload = {
        message: {
          subject: subject,
          body: {
            contentType: 'HTML',
            content: `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">${htmlBody}</div>`,
          },
          toRecipients: [
            {
              emailAddress: {
                address: to,
                name: candidateName || to,
              },
            },
          ],
        },
        saveToSentItems: true,
      }

      const sendResponse = await fetch(graphUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailPayload),
      })

      if (!sendResponse.ok) {
        const errorText = await sendResponse.text()
        console.error('Send email error:', errorText)
        throw new Error(`Failed to send email: ${sendResponse.status} - ${errorText}`)
      }

      // Log the email send to Firestore
      const db = admin.firestore()
      await db.collection('emailLog').add({
        to,
        subject,
        candidateId: candidateId || null,
        candidateName: candidateName || null,
        sentBy: request.auth.uid,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'sent',
      })

      console.log(`Email sent successfully to ${to}`)

      return {
        success: true,
        messageId: `email-${Date.now()}`,
      }
    } catch (error) {
      console.error('Error sending email:', error)
      
      if (error instanceof HttpsError) {
        throw error
      }
      
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new HttpsError('internal', `Failed to send email: ${message}`)
    }
  }
)

// ============================================================================
// CREATE USER WITH PASSWORD
// ============================================================================

export const createUserWithPassword = onCall<{
  email: string
  password: string
  displayName: string
  phone?: string
  role: string
  entities?: string[]
  branchIds?: string[]
  emailNotifications?: boolean
  pushNotifications?: boolean
}>(
  {
    cors: [
      'https://allied-recruitment.web.app',
      'https://recruitment-633bd.web.app',
      'http://localhost:3000',
      'http://localhost:5173',
    ],
    region: 'europe-west2',
  },
  async (request) => {
    // Require authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated to create users')
    }

    const { email, password, displayName, phone, role, entities, branchIds, emailNotifications, pushNotifications } = request.data

    // Validate required fields
    if (!email || !password || !displayName || !role) {
      throw new HttpsError('invalid-argument', 'Missing required fields: email, password, displayName, role')
    }

    // Validate password length
    if (password.length < 6) {
      throw new HttpsError('invalid-argument', 'Password must be at least 6 characters')
    }

    try {
      // Check if caller has admin privileges (optional - implement based on your role system)
      const callerDoc = await admin.firestore().collection('users').doc(request.auth.uid).get()
      const callerRole = callerDoc.data()?.role
      if (!['super_admin', 'admin'].includes(callerRole)) {
        throw new HttpsError('permission-denied', 'Only admins can create users')
      }

      // Validate phone number format (E.164: +CountryCodeNumber, e.g., +447123456789)
      // Only pass to Firebase Auth if valid, otherwise just store in Firestore
      const isValidE164 = phone && /^\+[1-9]\d{6,14}$/.test(phone)

      // Create the user in Firebase Auth
      const userRecord = await admin.auth().createUser({
        email: email.toLowerCase(),
        password,
        displayName,
        phoneNumber: isValidE164 ? phone : undefined,
      })

      // Create the user document in Firestore
      await admin.firestore().collection('users').doc(userRecord.uid).set({
        email: email.toLowerCase(),
        displayName,
        phone: phone || null,
        role,
        entities: entities || [],
        branchIds: branchIds || [],
        emailNotifications: emailNotifications ?? true,
        pushNotifications: pushNotifications ?? true,
        status: 'active',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
      })

      console.log(`User created: ${userRecord.uid} (${email})`)

      return {
        success: true,
        uid: userRecord.uid,
        message: `User ${displayName} created successfully`,
      }
    } catch (error: any) {
      console.error('Error creating user:', error)

      // Handle specific Firebase Auth errors
      if (error.code === 'auth/email-already-exists') {
        throw new HttpsError('already-exists', 'A user with this email already exists')
      }
      if (error.code === 'auth/invalid-email') {
        throw new HttpsError('invalid-argument', 'Invalid email address')
      }
      if (error.code === 'auth/invalid-password') {
        throw new HttpsError('invalid-argument', 'Invalid password')
      }

      if (error instanceof HttpsError) {
        throw error
      }

      throw new HttpsError('internal', error.message || 'Failed to create user')
    }
  }
)

// ============================================================================
// RE-EXPORT ALL FUNCTIONS FROM OTHER FILES
// ============================================================================

// Booking functions
export { getBookingAvailability, getBookingTimeSlots, submitBooking } from './bookingFunctions'

// Booking token validation (for public booking page)
export { validateBookingToken } from './bookingToken'

// Booking link creation (for sending invites)
export { createBookingLink } from './bookingLinkFunctions'

// Email functions with tracking
export { sendCandidateEmail, sendBulkCandidateEmails, trackOpen, trackClick } from './emailFunctions'

// Teams meeting functions
export { createTeamsMeeting, checkMeetingStatus, fetchMeetingInsights } from './teamsMeetingFunctions'

// Cascade deletion triggers
export { onCandidateDeleted, permanentlyDeleteCandidate, archiveCandidate, restoreCandidate, reactivateCandidate, checkReturningCandidate } from './cascadeDeletion'

// Lapsed interviews and status change triggers
export { markLapsedInterviews, resolveLapsedInterview, onCandidateStatusChange, onCandidateWithdrawnOrRejected, processInterviewsNow } from './lapsedInterviews'

// Job import
export { parseIndeedJob } from './jobImport'

// Trial notifications and feedback
export { 
  sendTrialBranchNotification, 
  sendDailyFeedbackRequests, 
  submitTrialFeedback, 
  validateFeedbackToken 
} from './trialNotifications'

// Template migration (run once to set up unified template system)
export { migrateMessageTemplates } from './migrations/migrateTemplatesFunction'

// Test email (Phase 5: Template testing)
export { sendTestEmail } from './sendTestEmail'

// User invite and password reset functions
export {
  createUserInvite,
  validateUserInvite,
  completeUserRegistration,
  requestPasswordReset,
  validatePasswordReset,
  completePasswordReset
} from './userInviteFunctions'

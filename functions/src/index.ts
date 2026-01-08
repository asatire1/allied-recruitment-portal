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

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(buffer)
    return data.text
  } catch (error) {
    console.error('PDF extraction error:', error)
    throw new Error('Failed to extract text from PDF')
  }
}

async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  } catch (error) {
    console.error('DOCX extraction error:', error)
    throw new Error('Failed to extract text from Word document')
  }
}

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
// REGEX-BASED FALLBACK PARSING
// ============================================================================

function parseWithRegex(text: string): ParsedCV {
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i)
  const email = emailMatch ? emailMatch[0].toLowerCase() : null

  const phonePatterns = [
    /(?:(?:\+44\s?|0)7\d{3}\s?\d{3}\s?\d{3})/,
    /(?:(?:\+44\s?|0)\d{2,4}\s?\d{3}\s?\d{4})/,
    /07\d{9}/,
    /(?:\+44|0)\s*\d[\d\s]{9,}/,
  ]
  
  let phone: string | null = null
  for (const pattern of phonePatterns) {
    const match = text.match(pattern)
    if (match) {
      phone = match[0].replace(/\s+/g, ' ').trim()
      break
    }
  }

  const postcodeMatch = text.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i)
  const postcode = postcodeMatch ? postcodeMatch[0].toUpperCase().replace(/\s*/g, ' ').trim() : null

  let firstName: string | null = null
  let lastName: string | null = null

  const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 0)
  
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i]
    if (line.match(/^(curriculum|resume|cv|profile|contact|email|phone|address|summary|objective)/i)) continue
    if (line.includes('@')) continue
    if (line.match(/^\d/) || line.match(/^[\+\(]/)) continue
    if (line.length > 50) continue
    
    const words = line.split(/\s+/).filter(w => w.length > 1)
    if (words.length >= 2 && words.length <= 4) {
      const looksLikeName = words.every(w => /^[A-Z][a-z]+$/.test(w) || /^[A-Z]+$/.test(w))
      if (looksLikeName) {
        firstName = words[0]
        lastName = words.slice(1).join(' ')
        break
      }
    }
    
    if (i === 0 && words.length >= 2 && words.length <= 4) {
      const allCaps = words.every(w => /^[A-Z]/.test(w))
      if (allCaps) {
        firstName = words[0]
        lastName = words.slice(1).join(' ')
        break
      }
    }
  }

  if (!firstName) {
    const nameMatch = text.match(/(?:name|full\s*name)\s*[:\-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i)
    if (nameMatch) {
      const nameParts = nameMatch[1].trim().split(/\s+/)
      firstName = nameParts[0]
      lastName = nameParts.slice(1).join(' ')
    }
  }

  let address: string | null = null
  const addressMatch = text.match(/\d+\s+[A-Za-z]+(?:\s+[A-Za-z]+)*(?:\s+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Close|Way|Court|Ct|Place|Pl|Crescent|Gardens?))/i)
  if (addressMatch) {
    address = addressMatch[0]
  }

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

  let totalYearsExperience: number | null = null
  let pharmacyYearsExperience: number | null = null

  const yearsMatch = text.match(/(\d+)\+?\s*years?\s*(?:of\s+)?(?:experience|working)/i)
  if (yearsMatch) {
    totalYearsExperience = parseInt(yearsMatch[1], 10)
  }

  const pharmacyYearsMatch = text.match(/(\d+)\+?\s*years?\s*(?:of\s+)?(?:pharmacy|pharmaceutical|dispensing|healthcare)/i)
  if (pharmacyYearsMatch) {
    pharmacyYearsExperience = parseInt(pharmacyYearsMatch[1], 10)
  }

  let summary: string | null = null
  if (qualifications.length > 0 || skills.length > 0) {
    const parts: string[] = []
    if (qualifications.length > 0) {
      parts.push(qualifications.slice(0, 3).join(', '))
    }
    if (totalYearsExperience) {
      parts.push(`${totalYearsExperience} years experience`)
    }
    if (parts.length > 0) {
      summary = parts.join('. ')
      if (summary.length > 200) summary = summary.substring(0, 197) + '...'
    }
  }

  const confidence = {
    firstName: firstName ? 70 : 0,
    lastName: lastName ? 70 : 0,
    email: email ? 95 : 0,
    phone: phone ? 85 : 0,
    overall: 0,
  }
  
  const foundFields = [firstName, lastName, email, phone].filter(f => f !== null).length
  confidence.overall = Math.round((foundFields / 4) * 100)

  return {
    firstName, lastName, email, phone, address, postcode, summary,
    experience: [], education: [], qualifications, skills,
    rightToWork: textLower.includes('right to work') || textLower.includes('eligible to work') ? true : null,
    hasDriversLicense: textLower.includes('driving licen') || textLower.includes('driver') ? true : null,
    totalYearsExperience, pharmacyYearsExperience, confidence, rawText: text, usedAI: false,
  }
}

// ============================================================================
// CLAUDE AI PARSING
// ============================================================================

const CV_PARSING_PROMPT = `You are an expert CV/resume parser for a UK pharmacy recruitment system. Extract structured information from the following CV text.

Return a JSON object with these fields:
{
  "firstName": "string or null",
  "lastName": "string or null",
  "email": "string or null",
  "phone": "string or null (UK format preferred)",
  "address": "string or null (street address without postcode)",
  "postcode": "string or null (UK postcode format)",
  "summary": "string or null (brief professional summary, max 200 chars)",
  "experience": [{"title": "job title", "company": "company name", "startDate": "YYYY-MM or null", "endDate": "YYYY-MM or null", "current": true/false, "description": "brief description or null"}],
  "education": [{"institution": "name", "qualification": "degree/certificate", "field": "field or null", "year": "year or null"}],
  "qualifications": ["list of professional qualifications"],
  "skills": ["list of relevant skills"],
  "rightToWork": true/false/null,
  "hasDriversLicense": true/false/null,
  "totalYearsExperience": number or null,
  "pharmacyYearsExperience": number or null,
  "confidence": {"firstName": 0-100, "lastName": 0-100, "email": 0-100, "phone": 0-100, "overall": 0-100}
}

Return ONLY valid JSON, no other text.

CV Text:
`

async function parseWithClaude(text: string, apiKey: string): Promise<ParsedCV> {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const anthropic = new Anthropic({ apiKey })
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: CV_PARSING_PROMPT + text.substring(0, 15000) }],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type from Claude')

  try {
    let jsonText = content.text
    const jsonMatch = jsonText.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) jsonText = jsonMatch[1]
    
    const parsed = JSON.parse(jsonText) as Omit<ParsedCV, 'rawText' | 'usedAI'>
    return { ...parsed, rawText: text, usedAI: true }
  } catch (error) {
    console.error('Failed to parse Claude response:', content.text)
    throw new Error('Failed to parse CV extraction response')
  }
}

// ============================================================================
// PARSE CV FUNCTION
// ============================================================================

export const parseCV = onCall<ParseCVRequest, Promise<ParseCVResponse>>(
  { timeoutSeconds: 60, memory: '512MiB', enforceAppCheck: false, secrets: [anthropicApiKey] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'User must be authenticated')

    const { fileUrl, fileName, mimeType } = request.data
    if (!fileUrl || !fileName || !mimeType) {
      throw new HttpsError('invalid-argument', 'Missing required fields: fileUrl, fileName, mimeType')
    }

    console.log(`Parsing CV: ${fileName} (${mimeType})`)

    try {
      const bucket = admin.storage().bucket()
      const urlPath = new URL(fileUrl).pathname
      const encodedPath = urlPath.split('/o/')[1]?.split('?')[0]
      if (!encodedPath) throw new HttpsError('invalid-argument', 'Invalid file URL format')
      
      const filePath = decodeURIComponent(encodedPath)
      const file = bucket.file(filePath)
      const [exists] = await file.exists()
      if (!exists) throw new HttpsError('not-found', 'File not found in storage')

      const [buffer] = await file.download()
      const text = await extractText(buffer, mimeType)
      if (!text || text.trim().length < 50) {
        throw new HttpsError('failed-precondition', 'Could not extract sufficient text from file')
      }

      let parsedData: ParsedCV
      let usedAI = false
      const apiKey = anthropicApiKey.value()

      try {
        parsedData = await parseWithClaude(text, apiKey)
        usedAI = true
      } catch (aiError) {
        console.log('Claude AI parsing failed, using regex fallback')
        parsedData = parseWithRegex(text)
      }

      return { success: true, data: parsedData, usedAI }
    } catch (error) {
      if (error instanceof HttpsError) throw error
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new HttpsError('internal', `CV parsing failed: ${message}`)
    }
  }
)

export const healthCheck = onCall({ timeoutSeconds: 10 }, async () => {
  return { status: 'ok', timestamp: new Date().toISOString(), region: 'us-central1' }
})

// ============================================================================
// BOOKING LINK GENERATION
// ============================================================================

interface CreateBookingLinkRequest {
  candidateId: string
  candidateName: string
  candidateEmail?: string
  type: 'interview' | 'trial'
  jobId?: string
  jobTitle?: string
  branchId?: string
  branchName?: string
  branchAddress?: string
  location?: string
  duration?: number
  expiryDays?: number
  maxUses?: number
  notes?: string
}

function generateSecureToken(length: number = 21): string {
  const crypto = require('crypto')
  return crypto.randomBytes(length).toString('base64url').substring(0, length)
}

function hashToken(token: string): string {
  const crypto = require('crypto')
  return crypto.createHash('sha256').update(token).digest('hex')
}

// ============================================================================
// AUTO STATUS UPDATE HELPER - Updates candidate status when invite sent
// ============================================================================

async function updateCandidateStatusOnInvite(
  candidateId: string, 
  inviteType: 'interview' | 'trial',
  createdBy: string
): Promise<void> {
  try {
    const db = admin.firestore()
    const candidateRef = db.collection('candidates').doc(candidateId)
    const candidateDoc = await candidateRef.get()
    
    if (!candidateDoc.exists) {
      console.warn(`Candidate ${candidateId} not found for status update`)
      return
    }
    
    const previousStatus = candidateDoc.data()?.status || 'unknown'
    
    // Update candidate status to invite_sent
    await candidateRef.update({
      status: 'invite_sent',
      inviteType: inviteType,
      inviteSentAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    
    // Log the automatic status change
    await db.collection('activityLog').add({
      entityType: 'candidate',
      entityId: candidateId,
      action: 'status_changed',
      description: `Status automatically changed from "${previousStatus.replace(/_/g, ' ')}" to "invite sent" - ${inviteType} booking link created`,
      previousValue: { status: previousStatus },
      newValue: { status: 'invite_sent', inviteType },
      userId: createdBy,
      userName: 'System (Automatic)',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    
    console.log(`Candidate ${candidateId} status updated to invite_sent (${inviteType})`)
  } catch (error) {
    // Non-blocking - log error but don't fail the booking link creation
    console.error(`Failed to update candidate status for ${candidateId}:`, error)
  }
}

// ============================================================================

export const createBookingLink = onCall<CreateBookingLinkRequest>(
  { timeoutSeconds: 30, memory: '256MiB', enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'User must be authenticated')

    const { candidateId, candidateName, candidateEmail, type, jobId, jobTitle, branchId, branchName, branchAddress, location, duration: customDuration, expiryDays = 3, maxUses = 1, notes } = request.data

    if (!candidateId || !candidateName || !type) {
      throw new HttpsError('invalid-argument', 'Missing required fields: candidateId, candidateName, type')
    }
    if (!['interview', 'trial'].includes(type)) {
      throw new HttpsError('invalid-argument', 'Type must be "interview" or "trial"')
    }

    try {
      const db = admin.firestore()
      let duration = customDuration
      if (!duration) {
        duration = type === 'interview' ? 30 : 240
      }
      
      const token = generateSecureToken(21)
      const tokenHash = hashToken(token)
      const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000))
      
      const bookingLinkDoc = {
        tokenHash, candidateId, candidateName, candidateEmail: candidateEmail || null,
        type, duration, jobId: jobId || null, jobTitle: jobTitle || null,
        branchId: branchId || null, branchName: branchName || location || null,
        branchAddress: branchAddress || null, notes: notes || null,
        status: 'active', expiresAt, maxUses, useCount: 0,
        requireEmailVerification: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
      }
      
      const docRef = await db.collection('bookingLinks').add(bookingLinkDoc)
      const url = `https://allied-booking.web.app/book/${token}`
      
      // Auto-update candidate status to 'invite_sent'
      await updateCandidateStatusOnInvite(candidateId, type, request.auth.uid)
      
      return { success: true, id: docRef.id, url, expiresAt: expiresAt.toDate().toISOString(), duration }
    } catch (error) {
      if (error instanceof HttpsError) throw error
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new HttpsError('internal', `Failed to create booking link: ${message}`)
    }
  }
)

export const validateBookingToken = onCall<{ token: string }>(
  { timeoutSeconds: 10, memory: '256MiB', enforceAppCheck: false },
  async (request) => {
    const { token } = request.data
    if (!token) throw new HttpsError('invalid-argument', 'Token is required')

    try {
      const db = admin.firestore()
      const tokenHash = hashToken(token)
      
      const snapshot = await db.collection('bookingLinks')
        .where('tokenHash', '==', tokenHash)
        .where('status', '==', 'active')
        .limit(1)
        .get()
      
      if (snapshot.empty) return { valid: false, error: 'Invalid or expired booking link' }
      
      const doc = snapshot.docs[0]
      const data = doc.data()
      const expiresAt = data.expiresAt.toDate()
      
      if (expiresAt < new Date()) {
        await doc.ref.update({ status: 'expired' })
        return { valid: false, error: 'This booking link has expired' }
      }
      
      if (data.useCount >= data.maxUses) {
        await doc.ref.update({ status: 'used' })
        return { valid: false, error: 'This booking link has already been used' }
      }
      
      // Get the correct slot duration from settings for interviews
      let interviewDuration = 30 // default
      if (data.type === 'interview') {
        try {
          const settingsDoc = await db.collection('settings').doc('interviewAvailability').get()
          console.log('Settings doc exists:', settingsDoc.exists)
          if (settingsDoc.exists) {
            const settingsData = settingsDoc.data()
            console.log('Settings data:', JSON.stringify(settingsData))
            interviewDuration = settingsData?.slotDuration || 30
            console.log('Interview duration from settings:', interviewDuration)
          }
        } catch (settingsError) {
          console.error('Failed to get slot duration from settings:', settingsError)
        }
      }
      
      const duration = data.type === 'interview' ? interviewDuration : (data.duration || 240)
      console.log('Final duration:', duration, 'data.duration:', data.duration, 'type:', data.type)
      
      return {
        valid: true,
        data: {
          id: doc.id, candidateId: data.candidateId, candidateName: data.candidateName,
          candidateEmail: data.candidateEmail, type: data.type,
          duration,
          jobId: data.jobId, jobTitle: data.jobTitle, branchId: data.branchId,
          branchName: data.branchName || data.location, branchAddress: data.branchAddress,
          notes: data.notes, expiresAt: expiresAt.toISOString(),
        },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new HttpsError('internal', `Failed to validate token: ${message}`)
    }
  }
)

export const markBookingLinkUsed = onCall<{ bookingLinkId: string; interviewId?: string }>(
  { timeoutSeconds: 10, memory: '256MiB', enforceAppCheck: false },
  async (request) => {
    const { bookingLinkId, interviewId } = request.data
    if (!bookingLinkId) throw new HttpsError('invalid-argument', 'bookingLinkId is required')

    try {
      const db = admin.firestore()
      const linkRef = db.collection('bookingLinks').doc(bookingLinkId)
      const linkDoc = await linkRef.get()
      if (!linkDoc.exists) throw new HttpsError('not-found', 'Booking link not found')
      
      await linkRef.update({
        useCount: admin.firestore.FieldValue.increment(1),
        status: 'used',
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(interviewId && { interviewId }),
      })
      
      return { success: true }
    } catch (error) {
      if (error instanceof HttpsError) throw error
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new HttpsError('internal', `Failed to mark booking link used: ${message}`)
    }
  }
)

// ============================================================================
// BOOKING CONFIRMATION EMAIL (with Teams link support)
// ============================================================================

interface BookingConfirmationRequest {
  interviewId: string
  candidateName: string
  candidateEmail: string
  interviewType: 'interview' | 'trial'
  scheduledAt: string
  duration: number
  jobTitle?: string
  branchName?: string
  branchId?: string
  teamsJoinUrl?: string
}

function generateICSFile(
  title: string, description: string, location: string,
  startDate: Date, endDate: Date,
  organizerEmail: string = 'recruitment@alliedpharmacies.co.uk',
  teamsJoinUrl?: string
): string {
  const formatDate = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const uid = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}@alliedpharmacies.co.uk`
  
  let fullDescription = description
  if (teamsJoinUrl) fullDescription += `\\n\\n---\\nJoin Microsoft Teams Meeting:\\n${teamsJoinUrl}`
  
  const meetingLocation = teamsJoinUrl ? 'Microsoft Teams Meeting' : location
  
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Allied Pharmacies//Recruitment Portal//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
UID:${uid}
DTSTART:${formatDate(startDate)}
DTEND:${formatDate(endDate)}
SUMMARY:${title}
DESCRIPTION:${fullDescription}
LOCATION:${meetingLocation}
ORGANIZER;CN=Allied Pharmacies Recruitment:mailto:${organizerEmail}
STATUS:CONFIRMED
SEQUENCE:0
${teamsJoinUrl ? `X-MICROSOFT-ONLINEMEETINGINFORMATION:${teamsJoinUrl}` : ''}
BEGIN:VALARM
TRIGGER:-PT1H
ACTION:DISPLAY
DESCRIPTION:Reminder: ${title}
END:VALARM
END:VEVENT
END:VCALENDAR`
}

export const sendBookingConfirmation = onCall(
  { region: 'us-central1', maxInstances: 10 },
  async (request) => {
    const data = request.data as BookingConfirmationRequest
    const { interviewId, candidateName, candidateEmail, interviewType, scheduledAt, duration, jobTitle, branchName, branchId, teamsJoinUrl } = data

    if (!interviewId) throw new HttpsError('invalid-argument', 'interviewId is required')

    const db = admin.firestore()
    const scheduledDate = new Date(scheduledAt)
    const endDate = new Date(scheduledDate.getTime() + duration * 60000)
    
    const dateOptions: Intl.DateTimeFormatOptions = { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London'
    }
    const formattedDate = scheduledDate.toLocaleDateString('en-GB', dateOptions)
    
    const typeLabel = interviewType === 'trial' ? 'Trial Shift' : 'Interview'
    const title = `${typeLabel}${jobTitle ? ` - ${jobTitle}` : ''} with Allied Pharmacies`
    
    let branchAddress = ''
    let branchEmail = ''
    if (branchId) {
      try {
        const branchDoc = await db.collection('branches').doc(branchId).get()
        if (branchDoc.exists) {
          const branchData = branchDoc.data()
          branchAddress = branchData?.address || ''
          branchEmail = branchData?.email || branchData?.managerEmail || ''
        }
      } catch (err) {
        console.warn('Could not fetch branch details:', err)
      }
    }
    
    const location = interviewType === 'interview' && teamsJoinUrl 
      ? 'Microsoft Teams (online)' 
      : (branchAddress || branchName || 'To be confirmed')
    
    const icsDescription = `Your ${typeLabel.toLowerCase()} has been scheduled.\\n\\nCandidate: ${candidateName}\\nPosition: ${jobTitle || 'Not specified'}\\nDuration: ${duration} minutes`
    
    const icsContent = generateICSFile(
      title, icsDescription, location, scheduledDate, endDate,
      'recruitment@alliedpharmacies.co.uk',
      interviewType === 'interview' ? teamsJoinUrl : undefined
    )
    
    try {
      await db.collection('emailNotifications').add({
        type: 'booking_confirmation', interviewId, candidateName,
        candidateEmail: candidateEmail || null, interviewType,
        scheduledAt: admin.firestore.Timestamp.fromDate(scheduledDate),
        duration, jobTitle: jobTitle || null, branchName: branchName || null,
        branchId: branchId || null, branchEmail: branchEmail || null,
        teamsJoinUrl: teamsJoinUrl || null, status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      
      const teamsMeetingSection = teamsJoinUrl && interviewType === 'interview' ? `
        <div style="background: #f0f7ff; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #0078d4;">
          <p style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #0078d4;">📹 Microsoft Teams Meeting</p>
          <p style="margin: 0 0 12px 0; font-size: 14px; color: #374151;">This is an online interview. Click the button below to join at your scheduled time:</p>
          <a href="${teamsJoinUrl}" style="display: inline-block; background: #0078d4; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">Join Teams Meeting</a>
          <p style="margin: 12px 0 0 0; font-size: 12px; color: #6b7280;">Or copy this link: ${teamsJoinUrl}</p>
        </div>
      ` : ''
      
      if (candidateEmail) {
        await db.collection('mail').add({
          to: candidateEmail,
          message: {
            subject: `Booking Confirmed: ${title}`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 24px;">Booking Confirmed</h1>
                </div>
                <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px;">
                  <p style="font-size: 16px; color: #374151;">Dear ${candidateName},</p>
                  <p style="font-size: 16px; color: #374151;">Your ${typeLabel.toLowerCase()} has been successfully booked.</p>
                  <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e5e7eb;">
                    <p style="margin: 8px 0; font-size: 15px;"><strong>📅 Date & Time:</strong> ${formattedDate}</p>
                    <p style="margin: 8px 0; font-size: 15px;"><strong>📍 Location:</strong> ${location}</p>
                    <p style="margin: 8px 0; font-size: 15px;"><strong>⏱️ Duration:</strong> ${duration} minutes</p>
                    ${jobTitle ? `<p style="margin: 8px 0; font-size: 15px;"><strong>💼 Position:</strong> ${jobTitle}</p>` : ''}
                  </div>
                  ${teamsMeetingSection}
                  <p style="font-size: 14px; color: #6b7280;">Please add this to your calendar using the attached .ics file.</p>
                  <p style="font-size: 14px; color: #6b7280;">If you need to reschedule or cancel, please contact us as soon as possible.</p>
                  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
                  <p style="font-size: 14px; color: #9ca3af; text-align: center;">Allied Pharmacies Recruitment Team</p>
                </div>
              </div>
            `,
          },
          attachments: [{
            filename: 'interview-invite.ics',
            content: Buffer.from(icsContent).toString('base64'),
            encoding: 'base64',
            contentType: 'text/calendar; method=REQUEST'
          }]
        })
      }
      
      if (branchEmail && interviewType === 'trial') {
        await db.collection('mail').add({
          to: branchEmail,
          message: {
            subject: `New ${typeLabel} Booking: ${candidateName}`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 24px;">New ${typeLabel} Booking</h1>
                </div>
                <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px;">
                  <p style="font-size: 16px; color: #374151;">A new ${typeLabel.toLowerCase()} has been self-booked by a candidate.</p>
                  <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e5e7eb;">
                    <p style="margin: 8px 0; font-size: 15px;"><strong>👤 Candidate:</strong> ${candidateName}</p>
                    <p style="margin: 8px 0; font-size: 15px;"><strong>📅 Date & Time:</strong> ${formattedDate}</p>
                    <p style="margin: 8px 0; font-size: 15px;"><strong>📍 Location:</strong> ${location}</p>
                    <p style="margin: 8px 0; font-size: 15px;"><strong>⏱️ Duration:</strong> ${duration} minutes</p>
                    ${jobTitle ? `<p style="margin: 8px 0; font-size: 15px;"><strong>💼 Position:</strong> ${jobTitle}</p>` : ''}
                  </div>
                  <p style="font-size: 14px; color: #6b7280;">The candidate has received a confirmation email with a calendar invite.</p>
                  <p style="font-size: 14px; color: #ef4444; font-weight: 500;">Please ensure someone is available to conduct the ${typeLabel.toLowerCase()}.</p>
                </div>
              </div>
            `,
          },
          attachments: [{
            filename: 'interview-invite.ics',
            content: Buffer.from(icsContent).toString('base64'),
            encoding: 'base64',
            contentType: 'text/calendar; method=REQUEST'
          }]
        })
      }
      
      return { 
        success: true, message: 'Booking confirmation emails sent',
        notification: { candidateEmail: candidateEmail || 'Not provided', branchEmail: branchEmail || 'Not configured', scheduledAt: formattedDate, teamsJoinUrl: teamsJoinUrl || null }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new HttpsError('internal', `Failed to send confirmation: ${message}`)
    }
  }
)

// ============================================================================
// CREATE USER WITH PASSWORD
// ============================================================================

interface CreateUserRequest {
  email: string
  password: string
  displayName: string
  phone?: string
  role: 'super_admin' | 'recruiter' | 'regional_manager' | 'branch_manager' | 'viewer'
  entities?: string[]
  branchIds?: string[]
  emailNotifications?: boolean
  pushNotifications?: boolean
}

export const createUserWithPassword = onCall<CreateUserRequest>(
  { region: 'us-central1', maxInstances: 10 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in to create users')

    const db = admin.firestore()
    const callerDoc = await db.collection('users').doc(request.auth.uid).get()
    
    if (!callerDoc.exists || callerDoc.data()?.role !== 'super_admin') {
      throw new HttpsError('permission-denied', 'Only super admins can create users')
    }

    const { email, password, displayName, phone, role, entities, branchIds, emailNotifications, pushNotifications } = request.data

    if (!email || !password || !displayName || !role) {
      throw new HttpsError('invalid-argument', 'Missing required fields')
    }
    if (password.length < 6) {
      throw new HttpsError('invalid-argument', 'Password must be at least 6 characters')
    }

    try {
      const userRecord = await admin.auth().createUser({
        email: email.toLowerCase(), password, displayName, disabled: false,
      })

      await db.collection('users').doc(userRecord.uid).set({
        email: email.toLowerCase(), displayName, phone: phone || null, role,
        entities: entities || [], branchIds: branchIds || [], active: true,
        emailNotifications: emailNotifications ?? true, pushNotifications: pushNotifications ?? true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
      })

      return { success: true, uid: userRecord.uid, message: `User ${displayName} created successfully` }
    } catch (error: any) {
      if (error.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'A user with this email already exists')
      if (error.code === 'auth/invalid-email') throw new HttpsError('invalid-argument', 'Invalid email address')
      if (error.code === 'auth/weak-password') throw new HttpsError('invalid-argument', 'Password is too weak')
      throw new HttpsError('internal', `Failed to create user: ${error.message}`)
    }
  }
)

// B4: Push Notifications
export { onTrialCreated, sendFeedbackReminders, onTrialCompleted } from './pushNotifications'

// Booking Page Functions
export { getBookingAvailability, getBookingTimeSlots, submitBooking } from './bookingFunctions'

// Indeed Job Import
export { parseIndeedJob } from './jobImport'

// Candidate archive functions
export { archiveCandidate, restoreCandidate, checkReturningCandidate, reactivateCandidate, permanentlyDeleteCandidate, onCandidateDeleted } from './cascadeDeletion'

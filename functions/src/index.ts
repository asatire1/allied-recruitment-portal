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

  // Try to extract years of experience from text patterns
  let totalYearsExperience: number | null = null
  let pharmacyYearsExperience: number | null = null

  // Look for patterns like "X years experience" or "X+ years"
  const yearsMatch = text.match(/(\d+)\+?\s*years?\s*(?:of\s+)?(?:experience|working)/i)
  if (yearsMatch) {
    totalYearsExperience = parseInt(yearsMatch[1], 10)
  }

  // Look for pharmacy-specific experience
  const pharmacyYearsMatch = text.match(/(\d+)\+?\s*years?\s*(?:of\s+)?(?:pharmacy|pharmaceutical|dispensing|healthcare)/i)
  if (pharmacyYearsMatch) {
    pharmacyYearsExperience = parseInt(pharmacyYearsMatch[1], 10)
  }

  // Generate a basic summary from qualifications and skills
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

  // Calculate confidence scores
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
    firstName,
    lastName,
    email,
    phone,
    address,
    postcode,
    summary,
    experience: [],
    education: [],
    qualifications,
    skills,
    rightToWork: textLower.includes('right to work') || textLower.includes('eligible to work') ? true : null,
    hasDriversLicense: textLower.includes('driving licen') || textLower.includes('driver') ? true : null,
    totalYearsExperience,
    pharmacyYearsExperience,
    confidence,
    rawText: text,
    usedAI: false,
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
  "phone": "string or null (UK format preferred, e.g., 07123 456789)",
  "address": "string or null (street address without postcode)",
  "postcode": "string or null (UK postcode format, e.g., M1 1AA)",
  "summary": "string or null (brief professional summary, max 200 chars)",
  "experience": [
    {
      "title": "job title",
      "company": "company name",
      "startDate": "YYYY-MM or null",
      "endDate": "YYYY-MM or null",
      "current": true/false,
      "description": "brief description or null"
    }
  ],
  "education": [
    {
      "institution": "school/university name",
      "qualification": "degree/certificate name",
      "field": "field of study or null",
      "year": "graduation year or null"
    }
  ],
  "qualifications": ["list of professional qualifications, e.g., GPhC, NVQ Level 2"],
  "skills": ["list of relevant skills"],
  "rightToWork": true/false/null (if mentioned),
  "hasDriversLicense": true/false/null (if mentioned),
  "totalYearsExperience": number or null (calculate total years of work experience from dates),
  "pharmacyYearsExperience": number or null (calculate years specifically in pharmacy/healthcare roles),
  "confidence": {
    "firstName": 0-100,
    "lastName": 0-100,
    "email": 0-100,
    "phone": 0-100,
    "overall": 0-100
  }
}

Pharmacy-specific qualifications to look for:
- GPhC Registration (General Pharmaceutical Council)
- NVQ Level 2/3 in Pharmacy Services
- BTEC in Pharmaceutical Science
- MPharm (Master of Pharmacy)
- Dispensing Assistant qualifications
- Medicines Counter Assistant (MCA)
- Accuracy Checking Technician (ACT)
- DBS Check

Important:
1. Extract UK phone numbers, normalizing to a consistent format
2. Extract UK postcodes correctly
3. Identify pharmacy-relevant qualifications and skills
4. Set confidence scores based on how clearly the data was found
5. For experience, list most recent first
6. If data is ambiguous or not found, use null
7. Calculate totalYearsExperience by summing up all work experience durations
8. Calculate pharmacyYearsExperience for roles containing: pharmacy, pharmacist, dispenser, dispensing, healthcare, NHS, clinical, medical
9. Write a concise summary (max 200 chars) highlighting key qualifications and experience
10. Return ONLY valid JSON, no other text

CV Text:
`

/**
 * Parse CV text using Claude API
 */
async function parseWithClaude(text: string, apiKey: string): Promise<ParsedCV> {
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  const anthropic = new Anthropic({ apiKey })

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: CV_PARSING_PROMPT + text.substring(0, 15000), // Limit text length
      },
    ],
  })

  // Extract the text content
  const content = response.content[0]
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }

  // Parse the JSON response
  try {
    // Try to extract JSON from the response (Claude might wrap it in markdown)
    let jsonText = content.text
    const jsonMatch = jsonText.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      jsonText = jsonMatch[1]
    }
    
    const parsed = JSON.parse(jsonText) as Omit<ParsedCV, 'rawText' | 'usedAI'>
    return {
      ...parsed,
      rawText: text,
      usedAI: true,
    }
  } catch (error) {
    console.error('Failed to parse Claude response:', content.text)
    throw new Error('Failed to parse CV extraction response')
  }
}

// ============================================================================
// CLOUD FUNCTION
// ============================================================================

/**
 * Parse CV Cloud Function
 * 
 * Accepts a file URL from Firebase Storage and returns structured CV data
 */
export const parseCV = onCall<ParseCVRequest, Promise<ParseCVResponse>>(
  {
    cors: true,
    region: 'europe-west2',
    timeoutSeconds: 60,
    memory: '512MiB',
    enforceAppCheck: false, // Enable in production
    secrets: [anthropicApiKey], // Make secret available to function
  },
  async (request) => {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const { fileUrl, fileName, mimeType } = request.data

    // Validate input
    if (!fileUrl || !fileName || !mimeType) {
      throw new HttpsError('invalid-argument', 'Missing required fields: fileUrl, fileName, mimeType')
    }

    console.log(`Parsing CV: ${fileName} (${mimeType})`)

    try {
      // Download file from Firebase Storage
      const bucket = admin.storage().bucket()
      
      // Extract file path from URL
      // URL format: https://firebasestorage.googleapis.com/v0/b/BUCKET/o/PATH?alt=media&token=TOKEN
      const urlPath = new URL(fileUrl).pathname
      const encodedPath = urlPath.split('/o/')[1]?.split('?')[0]
      
      if (!encodedPath) {
        throw new HttpsError('invalid-argument', 'Invalid file URL format')
      }
      
      const filePath = decodeURIComponent(encodedPath)
      const file = bucket.file(filePath)
      
      // Check if file exists
      const [exists] = await file.exists()
      if (!exists) {
        throw new HttpsError('not-found', 'File not found in storage')
      }

      // Download file
      const [buffer] = await file.download()

      // Extract text
      console.log('Extracting text...')
      const text = await extractText(buffer, mimeType)

      if (!text || text.trim().length < 50) {
        throw new HttpsError('failed-precondition', 'Could not extract sufficient text from file')
      }

      console.log(`Extracted ${text.length} characters`)

      // Try parsing with Claude AI first, fallback to regex
      let parsedData: ParsedCV
      let usedAI = false

      // Get API key from secret
      const apiKey = anthropicApiKey.value()

      try {
        console.log('Attempting to parse with Claude AI...')
        parsedData = await parseWithClaude(text, apiKey)
        usedAI = true
        console.log('CV parsed successfully with AI:', {
          name: `${parsedData.firstName} ${parsedData.lastName}`,
          email: parsedData.email,
          confidence: parsedData.confidence.overall,
        })
      } catch (aiError) {
        console.log('Claude AI parsing failed, using regex fallback:', aiError instanceof Error ? aiError.message : aiError)
        
        // Fallback to regex-based parsing
        parsedData = parseWithRegex(text)
        console.log('CV parsed with regex fallback:', {
          name: `${parsedData.firstName} ${parsedData.lastName}`,
          email: parsedData.email,
          phone: parsedData.phone,
          confidence: parsedData.confidence.overall,
        })
      }

      return {
        success: true,
        data: parsedData,
        usedAI,
      }
    } catch (error) {
      console.error('CV parsing error:', error)
      
      if (error instanceof HttpsError) {
        throw error
      }
      
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new HttpsError('internal', `CV parsing failed: ${message}`)
    }
  }
)

/**
 * Health check function for testing
 */
export const healthCheck = onCall(
  { timeoutSeconds: 10 },
  async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      region: 'europe-west2',
    }
  }
)

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
  location?: string
  expiryDays?: number  // Default: 3 days
  maxUses?: number     // Default: 1
}

interface CreateBookingLinkResponse {
  success: boolean
  id: string
  url: string
  expiresAt: string
  error?: string
}

/**
 * Generate a cryptographically secure token
 * Uses Node.js crypto for server-side security
 */
function generateSecureToken(length: number = 21): string {
  const crypto = require('crypto')
  const bytes = crypto.randomBytes(length)
  // Convert to URL-safe base64
  return bytes.toString('base64url').substring(0, length)
}

/**
 * Hash a token using SHA-256
 */
function hashToken(token: string): string {
  const crypto = require('crypto')
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Create Booking Link Cloud Function
 * 
 * Generates a secure booking link for interview/trial scheduling.
 * Token is only returned once; only the hash is stored in Firestore.
 */
export const createBookingLink = onCall<CreateBookingLinkRequest, Promise<CreateBookingLinkResponse>>(
  {
    cors: true,
    region: 'europe-west2',
    timeoutSeconds: 30,
    memory: '256MiB',
    enforceAppCheck: false, // Enable in production
  },
  async (request) => {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const { 
      candidateId, 
      candidateName, 
      candidateEmail,
      type, 
      jobId, 
      jobTitle,
      branchId,
      branchName,
      location,
      expiryDays = 3,
      maxUses = 1
    } = request.data

    // Validate required fields
    if (!candidateId || !candidateName || !type) {
      throw new HttpsError('invalid-argument', 'Missing required fields: candidateId, candidateName, type')
    }

    if (!['interview', 'trial'].includes(type)) {
      throw new HttpsError('invalid-argument', 'Type must be "interview" or "trial"')
    }

    console.log(`Creating booking link for candidate: ${candidateName} (${candidateId}), type: ${type}`)

    try {
      const db = admin.firestore()
      
      // Generate secure token
      const token = generateSecureToken(21)
      const tokenHash = hashToken(token)
      
      // Calculate expiry
      const expiresAt = admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)
      )
      
      // Prepare document
      const bookingLinkDoc = {
        tokenHash,
        candidateId,
        candidateName,
        candidateEmail: candidateEmail || null,
        type,
        jobId: jobId || null,
        jobTitle: jobTitle || null,
        branchId: branchId || null,
        branchName: branchName || null,
        location: location || null,
        status: 'active',
        expiresAt,
        maxUses,
        useCount: 0,
        requireEmailVerification: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
      }
      
      // Store in Firestore (token hash only, never the raw token)
      const docRef = await db.collection('bookingLinks').add(bookingLinkDoc)
      
      // Generate URL - Firebase hosted booking page
      const baseUrl = 'https://allied-booking.web.app/book'
      const url = `${baseUrl}/${token}`
      
      console.log(`Booking link created: ${docRef.id}, expires: ${expiresAt.toDate().toISOString()}`)
      
      return {
        success: true,
        id: docRef.id,
        url,
        expiresAt: expiresAt.toDate().toISOString(),
      }
    } catch (error) {
      console.error('Error creating booking link:', error)
      
      if (error instanceof HttpsError) {
        throw error
      }
      
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new HttpsError('internal', `Failed to create booking link: ${message}`)
    }
  }
)

/**
 * Validate Booking Token Cloud Function
 * 
 * Validates a booking token and returns the booking link data if valid.
 * Used by the public booking page to verify tokens.
 */
interface ValidateBookingTokenRequest {
  token: string
}

interface ValidateBookingTokenResponse {
  valid: boolean
  data?: {
    id: string
    candidateId: string
    candidateName: string
    type: 'interview' | 'trial'
    jobTitle?: string
    location?: string
    duration: number
    expiresAt: string
  }
  error?: string
}

export const validateBookingToken = onCall<ValidateBookingTokenRequest, Promise<ValidateBookingTokenResponse>>(
  {
    cors: true,
    region: 'europe-west2',
    timeoutSeconds: 10,
    memory: '256MiB',
    enforceAppCheck: false, // Public function
  },
  async (request) => {
    // Note: This function does NOT require authentication
    // It's used by the public booking page
    
    const { token } = request.data

    if (!token) {
      throw new HttpsError('invalid-argument', 'Token is required')
    }

    console.log('Validating booking token...')

    try {
      const db = admin.firestore()
      const tokenHash = hashToken(token)
      
      // Find booking link by token hash
      const snapshot = await db.collection('bookingLinks')
        .where('tokenHash', '==', tokenHash)
        .where('status', '==', 'active')
        .limit(1)
        .get()
      
      if (snapshot.empty) {
        console.log('Token not found or not active')
        return {
          valid: false,
          error: 'Invalid or expired booking link',
        }
      }
      
      const doc = snapshot.docs[0]
      const data = doc.data()
      
      // Check expiry
      const expiresAt = data.expiresAt.toDate()
      if (expiresAt < new Date()) {
        // Mark as expired
        await doc.ref.update({ status: 'expired' })
        console.log('Token expired')
        return {
          valid: false,
          error: 'This booking link has expired',
        }
      }
      
      // Check max uses
      if (data.useCount >= data.maxUses) {
        await doc.ref.update({ status: 'used' })
        console.log('Token max uses reached')
        return {
          valid: false,
          error: 'This booking link has already been used',
        }
      }
      
      console.log(`Token valid for: ${data.candidateName}`)

      // Get duration from settings for interviews, 240 min (4 hours) for trials
      let duration = 240 // Default for trials
      if (data.type === 'interview') {
        const settingsDoc = await db.collection('settings').doc('interviewAvailability').get()
        if (settingsDoc.exists) {
          duration = settingsDoc.data()?.slotDuration || 30
        } else {
          duration = 30 // Default for interviews if no settings
        }
      }

      return {
        valid: true,
        data: {
          id: doc.id,
          candidateId: data.candidateId,
          candidateName: data.candidateName,
          type: data.type,
          jobTitle: data.jobTitle,
          location: data.location,
          duration,
          expiresAt: expiresAt.toISOString(),
        },
      }
    } catch (error) {
      console.error('Error validating token:', error)
      
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new HttpsError('internal', `Failed to validate token: ${message}`)
    }
  }
)

/**
 * Mark Booking Link Used Cloud Function
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

      // Convert plain text body to HTML with line breaks
      const htmlBody = body
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>')

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
// RE-EXPORT ALL FUNCTIONS FROM OTHER FILES
// ============================================================================

// Booking functions
export { getBookingAvailability, getBookingTimeSlots, submitBooking } from './bookingFunctions'

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

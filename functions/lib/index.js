"use strict";
/**
 * Allied Recruitment Portal - Cloud Functions
 * R3.1: CV Parsing Cloud Function
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseIndeedJob = exports.onCandidateWithdrawnOrRejected = exports.onCandidateStatusChange = exports.resolveLapsedInterview = exports.markLapsedInterviews = exports.checkReturningCandidate = exports.reactivateCandidate = exports.restoreCandidate = exports.archiveCandidate = exports.permanentlyDeleteCandidate = exports.onCandidateDeleted = exports.fetchMeetingInsights = exports.checkMeetingStatus = exports.createTeamsMeeting = exports.trackClick = exports.trackOpen = exports.sendBulkCandidateEmails = exports.sendCandidateEmail = exports.submitBooking = exports.getBookingTimeSlots = exports.getBookingAvailability = exports.sendEmail = exports.markBookingLinkUsed = exports.validateBookingToken = exports.createBookingLink = exports.healthCheck = exports.parseCV = void 0;
const https_1 = require("firebase-functions/v2/https");
const options_1 = require("firebase-functions/v2/options");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const mammoth = __importStar(require("mammoth"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
// Define the secret
const anthropicApiKey = (0, params_1.defineSecret)('ANTHROPIC_API_KEY');
// Initialize Firebase Admin
admin.initializeApp();
// Set global options
(0, options_1.setGlobalOptions)({
    region: 'us-central1', // Default region (matching existing functions)
    maxInstances: 10,
});
// ============================================================================
// TEXT EXTRACTION
// ============================================================================
/**
 * Extract text from PDF using pdf-parse
 */
async function extractTextFromPDF(buffer) {
    try {
        const data = await (0, pdf_parse_1.default)(buffer);
        return data.text;
    }
    catch (error) {
        console.error('PDF extraction error:', error);
        throw new Error('Failed to extract text from PDF');
    }
}
/**
 * Extract text from DOCX using mammoth
 */
async function extractTextFromDOCX(buffer) {
    try {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
    }
    catch (error) {
        console.error('DOCX extraction error:', error);
        throw new Error('Failed to extract text from Word document');
    }
}
/**
 * Extract text from file based on MIME type
 */
async function extractText(buffer, mimeType) {
    if (mimeType === 'application/pdf') {
        return extractTextFromPDF(buffer);
    }
    else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword') {
        return extractTextFromDOCX(buffer);
    }
    else if (mimeType === 'text/plain') {
        return buffer.toString('utf-8');
    }
    else {
        throw new Error(`Unsupported file type: ${mimeType}`);
    }
}
// ============================================================================
// REGEX-BASED FALLBACK PARSING (No AI)
// ============================================================================
/**
 * Parse CV text using regex patterns (fallback when AI is unavailable)
 */
function parseWithRegex(text) {
    // Email pattern
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
    const email = emailMatch ? emailMatch[0].toLowerCase() : null;
    // UK Phone patterns (mobile and landline)
    const phonePatterns = [
        /(?:(?:\+44\s?|0)7\d{3}\s?\d{3}\s?\d{3})/, // Mobile: 07xxx xxx xxx or +44 7xxx xxx xxx
        /(?:(?:\+44\s?|0)\d{2,4}\s?\d{3}\s?\d{4})/, // Landline: 01onal xxx xxxx
        /07\d{9}/, // Mobile no spaces
        /(?:\+44|0)\s*\d[\d\s]{9,}/, // General UK
    ];
    let phone = null;
    for (const pattern of phonePatterns) {
        const match = text.match(pattern);
        if (match) {
            phone = match[0].replace(/\s+/g, ' ').trim();
            break;
        }
    }
    // UK Postcode pattern
    const postcodeMatch = text.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i);
    const postcode = postcodeMatch ? postcodeMatch[0].toUpperCase().replace(/\s*/g, ' ').trim() : null;
    // Name extraction - look for name at the start or after common headers
    let firstName = null;
    let lastName = null;
    // Try to find name at the very beginning (first line that looks like a name)
    const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
    for (let i = 0; i < Math.min(10, lines.length); i++) {
        const line = lines[i];
        // Skip lines that look like headers, emails, phones, addresses
        if (line.match(/^(curriculum|resume|cv|profile|contact|email|phone|address|summary|objective)/i))
            continue;
        if (line.includes('@'))
            continue;
        if (line.match(/^\d/) || line.match(/^[\+\(]/))
            continue;
        if (line.length > 50)
            continue;
        // Check if line looks like a name (2-4 words, each starting with capital)
        const words = line.split(/\s+/).filter(w => w.length > 1);
        if (words.length >= 2 && words.length <= 4) {
            const looksLikeName = words.every(w => /^[A-Z][a-z]+$/.test(w) || /^[A-Z]+$/.test(w));
            if (looksLikeName) {
                firstName = words[0];
                lastName = words.slice(1).join(' ');
                break;
            }
        }
        // Also try: if first line is just a capitalized phrase
        if (i === 0 && words.length >= 2 && words.length <= 4) {
            const allCaps = words.every(w => /^[A-Z]/.test(w));
            if (allCaps) {
                firstName = words[0];
                lastName = words.slice(1).join(' ');
                break;
            }
        }
    }
    // Try name extraction from "Name:" pattern
    if (!firstName) {
        const nameMatch = text.match(/(?:name|full\s*name)\s*[:\-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
        if (nameMatch) {
            const nameParts = nameMatch[1].trim().split(/\s+/);
            firstName = nameParts[0];
            lastName = nameParts.slice(1).join(' ');
        }
    }
    // Extract address (look for street-like patterns)
    let address = null;
    const addressMatch = text.match(/\d+\s+[A-Za-z]+(?:\s+[A-Za-z]+)*(?:\s+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Close|Way|Court|Ct|Place|Pl|Crescent|Gardens?))/i);
    if (addressMatch) {
        address = addressMatch[0];
    }
    // Look for pharmacy qualifications
    const qualifications = [];
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
    ];
    for (const pattern of qualPatterns) {
        const matches = text.match(pattern);
        if (matches) {
            matches.forEach(m => {
                if (!qualifications.includes(m.trim())) {
                    qualifications.push(m.trim());
                }
            });
        }
    }
    // Extract skills (common pharmacy/healthcare terms)
    const skills = [];
    const skillTerms = [
        'dispensing', 'customer service', 'patient care', 'stock control',
        'prescription', 'medication', 'pharmaceutical', 'NHS', 'retail',
        'communication', 'team work', 'attention to detail', 'pharmacy',
        'healthcare', 'clinical', 'counter sales', 'stock management',
    ];
    const textLower = text.toLowerCase();
    skillTerms.forEach(skill => {
        if (textLower.includes(skill.toLowerCase()) && !skills.includes(skill)) {
            skills.push(skill.charAt(0).toUpperCase() + skill.slice(1));
        }
    });
    // Try to extract years of experience from text patterns
    let totalYearsExperience = null;
    let pharmacyYearsExperience = null;
    // Look for patterns like "X years experience" or "X+ years"
    const yearsMatch = text.match(/(\d+)\+?\s*years?\s*(?:of\s+)?(?:experience|working)/i);
    if (yearsMatch) {
        totalYearsExperience = parseInt(yearsMatch[1], 10);
    }
    // Look for pharmacy-specific experience
    const pharmacyYearsMatch = text.match(/(\d+)\+?\s*years?\s*(?:of\s+)?(?:pharmacy|pharmaceutical|dispensing|healthcare)/i);
    if (pharmacyYearsMatch) {
        pharmacyYearsExperience = parseInt(pharmacyYearsMatch[1], 10);
    }
    // Generate a basic summary from qualifications and skills
    let summary = null;
    if (qualifications.length > 0 || skills.length > 0) {
        const parts = [];
        if (qualifications.length > 0) {
            parts.push(qualifications.slice(0, 3).join(', '));
        }
        if (totalYearsExperience) {
            parts.push(`${totalYearsExperience} years experience`);
        }
        if (parts.length > 0) {
            summary = parts.join('. ');
            if (summary.length > 200)
                summary = summary.substring(0, 197) + '...';
        }
    }
    // Calculate confidence scores
    const confidence = {
        firstName: firstName ? 70 : 0,
        lastName: lastName ? 70 : 0,
        email: email ? 95 : 0,
        phone: phone ? 85 : 0,
        overall: 0,
    };
    const foundFields = [firstName, lastName, email, phone].filter(f => f !== null).length;
    confidence.overall = Math.round((foundFields / 4) * 100);
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
    };
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
`;
/**
 * Parse CV text using Claude API
 */
async function parseWithClaude(text, apiKey) {
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY not configured');
    }
    const anthropic = new sdk_1.default({ apiKey });
    const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [
            {
                role: 'user',
                content: CV_PARSING_PROMPT + text.substring(0, 15000), // Limit text length
            },
        ],
    });
    // Extract the text content
    const content = response.content[0];
    if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
    }
    // Parse the JSON response
    try {
        // Try to extract JSON from the response (Claude might wrap it in markdown)
        let jsonText = content.text;
        const jsonMatch = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            jsonText = jsonMatch[1];
        }
        const parsed = JSON.parse(jsonText);
        return {
            ...parsed,
            rawText: text,
            usedAI: true,
        };
    }
    catch (error) {
        console.error('Failed to parse Claude response:', content.text);
        throw new Error('Failed to parse CV extraction response');
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
exports.parseCV = (0, https_1.onCall)({
    timeoutSeconds: 60,
    memory: '512MiB',
    enforceAppCheck: false, // Enable in production
    secrets: [anthropicApiKey], // Make secret available to function
}, async (request) => {
    // Verify authentication
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { fileUrl, fileName, mimeType } = request.data;
    // Validate input
    if (!fileUrl || !fileName || !mimeType) {
        throw new https_1.HttpsError('invalid-argument', 'Missing required fields: fileUrl, fileName, mimeType');
    }
    console.log(`Parsing CV: ${fileName} (${mimeType})`);
    try {
        // Download file from Firebase Storage
        const bucket = admin.storage().bucket();
        // Extract file path from URL
        // URL format: https://firebasestorage.googleapis.com/v0/b/BUCKET/o/PATH?alt=media&token=TOKEN
        const urlPath = new URL(fileUrl).pathname;
        const encodedPath = urlPath.split('/o/')[1]?.split('?')[0];
        if (!encodedPath) {
            throw new https_1.HttpsError('invalid-argument', 'Invalid file URL format');
        }
        const filePath = decodeURIComponent(encodedPath);
        const file = bucket.file(filePath);
        // Check if file exists
        const [exists] = await file.exists();
        if (!exists) {
            throw new https_1.HttpsError('not-found', 'File not found in storage');
        }
        // Download file
        const [buffer] = await file.download();
        // Extract text
        console.log('Extracting text...');
        const text = await extractText(buffer, mimeType);
        if (!text || text.trim().length < 50) {
            throw new https_1.HttpsError('failed-precondition', 'Could not extract sufficient text from file');
        }
        console.log(`Extracted ${text.length} characters`);
        // Try parsing with Claude AI first, fallback to regex
        let parsedData;
        let usedAI = false;
        // Get API key from secret
        const apiKey = anthropicApiKey.value();
        try {
            console.log('Attempting to parse with Claude AI...');
            parsedData = await parseWithClaude(text, apiKey);
            usedAI = true;
            console.log('CV parsed successfully with AI:', {
                name: `${parsedData.firstName} ${parsedData.lastName}`,
                email: parsedData.email,
                confidence: parsedData.confidence.overall,
            });
        }
        catch (aiError) {
            console.log('Claude AI parsing failed, using regex fallback:', aiError instanceof Error ? aiError.message : aiError);
            // Fallback to regex-based parsing
            parsedData = parseWithRegex(text);
            console.log('CV parsed with regex fallback:', {
                name: `${parsedData.firstName} ${parsedData.lastName}`,
                email: parsedData.email,
                phone: parsedData.phone,
                confidence: parsedData.confidence.overall,
            });
        }
        return {
            success: true,
            data: parsedData,
            usedAI,
        };
    }
    catch (error) {
        console.error('CV parsing error:', error);
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new https_1.HttpsError('internal', `CV parsing failed: ${message}`);
    }
});
/**
 * Health check function for testing
 */
exports.healthCheck = (0, https_1.onCall)({ timeoutSeconds: 10 }, async () => {
    return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        region: 'europe-west2',
    };
});
/**
 * Generate a cryptographically secure token
 * Uses Node.js crypto for server-side security
 */
function generateSecureToken(length = 21) {
    const crypto = require('crypto');
    const bytes = crypto.randomBytes(length);
    // Convert to URL-safe base64
    return bytes.toString('base64url').substring(0, length);
}
/**
 * Hash a token using SHA-256
 */
function hashToken(token) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(token).digest('hex');
}
/**
 * Create Booking Link Cloud Function
 *
 * Generates a secure booking link for interview/trial scheduling.
 * Token is only returned once; only the hash is stored in Firestore.
 */
exports.createBookingLink = (0, https_1.onCall)({
    timeoutSeconds: 30,
    memory: '256MiB',
    enforceAppCheck: false, // Enable in production
}, async (request) => {
    // Verify authentication
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { candidateId, candidateName, candidateEmail, type, jobId, jobTitle, location, expiryDays = 3, maxUses = 1 } = request.data;
    // Validate required fields
    if (!candidateId || !candidateName || !type) {
        throw new https_1.HttpsError('invalid-argument', 'Missing required fields: candidateId, candidateName, type');
    }
    if (!['interview', 'trial'].includes(type)) {
        throw new https_1.HttpsError('invalid-argument', 'Type must be "interview" or "trial"');
    }
    console.log(`Creating booking link for candidate: ${candidateName} (${candidateId}), type: ${type}`);
    try {
        const db = admin.firestore();
        // Generate secure token
        const token = generateSecureToken(21);
        const tokenHash = hashToken(token);
        // Calculate expiry
        const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000));
        // Prepare document
        const bookingLinkDoc = {
            tokenHash,
            candidateId,
            candidateName,
            candidateEmail: candidateEmail || null,
            type,
            jobId: jobId || null,
            jobTitle: jobTitle || null,
            location: location || null,
            status: 'active',
            expiresAt,
            maxUses,
            useCount: 0,
            requireEmailVerification: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: request.auth.uid,
        };
        // Store in Firestore (token hash only, never the raw token)
        const docRef = await db.collection('bookingLinks').add(bookingLinkDoc);
        // Generate URL - Firebase hosted booking page
        const baseUrl = 'https://allied-booking.web.app/book';
        const url = `${baseUrl}/${token}`;
        console.log(`Booking link created: ${docRef.id}, expires: ${expiresAt.toDate().toISOString()}`);
        return {
            success: true,
            id: docRef.id,
            url,
            expiresAt: expiresAt.toDate().toISOString(),
        };
    }
    catch (error) {
        console.error('Error creating booking link:', error);
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new https_1.HttpsError('internal', `Failed to create booking link: ${message}`);
    }
});
exports.validateBookingToken = (0, https_1.onCall)({
    cors: true,
    timeoutSeconds: 10,
    memory: '256MiB',
    enforceAppCheck: false, // Public function
}, async (request) => {
    // Note: This function does NOT require authentication
    // It's used by the public booking page
    const { token } = request.data;
    if (!token) {
        throw new https_1.HttpsError('invalid-argument', 'Token is required');
    }
    console.log('Validating booking token...');
    try {
        const db = admin.firestore();
        const tokenHash = hashToken(token);
        // Find booking link by token hash
        const snapshot = await db.collection('bookingLinks')
            .where('tokenHash', '==', tokenHash)
            .where('status', '==', 'active')
            .limit(1)
            .get();
        if (snapshot.empty) {
            console.log('Token not found or not active');
            return {
                valid: false,
                error: 'Invalid or expired booking link',
            };
        }
        const doc = snapshot.docs[0];
        const data = doc.data();
        // Check expiry
        const expiresAt = data.expiresAt.toDate();
        if (expiresAt < new Date()) {
            // Mark as expired
            await doc.ref.update({ status: 'expired' });
            console.log('Token expired');
            return {
                valid: false,
                error: 'This booking link has expired',
            };
        }
        // Check max uses
        if (data.useCount >= data.maxUses) {
            await doc.ref.update({ status: 'used' });
            console.log('Token max uses reached');
            return {
                valid: false,
                error: 'This booking link has already been used',
            };
        }
        console.log(`Token valid for: ${data.candidateName}`);
        // Get duration from settings for interviews, 240 min (4 hours) for trials
        let duration = 240; // Default for trials
        if (data.type === 'interview') {
            const settingsDoc = await db.collection('settings').doc('interviewAvailability').get();
            if (settingsDoc.exists) {
                duration = settingsDoc.data()?.slotDuration || 30;
            }
            else {
                duration = 30; // Default for interviews if no settings
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
        };
    }
    catch (error) {
        console.error('Error validating token:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new https_1.HttpsError('internal', `Failed to validate token: ${message}`);
    }
});
exports.markBookingLinkUsed = (0, https_1.onCall)({
    timeoutSeconds: 10,
    memory: '256MiB',
    enforceAppCheck: false,
}, async (request) => {
    const { bookingLinkId, interviewId } = request.data;
    if (!bookingLinkId) {
        throw new https_1.HttpsError('invalid-argument', 'bookingLinkId is required');
    }
    console.log(`Marking booking link as used: ${bookingLinkId}`);
    try {
        const db = admin.firestore();
        const linkRef = db.collection('bookingLinks').doc(bookingLinkId);
        const linkDoc = await linkRef.get();
        if (!linkDoc.exists) {
            throw new https_1.HttpsError('not-found', 'Booking link not found');
        }
        await linkRef.update({
            useCount: admin.firestore.FieldValue.increment(1),
            status: 'used',
            usedAt: admin.firestore.FieldValue.serverTimestamp(),
            ...(interviewId && { interviewId }),
        });
        console.log('Booking link marked as used');
        return { success: true };
    }
    catch (error) {
        console.error('Error marking booking link used:', error);
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new https_1.HttpsError('internal', `Failed to mark booking link used: ${message}`);
    }
});
// ============================================================================
// MICROSOFT GRAPH EMAIL FUNCTION
// ============================================================================
// Use existing Microsoft Graph secrets (same as Teams integration)
const msClientId = (0, params_1.defineSecret)('MS_CLIENT_ID');
const msClientSecret = (0, params_1.defineSecret)('MS_CLIENT_SECRET');
const msTenantId = (0, params_1.defineSecret)('MS_TENANT_ID');
const msOrganizerUserId = (0, params_1.defineSecret)('MS_ORGANIZER_USER_ID');
/**
 * Send Email via Microsoft Graph API
 *
 * Sends an email using Microsoft Graph API with application permissions.
 * Uses existing MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID secrets
 * and sends from the organizer user (recruitment@alliedpharmacies.co.uk).
 */
exports.sendEmail = (0, https_1.onCall)({
    timeoutSeconds: 30,
    memory: '256MiB',
    secrets: [msClientId, msClientSecret, msTenantId, msOrganizerUserId],
    enforceAppCheck: false,
}, async (request) => {
    // Verify authentication
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { to, subject, body, candidateId, candidateName } = request.data;
    // Validate required fields
    if (!to || !subject || !body) {
        throw new https_1.HttpsError('invalid-argument', 'Missing required fields: to, subject, body');
    }
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid email address format');
    }
    console.log(`Sending email to: ${to}, subject: "${subject}"`);
    try {
        // Get Microsoft Graph access token using existing credentials
        const tokenUrl = `https://login.microsoftonline.com/${msTenantId.value()}/oauth2/v2.0/token`;
        const tokenParams = new URLSearchParams({
            client_id: msClientId.value(),
            client_secret: msClientSecret.value(),
            scope: 'https://graph.microsoft.com/.default',
            grant_type: 'client_credentials',
        });
        const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: tokenParams.toString(),
        });
        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('Token error:', errorText);
            throw new Error(`Failed to get access token: ${tokenResponse.status}`);
        }
        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;
        // Send email via Microsoft Graph using organizer user ID
        const organizerUserId = msOrganizerUserId.value();
        const graphUrl = `https://graph.microsoft.com/v1.0/users/${organizerUserId}/sendMail`;
        // Convert plain text body to HTML with line breaks
        const htmlBody = body
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');
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
        };
        const sendResponse = await fetch(graphUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(emailPayload),
        });
        if (!sendResponse.ok) {
            const errorText = await sendResponse.text();
            console.error('Send email error:', errorText);
            throw new Error(`Failed to send email: ${sendResponse.status} - ${errorText}`);
        }
        // Log the email send to Firestore
        const db = admin.firestore();
        await db.collection('emailLog').add({
            to,
            subject,
            candidateId: candidateId || null,
            candidateName: candidateName || null,
            sentBy: request.auth.uid,
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'sent',
        });
        console.log(`Email sent successfully to ${to}`);
        return {
            success: true,
            messageId: `email-${Date.now()}`,
        };
    }
    catch (error) {
        console.error('Error sending email:', error);
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new https_1.HttpsError('internal', `Failed to send email: ${message}`);
    }
});
// ============================================================================
// RE-EXPORT ALL FUNCTIONS FROM OTHER FILES
// ============================================================================
// Booking functions
var bookingFunctions_1 = require("./bookingFunctions");
Object.defineProperty(exports, "getBookingAvailability", { enumerable: true, get: function () { return bookingFunctions_1.getBookingAvailability; } });
Object.defineProperty(exports, "getBookingTimeSlots", { enumerable: true, get: function () { return bookingFunctions_1.getBookingTimeSlots; } });
Object.defineProperty(exports, "submitBooking", { enumerable: true, get: function () { return bookingFunctions_1.submitBooking; } });
// Email functions with tracking
var emailFunctions_1 = require("./emailFunctions");
Object.defineProperty(exports, "sendCandidateEmail", { enumerable: true, get: function () { return emailFunctions_1.sendCandidateEmail; } });
Object.defineProperty(exports, "sendBulkCandidateEmails", { enumerable: true, get: function () { return emailFunctions_1.sendBulkCandidateEmails; } });
Object.defineProperty(exports, "trackOpen", { enumerable: true, get: function () { return emailFunctions_1.trackOpen; } });
Object.defineProperty(exports, "trackClick", { enumerable: true, get: function () { return emailFunctions_1.trackClick; } });
// Teams meeting functions
var teamsMeetingFunctions_1 = require("./teamsMeetingFunctions");
Object.defineProperty(exports, "createTeamsMeeting", { enumerable: true, get: function () { return teamsMeetingFunctions_1.createTeamsMeeting; } });
Object.defineProperty(exports, "checkMeetingStatus", { enumerable: true, get: function () { return teamsMeetingFunctions_1.checkMeetingStatus; } });
Object.defineProperty(exports, "fetchMeetingInsights", { enumerable: true, get: function () { return teamsMeetingFunctions_1.fetchMeetingInsights; } });
// Cascade deletion triggers
var cascadeDeletion_1 = require("./cascadeDeletion");
Object.defineProperty(exports, "onCandidateDeleted", { enumerable: true, get: function () { return cascadeDeletion_1.onCandidateDeleted; } });
Object.defineProperty(exports, "permanentlyDeleteCandidate", { enumerable: true, get: function () { return cascadeDeletion_1.permanentlyDeleteCandidate; } });
Object.defineProperty(exports, "archiveCandidate", { enumerable: true, get: function () { return cascadeDeletion_1.archiveCandidate; } });
Object.defineProperty(exports, "restoreCandidate", { enumerable: true, get: function () { return cascadeDeletion_1.restoreCandidate; } });
Object.defineProperty(exports, "reactivateCandidate", { enumerable: true, get: function () { return cascadeDeletion_1.reactivateCandidate; } });
Object.defineProperty(exports, "checkReturningCandidate", { enumerable: true, get: function () { return cascadeDeletion_1.checkReturningCandidate; } });
// Lapsed interviews and status change triggers
var lapsedInterviews_1 = require("./lapsedInterviews");
Object.defineProperty(exports, "markLapsedInterviews", { enumerable: true, get: function () { return lapsedInterviews_1.markLapsedInterviews; } });
Object.defineProperty(exports, "resolveLapsedInterview", { enumerable: true, get: function () { return lapsedInterviews_1.resolveLapsedInterview; } });
Object.defineProperty(exports, "onCandidateStatusChange", { enumerable: true, get: function () { return lapsedInterviews_1.onCandidateStatusChange; } });
Object.defineProperty(exports, "onCandidateWithdrawnOrRejected", { enumerable: true, get: function () { return lapsedInterviews_1.onCandidateWithdrawnOrRejected; } });
// Job import
var jobImport_1 = require("./jobImport");
Object.defineProperty(exports, "parseIndeedJob", { enumerable: true, get: function () { return jobImport_1.parseIndeedJob; } });
//# sourceMappingURL=index.js.map
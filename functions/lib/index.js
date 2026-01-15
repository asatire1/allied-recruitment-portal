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
exports.triggerExpiredBookingCleanup = exports.checkCandidateBookingExpiry = exports.cleanupExpiredBookingLinks = exports.completePasswordReset = exports.validatePasswordReset = exports.requestPasswordReset = exports.completeUserRegistration = exports.validateUserInvite = exports.createUserInvite = exports.sendTestEmail = exports.migrateMessageTemplates = exports.validateFeedbackToken = exports.submitTrialFeedback = exports.sendDailyFeedbackRequests = exports.sendTrialBranchNotification = exports.parseIndeedJob = exports.processInterviewsNow = exports.onCandidateWithdrawnOrRejected = exports.onCandidateStatusChange = exports.resolveLapsedInterview = exports.markLapsedInterviews = exports.checkReturningCandidate = exports.reactivateCandidate = exports.restoreCandidate = exports.archiveCandidate = exports.permanentlyDeleteCandidate = exports.onCandidateDeleted = exports.fetchMeetingInsights = exports.checkMeetingStatus = exports.createTeamsMeeting = exports.trackClick = exports.trackOpen = exports.sendBulkCandidateEmails = exports.sendCandidateEmail = exports.createBookingLink = exports.validateBookingToken = exports.submitBooking = exports.getBookingTimeSlots = exports.getBookingAvailability = exports.createUserWithPassword = exports.sendEmail = exports.markBookingLinkUsed = exports.parseCV = void 0;
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
    // Look for experience years
    let totalYearsExperience = null;
    let pharmacyYearsExperience = null;
    const yearsMatch = text.match(/(\d+)\+?\s*years?\s*(?:of\s+)?experience/i);
    if (yearsMatch) {
        totalYearsExperience = parseInt(yearsMatch[1], 10);
    }
    const pharmacyYearsMatch = text.match(/(\d+)\+?\s*years?\s*(?:of\s+)?(?:pharmacy|dispensing)/i);
    if (pharmacyYearsMatch) {
        pharmacyYearsExperience = parseInt(pharmacyYearsMatch[1], 10);
    }
    // Check for right to work
    const rightToWork = text.match(/right\s+to\s+work|eligible\s+to\s+work|work\s+permit|visa|british\s+citizen/i) !== null;
    // Check for driver's license
    const hasDriversLicense = text.match(/driv(?:er'?s?|ing)\s*licen[cs]e|full\s+uk\s+licen[cs]e|clean\s+licen[cs]e/i) !== null;
    // Calculate confidence scores (basic heuristics)
    const confidence = {
        firstName: firstName ? (firstName.length > 1 ? 0.7 : 0.4) : 0,
        lastName: lastName ? (lastName.length > 1 ? 0.7 : 0.4) : 0,
        email: email ? 0.95 : 0,
        phone: phone ? 0.85 : 0,
        overall: 0
    };
    // Calculate overall confidence
    const weights = { firstName: 0.2, lastName: 0.2, email: 0.35, phone: 0.25 };
    confidence.overall =
        confidence.firstName * weights.firstName +
            confidence.lastName * weights.lastName +
            confidence.email * weights.email +
            confidence.phone * weights.phone;
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
    };
}
// ============================================================================
// AI-POWERED CV PARSING
// ============================================================================
/**
 * Parse CV using Claude AI for better extraction
 */
async function parseWithAI(text, apiKey) {
    const client = new sdk_1.default({ apiKey });
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

Only return the JSON object, no other text.`;
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
        });
        // Extract text from response
        const content = response.content[0];
        if (content.type !== 'text') {
            throw new Error('Unexpected response type from Claude');
        }
        // Parse JSON from response
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in Claude response');
        }
        const parsed = JSON.parse(jsonMatch[0]);
        return {
            ...parsed,
            rawText: text,
            usedAI: true,
        };
    }
    catch (error) {
        console.error('AI parsing error:', error);
        throw error;
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
exports.parseCV = (0, https_1.onCall)({
    cors: true,
    region: 'europe-west2',
    timeoutSeconds: 120,
    memory: '1GiB',
    secrets: [anthropicApiKey],
    enforceAppCheck: false,
}, async (request) => {
    // Verify authentication
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { fileUrl, fileName, mimeType } = request.data;
    // Validate required fields
    if (!fileUrl || !fileName || !mimeType) {
        throw new https_1.HttpsError('invalid-argument', 'Missing required fields: fileUrl, fileName, mimeType');
    }
    console.log(`Parsing CV: ${fileName} (${mimeType})`);
    try {
        // Download file from Firebase Storage URL
        const response = await fetch(fileUrl);
        if (!response.ok) {
            throw new Error(`Failed to download file: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        // Extract text from document
        const text = await extractText(buffer, mimeType);
        if (!text || text.trim().length < 50) {
            throw new Error('Could not extract sufficient text from document');
        }
        console.log(`Extracted ${text.length} characters from CV`);
        // Try AI parsing first, fall back to regex
        let parsedData;
        const apiKey = anthropicApiKey.value();
        if (apiKey) {
            try {
                console.log('Attempting AI-powered CV parsing...');
                parsedData = await parseWithAI(text, apiKey);
                console.log('AI parsing successful');
            }
            catch (aiError) {
                console.warn('AI parsing failed, falling back to regex:', aiError);
                parsedData = parseWithRegex(text);
            }
        }
        else {
            console.log('No API key configured, using regex parsing');
            parsedData = parseWithRegex(text);
        }
        console.log(`CV parsed successfully. Name: ${parsedData.firstName} ${parsedData.lastName}, Email: ${parsedData.email}`);
        return {
            success: true,
            data: parsedData
        };
    }
    catch (error) {
        console.error('CV parsing error:', error);
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new https_1.HttpsError('internal', `Failed to parse CV: ${message}`);
    }
});
exports.markBookingLinkUsed = (0, https_1.onCall)({
    cors: true,
    region: 'europe-west2',
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
    cors: true,
    region: 'europe-west2',
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
        // Convert plain text body to HTML with line breaks and clickable links
        let htmlBody = body
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        // Convert URLs to clickable links (must be done before newline replacement)
        const urlRegex = /(https?:\/\/[^\s<]+)/g;
        htmlBody = htmlBody.replace(urlRegex, (url) => {
            return `<a href="${url}" target="_blank" style="color: #0066cc; text-decoration: underline; font-weight: 600;">${url}</a>`;
        });
        // Replace newlines with <br>
        htmlBody = htmlBody.replace(/\n/g, '<br>');
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
// CREATE USER WITH PASSWORD
// ============================================================================
exports.createUserWithPassword = (0, https_1.onCall)({
    cors: [
        'https://allied-recruitment.web.app',
        'https://recruitment-633bd.web.app',
        'http://localhost:3000',
        'http://localhost:5173',
    ],
    region: 'europe-west2',
}, async (request) => {
    // Require authentication
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be authenticated to create users');
    }
    const { email, password, displayName, phone, role, entities, branchIds, emailNotifications, pushNotifications } = request.data;
    // Validate required fields
    if (!email || !password || !displayName || !role) {
        throw new https_1.HttpsError('invalid-argument', 'Missing required fields: email, password, displayName, role');
    }
    // Validate password length
    if (password.length < 6) {
        throw new https_1.HttpsError('invalid-argument', 'Password must be at least 6 characters');
    }
    try {
        // Check if caller has admin privileges (optional - implement based on your role system)
        const callerDoc = await admin.firestore().collection('users').doc(request.auth.uid).get();
        const callerRole = callerDoc.data()?.role;
        if (!['super_admin', 'admin'].includes(callerRole)) {
            throw new https_1.HttpsError('permission-denied', 'Only admins can create users');
        }
        // Validate phone number format (E.164: +CountryCodeNumber, e.g., +447123456789)
        // Only pass to Firebase Auth if valid, otherwise just store in Firestore
        const isValidE164 = phone && /^\+[1-9]\d{6,14}$/.test(phone);
        // Create the user in Firebase Auth
        const userRecord = await admin.auth().createUser({
            email: email.toLowerCase(),
            password,
            displayName,
            phoneNumber: isValidE164 ? phone : undefined,
        });
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
        });
        console.log(`User created: ${userRecord.uid} (${email})`);
        return {
            success: true,
            uid: userRecord.uid,
            message: `User ${displayName} created successfully`,
        };
    }
    catch (error) {
        console.error('Error creating user:', error);
        // Handle specific Firebase Auth errors
        if (error.code === 'auth/email-already-exists') {
            throw new https_1.HttpsError('already-exists', 'A user with this email already exists');
        }
        if (error.code === 'auth/invalid-email') {
            throw new https_1.HttpsError('invalid-argument', 'Invalid email address');
        }
        if (error.code === 'auth/invalid-password') {
            throw new https_1.HttpsError('invalid-argument', 'Invalid password');
        }
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        throw new https_1.HttpsError('internal', error.message || 'Failed to create user');
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
// Booking token validation (for public booking page)
var bookingToken_1 = require("./bookingToken");
Object.defineProperty(exports, "validateBookingToken", { enumerable: true, get: function () { return bookingToken_1.validateBookingToken; } });
// Booking link creation (for sending invites)
var bookingLinkFunctions_1 = require("./bookingLinkFunctions");
Object.defineProperty(exports, "createBookingLink", { enumerable: true, get: function () { return bookingLinkFunctions_1.createBookingLink; } });
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
Object.defineProperty(exports, "processInterviewsNow", { enumerable: true, get: function () { return lapsedInterviews_1.processInterviewsNow; } });
// Job import
var jobImport_1 = require("./jobImport");
Object.defineProperty(exports, "parseIndeedJob", { enumerable: true, get: function () { return jobImport_1.parseIndeedJob; } });
// Trial notifications and feedback
var trialNotifications_1 = require("./trialNotifications");
Object.defineProperty(exports, "sendTrialBranchNotification", { enumerable: true, get: function () { return trialNotifications_1.sendTrialBranchNotification; } });
Object.defineProperty(exports, "sendDailyFeedbackRequests", { enumerable: true, get: function () { return trialNotifications_1.sendDailyFeedbackRequests; } });
Object.defineProperty(exports, "submitTrialFeedback", { enumerable: true, get: function () { return trialNotifications_1.submitTrialFeedback; } });
Object.defineProperty(exports, "validateFeedbackToken", { enumerable: true, get: function () { return trialNotifications_1.validateFeedbackToken; } });
// Template migration (run once to set up unified template system)
var migrateTemplatesFunction_1 = require("./migrations/migrateTemplatesFunction");
Object.defineProperty(exports, "migrateMessageTemplates", { enumerable: true, get: function () { return migrateTemplatesFunction_1.migrateMessageTemplates; } });
// Test email (Phase 5: Template testing)
var sendTestEmail_1 = require("./sendTestEmail");
Object.defineProperty(exports, "sendTestEmail", { enumerable: true, get: function () { return sendTestEmail_1.sendTestEmail; } });
// User invite and password reset functions
var userInviteFunctions_1 = require("./userInviteFunctions");
Object.defineProperty(exports, "createUserInvite", { enumerable: true, get: function () { return userInviteFunctions_1.createUserInvite; } });
Object.defineProperty(exports, "validateUserInvite", { enumerable: true, get: function () { return userInviteFunctions_1.validateUserInvite; } });
Object.defineProperty(exports, "completeUserRegistration", { enumerable: true, get: function () { return userInviteFunctions_1.completeUserRegistration; } });
Object.defineProperty(exports, "requestPasswordReset", { enumerable: true, get: function () { return userInviteFunctions_1.requestPasswordReset; } });
Object.defineProperty(exports, "validatePasswordReset", { enumerable: true, get: function () { return userInviteFunctions_1.validatePasswordReset; } });
Object.defineProperty(exports, "completePasswordReset", { enumerable: true, get: function () { return userInviteFunctions_1.completePasswordReset; } });
// Expired booking link cleanup
var expiredBookingCleanup_1 = require("./expiredBookingCleanup");
Object.defineProperty(exports, "cleanupExpiredBookingLinks", { enumerable: true, get: function () { return expiredBookingCleanup_1.cleanupExpiredBookingLinks; } });
Object.defineProperty(exports, "checkCandidateBookingExpiry", { enumerable: true, get: function () { return expiredBookingCleanup_1.checkCandidateBookingExpiry; } });
Object.defineProperty(exports, "triggerExpiredBookingCleanup", { enumerable: true, get: function () { return expiredBookingCleanup_1.triggerExpiredBookingCleanup; } });
//# sourceMappingURL=index.js.map
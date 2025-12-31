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
exports.onCandidateDeleted = exports.permanentlyDeleteCandidate = exports.reactivateCandidate = exports.checkReturningCandidate = exports.restoreCandidate = exports.archiveCandidate = exports.parseIndeedJob = exports.submitBooking = exports.getBookingTimeSlots = exports.getBookingAvailability = exports.onTrialCompleted = exports.sendFeedbackReminders = exports.onTrialCreated = exports.createUserWithPassword = exports.sendBookingConfirmation = exports.markBookingLinkUsed = exports.validateBookingToken = exports.createBookingLink = exports.healthCheck = exports.parseCV = void 0;
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
// REGEX-BASED FALLBACK PARSING
// ============================================================================
function parseWithRegex(text) {
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
    const email = emailMatch ? emailMatch[0].toLowerCase() : null;
    const phonePatterns = [
        /(?:(?:\+44\s?|0)7\d{3}\s?\d{3}\s?\d{3})/,
        /(?:(?:\+44\s?|0)\d{2,4}\s?\d{3}\s?\d{4})/,
        /07\d{9}/,
        /(?:\+44|0)\s*\d[\d\s]{9,}/,
    ];
    let phone = null;
    for (const pattern of phonePatterns) {
        const match = text.match(pattern);
        if (match) {
            phone = match[0].replace(/\s+/g, ' ').trim();
            break;
        }
    }
    const postcodeMatch = text.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i);
    const postcode = postcodeMatch ? postcodeMatch[0].toUpperCase().replace(/\s*/g, ' ').trim() : null;
    let firstName = null;
    let lastName = null;
    const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
    for (let i = 0; i < Math.min(10, lines.length); i++) {
        const line = lines[i];
        if (line.match(/^(curriculum|resume|cv|profile|contact|email|phone|address|summary|objective)/i))
            continue;
        if (line.includes('@'))
            continue;
        if (line.match(/^\d/) || line.match(/^[\+\(]/))
            continue;
        if (line.length > 50)
            continue;
        const words = line.split(/\s+/).filter(w => w.length > 1);
        if (words.length >= 2 && words.length <= 4) {
            const looksLikeName = words.every(w => /^[A-Z][a-z]+$/.test(w) || /^[A-Z]+$/.test(w));
            if (looksLikeName) {
                firstName = words[0];
                lastName = words.slice(1).join(' ');
                break;
            }
        }
        if (i === 0 && words.length >= 2 && words.length <= 4) {
            const allCaps = words.every(w => /^[A-Z]/.test(w));
            if (allCaps) {
                firstName = words[0];
                lastName = words.slice(1).join(' ');
                break;
            }
        }
    }
    if (!firstName) {
        const nameMatch = text.match(/(?:name|full\s*name)\s*[:\-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
        if (nameMatch) {
            const nameParts = nameMatch[1].trim().split(/\s+/);
            firstName = nameParts[0];
            lastName = nameParts.slice(1).join(' ');
        }
    }
    let address = null;
    const addressMatch = text.match(/\d+\s+[A-Za-z]+(?:\s+[A-Za-z]+)*(?:\s+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Close|Way|Court|Ct|Place|Pl|Crescent|Gardens?))/i);
    if (addressMatch) {
        address = addressMatch[0];
    }
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
    let totalYearsExperience = null;
    let pharmacyYearsExperience = null;
    const yearsMatch = text.match(/(\d+)\+?\s*years?\s*(?:of\s+)?(?:experience|working)/i);
    if (yearsMatch) {
        totalYearsExperience = parseInt(yearsMatch[1], 10);
    }
    const pharmacyYearsMatch = text.match(/(\d+)\+?\s*years?\s*(?:of\s+)?(?:pharmacy|pharmaceutical|dispensing|healthcare)/i);
    if (pharmacyYearsMatch) {
        pharmacyYearsExperience = parseInt(pharmacyYearsMatch[1], 10);
    }
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
        firstName, lastName, email, phone, address, postcode, summary,
        experience: [], education: [], qualifications, skills,
        rightToWork: textLower.includes('right to work') || textLower.includes('eligible to work') ? true : null,
        hasDriversLicense: textLower.includes('driving licen') || textLower.includes('driver') ? true : null,
        totalYearsExperience, pharmacyYearsExperience, confidence, rawText: text, usedAI: false,
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
`;
async function parseWithClaude(text, apiKey) {
    if (!apiKey)
        throw new Error('ANTHROPIC_API_KEY not configured');
    const anthropic = new sdk_1.default({ apiKey });
    const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: CV_PARSING_PROMPT + text.substring(0, 15000) }],
    });
    const content = response.content[0];
    if (content.type !== 'text')
        throw new Error('Unexpected response type from Claude');
    try {
        let jsonText = content.text;
        const jsonMatch = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch)
            jsonText = jsonMatch[1];
        const parsed = JSON.parse(jsonText);
        return { ...parsed, rawText: text, usedAI: true };
    }
    catch (error) {
        console.error('Failed to parse Claude response:', content.text);
        throw new Error('Failed to parse CV extraction response');
    }
}
// ============================================================================
// PARSE CV FUNCTION
// ============================================================================
exports.parseCV = (0, https_1.onCall)({ timeoutSeconds: 60, memory: '512MiB', enforceAppCheck: false, secrets: [anthropicApiKey] }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
    const { fileUrl, fileName, mimeType } = request.data;
    if (!fileUrl || !fileName || !mimeType) {
        throw new https_1.HttpsError('invalid-argument', 'Missing required fields: fileUrl, fileName, mimeType');
    }
    console.log(`Parsing CV: ${fileName} (${mimeType})`);
    try {
        const bucket = admin.storage().bucket();
        const urlPath = new URL(fileUrl).pathname;
        const encodedPath = urlPath.split('/o/')[1]?.split('?')[0];
        if (!encodedPath)
            throw new https_1.HttpsError('invalid-argument', 'Invalid file URL format');
        const filePath = decodeURIComponent(encodedPath);
        const file = bucket.file(filePath);
        const [exists] = await file.exists();
        if (!exists)
            throw new https_1.HttpsError('not-found', 'File not found in storage');
        const [buffer] = await file.download();
        const text = await extractText(buffer, mimeType);
        if (!text || text.trim().length < 50) {
            throw new https_1.HttpsError('failed-precondition', 'Could not extract sufficient text from file');
        }
        let parsedData;
        let usedAI = false;
        const apiKey = anthropicApiKey.value();
        try {
            parsedData = await parseWithClaude(text, apiKey);
            usedAI = true;
        }
        catch (aiError) {
            console.log('Claude AI parsing failed, using regex fallback');
            parsedData = parseWithRegex(text);
        }
        return { success: true, data: parsedData, usedAI };
    }
    catch (error) {
        if (error instanceof https_1.HttpsError)
            throw error;
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new https_1.HttpsError('internal', `CV parsing failed: ${message}`);
    }
});
exports.healthCheck = (0, https_1.onCall)({ timeoutSeconds: 10 }, async () => {
    return { status: 'ok', timestamp: new Date().toISOString(), region: 'us-central1' };
});
function generateSecureToken(length = 21) {
    const crypto = require('crypto');
    return crypto.randomBytes(length).toString('base64url').substring(0, length);
}
function hashToken(token) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(token).digest('hex');
}
// ============================================================================
// AUTO STATUS UPDATE HELPER - Updates candidate status when invite sent
// ============================================================================
async function updateCandidateStatusOnInvite(candidateId, inviteType, createdBy) {
    try {
        const db = admin.firestore();
        const candidateRef = db.collection('candidates').doc(candidateId);
        const candidateDoc = await candidateRef.get();
        if (!candidateDoc.exists) {
            console.warn(`Candidate ${candidateId} not found for status update`);
            return;
        }
        const previousStatus = candidateDoc.data()?.status || 'unknown';
        // Update candidate status to invite_sent
        await candidateRef.update({
            status: 'invite_sent',
            inviteType: inviteType,
            inviteSentAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
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
        });
        console.log(`Candidate ${candidateId} status updated to invite_sent (${inviteType})`);
    }
    catch (error) {
        // Non-blocking - log error but don't fail the booking link creation
        console.error(`Failed to update candidate status for ${candidateId}:`, error);
    }
}
// ============================================================================
exports.createBookingLink = (0, https_1.onCall)({ timeoutSeconds: 30, memory: '256MiB', enforceAppCheck: false }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
    const { candidateId, candidateName, candidateEmail, type, jobId, jobTitle, branchId, branchName, branchAddress, location, duration: customDuration, expiryDays = 3, maxUses = 1, notes } = request.data;
    if (!candidateId || !candidateName || !type) {
        throw new https_1.HttpsError('invalid-argument', 'Missing required fields: candidateId, candidateName, type');
    }
    if (!['interview', 'trial'].includes(type)) {
        throw new https_1.HttpsError('invalid-argument', 'Type must be "interview" or "trial"');
    }
    try {
        const db = admin.firestore();
        let duration = customDuration;
        if (!duration) {
            duration = type === 'interview' ? 30 : 240;
        }
        const token = generateSecureToken(21);
        const tokenHash = hashToken(token);
        const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000));
        const bookingLinkDoc = {
            tokenHash, candidateId, candidateName, candidateEmail: candidateEmail || null,
            type, duration, jobId: jobId || null, jobTitle: jobTitle || null,
            branchId: branchId || null, branchName: branchName || location || null,
            branchAddress: branchAddress || null, notes: notes || null,
            status: 'active', expiresAt, maxUses, useCount: 0,
            requireEmailVerification: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: request.auth.uid,
        };
        const docRef = await db.collection('bookingLinks').add(bookingLinkDoc);
        const url = `https://allied-booking.web.app/book/${token}`;
        // Auto-update candidate status to 'invite_sent'
        await updateCandidateStatusOnInvite(candidateId, type, request.auth.uid);
        return { success: true, id: docRef.id, url, expiresAt: expiresAt.toDate().toISOString(), duration };
    }
    catch (error) {
        if (error instanceof https_1.HttpsError)
            throw error;
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new https_1.HttpsError('internal', `Failed to create booking link: ${message}`);
    }
});
exports.validateBookingToken = (0, https_1.onCall)({ timeoutSeconds: 10, memory: '256MiB', enforceAppCheck: false }, async (request) => {
    const { token } = request.data;
    if (!token)
        throw new https_1.HttpsError('invalid-argument', 'Token is required');
    try {
        const db = admin.firestore();
        const tokenHash = hashToken(token);
        const snapshot = await db.collection('bookingLinks')
            .where('tokenHash', '==', tokenHash)
            .where('status', '==', 'active')
            .limit(1)
            .get();
        if (snapshot.empty)
            return { valid: false, error: 'Invalid or expired booking link' };
        const doc = snapshot.docs[0];
        const data = doc.data();
        const expiresAt = data.expiresAt.toDate();
        if (expiresAt < new Date()) {
            await doc.ref.update({ status: 'expired' });
            return { valid: false, error: 'This booking link has expired' };
        }
        if (data.useCount >= data.maxUses) {
            await doc.ref.update({ status: 'used' });
            return { valid: false, error: 'This booking link has already been used' };
        }
        // Get the correct slot duration from settings for interviews
        let interviewDuration = 30; // default
        if (data.type === 'interview') {
            try {
                const settingsDoc = await db.collection('settings').doc('interviewAvailability').get();
                if (settingsDoc.exists) {
                    interviewDuration = settingsDoc.data()?.slotDuration || 30;
                }
            }
            catch (settingsError) {
                console.error('Failed to get slot duration from settings:', settingsError);
            }
        }
        const duration = data.duration || (data.type === 'interview' ? interviewDuration : 240);
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
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new https_1.HttpsError('internal', `Failed to validate token: ${message}`);
    }
});
exports.markBookingLinkUsed = (0, https_1.onCall)({ timeoutSeconds: 10, memory: '256MiB', enforceAppCheck: false }, async (request) => {
    const { bookingLinkId, interviewId } = request.data;
    if (!bookingLinkId)
        throw new https_1.HttpsError('invalid-argument', 'bookingLinkId is required');
    try {
        const db = admin.firestore();
        const linkRef = db.collection('bookingLinks').doc(bookingLinkId);
        const linkDoc = await linkRef.get();
        if (!linkDoc.exists)
            throw new https_1.HttpsError('not-found', 'Booking link not found');
        await linkRef.update({
            useCount: admin.firestore.FieldValue.increment(1),
            status: 'used',
            usedAt: admin.firestore.FieldValue.serverTimestamp(),
            ...(interviewId && { interviewId }),
        });
        return { success: true };
    }
    catch (error) {
        if (error instanceof https_1.HttpsError)
            throw error;
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new https_1.HttpsError('internal', `Failed to mark booking link used: ${message}`);
    }
});
function generateICSFile(title, description, location, startDate, endDate, organizerEmail = 'recruitment@alliedpharmacies.co.uk', teamsJoinUrl) {
    const formatDate = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const uid = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}@alliedpharmacies.co.uk`;
    let fullDescription = description;
    if (teamsJoinUrl)
        fullDescription += `\\n\\n---\\nJoin Microsoft Teams Meeting:\\n${teamsJoinUrl}`;
    const meetingLocation = teamsJoinUrl ? 'Microsoft Teams Meeting' : location;
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
END:VCALENDAR`;
}
exports.sendBookingConfirmation = (0, https_1.onCall)({ region: 'us-central1', maxInstances: 10 }, async (request) => {
    const data = request.data;
    const { interviewId, candidateName, candidateEmail, interviewType, scheduledAt, duration, jobTitle, branchName, branchId, teamsJoinUrl } = data;
    if (!interviewId)
        throw new https_1.HttpsError('invalid-argument', 'interviewId is required');
    const db = admin.firestore();
    const scheduledDate = new Date(scheduledAt);
    const endDate = new Date(scheduledDate.getTime() + duration * 60000);
    const dateOptions = {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London'
    };
    const formattedDate = scheduledDate.toLocaleDateString('en-GB', dateOptions);
    const typeLabel = interviewType === 'trial' ? 'Trial Shift' : 'Interview';
    const title = `${typeLabel}${jobTitle ? ` - ${jobTitle}` : ''} with Allied Pharmacies`;
    let branchAddress = '';
    let branchEmail = '';
    if (branchId) {
        try {
            const branchDoc = await db.collection('branches').doc(branchId).get();
            if (branchDoc.exists) {
                const branchData = branchDoc.data();
                branchAddress = branchData?.address || '';
                branchEmail = branchData?.email || branchData?.managerEmail || '';
            }
        }
        catch (err) {
            console.warn('Could not fetch branch details:', err);
        }
    }
    const location = interviewType === 'interview' && teamsJoinUrl
        ? 'Microsoft Teams (online)'
        : (branchAddress || branchName || 'To be confirmed');
    const icsDescription = `Your ${typeLabel.toLowerCase()} has been scheduled.\\n\\nCandidate: ${candidateName}\\nPosition: ${jobTitle || 'Not specified'}\\nDuration: ${duration} minutes`;
    const icsContent = generateICSFile(title, icsDescription, location, scheduledDate, endDate, 'recruitment@alliedpharmacies.co.uk', interviewType === 'interview' ? teamsJoinUrl : undefined);
    try {
        await db.collection('emailNotifications').add({
            type: 'booking_confirmation', interviewId, candidateName,
            candidateEmail: candidateEmail || null, interviewType,
            scheduledAt: admin.firestore.Timestamp.fromDate(scheduledDate),
            duration, jobTitle: jobTitle || null, branchName: branchName || null,
            branchId: branchId || null, branchEmail: branchEmail || null,
            teamsJoinUrl: teamsJoinUrl || null, status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        const teamsMeetingSection = teamsJoinUrl && interviewType === 'interview' ? `
        <div style="background: #f0f7ff; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #0078d4;">
          <p style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #0078d4;">📹 Microsoft Teams Meeting</p>
          <p style="margin: 0 0 12px 0; font-size: 14px; color: #374151;">This is an online interview. Click the button below to join at your scheduled time:</p>
          <a href="${teamsJoinUrl}" style="display: inline-block; background: #0078d4; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">Join Teams Meeting</a>
          <p style="margin: 12px 0 0 0; font-size: 12px; color: #6b7280;">Or copy this link: ${teamsJoinUrl}</p>
        </div>
      ` : '';
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
            });
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
            });
        }
        return {
            success: true, message: 'Booking confirmation emails sent',
            notification: { candidateEmail: candidateEmail || 'Not provided', branchEmail: branchEmail || 'Not configured', scheduledAt: formattedDate, teamsJoinUrl: teamsJoinUrl || null }
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new https_1.HttpsError('internal', `Failed to send confirmation: ${message}`);
    }
});
exports.createUserWithPassword = (0, https_1.onCall)({ region: 'us-central1', maxInstances: 10 }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be logged in to create users');
    const db = admin.firestore();
    const callerDoc = await db.collection('users').doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data()?.role !== 'super_admin') {
        throw new https_1.HttpsError('permission-denied', 'Only super admins can create users');
    }
    const { email, password, displayName, phone, role, entities, branchIds, emailNotifications, pushNotifications } = request.data;
    if (!email || !password || !displayName || !role) {
        throw new https_1.HttpsError('invalid-argument', 'Missing required fields');
    }
    if (password.length < 6) {
        throw new https_1.HttpsError('invalid-argument', 'Password must be at least 6 characters');
    }
    try {
        const userRecord = await admin.auth().createUser({
            email: email.toLowerCase(), password, displayName, disabled: false,
        });
        await db.collection('users').doc(userRecord.uid).set({
            email: email.toLowerCase(), displayName, phone: phone || null, role,
            entities: entities || [], branchIds: branchIds || [], active: true,
            emailNotifications: emailNotifications ?? true, pushNotifications: pushNotifications ?? true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: request.auth.uid,
        });
        return { success: true, uid: userRecord.uid, message: `User ${displayName} created successfully` };
    }
    catch (error) {
        if (error.code === 'auth/email-already-exists')
            throw new https_1.HttpsError('already-exists', 'A user with this email already exists');
        if (error.code === 'auth/invalid-email')
            throw new https_1.HttpsError('invalid-argument', 'Invalid email address');
        if (error.code === 'auth/weak-password')
            throw new https_1.HttpsError('invalid-argument', 'Password is too weak');
        throw new https_1.HttpsError('internal', `Failed to create user: ${error.message}`);
    }
});
// B4: Push Notifications
var pushNotifications_1 = require("./pushNotifications");
Object.defineProperty(exports, "onTrialCreated", { enumerable: true, get: function () { return pushNotifications_1.onTrialCreated; } });
Object.defineProperty(exports, "sendFeedbackReminders", { enumerable: true, get: function () { return pushNotifications_1.sendFeedbackReminders; } });
Object.defineProperty(exports, "onTrialCompleted", { enumerable: true, get: function () { return pushNotifications_1.onTrialCompleted; } });
// Booking Page Functions
var bookingFunctions_1 = require("./bookingFunctions");
Object.defineProperty(exports, "getBookingAvailability", { enumerable: true, get: function () { return bookingFunctions_1.getBookingAvailability; } });
Object.defineProperty(exports, "getBookingTimeSlots", { enumerable: true, get: function () { return bookingFunctions_1.getBookingTimeSlots; } });
Object.defineProperty(exports, "submitBooking", { enumerable: true, get: function () { return bookingFunctions_1.submitBooking; } });
// Indeed Job Import
var jobImport_1 = require("./jobImport");
Object.defineProperty(exports, "parseIndeedJob", { enumerable: true, get: function () { return jobImport_1.parseIndeedJob; } });
// Candidate archive functions
var cascadeDeletion_1 = require("./cascadeDeletion");
Object.defineProperty(exports, "archiveCandidate", { enumerable: true, get: function () { return cascadeDeletion_1.archiveCandidate; } });
Object.defineProperty(exports, "restoreCandidate", { enumerable: true, get: function () { return cascadeDeletion_1.restoreCandidate; } });
Object.defineProperty(exports, "checkReturningCandidate", { enumerable: true, get: function () { return cascadeDeletion_1.checkReturningCandidate; } });
Object.defineProperty(exports, "reactivateCandidate", { enumerable: true, get: function () { return cascadeDeletion_1.reactivateCandidate; } });
Object.defineProperty(exports, "permanentlyDeleteCandidate", { enumerable: true, get: function () { return cascadeDeletion_1.permanentlyDeleteCandidate; } });
Object.defineProperty(exports, "onCandidateDeleted", { enumerable: true, get: function () { return cascadeDeletion_1.onCandidateDeleted; } });
//# sourceMappingURL=index.js.map
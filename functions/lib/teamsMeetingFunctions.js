"use strict";
/**
 * Teams Meeting Functions for Copilot Integration
 *
 * Cloud Functions for creating Teams meetings and fetching Copilot AI summaries.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkMeetingStatus = exports.fetchMeetingInsights = exports.createTeamsMeeting = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const logger = __importStar(require("firebase-functions/logger"));
const params_1 = require("firebase-functions/params");
// Secrets (already defined in your project)
const msClientId = (0, params_1.defineSecret)('MS_CLIENT_ID');
const msClientSecret = (0, params_1.defineSecret)('MS_CLIENT_SECRET');
const msTenantId = (0, params_1.defineSecret)('MS_TENANT_ID');
const msOrganizerUserId = (0, params_1.defineSecret)('MS_ORGANIZER_USER_ID');
const db = (0, firestore_1.getFirestore)();
// ============================================================================
// Helper: Remove undefined values from object (Firestore doesn't accept undefined)
// ============================================================================
function removeUndefinedFields(obj) {
    const result = {};
    for (const key of Object.keys(obj)) {
        const value = obj[key];
        if (value !== undefined) {
            if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
                result[key] = removeUndefinedFields(value);
            }
            else {
                result[key] = value;
            }
        }
    }
    return result;
}
// ============================================================================
// Helper: Get Microsoft Graph Access Token
// ============================================================================
async function getMsGraphToken() {
    const tokenUrl = `https://login.microsoftonline.com/${msTenantId.value()}/oauth2/v2.0/token`;
    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: msClientId.value(),
            client_secret: msClientSecret.value(),
            scope: 'https://graph.microsoft.com/.default',
            grant_type: 'client_credentials',
        }),
    });
    if (!response.ok) {
        const error = await response.text();
        logger.error('Failed to get MS Graph token:', error);
        throw new https_1.HttpsError('internal', 'Failed to authenticate with Microsoft Graph');
    }
    const data = await response.json();
    return data.access_token;
}
exports.createTeamsMeeting = (0, https_1.onCall)({
    region: 'europe-west2',
    secrets: [msClientId, msClientSecret, msTenantId, msOrganizerUserId],
}, async (request) => {
    const { interviewId, subject, startDateTime, endDateTime } = request.data;
    if (!interviewId || !subject || !startDateTime || !endDateTime) {
        throw new https_1.HttpsError('invalid-argument', 'Missing required fields');
    }
    try {
        const token = await getMsGraphToken();
        const organizerUserId = msOrganizerUserId.value();
        // Create online meeting
        const meetingResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${organizerUserId}/onlineMeetings`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                subject,
                startDateTime,
                endDateTime,
                lobbyBypassSettings: {
                    scope: 'everyone',
                    isDialInBypassEnabled: true,
                },
            }),
        });
        if (!meetingResponse.ok) {
            const error = await meetingResponse.text();
            logger.error('Failed to create Teams meeting:', error);
            throw new https_1.HttpsError('internal', 'Failed to create Teams meeting');
        }
        const meeting = await meetingResponse.json();
        // Update interview document with meeting details
        await db.collection('interviews').doc(interviewId).update({
            onlineMeetingId: meeting.id,
            joinWebUrl: meeting.joinWebUrl,
            meetingSubject: subject,
            teamsUpdatedAt: firestore_1.Timestamp.now(),
        });
        logger.info(`Teams meeting created for interview ${interviewId}`);
        return {
            success: true,
            meetingId: meeting.id,
            joinWebUrl: meeting.joinWebUrl,
        };
    }
    catch (error) {
        logger.error('Error creating Teams meeting:', error);
        if (error instanceof https_1.HttpsError)
            throw error;
        throw new https_1.HttpsError('internal', error.message || 'Failed to create Teams meeting');
    }
});
exports.fetchMeetingInsights = (0, https_1.onCall)({
    region: 'europe-west2',
    secrets: [msClientId, msClientSecret, msTenantId, msOrganizerUserId],
}, async (request) => {
    const { interviewId, onlineMeetingId } = request.data;
    if (!interviewId || !onlineMeetingId) {
        throw new https_1.HttpsError('invalid-argument', 'Missing interviewId or onlineMeetingId');
    }
    try {
        const token = await getMsGraphToken();
        const organizerUserId = msOrganizerUserId.value();
        // Fetch AI insights from Copilot
        const insightsResponse = await fetch(`https://graph.microsoft.com/beta/copilot/users/${organizerUserId}/onlineMeetings/${onlineMeetingId}/aiInsights`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });
        if (!insightsResponse.ok) {
            const status = insightsResponse.status;
            if (status === 404) {
                return { success: false, error: 'Meeting insights not yet available. Try again after the meeting ends.' };
            }
            if (status === 403) {
                const errorBody = await insightsResponse.text();
                logger.error('Copilot 403 error details:', errorBody);
                return { success: false, error: `No Copilot summary available. Check Teams for a "Recap" on this meeting. (Details: ${errorBody.substring(0, 200)})` };
            }
            const error = await insightsResponse.text();
            logger.error('Failed to fetch meeting insights:', error);
            return { success: false, error: 'Failed to fetch meeting insights' };
        }
        const insightsData = await insightsResponse.json();
        // Parse the insights into a structured format
        const insights = {
            summary: '',
            keyPoints: [],
            actionItems: [],
            mentions: [],
            sentiment: null,
        };
        // Process AI notes
        if (insightsData.value && Array.isArray(insightsData.value)) {
            for (const note of insightsData.value) {
                if (note.contentType === 'meetingNotes' && note.content) {
                    insights.summary = note.content.substring(0, 2000); // Limit length
                }
                if (note.contentType === 'actionItems' && note.content) {
                    const items = note.content.split('\n').filter((s) => s.trim());
                    insights.actionItems = items.map((text) => ({ text }));
                }
            }
        }
        // If no structured data, try to get from notes array
        if (!insights.summary && insightsData.notes) {
            insights.summary = insightsData.notes
                .map((n) => n.text || n.content)
                .filter(Boolean)
                .join('\n\n')
                .substring(0, 2000);
        }
        // Update interview document with insights (remove undefined values for Firestore)
        const cleanInsights = removeUndefinedFields(insights);
        await db.collection('interviews').doc(interviewId).update({
            meetingInsights: cleanInsights,
            insightsFetchedAt: firestore_1.Timestamp.now(),
            transcriptStatus: 'processed',
        });
        logger.info(`Meeting insights fetched for interview ${interviewId}`);
        return { success: true, insights };
    }
    catch (error) {
        logger.error('Error fetching meeting insights:', error);
        if (error instanceof https_1.HttpsError)
            throw error;
        throw new https_1.HttpsError('internal', error.message || 'Failed to fetch meeting insights');
    }
});
exports.checkMeetingStatus = (0, https_1.onCall)({
    region: 'europe-west2',
    secrets: [msClientId, msClientSecret, msTenantId, msOrganizerUserId],
}, async (request) => {
    const { onlineMeetingId } = request.data;
    if (!onlineMeetingId) {
        throw new https_1.HttpsError('invalid-argument', 'Missing onlineMeetingId');
    }
    try {
        const token = await getMsGraphToken();
        const organizerUserId = msOrganizerUserId.value();
        // Check if transcript is available
        const transcriptResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${organizerUserId}/onlineMeetings/${onlineMeetingId}/transcripts`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });
        const transcriptAvailable = transcriptResponse.ok;
        let insightsAvailable = false;
        // Check if insights are available (only if transcript exists)
        if (transcriptAvailable) {
            const insightsResponse = await fetch(`https://graph.microsoft.com/beta/copilot/users/${organizerUserId}/onlineMeetings/${onlineMeetingId}/aiInsights`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });
            insightsAvailable = insightsResponse.ok;
        }
        return {
            transcriptAvailable,
            insightsAvailable,
        };
    }
    catch (error) {
        logger.error('Error checking meeting status:', error);
        return {
            transcriptAvailable: false,
            insightsAvailable: false,
            error: error.message,
        };
    }
});
//# sourceMappingURL=teamsMeetingFunctions.js.map
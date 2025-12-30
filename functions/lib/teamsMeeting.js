"use strict";
/**
 * Microsoft Teams Meeting Integration
 * Creates Teams meetings via Microsoft Graph API
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.msOrganizerUserId = exports.msTenantId = exports.msClientSecret = exports.msClientId = void 0;
exports.createTeamsMeeting = createTeamsMeeting;
exports.getTeamsMeetingICSContent = getTeamsMeetingICSContent;
const params_1 = require("firebase-functions/params");
// Define secrets for Microsoft Graph API
exports.msClientId = (0, params_1.defineSecret)('MS_CLIENT_ID');
exports.msClientSecret = (0, params_1.defineSecret)('MS_CLIENT_SECRET');
exports.msTenantId = (0, params_1.defineSecret)('MS_TENANT_ID');
exports.msOrganizerUserId = (0, params_1.defineSecret)('MS_ORGANIZER_USER_ID');
// ============================================================================
// AUTHENTICATION
// ============================================================================
/**
 * Get OAuth2 access token from Microsoft Identity Platform
 * Uses client credentials flow for application-level access
 */
async function getAccessToken(clientId, clientSecret, tenantId) {
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
    });
    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
    });
    if (!response.ok) {
        const errorText = await response.text();
        console.error('Token request failed:', errorText);
        throw new Error(`Failed to get access token: ${response.status}`);
    }
    const data = await response.json();
    return data.access_token;
}
// ============================================================================
// TEAMS MEETING CREATION
// ============================================================================
/**
 * Create a Microsoft Teams online meeting
 *
 * @param subject - Meeting subject/title
 * @param startDateTime - Meeting start time (ISO 8601)
 * @param endDateTime - Meeting end time (ISO 8601)
 * @param candidateName - Name of the candidate (for meeting description)
 * @param jobTitle - Optional job title
 * @param branchName - Optional branch/location name
 * @returns TeamsMeetingResult with join URL and meeting details
 */
async function createTeamsMeeting(subject, startDateTime, endDateTime, candidateName, jobTitle, branchName) {
    try {
        // Get secrets
        const clientId = exports.msClientId.value();
        const clientSecret = exports.msClientSecret.value();
        const tenantId = exports.msTenantId.value();
        const organizerUserId = exports.msOrganizerUserId.value();
        // Validate secrets are configured
        if (!clientId || !clientSecret || !tenantId || !organizerUserId) {
            console.error('Microsoft Graph API secrets not configured');
            return {
                success: false,
                error: 'Teams integration not configured. Please set up Microsoft Graph API credentials.',
            };
        }
        // Get access token
        console.log('Obtaining Microsoft Graph access token...');
        const accessToken = await getAccessToken(clientId, clientSecret, tenantId);
        // Prepare meeting request body
        const meetingBody = {
            subject,
            startDateTime: startDateTime.toISOString(),
            endDateTime: endDateTime.toISOString(),
            lobbyBypassSettings: {
                scope: 'everyone', // Allow external guests to bypass lobby
                isDialInBypassEnabled: true,
            },
            participants: {
                organizer: {
                    identity: {
                        user: {
                            id: organizerUserId,
                        },
                    },
                },
            },
            isEntryExitAnnounced: false,
            allowedPresenters: 'organizer',
        };
        // Create meeting via Graph API
        // Using /users/{userId}/onlineMeetings endpoint for application permissions
        const graphUrl = `https://graph.microsoft.com/v1.0/users/${organizerUserId}/onlineMeetings`;
        console.log(`Creating Teams meeting for: ${candidateName}`);
        const response = await fetch(graphUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(meetingBody),
        });
        if (!response.ok) {
            const errorData = await response.text();
            console.error('Graph API error:', errorData);
            return {
                success: false,
                error: `Failed to create Teams meeting: ${response.status}`,
            };
        }
        const meeting = await response.json();
        console.log(`Teams meeting created successfully: ${meeting.id}`);
        console.log(`Join URL: ${meeting.joinWebUrl}`);
        // Also create a calendar event for the organizer
        await createCalendarEvent(accessToken, organizerUserId, subject, startDateTime, endDateTime, meeting.joinWebUrl, candidateName, jobTitle, branchName);
        return {
            success: true,
            joinUrl: meeting.joinWebUrl,
            meetingId: meeting.id,
            webLink: meeting.joinUrl,
        };
    }
    catch (error) {
        console.error('Error creating Teams meeting:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error creating Teams meeting',
        };
    }
}
// ============================================================================
// CALENDAR EVENT CREATION
// ============================================================================
/**
 * Create a calendar event in the organizer's Outlook calendar
 * This ensures the meeting shows up in the recruiter's calendar
 */
async function createCalendarEvent(accessToken, userId, subject, startDateTime, endDateTime, teamsJoinUrl, candidateName, jobTitle, branchName) {
    try {
        const graphUrl = `https://graph.microsoft.com/v1.0/users/${userId}/events`;
        const eventBody = {
            subject,
            body: {
                contentType: 'HTML',
                content: `
          <p><strong>Interview with ${candidateName}</strong></p>
          ${jobTitle ? `<p>Position: ${jobTitle}</p>` : ''}
          ${branchName ? `<p>Location/Branch: ${branchName}</p>` : ''}
          <br/>
          <p><a href="${teamsJoinUrl}">Join Microsoft Teams Meeting</a></p>
          <br/>
          <p style="color: #666; font-size: 12px;">This meeting was automatically created by the Allied Recruitment Portal.</p>
        `,
            },
            start: {
                dateTime: startDateTime.toISOString().replace('Z', ''),
                timeZone: 'Europe/London',
            },
            end: {
                dateTime: endDateTime.toISOString().replace('Z', ''),
                timeZone: 'Europe/London',
            },
            location: {
                displayName: 'Microsoft Teams Meeting',
            },
            isOnlineMeeting: true,
            onlineMeetingProvider: 'teamsForBusiness',
            onlineMeeting: {
                joinUrl: teamsJoinUrl,
            },
            reminderMinutesBeforeStart: 15,
            isReminderOn: true,
            categories: ['Interview', 'Recruitment'],
        };
        const response = await fetch(graphUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(eventBody),
        });
        if (!response.ok) {
            const errorData = await response.text();
            console.error('Failed to create calendar event:', errorData);
            // Don't throw - meeting was created, calendar event is secondary
        }
        else {
            console.log('Calendar event created successfully');
        }
    }
    catch (error) {
        console.error('Error creating calendar event:', error);
        // Don't throw - meeting was created, calendar event is secondary
    }
}
// ============================================================================
// HELPER: GENERATE TEAMS MEETING LINK FOR ICS
// ============================================================================
/**
 * Generate ICS-compatible Teams meeting description
 * Includes the join URL formatted for calendar applications
 */
function getTeamsMeetingICSContent(teamsJoinUrl, candidateName, jobTitle) {
    return [
        `Interview with ${candidateName}`,
        jobTitle ? `Position: ${jobTitle}` : '',
        '',
        'Join Microsoft Teams Meeting:',
        teamsJoinUrl,
        '',
        '---',
        'This meeting was automatically scheduled via Allied Recruitment Portal.',
    ].filter(line => line !== undefined).join('\\n');
}
//# sourceMappingURL=teamsMeeting.js.map
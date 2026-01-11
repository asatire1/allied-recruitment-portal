"use strict";
/**
 * Microsoft Teams Meeting Integration
 * Creates Teams meetings via Microsoft Graph API
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.msOrganizerUserId = exports.msTenantId = exports.msClientSecret = exports.msClientId = void 0;
exports.getAccessToken = getAccessToken;
exports.createTeamsMeeting = createTeamsMeeting;
exports.sendConfirmationEmail = sendConfirmationEmail;
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
/**
 * Send confirmation email to candidate via Microsoft Graph API
 * Uses the recruitment@alliedpharmacies.com mailbox
 */
async function sendConfirmationEmail(candidateEmail, candidateName, scheduledDate, type, teamsJoinUrl, jobTitle, branchName, confirmationCode, duration) {
    try {
        // Get secrets
        const clientId = exports.msClientId.value();
        const clientSecret = exports.msClientSecret.value();
        const tenantId = exports.msTenantId.value();
        const organizerUserId = exports.msOrganizerUserId.value();
        if (!clientId || !clientSecret || !tenantId || !organizerUserId) {
            console.error('Microsoft Graph API secrets not configured for email');
            return { success: false, error: 'Email integration not configured' };
        }
        // Get access token
        const accessToken = await getAccessToken(clientId, clientSecret, tenantId);
        // Format date and time for display
        const dateOptions = {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        };
        const timeOptions = {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        };
        const formattedDate = scheduledDate.toLocaleDateString('en-GB', dateOptions);
        const formattedTime = scheduledDate.toLocaleTimeString('en-GB', timeOptions);
        // Calculate end time
        const durationMinutes = duration || (type === 'trial' ? 240 : 30);
        const endTime = new Date(scheduledDate.getTime() + durationMinutes * 60000);
        const formattedEndTime = endTime.toLocaleTimeString('en-GB', timeOptions);
        // Build email subject
        const subject = type === 'interview'
            ? `Interview Confirmation - Allied Pharmacies${jobTitle ? ` (${jobTitle})` : ''}`
            : `Trial Shift Confirmation - Allied Pharmacies${branchName ? ` at ${branchName}` : ''}`;
        // Build email body
        const emailBody = type === 'interview'
            ? buildInterviewEmailBody(candidateName, formattedDate, formattedTime, formattedEndTime, teamsJoinUrl, jobTitle, confirmationCode)
            : buildTrialEmailBody(candidateName, formattedDate, formattedTime, formattedEndTime, branchName, jobTitle, confirmationCode);
        // Send email via Graph API
        const graphUrl = `https://graph.microsoft.com/v1.0/users/${organizerUserId}/sendMail`;
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
                            address: candidateEmail,
                            name: candidateName
                        }
                    }
                ],
                importance: 'normal'
            },
            saveToSentItems: true
        };
        console.log(`Sending confirmation email to: ${candidateEmail}`);
        const response = await fetch(graphUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(emailRequest),
        });
        if (!response.ok) {
            const errorData = await response.text();
            console.error('Failed to send email:', errorData);
            return { success: false, error: `Failed to send email: ${response.status}` };
        }
        console.log(`Confirmation email sent successfully to ${candidateEmail}`);
        return { success: true };
    }
    catch (error) {
        console.error('Error sending confirmation email:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error sending email'
        };
    }
}
/**
 * Build HTML email body for interview confirmation
 */
function buildInterviewEmailBody(candidateName, date, startTime, endTime, teamsJoinUrl, jobTitle, confirmationCode) {
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #003366; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { background-color: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
    .details-box { background-color: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .detail-row { display: flex; padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { font-weight: bold; width: 140px; color: #666; }
    .detail-value { flex: 1; }
    .teams-button { display: inline-block; background-color: #6264A7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; margin: 15px 0; }
    .teams-button:hover { background-color: #4B4D8C; }
    .confirmation-code { background-color: #e8f5e9; border: 1px solid #4caf50; padding: 10px 15px; border-radius: 4px; font-family: monospace; font-size: 16px; display: inline-block; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    .important { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📅 Interview Confirmed</h1>
    </div>
    <div class="content">
      <p>Dear ${candidateName},</p>
      
      <p>Thank you for booking your interview with <strong>Allied Pharmacies</strong>. We're looking forward to speaking with you!</p>
      
      <div class="details-box">
        <div class="detail-row">
          <span class="detail-label">📅 Date:</span>
          <span class="detail-value">${date}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">🕐 Time:</span>
          <span class="detail-value">${startTime} - ${endTime}</span>
        </div>
        ${jobTitle ? `
        <div class="detail-row">
          <span class="detail-label">💼 Position:</span>
          <span class="detail-value">${jobTitle}</span>
        </div>
        ` : ''}
        <div class="detail-row">
          <span class="detail-label">📍 Location:</span>
          <span class="detail-value">Microsoft Teams (Online)</span>
        </div>
        ${confirmationCode ? `
        <div class="detail-row">
          <span class="detail-label">🎫 Reference:</span>
          <span class="detail-value"><span class="confirmation-code">${confirmationCode}</span></span>
        </div>
        ` : ''}
      </div>
      
      ${teamsJoinUrl ? `
      <div style="text-align: center;">
        <p><strong>Join your interview using the button below:</strong></p>
        <a href="${teamsJoinUrl}" class="teams-button">🎥 Join Teams Meeting</a>
        <p style="font-size: 12px; color: #666;">Or copy this link: <a href="${teamsJoinUrl}">${teamsJoinUrl}</a></p>
      </div>
      ` : ''}
      
      <div class="important">
        <strong>📋 Before your interview:</strong>
        <ul style="margin: 10px 0;">
          <li>Test your camera and microphone</li>
          <li>Find a quiet location with good lighting</li>
          <li>Have your CV ready to reference</li>
          <li>Prepare questions about the role</li>
        </ul>
      </div>
      
      <p>If you need to reschedule or cancel, please contact us as soon as possible.</p>
      
      <p>Best regards,<br/><strong>Allied Pharmacies Recruitment Team</strong></p>
    </div>
    <div class="footer">
      <p>Allied Pharmacies | recruitment@alliedpharmacies.com</p>
      <p style="font-size: 10px;">This is an automated message. Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>
  `;
}
/**
 * Build HTML email body for trial shift confirmation
 */
function buildTrialEmailBody(candidateName, date, startTime, endTime, branchName, jobTitle, confirmationCode) {
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #2e7d32; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { background-color: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
    .details-box { background-color: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .detail-row { display: flex; padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { font-weight: bold; width: 140px; color: #666; }
    .detail-value { flex: 1; }
    .confirmation-code { background-color: #e8f5e9; border: 1px solid #4caf50; padding: 10px 15px; border-radius: 4px; font-family: monospace; font-size: 16px; display: inline-block; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    .important { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 15px 0; }
    .checklist { background-color: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏥 Trial Shift Confirmed</h1>
    </div>
    <div class="content">
      <p>Dear ${candidateName},</p>
      
      <p>Great news! Your trial shift with <strong>Allied Pharmacies</strong> has been confirmed. We're excited to have you join us!</p>
      
      <div class="details-box">
        <div class="detail-row">
          <span class="detail-label">📅 Date:</span>
          <span class="detail-value">${date}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">🕐 Time:</span>
          <span class="detail-value">${startTime} - ${endTime}</span>
        </div>
        ${jobTitle ? `
        <div class="detail-row">
          <span class="detail-label">💼 Position:</span>
          <span class="detail-value">${jobTitle}</span>
        </div>
        ` : ''}
        ${branchName ? `
        <div class="detail-row">
          <span class="detail-label">📍 Location:</span>
          <span class="detail-value">${branchName}</span>
        </div>
        ` : ''}
        ${confirmationCode ? `
        <div class="detail-row">
          <span class="detail-label">🎫 Reference:</span>
          <span class="detail-value"><span class="confirmation-code">${confirmationCode}</span></span>
        </div>
        ` : ''}
      </div>
      
      <div class="checklist">
        <strong>📋 What to bring:</strong>
        <ul style="margin: 10px 0;">
          <li>Photo ID (passport or driving licence)</li>
          <li>GPhC registration card (if applicable)</li>
          <li>Right to work documents</li>
          <li>Comfortable, smart clothing</li>
        </ul>
      </div>
      
      <div class="important">
        <strong>⚠️ Important:</strong>
        <ul style="margin: 10px 0;">
          <li>Please arrive 10 minutes before your start time</li>
          <li>Ask for the Pharmacy Manager on arrival</li>
          <li>If you're running late, please call the branch directly</li>
        </ul>
      </div>
      
      <p>If you need to reschedule or cancel, please contact us as soon as possible.</p>
      
      <p>Best of luck with your trial!</p>
      
      <p>Best regards,<br/><strong>Allied Pharmacies Recruitment Team</strong></p>
    </div>
    <div class="footer">
      <p>Allied Pharmacies | recruitment@alliedpharmacies.com</p>
      <p style="font-size: 10px;">This is an automated message. Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>
  `;
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
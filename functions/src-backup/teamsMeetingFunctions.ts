/**
 * Teams Meeting Functions for Copilot Integration
 * 
 * Cloud Functions for creating Teams meetings and fetching Copilot AI summaries.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import * as logger from 'firebase-functions/logger'
import { defineSecret } from 'firebase-functions/params'

// Secrets (already defined in your project)
const msClientId = defineSecret('MS_CLIENT_ID')
const msClientSecret = defineSecret('MS_CLIENT_SECRET')
const msTenantId = defineSecret('MS_TENANT_ID')
const msOrganizerUserId = defineSecret('MS_ORGANIZER_USER_ID')

const db = getFirestore()

// ============================================================================
// Helper: Get Microsoft Graph Access Token
// ============================================================================

async function getMsGraphToken(): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${msTenantId.value()}/oauth2/v2.0/token`
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: msClientId.value(),
      client_secret: msClientSecret.value(),
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    logger.error('Failed to get MS Graph token:', error)
    throw new HttpsError('internal', 'Failed to authenticate with Microsoft Graph')
  }

  const data = await response.json()
  return data.access_token
}

// ============================================================================
// Create Teams Meeting
// ============================================================================

interface CreateTeamsMeetingRequest {
  interviewId: string
  subject: string
  startDateTime: string
  endDateTime: string
}

export const createTeamsMeeting = onCall<CreateTeamsMeetingRequest>(
  {
    region: 'europe-west2',
    secrets: [msClientId, msClientSecret, msTenantId, msOrganizerUserId],
  },
  async (request) => {
    const { interviewId, subject, startDateTime, endDateTime } = request.data

    if (!interviewId || !subject || !startDateTime || !endDateTime) {
      throw new HttpsError('invalid-argument', 'Missing required fields')
    }

    try {
      const token = await getMsGraphToken()
      const organizerUserId = msOrganizerUserId.value()

      // Create online meeting
      const meetingResponse = await fetch(
        `https://graph.microsoft.com/v1.0/users/${organizerUserId}/onlineMeetings`,
        {
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
        }
      )

      if (!meetingResponse.ok) {
        const error = await meetingResponse.text()
        logger.error('Failed to create Teams meeting:', error)
        throw new HttpsError('internal', 'Failed to create Teams meeting')
      }

      const meeting = await meetingResponse.json()

      // Update interview document with meeting details
      await db.collection('interviews').doc(interviewId).update({
        onlineMeetingId: meeting.id,
        joinWebUrl: meeting.joinWebUrl,
        meetingSubject: subject,
        teamsUpdatedAt: Timestamp.now(),
      })

      logger.info(`Teams meeting created for interview ${interviewId}`)

      return {
        success: true,
        meetingId: meeting.id,
        joinWebUrl: meeting.joinWebUrl,
      }
    } catch (error: any) {
      logger.error('Error creating Teams meeting:', error)
      if (error instanceof HttpsError) throw error
      throw new HttpsError('internal', error.message || 'Failed to create Teams meeting')
    }
  }
)

// ============================================================================
// Fetch Meeting Insights (Copilot AI Summary)
// ============================================================================

interface FetchMeetingInsightsRequest {
  interviewId: string
  onlineMeetingId: string
}

export const fetchMeetingInsights = onCall<FetchMeetingInsightsRequest>(
  {
    region: 'europe-west2',
    secrets: [msClientId, msClientSecret, msTenantId, msOrganizerUserId],
  },
  async (request) => {
    const { interviewId, onlineMeetingId } = request.data

    if (!interviewId || !onlineMeetingId) {
      throw new HttpsError('invalid-argument', 'Missing interviewId or onlineMeetingId')
    }

    try {
      const token = await getMsGraphToken()
      const organizerUserId = msOrganizerUserId.value()

      // Fetch AI insights from Copilot
      const insightsResponse = await fetch(
        `https://graph.microsoft.com/beta/copilot/users/${organizerUserId}/onlineMeetings/${onlineMeetingId}/aiInsights`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      )

      if (!insightsResponse.ok) {
        const status = insightsResponse.status
        if (status === 404) {
          return { success: false, error: 'Meeting insights not yet available. Try again after the meeting ends.' }
        }
        if (status === 403) {
          return { success: false, error: 'Access denied. Ensure Copilot license is active and permissions are granted.' }
        }
        const error = await insightsResponse.text()
        logger.error('Failed to fetch meeting insights:', error)
        return { success: false, error: 'Failed to fetch meeting insights' }
      }

      const insightsData = await insightsResponse.json()

      // Parse the insights into a structured format
      const insights = {
        summary: '',
        keyPoints: [] as string[],
        actionItems: [] as { text: string; owner?: string }[],
        mentions: [] as string[],
        sentiment: undefined as 'positive' | 'neutral' | 'negative' | undefined,
      }

      // Process AI notes
      if (insightsData.value && Array.isArray(insightsData.value)) {
        for (const note of insightsData.value) {
          if (note.contentType === 'meetingNotes' && note.content) {
            insights.summary = note.content.substring(0, 2000) // Limit length
          }
          if (note.contentType === 'actionItems' && note.content) {
            const items = note.content.split('\n').filter((s: string) => s.trim())
            insights.actionItems = items.map((text: string) => ({ text }))
          }
        }
      }

      // If no structured data, try to get from notes array
      if (!insights.summary && insightsData.notes) {
        insights.summary = insightsData.notes
          .map((n: any) => n.text || n.content)
          .filter(Boolean)
          .join('\n\n')
          .substring(0, 2000)
      }

      // Update interview document with insights
      await db.collection('interviews').doc(interviewId).update({
        meetingInsights: insights,
        insightsFetchedAt: Timestamp.now(),
        transcriptStatus: 'processed',
      })

      logger.info(`Meeting insights fetched for interview ${interviewId}`)

      return { success: true, insights }
    } catch (error: any) {
      logger.error('Error fetching meeting insights:', error)
      if (error instanceof HttpsError) throw error
      throw new HttpsError('internal', error.message || 'Failed to fetch meeting insights')
    }
  }
)

// ============================================================================
// Check Meeting Status
// ============================================================================

interface CheckMeetingStatusRequest {
  onlineMeetingId: string
}

export const checkMeetingStatus = onCall<CheckMeetingStatusRequest>(
  {
    region: 'europe-west2',
    secrets: [msClientId, msClientSecret, msTenantId, msOrganizerUserId],
  },
  async (request) => {
    const { onlineMeetingId } = request.data

    if (!onlineMeetingId) {
      throw new HttpsError('invalid-argument', 'Missing onlineMeetingId')
    }

    try {
      const token = await getMsGraphToken()
      const organizerUserId = msOrganizerUserId.value()

      // Check if transcript is available
      const transcriptResponse = await fetch(
        `https://graph.microsoft.com/v1.0/users/${organizerUserId}/onlineMeetings/${onlineMeetingId}/transcripts`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      )

      const transcriptAvailable = transcriptResponse.ok
      let insightsAvailable = false

      // Check if insights are available (only if transcript exists)
      if (transcriptAvailable) {
        const insightsResponse = await fetch(
          `https://graph.microsoft.com/beta/copilot/users/${organizerUserId}/onlineMeetings/${onlineMeetingId}/aiInsights`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          }
        )
        insightsAvailable = insightsResponse.ok
      }

      return {
        transcriptAvailable,
        insightsAvailable,
      }
    } catch (error: any) {
      logger.error('Error checking meeting status:', error)
      return {
        transcriptAvailable: false,
        insightsAvailable: false,
        error: error.message,
      }
    }
  }
)

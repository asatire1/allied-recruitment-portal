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
// Helper: Remove undefined values from object (Firestore doesn't accept undefined)
// ============================================================================

function removeUndefinedFields<T extends Record<string, any>>(obj: T): Partial<T> {
  const result: Partial<T> = {}
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    if (value !== undefined) {
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        result[key as keyof T] = removeUndefinedFields(value) as any
      } else {
        result[key as keyof T] = value
      }
    }
  }
  return result
}

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

      // Step 1: Get list of AI insight IDs for this meeting
      const insightsListResponse = await fetch(
        `https://graph.microsoft.com/v1.0/copilot/users/${organizerUserId}/onlineMeetings/${onlineMeetingId}/aiInsights`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      )

      if (!insightsListResponse.ok) {
        const status = insightsListResponse.status
        if (status === 404) {
          return { success: false, error: 'Meeting insights not yet available. Try again after the meeting ends.' }
        }
        if (status === 403) {
          const errorBody = await insightsListResponse.text()
          logger.error('Copilot 403 error details:', errorBody)
          return { success: false, error: `No Copilot summary available. Check Teams for a "Recap" on this meeting. (Details: ${errorBody.substring(0, 200)})` }
        }
        const error = await insightsListResponse.text()
        logger.error('Failed to fetch meeting insights list:', error)
        return { success: false, error: 'Failed to fetch meeting insights' }
      }

      const insightsList = await insightsListResponse.json()
      logger.info('Copilot insights list:', JSON.stringify(insightsList, null, 2).substring(0, 2000))

      // Check if there are any insight objects
      if (!insightsList.value || insightsList.value.length === 0) {
        return { success: false, error: 'No AI insights available for this meeting yet. The meeting may need transcription enabled, or insights may still be processing (can take up to 4 hours).' }
      }

      // Step 2: Get the most recent insight's full details (use the first/latest one)
      const latestInsight = insightsList.value[0]
      const aiInsightId = latestInsight.id
      
      logger.info(`Fetching full insight details for ID: ${aiInsightId}`)

      const insightDetailResponse = await fetch(
        `https://graph.microsoft.com/v1.0/copilot/users/${organizerUserId}/onlineMeetings/${onlineMeetingId}/aiInsights/${aiInsightId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      )

      if (!insightDetailResponse.ok) {
        const error = await insightDetailResponse.text()
        logger.error('Failed to fetch insight details:', error)
        return { success: false, error: 'Failed to fetch meeting insight details' }
      }

      const insightsData = await insightDetailResponse.json()
      
      // Log the full response structure for debugging
      logger.info('Copilot insight detail response:', JSON.stringify(insightsData, null, 2).substring(0, 5000))

      // Parse the insights into a structured format
      const insights = {
        summary: '',
        keyPoints: [] as string[],
        actionItems: [] as { text: string; owner?: string }[],
        mentions: [] as string[],
        sentiment: null as 'positive' | 'neutral' | 'negative' | null,
      }

      // Process meetingNotes array (Microsoft's actual format)
      if (insightsData.meetingNotes && Array.isArray(insightsData.meetingNotes)) {
        logger.info(`Processing ${insightsData.meetingNotes.length} meeting notes`)
        
        const summaryParts: string[] = []
        for (const note of insightsData.meetingNotes) {
          // Add main note
          if (note.title) {
            summaryParts.push(`**${note.title}**`)
          }
          if (note.text) {
            summaryParts.push(note.text)
          }
          
          // Add subpoints
          if (note.subpoints && Array.isArray(note.subpoints)) {
            for (const subpoint of note.subpoints) {
              if (subpoint.title) {
                summaryParts.push(`• ${subpoint.title}`)
              }
              if (subpoint.text) {
                summaryParts.push(`  ${subpoint.text}`)
              }
            }
          }
          summaryParts.push('') // Add spacing between notes
        }
        
        insights.summary = summaryParts.join('\n').substring(0, 4000)
        logger.info('Built summary from meetingNotes, length:', insights.summary.length)
      }

      // Process actionItems array
      if (insightsData.actionItems && Array.isArray(insightsData.actionItems)) {
        logger.info(`Processing ${insightsData.actionItems.length} action items`)
        insights.actionItems = insightsData.actionItems.map((item: any) => ({
          text: item.text || item.title || '',
          owner: item.ownerDisplayName || item.owner || undefined
        })).filter((item: any) => item.text)
      }

      // Process mentions/viewpoint if present
      if (insightsData.viewpoint?.mentionEvents && Array.isArray(insightsData.viewpoint.mentionEvents)) {
        insights.mentions = insightsData.viewpoint.mentionEvents.map((m: any) => m.utterance || m.text).filter(Boolean)
      }

      // Fallback: Try old parsing methods if meetingNotes didn't work
      if (!insights.summary) {
        // Try value array format
        if (insightsData.value && Array.isArray(insightsData.value)) {
          logger.info(`Fallback: Processing ${insightsData.value.length} items from value array`)
          for (const note of insightsData.value) {
            const content = note.content || note.text || note.body?.content || note.summary || ''
            if (content && !insights.summary) {
              insights.summary = content.substring(0, 4000)
            }
          }
        }
        
        // Try direct string properties
        if (!insights.summary) {
          const possibleFields = [insightsData.summary, insightsData.recap, insightsData.content, insightsData.text]
          for (const field of possibleFields) {
            if (field && typeof field === 'string') {
              insights.summary = field.substring(0, 4000)
              break
            }
          }
        }
      }
      
      // Log final parsed result
      logger.info('Parsed insights summary length:', insights.summary.length)
      logger.info('Parsed insights summary preview:', insights.summary.substring(0, 200))
      logger.info('Parsed action items count:', insights.actionItems.length)
      
      // If still no summary, return with debug info
      if (!insights.summary) {
        logger.warn('No summary content found in Copilot response')
        return { 
          success: false, 
          error: 'Copilot returned no summary content. The meeting may not have a Recap available yet.',
          debugKeys: Object.keys(insightsData),
          debugValueCount: insightsData.value?.length || 0
        }
      }

      // Update interview document with insights (remove undefined values for Firestore)
      const cleanInsights = removeUndefinedFields(insights)
      
      await db.collection('interviews').doc(interviewId).update({
        meetingInsights: cleanInsights,
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

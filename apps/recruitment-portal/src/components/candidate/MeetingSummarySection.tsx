// ============================================================================
// Meeting Summary Section Component (Copilot Integration)
// Extracted from CandidateDetail.tsx for better maintainability
// Location: apps/recruitment-portal/src/components/candidate/MeetingSummarySection.tsx
// ============================================================================

import { useState, useEffect } from 'react'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getFirebaseDb, getFirebaseFunctions, COLLECTIONS } from '@allied/shared-lib'
import type { Candidate, ActivityAction } from '@allied/shared-lib'
import { Button, Textarea, Spinner } from '@allied/shared-ui'

// ============================================================================
// HELPERS
// ============================================================================

const formatDate = (timestamp: any): string => {
  if (!timestamp) return '-'
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// ============================================================================
// TYPES
// ============================================================================

interface Interview {
  id: string
  teamsMeetingId?: string
  [key: string]: any
}

interface MeetingSummarySectionProps {
  candidate: Candidate
  expanded: boolean
  onToggleExpand: () => void
  latestInterview: Interview | null
  onLogActivity: (
    entityId: string,
    action: ActivityAction,
    description: string
  ) => Promise<void>
  onCandidateUpdated: (updates: Partial<Candidate>) => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export function MeetingSummarySection({ 
  candidate, 
  expanded,
  onToggleExpand,
  latestInterview,
  onLogActivity,
  onCandidateUpdated
}: MeetingSummarySectionProps) {
  const db = getFirebaseDb()
  
  // State
  const [meetingSummary, setMeetingSummary] = useState('')
  const [savingMeetingSummary, setSavingMeetingSummary] = useState(false)
  const [meetingSummarySaved, setMeetingSummarySaved] = useState(false)
  const [fetchingCopilotSummary, setFetchingCopilotSummary] = useState(false)

  // Initialize meeting summary from candidate data
  useEffect(() => {
    if (candidate.meetingSummary?.content) {
      setMeetingSummary(candidate.meetingSummary.content)
    }
  }, [candidate.meetingSummary?.content])

  // Fetch Copilot meeting summary from Microsoft Graph
  const handleFetchCopilotSummary = async () => {
    if (!latestInterview?.teamsMeetingId) {
      alert('No Teams meeting found for this candidate. The interview must have a Teams meeting link to fetch Copilot insights.')
      return
    }

    setFetchingCopilotSummary(true)
    try {
      const functions = getFirebaseFunctions()
      const fetchInsightsFn = httpsCallable<{
        interviewId: string
        onlineMeetingId: string
      }, {
        success: boolean
        insights?: {
          summary: string
          keyPoints: string[]
          actionItems: { text: string; owner?: string }[]
        }
        error?: string
      }>(functions, 'fetchMeetingInsights')

      const result = await fetchInsightsFn({
        interviewId: latestInterview.id,
        onlineMeetingId: latestInterview.teamsMeetingId,
      })

      if (result.data.success && result.data.insights) {
        // Format the insights into a readable summary
        let formattedSummary = ''
        
        if (result.data.insights.summary) {
          formattedSummary += result.data.insights.summary + '\n\n'
        }
        
        if (result.data.insights.keyPoints?.length > 0) {
          formattedSummary += '📌 Key Points:\n'
          result.data.insights.keyPoints.forEach(point => {
            formattedSummary += `• ${point}\n`
          })
          formattedSummary += '\n'
        }
        
        if (result.data.insights.actionItems?.length > 0) {
          formattedSummary += '✅ Action Items:\n'
          result.data.insights.actionItems.forEach(item => {
            formattedSummary += `• ${item.text}${item.owner ? ` (${item.owner})` : ''}\n`
          })
        }

        setMeetingSummary(formattedSummary.trim())
        
        // Auto-save after fetching
        await updateDoc(doc(db, COLLECTIONS.CANDIDATES, candidate.id), {
          meetingSummary: {
            content: formattedSummary.trim(),
            updatedAt: serverTimestamp(),
            updatedBy: 'Copilot',
            updatedByName: 'Microsoft Copilot',
            source: 'copilot_auto',
          },
        })
        
        onCandidateUpdated({
          meetingSummary: {
            content: formattedSummary.trim(),
            updatedAt: new Date(),
            updatedBy: 'Copilot',
            updatedByName: 'Microsoft Copilot',
            source: 'copilot_auto',
          },
        })

        await onLogActivity(
          candidate.id,
          'updated',
          'Meeting summary imported from Microsoft Copilot'
        )
        
        alert('✓ Copilot meeting summary imported successfully!')
      } else {
        alert(result.data.error || 'Could not fetch meeting insights. The meeting may not have ended yet or transcription may not be enabled.')
      }
    } catch (error: any) {
      console.error('Error fetching Copilot summary:', error)
      alert(`Failed to fetch Copilot summary: ${error.message || 'Unknown error'}`)
    } finally {
      setFetchingCopilotSummary(false)
    }
  }

  // Save meeting summary manually
  const handleSaveMeetingSummary = async () => {
    if (!meetingSummary.trim()) return

    setSavingMeetingSummary(true)
    try {
      await updateDoc(doc(db, COLLECTIONS.CANDIDATES, candidate.id), {
        meetingSummary: {
          content: meetingSummary.trim(),
          updatedAt: serverTimestamp(),
          updatedBy: candidate.id, // Will be replaced with actual user ID in parent
          updatedByName: 'Manual Entry',
          source: 'manual',
        },
        updatedAt: serverTimestamp(),
      })

      await onLogActivity(
        candidate.id,
        'updated',
        'Meeting summary updated manually'
      )

      setMeetingSummarySaved(true)
      setTimeout(() => setMeetingSummarySaved(false), 2000)
    } catch (err) {
      console.error('Error saving meeting summary:', err)
      alert('Failed to save meeting summary. Please try again.')
    } finally {
      setSavingMeetingSummary(false)
    }
  }

  return (
    <div className="meeting-summary-section">
      <button 
        className={`meeting-summary-toggle ${expanded ? 'expanded' : ''}`}
        onClick={onToggleExpand}
      >
        <div className="toggle-left">
          <span className="toggle-icon">🤖</span>
          <span className="toggle-title">Meeting Summary (Copilot)</span>
          {fetchingCopilotSummary && (
            <span className="fetching-badge">
              <Spinner size="sm" /> Fetching...
            </span>
          )}
          {!fetchingCopilotSummary && candidate.meetingSummary?.content && (
            <span className="has-content-badge">
              {candidate.meetingSummary?.source === 'copilot_auto' ? '✓ Auto-imported' : 'Has content'}
            </span>
          )}
        </div>
        <span className={`toggle-arrow ${expanded ? 'expanded' : ''}`}>
          ▼
        </span>
      </button>

      {expanded && (
        <div className="meeting-summary-content">
          {/* Fetch from Copilot Button */}
          <div className="copilot-fetch-section">
            <Button
              variant="outline"
              onClick={handleFetchCopilotSummary}
              disabled={fetchingCopilotSummary || !latestInterview?.teamsMeetingId}
              className="fetch-copilot-btn"
            >
              {fetchingCopilotSummary ? (
                <>
                  <Spinner size="sm" /> Fetching from Copilot...
                </>
              ) : candidate.meetingSummary?.source === 'copilot_auto' ? (
                <>
                  🔄 Refresh from Copilot
                </>
              ) : (
                <>
                  🤖 Fetch from Microsoft Copilot
                </>
              )}
            </Button>
            {!latestInterview?.teamsMeetingId && (
              <span className="copilot-hint">No Teams meeting found for this candidate</span>
            )}
            {latestInterview?.teamsMeetingId && !candidate.meetingSummary?.source && (
              <span className="copilot-hint">✓ Teams meeting available - will auto-fetch after meeting ends</span>
            )}
            {candidate.meetingSummary?.source === 'copilot_auto' && (
              <span className="copilot-hint copilot-success">✓ Auto-imported from Microsoft Copilot</span>
            )}
          </div>

          <div className="copilot-divider">
            <span>or paste manually</span>
          </div>

          <Textarea
            value={meetingSummary}
            onChange={(e) => setMeetingSummary(e.target.value)}
            placeholder={`Paste meeting summary from Copilot here...

Example:
- Key discussion points
- Candidate's responses
- Action items
- Overall assessment from the meeting`}
            rows={8}
            className="meeting-summary-input"
          />
          
          <div className="meeting-summary-actions">
            <Button
              variant="primary"
              onClick={handleSaveMeetingSummary}
              disabled={savingMeetingSummary || !meetingSummary.trim()}
            >
              {savingMeetingSummary ? 'Saving...' : meetingSummarySaved ? '✓ Saved!' : 'Save Summary'}
            </Button>
            {candidate.meetingSummary?.updatedAt && (
              <span className="last-updated">
                Last updated by {candidate.meetingSummary.updatedByName} on {formatDate(candidate.meetingSummary.updatedAt)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default MeetingSummarySection

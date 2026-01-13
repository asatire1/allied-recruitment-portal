// ============================================================================
// useExpandedSections Hook
// Manages expanded/collapsed state for collapsible sections
// Location: apps/recruitment-portal/src/hooks/useExpandedSections.ts
// ============================================================================

import { useState, useCallback } from 'react'

// ============================================================================
// TYPES
// ============================================================================

interface UseExpandedSectionsReturn {
  // Feedback section
  feedbackExpanded: boolean
  toggleFeedback: () => void
  setFeedbackExpanded: (expanded: boolean) => void
  
  // Meeting summary section
  meetingSummaryExpanded: boolean
  toggleMeetingSummary: () => void
  setMeetingSummaryExpanded: (expanded: boolean) => void
  
  // Expand all
  expandAll: () => void
  
  // Collapse all
  collapseAll: () => void
}

// ============================================================================
// HOOK
// ============================================================================

export function useExpandedSections(): UseExpandedSectionsReturn {
  const [feedbackExpanded, setFeedbackExpanded] = useState(false)
  const [meetingSummaryExpanded, setMeetingSummaryExpanded] = useState(false)

  const toggleFeedback = useCallback(() => {
    setFeedbackExpanded(prev => !prev)
  }, [])

  const toggleMeetingSummary = useCallback(() => {
    setMeetingSummaryExpanded(prev => !prev)
  }, [])

  const expandAll = useCallback(() => {
    setFeedbackExpanded(true)
    setMeetingSummaryExpanded(true)
  }, [])

  const collapseAll = useCallback(() => {
    setFeedbackExpanded(false)
    setMeetingSummaryExpanded(false)
  }, [])

  return {
    feedbackExpanded,
    toggleFeedback,
    setFeedbackExpanded,
    meetingSummaryExpanded,
    toggleMeetingSummary,
    setMeetingSummaryExpanded,
    expandAll,
    collapseAll,
  }
}

export default useExpandedSections

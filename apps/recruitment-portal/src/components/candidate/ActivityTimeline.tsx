// ============================================================================
// Activity Timeline Component
// Extracted from CandidateDetail.tsx for better maintainability
// Location: apps/recruitment-portal/src/components/candidate/ActivityTimeline.tsx
// ============================================================================

import type { ActivityLog, ActivityAction } from '@allied/shared-lib'
import { Card, Spinner } from '@allied/shared-ui'

// ============================================================================
// HELPERS
// ============================================================================

const formatDateTime = (timestamp: any): string => {
  if (!timestamp) return '-'
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getActivityIcon = (action: ActivityAction): string => {
  const icons: Record<ActivityAction, string> = {
    created: '➕',
    updated: '✏️',
    deleted: '🗑️',
    status_changed: '🔄',
    cv_uploaded: '📄',
    cv_parsed: '🤖',
    interview_scheduled: '📅',
    feedback_submitted: '📝',
    message_sent: '💬',
    booking_link_created: '🔗',
    booking_link_used: '✅',
  }
  return icons[action] || '📌'
}

// ============================================================================
// TYPES
// ============================================================================

interface ActivityTimelineProps {
  activities: ActivityLog[]
  loading: boolean
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ActivityTimeline({ activities, loading }: ActivityTimelineProps) {
  return (
    <Card className="detail-card activity-timeline-card">
      <h2>Activity Timeline</h2>
      
      {loading ? (
        <div className="activity-loading">
          <Spinner size="sm" />
          <span>Loading activity...</span>
        </div>
      ) : activities.length === 0 ? (
        <div className="activity-empty">
          <p>No activity recorded yet</p>
        </div>
      ) : (
        <div className="activity-list">
          {activities.map((activity) => (
            <div key={activity.id} className="activity-item">
              <div className="activity-icon">
                {getActivityIcon(activity.action)}
              </div>
              <div className="activity-content">
                <div className="activity-description">
                  {activity.description}
                </div>
                <div className="activity-meta">
                  <span className="activity-user">{activity.userName}</span>
                  <span className="activity-separator">•</span>
                  <span className="activity-time">{formatDateTime(activity.createdAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

export default ActivityTimeline

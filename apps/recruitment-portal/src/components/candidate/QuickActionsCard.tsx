// ============================================================================
// Quick Actions Card Component (Sidebar)
// Extracted from CandidateDetail.tsx for better maintainability
// Location: apps/recruitment-portal/src/components/candidate/QuickActionsCard.tsx
// ============================================================================

import { Card, Button } from '@allied/shared-ui'

// ============================================================================
// TYPES
// ============================================================================

interface QuickActionsCardProps {
  onChangeStatus: () => void
  onScheduleInterview: () => void
  onScheduleTrial: () => void
  onSendWhatsApp: () => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export function QuickActionsCard({ 
  onChangeStatus,
  onScheduleInterview,
  onScheduleTrial,
  onSendWhatsApp
}: QuickActionsCardProps) {
  return (
    <Card className="sidebar-card">
      <h3>Quick Actions</h3>
      <div className="quick-actions">
        <Button variant="outline" fullWidth onClick={onChangeStatus}>
          Change Status
        </Button>
        <Button variant="outline" fullWidth onClick={onScheduleInterview}>
          Schedule Interview
        </Button>
        <Button variant="outline" fullWidth onClick={onScheduleTrial}>
          Schedule Trial
        </Button>
        <Button variant="outline" fullWidth onClick={onSendWhatsApp}>
          Send WhatsApp
        </Button>
      </div>
    </Card>
  )
}

export default QuickActionsCard

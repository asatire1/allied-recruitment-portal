// Status configuration - matches shared-lib
const STATUS_CONFIG = {
  new: { label: 'New', color: '#10b981', bgColor: '#d1fae5' },
  screening: { label: 'Screening', color: '#f59e0b', bgColor: '#fef3c7' },
  interview_scheduled: { label: 'Interview Scheduled', color: '#3b82f6', bgColor: '#dbeafe' },
  interview_complete: { label: 'Interview Complete', color: '#6366f1', bgColor: '#e0e7ff' },
  trial_scheduled: { label: 'Trial Scheduled', color: '#8b5cf6', bgColor: '#ede9fe' },
  trial_complete: { label: 'Trial Complete', color: '#a855f7', bgColor: '#f3e8ff' },
  approved: { label: 'Approved', color: '#059669', bgColor: '#a7f3d0' },
  rejected: { label: 'Rejected', color: '#dc2626', bgColor: '#fecaca' },
  withdrawn: { label: 'Withdrawn', color: '#6b7280', bgColor: '#e5e7eb' },
} as const

export type CandidateStatus = keyof typeof STATUS_CONFIG

export interface StatusBadgeProps {
  status: CandidateStatus
  size?: 'sm' | 'md'
  showDot?: boolean
  className?: string
}

export function StatusBadge({
  status,
  size = 'md',
  showDot = true,
  className = '',
}: StatusBadgeProps) {
  const config = STATUS_CONFIG[status]
  
  if (!config) {
    return null
  }

  const sizeClasses = {
    sm: 'status-badge-sm',
    md: 'status-badge-md',
  }

  return (
    <span
      className={`status-badge ${sizeClasses[size]} ${className}`}
      style={{
        backgroundColor: config.bgColor,
        color: config.color,
      }}
    >
      {showDot && (
        <span
          className="status-badge-dot"
          style={{ backgroundColor: config.color }}
        />
      )}
      {config.label}
    </span>
  )
}

// Export config for use elsewhere
export { STATUS_CONFIG }

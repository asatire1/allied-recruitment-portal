import React from 'react'

export interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

const defaultIcon = (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M42 30V38C42 39.0609 41.5786 40.0783 40.8284 40.8284C40.0783 41.5786 39.0609 42 38 42H10C8.93913 42 7.92172 41.5786 7.17157 40.8284C6.42143 40.0783 6 39.0609 6 38V10C6 8.93913 6.42143 7.92172 7.17157 7.17157C7.92172 6.42143 8.93913 6 10 6H18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M34 6H42V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M20 28L42 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

export function EmptyState({
  icon = defaultIcon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`empty-state ${className}`}>
      <div className="empty-state-icon">
        {icon}
      </div>
      <h3 className="empty-state-title">{title}</h3>
      {description && (
        <p className="empty-state-description">{description}</p>
      )}
      {action && (
        <div className="empty-state-action">
          {action}
        </div>
      )}
    </div>
  )
}

// Pre-built empty states for common scenarios
EmptyState.NoCandidates = function NoCandidates({ onAdd }: { onAdd?: () => void }) {
  return (
    <EmptyState
      icon={
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M40 42V38C40 35.8783 39.1571 33.8434 37.6569 32.3431C36.1566 30.8429 34.1217 30 32 30H16C13.8783 30 11.8434 30.8429 10.3431 32.3431C8.84285 33.8434 8 35.8783 8 38V42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M24 22C28.4183 22 32 18.4183 32 14C32 9.58172 28.4183 6 24 6C19.5817 6 16 9.58172 16 14C16 18.4183 19.5817 22 24 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      }
      title="No candidates yet"
      description="Get started by adding your first candidate or uploading CVs."
      action={
        onAdd && (
          <button className="btn btn-primary" onClick={onAdd}>
            Add Candidate
          </button>
        )
      }
    />
  )
}

EmptyState.NoResults = function NoResults({ query }: { query?: string }) {
  return (
    <EmptyState
      icon={
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M22 38C30.8366 38 38 30.8366 38 22C38 13.1634 30.8366 6 22 6C13.1634 6 6 13.1634 6 22C6 30.8366 13.1634 38 22 38Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M42 42L33.3 33.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      }
      title="No results found"
      description={query ? `No matches for "${query}". Try adjusting your search or filters.` : 'Try adjusting your search or filters.'}
    />
  )
}

EmptyState.NoJobs = function NoJobs({ onCreate }: { onCreate?: () => void }) {
  return (
    <EmptyState
      icon={
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M40 14H8C5.79086 14 4 15.7909 4 18V38C4 40.2091 5.79086 42 8 42H40C42.2091 42 44 40.2091 44 38V18C44 15.7909 42.2091 14 40 14Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M32 42V10C32 8.93913 31.5786 7.92172 30.8284 7.17157C30.0783 6.42143 29.0609 6 28 6H20C18.9391 6 17.9217 6.42143 17.1716 7.17157C16.4214 7.92172 16 8.93913 16 10V42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      }
      title="No job postings"
      description="Create your first job posting to start receiving applications."
      action={
        onCreate && (
          <button className="btn btn-primary" onClick={onCreate}>
            Create Job
          </button>
        )
      }
    />
  )
}

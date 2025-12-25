import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../contexts'
import { Avatar } from '@allied/shared-ui'
import { getInitials } from '@allied/shared-lib'

// ============================================================================
// TYPES
// ============================================================================

interface HeaderProps {
  onMenuClick: () => void
  title?: string
}

// ============================================================================
// HEADER COMPONENT
// ============================================================================

export function Header({ onMenuClick, title }: HeaderProps) {
  const { user, signOut } = useAuth()
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close dropdown on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  const handleSignOut = async () => {
    setIsDropdownOpen(false)
    await signOut()
  }

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'User'
  const initials = user?.displayName 
    ? getInitials(user.displayName.split(' ')[0], user.displayName.split(' ')[1] || '')
    : user?.email?.[0]?.toUpperCase() || '?'

  return (
    <header className="header">
      {/* Mobile menu button */}
      <button 
        className="header-menu-btn"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 12h18M3 6h18M3 18h18" />
        </svg>
      </button>

      {/* Page title (mobile) */}
      {title && (
        <h1 className="header-title-mobile">{title}</h1>
      )}

      {/* Spacer */}
      <div className="header-spacer" />

      {/* Right side actions */}
      <div className="header-actions">
        {/* Notifications (placeholder for future) */}
        <button className="header-icon-btn" aria-label="Notifications">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {/* Notification badge - show when there are unread notifications */}
          {/* <span className="header-notification-badge">3</span> */}
        </button>

        {/* User dropdown */}
        <div className="header-user-dropdown" ref={dropdownRef}>
          <button
            className="header-user-btn"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            aria-expanded={isDropdownOpen}
            aria-haspopup="true"
          >
            <Avatar initials={initials} size="sm" />
            <span className="header-user-name">{displayName}</span>
            <svg 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
              className={`header-user-chevron ${isDropdownOpen ? 'header-user-chevron-open' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {/* Dropdown menu */}
          {isDropdownOpen && (
            <div className="header-dropdown-menu">
              <div className="header-dropdown-header">
                <div className="header-dropdown-name">{displayName}</div>
                <div className="header-dropdown-email">{user?.email}</div>
                <div className="header-dropdown-role">{user?.role.replace('_', ' ')}</div>
              </div>
              
              <div className="header-dropdown-divider" />
              
              <button 
                className="header-dropdown-item"
                onClick={() => {
                  setIsDropdownOpen(false)
                  // Navigate to profile/settings
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                My Profile
              </button>
              
              <button 
                className="header-dropdown-item"
                onClick={() => {
                  setIsDropdownOpen(false)
                  // Navigate to preferences
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Preferences
              </button>
              
              <div className="header-dropdown-divider" />
              
              <button 
                className="header-dropdown-item header-dropdown-item-danger"
                onClick={handleSignOut}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

export default Header

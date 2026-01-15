import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts'
import type { UserRole } from '@allied/shared-lib'

// ============================================================================
// TYPES
// ============================================================================

interface NavItem {
  label: string
  path: string
  icon: React.ReactNode
  /** Roles that can see this item (empty = all authenticated users) */
  roles?: UserRole[]
  /** Badge count (for notifications, etc.) */
  badge?: number
}

interface NavSection {
  title?: string
  items: NavItem[]
}

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  candidates: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  jobs: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  interviews: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      <circle cx="12" cy="14" r="2" />
    </svg>
  ),
  feedback: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  decisions: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  branches: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
}

// ============================================================================
// NAVIGATION CONFIG
// ============================================================================

const navigationConfig: NavSection[] = [
  {
    items: [
      {
        label: 'Dashboard',
        path: '/',
        icon: Icons.dashboard,
      },
    ],
  },
  {
    title: 'Recruitment',
    items: [
      {
        label: 'Candidates',
        path: '/candidates',
        icon: Icons.candidates,
        roles: ['super_admin', 'recruiter', 'viewer'],
      },
      {
        label: 'Jobs',
        path: '/jobs',
        icon: Icons.jobs,
        roles: ['super_admin', 'recruiter'],
      },
      {
        label: 'Calendar',
        path: '/calendar',
        icon: Icons.calendar,
        roles: ['super_admin', 'recruiter'],
      },
      {
        label: 'Interviews',
        path: '/interviews',
        icon: Icons.interviews,
        roles: ['super_admin', 'recruiter'],
      },
      {
        label: 'Pending Feedback',
        path: '/feedback/pending',
        icon: Icons.feedback,
        roles: ['super_admin', 'recruiter'],
      },
      {
        label: 'Ready for Decision',
        path: '/decisions',
        icon: Icons.decisions,
        roles: ['super_admin', 'recruiter'],
      },
    ],
  },
  {
    title: 'Settings',
    items: [
      {
        label: 'Settings',
        path: '/settings',
        icon: Icons.settings,
        roles: ['super_admin', 'recruiter'],
      },
      {
        label: 'Users',
        path: '/settings/users',
        icon: Icons.users,
        roles: ['super_admin'],
      },
      {
        label: 'Branches',
        path: '/settings/branches',
        icon: Icons.branches,
        roles: ['super_admin'],
      },
    ],
  },
]

// ============================================================================
// SIDEBAR COMPONENT
// ============================================================================

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, hasRole } = useAuth()
  const location = useLocation()

  // Filter navigation items based on user role
  const filteredNavigation = navigationConfig
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (!item.roles || item.roles.length === 0) return true
        return hasRole(item.roles)
      }),
    }))
    .filter((section) => section.items.length > 0)

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="sidebar-overlay" 
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
        {/* Logo - Allied Pharmacies */}
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img 
              src="/allied-logo.png" 
              alt="Allied Pharmacies" 
              className="sidebar-logo-img"
            />
          </div>
          
          {/* Mobile close button */}
          <button 
            className="sidebar-close"
            onClick={onClose}
            aria-label="Close menu"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {filteredNavigation.map((section, sectionIndex) => (
            <div key={sectionIndex} className="nav-section">
              {section.title && (
                <div className="nav-section-title">{section.title}</div>
              )}
              <ul className="nav-list">
                {section.items.map((item) => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      className={({ isActive }) =>
                        `nav-item ${isActive || (item.path !== '/' && location.pathname.startsWith(item.path)) ? 'nav-item-active' : ''}`
                      }
                      onClick={() => {
                        // Close sidebar on mobile after navigation
                        if (window.innerWidth < 1024) {
                          onClose()
                        }
                      }}
                      end={item.path === '/'}
                    >
                      <span className="nav-icon">{item.icon}</span>
                      <span className="nav-label">{item.label}</span>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="nav-badge">{item.badge}</span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* User info at bottom */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">
              {user?.displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">
                {user?.displayName || user?.email?.split('@')[0]}
              </div>
              <div className="sidebar-user-role">
                {user?.role.replace('_', ' ')}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

export default Sidebar

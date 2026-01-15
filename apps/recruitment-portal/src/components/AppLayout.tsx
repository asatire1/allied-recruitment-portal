// ============================================================================
// Allied Recruitment Portal - App Layout
// Location: apps/recruitment-portal/src/components/AppLayout.tsx
// ============================================================================

import { useState, useEffect, ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

// ============================================================================
// TYPES
// ============================================================================

interface AppLayoutProps {
  children: ReactNode
  /** Page title shown in header */
  title?: string
}

// ============================================================================
// PAGE TITLES MAP
// ============================================================================

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/candidates': 'Candidates',
  '/jobs': 'Jobs',
  '/calendar': 'Calendar',
  '/interviews': 'Interviews',
  '/reports': 'Reports',
  '/settings': 'Settings',
  '/settings/users': 'Users',
  '/settings/branches': 'Branches',
  '/feedback/pending': 'Pending Feedback',
}

// ============================================================================
// APP LAYOUT COMPONENT
// ============================================================================

export function AppLayout({ children, title }: AppLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const location = useLocation()

  // Close sidebar when route changes (mobile)
  useEffect(() => {
    setIsSidebarOpen(false)
  }, [location.pathname])

  // Close sidebar on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsSidebarOpen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (isSidebarOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isSidebarOpen])

  // Determine page title
  const pageTitle = title || pageTitles[location.pathname] || ''

  return (
    <div className="app-layout">
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
      />
      
      <div className="app-main">
        <Header 
          onMenuClick={() => setIsSidebarOpen(true)}
          title={pageTitle}
        />
        
        <main className="app-content">
          {children}
        </main>
      </div>
    </div>
  )
}

export default AppLayout

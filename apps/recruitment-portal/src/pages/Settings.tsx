import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { BookingBlocksSettings } from '../components/BookingBlocksSettings'
import { 
  WhatsAppTemplatesTab, 
  EmailTemplatesTab,
  EntitiesTab, 
  JobTitlesTab,
  InterviewAvailabilityTab,
  TrialAvailabilityTab,
  LocationsTab
} from './settings-tabs'
import { Card } from '@allied/shared-ui'
import './Settings.css'

// ============================================================================
// TYPES
// ============================================================================

interface SettingsTab {
  id: string
  label: string
  icon: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SETTINGS_TABS: SettingsTab[] = [
  { id: 'entities', label: 'Entities', icon: '🏢' },
  { id: 'job-titles', label: 'Job Titles', icon: '💼' },
  { id: 'interview-availability', label: 'Interview Availability', icon: '📅' },
  { id: 'trial-availability', label: 'Trial Availability', icon: '🏥' },
  { id: 'booking-blocks', label: 'Booking Restrictions', icon: '🚫' },
  { id: 'email-templates', label: 'Email Templates', icon: '✉️' },
  { id: 'whatsapp-templates', label: 'WhatsApp Templates', icon: '💬' },
  { id: 'locations', label: 'Locations', icon: '📍' },
  { id: 'general', label: 'General', icon: '⚙️' },
]

// ============================================================================
// COMPONENT
// ============================================================================

export function Settings() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('entities')

  // ============================================================================
  // RENDER TABS
  // ============================================================================

  const renderBookingBlocksTab = () => (
    <div className="settings-section">
      <BookingBlocksSettings />
    </div>
  )

  const renderGeneralTab = () => (
    <div className="settings-section">
      <div className="settings-section-header">
        <div>
          <h2>General Settings</h2>
          <p>Configure general application settings</p>
        </div>
      </div>
      <Card className="coming-soon-card">
        <p>General settings will be available in a future update.</p>
      </Card>
    </div>
  )

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <div className="settings-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-description">Configure job titles, WhatsApp templates and system preferences</p>
        </div>
      </div>

      <div className="settings-layout">
        {/* Sidebar tabs */}
        <div className="settings-sidebar">
          {SETTINGS_TABS.map(tab => (
            <button
              key={tab.id}
              className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="settings-content">
          {activeTab === 'entities' && <EntitiesTab userId={user?.id} />}
          {activeTab === 'job-titles' && <JobTitlesTab userId={user?.id} />}
          {activeTab === 'interview-availability' && <InterviewAvailabilityTab userId={user?.id} />}
          {activeTab === 'trial-availability' && <TrialAvailabilityTab userId={user?.id} />}
          {activeTab === 'booking-blocks' && renderBookingBlocksTab()}
          {activeTab === 'email-templates' && <EmailTemplatesTab userId={user?.id} />}
          {activeTab === 'whatsapp-templates' && <WhatsAppTemplatesTab userId={user?.id} />}
          {activeTab === 'locations' && <LocationsTab userId={user?.id} />}
          {activeTab === 'general' && renderGeneralTab()}
        </div>
      </div>
    </div>
  )
}

export default Settings

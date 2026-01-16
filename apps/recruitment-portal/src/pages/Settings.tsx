import { useState, useCallback } from 'react'
import { httpsCallable } from 'firebase/functions'
import { useAuth } from '../contexts/AuthContext'
import { getFirebaseFunctions } from '@allied/shared-lib'
import { migrateLegacyFeedback, assignBranchesToCandidates, fixFutureCompletedInterviews } from '../utils/migrateFeedback'
import { BookingBlocksSettings } from '../components/BookingBlocksSettings'
import { 
  MessageTemplatesTab,
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
  { id: 'message-templates', label: 'Message Templates', icon: '📝' },
  { id: 'locations', label: 'Locations', icon: '📍' },
  { id: 'general', label: 'General', icon: '⚙️' },
]

// ============================================================================
// COMPONENT
// ============================================================================

export function Settings() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('entities')
  const [migrating, setMigrating] = useState(false)
  const [migrationResult, setMigrationResult] = useState<any>(null)
  const [migratingBranches, setMigratingBranches] = useState(false)
  const [branchMigrationResult, setBranchMigrationResult] = useState<any>(null)
  const [fixingFutureInterviews, setFixingFutureInterviews] = useState(false)
  const [futureInterviewsResult, setFutureInterviewsResult] = useState<any>(null)
  const [cleaningExpiredLinks, setCleaningExpiredLinks] = useState(false)
  const [expiredLinksResult, setExpiredLinksResult] = useState<any>(null)

  const handleMigrateFeedback = useCallback(async () => {
    if (!confirm('This will migrate legacy feedback to interview records. Continue?')) return

    setMigrating(true)
    setMigrationResult(null)

    try {
      const result = await migrateLegacyFeedback()
      setMigrationResult(result)
      alert(`Migration complete!\n\nMigrated: ${result.migrated}\nSkipped: ${result.skipped}\nErrors: ${result.errors.length}`)
    } catch (err: any) {
      alert(`Migration failed: ${err.message}`)
    } finally {
      setMigrating(false)
    }
  }, [])

  const handleAssignBranches = useCallback(async () => {
    if (!confirm('This will assign branches to candidates based on their job. Continue?')) return

    setMigratingBranches(true)
    setBranchMigrationResult(null)

    try {
      const result = await assignBranchesToCandidates()
      setBranchMigrationResult(result)
      alert(`Branch assignment complete!\n\nAssigned: ${result.assigned}\nNeeds manual: ${result.skipped}\nErrors: ${result.errors.length}`)
    } catch (err: any) {
      alert(`Branch assignment failed: ${err.message}`)
    } finally {
      setMigratingBranches(false)
    }
  }, [])

  const handleFixFutureInterviews = useCallback(async () => {
    if (!confirm('This will reset future interviews that are incorrectly marked as completed back to scheduled. Continue?')) return

    setFixingFutureInterviews(true)
    setFutureInterviewsResult(null)

    try {
      const result = await fixFutureCompletedInterviews()
      setFutureInterviewsResult(result)
      alert(`Fix complete!\n\nFound: ${result.total}\nFixed: ${result.fixed}\nSkipped: ${result.skipped}\nErrors: ${result.errors.length}`)
    } catch (err: any) {
      alert(`Fix failed: ${err.message}`)
    } finally {
      setFixingFutureInterviews(false)
    }
  }, [])

  const handleCleanupExpiredLinks = useCallback(async () => {
    if (!confirm('This will mark expired booking links and withdraw candidates who didn\'t book. Continue?')) return

    setCleaningExpiredLinks(true)
    setExpiredLinksResult(null)

    try {
      const functions = getFirebaseFunctions()
      const cleanupFn = httpsCallable(functions, 'triggerExpiredBookingCleanup')
      const response = await cleanupFn()
      const result = response.data as any
      setExpiredLinksResult(result)
      alert(`Cleanup complete!\n\nLinks expired: ${result.linksExpired}\nCandidates withdrawn: ${result.candidatesWithdrawn}\nErrors: ${result.errors}`)
    } catch (err: any) {
      alert(`Cleanup failed: ${err.message}`)
    } finally {
      setCleaningExpiredLinks(false)
    }
  }, [])

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

      {/* Data Migration Section */}
      <Card className="settings-card">
        <h3>Data Migration</h3>
        <p style={{ color: '#666', marginBottom: '16px' }}>
          Migrate legacy feedback (stored on candidate records) to interview records.
          This is required for candidates to appear on the Ready for Decision page.
        </p>
        <button
          onClick={handleMigrateFeedback}
          disabled={migrating}
          style={{
            padding: '12px 24px',
            background: migrating ? '#ccc' : '#0d4f5c',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: migrating ? 'not-allowed' : 'pointer',
            fontSize: '15px',
            fontWeight: 600,
          }}
        >
          {migrating ? 'Migrating...' : 'Migrate Legacy Feedback'}
        </button>

        {migrationResult && (
          <div style={{ marginTop: '20px', padding: '16px', background: '#f5f5f5', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 12px 0' }}>Migration Results</h4>
            <p><strong>Total legacy feedbacks:</strong> {migrationResult.total}</p>
            <p><strong>Successfully migrated:</strong> {migrationResult.migrated}</p>
            <p><strong>Skipped:</strong> {migrationResult.skipped}</p>
            {migrationResult.errors.length > 0 && (
              <div style={{ color: '#c00', marginTop: '12px' }}>
                <strong>Errors:</strong>
                <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                  {migrationResult.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            {migrationResult.details.length > 0 && (
              <details style={{ marginTop: '12px' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Details ({migrationResult.details.length})</summary>
                <ul style={{ margin: '8px 0', paddingLeft: '20px', fontSize: '13px' }}>
                  {migrationResult.details.map((d: string, i: number) => <li key={i}>{d}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}
      </Card>

      {/* Branch Assignment Section */}
      <Card className="settings-card" style={{ marginTop: '24px' }}>
        <h3>Assign Branches to Candidates</h3>
        <p style={{ color: '#666', marginBottom: '16px' }}>
          Find candidates without a branch and assign them based on their job's branch.
          Candidates without a job (or whose job has no branch) will be listed for manual assignment.
        </p>
        <button
          onClick={handleAssignBranches}
          disabled={migratingBranches}
          style={{
            padding: '12px 24px',
            background: migratingBranches ? '#ccc' : '#0d4f5c',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: migratingBranches ? 'not-allowed' : 'pointer',
            fontSize: '15px',
            fontWeight: 600,
          }}
        >
          {migratingBranches ? 'Assigning...' : 'Assign Branches to Candidates'}
        </button>

        {branchMigrationResult && (
          <div style={{ marginTop: '20px', padding: '16px', background: '#f5f5f5', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 12px 0' }}>Branch Assignment Results</h4>
            <p><strong>Candidates without branch:</strong> {branchMigrationResult.total}</p>
            <p><strong>Successfully assigned:</strong> {branchMigrationResult.assigned}</p>
            <p><strong>Needs manual assignment:</strong> {branchMigrationResult.skipped}</p>
            {branchMigrationResult.errors.length > 0 && (
              <div style={{ color: '#c00', marginTop: '12px' }}>
                <strong>Errors:</strong>
                <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                  {branchMigrationResult.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            {branchMigrationResult.needsManualAssignment.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <strong>Needs manual assignment ({branchMigrationResult.needsManualAssignment.length}):</strong>
                <ul style={{ margin: '8px 0', paddingLeft: '20px', fontSize: '13px' }}>
                  {branchMigrationResult.needsManualAssignment.map((c: any) => (
                    <li key={c.id}>
                      <a href={`/candidates/${c.id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#0d4f5c' }}>
                        {c.name}
                      </a>
                      {' '}- {c.jobTitle}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {branchMigrationResult.details.length > 0 && (
              <details style={{ marginTop: '12px' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Details ({branchMigrationResult.details.length})</summary>
                <ul style={{ margin: '8px 0', paddingLeft: '20px', fontSize: '13px' }}>
                  {branchMigrationResult.details.map((d: string, i: number) => <li key={i}>{d}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}
      </Card>

      {/* Fix Future Interviews Section */}
      <Card className="settings-card" style={{ marginTop: '24px' }}>
        <h3>Fix Future Interviews</h3>
        <p style={{ color: '#666', marginBottom: '16px' }}>
          Find interviews/trials scheduled for future dates that are incorrectly marked as "completed" or "pending_feedback"
          and reset them back to "scheduled" status.
        </p>
        <button
          onClick={handleFixFutureInterviews}
          disabled={fixingFutureInterviews}
          style={{
            padding: '12px 24px',
            background: fixingFutureInterviews ? '#ccc' : '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: fixingFutureInterviews ? 'not-allowed' : 'pointer',
            fontSize: '15px',
            fontWeight: 600,
          }}
        >
          {fixingFutureInterviews ? 'Fixing...' : 'Fix Future Interviews'}
        </button>

        {futureInterviewsResult && (
          <div style={{ marginTop: '20px', padding: '16px', background: '#f5f5f5', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 12px 0' }}>Fix Results</h4>
            <p><strong>Incorrectly marked:</strong> {futureInterviewsResult.total}</p>
            <p><strong>Fixed:</strong> {futureInterviewsResult.fixed}</p>
            <p><strong>Skipped:</strong> {futureInterviewsResult.skipped}</p>
            {futureInterviewsResult.errors.length > 0 && (
              <div style={{ color: '#c00', marginTop: '12px' }}>
                <strong>Errors:</strong>
                <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                  {futureInterviewsResult.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            {futureInterviewsResult.details.length > 0 && (
              <details style={{ marginTop: '12px' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Details ({futureInterviewsResult.details.length})</summary>
                <ul style={{ margin: '8px 0', paddingLeft: '20px', fontSize: '13px' }}>
                  {futureInterviewsResult.details.map((d: string, i: number) => <li key={i}>{d}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}
      </Card>

      {/* Expired Booking Links Cleanup Section */}
      <Card className="settings-card" style={{ marginTop: '24px' }}>
        <h3>Cleanup Expired Booking Links</h3>
        <p style={{ color: '#666', marginBottom: '16px' }}>
          Find booking links that have expired without the candidate booking, mark them as expired,
          and withdraw those candidates. This runs automatically daily at 2 AM, but you can run it manually here.
        </p>
        <button
          onClick={handleCleanupExpiredLinks}
          disabled={cleaningExpiredLinks}
          style={{
            padding: '12px 24px',
            background: cleaningExpiredLinks ? '#ccc' : '#f59e0b',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: cleaningExpiredLinks ? 'not-allowed' : 'pointer',
            fontSize: '15px',
            fontWeight: 600,
          }}
        >
          {cleaningExpiredLinks ? 'Cleaning up...' : 'Cleanup Expired Links'}
        </button>

        {expiredLinksResult && (
          <div style={{ marginTop: '20px', padding: '16px', background: '#f5f5f5', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 12px 0' }}>Cleanup Results</h4>
            <p><strong>Links expired:</strong> {expiredLinksResult.linksExpired}</p>
            <p><strong>Candidates withdrawn:</strong> {expiredLinksResult.candidatesWithdrawn}</p>
            <p><strong>Errors:</strong> {expiredLinksResult.errors}</p>
          </div>
        )}
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
          <p className="page-description">Configure job titles, message templates and system preferences</p>
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
          {activeTab === 'message-templates' && <MessageTemplatesTab userId={user?.id} />}
          {activeTab === 'locations' && <LocationsTab userId={user?.id} />}
          {activeTab === 'general' && renderGeneralTab()}
        </div>
      </div>
    </div>
  )
}

export default Settings

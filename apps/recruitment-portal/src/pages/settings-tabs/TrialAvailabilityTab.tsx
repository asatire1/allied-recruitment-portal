// ============================================================================
// Trial Availability Tab - Rebuilt with Branch Capacity Management
// Configure when candidates can book trial shifts (4-hour blocks)
// ============================================================================

import { useEffect, useState, useMemo } from 'react'
import { doc, getDoc, setDoc, collection, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore'
import {
  getFirebaseDb,
  DEFAULT_TRIAL_AVAILABILITY,
} from '@allied/shared-lib'
import type {
  AvailabilitySlot,
  TrialAvailabilitySettings,
  Branch
} from '@allied/shared-lib'
import { Card, Button, Input, Spinner } from '@allied/shared-ui'
import './TrialAvailabilityTab.css'

// ============================================================================
// TYPES
// ============================================================================

interface TrialAvailabilityTabProps {
  userId?: string
}

interface BranchTrialSettings {
  id: string
  name: string
  code: string
  city: string
  postcode: string
  entity: string
  region: string
  acceptingTrials: boolean
  maxTrialsPerDay: number
  active: boolean
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// ============================================================================
// COMPONENT
// ============================================================================

export function TrialAvailabilityTab({ userId }: TrialAvailabilityTabProps) {
  const db = getFirebaseDb()

  // Global settings state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    trialDuration: 240, // Fixed 4 hours
    bufferTime: 30,
    maxAdvanceBooking: 21,
    minNoticeHours: 48,
    bookingLinkExpiryDays: 7,
    slots: [...DEFAULT_TRIAL_AVAILABILITY.slots] as AvailabilitySlot[],
  })

  // Branch state
  const [branches, setBranches] = useState<BranchTrialSettings[]>([])
  const [branchChanges, setBranchChanges] = useState<Record<string, Partial<BranchTrialSettings>>>({})
  const [selectedBranchIds, setSelectedBranchIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [entityFilter, setEntityFilter] = useState<string>('all')
  const [bulkCapacity, setBulkCapacity] = useState(2)

  // ============================================================================
  // FETCH DATA
  // ============================================================================

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        
        // Fetch global trial settings
        const settingsRef = doc(db, 'settings', 'trialAvailability')
        const settingsSnap = await getDoc(settingsRef)
        
        if (settingsSnap.exists()) {
          const data = settingsSnap.data() as TrialAvailabilitySettings
          setForm({
            trialDuration: data.trialDuration || 240,
            bufferTime: data.bufferTime || 30,
            maxAdvanceBooking: data.maxAdvanceBooking || 21,
            minNoticeHours: data.minNoticeHours || 48,
            bookingLinkExpiryDays: (data as any).bookingLinkExpiryDays || 7,
            slots: data.slots || [...DEFAULT_TRIAL_AVAILABILITY.slots],
          })
        }

        // Fetch all branches
        const branchesSnap = await getDocs(collection(db, 'branches'))
        const branchList: BranchTrialSettings[] = []
        
        branchesSnap.forEach(doc => {
          const data = doc.data() as Branch
          branchList.push({
            id: doc.id,
            name: data.name || '',
            code: data.code || '',
            city: data.city || '',
            postcode: data.postcode || '',
            entity: data.entity || '',
            region: data.region || '',
            acceptingTrials: data.acceptingTrials ?? true,
            maxTrialsPerDay: data.maxTrialsPerDay ?? 2,
            active: data.active ?? true,
          })
        })
        
        // Sort by name
        branchList.sort((a, b) => a.name.localeCompare(b.name))
        setBranches(branchList)
        
      } catch (err) {
        console.error('Error fetching data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [db])

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  // Get unique entities for filter
  const entities = useMemo(() => {
    const entitySet = new Set<string>()
    branches.forEach(b => {
      if (b.entity) entitySet.add(b.entity)
    })
    return Array.from(entitySet).sort()
  }, [branches])

  // Filter branches
  const filteredBranches = useMemo(() => {
    return branches.filter(branch => {
      // Only show active branches
      if (!branch.active) return false
      
      // Entity filter
      if (entityFilter !== 'all' && branch.entity !== entityFilter) return false
      
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        return (
          branch.name.toLowerCase().includes(query) ||
          branch.city.toLowerCase().includes(query) ||
          branch.postcode.toLowerCase().includes(query) ||
          branch.code.toLowerCase().includes(query)
        )
      }
      
      return true
    })
  }, [branches, entityFilter, searchQuery])

  // Get branch value (with pending changes)
  const getBranchValue = <K extends keyof BranchTrialSettings>(
    branchId: string, 
    field: K
  ): BranchTrialSettings[K] => {
    const changes = branchChanges[branchId]
    if (changes && field in changes) {
      return changes[field] as BranchTrialSettings[K]
    }
    const branch = branches.find(b => b.id === branchId)
    return branch ? branch[field] : (field === 'acceptingTrials' ? false : field === 'maxTrialsPerDay' ? 2 : '') as BranchTrialSettings[K]
  }

  // Count by entity
  const entityCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 }
    branches.forEach(b => {
      if (!b.active) return
      counts.all++
      if (b.entity) {
        counts[b.entity] = (counts[b.entity] || 0) + 1
      }
    })
    return counts
  }, [branches])

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleSlotToggle = (dayOfWeek: number) => {
    setForm(prev => ({
      ...prev,
      slots: prev.slots.map(slot =>
        slot.dayOfWeek === dayOfWeek
          ? { ...slot, enabled: !slot.enabled }
          : slot
      ),
    }))
  }

  const handleSlotTimeChange = (dayOfWeek: number, field: 'startTime' | 'endTime', value: string) => {
    setForm(prev => ({
      ...prev,
      slots: prev.slots.map(slot =>
        slot.dayOfWeek === dayOfWeek
          ? { ...slot, [field]: value }
          : slot
      ),
    }))
  }

  const handleBranchChange = (branchId: string, field: keyof BranchTrialSettings, value: any) => {
    setBranchChanges(prev => ({
      ...prev,
      [branchId]: {
        ...prev[branchId],
        [field]: value,
      }
    }))
  }

  const handleSelectAll = () => {
    if (selectedBranchIds.size === filteredBranches.length) {
      setSelectedBranchIds(new Set())
    } else {
      setSelectedBranchIds(new Set(filteredBranches.map(b => b.id)))
    }
  }

  const handleSelectBranch = (branchId: string) => {
    setSelectedBranchIds(prev => {
      const next = new Set(prev)
      if (next.has(branchId)) {
        next.delete(branchId)
      } else {
        next.add(branchId)
      }
      return next
    })
  }

  const handleBulkEnable = () => {
    selectedBranchIds.forEach(id => {
      handleBranchChange(id, 'acceptingTrials', true)
    })
  }

  const handleBulkDisable = () => {
    selectedBranchIds.forEach(id => {
      handleBranchChange(id, 'acceptingTrials', false)
    })
  }

  const handleBulkSetCapacity = () => {
    selectedBranchIds.forEach(id => {
      handleBranchChange(id, 'maxTrialsPerDay', bulkCapacity)
    })
  }

  const calculatePossibleSlots = (startTime: string, endTime: string): number => {
    const [startH, startM] = startTime.split(':').map(Number)
    const [endH, endM] = endTime.split(':').map(Number)
    const totalMinutes = (endH * 60 + endM) - (startH * 60 + startM)
    return Math.floor(totalMinutes / (240 + form.bufferTime))
  }

  // ============================================================================
  // SAVE
  // ============================================================================

  const handleSave = async () => {
    try {
      setSaving(true)
      const batch = writeBatch(db)

      // Save global settings
      const settingsRef = doc(db, 'settings', 'trialAvailability')
      batch.set(settingsRef, {
        ...form,
        updatedAt: serverTimestamp(),
        updatedBy: userId || 'system',
      })

      // Save branch changes
      Object.entries(branchChanges).forEach(([branchId, changes]) => {
        const branchRef = doc(db, 'branches', branchId)
        batch.update(branchRef, {
          ...changes,
          updatedAt: serverTimestamp(),
        })
      })

      await batch.commit()

      // Update local state
      setBranches(prev => prev.map(branch => {
        const changes = branchChanges[branch.id]
        if (changes) {
          return { ...branch, ...changes }
        }
        return branch
      }))
      setBranchChanges({})

      alert('Trial availability settings saved successfully!')
    } catch (err) {
      console.error('Error saving settings:', err)
      alert('Failed to save settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Check if there are unsaved changes
  const hasChanges = Object.keys(branchChanges).length > 0

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div className="settings-section">
        <div className="settings-loading">
          <Spinner size="lg" />
        </div>
      </div>
    )
  }

  return (
    <div className="settings-section trial-availability-tab">
      <div className="settings-section-header">
        <div>
          <h2>Trial Availability</h2>
          <p>Configure when candidates can book trial shifts (4-hour blocks)</p>
        </div>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      {/* Global Settings Card */}
      <Card className="settings-card">
        <div className="card-header">
          <h3>📅 Global Trial Settings</h3>
        </div>
        <div className="settings-grid">
          <div className="form-group">
            <label>Buffer Time (Minutes)</label>
            <Input
              type="number"
              value={form.bufferTime}
              onChange={(e) => setForm(prev => ({
                ...prev,
                bufferTime: parseInt(e.target.value) || 0
              }))}
              min={0}
              max={120}
            />
            <span className="form-help">Gap between trials</span>
          </div>
          <div className="form-group">
            <label>Max Advance Booking (Days)</label>
            <Input
              type="number"
              value={form.maxAdvanceBooking}
              onChange={(e) => setForm(prev => ({
                ...prev,
                maxAdvanceBooking: parseInt(e.target.value) || 21
              }))}
              min={1}
              max={90}
            />
            <span className="form-help">How far ahead candidates can book</span>
          </div>
          <div className="form-group">
            <label>Minimum Notice (Hours)</label>
            <Input
              type="number"
              value={form.minNoticeHours}
              onChange={(e) => setForm(prev => ({
                ...prev,
                minNoticeHours: parseInt(e.target.value) || 48
              }))}
              min={1}
              max={336}
            />
            <span className="form-help">Minimum hours notice required</span>
          </div>
          <div className="form-group">
            <label>Booking Link Expiry (Days)</label>
            <Input
              type="number"
              value={form.bookingLinkExpiryDays}
              onChange={(e) => setForm(prev => ({
                ...prev,
                bookingLinkExpiryDays: parseInt(e.target.value) || 7
              }))}
              min={1}
              max={30}
            />
            <span className="form-help">How long trial booking links remain valid</span>
          </div>
        </div>
      </Card>

      {/* Weekly Schedule Card */}
      <Card className="settings-card">
        <div className="card-header">
          <h3>🗓️ Weekly Schedule</h3>
          <span className="card-subtitle">Trial shifts are fixed at 4 hours duration</span>
        </div>
        <table className="schedule-table">
          <thead>
            <tr>
              <th style={{ width: '120px' }}>Day</th>
              <th style={{ width: '100px' }}>Enabled</th>
              <th>Start Time</th>
              <th>End Time</th>
              <th>Possible Slots</th>
            </tr>
          </thead>
          <tbody>
            {form.slots.map(slot => {
              const possibleSlots = slot.enabled ? calculatePossibleSlots(slot.startTime, slot.endTime) : 0
              return (
                <tr key={slot.dayOfWeek} className={slot.enabled ? '' : 'disabled-row'}>
                  <td><strong>{DAY_NAMES[slot.dayOfWeek]}</strong></td>
                  <td>
                    <div 
                      className={`toggle ${slot.enabled ? 'on' : ''}`}
                      onClick={() => handleSlotToggle(slot.dayOfWeek)}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      value={slot.startTime}
                      onChange={(e) => handleSlotTimeChange(slot.dayOfWeek, 'startTime', e.target.value)}
                      disabled={!slot.enabled}
                      className="time-input"
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      value={slot.endTime}
                      onChange={(e) => handleSlotTimeChange(slot.dayOfWeek, 'endTime', e.target.value)}
                      disabled={!slot.enabled}
                      className="time-input"
                    />
                  </td>
                  <td>
                    {slot.enabled ? (
                      <span className={`badge ${possibleSlots > 0 ? 'badge-green' : 'badge-red'}`}>
                        {possibleSlots > 0 ? `${possibleSlots} slot${possibleSlots !== 1 ? 's' : ''}` : 'No slots'}
                      </span>
                    ) : (
                      <span className="badge badge-gray">Disabled</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      {/* Branch Trial Capacity Card */}
      <Card className="settings-card">
        <div className="card-header">
          <h3>🏥 Branch Trial Capacity</h3>
        </div>

        {/* Entity Filter */}
        <div className="entity-filter">
          <button
            className={`entity-btn ${entityFilter === 'all' ? 'active' : ''}`}
            onClick={() => setEntityFilter('all')}
          >
            All ({entityCounts.all || 0})
          </button>
          {entities.map(entity => (
            <button
              key={entity}
              className={`entity-btn ${entityFilter === entity ? 'active' : ''}`}
              onClick={() => setEntityFilter(entity)}
            >
              {entity} ({entityCounts[entity] || 0})
            </button>
          ))}
        </div>

        {/* Search and Bulk Actions */}
        <div className="table-header">
          <input
            type="text"
            className="search-box"
            placeholder="Search branches..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="bulk-actions">
            {selectedBranchIds.size > 0 && (
              <>
                <span className="selected-count">{selectedBranchIds.size} selected</span>
                <Button variant="secondary" size="sm" onClick={handleBulkEnable}>
                  Enable Trials
                </Button>
                <Button variant="secondary" size="sm" onClick={handleBulkDisable}>
                  Disable Trials
                </Button>
                <div className="bulk-capacity">
                  <span>Set Capacity:</span>
                  <input
                    type="number"
                    value={bulkCapacity}
                    onChange={(e) => setBulkCapacity(parseInt(e.target.value) || 1)}
                    min={1}
                    max={10}
                    className="capacity-input"
                  />
                  <Button variant="secondary" size="sm" onClick={handleBulkSetCapacity}>
                    Apply
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Branch Table */}
        <table className="branch-table">
          <thead>
            <tr>
              <th className="checkbox-cell">
                <input
                  type="checkbox"
                  checked={selectedBranchIds.size === filteredBranches.length && filteredBranches.length > 0}
                  onChange={handleSelectAll}
                />
              </th>
              <th>Branch Name</th>
              <th>Entity</th>
              <th>Region</th>
              <th style={{ width: '120px' }}>Accepting Trials</th>
              <th style={{ width: '120px' }}>Max Per Day</th>
            </tr>
          </thead>
          <tbody>
            {filteredBranches.map(branch => {
              const acceptingTrials = getBranchValue(branch.id, 'acceptingTrials')
              const maxTrialsPerDay = getBranchValue(branch.id, 'maxTrialsPerDay')
              const hasChange = !!branchChanges[branch.id]
              
              return (
                <tr key={branch.id} className={hasChange ? 'has-changes' : ''}>
                  <td className="checkbox-cell">
                    <input
                      type="checkbox"
                      checked={selectedBranchIds.has(branch.id)}
                      onChange={() => handleSelectBranch(branch.id)}
                    />
                  </td>
                  <td>
                    <strong>{branch.name}</strong>
                    <br />
                    <span className="branch-location">{branch.city} • {branch.postcode}</span>
                  </td>
                  <td>{branch.entity}</td>
                  <td>{branch.region}</td>
                  <td>
                    <div
                      className={`toggle ${acceptingTrials ? 'on' : ''}`}
                      onClick={() => handleBranchChange(branch.id, 'acceptingTrials', !acceptingTrials)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="capacity-input"
                      value={maxTrialsPerDay}
                      onChange={(e) => handleBranchChange(branch.id, 'maxTrialsPerDay', parseInt(e.target.value) || 1)}
                      min={1}
                      max={10}
                      disabled={!acceptingTrials}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="table-footer">
          Showing {filteredBranches.length} of {branches.filter(b => b.active).length} branches
          {hasChanges && <span className="unsaved-indicator"> • Unsaved changes</span>}
        </p>
      </Card>
    </div>
  )
}

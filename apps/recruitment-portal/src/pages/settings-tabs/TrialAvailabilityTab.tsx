// ============================================================================
// Trial Availability Tab - Extracted from Settings.tsx
// Configure when candidates can book trial shifts (4-hour blocks)
// ============================================================================

import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import {
  getFirebaseDb,
  DEFAULT_TRIAL_AVAILABILITY,
} from '@allied/shared-lib'
import type {
  AvailabilitySlot,
  TrialAvailabilitySettings
} from '@allied/shared-lib'
import { Card, Button, Input, Spinner } from '@allied/shared-ui'

// ============================================================================
// TYPES
// ============================================================================

interface TrialAvailabilityTabProps {
  userId?: string
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

  // State
  const [trialAvailability, setTrialAvailability] = useState<TrialAvailabilitySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    trialDuration: 240, // Fixed 4 hours
    bufferTime: 30,
    maxAdvanceBooking: 21,
    minNoticeHours: 48,
    maxTrialsPerDay: 2,
    bookingLinkExpiryDays: 7,
    slots: [...DEFAULT_TRIAL_AVAILABILITY.slots] as AvailabilitySlot[],
  })
  const [blockedDates, setBlockedDates] = useState<string[]>([])
  const [newBlockedDate, setNewBlockedDate] = useState('')

  // ============================================================================
  // FETCH DATA
  // ============================================================================

  useEffect(() => {
    async function fetchTrialAvailability() {
      try {
        setLoading(true)
        const docRef = doc(db, 'settings', 'trialAvailability')
        const docSnap = await getDoc(docRef)
        
        if (docSnap.exists()) {
          const data = docSnap.data() as TrialAvailabilitySettings
          setTrialAvailability({ ...data, id: docSnap.id })
          setForm({
            trialDuration: data.trialDuration || 240,
            bufferTime: data.bufferTime || 30,
            maxAdvanceBooking: data.maxAdvanceBooking || 21,
            minNoticeHours: data.minNoticeHours || 48,
            maxTrialsPerDay: data.maxTrialsPerDay || 2,
            bookingLinkExpiryDays: (data as any).bookingLinkExpiryDays || 7,
            slots: data.slots || [...DEFAULT_TRIAL_AVAILABILITY.slots],
          })
          // Convert timestamps to date strings
          const dates = (data.blockedDates || []).map((d: any) => {
            const date = d.toDate ? d.toDate() : new Date(d)
            return date.toISOString().split('T')[0]
          })
          setBlockedDates(dates)
        } else {
          // Initialize with defaults
          setForm({
            trialDuration: DEFAULT_TRIAL_AVAILABILITY.trialDuration,
            bufferTime: DEFAULT_TRIAL_AVAILABILITY.bufferTime,
            maxAdvanceBooking: DEFAULT_TRIAL_AVAILABILITY.maxAdvanceBooking,
            minNoticeHours: DEFAULT_TRIAL_AVAILABILITY.minNoticeHours,
            maxTrialsPerDay: DEFAULT_TRIAL_AVAILABILITY.maxTrialsPerDay,
            bookingLinkExpiryDays: 7,
            slots: [...DEFAULT_TRIAL_AVAILABILITY.slots],
          })
        }
      } catch (err) {
        console.error('Error fetching trial availability:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchTrialAvailability()
  }, [db])

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleSave = async () => {
    try {
      setSaving(true)
      const docRef = doc(db, 'settings', 'trialAvailability')
      
      // Convert date strings to Timestamps
      const blockedDatesTimestamps = blockedDates.map(dateStr => {
        const date = new Date(dateStr)
        date.setHours(0, 0, 0, 0)
        return date
      })
      
      await setDoc(docRef, {
        ...form,
        blockedDates: blockedDatesTimestamps,
        updatedAt: serverTimestamp(),
        updatedBy: userId || 'system',
      })
      
      setTrialAvailability({
        id: 'trialAvailability',
        ...form,
        blockedDates: blockedDatesTimestamps as any,
        updatedAt: new Date() as any,
        updatedBy: userId || 'system',
      })
      
      alert('Trial availability settings saved successfully!')
    } catch (err) {
      console.error('Error saving trial availability:', err)
      alert('Failed to save settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

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

  const handleAddBlockedDate = () => {
    if (!newBlockedDate) return
    if (blockedDates.includes(newBlockedDate)) {
      alert('This date is already blocked')
      return
    }
    setBlockedDates(prev => [...prev, newBlockedDate].sort())
    setNewBlockedDate('')
  }

  const handleRemoveBlockedDate = (date: string) => {
    setBlockedDates(prev => prev.filter(d => d !== date))
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="settings-section">
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

      {loading ? (
        <div className="settings-loading">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="availability-settings">
          {/* General Settings */}
          <Card className="availability-card trial-card">
            <h3>🏥 Trial Settings</h3>
            <div className="trial-duration-notice">
              <span className="duration-badge">4 hours</span>
              <span>Trial shifts are fixed at 4 hours duration</span>
            </div>
            <div className="availability-form-grid">
              <div className="form-group">
                <label>Buffer Time (minutes)</label>
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
                <label>Max Advance Booking (days)</label>
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
                <label>Minimum Notice (hours)</label>
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
                <label>Max Trials Per Day</label>
                <Input
                  type="number"
                  value={form.maxTrialsPerDay}
                  onChange={(e) => setForm(prev => ({
                    ...prev,
                    maxTrialsPerDay: parseInt(e.target.value) || 2
                  }))}
                  min={1}
                  max={10}
                />
                <span className="form-help">Maximum trial shifts per day</span>
              </div>
              <div className="form-group">
                <label>Booking Link Expiry (days)</label>
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

          {/* Weekly Schedule */}
          <Card className="availability-card trial-card">
            <h3>🗓️ Weekly Schedule</h3>
            <p className="card-description">Set which days and times are available for 4-hour trial shifts</p>
            <div className="schedule-grid">
              {form.slots.map(slot => (
                <div
                  key={slot.dayOfWeek}
                  className={`schedule-day ${slot.enabled ? 'enabled' : 'disabled'}`}
                >
                  <div className="day-header">
                    <label className="day-toggle">
                      <input
                        type="checkbox"
                        checked={slot.enabled}
                        onChange={() => handleSlotToggle(slot.dayOfWeek)}
                      />
                      <span className="day-name">{DAY_NAMES[slot.dayOfWeek]}</span>
                    </label>
                  </div>
                  {slot.enabled && (
                    <div className="time-inputs">
                      <Input
                        type="time"
                        value={slot.startTime}
                        onChange={(e) => handleSlotTimeChange(slot.dayOfWeek, 'startTime', e.target.value)}
                      />
                      <span className="time-separator">to</span>
                      <Input
                        type="time"
                        value={slot.endTime}
                        onChange={(e) => handleSlotTimeChange(slot.dayOfWeek, 'endTime', e.target.value)}
                      />
                    </div>
                  )}
                  {slot.enabled && (
                    <div className="trial-slot-info">
                      {(() => {
                        const [startH, startM] = slot.startTime.split(':').map(Number)
                        const [endH, endM] = slot.endTime.split(':').map(Number)
                        const totalMinutes = (endH * 60 + endM) - (startH * 60 + startM)
                        const possibleSlots = Math.floor(totalMinutes / (240 + form.bufferTime))
                        return possibleSlots > 0
                          ? `${possibleSlots} possible trial slot${possibleSlots !== 1 ? 's' : ''}`
                          : 'Not enough time for trials'
                      })()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Blocked Dates */}
          <Card className="availability-card trial-card">
            <h3>🚫 Blocked Dates</h3>
            <p className="card-description">Dates when trials are not available (holidays, etc.)</p>
            <div className="blocked-dates-input">
              <Input
                type="date"
                value={newBlockedDate}
                onChange={(e) => setNewBlockedDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
              <Button variant="secondary" onClick={handleAddBlockedDate}>
                Add Date
              </Button>
            </div>
            {blockedDates.length > 0 && (
              <div className="blocked-dates-list">
                {blockedDates.map(date => (
                  <div key={date} className="blocked-date-item">
                    <span>{new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <button
                      className="remove-date-btn"
                      onClick={() => handleRemoveBlockedDate(date)}
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}

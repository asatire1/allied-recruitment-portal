// ============================================================================
// Interview Availability Tab - Extracted from Settings.tsx
// Configure when candidates can book interviews (30-minute slots)
// Interviews are managed centrally, not per-branch
// ============================================================================

import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import {
  getFirebaseDb,
  DEFAULT_INTERVIEW_AVAILABILITY,
} from '@allied/shared-lib'
import type {
  AvailabilitySlot,
  InterviewAvailabilitySettings
} from '@allied/shared-lib'
import { Card, Button, Input, Spinner } from '@allied/shared-ui'

// ============================================================================
// TYPES
// ============================================================================

interface InterviewAvailabilityTabProps {
  userId?: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// ============================================================================
// COMPONENT
// ============================================================================

export function InterviewAvailabilityTab({ userId }: InterviewAvailabilityTabProps) {
  const db = getFirebaseDb()

  // State
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    slotDuration: 30,
    bufferTime: 15,
    maxAdvanceBooking: 14,
    minNoticeHours: 24,
    bookingLinkExpiryDays: 7,
    slots: [...DEFAULT_INTERVIEW_AVAILABILITY.slots] as AvailabilitySlot[],
  })
  const [blockedDates, setBlockedDates] = useState<string[]>([])
  const [newBlockedDate, setNewBlockedDate] = useState('')

  // ============================================================================
  // FETCH DATA
  // ============================================================================

  useEffect(() => {
    async function fetchInterviewAvailability() {
      try {
        setLoading(true)
        const docRef = doc(db, 'settings', 'interviewAvailability')
        const docSnap = await getDoc(docRef)
        
        if (docSnap.exists()) {
          const data = docSnap.data() as InterviewAvailabilitySettings
          setForm({
            slotDuration: data.slotDuration || 30,
            bufferTime: data.bufferTime || 15,
            maxAdvanceBooking: data.maxAdvanceBooking || 14,
            minNoticeHours: data.minNoticeHours || 24,
            bookingLinkExpiryDays: (data as any).bookingLinkExpiryDays || 7,
            slots: data.slots || [...DEFAULT_INTERVIEW_AVAILABILITY.slots],
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
            slotDuration: DEFAULT_INTERVIEW_AVAILABILITY.slotDuration,
            bufferTime: DEFAULT_INTERVIEW_AVAILABILITY.bufferTime,
            maxAdvanceBooking: DEFAULT_INTERVIEW_AVAILABILITY.maxAdvanceBooking,
            minNoticeHours: DEFAULT_INTERVIEW_AVAILABILITY.minNoticeHours,
            bookingLinkExpiryDays: 7,
            slots: [...DEFAULT_INTERVIEW_AVAILABILITY.slots],
          })
        }
      } catch (err) {
        console.error('Error fetching interview availability:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchInterviewAvailability()
  }, [db])

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleSave = async () => {
    try {
      setSaving(true)
      const docRef = doc(db, 'settings', 'interviewAvailability')
      
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
      
      alert('Interview availability settings saved successfully!')
    } catch (err) {
      console.error('Error saving interview availability:', err)
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
          <h2>Interview Availability</h2>
          <p>Configure when candidates can book interviews (managed centrally)</p>
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
          <Card className="availability-card">
            <h3>📅 General Settings</h3>
            <div className="availability-form-grid">
              <div className="form-group">
                <label>Slot Duration (minutes)</label>
                <Input
                  type="number"
                  value={form.slotDuration}
                  onChange={(e) => setForm(prev => ({
                    ...prev,
                    slotDuration: parseInt(e.target.value) || 30
                  }))}
                  min={15}
                  max={120}
                />
                <span className="form-help">Length of each interview slot</span>
              </div>
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
                  max={60}
                />
                <span className="form-help">Gap between interviews</span>
              </div>
              <div className="form-group">
                <label>Max Advance Booking (days)</label>
                <Input
                  type="number"
                  value={form.maxAdvanceBooking}
                  onChange={(e) => setForm(prev => ({
                    ...prev,
                    maxAdvanceBooking: parseInt(e.target.value) || 14
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
                    minNoticeHours: parseInt(e.target.value) || 24
                  }))}
                  min={1}
                  max={168}
                />
                <span className="form-help">Minimum hours notice required</span>
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
                <span className="form-help">How long interview booking links remain valid</span>
              </div>
            </div>
          </Card>

          {/* Weekly Schedule */}
          <Card className="availability-card">
            <h3>🗓️ Weekly Schedule</h3>
            <p className="card-description">Set which days and times are available for interviews</p>
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
                </div>
              ))}
            </div>
          </Card>

          {/* Blocked Dates */}
          <Card className="availability-card">
            <h3>🚫 Blocked Dates</h3>
            <p className="card-description">Dates when interviews are not available (holidays, etc.)</p>
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

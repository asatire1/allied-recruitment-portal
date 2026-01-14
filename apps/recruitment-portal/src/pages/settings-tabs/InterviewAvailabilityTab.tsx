// ============================================================================
// Interview Availability Tab - Extracted from Settings.tsx
// Configure when candidates can book interviews (30-minute slots)
// Interviews are managed centrally, not per-branch
// Now supports multiple interview slots for parallel bookings
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
import { Card, Button, Input, Spinner, Modal } from '@allied/shared-ui'

// ============================================================================
// TYPES
// ============================================================================

interface InterviewAvailabilityTabProps {
  userId?: string
}

// Interview slot - allows multiple parallel bookings at same time
interface InterviewSlot {
  id: string
  name: string
  startTime: string    // e.g., "09:00"
  endTime: string      // e.g., "17:00"
  enabledDays: number[] // 0=Sun, 1=Mon, etc.
  active: boolean
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const SHORT_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Default interview slot
const DEFAULT_INTERVIEW_SLOT: InterviewSlot = {
  id: 'slot-1',
  name: 'Interview Slot 1',
  startTime: '09:00',
  endTime: '17:00',
  enabledDays: [1, 2, 3, 4, 5], // Mon-Fri
  active: true,
}

// Generate unique ID
const generateSlotId = () => `slot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

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

  // Interview slots state (for parallel bookings)
  const [interviewSlots, setInterviewSlots] = useState<InterviewSlot[]>([DEFAULT_INTERVIEW_SLOT])
  const [editingSlot, setEditingSlot] = useState<InterviewSlot | null>(null)
  const [showSlotModal, setShowSlotModal] = useState(false)

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
          const data = docSnap.data() as InterviewAvailabilitySettings & { interviewSlots?: InterviewSlot[] }
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
          // Load interview slots (for parallel bookings)
          if (data.interviewSlots && data.interviewSlots.length > 0) {
            setInterviewSlots(data.interviewSlots)
          }
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
        interviewSlots: interviewSlots,
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

  // Interview Slots Handlers
  const handleAddSlot = () => {
    const newSlot: InterviewSlot = {
      id: generateSlotId(),
      name: `Interview Slot ${interviewSlots.length + 1}`,
      startTime: '09:00',
      endTime: '17:00',
      enabledDays: [1, 2, 3, 4, 5],
      active: true,
    }
    setEditingSlot(newSlot)
    setShowSlotModal(true)
  }

  const handleEditSlot = (slot: InterviewSlot) => {
    setEditingSlot({ ...slot })
    setShowSlotModal(true)
  }

  const handleSaveSlot = () => {
    if (!editingSlot) return

    // Validate
    if (!editingSlot.name.trim()) {
      alert('Please enter a slot name')
      return
    }
    if (editingSlot.enabledDays.length === 0) {
      alert('Please select at least one day')
      return
    }
    if (editingSlot.startTime >= editingSlot.endTime) {
      alert('End time must be after start time')
      return
    }

    setInterviewSlots(prev => {
      const existingIndex = prev.findIndex(s => s.id === editingSlot.id)
      if (existingIndex >= 0) {
        // Update existing
        const updated = [...prev]
        updated[existingIndex] = editingSlot
        return updated
      } else {
        // Add new
        return [...prev, editingSlot]
      }
    })
    setShowSlotModal(false)
    setEditingSlot(null)
  }

  const handleDeleteSlot = (slotId: string) => {
    if (interviewSlots.length <= 1) {
      alert('You must have at least one interview slot')
      return
    }
    if (confirm('Are you sure you want to delete this slot?')) {
      setInterviewSlots(prev => prev.filter(s => s.id !== slotId))
    }
  }

  const handleToggleSlotActive = (slotId: string) => {
    setInterviewSlots(prev =>
      prev.map(s => s.id === slotId ? { ...s, active: !s.active } : s)
    )
  }

  const handleToggleSlotDay = (day: number) => {
    if (!editingSlot) return
    setEditingSlot(prev => {
      if (!prev) return prev
      const enabledDays = prev.enabledDays.includes(day)
        ? prev.enabledDays.filter(d => d !== day)
        : [...prev.enabledDays, day].sort()
      return { ...prev, enabledDays }
    })
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

          {/* Interview Slots - For Parallel Bookings */}
          <Card className="availability-card">
            <div className="card-header-with-action">
              <div>
                <h3>👥 Interview Slots</h3>
                <p className="card-description">
                  Create multiple slots to allow parallel interview bookings at the same time.
                  Each slot represents one interviewer or room that can be booked.
                </p>
              </div>
              <Button variant="secondary" onClick={handleAddSlot}>
                + Add Slot
              </Button>
            </div>

            <div className="interview-slots-list">
              {interviewSlots.map(slot => (
                <div
                  key={slot.id}
                  className={`interview-slot-item ${slot.active ? 'active' : 'inactive'}`}
                >
                  <div className="slot-info">
                    <div className="slot-header">
                      <span className="slot-name">{slot.name}</span>
                      <span className={`slot-status ${slot.active ? 'active' : 'inactive'}`}>
                        {slot.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="slot-details">
                      <span className="slot-time">{slot.startTime} - {slot.endTime}</span>
                      <span className="slot-days">
                        {slot.enabledDays.map(d => SHORT_DAY_NAMES[d]).join(', ')}
                      </span>
                    </div>
                  </div>
                  <div className="slot-actions">
                    <button
                      className="slot-action-btn"
                      onClick={() => handleToggleSlotActive(slot.id)}
                      title={slot.active ? 'Deactivate' : 'Activate'}
                    >
                      {slot.active ? '⏸️' : '▶️'}
                    </button>
                    <button
                      className="slot-action-btn"
                      onClick={() => handleEditSlot(slot)}
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      className="slot-action-btn delete"
                      onClick={() => handleDeleteSlot(slot.id)}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {interviewSlots.length === 0 && (
              <div className="empty-slots-message">
                No interview slots configured. Add a slot to enable interview bookings.
              </div>
            )}

            <div className="slots-summary">
              <strong>Capacity:</strong> Up to {interviewSlots.filter(s => s.active).length} parallel
              interview{interviewSlots.filter(s => s.active).length !== 1 ? 's' : ''} at the same time
            </div>
          </Card>

          {/* Legacy Weekly Schedule - Hidden by default, shown for backward compatibility */}
          <Card className="availability-card collapsed-card">
            <details>
              <summary className="legacy-schedule-header">
                <h3>🗓️ Default Weekly Schedule (Legacy)</h3>
                <span className="legacy-hint">Used as fallback if no slots match</span>
              </summary>
              <p className="card-description">Set default days and times - overridden by Interview Slots above</p>
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
            </details>
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

      {/* Edit Slot Modal */}
      {showSlotModal && editingSlot && (
        <Modal
          isOpen={showSlotModal}
          onClose={() => {
            setShowSlotModal(false)
            setEditingSlot(null)
          }}
          title={editingSlot.id.startsWith('slot-1') && !interviewSlots.find(s => s.id === editingSlot.id)
            ? 'Add Interview Slot'
            : 'Edit Interview Slot'}
        >
          <div className="slot-modal-content">
            <div className="form-group">
              <label>Slot Name</label>
              <Input
                type="text"
                value={editingSlot.name}
                onChange={(e) => setEditingSlot(prev => prev ? { ...prev, name: e.target.value } : prev)}
                placeholder="e.g., Room 1, Morning Interviewer"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Start Time</label>
                <Input
                  type="time"
                  value={editingSlot.startTime}
                  onChange={(e) => setEditingSlot(prev => prev ? { ...prev, startTime: e.target.value } : prev)}
                />
              </div>
              <div className="form-group">
                <label>End Time</label>
                <Input
                  type="time"
                  value={editingSlot.endTime}
                  onChange={(e) => setEditingSlot(prev => prev ? { ...prev, endTime: e.target.value } : prev)}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Available Days</label>
              <div className="days-selector">
                {DAY_NAMES.map((day, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`day-btn ${editingSlot.enabledDays.includes(index) ? 'selected' : ''}`}
                    onClick={() => handleToggleSlotDay(index)}
                  >
                    {SHORT_DAY_NAMES[index]}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={editingSlot.active}
                  onChange={(e) => setEditingSlot(prev => prev ? { ...prev, active: e.target.checked } : prev)}
                />
                Slot is active (available for bookings)
              </label>
            </div>

            <div className="modal-actions">
              <Button variant="secondary" onClick={() => {
                setShowSlotModal(false)
                setEditingSlot(null)
              }}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSaveSlot}>
                Save Slot
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

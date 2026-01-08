import { useEffect, useState } from 'react'
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import {
  getFirebaseDb,
  DEFAULT_INTERVIEW_AVAILABILITY,
  DEFAULT_TRIAL_AVAILABILITY,
} from '@allied/shared-lib'
import type {
  AvailabilitySlot,
  InterviewAvailabilitySettings,
  TrialAvailabilitySettings
} from '@allied/shared-lib'
import { Card, Button, Input, Spinner, Modal, Select, Textarea } from '@allied/shared-ui'
import { useAuth } from '../contexts/AuthContext'
import { BookingBlocksSettings } from '../components/BookingBlocksSettings'
import { WhatsAppTemplatesTab, EntitiesTab, JobTitlesTab } from './settings-tabs'
import './Settings.css'

// ============================================================================
// TYPES
// ============================================================================

interface Location {
  id: string
  name: string
  address?: string
  city?: string
  postcode?: string
  region?: string
  isActive: boolean
  createdAt: any
  createdBy: string
}

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
  { id: 'whatsapp-templates', label: 'WhatsApp Templates', icon: '💬' },
  { id: 'general', label: 'General', icon: '⚙️' },
]

const UK_REGIONS = [
  'London',
  'South East',
  'South West',
  'East of England',
  'West Midlands',
  'East Midlands',
  'Yorkshire',
  'North West',
  'North East',
  'Wales',
  'Scotland',
  'Northern Ireland',
]

// ============================================================================
// COMPONENT
// ============================================================================

export function Settings() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('entities')
  
  // Locations state
  const [locations, setLocations] = useState<Location[]>([])
  const [loadingLocations, setLoadingLocations] = useState(true)
  const [savingLocation, setSavingLocation] = useState(false)
  const [showLocationModal, setShowLocationModal] = useState(false)
  const [editingLocation, setEditingLocation] = useState<Location | null>(null)
  const [locationForm, setLocationForm] = useState({ name: '', address: '', city: '', postcode: '', region: '' })
  const [locationFormError, setLocationFormError] = useState('')
  const [showDeleteLocationModal, setShowDeleteLocationModal] = useState(false)
  const [deletingLocation, setDeletingLocation] = useState<Location | null>(null)
  const [deletingLocationLoading, setDeletingLocationLoading] = useState(false)
  const [locationSearch, setLocationSearch] = useState('')

  // Interview Availability state
  const [interviewAvailability, setInterviewAvailability] = useState<InterviewAvailabilitySettings | null>(null)
  const [loadingInterviewAvailability, setLoadingInterviewAvailability] = useState(true)
  const [savingInterviewAvailability, setSavingInterviewAvailability] = useState(false)
  const [interviewAvailabilityForm, setInterviewAvailabilityForm] = useState({
    slotDuration: 30,
    bufferTime: 15,
    maxAdvanceBooking: 14,
    minNoticeHours: 24,
    slots: [...DEFAULT_INTERVIEW_AVAILABILITY.slots] as AvailabilitySlot[],
  })
  const [interviewBlockedDates, setInterviewBlockedDates] = useState<string[]>([])
  const [newInterviewBlockedDate, setNewInterviewBlockedDate] = useState('')

  // Trial Availability state
  const [trialAvailability, setTrialAvailability] = useState<TrialAvailabilitySettings | null>(null)
  const [loadingTrialAvailability, setLoadingTrialAvailability] = useState(true)
  const [savingTrialAvailability, setSavingTrialAvailability] = useState(false)
  const [trialAvailabilityForm, setTrialAvailabilityForm] = useState({
    trialDuration: 240, // Fixed 4 hours
    bufferTime: 30,
    maxAdvanceBooking: 21,
    minNoticeHours: 48,
    maxTrialsPerDay: 2,
    slots: [...DEFAULT_TRIAL_AVAILABILITY.slots] as AvailabilitySlot[],
  })
  const [trialBlockedDates, setTrialBlockedDates] = useState<string[]>([])
  const [newTrialBlockedDate, setNewTrialBlockedDate] = useState('')

  const db = getFirebaseDb()

  // ============================================================================
  // FETCH DATA
  // ============================================================================

  // Fetch locations
  useEffect(() => {
    async function fetchLocations() {
      try {
        setLoadingLocations(true)
        const locationsRef = collection(db, 'locations')
        const snapshot = await getDocs(locationsRef)
        
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Location[]
        
        data.sort((a, b) => a.name.localeCompare(b.name))
        setLocations(data)
      } catch (err) {
        console.error('Error fetching locations:', err)
      } finally {
        setLoadingLocations(false)
      }
    }

    fetchLocations()
  }, [db])

  // Fetch interview availability settings
  useEffect(() => {
    async function fetchInterviewAvailability() {
      try {
        setLoadingInterviewAvailability(true)
        const docRef = doc(db, 'settings', 'interviewAvailability')
        const docSnap = await getDoc(docRef)
        
        if (docSnap.exists()) {
          const data = docSnap.data() as InterviewAvailabilitySettings
          setInterviewAvailability({ ...data, id: docSnap.id })
          setInterviewAvailabilityForm({
            slotDuration: data.slotDuration || 30,
            bufferTime: data.bufferTime || 15,
            maxAdvanceBooking: data.maxAdvanceBooking || 14,
            minNoticeHours: data.minNoticeHours || 24,
            slots: data.slots || [...DEFAULT_INTERVIEW_AVAILABILITY.slots],
          })
          // Convert timestamps to date strings
          const blockedDates = (data.blockedDates || []).map((d: any) => {
            const date = d.toDate ? d.toDate() : new Date(d)
            return date.toISOString().split('T')[0]
          })
          setInterviewBlockedDates(blockedDates)
        } else {
          // Initialize with defaults
          setInterviewAvailabilityForm({
            slotDuration: DEFAULT_INTERVIEW_AVAILABILITY.slotDuration,
            bufferTime: DEFAULT_INTERVIEW_AVAILABILITY.bufferTime,
            maxAdvanceBooking: DEFAULT_INTERVIEW_AVAILABILITY.maxAdvanceBooking,
            minNoticeHours: DEFAULT_INTERVIEW_AVAILABILITY.minNoticeHours,
            slots: [...DEFAULT_INTERVIEW_AVAILABILITY.slots],
          })
        }
      } catch (err) {
        console.error('Error fetching interview availability:', err)
      } finally {
        setLoadingInterviewAvailability(false)
      }
    }

    fetchInterviewAvailability()
  }, [db])

  // Fetch trial availability settings
  useEffect(() => {
    async function fetchTrialAvailability() {
      try {
        setLoadingTrialAvailability(true)
        const docRef = doc(db, 'settings', 'trialAvailability')
        const docSnap = await getDoc(docRef)
        
        if (docSnap.exists()) {
          const data = docSnap.data() as TrialAvailabilitySettings
          setTrialAvailability({ ...data, id: docSnap.id })
          setTrialAvailabilityForm({
            trialDuration: data.trialDuration || 240,
            bufferTime: data.bufferTime || 30,
            maxAdvanceBooking: data.maxAdvanceBooking || 21,
            minNoticeHours: data.minNoticeHours || 48,
            maxTrialsPerDay: data.maxTrialsPerDay || 2,
            slots: data.slots || [...DEFAULT_TRIAL_AVAILABILITY.slots],
          })
          // Convert timestamps to date strings
          const blockedDates = (data.blockedDates || []).map((d: any) => {
            const date = d.toDate ? d.toDate() : new Date(d)
            return date.toISOString().split('T')[0]
          })
          setTrialBlockedDates(blockedDates)
        } else {
          // Initialize with defaults
          setTrialAvailabilityForm({
            trialDuration: DEFAULT_TRIAL_AVAILABILITY.trialDuration,
            bufferTime: DEFAULT_TRIAL_AVAILABILITY.bufferTime,
            maxAdvanceBooking: DEFAULT_TRIAL_AVAILABILITY.maxAdvanceBooking,
            minNoticeHours: DEFAULT_TRIAL_AVAILABILITY.minNoticeHours,
            maxTrialsPerDay: DEFAULT_TRIAL_AVAILABILITY.maxTrialsPerDay,
            slots: [...DEFAULT_TRIAL_AVAILABILITY.slots],
          })
        }
      } catch (err) {
        console.error('Error fetching trial availability:', err)
      } finally {
        setLoadingTrialAvailability(false)
      }
    }

    fetchTrialAvailability()
  }, [db])

  // ============================================================================
  // LOCATIONS HANDLERS
  // ============================================================================

  const handleAddLocation = () => {
    setEditingLocation(null)
    setLocationForm({ name: '', address: '', city: '', postcode: '', region: '' })
    setLocationFormError('')
    setShowLocationModal(true)
  }

  const handleEditLocation = (location: Location) => {
    setEditingLocation(location)
    setLocationForm({
      name: location.name,
      address: location.address || '',
      city: location.city || '',
      postcode: location.postcode || '',
      region: location.region || ''
    })
    setLocationFormError('')
    setShowLocationModal(true)
  }

  const handleSaveLocation = async () => {
    if (!locationForm.name.trim()) {
      setLocationFormError('Location name is required')
      return
    }

    // Check for duplicates
    const duplicate = locations.find(
      loc => loc.name.toLowerCase() === locationForm.name.trim().toLowerCase() &&
             loc.id !== editingLocation?.id
    )
    if (duplicate) {
      setLocationFormError('A location with this name already exists')
      return
    }

    try {
      setSavingLocation(true)
      const locationsRef = collection(db, 'locations')

      if (editingLocation) {
        await updateDoc(doc(db, 'locations', editingLocation.id), {
          name: locationForm.name.trim(),
          address: locationForm.address.trim(),
          city: locationForm.city.trim(),
          postcode: locationForm.postcode.trim().toUpperCase(),
          region: locationForm.region,
          updatedAt: serverTimestamp(),
        })
        setLocations(prev => prev.map(loc =>
          loc.id === editingLocation.id
            ? {
                ...loc,
                name: locationForm.name.trim(),
                address: locationForm.address.trim(),
                city: locationForm.city.trim(),
                postcode: locationForm.postcode.trim().toUpperCase(),
                region: locationForm.region
              }
            : loc
        ))
      } else {
        const docRef = await addDoc(locationsRef, {
          name: locationForm.name.trim(),
          address: locationForm.address.trim(),
          city: locationForm.city.trim(),
          postcode: locationForm.postcode.trim().toUpperCase(),
          region: locationForm.region,
          isActive: true,
          createdAt: serverTimestamp(),
          createdBy: user?.id || 'system',
        })
        setLocations(prev => [...prev, {
          id: docRef.id,
          name: locationForm.name.trim(),
          address: locationForm.address.trim(),
          city: locationForm.city.trim(),
          postcode: locationForm.postcode.trim().toUpperCase(),
          region: locationForm.region,
          isActive: true,
          createdAt: new Date(),
          createdBy: user?.id || 'system',
        }].sort((a, b) => a.name.localeCompare(b.name)))
      }

      setShowLocationModal(false)
    } catch (err) {
      console.error('Error saving location:', err)
      setLocationFormError('Failed to save. Please try again.')
    } finally {
      setSavingLocation(false)
    }
  }

  const handleToggleLocationActive = async (location: Location) => {
    try {
      await updateDoc(doc(db, 'locations', location.id), {
        isActive: !location.isActive,
        updatedAt: serverTimestamp(),
      })
      setLocations(prev => prev.map(loc =>
        loc.id === location.id ? { ...loc, isActive: !loc.isActive } : loc
      ))
    } catch (err) {
      console.error('Error toggling location:', err)
    }
  }

  const handleConfirmDeleteLocation = (location: Location) => {
    setDeletingLocation(location)
    setShowDeleteLocationModal(true)
  }

  const handleDeleteLocation = async () => {
    if (!deletingLocation) return

    try {
      setDeletingLocationLoading(true)
      await deleteDoc(doc(db, 'locations', deletingLocation.id))
      setLocations(prev => prev.filter(loc => loc.id !== deletingLocation.id))
      setShowDeleteLocationModal(false)
      setDeletingLocation(null)
    } catch (err) {
      console.error('Error deleting location:', err)
    } finally {
      setDeletingLocationLoading(false)
    }
  }

  // ============================================================================
  // INTERVIEW AVAILABILITY HANDLERS
  // ============================================================================

  const handleSaveInterviewAvailability = async () => {
    try {
      setSavingInterviewAvailability(true)
      const docRef = doc(db, 'settings', 'interviewAvailability')
      
      // Convert date strings to Timestamps
      const blockedDatesTimestamps = interviewBlockedDates.map(dateStr => {
        const date = new Date(dateStr)
        date.setHours(0, 0, 0, 0)
        return date
      })
      
      await setDoc(docRef, {
        ...interviewAvailabilityForm,
        blockedDates: blockedDatesTimestamps,
        updatedAt: serverTimestamp(),
        updatedBy: user?.id || 'system',
      })
      
      setInterviewAvailability({
        id: 'interviewAvailability',
        ...interviewAvailabilityForm,
        blockedDates: blockedDatesTimestamps as any,
        updatedAt: new Date() as any,
        updatedBy: user?.id || 'system',
      })
      
      alert('Interview availability settings saved successfully!')
    } catch (err) {
      console.error('Error saving interview availability:', err)
      alert('Failed to save settings. Please try again.')
    } finally {
      setSavingInterviewAvailability(false)
    }
  }

  const handleInterviewSlotToggle = (dayOfWeek: number) => {
    setInterviewAvailabilityForm(prev => ({
      ...prev,
      slots: prev.slots.map(slot =>
        slot.dayOfWeek === dayOfWeek
          ? { ...slot, enabled: !slot.enabled }
          : slot
      ),
    }))
  }

  const handleInterviewSlotTimeChange = (dayOfWeek: number, field: 'startTime' | 'endTime', value: string) => {
    setInterviewAvailabilityForm(prev => ({
      ...prev,
      slots: prev.slots.map(slot =>
        slot.dayOfWeek === dayOfWeek
          ? { ...slot, [field]: value }
          : slot
      ),
    }))
  }

  const handleAddInterviewBlockedDate = () => {
    if (!newInterviewBlockedDate) return
    if (interviewBlockedDates.includes(newInterviewBlockedDate)) {
      alert('This date is already blocked')
      return
    }
    setInterviewBlockedDates(prev => [...prev, newInterviewBlockedDate].sort())
    setNewInterviewBlockedDate('')
  }

  const handleRemoveInterviewBlockedDate = (date: string) => {
    setInterviewBlockedDates(prev => prev.filter(d => d !== date))
  }

  // ============================================================================
  // TRIAL AVAILABILITY HANDLERS
  // ============================================================================

  const handleSaveTrialAvailability = async () => {
    try {
      setSavingTrialAvailability(true)
      const docRef = doc(db, 'settings', 'trialAvailability')
      
      // Convert date strings to Timestamps
      const blockedDatesTimestamps = trialBlockedDates.map(dateStr => {
        const date = new Date(dateStr)
        date.setHours(0, 0, 0, 0)
        return date
      })
      
      await setDoc(docRef, {
        ...trialAvailabilityForm,
        blockedDates: blockedDatesTimestamps,
        updatedAt: serverTimestamp(),
        updatedBy: user?.id || 'system',
      })
      
      setTrialAvailability({
        id: 'trialAvailability',
        ...trialAvailabilityForm,
        blockedDates: blockedDatesTimestamps as any,
        updatedAt: new Date() as any,
        updatedBy: user?.id || 'system',
      })
      
      alert('Trial availability settings saved successfully!')
    } catch (err) {
      console.error('Error saving trial availability:', err)
      alert('Failed to save settings. Please try again.')
    } finally {
      setSavingTrialAvailability(false)
    }
  }

  const handleTrialSlotToggle = (dayOfWeek: number) => {
    setTrialAvailabilityForm(prev => ({
      ...prev,
      slots: prev.slots.map(slot =>
        slot.dayOfWeek === dayOfWeek
          ? { ...slot, enabled: !slot.enabled }
          : slot
      ),
    }))
  }

  const handleTrialSlotTimeChange = (dayOfWeek: number, field: 'startTime' | 'endTime', value: string) => {
    setTrialAvailabilityForm(prev => ({
      ...prev,
      slots: prev.slots.map(slot =>
        slot.dayOfWeek === dayOfWeek
          ? { ...slot, [field]: value }
          : slot
      ),
    }))
  }

  const handleAddTrialBlockedDate = () => {
    if (!newTrialBlockedDate) return
    if (trialBlockedDates.includes(newTrialBlockedDate)) {
      alert('This date is already blocked')
      return
    }
    setTrialBlockedDates(prev => [...prev, newTrialBlockedDate].sort())
    setNewTrialBlockedDate('')
  }

  const handleRemoveTrialBlockedDate = (date: string) => {
    setTrialBlockedDates(prev => prev.filter(d => d !== date))
  }

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  // Filter locations by search
  const filteredLocations = locations.filter(loc => {
    if (!locationSearch) return true
    const search = locationSearch.toLowerCase()
    return loc.name.toLowerCase().includes(search) ||
           loc.city?.toLowerCase().includes(search) ||
           loc.postcode?.toLowerCase().includes(search) ||
           loc.region?.toLowerCase().includes(search)
  })

  // Day names for availability display
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  // ============================================================================
  // RENDER TABS
  // ============================================================================

  const renderBookingBlocksTab = () => (
    <div className="settings-section">
      <BookingBlocksSettings />
    </div>
  )

  const renderInterviewAvailabilityTab = () => (
    <div className="settings-section">
      <div className="settings-section-header">
        <div>
          <h2>Interview Availability</h2>
          <p>Configure when candidates can book interviews (typically 30-minute slots)</p>
        </div>
        <Button
          variant="primary"
          onClick={handleSaveInterviewAvailability}
          disabled={savingInterviewAvailability}
        >
          {savingInterviewAvailability ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      {loadingInterviewAvailability ? (
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
                  value={interviewAvailabilityForm.slotDuration}
                  onChange={(e) => setInterviewAvailabilityForm(prev => ({
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
                  value={interviewAvailabilityForm.bufferTime}
                  onChange={(e) => setInterviewAvailabilityForm(prev => ({
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
                  value={interviewAvailabilityForm.maxAdvanceBooking}
                  onChange={(e) => setInterviewAvailabilityForm(prev => ({
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
                  value={interviewAvailabilityForm.minNoticeHours}
                  onChange={(e) => setInterviewAvailabilityForm(prev => ({
                    ...prev,
                    minNoticeHours: parseInt(e.target.value) || 24
                  }))}
                  min={1}
                  max={168}
                />
                <span className="form-help">Minimum hours notice required</span>
              </div>
            </div>
          </Card>

          {/* Weekly Schedule */}
          <Card className="availability-card">
            <h3>🗓️ Weekly Schedule</h3>
            <p className="card-description">Set which days and times are available for interviews</p>
            <div className="schedule-grid">
              {interviewAvailabilityForm.slots.map(slot => (
                <div
                  key={slot.dayOfWeek}
                  className={`schedule-day ${slot.enabled ? 'enabled' : 'disabled'}`}
                >
                  <div className="day-header">
                    <label className="day-toggle">
                      <input
                        type="checkbox"
                        checked={slot.enabled}
                        onChange={() => handleInterviewSlotToggle(slot.dayOfWeek)}
                      />
                      <span className="day-name">{DAY_NAMES[slot.dayOfWeek]}</span>
                    </label>
                  </div>
                  {slot.enabled && (
                    <div className="time-inputs">
                      <Input
                        type="time"
                        value={slot.startTime}
                        onChange={(e) => handleInterviewSlotTimeChange(slot.dayOfWeek, 'startTime', e.target.value)}
                      />
                      <span className="time-separator">to</span>
                      <Input
                        type="time"
                        value={slot.endTime}
                        onChange={(e) => handleInterviewSlotTimeChange(slot.dayOfWeek, 'endTime', e.target.value)}
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
                value={newInterviewBlockedDate}
                onChange={(e) => setNewInterviewBlockedDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
              <Button variant="secondary" onClick={handleAddInterviewBlockedDate}>
                Add Date
              </Button>
            </div>
            {interviewBlockedDates.length > 0 && (
              <div className="blocked-dates-list">
                {interviewBlockedDates.map(date => (
                  <div key={date} className="blocked-date-item">
                    <span>{new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <button
                      className="remove-date-btn"
                      onClick={() => handleRemoveInterviewBlockedDate(date)}
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

  const renderTrialAvailabilityTab = () => (
    <div className="settings-section">
      <div className="settings-section-header">
        <div>
          <h2>Trial Availability</h2>
          <p>Configure when candidates can book trial shifts (4-hour blocks)</p>
        </div>
        <Button
          variant="primary"
          onClick={handleSaveTrialAvailability}
          disabled={savingTrialAvailability}
        >
          {savingTrialAvailability ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      {loadingTrialAvailability ? (
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
                  value={trialAvailabilityForm.bufferTime}
                  onChange={(e) => setTrialAvailabilityForm(prev => ({
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
                  value={trialAvailabilityForm.maxAdvanceBooking}
                  onChange={(e) => setTrialAvailabilityForm(prev => ({
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
                  value={trialAvailabilityForm.minNoticeHours}
                  onChange={(e) => setTrialAvailabilityForm(prev => ({
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
                  value={trialAvailabilityForm.maxTrialsPerDay}
                  onChange={(e) => setTrialAvailabilityForm(prev => ({
                    ...prev,
                    maxTrialsPerDay: parseInt(e.target.value) || 2
                  }))}
                  min={1}
                  max={10}
                />
                <span className="form-help">Maximum trial shifts per day</span>
              </div>
            </div>
          </Card>

          {/* Weekly Schedule */}
          <Card className="availability-card trial-card">
            <h3>🗓️ Weekly Schedule</h3>
            <p className="card-description">Set which days and times are available for 4-hour trial shifts</p>
            <div className="schedule-grid">
              {trialAvailabilityForm.slots.map(slot => (
                <div
                  key={slot.dayOfWeek}
                  className={`schedule-day ${slot.enabled ? 'enabled' : 'disabled'}`}
                >
                  <div className="day-header">
                    <label className="day-toggle">
                      <input
                        type="checkbox"
                        checked={slot.enabled}
                        onChange={() => handleTrialSlotToggle(slot.dayOfWeek)}
                      />
                      <span className="day-name">{DAY_NAMES[slot.dayOfWeek]}</span>
                    </label>
                  </div>
                  {slot.enabled && (
                    <div className="time-inputs">
                      <Input
                        type="time"
                        value={slot.startTime}
                        onChange={(e) => handleTrialSlotTimeChange(slot.dayOfWeek, 'startTime', e.target.value)}
                      />
                      <span className="time-separator">to</span>
                      <Input
                        type="time"
                        value={slot.endTime}
                        onChange={(e) => handleTrialSlotTimeChange(slot.dayOfWeek, 'endTime', e.target.value)}
                      />
                    </div>
                  )}
                  {slot.enabled && (
                    <div className="trial-slot-info">
                      {(() => {
                        const [startH, startM] = slot.startTime.split(':').map(Number)
                        const [endH, endM] = slot.endTime.split(':').map(Number)
                        const totalMinutes = (endH * 60 + endM) - (startH * 60 + startM)
                        const possibleSlots = Math.floor(totalMinutes / (240 + trialAvailabilityForm.bufferTime))
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
                value={newTrialBlockedDate}
                onChange={(e) => setNewTrialBlockedDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
              <Button variant="secondary" onClick={handleAddTrialBlockedDate}>
                Add Date
              </Button>
            </div>
            {trialBlockedDates.length > 0 && (
              <div className="blocked-dates-list">
                {trialBlockedDates.map(date => (
                  <div key={date} className="blocked-date-item">
                    <span>{new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <button
                      className="remove-date-btn"
                      onClick={() => handleRemoveTrialBlockedDate(date)}
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

  const renderLocationsTab = () => (
    <div className="settings-section">
      <div className="settings-section-header">
        <div>
          <h2>Locations</h2>
          <p>Manage pharmacy branch locations for candidate assignments</p>
        </div>
        <Button variant="primary" onClick={handleAddLocation}>
          + Add Location
        </Button>
      </div>

      {loadingLocations ? (
        <div className="settings-loading">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          {/* Search */}
          {locations.length > 5 && (
            <div className="locations-search">
              <Input
                placeholder="Search locations..."
                value={locationSearch}
                onChange={(e) => setLocationSearch(e.target.value)}
              />
            </div>
          )}

          {/* Locations list */}
          <div className="locations-list">
            {filteredLocations.length === 0 ? (
              <Card className="empty-locations">
                <p>{locations.length === 0 ? 'No locations added yet. Add your first location.' : 'No locations match your search.'}</p>
              </Card>
            ) : (
              filteredLocations.map(location => (
                <Card key={location.id} className={`location-card ${!location.isActive ? 'inactive' : ''}`}>
                  <div className="location-info">
                    <div className="location-name">
                      <span className="location-icon">📍</span>
                      {location.name}
                      {!location.isActive && <span className="inactive-badge">Inactive</span>}
                    </div>
                    {(location.address || location.city || location.postcode) && (
                      <div className="location-address">
                        {[location.address, location.city, location.postcode].filter(Boolean).join(', ')}
                      </div>
                    )}
                    {location.region && (
                      <div className="location-region">{location.region}</div>
                    )}
                  </div>
                  <div className="location-actions">
                    <button
                      className={`toggle-btn ${location.isActive ? 'active' : ''}`}
                      onClick={() => handleToggleLocationActive(location)}
                      title={location.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {location.isActive ? '✓' : '○'}
                    </button>
                    <button
                      className="edit-btn"
                      onClick={() => handleEditLocation(location)}
                      title="Edit"
                    >
                      ✎
                    </button>
                    <button
                      className="delete-btn"
                      onClick={() => handleConfirmDeleteLocation(location)}
                      title="Delete"
                    >
                      ×
                    </button>
                  </div>
                </Card>
              ))
            )}
          </div>

          {/* Summary */}
          {locations.length > 0 && (
            <div className="locations-summary">
              {locations.length} location{locations.length !== 1 ? 's' : ''} • {locations.filter(l => l.isActive).length} active
            </div>
          )}
        </>
      )}
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
          {activeTab === 'interview-availability' && renderInterviewAvailabilityTab()}
          {activeTab === 'trial-availability' && renderTrialAvailabilityTab()}
          {activeTab === 'booking-blocks' && renderBookingBlocksTab()}
          {activeTab === 'whatsapp-templates' && <WhatsAppTemplatesTab userId={user?.id} />}
          {activeTab === 'locations' && renderLocationsTab()}
          {activeTab === 'general' && renderGeneralTab()}
        </div>
      </div>

      {/* Add/Edit Location Modal */}
      <Modal
        isOpen={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        title={editingLocation ? 'Edit Location' : 'Add Location'}
        size="md"
      >
        <div className="location-form">
          <div className="form-group">
            <label>Location Name *</label>
            <Input
              value={locationForm.name}
              onChange={(e) => {
                setLocationForm(prev => ({ ...prev, name: e.target.value }))
                setLocationFormError('')
              }}
              placeholder="e.g., Allied Pharmacy Croydon"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Address</label>
            <Input
              value={locationForm.address}
              onChange={(e) => setLocationForm(prev => ({ ...prev, address: e.target.value }))}
              placeholder="e.g., 123 High Street"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>City</label>
              <Input
                value={locationForm.city}
                onChange={(e) => setLocationForm(prev => ({ ...prev, city: e.target.value }))}
                placeholder="e.g., Croydon"
              />
            </div>
            <div className="form-group">
              <label>Postcode</label>
              <Input
                value={locationForm.postcode}
                onChange={(e) => setLocationForm(prev => ({ ...prev, postcode: e.target.value }))}
                placeholder="e.g., CR0 1AB"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Region</label>
            <Select
              value={locationForm.region}
              onChange={(e) => setLocationForm(prev => ({ ...prev, region: e.target.value }))}
              options={[
                { value: '', label: 'Select region...' },
                ...UK_REGIONS.map(r => ({ value: r, label: r }))
              ]}
            />
          </div>

          {locationFormError && (
            <p className="form-error">{locationFormError}</p>
          )}

          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setShowLocationModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveLocation} disabled={savingLocation}>
              {savingLocation ? 'Saving...' : editingLocation ? 'Update' : 'Add'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Location Modal */}
      <Modal
        isOpen={showDeleteLocationModal}
        onClose={() => setShowDeleteLocationModal(false)}
        title="Delete Location"
        size="sm"
      >
        <div className="delete-confirmation">
          <p>Are you sure you want to delete <strong>"{deletingLocation?.name}"</strong>?</p>
          <p className="delete-warning">
            This action cannot be undone. Existing candidates assigned to this location will not be affected.
          </p>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setShowDeleteLocationModal(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteLocation}
              disabled={deletingLocationLoading}
            >
              {deletingLocationLoading ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default Settings

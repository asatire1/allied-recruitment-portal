import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { getFirebaseDb } from '@allied/shared-lib'
import { Card, Button, Input, Spinner } from '@allied/shared-ui'
import './BookingBlocksSettings.css'

// ============================================================================
// TYPES
// ============================================================================

interface LunchBlock {
  enabled: boolean
  start: string
  end: string
}

interface BookingBlocksData {
  bankHolidays: string[]
  lunchBlock: LunchBlock
}

// Default UK bank holidays
const DEFAULT_BANK_HOLIDAYS_2025 = [
  { date: '2025-01-01', name: "New Year's Day" },
  { date: '2025-04-18', name: 'Good Friday' },
  { date: '2025-04-21', name: 'Easter Monday' },
  { date: '2025-05-05', name: 'Early May Bank Holiday' },
  { date: '2025-05-26', name: 'Spring Bank Holiday' },
  { date: '2025-08-25', name: 'Summer Bank Holiday' },
  { date: '2025-12-25', name: 'Christmas Day' },
  { date: '2025-12-26', name: 'Boxing Day' },
]

const DEFAULT_BANK_HOLIDAYS_2026 = [
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-04-06', name: 'Easter Monday' },
  { date: '2026-05-04', name: 'Early May Bank Holiday' },
  { date: '2026-05-25', name: 'Spring Bank Holiday' },
  { date: '2026-08-31', name: 'Summer Bank Holiday' },
  { date: '2026-12-25', name: 'Christmas Day' },
  { date: '2026-12-28', name: 'Boxing Day (substitute)' },
]

// ============================================================================
// COMPONENT
// ============================================================================

export function BookingBlocksSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  // Bank holidays
  const [bankHolidays, setBankHolidays] = useState<string[]>([])
  const [newHolidayDate, setNewHolidayDate] = useState('')
  const [newHolidayName, setNewHolidayName] = useState('')
  const [holidayNames, setHolidayNames] = useState<Record<string, string>>({})
  
  // Lunch block
  const [lunchEnabled, setLunchEnabled] = useState(false)
  const [lunchStart, setLunchStart] = useState('12:00')
  const [lunchEnd, setLunchEnd] = useState('13:00')
  
  const db = getFirebaseDb()

  // Load settings on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        setLoading(true)
        const docRef = doc(db, 'settings', 'bookingBlocks')
        const docSnap = await getDoc(docRef)
        
        if (docSnap.exists()) {
          const data = docSnap.data() as BookingBlocksData & { holidayNames?: Record<string, string> }
          setBankHolidays(data.bankHolidays || [])
          setHolidayNames(data.holidayNames || {})
          setLunchEnabled(data.lunchBlock?.enabled ?? false)
          setLunchStart(data.lunchBlock?.start || '12:00')
          setLunchEnd(data.lunchBlock?.end || '13:00')
        } else {
          // Set defaults
          const defaultDates = [
            ...DEFAULT_BANK_HOLIDAYS_2025.map(h => h.date),
            ...DEFAULT_BANK_HOLIDAYS_2026.map(h => h.date),
          ]
          setBankHolidays(defaultDates)
          
          // Set default holiday names
          const names: Record<string, string> = {}
          DEFAULT_BANK_HOLIDAYS_2025.forEach(h => { names[h.date] = h.name })
          DEFAULT_BANK_HOLIDAYS_2026.forEach(h => { names[h.date] = h.name })
          setHolidayNames(names)
        }
      } catch (err) {
        console.error('Error loading booking blocks settings:', err)
        setError('Failed to load settings')
      } finally {
        setLoading(false)
      }
    }
    
    loadSettings()
  }, [db])

  // Save settings
  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)
      setSuccess(null)
      
      // Validate lunch times
      if (lunchEnabled) {
        const [startH, startM] = lunchStart.split(':').map(Number)
        const [endH, endM] = lunchEnd.split(':').map(Number)
        const startMinutes = startH * 60 + startM
        const endMinutes = endH * 60 + endM
        
        if (endMinutes <= startMinutes) {
          setError('Lunch end time must be after start time')
          return
        }
      }
      
      const docRef = doc(db, 'settings', 'bookingBlocks')
      await setDoc(docRef, {
        bankHolidays: bankHolidays.sort(),
        holidayNames,
        lunchBlock: {
          enabled: lunchEnabled,
          start: lunchStart,
          end: lunchEnd,
        },
        updatedAt: serverTimestamp(),
      }, { merge: true })
      
      setSuccess('Settings saved successfully')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      console.error('Error saving settings:', err)
      setError('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  // Add bank holiday
  const handleAddHoliday = () => {
    if (!newHolidayDate) return
    
    if (bankHolidays.includes(newHolidayDate)) {
      setError('This date is already in the list')
      return
    }
    
    setBankHolidays(prev => [...prev, newHolidayDate].sort())
    if (newHolidayName) {
      setHolidayNames(prev => ({ ...prev, [newHolidayDate]: newHolidayName }))
    }
    setNewHolidayDate('')
    setNewHolidayName('')
    setError(null)
  }

  // Remove bank holiday
  const handleRemoveHoliday = (date: string) => {
    setBankHolidays(prev => prev.filter(d => d !== date))
    setHolidayNames(prev => {
      const updated = { ...prev }
      delete updated[date]
      return updated
    })
  }

  // Add all UK bank holidays for a year
  const handleAddDefaultHolidays = (year: '2025' | '2026') => {
    const defaults = year === '2025' ? DEFAULT_BANK_HOLIDAYS_2025 : DEFAULT_BANK_HOLIDAYS_2026
    const newDates = defaults.map(h => h.date).filter(d => !bankHolidays.includes(d))
    
    if (newDates.length === 0) {
      setError(`All ${year} bank holidays are already added`)
      return
    }
    
    setBankHolidays(prev => [...prev, ...newDates].sort())
    
    const newNames: Record<string, string> = {}
    defaults.forEach(h => {
      if (!holidayNames[h.date]) {
        newNames[h.date] = h.name
      }
    })
    setHolidayNames(prev => ({ ...prev, ...newNames }))
    setError(null)
  }

  // Format date for display
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  // Group holidays by year
  const holidaysByYear = bankHolidays.reduce((acc, date) => {
    const year = date.substring(0, 4)
    if (!acc[year]) acc[year] = []
    acc[year].push(date)
    return acc
  }, {} as Record<string, string[]>)

  if (loading) {
    return (
      <Card className="booking-blocks-settings">
        <div className="loading-state">
          <Spinner size="md" />
          <p>Loading settings...</p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="booking-blocks-settings">
      <div className="settings-header">
        <h2>Booking Restrictions</h2>
        <p className="settings-description">
          Configure when interviews and trials cannot be booked
        </p>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          {success}
        </div>
      )}

      {/* Lunch Block Section */}
      <div className="settings-section">
        <h3>🍽️ Lunch Break Block</h3>
        <p className="section-description">
          Block bookings during lunch time across all days
        </p>
        
        <div className="lunch-block-controls">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={lunchEnabled}
              onChange={(e) => setLunchEnabled(e.target.checked)}
            />
            <span className="toggle-text">
              {lunchEnabled ? 'Lunch block enabled' : 'Lunch block disabled'}
            </span>
          </label>
          
          {lunchEnabled && (
            <div className="time-range-inputs">
              <div className="time-input-group">
                <label>From</label>
                <Input
                  type="time"
                  value={lunchStart}
                  onChange={(e) => setLunchStart(e.target.value)}
                />
              </div>
              <span className="time-separator">to</span>
              <div className="time-input-group">
                <label>To</label>
                <Input
                  type="time"
                  value={lunchEnd}
                  onChange={(e) => setLunchEnd(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bank Holidays Section */}
      <div className="settings-section">
        <h3>🏖️ Bank Holidays</h3>
        <p className="section-description">
          Block bookings on bank holidays and other closed dates
        </p>
        
        {/* Quick add buttons */}
        <div className="quick-add-buttons">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAddDefaultHolidays('2025')}
          >
            + Add UK 2025 Holidays
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAddDefaultHolidays('2026')}
          >
            + Add UK 2026 Holidays
          </Button>
        </div>
        
        {/* Add custom holiday */}
        <div className="add-holiday-form">
          <div className="add-holiday-inputs">
            <Input
              type="date"
              value={newHolidayDate}
              onChange={(e) => setNewHolidayDate(e.target.value)}
              placeholder="Select date"
            />
            <Input
              type="text"
              value={newHolidayName}
              onChange={(e) => setNewHolidayName(e.target.value)}
              placeholder="Holiday name (optional)"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddHoliday}
              disabled={!newHolidayDate}
            >
              Add
            </Button>
          </div>
        </div>
        
        {/* Holiday list grouped by year */}
        <div className="holidays-list">
          {Object.keys(holidaysByYear).sort().map(year => (
            <div key={year} className="year-group">
              <h4 className="year-header">{year}</h4>
              <div className="holidays-grid">
                {holidaysByYear[year].map(date => (
                  <div key={date} className="holiday-item">
                    <div className="holiday-info">
                      <span className="holiday-date">{formatDate(date)}</span>
                      {holidayNames[date] && (
                        <span className="holiday-name">{holidayNames[date]}</span>
                      )}
                    </div>
                    <button
                      className="remove-btn"
                      onClick={() => handleRemoveHoliday(date)}
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          
          {bankHolidays.length === 0 && (
            <p className="no-holidays">No bank holidays configured</p>
          )}
        </div>
      </div>

      {/* Save Button */}
      <div className="settings-actions">
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </Card>
  )
}

export default BookingBlocksSettings

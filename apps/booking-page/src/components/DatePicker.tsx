/**
 * DatePicker Component
 * P2.1: Calendar showing available dates
 * 
 * Features:
 * - Monthly calendar view
 * - Navigate between months
 * - Shows available/unavailable dates
 * - Respects advance booking limits
 * - Mobile-friendly touch targets
 */

import { useState, useMemo } from 'react'

// ============================================================================
// TYPES
// ============================================================================

export interface DaySchedule {
  enabled: boolean
  slots: Array<{ start: string; end: string }>
}

export interface WeeklySchedule {
  sunday?: DaySchedule
  monday?: DaySchedule
  tuesday?: DaySchedule
  wednesday?: DaySchedule
  thursday?: DaySchedule
  friday?: DaySchedule
  saturday?: DaySchedule
}

export interface DatePickerProps {
  /** Weekly schedule from availability settings */
  schedule: WeeklySchedule
  /** How many days in advance bookings are allowed */
  advanceBookingDays: number
  /** Minimum hours notice required for booking */
  minNoticeHours?: number
  /** Currently selected date */
  selectedDate: Date | null
  /** Callback when date is selected */
  onDateSelect: (date: Date) => void
  /** Dates that are fully booked */
  fullyBookedDates?: string[] // ISO date strings: '2025-01-15'
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_FULL = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get start of day in local timezone
 */
function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Format date as ISO string (YYYY-MM-DD) in local timezone
 */
function toISODateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Check if two dates are the same day
 */
function isSameDay(a: Date, b: Date): boolean {
  return toISODateString(a) === toISODateString(b)
}

/**
 * Get all days in a month for calendar display
 */
function getCalendarDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  
  const days: Date[] = []
  
  // Add padding days from previous month
  const startPadding = firstDay.getDay()
  for (let i = startPadding - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    days.push(d)
  }
  
  // Add days of current month
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i))
  }
  
  // Add padding days from next month to complete grid
  const endPadding = 42 - days.length // 6 rows × 7 days
  for (let i = 1; i <= endPadding; i++) {
    days.push(new Date(year, month + 1, i))
  }
  
  return days
}

// ============================================================================
// COMPONENT
// ============================================================================

export function DatePicker({
  schedule,
  advanceBookingDays,
  minNoticeHours = 24,
  selectedDate,
  onDateSelect,
  fullyBookedDates = []
}: DatePickerProps) {
  // Current view month/year
  const [viewDate, setViewDate] = useState(() => {
    const today = new Date()
    return { year: today.getFullYear(), month: today.getMonth() }
  })

  // Calculate date constraints
  const constraints = useMemo(() => {
    const now = new Date()
    
    // Earliest bookable date (respects minimum notice)
    const minDate = new Date(now.getTime() + minNoticeHours * 60 * 60 * 1000)
    
    // Latest bookable date
    const maxDate = new Date(now)
    maxDate.setDate(maxDate.getDate() + advanceBookingDays)
    
    return { minDate: startOfDay(minDate), maxDate: startOfDay(maxDate), today: startOfDay(now) }
  }, [advanceBookingDays, minNoticeHours])

  // Get calendar days for current view
  const calendarDays = useMemo(
    () => getCalendarDays(viewDate.year, viewDate.month),
    [viewDate.year, viewDate.month]
  )

  // Convert fully booked dates to Set for O(1) lookup
  const fullyBookedSet = useMemo(
    () => new Set(fullyBookedDates),
    [fullyBookedDates]
  )

  /**
   * Check if a date is available for booking
   */
  const isDateAvailable = (date: Date): boolean => {
    const dateStart = startOfDay(date)
    
    // Check if within booking window
    if (dateStart < constraints.minDate || dateStart > constraints.maxDate) {
      return false
    }
    
    // Check if day of week is enabled in schedule
    const dayName = DAYS_FULL[date.getDay()] as keyof WeeklySchedule
    const daySchedule = schedule[dayName]
    
    if (!daySchedule?.enabled || !daySchedule.slots?.length) {
      return false
    }
    
    // Check if fully booked
    if (fullyBookedSet.has(toISODateString(date))) {
      return false
    }
    
    return true
  }

  /**
   * Check if date is in current view month
   */
  const isCurrentMonth = (date: Date): boolean => {
    return date.getMonth() === viewDate.month
  }

  /**
   * Navigate to previous month
   */
  const goToPreviousMonth = () => {
    setViewDate(prev => {
      const newMonth = prev.month - 1
      if (newMonth < 0) {
        return { year: prev.year - 1, month: 11 }
      }
      return { ...prev, month: newMonth }
    })
  }

  /**
   * Navigate to next month
   */
  const goToNextMonth = () => {
    setViewDate(prev => {
      const newMonth = prev.month + 1
      if (newMonth > 11) {
        return { year: prev.year + 1, month: 0 }
      }
      return { ...prev, month: newMonth }
    })
  }

  /**
   * Handle date click
   */
  const handleDateClick = (date: Date) => {
    if (isDateAvailable(date)) {
      onDateSelect(date)
    }
  }

  /**
   * Check if we can navigate to previous month
   * Allow if any part of that month overlaps with the booking window
   */
  const canGoPrevious = useMemo(() => {
    const prevMonth = viewDate.month === 0 ? 11 : viewDate.month - 1
    const prevYear = viewDate.month === 0 ? viewDate.year - 1 : viewDate.year
    // Last day of previous month
    const lastOfPrev = new Date(prevYear, prevMonth + 1, 0)
    // Can go back if the last day of prev month is >= minDate
    return lastOfPrev >= constraints.minDate
  }, [viewDate, constraints.minDate])

  /**
   * Check if we can navigate to next month
   * Allow if any part of that month overlaps with the booking window
   */
  const canGoNext = useMemo(() => {
    const nextMonth = viewDate.month === 11 ? 0 : viewDate.month + 1
    const nextYear = viewDate.month === 11 ? viewDate.year + 1 : viewDate.year
    // First day of next month
    const firstOfNext = new Date(nextYear, nextMonth, 1)
    // Can go forward if the first day of next month is <= maxDate
    return firstOfNext <= constraints.maxDate
  }, [viewDate, constraints.maxDate])

  return (
    <div className="date-picker">
      {/* Header with month/year and navigation */}
      <div className="date-picker-header">
        <button
          className="date-picker-nav"
          onClick={goToPreviousMonth}
          disabled={!canGoPrevious}
          aria-label="Previous month"
        >
          <ChevronLeftIcon />
        </button>
        
        <h2 className="date-picker-title">
          {MONTHS[viewDate.month]} {viewDate.year}
        </h2>
        
        <button
          className="date-picker-nav"
          onClick={goToNextMonth}
          disabled={!canGoNext}
          aria-label="Next month"
        >
          <ChevronRightIcon />
        </button>
      </div>

      {/* Day of week headers */}
      <div className="date-picker-weekdays">
        {DAYS_OF_WEEK.map(day => (
          <div key={day} className="date-picker-weekday">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="date-picker-grid">
        {calendarDays.map((date, index) => {
          const available = isDateAvailable(date)
          const isSelected = selectedDate && isSameDay(date, selectedDate)
          const isToday = isSameDay(date, constraints.today)
          const inMonth = isCurrentMonth(date)
          
          return (
            <button
              key={index}
              className={`date-picker-day ${available ? 'available' : 'unavailable'} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${!inMonth ? 'other-month' : ''}`}
              onClick={() => handleDateClick(date)}
              disabled={!available}
              aria-label={`${date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}${available ? ', available' : ', unavailable'}`}
              aria-pressed={isSelected === true}
            >
              <span className="date-picker-day-number">{date.getDate()}</span>
              {isToday && <span className="date-picker-today-dot" />}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="date-picker-legend">
        <div className="legend-item">
          <span className="legend-dot available" />
          <span>Available</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot unavailable" />
          <span>Unavailable</span>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// ICONS
// ============================================================================

function ChevronLeftIcon() {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      fill="none" 
      viewBox="0 0 24 24" 
      strokeWidth={2} 
      stroke="currentColor"
      width="20"
      height="20"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      fill="none" 
      viewBox="0 0 24 24" 
      strokeWidth={2} 
      stroke="currentColor"
      width="20"
      height="20"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  )
}

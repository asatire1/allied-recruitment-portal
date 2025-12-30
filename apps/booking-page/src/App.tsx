/**
 * Allied Pharmacies Booking Page
 * Public page for candidate self-service scheduling
 *
 * Phase P1: Token validation & landing
 * Phase P2: Calendar & booking flow
 * Phase P3: Polish & mobile
 * Phase P4: Job Applications
 */

import { useState, useEffect, useCallback } from 'react'
import { useBookingToken } from './hooks/useBookingToken'
import {
  Header,
  LoadingSpinner,
  ErrorDisplay,
  WelcomePage,
  NoTokenPage,
  DatePicker,
  TimeSlotPicker,
  BookingConfirmation,
  BookingSuccess,
  JobApplication,
  // P3 Components
  CalendarSkeleton,
  TimeSlotsSkeleton,
  OfflineBanner,
  // useOnlineStatus
} from './components'
import {
  getAvailability,
  getTimeSlots,
  getDefaultAvailabilitySettings,
  generateTimeSlots,
  submitBooking,
  type AvailabilitySettings,
  type TimeSlot
} from './services'
import './styles/index.css'
import './styles/p3-polish.css'
import './styles/job-application.css'

// ============================================================================
// TYPES
// ============================================================================

type AppState =
  | 'landing'
  | 'selecting-date'
  | 'selecting-time'
  | 'confirming'
  | 'submitting'
  | 'success'
  | 'error'

interface BookingState {
  selectedDate: Date | null
  selectedTime: string | null
  confirmationId: string | null
  teamsJoinUrl: string | null
}

// ============================================================================
// APP COMPONENT
// ============================================================================

function App() {
  // Token validation
  const tokenState = useBookingToken()
  
  // P3: Online status
  // Online status tracked by OfflineBanner
  
  // App state
  const [appState, setAppState] = useState<AppState>('landing')
  const [bookingState, setBookingState] = useState<BookingState>({
    selectedDate: null,
    selectedTime: null,
    confirmationId: null,
    teamsJoinUrl: null
  })
  
  // Availability
  const [availability, setAvailability] = useState<AvailabilitySettings | null>(null)
  const [fullyBookedDates, setFullyBookedDates] = useState<string[]>([])
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [isLoadingSlots, setIsLoadingSlots] = useState(false)
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false)
  
  // Error state
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // ========================================
  // LOAD AVAILABILITY
  // ========================================
  
  useEffect(() => {
    if (tokenState.status === 'valid') {
      loadAvailability()
    }
  }, [tokenState.status])

  const loadAvailability = async () => {
    if (tokenState.status !== 'valid') return
    
    setIsLoadingAvailability(true)
    setLoadError(null)
    
    try {
      const result = await getAvailability(tokenState.token)
      setAvailability(result.settings)
      setFullyBookedDates(result.fullyBookedDates)
    } catch (error) {
      console.error('Failed to load availability:', error)
      // Use default settings as fallback
      setAvailability(getDefaultAvailabilitySettings())
      if (!navigator.onLine) {
        setLoadError('You appear to be offline. Using cached availability.')
      }
    } finally {
      setIsLoadingAvailability(false)
    }
  }

  // ========================================
  // LOAD TIME SLOTS FOR DATE
  // ========================================
  
  const loadTimeSlots = useCallback(async (date: Date) => {
    if (tokenState.status !== 'valid' || !availability) return
    
    setIsLoadingSlots(true)
    
    try {
      // Try Cloud Function first
      const slots = await getTimeSlots(tokenState.token, date)
      
      if (slots.length > 0) {
        setTimeSlots(slots)
      } else {
        // Fall back to client-side generation
        const generatedSlots = generateTimeSlots(
          date,
          availability.schedule,
          tokenState.data.duration,
          availability.bufferTime,
          availability.minNoticeHours
        )
        setTimeSlots(generatedSlots)
      }
    } catch (error) {
      console.error('Failed to load time slots:', error)
      
      // Fall back to client-side generation
      const generatedSlots = generateTimeSlots(
        date,
        availability.schedule,
        tokenState.data.duration,
        availability.bufferTime,
        availability.minNoticeHours
      )
      setTimeSlots(generatedSlots)
    } finally {
      setIsLoadingSlots(false)
    }
  }, [tokenState, availability])

  // ========================================
  // HANDLERS
  // ========================================
  
  const handleContinueToCalendar = () => {
    setAppState('selecting-date')
  }

  const handleDateSelect = (date: Date) => {
    setBookingState(prev => ({ ...prev, selectedDate: date, selectedTime: null }))
    loadTimeSlots(date)
    setAppState('selecting-time')
  }

  const handleTimeSelect = (time: string) => {
    setBookingState(prev => ({ ...prev, selectedTime: time }))
  }

  const handleContinueToConfirm = () => {
    if (bookingState.selectedDate && bookingState.selectedTime) {
      setAppState('confirming')
    }
  }

  const handleBackToDate = () => {
    setBookingState(prev => ({ ...prev, selectedTime: null }))
    setAppState('selecting-date')
  }

  const handleBackToTime = () => {
    setAppState('selecting-time')
  }

  const handleConfirmBooking = async () => {
    if (tokenState.status !== 'valid' || !bookingState.selectedDate || !bookingState.selectedTime) {
      return
    }
    
    setAppState('submitting')
    setSubmitError(null)
    
    const result = await submitBooking(
      tokenState.token,
      bookingState.selectedDate,
      bookingState.selectedTime
    )
    
    if (result.success) {
      setBookingState(prev => ({
        ...prev,
        confirmationId: result.data.confirmationCode,
        teamsJoinUrl: result.data.teamsJoinUrl || null
      }))
      setAppState('success')
    } else {
      setSubmitError(result.error.message)
      
      // If conflict, go back to time selection
      if (result.error.code === 'conflict') {
        // Reload time slots to get updated availability
        if (bookingState.selectedDate) {
          loadTimeSlots(bookingState.selectedDate)
        }
        setAppState('selecting-time')
      } else {
        setAppState('error')
      }
    }
  }

  // ========================================
  // RENDER
  // ========================================
  
  const renderContent = () => {
    // Check if we're on the /apply route for job applications
    const isApplyRoute = window.location.pathname === '/apply' ||
                         window.location.pathname.startsWith('/apply/')
    
    if (isApplyRoute) {
      return <JobApplication />
    }

    // Loading token validation
    if (tokenState.status === 'loading') {
      return <LoadingSpinner message="Validating your booking link..." />
    }

    // No token provided
    if (tokenState.status === 'no-token') {
      return <NoTokenPage />
    }

    // Invalid/expired/error token
    if (tokenState.status === 'invalid') {
      return <ErrorDisplay error={tokenState.error} onRetry={tokenState.retry} />
    }

    // Valid token - render booking flow
    if (tokenState.status === 'valid') {
      const { data } = tokenState

      switch (appState) {
        case 'landing':
          return (
            <WelcomePage
              data={data}
              onContinue={handleContinueToCalendar}
            />
          )

        case 'selecting-date':
          return (
            <div className="booking-flow" role="region" aria-label="Date selection">
              <div className="flow-header">
                <button
                  className="btn-back"
                  onClick={() => setAppState('landing')}
                  aria-label="Go back to welcome page"
                >
                  <ChevronLeftIcon aria-hidden="true" /> Back
                </button>
                <h2 id="date-selection-title">Select a Date</h2>
              </div>
              
              {loadError && (
                <div className="alert alert-warning" role="alert">
                  <AlertIcon aria-hidden="true" />
                  {loadError}
                </div>
              )}
              
              {isLoadingAvailability || !availability ? (
                <CalendarSkeleton />
              ) : (
                <DatePicker
                  schedule={availability.schedule}
                  advanceBookingDays={availability.advanceBookingDays}
                  minNoticeHours={availability.minNoticeHours}
                  selectedDate={bookingState.selectedDate}
                  onDateSelect={handleDateSelect}
                  fullyBookedDates={fullyBookedDates}
                />
              )}
            </div>
          )

        case 'selecting-time':
          if (!bookingState.selectedDate) {
            setAppState('selecting-date')
            return null
          }
          return (
            <div className="booking-flow" role="region" aria-label="Time selection">
              <div className="flow-header">
                <button
                  className="btn-back"
                  onClick={handleBackToDate}
                  aria-label="Go back to date selection"
                >
                  <ChevronLeftIcon aria-hidden="true" /> Back
                </button>
                <h2 id="time-selection-title">Select a Time</h2>
              </div>
              
              {submitError && (
                <div className="alert alert-error" role="alert">
                  <AlertIcon aria-hidden="true" />
                  {submitError}
                </div>
              )}
              
              {isLoadingSlots ? (
                <TimeSlotsSkeleton />
              ) : (
                <TimeSlotPicker
                  date={bookingState.selectedDate}
                  slots={timeSlots}
                  selectedTime={bookingState.selectedTime}
                  onTimeSelect={handleTimeSelect}
                  duration={data.duration}
                  isLoading={isLoadingSlots}
                />
              )}
              
              {bookingState.selectedTime && (
                <div className="flow-actions">
                  <button
                    className="btn btn-primary btn-large"
                    onClick={handleContinueToConfirm}
                    aria-label="Continue to confirm your booking"
                  >
                    Continue
                    <ChevronRightIcon aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          )

        case 'confirming':
          if (!bookingState.selectedDate || !bookingState.selectedTime) {
            setAppState('selecting-date')
            return null
          }
          return (
            <BookingConfirmation
              bookingData={data}
              selectedDate={bookingState.selectedDate}
              selectedTime={bookingState.selectedTime}
              onConfirm={handleConfirmBooking}
              onBack={handleBackToTime}
            />
          )

        case 'submitting':
          return (
            <div className="submitting-container" role="status" aria-live="polite">
              <LoadingSpinner message="Confirming your booking..." size="large" />
              {/* P3: Screen reader announcement */}
              <div className="sr-only" aria-live="assertive">
                Please wait while we confirm your booking.
              </div>
            </div>
          )

        case 'success':
          if (!bookingState.selectedDate || !bookingState.selectedTime || !bookingState.confirmationId) {
            return null
          }
          return (
            <BookingSuccess
              bookingData={data}
              bookedDate={bookingState.selectedDate}
              bookedTime={bookingState.selectedTime}
              confirmationId={bookingState.confirmationId}
              teamsJoinUrl={bookingState.teamsJoinUrl || undefined}
            />
          )

        case 'error':
          return (
            <div className="error-container" role="alert">
              <div className="error-icon">
                <AlertIcon aria-hidden="true" />
              </div>
              <h1 className="error-title">Booking Failed</h1>
              <p className="error-message">{submitError || 'Something went wrong. Please try again.'}</p>
              <button
                className="btn btn-primary"
                onClick={() => setAppState('selecting-date')}
              >
                Try Again
              </button>
            </div>
          )

        default:
          return null
      }
    }

    return null
  }

  return (
    <div className="app">
      {/* P3.4: Skip link for accessibility */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      
      <Header />
      
      <main id="main-content" className="main-content" role="main">
        <div className="content-container">
          {renderContent()}
        </div>
      </main>
      
      <footer className="footer" role="contentinfo">
        <p>© {new Date().getFullYear()} Allied Pharmacies. All rights reserved.</p>
      </footer>
      
      {/* P3.3: Offline banner */}
      <OfflineBanner onRetry={() => {
        if (tokenState.status === 'valid') {
          loadAvailability()
        }
      }} />
      
      {/* P3.4: Live region for screen reader announcements */}
      <div
        className="live-region"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        id="announcements"
      />
    </div>
  )
}

// ============================================================================
// ICONS
// ============================================================================

function ChevronLeftIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="20" height="20">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="20" height="20">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="24" height="24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  )
}

export default App

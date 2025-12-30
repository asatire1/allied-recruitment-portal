/**
 * BookingSuccess Component
 * P2.7: Success confirmation with WhatsApp share and calendar add link
 *
 * Shows:
 * - Success message with animation
 * - Booking details summary
 * - Teams meeting link (if interview)
 * - WhatsApp confirmation button (primary action)
 * - Add to calendar buttons (Google, Apple, Outlook)
 */

import type { BookingLinkData } from '../services/bookingService'

// ============================================================================
// TYPES
// ============================================================================

export interface BookingSuccessProps {
  /** Booking data from validated token */
  bookingData: BookingLinkData
  /** Booked date */
  bookedDate: Date
  /** Booked time slot */
  bookedTime: string
  /** Confirmation ID (interview ID) */
  confirmationId: string
  /** Candidate phone number (for WhatsApp) */
  candidatePhone?: string
  /** Teams meeting join URL (for interviews) */
  teamsJoinUrl?: string
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format time for display (24h to 12h)
 */
function formatTime(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const hours12 = hours % 12 || 12
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`
}

/**
 * Calculate end time given start time and duration
 */
function getEndTime(startTime: string, durationMinutes: number): string {
  const [hours, minutes] = startTime.split(':').map(Number)
  const totalMinutes = hours * 60 + minutes + durationMinutes
  const endHours = Math.floor(totalMinutes / 60) % 24
  const endMinutes = totalMinutes % 60
  return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`
}

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}

/**
 * Format date short (for WhatsApp message)
 */
function formatDateShort(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  })
}

/**
 * Format date for ICS file (YYYYMMDD)
 */
function formatICSDate(date: Date, time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const d = new Date(date)
  d.setHours(hours, minutes, 0, 0)
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/**
 * Generate Google Calendar URL
 */
function getGoogleCalendarUrl(
  title: string,
  date: Date,
  startTime: string,
  endTime: string,
  location?: string,
  description?: string
): string {
  const start = formatICSDate(date, startTime)
  const end = formatICSDate(date, endTime)
  
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${start}/${end}`,
    details: description || '',
    location: location || '',
  })
  
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/**
 * Generate ICS file content for Apple/Outlook
 */
function generateICS(
  title: string,
  date: Date,
  startTime: string,
  endTime: string,
  location?: string,
  description?: string
): string {
  const start = formatICSDate(date, startTime)
  const end = formatICSDate(date, endTime)
  const uid = `${Date.now()}@alliedpharmacies.co.uk`
  
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Allied Pharmacies//Booking//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${title}`,
    location ? `LOCATION:${location}` : '',
    description ? `DESCRIPTION:${description.replace(/\n/g, '\\n')}` : '',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean)
  
  return lines.join('\r\n')
}

/**
 * Download ICS file
 */
function downloadICS(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Generate WhatsApp message with calendar link
 */
function generateWhatsAppMessage(
  candidateName: string,
  type: 'interview' | 'trial',
  date: Date,
  startTime: string,
  endTime: string,
  location: string | undefined,
  confirmationId: string,
  calendarUrl: string,
  teamsUrl?: string
): string {
  const eventType = type === 'interview' ? 'Interview' : 'Trial Shift'
  const dateStr = formatDateShort(date)
  const timeStr = `${formatTime(startTime)} - ${formatTime(endTime)}`
  
  let message = `✅ *Booking Confirmed*\n\n`
  message += `Hi ${candidateName.split(' ')[0]},\n\n`
  message += `Your ${eventType.toLowerCase()} with Allied Pharmacies is confirmed!\n\n`
  message += `📅 *${dateStr}*\n`
  message += `🕐 *${timeStr}*\n`
  if (location) {
    message += `📍 *${location}*\n`
  }
  if (teamsUrl) {
    message += `\n💻 *Join Teams Meeting:*\n${teamsUrl}\n`
  }
  message += `\n🔖 Confirmation: ${confirmationId}\n\n`
  message += `👉 *Add to your calendar:*\n${calendarUrl}\n\n`
  message += `Please arrive 5-10 minutes early and bring valid photo ID.\n\n`
  message += `Questions? Reply to this message or email recruitment@alliedpharmacies.co.uk`
  
  return message
}

/**
 * Open WhatsApp with pre-filled message
 */
function openWhatsApp(phone: string | undefined, message: string): void {
  const encodedMessage = encodeURIComponent(message)
  
  // If we have a phone number, use it
  if (phone) {
    // Clean phone number (remove spaces, dashes, etc.)
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '')
    // Add UK country code if not present
    const fullPhone = cleanPhone.startsWith('+')
      ? cleanPhone
      : cleanPhone.startsWith('0')
        ? `+44${cleanPhone.slice(1)}`
        : `+44${cleanPhone}`
    
    window.open(`https://wa.me/${fullPhone.replace('+', '')}?text=${encodedMessage}`, '_blank')
  } else {
    // Open WhatsApp without a specific number (user can choose)
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank')
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function BookingSuccess({
  bookingData,
  bookedDate,
  bookedTime,
  confirmationId,
  candidatePhone,
  teamsJoinUrl
}: BookingSuccessProps) {
  const endTime = getEndTime(bookedTime, bookingData.duration)
  const isInterview = bookingData.type === 'interview'
  
  const eventTitle = isInterview
    ? `Interview at Allied Pharmacies${bookingData.jobTitle ? ` - ${bookingData.jobTitle}` : ''}`
    : `Trial Shift at Allied Pharmacies${bookingData.jobTitle ? ` - ${bookingData.jobTitle}` : ''}`
  
  // Include Teams link in description if available
  let eventDescription = `Your ${isInterview ? 'interview' : 'trial shift'} with Allied Pharmacies.\n\nConfirmation: ${confirmationId}`
  if (teamsJoinUrl) {
    eventDescription += `\n\nJoin Teams Meeting: ${teamsJoinUrl}`
  }
  eventDescription += `\n\nIf you need to reschedule or cancel, please contact recruitment@alliedpharmacies.co.uk`
  
  const location = teamsJoinUrl 
    ? 'Microsoft Teams (Online)'
    : bookingData.branchAddress
      ? `${bookingData.branchName}, ${bookingData.branchAddress}`
      : bookingData.branchName

  // Generate Google Calendar URL for sharing
  const googleCalendarUrl = getGoogleCalendarUrl(
    eventTitle,
    bookedDate,
    bookedTime,
    endTime,
    location,
    eventDescription
  )

  const handleWhatsAppShare = () => {
    const message = generateWhatsAppMessage(
      bookingData.candidateName,
      bookingData.type,
      bookedDate,
      bookedTime,
      endTime,
      location,
      confirmationId,
      googleCalendarUrl,
      teamsJoinUrl
    )
    openWhatsApp(candidatePhone, message)
  }

  const handleGoogleCalendar = () => {
    window.open(googleCalendarUrl, '_blank')
  }

  const handleAppleCalendar = () => {
    const ics = generateICS(
      eventTitle,
      bookedDate,
      bookedTime,
      endTime,
      location,
      eventDescription
    )
    downloadICS('allied-booking.ics', ics)
  }

  const handleOutlookCalendar = () => {
    // Outlook.com URL
    const start = formatICSDate(bookedDate, bookedTime)
    const end = formatICSDate(bookedDate, endTime)
    
    const params = new URLSearchParams({
      path: '/calendar/action/compose',
      rru: 'addevent',
      subject: eventTitle,
      startdt: start,
      enddt: end,
      location: location || '',
      body: eventDescription
    })
    
    window.open(`https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`, '_blank')
  }

  const handleJoinTeams = () => {
    if (teamsJoinUrl) {
      window.open(teamsJoinUrl, '_blank')
    }
  }

  return (
    <div className="booking-success">
      {/* Success Animation */}
      <div className="success-animation">
        <div className="success-circle">
          <CheckIcon />
        </div>
      </div>

      <h1 className="success-title">Booking Confirmed!</h1>
      
      <p className="success-subtitle">
        Your {isInterview ? 'interview' : 'trial shift'} has been scheduled.
      </p>

      {/* Confirmation ID */}
      <div className="confirmation-id">
        <span className="confirmation-id-label">Confirmation</span>
        <span className="confirmation-id-value">{confirmationId}</span>
      </div>

      {/* Booking Summary */}
      <div className="success-summary">
        <div className="summary-row">
          <CalendarIcon />
          <span>{formatDate(bookedDate)}</span>
        </div>
        <div className="summary-row">
          <ClockIcon />
          <span>{formatTime(bookedTime)} – {formatTime(endTime)}</span>
        </div>
        {teamsJoinUrl ? (
          <div className="summary-row">
            <VideoIcon />
            <span>Microsoft Teams (Online)</span>
          </div>
        ) : location && (
          <div className="summary-row">
            <MapPinIcon />
            <span>{location}</span>
          </div>
        )}
      </div>

      {/* Teams Meeting Link - Primary for interviews */}
      {teamsJoinUrl && (
        <div className="teams-meeting">
          <button
            className="teams-btn"
            onClick={handleJoinTeams}
          >
            <TeamsIcon />
            <span>Join Teams Meeting</span>
          </button>
          <p className="teams-hint">
            Save this link - you'll need it to join your interview
          </p>
        </div>
      )}

      {/* WhatsApp Confirmation - Primary Action */}
      <div className="whatsapp-confirmation">
        <button
          className="whatsapp-btn"
          onClick={handleWhatsAppShare}
        >
          <WhatsAppIcon />
          <span>Save Confirmation to WhatsApp</span>
        </button>
        <p className="whatsapp-hint">
          Tap to save your booking details{teamsJoinUrl ? ', Teams link,' : ''} and calendar link to WhatsApp
        </p>
      </div>

      {/* Add to Calendar */}
      <div className="calendar-buttons">
        <p className="calendar-buttons-title">Or add directly to calendar</p>
        <div className="calendar-buttons-grid">
          <button
            className="calendar-btn google"
            onClick={handleGoogleCalendar}
          >
            <GoogleIcon />
            <span>Google</span>
          </button>
          <button
            className="calendar-btn apple"
            onClick={handleAppleCalendar}
          >
            <AppleIcon />
            <span>Apple</span>
          </button>
          <button
            className="calendar-btn outlook"
            onClick={handleOutlookCalendar}
          >
            <OutlookIcon />
            <span>Outlook</span>
          </button>
        </div>
      </div>

      {/* What's Next */}
      <div className="success-next">
        <h3>What's Next?</h3>
        <ul>
          <li>Save your booking details via WhatsApp above</li>
          <li>Add the event to your calendar</li>
          {teamsJoinUrl ? (
            <li>Test your camera and microphone before the interview</li>
          ) : (
            <li>Arrive 5-10 minutes early</li>
          )}
          {!isInterview && <li>Wear comfortable, professional attire</li>}
          <li>Bring a valid photo ID</li>
        </ul>
      </div>

      {/* Contact */}
      <div className="success-contact">
        <p>Questions? Contact us at</p>
        <a href="mailto:recruitment@alliedpharmacies.co.uk">
          recruitment@alliedpharmacies.co.uk
        </a>
      </div>
    </div>
  )
}

// ============================================================================
// ICONS
// ============================================================================

function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" width="48" height="48">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function MapPinIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  )
}

function VideoIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20">
      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  )
}

function TeamsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
      <path d="M20.625 8.073c-.003-.022-.003-.043-.01-.065a.403.403 0 0 0-.087-.156.476.476 0 0 0-.147-.103.415.415 0 0 0-.167-.044H14.5V5.5a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 0-.5.5v2.205H3.786a.415.415 0 0 0-.167.044.476.476 0 0 0-.147.103.403.403 0 0 0-.087.156c-.007.022-.007.043-.01.065a.388.388 0 0 0 0 .082v7.69c0 .027 0 .055.01.082.003.022.003.043.01.065a.403.403 0 0 0 .087.156.476.476 0 0 0 .147.103.415.415 0 0 0 .167.044H9.5v2.205a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5v-2.205h5.714a.415.415 0 0 0 .167-.044.476.476 0 0 0 .147-.103.403.403 0 0 0 .087-.156c.007-.022.007-.043.01-.065a.388.388 0 0 0 0-.082v-7.69a.388.388 0 0 0 0-.082zM10.5 6h3v1.705h-3V6zm3 12h-3v-1.705h3V18zm5.5-2.5h-5V8.5h5v7z"/>
      <circle cx="17" cy="4" r="2"/>
      <circle cx="21" cy="6" r="1.5"/>
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  )
}

function OutlookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20">
      <path fill="#0078D4" d="M24 7.387v10.478c0 .23-.08.424-.238.576-.158.152-.356.228-.594.228h-8.457v-6.182l1.262.911c.088.064.193.096.316.096.124 0 .23-.032.318-.096l6.97-5.038v-.003c.088-.064.166-.077.234-.039.068.038.127.106.177.205l.012.064zm-.838-1.406c.006.061-.013.117-.059.168l-7.706 5.57c-.198.143-.423.215-.676.215-.253 0-.478-.072-.676-.215l-1.334-.963V6.363c0-.167.058-.31.174-.426.116-.116.259-.174.426-.174h9.444c.192 0 .347.066.407.198z"/>
      <path fill="#0078D4" d="M8.824 5.078H.596c-.33 0-.596.267-.596.596v12.637c0 .33.266.596.596.596h8.228c.33 0 .596-.266.596-.596V5.674c0-.33-.266-.596-.596-.596zM7.14 16.643H2.28V7.91h4.86v8.733z"/>
      <path fill="#0078D4" d="M4.71 8.963c-1.51 0-2.732 1.313-2.732 2.932 0 1.62 1.223 2.932 2.732 2.932 1.509 0 2.732-1.313 2.732-2.932 0-1.62-1.223-2.932-2.732-2.932zm0 4.656c-.878 0-1.59-.772-1.59-1.724 0-.952.712-1.724 1.59-1.724.878 0 1.59.772 1.59 1.724 0 .952-.712 1.724-1.59 1.724z"/>
    </svg>
  )
}

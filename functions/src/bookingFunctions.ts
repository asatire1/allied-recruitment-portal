/**
* Booking Cloud Functions
* P2.2: Get availability settings
* P2.3: Get time slots for a date
* P2.4: Slot conflict checking
* P2.6: Submit booking
*
* Updated: Teams meeting integration for interviews
* Updated: Automatic candidate status updates
* Updated: Bank holiday and lunch time blocking
* Updated: Per-branch trial availability with maxTrialsPerDay enforcement
*/

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import * as crypto from 'crypto'
import { createTeamsMeeting, sendConfirmationEmail, msClientId, msClientSecret, msTenantId, msOrganizerUserId, TeamsMeetingResult } from './teamsMeeting'
// Note: sendTrialBranchNotification is called via HTTP internally for trial bookings

const db = admin.firestore()

// ============================================================================
// TYPES
// ============================================================================

interface DaySchedule {
  enabled: boolean
  slots: Array<{ start: string; end: string }>
}

interface WeeklySchedule {
  sunday?: DaySchedule
  monday?: DaySchedule
  tuesday?: DaySchedule
  wednesday?: DaySchedule
  thursday?: DaySchedule
  friday?: DaySchedule
  saturday?: DaySchedule
}

interface AvailabilitySettings {
  schedule: WeeklySchedule
  slotDuration: number
  bufferTime: number
  advanceBookingDays: number
  minNoticeHours: number
  enabled: boolean
}

interface TrialSlot {
  dayOfWeek: number  // 0-6 (Sunday-Saturday)
  startTime: string  // "HH:MM"
  endTime: string    // "HH:MM"
  enabled: boolean
}

interface TrialAvailabilitySettings {
  trialDuration: number      // Fixed at 240 minutes (4 hours)
  bufferTime: number         // Minutes between trials
  maxAdvanceBooking: number  // Days ahead candidates can book
  minNoticeHours: number     // Minimum notice required
  maxTrialsPerDay: number    // Maximum trials per day PER BRANCH
  slots: TrialSlot[]
  blockedDates: FirebaseFirestore.Timestamp[]
}

interface BookingBlocksSettings {
  bankHolidays: string[] // Array of date strings in YYYY-MM-DD format
  lunchBlock: {
    enabled: boolean
    start: string // HH:MM format
    end: string   // HH:MM format
  }
}

interface TimeSlot {
  time: string
  available: boolean
  reason?: string // Optional reason why slot is unavailable
}

// ============================================================================
// HELPERS
// ============================================================================

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

const DAYS_FULL = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function getDefaultTrialSettings(): TrialAvailabilitySettings {
  return {
    trialDuration: 240, // 4 hours
    bufferTime: 30,
    maxAdvanceBooking: 21,
    minNoticeHours: 48,
    maxTrialsPerDay: 1, // Default to 1 trial per day per branch
    slots: [
      { dayOfWeek: 0, startTime: '09:00', endTime: '13:00', enabled: false }, // Sunday
      { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', enabled: true },  // Monday
      { dayOfWeek: 2, startTime: '09:00', endTime: '17:00', enabled: true },  // Tuesday
      { dayOfWeek: 3, startTime: '09:00', endTime: '17:00', enabled: true },  // Wednesday
      { dayOfWeek: 4, startTime: '09:00', endTime: '17:00', enabled: true },  // Thursday
      { dayOfWeek: 5, startTime: '09:00', endTime: '17:00', enabled: true },  // Friday
      { dayOfWeek: 6, startTime: '09:00', endTime: '13:00', enabled: false }, // Saturday
    ],
    blockedDates: []
  }
}

// Convert trial slots to weekly schedule format for compatibility
function convertTrialSlotsToSchedule(slots: TrialSlot[]): WeeklySchedule {
  const dayNames: (keyof WeeklySchedule)[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const schedule: WeeklySchedule = {}

  for (const slot of slots) {
    const dayName = dayNames[slot.dayOfWeek]
    schedule[dayName] = {
      enabled: slot.enabled,
      slots: slot.enabled ? [{ start: slot.startTime, end: slot.endTime }] : []
    }
  }

  return schedule
}

async function getTrialAvailabilitySettings(): Promise<TrialAvailabilitySettings> {
  try {
    const settingsDoc = await db.collection('settings').doc('trialAvailability').get()
    if (settingsDoc.exists) {
      const data = settingsDoc.data()
      return {
        trialDuration: data?.trialDuration || 240,
        bufferTime: data?.bufferTime || 30,
        maxAdvanceBooking: data?.maxAdvanceBooking || 21,
        minNoticeHours: data?.minNoticeHours || 48,
        maxTrialsPerDay: data?.maxTrialsPerDay || 1,
        slots: data?.slots || getDefaultTrialSettings().slots,
        blockedDates: data?.blockedDates || []
      }
    }
  } catch (error) {
    console.error('Failed to get trial settings:', error)
  }
  return getDefaultTrialSettings()
}

// Interview settings stored in same format as trials (slots array)
interface InterviewAvailabilitySettings {
  slotDuration: number
  bufferTime: number
  maxAdvanceBooking: number
  minNoticeHours: number
  slots: TrialSlot[]
  blockedDates: FirebaseFirestore.Timestamp[]
}

function getDefaultInterviewSettings(): InterviewAvailabilitySettings {
  return {
    slotDuration: 30,
    bufferTime: 15,
    maxAdvanceBooking: 14,
    minNoticeHours: 24,
    slots: [
      { dayOfWeek: 0, startTime: '09:00', endTime: '17:00', enabled: false }, // Sunday
      { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', enabled: true },  // Monday
      { dayOfWeek: 2, startTime: '09:00', endTime: '17:00', enabled: true },  // Tuesday
      { dayOfWeek: 3, startTime: '09:00', endTime: '17:00', enabled: true },  // Wednesday
      { dayOfWeek: 4, startTime: '09:00', endTime: '17:00', enabled: true },  // Thursday
      { dayOfWeek: 5, startTime: '09:00', endTime: '17:00', enabled: true },  // Friday
      { dayOfWeek: 6, startTime: '09:00', endTime: '17:00', enabled: false }, // Saturday
    ],
    blockedDates: []
  }
}

async function getInterviewAvailabilitySettings(): Promise<InterviewAvailabilitySettings> {
  try {
    const settingsDoc = await db.collection('settings').doc('interviewAvailability').get()
    if (settingsDoc.exists) {
      const data = settingsDoc.data()
      return {
        slotDuration: data?.slotDuration || 30,
        bufferTime: data?.bufferTime || 15,
        maxAdvanceBooking: data?.maxAdvanceBooking || 14,
        minNoticeHours: data?.minNoticeHours || 24,
        slots: data?.slots || getDefaultInterviewSettings().slots,
        blockedDates: data?.blockedDates || []
      }
    }
  } catch (error) {
    console.error('Failed to get interview settings:', error)
  }
  return getDefaultInterviewSettings()
}

// Default UK bank holidays for 2025 and 2026
function getDefaultBankHolidays(): string[] {
  return [
    // 2025
    '2025-01-01', // New Year's Day
    '2025-04-18', // Good Friday
    '2025-04-21', // Easter Monday
    '2025-05-05', // Early May Bank Holiday
    '2025-05-26', // Spring Bank Holiday
    '2025-08-25', // Summer Bank Holiday
    '2025-12-25', // Christmas Day
    '2025-12-26', // Boxing Day
    // 2026
    '2026-01-01', // New Year's Day
    '2026-04-03', // Good Friday
    '2026-04-06', // Easter Monday
    '2026-05-04', // Early May Bank Holiday
    '2026-05-25', // Spring Bank Holiday
    '2026-08-31', // Summer Bank Holiday
    '2026-12-25', // Christmas Day
    '2026-12-28', // Boxing Day (substitute)
  ]
}

function getDefaultBookingBlocks(): BookingBlocksSettings {
  return {
    bankHolidays: getDefaultBankHolidays(),
    lunchBlock: {
      enabled: false,
      start: '12:00',
      end: '13:00'
    }
  }
}

// Check if a date is a bank holiday
function isBankHoliday(dateStr: string, bankHolidays: string[]): boolean {
  return bankHolidays.includes(dateStr)
}

// Check if a time slot falls within lunch block
function isInLunchBlock(timeStr: string, duration: number, lunchBlock: { enabled: boolean; start: string; end: string }): boolean {
  if (!lunchBlock.enabled) return false
  
  const [slotHours, slotMinutes] = timeStr.split(':').map(Number)
  const [lunchStartHours, lunchStartMinutes] = lunchBlock.start.split(':').map(Number)
  const [lunchEndHours, lunchEndMinutes] = lunchBlock.end.split(':').map(Number)
  
  const slotStartMinutes = slotHours * 60 + slotMinutes
  const slotEndMinutes = slotStartMinutes + duration
  const lunchStartTotalMinutes = lunchStartHours * 60 + lunchStartMinutes
  const lunchEndTotalMinutes = lunchEndHours * 60 + lunchEndMinutes
  
  // Check if slot overlaps with lunch block
  // Overlap occurs if slot starts before lunch ends AND slot ends after lunch starts
  return slotStartMinutes < lunchEndTotalMinutes && slotEndMinutes > lunchStartTotalMinutes
}

async function getBookingBlocksSettings(): Promise<BookingBlocksSettings> {
  try {
    const blocksDoc = await db.collection('settings').doc('bookingBlocks').get()
    if (blocksDoc.exists) {
      const data = blocksDoc.data()
      return {
        bankHolidays: data?.bankHolidays || getDefaultBankHolidays(),
        lunchBlock: {
          enabled: data?.lunchBlock?.enabled ?? false,
          start: data?.lunchBlock?.start || '12:00',
          end: data?.lunchBlock?.end || '13:00'
        }
      }
    }
  } catch (error) {
    console.error('Failed to get booking blocks settings:', error)
  }
  return getDefaultBookingBlocks()
}

async function validateToken(token: string): Promise<FirebaseFirestore.DocumentSnapshot> {
  const tokenHash = hashToken(token.trim())
  
  const snapshot = await db
    .collection('bookingLinks')
    .where('tokenHash', '==', tokenHash)
    .where('status', '==', 'active')
    .limit(1)
    .get()
  
  if (snapshot.empty) {
    throw new HttpsError('not-found', 'Invalid or expired booking link')
  }
  
  const doc = snapshot.docs[0]
  const link = doc.data()
  
  // Check expiry
  const expiresAt = link.expiresAt?.toDate?.() || new Date(0)
  if (expiresAt < new Date()) {
    await doc.ref.update({ status: 'expired' })
    throw new HttpsError('not-found', 'Invalid or expired booking link')
  }
  
  // Check usage
  if ((link.useCount || 0) >= (link.maxUses || 1)) {
    throw new HttpsError('not-found', 'This booking link has already been used')
  }
  
  return doc
}

// ============================================================================
// UPDATE CANDIDATE STATUS HELPER
// ============================================================================

async function updateCandidateStatus(
  candidateId: string, 
  newStatus: string, 
  reason: string
): Promise<void> {
  try {
    const candidateRef = db.collection('candidates').doc(candidateId)
    const candidateDoc = await candidateRef.get()
    
    if (!candidateDoc.exists) {
      console.warn(`Candidate ${candidateId} not found for status update`)
      return
    }
    
    const previousStatus = candidateDoc.data()?.status || 'unknown'
    
    // Update candidate status
    await candidateRef.update({
      status: newStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    
    // Log activity
    await db.collection('activityLog').add({
      entityType: 'candidate',
      entityId: candidateId,
      action: 'status_changed',
      description: `Status automatically changed from "${previousStatus.replace(/_/g, ' ')}" to "${newStatus.replace(/_/g, ' ')}" - ${reason}`,
      previousValue: { status: previousStatus },
      newValue: { status: newStatus },
      userId: 'system',
      userName: 'System (Automatic)',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    
    console.log(`Candidate ${candidateId} status updated: ${previousStatus} → ${newStatus}`)
  } catch (error) {
    console.error(`Failed to update candidate status for ${candidateId}:`, error)
    // Don't throw - status update failure should not block the main operation
  }
}

// ============================================================================
// P2.2: GET BOOKING AVAILABILITY
// ============================================================================

export const getBookingAvailability = onCall<{ token: string }>(
  {
    cors: true,
    region: 'europe-west2',
    enforceAppCheck: false, // Allow public access from booking page
    invoker: 'public', // Allow unauthenticated invocations
  },
  async (request) => {
    const { token } = request.data

    if (!token) {
      throw new HttpsError('invalid-argument', 'Token is required')
    }

    // Validate token and get booking type
    let bookingType: 'interview' | 'trial' = 'interview'
    if (token !== "__internal__") {
      const linkDoc = await validateToken(token)
      const linkData = linkDoc.data()
      bookingType = linkData?.type || 'interview'
    }

    console.log('getBookingAvailability - bookingType:', bookingType)

    // Get availability settings based on booking type
    let settings: AvailabilitySettings

    if (bookingType === 'trial') {
      // Read from trialAvailability settings
      const trialSettings = await getTrialAvailabilitySettings()
      console.log('getBookingAvailability - trialSettings:', JSON.stringify(trialSettings.slots))
      settings = {
        schedule: convertTrialSlotsToSchedule(trialSettings.slots),
        slotDuration: trialSettings.trialDuration, // 240 minutes (4 hours)
        bufferTime: trialSettings.bufferTime,
        advanceBookingDays: trialSettings.maxAdvanceBooking,
        minNoticeHours: trialSettings.minNoticeHours,
        enabled: true
      }
    } else {
      // Read from interviewAvailability settings (also uses slots array format)
      const interviewSettings = await getInterviewAvailabilitySettings()
      console.log('getBookingAvailability - interviewSettings:', JSON.stringify(interviewSettings.slots))
      settings = {
        schedule: convertTrialSlotsToSchedule(interviewSettings.slots),
        slotDuration: interviewSettings.slotDuration,
        bufferTime: interviewSettings.bufferTime,
        advanceBookingDays: interviewSettings.maxAdvanceBooking,
        minNoticeHours: interviewSettings.minNoticeHours,
        enabled: true
      }
    }

    console.log('getBookingAvailability - final schedule:', JSON.stringify(settings.schedule))

    // Get booking blocks settings (bank holidays)
    const blocksSettings = await getBookingBlocksSettings()

    // Get fully booked dates (dates where all slots are taken)
    const fullyBookedDates: string[] = []

    // Add bank holidays to blocked dates
    const blockedDates: string[] = [...blocksSettings.bankHolidays]

    // Add type-specific blocked dates
    if (bookingType === 'trial') {
      const trialSettings = await getTrialAvailabilitySettings()
      trialSettings.blockedDates.forEach(ts => {
        const date = ts?.toDate?.()
        if (date) {
          const dateStr = date.toISOString().split('T')[0]
          if (!blockedDates.includes(dateStr)) {
            blockedDates.push(dateStr)
          }
        }
      })
    } else {
      const interviewSettings = await getInterviewAvailabilitySettings()
      interviewSettings.blockedDates.forEach(ts => {
        const date = ts?.toDate?.()
        if (date) {
          const dateStr = date.toISOString().split('T')[0]
          if (!blockedDates.includes(dateStr)) {
            blockedDates.push(dateStr)
          }
        }
      })
    }

    // Note: We no longer mark dates as "fully booked" based on booking count.
    // Availability is determined by actual time slot availability when the user
    // selects a date. This allows unlimited bookings per day as long as slots exist.
    
    return {
      settings: {
        schedule: settings.schedule,
        advanceBookingDays: settings.advanceBookingDays,
        minNoticeHours: settings.minNoticeHours,
        slotDuration: settings.slotDuration
      },
      fullyBookedDates,
      blockedDates, // Bank holidays and other blocked dates
      lunchBlock: blocksSettings.lunchBlock // Send to client for display purposes
    }
  }
)

// ============================================================================
// P2.3: GET TIME SLOTS FOR A DATE
// ============================================================================

export const getBookingTimeSlots = onCall<{ token: string; date: string; type?: 'interview' | 'trial' }>(
  {
    cors: true,
    region: 'europe-west2',
    enforceAppCheck: false, // Allow public access from booking page
    invoker: 'public', // Allow unauthenticated invocations
  },
  async (request) => {
    const { token, date, type } = request.data

    console.log('getBookingTimeSlots called with:', { date, type, hasToken: !!token })

    if (!token || !date) {
      throw new HttpsError('invalid-argument', 'Token and date are required')
    }

    // Skip validation for internal scheduling
    const linkDoc = token !== "__internal__" ? await validateToken(token) : null
    const linkData = linkDoc?.data() || {}
    const bookingType = type || linkData.type || 'interview'
    const branchId = linkData.branchId || null // Get branchId from booking link

    console.log('Booking type determined:', bookingType, 'linkData.type:', linkData.type, 'branchId:', branchId)

    // Get availability settings based on booking type
    let settings: AvailabilitySettings
    let maxTrialsPerDay = 1 // Default

    if (bookingType === 'trial') {
      // Read from trialAvailability settings
      const trialSettings = await getTrialAvailabilitySettings()
      maxTrialsPerDay = trialSettings.maxTrialsPerDay || 1
      console.log('getBookingTimeSlots - Using trial settings:', JSON.stringify(trialSettings.slots), 'maxTrialsPerDay:', maxTrialsPerDay)
      settings = {
        schedule: convertTrialSlotsToSchedule(trialSettings.slots),
        slotDuration: trialSettings.trialDuration, // 240 minutes (4 hours)
        bufferTime: trialSettings.bufferTime,
        advanceBookingDays: trialSettings.maxAdvanceBooking,
        minNoticeHours: trialSettings.minNoticeHours,
        enabled: true
      }
    } else {
      // Read from interviewAvailability settings (also uses slots array format)
      const interviewSettings = await getInterviewAvailabilitySettings()
      console.log('getBookingTimeSlots - Using interview settings:', JSON.stringify(interviewSettings.slots))
      settings = {
        schedule: convertTrialSlotsToSchedule(interviewSettings.slots),
        slotDuration: interviewSettings.slotDuration,
        bufferTime: interviewSettings.bufferTime,
        advanceBookingDays: interviewSettings.maxAdvanceBooking,
        minNoticeHours: interviewSettings.minNoticeHours,
        enabled: true
      }
    }

    console.log('getBookingTimeSlots - Final schedule:', JSON.stringify(settings.schedule))
    console.log('getBookingTimeSlots - slotDuration:', settings.slotDuration, 'bufferTime:', settings.bufferTime)
    
    // Get booking blocks settings
    const blocksSettings = await getBookingBlocksSettings()
    
    // Check if date is a bank holiday
    if (isBankHoliday(date, blocksSettings.bankHolidays)) {
      return { 
        slots: [], 
        date,
        blocked: true,
        blockReason: 'Bank Holiday - No bookings available'
      }
    }
    
    // Get the selected date info
    const selectedDate = new Date(date + 'T00:00:00')
    const dayOfWeek = selectedDate.getDay()
    const dayName = DAYS_FULL[dayOfWeek] as keyof WeeklySchedule
    
    // Get day schedule
    const daySchedule = settings.schedule[dayName]
    
    if (!daySchedule?.enabled || !daySchedule.slots?.length) {
      return { slots: [], date }
    }
    
    // Use duration from settings (already set correctly for trials/interviews)
    const slotDuration = settings.slotDuration || (bookingType === 'trial' ? 240 : 30)
    const bufferTime = settings.bufferTime || 15
    const minNoticeHours = settings.minNoticeHours || 24

    console.log(`getBookingTimeSlots - Using slotDuration: ${slotDuration}, bufferTime: ${bufferTime}, minNoticeHours: ${minNoticeHours}`)

    // For trials, we use larger intervals between start times (1 hour)
    const slotInterval = bookingType === 'trial' ? 60 : slotDuration
    
    // Get existing bookings for this date
    const dayStart = new Date(selectedDate)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(selectedDate)
    dayEnd.setHours(23, 59, 59, 999)
    
    // Query existing bookings - check BOTH scheduledDate and scheduledAt fields
    // (legacy interviews may use scheduledAt, new ones use scheduledDate)
    // Note: Using separate queries and filtering status in-memory to avoid composite index requirement
    let allBookingDocs: admin.firestore.DocumentData[] = []
    let branchTrialCount = 0 // Count trials for THIS BRANCH on this date
    
    try {
      console.log(`Querying interviews for date: ${date}`)
      console.log(`Day range: ${dayStart.toISOString()} to ${dayEnd.toISOString()}`)

      // Query for scheduledDate field (new format) - filter status in memory
      const bookingsWithScheduledDate = await db
        .collection('interviews')
        .where('scheduledDate', '>=', admin.firestore.Timestamp.fromDate(dayStart))
        .where('scheduledDate', '<=', admin.firestore.Timestamp.fromDate(dayEnd))
        .get()

      // Query for scheduledAt field (legacy format) - filter status in memory
      const bookingsWithScheduledAt = await db
        .collection('interviews')
        .where('scheduledAt', '>=', admin.firestore.Timestamp.fromDate(dayStart))
        .where('scheduledAt', '<=', admin.firestore.Timestamp.fromDate(dayEnd))
        .get()

      // Combine results, avoiding duplicates by ID
      const activeStatuses = ['scheduled', 'confirmed']
      const seenIds = new Set<string>()

      bookingsWithScheduledDate.docs.forEach(doc => {
        const data = doc.data()
        if (activeStatuses.includes(data.status) && data.type === bookingType) {
          seenIds.add(doc.id)
          
          // For trials, only count bookings for the SAME BRANCH
          if (bookingType === 'trial') {
            if (branchId && data.branchId === branchId) {
              allBookingDocs.push({ id: doc.id, ...data })
              branchTrialCount++
            }
            // Note: We still need to track ALL trials for time slot conflicts
            // but only same-branch trials count toward maxTrialsPerDay
          } else {
            // For interviews, include all (no branch restriction)
            allBookingDocs.push({ id: doc.id, ...data })
          }
        }
      })
      
      bookingsWithScheduledAt.docs.forEach(doc => {
        const data = doc.data()
        if (!seenIds.has(doc.id) && activeStatuses.includes(data.status) && data.type === bookingType) {
          seenIds.add(doc.id)
          
          if (bookingType === 'trial') {
            if (branchId && data.branchId === branchId) {
              allBookingDocs.push({ id: doc.id, ...data })
              branchTrialCount++
            }
          } else {
            allBookingDocs.push({ id: doc.id, ...data })
          }
        }
      })

      console.log(`Found ${allBookingDocs.length} existing ${bookingType} bookings for ${date} at branch ${branchId}`)
      console.log(`Branch trial count: ${branchTrialCount}, maxTrialsPerDay: ${maxTrialsPerDay}`)
      
      allBookingDocs.forEach(booking => {
        const dateField = booking.scheduledDate || booking.scheduledAt
        console.log(`  - Booking: ${booking.id}, time: ${dateField?.toDate?.()?.toISOString()}, status: ${booking.status}, duration: ${booking.duration}, branchId: ${booking.branchId}`)
      })
    } catch (error) {
      console.error('Failed to get existing bookings:', error)
      allBookingDocs = []
    }
    
    // =========================================================================
    // CHECK MAX TRIALS PER DAY FOR THIS BRANCH
    // =========================================================================
    if (bookingType === 'trial' && branchTrialCount >= maxTrialsPerDay) {
      console.log(`Branch ${branchId} has reached max trials (${branchTrialCount}/${maxTrialsPerDay}) for ${date}`)
      return { 
        slots: [], 
        date,
        blocked: true,
        blockReason: `This branch has reached the maximum of ${maxTrialsPerDay} trial${maxTrialsPerDay > 1 ? 's' : ''} for this day`
      }
    }
    
    // Generate time slots
    const slots: TimeSlot[] = []
    const now = new Date()
    const minNoticeTime = new Date(now.getTime() + minNoticeHours * 60 * 60 * 1000)
    
    for (const slot of daySchedule.slots) {
      const [startHour, startMin] = slot.start.split(':').map(Number)
      const [endHour, endMin] = slot.end.split(':').map(Number)
      
      let currentMinutes = startHour * 60 + startMin
      const endMinutes = endHour * 60 + endMin
      
      while (currentMinutes + slotDuration <= endMinutes) {
        const hours = Math.floor(currentMinutes / 60)
        const mins = currentMinutes % 60
        const timeStr = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
        
        // Create slot start/end times
        const slotStart = new Date(selectedDate)
        slotStart.setHours(hours, mins, 0, 0)
        const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000)
        
        // Check minimum notice
        const meetsNotice = slotStart >= minNoticeTime
        
        // Check for conflicts with existing bookings at THIS BRANCH
        const hasConflict = allBookingDocs.some(booking => {
          // Support both field names
          const existingStart = (booking.scheduledDate || booking.scheduledAt)?.toDate?.()
          if (!existingStart) return false

          const existingDuration = booking.duration || 30
          const existingEnd = new Date(existingStart.getTime() + existingDuration * 60000)

          // Add buffer time to check
          const bufferedSlotStart = new Date(slotStart.getTime() - bufferTime * 60000)
          const bufferedSlotEnd = new Date(slotEnd.getTime() + bufferTime * 60000)

          return bufferedSlotStart < existingEnd && bufferedSlotEnd > existingStart
        })
        
        // Check if slot falls within lunch block (skip for trials - they're 4 hours and will span lunch anyway)
        const inLunchBlock = bookingType !== 'trial' && isInLunchBlock(timeStr, slotDuration, blocksSettings.lunchBlock)

        // Determine availability and reason
        let available = meetsNotice && !hasConflict && !inLunchBlock
        let reason: string | undefined = undefined

        if (!meetsNotice) {
          reason = 'Too short notice'
        } else if (hasConflict) {
          reason = 'Already booked'
        } else if (inLunchBlock) {
          reason = 'Lunch break'
        }
        
        slots.push({
          time: timeStr,
          available,
          ...(reason && { reason })
        })
        
        currentMinutes += slotInterval + bufferTime
      }
    }
    
    const availableSlots = slots.filter(s => s.available)
    console.log(`Generated ${slots.length} total slots, ${availableSlots.length} available for ${date} (type: ${bookingType}, branch: ${branchId})`)
    console.log(`Available slots: ${availableSlots.map(s => s.time).join(', ') || 'none'}`)
    console.log(`Unavailable slots: ${slots.filter(s => !s.available).map(s => `${s.time}(${s.reason})`).join(', ')}`)

    return { slots, date }
  }
)

// ============================================================================
// P2.6: SUBMIT BOOKING (with Teams integration and automatic status update)
// ============================================================================

export const submitBooking = onCall<{ token: string; date: string; time: string }>(
  {
    cors: true,
    region: 'europe-west2',
    enforceAppCheck: false, // Allow public access from booking page
    invoker: 'public', // Allow unauthenticated invocations
    // Include Teams secrets so they're available
    secrets: [msClientId, msClientSecret, msTenantId, msOrganizerUserId],
  },
  async (request) => {
    const { token, date, time } = request.data
    
    if (!token || !date || !time) {
      throw new HttpsError('invalid-argument', 'Token, date, and time are required')
    }
    
    // Skip validation for internal scheduling
    const linkDoc = token !== "__internal__" ? await validateToken(token) : null
    const linkData = linkDoc?.data() || {}
    
    // Get booking blocks settings and validate
    const blocksSettings = await getBookingBlocksSettings()
    
    // Get availability settings for slot duration
    let slotDuration = 30 // default
    try {
      const settingsDoc = await db.collection('settings').doc('interviewAvailability').get()
      if (settingsDoc.exists) {
        slotDuration = settingsDoc.data()?.slotDuration || 30
      }
    } catch (error) {
      console.error('Failed to get slot duration from settings:', error)
    }
    
    // Check if date is a bank holiday
    if (isBankHoliday(date, blocksSettings.bankHolidays)) {
      throw new HttpsError('invalid-argument', 'Cannot book on a bank holiday')
    }
    
    // Determine duration based on type (trials are always 4 hours, interviews use settings)
    const duration = linkData.type === 'trial' ? 240 : slotDuration

    // Check if time falls within lunch block (skip for trials - they span lunch anyway)
    if (linkData.type !== 'trial' && isInLunchBlock(time, duration, blocksSettings.lunchBlock)) {
      throw new HttpsError('invalid-argument', 'Cannot book during lunch break')
    }
    
    // Parse date and time
    const [hours, minutes] = time.split(':').map(Number)
    const scheduledDate = new Date(date + 'T00:00:00')
    scheduledDate.setHours(hours, minutes, 0, 0)
    
    if (isNaN(scheduledDate.getTime())) {
      throw new HttpsError('invalid-argument', 'Invalid date or time format')
    }
    
    // Check if date is in the past
    const now = new Date()
    if (scheduledDate < now) {
      throw new HttpsError('invalid-argument', 'Cannot book a time in the past')
    }
    
    const endTime = new Date(scheduledDate.getTime() + duration * 60000)
    
    // Generate confirmation code
    const confirmationCode = `AP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
    
    // =========================================================================
    // CHECK MAX TRIALS PER DAY FOR BRANCH (for trials only)
    // =========================================================================
    if (linkData.type === 'trial' && linkData.branchId) {
      const trialSettings = await getTrialAvailabilitySettings()
      const maxTrialsPerDay = trialSettings.maxTrialsPerDay || 1
      
      const dayStart = new Date(scheduledDate)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(scheduledDate)
      dayEnd.setHours(23, 59, 59, 999)
      
      // Count existing trials for this branch on this date
      const existingTrials = await db
        .collection('interviews')
        .where('type', '==', 'trial')
        .where('branchId', '==', linkData.branchId)
        .where('scheduledDate', '>=', admin.firestore.Timestamp.fromDate(dayStart))
        .where('scheduledDate', '<=', admin.firestore.Timestamp.fromDate(dayEnd))
        .where('status', 'in', ['scheduled', 'confirmed'])
        .get()
      
      if (existingTrials.size >= maxTrialsPerDay) {
        throw new HttpsError(
          'resource-exhausted', 
          `This branch has reached the maximum of ${maxTrialsPerDay} trial${maxTrialsPerDay > 1 ? 's' : ''} for this day. Please select another date.`
        )
      }
    }
    
    // =========================================================================
    // CREATE TEAMS MEETING FOR INTERVIEWS ONLY
    // =========================================================================
    let teamsMeetingResult: TeamsMeetingResult | null = null
    
    if (linkData.type === 'interview') {
      console.log('Creating Teams meeting for interview...')
      
      const meetingSubject = `Interview: ${linkData.candidateName}${linkData.jobTitle ? ` - ${linkData.jobTitle}` : ''}`
      
      teamsMeetingResult = await createTeamsMeeting(
        meetingSubject,
        scheduledDate,
        endTime,
        linkData.candidateName,
        linkData.jobTitle || undefined,
        linkData.branchName || undefined
      )
      
      if (teamsMeetingResult.success) {
        console.log(`Teams meeting created: ${teamsMeetingResult.joinUrl}`)
      } else {
        // Log warning but don't fail the booking
        console.warn('Teams meeting creation failed:', teamsMeetingResult.error)
      }
    }
    
    // Create interview record
    const interviewData: Record<string, any> = {
      candidateId: linkData.candidateId,
      candidateName: linkData.candidateName,
      candidateEmail: linkData.candidateEmail || null,
      type: linkData.type,
      jobId: linkData.jobId || null,
      jobTitle: linkData.jobTitle || null,
      branchId: linkData.branchId || null,
      branchName: linkData.branchName || null,
      scheduledDate: admin.firestore.Timestamp.fromDate(scheduledDate),
      duration,
      status: 'scheduled',
      bookedVia: 'self_service',
      bookingLinkId: linkDoc?.id || null,
      confirmationCode,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }
    
    // Add Teams meeting details if created successfully
    if (teamsMeetingResult?.success && teamsMeetingResult.joinUrl) {
      interviewData.teamsJoinUrl = teamsMeetingResult.joinUrl
      interviewData.teamsMeetingId = teamsMeetingResult.meetingId || null
      interviewData.meetingType = 'teams'
    }
    
    // Use transaction to ensure atomicity and prevent double-booking
    const interviewRef = db.collection('interviews').doc()

    // Create a slot lock document ID based on date, time, AND BRANCH
    // This allows different branches to book the same time slot
    const slotLockId = linkData.type === 'trial' && linkData.branchId
      ? `${date}_${time.replace(':', '')}_${linkData.branchId}`
      : `${date}_${time.replace(':', '')}`
    const slotLockRef = db.collection('slotLocks').doc(slotLockId)

    await db.runTransaction(async (transaction) => {
      // =========================================================================
      // CHECK FOR SLOT CONFLICTS INSIDE TRANSACTION
      // =========================================================================

      // Check if slot lock exists (another booking for exact same time)
      const slotLockDoc = await transaction.get(slotLockRef)
      if (slotLockDoc.exists) {
        const lockData = slotLockDoc.data()
        // Check if the lock is still valid (interview exists and is scheduled/confirmed)
        if (lockData?.interviewId) {
          const existingInterviewRef = db.collection('interviews').doc(lockData.interviewId)
          const existingInterviewDoc = await transaction.get(existingInterviewRef)
          if (existingInterviewDoc.exists) {
            const existingStatus = existingInterviewDoc.data()?.status
            if (existingStatus === 'scheduled' || existingStatus === 'confirmed') {
              throw new HttpsError('already-exists', 'This time slot has just been booked. Please select another time.')
            }
          }
        }
      }

      // Also check for overlapping bookings (different start times but overlapping duration)
      // For trials: only check same branch. For interviews: check all.
      const dayStart = new Date(scheduledDate)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(scheduledDate)
      dayEnd.setHours(23, 59, 59, 999)

      // Query for scheduledDate field (new format)
      const bookingsWithScheduledDate = await db
        .collection('interviews')
        .where('scheduledDate', '>=', admin.firestore.Timestamp.fromDate(dayStart))
        .where('scheduledDate', '<=', admin.firestore.Timestamp.fromDate(dayEnd))
        .get()

      // Query for scheduledAt field (legacy format)
      const bookingsWithScheduledAt = await db
        .collection('interviews')
        .where('scheduledAt', '>=', admin.firestore.Timestamp.fromDate(dayStart))
        .where('scheduledAt', '<=', admin.firestore.Timestamp.fromDate(dayEnd))
        .get()

      // Combine results and filter appropriately
      const activeStatuses = ['scheduled', 'confirmed']
      const allBookings: admin.firestore.DocumentData[] = []
      const seenIds = new Set<string>()

      bookingsWithScheduledDate.docs.forEach(doc => {
        const data = doc.data()
        // For trials, only check conflicts with same branch
        // For interviews, check all
        if (activeStatuses.includes(data.status) && data.type === linkData.type) {
          if (linkData.type === 'trial') {
            // Only conflict with same branch for trials
            // If either branchId is null/undefined, don't consider it a match (allow booking)
            // Only block if BOTH have branchIds AND they're the same
            const bothHaveBranchIds = data.branchId && linkData.branchId
            const sameBranch = bothHaveBranchIds && data.branchId === linkData.branchId
            if (sameBranch) {
              seenIds.add(doc.id)
              allBookings.push({ id: doc.id, ...data })
            }
          } else {
            seenIds.add(doc.id)
            allBookings.push({ id: doc.id, ...data })
          }
        }
      })
      
      bookingsWithScheduledAt.docs.forEach(doc => {
        const data = doc.data()
        if (!seenIds.has(doc.id) && activeStatuses.includes(data.status) && data.type === linkData.type) {
          if (linkData.type === 'trial') {
            // Only conflict with same branch for trials
            // If either branchId is null/undefined, don't consider it a match (allow booking)
            const bothHaveBranchIds = data.branchId && linkData.branchId
            const sameBranch = bothHaveBranchIds && data.branchId === linkData.branchId
            if (sameBranch) {
              allBookings.push({ id: doc.id, ...data })
            }
          } else {
            allBookings.push({ id: doc.id, ...data })
          }
        }
      })

      const hasOverlap = allBookings.some(booking => {
        const existingStart = (booking.scheduledDate || booking.scheduledAt)?.toDate?.()
        if (!existingStart) return false

        const existingDuration = booking.duration || 30
        const existingEnd = new Date(existingStart.getTime() + existingDuration * 60000)

        // Check overlap: new booking overlaps if it starts before existing ends AND ends after existing starts
        return scheduledDate < existingEnd && endTime > existingStart
      })

      if (hasOverlap) {
        throw new HttpsError('already-exists', 'This time slot conflicts with an existing booking. Please select another time.')
      }

      // =========================================================================
      // RE-CHECK BOOKING LINK STATUS
      // =========================================================================
      if (linkDoc) {
        const freshLinkDoc = await transaction.get(linkDoc.ref)
        const freshLinkData = freshLinkDoc.data()

        if (!freshLinkData || freshLinkData.status !== 'active') {
          throw new HttpsError('not-found', 'Booking link is no longer valid')
        }

        if ((freshLinkData.useCount || 0) >= (freshLinkData.maxUses || 1)) {
          throw new HttpsError('not-found', 'This booking link has already been used')
        }
      }

      // =========================================================================
      // CREATE SLOT LOCK AND INTERVIEW
      // =========================================================================

      // Create slot lock to prevent race conditions
      transaction.set(slotLockRef, {
        date,
        time,
        interviewId: interviewRef.id,
        candidateId: linkData.candidateId,
        branchId: linkData.branchId || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      })

      // Create interview
      transaction.set(interviewRef, interviewData)

      // Update booking link (only for external bookings)
      if (linkDoc) {
        transaction.update(linkDoc.ref, {
          status: 'used',
          useCount: admin.firestore.FieldValue.increment(1),
          usedAt: admin.firestore.FieldValue.serverTimestamp(),
          interviewId: interviewRef.id,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        })
      }
    })
    
    console.log(`Booking created: ${interviewRef.id} for ${linkData.candidateName}`)
    if (teamsMeetingResult?.success) {
      console.log(`Teams meeting URL: ${teamsMeetingResult.joinUrl}`)
    }
    
    // =========================================================================
    // AUTOMATICALLY UPDATE CANDIDATE STATUS
    // =========================================================================
    const newStatus = linkData.type === 'interview' ? 'interview_scheduled' : 'trial_scheduled'
    await updateCandidateStatus(
      linkData.candidateId,
      newStatus,
      `Candidate booked ${linkData.type} via self-service booking`
    )
    
    // =========================================================================
    // SEND BRANCH NOTIFICATION FOR TRIALS
    // =========================================================================
    if (linkData.type === 'trial' && linkData.branchId) {
      try {
        // Get branch email
        const branchDoc = await db.collection('branches').doc(linkData.branchId).get()
        const branchData = branchDoc.data()
        const branchEmail = branchData?.email
        
        if (branchEmail) {
          // Send notification email to branch using Microsoft Graph
          const { getAccessToken } = await import('./teamsMeeting')
          
          // Get secret values
          const clientId = msClientId.value()
          const clientSecret = msClientSecret.value()
          const tenantId = msTenantId.value()
          const organizerUserId = msOrganizerUserId.value()
          
          if (clientId && clientSecret && tenantId && organizerUserId) {
            const accessToken = await getAccessToken(clientId, clientSecret, tenantId)
            
            const formattedDate = scheduledDate.toLocaleDateString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            })
            const formattedTime = scheduledDate.toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit'
            })
            
            const emailBody = `
              <h2>New Trial Booking</h2>
              <p>A candidate has booked a trial at your branch:</p>
              <ul>
                <li><strong>Candidate:</strong> ${linkData.candidateName}</li>
                <li><strong>Date:</strong> ${formattedDate}</li>
                <li><strong>Time:</strong> ${formattedTime}</li>
                <li><strong>Duration:</strong> ${duration} minutes</li>
                ${linkData.jobTitle ? `<li><strong>Position:</strong> ${linkData.jobTitle}</li>` : ''}
              </ul>
              <p>Please ensure someone is available to supervise the trial.</p>
            `
            
            const graphUrl = `https://graph.microsoft.com/v1.0/users/${organizerUserId}/sendMail`
            await fetch(graphUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                message: {
                  subject: `Trial Booking: ${linkData.candidateName} - ${formattedDate}`,
                  body: { contentType: 'HTML', content: emailBody },
                  toRecipients: [{ emailAddress: { address: branchEmail } }]
                }
              })
            })
            console.log('Branch notification sent for trial booking')
          }
        }
      } catch (error) {
        console.warn('Failed to send branch notification:', error)
        // Don't fail the booking if notification fails
      }
    }
    
    // =========================================================================
    // SEND EMAIL CONFIRMATION TO CANDIDATE
    // =========================================================================
    let emailSent = false
    
    if (linkData.candidateEmail) {
      console.log(`Sending confirmation email to: ${linkData.candidateEmail}`)
      
      const emailResult = await sendConfirmationEmail(
        linkData.candidateEmail,
        linkData.candidateName,
        scheduledDate,
        linkData.type,
        teamsMeetingResult?.joinUrl || undefined,
        linkData.jobTitle || undefined,
        linkData.branchName || undefined,
        confirmationCode,
        duration
      )
      
      emailSent = emailResult.success
      
      if (emailResult.success) {
        console.log('Confirmation email sent successfully')
        // Update interview record with email status
        await interviewRef.update({
          emailConfirmationSent: true,
          emailConfirmationSentAt: admin.firestore.FieldValue.serverTimestamp()
        })
      } else {
        console.warn('Failed to send confirmation email:', emailResult.error)
      }
    } else {
      console.log('No candidate email available, skipping email confirmation')
    }
    
    return {
      success: true,
      interviewId: interviewRef.id,
      confirmationCode,
      // Include Teams link in response so booking confirmation page can show it
      teamsJoinUrl: teamsMeetingResult?.joinUrl || null,
      emailSent,
    }
  }
)

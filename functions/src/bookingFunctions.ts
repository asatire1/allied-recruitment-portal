/**
 * Booking Cloud Functions
 * P2.2: Get availability settings
 * P2.3: Get time slots for a date
 * P2.4: Slot conflict checking
 * P2.6: Submit booking
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import * as crypto from 'crypto'

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

interface TimeSlot {
  time: string
  available: boolean
}

// Settings page slot format (dayOfWeek-based)
interface SettingsSlot {
  dayOfWeek: number
  enabled: boolean
  startTime: string
  endTime: string
}

// ============================================================================
// HELPERS
// ============================================================================

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

const DAYS_FULL = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function getDefaultSettings(): AvailabilitySettings {
  return {
    schedule: {
      monday: { enabled: true, slots: [{ start: '09:00', end: '17:00' }] },
      tuesday: { enabled: true, slots: [{ start: '09:00', end: '17:00' }] },
      wednesday: { enabled: true, slots: [{ start: '09:00', end: '17:00' }] },
      thursday: { enabled: true, slots: [{ start: '09:00', end: '17:00' }] },
      friday: { enabled: true, slots: [{ start: '09:00', end: '17:00' }] },
      saturday: { enabled: false, slots: [] },
      sunday: { enabled: false, slots: [] }
    },
    slotDuration: 30,
    bufferTime: 15,
    advanceBookingDays: 14,
    minNoticeHours: 24,
    enabled: true
  }
}

/**
 * Convert Settings page slot format to DatePicker schedule format
 * Settings page uses: slots: [{ dayOfWeek: 0, enabled: true, startTime: '09:00', endTime: '17:00' }]
 * DatePicker expects: schedule: { sunday: { enabled: true, slots: [{ start: '09:00', end: '17:00' }] } }
 */
function convertSlotsToSchedule(slots: SettingsSlot[]): WeeklySchedule {
  const schedule: WeeklySchedule = {}
  
  // Initialize all days as disabled with empty slots
  DAYS_FULL.forEach((dayName, index) => {
    schedule[dayName as keyof WeeklySchedule] = {
      enabled: false,
      slots: []
    }
  })
  
  // Convert each slot from the Settings format
  if (Array.isArray(slots)) {
    slots.forEach(slot => {
      const dayName = DAYS_FULL[slot.dayOfWeek] as keyof WeeklySchedule
      if (dayName && schedule[dayName]) {
        schedule[dayName] = {
          enabled: slot.enabled,
          slots: slot.enabled && slot.startTime && slot.endTime 
            ? [{ start: slot.startTime, end: slot.endTime }]
            : []
        }
      }
    })
  }
  
  return schedule
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
// P2.2: GET BOOKING AVAILABILITY
// ============================================================================

export const getBookingAvailability = onCall<{ token: string }>(
  { cors: true, region: 'us-central1' },
  async (request) => {
    const { token } = request.data
    
    if (!token) {
      throw new HttpsError('invalid-argument', 'Token is required')
    }
    
    // Validate token and get booking link data
    const linkDoc = await validateToken(token)
    const linkData = linkDoc.data()!
    const bookingType = linkData.type // 'interview' or 'trial'
    
    // Determine which settings document to use based on booking type
    const settingsDocId = bookingType === 'trial' ? 'trialAvailability' : 'interviewAvailability'
    
    // Get availability settings
    let settings: AvailabilitySettings
    try {
      const settingsDoc = await db.collection('settings').doc(settingsDocId).get()
      
      if (settingsDoc.exists) {
        const data = settingsDoc.data()
        
        // Check if data uses the old 'schedule' format or new 'slots' format
        let schedule: WeeklySchedule
        
        if (data?.schedule) {
          // Old format - already has schedule object
          schedule = data.schedule
        } else if (data?.slots && Array.isArray(data.slots)) {
          // New format from Settings page - needs conversion
          schedule = convertSlotsToSchedule(data.slots)
        } else {
          // No valid data - use defaults
          schedule = getDefaultSettings().schedule
        }
        
        settings = {
          schedule,
          slotDuration: data?.slotDuration || 30,
          bufferTime: data?.bufferTime || 15,
          advanceBookingDays: data?.maxAdvanceBooking || data?.advanceBookingDays || 14,
          minNoticeHours: data?.minNoticeHours || 24,
          enabled: data?.enabled !== false
        }
      } else {
        // Also try the legacy 'bookingAvailability' document
        const legacyDoc = await db.collection('settings').doc('bookingAvailability').get()
        
        if (legacyDoc.exists) {
          const data = legacyDoc.data()
          
          let schedule: WeeklySchedule
          if (data?.schedule) {
            schedule = data.schedule
          } else if (data?.slots && Array.isArray(data.slots)) {
            schedule = convertSlotsToSchedule(data.slots)
          } else {
            schedule = getDefaultSettings().schedule
          }
          
          settings = {
            schedule,
            slotDuration: data?.slotDuration || 30,
            bufferTime: data?.bufferTime || 15,
            advanceBookingDays: data?.maxAdvanceBooking || data?.advanceBookingDays || 14,
            minNoticeHours: data?.minNoticeHours || 24,
            enabled: data?.enabled !== false
          }
        } else {
          settings = getDefaultSettings()
        }
      }
    } catch (error) {
      console.error('Failed to get settings:', error)
      settings = getDefaultSettings()
    }
    
    // Log for debugging
    console.log(`Booking availability for ${bookingType}:`, {
      settingsDocId,
      scheduleKeys: Object.keys(settings.schedule),
      mondayEnabled: settings.schedule.monday?.enabled,
      advanceBookingDays: settings.advanceBookingDays
    })
    
    // Get fully booked dates (dates where all slots are taken)
    const fullyBookedDates: string[] = []
    
    // Query interviews in the booking window
    const now = new Date()
    const maxDate = new Date(now)
    maxDate.setDate(maxDate.getDate() + settings.advanceBookingDays)
    
    try {
      const interviewsSnapshot = await db
        .collection('interviews')
        .where('scheduledDate', '>=', admin.firestore.Timestamp.fromDate(now))
        .where('scheduledDate', '<=', admin.firestore.Timestamp.fromDate(maxDate))
        .where('status', 'in', ['scheduled', 'confirmed'])
        .get()
      
      // Group by date and count
      const bookingsByDate: Record<string, number> = {}
      interviewsSnapshot.docs.forEach(doc => {
        const data = doc.data()
        const date = data.scheduledDate?.toDate?.()
        if (date) {
          const dateStr = date.toISOString().split('T')[0]
          bookingsByDate[dateStr] = (bookingsByDate[dateStr] || 0) + 1
        }
      })
      
      // Mark dates as fully booked if they exceed threshold
      // For simplicity, we consider a date fully booked if it has 8+ bookings
      Object.entries(bookingsByDate).forEach(([dateStr, count]) => {
        if (count >= 8) {
          fullyBookedDates.push(dateStr)
        }
      })
    } catch (error) {
      console.error('Failed to get bookings:', error)
    }
    
    return {
      settings,
      fullyBookedDates
    }
  }
)

// ============================================================================
// P2.3 & P2.4: GET TIME SLOTS FOR DATE
// ============================================================================

export const getBookingTimeSlots = onCall<{ token: string; date: string }>(
  { cors: true, region: 'us-central1' },
  async (request) => {
    const { token, date } = request.data
    
    if (!token || !date) {
      throw new HttpsError('invalid-argument', 'Token and date are required')
    }
    
    // Validate token and get booking link data
    const linkDoc = await validateToken(token)
    const linkData = linkDoc.data()!
    const bookingType = linkData.type
    
    // Parse date
    const selectedDate = new Date(date + 'T00:00:00')
    if (isNaN(selectedDate.getTime())) {
      throw new HttpsError('invalid-argument', 'Invalid date format')
    }
    
    // Determine which settings to use
    const settingsDocId = bookingType === 'trial' ? 'trialAvailability' : 'interviewAvailability'
    
    // Get availability settings
    let settings: AvailabilitySettings
    try {
      const settingsDoc = await db.collection('settings').doc(settingsDocId).get()
      
      if (settingsDoc.exists) {
        const data = settingsDoc.data()
        
        let schedule: WeeklySchedule
        if (data?.schedule) {
          schedule = data.schedule
        } else if (data?.slots && Array.isArray(data.slots)) {
          schedule = convertSlotsToSchedule(data.slots)
        } else {
          schedule = getDefaultSettings().schedule
        }
        
        settings = {
          schedule,
          slotDuration: data?.slotDuration || 30,
          bufferTime: data?.bufferTime || 15,
          advanceBookingDays: data?.maxAdvanceBooking || data?.advanceBookingDays || 14,
          minNoticeHours: data?.minNoticeHours || 24,
          enabled: data?.enabled !== false
        }
      } else {
        // Try legacy document
        const legacyDoc = await db.collection('settings').doc('bookingAvailability').get()
        
        if (legacyDoc.exists) {
          const data = legacyDoc.data()
          
          let schedule: WeeklySchedule
          if (data?.schedule) {
            schedule = data.schedule
          } else if (data?.slots && Array.isArray(data.slots)) {
            schedule = convertSlotsToSchedule(data.slots)
          } else {
            schedule = getDefaultSettings().schedule
          }
          
          settings = {
            schedule,
            slotDuration: data?.slotDuration || 30,
            bufferTime: data?.bufferTime || 15,
            advanceBookingDays: data?.maxAdvanceBooking || data?.advanceBookingDays || 14,
            minNoticeHours: data?.minNoticeHours || 24,
            enabled: data?.enabled !== false
          }
        } else {
          settings = getDefaultSettings()
        }
      }
    } catch {
      settings = getDefaultSettings()
    }
    
    // Get day schedule
    const dayName = DAYS_FULL[selectedDate.getDay()] as keyof WeeklySchedule
    const daySchedule = settings.schedule[dayName]
    
    if (!daySchedule?.enabled || !daySchedule.slots?.length) {
      return { slots: [], date }
    }
    
    // Determine duration based on booking type
    const duration = linkData.type === 'trial' ? 240 : (settings.slotDuration || 30)
    const bufferTime = settings.bufferTime || 15
    const minNoticeHours = settings.minNoticeHours || 24
    
    // Get existing bookings for this date
    const dayStart = new Date(selectedDate)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(selectedDate)
    dayEnd.setHours(23, 59, 59, 999)
    
    const existingBookings: Array<{ startMinutes: number; endMinutes: number }> = []
    
    try {
      const bookingsSnapshot = await db
        .collection('interviews')
        .where('scheduledDate', '>=', admin.firestore.Timestamp.fromDate(dayStart))
        .where('scheduledDate', '<=', admin.firestore.Timestamp.fromDate(dayEnd))
        .where('status', 'in', ['scheduled', 'confirmed'])
        .get()
      
      bookingsSnapshot.docs.forEach(doc => {
        const data = doc.data()
        const bookingDate = data.scheduledDate?.toDate?.()
        if (bookingDate) {
          const startMinutes = bookingDate.getHours() * 60 + bookingDate.getMinutes()
          const bookingDuration = data.duration || 30
          existingBookings.push({
            startMinutes,
            endMinutes: startMinutes + bookingDuration
          })
        }
      })
    } catch (error) {
      console.error('Failed to get existing bookings:', error)
    }
    
    // Generate time slots
    const slots: TimeSlot[] = []
    const now = new Date()
    const minBookingTime = new Date(now.getTime() + minNoticeHours * 60 * 60 * 1000)
    
    // For trials, use duration-based intervals; for interviews use 30-min intervals
    const slotInterval = duration >= 240 ? duration : 30
    
    for (const windowSlot of daySchedule.slots) {
      const [startHour, startMin] = windowSlot.start.split(':').map(Number)
      const [endHour, endMin] = windowSlot.end.split(':').map(Number)
      
      let currentMinutes = startHour * 60 + startMin
      const endMinutes = endHour * 60 + endMin
      
      while (currentMinutes + duration <= endMinutes) {
        const hour = Math.floor(currentMinutes / 60)
        const min = currentMinutes % 60
        const timeStr = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`
        
        // Create slot datetime for comparison
        const slotDate = new Date(selectedDate)
        slotDate.setHours(hour, min, 0, 0)
        
        // Check if slot meets minimum notice requirement
        const meetsNotice = slotDate > minBookingTime
        
        // Check for conflicts with existing bookings
        const slotEndMinutes = currentMinutes + duration
        const hasConflict = existingBookings.some(booking => {
          return currentMinutes < booking.endMinutes && slotEndMinutes > booking.startMinutes
        })
        
        slots.push({
          time: timeStr,
          available: meetsNotice && !hasConflict
        })
        
        currentMinutes += slotInterval + bufferTime
      }
    }
    
    return { slots, date }
  }
)

// ============================================================================
// P2.6: SUBMIT BOOKING
// ============================================================================

export const submitBooking = onCall<{ token: string; date: string; time: string }>(
  { cors: true, region: 'us-central1' },
  async (request) => {
    const { token, date, time } = request.data
    
    if (!token || !date || !time) {
      throw new HttpsError('invalid-argument', 'Token, date, and time are required')
    }
    
    // Validate token
    const linkDoc = await validateToken(token)
    const linkData = linkDoc.data()!
    
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
    
    // Determine duration
    const duration = linkData.type === 'trial' ? 240 : 30
    const endTime = new Date(scheduledDate.getTime() + duration * 60000)
    
    // Check for conflicts (double-booking prevention)
    const dayStart = new Date(scheduledDate)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(scheduledDate)
    dayEnd.setHours(23, 59, 59, 999)
    
    const existingBookings = await db
      .collection('interviews')
      .where('scheduledDate', '>=', admin.firestore.Timestamp.fromDate(dayStart))
      .where('scheduledDate', '<=', admin.firestore.Timestamp.fromDate(dayEnd))
      .where('status', 'in', ['scheduled', 'confirmed'])
      .get()
    
    const hasConflict = existingBookings.docs.some(doc => {
      const data = doc.data()
      const existingStart = data.scheduledDate?.toDate?.()
      if (!existingStart) return false
      
      const existingDuration = data.duration || 30
      const existingEnd = new Date(existingStart.getTime() + existingDuration * 60000)
      
      // Check overlap
      return scheduledDate < existingEnd && endTime > existingStart
    })
    
    if (hasConflict) {
      throw new HttpsError('already-exists', 'This time slot has just been booked. Please select another time.')
    }
    
    // Generate confirmation code
    const confirmationCode = `AP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
    
    // Create interview record
    const interviewData = {
      candidateId: linkData.candidateId,
      candidateName: linkData.candidateName,
      candidateEmail: linkData.candidateEmail || null,
      candidatePhone: linkData.candidatePhone || null,
      type: linkData.type,
      jobId: linkData.jobId || null,
      jobTitle: linkData.jobTitle || null,
      branchId: linkData.branchId || null,
      branchName: linkData.branchName || null,
      scheduledDate: admin.firestore.Timestamp.fromDate(scheduledDate),
      duration,
      status: 'scheduled',
      bookedVia: 'self_service',
      bookingLinkId: linkDoc.id,
      confirmationCode,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }
    
    // Use transaction to ensure atomicity
    const interviewRef = db.collection('interviews').doc()
    
    await db.runTransaction(async (transaction) => {
      // Re-check booking link status
      const freshLinkDoc = await transaction.get(linkDoc.ref)
      const freshLinkData = freshLinkDoc.data()
      
      if (!freshLinkData || freshLinkData.status !== 'active') {
        throw new HttpsError('not-found', 'Booking link is no longer valid')
      }
      
      if ((freshLinkData.useCount || 0) >= (freshLinkData.maxUses || 1)) {
        throw new HttpsError('not-found', 'This booking link has already been used')
      }
      
      // Create interview
      transaction.set(interviewRef, interviewData)
      
      // Update booking link
      transaction.update(linkDoc.ref, {
        status: 'used',
        useCount: admin.firestore.FieldValue.increment(1),
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
        interviewId: interviewRef.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      })
    })
    
    console.log(`Booking created: ${interviewRef.id} for ${linkData.candidateName}`)
    
    return {
      success: true,
      interviewId: interviewRef.id,
      confirmationCode
    }
  }
)

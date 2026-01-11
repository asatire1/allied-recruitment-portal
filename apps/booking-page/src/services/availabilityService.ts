/**
 * Availability Service
 * P2.2: Query settings for open slots
 * P2.4: Slot conflict checking
 */

import { httpsCallable } from 'firebase/functions'
import { functionsEU } from '../lib/firebase'

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

export interface AvailabilitySettings {
  schedule: WeeklySchedule
  slotDuration: number      // Minutes
  bufferTime: number        // Minutes between slots
  advanceBookingDays: number
  minNoticeHours: number
  enabled: boolean
}

export interface TimeSlot {
  time: string
  available: boolean
  bookedCount?: number
}

export interface GetAvailabilityResponse {
  settings: AvailabilitySettings
  fullyBookedDates: string[]  // ISO date strings
  blockedDates?: string[]     // Bank holidays + custom blocked dates
}

export interface GetTimeSlotsRequest {
  token: string
  date: string  // ISO date string
}

export interface GetTimeSlotsResponse {
  slots: TimeSlot[]
  date: string
}

// ============================================================================
// API CALLS
// ============================================================================

/**
 * Get availability settings and fully booked dates
 */
export async function getAvailability(token: string): Promise<GetAvailabilityResponse> {
  try {
    const getAvailabilityFn = httpsCallable<{ token: string }, GetAvailabilityResponse>(
      functionsEU,
      'getBookingAvailability'
    )
    
    const result = await getAvailabilityFn({ token })
    return result.data
  } catch (error) {
    console.error('Failed to get availability:', error)
    
    // Return default settings if function fails
    return {
      settings: getDefaultAvailabilitySettings(),
      fullyBookedDates: []
    }
  }
}

/**
 * Get available time slots for a specific date
 */
export async function getTimeSlots(
  token: string, 
  date: Date
): Promise<TimeSlot[]> {
  try {
    const getTimeSlotsFn = httpsCallable<GetTimeSlotsRequest, GetTimeSlotsResponse>(
      functionsEU,
      'getBookingTimeSlots'
    )
    
    const result = await getTimeSlotsFn({ 
      token, 
      date: date.toISOString().split('T')[0] 
    })
    
    return result.data.slots
  } catch (error) {
    console.error('Failed to get time slots:', error)
    return []
  }
}

// ============================================================================
// CLIENT-SIDE SLOT GENERATION (FALLBACK)
// ============================================================================

/**
 * Default availability settings
 */
export function getDefaultAvailabilitySettings(): AvailabilitySettings {
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
 * Generate time slots for a date based on schedule
 * Used as fallback if Cloud Function is unavailable
 */
export function generateTimeSlots(
  date: Date,
  schedule: WeeklySchedule,
  duration: number,
  bufferTime: number,
  minNoticeHours: number,
  existingBookings: Array<{ startTime: Date; endTime: Date }> = []
): TimeSlot[] {
  const DAYS_FULL = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const dayName = DAYS_FULL[date.getDay()] as keyof WeeklySchedule
  const daySchedule = schedule[dayName]
  
  if (!daySchedule?.enabled || !daySchedule.slots?.length) {
    return []
  }
  
  const slots: TimeSlot[] = []
  const now = new Date()
  const minBookingTime = new Date(now.getTime() + minNoticeHours * 60 * 60 * 1000)
  
  // For trials (4+ hours), use larger intervals
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
      const slotStart = new Date(date)
      slotStart.setHours(hour, min, 0, 0)
      const slotEnd = new Date(slotStart.getTime() + duration * 60000)
      
      // Check if slot is in the future with enough notice
      const meetsNoticeRequirement = slotStart > minBookingTime
      
      // Check for conflicts with existing bookings
      const hasConflict = existingBookings.some(booking => {
        return slotStart < booking.endTime && slotEnd > booking.startTime
      })
      
      slots.push({
        time: timeStr,
        available: meetsNoticeRequirement && !hasConflict
      })
      
      currentMinutes += slotInterval + bufferTime
    }
  }
  
  return slots
}

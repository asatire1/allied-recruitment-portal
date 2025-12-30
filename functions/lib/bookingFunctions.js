"use strict";
/**
* Booking Cloud Functions
* P2.2: Get availability settings
* P2.3: Get time slots for a date
* P2.4: Slot conflict checking
* P2.6: Submit booking
*
* Updated: Teams meeting integration for interviews
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitBooking = exports.getBookingTimeSlots = exports.getBookingAvailability = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
const teamsMeeting_1 = require("./teamsMeeting");
const db = admin.firestore();
// ============================================================================
// HELPERS
// ============================================================================
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}
const DAYS_FULL = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function getDefaultSettings() {
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
    };
}
async function validateToken(token) {
    const tokenHash = hashToken(token.trim());
    const snapshot = await db
        .collection('bookingLinks')
        .where('tokenHash', '==', tokenHash)
        .where('status', '==', 'active')
        .limit(1)
        .get();
    if (snapshot.empty) {
        throw new https_1.HttpsError('not-found', 'Invalid or expired booking link');
    }
    const doc = snapshot.docs[0];
    const link = doc.data();
    // Check expiry
    const expiresAt = link.expiresAt?.toDate?.() || new Date(0);
    if (expiresAt < new Date()) {
        await doc.ref.update({ status: 'expired' });
        throw new https_1.HttpsError('not-found', 'Invalid or expired booking link');
    }
    // Check usage
    if ((link.useCount || 0) >= (link.maxUses || 1)) {
        throw new https_1.HttpsError('not-found', 'This booking link has already been used');
    }
    return doc;
}
// ============================================================================
// P2.2: GET BOOKING AVAILABILITY
// ============================================================================
exports.getBookingAvailability = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (request) => {
    const { token } = request.data;
    if (!token) {
        throw new https_1.HttpsError('invalid-argument', 'Token is required');
    }
    // Validate token
    await validateToken(token);
    // Get availability settings
    let settings;
    try {
        const settingsDoc = await db.collection('settings').doc('bookingAvailability').get();
        if (settingsDoc.exists) {
            const data = settingsDoc.data();
            settings = {
                schedule: data?.schedule || getDefaultSettings().schedule,
                slotDuration: data?.slotDuration || 30,
                bufferTime: data?.bufferTime || 15,
                advanceBookingDays: data?.advanceBookingDays || 14,
                minNoticeHours: data?.minNoticeHours || 24,
                enabled: data?.enabled !== false
            };
        }
        else {
            settings = getDefaultSettings();
        }
    }
    catch (error) {
        console.error('Failed to get settings:', error);
        settings = getDefaultSettings();
    }
    // Get fully booked dates (dates where all slots are taken)
    const fullyBookedDates = [];
    // Query interviews in the booking window
    const now = new Date();
    const maxDate = new Date(now);
    maxDate.setDate(maxDate.getDate() + settings.advanceBookingDays);
    try {
        const interviewsSnapshot = await db
            .collection('interviews')
            .where('scheduledDate', '>=', admin.firestore.Timestamp.fromDate(now))
            .where('scheduledDate', '<=', admin.firestore.Timestamp.fromDate(maxDate))
            .where('status', 'in', ['scheduled', 'confirmed'])
            .get();
        // Group by date and count
        const bookingsByDate = {};
        interviewsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const date = data.scheduledDate?.toDate?.();
            if (date) {
                const dateStr = date.toISOString().split('T')[0];
                bookingsByDate[dateStr] = (bookingsByDate[dateStr] || 0) + 1;
            }
        });
        // Mark dates as fully booked if they exceed threshold
        // For simplicity, we consider a date fully booked if it has 8+ bookings
        Object.entries(bookingsByDate).forEach(([dateStr, count]) => {
            if (count >= 8) {
                fullyBookedDates.push(dateStr);
            }
        });
    }
    catch (error) {
        console.error('Failed to get bookings:', error);
    }
    return {
        settings,
        fullyBookedDates
    };
});
// ============================================================================
// P2.3 & P2.4: GET TIME SLOTS FOR DATE
// ============================================================================
exports.getBookingTimeSlots = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (request) => {
    const { token, date } = request.data;
    if (!token || !date) {
        throw new https_1.HttpsError('invalid-argument', 'Token and date are required');
    }
    // Validate token and get booking link data
    const linkDoc = await validateToken(token);
    const linkData = linkDoc.data();
    // Parse date
    const selectedDate = new Date(date + 'T00:00:00');
    if (isNaN(selectedDate.getTime())) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid date format');
    }
    // Get availability settings
    let settings;
    try {
        const settingsDoc = await db.collection('settings').doc('bookingAvailability').get();
        settings = settingsDoc.exists ? settingsDoc.data() : getDefaultSettings();
    }
    catch {
        settings = getDefaultSettings();
    }
    // Get day schedule
    const dayName = DAYS_FULL[selectedDate.getDay()];
    const daySchedule = settings.schedule[dayName];
    if (!daySchedule?.enabled || !daySchedule.slots?.length) {
        return { slots: [], date };
    }
    // Determine duration based on booking type
    const duration = linkData.type === 'trial' ? 240 : (settings.slotDuration || 30);
    const bufferTime = settings.bufferTime || 15;
    const minNoticeHours = settings.minNoticeHours || 24;
    // Get existing bookings for this date
    const dayStart = new Date(selectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDate);
    dayEnd.setHours(23, 59, 59, 999);
    const existingBookings = [];
    try {
        const bookingsSnapshot = await db
            .collection('interviews')
            .where('scheduledDate', '>=', admin.firestore.Timestamp.fromDate(dayStart))
            .where('scheduledDate', '<=', admin.firestore.Timestamp.fromDate(dayEnd))
            .where('status', 'in', ['scheduled', 'confirmed'])
            .get();
        bookingsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const bookingDate = data.scheduledDate?.toDate?.();
            if (bookingDate) {
                const startMinutes = bookingDate.getHours() * 60 + bookingDate.getMinutes();
                const bookingDuration = data.duration || 30;
                existingBookings.push({
                    startMinutes,
                    endMinutes: startMinutes + bookingDuration
                });
            }
        });
    }
    catch (error) {
        console.error('Failed to get existing bookings:', error);
    }
    // Generate time slots
    const slots = [];
    const now = new Date();
    const minBookingTime = new Date(now.getTime() + minNoticeHours * 60 * 60 * 1000);
    // For trials, use duration-based intervals; for interviews use 30-min intervals
    const slotInterval = duration >= 240 ? duration : 30;
    for (const windowSlot of daySchedule.slots) {
        const [startHour, startMin] = windowSlot.start.split(':').map(Number);
        const [endHour, endMin] = windowSlot.end.split(':').map(Number);
        let currentMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;
        while (currentMinutes + duration <= endMinutes) {
            const hour = Math.floor(currentMinutes / 60);
            const min = currentMinutes % 60;
            const timeStr = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
            // Create slot datetime for comparison
            const slotDate = new Date(selectedDate);
            slotDate.setHours(hour, min, 0, 0);
            // Check if slot meets minimum notice requirement
            const meetsNotice = slotDate > minBookingTime;
            // Check for conflicts with existing bookings
            const slotEndMinutes = currentMinutes + duration;
            const hasConflict = existingBookings.some(booking => {
                return currentMinutes < booking.endMinutes && slotEndMinutes > booking.startMinutes;
            });
            slots.push({
                time: timeStr,
                available: meetsNotice && !hasConflict
            });
            currentMinutes += slotInterval + bufferTime;
        }
    }
    return { slots, date };
});
// ============================================================================
// P2.6: SUBMIT BOOKING (with Teams integration for interviews)
// ============================================================================
exports.submitBooking = (0, https_1.onCall)({
    cors: true,
    region: 'us-central1',
    // Include Teams secrets so they're available
    secrets: [teamsMeeting_1.msClientId, teamsMeeting_1.msClientSecret, teamsMeeting_1.msTenantId, teamsMeeting_1.msOrganizerUserId],
}, async (request) => {
    const { token, date, time } = request.data;
    if (!token || !date || !time) {
        throw new https_1.HttpsError('invalid-argument', 'Token, date, and time are required');
    }
    // Validate token
    const linkDoc = await validateToken(token);
    const linkData = linkDoc.data();
    // Parse date and time
    const [hours, minutes] = time.split(':').map(Number);
    const scheduledDate = new Date(date + 'T00:00:00');
    scheduledDate.setHours(hours, minutes, 0, 0);
    if (isNaN(scheduledDate.getTime())) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid date or time format');
    }
    // Check if date is in the past
    const now = new Date();
    if (scheduledDate < now) {
        throw new https_1.HttpsError('invalid-argument', 'Cannot book a time in the past');
    }
    // Determine duration
    const duration = linkData.type === 'trial' ? 240 : 30;
    const endTime = new Date(scheduledDate.getTime() + duration * 60000);
    // Check for conflicts (double-booking prevention)
    const dayStart = new Date(scheduledDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(scheduledDate);
    dayEnd.setHours(23, 59, 59, 999);
    const existingBookings = await db
        .collection('interviews')
        .where('scheduledDate', '>=', admin.firestore.Timestamp.fromDate(dayStart))
        .where('scheduledDate', '<=', admin.firestore.Timestamp.fromDate(dayEnd))
        .where('status', 'in', ['scheduled', 'confirmed'])
        .get();
    const hasConflict = existingBookings.docs.some(doc => {
        const data = doc.data();
        const existingStart = data.scheduledDate?.toDate?.();
        if (!existingStart)
            return false;
        const existingDuration = data.duration || 30;
        const existingEnd = new Date(existingStart.getTime() + existingDuration * 60000);
        // Check overlap
        return scheduledDate < existingEnd && endTime > existingStart;
    });
    if (hasConflict) {
        throw new https_1.HttpsError('already-exists', 'This time slot has just been booked. Please select another time.');
    }
    // Generate confirmation code
    const confirmationCode = `AP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    // =========================================================================
    // CREATE TEAMS MEETING FOR INTERVIEWS ONLY
    // =========================================================================
    let teamsMeetingResult = null;
    if (linkData.type === 'interview') {
        console.log('Creating Teams meeting for interview...');
        const meetingSubject = `Interview: ${linkData.candidateName}${linkData.jobTitle ? ` - ${linkData.jobTitle}` : ''}`;
        teamsMeetingResult = await (0, teamsMeeting_1.createTeamsMeeting)(meetingSubject, scheduledDate, endTime, linkData.candidateName, linkData.jobTitle || undefined, linkData.branchName || undefined);
        if (teamsMeetingResult.success) {
            console.log(`Teams meeting created: ${teamsMeetingResult.joinUrl}`);
        }
        else {
            // Log warning but don't fail the booking
            console.warn('Teams meeting creation failed:', teamsMeetingResult.error);
        }
    }
    // Create interview record
    const interviewData = {
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
        bookingLinkId: linkDoc.id,
        confirmationCode,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    // Add Teams meeting details if created successfully
    if (teamsMeetingResult?.success && teamsMeetingResult.joinUrl) {
        interviewData.teamsJoinUrl = teamsMeetingResult.joinUrl;
        interviewData.teamsMeetingId = teamsMeetingResult.meetingId || null;
        interviewData.meetingType = 'teams';
    }
    // Use transaction to ensure atomicity
    const interviewRef = db.collection('interviews').doc();
    await db.runTransaction(async (transaction) => {
        // Re-check booking link status
        const freshLinkDoc = await transaction.get(linkDoc.ref);
        const freshLinkData = freshLinkDoc.data();
        if (!freshLinkData || freshLinkData.status !== 'active') {
            throw new https_1.HttpsError('not-found', 'Booking link is no longer valid');
        }
        if ((freshLinkData.useCount || 0) >= (freshLinkData.maxUses || 1)) {
            throw new https_1.HttpsError('not-found', 'This booking link has already been used');
        }
        // Create interview
        transaction.set(interviewRef, interviewData);
        // Update booking link
        transaction.update(linkDoc.ref, {
            status: 'used',
            useCount: admin.firestore.FieldValue.increment(1),
            usedAt: admin.firestore.FieldValue.serverTimestamp(),
            interviewId: interviewRef.id,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    });
    console.log(`Booking created: ${interviewRef.id} for ${linkData.candidateName}`);
    if (teamsMeetingResult?.success) {
        console.log(`Teams meeting URL: ${teamsMeetingResult.joinUrl}`);
    }
    return {
        success: true,
        interviewId: interviewRef.id,
        confirmationCode,
        // Include Teams link in response so booking confirmation page can show it
        teamsJoinUrl: teamsMeetingResult?.joinUrl || null,
    };
});
//# sourceMappingURL=bookingFunctions.js.map
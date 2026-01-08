"use strict";
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
// Default UK bank holidays for 2025 and 2026
function getDefaultBankHolidays() {
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
    ];
}
function getDefaultBookingBlocks() {
    return {
        bankHolidays: getDefaultBankHolidays(),
        lunchBlock: {
            enabled: false,
            start: '12:00',
            end: '13:00'
        }
    };
}
// Check if a date is a bank holiday
function isBankHoliday(dateStr, bankHolidays) {
    return bankHolidays.includes(dateStr);
}
// Check if a time slot falls within lunch block
function isInLunchBlock(timeStr, duration, lunchBlock) {
    if (!lunchBlock.enabled)
        return false;
    const [slotHours, slotMinutes] = timeStr.split(':').map(Number);
    const [lunchStartHours, lunchStartMinutes] = lunchBlock.start.split(':').map(Number);
    const [lunchEndHours, lunchEndMinutes] = lunchBlock.end.split(':').map(Number);
    const slotStartMinutes = slotHours * 60 + slotMinutes;
    const slotEndMinutes = slotStartMinutes + duration;
    const lunchStartTotalMinutes = lunchStartHours * 60 + lunchStartMinutes;
    const lunchEndTotalMinutes = lunchEndHours * 60 + lunchEndMinutes;
    // Check if slot overlaps with lunch block
    // Overlap occurs if slot starts before lunch ends AND slot ends after lunch starts
    return slotStartMinutes < lunchEndTotalMinutes && slotEndMinutes > lunchStartTotalMinutes;
}
async function getBookingBlocksSettings() {
    try {
        const blocksDoc = await db.collection('settings').doc('bookingBlocks').get();
        if (blocksDoc.exists) {
            const data = blocksDoc.data();
            return {
                bankHolidays: data?.bankHolidays || getDefaultBankHolidays(),
                lunchBlock: {
                    enabled: data?.lunchBlock?.enabled ?? false,
                    start: data?.lunchBlock?.start || '12:00',
                    end: data?.lunchBlock?.end || '13:00'
                }
            };
        }
    }
    catch (error) {
        console.error('Failed to get booking blocks settings:', error);
    }
    return getDefaultBookingBlocks();
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
// UPDATE CANDIDATE STATUS HELPER
// ============================================================================
async function updateCandidateStatus(candidateId, newStatus, reason) {
    try {
        const candidateRef = db.collection('candidates').doc(candidateId);
        const candidateDoc = await candidateRef.get();
        if (!candidateDoc.exists) {
            console.warn(`Candidate ${candidateId} not found for status update`);
            return;
        }
        const previousStatus = candidateDoc.data()?.status || 'unknown';
        // Update candidate status
        await candidateRef.update({
            status: newStatus,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
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
        });
        console.log(`Candidate ${candidateId} status updated: ${previousStatus} → ${newStatus}`);
    }
    catch (error) {
        console.error(`Failed to update candidate status for ${candidateId}:`, error);
        // Don't throw - status update failure should not block the main operation
    }
}
// ============================================================================
// P2.2: GET BOOKING AVAILABILITY
// ============================================================================
exports.getBookingAvailability = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (request) => {
    const { token } = request.data;
    if (!token) {
        throw new https_1.HttpsError('invalid-argument', 'Token is required');
    }
    // Skip validation for internal scheduling
    if (token !== "__internal__") {
        await validateToken(token);
    } //
    // Get availability settings
    let settings;
    try {
        const settingsDoc = await db.collection('settings').doc('interviewAvailability').get();
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
    // Get booking blocks settings (bank holidays)
    const blocksSettings = await getBookingBlocksSettings();
    // Get fully booked dates (dates where all slots are taken)
    const fullyBookedDates = [];
    // Add bank holidays to blocked dates
    const blockedDates = [...blocksSettings.bankHolidays];
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
        settings: {
            schedule: settings.schedule,
            advanceBookingDays: settings.advanceBookingDays,
            minNoticeHours: settings.minNoticeHours,
            slotDuration: settings.slotDuration
        },
        fullyBookedDates,
        blockedDates, // Bank holidays and other blocked dates
        lunchBlock: blocksSettings.lunchBlock // Send to client for display purposes
    };
});
// ============================================================================
// P2.3: GET TIME SLOTS FOR A DATE
// ============================================================================
exports.getBookingTimeSlots = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (request) => {
    const { token, date, type } = request.data;
    if (!token || !date) {
        throw new https_1.HttpsError('invalid-argument', 'Token and date are required');
    }
    // Skip validation for internal scheduling
    const linkDoc = token !== "__internal__" ? await validateToken(token) : null;
    const linkData = linkDoc?.data() || {};
    const bookingType = type || linkData.type || 'interview';
    // Get availability settings
    let settings;
    try {
        const settingsDoc = await db.collection('settings').doc('interviewAvailability').get();
        console.log('getBookingTimeSlots - Settings doc exists:', settingsDoc.exists);
        if (settingsDoc.exists) {
            const data = settingsDoc.data();
            console.log('getBookingTimeSlots - Raw slotDuration:', data?.slotDuration);
            settings = {
                schedule: data?.schedule || getDefaultSettings().schedule,
                slotDuration: data?.slotDuration || 30,
                bufferTime: data?.bufferTime || 15,
                advanceBookingDays: data?.advanceBookingDays || 14,
                minNoticeHours: data?.minNoticeHours || 24,
                enabled: data?.enabled !== false
            };
            console.log('getBookingTimeSlots - Final slotDuration:', settings.slotDuration);
        }
        else {
            settings = getDefaultSettings();
            console.log('getBookingTimeSlots - No settings doc, using defaults');
        }
    }
    catch (error) {
        console.error('Failed to get settings:', error);
        settings = getDefaultSettings();
    }
    // Get booking blocks settings
    const blocksSettings = await getBookingBlocksSettings();
    // Check if date is a bank holiday
    if (isBankHoliday(date, blocksSettings.bankHolidays)) {
        return {
            slots: [],
            date,
            blocked: true,
            blockReason: 'Bank Holiday - No bookings available'
        };
    }
    // Get the selected date info
    const selectedDate = new Date(date + 'T00:00:00');
    const dayOfWeek = selectedDate.getDay();
    const dayName = DAYS_FULL[dayOfWeek];
    // Get day schedule
    const daySchedule = settings.schedule[dayName];
    if (!daySchedule?.enabled || !daySchedule.slots?.length) {
        return { slots: [], date };
    }
    // Determine slot duration based on booking type
    // Interviews: 30 mins, Trials: 4 hours (240 mins)
    const slotDuration = bookingType === 'trial' ? 240 : (settings.slotDuration || 30);
    const bufferTime = settings.bufferTime || 15;
    const minNoticeHours = settings.minNoticeHours || 24;
    // For trials, we use larger intervals between start times
    const slotInterval = bookingType === 'trial' ? 60 : slotDuration;
    // Get existing bookings for this date
    const dayStart = new Date(selectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDate);
    dayEnd.setHours(23, 59, 59, 999);
    let existingBookings;
    try {
        existingBookings = await db
            .collection('interviews')
            .where('scheduledDate', '>=', admin.firestore.Timestamp.fromDate(dayStart))
            .where('scheduledDate', '<=', admin.firestore.Timestamp.fromDate(dayEnd))
            .where('status', 'in', ['scheduled', 'confirmed'])
            .get();
    }
    catch (error) {
        console.error('Failed to get existing bookings:', error);
        existingBookings = { docs: [] };
    }
    // Generate time slots
    const slots = [];
    const now = new Date();
    const minNoticeTime = new Date(now.getTime() + minNoticeHours * 60 * 60 * 1000);
    for (const slot of daySchedule.slots) {
        const [startHour, startMin] = slot.start.split(':').map(Number);
        const [endHour, endMin] = slot.end.split(':').map(Number);
        let currentMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;
        while (currentMinutes + slotDuration <= endMinutes) {
            const hours = Math.floor(currentMinutes / 60);
            const mins = currentMinutes % 60;
            const timeStr = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
            // Create slot start/end times
            const slotStart = new Date(selectedDate);
            slotStart.setHours(hours, mins, 0, 0);
            const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000);
            // Check minimum notice
            const meetsNotice = slotStart >= minNoticeTime;
            // Check for conflicts with existing bookings
            const hasConflict = existingBookings.docs.some(doc => {
                const data = doc.data();
                const existingStart = data.scheduledDate?.toDate?.();
                if (!existingStart)
                    return false;
                const existingDuration = data.duration || 30;
                const existingEnd = new Date(existingStart.getTime() + existingDuration * 60000);
                // Add buffer time to check
                const bufferedSlotStart = new Date(slotStart.getTime() - bufferTime * 60000);
                const bufferedSlotEnd = new Date(slotEnd.getTime() + bufferTime * 60000);
                return bufferedSlotStart < existingEnd && bufferedSlotEnd > existingStart;
            });
            // Check if slot falls within lunch block
            const inLunchBlock = isInLunchBlock(timeStr, slotDuration, blocksSettings.lunchBlock);
            // Determine availability and reason
            let available = meetsNotice && !hasConflict && !inLunchBlock;
            let reason = undefined;
            if (!meetsNotice) {
                reason = 'Too short notice';
            }
            else if (hasConflict) {
                reason = 'Already booked';
            }
            else if (inLunchBlock) {
                reason = 'Lunch break';
            }
            slots.push({
                time: timeStr,
                available,
                ...(reason && { reason })
            });
            currentMinutes += slotInterval + bufferTime;
        }
    }
    return { slots, date };
});
// ============================================================================
// P2.6: SUBMIT BOOKING (with Teams integration and automatic status update)
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
    // Skip validation for internal scheduling
    const linkDoc = token !== "__internal__" ? await validateToken(token) : null;
    const linkData = linkDoc?.data() || {};
    // Get booking blocks settings and validate
    const blocksSettings = await getBookingBlocksSettings();
    // Get availability settings for slot duration
    let slotDuration = 30; // default
    try {
        const settingsDoc = await db.collection('settings').doc('interviewAvailability').get();
        if (settingsDoc.exists) {
            slotDuration = settingsDoc.data()?.slotDuration || 30;
        }
    }
    catch (error) {
        console.error('Failed to get slot duration from settings:', error);
    }
    // Check if date is a bank holiday
    if (isBankHoliday(date, blocksSettings.bankHolidays)) {
        throw new https_1.HttpsError('invalid-argument', 'Cannot book on a bank holiday');
    }
    // Determine duration based on type (trials are always 4 hours, interviews use settings)
    const duration = linkData.type === 'trial' ? 240 : slotDuration;
    // Check if time falls within lunch block
    if (isInLunchBlock(time, duration, blocksSettings.lunchBlock)) {
        throw new https_1.HttpsError('invalid-argument', 'Cannot book during lunch break');
    }
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
        bookingLinkId: linkDoc?.id || null,
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
        if (linkDoc) {
            const freshLinkDoc = await transaction.get(linkDoc.ref);
            const freshLinkData = freshLinkDoc.data();
            if (!freshLinkData || freshLinkData.status !== 'active') {
                throw new https_1.HttpsError('not-found', 'Booking link is no longer valid');
            }
            if ((freshLinkData.useCount || 0) >= (freshLinkData.maxUses || 1)) {
                throw new https_1.HttpsError('not-found', 'This booking link has already been used');
            }
        }
        // Create interview
        transaction.set(interviewRef, interviewData);
        // Update booking link (only for external bookings)
        if (linkDoc) {
            transaction.update(linkDoc.ref, {
                status: 'used',
                useCount: admin.firestore.FieldValue.increment(1),
                usedAt: admin.firestore.FieldValue.serverTimestamp(),
                interviewId: interviewRef.id,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
    });
    console.log(`Booking created: ${interviewRef.id} for ${linkData.candidateName}`);
    if (teamsMeetingResult?.success) {
        console.log(`Teams meeting URL: ${teamsMeetingResult.joinUrl}`);
    }
    // =========================================================================
    // AUTOMATICALLY UPDATE CANDIDATE STATUS
    // =========================================================================
    const newStatus = linkData.type === 'interview' ? 'interview_scheduled' : 'trial_scheduled';
    await updateCandidateStatus(linkData.candidateId, newStatus, `Candidate booked ${linkData.type} via self-service booking`);
    // =========================================================================
    // SEND EMAIL CONFIRMATION TO CANDIDATE
    // =========================================================================
    let emailSent = false;
    if (linkData.candidateEmail) {
        console.log(`Sending confirmation email to: ${linkData.candidateEmail}`);
        const emailResult = await (0, teamsMeeting_1.sendConfirmationEmail)(linkData.candidateEmail, linkData.candidateName, scheduledDate, linkData.type, teamsMeetingResult?.joinUrl || undefined, linkData.jobTitle || undefined, linkData.branchName || undefined, confirmationCode, duration);
        emailSent = emailResult.success;
        if (emailResult.success) {
            console.log('Confirmation email sent successfully');
            // Update interview record with email status
            await interviewRef.update({
                emailConfirmationSent: true,
                emailConfirmationSentAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        else {
            console.warn('Failed to send confirmation email:', emailResult.error);
        }
    }
    else {
        console.log('No candidate email available, skipping email confirmation');
    }
    return {
        success: true,
        interviewId: interviewRef.id,
        confirmationCode,
        // Include Teams link in response so booking confirmation page can show it
        teamsJoinUrl: teamsMeetingResult?.joinUrl || null,
        emailSent,
    };
});
//# sourceMappingURL=bookingFunctions.js.map
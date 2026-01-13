# Allied Recruitment Portal - Claude Bug Fix Guide

**Last Updated:** 13 January 2026

## Quick Reference

**GitHub Repo:** https://github.com/asatire1/allied-recruitment-portal
**Firebase Project:** recruitment-633bd

### Live URLs

| App | URL | Hosting Target |
|-----|-----|----------------|
| Recruitment Portal | https://allied-recruitment.web.app | `hosting:recruitment` |
| Job Applications | https://allied-booking.web.app/apply | `hosting:booking` |
| Booking Page | https://allied-booking.web.app/book/{token} | `hosting:booking` |
| Branch Portal | https://allied-branch.web.app | `hosting:branch` |

---

## Project Structure

```
allied-recruitment-portal/
├── apps/
│   ├── recruitment-portal/     # Admin portal (React + Vite)
│   │   └── src/
│   │       ├── pages/          # Main page components
│   │       │   ├── Candidates.tsx
│   │       │   ├── Calendar.tsx
│   │       │   ├── Dashboard.tsx
│   │       │   ├── Jobs.tsx
│   │       │   ├── JobDetail.tsx
│   │       │   ├── Interviews.tsx
│   │       │   ├── Settings.tsx
│   │       │   ├── UserManagement.tsx
│   │       │   └── CandidateDetail.tsx
│   │       ├── styles/         # CSS stylesheets
│   │       │   ├── status-colors.css   # Status badge colors
│   │       │   └── bulk-invite.css     # Bulk invite UI styles
│   │       ├── utils/          # Utility functions
│   │       │   └── statusUtils.ts      # Status helpers & constants
│   │       ├── contexts/       # React contexts (AuthContext)
│   │       ├── hooks/          # Custom hooks
│   │       │   └── useArchive.ts  # Archive/restore functionality
│   │       └── App.tsx         # Main app router
│   │
│   ├── booking-page/           # Public booking & applications (React + Vite)
│   │   └── src/
│   │       ├── components/
│   │       │   ├── JobApplication.tsx
│   │       │   ├── BookingSuccess.tsx    # Shows Teams link
│   │       │   ├── BookingConfirmation.tsx
│   │       │   ├── DatePicker.tsx
│   │       │   └── TimeSlotPicker.tsx
│   │       ├── services/
│   │       │   └── bookingService.ts     # Includes teamsJoinUrl type
│   │       ├── hooks/
│   │       ├── lib/            # Firebase config
│   │       └── styles/         # CSS files
│   │
│   └── branch-portal/          # Branch manager portal (React + Vite)
│       └── src/
│           ├── pages/
│           └── components/
│
├── packages/
│   ├── shared-lib/             # Shared utilities, types, Firebase config
│   │   └── src/
│   │       └── index.ts        # Exports: getFirebaseDb, getFirebaseFunctions, types
│   │
│   └── shared-ui/              # Shared React components
│       └── src/
│           └── index.ts        # Exports: Button, Input, Modal, Card, etc.
│
├── functions/                  # Firebase Cloud Functions
│   └── src/
│       ├── index.ts            # Main exports file
│       ├── bookingFunctions.ts # Booking + Teams meeting creation
│       ├── teamsMeeting.ts     # Teams meeting + calendar event creation
│       ├── cascadeDeletion.ts  # Archive/restore/delete system
│       ├── bookingToken.ts     # Token generation
│       ├── pushNotifications.ts# Push notification functions
│       └── jobImport.ts        # Indeed job import
│
├── firestore.rules             # Firestore security rules
├── storage.rules               # Storage security rules
└── firebase.json               # Firebase configuration
```

---

## GitHub Raw File URLs

To fetch files directly, use this format:

```
https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/{path}
```

### Key Files

**Recruitment Portal - Pages:**
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/apps/recruitment-portal/src/pages/CandidateDetail.tsx`
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/apps/recruitment-portal/src/pages/Candidates.tsx`
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/apps/recruitment-portal/src/pages/UserManagement.tsx`
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/apps/recruitment-portal/src/pages/Dashboard.tsx`
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/apps/recruitment-portal/src/pages/Settings.tsx`
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/apps/recruitment-portal/src/pages/JobDetail.tsx`
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/apps/recruitment-portal/src/pages/Jobs.tsx`
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/apps/recruitment-portal/src/pages/Calendar.tsx`
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/apps/recruitment-portal/src/pages/Interviews.tsx`

**Recruitment Portal - Styles:**
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/apps/recruitment-portal/src/styles/status-colors.css`
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/apps/recruitment-portal/src/styles/bulk-invite.css`

**Recruitment Portal - Utils:**
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/apps/recruitment-portal/src/utils/statusUtils.ts`

**Recruitment Portal - Other:**
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/apps/recruitment-portal/src/contexts/AuthContext.tsx`
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/apps/recruitment-portal/src/hooks/useArchive.ts`
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/apps/recruitment-portal/src/App.tsx`

**Booking Page:**
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/apps/booking-page/src/components/JobApplication.tsx`
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/apps/booking-page/src/components/BookingSuccess.tsx`
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/apps/booking-page/src/components/BookingConfirmation.tsx`
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/apps/booking-page/src/components/DatePicker.tsx`
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/apps/booking-page/src/components/TimeSlotPicker.tsx`
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/apps/booking-page/src/services/bookingService.ts`
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/apps/booking-page/src/lib/firebase.ts`
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/apps/booking-page/src/App.tsx`

**Cloud Functions:**
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/functions/src/index.ts`
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/functions/src/bookingFunctions.ts`
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/functions/src/teamsMeeting.ts`
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/functions/src/cascadeDeletion.ts`
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/functions/src/trialNotifications.ts`
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/functions/src/pushNotifications.ts`

**Shared Library:**
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/packages/shared-lib/src/index.ts`

**Rules:**
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/firestore.rules`
- `https://raw.githubusercontent.com/asatire1/allied-recruitment-portal/main/storage.rules`

---

## Deployment Commands

### Recruitment Portal
```bash
cd ~/Documents/allied-recruitment-portal/apps/recruitment-portal
cp ~/Downloads/{FileName}.tsx src/pages/{FileName}.tsx
pnpm run build
firebase deploy --only hosting:recruitment
```

### Recruitment Portal - Styles
```bash
cd ~/Documents/allied-recruitment-portal/apps/recruitment-portal
cp ~/Downloads/{FileName}.css src/styles/{FileName}.css
pnpm run build
firebase deploy --only hosting:recruitment
```

### Recruitment Portal - Utils
```bash
cd ~/Documents/allied-recruitment-portal/apps/recruitment-portal
cp ~/Downloads/{FileName}.ts src/utils/{FileName}.ts
pnpm run build
firebase deploy --only hosting:recruitment
```

### Booking Page
```bash
cd ~/Documents/allied-recruitment-portal/apps/booking-page
cp ~/Downloads/{FileName}.tsx src/components/{FileName}.tsx
pnpm run build
firebase deploy --only hosting:booking
```

### Branch Portal
```bash
cd ~/Documents/allied-recruitment-portal/apps/branch-portal
cp ~/Downloads/{FileName}.tsx src/pages/{FileName}.tsx
pnpm run build
firebase deploy --only hosting:branch
```

### Cloud Functions
```bash
cd ~/Documents/allied-recruitment-portal/functions
cp ~/Downloads/{FileName}.ts src/{FileName}.ts
npm run build
firebase deploy --only functions
# Or deploy specific function:
firebase deploy --only functions:{functionName}
```

### Firestore Rules
```bash
cd ~/Documents/allied-recruitment-portal
cp ~/Downloads/firestore.rules firestore.rules
firebase deploy --only firestore:rules
```

### Storage Rules
```bash
cd ~/Documents/allied-recruitment-portal
cp ~/Downloads/storage.rules storage.rules
firebase deploy --only storage
```

### Local Testing (Before Live Deploy)
```bash
cd ~/Documents/allied-recruitment-portal/apps/recruitment-portal
pnpm run dev
# Opens at http://localhost:5173
# Uses LIVE Firebase database - be careful with data changes
# Press Ctrl+C to stop
```

### Preview Channel (Safe Testing)
```bash
cd ~/Documents/allied-recruitment-portal/apps/recruitment-portal
pnpm run build
firebase hosting:channel:deploy preview --expires 7d
# Creates temporary URL like: https://recruitment-633bd--preview-abc123.web.app
# When ready for live: firebase deploy --only hosting:recruitment
```

---

## After Deploying - Update GitHub

```bash
cd ~/Documents/allied-recruitment-portal
git add .
git commit -m "Description of fix"
git push
```

---

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite
- **Backend:** Firebase (Firestore, Auth, Storage, Functions, Hosting)
- **Styling:** CSS (custom iOS-inspired design)
- **AI:** Claude API for CV parsing
- **PDF Parsing:** pdf.js (client-side)
- **Monorepo:** pnpm workspaces
- **Functions Region:** us-central1 (default)
- **Teams Integration:** Microsoft Graph API

---

## Firestore Collections

| Collection | Purpose |
|------------|---------|
| `candidates` | Candidate records (includes `isArchived`, `isReturningCandidate` flags) |
| `jobs` | Job listings |
| `interviews` | Interview/trial bookings (includes `teamsJoinUrl`, `teamsMeetingId`) |
| `branches` | Branch locations (200+) |
| `users` | User accounts & roles |
| `settings` | App settings (availability, templates, booking restrictions) |
| `bookingLinks` | Booking tokens |
| `whatsappTemplates` | Message templates |
| `entities` | Business entities (Allied, Sharief, Core) |
| `activityLog` | Audit trail |
| `jobCategories` | Job categories |
| `jobTitles` | Job titles |

---

## User Roles

| Role | Access |
|------|--------|
| `super_admin` | Full access to everything including permanent delete |
| `recruiter` | Full recruitment workflow |
| `regional_manager` | Multiple branches in region |
| `branch_manager` | Own branch trials & feedback only |
| `viewer` | Read-only access |

---

## Entity Types

- `allied` - Allied Pharmacies
- `sharief` - Sharief Healthcare
- `core` - Core Pharmaceuticals

---

## Key Cloud Functions

| Function | Purpose | Region |
|----------|---------|--------|
| `parseCV` | AI-powered CV parsing | us-central1 |
| `createBookingLink` | Generate booking tokens | us-central1 |
| `validateBookingToken` | Validate booking links | us-central1 |
| `submitBooking` | Process booking + create Teams meeting | us-central1 |
| `getBookingAvailability` | Get available dates | us-central1 |
| `getBookingTimeSlots` | Get time slots for date | us-central1 |
| `createUserWithPassword` | Create user with login | us-central1 |
| `sendBookingConfirmation` | Send confirmation emails | us-central1 |
| `onTrialCreated` | Trigger on trial creation | us-central1 |
| `sendFeedbackReminders` | Scheduled feedback reminders | us-central1 |
| `archiveCandidate` | Soft delete candidate + cancel interviews | us-central1 |
| `restoreCandidate` | Restore archived candidate | us-central1 |
| `checkReturningCandidate` | Detect re-applicants | us-central1 |
| `reactivateCandidate` | Handle re-applications | us-central1 |
| `permanentlyDeleteCandidate` | Hard delete (super_admin only) | us-central1 |
| `onCandidateDeleted` | Cascade cleanup trigger | us-central1 |
| `sendTrialBranchNotification` | Notify branch of trial booking | europe-west2 |
| `sendDailyFeedbackRequests` | Scheduled feedback reminders | europe-west2 |
| `submitTrialFeedback` | Public feedback submission | europe-west2 |
| `validateFeedbackToken` | Validate feedback links | europe-west2 |

---

## Candidate Status System

### Status Priority Order (for sorting)

Candidates are sorted by status priority, then by date (newest first within each status).

| Priority | Status | Color | Hex |
|----------|--------|-------|-----|
| 1 | new | Blue | #3b82f6 |
| 2 | screening | Purple | #a855f7 |
| 3 | invite_sent | Orange | #f97316 |
| 4 | interview_scheduled | Cyan | #06b6d4 |
| 5 | trial_scheduled | Purple | #8b5cf6 |
| 6 | interview_complete | Light Blue | #0ea5e9 |
| 7 | trial_complete | Violet | #a78bfa |
| 8 | approved | Green | #22c55e |
| 9 | offered | Amber | #f59e0b |
| 10 | hired | Green | #22c55e |
| 11 | on_hold | Yellow | #eab308 |
| 12 | withdrawn | Gray | #9ca3af |
| 13 | rejected | Red | #ef4444 |

### Default Filtering Behavior

- **"All" filter** excludes rejected candidates by default
- Use **"All (incl. Rejected)"** to see everyone
- Rejected count shown in header: "X candidates (Y rejected hidden)"

### Status Utility Functions (statusUtils.ts)

```typescript
import { getStatusLabel, getStatusClass, getStatusColor } from '../utils/statusUtils'

// Returns formatted label: "interview_scheduled" → "Interview Scheduled"
getStatusLabel(status)

// Returns CSS class: "interview_scheduled" → "status-interview_scheduled"
getStatusClass(status)

// Returns hex color: "interview_scheduled" → "#06b6d4"
getStatusColor(status)

// Check status types
isNegativeStatus(status)  // true for rejected, withdrawn
isPositiveStatus(status)  // true for hired, approved
isActiveStatus(status)    // true for active statuses
```

### Status Badge Usage

```tsx
// In JSX
<span className={`status-badge ${getStatusClass(candidate.status)}`}>
  {getStatusLabel(candidate.status)}
</span>
```

### Automatic Status Updates

| Action | Status Changes To |
|--------|-------------------|
| Create booking link | `invite_sent` |
| Candidate books interview | `interview_scheduled` |
| Candidate books trial | `trial_scheduled` |

---

## Trial System

### Overview

The trial system allows branches to host candidate trial shifts with:
- Per-branch availability settings (max trials per day, working hours)
- Self-service booking via booking links
- Branch notifications when trials are booked
- Feedback collection from branch managers

### Per-Branch Trial Booking

Trials are booked **per branch**, meaning:
- A trial at Branch A does NOT block availability at Branch B
- Each branch can have its own `maxTrialsPerDay` setting
- Booking links include `branchId` to enable this filtering

### Key Files

| File | Purpose |
|------|---------|
| `functions/src/bookingFunctions.ts` | Trial slot availability & booking logic |
| `functions/src/trialNotifications.ts` | Branch notifications & feedback system |
| `apps/recruitment-portal/src/components/candidate/WhatsAppModal.tsx` | Sends branchId when creating booking links |
| `apps/recruitment-portal/src/components/candidate/EmailModal.tsx` | Sends branchId when creating booking links |

### Branch Trial Settings (in branches collection)

```typescript
{
  trialSettings: {
    enabled: true,
    maxTrialsPerDay: 1,
    schedule: {
      monday: { enabled: true, slots: [{ start: "09:00", end: "17:00" }] },
      // ... other days
    }
  }
}
```

### Trial Feedback System

1. Branch receives notification email when trial is booked
2. Day after trial, branch receives feedback request email with secure link
3. Branch manager submits feedback via public form (no login required)
4. Feedback stored in `interviewFeedback` collection
5. Feedback displayed on candidate profile

### Firestore Collections for Trials

| Collection | Purpose |
|------------|---------|
| `interviews` | Trial bookings (type: 'trial') |
| `interviewFeedback` | Feedback from branch managers |
| `feedbackTokens` | Secure tokens for feedback submission |
| `slotLocks` | Prevents double-booking race conditions |

---

## Bulk Interview Invites

### How It Works

1. Select candidates using checkboxes in table
2. Bulk actions bar appears with count
3. Click "Send Interview Invites" or "Send Trial Invites"
4. Confirm in modal
5. Creates booking links for all selected candidates
6. Updates each candidate's status to "invite_sent"
7. Shows results panel with WhatsApp button for each candidate

### UI Components

- **Checkbox column** - First column in candidates table
- **Select All checkbox** - In table header, selects current page
- **Bulk actions bar** - Appears when candidates selected
- **Bulk invite modal** - Confirmation and results display

### Key Functions (in Candidates.tsx)

```typescript
// Toggle single candidate selection
toggleCandidateSelection(candidateId: string)

// Select/deselect all on current page
toggleSelectAll()

// Clear all selections
clearSelection()

// Open modal for interview or trial invites
openBulkInviteModal(type: 'interview' | 'trial')

// Create booking links for all selected candidates
processBulkInvites()

// Generate WhatsApp message text
getWhatsAppMessage(candidateName: string, bookingUrl: string, type: 'interview' | 'trial')

// Open WhatsApp with pre-filled message
openWhatsApp(phone: string, message: string)

// Copy link to clipboard
copyToClipboard(text: string)
```

### WhatsApp Phone Formatting

```typescript
// UK numbers: 07xxx → 447xxx
// Removes spaces and special characters
// Opens wa.me link with encoded message
let phone = rawPhone.replace(/\s/g, '').replace(/[^\d+]/g, '')
if (phone.startsWith('0')) {
  phone = '44' + phone.substring(1)
}
if (!phone.startsWith('+') && !phone.startsWith('44')) {
  phone = '44' + phone
}
phone = phone.replace('+', '')
window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank')
```

### Firestore Permissions Required

If bulk invites fail with "Missing or insufficient permissions":

```javascript
// firestore.rules
match /bookingLinks/{linkId} {
  allow read: if true;  // Public can read (for booking page)
  allow create, update, delete: if request.auth != null;  // Authenticated users
}
```

Deploy: `firebase deploy --only firestore:rules`

---

## Settings Page Tabs

| Tab | Purpose | Firestore Location |
|-----|---------|-------------------|
| General | Working hours, timezone | `settings/availability` |
| Interview Slots | Duration, buffer time, max per day | `settings/availability` |
| Trial Slots | Trial shift configuration | `settings/availability` |
| WhatsApp Templates | Message templates | `whatsappTemplates` collection |
| Booking Restrictions | Bank holidays, lunch blocking | `settings/availability` |
| Job Titles | Manage job title options | `jobTitles` collection |
| Locations | Manage branch/location options | `branches` collection |

---

## Booking Restrictions System

### Bank Holidays

- **Stored in:** `settings/availability` → `bankHolidays` array
- **Format:** `{ date: "2025-12-25", name: "Christmas Day" }`
- **Effect:** Blocks entire day from booking

### Lunch Time Blocking

- **Stored in:** `settings/availability` → `lunchBlock` object
- **Format:** `{ enabled: true, start: "12:00", end: "13:00" }`
- **Effect:** Blocks time range every day

### Where Restrictions Are Applied

- `getBookingAvailability` function checks bank holidays when returning available dates
- `getBookingTimeSlots` function filters out lunch times when returning available slots

### Adding Bank Holidays via UI

1. Go to Settings → Booking Restrictions tab
2. Click "Add Bank Holiday"
3. Enter date and name
4. Click Save

### Default UK Bank Holidays (pre-populated)

- New Year's Day
- Good Friday
- Easter Monday
- Early May Bank Holiday
- Spring Bank Holiday
- Summer Bank Holiday
- Christmas Day
- Boxing Day

---

## Teams Meeting Integration

### Overview

Interview bookings automatically create Microsoft Teams meetings via Graph API. The Teams join URL is:
- Stored in `interviews` collection (`teamsJoinUrl`, `teamsMeetingId` fields)
- Displayed on booking confirmation page
- Included in WhatsApp confirmation message
- Added to calendar exports

### Azure AD App Configuration

- **App ID:** `bda03050-9033-4d8f-85a7-f959b0321cc3`
- **Tenant ID:** `26798f1b-bc03-4036-bc68-8e1466cd2fc1`
- **Organizer User ID:** `22c698b9-96d0-45e9-a8de-4f18d4bfed8f`
- **Organizer Email:** `recruitment@alliedpharmacies.com`

### Required API Permissions (Azure AD)

| Permission | Type | Status |
|------------|------|--------|
| `OnlineMeetings.ReadWrite.All` | Application | ✅ Granted |
| `Calendars.ReadWrite` | Application | ✅ Granted |
| `Mail.Send` | Application | ✅ Granted |
| `User.Read` | Delegated | ✅ Granted |

### Firebase Secrets

```bash
# View secrets
firebase functions:secrets:access MS_CLIENT_ID
firebase functions:secrets:access MS_CLIENT_SECRET
firebase functions:secrets:access MS_TENANT_ID
firebase functions:secrets:access MS_ORGANIZER_USER_ID

# Set secrets (if needed)
firebase functions:secrets:set MS_CLIENT_ID
firebase functions:secrets:set MS_CLIENT_SECRET
firebase functions:secrets:set MS_TENANT_ID
firebase functions:secrets:set MS_ORGANIZER_USER_ID
```

### Teams Application Access Policy

If Teams meetings fail with "No application access policy found":

```powershell
# In PowerShell
pwsh

# Connect to Teams
Connect-MicrosoftTeams

# Check existing policies
Get-CsApplicationAccessPolicy

# Check user policy assignment
Get-CsOnlineUser -Identity "recruitment@alliedpharmacies.com" | Select-Object ApplicationAccessPolicy

# Grant policy globally (fixes most issues)
Grant-CsApplicationAccessPolicy -PolicyName "RecruitmentPortalPolicy" -Global
```

Wait 5-30 minutes for policy propagation after changes.

### Calendar Event Visibility

**Known behavior:** Calendar events are created on `recruitment@alliedpharmacies.com` calendar. When viewing as a **shared calendar** from another account, events may not appear due to permission settings.

**To verify events exist:**
1. Sign into Outlook directly as `recruitment@alliedpharmacies.com`
2. Check the calendar for the interview date/time
3. Events should be visible there even if not in shared view

**Solutions for visibility:**
1. Sign into Outlook directly as `recruitment@alliedpharmacies.com` to see events
2. Fix shared calendar permissions: Calendar → Sharing → Add user with "Can view all details"
3. Modify code to add additional attendees who will receive calendar invites

### Key Files for Teams Integration

- `functions/src/teamsMeeting.ts` - Teams meeting + calendar event creation
- `functions/src/bookingFunctions.ts` - Calls teamsMeeting functions

### Teams Meeting Creation Flow

1. `submitBooking` function receives booking request
2. If interview type, calls `createTeamsMeeting()`
3. `createTeamsMeeting()` gets OAuth token from Microsoft
4. Creates online meeting via Graph API
5. Creates calendar event via Graph API
6. Returns `teamsJoinUrl` and `teamsMeetingId`
7. Stored in interview document in Firestore

---

## Candidate Archive System

### Overview

Soft delete system for candidates with cascade cleanup and re-application detection.

### Key Fields (candidates collection)

| Field | Type | Purpose |
|-------|------|---------|
| `isArchived` | boolean | Soft delete flag |
| `archivedAt` | timestamp | When archived |
| `archivedBy` | string | User ID who archived |
| `archiveReason` | string | Reason for archiving |
| `isReturningCandidate` | boolean | Re-applicant flag |
| `previousApplications` | array | Previous application references |

### Archive Functions

| Function | Purpose | Access |
|----------|---------|--------|
| `archiveCandidate` | Soft delete + cancel interviews | All admins |
| `restoreCandidate` | Restore archived candidate | All admins |
| `permanentlyDeleteCandidate` | Hard delete | super_admin only, must be archived first |
| `checkReturningCandidate` | Check if email/phone exists | System |
| `reactivateCandidate` | Link new application to archived | System |
| `onCandidateDeleted` | Cascade cleanup interviews/logs | Trigger |

### Frontend Hook

`apps/recruitment-portal/src/hooks/useArchive.ts` provides:

```typescript
const { archiveCandidate, restoreCandidate, permanentlyDeleteCandidate, loading, error } = useArchive()

// Archive a candidate
await archiveCandidate(candidateId, 'Withdrew application')

// Restore an archived candidate
await restoreCandidate(candidateId)

// Permanently delete (super_admin only, must be archived first)
await permanentlyDeleteCandidate(candidateId)
```

---

## Common Bug Patterns & Solutions

### 1. Undefined Value in Firestore Updates

**Symptom:** Error "Unsupported field value: undefined"

**Cause:** Trying to save undefined values to Firestore

**Fix:** Filter out undefined values or use null:
```typescript
// BAD
await doc.update({ field: someValue }) // someValue might be undefined

// GOOD - Option 1: Only include if defined
const updateData: Record<string, unknown> = {}
if (someValue !== undefined) updateData.field = someValue
await doc.update(updateData)

// GOOD - Option 2: Use null instead
await doc.update({ field: someValue ?? null })

// GOOD - Option 3: Filter object
const cleanData = Object.fromEntries(
  Object.entries(data).filter(([_, v]) => v !== undefined)
)
```

### 2. Template Literal Syntax Errors

**Symptom:** Build fails OR function not being called

**Cause:** Missing closing brace, or using tagged template instead of function call

**Fix:**
```typescript
// BAD - Tagged template (NOT a function call!)
console.log`Message: ${value}`
window.open`https://example.com`

// GOOD - Actual function calls
console.log(`Message: ${value}`)
window.open(`https://example.com`, '_blank')

// BAD - Missing closing brace
const title = `Interview: ${data.name`

// GOOD
const title = `Interview: ${data.name}`
```

### 3. Duplicate Exports in index.ts

**Symptom:** "Duplicate identifier" TypeScript errors

**Cause:** Same function exported multiple times in functions/src/index.ts

**Fix:**
```bash
# Check for duplicates
grep "export {" functions/src/index.ts | sort | uniq -d

# Remove duplicate lines - ensure each export appears only once
```

### 4. TypeScript Interface Missing Fields

**Symptom:** "Property does not exist on type" error

**Cause:** New field returned from backend not in TypeScript interface

**Fix:** Update the interface:
```typescript
// In bookingService.ts
export interface SubmitBookingResponse {
  success: boolean
  interviewId: string
  confirmationCode: string
  teamsJoinUrl?: string  // Add new optional field
}
```

### 5. Firestore Rules Blocking Access

**Symptom:** "Permission denied" or "Missing or insufficient permissions" in console

**Cause:** Firestore rules too restrictive

**Fix:** Check rules allow the operation:
```javascript
// firestore.rules - Example pattern
match /interviews/{interviewId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && 
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'super_admin'];
}

// For bookingLinks (needed for bulk invites)
match /bookingLinks/{linkId} {
  allow read: if true;
  allow create, update, delete: if request.auth != null;
}
```

Then deploy: `firebase deploy --only firestore:rules`

### 6. Teams Meeting Not Created

**Symptom:** Booking succeeds but no teamsJoinUrl in Firestore

**Check logs:**
```bash
firebase functions:log --only submitBooking -n 20
```

**Common causes:**
- Missing "Creating Teams meeting for interview..." log = code not deployed
- "No application access policy found" = Run PowerShell policy grant
- Token/auth errors = Check secrets are set correctly

### 7. CORS Errors

**Cause:** Booking page uses `us-central1` region

**Fix:** Check `apps/booking-page/src/lib/firebase.ts` for region config

### 8. Function 500 Errors

**Fix:**
- Check logs: `firebase functions:log --only {functionName}`
- Often missing Firestore index - click link in error to create

### 9. Build Errors

**Fix:**
- Check for missing imports
- Run `pnpm install` if dependencies missing
- Clear cache: `rm -rf lib/ node_modules/.cache`

### 10. Cache Issues After Deploy

**Fix:** Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

### 11. Phone Number Formatting for WhatsApp

**Pattern:**
```typescript
let phone = rawPhone.replace(/\s/g, '').replace(/[^\d+]/g, '')
if (phone.startsWith('0')) {
  phone = '44' + phone.substring(1)
}
if (!phone.startsWith('+') && !phone.startsWith('44')) {
  phone = '44' + phone
}
phone = phone.replace('+', '')
window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank')
```

### 12. Status-Based Sorting

**Pattern:**
```typescript
const STATUS_PRIORITY: Record<string, number> = {
  'new': 1,
  'screening': 2,
  'invite_sent': 3,
  // ... etc
}

candidates.sort((a, b) => {
  const priorityA = STATUS_PRIORITY[a.status] ?? 99
  const priorityB = STATUS_PRIORITY[b.status] ?? 99
  
  if (priorityA !== priorityB) {
    return priorityA - priorityB
  }
  
  // Same status - sort by date (newest first)
  const dateA = a.createdAt?.toDate?.()?.getTime() || 0
  const dateB = b.createdAt?.toDate?.()?.getTime() || 0
  return dateB - dateA
})
```

### 13. CSS Import Order

**Important:** Import CSS files in correct order in component files:
```typescript
import './Candidates.css'           // Component-specific styles
import '../styles/status-colors.css' // Status badge colors
import '../styles/bulk-invite.css'   // Bulk invite UI styles
```

### 14. useMemo Dependencies

**Pattern:** Always include all used variables in dependency array:
```typescript
const filteredCandidates = useMemo(() => {
  return candidates.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    // ... filtering logic
    return true
  })
}, [candidates, statusFilter, searchTerm])  // All dependencies listed
```

---

## Standard Response Format for Bug Fixes

When providing fixes, always:

1. **Fetch the current file from GitHub first**
2. **Provide complete file** (not snippets)
3. **Name files clearly** with version: `FileName-v2.tsx`
4. **Include exact deploy commands**

Example:
```
Here's the fix for [issue]:

[Download: FileName.tsx]

Deploy:
cd ~/Documents/allied-recruitment-portal/apps/recruitment-portal
cp ~/Downloads/FileName.tsx src/pages/FileName.tsx
pnpm run build
firebase deploy --only hosting:recruitment

Then update GitHub:
git add .
git commit -m "Fix: description"
git push
```

---

## Checking Function Logs

```bash
# All function logs
firebase functions:log

# Specific function
firebase functions:log --only submitBooking -n 20

# Follow logs in real-time
firebase functions:log --follow

# Teams-specific debugging
firebase functions:log --only submitBooking | grep -i "teams\|meeting\|graph"
```

---

## Firebase Console Links

- **Console:** https://console.firebase.google.com/project/recruitment-633bd
- **Firestore:** https://console.firebase.google.com/project/recruitment-633bd/firestore
- **Auth:** https://console.firebase.google.com/project/recruitment-633bd/authentication
- **Functions:** https://console.firebase.google.com/project/recruitment-633bd/functions
- **Hosting:** https://console.firebase.google.com/project/recruitment-633bd/hosting
- **Secrets:** https://console.cloud.google.com/security/secret-manager?project=recruitment-633bd

---

## Azure Portal Links

- **App Registrations:** https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade
- **Allied Recruitment Portal App:** https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Overview/appId/bda03050-9033-4d8f-85a7-f959b0321cc3
- **Users:** https://portal.azure.com/#view/Microsoft_AAD_UsersAndTenants/UserManagementMenuBlade/~/AllUsers

---

## Quick Troubleshooting Checklist

### Booking/Teams Issues
1. ✅ Check function logs for errors
2. ✅ Verify secrets are set: `firebase functions:secrets:access MS_CLIENT_ID`
3. ✅ Check Azure AD permissions have admin consent
4. ✅ Verify Teams policy: `Get-CsApplicationAccessPolicy` in PowerShell
5. ✅ Check interview document in Firestore for `teamsJoinUrl`
6. ✅ Sign into Outlook as recruitment@alliedpharmacies.com to verify calendar

### Bulk Invite Issues
1. ✅ Check Firestore rules allow bookingLinks creation
2. ✅ Verify user is authenticated
3. ✅ Check browser console for specific errors
4. ✅ Verify candidate has phone number for WhatsApp

### Status/Display Issues
1. ✅ Verify status-colors.css is imported
2. ✅ Verify statusUtils.ts exists and is imported
3. ✅ Check CSS class names match status values
4. ✅ Hard refresh browser (Cmd+Shift+R)

### Deploy Issues
1. ✅ Build locally first: `npm run build` or `pnpm run build`
2. ✅ Check for TypeScript errors
3. ✅ Use correct hosting target (recruitment/booking/branch)
4. ✅ Run from project root for firebase commands

### After Any Fix
1. ✅ Test the feature
2. ✅ Check browser console for errors
3. ✅ Push to GitHub: `git add . && git commit -m "message" && git push`

---

## Recent Changes Log

| Date | Change | Files Affected |
|------|--------|----------------|
| 13 Jan 2026 | Per-branch trial booking fix | bookingFunctions.ts, index.ts, WhatsAppModal.tsx, EmailModal.tsx |
| 13 Jan 2026 | Trial system enhancements (manual scheduling, branch notifications, feedback) | trialNotifications.ts, bookingFunctions.ts |
| 31 Dec 2025 | Colored status badges | status-colors.css, statusUtils.ts, Candidates.tsx |
| 31 Dec 2025 | Bulk interview invites | Candidates.tsx, bulk-invite.css |
| 31 Dec 2025 | Status priority sorting | Candidates.tsx |
| 31 Dec 2025 | Hide rejected by default | Candidates.tsx |
| 30 Dec 2025 | Booking restrictions (bank holidays, lunch) | Settings.tsx, bookingFunctions.ts |
| 30 Dec 2025 | Auto status updates | bookingFunctions.ts |

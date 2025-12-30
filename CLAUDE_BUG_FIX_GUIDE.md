# Allied Recruitment Portal - Claude Bug Fix Guide

## Quick Reference

**GitHub Repo:** https://github.com/asatire1/Recruitment
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
│   │       ├── contexts/       # React contexts (AuthContext)
│   │       ├── hooks/          # Custom hooks
│   │       └── App.tsx         # Main app router
│   │
│   ├── booking-page/           # Public booking & applications (React + Vite)
│   │   └── src/
│   │       ├── components/     # UI components
│   │       ├── services/       # API service functions
│   │       ├── hooks/          # Custom hooks
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
│       ├── index.ts            # Main functions file
│       ├── bookingFunctions.ts # Booking-related functions
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
https://raw.githubusercontent.com/asatire1/Recruitment/main/{path}
```

### Key Files

**Recruitment Portal:**
- `https://raw.githubusercontent.com/asatire1/Recruitment/main/apps/recruitment-portal/src/pages/CandidateDetail.tsx`
- `https://raw.githubusercontent.com/asatire1/Recruitment/main/apps/recruitment-portal/src/pages/Candidates.tsx`
- `https://raw.githubusercontent.com/asatire1/Recruitment/main/apps/recruitment-portal/src/pages/UserManagement.tsx`
- `https://raw.githubusercontent.com/asatire1/Recruitment/main/apps/recruitment-portal/src/pages/Dashboard.tsx`
- `https://raw.githubusercontent.com/asatire1/Recruitment/main/apps/recruitment-portal/src/pages/Settings.tsx`
- `https://raw.githubusercontent.com/asatire1/Recruitment/main/apps/recruitment-portal/src/pages/JobDetail.tsx`
- `https://raw.githubusercontent.com/asatire1/Recruitment/main/apps/recruitment-portal/src/pages/Jobs.tsx`
- `https://raw.githubusercontent.com/asatire1/Recruitment/main/apps/recruitment-portal/src/pages/Calendar.tsx`
- `https://raw.githubusercontent.com/asatire1/Recruitment/main/apps/recruitment-portal/src/pages/Interviews.tsx`
- `https://raw.githubusercontent.com/asatire1/Recruitment/main/apps/recruitment-portal/src/contexts/AuthContext.tsx`
- `https://raw.githubusercontent.com/asatire1/Recruitment/main/apps/recruitment-portal/src/App.tsx`

**Booking Page:**
- `https://raw.githubusercontent.com/asatire1/Recruitment/main/apps/booking-page/src/components/JobApplication.tsx`
- `https://raw.githubusercontent.com/asatire1/Recruitment/main/apps/booking-page/src/components/BookingConfirmation.tsx`
- `https://raw.githubusercontent.com/asatire1/Recruitment/main/apps/booking-page/src/components/DatePicker.tsx`
- `https://raw.githubusercontent.com/asatire1/Recruitment/main/apps/booking-page/src/components/TimeSlotPicker.tsx`
- `https://raw.githubusercontent.com/asatire1/Recruitment/main/apps/booking-page/src/services/bookingService.ts`
- `https://raw.githubusercontent.com/asatire1/Recruitment/main/apps/booking-page/src/lib/firebase.ts`
- `https://raw.githubusercontent.com/asatire1/Recruitment/main/apps/booking-page/src/App.tsx`

**Cloud Functions:**
- `https://raw.githubusercontent.com/asatire1/Recruitment/main/functions/src/index.ts`
- `https://raw.githubusercontent.com/asatire1/Recruitment/main/functions/src/bookingFunctions.ts`
- `https://raw.githubusercontent.com/asatire1/Recruitment/main/functions/src/pushNotifications.ts`

**Shared Library:**
- `https://raw.githubusercontent.com/asatire1/Recruitment/main/packages/shared-lib/src/index.ts`

**Rules:**
- `https://raw.githubusercontent.com/asatire1/Recruitment/main/firestore.rules`
- `https://raw.githubusercontent.com/asatire1/Recruitment/main/storage.rules`

---

## Deployment Commands

### Recruitment Portal
```bash
cd ~/Documents/allied-recruitment-portal/apps/recruitment-portal
cp ~/Downloads/{FileName}.tsx src/pages/{FileName}.tsx
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

---

## Firestore Collections

| Collection | Purpose |
|------------|---------|
| `candidates` | Candidate records |
| `jobs` | Job listings |
| `interviews` | Interview/trial bookings |
| `branches` | Branch locations (200+) |
| `users` | User accounts & roles |
| `settings` | App settings (availability, templates) |
| `bookingLinks` | Booking tokens |
| `whatsappTemplates` | Message templates |
| `entities` | Business entities (Allied, Sharief, Core) |

---

## User Roles

| Role | Access |
|------|--------|
| `super_admin` | Full access to everything |
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
| `submitBooking` | Process booking submissions | us-central1 |
| `getBookingAvailability` | Get available dates | us-central1 |
| `getBookingTimeSlots` | Get time slots for date | us-central1 |
| `createUserWithPassword` | Create user with login | us-central1 |
| `sendBookingConfirmation` | Send confirmation emails | us-central1 |
| `onTrialCreated` | Trigger on trial creation | us-central1 |
| `sendFeedbackReminders` | Scheduled feedback reminders | us-central1 |

---

## Common Issues & Solutions

### CORS Errors
- Booking page uses `us-central1` region
- Check `apps/booking-page/src/lib/firebase.ts` for region config

### Firestore Permission Denied
- Check `firestore.rules`
- Public writes need `source == 'website'` and `status == 'new'`
- Super admins need read access to users collection

### Function 500 Errors
- Check logs: `firebase functions:log --only {functionName}`
- Often missing Firestore index - click link in error

### Build Errors
- Check for missing imports
- Run `pnpm install` if dependencies missing

### Cache Issues After Deploy
- Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

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
```bash
cd ~/Documents/allied-recruitment-portal/apps/recruitment-portal
cp ~/Downloads/FileName.tsx src/pages/FileName.tsx
pnpm run build
firebase deploy --only hosting:recruitment
```

Then update GitHub:
```bash
git add .
git commit -m "Fix: description"
git push
```
```

---

## Checking Function Logs

```bash
# All function logs
firebase functions:log

# Specific function
firebase functions:log --only parseCV

# Follow logs in real-time
firebase functions:log --follow
```

---

## Firebase Console Links

- **Console:** https://console.firebase.google.com/project/recruitment-633bd
- **Firestore:** https://console.firebase.google.com/project/recruitment-633bd/firestore
- **Auth:** https://console.firebase.google.com/project/recruitment-633bd/authentication
- **Functions:** https://console.firebase.google.com/project/recruitment-633bd/functions
- **Hosting:** https://console.firebase.google.com/project/recruitment-633bd/hosting

# Allied Recruitment Portal - Project Context

Use this file to give Claude context about the project setup at the start of new conversations.

## Project Structure
- **Location:** `~/Documents/allied-recruitment-portal`
- **Type:** React/TypeScript monorepo with pnpm workspaces
- **Apps:**
  - `apps/recruitment-portal` - Main admin portal
  - `apps/booking-page` - Public self-service booking for candidates
  - `apps/branch-portal` - Branch manager portal (future)
- **Shared packages:**
  - `packages/shared-lib` - Types, utilities, Firebase helpers
  - `packages/shared-ui` - Shared UI components
- **Cloud Functions:** `functions/` (Node.js 20)

## Hosting
- **Platform:** Firebase Hosting (not GitHub Pages)
- **Recruitment Portal:** https://allied-recruitment.web.app
- **Booking Page:** https://allied-booking.web.app
- **Firebase Project ID:** `recruitment-633bd`
- **Functions Region:** `europe-west2`

## Common Commands

```bash
# Install dependencies
pnpm install

# Build all apps
pnpm run build

# Build specific app
pnpm --filter @allied/booking-page build
pnpm --filter recruitment-portal build

# Run locally
pnpm run dev              # recruitment portal (port 3000)
pnpm run dev:booking      # booking page (port 3002)

# Deploy to Firebase
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only functions:createBookingLink  # specific function
firebase deploy --only firestore:rules

# Force redeploy functions (if skipped)
echo "// Force redeploy $(date)" >> functions/src/index.ts
firebase deploy --only functions
```

## When Claude Gives You Files

1. Download the zip file from Claude
2. Extract:
   ```bash
   unzip -o ~/Downloads/[filename].zip -d ~/Downloads/
   ```
3. Copy files to project:
   ```bash
   cp ~/Downloads/allied-r4-v2-2.5/[source-path] [destination-path]
   ```
4. Build and deploy:
   ```bash
   pnpm run build
   firebase deploy --only hosting
   ```

## Key Files
- `firebase.json` - Firebase hosting & functions config
- `firestore.rules` - Database security rules
- `firestore.indexes.json` - Firestore indexes
- `functions/src/index.ts` - All Cloud Functions

## Development Phases Completed
- **R1:** Project setup, authentication
- **R2:** Candidate management, CV upload
- **R3:** CV parsing with AI (Claude API)
- **R4:** WhatsApp integration, templates
- **R5:** Duplicate detection
- **R6:** Self-service scheduling, calendar, interviews

## Firebase Collections
- `candidates` - Candidate records
- `jobs` - Job postings
- `jobTitles` - Job title definitions
- `branches` - Branch/pharmacy locations
- `users` - Admin users
- `whatsappTemplates` - Message templates
- `bookingLinks` - Self-service booking tokens
- `interviews` - Scheduled interviews
- `settings` - App settings including availability

## Tips for Claude
- Always build before deploying: `pnpm run build`
- If functions deployment is "skipped", force it with a comment change
- The booking URL should be `https://allied-booking.web.app/book/[TOKEN]`
- Check `functions/src/index.ts` for Cloud Function code
- Check `packages/shared-lib/src/utils/` for shared utilities

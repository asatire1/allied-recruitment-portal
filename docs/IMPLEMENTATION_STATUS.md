# Allied Recruitment Portal - Implementation Status

**Last Updated:** December 2024  
**Reference:** ALLIED_RECRUITMENT_PORTAL_SRS-3.md

---

## Release 4: Duplicate Detection & Linking

### ✅ R4.1 - Duplicate Detection Logic (COMPLETE)

| Component | Description | Status |
|-----------|-------------|--------|
| Duplicate detection service | Comprehensive duplicate detection module | ✅ |
| Normalised phone matching | Handles +44, 07xxx, spaces, dashes | ✅ |
| Normalised name matching | Case-insensitive, removes special chars | ✅ |
| Email normalisation | Handles Gmail plus addressing, dots | ✅ |
| Duplicate key generation | firstName\|lastName\|phone format | ✅ |
| Levenshtein distance | String similarity calculation | ✅ |
| Name similarity | Handles swapped first/last names | ✅ |
| Scenario detection | Same job, rejected, hired, etc. | ✅ |
| Severity levels | High/Medium/Low classification | ✅ |
| Confidence scoring | 0-100 match confidence | ✅ |
| Recommended actions | Block/Warn/Allow based on severity | ✅ |

**Files Created:**
- `packages/shared-lib/src/utils/duplicateDetection.ts` - Comprehensive duplicate detection service

**Files Modified:**
- `packages/shared-lib/src/utils/index.ts` - Re-exports duplicate detection module
- `packages/shared-lib/src/types/index.ts` - Added DuplicateSeverity, DuplicateScenario types
- `packages/shared-ui/src/components/DuplicateAlertBanner.tsx` - Enhanced with severity, scenarios
- `packages/shared-ui/src/index.ts` - Updated exports

**Duplicate Detection Algorithm:**
```typescript
// Primary match: Normalised Name + Phone (duplicateKey)
const duplicateKey = `${normalizeName(firstName)}|${normalizeName(lastName)}|${normalizePhone(phone)}`

// Secondary checks:
// - Email match (85% confidence)
// - Phone match with fuzzy name (75% confidence)
// - Name similarity >= 85% (fuzzy match)
// - Combined matches boost confidence

// Scenario detection for context-aware warnings:
// - same_job_same_location → HIGH severity, block
// - previously_hired → HIGH severity, alert
// - previously_rejected → MEDIUM severity, review history
// - same_job_diff_location → MEDIUM severity, warn
// - different_job → LOW severity, allow
```

### ✅ R4.2 - Duplicate Alert Banner (COMPLETE)

| Component | Description | Status |
|-----------|-------------|--------|
| Warning banner UI | Shows potential duplicates with details | ✅ |
| Severity-based theming | Red (high), Amber (medium), Blue (low) | ✅ |
| Scenario icons | Visual indicators for each scenario type | ✅ |
| Scenario messages | Human-readable context about the duplicate | ✅ |
| Days since application | Shows "Applied 5 days ago" etc. | ✅ |
| Branch/location display | Shows where candidate previously applied | ✅ |
| Recommended action badge | Block/Warn/Allow indicator | ✅ |
| Matched fields tags | Shows which fields matched (name, phone, email) | ✅ |
| Compact mode | Expandable view for multiple matches | ✅ |

**Files Modified:**
- `packages/shared-ui/src/components/DuplicateAlertBanner.tsx` - Complete redesign with scenarios

### ✅ R4.3 - View Existing Record (COMPLETE)

| Component | Description | Status |
|-----------|-------------|--------|
| View button in banner | Opens existing record | ✅ |
| Opens in new tab | Uses window.open with _blank | ✅ |
| Full record access | Links to /candidates/{id} | ✅ |
| Integration with Candidates.tsx | handleViewDuplicateCandidate handler | ✅ |
| Updated duplicate check | Uses new findDuplicates with full data | ✅ |
| RecommendedAction state | Tracks block/warn/allow recommendation | ✅ |

**Files Modified:**
- `apps/recruitment-portal/src/pages/Candidates.tsx` - Updated to use new duplicate detection

### ✅ R4.4 - Merge Records Modal (COMPLETE)

| Component | Description | Status |
|-----------|-------------|--------|
| Side-by-side comparison | Shows primary vs secondary candidate data | ✅ |
| Summary cards | Visual overview of both records at top | ✅ |
| Field selection | Click to select which value to keep | ✅ |
| Smart Select | Auto-picks best values from each record | ✅ |
| Combine option | Merges notes, skills, qualifications together | ✅ |
| Combined fields indicator | Purple styling for combined fields | ✅ |
| Result preview column | Shows merged result in real-time | ✅ |
| Difference highlighting | Yellow highlight for differing values | ✅ |
| Delete secondary option | Checkbox to delete source record | ✅ |
| Confirmation step | Warning before final merge | ✅ |
| Changes counter | Shows how many fields will be updated | ✅ |
| Status badges | Shows candidate status in summary cards | ✅ |
| Application dates | Shows when each candidate applied | ✅ |

**Files Modified:**
- `packages/shared-ui/src/components/MergeRecordsModal.tsx` - Complete rewrite with enhanced features
- `packages/shared-ui/src/index.ts` - Export CombinedFieldsData type
- `apps/recruitment-portal/src/pages/Candidates.tsx` - Updated handleMergeComplete with combined fields

**Merge Features:**
```typescript
// Field selection options
type FieldSelection = 'primary' | 'secondary' | 'combined'

// Combinable fields (merges both values)
- notes: Joins with "--- Merged Note ---" separator
- skills: Combines arrays, removes duplicates
- qualifications: Combines arrays, removes duplicates

// Smart Select algorithm
- If only secondary has value → use secondary
- If secondary is longer → use secondary  
- If both have combinable fields → combine
- Otherwise → keep primary
```

### ✅ R4.5 - Link Records (COMPLETE)

| Component | Description | Status |
|-----------|-------------|--------|
| Link button in banner | Purple "Link & Add" button | ✅ |
| Bi-directional linking | Both records reference each other | ✅ |
| Application history | Creates ApplicationRecord for both candidates | ✅ |
| Primary record marking | Existing record marked as 'primary' | ✅ |
| Linked record marking | New record marked as 'linked' | ✅ |
| Activity logging | Logs link action on both records | ✅ |
| Success confirmation | Detailed alert with job/location info | ✅ |
| Action help text | Context-aware suggestions in banner | ✅ |
| Button tooltips | Explains what each action does | ✅ |

**Files Modified:**
- `apps/recruitment-portal/src/pages/Candidates.tsx` - Enhanced handleLinkRecords with application history
- `packages/shared-ui/src/components/DuplicateAlertBanner.tsx` - Added action help, better tooltips

**Link Flow:**
```typescript
// When user clicks "Link & Add":
1. Creates new candidate record with:
   - duplicateStatus: 'linked'
   - primaryRecordId: existingCandidateId
   - linkedCandidateIds: [existingCandidateId]
   - applicationHistory: [newApplicationRecord]

2. Updates existing candidate with:
   - duplicateStatus: 'primary'
   - linkedCandidateIds: [...existing, newCandidateId]
   - applicationHistory: [...existing, currentJobRecord]

3. Logs activity on both records
4. Updates local state
5. Shows success confirmation
```

### ✅ R4.6 - Application History Tab (COMPLETE)

| Component | Description | Status |
|-----------|-------------|--------|
| Application History Card | Shows all linked applications | ✅ |
| Timeline design | Vertical timeline with dots and connector | ✅ |
| Current application badge | Blue highlighted "Current Application" | ✅ |
| Linked applications | Clickable cards that open in new tab | ✅ |
| Historical records | Shows applicationHistory array data | ✅ |
| Primary/Linked badge | Shows duplicate status in header | ✅ |
| Job title display | Shows position for each application | ✅ |
| Branch/Location display | Shows where candidate applied | ✅ |
| Status badges | Color-coded status for each application | ✅ |
| Date display | Shows application date | ✅ |
| Source display | Shows recruitment source | ✅ |
| Outcome display | Shows hired/rejected/withdrawn for historical | ✅ |
| Loading state | Spinner while fetching linked records | ✅ |
| Responsive design | Mobile-friendly layout | ✅ |

**Files Modified:**
- `apps/recruitment-portal/src/pages/CandidateDetail.tsx` - Added linked candidates fetch and Application History section
- `apps/recruitment-portal/src/pages/CandidateDetail.css` - Added timeline and card styles
- `packages/shared-ui/src/components/Badge.tsx` - Added 'neutral' variant

**Application History Features:**
- Only shows when candidate has linked records or application history
- Fetches all linked candidates from Firestore
- Supports bi-directional linking (shows links from both primary and linked records)
- Timeline visualization with current application highlighted
- Click any linked application to view it in a new tab
- Shows outcome (hired/rejected/withdrawn) for historical records

---

### ✅ R4.7 - Mark Not Duplicate (COMPLETE)

| Component | Description | Status |
|-----------|-------------|--------|
| Not Same Person button | Button in duplicate alert banner | ✅ |
| Persist decision | Store notDuplicateOf array in both candidates | ✅ |
| Activity logging | Log the decision on existing candidate | ✅ |
| Exclude from future checks | Filter out marked candidates in duplicate detection | ✅ |
| Session tracking | Track decisions during add flow | ✅ |
| Bi-directional storage | Both candidates reference each other | ✅ |
| Duplicate status update | Set status to 'reviewed' | ✅ |

**Files Modified:**
- `packages/shared-lib/src/types/index.ts` - Added `notDuplicateOf` field and `reviewed` status
- `apps/recruitment-portal/src/pages/Candidates.tsx` - Enhanced handleMarkNotDuplicate

**Data Structure:**
```typescript
// New candidate (after "not duplicate" decision):
{
  notDuplicateOf: ['existing-id-1', 'existing-id-2'],
  duplicateStatus: 'reviewed',
  duplicateReviewedAt: Timestamp,
  duplicateReviewedBy: 'user-id'
}

// Existing candidate (updated):
{
  notDuplicateOf: [...existing, 'new-candidate-id'],
  duplicateReviewedAt: Timestamp,
  duplicateReviewedBy: 'user-id'
}
```

**Flow:**
1. User clicks "Not Same Person" on a duplicate match
2. Match is removed from UI, added to `notDuplicateIds` state
3. Existing candidate is updated with review timestamp
4. Activity is logged on existing candidate
5. When new candidate is created:
   - `notDuplicateOf` array is set with all dismissed IDs
   - Status set to 'reviewed'
   - All existing candidates updated with new candidate's ID

---

## Release 3: AI CV Parsing

### ✅ R3.1 - Cloud Function: parseCV (COMPLETE)

| Component | Description | Status |
|-----------|-------------|--------|
| Firebase Functions setup | package.json, tsconfig.json | ✅ |
| parseCV function | Main Cloud Function (v2) | ✅ |
| PDF extraction | Using pdf-parse library | ✅ |
| DOCX extraction | Using mammoth library | ✅ |
| Claude AI integration | Structured CV parsing | ✅ |
| Pharmacy-specific parsing | GPhC, NVQ, MPharm detection | ✅ |
| Confidence scores | Per-field confidence (0-100) | ✅ |
| Error handling | HttpsError with proper codes | ✅ |
| Authentication check | Requires Firebase Auth | ✅ |

**Files Created:**
- `functions/package.json` - Dependencies and scripts
- `functions/tsconfig.json` - TypeScript configuration
- `functions/src/index.ts` - Main Cloud Functions
- `functions/.env.example` - Environment template
- `functions/.gitignore` - Git ignore rules
- `firebase.json` - Updated with functions config

**Deployment Steps:**
```bash
cd functions
npm install

# Set Anthropic API key
firebase functions:secrets:set ANTHROPIC_API_KEY

# Deploy
npm run deploy
```

### 🔲 R3.2 - Text Extraction (PENDING)
Already included in R3.1 via pdf-parse and mammoth libraries.

### ✅ R3.3 - Claude API Integration (COMPLETE)
Included in R3.1 with structured parsing prompt.

### ✅ R3.4 - Auto-populate Form (COMPLETE)

| Component | Description | Status |
|-----------|-------------|--------|
| Parse CV button | Added to CV card in candidate detail | ✅ |
| Parsed CV modal | Shows extracted data with checkboxes | ✅ |
| Field selection | Toggle which fields to apply | ✅ |
| Confidence scores | Color-coded per field (high/medium/low) | ✅ |
| Apply to profile | Updates candidate with selected fields | ✅ |
| Activity logging | Logs parse and apply actions | ✅ |

**Files Modified:**
- `apps/recruitment-portal/src/pages/CandidateDetail.tsx` - Parse button, modal, handlers
- `apps/recruitment-portal/src/pages/CandidateDetail.css` - Modal styles
- `packages/shared-lib/src/types/index.ts` - CV parsing types

### ✅ R3.5 - Parse Status UI (COMPLETE)

| Component | Description | Status |
|-----------|-------------|--------|
| Status indicator | Shows success/partial/error after parse | ✅ |
| Loading state | Spinner with "Parsing CV with AI..." message | ✅ |
| Confidence display | Overall confidence score in modal header | ✅ |

### ✅ R3.6 - Bulk CV Upload (COMPLETE)

| Component | Description | Status |
|-----------|-------------|--------|
| Bulk Upload button | Added to candidates header | ✅ |
| Bulk Upload modal | Multi-file selection and config | ✅ |
| Drag & drop zone | Drop multiple CVs at once | ✅ |
| File validation | PDF/DOC/DOCX, max 10MB each | ✅ |
| Job title assignment | Set job title for all uploads | ✅ |
| Source assignment | Set source (Indeed, etc.) for all | ✅ |
| Queue processing | Process files one by one | ✅ |
| Progress tracking | Real-time status per file | ✅ |
| Auto-parse | Each CV parsed with AI automatically | ✅ |
| Auto-create | Candidates created with parsed data | ✅ |
| View links | Quick link to view created candidates | ✅ |

**Files Modified:**
- `apps/recruitment-portal/src/pages/Candidates.tsx` - Bulk upload modal and handlers
- `apps/recruitment-portal/src/pages/Candidates.css` - Bulk upload styles

### ✅ R3.7 - Error Handling (COMPLETE)

| Component | Description | Status |
|-----------|-------------|--------|
| Retry logic (single CV) | Up to 3 retries with exponential backoff | ✅ |
| Retry logic (bulk) | Up to 2 retries per file, automatic | ✅ |
| Retryable error detection | Timeouts, network errors, unavailable | ✅ |
| Human-readable errors | Context-aware error messages | ✅ |
| Error UI (single) | Shows error with Retry + Manual Entry buttons | ✅ |
| Error UI (bulk) | Retry Failed button for all failed files | ✅ |
| Retrying status | Visual indicator when retrying | ✅ |
| Function timeout | 2 minute timeout for parsing | ✅ |

**Error Types Handled:**
- `functions/deadline-exceeded` → "The parsing took too long..."
- `functions/unavailable` → "Service temporarily unavailable..."
- `functions/unauthenticated` → "You need to be logged in..."
- `functions/permission-denied` → "You don't have permission..."
- `functions/not-found` → "The CV file could not be found..."
- Text extraction errors → "Could not read the CV file..."
- API key errors → "AI parsing is not configured..."

**Files Modified:**
- `apps/recruitment-portal/src/pages/CandidateDetail.tsx` - Retry logic, error messages
- `apps/recruitment-portal/src/pages/CandidateDetail.css` - Error UI styles
- `apps/recruitment-portal/src/pages/Candidates.tsx` - Bulk retry logic
- `apps/recruitment-portal/src/pages/Candidates.css` - Retrying animation

---

## Release 3 Summary: AI CV Parsing ✅ COMPLETE

All R3 tasks completed:
- ✅ R3.1 - Cloud Function: parseCV
- ✅ R3.2 - Text extraction (PDF/DOCX)
- ✅ R3.3 - Claude API integration
- ✅ R3.4 - Auto-populate form
- ✅ R3.5 - Parse status UI
- ✅ R3.6 - Bulk CV upload
- ✅ R3.7 - Error handling

---

## Duplicate Detection (FR-CAND-009 to FR-CAND-014)

### ✅ Implemented

| Requirement | Description | Status |
|-------------|-------------|--------|
| FR-CAND-009 | Duplicate Detection | ✅ Implemented |
| | Match on: First Name + Last Name + Phone Number | ✅ |
| | Case-insensitive, whitespace ignored | ✅ |
| | Phone normalizes format (+44 vs 0, removes spaces/dashes) | ✅ |
| | Check runs before candidate is saved | ✅ |
| FR-CAND-010 | Duplicate Alert Display | ✅ Implemented |
| | Warning modal when duplicate detected | ✅ |
| | Shows: Name, phone, email | ✅ |
| | Shows: Applied date | ✅ |
| | Shows: Current status | ✅ |
| | Shows: Job applied for | ✅ |
| | Actions: "View Existing" / "Add Anyway" / "Cancel" | ✅ |

### 🔲 Not Yet Implemented

| Requirement | Description | Status |
|-------------|-------------|--------|
| FR-CAND-010 | Click to view existing in new tab | 🔲 Navigates in same tab |
| FR-CAND-011 | Different duplicate scenarios | 🔲 Pending |
| | Same person, same job, same location | 🔲 |
| | Same person, same job, different location | 🔲 |
| | Same person, previously rejected | 🔲 |
| | Same person, previously hired | 🔲 |
| FR-CAND-012 | Merge Duplicate Records | 🔲 Pending |
| | Select primary record | 🔲 |
| | Side-by-side comparison | 🔲 |
| | Merge all history/notes/interviews | 🔲 |
| | Audit log of merge | 🔲 |
| FR-CAND-013 | Duplicate Detection on Booking Page | 🔲 Pending |
| | Check when candidate self-submits | 🔲 |
| | "Yes, that's me" / "No, I'm new" options | 🔲 |
| | Flag for recruiter review | 🔲 |
| FR-CAND-014 | Application History View | 🔲 Pending |
| | Show all linked applications on detail page | 🔲 |

---

## Technical Implementation Notes

### Duplicate Key Generation
```typescript
// Located in: apps/recruitment-portal/src/pages/Candidates.tsx
const generateDuplicateKey = (firstName: string, lastName: string, phone: string): string => {
  const normalizedName = `${firstName}${lastName}`.toLowerCase().replace(/\s/g, '')
  const normalizedPhone = normalizePhone(phone)  // Removes +44, spaces, dashes
  return `${normalizedName}_${normalizedPhone}`
}
```

### Database Schema
```typescript
// Each candidate document includes:
{
  duplicateKey: string,           // e.g., "johndoe_07123456789"
  duplicateStatus?: 'primary' | 'linked' | 'reviewed_not_duplicate',
  linkedDuplicates?: string[],    // Array of candidate IDs
  duplicateReviewedAt?: Timestamp,
  duplicateReviewedBy?: string
}
```

### Firestore Index Required
```json
{
  "collectionGroup": "candidates",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "duplicateKey", "order": "ASCENDING" }
  ]
}
```

---

## Next Steps for Future Development

### Priority 1: Scenario-Based Alerts
Enhance duplicate detection to show different warnings based on:
- Same job application → Block or strong warning
- Previously rejected → Show rejection history with reason
- Currently employed → Alert for potential internal transfer

### Priority 2: Merge Functionality
Build merge UI allowing:
- Side-by-side record comparison
- Field-by-field selection
- Combined activity history
- Audit trail

### Priority 3: Booking Page Integration
Add duplicate check to public booking page with:
- Pre-check before appointment selection
- Link to existing record if candidate confirms identity
- New record creation with duplicate flag

### Priority 4: Bulk Duplicate Detection
Admin tool to:
- Scan all existing candidates for duplicates
- Present matches for manual review
- Bulk merge or dismiss options

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/recruitment-portal/src/pages/Candidates.tsx` | Added duplicate check, modal, states |
| `apps/recruitment-portal/src/pages/Candidates.css` | Added duplicate modal styles |
| `firestore.indexes.json` | Added duplicateKey index |
| `docs/IMPLEMENTATION_STATUS.md` | This document |

---

*This document should be updated as features are implemented.*

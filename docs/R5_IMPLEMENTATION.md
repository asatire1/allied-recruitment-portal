# Phase R5: WhatsApp Integration - Implementation Notes

## R5.1 Templates Collection ✅ COMPLETE

### Summary
Implemented the WhatsApp Templates management system in Settings, including:

1. **Firestore Schema** (already existed in rules)
   - Collection: `whatsappTemplates`
   - Document structure matches SRS specification

2. **Data Model** (in Settings.tsx)
```typescript
interface WhatsAppTemplate {
  id: string
  name: string
  category: TemplateCategory
  content: string
  placeholders: string[]
  active: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy?: string
}

type TemplateCategory = 
  | 'interview' 
  | 'trial' 
  | 'offer' 
  | 'rejection' 
  | 'reminder' 
  | 'general'
```

3. **Seed Data** - 8 default templates:
   - Interview Invitation
   - Interview Reminder
   - Trial Shift Invitation
   - Trial Shift Reminder
   - Job Offer
   - Application Unsuccessful
   - Follow Up - Application Status
   - Request for Documents

4. **Available Placeholders**:
   - `{{firstName}}` - Candidate first name
   - `{{lastName}}` - Candidate last name
   - `{{fullName}}` - Candidate full name
   - `{{jobTitle}}` - Applied position
   - `{{companyName}}` - Entity name
   - `{{branchName}}` - Branch/location name
   - `{{branchAddress}}` - Branch full address
   - `{{interviewDate}}` - Scheduled date
   - `{{interviewTime}}` - Scheduled time
   - `{{interviewBookingLink}}` - Self-service booking URL

---

## R5.2 Template Management Page ✅ COMPLETE

### Summary
Enhanced the template management UI with additional features for better usability.

### Features Added

1. **Search Functionality**
   - Search templates by name or content
   - Real-time filtering as you type
   - Combined with category filter

2. **Template Preview Modal**
   - Full-screen preview of template content
   - Placeholder highlighting with distinct styling
   - Shows placeholder descriptions
   - Quick actions: Edit, Duplicate, Close

3. **Duplicate Template**
   - One-click duplication from template card
   - Also available from preview modal
   - Pre-fills form with "(Copy)" suffix

4. **Enhanced UI**
   - Preview button (👁) on each template card
   - Duplicate button (⧉) on each template card
   - Clickable content preview opens preview modal
   - Improved summary showing filtered vs total count
   - Toolbar layout with search + category filters

### Files Modified

1. **`apps/recruitment-portal/src/pages/Settings.tsx`**
   - Added `templateSearch` and `previewingTemplate` state
   - Added `handleDuplicateTemplate` handler
   - Added `handlePreviewTemplate` handler  
   - Added `highlightPlaceholders` utility function
   - Enhanced `filteredTemplates` to include search
   - Added Template Preview Modal
   - Enhanced template cards with new action buttons

2. **`apps/recruitment-portal/src/pages/Settings.css`**
   - Added `.template-toolbar` styles
   - Added `.template-search` styles
   - Added preview/duplicate button styles
   - Added `.template-preview-modal` styles
   - Added `.placeholder-highlight` for preview
   - Added responsive styles for toolbar

### UI Components

```
┌─────────────────────────────────────────────────────────────┐
│ WhatsApp Templates                        [+ New Template]  │
├─────────────────────────────────────────────────────────────┤
│ 🔍 Search templates...                                      │
│ [All (8)] [Interview (2)] [Trial (2)] [Offer (1)] ...      │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ INTERVIEW  Interview Invitation     [👁] [⧉] [✓] [✎] [×]│ │
│ │ ─────────────────────────────────────────────────────── │ │
│ │ Hi {{firstName}},                                       │ │
│ │ Thank you for applying to {{jobTitle}}...               │ │
│ │ ─────────────────────────────────────────────────────── │ │
│ │ {{firstName}} {{jobTitle}} {{interviewBookingLink}}     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Showing 8 of 8 templates • 8 active                        │
└─────────────────────────────────────────────────────────────┘
```

---

## R5.3 Placeholder System ✅ COMPLETE

### Summary
Created a comprehensive placeholder system in `@allied/shared-lib` that handles placeholder replacement, validation, and data preparation for WhatsApp templates.

### New File: `packages/shared-lib/src/utils/placeholders.ts`

This module provides:

1. **Type Definitions**
   - `PlaceholderDefinition`: Describes a placeholder (key, label, description, category)
   - `PlaceholderData`: Data object for replacing placeholders
   - `PlaceholderResult`: Result of placeholder replacement

2. **Placeholder Definitions** (10 total, categorized)
   - **Candidate**: firstName, lastName, fullName
   - **Job**: jobTitle, companyName
   - **Branch**: branchName, branchAddress
   - **Interview**: interviewDate, interviewTime
   - **System**: interviewBookingLink

3. **Core Functions**
   - `extractPlaceholders(template)`: Get placeholder names from template
   - `extractPlaceholderKeys(template)`: Get full {{placeholder}} keys
   - `replacePlaceholders(template, data)`: Replace placeholders with data
   - `getMissingPlaceholders(template, data)`: Find unfilled placeholders
   - `validatePlaceholders(template, data)`: Validate required fields

4. **Visual Indicators**
   - `highlightPlaceholdersHTML(content, options)`: Highlight placeholders for display
   - Supports filled/unfilled styling with custom CSS classes

5. **Data Preparation Helpers**
   - `prepareCandidateData(candidate)`: Extract candidate fields
   - `prepareInterviewData(interview)`: Format interview date/time
   - `combinePlaceholderData(...sources)`: Merge multiple data sources

6. **WhatsApp Utilities**
   - `formatPhoneForWhatsApp(phone)`: Format phone for wa.me
   - `generateWhatsAppURL(phone, message)`: Generate WhatsApp link
   - `generateBookingLinkPlaceholder(candidateId, type)`: Create booking URL
   - `usesBookingLink(template)`: Check if template uses booking link

### Usage Example

```typescript
import { 
  replacePlaceholders, 
  prepareCandidateData, 
  prepareInterviewData,
  combinePlaceholderData,
  generateWhatsAppURL
} from '@allied/shared-lib'

// Prepare data from different sources
const candidateData = prepareCandidateData(candidate)
const interviewData = prepareInterviewData(interview)
const data = combinePlaceholderData(candidateData, interviewData, {
  interviewBookingLink: 'https://book.allied.com/abc123'
})

// Replace placeholders
const result = replacePlaceholders(template.content, data)

if (result.allFilled) {
  // Generate WhatsApp URL
  const url = generateWhatsAppURL(candidate.phone, result.text)
  window.open(url, '_blank')
} else {
  // Show warning about unfilled placeholders
  console.warn('Missing:', result.unfilledPlaceholders)
}
```

### Integration with Settings.tsx

Updated Settings.tsx to use the shared placeholder definitions:

```typescript
import { 
  PLACEHOLDER_DEFINITIONS,
  type PlaceholderDefinition
} from '@allied/shared-lib'

// Map to local format for backwards compatibility
const AVAILABLE_PLACEHOLDERS = PLACEHOLDER_DEFINITIONS.map(p => ({
  key: p.key,
  label: p.label,
  description: p.description
}))
```

### Files Modified

1. **NEW: `packages/shared-lib/src/utils/placeholders.ts`**
   - Complete placeholder system implementation
   - ~350 lines of well-documented code

2. **`packages/shared-lib/src/utils/index.ts`**
   - Added exports for new placeholder module
   - Marked legacy functions as deprecated

3. **`apps/recruitment-portal/src/pages/Settings.tsx`**
   - Imported PLACEHOLDER_DEFINITIONS from shared-lib
   - Replaced local placeholder definitions

---

## R5.4 WhatsApp Modal ✅ COMPLETE

### Summary
Implemented the WhatsApp messaging modal in CandidateDetail page, allowing users to send template-based messages to candidates via WhatsApp.

### Features Implemented

1. **Recipient Header**
   - Shows candidate avatar (initials)
   - Displays name and phone number

2. **Quick Actions**
   - "Invite to Interview" button
   - "Invite to Trial" button
   - Auto-selects appropriate template and fills placeholders

3. **Template Selection**
   - Category filter dropdown
   - Template grid with visual selection
   - Templates loaded from Firestore

4. **Message Preview/Edit**
   - Toggle between preview and edit modes
   - Auto-fills placeholders with candidate data
   - Warning for unfilled placeholders

5. **Actions**
   - Copy to clipboard
   - Send via WhatsApp (opens wa.me URL)
   - Activity logging on send

### Files Modified

1. **`apps/recruitment-portal/src/pages/CandidateDetail.tsx`**
   - Added WhatsApp-related imports from shared-lib
   - Added WhatsAppTemplate type and TEMPLATE_CATEGORIES
   - Added modal state variables
   - Added functions:
     - `openWhatsAppModal()` - Opens modal and loads templates
     - `loadWhatsAppTemplates()` - Fetches active templates
     - `getPlaceholderData()` - Prepares data for placeholder replacement
     - `handleSelectTemplate()` - Selects template and fills placeholders
     - `handleQuickInterviewInvite()` - Quick action for interview
     - `handleQuickTrialInvite()` - Quick action for trial
     - `handleCopyMessage()` - Copy to clipboard
     - `handleSendWhatsApp()` - Generate URL and open WhatsApp
   - Updated button handlers from `openWhatsApp` to `openWhatsAppModal`
   - Added WhatsApp Modal JSX

2. **`apps/recruitment-portal/src/pages/CandidateDetail.css`**
   - Added 200+ lines of WhatsApp modal styles
   - Recipient header styling
   - Quick action buttons
   - Template grid
   - Message preview/editor
   - Responsive design

### UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Send WhatsApp Message                                  [X]  │
├─────────────────────────────────────────────────────────────┤
│  ┌────┐  Katie Owen                                         │
│  │ KO │  +447123456789                                      │
│  └────┘                                                     │
│                                                             │
│  Quick Actions                                              │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ 📅 Invite to     │  │ 📋 Invite to     │                │
│  │    Interview     │  │    Trial         │                │
│  └──────────────────┘  └──────────────────┘                │
│                                                             │
│  ─────────── or choose a template ───────────               │
│                                                             │
│  Choose a template              [All Categories ▼]          │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ INTERVIEW        │  │ TRIAL            │                │
│  │ Interview Invite │  │ Trial Invitation │                │
│  └──────────────────┘  └──────────────────┘                │
│                                                             │
│  Message                               [👁 Preview] [✏ Edit]│
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Hi Katie,                                           │   │
│  │                                                     │   │
│  │ Thank you for applying for Pharmacist...           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│               [Cancel]  [📋 Copy]  [💬 Send via WhatsApp]   │
└─────────────────────────────────────────────────────────────┘
```

### Placeholder Replacement

The modal uses the placeholder system from R5.3:

```typescript
const data = getPlaceholderData() // Gets candidate info
const result = replaceTemplatePlaceholders(template.content, data)
setMessageContent(result.text)
```

### Activity Logging

When a message is sent:
```typescript
logActivity(
  candidate.id,
  'update',
  `Sent WhatsApp message using template "${template.name}"`
)
```

---

## Next Steps

- **R5.5**: Message preview with live data (mostly done in R5.4)
- **R5.6**: Send to WhatsApp functionality (done in R5.4)
- **R5.7**: Copy to clipboard (done in R5.4)

R5 is essentially complete! Minor enhancements could include:
- Booking link generation via Cloud Functions
- Interview/trial data from calendar integration
- Message history tracking

- **R5.3**: Placeholder system (framework in place, auto-detection working)
- **R5.4**: WhatsApp modal from candidate profile
- **R5.5**: Message preview with candidate data
- **R5.6**: Send to WhatsApp (generate wa.me URL)
- **R5.7**: Copy to clipboard functionality

---

## R5.5 Booking Link Generation ✅ COMPLETE

### Summary
Implemented secure booking link generation via **Cloud Function** for better security. Token generation happens server-side using Node.js crypto.

### Cloud Functions Added (`functions/src/index.ts`)

1. **`createBookingLink`**
   - Generates secure 21-char token using Node.js `crypto.randomBytes()`
   - Stores SHA-256 hash in Firestore (never the raw token)
   - Returns URL with token (only returned once)
   - Requires authentication

2. **`validateBookingToken`**
   - Public function for booking page
   - Validates token, checks expiry and usage
   - Returns candidate info if valid

3. **`markBookingLinkUsed`**
   - Marks link as used after booking complete
   - Records interview ID if provided

### Security Benefits of Cloud Function Approach

| Aspect | Client-Side | Cloud Function ✅ |
|--------|-------------|------------------|
| Token Generation | Web Crypto API | Node.js crypto (more entropy) |
| Secret Exposure | Token visible in browser | Token only in response |
| Rate Limiting | None | Firebase built-in |
| Audit Trail | Client logs | Server logs |
| Tampering | Possible | Protected |

### Client-Side Integration

```typescript
// In CandidateDetail.tsx
const generateBookingLinkForCandidate = async (type: 'interview' | 'trial') => {
  const functions = getFirebaseFunctions()
  const createBookingLinkFn = httpsCallable(functions, 'createBookingLink')
  
  const result = await createBookingLinkFn({
    candidateId: candidate.id,
    candidateName: `${candidate.firstName} ${candidate.lastName}`,
    type,
    jobTitle: candidate.jobTitle,
    expiryDays: 3,
  })
  
  return result.data.url // e.g., https://alliedpharmacies.com/book/abc123xyz...
}
```

### Firestore Schema

Collection: `bookingLinks`

```typescript
{
  tokenHash: string       // SHA-256 hash (never raw token)
  candidateId: string
  candidateName: string
  candidateEmail?: string
  type: 'interview' | 'trial'
  jobTitle?: string
  status: 'active' | 'used' | 'expired' | 'revoked'
  expiresAt: Timestamp    // 3 days default
  maxUses: number         // Default: 1
  useCount: number
  createdAt: Timestamp
  createdBy: string       // User ID who generated
}
```

### Files Modified

1. **`functions/src/index.ts`**
   - Added `createBookingLink` Cloud Function
   - Added `validateBookingToken` Cloud Function  
   - Added `markBookingLinkUsed` Cloud Function
   - Server-side token generation with Node.js crypto

2. **`packages/shared-lib/src/utils/bookingLinks.ts`**
   - Refactored to client-side helpers only
   - Types for booking link data
   - URL formatting utilities
   - `getCandidateBookingLinks()` for listing existing links
   - `revokeBookingLink()` for admin use

3. **`apps/recruitment-portal/src/pages/CandidateDetail.tsx`**
   - Updated `generateBookingLinkForCandidate()` to call Cloud Function
   - Removed direct Firestore writes for booking links

---

## Phase R5 Complete ✅

All WhatsApp integration requirements fulfilled:

| Requirement | Status |
|-------------|--------|
| FR-WA-001: Template Management | ✅ |
| FR-WA-002: Placeholder System | ✅ |
| FR-WA-003: Template Categories | ✅ |
| FR-CAND-016: WhatsApp Communication | ✅ |
| Auto-generate booking link | ✅ |
| Visual indicator for unfilled placeholders | ✅ |

---

## Differences from SRS

1. **TemplateCategory**: Added 'reminder' category (not in original SRS but useful)
2. **Template structure**: Added `active` boolean field for soft-delete
3. **Placeholders**: Stored as array in template document for easy reference
4. **Auto-extraction**: System auto-detects placeholders from content
5. **Preview modal**: Added for better template viewing (enhancement)
6. **Duplicate feature**: Added for quick template creation (enhancement)
7. **Search**: Added for finding templates quickly (enhancement)

## Testing Notes

To test R5.2:
1. Navigate to Settings → WhatsApp Templates
2. Test search - type in search box, templates filter in real-time
3. Test preview - click 👁 or the content area to open preview modal
4. Test duplicate - click ⧉, form opens with "(Copy)" suffix
5. Verify placeholder highlighting shows in preview modal
6. Test responsive design on mobile viewport

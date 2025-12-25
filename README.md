# Allied Recruitment Portal

A comprehensive recruitment management system for Allied Pharmacies, built with React, TypeScript, and Firebase.

## 🏗️ Architecture

This is a **monorepo** containing three applications and shared packages:

```
allied-recruitment-portal/
├── apps/
│   ├── recruitment-portal/   # Main admin app (~500KB)
│   ├── branch-portal/        # Branch manager PWA (~50KB)
│   └── booking-page/         # Public booking page (~30KB)
├── packages/
│   ├── shared-ui/            # Shared React components
│   └── shared-lib/           # Shared utilities & types
├── .github/workflows/        # CI/CD pipelines
└── package.json              # Workspace root
```

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 9.0.0
- Firebase CLI (`npm install -g firebase-tools`)

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd allied-recruitment-portal

# Install dependencies
pnpm install

# Copy environment file
cp apps/recruitment-portal/.env.example apps/recruitment-portal/.env.local
# Edit .env.local with your Firebase config
```

### Development

```bash
# Start recruitment portal
pnpm dev

# Start with Firebase emulators (recommended)
pnpm firebase:emulators
# Then in another terminal:
pnpm dev
```

## 📋 Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start recruitment portal dev server |
| `pnpm dev:branch` | Start branch portal dev server |
| `pnpm dev:booking` | Start booking page dev server |
| `pnpm build` | Build all packages and applications |
| `pnpm build:recruitment` | Build recruitment portal only |
| `pnpm lint` | Lint all code with ESLint |
| `pnpm lint:fix` | Lint and auto-fix issues |
| `pnpm format` | Format all code with Prettier |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm clean` | Remove all node_modules and dist |
| `pnpm firebase:emulators` | Start Firebase emulators |
| `pnpm firebase:deploy:dev` | Deploy to development |
| `pnpm firebase:deploy:staging` | Deploy to staging |
| `pnpm firebase:deploy:prod` | Deploy to production |

## 🔥 Firebase Setup

### 1. Create Firebase Projects

Create three Firebase projects in the [Firebase Console](https://console.firebase.google.com/):
- `allied-recruitment-dev` (Development)
- `allied-recruitment-staging` (Staging)  
- `allied-recruitment-prod` (Production)

### 2. Enable Services

In each project, enable:
- **Authentication** → Email/Password provider
- **Firestore Database** → Start in production mode
- **Storage** → Start in production mode
- **Hosting**

### 3. Create Hosting Sites

For each project, create the hosting sites:

```bash
# Development
firebase use development
firebase hosting:sites:create allied-recruitment-dev
firebase hosting:sites:create allied-branch-dev
firebase hosting:sites:create allied-booking-dev

# Staging
firebase use staging
firebase hosting:sites:create allied-recruitment-staging
firebase hosting:sites:create allied-branch-staging
firebase hosting:sites:create allied-booking-staging

# Production
firebase use production
firebase hosting:sites:create recruitment-allied
firebase hosting:sites:create branch-allied
firebase hosting:sites:create book-allied
```

### 4. Get Firebase Config

1. Go to Firebase Console → Project Settings → Your Apps
2. Click "Add app" → Web
3. Copy the config values to `.env.local`:

```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

### 5. Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules -P development
```

## 🚢 Deployment

### Option A: Manual Deployment

```bash
# Build first
pnpm build:recruitment

# Deploy to development
pnpm firebase:deploy:dev

# Deploy to staging
pnpm firebase:deploy:staging

# Deploy to production (use with caution!)
pnpm firebase:deploy:prod
```

### Option B: GitHub Actions (Automatic)

The project includes GitHub Actions workflows for automatic deployment:

| Trigger | Environment |
|---------|-------------|
| Push to `develop` | Development |
| Push to `main` | Staging |
| Manual trigger | Choose any |

### GitHub Secrets Required

Add these secrets to your GitHub repository (Settings → Secrets → Actions):

| Secret | Description | How to Get |
|--------|-------------|------------|
| `FIREBASE_SERVICE_ACCOUNT` | Firebase service account JSON | See below |
| `VITE_FIREBASE_API_KEY` | Firebase API key | Firebase Console |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain | Firebase Console |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID | Firebase Console |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket | Firebase Console |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase sender ID | Firebase Console |
| `VITE_FIREBASE_APP_ID` | Firebase app ID | Firebase Console |

### Generate Service Account Key

1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate new private key"
3. Download the JSON file
4. Copy the **entire JSON content**
5. Add as `FIREBASE_SERVICE_ACCOUNT` secret in GitHub

## 👤 Creating Test Users

After deploying, create a test user:

### 1. Create Auth User

In Firebase Console → Authentication → Users → Add User:
- Email: `admin@alliedpharmacies.co.uk`
- Password: (your choice)
- Copy the **User UID**

### 2. Create User Document

In Firebase Console → Firestore → Create document:

**Collection**: `users`  
**Document ID**: (paste the User UID from step 1)

```json
{
  "email": "admin@alliedpharmacies.co.uk",
  "displayName": "Admin User",
  "role": "super_admin",
  "entities": ["allied", "sharief", "core"],
  "branches": [],
  "isActive": true,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### User Roles

| Role | Access Level |
|------|-------------|
| `super_admin` | Full access to everything |
| `recruiter` | Manage candidates, jobs, interviews |
| `branch_manager` | View assigned branch, submit feedback |
| `regional_manager` | View regional branches |
| `viewer` | Read-only access |

## 🧩 Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Routing**: React Router v6
- **Backend**: Firebase (Auth, Firestore, Storage, Functions)
- **Search**: Algolia (planned)
- **Styling**: CSS Variables (custom design system)
- **Package Manager**: pnpm (workspaces)
- **CI/CD**: GitHub Actions

## 📱 Applications

### Recruitment Portal
Full-featured admin application for the recruitment team.
- Dashboard & analytics
- Candidate management with CV parsing
- Interview scheduling
- WhatsApp integration
- Job postings

### Branch Manager Portal
Lightweight PWA for 200+ pharmacy branch managers.
- Branch calendar
- Trial/interview schedule
- Feedback submission
- Push notifications

### Booking Page
Public page for candidate self-service scheduling.
- Token-based access
- Calendar selection
- Slot booking

## 🛠️ Development Tips

### Adding Dependencies

```bash
# Add to a specific app
pnpm --filter recruitment-portal add <package>

# Add to shared-lib
pnpm --filter @allied/shared-lib add <package>

# Add to root (dev dependency)
pnpm add -D -w <package>
```

### Using Shared Packages

```tsx
// Import components
import { Button, Input, Modal } from '@allied/shared-ui'

// Import utilities and types
import { formatPhone, type Candidate } from '@allied/shared-lib'
```

### Troubleshooting

**Build fails with module errors:**
```bash
pnpm clean
pnpm install
pnpm build
```

**Firebase permission denied:**
- Check that Firestore rules are deployed
- Verify user document exists with correct role

**GitHub Actions fails:**
- Verify all secrets are set correctly
- Check service account has necessary permissions

## 📄 License

UNLICENSED - Private project for Allied Pharmacies

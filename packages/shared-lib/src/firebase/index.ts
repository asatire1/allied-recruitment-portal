// ============================================================================
// Firebase Configuration & Initialization
// 
// This file sets up Firebase for use across all applications in the monorepo.
// It includes support for local emulators during development.
// ============================================================================

import { initializeApp, getApps, FirebaseApp, FirebaseOptions } from 'firebase/app'
import { getAuth, Auth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, Firestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getStorage, FirebaseStorage, connectStorageEmulator } from 'firebase/storage'
import { getFunctions, Functions, connectFunctionsEmulator } from 'firebase/functions'

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Firebase configuration loaded from environment variables.
 * These must be set in each application's .env file.
 */
const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
}

/**
 * Emulator configuration for local development
 */
const emulatorConfig = {
  auth: {
    host: 'localhost',
    port: 9099,
  },
  firestore: {
    host: 'localhost',
    port: 8080,
  },
  storage: {
    host: 'localhost',
    port: 9199,
  },
  functions: {
    host: 'localhost',
    port: 5001,
  },
}

/**
 * Check if we should use emulators
 * Set VITE_USE_EMULATORS=true in .env.local for local development
 */
const shouldUseEmulators = (): boolean => {
  return import.meta.env.VITE_USE_EMULATORS === 'true'
}

// ============================================================================
// FIREBASE INSTANCES
// ============================================================================

let app: FirebaseApp
let auth: Auth
let db: Firestore
let storage: FirebaseStorage
let functions: Functions
let initialized = false
let emulatorsConnected = false

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Validates that required Firebase configuration is present
 */
function validateConfig(): void {
  const required = ['apiKey', 'authDomain', 'projectId']
  const missing = required.filter(
    (key) => !firebaseConfig[key as keyof FirebaseOptions]
  )
  
  if (missing.length > 0 && !shouldUseEmulators()) {
    console.error(
      `Missing Firebase configuration: ${missing.join(', ')}. ` +
      'Please check your environment variables.'
    )
  }
}

/**
 * Connects to Firebase emulators for local development
 */
function connectEmulators(): void {
  if (emulatorsConnected) return
  
  try {
    // Connect Auth emulator
    connectAuthEmulator(auth, `http://${emulatorConfig.auth.host}:${emulatorConfig.auth.port}`, {
      disableWarnings: true,
    })
    
    // Connect Firestore emulator
    connectFirestoreEmulator(
      db,
      emulatorConfig.firestore.host,
      emulatorConfig.firestore.port
    )
    
    // Connect Storage emulator
    connectStorageEmulator(
      storage,
      emulatorConfig.storage.host,
      emulatorConfig.storage.port
    )
    
    // Connect Functions emulator
    connectFunctionsEmulator(
      functions,
      emulatorConfig.functions.host,
      emulatorConfig.functions.port
    )
    
    emulatorsConnected = true
    console.log('🔧 Connected to Firebase emulators')
  } catch (error) {
    console.error('Failed to connect to emulators:', error)
  }
}

/**
 * Initialize Firebase with all services
 * This function is idempotent - calling it multiple times is safe
 */
export function initializeFirebase(): {
  app: FirebaseApp
  auth: Auth
  db: Firestore
  storage: FirebaseStorage
  functions: Functions
} {
  if (initialized) {
    return { app, auth, db, storage, functions }
  }

  validateConfig()

  // Initialize Firebase App
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig)
  } else {
    app = getApps()[0]
  }

  // Initialize services
  auth = getAuth(app)
  db = getFirestore(app)
  storage = getStorage(app)
  functions = getFunctions(app, 'europe-west2') // Match Cloud Functions region

  // Connect to emulators if in development mode
  if (shouldUseEmulators()) {
    connectEmulators()
  }

  initialized = true
  
  return { app, auth, db, storage, functions }
}

// ============================================================================
// SERVICE GETTERS
// These functions ensure Firebase is initialized before returning services
// ============================================================================

/**
 * Get the Firebase App instance
 */
export function getFirebaseApp(): FirebaseApp {
  if (!initialized) initializeFirebase()
  return app
}

/**
 * Get the Firebase Auth instance
 */
export function getFirebaseAuth(): Auth {
  if (!initialized) initializeFirebase()
  return auth
}

/**
 * Get the Firestore instance
 */
export function getFirebaseDb(): Firestore {
  if (!initialized) initializeFirebase()
  return db
}

/**
 * Get the Firebase Storage instance
 */
export function getFirebaseStorage(): FirebaseStorage {
  if (!initialized) initializeFirebase()
  return storage
}

/**
 * Get the Firebase Functions instance
 */
export function getFirebaseFunctions(): Functions {
  if (!initialized) initializeFirebase()
  return functions
}

// ============================================================================
// COLLECTION NAMES
// Centralized collection names to prevent typos
// ============================================================================

export const COLLECTIONS = {
  // Core collections
  USERS: 'users',
  CANDIDATES: 'candidates',
  JOBS: 'jobs',
  INTERVIEWS: 'interviews',
  
  // Reference data
  JOB_TYPES: 'jobTypes',
  BRANCHES: 'branches',
  REGIONS: 'regions',
  QUALIFICATIONS: 'qualifications',
  
  // Booking system
  BOOKING_LINKS: 'bookingLinks',
  
  // Feedback
  TRIAL_FEEDBACK: 'trialFeedback',
  INTERVIEW_FEEDBACK: 'interviewFeedback',
  
  // Communication
  WHATSAPP_TEMPLATES: 'whatsappTemplates',
  NOTIFICATIONS: 'notifications',
  
  // Audit
  ACTIVITY_LOG: 'activityLog',
  
  // Settings
  SETTINGS: 'settings',
} as const

/**
 * Type for collection names
 */
export type CollectionName = typeof COLLECTIONS[keyof typeof COLLECTIONS]

// ============================================================================
// STORAGE PATHS
// Centralized storage paths
// ============================================================================

export const STORAGE_PATHS = {
  CVS: 'cvs',
  QUALIFICATIONS: 'qualifications',
  AVATARS: 'avatars',
  BRANCHES: 'branches',
  TEMP: 'temp',
  EXPORTS: 'exports',
} as const

/**
 * Generate storage path for CV
 */
export function getCvPath(candidateId: string, filename: string): string {
  return `${STORAGE_PATHS.CVS}/${candidateId}/${filename}`
}

/**
 * Generate storage path for qualification document
 */
export function getQualificationPath(candidateId: string, filename: string): string {
  return `${STORAGE_PATHS.QUALIFICATIONS}/${candidateId}/${filename}`
}

/**
 * Generate storage path for user avatar
 */
export function getAvatarPath(userId: string, filename: string): string {
  return `${STORAGE_PATHS.AVATARS}/${userId}/${filename}`
}

// ============================================================================
// RE-EXPORTS
// ============================================================================

// Re-export Firebase types for convenience
export type { 
  FirebaseApp,
  FirebaseOptions,
  Auth,
  Firestore,
  FirebaseStorage,
  Functions,
}

// Re-export commonly used Firestore types
export {
  Timestamp,
  serverTimestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
} from 'firebase/firestore'

// Re-export commonly used Auth types
export {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth'

// Re-export commonly used Storage types
export {
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  listAll,
} from 'firebase/storage'

// Re-export commonly used Functions types
export {
  httpsCallable,
} from 'firebase/functions'

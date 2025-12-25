import { 
  createContext, 
  useContext, 
  useEffect, 
  useState, 
  useCallback,
  ReactNode 
} from 'react'
import {
  User as FirebaseUser,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth'
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { 
  getFirebaseAuth, 
  getFirebaseDb, 
  COLLECTIONS 
} from '@allied/shared-lib'
import type { User, UserRole } from '@allied/shared-lib'

// ============================================================================
// TYPES
// ============================================================================

interface AuthState {
  /** Firebase user object */
  firebaseUser: FirebaseUser | null
  /** User profile from Firestore */
  user: User | null
  /** Loading state during initial auth check */
  isLoading: boolean
  /** Error from last auth operation */
  error: string | null
}

interface AuthContextValue extends AuthState {
  /** Sign in with email and password */
  signIn: (email: string, password: string, remember?: boolean) => Promise<void>
  /** Sign out the current user */
  signOut: () => Promise<void>
  /** Send password reset email */
  resetPassword: (email: string) => Promise<void>
  /** Check if user has a specific role */
  hasRole: (role: UserRole | UserRole[]) => boolean
  /** Check if user can access a specific entity */
  canAccessEntity: (entity: string) => boolean
  /** Check if user can access a specific branch */
  canAccessBranch: (branchId: string) => boolean
  /** Clear any auth errors */
  clearError: () => void
}

// ============================================================================
// CONTEXT
// ============================================================================

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

// ============================================================================
// PROVIDER
// ============================================================================

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    firebaseUser: null,
    user: null,
    isLoading: true,
    error: null,
  })

  const auth = getFirebaseAuth()
  const db = getFirebaseDb()

  // --------------------------------------------------------------------------
  // Fetch user profile from Firestore
  // --------------------------------------------------------------------------
  const fetchUserProfile = useCallback(async (firebaseUser: FirebaseUser): Promise<User | null> => {
    try {
      const userDoc = await getDoc(doc(db, COLLECTIONS.USERS, firebaseUser.uid))
      
      if (!userDoc.exists()) {
        console.error('User profile not found in Firestore')
        return null
      }

      const userData = userDoc.data()
      
      // Check if user is active
      if (!userData.active) {
        console.error('User account is disabled')
        return null
      }

      // Update last login timestamp
      await updateDoc(doc(db, COLLECTIONS.USERS, firebaseUser.uid), {
        lastLoginAt: serverTimestamp(),
      })

      return {
        id: userDoc.id,
        ...userData,
      } as User
    } catch (error) {
      console.error('Error fetching user profile:', error)
      return null
    }
  }, [db])

  // --------------------------------------------------------------------------
  // Listen for auth state changes
  // --------------------------------------------------------------------------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in - fetch their profile
        const userProfile = await fetchUserProfile(firebaseUser)
        
        if (userProfile) {
          setState({
            firebaseUser,
            user: userProfile,
            isLoading: false,
            error: null,
          })
        } else {
          // User exists in Firebase Auth but not in Firestore or is disabled
          await firebaseSignOut(auth)
          setState({
            firebaseUser: null,
            user: null,
            isLoading: false,
            error: 'Your account is not configured correctly. Please contact support.',
          })
        }
      } else {
        // User is signed out
        setState({
          firebaseUser: null,
          user: null,
          isLoading: false,
          error: null,
        })
      }
    })

    return () => unsubscribe()
  }, [auth, fetchUserProfile])

  // --------------------------------------------------------------------------
  // Sign in
  // --------------------------------------------------------------------------
  const signIn = useCallback(async (
    email: string, 
    password: string, 
    remember: boolean = false
  ): Promise<void> => {
    setState(prev => ({ ...prev, error: null }))

    try {
      // Set persistence based on "remember me" checkbox
      await setPersistence(
        auth, 
        remember ? browserLocalPersistence : browserSessionPersistence
      )

      // Sign in with Firebase
      const result = await signInWithEmailAndPassword(auth, email, password)
      
      // Fetch user profile
      const userProfile = await fetchUserProfile(result.user)
      
      if (!userProfile) {
        // Profile fetch failed - sign out and show error
        await firebaseSignOut(auth)
        throw new Error('Account not configured. Please contact support.')
      }

      // State will be updated by onAuthStateChanged listener
    } catch (error) {
      const errorMessage = getAuthErrorMessage(error)
      setState(prev => ({ ...prev, error: errorMessage }))
      throw error
    }
  }, [auth, fetchUserProfile])

  // --------------------------------------------------------------------------
  // Sign out
  // --------------------------------------------------------------------------
  const signOut = useCallback(async (): Promise<void> => {
    try {
      await firebaseSignOut(auth)
      // State will be updated by onAuthStateChanged listener
    } catch (error) {
      console.error('Sign out error:', error)
      throw error
    }
  }, [auth])

  // --------------------------------------------------------------------------
  // Reset password
  // --------------------------------------------------------------------------
  const resetPassword = useCallback(async (email: string): Promise<void> => {
    try {
      await sendPasswordResetEmail(auth, email)
    } catch (error) {
      // Don't reveal if email exists or not
      console.error('Password reset error:', error)
      // Still resolve - for security we don't want to reveal if email exists
    }
  }, [auth])

  // --------------------------------------------------------------------------
  // Role checking
  // --------------------------------------------------------------------------
  const hasRole = useCallback((role: UserRole | UserRole[]): boolean => {
    if (!state.user) return false
    
    const roles = Array.isArray(role) ? role : [role]
    return roles.includes(state.user.role)
  }, [state.user])

  // --------------------------------------------------------------------------
  // Entity access checking
  // --------------------------------------------------------------------------
  const canAccessEntity = useCallback((entity: string): boolean => {
    if (!state.user) return false
    
    // Super admins and recruiters can access all entities
    if (hasRole(['super_admin', 'recruiter'])) return true
    
    // Check if user has access to this entity
    if (!state.user.entities || state.user.entities.length === 0) return true
    return state.user.entities.includes(entity as any)
  }, [state.user, hasRole])

  // --------------------------------------------------------------------------
  // Branch access checking
  // --------------------------------------------------------------------------
  const canAccessBranch = useCallback((branchId: string): boolean => {
    if (!state.user) return false
    
    // Super admins and recruiters can access all branches
    if (hasRole(['super_admin', 'recruiter'])) return true
    
    // Branch managers can only access their assigned branches
    if (state.user.branchIds && state.user.branchIds.length > 0) {
      return state.user.branchIds.includes(branchId)
    }
    
    // Regional managers - would need to check region->branch mapping
    // For now, allow if they have regionIds set
    if (hasRole('regional_manager') && state.user.regionIds?.length) {
      // This would need additional logic to map regions to branches
      return true
    }
    
    return false
  }, [state.user, hasRole])

  // --------------------------------------------------------------------------
  // Clear error
  // --------------------------------------------------------------------------
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }))
  }, [])

  // --------------------------------------------------------------------------
  // Context value
  // --------------------------------------------------------------------------
  const value: AuthContextValue = {
    ...state,
    signIn,
    signOut,
    resetPassword,
    hasRole,
    canAccessEntity,
    canAccessBranch,
    clearError,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// ============================================================================
// HOOK
// ============================================================================

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  
  return context
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Map Firebase auth error codes to user-friendly messages
 */
function getAuthErrorMessage(error: unknown): string {
  const firebaseError = error as { code?: string; message?: string }
  
  switch (firebaseError.code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.'
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password. Please try again.'
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.'
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection and try again.'
    case 'auth/popup-closed-by-user':
      return 'Sign in was cancelled.'
    default:
      console.error('Auth error:', error)
      return firebaseError.message || 'An error occurred. Please try again.'
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { AuthContext }
export type { AuthContextValue, AuthState }

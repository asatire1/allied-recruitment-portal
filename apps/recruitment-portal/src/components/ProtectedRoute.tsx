import { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts'
import { Spinner } from '@allied/shared-ui'
import type { UserRole } from '@allied/shared-lib'

// ============================================================================
// TYPES
// ============================================================================

interface ProtectedRouteProps {
  children: ReactNode
  /** Required roles to access this route (any of these roles will work) */
  allowedRoles?: UserRole[]
  /** Redirect path if not authenticated (default: /login) */
  redirectTo?: string
  /** Redirect path if authenticated but not authorized (default: /) */
  unauthorizedRedirect?: string
  /** Required entity access */
  requiredEntity?: string
  /** Required branch access */
  requiredBranch?: string
}

// ============================================================================
// LOADING COMPONENT
// ============================================================================

function RouteLoading() {
  return (
    <div className="route-loading">
      <Spinner size="lg" />
    </div>
  )
}

// ============================================================================
// PROTECTED ROUTE
// ============================================================================

/**
 * ProtectedRoute - Wraps routes that require authentication and/or specific roles
 * 
 * Usage:
 * ```tsx
 * // Require authentication only
 * <ProtectedRoute>
 *   <Dashboard />
 * </ProtectedRoute>
 * 
 * // Require specific roles
 * <ProtectedRoute allowedRoles={['super_admin', 'recruiter']}>
 *   <CandidateManagement />
 * </ProtectedRoute>
 * 
 * // Require entity access
 * <ProtectedRoute requiredEntity="allied">
 *   <AlliedSettings />
 * </ProtectedRoute>
 * ```
 */
export function ProtectedRoute({
  children,
  allowedRoles,
  redirectTo = '/login',
  unauthorizedRedirect = '/unauthorized',
  requiredEntity,
  requiredBranch,
}: ProtectedRouteProps) {
  const { firebaseUser, user, isLoading, hasRole, canAccessEntity, canAccessBranch } = useAuth()
  const location = useLocation()

  // Still loading auth state
  if (isLoading) {
    return <RouteLoading />
  }

  // Not authenticated
  if (!firebaseUser || !user) {
    // Save the attempted URL for redirect after login
    return <Navigate to={redirectTo} state={{ from: location }} replace />
  }

  // Check role-based access
  if (allowedRoles && allowedRoles.length > 0) {
    if (!hasRole(allowedRoles)) {
      return <Navigate to={unauthorizedRedirect} replace />
    }
  }

  // Check entity access
  if (requiredEntity && !canAccessEntity(requiredEntity)) {
    return <Navigate to={unauthorizedRedirect} replace />
  }

  // Check branch access
  if (requiredBranch && !canAccessBranch(requiredBranch)) {
    return <Navigate to={unauthorizedRedirect} replace />
  }

  // All checks passed - render children
  return <>{children}</>
}

// ============================================================================
// PUBLIC ROUTE
// ============================================================================

interface PublicRouteProps {
  children: ReactNode
  /** Redirect authenticated users to this path (default: /) */
  redirectTo?: string
}

/**
 * PublicRoute - Wraps routes that should only be accessible to unauthenticated users
 * Redirects authenticated users away (e.g., login page)
 */
export function PublicRoute({
  children,
  redirectTo = '/',
}: PublicRouteProps) {
  const { firebaseUser, user, isLoading } = useAuth()
  const location = useLocation()

  // Still loading auth state
  if (isLoading) {
    return <RouteLoading />
  }

  // If authenticated, redirect to intended destination or default
  if (firebaseUser && user) {
    const from = (location.state as { from?: Location })?.from?.pathname || redirectTo
    return <Navigate to={from} replace />
  }

  // Not authenticated - render children
  return <>{children}</>
}

// ============================================================================
// ROLE-SPECIFIC ROUTE SHORTCUTS
// ============================================================================

interface RoleRouteProps {
  children: ReactNode
}

/**
 * AdminRoute - Only accessible to super_admin users
 */
export function AdminRoute({ children }: RoleRouteProps) {
  return (
    <ProtectedRoute allowedRoles={['super_admin']}>
      {children}
    </ProtectedRoute>
  )
}

/**
 * RecruiterRoute - Accessible to super_admin and recruiter users
 */
export function RecruiterRoute({ children }: RoleRouteProps) {
  return (
    <ProtectedRoute allowedRoles={['super_admin', 'recruiter']}>
      {children}
    </ProtectedRoute>
  )
}

/**
 * BranchManagerRoute - Accessible to branch managers (and above)
 */
export function BranchManagerRoute({ children }: RoleRouteProps) {
  return (
    <ProtectedRoute allowedRoles={['super_admin', 'recruiter', 'branch_manager']}>
      {children}
    </ProtectedRoute>
  )
}

/**
 * ViewerRoute - Accessible to all authenticated users including viewers
 */
export function ViewerRoute({ children }: RoleRouteProps) {
  return (
    <ProtectedRoute allowedRoles={['super_admin', 'recruiter', 'branch_manager', 'regional_manager', 'viewer']}>
      {children}
    </ProtectedRoute>
  )
}

// ============================================================================
// EXPORTS
// ============================================================================

export default ProtectedRoute

import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts'
import { 
  ProtectedRoute, 
  PublicRoute, 
  RecruiterRoute, 
  AdminRoute,
  AppLayout 
} from './components'
import { Login, ForgotPassword, Unauthorized, NotFound, Dashboard, Candidates, CandidateDetail, Settings } from './pages'
import { Spinner } from '@allied/shared-ui'
import { initializeFirebase } from '@allied/shared-lib'
import './pages/Login.css'

// Initialize Firebase on app load
initializeFirebase()

// ============================================================================
// LOADING SCREEN
// ============================================================================

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-content">
        <svg viewBox="0 0 40 40" className="loading-logo" aria-hidden="true">
          <rect x="4" y="4" width="32" height="32" rx="8" fill="var(--color-primary-600)" />
          <path 
            d="M12 28L20 12L28 28M14.5 24H25.5" 
            stroke="white" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
        <Spinner size="lg" />
        <p className="loading-text">Loading...</p>
      </div>
    </div>
  )
}

// ============================================================================
// PLACEHOLDER PAGES (to be built in later phases)
// ============================================================================

function Jobs() {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Jobs</h1>
          <p className="page-description">Manage job postings across all branches</p>
        </div>
      </div>
      <p style={{ color: 'var(--color-gray-500)' }}>
        Job management will be built in Phase R7.
      </p>
    </div>
  )
}

function Calendar() {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Calendar</h1>
          <p className="page-description">View scheduled interviews and trials</p>
        </div>
      </div>
      <p style={{ color: 'var(--color-gray-500)' }}>
        Calendar will be built in Phase R6.
      </p>
    </div>
  )
}

function WhatsApp() {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">WhatsApp</h1>
          <p className="page-description">Manage message templates</p>
        </div>
      </div>
      <p style={{ color: 'var(--color-gray-500)' }}>
        WhatsApp integration will be built in Phase R5.
      </p>
    </div>
  )
}

function Reports() {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-description">Analytics and insights</p>
        </div>
      </div>
      <p style={{ color: 'var(--color-gray-500)' }}>
        Reports will be built in Phase R8.
      </p>
    </div>
  )
}

function UserManagement() {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-description">Manage system users and permissions</p>
        </div>
      </div>
      <p style={{ color: 'var(--color-gray-500)' }}>
        User management coming soon.
      </p>
    </div>
  )
}

function BranchManagement() {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Branches</h1>
          <p className="page-description">Manage pharmacy branches</p>
        </div>
      </div>
      <p style={{ color: 'var(--color-gray-500)' }}>
        Branch management coming soon.
      </p>
    </div>
  )
}

// ============================================================================
// APP ROUTES
// ============================================================================

function AppRoutes() {
  const { signIn, resetPassword, error, clearError } = useAuth()

  // Login handler
  const handleLogin = async (email: string, password: string, remember: boolean) => {
    await signIn(email, password, remember)
  }
  
  // Forgot password handler
  const handleForgotPassword = async (email: string) => {
    await resetPassword(email)
  }

  return (
    <Routes>
      {/* ================================================================
          PUBLIC ROUTES
          Only accessible to unauthenticated users
          ================================================================ */}
      <Route 
        path="/login" 
        element={
          <PublicRoute>
            <Login 
              onLogin={handleLogin} 
              error={error}
              onErrorClear={clearError}
            />
          </PublicRoute>
        } 
      />
      
      <Route 
        path="/forgot-password" 
        element={
          <PublicRoute>
            <ForgotPassword onSubmit={handleForgotPassword} />
          </PublicRoute>
        } 
      />

      {/* ================================================================
          PROTECTED ROUTES WITH LAYOUT
          Require authentication
          ================================================================ */}
      
      {/* Dashboard - accessible to all authenticated users */}
      <Route 
        path="/" 
        element={
          <ProtectedRoute>
            <AppLayout>
              <Dashboard />
            </AppLayout>
          </ProtectedRoute>
        } 
      />

      {/* Candidates - recruiters and admins */}
      <Route 
        path="/candidates" 
        element={
          <RecruiterRoute>
            <AppLayout>
              <Candidates />
            </AppLayout>
          </RecruiterRoute>
        } 
      />

      {/* Candidate Detail - recruiters and admins */}
      <Route 
        path="/candidates/:id" 
        element={
          <RecruiterRoute>
            <AppLayout>
              <CandidateDetail />
            </AppLayout>
          </RecruiterRoute>
        } 
      />

      {/* Jobs - recruiters and admins */}
      <Route 
        path="/jobs/*" 
        element={
          <RecruiterRoute>
            <AppLayout>
              <Jobs />
            </AppLayout>
          </RecruiterRoute>
        } 
      />

      {/* Calendar - recruiters and admins */}
      <Route 
        path="/calendar" 
        element={
          <RecruiterRoute>
            <AppLayout>
              <Calendar />
            </AppLayout>
          </RecruiterRoute>
        } 
      />

      {/* WhatsApp - recruiters and admins */}
      <Route 
        path="/whatsapp" 
        element={
          <RecruiterRoute>
            <AppLayout>
              <WhatsApp />
            </AppLayout>
          </RecruiterRoute>
        } 
      />

      {/* Reports - recruiters, admins, viewers */}
      <Route 
        path="/reports" 
        element={
          <ProtectedRoute allowedRoles={['super_admin', 'recruiter', 'viewer']}>
            <AppLayout>
              <Reports />
            </AppLayout>
          </ProtectedRoute>
        } 
      />

      {/* Settings - recruiters and admins */}
      <Route 
        path="/settings" 
        element={
          <RecruiterRoute>
            <AppLayout>
              <Settings />
            </AppLayout>
          </RecruiterRoute>
        } 
      />

      {/* User Management - super admin only */}
      <Route 
        path="/settings/users" 
        element={
          <AdminRoute>
            <AppLayout>
              <UserManagement />
            </AppLayout>
          </AdminRoute>
        } 
      />

      {/* Branch Management - super admin only */}
      <Route 
        path="/settings/branches" 
        element={
          <AdminRoute>
            <AppLayout>
              <BranchManagement />
            </AppLayout>
          </AdminRoute>
        } 
      />

      {/* ================================================================
          ERROR ROUTES
          ================================================================ */}
      
      {/* Unauthorized - shown when user lacks permissions */}
      <Route path="/unauthorized" element={<Unauthorized />} />
      
      {/* 404 - catch all */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

// ============================================================================
// APP
// ============================================================================

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App

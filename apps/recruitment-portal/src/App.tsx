// ============================================================================
// Allied Recruitment Portal - App.tsx with React Query + Lazy Loading (R11.1 + R11.2)
// Location: apps/recruitment-portal/src/App.tsx
// ============================================================================

import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { AuthProvider, useAuth } from './contexts'
import { 
  ProtectedRoute, 
  PublicRoute, 
  RecruiterRoute, 
  AdminRoute,
  AppLayout 
} from './components'
import { ErrorBoundary } from './components/ErrorBoundary'
import { PageLoader } from './components/PageLoader'
import { Spinner } from '@allied/shared-ui'
import { initializeFirebase } from '@allied/shared-lib'
import { queryClient } from './lib/queryClient'
import './pages/Login.css'

// Initialize Firebase on app load
initializeFirebase()

// ============================================================================
// LAZY LOADED PAGES (R11.2 - Bundle Splitting)
// ============================================================================

// Auth pages - loaded immediately as they're entry points
import { Login, Register, ResetPassword, Unauthorized, NotFound } from './pages'

// Main pages - lazy loaded for code splitting
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Candidates = lazy(() => import('./pages/Candidates'))
const CandidateDetail = lazy(() => import('./pages/CandidateDetail'))
const Jobs = lazy(() => import('./pages/Jobs'))
const JobDetail = lazy(() => import('./pages/JobDetail'))
const Calendar = lazy(() => import('./pages/Calendar'))
const Interviews = lazy(() => import('./pages/Interviews'))
const Settings = lazy(() => import('./pages/Settings'))

// Admin pages - lazy loaded (less frequently accessed)
const BranchManagement = lazy(() => import('./pages/BranchManagement'))
const UserManagement = lazy(() => import('./pages/UserManagement'))

// R10 pages - lazy loaded
const PendingFeedback = lazy(() => import('./pages/PendingFeedback'))
const CandidateComparison = lazy(() => import('./pages/CandidateComparison'))

// Ready for Decision page - lazy loaded
const ReadyForDecision = lazy(() => import('./pages/ReadyForDecision'))

// ============================================================================
// LOADING SCREEN
// ============================================================================

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-content">
        <svg viewBox="0 0 40 40" className="loading-logo" aria-hidden="true">
          {/* Letter A shape with healthcare cross integrated */}
          {/* Left leg of A */}
          <path 
            d="M8 36 L17 4 L20 4 L20 36 L16 36 L16 24 L12 24 L8 36 Z" 
            fill="#0d4a6f"
          />
          {/* Right leg of A */}
          <path 
            d="M20 4 L23 4 L32 36 L28 36 L24 24 L20 24 L20 36 L20 4 Z" 
            fill="#0d4a6f"
          />
          {/* Healthcare cross (green) */}
          <rect x="17" y="10" width="6" height="16" rx="1" fill="#4caf50" />
          <rect x="13" y="14" width="14" height="6" rx="1" fill="#4caf50" />
        </svg>
        <Spinner size="lg" />
        <p className="loading-text">Loading...</p>
      </div>
    </div>
  )
}

// ============================================================================
// APP ROUTES
// ============================================================================

function AppRoutes() {
  const { signIn, error, clearError } = useAuth()

  const handleLogin = async (email: string, password: string, remember: boolean) => {
    await signIn(email, password, remember)
  }

  return (
    <Routes>
      {/* PUBLIC ROUTES */}
      <Route 
        path="/login" 
        element={
          <PublicRoute>
            <Login onLogin={handleLogin} error={error} onErrorClear={clearError} />
          </PublicRoute>
        } 
      />
      <Route
        path="/forgot-password"
        element={
          <PublicRoute>
            <ResetPassword />
          </PublicRoute>
        }
      />
      <Route
        path="/reset-password/:token"
        element={
          <PublicRoute>
            <ResetPassword />
          </PublicRoute>
        }
      />
      <Route
        path="/register/:token"
        element={
          <PublicRoute>
            <Register />
          </PublicRoute>
        }
      />

      {/* PROTECTED ROUTES - Wrapped in Suspense for lazy loading */}
      <Route 
        path="/" 
        element={
          <ProtectedRoute>
            <AppLayout>
              <Suspense fallback={<PageLoader />}>
                <Dashboard />
              </Suspense>
            </AppLayout>
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/candidates" 
        element={
          <RecruiterRoute>
            <AppLayout>
              <Suspense fallback={<PageLoader />}>
                <Candidates />
              </Suspense>
            </AppLayout>
          </RecruiterRoute>
        } 
      />

      <Route 
        path="/candidates/:id" 
        element={
          <RecruiterRoute>
            <AppLayout>
              <Suspense fallback={<PageLoader />}>
                <CandidateDetail />
              </Suspense>
            </AppLayout>
          </RecruiterRoute>
        } 
      />

      <Route 
        path="/candidates/compare" 
        element={
          <RecruiterRoute>
            <AppLayout>
              <Suspense fallback={<PageLoader />}>
                <CandidateComparison />
              </Suspense>
            </AppLayout>
          </RecruiterRoute>
        } 
      />

      <Route 
        path="/jobs" 
        element={
          <RecruiterRoute>
            <AppLayout>
              <Suspense fallback={<PageLoader />}>
                <Jobs />
              </Suspense>
            </AppLayout>
          </RecruiterRoute>
        } 
      />
      
      <Route 
        path="/jobs/:jobId" 
        element={
          <RecruiterRoute>
            <AppLayout>
              <Suspense fallback={<PageLoader />}>
                <JobDetail />
              </Suspense>
            </AppLayout>
          </RecruiterRoute>
        } 
      />

      <Route 
        path="/calendar" 
        element={
          <RecruiterRoute>
            <AppLayout>
              <Suspense fallback={<PageLoader />}>
                <Calendar />
              </Suspense>
            </AppLayout>
          </RecruiterRoute>
        } 
      />

      <Route 
        path="/interviews" 
        element={
          <RecruiterRoute>
            <AppLayout>
              <Suspense fallback={<PageLoader />}>
                <Interviews />
              </Suspense>
            </AppLayout>
          </RecruiterRoute>
        } 
      />

      <Route 
        path="/feedback/pending" 
        element={
          <RecruiterRoute>
            <AppLayout>
              <Suspense fallback={<PageLoader />}>
                <PendingFeedback />
              </Suspense>
            </AppLayout>
          </RecruiterRoute>
        } 
      />

      <Route 
        path="/decisions" 
        element={
          <RecruiterRoute>
            <AppLayout>
              <Suspense fallback={<PageLoader />}>
                <ReadyForDecision />
              </Suspense>
            </AppLayout>
          </RecruiterRoute>
        } 
      />

      <Route 
        path="/settings" 
        element={
          <RecruiterRoute>
            <AppLayout>
              <Suspense fallback={<PageLoader />}>
                <Settings />
              </Suspense>
            </AppLayout>
          </RecruiterRoute>
        } 
      />

      <Route 
        path="/settings/users" 
        element={
          <AdminRoute>
            <AppLayout>
              <Suspense fallback={<PageLoader />}>
                <UserManagement />
              </Suspense>
            </AppLayout>
          </AdminRoute>
        } 
      />

      <Route 
        path="/settings/branches" 
        element={
          <AdminRoute>
            <AppLayout>
              <Suspense fallback={<PageLoader />}>
                <BranchManagement />
              </Suspense>
            </AppLayout>
          </AdminRoute>
        } 
      />

      {/* ERROR ROUTES */}
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

// ============================================================================
// APP WITH ERROR BOUNDARY
// ============================================================================

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App

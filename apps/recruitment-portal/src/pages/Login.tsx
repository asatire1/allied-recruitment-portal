import { useState, useEffect, FormEvent } from 'react'
import { Button, Input, Checkbox, Alert, Spinner } from '@allied/shared-ui'

interface LoginProps {
  onLogin: (email: string, password: string, remember: boolean) => Promise<void>
  error?: string | null
  onErrorClear?: () => void
}

export function Login({ onLogin, error: externalError, onErrorClear }: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState({ email: false, password: false })

  // Sync external error from AuthContext
  useEffect(() => {
    if (externalError) {
      setError(externalError)
    }
  }, [externalError])

  // Validation
  const emailError = touched.email && !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
    ? 'Please enter a valid email address'
    : null
  const passwordError = touched.password && password.length < 6
    ? 'Password must be at least 6 characters'
    : null

  const isValid = email && password.length >= 6 && !emailError

  const handleDismissError = () => {
    setError(null)
    onErrorClear?.()
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    
    // Mark all fields as touched
    setTouched({ email: true, password: true })
    
    if (!isValid) return
    
    setIsLoading(true)
    setError(null)
    onErrorClear?.()
    
    try {
      await onLogin(email, password, rememberMe)
    } catch (err) {
      // Error is handled by AuthContext and passed via props
      // But also handle any local errors
      if (!externalError) {
        const errorMessage = getErrorMessage(err)
        setError(errorMessage)
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        {/* Logo and branding */}
        <div className="login-header">
          <div className="login-logo">
            <svg viewBox="0 0 40 40" className="logo-icon" aria-hidden="true">
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
            <span className="logo-text">Allied Recruitment</span>
          </div>
          <h1 className="login-title">Sign in to your account</h1>
          <p className="login-subtitle">
            Enter your credentials to access the recruitment portal
          </p>
        </div>

        {/* Error alert */}
        {error && (
          <Alert 
            variant="error" 
            className="login-error"
            onDismiss={handleDismissError}
          >
            {error}
          </Alert>
        )}

        {/* Login form */}
        <form onSubmit={handleSubmit} className="login-form" noValidate>
          <Input
            id="email"
            type="email"
            label="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched(t => ({ ...t, email: true }))}
            error={emailError || undefined}
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
            disabled={isLoading}
            required
          />

          <Input
            id="password"
            type="password"
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setTouched(t => ({ ...t, password: true }))}
            error={passwordError || undefined}
            placeholder="••••••••"
            autoComplete="current-password"
            disabled={isLoading}
            required
          />

          <div className="login-options">
            <Checkbox
              id="remember"
              label="Remember me"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={isLoading}
            />
            <a href="/forgot-password" className="forgot-link">
              Forgot password?
            </a>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            disabled={isLoading}
            className="login-button"
          >
            {isLoading ? (
              <>
                <Spinner size="sm" className="button-spinner" />
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>

        {/* Footer */}
        <div className="login-footer">
          <p className="login-help">
            Need help? Contact{' '}
            <a href="mailto:support@alliedpharmacies.co.uk">
              support@alliedpharmacies.co.uk
            </a>
          </p>
        </div>
      </div>

      {/* Background decoration */}
      <div className="login-background" aria-hidden="true">
        <div className="bg-shape bg-shape-1" />
        <div className="bg-shape bg-shape-2" />
        <div className="bg-shape bg-shape-3" />
      </div>
    </div>
  )
}

/**
 * Map Firebase auth error codes to user-friendly messages
 */
function getErrorMessage(error: unknown): string {
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
    default:
      console.error('Login error:', error)
      return 'An error occurred. Please try again.'
  }
}

export default Login

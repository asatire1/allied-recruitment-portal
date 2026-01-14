import { useState, useEffect, FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { httpsCallable } from 'firebase/functions'
import { getFirebaseFunctions } from '@allied/shared-lib'
import { Button, Input, Alert, Spinner } from '@allied/shared-ui'

interface TokenValidationResult {
  valid: boolean
  data: {
    email: string
  }
}

interface ResetResult {
  success: boolean
  message: string
}

export function ResetPassword() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()

  // Determine mode: request (no token) or reset (with token)
  const isResetMode = !!token

  // Token validation state (for reset mode)
  const [validating, setValidating] = useState(isResetMode)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [email, setEmail] = useState('')

  // Form state for request mode
  const [requestEmail, setRequestEmail] = useState('')
  const [requestSent, setRequestSent] = useState(false)

  // Form state for reset mode
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [touched, setTouched] = useState({
    requestEmail: false,
    newPassword: false,
    confirmPassword: false,
  })

  // Validate token on mount (reset mode only)
  useEffect(() => {
    if (!isResetMode) return

    const validateToken = async () => {
      try {
        const functions = getFirebaseFunctions()
        const validateFn = httpsCallable<{ token: string }, TokenValidationResult>(
          functions,
          'validatePasswordReset'
        )
        const result = await validateFn({ token: token! })

        if (result.data.valid) {
          setEmail(result.data.data.email)
        } else {
          setTokenError('Invalid or expired reset link')
        }
      } catch (err: any) {
        console.error('Token validation error:', err)
        setTokenError('Invalid or expired reset link')
      } finally {
        setValidating(false)
      }
    }

    validateToken()
  }, [token, isResetMode])

  // Validation
  const requestEmailError = touched.requestEmail && !requestEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
    ? 'Please enter a valid email address'
    : null
  const newPasswordError = touched.newPassword && newPassword.length < 6
    ? 'Password must be at least 6 characters'
    : null
  const confirmPasswordError = touched.confirmPassword && newPassword !== confirmPassword
    ? 'Passwords do not match'
    : null

  // Handle request password reset
  const handleRequestReset = async (e: FormEvent) => {
    e.preventDefault()

    setTouched(t => ({ ...t, requestEmail: true }))

    if (!requestEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return

    setIsSubmitting(true)
    setError(null)

    try {
      const functions = getFirebaseFunctions()
      const requestFn = httpsCallable<{ email: string }, ResetResult>(
        functions,
        'requestPasswordReset'
      )
      await requestFn({ email: requestEmail })
      setRequestSent(true)
    } catch (err: any) {
      console.error('Request reset error:', err)
      // Always show success for security (don't reveal if email exists)
      setRequestSent(true)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle complete password reset
  const handleCompleteReset = async (e: FormEvent) => {
    e.preventDefault()

    setTouched(t => ({ ...t, newPassword: true, confirmPassword: true }))

    if (newPassword.length < 6 || newPassword !== confirmPassword || !token) return

    setIsSubmitting(true)
    setError(null)

    try {
      const functions = getFirebaseFunctions()
      const resetFn = httpsCallable<{ token: string; newPassword: string }, ResetResult>(
        functions,
        'completePasswordReset'
      )
      const result = await resetFn({ token, newPassword })

      if (result.data.success) {
        setSuccess(true)
      }
    } catch (err: any) {
      console.error('Reset password error:', err)
      if (err.message?.includes('expired')) {
        setError('This reset link has expired. Please request a new one.')
      } else {
        setError(err.message || 'Failed to reset password')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // Loading state (reset mode only)
  if (isResetMode && validating) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-header">
            <div className="login-logo">
              <img src="/allied-logo.png" alt="Allied Pharmacies" className="login-logo-img" />
            </div>
            <h1 className="login-title">Validating Reset Link...</h1>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
            <Spinner size="lg" />
          </div>
        </div>
        <div className="login-background" aria-hidden="true">
          <div className="bg-shape bg-shape-1" />
          <div className="bg-shape bg-shape-2" />
          <div className="bg-shape bg-shape-3" />
        </div>
      </div>
    )
  }

  // Token error state (reset mode only)
  if (isResetMode && tokenError) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-header">
            <div className="login-logo">
              <img src="/allied-logo.png" alt="Allied Pharmacies" className="login-logo-img" />
            </div>
            <h1 className="login-title">Invalid Reset Link</h1>
            <p className="login-subtitle">{tokenError}</p>
          </div>
          <Alert variant="error" className="login-error">
            This password reset link is invalid or has expired. Please request a new one.
          </Alert>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => navigate('/forgot-password')}
            className="login-button"
          >
            Request New Reset Link
          </Button>
          <div className="login-footer">
            <p className="login-help">
              <a href="/login">Back to Login</a>
            </p>
          </div>
        </div>
        <div className="login-background" aria-hidden="true">
          <div className="bg-shape bg-shape-1" />
          <div className="bg-shape bg-shape-2" />
          <div className="bg-shape bg-shape-3" />
        </div>
      </div>
    )
  }

  // Success state (reset complete)
  if (success) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-header">
            <div className="login-logo">
              <img src="/allied-logo.png" alt="Allied Pharmacies" className="login-logo-img" />
            </div>
            <h1 className="login-title">Password Reset Complete!</h1>
            <p className="login-subtitle">
              Your password has been updated successfully.
            </p>
          </div>
          <Alert variant="success" className="login-error">
            You can now sign in with your new password.
          </Alert>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => navigate('/login')}
            className="login-button"
          >
            Sign In
          </Button>
        </div>
        <div className="login-background" aria-hidden="true">
          <div className="bg-shape bg-shape-1" />
          <div className="bg-shape bg-shape-2" />
          <div className="bg-shape bg-shape-3" />
        </div>
      </div>
    )
  }

  // Request sent state
  if (requestSent) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-header">
            <div className="login-logo">
              <img src="/allied-logo.png" alt="Allied Pharmacies" className="login-logo-img" />
            </div>
            <h1 className="login-title">Check Your Email</h1>
            <p className="login-subtitle">
              If an account exists with <strong>{requestEmail}</strong>, we've sent a password reset link.
            </p>
          </div>
          <Alert variant="info" className="login-error">
            The reset link will expire in 24 hours. Don't forget to check your spam folder.
          </Alert>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => navigate('/login')}
            className="login-button"
          >
            Back to Login
          </Button>
        </div>
        <div className="login-background" aria-hidden="true">
          <div className="bg-shape bg-shape-1" />
          <div className="bg-shape bg-shape-2" />
          <div className="bg-shape bg-shape-3" />
        </div>
      </div>
    )
  }

  // Request mode (no token) - show email form
  if (!isResetMode) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-header">
            <div className="login-logo">
              <img src="/allied-logo.png" alt="Allied Pharmacies" className="login-logo-img" />
            </div>
            <h1 className="login-title">Reset Your Password</h1>
            <p className="login-subtitle">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          </div>

          {error && (
            <Alert variant="error" className="login-error" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleRequestReset} className="login-form" noValidate>
            <Input
              id="email"
              type="email"
              label="Email address"
              value={requestEmail}
              onChange={(e) => setRequestEmail(e.target.value)}
              onBlur={() => setTouched(t => ({ ...t, requestEmail: true }))}
              error={requestEmailError || undefined}
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
              disabled={isSubmitting}
              required
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              disabled={isSubmitting}
              className="login-button"
            >
              {isSubmitting ? (
                <>
                  <Spinner size="sm" className="button-spinner" />
                  Sending...
                </>
              ) : (
                'Send Reset Link'
              )}
            </Button>
          </form>

          <div className="login-footer">
            <p className="login-help">
              Remember your password?{' '}
              <a href="/login">Sign in</a>
            </p>
          </div>
        </div>

        <div className="login-background" aria-hidden="true">
          <div className="bg-shape bg-shape-1" />
          <div className="bg-shape bg-shape-2" />
          <div className="bg-shape bg-shape-3" />
        </div>
      </div>
    )
  }

  // Reset mode (with token) - show new password form
  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="login-logo">
            <img src="/allied-logo.png" alt="Allied Pharmacies" className="login-logo-img" />
          </div>
          <h1 className="login-title">Set New Password</h1>
          <p className="login-subtitle">
            Enter a new password for <strong>{email}</strong>
          </p>
        </div>

        {error && (
          <Alert variant="error" className="login-error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleCompleteReset} className="login-form" noValidate>
          <Input
            id="newPassword"
            type="password"
            label="New Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            onBlur={() => setTouched(t => ({ ...t, newPassword: true }))}
            error={newPasswordError || undefined}
            placeholder="••••••••"
            autoComplete="new-password"
            autoFocus
            disabled={isSubmitting}
            required
          />

          <Input
            id="confirmPassword"
            type="password"
            label="Confirm New Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onBlur={() => setTouched(t => ({ ...t, confirmPassword: true }))}
            error={confirmPasswordError || undefined}
            placeholder="••••••••"
            autoComplete="new-password"
            disabled={isSubmitting}
            required
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            disabled={isSubmitting}
            className="login-button"
          >
            {isSubmitting ? (
              <>
                <Spinner size="sm" className="button-spinner" />
                Resetting Password...
              </>
            ) : (
              'Reset Password'
            )}
          </Button>
        </form>

        <div className="login-footer">
          <p className="login-help">
            <a href="/login">Back to Login</a>
          </p>
        </div>
      </div>

      <div className="login-background" aria-hidden="true">
        <div className="bg-shape bg-shape-1" />
        <div className="bg-shape bg-shape-2" />
        <div className="bg-shape bg-shape-3" />
      </div>
    </div>
  )
}

export default ResetPassword

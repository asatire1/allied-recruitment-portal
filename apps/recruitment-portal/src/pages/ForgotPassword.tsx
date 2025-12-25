import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button, Input, Alert } from '@allied/shared-ui'

interface ForgotPasswordProps {
  onSubmit: (email: string) => Promise<void>
}

export function ForgotPassword({ onSubmit }: ForgotPasswordProps) {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [touched, setTouched] = useState(false)

  const emailError = touched && !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
    ? 'Please enter a valid email address'
    : null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    
    if (emailError || !email) return
    
    setIsLoading(true)
    setError(null)
    
    try {
      await onSubmit(email)
      setSuccess(true)
    } catch (err) {
      const firebaseError = err as { code?: string }
      if (firebaseError.code === 'auth/user-not-found') {
        // Don't reveal if user exists or not for security
        setSuccess(true)
      } else {
        setError('An error occurred. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="login-page">
        <div className="login-container">
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
            <h1 className="login-title">Check your email</h1>
            <p className="login-subtitle">
              If an account exists for {email}, we've sent password reset instructions.
            </p>
          </div>

          <Alert variant="success" className="login-error">
            Please check your inbox and follow the link to reset your password.
          </Alert>

          <Link to="/login">
            <Button variant="outline" fullWidth>
              Back to sign in
            </Button>
          </Link>

          <div className="login-footer">
            <p className="login-help">
              Didn't receive the email?{' '}
              <button 
                type="button"
                onClick={() => setSuccess(false)}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: 'var(--color-primary-600)',
                  fontWeight: 500,
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                Try again
              </button>
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

  return (
    <div className="login-page">
      <div className="login-container">
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
          <h1 className="login-title">Reset your password</h1>
          <p className="login-subtitle">
            Enter your email and we'll send you instructions to reset your password.
          </p>
        </div>

        {error && (
          <Alert 
            variant="error" 
            className="login-error"
            onDismiss={() => setError(null)}
          >
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="login-form" noValidate>
          <Input
            id="email"
            type="email"
            label="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched(true)}
            error={emailError || undefined}
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
            disabled={isLoading}
            required
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            disabled={isLoading}
            loading={isLoading}
          >
            {isLoading ? 'Sending...' : 'Send reset link'}
          </Button>

          <Link to="/login" style={{ display: 'block', marginTop: 'var(--space-4)' }}>
            <Button variant="ghost" fullWidth type="button">
              Back to sign in
            </Button>
          </Link>
        </form>

        <div className="login-footer">
          <p className="login-help">
            Need help? Contact{' '}
            <a href="mailto:support@alliedpharmacies.co.uk">
              support@alliedpharmacies.co.uk
            </a>
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

export default ForgotPassword

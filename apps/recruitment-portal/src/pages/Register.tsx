import { useState, useEffect, FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { httpsCallable } from 'firebase/functions'
import { getFirebaseFunctions } from '@allied/shared-lib'
import { Button, Input, Alert, Spinner } from '@allied/shared-ui'

interface TokenValidationResult {
  valid: boolean
  data: {
    email: string
    role: string
  }
}

interface RegistrationResult {
  success: boolean
  message: string
}

export function Register() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()

  // Token validation state
  const [validating, setValidating] = useState(true)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')

  // Form state
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [touched, setTouched] = useState({
    firstName: false,
    lastName: false,
    password: false,
    confirmPassword: false,
  })

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setTokenError('No invitation token provided')
      setValidating(false)
      return
    }

    const validateToken = async () => {
      try {
        const functions = getFirebaseFunctions()
        const validateFn = httpsCallable<{ token: string }, TokenValidationResult>(
          functions,
          'validateUserInvite'
        )
        const result = await validateFn({ token })

        if (result.data.valid) {
          setEmail(result.data.data.email)
          setRole(result.data.data.role)
        } else {
          setTokenError('Invalid or expired invitation link')
        }
      } catch (err: any) {
        console.error('Token validation error:', err)
        setTokenError('Invalid or expired invitation link')
      } finally {
        setValidating(false)
      }
    }

    validateToken()
  }, [token])

  // Validation
  const firstNameError = touched.firstName && !firstName.trim()
    ? 'First name is required'
    : null
  const lastNameError = touched.lastName && !lastName.trim()
    ? 'Last name is required'
    : null
  const passwordError = touched.password && password.length < 6
    ? 'Password must be at least 6 characters'
    : null
  const confirmPasswordError = touched.confirmPassword && password !== confirmPassword
    ? 'Passwords do not match'
    : null

  const isValid = firstName.trim() && lastName.trim() && password.length >= 6 && password === confirmPassword

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    // Mark all fields as touched
    setTouched({
      firstName: true,
      lastName: true,
      password: true,
      confirmPassword: true,
    })

    if (!isValid || !token) return

    setIsSubmitting(true)
    setError(null)

    try {
      const functions = getFirebaseFunctions()
      const registerFn = httpsCallable<
        { token: string; firstName: string; lastName: string; password: string; phone?: string },
        RegistrationResult
      >(functions, 'completeUserRegistration')

      const result = await registerFn({
        token,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        password,
        phone: phone.trim() || undefined,
      })

      if (result.data.success) {
        setSuccess(true)
      }
    } catch (err: any) {
      console.error('Registration error:', err)
      if (err.message?.includes('already exists')) {
        setError('An account with this email already exists')
      } else if (err.message?.includes('expired')) {
        setError('This invitation has expired. Please request a new one.')
      } else {
        setError(err.message || 'Failed to complete registration')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // Loading state
  if (validating) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-header">
            <div className="login-logo">
              <img src="/allied-logo.png" alt="Allied Pharmacies" className="login-logo-img" />
            </div>
            <h1 className="login-title">Validating Invitation...</h1>
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

  // Token error state
  if (tokenError) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-header">
            <div className="login-logo">
              <img src="/allied-logo.png" alt="Allied Pharmacies" className="login-logo-img" />
            </div>
            <h1 className="login-title">Invalid Invitation</h1>
            <p className="login-subtitle">{tokenError}</p>
          </div>
          <Alert variant="error" className="login-error">
            This invitation link is invalid or has expired. Please contact your administrator to request a new invitation.
          </Alert>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => navigate('/login')}
            className="login-button"
          >
            Go to Login
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

  // Success state
  if (success) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-header">
            <div className="login-logo">
              <img src="/allied-logo.png" alt="Allied Pharmacies" className="login-logo-img" />
            </div>
            <h1 className="login-title">Registration Complete!</h1>
            <p className="login-subtitle">
              Your account has been created successfully. You can now sign in.
            </p>
          </div>
          <Alert variant="success" className="login-error">
            Welcome to Allied Recruitment Portal! Click below to sign in with your new account.
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

  // Registration form
  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="login-logo">
            <img src="/allied-logo.png" alt="Allied Pharmacies" className="login-logo-img" />
          </div>
          <h1 className="login-title">Complete Your Registration</h1>
          <p className="login-subtitle">
            You're registering as <strong>{role}</strong> with email <strong>{email}</strong>
          </p>
        </div>

        {error && (
          <Alert variant="error" className="login-error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="login-form" noValidate>
          <Input
            id="firstName"
            type="text"
            label="First Name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            onBlur={() => setTouched(t => ({ ...t, firstName: true }))}
            error={firstNameError || undefined}
            placeholder="John"
            autoComplete="given-name"
            autoFocus
            disabled={isSubmitting}
            required
          />

          <Input
            id="lastName"
            type="text"
            label="Last Name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            onBlur={() => setTouched(t => ({ ...t, lastName: true }))}
            error={lastNameError || undefined}
            placeholder="Smith"
            autoComplete="family-name"
            disabled={isSubmitting}
            required
          />

          <Input
            id="phone"
            type="tel"
            label="Phone Number (Optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="07700 900000"
            autoComplete="tel"
            disabled={isSubmitting}
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
            autoComplete="new-password"
            disabled={isSubmitting}
            required
          />

          <Input
            id="confirmPassword"
            type="password"
            label="Confirm Password"
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
                Creating Account...
              </>
            ) : (
              'Complete Registration'
            )}
          </Button>
        </form>

        <div className="login-footer">
          <p className="login-help">
            Already have an account?{' '}
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

export default Register

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  label?: string
}

export function Spinner({
  size = 'md',
  className = '',
  label = 'Loading...',
}: SpinnerProps) {
  const sizeClasses = {
    sm: 'spinner-sm',
    md: 'spinner-md',
    lg: 'spinner-lg',
  }

  const dimensions = {
    sm: 16,
    md: 24,
    lg: 32,
  }

  return (
    <div className={`spinner ${sizeClasses[size]} ${className}`} role="status" aria-label={label}>
      <svg
        width={dimensions[size]}
        height={dimensions[size]}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="spinner-svg"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          className="spinner-track"
        />
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="60 200"
          className="spinner-circle"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </div>
  )
}

// Full page loading spinner
Spinner.FullPage = function FullPageSpinner({ label }: { label?: string }) {
  return (
    <div className="spinner-fullpage">
      <Spinner size="lg" label={label} />
      {label && <p className="spinner-label">{label}</p>}
    </div>
  )
}

// Inline loading indicator
Spinner.Inline = function InlineSpinner({ label }: { label?: string }) {
  return (
    <span className="spinner-inline">
      <Spinner size="sm" label={label} />
      {label && <span className="spinner-inline-label">{label}</span>}
    </span>
  )
}

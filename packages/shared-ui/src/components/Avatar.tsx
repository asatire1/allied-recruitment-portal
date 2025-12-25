export interface AvatarProps {
  src?: string
  alt?: string
  initials?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

export function Avatar({
  src,
  alt = '',
  initials,
  size = 'md',
  className = '',
}: AvatarProps) {
  const sizeClasses = {
    xs: 'avatar-xs',
    sm: 'avatar-sm',
    md: 'avatar-md',
    lg: 'avatar-lg',
    xl: 'avatar-xl',
  }

  // Generate a consistent color based on initials
  const getBackgroundColor = (text: string): string => {
    if (!text) return 'var(--color-gray-400)'
    
    const colors = [
      '#ef4444', // red
      '#f97316', // orange
      '#f59e0b', // amber
      '#84cc16', // lime
      '#22c55e', // green
      '#14b8a6', // teal
      '#06b6d4', // cyan
      '#3b82f6', // blue
      '#6366f1', // indigo
      '#8b5cf6', // violet
      '#a855f7', // purple
      '#ec4899', // pink
    ]
    
    let hash = 0
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash)
    }
    
    return colors[Math.abs(hash) % colors.length]
  }

  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={`avatar ${sizeClasses[size]} ${className}`}
      />
    )
  }

  return (
    <div
      className={`avatar avatar-initials ${sizeClasses[size]} ${className}`}
      style={{ backgroundColor: getBackgroundColor(initials || '') }}
      aria-label={alt || initials}
    >
      {initials?.slice(0, 2).toUpperCase()}
    </div>
  )
}

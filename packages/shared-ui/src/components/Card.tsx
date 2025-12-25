import React from 'react'

export interface CardProps {
  children: React.ReactNode
  title?: string
  subtitle?: string
  actions?: React.ReactNode
  padding?: 'none' | 'sm' | 'md' | 'lg'
  className?: string
  onClick?: () => void
}

export function Card({
  children,
  title,
  subtitle,
  actions,
  padding = 'md',
  className = '',
  onClick,
}: CardProps) {
  const paddingClasses = {
    none: '',
    sm: 'card-padding-sm',
    md: 'card-padding-md',
    lg: 'card-padding-lg',
  }

  const Component = onClick ? 'button' : 'div'

  return (
    <Component
      className={`card ${paddingClasses[padding]} ${onClick ? 'card-clickable' : ''} ${className}`}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
    >
      {(title || subtitle || actions) && (
        <div className="card-header">
          <div className="card-header-text">
            {title && <h3 className="card-title">{title}</h3>}
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      <div className="card-content">{children}</div>
    </Component>
  )
}

// Sub-components for more flexibility
Card.Header = function CardHeader({ 
  children, 
  className = '' 
}: { 
  children: React.ReactNode
  className?: string 
}) {
  return <div className={`card-header ${className}`}>{children}</div>
}

Card.Body = function CardBody({ 
  children, 
  className = '' 
}: { 
  children: React.ReactNode
  className?: string 
}) {
  return <div className={`card-body ${className}`}>{children}</div>
}

Card.Footer = function CardFooter({ 
  children, 
  className = '' 
}: { 
  children: React.ReactNode
  className?: string 
}) {
  return <div className={`card-footer ${className}`}>{children}</div>
}

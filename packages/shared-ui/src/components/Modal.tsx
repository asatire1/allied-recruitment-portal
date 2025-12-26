import { useEffect, useCallback, useRef, ReactNode } from 'react'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  closeOnOverlayClick?: boolean
  closeOnEscape?: boolean
  showCloseButton?: boolean
  className?: string
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnOverlayClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  className = '',
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)
  const hasInitialFocus = useRef(false)
  const escapeCount = useRef(0)
  const escapeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Store onClose in a ref to avoid re-running effects
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Handle escape key - require double-tap if input is focused
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && closeOnEscape) {
      const activeElement = document.activeElement
      const isInputFocused = activeElement instanceof HTMLInputElement || 
                             activeElement instanceof HTMLTextAreaElement ||
                             activeElement instanceof HTMLSelectElement
      
      if (isInputFocused) {
        // First escape dismisses autofill, second escape closes modal
        escapeCount.current += 1
        
        if (escapeTimer.current) {
          clearTimeout(escapeTimer.current)
        }
        
        escapeTimer.current = setTimeout(() => {
          escapeCount.current = 0
        }, 500)
        
        if (escapeCount.current >= 2) {
          escapeCount.current = 0
          onCloseRef.current()
        }
        // Don't prevent default - let first escape dismiss autofill
      } else {
        onCloseRef.current()
      }
    }
  }, [closeOnEscape])

  // Handle overlay click
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget && closeOnOverlayClick) {
      onClose()
    }
  }, [closeOnOverlayClick, onClose])

  // Focus management and body scroll lock - only run when isOpen changes
  useEffect(() => {
    if (isOpen) {
      // Store current active element (only on first open)
      if (!hasInitialFocus.current) {
        previousActiveElement.current = document.activeElement as HTMLElement
        // Focus the modal only on initial open
        modalRef.current?.focus()
        hasInitialFocus.current = true
      }
      
      // Lock body scroll
      document.body.style.overflow = 'hidden'
      
      // Add event listener for escape key
      document.addEventListener('keydown', handleKeyDown)
    } else {
      // Reset for next open
      hasInitialFocus.current = false
    }

    return () => {
      // Restore body scroll
      document.body.style.overflow = ''
      
      // Remove event listener
      document.removeEventListener('keydown', handleKeyDown)
      
      // Clear timer
      if (escapeTimer.current) {
        clearTimeout(escapeTimer.current)
      }
      
      // Restore focus when closing
      if (!isOpen && previousActiveElement.current) {
        previousActiveElement.current.focus()
      }
    }
  }, [isOpen, handleKeyDown])

  if (!isOpen) return null

  const sizeClasses = {
    sm: 'modal-sm',
    md: 'modal-md',
    lg: 'modal-lg',
    xl: 'modal-xl',
    full: 'modal-full',
  }

  return (
    <div 
      className="modal-overlay" 
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        ref={modalRef}
        className={`modal ${sizeClasses[size]} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        tabIndex={-1}
      >
        {(title || showCloseButton) && (
          <div className="modal-header">
            {title && (
              <h2 id="modal-title" className="modal-title">
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                type="button"
                className="modal-close"
                onClick={onClose}
                aria-label="Close modal"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </div>
        )}
        <div className="modal-body">
          {children}
        </div>
        {footer && (
          <div className="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

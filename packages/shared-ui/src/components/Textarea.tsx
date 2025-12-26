import { forwardRef, TextareaHTMLAttributes, useId } from 'react'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
  maxLength?: number
  showCount?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, maxLength, showCount, className = '', id, value, ...props }, ref) => {
    const generatedId = useId()
    const textareaId = id || generatedId
    const charCount = typeof value === 'string' ? value.length : 0
    
    return (
      <div className="form-field">
        {label && (
          <label htmlFor={textareaId} className="form-label">
            {label}
            {props.required && <span className="form-required">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={`textarea ${error ? 'textarea-error' : ''} ${className}`}
          aria-invalid={!!error}
          aria-describedby={error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined}
          maxLength={maxLength}
          value={value}
          {...props}
        />
        <div className="textarea-footer">
          {error && (
            <p id={`${textareaId}-error`} className="form-error">
              {error}
            </p>
          )}
          {hint && !error && (
            <p id={`${textareaId}-hint`} className="form-hint">
              {hint}
            </p>
          )}
          {showCount && maxLength && (
            <span className="textarea-count">
              {charCount}/{maxLength}
            </span>
          )}
        </div>
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'

import React, { forwardRef, useId } from 'react'

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  error?: string
  hint?: string
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const generatedId = useId()
    const checkboxId = id || generatedId
    
    return (
      <div className="form-field form-field-checkbox">
        <div className="checkbox-wrapper">
          <input
            ref={ref}
            type="checkbox"
            id={checkboxId}
            className={`checkbox ${error ? 'checkbox-error' : ''} ${className}`}
            aria-invalid={!!error}
            aria-describedby={error ? `${checkboxId}-error` : hint ? `${checkboxId}-hint` : undefined}
            {...props}
          />
          {label && (
            <label htmlFor={checkboxId} className="checkbox-label">
              {label}
            </label>
          )}
        </div>
        {error && (
          <p id={`${checkboxId}-error`} className="form-error">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${checkboxId}-hint`} className="form-hint">
            {hint}
          </p>
        )}
      </div>
    )
  }
)

Checkbox.displayName = 'Checkbox'

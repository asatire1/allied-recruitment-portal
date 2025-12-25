import React, { useRef, useState, useCallback } from 'react'

export interface FileUploadProps {
  label?: string
  accept?: string
  multiple?: boolean
  maxSize?: number // in bytes
  error?: string
  hint?: string
  disabled?: boolean
  onFilesSelected: (files: File[]) => void
  className?: string
}

export function FileUpload({
  label,
  accept = '.pdf,.doc,.docx',
  multiple = false,
  maxSize = 10 * 1024 * 1024, // 10MB default
  error,
  hint,
  disabled = false,
  onFilesSelected,
  className = '',
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const validateFiles = useCallback((files: FileList | null): File[] => {
    if (!files || files.length === 0) return []
    
    const validFiles: File[] = []
    const errors: string[] = []
    
    Array.from(files).forEach((file) => {
      // Check file size
      if (file.size > maxSize) {
        errors.push(`${file.name} is too large (max ${Math.round(maxSize / 1024 / 1024)}MB)`)
        return
      }
      
      // Check file type if accept is specified
      if (accept) {
        const acceptedTypes = accept.split(',').map(t => t.trim().toLowerCase())
        const fileExt = '.' + file.name.split('.').pop()?.toLowerCase()
        const fileMime = file.type.toLowerCase()
        
        const isAccepted = acceptedTypes.some(type => {
          if (type.startsWith('.')) {
            return fileExt === type
          }
          if (type.endsWith('/*')) {
            return fileMime.startsWith(type.replace('/*', '/'))
          }
          return fileMime === type
        })
        
        if (!isAccepted) {
          errors.push(`${file.name} is not an accepted file type`)
          return
        }
      }
      
      validFiles.push(file)
    })
    
    if (errors.length > 0) {
      setLocalError(errors.join('. '))
    } else {
      setLocalError(null)
    }
    
    return validFiles
  }, [accept, maxSize])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const validFiles = validateFiles(e.target.files)
    if (validFiles.length > 0) {
      onFilesSelected(validFiles)
    }
    // Reset input so same file can be selected again
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }, [validateFiles, onFilesSelected])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) {
      setIsDragging(true)
    }
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    
    if (disabled) return
    
    const validFiles = validateFiles(e.dataTransfer.files)
    if (validFiles.length > 0) {
      onFilesSelected(validFiles)
    }
  }, [disabled, validateFiles, onFilesSelected])

  const handleClick = useCallback(() => {
    if (!disabled) {
      inputRef.current?.click()
    }
  }, [disabled])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }, [handleClick])

  const displayError = error || localError

  return (
    <div className={`form-field ${className}`}>
      {label && (
        <label className="form-label">{label}</label>
      )}
      <div
        className={`file-upload ${isDragging ? 'file-upload-dragging' : ''} ${disabled ? 'file-upload-disabled' : ''} ${displayError ? 'file-upload-error' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
          disabled={disabled}
          className="file-upload-input"
          aria-hidden="true"
          tabIndex={-1}
        />
        <div className="file-upload-content">
          <svg className="file-upload-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M17 8L12 3L7 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <p className="file-upload-text">
            <span className="file-upload-text-primary">
              {isDragging ? 'Drop files here' : 'Drop files here or click to upload'}
            </span>
            <span className="file-upload-text-secondary">
              {accept.replace(/\./g, '').toUpperCase().replace(/,/g, ', ')} (max {Math.round(maxSize / 1024 / 1024)}MB)
            </span>
          </p>
        </div>
      </div>
      {displayError && (
        <p className="form-error">{displayError}</p>
      )}
      {hint && !displayError && (
        <p className="form-hint">{hint}</p>
      )}
    </div>
  )
}

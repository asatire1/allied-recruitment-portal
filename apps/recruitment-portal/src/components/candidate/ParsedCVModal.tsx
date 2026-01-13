// ============================================================================
// Parsed CV Modal Component
// Extracted from CandidateDetail.tsx for better maintainability
// Location: apps/recruitment-portal/src/components/candidate/ParsedCVModal.tsx
// ============================================================================

import { useState } from 'react'
import type { Candidate } from '@allied/shared-lib'
import { Button } from '@allied/shared-ui'

// ============================================================================
// TYPES
// ============================================================================

interface ParsedCVData {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  address?: string
  postcode?: string
  skills?: string[]
  qualifications?: string[]
  experience?: Array<{
    title: string
    company: string
    current?: boolean
    startDate?: string
    endDate?: string
    description?: string
  }>
  education?: Array<{
    qualification: string
    institution: string
    year?: string
  }>
  confidence: {
    overall: number
    firstName?: number
    lastName?: number
    email?: number
    phone?: number
  }
  usedAI?: boolean
}

interface ParsedCVModalProps {
  parsedData: ParsedCVData
  currentCandidate: Candidate
  onApply: (fields: string[]) => void
  onCancel: () => void
  saving: boolean
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ParsedCVModal({ 
  parsedData, 
  currentCandidate, 
  onApply, 
  onCancel, 
  saving 
}: ParsedCVModalProps) {
  const [selectedFields, setSelectedFields] = useState<string[]>([
    'firstName', 'lastName', 'email', 'phone', 'address', 'postcode',
    'skills', 'qualifications', 'experience', 'education'
  ])

  const toggleField = (field: string) => {
    setSelectedFields(prev => 
      prev.includes(field) 
        ? prev.filter(f => f !== field)
        : [...prev, field]
    )
  }

  const getConfidenceColor = (score: number) => {
    if (score >= 80) return 'confidence-high'
    if (score >= 50) return 'confidence-medium'
    return 'confidence-low'
  }

  const renderFieldRow = (
    field: string, 
    label: string, 
    parsedValue: any, 
    currentValue: any,
    confidence?: number
  ) => {
    const hasValue = parsedValue !== null && parsedValue !== undefined && parsedValue !== ''
    const isDifferent = hasValue && parsedValue !== currentValue
    
    if (!hasValue) return null

    return (
      <div key={field} className="parsed-field-row">
        <div className="parsed-field-checkbox">
          <input
            type="checkbox"
            id={`field-${field}`}
            checked={selectedFields.includes(field)}
            onChange={() => toggleField(field)}
          />
        </div>
        <div className="parsed-field-content">
          <label htmlFor={`field-${field}`} className="parsed-field-label">
            {label}
            {confidence !== undefined && (
              <span className={`confidence-badge ${getConfidenceColor(confidence)}`}>
                {confidence}%
              </span>
            )}
          </label>
          <div className="parsed-field-values">
            <div className="parsed-value">
              <span className="value-label">Parsed:</span>
              <span className="value-text">{String(parsedValue)}</span>
            </div>
            {currentValue && isDifferent && (
              <div className="current-value">
                <span className="value-label">Current:</span>
                <span className="value-text">{String(currentValue)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="parsed-cv-modal">
      <div className="parsed-cv-header">
        <div className="overall-confidence">
          <span>Overall Confidence:</span>
          <span className={`confidence-score ${getConfidenceColor(parsedData.confidence.overall)}`}>
            {parsedData.confidence.overall}%
          </span>
        </div>
        <p className="parsed-cv-description">
          Select the fields you want to apply to this candidate's profile.
        </p>
      </div>

      <div className="parsed-fields-list">
        {renderFieldRow('firstName', 'First Name', parsedData.firstName, currentCandidate.firstName, parsedData.confidence.firstName)}
        {renderFieldRow('lastName', 'Last Name', parsedData.lastName, currentCandidate.lastName, parsedData.confidence.lastName)}
        {renderFieldRow('email', 'Email', parsedData.email, currentCandidate.email, parsedData.confidence.email)}
        {renderFieldRow('phone', 'Phone', parsedData.phone, currentCandidate.phone, parsedData.confidence.phone)}
        {renderFieldRow('address', 'Address', parsedData.address, currentCandidate.address)}
        {renderFieldRow('postcode', 'Postcode', parsedData.postcode, currentCandidate.postcode)}
        
        {parsedData.qualifications && parsedData.qualifications.length > 0 && (
          <div className="parsed-field-row">
            <div className="parsed-field-checkbox">
              <input
                type="checkbox"
                id="field-qualifications"
                checked={selectedFields.includes('qualifications')}
                onChange={() => toggleField('qualifications')}
              />
            </div>
            <div className="parsed-field-content">
              <label htmlFor="field-qualifications" className="parsed-field-label">
                Qualifications
              </label>
              <div className="parsed-tags">
                {parsedData.qualifications.map((q: string, i: number) => (
                  <span key={i} className="parsed-tag qualification-tag">{q}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {parsedData.skills && parsedData.skills.length > 0 && (
          <div className="parsed-field-row">
            <div className="parsed-field-checkbox">
              <input
                type="checkbox"
                id="field-skills"
                checked={selectedFields.includes('skills')}
                onChange={() => toggleField('skills')}
              />
            </div>
            <div className="parsed-field-content">
              <label htmlFor="field-skills" className="parsed-field-label">
                Skills
              </label>
              <div className="parsed-tags">
                {parsedData.skills.slice(0, 10).map((s: string, i: number) => (
                  <span key={i} className="parsed-tag skill-tag">{s}</span>
                ))}
                {parsedData.skills.length > 10 && (
                  <span className="parsed-tag more-tag">+{parsedData.skills.length - 10} more</span>
                )}
              </div>
            </div>
          </div>
        )}

        {parsedData.experience && parsedData.experience.length > 0 && (
          <div className="parsed-field-row">
            <div className="parsed-field-checkbox">
              <input
                type="checkbox"
                id="field-experience"
                checked={selectedFields.includes('experience')}
                onChange={() => toggleField('experience')}
              />
            </div>
            <div className="parsed-field-content">
              <label htmlFor="field-experience" className="parsed-field-label">
                Experience ({parsedData.experience.length} positions)
              </label>
              <div className="parsed-experience">
                {parsedData.experience.slice(0, 3).map((exp, i: number) => (
                  <div key={i} className="experience-item">
                    <strong>{exp.title}</strong> at {exp.company}
                    {exp.current && <span className="current-badge">Current</span>}
                  </div>
                ))}
                {parsedData.experience.length > 3 && (
                  <span className="more-text">+{parsedData.experience.length - 3} more positions</span>
                )}
              </div>
            </div>
          </div>
        )}

        {parsedData.education && parsedData.education.length > 0 && (
          <div className="parsed-field-row">
            <div className="parsed-field-checkbox">
              <input
                type="checkbox"
                id="field-education"
                checked={selectedFields.includes('education')}
                onChange={() => toggleField('education')}
              />
            </div>
            <div className="parsed-field-content">
              <label htmlFor="field-education" className="parsed-field-label">
                Education ({parsedData.education.length} entries)
              </label>
              <div className="parsed-education">
                {parsedData.education.map((edu, i: number) => (
                  <div key={i} className="education-item">
                    <strong>{edu.qualification}</strong> - {edu.institution}
                    {edu.year && <span className="year-badge">{edu.year}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="modal-actions">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button 
          variant="primary" 
          onClick={() => onApply(selectedFields)}
          disabled={saving || selectedFields.length === 0}
        >
          {saving ? 'Applying...' : `Apply ${selectedFields.length} Fields`}
        </Button>
      </div>
    </div>
  )
}

export default ParsedCVModal

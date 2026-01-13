// ============================================================================
// Edit Candidate Modal Component
// Extracted from CandidateDetail.tsx for better maintainability
// Location: apps/recruitment-portal/src/components/candidate/EditCandidateModal.tsx
// ============================================================================

import { useState, useEffect } from 'react'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { getFirebaseDb, COLLECTIONS, normalizePhone } from '@allied/shared-lib'
import type { Candidate, ActivityAction } from '@allied/shared-lib'
import { Modal, Input, Select, Textarea, Button } from '@allied/shared-ui'

// ============================================================================
// CONSTANTS
// ============================================================================

const SOURCE_OPTIONS = [
  { value: '', label: 'Select source...' },
  { value: 'indeed', label: 'Indeed' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'referral', label: 'Referral' },
  { value: 'website', label: 'Website' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'agency', label: 'Agency' },
  { value: 'other', label: 'Other' },
]

// ============================================================================
// TYPES
// ============================================================================

interface EditCandidateForm {
  firstName: string
  lastName: string
  email: string
  phone: string
  address: string
  postcode: string
  source: string
  jobTitle: string
  notes: string
}

interface FormErrors {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  postcode?: string
}

interface EditCandidateModalProps {
  isOpen: boolean
  onClose: () => void
  candidate: Candidate | null
  onCandidateUpdated: (updatedCandidate: Partial<Candidate>) => void
  onLogActivity: (
    entityId: string,
    action: ActivityAction,
    description: string,
    previousValue?: Record<string, unknown>,
    newValue?: Record<string, unknown>
  ) => Promise<void>
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

// Validate UK phone number
const validateUKPhone = (phone: string): boolean => {
  const normalized = normalizePhone(phone)
  return /^0[1-37]\d{8,9}$/.test(normalized)
}

// Validate UK postcode
const validateUKPostcode = (postcode: string): boolean => {
  const cleaned = postcode.replace(/\s/g, '').toUpperCase()
  return /^[A-Z]{1,2}[0-9][0-9A-Z]?[0-9][A-Z]{2}$/.test(cleaned)
}

// Format UK postcode
const formatPostcode = (postcode: string): string => {
  const cleaned = postcode.replace(/\s/g, '').toUpperCase()
  if (cleaned.length > 3) {
    return cleaned.slice(0, -3) + ' ' + cleaned.slice(-3)
  }
  return cleaned
}

// Validate email
const validateEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// ============================================================================
// COMPONENT
// ============================================================================

export function EditCandidateModal({ 
  isOpen, 
  onClose, 
  candidate, 
  onCandidateUpdated,
  onLogActivity
}: EditCandidateModalProps) {
  const db = getFirebaseDb()
  
  const [editForm, setEditForm] = useState<EditCandidateForm>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    postcode: '',
    source: '',
    jobTitle: '',
    notes: '',
  })
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)

  // Initialize form when modal opens
  useEffect(() => {
    if (isOpen && candidate) {
      setEditForm({
        firstName: candidate.firstName || '',
        lastName: candidate.lastName || '',
        email: candidate.email || '',
        phone: candidate.phone || '',
        address: candidate.address || '',
        postcode: candidate.postcode || '',
        source: candidate.source || '',
        jobTitle: candidate.jobTitle || '',
        notes: candidate.notes || '',
      })
      setFormErrors({})
    }
  }, [isOpen, candidate])

  const handleClose = () => {
    setFormErrors({})
    onClose()
  }

  // Handle form field change
  const handleFormChange = (field: keyof EditCandidateForm, value: string) => {
    setEditForm(prev => ({ ...prev, [field]: value }))
    if (formErrors[field as keyof FormErrors]) {
      setFormErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  // Validate form
  const validateForm = (): boolean => {
    const errors: FormErrors = {}

    if (!editForm.firstName.trim()) {
      errors.firstName = 'First name is required'
    }

    if (!editForm.lastName.trim()) {
      errors.lastName = 'Last name is required'
    }

    if (!editForm.email.trim()) {
      errors.email = 'Email is required'
    } else if (!validateEmail(editForm.email)) {
      errors.email = 'Please enter a valid email address'
    }

    if (!editForm.phone.trim()) {
      errors.phone = 'Phone number is required'
    } else if (!validateUKPhone(editForm.phone)) {
      errors.phone = 'Please enter a valid UK phone number'
    }

    if (editForm.postcode && !validateUKPostcode(editForm.postcode)) {
      errors.postcode = 'Please enter a valid UK postcode'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Save changes
  const handleSave = async () => {
    if (!candidate || !validateForm()) return

    try {
      setSaving(true)

      // Track what changed for audit log
      const changes: string[] = []
      const previousValues: Record<string, unknown> = {}
      const newValues: Record<string, unknown> = {}

      if (editForm.firstName !== candidate.firstName) {
        changes.push('first name')
        previousValues.firstName = candidate.firstName
        newValues.firstName = editForm.firstName.trim()
      }
      if (editForm.lastName !== candidate.lastName) {
        changes.push('last name')
        previousValues.lastName = candidate.lastName
        newValues.lastName = editForm.lastName.trim()
      }
      if (editForm.email !== candidate.email) {
        changes.push('email')
        previousValues.email = candidate.email
        newValues.email = editForm.email.trim().toLowerCase()
      }
      if (editForm.phone !== candidate.phone) {
        changes.push('phone')
        previousValues.phone = candidate.phone
        newValues.phone = editForm.phone.trim()
      }
      if (editForm.address !== (candidate.address || '')) {
        changes.push('address')
        previousValues.address = candidate.address
        newValues.address = editForm.address.trim()
      }
      if (editForm.postcode !== (candidate.postcode || '')) {
        changes.push('postcode')
        previousValues.postcode = candidate.postcode
        newValues.postcode = editForm.postcode ? formatPostcode(editForm.postcode) : ''
      }
      if (editForm.source !== (candidate.source || '')) {
        changes.push('source')
        previousValues.source = candidate.source
        newValues.source = editForm.source
      }
      if (editForm.jobTitle !== (candidate.jobTitle || '')) {
        changes.push('job title')
        previousValues.jobTitle = candidate.jobTitle
        newValues.jobTitle = editForm.jobTitle.trim()
      }
      if (editForm.notes !== (candidate.notes || '')) {
        changes.push('notes')
        previousValues.notes = candidate.notes
        newValues.notes = editForm.notes.trim()
      }

      // Build update data
      const updateData = {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        email: editForm.email.trim().toLowerCase(),
        phone: editForm.phone.trim(),
        phoneNormalized: normalizePhone(editForm.phone),
        address: editForm.address.trim(),
        postcode: editForm.postcode ? formatPostcode(editForm.postcode) : '',
        source: editForm.source,
        jobTitle: editForm.jobTitle.trim(),
        notes: editForm.notes.trim(),
        updatedAt: serverTimestamp(),
      }

      // Update Firestore
      const candidateRef = doc(db, COLLECTIONS.CANDIDATES, candidate.id)
      await updateDoc(candidateRef, updateData)

      // Log the update if there were changes
      if (changes.length > 0) {
        await onLogActivity(
          candidate.id,
          'updated',
          `Updated ${changes.join(', ')}`,
          previousValues,
          newValues
        )
      }

      // Notify parent of update
      onCandidateUpdated({
        ...updateData,
        updatedAt: { toDate: () => new Date() } as any,
      })

      onClose()
    } catch (err) {
      console.error('Error saving candidate:', err)
      alert('Failed to save changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!candidate) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Edit Candidate"
    >
      <div className="edit-candidate-form">
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="edit-firstName">First Name *</label>
            <Input
              id="edit-firstName"
              value={editForm.firstName}
              onChange={(e) => handleFormChange('firstName', e.target.value)}
              placeholder="Enter first name"
              error={formErrors.firstName}
            />
          </div>
          <div className="form-group">
            <label htmlFor="edit-lastName">Last Name *</label>
            <Input
              id="edit-lastName"
              value={editForm.lastName}
              onChange={(e) => handleFormChange('lastName', e.target.value)}
              placeholder="Enter last name"
              error={formErrors.lastName}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="edit-email">Email Address *</label>
            <Input
              id="edit-email"
              type="email"
              value={editForm.email}
              onChange={(e) => handleFormChange('email', e.target.value)}
              placeholder="candidate@example.com"
              error={formErrors.email}
            />
          </div>
          <div className="form-group">
            <label htmlFor="edit-phone">Phone Number *</label>
            <Input
              id="edit-phone"
              type="tel"
              value={editForm.phone}
              onChange={(e) => handleFormChange('phone', e.target.value)}
              placeholder="07123 456 789"
              error={formErrors.phone}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="edit-address">Address</label>
          <Input
            id="edit-address"
            value={editForm.address}
            onChange={(e) => handleFormChange('address', e.target.value)}
            placeholder="Enter address"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="edit-postcode">Postcode</label>
            <Input
              id="edit-postcode"
              value={editForm.postcode}
              onChange={(e) => handleFormChange('postcode', e.target.value)}
              placeholder="SW1A 1AA"
              error={formErrors.postcode}
            />
          </div>
          <div className="form-group">
            <label htmlFor="edit-source">Source</label>
            <Select
              id="edit-source"
              value={editForm.source}
              onChange={(e) => handleFormChange('source', e.target.value)}
              options={SOURCE_OPTIONS}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="edit-jobTitle">Job Title / Position Applied For</label>
          <Input
            id="edit-jobTitle"
            value={editForm.jobTitle}
            onChange={(e) => handleFormChange('jobTitle', e.target.value)}
            placeholder="e.g. Pharmacist, Pharmacy Technician"
          />
        </div>

        <div className="form-group">
          <label htmlFor="edit-notes">Notes</label>
          <Textarea
            id="edit-notes"
            value={editForm.notes}
            onChange={(e) => handleFormChange('notes', e.target.value)}
            placeholder="Any additional notes about this candidate..."
            rows={3}
          />
        </div>

        <div className="modal-actions">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default EditCandidateModal

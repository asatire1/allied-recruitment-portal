// ============================================================================
// Status Change Modal Component
// Extracted from CandidateDetail.tsx for better maintainability
// Location: apps/recruitment-portal/src/components/candidate/StatusChangeModal.tsx
// ============================================================================

import { useState } from 'react'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { getFirebaseDb, COLLECTIONS } from '@allied/shared-lib'
import type { Candidate, CandidateStatus, ActivityAction } from '@allied/shared-lib'
import { Modal, Select, Button } from '@allied/shared-ui'

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_OPTIONS: { value: CandidateStatus | ''; label: string }[] = [
  { value: '', label: 'Select status...' },
  { value: 'new', label: 'New' },
  { value: 'screening', label: 'Screening' },
  { value: 'interview_scheduled', label: 'Interview Scheduled' },
  { value: 'interview_complete', label: 'Interview Complete' },
  { value: 'trial_scheduled', label: 'Trial Scheduled' },
  { value: 'trial_complete', label: 'Trial Complete' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
]

// ============================================================================
// TYPES
// ============================================================================

interface StatusChangeModalProps {
  isOpen: boolean
  onClose: () => void
  candidate: Candidate | null
  onStatusChanged: (newStatus: CandidateStatus) => void
  onLogActivity: (
    entityId: string,
    action: ActivityAction,
    description: string,
    previousValue?: Record<string, unknown>,
    newValue?: Record<string, unknown>
  ) => Promise<void>
  onPromptRejectionEmail?: () => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StatusChangeModal({ 
  isOpen, 
  onClose, 
  candidate, 
  onStatusChanged,
  onLogActivity,
  onPromptRejectionEmail
}: StatusChangeModalProps) {
  const db = getFirebaseDb()
  
  const [newStatus, setNewStatus] = useState<CandidateStatus | ''>('')
  const [updating, setUpdating] = useState(false)

  const handleClose = () => {
    setNewStatus('')
    onClose()
  }

  const handleStatusChange = async () => {
    if (!candidate || !newStatus) return

    const previousStatus = candidate.status

    try {
      setUpdating(true)
      const candidateRef = doc(db, COLLECTIONS.CANDIDATES, candidate.id)
      await updateDoc(candidateRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
      })

      // Log the status change
      await onLogActivity(
        candidate.id,
        'status_changed',
        `Status changed from "${previousStatus.replace(/_/g, ' ')}" to "${newStatus.replace(/_/g, ' ')}"`,
        { status: previousStatus },
        { status: newStatus }
      )

      // Notify parent of the change
      onStatusChanged(newStatus)
      
      // If status changed to rejected, prompt to send rejection email
      if (newStatus === 'rejected' && onPromptRejectionEmail) {
        const sendEmail = window.confirm(
          'Candidate marked as rejected. Would you like to send a rejection email?'
        )
        
        if (sendEmail) {
          onPromptRejectionEmail()
        }
      }
      
      setNewStatus('')
      onClose()
    } catch (err) {
      console.error('Error updating status:', err)
      alert('Failed to update status. Please try again.')
    } finally {
      setUpdating(false)
    }
  }

  if (!candidate) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Change Candidate Status"
    >
      <div className="status-modal-content">
        <p>
          Update status for <strong>{candidate.firstName} {candidate.lastName}</strong>
        </p>
        <div className="status-select">
          <label>New Status</label>
          <Select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as CandidateStatus)}
            options={STATUS_OPTIONS}
          />
        </div>
        <div className="modal-actions">
          <Button 
            variant="secondary" 
            onClick={handleClose}
          >
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={handleStatusChange}
            disabled={!newStatus || newStatus === candidate.status || updating}
          >
            {updating ? 'Updating...' : 'Update Status'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default StatusChangeModal

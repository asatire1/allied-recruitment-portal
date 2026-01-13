// ============================================================================
// Delete Candidate Modal Component
// Extracted from CandidateDetail.tsx for better maintainability
// Location: apps/recruitment-portal/src/components/candidate/DeleteCandidateModal.tsx
// ============================================================================

import { useState } from 'react'
import { doc, deleteDoc } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { getFirebaseDb, COLLECTIONS } from '@allied/shared-lib'
import type { Candidate, ActivityAction } from '@allied/shared-lib'
import { Modal, Button } from '@allied/shared-ui'

// ============================================================================
// TYPES
// ============================================================================

interface DeleteCandidateModalProps {
  isOpen: boolean
  onClose: () => void
  candidate: Candidate | null
  onLogActivity: (
    entityId: string,
    action: ActivityAction,
    description: string,
    previousValue?: Record<string, unknown>,
    newValue?: Record<string, unknown>
  ) => Promise<void>
  redirectAfterDelete?: boolean
}

// ============================================================================
// COMPONENT
// ============================================================================

export function DeleteCandidateModal({ 
  isOpen, 
  onClose, 
  candidate, 
  onLogActivity,
  redirectAfterDelete = true
}: DeleteCandidateModalProps) {
  const db = getFirebaseDb()
  const navigate = useNavigate()
  
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!candidate) return

    try {
      setDeleting(true)

      // Log the deletion before deleting
      await onLogActivity(
        candidate.id,
        'deleted',
        `Candidate "${candidate.firstName} ${candidate.lastName}" was deleted`,
        {
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          email: candidate.email,
          phone: candidate.phone,
          status: candidate.status,
        },
        undefined
      )

      // Delete the candidate document
      const candidateRef = doc(db, COLLECTIONS.CANDIDATES, candidate.id)
      await deleteDoc(candidateRef)

      // Navigate back to candidates list
      if (redirectAfterDelete) {
        navigate('/candidates')
      } else {
        onClose()
      }
    } catch (err) {
      console.error('Error deleting candidate:', err)
      alert('Failed to delete candidate. Please try again.')
      setDeleting(false)
    }
  }

  if (!candidate) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Delete Candidate"
    >
      <div className="delete-modal-content">
        <div className="delete-warning">
          <span className="warning-icon">⚠️</span>
          <p>
            Are you sure you want to delete <strong>{candidate.firstName} {candidate.lastName}</strong>?
          </p>
        </div>
        <p className="delete-description">
          This action cannot be undone. All candidate data including their application history will be permanently removed.
        </p>
        <div className="modal-actions">
          <Button 
            variant="secondary" 
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button 
            variant="danger" 
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete Candidate'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default DeleteCandidateModal

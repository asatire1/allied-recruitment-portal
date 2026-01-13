// ============================================================================
// useModalState Hook
// Manages all modal visibility states for CandidateDetail page
// Location: apps/recruitment-portal/src/hooks/useModalState.ts
// ============================================================================

import { useState, useCallback } from 'react'

// ============================================================================
// TYPES
// ============================================================================

interface UseModalStateReturn {
  // Status modal
  showStatusModal: boolean
  openStatusModal: () => void
  closeStatusModal: () => void
  
  // Edit modal
  showEditModal: boolean
  openEditModal: () => void
  closeEditModal: () => void
  
  // Delete modal
  showDeleteModal: boolean
  openDeleteModal: () => void
  closeDeleteModal: () => void
  
  // WhatsApp modal
  showWhatsAppModal: boolean
  openWhatsAppModal: () => void
  closeWhatsAppModal: () => void
  
  // Email modal
  showEmailModal: boolean
  openEmailModal: () => void
  closeEmailModal: () => void
  
  // Parsed CV modal
  showParsedModal: boolean
  openParsedModal: () => void
  closeParsedModal: () => void
  
  // Close all modals
  closeAllModals: () => void
}

// ============================================================================
// HOOK
// ============================================================================

export function useModalState(): UseModalStateReturn {
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [showParsedModal, setShowParsedModal] = useState(false)

  // Status modal handlers
  const openStatusModal = useCallback(() => setShowStatusModal(true), [])
  const closeStatusModal = useCallback(() => setShowStatusModal(false), [])

  // Edit modal handlers
  const openEditModal = useCallback(() => setShowEditModal(true), [])
  const closeEditModal = useCallback(() => setShowEditModal(false), [])

  // Delete modal handlers
  const openDeleteModal = useCallback(() => setShowDeleteModal(true), [])
  const closeDeleteModal = useCallback(() => setShowDeleteModal(false), [])

  // WhatsApp modal handlers
  const openWhatsAppModal = useCallback(() => setShowWhatsAppModal(true), [])
  const closeWhatsAppModal = useCallback(() => setShowWhatsAppModal(false), [])

  // Email modal handlers
  const openEmailModal = useCallback(() => setShowEmailModal(true), [])
  const closeEmailModal = useCallback(() => setShowEmailModal(false), [])

  // Parsed CV modal handlers
  const openParsedModal = useCallback(() => setShowParsedModal(true), [])
  const closeParsedModal = useCallback(() => setShowParsedModal(false), [])

  // Close all modals
  const closeAllModals = useCallback(() => {
    setShowStatusModal(false)
    setShowEditModal(false)
    setShowDeleteModal(false)
    setShowWhatsAppModal(false)
    setShowEmailModal(false)
    setShowParsedModal(false)
  }, [])

  return {
    showStatusModal,
    openStatusModal,
    closeStatusModal,
    showEditModal,
    openEditModal,
    closeEditModal,
    showDeleteModal,
    openDeleteModal,
    closeDeleteModal,
    showWhatsAppModal,
    openWhatsAppModal,
    closeWhatsAppModal,
    showEmailModal,
    openEmailModal,
    closeEmailModal,
    showParsedModal,
    openParsedModal,
    closeParsedModal,
    closeAllModals,
  }
}

export default useModalState

// ============================================================================
// Allied Recruitment Portal - Hooks Index
// Location: apps/recruitment-portal/src/hooks/index.ts
// ============================================================================

// R11.1 - React Query hooks
export * from './useQueries'

// R11.5 - Keyboard shortcuts
export * from './useKeyboardShortcuts'

// Re-export query client utilities
export { queryClient, queryKeys, invalidateRelatedQueries } from '../lib/queryClient'

// Phase 4: CandidateDetail Custom Hooks
export { useCandidateData } from './useCandidateData'
export { useCVOperations } from './useCVOperations'
export { useModalState } from './useModalState'
export { useExpandedSections } from './useExpandedSections'

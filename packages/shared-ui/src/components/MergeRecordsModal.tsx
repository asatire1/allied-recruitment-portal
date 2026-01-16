import { useState, useMemo, useEffect } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'
import { Checkbox } from './Checkbox'
import { Badge } from './Badge'

// Local type definitions (to avoid circular dependency with shared-lib)
type CandidateStatus = 'new' | 'screening' | 'interview_scheduled' | 'interview_complete' | 'trial_scheduled' | 'trial_complete' | 'approved' | 'rejected' | 'withdrawn'

// ============================================================================
// TYPES
// ============================================================================

export interface MergeCandidate {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  address?: string
  postcode?: string
  jobTitle?: string
  branchName?: string
  source?: string
  status: CandidateStatus
  notes?: string
  skills?: string[]
  yearsExperience?: number
  cvUrl?: string
  cvFileName?: string
  createdAt?: Date
  updatedAt?: Date
  // Additional fields for richer merge
  qualifications?: string[]
  applicationHistory?: any[]
}

interface MergeRecordsModalProps {
  isOpen: boolean
  onClose: () => void
  /** The existing record (will be updated) */
  primaryCandidate: MergeCandidate
  /** The new/duplicate record (source of new data) */
  secondaryCandidate: MergeCandidate
  /** Called when merge is confirmed */
  onMerge: (mergedData: Partial<MergeCandidate>, deleteSecondary: boolean, combinedFields: CombinedFieldsData) => void
  loading?: boolean
}

type MergeableField = keyof Pick<
  MergeCandidate,
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'address'
  | 'postcode'
  | 'jobTitle'
  | 'branchName'
  | 'source'
  | 'notes'
  | 'skills'
  | 'yearsExperience'
  | 'cvUrl'
  | 'qualifications'
>

type FieldSelection = 'primary' | 'secondary' | 'combined'

/** Data for fields that can be combined */
export interface CombinedFieldsData {
  notes?: string
  skills?: string[]
  qualifications?: string[]
}

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  container: {
    maxHeight: '75vh',
    overflowY: 'auto' as const,
  },
  summarySection: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    marginBottom: '24px',
  },
  summaryCard: {
    padding: '16px',
    borderRadius: '8px',
    border: '2px solid',
  },
  summaryCardPrimary: {
    borderColor: '#3b82f6',
    background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
  },
  summaryCardSecondary: {
    borderColor: '#f59e0b',
    background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
  },
  summaryHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
  },
  summaryIcon: {
    fontSize: '20px',
  },
  summaryTitle: {
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  summaryTitlePrimary: {
    color: '#1d4ed8',
  },
  summaryTitleSecondary: {
    color: '#b45309',
  },
  summaryName: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    marginBottom: '8px',
  },
  summaryDetails: {
    fontSize: '13px',
    color: '#4b5563',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  summaryDetail: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  quickActions: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px',
    flexWrap: 'wrap' as const,
  },
  header: {
    display: 'grid',
    gridTemplateColumns: '140px 1fr 1fr 1fr',
    gap: '12px',
    padding: '12px 16px',
    background: '#f3f4f6',
    borderRadius: '8px',
    marginBottom: '8px',
    position: 'sticky' as const,
    top: 0,
    zIndex: 10,
  },
  headerLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  headerPrimary: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#2563eb',
  },
  headerSecondary: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#d97706',
  },
  headerResult: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#059669',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '140px 1fr 1fr 1fr',
    gap: '12px',
    padding: '10px 16px',
    borderBottom: '1px solid #e5e7eb',
    alignItems: 'center',
  },
  rowHighlight: {
    background: '#fefce8',
  },
  fieldLabelContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  fieldLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#374151',
  },
  fieldActions: {
    display: 'flex',
    gap: '4px',
  },
  combineButton: {
    fontSize: '10px',
    padding: '2px 6px',
    background: '#e0e7ff',
    border: 'none',
    borderRadius: '4px',
    color: '#4338ca',
    cursor: 'pointer',
    fontWeight: 500,
  },
  fieldValue: {
    fontSize: '12px',
    color: '#1f2937',
    padding: '8px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    border: '2px solid transparent',
    background: '#f9fafb',
    wordBreak: 'break-word' as const,
    minHeight: '36px',
    display: 'flex',
    alignItems: 'center',
  },
  fieldValueSelected: {
    border: '2px solid #3b82f6',
    background: '#eff6ff',
  },
  fieldValueCombined: {
    border: '2px solid #8b5cf6',
    background: '#f5f3ff',
  },
  resultValue: {
    fontSize: '12px',
    color: '#059669',
    fontWeight: 500,
    padding: '8px 10px',
    borderRadius: '6px',
    background: '#ecfdf5',
    border: '2px solid #10b981',
    wordBreak: 'break-word' as const,
    minHeight: '36px',
    display: 'flex',
    alignItems: 'center',
  },
  resultValueCombined: {
    background: '#f5f3ff',
    border: '2px solid #8b5cf6',
    color: '#6d28d9',
  },
  emptyValue: {
    color: '#9ca3af',
    fontStyle: 'italic' as const,
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '24px',
    paddingTop: '16px',
    borderTop: '1px solid #e5e7eb',
    flexWrap: 'wrap' as const,
    gap: '12px',
  },
  footerOptions: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  deleteOption: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  actions: {
    display: 'flex',
    gap: '12px',
  },
  warningBox: {
    padding: '12px 16px',
    borderRadius: '8px',
    background: '#fef3c7',
    border: '1px solid #f59e0b',
    marginBottom: '16px',
    fontSize: '13px',
    color: '#92400e',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  infoBox: {
    padding: '12px 16px',
    borderRadius: '8px',
    background: '#eff6ff',
    border: '1px solid #3b82f6',
    marginBottom: '16px',
    fontSize: '13px',
    color: '#1d4ed8',
  },
  combinedPreview: {
    fontSize: '11px',
    color: '#6d28d9',
    marginTop: '4px',
    padding: '4px 8px',
    background: '#f5f3ff',
    borderRadius: '4px',
  },
}

// ============================================================================
// FIELD CONFIG
// ============================================================================

interface FieldConfig {
  key: MergeableField
  label: string
  canCombine?: boolean
  important?: boolean
}

const MERGEABLE_FIELDS: FieldConfig[] = [
  { key: 'firstName', label: 'First Name', important: true },
  { key: 'lastName', label: 'Last Name', important: true },
  { key: 'email', label: 'Email', important: true },
  { key: 'phone', label: 'Phone', important: true },
  { key: 'address', label: 'Address' },
  { key: 'postcode', label: 'Postcode' },
  { key: 'jobTitle', label: 'Job Title' },
  { key: 'branchName', label: 'Branch' },
  { key: 'source', label: 'Source' },
  { key: 'yearsExperience', label: 'Years Exp.' },
  { key: 'cvUrl', label: 'CV' },
  { key: 'notes', label: 'Notes', canCombine: true },
  { key: 'skills', label: 'Skills', canCombine: true },
  { key: 'qualifications', label: 'Qualifications', canCombine: true },
]

const STATUS_COLORS: Record<CandidateStatus, string> = {
  new: 'info',
  screening: 'warning',
  interview_scheduled: 'info',
  interview_complete: 'info',
  trial_scheduled: 'warning',
  trial_complete: 'warning',
  approved: 'success',
  rejected: 'error',
  withdrawn: 'neutral',
}

// ============================================================================
// HELPERS
// ============================================================================

const formatDate = (date?: Date): string => {
  if (!date) return 'Unknown'
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// ============================================================================
// COMPONENT
// ============================================================================

export function MergeRecordsModal({
  isOpen,
  onClose,
  primaryCandidate,
  secondaryCandidate,
  onMerge,
  loading = false,
}: MergeRecordsModalProps) {
  // Track selection for each field
  const [selections, setSelections] = useState<Record<MergeableField, FieldSelection>>(() => {
    const initial: Record<string, FieldSelection> = {}
    MERGEABLE_FIELDS.forEach(({ key }) => {
      initial[key] = 'primary'
    })
    return initial as Record<MergeableField, FieldSelection>
  })
  
  const [deleteSecondary, setDeleteSecondary] = useState(true)
  const [showConfirmation, setShowConfirmation] = useState(false)

  // Reset selections when modal opens with new data
  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, FieldSelection> = {}
      const isReapplication = primaryCandidate?.status === 'rejected' || primaryCandidate?.status === 'withdrawn'

      MERGEABLE_FIELDS.forEach(({ key }) => {
        // For reapplications, default job-related fields to secondary (new application)
        // so the candidate gets assigned to the new job, not the old rejected one
        if (isReapplication && (key === 'jobTitle' || key === 'branchName')) {
          initial[key] = 'secondary'
        } else {
          initial[key] = 'primary'
        }
      })
      setSelections(initial as Record<MergeableField, FieldSelection>)
      setShowConfirmation(false)
    }
  }, [isOpen, primaryCandidate?.id, primaryCandidate?.status, secondaryCandidate?.id])

  const selectField = (field: MergeableField, source: FieldSelection) => {
    setSelections(prev => ({ ...prev, [field]: source }))
  }

  const selectAllPrimary = () => {
    const newSelections: Record<string, FieldSelection> = {}
    MERGEABLE_FIELDS.forEach(({ key }) => {
      newSelections[key] = 'primary'
    })
    setSelections(newSelections as Record<MergeableField, FieldSelection>)
  }

  const selectAllSecondary = () => {
    const newSelections: Record<string, FieldSelection> = {}
    MERGEABLE_FIELDS.forEach(({ key }) => {
      newSelections[key] = 'secondary'
    })
    setSelections(newSelections as Record<MergeableField, FieldSelection>)
  }

  /** Smart select: pick the best value from each field */
  const smartSelect = () => {
    const newSelections: Record<string, FieldSelection> = {}
    MERGEABLE_FIELDS.forEach(({ key, canCombine }) => {
      const primaryVal = primaryCandidate[key]
      const secondaryVal = secondaryCandidate[key]
      
      // If both have values and field can be combined, combine them
      if (canCombine && primaryVal && secondaryVal) {
        newSelections[key] = 'combined'
      }
      // If only secondary has value, use secondary
      else if (!primaryVal && secondaryVal) {
        newSelections[key] = 'secondary'
      }
      // If secondary is longer/more complete for text fields
      else if (
        typeof primaryVal === 'string' && 
        typeof secondaryVal === 'string' && 
        secondaryVal.length > primaryVal.length
      ) {
        newSelections[key] = 'secondary'
      }
      // Default to primary
      else {
        newSelections[key] = 'primary'
      }
    })
    setSelections(newSelections as Record<MergeableField, FieldSelection>)
  }

  const getFieldValue = (candidate: MergeCandidate, field: MergeableField): string => {
    const value = candidate[field]
    if (value === undefined || value === null) return ''
    if (Array.isArray(value)) return value.join(', ')
    if (field === 'cvUrl' && value) return candidate.cvFileName || 'CV attached'
    return String(value)
  }

  const getCombinedValue = (field: MergeableField): string => {
    const primary = primaryCandidate[field]
    const secondary = secondaryCandidate[field]
    
    if (field === 'notes') {
      const parts = [primary, secondary].filter(Boolean)
      if (parts.length === 2) return `${parts[0]}\n\n--- Merged Note ---\n\n${parts[1]}`
      return parts[0] as string || ''
    }
    
    if (field === 'skills' || field === 'qualifications') {
      const arr1 = Array.isArray(primary) ? primary : []
      const arr2 = Array.isArray(secondary) ? secondary : []
      const combined = [...new Set([...arr1, ...arr2])]
      return combined.join(', ')
    }
    
    return ''
  }

  const getResultValue = (field: MergeableField): string => {
    const selection = selections[field]
    if (selection === 'combined') {
      return getCombinedValue(field)
    }
    const source = selection === 'primary' ? primaryCandidate : secondaryCandidate
    return getFieldValue(source, field)
  }

  // Calculate merged data
  const mergedData = useMemo(() => {
    const result: Partial<MergeCandidate> = {}
    MERGEABLE_FIELDS.forEach(({ key }) => {
      const selection = selections[key]
      if (selection === 'combined') {
        // Handle combined fields specially
        if (key === 'notes') {
          result.notes = getCombinedValue('notes')
        } else if (key === 'skills') {
          const arr1 = Array.isArray(primaryCandidate.skills) ? primaryCandidate.skills : []
          const arr2 = Array.isArray(secondaryCandidate.skills) ? secondaryCandidate.skills : []
          result.skills = [...new Set([...arr1, ...arr2])]
        } else if (key === 'qualifications') {
          const arr1 = Array.isArray(primaryCandidate.qualifications) ? primaryCandidate.qualifications : []
          const arr2 = Array.isArray(secondaryCandidate.qualifications) ? secondaryCandidate.qualifications : []
          result.qualifications = [...new Set([...arr1, ...arr2])]
        }
      } else {
        const source = selection === 'primary' ? primaryCandidate : secondaryCandidate
        result[key] = source[key] as any
      }
    })
    return result
  }, [selections, primaryCandidate, secondaryCandidate])

  // Calculate combined fields data
  const combinedFieldsData: CombinedFieldsData = useMemo(() => {
    const data: CombinedFieldsData = {}
    if (selections.notes === 'combined') {
      data.notes = getCombinedValue('notes')
    }
    if (selections.skills === 'combined') {
      const arr1 = Array.isArray(primaryCandidate.skills) ? primaryCandidate.skills : []
      const arr2 = Array.isArray(secondaryCandidate.skills) ? secondaryCandidate.skills : []
      data.skills = [...new Set([...arr1, ...arr2])]
    }
    if (selections.qualifications === 'combined') {
      const arr1 = Array.isArray(primaryCandidate.qualifications) ? primaryCandidate.qualifications : []
      const arr2 = Array.isArray(secondaryCandidate.qualifications) ? secondaryCandidate.qualifications : []
      data.qualifications = [...new Set([...arr1, ...arr2])]
    }
    return data
  }, [selections, primaryCandidate, secondaryCandidate])

  // Count changes from primary
  const changesFromPrimary = useMemo(() => {
    return MERGEABLE_FIELDS.filter(({ key }) => selections[key] !== 'primary').length
  }, [selections])

  const handleMergeClick = () => {
    if (changesFromPrimary > 0 || deleteSecondary) {
      setShowConfirmation(true)
    } else {
      onMerge(mergedData, deleteSecondary, combinedFieldsData)
    }
  }

  const handleConfirmMerge = () => {
    onMerge(mergedData, deleteSecondary, combinedFieldsData)
  }

  const isReapplication = primaryCandidate?.status === 'rejected' || primaryCandidate?.status === 'withdrawn'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Merge Candidate Records" size="xl">
      <div style={styles.container}>
        {/* Reapplication Notice */}
        {isReapplication && (
          <div style={{
            background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
            border: '1px solid #3b82f6',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
          }}>
            <span style={{ fontSize: '18px' }}>🔄</span>
            <div>
              <div style={{ fontWeight: 600, color: '#1e40af', marginBottom: '4px' }}>
                Reapplication Detected
              </div>
              <div style={{ fontSize: '13px', color: '#1e3a8a' }}>
                This candidate was previously <strong>{primaryCandidate.status}</strong> and is now applying for a new position.
                The job fields have been pre-selected to use the new application.
                Status will be reset to "new" after merge.
              </div>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        <div style={styles.summarySection}>
          <div style={{ ...styles.summaryCard, ...styles.summaryCardPrimary }}>
            <div style={styles.summaryHeader}>
              <span style={styles.summaryIcon}>🔵</span>
              <span style={{ ...styles.summaryTitle, ...styles.summaryTitlePrimary }}>
                Primary Record (Keep)
              </span>
            </div>
            <div style={styles.summaryName}>
              {primaryCandidate.firstName} {primaryCandidate.lastName}
            </div>
            <div style={styles.summaryDetails}>
              <span style={styles.summaryDetail}>📧 {primaryCandidate.email}</span>
              <span style={styles.summaryDetail}>📱 {primaryCandidate.phone}</span>
              {primaryCandidate.jobTitle && (
                <span style={styles.summaryDetail}>💼 {primaryCandidate.jobTitle}</span>
              )}
              <span style={styles.summaryDetail}>
                📅 Applied: {formatDate(primaryCandidate.createdAt)}
              </span>
              <Badge variant={STATUS_COLORS[primaryCandidate.status] as any}>
                {primaryCandidate.status.replace(/_/g, ' ')}
              </Badge>
            </div>
          </div>

          <div style={{ ...styles.summaryCard, ...styles.summaryCardSecondary }}>
            <div style={styles.summaryHeader}>
              <span style={styles.summaryIcon}>🟡</span>
              <span style={{ ...styles.summaryTitle, ...styles.summaryTitleSecondary }}>
                Secondary Record (Merge From)
              </span>
            </div>
            <div style={styles.summaryName}>
              {secondaryCandidate.firstName} {secondaryCandidate.lastName}
            </div>
            <div style={styles.summaryDetails}>
              <span style={styles.summaryDetail}>📧 {secondaryCandidate.email}</span>
              <span style={styles.summaryDetail}>📱 {secondaryCandidate.phone}</span>
              {secondaryCandidate.jobTitle && (
                <span style={styles.summaryDetail}>💼 {secondaryCandidate.jobTitle}</span>
              )}
              <span style={styles.summaryDetail}>
                📅 Applied: {formatDate(secondaryCandidate.createdAt)}
              </span>
              <Badge variant={STATUS_COLORS[secondaryCandidate.status] as any}>
                {secondaryCandidate.status.replace(/_/g, ' ')}
              </Badge>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div style={styles.infoBox}>
          <strong>How it works:</strong> Click on values below to select which data to keep. 
          The "Result" column shows what the merged record will look like.
          Fields marked with "Combine" will merge both values together.
        </div>

        {/* Quick Actions */}
        <div style={styles.quickActions}>
          <Button variant="outline" size="sm" onClick={selectAllPrimary}>
            Keep All Primary
          </Button>
          <Button variant="outline" size="sm" onClick={selectAllSecondary}>
            Use All Secondary
          </Button>
          <Button variant="outline" size="sm" onClick={smartSelect}>
            ✨ Smart Select
          </Button>
        </div>

        {/* Confirmation Warning */}
        {showConfirmation && (
          <div style={styles.warningBox}>
            <span>⚠️</span>
            <span>
              You are about to merge {changesFromPrimary} field(s) from the secondary record
              {deleteSecondary && ' and delete the secondary record'}. This action cannot be undone.
            </span>
          </div>
        )}

        {/* Field Comparison Table */}
        <div style={styles.header}>
          <span style={styles.headerLabel}>Field</span>
          <span style={styles.headerPrimary}>🔵 Primary</span>
          <span style={styles.headerSecondary}>🟡 Secondary</span>
          <span style={styles.headerResult}>🟢 Result</span>
        </div>

        {MERGEABLE_FIELDS.map(({ key, label, canCombine, important }) => {
          const primaryValue = getFieldValue(primaryCandidate, key)
          const secondaryValue = getFieldValue(secondaryCandidate, key)
          const resultValue = getResultValue(key)
          const selection = selections[key]
          const isDifferent = primaryValue !== secondaryValue && primaryValue && secondaryValue
          
          return (
            <div 
              key={key} 
              style={{ 
                ...styles.row, 
                ...(isDifferent ? styles.rowHighlight : {}) 
              }}
            >
              <div style={styles.fieldLabelContainer}>
                <span style={styles.fieldLabel}>
                  {label}
                  {important && <span style={{ color: '#ef4444' }}> *</span>}
                </span>
                {canCombine && primaryValue && secondaryValue && isDifferent && (
                  <div style={styles.fieldActions}>
                    <button
                      type="button"
                      style={{
                        ...styles.combineButton,
                        ...(selection === 'combined' ? { background: '#8b5cf6', color: 'white' } : {}),
                      }}
                      onClick={() => selectField(key, 'combined')}
                    >
                      {selection === 'combined' ? '✓ Combined' : 'Combine'}
                    </button>
                  </div>
                )}
              </div>
              
              <div
                style={{
                  ...styles.fieldValue,
                  ...(selection === 'primary' ? styles.fieldValueSelected : {}),
                  ...(primaryValue ? {} : styles.emptyValue),
                }}
                onClick={() => selectField(key, 'primary')}
              >
                {primaryValue || '(empty)'}
              </div>
              
              <div
                style={{
                  ...styles.fieldValue,
                  ...(selection === 'secondary' ? styles.fieldValueSelected : {}),
                  ...(secondaryValue ? {} : styles.emptyValue),
                }}
                onClick={() => selectField(key, 'secondary')}
              >
                {secondaryValue || '(empty)'}
              </div>
              
              <div 
                style={{ 
                  ...styles.resultValue, 
                  ...(selection === 'combined' ? styles.resultValueCombined : {}),
                  ...(resultValue ? {} : styles.emptyValue),
                }}
              >
                {selection === 'combined' ? (
                  <span title={resultValue}>
                    ✨ Combined ({
                      key === 'skills' || key === 'qualifications' 
                        ? `${resultValue.split(', ').length} items`
                        : 'merged'
                    })
                  </span>
                ) : (
                  resultValue || '(empty)'
                )}
              </div>
            </div>
          )
        })}

        {/* Footer */}
        <div style={styles.footer}>
          <div style={styles.footerOptions}>
            <div style={styles.deleteOption}>
              <Checkbox
                id="delete-secondary"
                checked={deleteSecondary}
                onChange={(e) => setDeleteSecondary(e.target.checked)}
              />
              <label htmlFor="delete-secondary" style={{ fontSize: '13px', color: '#374151' }}>
                Delete secondary record after merge
              </label>
            </div>
            {changesFromPrimary > 0 && (
              <span style={{ fontSize: '12px', color: '#6b7280' }}>
                📝 {changesFromPrimary} field(s) will be updated from secondary
              </span>
            )}
          </div>
          
          <div style={styles.actions}>
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            {showConfirmation ? (
              <>
                <Button variant="secondary" onClick={() => setShowConfirmation(false)} disabled={loading}>
                  ← Back
                </Button>
                <Button variant="primary" onClick={handleConfirmMerge} disabled={loading}>
                  {loading ? 'Merging...' : '✓ Confirm Merge'}
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={handleMergeClick} disabled={loading}>
                {loading ? 'Merging...' : 'Preview & Merge'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default MergeRecordsModal

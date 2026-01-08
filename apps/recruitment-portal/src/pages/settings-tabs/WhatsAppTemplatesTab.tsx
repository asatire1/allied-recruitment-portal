// ============================================================================
// WhatsApp Templates Tab - Extracted from Settings.tsx
// Location: apps/recruitment-portal/src/pages/settings/WhatsAppTemplatesTab.tsx
// ============================================================================

import { useEffect, useState } from 'react'
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { getFirebaseDb, PLACEHOLDER_DEFINITIONS } from '@allied/shared-lib'
import { Card, Button, Input, Spinner, Modal, Select, Textarea } from '@allied/shared-ui'

// ============================================================================
// TYPES
// ============================================================================

type TemplateCategory = 'interview' | 'trial' | 'offer' | 'rejection' | 'reminder' | 'general'

interface WhatsAppTemplate {
  id: string
  name: string
  category: TemplateCategory
  content: string
  placeholders: string[]
  active: boolean
  createdAt: any
  updatedAt: any
  createdBy?: string
}

interface WhatsAppTemplatesTabProps {
  userId?: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TEMPLATE_CATEGORIES = [
  { value: 'interview', label: 'Interview', color: '#3b82f6' },
  { value: 'trial', label: 'Trial', color: '#8b5cf6' },
  { value: 'offer', label: 'Offer', color: '#10b981' },
  { value: 'rejection', label: 'Rejection', color: '#ef4444' },
  { value: 'reminder', label: 'Reminder', color: '#f59e0b' },
  { value: 'general', label: 'General', color: '#6b7280' },
]

// Available placeholders for WhatsApp templates
const AVAILABLE_PLACEHOLDERS = PLACEHOLDER_DEFINITIONS.map(p => ({
  key: p.key,
  label: p.label,
  description: p.description
}))

// Default templates for seeding
const DEFAULT_TEMPLATES: Omit<WhatsAppTemplate, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>[] = [
  {
    name: 'Interview Invitation',
    category: 'interview',
    content: `Hi {{firstName}},

Thank you for applying for the {{jobTitle}} position at Allied Pharmacies.

We'd like to invite you for an interview. Please book your preferred slot using this link:
{{interviewBookingLink}}

We look forward to meeting you!

Best regards,
Allied Pharmacies Recruitment`,
    placeholders: ['firstName', 'jobTitle', 'interviewBookingLink'],
    active: true,
  },
  {
    name: 'Interview Reminder',
    category: 'reminder',
    content: `Hi {{firstName}},

This is a friendly reminder about your interview tomorrow for the {{jobTitle}} position.

📅 Date: {{interviewDate}}
⏰ Time: {{interviewTime}}
📍 Location: {{branchAddress}}

Please arrive 10 minutes early. If you need to reschedule, please let us know as soon as possible.

See you soon!`,
    placeholders: ['firstName', 'jobTitle', 'interviewDate', 'interviewTime', 'branchAddress'],
    active: true,
  },
  {
    name: 'Trial Shift Invitation',
    category: 'trial',
    content: `Hi {{firstName}},

Congratulations! Following your successful interview, we'd like to invite you for a trial shift at {{branchName}}.

Please book your trial slot here:
{{interviewBookingLink}}

What to bring:
• Proof of right to work
• Smart business attire
• Any relevant certificates

Looking forward to seeing you!

Best regards,
Allied Pharmacies`,
    placeholders: ['firstName', 'branchName', 'interviewBookingLink'],
    active: true,
  },
  {
    name: 'Trial Shift Reminder',
    category: 'reminder',
    content: `Hi {{firstName}},

Just a reminder about your trial shift tomorrow at {{branchName}}.

📅 Date: {{interviewDate}}
⏰ Time: {{interviewTime}}
📍 Location: {{branchAddress}}

Please arrive 10 minutes early and report to the branch manager.

Good luck!`,
    placeholders: ['firstName', 'branchName', 'interviewDate', 'interviewTime', 'branchAddress'],
    active: true,
  },
  {
    name: 'Job Offer',
    category: 'offer',
    content: `Hi {{firstName}},

Fantastic news! 🎉

We are delighted to offer you the position of {{jobTitle}} at {{branchName}}.

Please contact us to discuss the next steps.

Welcome to the team!

Best regards,
Allied Pharmacies`,
    placeholders: ['firstName', 'jobTitle', 'branchName'],
    active: true,
  },
]

// ============================================================================
// COMPONENT
// ============================================================================

export function WhatsAppTemplatesTab({ userId }: WhatsAppTemplatesTabProps) {
  const db = getFirebaseDb()

  // State
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplate | null>(null)
  const [templateForm, setTemplateForm] = useState({
    name: '',
    category: 'general' as TemplateCategory,
    content: ''
  })
  const [templateFormError, setTemplateFormError] = useState('')
  const [showDeleteTemplateModal, setShowDeleteTemplateModal] = useState(false)
  const [deletingTemplate, setDeletingTemplate] = useState<WhatsAppTemplate | null>(null)
  const [deletingTemplateLoading, setDeletingTemplateLoading] = useState(false)
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<TemplateCategory | 'all'>('all')
  const [showPlaceholderHelp, setShowPlaceholderHelp] = useState(false)
  const [templateSearch, setTemplateSearch] = useState('')
  const [previewingTemplate, setPreviewingTemplate] = useState<WhatsAppTemplate | null>(null)

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  useEffect(() => {
    async function fetchTemplates() {
      try {
        setLoadingTemplates(true)
        const templatesRef = collection(db, 'whatsappTemplates')
        const snapshot = await getDocs(templatesRef)

        if (snapshot.empty) {
          console.log('No templates found, initializing defaults...')
          await initializeDefaultTemplates()
        } else {
          const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as WhatsAppTemplate[]

          // Sort by category then name
          data.sort((a, b) => {
            if (a.category !== b.category) return a.category.localeCompare(b.category)
            return a.name.localeCompare(b.name)
          })
          setTemplates(data)
        }
      } catch (err) {
        console.error('Error fetching templates:', err)
      } finally {
        setLoadingTemplates(false)
      }
    }

    fetchTemplates()
  }, [db])

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  // Extract placeholders from template content
  const extractPlaceholders = (content: string): string[] => {
    const matches = content.match(/\{\{(\w+)\}\}/g) || []
    return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))]
  }

  // Highlight placeholders in template content for preview
  const highlightPlaceholders = (content: string): React.ReactNode => {
    const parts = content.split(/(\{\{[^}]+\}\})/g)
    return parts.map((part, index) => {
      if (part.match(/^\{\{[^}]+\}\}$/)) {
        return (
          <span key={index} className="placeholder-highlight">
            {part}
          </span>
        )
      }
      return part
    })
  }

  // Filter templates by category and search
  const filteredTemplates = templates.filter(t => {
    const matchesCategory = templateCategoryFilter === 'all' || t.category === templateCategoryFilter
    const matchesSearch = !templateSearch ||
      t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
      t.content.toLowerCase().includes(templateSearch.toLowerCase())
    return matchesCategory && matchesSearch
  })

  // ============================================================================
  // HANDLERS
  // ============================================================================

  // Initialize default WhatsApp templates
  const initializeDefaultTemplates = async () => {
    try {
      const templatesRef = collection(db, 'whatsappTemplates')
      const newTemplates: WhatsAppTemplate[] = []

      for (const defaultTemplate of DEFAULT_TEMPLATES) {
        const docRef = await addDoc(templatesRef, {
          ...defaultTemplate,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: userId || 'system',
        })
        newTemplates.push({
          id: docRef.id,
          ...defaultTemplate,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: userId || 'system',
        })
      }

      newTemplates.sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category)
        return a.name.localeCompare(b.name)
      })
      setTemplates(newTemplates)
    } catch (err) {
      console.error('Error initializing default templates:', err)
    }
  }

  const handleAddTemplate = () => {
    setEditingTemplate(null)
    setTemplateForm({ name: '', category: 'general', content: '' })
    setTemplateFormError('')
    setShowTemplateModal(true)
  }

  const handleEditTemplate = (template: WhatsAppTemplate) => {
    setEditingTemplate(template)
    setTemplateForm({
      name: template.name,
      category: template.category,
      content: template.content
    })
    setTemplateFormError('')
    setShowTemplateModal(true)
  }

  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim()) {
      setTemplateFormError('Template name is required')
      return
    }
    if (!templateForm.content.trim()) {
      setTemplateFormError('Template content is required')
      return
    }

    // Check for duplicates
    const duplicate = templates.find(
      t => t.name.toLowerCase() === templateForm.name.trim().toLowerCase() &&
           t.id !== editingTemplate?.id
    )
    if (duplicate) {
      setTemplateFormError('A template with this name already exists')
      return
    }

    try {
      setSavingTemplate(true)
      const templatesRef = collection(db, 'whatsappTemplates')
      const placeholders = extractPlaceholders(templateForm.content)

      if (editingTemplate) {
        await updateDoc(doc(db, 'whatsappTemplates', editingTemplate.id), {
          name: templateForm.name.trim(),
          category: templateForm.category,
          content: templateForm.content.trim(),
          placeholders,
          updatedAt: serverTimestamp(),
        })
        setTemplates(prev => prev.map(t =>
          t.id === editingTemplate.id
            ? {
                ...t,
                name: templateForm.name.trim(),
                category: templateForm.category,
                content: templateForm.content.trim(),
                placeholders,
                updatedAt: new Date(),
              }
            : t
        ).sort((a, b) => {
          if (a.category !== b.category) return a.category.localeCompare(b.category)
          return a.name.localeCompare(b.name)
        }))
      } else {
        const docRef = await addDoc(templatesRef, {
          name: templateForm.name.trim(),
          category: templateForm.category,
          content: templateForm.content.trim(),
          placeholders,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: userId || 'system',
        })
        setTemplates(prev => [...prev, {
          id: docRef.id,
          name: templateForm.name.trim(),
          category: templateForm.category,
          content: templateForm.content.trim(),
          placeholders,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: userId || 'system',
        }].sort((a, b) => {
          if (a.category !== b.category) return a.category.localeCompare(b.category)
          return a.name.localeCompare(b.name)
        }))
      }

      setShowTemplateModal(false)
    } catch (err) {
      console.error('Error saving template:', err)
      setTemplateFormError('Failed to save. Please try again.')
    } finally {
      setSavingTemplate(false)
    }
  }

  const handleToggleTemplateActive = async (template: WhatsAppTemplate) => {
    try {
      await updateDoc(doc(db, 'whatsappTemplates', template.id), {
        active: !template.active,
        updatedAt: serverTimestamp(),
      })
      setTemplates(prev => prev.map(t =>
        t.id === template.id ? { ...t, active: !t.active } : t
      ))
    } catch (err) {
      console.error('Error toggling template:', err)
    }
  }

  const handleConfirmDeleteTemplate = (template: WhatsAppTemplate) => {
    setDeletingTemplate(template)
    setShowDeleteTemplateModal(true)
  }

  const handleDeleteTemplate = async () => {
    if (!deletingTemplate) return

    try {
      setDeletingTemplateLoading(true)
      await deleteDoc(doc(db, 'whatsappTemplates', deletingTemplate.id))
      setTemplates(prev => prev.filter(t => t.id !== deletingTemplate.id))
      setShowDeleteTemplateModal(false)
      setDeletingTemplate(null)
    } catch (err) {
      console.error('Error deleting template:', err)
    } finally {
      setDeletingTemplateLoading(false)
    }
  }

  const handleInsertPlaceholder = (placeholder: string) => {
    setTemplateForm(prev => ({
      ...prev,
      content: prev.content + placeholder
    }))
  }

  const handleDuplicateTemplate = (template: WhatsAppTemplate) => {
    setEditingTemplate(null)
    setTemplateForm({
      name: `${template.name} (Copy)`,
      category: template.category,
      content: template.content
    })
    setTemplateFormError('')
    setShowTemplateModal(true)
  }

  const handlePreviewTemplate = (template: WhatsAppTemplate) => {
    setPreviewingTemplate(template)
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <>
      <div className="settings-section">
        <div className="settings-section-header">
          <div>
            <h2>WhatsApp Templates</h2>
            <p>Manage message templates for candidate communication</p>
          </div>
          <Button variant="primary" onClick={handleAddTemplate}>
            + New Template
          </Button>
        </div>

        {loadingTemplates ? (
          <div className="settings-loading">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            {/* Search and filter bar */}
            <div className="template-toolbar">
              <div className="template-search">
                <Input
                  placeholder="Search templates..."
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                />
              </div>
              <div className="template-category-tabs">
                <button
                  className={`category-filter-btn ${templateCategoryFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setTemplateCategoryFilter('all')}
                >
                  All ({templates.length})
                </button>
                {TEMPLATE_CATEGORIES.map(cat => {
                  const count = templates.filter(t => t.category === cat.value).length
                  if (count === 0) return null
                  return (
                    <button
                      key={cat.value}
                      className={`category-filter-btn ${templateCategoryFilter === cat.value ? 'active' : ''}`}
                      onClick={() => setTemplateCategoryFilter(cat.value as TemplateCategory)}
                      style={{ '--cat-color': cat.color } as React.CSSProperties}
                    >
                      {cat.label} ({count})
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Templates list */}
            <div className="templates-list">
              {filteredTemplates.length === 0 ? (
                <Card className="empty-templates">
                  <p>
                    {templates.length === 0
                      ? 'No templates yet. Create your first template.'
                      : templateSearch
                      ? 'No templates match your search.'
                      : 'No templates in this category.'
                    }
                  </p>
                </Card>
              ) : (
                filteredTemplates.map(template => {
                  const category = TEMPLATE_CATEGORIES.find(c => c.value === template.category)
                  return (
                    <Card key={template.id} className={`template-card ${!template.active ? 'inactive' : ''}`}>
                      <div className="template-header">
                        <div className="template-title-row">
                          <span
                            className="template-category-badge"
                            style={{ backgroundColor: `${category?.color}20`, color: category?.color }}
                          >
                            {category?.label}
                          </span>
                          <h3 className="template-name">{template.name}</h3>
                          {!template.active && <span className="inactive-badge">Inactive</span>}
                        </div>
                        <div className="template-actions">
                          <button
                            className="preview-btn"
                            onClick={() => handlePreviewTemplate(template)}
                            title="Preview"
                          >
                            👁
                          </button>
                          <button
                            className="duplicate-btn"
                            onClick={() => handleDuplicateTemplate(template)}
                            title="Duplicate"
                          >
                            ⧉
                          </button>
                          <button
                            className={`toggle-btn ${template.active ? 'active' : ''}`}
                            onClick={() => handleToggleTemplateActive(template)}
                            title={template.active ? 'Deactivate' : 'Activate'}
                          >
                            {template.active ? '✓' : '○'}
                          </button>
                          <button
                            className="edit-btn"
                            onClick={() => handleEditTemplate(template)}
                            title="Edit"
                          >
                            ✎
                          </button>
                          <button
                            className="delete-btn"
                            onClick={() => handleConfirmDeleteTemplate(template)}
                            title="Delete"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      <div
                        className="template-content-preview"
                        onClick={() => handlePreviewTemplate(template)}
                      >
                        {template.content.length > 200
                          ? template.content.substring(0, 200) + '...'
                          : template.content
                        }
                      </div>
                      {template.placeholders.length > 0 && (
                        <div className="template-placeholders">
                          {template.placeholders.map(p => (
                            <span key={p} className="placeholder-tag">{`{{${p}}}`}</span>
                          ))}
                        </div>
                      )}
                    </Card>
                  )
                })
              )}
            </div>

            {/* Summary */}
            {templates.length > 0 && (
              <div className="templates-summary">
                {filteredTemplates.length === templates.length
                  ? `${templates.length} template${templates.length !== 1 ? 's' : ''}`
                  : `Showing ${filteredTemplates.length} of ${templates.length} templates`
                } • {templates.filter(t => t.active).length} active
              </div>
            )}
          </>
        )}
      </div>

      {/* Add/Edit Template Modal */}
      <Modal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        title={editingTemplate ? 'Edit Template' : 'New Template'}
        size="lg"
      >
        <div className="template-form">
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>Template Name *</label>
              <Input
                value={templateForm.name}
                onChange={(e) => {
                  setTemplateForm(prev => ({ ...prev, name: e.target.value }))
                  setTemplateFormError('')
                }}
                placeholder="e.g., Interview Invitation"
                autoFocus
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Category *</label>
              <Select
                value={templateForm.category}
                onChange={(e) => setTemplateForm(prev => ({
                  ...prev,
                  category: e.target.value as TemplateCategory
                }))}
                options={TEMPLATE_CATEGORIES.map(c => ({ value: c.value, label: c.label }))}
              />
            </div>
          </div>

          <div className="form-group">
            <div className="template-content-header">
              <label>Message Content *</label>
              <button
                type="button"
                className="placeholder-help-btn"
                onClick={() => setShowPlaceholderHelp(!showPlaceholderHelp)}
              >
                {showPlaceholderHelp ? 'Hide placeholders' : 'Show placeholders'}
              </button>
            </div>
            
            {showPlaceholderHelp && (
              <div className="placeholder-help-panel">
                <p className="placeholder-help-intro">Click a placeholder to insert it into your message:</p>
                <div className="placeholder-buttons">
                  {AVAILABLE_PLACEHOLDERS.map(p => (
                    <button
                      key={p.key}
                      type="button"
                      className="placeholder-insert-btn"
                      onClick={() => handleInsertPlaceholder(p.key)}
                      title={p.description}
                    >
                      {p.key}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Textarea
              value={templateForm.content}
              onChange={(e) => {
                setTemplateForm(prev => ({ ...prev, content: e.target.value }))
                setTemplateFormError('')
              }}
              placeholder="Write your message here. Use {{placeholders}} for dynamic content..."
              rows={10}
            />
            
            {templateForm.content && (
              <div className="detected-placeholders">
                <span className="detected-label">Detected placeholders:</span>
                {extractPlaceholders(templateForm.content).length > 0 ? (
                  extractPlaceholders(templateForm.content).map(p => (
                    <span key={p} className="placeholder-tag">{`{{${p}}}`}</span>
                  ))
                ) : (
                  <span className="no-placeholders">None</span>
                )}
              </div>
            )}
          </div>

          {templateFormError && (
            <p className="form-error">{templateFormError}</p>
          )}

          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setShowTemplateModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveTemplate} disabled={savingTemplate}>
              {savingTemplate ? 'Saving...' : editingTemplate ? 'Update Template' : 'Create Template'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Template Modal */}
      <Modal
        isOpen={showDeleteTemplateModal}
        onClose={() => setShowDeleteTemplateModal(false)}
        title="Delete Template"
        size="sm"
      >
        <div className="delete-confirmation">
          <p>Are you sure you want to delete <strong>"{deletingTemplate?.name}"</strong>?</p>
          <p className="delete-warning">
            This action cannot be undone. This template will no longer be available for sending messages.
          </p>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setShowDeleteTemplateModal(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteTemplate}
              disabled={deletingTemplateLoading}
            >
              {deletingTemplateLoading ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Template Preview Modal */}
      <Modal
        isOpen={!!previewingTemplate}
        onClose={() => setPreviewingTemplate(null)}
        title="Template Preview"
        size="md"
      >
        {previewingTemplate && (
          <div className="template-preview-modal">
            <div className="preview-header">
              <span
                className="template-category-badge"
                style={{
                  backgroundColor: `${TEMPLATE_CATEGORIES.find(c => c.value === previewingTemplate.category)?.color}20`,
                  color: TEMPLATE_CATEGORIES.find(c => c.value === previewingTemplate.category)?.color
                }}
              >
                {TEMPLATE_CATEGORIES.find(c => c.value === previewingTemplate.category)?.label}
              </span>
              <h3>{previewingTemplate.name}</h3>
              {!previewingTemplate.active && <span className="inactive-badge">Inactive</span>}
            </div>
            
            <div className="preview-content">
              <div className="preview-message">
                {highlightPlaceholders(previewingTemplate.content)}
              </div>
            </div>

            {previewingTemplate.placeholders.length > 0 && (
              <div className="preview-placeholders">
                <span className="preview-placeholders-label">Placeholders used:</span>
                <div className="preview-placeholders-list">
                  {previewingTemplate.placeholders.map(p => {
                    const placeholder = AVAILABLE_PLACEHOLDERS.find(ap => ap.key === `{{${p}}}`)
                    return (
                      <div key={p} className="preview-placeholder-item">
                        <span className="placeholder-tag">{`{{${p}}}`}</span>
                        <span className="placeholder-description">{placeholder?.description || 'Custom placeholder'}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setPreviewingTemplate(null)}>
                Close
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  handleDuplicateTemplate(previewingTemplate)
                  setPreviewingTemplate(null)
                }}
              >
                Duplicate
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  handleEditTemplate(previewingTemplate)
                  setPreviewingTemplate(null)
                }}
              >
                Edit Template
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

export default WhatsAppTemplatesTab

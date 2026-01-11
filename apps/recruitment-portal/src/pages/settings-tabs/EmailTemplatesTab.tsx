// ============================================================================
// Email Templates Tab - Manage email templates for candidate communication
// ============================================================================

import { useEffect, useState } from 'react'
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { getFirebaseDb, PLACEHOLDER_DEFINITIONS } from '@allied/shared-lib'
import { Card, Button, Input, Spinner, Modal, Select, Textarea } from '@allied/shared-ui'

// ============================================================================
// TYPES
// ============================================================================

type TemplateCategory = 'interview' | 'trial' | 'offer' | 'rejection' | 'reminder' | 'general'

interface EmailTemplate {
  id: string
  name: string
  category: TemplateCategory
  subject: string
  content: string
  placeholders: string[]
  active: boolean
  createdAt: any
  updatedAt: any
  createdBy?: string
}

interface EmailTemplatesTabProps {
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

// Available placeholders for Email templates
const AVAILABLE_PLACEHOLDERS = PLACEHOLDER_DEFINITIONS.map(p => ({
  key: p.key,
  label: p.label,
  description: p.description
}))

// Default templates for seeding
const DEFAULT_TEMPLATES: Omit<EmailTemplate, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>[] = [
  {
    name: 'Interview Invitation',
    category: 'interview',
    subject: 'Interview Invitation - {{jobTitle}} at Allied Pharmacies',
    content: `Dear {{firstName}},

Thank you for applying for the {{jobTitle}} position at Allied Pharmacies.

We are pleased to invite you for an interview. Please book your preferred slot using the link below:

{{interviewBookingLink}}

We look forward to meeting you!

Best regards,
Allied Pharmacies Recruitment Team`,
    placeholders: ['firstName', 'jobTitle', 'interviewBookingLink'],
    active: true,
  },
  {
    name: 'Interview Reminder',
    category: 'reminder',
    subject: 'Interview Reminder - Tomorrow at {{interviewTime}}',
    content: `Dear {{firstName}},

This is a friendly reminder about your interview tomorrow for the {{jobTitle}} position.

📅 Date: {{interviewDate}}
⏰ Time: {{interviewTime}}
📍 Location: {{branchAddress}}

Please arrive 10 minutes early. If you need to reschedule, please reply to this email as soon as possible.

We look forward to meeting you!

Best regards,
Allied Pharmacies Recruitment Team`,
    placeholders: ['firstName', 'jobTitle', 'interviewDate', 'interviewTime', 'branchAddress'],
    active: true,
  },
  {
    name: 'Trial Shift Invitation',
    category: 'trial',
    subject: 'Trial Shift Invitation - {{jobTitle}} at {{branchName}}',
    content: `Dear {{firstName}},

Congratulations! Following your successful interview, we are pleased to invite you for a trial shift at {{branchName}}.

Please book your trial slot using the link below:

{{interviewBookingLink}}

What to bring:
• Proof of right to work in the UK
• Smart business attire
• Any relevant certificates or qualifications

We look forward to seeing you!

Best regards,
Allied Pharmacies Recruitment Team`,
    placeholders: ['firstName', 'branchName', 'interviewBookingLink'],
    active: true,
  },
  {
    name: 'Trial Shift Reminder',
    category: 'reminder',
    subject: 'Trial Shift Reminder - Tomorrow at {{branchName}}',
    content: `Dear {{firstName}},

This is a reminder about your trial shift tomorrow at {{branchName}}.

📅 Date: {{interviewDate}}
⏰ Time: {{interviewTime}}
📍 Location: {{branchAddress}}

Please arrive 10 minutes early and report to the branch manager.

Good luck!

Best regards,
Allied Pharmacies`,
    placeholders: ['firstName', 'branchName', 'interviewDate', 'interviewTime', 'branchAddress'],
    active: true,
  },
  {
    name: 'Job Offer',
    category: 'offer',
    subject: 'Job Offer - {{jobTitle}} at Allied Pharmacies',
    content: `Dear {{firstName}},

We are delighted to offer you the position of {{jobTitle}} at {{branchName}}.

We were impressed with your interview and trial, and we believe you will be a valuable addition to our team.

Please contact us at your earliest convenience to discuss the next steps, including your start date and any required documentation.

Welcome to the Allied Pharmacies team!

Best regards,
Allied Pharmacies Recruitment Team`,
    placeholders: ['firstName', 'jobTitle', 'branchName'],
    active: true,
  },
  {
    name: 'Application Unsuccessful',
    category: 'rejection',
    subject: 'Your Application - {{jobTitle}} at Allied Pharmacies',
    content: `Dear {{firstName}},

Thank you for taking the time to apply for the {{jobTitle}} position at Allied Pharmacies.

After careful consideration, we regret to inform you that we will not be progressing with your application at this time.

We appreciate your interest in joining our team and encourage you to apply for future opportunities that match your skills and experience.

We wish you all the best in your job search.

Kind regards,
Allied Pharmacies Recruitment Team`,
    placeholders: ['firstName', 'jobTitle'],
    active: true,
  },
]

// ============================================================================
// COMPONENT
// ============================================================================

export function EmailTemplatesTab({ userId }: EmailTemplatesTabProps) {
  const db = getFirebaseDb()

  // State
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null)
  const [templateForm, setTemplateForm] = useState({
    name: '',
    category: 'general' as TemplateCategory,
    subject: '',
    content: ''
  })
  const [templateFormError, setTemplateFormError] = useState('')
  const [showDeleteTemplateModal, setShowDeleteTemplateModal] = useState(false)
  const [deletingTemplate, setDeletingTemplate] = useState<EmailTemplate | null>(null)
  const [deletingTemplateLoading, setDeletingTemplateLoading] = useState(false)
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<TemplateCategory | 'all'>('all')
  const [showPlaceholderHelp, setShowPlaceholderHelp] = useState(false)
  const [templateSearch, setTemplateSearch] = useState('')

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  useEffect(() => {
    fetchTemplates()
  }, [])

  async function fetchTemplates() {
    try {
      setLoadingTemplates(true)
      const templatesRef = collection(db, 'emailTemplates')
      const snapshot = await getDocs(templatesRef)

      if (snapshot.empty) {
        console.log('No email templates found, initializing defaults...')
        await initializeDefaultTemplates()
      } else {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as EmailTemplate[]

        // Sort by category then name
        data.sort((a, b) => {
          if (a.category !== b.category) return a.category.localeCompare(b.category)
          return a.name.localeCompare(b.name)
        })
        setTemplates(data)
      }
    } catch (error) {
      console.error('Error fetching email templates:', error)
    } finally {
      setLoadingTemplates(false)
    }
  }

  async function initializeDefaultTemplates() {
    try {
      const templatesRef = collection(db, 'emailTemplates')
      const newTemplates: EmailTemplate[] = []

      for (const template of DEFAULT_TEMPLATES) {
        const docRef = await addDoc(templatesRef, {
          ...template,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: userId || 'system'
        })
        newTemplates.push({
          id: docRef.id,
          ...template,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: userId || 'system'
        })
      }

      setTemplates(newTemplates)
    } catch (error) {
      console.error('Error initializing default templates:', error)
    }
  }

  // ============================================================================
  // TEMPLATE CRUD
  // ============================================================================

  const openAddTemplateModal = () => {
    setEditingTemplate(null)
    setTemplateForm({ name: '', category: 'general', subject: '', content: '' })
    setTemplateFormError('')
    setShowTemplateModal(true)
  }

  const openEditTemplateModal = (template: EmailTemplate) => {
    setEditingTemplate(template)
    setTemplateForm({
      name: template.name,
      category: template.category,
      subject: template.subject || '',
      content: template.content
    })
    setTemplateFormError('')
    setShowTemplateModal(true)
  }

  const closeTemplateModal = () => {
    setShowTemplateModal(false)
    setEditingTemplate(null)
    setTemplateFormError('')
  }

  // Extract placeholders from content
  const extractPlaceholders = (text: string): string[] => {
    const matches = text.match(/\{\{([^}]+)\}\}/g) || []
    return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))]
  }

  const saveTemplate = async () => {
    if (!templateForm.name.trim()) {
      setTemplateFormError('Template name is required')
      return
    }
    if (!templateForm.subject.trim()) {
      setTemplateFormError('Subject line is required')
      return
    }
    if (!templateForm.content.trim()) {
      setTemplateFormError('Template content is required')
      return
    }

    setSavingTemplate(true)
    setTemplateFormError('')

    try {
      const placeholders = extractPlaceholders(templateForm.content + ' ' + templateForm.subject)

      if (editingTemplate) {
        // Update existing template
        await updateDoc(doc(db, 'emailTemplates', editingTemplate.id), {
          name: templateForm.name.trim(),
          category: templateForm.category,
          subject: templateForm.subject.trim(),
          content: templateForm.content.trim(),
          placeholders,
          updatedAt: serverTimestamp()
        })

        setTemplates(prev => prev.map(t =>
          t.id === editingTemplate.id
            ? {
                ...t,
                name: templateForm.name.trim(),
                category: templateForm.category,
                subject: templateForm.subject.trim(),
                content: templateForm.content.trim(),
                placeholders
              }
            : t
        ))
      } else {
        // Create new template
        const docRef = await addDoc(collection(db, 'emailTemplates'), {
          name: templateForm.name.trim(),
          category: templateForm.category,
          subject: templateForm.subject.trim(),
          content: templateForm.content.trim(),
          placeholders,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: userId || 'system'
        })

        setTemplates(prev => [...prev, {
          id: docRef.id,
          name: templateForm.name.trim(),
          category: templateForm.category,
          subject: templateForm.subject.trim(),
          content: templateForm.content.trim(),
          placeholders,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: userId || 'system'
        }])
      }

      closeTemplateModal()
    } catch (error) {
      console.error('Error saving template:', error)
      setTemplateFormError('Failed to save template. Please try again.')
    } finally {
      setSavingTemplate(false)
    }
  }

  const confirmDeleteTemplate = (template: EmailTemplate) => {
    setDeletingTemplate(template)
    setShowDeleteTemplateModal(true)
  }

  const deleteTemplate = async () => {
    if (!deletingTemplate) return

    setDeletingTemplateLoading(true)
    try {
      await deleteDoc(doc(db, 'emailTemplates', deletingTemplate.id))
      setTemplates(prev => prev.filter(t => t.id !== deletingTemplate.id))
      setShowDeleteTemplateModal(false)
      setDeletingTemplate(null)
    } catch (error) {
      console.error('Error deleting template:', error)
    } finally {
      setDeletingTemplateLoading(false)
    }
  }

  const toggleTemplateActive = async (template: EmailTemplate) => {
    try {
      await updateDoc(doc(db, 'emailTemplates', template.id), {
        active: !template.active,
        updatedAt: serverTimestamp()
      })
      setTemplates(prev => prev.map(t =>
        t.id === template.id ? { ...t, active: !t.active } : t
      ))
    } catch (error) {
      console.error('Error toggling template:', error)
    }
  }

  // ============================================================================
  // FILTERED TEMPLATES
  // ============================================================================

  const filteredTemplates = templates.filter(t => {
    const matchesCategory = templateCategoryFilter === 'all' || t.category === templateCategoryFilter
    const matchesSearch = !templateSearch ||
      t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
      t.content.toLowerCase().includes(templateSearch.toLowerCase())
    return matchesCategory && matchesSearch
  })

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loadingTemplates) {
    return (
      <div className="settings-section">
        <div className="loading-state">
          <Spinner size="md" />
          <span>Loading email templates...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <div>
          <h2>Email Templates</h2>
          <p>Manage email templates for candidate communication</p>
        </div>
        <Button variant="primary" onClick={openAddTemplateModal}>
          + Add Template
        </Button>
      </div>

      {/* Filters */}
      <div className="settings-filters">
        <Input
          placeholder="Search templates..."
          value={templateSearch}
          onChange={(e) => setTemplateSearch(e.target.value)}
          className="search-input"
        />
        <Select
          value={templateCategoryFilter}
          onChange={(e) => setTemplateCategoryFilter(e.target.value as TemplateCategory | 'all')}
        >
          <option value="all">All Categories</option>
          {TEMPLATE_CATEGORIES.map(cat => (
            <option key={cat.value} value={cat.value}>{cat.label}</option>
          ))}
        </Select>
        <Button variant="outline" onClick={() => setShowPlaceholderHelp(true)}>
          📋 Placeholders
        </Button>
      </div>

      {/* Templates List */}
      <div className="templates-list">
        {filteredTemplates.length === 0 ? (
          <Card className="empty-state">
            <p>No email templates found. Add your first template!</p>
          </Card>
        ) : (
          filteredTemplates.map(template => {
            const categoryInfo = TEMPLATE_CATEGORIES.find(c => c.value === template.category)
            return (
              <Card key={template.id} className={`template-card ${!template.active ? 'inactive' : ''}`}>
                <div className="template-header">
                  <div className="template-info">
                    <span
                      className="template-category-badge"
                      style={{ backgroundColor: categoryInfo?.color || '#6b7280' }}
                    >
                      {categoryInfo?.label || template.category}
                    </span>
                    <h3>{template.name}</h3>
                    {!template.active && <span className="inactive-badge">Inactive</span>}
                  </div>
                  <div className="template-actions">
                    <Button variant="ghost" size="sm" onClick={() => toggleTemplateActive(template)}>
                      {template.active ? '🟢' : '⚪'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEditTemplateModal(template)}>
                      ✏️
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => confirmDeleteTemplate(template)}>
                      🗑️
                    </Button>
                  </div>
                </div>
                <div className="template-subject">
                  <strong>Subject:</strong> {template.subject}
                </div>
                <div className="template-preview">
                  {template.content.substring(0, 150)}
                  {template.content.length > 150 ? '...' : ''}
                </div>
                {template.placeholders?.length > 0 && (
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

      {/* Add/Edit Template Modal */}
      <Modal
        isOpen={showTemplateModal}
        onClose={closeTemplateModal}
        title={editingTemplate ? 'Edit Email Template' : 'Add Email Template'}
      >
        <div className="template-form">
          <div className="form-group">
            <label>Template Name *</label>
            <Input
              value={templateForm.name}
              onChange={(e) => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Interview Invitation"
            />
          </div>

          <div className="form-group">
            <label>Category *</label>
            <Select
              value={templateForm.category}
              onChange={(e) => setTemplateForm(prev => ({ ...prev, category: e.target.value as TemplateCategory }))}
            >
              {TEMPLATE_CATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </Select>
          </div>

          <div className="form-group">
            <label>Subject Line *</label>
            <Input
              value={templateForm.subject}
              onChange={(e) => setTemplateForm(prev => ({ ...prev, subject: e.target.value }))}
              placeholder="e.g., Interview Invitation - {{jobTitle}} at Allied Pharmacies"
            />
            <span className="form-hint">Use placeholders like {'{{firstName}}'} or {'{{jobTitle}}'}</span>
          </div>

          <div className="form-group">
            <label>Email Body *</label>
            <Textarea
              value={templateForm.content}
              onChange={(e) => setTemplateForm(prev => ({ ...prev, content: e.target.value }))}
              placeholder="Enter email content... Use {{placeholder}} for dynamic values"
              rows={10}
            />
          </div>

          {templateFormError && (
            <div className="form-error">{templateFormError}</div>
          )}

          <div className="modal-actions">
            <Button variant="outline" onClick={closeTemplateModal}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveTemplate} disabled={savingTemplate}>
              {savingTemplate ? 'Saving...' : editingTemplate ? 'Update Template' : 'Add Template'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteTemplateModal}
        onClose={() => setShowDeleteTemplateModal(false)}
        title="Delete Template"
      >
        <p>Are you sure you want to delete "{deletingTemplate?.name}"? This action cannot be undone.</p>
        <div className="modal-actions">
          <Button variant="outline" onClick={() => setShowDeleteTemplateModal(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={deleteTemplate} disabled={deletingTemplateLoading}>
            {deletingTemplateLoading ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </Modal>

      {/* Placeholder Help Modal */}
      <Modal
        isOpen={showPlaceholderHelp}
        onClose={() => setShowPlaceholderHelp(false)}
        title="Available Placeholders"
      >
        <div className="placeholder-help">
          <p>Use these placeholders in your templates. They will be replaced with actual values when sending emails:</p>
          <div className="placeholder-list">
            {AVAILABLE_PLACEHOLDERS.map(p => (
              <div key={p.key} className="placeholder-item">
                <code>{`{{${p.key}}}`}</code>
                <span>{p.description || p.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <Button variant="primary" onClick={() => setShowPlaceholderHelp(false)}>
            Close
          </Button>
        </div>
      </Modal>
    </div>
  )
}

export default EmailTemplatesTab

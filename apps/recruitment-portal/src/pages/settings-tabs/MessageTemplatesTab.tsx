// ============================================================================
// Message Templates Tab - Unified Template System
// Supports WhatsApp (plain text) and Email (HTML) from single collection
// Uses: messageTemplates collection (with fallback to whatsappTemplates)
// ============================================================================

import { useEffect, useState, useRef } from 'react'
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, serverTimestamp, query, orderBy } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { 
  getFirebaseDb, 
  getFirebaseFunctions,
  PLACEHOLDER_DEFINITIONS,
  DEFAULT_MESSAGE_TEMPLATES,
  DEFAULT_EMAIL_WRAPPER,
  type MessageTemplate,
  type TemplateCategory,
  type TemplateChannel,
  type TemplateType
} from '@allied/shared-lib'
import { Card, Button, Input, Spinner, Modal, Select, Textarea } from '@allied/shared-ui'

// ============================================================================
// TYPES
// ============================================================================

interface MessageTemplatesTabProps {
  userId?: string
}

type EditorMode = 'plain' | 'html' | 'preview'

// ============================================================================
// CONSTANTS
// ============================================================================

const TEMPLATE_CATEGORIES = [
  { value: 'interview', label: 'Interview', color: '#3b82f6' },
  { value: 'trial', label: 'Trial', color: '#8b5cf6' },
  { value: 'confirmation', label: 'Confirmation', color: '#10b981' },
  { value: 'reminder', label: 'Reminder', color: '#f59e0b' },
  { value: 'offer', label: 'Offer', color: '#10b981' },
  { value: 'rejection', label: 'Rejection', color: '#ef4444' },
  { value: 'feedback', label: 'Feedback', color: '#f97316' },
  { value: 'general', label: 'General', color: '#6b7280' },
]

const TEMPLATE_CHANNELS = [
  { value: 'whatsapp', label: '📱 WhatsApp Only', color: '#25D366' },
  { value: 'email', label: '📧 Email Only', color: '#3b82f6' },
  { value: 'both', label: '📱📧 Both', color: '#8b5cf6' },
]

const TEMPLATE_TYPES: { value: TemplateType; label: string }[] = [
  { value: 'interview_invitation', label: 'Interview Invitation' },
  { value: 'interview_confirmation', label: 'Interview Confirmation' },
  { value: 'interview_reminder', label: 'Interview Reminder' },
  { value: 'trial_invitation', label: 'Trial Invitation' },
  { value: 'trial_confirmation', label: 'Trial Confirmation' },
  { value: 'trial_reminder', label: 'Trial Reminder' },
  { value: 'job_offer', label: 'Job Offer' },
  { value: 'rejection', label: 'Rejection' },
  { value: 'feedback_request', label: 'Feedback Request' },
  { value: 'branch_notification', label: 'Branch Notification' },
  { value: 'custom', label: 'Custom' },
]

// Available placeholders for templates
const AVAILABLE_PLACEHOLDERS = PLACEHOLDER_DEFINITIONS.map(p => ({
  key: p.key,
  label: p.label,
  description: p.description
}))

// Sample data for preview
const SAMPLE_PREVIEW_DATA: Record<string, string> = {
  '{{firstName}}': 'John',
  '{{lastName}}': 'Smith',
  '{{fullName}}': 'John Smith',
  '{{email}}': 'john.smith@email.com',
  '{{phone}}': '07700 900123',
  '{{jobTitle}}': 'Pharmacist',
  '{{branchName}}': 'Manchester City Centre',
  '{{branchAddress}}': '123 High Street, Manchester, M1 1AA',
  '{{interviewBookingLink}}': 'https://allied-booking.web.app/book/abc123',
  '{{interviewDate}}': 'Wednesday, 15 January 2026',
  '{{interviewTime}}': '10:00 AM',
  '{{duration}}': '30 minutes',
  '{{confirmationCode}}': 'INT-ABC123',
  '{{teamsLink}}': 'https://teams.microsoft.com/l/meetup-join/...',
  '{{feedbackLink}}': 'https://allied-booking.web.app/feedback/xyz789',
  '{{companyName}}': 'Allied Pharmacies',
}

// ============================================================================
// COMPONENT
// ============================================================================

export function MessageTemplatesTab({ userId }: MessageTemplatesTabProps) {
  const db = getFirebaseDb()
  const functions = getFirebaseFunctions()

  // State
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null)
  const [templateForm, setTemplateForm] = useState({
    name: '',
    description: '',
    category: 'general' as TemplateCategory,
    templateType: 'custom' as TemplateType,
    channel: 'both' as TemplateChannel,
    subject: '',
    plainContent: '',
    htmlContent: ''
  })
  const [templateFormError, setTemplateFormError] = useState('')
  const [showDeleteTemplateModal, setShowDeleteTemplateModal] = useState(false)
  const [deletingTemplate, setDeletingTemplate] = useState<MessageTemplate | null>(null)
  const [deletingTemplateLoading, setDeletingTemplateLoading] = useState(false)
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<TemplateCategory | 'all'>('all')
  const [templateChannelFilter, setTemplateChannelFilter] = useState<TemplateChannel | 'all'>('all')
  const [showPlaceholderHelp, setShowPlaceholderHelp] = useState(false)
  const [templateSearch, setTemplateSearch] = useState('')
  const [previewingTemplate, setPreviewingTemplate] = useState<MessageTemplate | null>(null)
  const [editorMode, setEditorMode] = useState<EditorMode>('plain')
  const [showMigrationBanner, setShowMigrationBanner] = useState(false)
  const [migrating, setMigrating] = useState(false)
  
  const previewIframeRef = useRef<HTMLIFrameElement>(null)

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  useEffect(() => {
    fetchTemplates()
  }, [db])

  const fetchTemplates = async () => {
    try {
      setLoadingTemplates(true)
      
      // Try messageTemplates first (new collection)
      let templatesRef = collection(db, 'messageTemplates')
      let snapshot = await getDocs(query(templatesRef, orderBy('name')))
      
      // If empty, try whatsappTemplates (old collection) and show migration banner
      if (snapshot.empty) {
        templatesRef = collection(db, 'whatsappTemplates')
        snapshot = await getDocs(templatesRef)
        
        if (!snapshot.empty) {
          // Old templates exist - show migration banner
          setShowMigrationBanner(true)
        }
      }

      if (snapshot.empty) {
        console.log('No templates found, initializing defaults...')
        await initializeDefaultTemplates()
      } else {
        const data = snapshot.docs.map(doc => {
          const docData = doc.data()
          return {
            id: doc.id,
            ...docData,
            // Handle both old and new schema
            plainContent: docData.plainContent || docData.content || '',
            htmlContent: docData.htmlContent || '',
            channel: docData.channel || 'whatsapp',
            subject: docData.subject || '',
            templateType: docData.templateType || 'custom',
            isSystemTemplate: docData.isSystemTemplate || false,
            isDefault: docData.isDefault || false,
            version: docData.version || 1,
          }
        }) as MessageTemplate[]

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

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  // Extract placeholders from template content
  const extractPlaceholders = (content: string, subject?: string, htmlContent?: string): string[] => {
    const allContent = [subject, content, htmlContent].filter(Boolean).join(' ')
    const matches = allContent.match(/\{\{(\w+)\}\}/g) || []
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

  // Replace placeholders with sample data for preview
  const replacePlaceholdersForPreview = (content: string): string => {
    let result = content
    Object.entries(SAMPLE_PREVIEW_DATA).forEach(([placeholder, value]) => {
      result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value)
    })
    return result
  }

  // Generate full HTML email for preview
  const generateHtmlPreview = (template: { subject: string; htmlContent?: string; plainContent: string }): string => {
    const content = template.htmlContent || convertPlainToHtml(template.plainContent)
    const fullHtml = DEFAULT_EMAIL_WRAPPER
      .replace('{{subject}}', replacePlaceholdersForPreview(template.subject))
      .replace('{{content}}', replacePlaceholdersForPreview(content))
    return fullHtml
  }

  // Convert plain text to basic HTML
  const convertPlainToHtml = (plain: string): string => {
    const paragraphs = plain.split('\n\n')
    return `<div class="header">
  <h1>Message</h1>
</div>
<div class="content">
  ${paragraphs.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('\n  ')}
</div>`
  }

  // Filter templates by category, channel, and search
  const filteredTemplates = templates.filter(t => {
    const matchesCategory = templateCategoryFilter === 'all' || t.category === templateCategoryFilter
    const matchesChannel = templateChannelFilter === 'all' || 
      t.channel === templateChannelFilter || 
      t.channel === 'both'
    const matchesSearch = !templateSearch ||
      t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
      t.plainContent.toLowerCase().includes(templateSearch.toLowerCase())
    return matchesCategory && matchesChannel && matchesSearch
  })

  // ============================================================================
  // HANDLERS
  // ============================================================================

  // Initialize default templates
  const initializeDefaultTemplates = async () => {
    try {
      const templatesRef = collection(db, 'messageTemplates')
      const newTemplates: MessageTemplate[] = []

      for (const defaultTemplate of DEFAULT_MESSAGE_TEMPLATES) {
        const docRef = await addDoc(templatesRef, {
          ...defaultTemplate,
          version: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: userId || 'system',
        })
        newTemplates.push({
          id: docRef.id,
          ...defaultTemplate,
          version: 1,
          createdAt: new Date() as any,
          updatedAt: new Date() as any,
          createdBy: userId || 'system',
        } as MessageTemplate)
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

  // Run migration from whatsappTemplates to messageTemplates
  const handleRunMigration = async () => {
    try {
      setMigrating(true)
      const migrateTemplateFn = httpsCallable(functions, 'migrateMessageTemplates')
      const result = await migrateTemplateFn({})
      console.log('Migration result:', result)
      
      // Refresh templates
      await fetchTemplates()
      setShowMigrationBanner(false)
      alert('Migration complete! Your templates have been upgraded.')
    } catch (err) {
      console.error('Migration failed:', err)
      alert('Migration failed. Please try again or contact support.')
    } finally {
      setMigrating(false)
    }
  }

  const handleAddTemplate = () => {
    setEditingTemplate(null)
    setTemplateForm({ 
      name: '', 
      description: '',
      category: 'general', 
      templateType: 'custom',
      channel: 'both', 
      subject: '', 
      plainContent: '',
      htmlContent: ''
    })
    setTemplateFormError('')
    setEditorMode('plain')
    setShowTemplateModal(true)
  }

  const handleEditTemplate = (template: MessageTemplate) => {
    setEditingTemplate(template)
    setTemplateForm({
      name: template.name,
      description: template.description || '',
      category: template.category,
      templateType: template.templateType || 'custom',
      channel: template.channel,
      subject: template.subject || '',
      plainContent: template.plainContent || '',
      htmlContent: template.htmlContent || ''
    })
    setTemplateFormError('')
    setEditorMode(template.htmlContent ? 'html' : 'plain')
    setShowTemplateModal(true)
  }

  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim()) {
      setTemplateFormError('Template name is required')
      return
    }
    if (!templateForm.plainContent.trim()) {
      setTemplateFormError('Plain text content is required (used for WhatsApp)')
      return
    }
    // Require subject for email templates
    if ((templateForm.channel === 'email' || templateForm.channel === 'both') && !templateForm.subject.trim()) {
      setTemplateFormError('Email subject is required for email templates')
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
      const templatesRef = collection(db, 'messageTemplates')
      const placeholders = extractPlaceholders(
        templateForm.plainContent, 
        templateForm.subject, 
        templateForm.htmlContent
      )

      const templateData = {
        name: templateForm.name.trim(),
        description: templateForm.description.trim() || null,
        category: templateForm.category,
        templateType: templateForm.templateType,
        channel: templateForm.channel,
        subject: templateForm.subject.trim(),
        plainContent: templateForm.plainContent.trim(),
        htmlContent: templateForm.htmlContent.trim() || null,
        placeholders,
        active: true,
        updatedAt: serverTimestamp(),
      }

      if (editingTemplate) {
        // Preserve system template flags when editing
        await updateDoc(doc(db, 'messageTemplates', editingTemplate.id), {
          ...templateData,
          version: (editingTemplate.version || 1) + 1,
        })
        setTemplates(prev => prev.map(t =>
          t.id === editingTemplate.id
            ? {
                ...t,
                ...templateData,
                version: (t.version || 1) + 1,
                updatedAt: new Date() as any,
              }
            : t
        ).sort((a, b) => {
          if (a.category !== b.category) return a.category.localeCompare(b.category)
          return a.name.localeCompare(b.name)
        }))
      } else {
        const docRef = await addDoc(templatesRef, {
          ...templateData,
          isSystemTemplate: false,
          isDefault: false,
          version: 1,
          createdAt: serverTimestamp(),
          createdBy: userId || 'system',
        })
        setTemplates(prev => [...prev, {
          id: docRef.id,
          ...templateData,
          isSystemTemplate: false,
          isDefault: false,
          version: 1,
          createdAt: new Date() as any,
          createdBy: userId || 'system',
        } as MessageTemplate].sort((a, b) => {
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

  const handleToggleTemplateActive = async (template: MessageTemplate) => {
    try {
      await updateDoc(doc(db, 'messageTemplates', template.id), {
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

  const handleConfirmDeleteTemplate = (template: MessageTemplate) => {
    if (template.isSystemTemplate) {
      alert('System templates cannot be deleted. You can deactivate them instead.')
      return
    }
    setDeletingTemplate(template)
    setShowDeleteTemplateModal(true)
  }

  const handleDeleteTemplate = async () => {
    if (!deletingTemplate) return

    try {
      setDeletingTemplateLoading(true)
      await deleteDoc(doc(db, 'messageTemplates', deletingTemplate.id))
      setTemplates(prev => prev.filter(t => t.id !== deletingTemplate.id))
      setShowDeleteTemplateModal(false)
      setDeletingTemplate(null)
    } catch (err) {
      console.error('Error deleting template:', err)
    } finally {
      setDeletingTemplateLoading(false)
    }
  }

  const handleDuplicateTemplate = (template: MessageTemplate) => {
    setEditingTemplate(null)
    setTemplateForm({
      name: `${template.name} (Copy)`,
      description: template.description || '',
      category: template.category,
      templateType: 'custom',
      channel: template.channel,
      subject: template.subject || '',
      plainContent: template.plainContent || '',
      htmlContent: template.htmlContent || ''
    })
    setTemplateFormError('')
    setEditorMode(template.htmlContent ? 'html' : 'plain')
    setShowTemplateModal(true)
  }

  const handleInsertPlaceholder = (key: string) => {
    if (editorMode === 'html') {
      setTemplateForm(prev => ({
        ...prev,
        htmlContent: prev.htmlContent + key
      }))
    } else {
      setTemplateForm(prev => ({
        ...prev,
        plainContent: prev.plainContent + key
      }))
    }
  }

  // Get channel badge
  const getChannelBadge = (channel: TemplateChannel) => {
    const channelInfo = TEMPLATE_CHANNELS.find(c => c.value === channel)
    return (
      <span 
        className="channel-badge"
        style={{ 
          backgroundColor: `${channelInfo?.color}20`,
          color: channelInfo?.color
        }}
      >
        {channel === 'whatsapp' ? '📱' : channel === 'email' ? '📧' : '📱📧'}
      </span>
    )
  }

  // Update preview iframe when content changes
  useEffect(() => {
    if (editorMode === 'preview' && previewIframeRef.current) {
      const htmlPreview = generateHtmlPreview({
        subject: templateForm.subject,
        htmlContent: templateForm.htmlContent,
        plainContent: templateForm.plainContent
      })
      const iframe = previewIframeRef.current
      const doc = iframe.contentDocument || iframe.contentWindow?.document
      if (doc) {
        doc.open()
        doc.write(htmlPreview)
        doc.close()
      }
    }
  }, [editorMode, templateForm.subject, templateForm.htmlContent, templateForm.plainContent])

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <>
      <div className="settings-section">
        <div className="section-header">
          <div>
            <h3>📝 Message Templates</h3>
            <p>Manage templates for WhatsApp and Email communications</p>
          </div>
          <Button variant="primary" onClick={handleAddTemplate}>
            + New Template
          </Button>
        </div>

        {/* Migration Banner */}
        {showMigrationBanner && (
          <div className="migration-banner">
            <div className="migration-banner-content">
              <span className="migration-icon">🔄</span>
              <div className="migration-text">
                <strong>Template System Upgrade Available</strong>
                <p>Migrate your templates to the new unified system with HTML email support.</p>
              </div>
              <Button 
                variant="primary" 
                size="sm" 
                onClick={handleRunMigration}
                disabled={migrating}
              >
                {migrating ? 'Migrating...' : 'Upgrade Now'}
              </Button>
              <button 
                className="migration-dismiss"
                onClick={() => setShowMigrationBanner(false)}
              >
                ×
              </button>
            </div>
          </div>
        )}

        {loadingTemplates ? (
          <div className="loading-state">
            <Spinner size="lg" />
            <p>Loading templates...</p>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="templates-filters">
              <Input
                placeholder="Search templates..."
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                className="template-search"
              />
              <Select
                value={templateCategoryFilter}
                onChange={(e) => setTemplateCategoryFilter(e.target.value as TemplateCategory | 'all')}
                options={[
                  { value: 'all', label: 'All Categories' },
                  ...TEMPLATE_CATEGORIES.map(c => ({ value: c.value, label: c.label }))
                ]}
              />
              <Select
                value={templateChannelFilter}
                onChange={(e) => setTemplateChannelFilter(e.target.value as TemplateChannel | 'all')}
                options={[
                  { value: 'all', label: 'All Channels' },
                  { value: 'whatsapp', label: '📱 WhatsApp' },
                  { value: 'email', label: '📧 Email' },
                ]}
              />
            </div>

            {/* Templates Grid */}
            <div className="templates-grid">
              {filteredTemplates.length === 0 ? (
                <div className="empty-state">
                  <p>No templates found</p>
                  {templateSearch || templateCategoryFilter !== 'all' || templateChannelFilter !== 'all' ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setTemplateSearch('')
                        setTemplateCategoryFilter('all')
                        setTemplateChannelFilter('all')
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : (
                    <Button variant="primary" size="sm" onClick={handleAddTemplate}>
                      Create your first template
                    </Button>
                  )}
                </div>
              ) : (
                filteredTemplates.map(template => {
                  const category = TEMPLATE_CATEGORIES.find(c => c.value === template.category)
                  return (
                    <Card key={template.id} className={`template-card ${!template.active ? 'inactive' : ''} ${template.isSystemTemplate ? 'system-template' : ''}`}>
                      <div className="template-card-header">
                        <div className="template-badges">
                          <span
                            className="template-category-badge"
                            style={{
                              backgroundColor: `${category?.color}20`,
                              color: category?.color
                            }}
                          >
                            {category?.label}
                          </span>
                          {getChannelBadge(template.channel)}
                          {template.isSystemTemplate && (
                            <span className="system-badge" title="System template">🔒</span>
                          )}
                          {template.htmlContent && (
                            <span className="html-badge" title="Has HTML version">HTML</span>
                          )}
                        </div>
                        <div className="template-actions">
                          <button
                            className={`toggle-btn ${template.active ? 'active' : ''}`}
                            onClick={() => handleToggleTemplateActive(template)}
                            title={template.active ? 'Deactivate' : 'Activate'}
                          >
                            {template.active ? '✓' : '○'}
                          </button>
                        </div>
                      </div>
                      <h4 className="template-name">{template.name}</h4>
                      {template.description && (
                        <p className="template-description">{template.description}</p>
                      )}
                      {template.subject && (
                        <p className="template-subject">
                          <strong>Subject:</strong> {template.subject}
                        </p>
                      )}
                      <div className="template-preview" onClick={() => setPreviewingTemplate(template)}>
                        {(template.plainContent || '').substring(0, 120)}
                        {(template.plainContent || '').length > 120 && '...'}
                      </div>
                      <div className="template-card-footer">
                        <span className="placeholder-count">
                          {template.placeholders?.length || 0} placeholder{(template.placeholders?.length || 0) !== 1 ? 's' : ''}
                        </span>
                        <div className="template-card-actions">
                          <button onClick={() => setPreviewingTemplate(template)} title="Preview">👁️</button>
                          <button onClick={() => handleDuplicateTemplate(template)} title="Duplicate">📋</button>
                          <button onClick={() => handleEditTemplate(template)} title="Edit">✏️</button>
                          {!template.isSystemTemplate && (
                            <button onClick={() => handleConfirmDeleteTemplate(template)} title="Delete">🗑️</button>
                          )}
                        </div>
                      </div>
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
                • {templates.filter(t => t.htmlContent).length} with HTML
                • {templates.filter(t => t.isSystemTemplate).length} system
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
        size="xl"
      >
        <div className="template-form">
          {/* Basic Info Row */}
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
            <div className="form-group" style={{ flex: 1 }}>
              <label>Channel *</label>
              <Select
                value={templateForm.channel}
                onChange={(e) => setTemplateForm(prev => ({
                  ...prev,
                  channel: e.target.value as TemplateChannel
                }))}
                options={TEMPLATE_CHANNELS.map(c => ({ value: c.value, label: c.label }))}
              />
            </div>
          </div>

          {/* Description */}
          <div className="form-group">
            <label>Description (optional)</label>
            <Input
              value={templateForm.description}
              onChange={(e) => setTemplateForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Brief description of when to use this template"
            />
          </div>

          {/* Email Subject (only for email templates) */}
          {(templateForm.channel === 'email' || templateForm.channel === 'both') && (
            <div className="form-group">
              <label>Email Subject *</label>
              <div className="subject-input-wrapper">
                <Input
                  value={templateForm.subject}
                  onChange={(e) => {
                    setTemplateForm(prev => ({ ...prev, subject: e.target.value }))
                    setTemplateFormError('')
                  }}
                  placeholder="e.g., Interview Invitation - {{jobTitle}} at Allied Pharmacies"
                />
              </div>
            </div>
          )}

          {/* Placeholder Help */}
          <div className="placeholder-toggle-section">
            <button
              type="button"
              className="placeholder-help-btn"
              onClick={() => setShowPlaceholderHelp(!showPlaceholderHelp)}
            >
              {showPlaceholderHelp ? '▼ Hide placeholders' : '▶ Show available placeholders'}
            </button>
          </div>
          
          {showPlaceholderHelp && (
            <div className="placeholder-help-panel">
              <p className="placeholder-help-intro">Click a placeholder to insert it:</p>
              <div className="placeholder-buttons">
                {AVAILABLE_PLACEHOLDERS.map(p => (
                  <button
                    key={p.key}
                    type="button"
                    className="placeholder-insert-btn"
                    onClick={() => handleInsertPlaceholder(p.key)}
                    title={p.description}
                  >
                    {p.key.replace(/\{\{|\}\}/g, '')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Editor Mode Tabs */}
          <div className="editor-tabs">
            <button 
              className={`editor-tab ${editorMode === 'plain' ? 'active' : ''}`}
              onClick={() => setEditorMode('plain')}
            >
              📝 Plain Text
            </button>
            {(templateForm.channel === 'email' || templateForm.channel === 'both') && (
              <>
                <button 
                  className={`editor-tab ${editorMode === 'html' ? 'active' : ''}`}
                  onClick={() => setEditorMode('html')}
                >
                  🌐 HTML
                </button>
                <button 
                  className={`editor-tab ${editorMode === 'preview' ? 'active' : ''}`}
                  onClick={() => setEditorMode('preview')}
                >
                  👁️ Preview
                </button>
              </>
            )}
          </div>

          {/* Content Editors */}
          <div className="editor-content">
            {editorMode === 'plain' && (
              <div className="form-group">
                <label>Plain Text Content * <span className="label-hint">(Used for WhatsApp & plain emails)</span></label>
                <Textarea
                  value={templateForm.plainContent}
                  onChange={(e) => {
                    setTemplateForm(prev => ({ ...prev, plainContent: e.target.value }))
                    setTemplateFormError('')
                  }}
                  placeholder="Write your message here. Use {{placeholders}} for dynamic content..."
                  rows={12}
                />
              </div>
            )}

            {editorMode === 'html' && (
              <div className="form-group">
                <label>HTML Content <span className="label-hint">(Optional - for rich email formatting)</span></label>
                <Textarea
                  value={templateForm.htmlContent}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, htmlContent: e.target.value }))}
                  placeholder={`<div class="header">
  <h1>Your Title</h1>
</div>
<div class="content">
  <p>Hi {{firstName}},</p>
  <p>Your message here...</p>
</div>`}
                  rows={12}
                  className="html-editor"
                />
                <p className="html-hint">
                  💡 Leave blank to auto-generate from plain text. Use classes: <code>header</code>, <code>content</code>, <code>details-box</code>, <code>btn</code>
                </p>
              </div>
            )}

            {editorMode === 'preview' && (
              <div className="email-preview-container">
                <div className="preview-header-bar">
                  <span>📧 Email Preview (with sample data)</span>
                </div>
                <iframe
                  ref={previewIframeRef}
                  className="email-preview-iframe"
                  title="Email Preview"
                  sandbox="allow-same-origin"
                />
              </div>
            )}
          </div>

          {/* Detected Placeholders */}
          {(templateForm.plainContent || templateForm.htmlContent) && (
            <div className="detected-placeholders">
              <span className="detected-label">Detected placeholders:</span>
              {extractPlaceholders(templateForm.plainContent, templateForm.subject, templateForm.htmlContent).length > 0 ? (
                extractPlaceholders(templateForm.plainContent, templateForm.subject, templateForm.htmlContent).map(p => (
                  <span key={p} className="placeholder-tag">{`{{${p}}}`}</span>
                ))
              ) : (
                <span className="no-placeholders">None</span>
              )}
            </div>
          )}

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
        size="lg"
      >
        {previewingTemplate && (
          <div className="template-preview-modal">
            <div className="preview-header">
              <div className="preview-badges">
                <span
                  className="template-category-badge"
                  style={{
                    backgroundColor: `${TEMPLATE_CATEGORIES.find(c => c.value === previewingTemplate.category)?.color}20`,
                    color: TEMPLATE_CATEGORIES.find(c => c.value === previewingTemplate.category)?.color
                  }}
                >
                  {TEMPLATE_CATEGORIES.find(c => c.value === previewingTemplate.category)?.label}
                </span>
                {getChannelBadge(previewingTemplate.channel)}
                {previewingTemplate.isSystemTemplate && (
                  <span className="system-badge">🔒 System</span>
                )}
              </div>
              <h3>{previewingTemplate.name}</h3>
              {previewingTemplate.description && (
                <p className="preview-description">{previewingTemplate.description}</p>
              )}
              {!previewingTemplate.active && <span className="inactive-badge">Inactive</span>}
            </div>

            {/* Preview Tabs for Email Templates */}
            {(previewingTemplate.channel === 'email' || previewingTemplate.channel === 'both') && (
              <div className="preview-tabs">
                <button 
                  className={`preview-tab ${editorMode !== 'preview' ? 'active' : ''}`}
                  onClick={() => setEditorMode('plain')}
                >
                  Plain Text
                </button>
                <button 
                  className={`preview-tab ${editorMode === 'preview' ? 'active' : ''}`}
                  onClick={() => setEditorMode('preview')}
                >
                  HTML Preview
                </button>
              </div>
            )}

            {previewingTemplate.subject && (
              <div className="preview-subject">
                <strong>Subject:</strong> {highlightPlaceholders(previewingTemplate.subject)}
              </div>
            )}
            
            {editorMode === 'preview' && (previewingTemplate.channel === 'email' || previewingTemplate.channel === 'both') ? (
              <div className="email-preview-container modal-preview">
                <iframe
                  className="email-preview-iframe"
                  title="Email Preview"
                  srcDoc={generateHtmlPreview({
                    subject: previewingTemplate.subject || '',
                    htmlContent: previewingTemplate.htmlContent,
                    plainContent: previewingTemplate.plainContent
                  })}
                  sandbox="allow-same-origin"
                />
              </div>
            ) : (
              <div className="preview-content">
                <div className="preview-message">
                  {highlightPlaceholders(previewingTemplate.plainContent || '')}
                </div>
              </div>
            )}

            {previewingTemplate.placeholders && previewingTemplate.placeholders.length > 0 && (
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

      {/* Styles for new features */}
      <style>{`
        .migration-banner {
          background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 20px;
        }
        .migration-banner-content {
          display: flex;
          align-items: center;
          gap: 16px;
          color: white;
        }
        .migration-icon {
          font-size: 24px;
        }
        .migration-text {
          flex: 1;
        }
        .migration-text strong {
          display: block;
          margin-bottom: 4px;
        }
        .migration-text p {
          margin: 0;
          opacity: 0.9;
          font-size: 14px;
        }
        .migration-dismiss {
          background: none;
          border: none;
          color: white;
          font-size: 20px;
          cursor: pointer;
          opacity: 0.7;
        }
        .migration-dismiss:hover {
          opacity: 1;
        }

        .system-template {
          border-left: 3px solid #8b5cf6;
        }
        .system-badge {
          font-size: 12px;
        }
        .html-badge {
          background: #e0f2fe;
          color: #0369a1;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
        }

        .editor-tabs {
          display: flex;
          gap: 0;
          border-bottom: 1px solid #e5e7eb;
          margin-bottom: 16px;
        }
        .editor-tab {
          padding: 10px 20px;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          font-size: 14px;
          color: #6b7280;
          transition: all 0.2s;
        }
        .editor-tab:hover {
          color: #3b82f6;
        }
        .editor-tab.active {
          color: #3b82f6;
          border-bottom-color: #3b82f6;
        }

        .html-editor {
          font-family: 'Monaco', 'Menlo', monospace;
          font-size: 13px;
        }
        .html-hint {
          margin-top: 8px;
          font-size: 12px;
          color: #6b7280;
        }
        .html-hint code {
          background: #f3f4f6;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .email-preview-container {
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          overflow: hidden;
        }
        .preview-header-bar {
          background: #f9fafb;
          padding: 8px 12px;
          border-bottom: 1px solid #e5e7eb;
          font-size: 12px;
          color: #6b7280;
        }
        .email-preview-iframe {
          width: 100%;
          height: 400px;
          border: none;
          background: #f5f5f5;
        }
        .modal-preview .email-preview-iframe {
          height: 350px;
        }

        .preview-tabs {
          display: flex;
          gap: 0;
          margin-bottom: 16px;
        }
        .preview-tab {
          padding: 8px 16px;
          background: #f3f4f6;
          border: none;
          cursor: pointer;
          font-size: 13px;
        }
        .preview-tab:first-child {
          border-radius: 6px 0 0 6px;
        }
        .preview-tab:last-child {
          border-radius: 0 6px 6px 0;
        }
        .preview-tab.active {
          background: #3b82f6;
          color: white;
        }

        .placeholder-toggle-section {
          margin-bottom: 12px;
        }
        .placeholder-help-btn {
          background: none;
          border: none;
          color: #3b82f6;
          cursor: pointer;
          font-size: 13px;
          padding: 0;
        }
        .placeholder-help-btn:hover {
          text-decoration: underline;
        }

        .label-hint {
          font-weight: normal;
          color: #9ca3af;
          font-size: 12px;
        }

        .template-description {
          font-size: 13px;
          color: #6b7280;
          margin: 4px 0 8px;
        }

        .preview-description {
          color: #6b7280;
          font-size: 14px;
          margin-top: 4px;
        }
      `}</style>
    </>
  )
}

// Also export as default and with old name for backward compatibility
export { MessageTemplatesTab as WhatsAppTemplatesTab }
export default MessageTemplatesTab

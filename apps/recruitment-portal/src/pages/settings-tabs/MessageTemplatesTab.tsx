// ============================================================================
// Message Templates Tab - Phase 5: Enhanced Template Management
// Features: Test email, version history, import/export, advanced filtering
// Self-contained version - no shared-lib dependencies for constants
// ============================================================================

import { useEffect, useState, useRef } from 'react'
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, serverTimestamp, query, orderBy } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getFirebaseDb, getFirebaseFunctions } from '@allied/shared-lib'
import { Card, Button, Input, Spinner, Modal, Select, Textarea } from '@allied/shared-ui'

// ============================================================================
// TYPES (inlined to avoid dependency issues)
// ============================================================================

interface MessageTemplatesTabProps {
  userId?: string
}

type EditorMode = 'plain' | 'html' | 'preview'

type TemplateCategory = 'interview' | 'trial' | 'confirmation' | 'reminder' | 'offer' | 'rejection' | 'feedback' | 'general'
type TemplateChannel = 'whatsapp' | 'email' | 'both'
type TemplateType = 'interview_invitation' | 'interview_confirmation' | 'interview_reminder' | 'trial_invitation' | 'trial_confirmation' | 'trial_reminder' | 'job_offer' | 'rejection' | 'feedback_request' | 'branch_notification' | 'custom'

interface MessageTemplate {
  id: string
  name: string
  description?: string
  category: TemplateCategory
  templateType: TemplateType
  channel: TemplateChannel
  subject?: string
  plainContent: string
  htmlContent?: string
  placeholders?: string[]
  active: boolean
  isSystemTemplate?: boolean
  isDefault?: boolean
  version?: number
  createdAt?: any
  updatedAt?: any
  createdBy?: string
}

interface TemplateVersion {
  id: string
  templateId: string
  version: number
  name: string
  subject?: string
  plainContent: string
  htmlContent?: string
  savedAt: Date
  savedBy?: string
}

// ============================================================================
// CONSTANTS (inlined)
// ============================================================================

const DEFAULT_EMAIL_WRAPPER = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{subject}}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .email-container { max-width: 600px; margin: 0 auto; background: white; }
    .header { background-color: #003366; color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .header p { margin: 8px 0 0; opacity: 0.9; }
    .content { padding: 32px 24px; }
    .content p { margin: 0 0 16px; }
    .details-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0; }
    .detail-row { display: flex; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { font-weight: 600; color: #64748b; width: 140px; flex-shrink: 0; }
    .detail-value { color: #1e293b; }
    .btn { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 8px 0; }
    .btn:hover { background: #2563eb; }
    .btn-teams { background: #6264A7; }
    .btn-teams:hover { background: #4B4D8C; }
    .footer { background: #f8fafc; padding: 24px; text-align: center; color: #64748b; font-size: 14px; border-top: 1px solid #e2e8f0; }
    .footer p { margin: 4px 0; }
    .important { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 24px 0; }
    .checklist { background: #dbeafe; border-left: 4px solid #3b82f6; padding: 16px; margin: 24px 0; }
    .confirmation-code { background: #dcfce7; border: 1px solid #22c55e; padding: 8px 16px; border-radius: 4px; font-family: monospace; font-size: 18px; display: inline-block; }
    ul { margin: 8px 0; padding-left: 20px; }
    li { margin: 4px 0; }
  </style>
</head>
<body>
  <div class="email-container">
    {{content}}
    <div class="footer">
      <p><strong>Allied Pharmacies</strong></p>
      <p>recruitment@alliedpharmacies.com</p>
      <p style="font-size: 12px; margin-top: 12px;">This is an automated message from the Allied Recruitment Portal.</p>
    </div>
  </div>
</body>
</html>`

const PLACEHOLDER_DEFINITIONS = [
  { key: '{{firstName}}', label: 'First Name', description: "Candidate's first name" },
  { key: '{{lastName}}', label: 'Last Name', description: "Candidate's last name" },
  { key: '{{fullName}}', label: 'Full Name', description: "Candidate's full name" },
  { key: '{{email}}', label: 'Email', description: "Candidate's email address" },
  { key: '{{phone}}', label: 'Phone', description: "Candidate's phone number" },
  { key: '{{jobTitle}}', label: 'Job Title', description: 'Position being applied for' },
  { key: '{{branchName}}', label: 'Branch Name', description: 'Name of the pharmacy branch' },
  { key: '{{branchAddress}}', label: 'Branch Address', description: 'Address of the branch' },
  { key: '{{interviewBookingLink}}', label: 'Booking Link', description: 'Link to book interview/trial' },
  { key: '{{interviewDate}}', label: 'Interview Date', description: 'Date of interview/trial' },
  { key: '{{interviewTime}}', label: 'Interview Time', description: 'Time of interview/trial' },
  { key: '{{duration}}', label: 'Duration', description: 'Duration of the interview/trial' },
  { key: '{{confirmationCode}}', label: 'Confirmation Code', description: 'Booking confirmation code' },
  { key: '{{teamsLink}}', label: 'Teams Link', description: 'Microsoft Teams meeting link' },
  { key: '{{feedbackLink}}', label: 'Feedback Link', description: 'Link to submit feedback' },
  { key: '{{companyName}}', label: 'Company Name', description: 'Company name (Allied Pharmacies)' },
]

const DEFAULT_MESSAGE_TEMPLATES = [
  {
    name: 'Interview Invitation',
    description: 'Invite candidates to book an interview slot',
    category: 'interview' as TemplateCategory,
    templateType: 'interview_invitation' as TemplateType,
    channel: 'both' as TemplateChannel,
    subject: 'Interview Invitation - {{jobTitle}} at Allied Pharmacies',
    plainContent: `Hi {{firstName}},

Thank you for your application for the {{jobTitle}} position at Allied Pharmacies.

We would like to invite you for an interview. Please use the link below to book a convenient time:

{{interviewBookingLink}}

If you have any questions, please don't hesitate to contact us.

Best regards,
Allied Recruitment Team`,
    htmlContent: '',
    placeholders: ['firstName', 'jobTitle', 'interviewBookingLink'],
    active: true,
    isSystemTemplate: true,
    isDefault: true,
  },
]

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

const AVAILABLE_PLACEHOLDERS = PLACEHOLDER_DEFINITIONS.map(p => ({
  key: p.key,
  label: p.label,
  description: p.description
}))

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
  const [templateTypeFilter, setTemplateTypeFilter] = useState<TemplateType | 'all'>('all')
  const [showPlaceholderHelp, setShowPlaceholderHelp] = useState(false)
  const [templateSearch, setTemplateSearch] = useState('')
  const [previewingTemplate, setPreviewingTemplate] = useState<MessageTemplate | null>(null)
  const [editorMode, setEditorMode] = useState<EditorMode>('plain')
  const [showMigrationBanner, setShowMigrationBanner] = useState(false)
  const [migrating, setMigrating] = useState(false)
  
  // Phase 5: New state
  const [sendingTestEmail, setSendingTestEmail] = useState(false)
  const [testEmailAddress, setTestEmailAddress] = useState('')
  const [showTestEmailModal, setShowTestEmailModal] = useState(false)
  const [testEmailTemplate, setTestEmailTemplate] = useState<MessageTemplate | null>(null)
  const [showVersionHistoryModal, setShowVersionHistoryModal] = useState(false)
  const [versionHistoryTemplate, setVersionHistoryTemplate] = useState<MessageTemplate | null>(null)
  const [templateVersions, setTemplateVersions] = useState<TemplateVersion[]>([])
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [showImportExportModal, setShowImportExportModal] = useState(false)
  const [importExportMode, setImportExportMode] = useState<'import' | 'export'>('export')
  const [importData, setImportData] = useState('')
  const [importing, setImporting] = useState(false)
  
  const previewIframeRef = useRef<HTMLIFrameElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const extractPlaceholders = (content: string, subject?: string, htmlContent?: string): string[] => {
    const allContent = [subject, content, htmlContent].filter(Boolean).join(' ')
    const matches = allContent.match(/\{\{(\w+)\}\}/g) || []
    return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))]
  }

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

  const replacePlaceholdersForPreview = (content: string): string => {
    let result = content
    Object.entries(SAMPLE_PREVIEW_DATA).forEach(([placeholder, value]) => {
      result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value)
    })
    return result
  }

  const generateHtmlPreview = (template: { subject: string; htmlContent?: string; plainContent: string }): string => {
    const content = template.htmlContent || convertPlainToHtml(template.plainContent)
    const fullHtml = DEFAULT_EMAIL_WRAPPER
      .replace('{{subject}}', replacePlaceholdersForPreview(template.subject))
      .replace('{{content}}', replacePlaceholdersForPreview(content))
    return fullHtml
  }

  const convertPlainToHtml = (plain: string): string => {
    const paragraphs = plain.split('\n\n')
    return `<div class="header">
  <h1>Message</h1>
</div>
<div class="content">
  ${paragraphs.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('\n  ')}
</div>`
  }

  // Filter templates
  const filteredTemplates = templates.filter(t => {
    const matchesCategory = templateCategoryFilter === 'all' || t.category === templateCategoryFilter
    const matchesChannel = templateChannelFilter === 'all' || 
      t.channel === templateChannelFilter || 
      t.channel === 'both'
    const matchesType = templateTypeFilter === 'all' || t.templateType === templateTypeFilter
    const matchesSearch = !templateSearch ||
      t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
      t.plainContent.toLowerCase().includes(templateSearch.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(templateSearch.toLowerCase()))
    return matchesCategory && matchesChannel && matchesType && matchesSearch
  })

  // ============================================================================
  // HANDLERS
  // ============================================================================

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

  const handleRunMigration = async () => {
    try {
      setMigrating(true)
      const migrateTemplateFn = httpsCallable(functions, 'migrateMessageTemplates')
      const result = await migrateTemplateFn({})
      console.log('Migration result:', result)
      
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
    if ((templateForm.channel === 'email' || templateForm.channel === 'both') && !templateForm.subject.trim()) {
      setTemplateFormError('Email subject is required for email templates')
      return
    }

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
        updatedBy: userId || 'system',
      }

      if (editingTemplate) {
        // Save version history before updating
        await saveVersionHistory(editingTemplate)
        
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

  // Phase 5: Save version history
  const saveVersionHistory = async (template: MessageTemplate) => {
    try {
      const versionsRef = collection(db, 'messageTemplates', template.id, 'versions')
      await addDoc(versionsRef, {
        templateId: template.id,
        version: template.version || 1,
        name: template.name,
        subject: template.subject,
        plainContent: template.plainContent,
        htmlContent: template.htmlContent,
        savedAt: serverTimestamp(),
        savedBy: userId || 'system',
      })
    } catch (err) {
      console.error('Error saving version history:', err)
    }
  }

  // Phase 5: Load version history
  const handleViewVersionHistory = async (template: MessageTemplate) => {
    setVersionHistoryTemplate(template)
    setShowVersionHistoryModal(true)
    setLoadingVersions(true)
    
    try {
      const versionsRef = collection(db, 'messageTemplates', template.id, 'versions')
      const snapshot = await getDocs(query(versionsRef, orderBy('savedAt', 'desc')))
      
      const versions: TemplateVersion[] = snapshot.docs.map(doc => {
        const data = doc.data()
        return {
          id: doc.id,
          templateId: template.id,
          version: data.version,
          name: data.name,
          subject: data.subject,
          plainContent: data.plainContent,
          htmlContent: data.htmlContent,
          savedAt: data.savedAt?.toDate() || new Date(),
          savedBy: data.savedBy,
        }
      })
      
      setTemplateVersions(versions)
    } catch (err) {
      console.error('Error loading version history:', err)
    } finally {
      setLoadingVersions(false)
    }
  }

  // Phase 5: Restore version
  const handleRestoreVersion = async (version: TemplateVersion) => {
    if (!versionHistoryTemplate) return
    
    const confirmed = window.confirm(
      `Restore version ${version.version} from ${version.savedAt.toLocaleDateString()}?\n\nThis will save the current version to history first.`
    )
    if (!confirmed) return
    
    try {
      // Save current version first
      await saveVersionHistory(versionHistoryTemplate)
      
      // Restore the selected version
      await updateDoc(doc(db, 'messageTemplates', versionHistoryTemplate.id), {
        name: version.name,
        subject: version.subject,
        plainContent: version.plainContent,
        htmlContent: version.htmlContent,
        version: (versionHistoryTemplate.version || 1) + 1,
        updatedAt: serverTimestamp(),
        updatedBy: userId || 'system',
      })
      
      // Update local state
      setTemplates(prev => prev.map(t =>
        t.id === versionHistoryTemplate.id
          ? {
              ...t,
              name: version.name,
              subject: version.subject,
              plainContent: version.plainContent,
              htmlContent: version.htmlContent,
              version: (t.version || 1) + 1,
              updatedAt: new Date() as any,
            }
          : t
      ))
      
      setShowVersionHistoryModal(false)
      alert('Version restored successfully!')
    } catch (err) {
      console.error('Error restoring version:', err)
      alert('Failed to restore version. Please try again.')
    }
  }

  // Phase 5: Send test email
  const handleOpenTestEmail = (template: MessageTemplate) => {
    if (template.channel === 'whatsapp') {
      alert('Test emails can only be sent for email templates.')
      return
    }
    setTestEmailTemplate(template)
    setTestEmailAddress('')
    setShowTestEmailModal(true)
  }

  const handleSendTestEmail = async () => {
    if (!testEmailTemplate || !testEmailAddress) return
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(testEmailAddress)) {
      alert('Please enter a valid email address.')
      return
    }
    
    setSendingTestEmail(true)
    
    try {
      const sendTestEmailFn = httpsCallable<{
        to: string
        subject: string
        plainContent: string
        htmlContent?: string
        templateName: string
      }, {
        success: boolean
        error?: string
      }>(functions, 'sendTestEmail')
      
      // Replace placeholders with sample data
      const subject = replacePlaceholdersForPreview(testEmailTemplate.subject || 'Test Email')
      const plainContent = replacePlaceholdersForPreview(testEmailTemplate.plainContent)
      const htmlContent = testEmailTemplate.htmlContent 
        ? replacePlaceholdersForPreview(testEmailTemplate.htmlContent)
        : undefined
      
      const result = await sendTestEmailFn({
        to: testEmailAddress,
        subject: `[TEST] ${subject}`,
        plainContent,
        htmlContent,
        templateName: testEmailTemplate.name,
      })
      
      if (result.data.success) {
        alert(`Test email sent successfully to ${testEmailAddress}!`)
        setShowTestEmailModal(false)
      } else {
        throw new Error(result.data.error || 'Failed to send test email')
      }
    } catch (err: any) {
      console.error('Error sending test email:', err)
      alert(`Failed to send test email: ${err.message}`)
    } finally {
      setSendingTestEmail(false)
    }
  }

  // Phase 5: Export templates
  const handleExportTemplates = () => {
    const exportData = templates.map(t => ({
      name: t.name,
      description: t.description,
      category: t.category,
      templateType: t.templateType,
      channel: t.channel,
      subject: t.subject,
      plainContent: t.plainContent,
      htmlContent: t.htmlContent,
      placeholders: t.placeholders,
      isSystemTemplate: t.isSystemTemplate,
      isDefault: t.isDefault,
    }))
    
    const json = JSON.stringify(exportData, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    
    const a = document.createElement('a')
    a.href = url
    a.download = `message-templates-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Phase 5: Import templates
  const handleImportTemplates = async () => {
    if (!importData.trim()) {
      alert('Please paste or upload template JSON data.')
      return
    }
    
    let importedTemplates: any[]
    try {
      importedTemplates = JSON.parse(importData)
      if (!Array.isArray(importedTemplates)) {
        throw new Error('Data must be an array of templates')
      }
    } catch (err) {
      alert('Invalid JSON format. Please check your data.')
      return
    }
    
    const confirmed = window.confirm(
      `Import ${importedTemplates.length} template(s)?\n\nExisting templates with the same name will be skipped.`
    )
    if (!confirmed) return
    
    setImporting(true)
    
    try {
      const templatesRef = collection(db, 'messageTemplates')
      let imported = 0
      let skipped = 0
      
      for (const template of importedTemplates) {
        // Check if name already exists
        const exists = templates.some(t => t.name.toLowerCase() === template.name?.toLowerCase())
        if (exists) {
          skipped++
          continue
        }
        
        // Validate required fields
        if (!template.name || !template.plainContent) {
          skipped++
          continue
        }
        
        await addDoc(templatesRef, {
          name: template.name,
          description: template.description || null,
          category: template.category || 'general',
          templateType: template.templateType || 'custom',
          channel: template.channel || 'both',
          subject: template.subject || '',
          plainContent: template.plainContent,
          htmlContent: template.htmlContent || null,
          placeholders: template.placeholders || [],
          active: true,
          isSystemTemplate: false,
          isDefault: false,
          version: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: userId || 'system',
        })
        imported++
      }
      
      await fetchTemplates()
      setShowImportExportModal(false)
      setImportData('')
      
      alert(`Import complete!\n\nImported: ${imported}\nSkipped: ${skipped}`)
    } catch (err) {
      console.error('Error importing templates:', err)
      alert('Failed to import templates. Please try again.')
    } finally {
      setImporting(false)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (event) => {
      setImportData(event.target?.result as string || '')
    }
    reader.readAsText(file)
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
          <div className="header-actions">
            <Button 
              variant="secondary" 
              onClick={() => {
                setImportExportMode('export')
                setShowImportExportModal(true)
              }}
            >
              📥 Import/Export
            </Button>
            <Button variant="primary" onClick={handleAddTemplate}>
              + New Template
            </Button>
          </div>
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
              <Select
                value={templateTypeFilter}
                onChange={(e) => setTemplateTypeFilter(e.target.value as TemplateType | 'all')}
                options={[
                  { value: 'all', label: 'All Types' },
                  ...TEMPLATE_TYPES.map(t => ({ value: t.value, label: t.label }))
                ]}
              />
            </div>

            {/* Templates Grid */}
            <div className="templates-grid">
              {filteredTemplates.length === 0 ? (
                <div className="empty-state">
                  <p>No templates found</p>
                  {templateSearch || templateCategoryFilter !== 'all' || templateChannelFilter !== 'all' || templateTypeFilter !== 'all' ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setTemplateSearch('')
                        setTemplateCategoryFilter('all')
                        setTemplateChannelFilter('all')
                        setTemplateTypeFilter('all')
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
                          v{template.version || 1} • {template.placeholders?.length || 0} placeholder{(template.placeholders?.length || 0) !== 1 ? 's' : ''}
                        </span>
                        <div className="template-card-actions">
                          <button onClick={() => setPreviewingTemplate(template)} title="Preview">👁️</button>
                          {(template.channel === 'email' || template.channel === 'both') && (
                            <button onClick={() => handleOpenTestEmail(template)} title="Send Test Email">📧</button>
                          )}
                          <button onClick={() => handleViewVersionHistory(template)} title="Version History">📜</button>
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

          {/* Template Type */}
          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label>Template Type</label>
              <Select
                value={templateForm.templateType}
                onChange={(e) => setTemplateForm(prev => ({
                  ...prev,
                  templateType: e.target.value as TemplateType
                }))}
                options={TEMPLATE_TYPES.map(t => ({ value: t.value, label: t.label }))}
              />
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label>Description (optional)</label>
              <Input
                value={templateForm.description}
                onChange={(e) => setTemplateForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of when to use this template"
              />
            </div>
          </div>

          {/* Email Subject */}
          {(templateForm.channel === 'email' || templateForm.channel === 'both') && (
            <div className="form-group">
              <label>Email Subject *</label>
              <Input
                value={templateForm.subject}
                onChange={(e) => {
                  setTemplateForm(prev => ({ ...prev, subject: e.target.value }))
                  setTemplateFormError('')
                }}
                placeholder="e.g., Interview Invitation - {{jobTitle}} at Allied Pharmacies"
              />
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
              {(previewingTemplate.channel === 'email' || previewingTemplate.channel === 'both') && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    handleOpenTestEmail(previewingTemplate)
                    setPreviewingTemplate(null)
                  }}
                >
                  📧 Send Test
                </Button>
              )}
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

      {/* Test Email Modal */}
      <Modal
        isOpen={showTestEmailModal}
        onClose={() => setShowTestEmailModal(false)}
        title="Send Test Email"
        size="sm"
      >
        <div className="test-email-modal">
          <p>Send a test email using the template <strong>"{testEmailTemplate?.name}"</strong> with sample data filled in.</p>
          
          <div className="form-group">
            <label>Send to email address:</label>
            <Input
              type="email"
              value={testEmailAddress}
              onChange={(e) => setTestEmailAddress(e.target.value)}
              placeholder="your.email@example.com"
              autoFocus
            />
          </div>
          
          <p className="test-email-note">
            📝 The email will have "[TEST]" prepended to the subject and all placeholders will be replaced with sample data.
          </p>
          
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setShowTestEmailModal(false)}>
              Cancel
            </Button>
            <Button 
              variant="primary" 
              onClick={handleSendTestEmail}
              disabled={sendingTestEmail || !testEmailAddress}
            >
              {sendingTestEmail ? 'Sending...' : '📧 Send Test Email'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Version History Modal */}
      <Modal
        isOpen={showVersionHistoryModal}
        onClose={() => setShowVersionHistoryModal(false)}
        title={`Version History: ${versionHistoryTemplate?.name}`}
        size="lg"
      >
        <div className="version-history-modal">
          {loadingVersions ? (
            <div className="loading-state">
              <Spinner size="md" />
              <p>Loading version history...</p>
            </div>
          ) : templateVersions.length === 0 ? (
            <div className="empty-state">
              <p>No previous versions found.</p>
              <p className="version-hint">Version history is saved automatically when you edit a template.</p>
            </div>
          ) : (
            <div className="version-list">
              {templateVersions.map(version => (
                <div key={version.id} className="version-item">
                  <div className="version-header">
                    <span className="version-number">Version {version.version}</span>
                    <span className="version-date">
                      {version.savedAt.toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <div className="version-preview">
                    {version.plainContent.substring(0, 100)}...
                  </div>
                  <div className="version-actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleRestoreVersion(version)}
                    >
                      Restore this version
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setShowVersionHistoryModal(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Import/Export Modal */}
      <Modal
        isOpen={showImportExportModal}
        onClose={() => setShowImportExportModal(false)}
        title="Import / Export Templates"
        size="lg"
      >
        <div className="import-export-modal">
          <div className="import-export-tabs">
            <button 
              className={`tab ${importExportMode === 'export' ? 'active' : ''}`}
              onClick={() => setImportExportMode('export')}
            >
              📤 Export
            </button>
            <button 
              className={`tab ${importExportMode === 'import' ? 'active' : ''}`}
              onClick={() => setImportExportMode('import')}
            >
              📥 Import
            </button>
          </div>
          
          {importExportMode === 'export' ? (
            <div className="export-section">
              <p>Export all {templates.length} templates as a JSON file for backup or transfer to another system.</p>
              <div className="export-preview">
                <strong>Templates to export:</strong>
                <ul>
                  {templates.slice(0, 5).map(t => (
                    <li key={t.id}>{t.name}</li>
                  ))}
                  {templates.length > 5 && <li>...and {templates.length - 5} more</li>}
                </ul>
              </div>
              <div className="modal-actions">
                <Button variant="secondary" onClick={() => setShowImportExportModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleExportTemplates}>
                  📤 Download JSON
                </Button>
              </div>
            </div>
          ) : (
            <div className="import-section">
              <p>Import templates from a JSON file. Existing templates with the same name will be skipped.</p>
              
              <div className="form-group">
                <label>Upload JSON file:</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  className="file-input"
                />
              </div>
              
              <div className="form-group">
                <label>Or paste JSON data:</label>
                <Textarea
                  value={importData}
                  onChange={(e) => setImportData(e.target.value)}
                  placeholder='[{"name": "Template Name", "plainContent": "Content...", ...}]'
                  rows={8}
                />
              </div>
              
              <div className="modal-actions">
                <Button variant="secondary" onClick={() => setShowImportExportModal(false)}>
                  Cancel
                </Button>
                <Button 
                  variant="primary" 
                  onClick={handleImportTemplates}
                  disabled={importing || !importData.trim()}
                >
                  {importing ? 'Importing...' : '📥 Import Templates'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Styles */}
      <style>{`
        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
        }
        .section-header h3 {
          margin: 0 0 4px;
          font-size: 20px;
        }
        .section-header p {
          margin: 0;
          color: #6b7280;
          font-size: 14px;
        }
        .header-actions {
          display: flex;
          gap: 12px;
        }

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
        .migration-icon { font-size: 24px; }
        .migration-text { flex: 1; }
        .migration-text strong { display: block; margin-bottom: 4px; }
        .migration-text p { margin: 0; opacity: 0.9; font-size: 14px; }
        .migration-dismiss {
          background: none;
          border: none;
          color: white;
          font-size: 20px;
          cursor: pointer;
          opacity: 0.7;
        }
        .migration-dismiss:hover { opacity: 1; }

        .templates-filters {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        .template-search { flex: 1; min-width: 200px; }

        .templates-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px;
        }

        .template-card {
          padding: 16px;
          transition: all 0.2s;
        }
        .template-card:hover {
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .template-card.inactive {
          opacity: 0.6;
        }
        .template-card.system-template {
          border-left: 3px solid #8b5cf6;
        }

        .template-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 8px;
        }

        .template-badges {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .template-category-badge, .channel-badge {
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
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

        .toggle-btn {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: 2px solid #d1d5db;
          background: white;
          cursor: pointer;
          font-size: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .toggle-btn.active {
          background: #10b981;
          border-color: #10b981;
          color: white;
        }

        .template-name {
          margin: 0 0 4px;
          font-size: 16px;
        }

        .template-description {
          font-size: 13px;
          color: #6b7280;
          margin: 0 0 8px;
        }

        .template-subject {
          font-size: 12px;
          color: #6b7280;
          margin: 0 0 8px;
          padding: 4px 8px;
          background: #f9fafb;
          border-radius: 4px;
        }

        .template-preview {
          font-size: 13px;
          color: #4b5563;
          background: #f9fafb;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 12px;
          cursor: pointer;
          white-space: pre-wrap;
          line-height: 1.4;
        }
        .template-preview:hover {
          background: #f3f4f6;
        }

        .template-card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .placeholder-count {
          font-size: 12px;
          color: #9ca3af;
        }

        .template-card-actions {
          display: flex;
          gap: 4px;
        }
        .template-card-actions button {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          font-size: 14px;
          opacity: 0.7;
        }
        .template-card-actions button:hover {
          opacity: 1;
        }

        .templates-summary {
          margin-top: 16px;
          text-align: center;
          font-size: 13px;
          color: #6b7280;
        }

        .loading-state, .empty-state {
          text-align: center;
          padding: 48px;
          color: #6b7280;
        }

        .form-row {
          display: flex;
          gap: 16px;
          margin-bottom: 16px;
        }
        .form-group {
          margin-bottom: 16px;
        }
        .form-group label {
          display: block;
          margin-bottom: 6px;
          font-weight: 500;
          font-size: 14px;
        }
        .label-hint {
          font-weight: normal;
          color: #9ca3af;
          font-size: 12px;
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

        .placeholder-help-panel {
          background: #f0f9ff;
          border: 1px solid #bae6fd;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 16px;
        }
        .placeholder-help-intro {
          margin: 0 0 12px;
          font-size: 13px;
          color: #0369a1;
        }
        .placeholder-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .placeholder-insert-btn {
          background: white;
          border: 1px solid #0ea5e9;
          color: #0369a1;
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
          font-family: monospace;
        }
        .placeholder-insert-btn:hover {
          background: #0ea5e9;
          color: white;
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

        .detected-placeholders {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 16px;
          font-size: 13px;
        }
        .detected-label {
          color: #6b7280;
        }
        .placeholder-tag {
          background: #dbeafe;
          color: #1d4ed8;
          padding: 2px 8px;
          border-radius: 4px;
          font-family: monospace;
          font-size: 12px;
        }
        .no-placeholders {
          color: #9ca3af;
          font-style: italic;
        }

        .form-error {
          color: #dc2626;
          font-size: 14px;
          margin-bottom: 16px;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 24px;
          padding-top: 16px;
          border-top: 1px solid #e5e7eb;
        }

        .delete-warning {
          color: #dc2626;
          font-size: 14px;
        }

        .preview-header {
          margin-bottom: 16px;
        }
        .preview-badges {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
        }
        .preview-header h3 {
          margin: 0;
        }
        .preview-description {
          color: #6b7280;
          font-size: 14px;
          margin-top: 4px;
        }
        .inactive-badge {
          display: inline-block;
          background: #fef2f2;
          color: #dc2626;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 12px;
          margin-top: 8px;
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

        .preview-subject {
          background: #f9fafb;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 16px;
          font-size: 14px;
        }

        .preview-content {
          background: #f9fafb;
          border-radius: 8px;
          padding: 16px;
        }
        .preview-message {
          white-space: pre-wrap;
          line-height: 1.6;
        }

        .placeholder-highlight {
          background: #dbeafe;
          color: #1d4ed8;
          padding: 1px 4px;
          border-radius: 3px;
          font-family: monospace;
        }

        .preview-placeholders {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #e5e7eb;
        }
        .preview-placeholders-label {
          font-weight: 600;
          font-size: 14px;
          display: block;
          margin-bottom: 8px;
        }
        .preview-placeholders-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .preview-placeholder-item {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 13px;
        }
        .placeholder-description {
          color: #6b7280;
        }

        /* Phase 5 Styles */
        .test-email-modal p {
          margin-bottom: 16px;
        }
        .test-email-note {
          background: #f0f9ff;
          border: 1px solid #bae6fd;
          padding: 12px;
          border-radius: 6px;
          font-size: 13px;
          color: #0369a1;
        }

        .version-history-modal .version-list {
          max-height: 400px;
          overflow-y: auto;
        }
        .version-item {
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 12px;
        }
        .version-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .version-number {
          font-weight: 600;
          color: #3b82f6;
        }
        .version-date {
          color: #6b7280;
          font-size: 13px;
        }
        .version-preview {
          background: #f9fafb;
          padding: 12px;
          border-radius: 4px;
          font-size: 13px;
          color: #4b5563;
          margin-bottom: 12px;
        }
        .version-hint {
          color: #9ca3af;
          font-size: 13px;
        }

        .import-export-modal .import-export-tabs {
          display: flex;
          gap: 0;
          margin-bottom: 20px;
        }
        .import-export-modal .tab {
          flex: 1;
          padding: 12px;
          background: #f3f4f6;
          border: none;
          cursor: pointer;
          font-size: 14px;
        }
        .import-export-modal .tab:first-child {
          border-radius: 6px 0 0 6px;
        }
        .import-export-modal .tab:last-child {
          border-radius: 0 6px 6px 0;
        }
        .import-export-modal .tab.active {
          background: #3b82f6;
          color: white;
        }
        .export-preview {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          padding: 16px;
          border-radius: 8px;
          margin: 16px 0;
        }
        .export-preview ul {
          margin: 8px 0 0 20px;
          padding: 0;
        }
        .file-input {
          width: 100%;
          padding: 12px;
          border: 2px dashed #d1d5db;
          border-radius: 8px;
          cursor: pointer;
        }
        .file-input:hover {
          border-color: #3b82f6;
        }
      `}</style>
    </>
  )
}

// Export for backward compatibility
export { MessageTemplatesTab as WhatsAppTemplatesTab }
export default MessageTemplatesTab

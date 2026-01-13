// ============================================================================
// Email Modal Component
// Extracted from CandidateDetail.tsx for better maintainability
// Location: apps/recruitment-portal/src/components/candidate/EmailModal.tsx
// ============================================================================

import { useState, useEffect } from 'react'
import { collection, query, where, orderBy, getDocs, doc, getDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { 
  getFirebaseDb, 
  getFirebaseFunctions,
  replaceTemplatePlaceholders,
  prepareCandidateData,
  combinePlaceholderData,
  type PlaceholderData
} from '@allied/shared-lib'
import type { Candidate, ActivityAction } from '@allied/shared-lib'
import { Modal, Select, Spinner, Button, Textarea, Input } from '@allied/shared-ui'

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
}

interface EmailModalProps {
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
  // Optional: pre-populate with rejection template when status changes to rejected
  initialCategory?: TemplateCategory
  initialSubject?: string
  initialContent?: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TEMPLATE_CATEGORIES = [
  { value: 'interview', label: 'Interview', color: '#3b82f6' },
  { value: 'trial', label: 'Trial', color: '#f59e0b' },
  { value: 'offer', label: 'Offer', color: '#10b981' },
  { value: 'rejection', label: 'Rejection', color: '#ef4444' },
  { value: 'reminder', label: 'Reminder', color: '#8b5cf6' },
  { value: 'general', label: 'General', color: '#6b7280' },
]

// ============================================================================
// COMPONENT
// ============================================================================

export function EmailModal({ 
  isOpen, 
  onClose, 
  candidate, 
  onLogActivity,
  initialCategory,
  initialSubject,
  initialContent
}: EmailModalProps) {
  const db = getFirebaseDb()
  
  // State
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory | 'all'>('all')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailContent, setEmailContent] = useState('')
  const [isEditingEmail, setIsEditingEmail] = useState(false)
  const [emailCopied, setEmailCopied] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [generatedBookingLink, setGeneratedBookingLink] = useState<string | null>(null)
  const [generatingBookingLink, setGeneratingBookingLink] = useState(false)
  const [interviewExpiryDays, setInterviewExpiryDays] = useState(7)
  const [trialExpiryDays, setTrialExpiryDays] = useState(7)

  // Load templates when modal opens
  useEffect(() => {
    if (isOpen && templates.length === 0) {
      loadTemplates()
    }
  }, [isOpen])

  // Load expiry settings
  useEffect(() => {
    const loadExpirySettings = async () => {
      try {
        const interviewDoc = await getDoc(doc(db, 'settings', 'interviewAvailability'))
        if (interviewDoc.exists()) {
          const data = interviewDoc.data()
          if (data.bookingLinkExpiryDays) {
            setInterviewExpiryDays(data.bookingLinkExpiryDays)
          }
        }
        
        const trialDoc = await getDoc(doc(db, 'settings', 'trialAvailability'))
        if (trialDoc.exists()) {
          const data = trialDoc.data()
          if (data.bookingLinkExpiryDays) {
            setTrialExpiryDays(data.bookingLinkExpiryDays)
          }
        }
      } catch (error) {
        console.error('Error loading expiry settings:', error)
      }
    }
    
    loadExpirySettings()
  }, [db])

  // Reset/initialize state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedTemplate(null)
      setIsEditingEmail(false)
      setEmailCopied(false)
      setGeneratedBookingLink(null)
      setGeneratingBookingLink(false)
      
      // Use initial values if provided (e.g., for rejection emails)
      if (initialCategory) {
        setCategoryFilter(initialCategory)
      } else {
        setCategoryFilter('all')
      }
      
      if (initialSubject) {
        setEmailSubject(initialSubject)
      } else {
        setEmailSubject('')
      }
      
      if (initialContent) {
        setEmailContent(initialContent)
      } else {
        setEmailContent('')
      }
    }
  }, [isOpen, initialCategory, initialSubject, initialContent])

  // Load Email templates from Firestore
  const loadTemplates = async () => {
    setLoadingTemplates(true)
    try {
      // First try to load from emailTemplates collection
      const emailTemplatesRef = collection(db, 'emailTemplates')
      let q = query(emailTemplatesRef, where('active', '==', true), orderBy('name'))
      let snapshot = await getDocs(q)
      
      if (snapshot.empty) {
        // Fallback: use whatsappTemplates if no dedicated email templates exist
        const whatsappRef = collection(db, 'whatsappTemplates')
        q = query(whatsappRef, where('active', '==', true), orderBy('name'))
        snapshot = await getDocs(q)
      }
      
      const loadedTemplates: EmailTemplate[] = []
      snapshot.forEach(doc => {
        const data = doc.data()
        loadedTemplates.push({
          id: doc.id,
          name: data.name,
          category: data.category,
          subject: data.subject || `${data.category?.charAt(0).toUpperCase()}${data.category?.slice(1)} - Allied Pharmacies`,
          content: data.content,
          placeholders: data.placeholders || [],
          active: data.active
        } as EmailTemplate)
      })
      
      setTemplates(loadedTemplates)
    } catch (error) {
      console.error('Error loading email templates:', error)
    } finally {
      setLoadingTemplates(false)
    }
  }

  // Get placeholder data for the current candidate
  const getPlaceholderData = (bookingUrl?: string): PlaceholderData => {
    if (!candidate) return {}
    
    const candidateData = prepareCandidateData({
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      name: `${candidate.firstName} ${candidate.lastName}`,
      email: candidate.email,
      phone: candidate.phone,
      jobTitle: candidate.jobTitle,
      entity: candidate.entity || 'Allied Pharmacies'
    })
    
    return combinePlaceholderData(candidateData, {
      interviewBookingLink: bookingUrl || generatedBookingLink || '[Booking link will be generated]',
      companyName: candidate.entity || 'Allied Pharmacies',
      branchName: candidate.branchId || '',
      branchAddress: ''
    })
  }

  // Generate a booking link for email via Cloud Function
  const generateBookingLink = async (type: 'interview' | 'trial', expiryDays?: number): Promise<string> => {
    if (!candidate) return ''
    
    if (generatedBookingLink) return generatedBookingLink
    
    const expiry = expiryDays || (type === 'trial' ? trialExpiryDays : interviewExpiryDays)
    
    setGeneratingBookingLink(true)
    try {
      const functions = getFirebaseFunctions()
      const createBookingLinkFn = httpsCallable<{
        candidateId: string
        candidateName: string
        candidateEmail?: string
        type: 'interview' | 'trial'
        jobTitle?: string
        expiryDays?: number
        maxUses?: number
      }, {
        success: boolean
        id: string
        url: string
        expiresAt: string
      }>(functions, 'createBookingLink')
      
      const result = await createBookingLinkFn({
        candidateId: candidate.id,
        candidateName: `${candidate.firstName} ${candidate.lastName}`,
        candidateEmail: candidate.email,
        type,
        jobTitle: candidate.jobTitle,
        expiryDays: expiry,
        maxUses: 1,
      })
      
      if (result.data.success) {
        setGeneratedBookingLink(result.data.url)
        
        onLogActivity(
          candidate.id,
          'booking_link_created',
          `Generated ${type} booking link (expires in ${expiry} days - ${new Date(result.data.expiresAt).toLocaleDateString()})`
        )
        
        return result.data.url
      }
      
      return ''
    } catch (error) {
      console.error('Error generating booking link:', error)
      return ''
    } finally {
      setGeneratingBookingLink(false)
    }
  }

  // Select a template and fill placeholders
  const handleSelectTemplate = async (template: EmailTemplate) => {
    setSelectedTemplate(template)
    setIsEditingEmail(false)
    
    const usesBookingLink = template.content.includes('{{interviewBookingLink}}')
    
    if (usesBookingLink && !generatedBookingLink) {
      const linkType = template.category === 'trial' ? 'trial' : 'interview'
      await generateBookingLink(linkType)
    }
    
    const data = getPlaceholderData()
    const subjectResult = replaceTemplatePlaceholders(template.subject, data)
    const contentResult = replaceTemplatePlaceholders(template.content, data)
    setEmailSubject(subjectResult.text)
    setEmailContent(contentResult.text)
  }

  // Quick action: Email Interview invitation
  const handleQuickInterviewInvite = async () => {
    const bookingUrl = await generateBookingLink('interview')
    
    const template = templates.find(t => 
      t.category === 'interview' && t.name.toLowerCase().includes('invitation')
    )
    
    const data = getPlaceholderData(bookingUrl)
    
    if (template) {
      setSelectedTemplate(template)
      setIsEditingEmail(false)
      const subjectResult = replaceTemplatePlaceholders(template.subject, data)
      const contentResult = replaceTemplatePlaceholders(template.content, data)
      setEmailSubject(subjectResult.text)
      setEmailContent(contentResult.text)
    } else {
      setEmailSubject(`Interview Invitation - ${data.jobTitle} at Allied Pharmacies`)
      setEmailContent(`Dear ${data.firstName},

Thank you for applying for the ${data.jobTitle} position at Allied Pharmacies.

We would like to invite you for an interview. Please use the following link to book a convenient time:

${bookingUrl || data.interviewBookingLink}

If you have any questions, please don't hesitate to contact us.

Best regards,
Allied Recruitment Team`)
      setSelectedTemplate(null)
    }
  }

  // Quick action: Email Trial invitation
  const handleQuickTrialInvite = async () => {
    const bookingUrl = await generateBookingLink('trial')
    
    const template = templates.find(t => 
      t.category === 'trial' && t.name.toLowerCase().includes('invitation')
    )
    
    const data = getPlaceholderData(bookingUrl)
    
    if (template) {
      setSelectedTemplate(template)
      setIsEditingEmail(false)
      const subjectResult = replaceTemplatePlaceholders(template.subject, data)
      const contentResult = replaceTemplatePlaceholders(template.content, data)
      setEmailSubject(subjectResult.text)
      setEmailContent(contentResult.text)
    } else {
      setEmailSubject(`Trial Shift Invitation - Allied Pharmacies`)
      setEmailContent(`Dear ${data.firstName},

Congratulations! Following your successful interview, we would like to invite you for a trial shift at Allied Pharmacies.

Please use this link to book your trial: ${bookingUrl || '[Booking link]'}

What to bring:
• GPhC registration (if applicable)
• Photo ID
• Smart professional attire

If you have any questions, please don't hesitate to contact us.

Best regards,
Allied Recruitment Team`)
      setSelectedTemplate(null)
    }
  }

  // Copy email content to clipboard
  const handleCopyEmail = async () => {
    try {
      const fullContent = `Subject: ${emailSubject}\n\n${emailContent}`
      await navigator.clipboard.writeText(fullContent)
      setEmailCopied(true)
      setTimeout(() => setEmailCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  // Send email via Microsoft Graph API
  const handleSendEmail = async () => {
    if (!candidate?.email || !emailContent || !emailSubject) return
    
    setSendingEmail(true)
    
    try {
      const functions = getFirebaseFunctions()
      const sendEmailFn = httpsCallable<{
        to: string
        subject: string
        body: string
        candidateId: string
        candidateName: string
      }, {
        success: boolean
        messageId?: string
        error?: string
      }>(functions, 'sendEmail')
      
      const result = await sendEmailFn({
        to: candidate.email,
        subject: emailSubject,
        body: emailContent,
        candidateId: candidate.id,
        candidateName: `${candidate.firstName} ${candidate.lastName}`
      })
      
      if (result.data.success) {
        await onLogActivity(
          candidate.id,
          'message_sent',
          `Sent email: "${emailSubject}"${selectedTemplate ? ` using template "${selectedTemplate.name}"` : ''}`
        )
        
        onClose()
        alert('Email sent successfully!')
      } else {
        throw new Error(result.data.error || 'Failed to send email')
      }
    } catch (error: any) {
      console.error('Error sending email:', error)
      
      const fallback = window.confirm(
        `Could not send email via Microsoft Graph.\n\nError: ${error.message}\n\nWould you like to open your email client instead?`
      )
      
      if (fallback) {
        const mailtoUrl = `mailto:${candidate.email}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailContent)}`
        window.location.href = mailtoUrl
        
        await onLogActivity(
          candidate.id,
          'message_sent',
          `Opened email client for: "${emailSubject}"${selectedTemplate ? ` using template "${selectedTemplate.name}"` : ''}`
        )
        
        onClose()
      }
    } finally {
      setSendingEmail(false)
    }
  }

  // Filter templates by category
  const filteredTemplates = templates.filter(t => 
    categoryFilter === 'all' || t.category === categoryFilter
  )

  // Render a line with unfilled placeholders highlighted
  const renderLineWithPlaceholders = (line: string): React.ReactNode => {
    const parts = line.split(/(\{\{[^}]+\}\})/g)
    return parts.map((part, index) => {
      if (part.match(/^\{\{[^}]+\}\}$/)) {
        return (
          <span key={index} className="unfilled-placeholder">
            {part}
          </span>
        )
      }
      return part
    })
  }

  if (!candidate) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Send Email"
      size="lg"
    >
      <div className="whatsapp-modal email-modal">
        {/* Recipient info header */}
        <div className="whatsapp-recipient">
          <div className="recipient-avatar" style={{ background: '#2563eb' }}>
            {candidate.firstName?.[0]}{candidate.lastName?.[0]}
          </div>
          <div className="recipient-info">
            <span className="recipient-name">{candidate.firstName} {candidate.lastName}</span>
            <span className="recipient-phone">{candidate.email}</span>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="whatsapp-quick-actions">
          <h4>Quick Actions</h4>
          <div className="quick-action-buttons">
            <button 
              className="quick-action-btn"
              onClick={handleQuickInterviewInvite}
              disabled={generatingBookingLink}
            >
              <span className="quick-action-icon">📅</span>
              <span>{generatingBookingLink ? 'Generating link...' : 'Invite to Interview'}</span>
            </button>
            <button 
              className="quick-action-btn"
              onClick={handleQuickTrialInvite}
              disabled={generatingBookingLink}
            >
              <span className="quick-action-icon">📋</span>
              <span>{generatingBookingLink ? 'Generating link...' : 'Invite to Trial'}</span>
            </button>
          </div>
        </div>

        <div className="whatsapp-divider">
          <span>or choose a template</span>
        </div>

        {/* Booking link generated indicator */}
        {generatedBookingLink && (
          <div className="booking-link-generated">
            ✅ Booking link generated and ready to send
          </div>
        )}

        {/* Template Selection */}
        <div className="template-selection">
          <div className="template-header">
            <h4>Choose a template</h4>
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as TemplateCategory | 'all')}
              options={[
                { value: 'all', label: 'All Categories' },
                ...TEMPLATE_CATEGORIES.map(c => ({ value: c.value, label: c.label }))
              ]}
            />
          </div>

          {loadingTemplates ? (
            <div className="template-loading">
              <Spinner size="md" />
            </div>
          ) : (
            <div className="template-grid">
              {filteredTemplates.length === 0 ? (
                <p className="no-templates">No templates available. Using default templates.</p>
              ) : (
                filteredTemplates.map(template => {
                  const category = TEMPLATE_CATEGORIES.find(c => c.value === template.category)
                  return (
                    <button
                      key={template.id}
                      className={`template-option ${selectedTemplate?.id === template.id ? 'selected' : ''}`}
                      onClick={() => handleSelectTemplate(template)}
                    >
                      <span 
                        className="template-option-category"
                        style={{ backgroundColor: `${category?.color}20`, color: category?.color }}
                      >
                        {category?.label}
                      </span>
                      <span className="template-option-name">{template.name}</span>
                    </button>
                  )
                })
              )}
            </div>
          )}
        </div>

        {/* Email Subject */}
        {emailSubject && (
          <div className="email-subject-section">
            <label className="email-subject-label">Subject</label>
            {isEditingEmail ? (
              <Input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="email-subject-input"
              />
            ) : (
              <div className="email-subject-preview">{emailSubject}</div>
            )}
          </div>
        )}

        {/* Message Preview/Edit */}
        {emailContent && (
          <div className="message-section">
            <div className="message-header">
              <h4>Message</h4>
              <div className="message-actions">
                <button 
                  className={`message-action-btn ${isEditingEmail ? 'active' : ''}`}
                  onClick={() => setIsEditingEmail(!isEditingEmail)}
                >
                  {isEditingEmail ? '👁 Preview' : '✏️ Edit'}
                </button>
              </div>
            </div>

            {isEditingEmail ? (
              <Textarea
                value={emailContent}
                onChange={(e) => setEmailContent(e.target.value)}
                rows={10}
                className="message-editor"
              />
            ) : (
              <div className="message-preview">
                {emailContent.split('\n').map((line, i) => (
                  <p key={i}>
                    {line ? renderLineWithPlaceholders(line) : '\u00A0'}
                  </p>
                ))}
              </div>
            )}

            {/* Unfilled placeholders warning */}
            {emailContent.includes('{{') && (
              <div className="unfilled-warning">
                ⚠️ Some placeholders couldn't be filled automatically. Please edit the message to complete them.
              </div>
            )}
          </div>
        )}

        {/* Modal Actions */}
        <div className="whatsapp-modal-actions">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            variant="secondary" 
            onClick={handleCopyEmail}
            disabled={!emailContent}
          >
            {emailCopied ? '✓ Copied!' : '📋 Copy'}
          </Button>
          <Button 
            variant="primary" 
            onClick={handleSendEmail}
            disabled={!emailContent || !emailSubject || !candidate.email || sendingEmail}
          >
            {sendingEmail ? '📧 Sending...' : '📧 Send Email'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default EmailModal

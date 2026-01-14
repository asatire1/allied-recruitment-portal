// ============================================================================
// Email Modal Component - Phase 3 Update
// Now uses unified messageTemplates collection
// Properly fetches branch name from branches collection
// ============================================================================

import { useState, useEffect } from 'react'
import { collection, query, where, orderBy, getDocs, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
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

type TemplateCategory = 'interview' | 'trial' | 'confirmation' | 'offer' | 'rejection' | 'reminder' | 'feedback' | 'general'
type TemplateChannel = 'whatsapp' | 'email' | 'both'

interface EmailTemplate {
  id: string
  name: string
  category: TemplateCategory
  channel: TemplateChannel
  subject: string
  plainContent: string
  htmlContent?: string
  placeholders: string[]
  active: boolean
  isSystemTemplate?: boolean
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
  { value: 'trial', label: 'Trial', color: '#8b5cf6' },
  { value: 'confirmation', label: 'Confirmation', color: '#10b981' },
  { value: 'offer', label: 'Offer', color: '#10b981' },
  { value: 'rejection', label: 'Rejection', color: '#ef4444' },
  { value: 'reminder', label: 'Reminder', color: '#f59e0b' },
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
  
  // Branch data - fetched when candidate has branchId
  const [branchName, setBranchName] = useState<string>('')
  const [branchAddress, setBranchAddress] = useState<string>('')

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

  // Fetch branch details when candidate changes
  useEffect(() => {
    const fetchBranchDetails = async () => {
      if (!candidate?.branchId) {
        setBranchName('')
        setBranchAddress('')
        return
      }

      // If candidate already has branchName, use it
      if (candidate.branchName) {
        setBranchName(candidate.branchName)
      }

      try {
        const branchDoc = await getDoc(doc(db, 'branches', candidate.branchId))
        if (branchDoc.exists()) {
          const branchData = branchDoc.data()
          setBranchName(branchData.name || candidate.branchName || '')
          setBranchAddress(branchData.address || '')
        }
      } catch (error) {
        console.error('Error fetching branch details:', error)
        // Fallback to candidate's branchName if available
        setBranchName(candidate.branchName || '')
      }
    }

    fetchBranchDetails()
  }, [candidate?.branchId, candidate?.branchName, db])

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

  // Load Email templates from Firestore - unified messageTemplates collection
  const loadTemplates = async () => {
    setLoadingTemplates(true)
    try {
      // Load from unified messageTemplates collection
      let templatesRef = collection(db, 'messageTemplates')
      let q = query(templatesRef, where('active', '==', true), orderBy('name'))
      let snapshot = await getDocs(q)
      
      // Fallback to whatsappTemplates if messageTemplates is empty
      if (snapshot.empty) {
        templatesRef = collection(db, 'whatsappTemplates')
        q = query(templatesRef, where('active', '==', true), orderBy('name'))
        snapshot = await getDocs(q)
      }
      
      const loadedTemplates: EmailTemplate[] = []
      snapshot.forEach(docSnap => {
        const data = docSnap.data()
        // Filter: only show templates that support email (channel = 'email' or 'both')
        const channel = data.channel || 'both'
        if (channel === 'email' || channel === 'both') {
          loadedTemplates.push({
            id: docSnap.id,
            name: data.name,
            category: data.category,
            channel: channel,
            subject: data.subject || `${data.category?.charAt(0).toUpperCase()}${data.category?.slice(1)} - Allied Pharmacies`,
            // Support both new schema (plainContent) and old schema (content)
            plainContent: data.plainContent || data.content || '',
            htmlContent: data.htmlContent,
            placeholders: data.placeholders || [],
            active: data.active,
            isSystemTemplate: data.isSystemTemplate || false
          })
        }
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
    
    const linkValue = bookingUrl || generatedBookingLink || '[Booking link will be generated]'
    return combinePlaceholderData(candidateData, {
      // Support all booking link placeholder variants for consistency with bulk emails
      interviewBookingLink: linkValue,
      trialBookingLink: linkValue,
      bookingLink: linkValue,
      companyName: candidate.entity || 'Allied Pharmacies',
      // Use fetched branch name, not branchId
      branchName: branchName || candidate.branchName || '',
      branchAddress: branchAddress || ''
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
        branchId?: string
        branchName?: string
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
        branchId: candidate.branchId,
        // Use fetched branch name
        branchName: branchName || candidate.branchName,
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
    
    const usesBookingLink = template.plainContent.includes('{{interviewBookingLink}}')
    
    if (usesBookingLink && !generatedBookingLink) {
      const linkType = template.category === 'trial' ? 'trial' : 'interview'
      await generateBookingLink(linkType)
    }
    
    const data = getPlaceholderData()
    const subjectResult = replaceTemplatePlaceholders(template.subject, data)
    const contentResult = replaceTemplatePlaceholders(template.plainContent, data)
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
      const contentResult = replaceTemplatePlaceholders(template.plainContent, data)
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
      const contentResult = replaceTemplatePlaceholders(template.plainContent, data)
      setEmailSubject(subjectResult.text)
      setEmailContent(contentResult.text)
    } else {
      const branchText = branchName ? ` at ${branchName}` : ''
      setEmailSubject(`Trial Shift Invitation${branchText} - Allied Pharmacies`)
      setEmailContent(`Dear ${data.firstName},

Congratulations! Following your successful interview, we would like to invite you for a trial shift${branchText}.

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

  // Send email via sendCandidateEmail (uses HTML templates like bulk emails)
  const handleSendEmail = async () => {
    if (!candidate?.email || !emailContent || !emailSubject) return

    setSendingEmail(true)

    try {
      const functions = getFirebaseFunctions()
      // Use sendCandidateEmail instead of sendEmail to get HTML template support
      const sendEmailFn = httpsCallable<{
        to: string
        candidateId: string
        candidateName: string
        subject: string
        body: string
        templateId?: string
        templateName?: string
        type: 'interview' | 'trial' | 'offer' | 'rejection' | 'reminder' | 'general'
        bookingUrl?: string
        jobTitle?: string
        branchName?: string
      }, {
        success: boolean
        trackingId?: string
        error?: string
      }>(functions, 'sendCandidateEmail')

      // Determine email type from selected template or category filter
      const emailType = selectedTemplate?.category || categoryFilter || 'general'

      const result = await sendEmailFn({
        to: candidate.email,
        candidateId: candidate.id,
        candidateName: `${candidate.firstName} ${candidate.lastName}`,
        subject: emailSubject,
        body: emailContent,
        templateId: selectedTemplate?.id,
        templateName: selectedTemplate?.name,
        type: emailType as 'interview' | 'trial' | 'offer' | 'rejection' | 'reminder' | 'general',
        // Pass booking URL so HTML template placeholders are replaced
        bookingUrl: generatedBookingLink || undefined,
        jobTitle: candidate.jobTitle,
        branchName: branchName || candidate.branchName,
      })

      if (result.data.success) {
        // Update candidate status based on email type
        const db = getFirebaseDb()
        const candidateRef = doc(db, 'candidates', candidate.id)
        const previousStatus = candidate.status

        // Determine new status based on email type
        let newStatus: string | null = null
        if (emailType === 'interview') {
          newStatus = 'invite_sent'
        } else if (emailType === 'trial') {
          newStatus = 'trial_invited'
        }

        if (newStatus && previousStatus !== newStatus) {
          await updateDoc(candidateRef, {
            status: newStatus,
            updatedAt: serverTimestamp(),
          })

          await onLogActivity(
            candidate.id,
            'status_changed',
            `Status changed from ${previousStatus} to ${newStatus} (${emailType} invite sent)`,
            { status: previousStatus },
            { status: newStatus }
          )
        }

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
                      {template.isSystemTemplate && <span className="system-badge">🔒</span>}
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

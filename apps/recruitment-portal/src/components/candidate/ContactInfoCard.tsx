// ============================================================================
// Contact Info Card Component
// Extracted from CandidateDetail.tsx for better maintainability
// Location: apps/recruitment-portal/src/components/candidate/ContactInfoCard.tsx
// ============================================================================

import type { Candidate } from '@allied/shared-lib'
import { Card, Button } from '@allied/shared-ui'

// ============================================================================
// HELPERS
// ============================================================================

const formatPhone = (phone: string): string => {
  if (!phone) return '-'
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('07')) {
    return `${digits.slice(0, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`
  }
  return phone
}

// ============================================================================
// TYPES
// ============================================================================

interface ContactInfoCardProps {
  candidate: Candidate
  onCall: () => void
  onEmail: () => void
  onWhatsApp: () => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ContactInfoCard({ 
  candidate, 
  onCall, 
  onEmail, 
  onWhatsApp 
}: ContactInfoCardProps) {
  return (
    <Card className="detail-card">
      <h2>Contact Information</h2>
      <div className="contact-grid">
        <div className="contact-item">
          <span className="contact-label">Email</span>
          <a href={`mailto:${candidate.email}`} className="contact-value email-link">
            {candidate.email}
          </a>
        </div>
        <div className="contact-item">
          <span className="contact-label">Phone</span>
          <a href={`tel:${candidate.phone}`} className="contact-value phone-link">
            {formatPhone(candidate.phone)}
          </a>
        </div>
        {candidate.address && (
          <div className="contact-item full-width">
            <span className="contact-label">Address</span>
            <span className="contact-value">{candidate.address}</span>
          </div>
        )}
        {candidate.postcode && (
          <div className="contact-item">
            <span className="contact-label">Postcode</span>
            <span className="contact-value">{candidate.postcode}</span>
          </div>
        )}
      </div>
      <div className="contact-actions">
        <Button variant="outline" size="sm" onClick={onCall}>
          📞 Call
        </Button>
        <Button variant="outline" size="sm" onClick={onEmail}>
          ✉️ Email
        </Button>
        <Button variant="outline" size="sm" onClick={onWhatsApp}>
          💬 WhatsApp
        </Button>
      </div>
    </Card>
  )
}

export default ContactInfoCard

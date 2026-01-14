/**
 * Migration Function: Migrate to unified messageTemplates collection
 * Run once to upgrade from whatsappTemplates/emailTemplates to messageTemplates
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'

const db = admin.firestore()

// Default templates to seed if no templates exist
const DEFAULT_MESSAGE_TEMPLATES = [
  {
    name: 'Interview Invitation',
    description: 'Invite candidates to book an interview slot',
    category: 'interview',
    templateType: 'interview_invitation',
    channel: 'both',
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
  {
    name: 'Interview Confirmation',
    description: 'Sent automatically when interview is booked',
    category: 'confirmation',
    templateType: 'interview_confirmation',
    channel: 'email',
    subject: 'Interview Confirmed - {{jobTitle}} at Allied Pharmacies',
    plainContent: `Dear {{firstName}},

Your interview has been confirmed!

Date: {{interviewDate}}
Time: {{interviewTime}}
Duration: {{duration}}
Location: Microsoft Teams (Online)
Reference: {{confirmationCode}}

Join your interview: {{teamsLink}}

Before your interview:
- Test your camera and microphone
- Find a quiet location with good lighting
- Have your CV ready to reference

If you need to reschedule, please contact us as soon as possible.

Best regards,
Allied Pharmacies Recruitment Team`,
    htmlContent: '',
    placeholders: ['firstName', 'jobTitle', 'interviewDate', 'interviewTime', 'duration', 'confirmationCode', 'teamsLink'],
    active: true,
    isSystemTemplate: true,
    isDefault: true,
  },
  {
    name: 'Trial Invitation',
    description: 'Invite candidates to book a trial shift',
    category: 'trial',
    templateType: 'trial_invitation',
    channel: 'both',
    subject: 'Trial Shift Invitation - Allied Pharmacies',
    plainContent: `Hi {{firstName}},

Congratulations! Following your successful interview, we would like to invite you for a trial shift at {{branchName}}.

Please use this link to book your trial: {{interviewBookingLink}}

What to bring:
- GPhC registration (if applicable)
- Photo ID
- Smart professional attire

Best regards,
Allied Recruitment Team`,
    htmlContent: '',
    placeholders: ['firstName', 'branchName', 'interviewBookingLink'],
    active: true,
    isSystemTemplate: true,
    isDefault: true,
  },
  {
    name: 'Trial Confirmation',
    description: 'Sent automatically when trial is booked',
    category: 'confirmation',
    templateType: 'trial_confirmation',
    channel: 'email',
    subject: 'Trial Shift Confirmed - {{branchName}}',
    plainContent: `Dear {{firstName}},

Your trial shift has been confirmed!

Date: {{interviewDate}}
Time: {{interviewTime}}
Duration: {{duration}}
Location: {{branchName}}
Reference: {{confirmationCode}}

What to bring:
- Photo ID (passport or driving licence)
- GPhC registration card (if applicable)
- Right to work documents
- Comfortable, smart clothing

Important:
- Please arrive 10 minutes before your start time
- Ask for the Pharmacy Manager on arrival

Best of luck with your trial!

Best regards,
Allied Pharmacies Recruitment Team`,
    htmlContent: '',
    placeholders: ['firstName', 'branchName', 'interviewDate', 'interviewTime', 'duration', 'confirmationCode'],
    active: true,
    isSystemTemplate: true,
    isDefault: true,
  },
  {
    name: 'Job Offer',
    description: 'Extend a job offer to successful candidates',
    category: 'offer',
    templateType: 'job_offer',
    channel: 'both',
    subject: 'Job Offer - {{jobTitle}} at Allied Pharmacies',
    plainContent: `Dear {{firstName}},

We are delighted to offer you the position of {{jobTitle}} at {{branchName}}.

Please contact us to discuss the next steps and your start date.

Congratulations and welcome to the team!

Best regards,
Allied Pharmacies Recruitment Team`,
    htmlContent: '',
    placeholders: ['firstName', 'jobTitle', 'branchName'],
    active: true,
    isSystemTemplate: true,
    isDefault: true,
  },
  {
    name: 'Application Rejection',
    description: 'Politely decline unsuccessful candidates',
    category: 'rejection',
    templateType: 'rejection',
    channel: 'email',
    subject: 'Your Application to Allied Pharmacies',
    plainContent: `Dear {{firstName}},

Thank you for your interest in the {{jobTitle}} position at Allied Pharmacies and for taking the time to apply.

After careful consideration, we have decided not to proceed with your application at this time.

We appreciate your interest in joining our team and wish you all the best in your future endeavours.

Best regards,
Allied Pharmacies Recruitment Team`,
    htmlContent: '',
    placeholders: ['firstName', 'jobTitle'],
    active: true,
    isSystemTemplate: true,
    isDefault: true,
  },
]

export const migrateMessageTemplates = onCall(
  {
    cors: true,
    region: 'europe-west2',
  },
  async (request) => {
    // Require authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    try {
      const messageTemplatesRef = db.collection('messageTemplates')
      const existingSnapshot = await messageTemplatesRef.get()

      // If messageTemplates already has data, skip migration
      if (!existingSnapshot.empty) {
        return {
          success: true,
          message: 'Templates already migrated',
          count: existingSnapshot.size,
        }
      }

      // Try to migrate from whatsappTemplates
      const whatsappSnapshot = await db.collection('whatsappTemplates').get()
      let migratedCount = 0

      if (!whatsappSnapshot.empty) {
        // Migrate existing templates
        const batch = db.batch()

        whatsappSnapshot.forEach((doc) => {
          const data = doc.data()
          const newDocRef = messageTemplatesRef.doc()

          batch.set(newDocRef, {
            name: data.name,
            description: data.description || null,
            category: data.category || 'general',
            templateType: 'custom',
            channel: 'whatsapp',
            subject: data.subject || '',
            plainContent: data.content || '',
            htmlContent: null,
            placeholders: data.placeholders || [],
            active: data.active !== false,
            isSystemTemplate: false,
            isDefault: false,
            version: 1,
            createdAt: data.createdAt || admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            migratedFrom: 'whatsappTemplates',
            originalId: doc.id,
          })

          migratedCount++
        })

        await batch.commit()

        return {
          success: true,
          message: `Migrated ${migratedCount} templates from whatsappTemplates`,
          count: migratedCount,
        }
      }

      // No existing templates - seed with defaults
      const batch = db.batch()

      for (const template of DEFAULT_MESSAGE_TEMPLATES) {
        const docRef = messageTemplatesRef.doc()
        batch.set(docRef, {
          ...template,
          version: 1,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: 'system',
        })
        migratedCount++
      }

      await batch.commit()

      return {
        success: true,
        message: `Seeded ${migratedCount} default templates`,
        count: migratedCount,
      }
    } catch (error) {
      console.error('Migration error:', error)
      throw new HttpsError('internal', 'Migration failed')
    }
  }
)

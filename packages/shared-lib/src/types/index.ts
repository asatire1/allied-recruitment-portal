// ============================================================================
// Allied Recruitment Portal - Type Definitions
// Version: 1.0.0
//
// This file contains all TypeScript type definitions for the Firebase data models.
// These types are shared across all applications in the monorepo.
// ============================================================================

import { Timestamp } from 'firebase/firestore'

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

/** User roles in the system */
export type UserRole = 
  | 'super_admin'
  | 'recruiter'
  | 'branch_manager'
  | 'regional_manager'
  | 'viewer'

/** Entity types (company groups) */
export type EntityType = 'allied' | 'sharief' | 'core'

/** Candidate pipeline stages */
export type CandidateStatus =
  | 'new'
  | 'screening'
  | 'interview_scheduled'
  | 'interview_complete'
  | 'trial_scheduled'
  | 'trial_complete'
  | 'approved'
  | 'rejected'
  | 'withdrawn'

/** Job posting status */
export type JobStatus = 'draft' | 'active' | 'closed'

/** Job category types */
export type JobCategory =
  | 'clinical'      // Pharmacist, Pharmacy Technician
  | 'dispensary'    // Dispenser, Dispensary Assistant
  | 'retail'        // Counter Assistant, Sales
  | 'management'    // Branch Manager, Area Manager
  | 'support'       // Driver, Cleaner, Admin

/** Employment types */
export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'locum'

/** Salary period types */
export type SalaryPeriod = 'hourly' | 'annual'

/** Interview/trial types */
export type InterviewType = 'interview' | 'trial'

/** Interview status */
export type InterviewStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'

/** Booking link status */
export type BookingLinkStatus = 'active' | 'used' | 'expired' | 'revoked'

/** Feedback recommendation */
export type FeedbackRecommendation = 'hire' | 'maybe' | 'do_not_hire'

/** Duplicate status for candidates */
export type DuplicateStatus = 'primary' | 'linked' | 'reviewed_not_duplicate'

/** Qualification types */
export type QualificationType = 'registration' | 'degree' | 'certificate' | 'license'

/** Booking source */
export type BookingSource = 'manual' | 'self_service'

/** Feedback status */
export type FeedbackStatus = 'pending' | 'submitted' | 'reviewed'

// ============================================================================
// USER TYPES
// ============================================================================

/** Custom permission overrides for users */
export interface CustomPermissions {
  canViewAllCandidates?: boolean
  canEditCandidates?: boolean
  canDeleteCandidates?: boolean
  canDownloadCVs?: boolean
  canSendWhatsApp?: boolean
  canManageTemplates?: boolean
  canManageUsers?: boolean
  canExportData?: boolean
}

/** User document in Firestore */
export interface User {
  id: string
  
  // Basic Info
  email: string
  displayName: string
  phone?: string
  avatarUrl?: string
  
  // Role & Permissions
  role: UserRole
  permissions?: CustomPermissions
  
  // Assignments
  entities?: EntityType[]
  branchIds?: string[]
  regionIds?: string[]
  
  // Status
  active: boolean
  lastLoginAt?: Timestamp
  invitedAt?: Timestamp
  invitedBy?: string
  
  // Preferences
  emailNotifications: boolean
  pushNotifications: boolean
  
  // Metadata
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ============================================================================
// CANDIDATE TYPES
// ============================================================================

/** Candidate qualification record */
export interface CandidateQualification {
  qualificationId: string
  qualificationName: string
  registrationNumber?: string
  issuedAt?: Timestamp
  expiresAt?: Timestamp
  verified: boolean
  verifiedAt?: Timestamp
  verifiedBy?: string
  documentUrl?: string
}

/** Application history record for linked candidates */
export interface ApplicationRecord {
  candidateId: string
  jobId: string
  jobTitle: string
  branchId?: string
  branchName?: string
  appliedAt: Timestamp
  status: CandidateStatus
  outcome?: 'hired' | 'rejected' | 'withdrawn'
  outcomeDate?: Timestamp
  outcomeNotes?: string
}

/** Candidate document in Firestore */
export interface Candidate {
  id: string
  
  // Personal Info
  firstName: string
  lastName: string
  email: string
  phone: string
  phoneNormalized: string
  address?: string
  postcode?: string
  
  // Duplicate Detection
  duplicateKey: string
  linkedCandidateIds?: string[]
  primaryRecordId?: string
  duplicateStatus?: DuplicateStatus
  duplicateReviewedAt?: Timestamp
  duplicateReviewedBy?: string
  
  // Application Info
  jobId?: string
  jobTitle?: string
  branchId?: string
  branchName?: string
  source?: string
  status: CandidateStatus
  
  // Application History
  applicationHistory?: ApplicationRecord[]
  
  // CV Data
  cvUrl?: string
  cvFileName?: string
  cvStoragePath?: string
  cvText?: string
  
  // Parsed CV Data
  skills?: string[]
  yearsExperience?: number
  pharmacyExperience?: boolean
  rightToWork?: boolean
  
  // Qualifications
  qualifications?: CandidateQualification[]
  
  // Notes
  notes?: string
  
  // Metadata
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy?: string
}

/** Create candidate input (without auto-generated fields) */
export type CreateCandidateInput = Omit<Candidate, 'id' | 'createdAt' | 'updatedAt' | 'phoneNormalized' | 'duplicateKey'>

/** Update candidate input (partial) */
export type UpdateCandidateInput = Partial<Omit<Candidate, 'id' | 'createdAt' | 'createdBy'>>

// ============================================================================
// JOB TYPES
// ============================================================================

/** Job type configuration */
export interface JobType {
  id: string
  
  name: string
  category: JobCategory
  
  // Defaults
  defaultDescription: string
  defaultRequirements: string[]
  defaultQualifications: string[]
  
  // Salary guidance
  typicalSalaryMin?: number
  typicalSalaryMax?: number
  salaryPeriod: SalaryPeriod
  
  // Compliance
  requiresDBS: boolean
  requiresGPhC: boolean
  
  // Restrictions
  entities?: EntityType[]
  
  // Status
  active: boolean
  displayOrder: number
  
  // Metadata
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** Job posting document */
export interface Job {
  id: string
  
  // Job Type
  jobTypeId: string
  jobTypeName: string
  category: JobCategory
  
  // Location
  branchId: string
  branchName: string
  branchAddress: string
  
  // Basic Info
  title: string
  description: string
  
  // Employment Details
  employmentType: EmploymentType
  hoursPerWeek?: number
  salaryMin?: number
  salaryMax?: number
  salaryPeriod: SalaryPeriod
  
  // Entity
  entity: EntityType
  
  // Requirements
  requirements?: string[]
  qualificationsRequired?: string[]
  
  // Compliance
  requiresDBS: boolean
  requiresGPhC: boolean
  
  // Status
  status: JobStatus
  startDate?: Timestamp
  closingDate?: Timestamp
  
  // Multi-branch posting
  parentJobId?: string
  linkedBranchIds?: string[]
  
  // Metadata
  createdAt: Timestamp
  updatedAt: Timestamp
  closedAt?: Timestamp
  createdBy?: string
}

// ============================================================================
// INTERVIEW TYPES
// ============================================================================

/** Interview/trial document */
export interface Interview {
  id: string
  
  // References
  candidateId: string
  candidateName: string
  jobId?: string
  jobTitle?: string
  branchId: string
  branchName: string
  
  // Scheduling
  type: InterviewType
  scheduledAt: Timestamp
  duration: number
  location?: string
  
  // Status
  status: InterviewStatus
  
  // Notes & Feedback
  notes?: string
  feedback?: string
  rating?: number
  
  // Booking
  bookedVia: BookingSource
  bookingLinkId?: string
  
  // Metadata
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ============================================================================
// BOOKING LINK TYPES
// ============================================================================

/** Booking link for self-service scheduling */
export interface BookingLink {
  id: string
  
  // Secure Token (token field only returned once on creation)
  tokenHash: string
  
  // References
  candidateId: string
  candidateName: string
  candidateEmail?: string
  
  // Booking Details
  type: InterviewType
  jobId?: string
  jobTitle?: string
  location?: string
  
  // Security
  status: BookingLinkStatus
  expiresAt: Timestamp
  maxUses: number
  useCount: number
  
  // Verification
  requireEmailVerification: boolean
  verificationCode?: string
  
  // Audit
  usedAt?: Timestamp
  usedByIp?: string
  usedByUserAgent?: string
  
  // Resulting Interview
  interviewId?: string
  
  // Metadata
  createdAt: Timestamp
  createdBy: string
}

/** Booking link creation result (includes one-time token) */
export interface BookingLinkCreated {
  id: string
  url: string
  token: string
  expiresAt: Timestamp
}

// ============================================================================
// FEEDBACK TYPES
// ============================================================================

/** Trial feedback ratings */
export interface FeedbackRatings {
  overall: number
  punctuality: number
  customerService: number
  technicalCompetence: number
  teamFit: number
}

/** Trial feedback document */
export interface TrialFeedback {
  id: string
  
  // References
  candidateId: string
  candidateName: string
  interviewId: string
  branchId: string
  branchName: string
  jobId?: string
  jobTitle?: string
  
  // Submitted by
  submittedBy: string
  submittedByName: string
  
  // Ratings
  ratings: FeedbackRatings
  averageRating: number
  
  // Recommendation
  recommendation: FeedbackRecommendation
  wouldWorkWith: boolean
  
  // Comments
  strengths?: string
  areasForImprovement?: string
  additionalComments?: string
  
  // Status
  status: FeedbackStatus
  
  // Metadata
  trialDate: Timestamp
  submittedAt?: Timestamp
  reviewedAt?: Timestamp
  reviewedBy?: string
  createdAt: Timestamp
}

// ============================================================================
// BRANCH & REGION TYPES
// ============================================================================

/** Branch/pharmacy location */
export interface Branch {
  id: string
  
  name: string
  code?: string
  
  // Address
  address: string
  city: string
  postcode: string
  latitude?: number
  longitude?: number
  
  // Contact
  phone?: string
  email?: string
  
  // Manager
  managerId?: string
  managerName?: string
  
  // Entity & Region
  entity: EntityType
  regionId?: string
  regionName?: string
  
  // Trial Settings
  acceptingTrials: boolean
  
  // Status
  active: boolean
  
  // Metadata
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** Region grouping */
export interface Region {
  id: string
  
  name: string
  code?: string
  
  // Coverage
  branchIds: string[]
  
  // Manager
  managerId?: string
  managerName?: string
  
  // Entity
  entity: EntityType
  
  // Metadata
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ============================================================================
// QUALIFICATION TYPES
// ============================================================================

/** Qualification definition */
export interface Qualification {
  id: string
  
  name: string
  type: QualificationType
  issuingBody?: string
  
  // Tracking
  hasExpiryDate: boolean
  hasRegistrationNumber: boolean
  verificationUrl?: string
  
  // Status
  active: boolean
  
  // Metadata
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ============================================================================
// WHATSAPP TEMPLATE TYPES
// ============================================================================

/** WhatsApp message template category */
export type TemplateCategory = 
  | 'interview' 
  | 'trial' 
  | 'offer' 
  | 'rejection' 
  | 'reminder' 
  | 'general'

/** WhatsApp message template */
export interface WhatsAppTemplate {
  id: string
  
  name: string
  category: TemplateCategory
  content: string
  
  // Placeholders available
  placeholders: string[]
  
  // Status
  active: boolean
  
  // Metadata
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy?: string
}

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

/** Notification type */
export type NotificationType = 
  | 'interview_scheduled'
  | 'trial_scheduled'
  | 'feedback_required'
  | 'feedback_submitted'
  | 'candidate_status_change'
  | 'system'

/** User notification */
export interface Notification {
  id: string
  
  userId: string
  type: NotificationType
  title: string
  message: string
  
  // Link to related entity
  entityType?: string
  entityId?: string
  link?: string
  
  // Status
  read: boolean
  readAt?: Timestamp
  
  // Metadata
  createdAt: Timestamp
}

// ============================================================================
// ACTIVITY LOG TYPES
// ============================================================================

/** Activity log action types */
export type ActivityAction = 
  | 'created'
  | 'updated'
  | 'deleted'
  | 'status_changed'
  | 'cv_uploaded'
  | 'cv_parsed'
  | 'interview_scheduled'
  | 'feedback_submitted'
  | 'message_sent'
  | 'booking_link_created'
  | 'booking_link_used'

/** Activity log entry */
export interface ActivityLog {
  id: string
  
  // What was changed
  entityType: string
  entityId: string
  action: ActivityAction
  
  // Details
  description: string
  previousValue?: Record<string, unknown>
  newValue?: Record<string, unknown>
  
  // Who made the change
  userId: string
  userName: string
  
  // Metadata
  createdAt: Timestamp
}

// ============================================================================
// SETTINGS TYPES
// ============================================================================

/** Availability slot configuration */
export interface AvailabilitySlot {
  dayOfWeek: number // 0 = Sunday, 6 = Saturday
  startTime: string // "09:00"
  endTime: string   // "17:00"
  enabled: boolean
}

/** Booking availability settings */
export interface AvailabilitySettings {
  id: string
  
  // General
  slotDuration: number // minutes
  bufferTime: number   // minutes between slots
  maxAdvanceBooking: number // days
  
  // Weekly schedule
  slots: AvailabilitySlot[]
  
  // Blocked dates
  blockedDates: Timestamp[]
  
  // Metadata
  updatedAt: Timestamp
  updatedBy: string
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/** Generic Firestore document with ID */
export interface FirestoreDocument {
  id: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** Pagination options */
export interface PaginationOptions {
  limit?: number
  startAfter?: Timestamp | string
  orderBy?: string
  orderDirection?: 'asc' | 'desc'
}

/** Paginated result */
export interface PaginatedResult<T> {
  data: T[]
  hasMore: boolean
  lastDoc?: string
  total?: number
}

/** Filter options for candidates */
export interface CandidateFilters {
  status?: CandidateStatus | CandidateStatus[]
  branchId?: string
  jobId?: string
  source?: string
  dateFrom?: Timestamp
  dateTo?: Timestamp
  search?: string
}

/** Filter options for jobs */
export interface JobFilters {
  status?: JobStatus | JobStatus[]
  branchId?: string
  entity?: EntityType
  category?: JobCategory
}

/** Filter options for interviews */
export interface InterviewFilters {
  type?: InterviewType
  status?: InterviewStatus
  branchId?: string
  candidateId?: string
  dateFrom?: Timestamp
  dateTo?: Timestamp
}

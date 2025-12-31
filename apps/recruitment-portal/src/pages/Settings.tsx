import { useEffect, useState } from 'react'
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import {
  getFirebaseDb,
  PLACEHOLDER_DEFINITIONS,
  type PlaceholderDefinition,
  DEFAULT_INTERVIEW_AVAILABILITY,
  DEFAULT_TRIAL_AVAILABILITY,
} from '@allied/shared-lib'
import type {
  AvailabilitySlot,
  InterviewAvailabilitySettings,
  TrialAvailabilitySettings
} from '@allied/shared-lib'
import { Card, Button, Input, Spinner, Modal, Select, Textarea } from '@allied/shared-ui'
import { useAuth } from '../contexts/AuthContext'
import { BookingBlocksSettings } from '../components/BookingBlocksSettings'
import './Settings.css'

// ============================================================================
// TYPES
// ============================================================================

interface JobCategory {
  id: string
  value: string  // e.g., 'clinical', 'dispensary'
  label: string  // Display name
  color: string  // Hex color for UI
  isActive: boolean
  order: number  // For sorting
  createdAt: any
  createdBy: string
}

interface JobTitle {
  id: string
  title: string
  category: string  // Now dynamic, references JobCategory.value
  descriptionTemplate?: string  // Template job description
  isActive: boolean
  createdAt: any
  createdBy: string
}

interface Entity {
  id: string
  name: string
  shortCode: string  // e.g., 'allied', 'sharief', 'core'
  isDefault: boolean
  isActive: boolean
  createdAt: any
  updatedAt?: any
  createdBy: string
}

interface Location {
  id: string
  name: string
  address?: string
  city?: string
  postcode?: string
  region?: string
  isActive: boolean
  createdAt: any
  createdBy: string
}

interface SettingsTab {
  id: string
  label: string
  icon: string
}

// WhatsApp Template types
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

// ============================================================================
// CONSTANTS
// ============================================================================

const SETTINGS_TABS: SettingsTab[] = [
  { id: 'entities', label: 'Entities', icon: '🏢' },
  { id: 'job-titles', label: 'Job Titles', icon: '💼' },
  { id: 'interview-availability', label: 'Interview Availability', icon: '📅' },
  { id: 'trial-availability', label: 'Trial Availability', icon: '🏥' },
  { id: 'booking-blocks', label: 'Booking Restrictions', icon: '🚫' },
  { id: 'whatsapp-templates', label: 'WhatsApp Templates', icon: '💬' },
  { id: 'general', label: 'General', icon: '⚙️' },
]

const TEMPLATE_CATEGORIES = [
  { value: 'interview', label: 'Interview', color: '#3b82f6' },
  { value: 'trial', label: 'Trial', color: '#8b5cf6' },
  { value: 'offer', label: 'Offer', color: '#10b981' },
  { value: 'rejection', label: 'Rejection', color: '#ef4444' },
  { value: 'reminder', label: 'Reminder', color: '#f59e0b' },
  { value: 'general', label: 'General', color: '#6b7280' },
]

// Available placeholders for WhatsApp templates
// Use shared placeholder definitions
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

We're delighted to offer you the {{jobTitle}} position at {{branchName}}.

Our recruitment team will be in touch shortly with the formal offer letter and next steps.

Congratulations and welcome to the Allied Pharmacies team!

Best regards,
Allied Pharmacies Recruitment`,
    placeholders: ['firstName', 'jobTitle', 'branchName'],
    active: true,
  },
  {
    name: 'Application Unsuccessful',
    category: 'rejection',
    content: `Hi {{firstName}},

Thank you for your interest in the {{jobTitle}} position and for taking the time to meet with us.

After careful consideration, we've decided to move forward with other candidates whose experience more closely matches our current requirements.

We'll keep your details on file and may be in touch if a suitable opportunity arises.

We wish you all the best in your job search.

Kind regards,
Allied Pharmacies Recruitment`,
    placeholders: ['firstName', 'jobTitle'],
    active: true,
  },
  {
    name: 'Follow Up - Application Status',
    category: 'general',
    content: `Hi {{firstName}},

Thank you for your patience regarding your application for the {{jobTitle}} position.

We're currently reviewing all applications and will be in touch within the next few days with an update.

If you have any questions in the meantime, please don't hesitate to reach out.

Best regards,
Allied Pharmacies Recruitment`,
    placeholders: ['firstName', 'jobTitle'],
    active: true,
  },
  {
    name: 'Request for Documents',
    category: 'general',
    content: `Hi {{firstName}},

We're progressing with your application for the {{jobTitle}} position and need a few documents from you:

• Proof of right to work in the UK
• Photo ID
• Any relevant professional certificates

Please send these at your earliest convenience.

Thank you!
Allied Pharmacies Recruitment`,
    placeholders: ['firstName', 'jobTitle'],
    active: true,
  },
]

const DEFAULT_JOB_CATEGORIES = [
  { value: 'clinical', label: 'Clinical', color: '#8b5cf6', order: 1 },
  { value: 'dispensary', label: 'Dispensary', color: '#06b6d4', order: 2 },
  { value: 'retail', label: 'Retail', color: '#f59e0b', order: 3 },
  { value: 'management', label: 'Management', color: '#3b82f6', order: 4 },
  { value: 'support', label: 'Support', color: '#6b7280', order: 5 },
]

const DEFAULT_JOB_TITLES = [
  {
    title: 'Pharmacist',
    category: 'clinical',
    descriptionTemplate: `We are looking for a qualified Pharmacist to join our team.

Key Responsibilities:
• Dispense prescription medications accurately and safely
• Provide expert advice on medications and healthcare products
• Conduct medicine use reviews and health checks
• Manage pharmacy operations and supervise staff
• Ensure compliance with GPhC standards

Requirements:
• MPharm degree or equivalent
• GPhC registration
• Strong communication and customer service skills
• Attention to detail and accuracy`
  },
  {
    title: 'Pharmacy Technician',
    category: 'clinical',
    descriptionTemplate: `We are seeking a Pharmacy Technician to support our pharmacy team.

Key Responsibilities:
• Assist in dispensing prescriptions under pharmacist supervision
• Manage stock levels and ordering
• Process NHS prescriptions and paperwork
• Provide excellent customer service
• Maintain accurate records

Requirements:
• NVQ Level 3 in Pharmacy Services or equivalent
• GPhC registration as Pharmacy Technician
• Good organisational skills
• Experience in community pharmacy preferred`
  },
  {
    title: 'Dispenser',
    category: 'dispensary',
    descriptionTemplate: `We are looking for a Dispenser to join our busy dispensary team.

Key Responsibilities:
• Accurately dispense prescriptions
• Label and check medications
• Manage prescription queries
• Maintain dispensary organisation
• Support the pharmacy team

Requirements:
• NVQ Level 2 in Pharmacy Services or willingness to train
• Attention to detail
• Good communication skills
• Ability to work under pressure`
  },
  {
    title: 'Dispensary Assistant',
    category: 'dispensary',
    descriptionTemplate: `Join our team as a Dispensary Assistant.

Key Responsibilities:
• Support dispensary operations
• Assist with prescription assembly
• Maintain stock and dispensary cleanliness
• Handle prescription queries
• Provide customer support

Requirements:
• Interest in pharmacy and healthcare
• Good attention to detail
• Willingness to learn
• Team player attitude`
  },
  {
    title: 'Counter Assistant',
    category: 'retail',
    descriptionTemplate: `We are recruiting a Counter Assistant for our pharmacy.

Key Responsibilities:
• Serve customers at the counter
• Handle cash and card transactions
• Advise on over-the-counter products
• Maintain shop floor presentation
• Support pharmacy team as needed

Requirements:
• Excellent customer service skills
• Cash handling experience
• Good communication skills
• Flexible and reliable`
  },
  {
    title: 'Healthcare Assistant',
    category: 'retail',
    descriptionTemplate: `Join us as a Healthcare Assistant.

Key Responsibilities:
• Provide healthcare advice to customers
• Support pharmacy services
• Conduct basic health checks
• Promote health and wellness products
• Maintain product knowledge

Requirements:
• Interest in health and wellness
• Good customer service skills
• Willingness to undertake training
• Friendly and approachable manner`
  },
  {
    title: 'Branch Manager',
    category: 'management',
    descriptionTemplate: `We are seeking an experienced Branch Manager to lead our pharmacy.

Key Responsibilities:
• Oversee all branch operations
• Manage and develop staff team
• Ensure targets and KPIs are met
• Maintain compliance and standards
• Drive business growth and profitability

Requirements:
• Proven management experience
• Strong leadership skills
• Commercial awareness
• Pharmacy experience preferred
• Excellent organisational abilities`
  },
  {
    title: 'Area Manager',
    category: 'management',
    descriptionTemplate: `We are looking for an Area Manager to oversee multiple pharmacy branches.

Key Responsibilities:
• Manage performance of multiple branches
• Lead and develop branch managers
• Implement company strategies
• Ensure regulatory compliance
• Drive growth across the region

Requirements:
• Multi-site management experience
• Strong leadership and coaching skills
• Strategic thinking ability
• Full UK driving licence
• Pharmacy sector experience preferred`
  },
  {
    title: 'Delivery Driver',
    category: 'support',
    descriptionTemplate: `Join our team as a Delivery Driver.

Key Responsibilities:
• Deliver prescriptions to customers
• Maintain delivery schedule
• Provide excellent customer service
• Keep accurate delivery records
• Maintain vehicle cleanliness

Requirements:
• Full UK driving licence
• Clean driving record
• Good knowledge of local area
• Reliable and punctual
• Customer-focused attitude`
  },
  {
    title: 'Store Assistant',
    category: 'support',
    descriptionTemplate: `We are recruiting a Store Assistant to join our team.

Key Responsibilities:
• Stock shelves and maintain displays
• Assist customers with queries
• Support general store operations
• Maintain cleanliness and organisation
• Help with deliveries and stock

Requirements:
• Reliable and hardworking
• Good communication skills
• Ability to work as part of a team
• Flexible availability
• Physical fitness for stock handling`
  },
]

const UK_REGIONS = [
  'London',
  'South East',
  'South West',
  'East of England',
  'West Midlands',
  'East Midlands',
  'Yorkshire',
  'North West',
  'North East',
  'Wales',
  'Scotland',
  'Northern Ireland',
]

// ============================================================================
// COMPONENT
// ============================================================================

export function Settings() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('entities')
  
  // Entities state
  const [entities, setEntities] = useState<Entity[]>([])
  const [loadingEntities, setLoadingEntities] = useState(true)
  const [savingEntity, setSavingEntity] = useState(false)
  const [showEntityModal, setShowEntityModal] = useState(false)
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null)
  const [entityForm, setEntityForm] = useState({ name: '', shortCode: '', isDefault: false })
  const [entityFormError, setEntityFormError] = useState('')
  const [showDeleteEntityModal, setShowDeleteEntityModal] = useState(false)
  const [deletingEntity, setDeletingEntity] = useState<Entity | null>(null)
  const [deletingEntityLoading, setDeletingEntityLoading] = useState(false)

  // Job Titles state
  const [jobTitles, setJobTitles] = useState<JobTitle[]>([])
  const [loadingJobTitles, setLoadingJobTitles] = useState(true)
  const [savingJobTitle, setSavingJobTitle] = useState(false)
  const [showJobTitleModal, setShowJobTitleModal] = useState(false)
  const [editingJobTitle, setEditingJobTitle] = useState<JobTitle | null>(null)
  const [jobTitleForm, setJobTitleForm] = useState({ title: '', category: 'clinical', descriptionTemplate: '' })
  const [jobTitleFormError, setJobTitleFormError] = useState('')
  const [showDeleteJobTitleModal, setShowDeleteJobTitleModal] = useState(false)
  const [deletingJobTitle, setDeletingJobTitle] = useState<JobTitle | null>(null)
  const [deletingJobTitleLoading, setDeletingJobTitleLoading] = useState(false)

  // Job Categories state
  const [jobCategories, setJobCategories] = useState<JobCategory[]>([])
  const [loadingJobCategories, setLoadingJobCategories] = useState(true)
  const [savingJobCategory, setSavingJobCategory] = useState(false)
  const [showJobCategoryModal, setShowJobCategoryModal] = useState(false)
  const [editingJobCategory, setEditingJobCategory] = useState<JobCategory | null>(null)
  const [jobCategoryForm, setJobCategoryForm] = useState({ value: '', label: '', color: '#6b7280' })
  const [jobCategoryFormError, setJobCategoryFormError] = useState('')
  const [showDeleteJobCategoryModal, setShowDeleteJobCategoryModal] = useState(false)
  const [deletingJobCategory, setDeletingJobCategory] = useState<JobCategory | null>(null)
  const [deletingJobCategoryLoading, setDeletingJobCategoryLoading] = useState(false)

  // Locations state
  const [locations, setLocations] = useState<Location[]>([])
  const [loadingLocations, setLoadingLocations] = useState(true)
  const [savingLocation, setSavingLocation] = useState(false)
  const [showLocationModal, setShowLocationModal] = useState(false)
  const [editingLocation, setEditingLocation] = useState<Location | null>(null)
  const [locationForm, setLocationForm] = useState({ name: '', address: '', city: '', postcode: '', region: '' })
  const [locationFormError, setLocationFormError] = useState('')
  const [showDeleteLocationModal, setShowDeleteLocationModal] = useState(false)
  const [deletingLocation, setDeletingLocation] = useState<Location | null>(null)
  const [deletingLocationLoading, setDeletingLocationLoading] = useState(false)
  const [locationSearch, setLocationSearch] = useState('')

  // WhatsApp Templates state
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

  // Interview Availability state
  const [interviewAvailability, setInterviewAvailability] = useState<InterviewAvailabilitySettings | null>(null)
  const [loadingInterviewAvailability, setLoadingInterviewAvailability] = useState(true)
  const [savingInterviewAvailability, setSavingInterviewAvailability] = useState(false)
  const [interviewAvailabilityForm, setInterviewAvailabilityForm] = useState({
    slotDuration: 30,
    bufferTime: 15,
    maxAdvanceBooking: 14,
    minNoticeHours: 24,
    slots: [...DEFAULT_INTERVIEW_AVAILABILITY.slots] as AvailabilitySlot[],
  })
  const [interviewBlockedDates, setInterviewBlockedDates] = useState<string[]>([])
  const [newInterviewBlockedDate, setNewInterviewBlockedDate] = useState('')

  // Trial Availability state
  const [trialAvailability, setTrialAvailability] = useState<TrialAvailabilitySettings | null>(null)
  const [loadingTrialAvailability, setLoadingTrialAvailability] = useState(true)
  const [savingTrialAvailability, setSavingTrialAvailability] = useState(false)
  const [trialAvailabilityForm, setTrialAvailabilityForm] = useState({
    trialDuration: 240, // Fixed 4 hours
    bufferTime: 30,
    maxAdvanceBooking: 21,
    minNoticeHours: 48,
    maxTrialsPerDay: 2,
    slots: [...DEFAULT_TRIAL_AVAILABILITY.slots] as AvailabilitySlot[],
  })
  const [trialBlockedDates, setTrialBlockedDates] = useState<string[]>([])
  const [newTrialBlockedDate, setNewTrialBlockedDate] = useState('')

  const db = getFirebaseDb()

  // ============================================================================
  // FETCH DATA
  // ============================================================================

  // Fetch entities
  useEffect(() => {
    async function fetchEntities() {
      try {
        setLoadingEntities(true)
        const entitiesRef = collection(db, 'entities')
        const snapshot = await getDocs(entitiesRef)
        
        if (snapshot.empty) {
          console.log('No entities found, initializing defaults...')
          await initializeDefaultEntities()
        } else {
          const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Entity[]
          data.sort((a, b) => {
            // Default entity first, then alphabetical
            if (a.isDefault && !b.isDefault) return -1
            if (!a.isDefault && b.isDefault) return 1
            return a.name.localeCompare(b.name)
          })
          setEntities(data)
        }
      } catch (err) {
        console.error('Error fetching entities:', err)
      } finally {
        setLoadingEntities(false)
      }
    }

    fetchEntities()
  }, [db])

  // Fetch job titles
  useEffect(() => {
    async function fetchJobTitles() {
      try {
        setLoadingJobTitles(true)
        const jobTitlesRef = collection(db, 'jobTitles')
        const snapshot = await getDocs(jobTitlesRef)
        
        if (snapshot.empty) {
          console.log('No job titles found, initializing defaults...')
          await initializeDefaultJobTitles()
        } else {
          const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as JobTitle[]
          data.sort((a, b) => {
            if (a.category !== b.category) return a.category.localeCompare(b.category)
            return a.title.localeCompare(b.title)
          })
          setJobTitles(data)
        }
      } catch (err) {
        console.error('Error fetching job titles:', err)
      } finally {
        setLoadingJobTitles(false)
      }
    }

    fetchJobTitles()
  }, [db])

  // Fetch job categories
  useEffect(() => {
    async function fetchJobCategories() {
      try {
        setLoadingJobCategories(true)
        const categoriesRef = collection(db, 'jobCategories')
        const snapshot = await getDocs(categoriesRef)
        
        if (snapshot.empty) {
          console.log('No job categories found, initializing defaults...')
          await initializeDefaultJobCategories()
        } else {
          const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as JobCategory[]
          data.sort((a, b) => a.order - b.order)
          setJobCategories(data)
        }
      } catch (err) {
        console.error('Error fetching job categories:', err)
      } finally {
        setLoadingJobCategories(false)
      }
    }

    fetchJobCategories()
  }, [db])

  // Fetch locations
  useEffect(() => {
    async function fetchLocations() {
      try {
        setLoadingLocations(true)
        const locationsRef = collection(db, 'locations')
        const snapshot = await getDocs(locationsRef)
        
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Location[]
        
        data.sort((a, b) => a.name.localeCompare(b.name))
        setLocations(data)
      } catch (err) {
        console.error('Error fetching locations:', err)
      } finally {
        setLoadingLocations(false)
      }
    }

    fetchLocations()
  }, [db])

  // Fetch WhatsApp templates
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

  // Fetch interview availability settings
  useEffect(() => {
    async function fetchInterviewAvailability() {
      try {
        setLoadingInterviewAvailability(true)
        const docRef = doc(db, 'settings', 'interviewAvailability')
        const docSnap = await getDoc(docRef)
        
        if (docSnap.exists()) {
          const data = docSnap.data() as InterviewAvailabilitySettings
          setInterviewAvailability({ ...data, id: docSnap.id })
          setInterviewAvailabilityForm({
            slotDuration: data.slotDuration || 30,
            bufferTime: data.bufferTime || 15,
            maxAdvanceBooking: data.maxAdvanceBooking || 14,
            minNoticeHours: data.minNoticeHours || 24,
            slots: data.slots || [...DEFAULT_INTERVIEW_AVAILABILITY.slots],
          })
          // Convert timestamps to date strings
          const blockedDates = (data.blockedDates || []).map((d: any) => {
            const date = d.toDate ? d.toDate() : new Date(d)
            return date.toISOString().split('T')[0]
          })
          setInterviewBlockedDates(blockedDates)
        } else {
          // Initialize with defaults
          setInterviewAvailabilityForm({
            slotDuration: DEFAULT_INTERVIEW_AVAILABILITY.slotDuration,
            bufferTime: DEFAULT_INTERVIEW_AVAILABILITY.bufferTime,
            maxAdvanceBooking: DEFAULT_INTERVIEW_AVAILABILITY.maxAdvanceBooking,
            minNoticeHours: DEFAULT_INTERVIEW_AVAILABILITY.minNoticeHours,
            slots: [...DEFAULT_INTERVIEW_AVAILABILITY.slots],
          })
        }
      } catch (err) {
        console.error('Error fetching interview availability:', err)
      } finally {
        setLoadingInterviewAvailability(false)
      }
    }

    fetchInterviewAvailability()
  }, [db])

  // Fetch trial availability settings
  useEffect(() => {
    async function fetchTrialAvailability() {
      try {
        setLoadingTrialAvailability(true)
        const docRef = doc(db, 'settings', 'trialAvailability')
        const docSnap = await getDoc(docRef)
        
        if (docSnap.exists()) {
          const data = docSnap.data() as TrialAvailabilitySettings
          setTrialAvailability({ ...data, id: docSnap.id })
          setTrialAvailabilityForm({
            trialDuration: data.trialDuration || 240,
            bufferTime: data.bufferTime || 30,
            maxAdvanceBooking: data.maxAdvanceBooking || 21,
            minNoticeHours: data.minNoticeHours || 48,
            maxTrialsPerDay: data.maxTrialsPerDay || 2,
            slots: data.slots || [...DEFAULT_TRIAL_AVAILABILITY.slots],
          })
          // Convert timestamps to date strings
          const blockedDates = (data.blockedDates || []).map((d: any) => {
            const date = d.toDate ? d.toDate() : new Date(d)
            return date.toISOString().split('T')[0]
          })
          setTrialBlockedDates(blockedDates)
        } else {
          // Initialize with defaults
          setTrialAvailabilityForm({
            trialDuration: DEFAULT_TRIAL_AVAILABILITY.trialDuration,
            bufferTime: DEFAULT_TRIAL_AVAILABILITY.bufferTime,
            maxAdvanceBooking: DEFAULT_TRIAL_AVAILABILITY.maxAdvanceBooking,
            minNoticeHours: DEFAULT_TRIAL_AVAILABILITY.minNoticeHours,
            maxTrialsPerDay: DEFAULT_TRIAL_AVAILABILITY.maxTrialsPerDay,
            slots: [...DEFAULT_TRIAL_AVAILABILITY.slots],
          })
        }
      } catch (err) {
        console.error('Error fetching trial availability:', err)
      } finally {
        setLoadingTrialAvailability(false)
      }
    }

    fetchTrialAvailability()
  }, [db])

  // Initialize default job titles
  const initializeDefaultJobTitles = async () => {
    try {
      const jobTitlesRef = collection(db, 'jobTitles')
      const newTitles: JobTitle[] = []

      for (const defaultTitle of DEFAULT_JOB_TITLES) {
        const docRef = await addDoc(jobTitlesRef, {
          title: defaultTitle.title,
          category: defaultTitle.category,
          descriptionTemplate: defaultTitle.descriptionTemplate || '',
          isActive: true,
          createdAt: serverTimestamp(),
          createdBy: user?.id || 'system',
        })
        newTitles.push({
          id: docRef.id,
          title: defaultTitle.title,
          category: defaultTitle.category,
          descriptionTemplate: defaultTitle.descriptionTemplate || '',
          isActive: true,
          createdAt: new Date(),
          createdBy: user?.id || 'system',
        })
      }

      setJobTitles(newTitles)
    } catch (err) {
      console.error('Error initializing defaults:', err)
    }
  }

  // Initialize default job categories
  const initializeDefaultJobCategories = async () => {
    try {
      const categoriesRef = collection(db, 'jobCategories')
      const newCategories: JobCategory[] = []

      for (const defaultCat of DEFAULT_JOB_CATEGORIES) {
        const docRef = await addDoc(categoriesRef, {
          value: defaultCat.value,
          label: defaultCat.label,
          color: defaultCat.color,
          order: defaultCat.order,
          isActive: true,
          createdAt: serverTimestamp(),
          createdBy: user?.id || 'system',
        })
        newCategories.push({
          id: docRef.id,
          value: defaultCat.value,
          label: defaultCat.label,
          color: defaultCat.color,
          order: defaultCat.order,
          isActive: true,
          createdAt: new Date(),
          createdBy: user?.id || 'system',
        })
      }

      newCategories.sort((a, b) => a.order - b.order)
      setJobCategories(newCategories)
    } catch (err) {
      console.error('Error initializing job categories:', err)
    }
  }

  // Initialize default entities
  const initializeDefaultEntities = async () => {
    try {
      const entitiesRef = collection(db, 'entities')
      const defaultEntities = [
        { name: 'Allied Pharmacies', shortCode: 'allied', isDefault: true },
        { name: 'Sharief Healthcare', shortCode: 'sharief', isDefault: false },
        { name: 'Core Pharmaceuticals', shortCode: 'core', isDefault: false },
      ]
      const newEntities: Entity[] = []

      for (const defaultEntity of defaultEntities) {
        const docRef = await addDoc(entitiesRef, {
          name: defaultEntity.name,
          shortCode: defaultEntity.shortCode,
          isDefault: defaultEntity.isDefault,
          isActive: true,
          createdAt: serverTimestamp(),
          createdBy: user?.id || 'system',
        })
        newEntities.push({
          id: docRef.id,
          name: defaultEntity.name,
          shortCode: defaultEntity.shortCode,
          isDefault: defaultEntity.isDefault,
          isActive: true,
          createdAt: new Date(),
          createdBy: user?.id || 'system',
        })
      }

      setEntities(newEntities)
    } catch (err) {
      console.error('Error initializing default entities:', err)
    }
  }

  // Entity CRUD handlers
  const handleSaveEntity = async () => {
    if (!entityForm.name.trim()) {
      setEntityFormError('Entity name is required')
      return
    }
    if (!entityForm.shortCode.trim()) {
      setEntityFormError('Short code is required')
      return
    }

    // Check for duplicate short codes
    const isDuplicate = entities.some(e =>
      e.shortCode.toLowerCase() === entityForm.shortCode.toLowerCase() &&
      e.id !== editingEntity?.id
    )
    if (isDuplicate) {
      setEntityFormError('An entity with this short code already exists')
      return
    }

    setSavingEntity(true)
    setEntityFormError('')

    try {
      const entitiesRef = collection(db, 'entities')

      if (editingEntity) {
        // Update existing
        const docRef = doc(db, 'entities', editingEntity.id)
        
        // If setting as default, unset other defaults first
        if (entityForm.isDefault && !editingEntity.isDefault) {
          for (const entity of entities) {
            if (entity.isDefault) {
              await updateDoc(doc(db, 'entities', entity.id), { isDefault: false })
            }
          }
        }

        await updateDoc(docRef, {
          name: entityForm.name.trim(),
          shortCode: entityForm.shortCode.toLowerCase().trim(),
          isDefault: entityForm.isDefault,
          updatedAt: serverTimestamp(),
        })

        setEntities(prev => prev.map(e =>
          e.id === editingEntity.id
            ? { ...e, name: entityForm.name.trim(), shortCode: entityForm.shortCode.toLowerCase().trim(), isDefault: entityForm.isDefault }
            : entityForm.isDefault ? { ...e, isDefault: false } : e
        ))
      } else {
        // Add new
        // If setting as default, unset other defaults first
        if (entityForm.isDefault) {
          for (const entity of entities) {
            if (entity.isDefault) {
              await updateDoc(doc(db, 'entities', entity.id), { isDefault: false })
            }
          }
        }

        const docRef = await addDoc(entitiesRef, {
          name: entityForm.name.trim(),
          shortCode: entityForm.shortCode.toLowerCase().trim(),
          isDefault: entityForm.isDefault,
          isActive: true,
          createdAt: serverTimestamp(),
          createdBy: user?.id || 'system',
        })

        const newEntity: Entity = {
          id: docRef.id,
          name: entityForm.name.trim(),
          shortCode: entityForm.shortCode.toLowerCase().trim(),
          isDefault: entityForm.isDefault,
          isActive: true,
          createdAt: new Date(),
          createdBy: user?.id || 'system',
        }

        setEntities(prev => {
          const updated = entityForm.isDefault
            ? prev.map(e => ({ ...e, isDefault: false }))
            : prev
          return [...updated, newEntity].sort((a, b) => {
            if (a.isDefault && !b.isDefault) return -1
            if (!a.isDefault && b.isDefault) return 1
            return a.name.localeCompare(b.name)
          })
        })
      }

      setShowEntityModal(false)
      setEditingEntity(null)
      setEntityForm({ name: '', shortCode: '', isDefault: false })
    } catch (err) {
      console.error('Error saving entity:', err)
      setEntityFormError('Failed to save entity')
    } finally {
      setSavingEntity(false)
    }
  }

  const handleDeleteEntity = async () => {
    if (!deletingEntity) return

    // Don't allow deleting the default entity
    if (deletingEntity.isDefault) {
      setEntityFormError('Cannot delete the default entity. Set another entity as default first.')
      return
    }

    setDeletingEntityLoading(true)

    try {
      await deleteDoc(doc(db, 'entities', deletingEntity.id))
      setEntities(prev => prev.filter(e => e.id !== deletingEntity.id))
      setShowDeleteEntityModal(false)
      setDeletingEntity(null)
    } catch (err) {
      console.error('Error deleting entity:', err)
    } finally {
      setDeletingEntityLoading(false)
    }
  }

  const handleToggleEntityActive = async (entity: Entity) => {
    // Don't allow deactivating the default entity
    if (entity.isDefault && entity.isActive) {
      return
    }

    try {
      const docRef = doc(db, 'entities', entity.id)
      await updateDoc(docRef, { isActive: !entity.isActive })
      setEntities(prev => prev.map(e =>
        e.id === entity.id ? { ...e, isActive: !e.isActive } : e
      ))
    } catch (err) {
      console.error('Error toggling entity:', err)
    }
  }

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
          createdBy: user?.id || 'system',
        })
        newTemplates.push({
          id: docRef.id,
          ...defaultTemplate,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: user?.id || 'system',
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

  // Extract placeholders from template content
  const extractPlaceholders = (content: string): string[] => {
    const matches = content.match(/\{\{(\w+)\}\}/g) || []
    return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))]
  }

  // ============================================================================
  // JOB TITLES HANDLERS
  // ============================================================================

  const handleAddJobTitle = () => {
    setEditingJobTitle(null)
    const defaultCategory = jobCategories.length > 0 ? jobCategories[0].value : 'clinical'
    setJobTitleForm({ title: '', category: defaultCategory, descriptionTemplate: '' })
    setJobTitleFormError('')
    setShowJobTitleModal(true)
  }

  const handleEditJobTitle = (jobTitle: JobTitle) => {
    setEditingJobTitle(jobTitle)
    setJobTitleForm({
      title: jobTitle.title,
      category: jobTitle.category,
      descriptionTemplate: jobTitle.descriptionTemplate || ''
    })
    setJobTitleFormError('')
    setShowJobTitleModal(true)
  }

  const handleSaveJobTitle = async () => {
    if (!jobTitleForm.title.trim()) {
      setJobTitleFormError('Job title is required')
      return
    }

    // Check for duplicates
    const duplicate = jobTitles.find(
      jt => jt.title.toLowerCase() === jobTitleForm.title.trim().toLowerCase() &&
           jt.id !== editingJobTitle?.id
    )
    if (duplicate) {
      setJobTitleFormError('A job title with this name already exists')
      return
    }

    try {
      setSavingJobTitle(true)
      const jobTitlesRef = collection(db, 'jobTitles')

      if (editingJobTitle) {
        await updateDoc(doc(db, 'jobTitles', editingJobTitle.id), {
          title: jobTitleForm.title.trim(),
          category: jobTitleForm.category,
          descriptionTemplate: jobTitleForm.descriptionTemplate.trim(),
          updatedAt: serverTimestamp(),
        })
        setJobTitles(prev => prev.map(jt =>
          jt.id === editingJobTitle.id
            ? {
                ...jt,
                title: jobTitleForm.title.trim(),
                category: jobTitleForm.category,
                descriptionTemplate: jobTitleForm.descriptionTemplate.trim()
              }
            : jt
        ))
      } else {
        const docRef = await addDoc(jobTitlesRef, {
          title: jobTitleForm.title.trim(),
          category: jobTitleForm.category,
          descriptionTemplate: jobTitleForm.descriptionTemplate.trim(),
          isActive: true,
          createdAt: serverTimestamp(),
          createdBy: user?.id || 'system',
        })
        setJobTitles(prev => [...prev, {
          id: docRef.id,
          title: jobTitleForm.title.trim(),
          category: jobTitleForm.category,
          descriptionTemplate: jobTitleForm.descriptionTemplate.trim(),
          isActive: true,
          createdAt: new Date(),
          createdBy: user?.id || 'system',
        }].sort((a, b) => a.title.localeCompare(b.title)))
      }

      setShowJobTitleModal(false)
    } catch (err) {
      console.error('Error saving job title:', err)
      setJobTitleFormError('Failed to save. Please try again.')
    } finally {
      setSavingJobTitle(false)
    }
  }

  const handleToggleJobTitleActive = async (jobTitle: JobTitle) => {
    try {
      await updateDoc(doc(db, 'jobTitles', jobTitle.id), {
        isActive: !jobTitle.isActive,
        updatedAt: serverTimestamp(),
      })
      setJobTitles(prev => prev.map(jt =>
        jt.id === jobTitle.id ? { ...jt, isActive: !jt.isActive } : jt
      ))
    } catch (err) {
      console.error('Error toggling job title:', err)
    }
  }

  const handleConfirmDeleteJobTitle = (jobTitle: JobTitle) => {
    setDeletingJobTitle(jobTitle)
    setShowDeleteJobTitleModal(true)
  }

  const handleDeleteJobTitle = async () => {
    if (!deletingJobTitle) return

    try {
      setDeletingJobTitleLoading(true)
      await deleteDoc(doc(db, 'jobTitles', deletingJobTitle.id))
      setJobTitles(prev => prev.filter(jt => jt.id !== deletingJobTitle.id))
      setShowDeleteJobTitleModal(false)
      setDeletingJobTitle(null)
    } catch (err) {
      console.error('Error deleting job title:', err)
    } finally {
      setDeletingJobTitleLoading(false)
    }
  }

  // ============================================================================
  // JOB CATEGORIES HANDLERS
  // ============================================================================

  const handleAddJobCategory = () => {
    setEditingJobCategory(null)
    setJobCategoryForm({ value: '', label: '', color: '#6b7280' })
    setJobCategoryFormError('')
    setShowJobCategoryModal(true)
  }

  const handleEditJobCategory = (category: JobCategory) => {
    setEditingJobCategory(category)
    setJobCategoryForm({
      value: category.value,
      label: category.label,
      color: category.color
    })
    setJobCategoryFormError('')
    setShowJobCategoryModal(true)
  }

  const handleSaveJobCategory = async () => {
    if (!jobCategoryForm.label.trim()) {
      setJobCategoryFormError('Category name is required')
      return
    }

    // Generate value from label if not set
    const value = jobCategoryForm.value.trim() ||
      jobCategoryForm.label.trim().toLowerCase().replace(/[^a-z0-9]/g, '-')

    // Check for duplicates
    const duplicate = jobCategories.find(
      cat => (cat.value.toLowerCase() === value.toLowerCase() ||
              cat.label.toLowerCase() === jobCategoryForm.label.trim().toLowerCase()) &&
             cat.id !== editingJobCategory?.id
    )
    if (duplicate) {
      setJobCategoryFormError('A category with this name already exists')
      return
    }

    try {
      setSavingJobCategory(true)
      const categoriesRef = collection(db, 'jobCategories')

      if (editingJobCategory) {
        await updateDoc(doc(db, 'jobCategories', editingJobCategory.id), {
          label: jobCategoryForm.label.trim(),
          color: jobCategoryForm.color,
          updatedAt: serverTimestamp(),
        })
        setJobCategories(prev => prev.map(cat =>
          cat.id === editingJobCategory.id
            ? {
                ...cat,
                label: jobCategoryForm.label.trim(),
                color: jobCategoryForm.color
              }
            : cat
        ))
      } else {
        const maxOrder = Math.max(0, ...jobCategories.map(c => c.order))
        const docRef = await addDoc(categoriesRef, {
          value,
          label: jobCategoryForm.label.trim(),
          color: jobCategoryForm.color,
          order: maxOrder + 1,
          isActive: true,
          createdAt: serverTimestamp(),
          createdBy: user?.id || 'system',
        })
        setJobCategories(prev => [...prev, {
          id: docRef.id,
          value,
          label: jobCategoryForm.label.trim(),
          color: jobCategoryForm.color,
          order: maxOrder + 1,
          isActive: true,
          createdAt: new Date(),
          createdBy: user?.id || 'system',
        }].sort((a, b) => a.order - b.order))
      }

      setShowJobCategoryModal(false)
    } catch (err) {
      console.error('Error saving job category:', err)
      setJobCategoryFormError('Failed to save. Please try again.')
    } finally {
      setSavingJobCategory(false)
    }
  }

  const handleToggleJobCategoryActive = async (category: JobCategory) => {
    try {
      await updateDoc(doc(db, 'jobCategories', category.id), {
        isActive: !category.isActive,
        updatedAt: serverTimestamp(),
      })
      setJobCategories(prev => prev.map(cat =>
        cat.id === category.id ? { ...cat, isActive: !cat.isActive } : cat
      ))
    } catch (err) {
      console.error('Error toggling job category:', err)
    }
  }

  const handleConfirmDeleteJobCategory = (category: JobCategory) => {
    // Check if any job titles use this category
    const titlesUsingCategory = jobTitles.filter(jt => jt.category === category.value)
    if (titlesUsingCategory.length > 0) {
      alert(`Cannot delete "${category.label}": ${titlesUsingCategory.length} job title(s) are using this category. Please reassign or delete those job titles first.`)
      return
    }
    setDeletingJobCategory(category)
    setShowDeleteJobCategoryModal(true)
  }

  const handleDeleteJobCategory = async () => {
    if (!deletingJobCategory) return

    try {
      setDeletingJobCategoryLoading(true)
      await deleteDoc(doc(db, 'jobCategories', deletingJobCategory.id))
      setJobCategories(prev => prev.filter(cat => cat.id !== deletingJobCategory.id))
      setShowDeleteJobCategoryModal(false)
      setDeletingJobCategory(null)
    } catch (err) {
      console.error('Error deleting job category:', err)
    } finally {
      setDeletingJobCategoryLoading(false)
    }
  }

  // ============================================================================
  // LOCATIONS HANDLERS
  // ============================================================================

  const handleAddLocation = () => {
    setEditingLocation(null)
    setLocationForm({ name: '', address: '', city: '', postcode: '', region: '' })
    setLocationFormError('')
    setShowLocationModal(true)
  }

  const handleEditLocation = (location: Location) => {
    setEditingLocation(location)
    setLocationForm({
      name: location.name,
      address: location.address || '',
      city: location.city || '',
      postcode: location.postcode || '',
      region: location.region || ''
    })
    setLocationFormError('')
    setShowLocationModal(true)
  }

  const handleSaveLocation = async () => {
    if (!locationForm.name.trim()) {
      setLocationFormError('Location name is required')
      return
    }

    // Check for duplicates
    const duplicate = locations.find(
      loc => loc.name.toLowerCase() === locationForm.name.trim().toLowerCase() &&
             loc.id !== editingLocation?.id
    )
    if (duplicate) {
      setLocationFormError('A location with this name already exists')
      return
    }

    try {
      setSavingLocation(true)
      const locationsRef = collection(db, 'locations')

      if (editingLocation) {
        await updateDoc(doc(db, 'locations', editingLocation.id), {
          name: locationForm.name.trim(),
          address: locationForm.address.trim(),
          city: locationForm.city.trim(),
          postcode: locationForm.postcode.trim().toUpperCase(),
          region: locationForm.region,
          updatedAt: serverTimestamp(),
        })
        setLocations(prev => prev.map(loc =>
          loc.id === editingLocation.id
            ? {
                ...loc,
                name: locationForm.name.trim(),
                address: locationForm.address.trim(),
                city: locationForm.city.trim(),
                postcode: locationForm.postcode.trim().toUpperCase(),
                region: locationForm.region
              }
            : loc
        ))
      } else {
        const docRef = await addDoc(locationsRef, {
          name: locationForm.name.trim(),
          address: locationForm.address.trim(),
          city: locationForm.city.trim(),
          postcode: locationForm.postcode.trim().toUpperCase(),
          region: locationForm.region,
          isActive: true,
          createdAt: serverTimestamp(),
          createdBy: user?.id || 'system',
        })
        setLocations(prev => [...prev, {
          id: docRef.id,
          name: locationForm.name.trim(),
          address: locationForm.address.trim(),
          city: locationForm.city.trim(),
          postcode: locationForm.postcode.trim().toUpperCase(),
          region: locationForm.region,
          isActive: true,
          createdAt: new Date(),
          createdBy: user?.id || 'system',
        }].sort((a, b) => a.name.localeCompare(b.name)))
      }

      setShowLocationModal(false)
    } catch (err) {
      console.error('Error saving location:', err)
      setLocationFormError('Failed to save. Please try again.')
    } finally {
      setSavingLocation(false)
    }
  }

  const handleToggleLocationActive = async (location: Location) => {
    try {
      await updateDoc(doc(db, 'locations', location.id), {
        isActive: !location.isActive,
        updatedAt: serverTimestamp(),
      })
      setLocations(prev => prev.map(loc =>
        loc.id === location.id ? { ...loc, isActive: !loc.isActive } : loc
      ))
    } catch (err) {
      console.error('Error toggling location:', err)
    }
  }

  const handleConfirmDeleteLocation = (location: Location) => {
    setDeletingLocation(location)
    setShowDeleteLocationModal(true)
  }

  const handleDeleteLocation = async () => {
    if (!deletingLocation) return

    try {
      setDeletingLocationLoading(true)
      await deleteDoc(doc(db, 'locations', deletingLocation.id))
      setLocations(prev => prev.filter(loc => loc.id !== deletingLocation.id))
      setShowDeleteLocationModal(false)
      setDeletingLocation(null)
    } catch (err) {
      console.error('Error deleting location:', err)
    } finally {
      setDeletingLocationLoading(false)
    }
  }

  // ============================================================================
  // WHATSAPP TEMPLATES HANDLERS
  // ============================================================================

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
          createdBy: user?.id || 'system',
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
          createdBy: user?.id || 'system',
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

  // ============================================================================
  // INTERVIEW AVAILABILITY HANDLERS
  // ============================================================================

  const handleSaveInterviewAvailability = async () => {
    try {
      setSavingInterviewAvailability(true)
      const docRef = doc(db, 'settings', 'interviewAvailability')
      
      // Convert date strings to Timestamps
      const blockedDatesTimestamps = interviewBlockedDates.map(dateStr => {
        const date = new Date(dateStr)
        date.setHours(0, 0, 0, 0)
        return date
      })
      
      await setDoc(docRef, {
        ...interviewAvailabilityForm,
        blockedDates: blockedDatesTimestamps,
        updatedAt: serverTimestamp(),
        updatedBy: user?.id || 'system',
      })
      
      setInterviewAvailability({
        id: 'interviewAvailability',
        ...interviewAvailabilityForm,
        blockedDates: blockedDatesTimestamps as any,
        updatedAt: new Date() as any,
        updatedBy: user?.id || 'system',
      })
      
      alert('Interview availability settings saved successfully!')
    } catch (err) {
      console.error('Error saving interview availability:', err)
      alert('Failed to save settings. Please try again.')
    } finally {
      setSavingInterviewAvailability(false)
    }
  }

  const handleInterviewSlotToggle = (dayOfWeek: number) => {
    setInterviewAvailabilityForm(prev => ({
      ...prev,
      slots: prev.slots.map(slot =>
        slot.dayOfWeek === dayOfWeek
          ? { ...slot, enabled: !slot.enabled }
          : slot
      ),
    }))
  }

  const handleInterviewSlotTimeChange = (dayOfWeek: number, field: 'startTime' | 'endTime', value: string) => {
    setInterviewAvailabilityForm(prev => ({
      ...prev,
      slots: prev.slots.map(slot =>
        slot.dayOfWeek === dayOfWeek
          ? { ...slot, [field]: value }
          : slot
      ),
    }))
  }

  const handleAddInterviewBlockedDate = () => {
    if (!newInterviewBlockedDate) return
    if (interviewBlockedDates.includes(newInterviewBlockedDate)) {
      alert('This date is already blocked')
      return
    }
    setInterviewBlockedDates(prev => [...prev, newInterviewBlockedDate].sort())
    setNewInterviewBlockedDate('')
  }

  const handleRemoveInterviewBlockedDate = (date: string) => {
    setInterviewBlockedDates(prev => prev.filter(d => d !== date))
  }

  // ============================================================================
  // TRIAL AVAILABILITY HANDLERS
  // ============================================================================

  const handleSaveTrialAvailability = async () => {
    try {
      setSavingTrialAvailability(true)
      const docRef = doc(db, 'settings', 'trialAvailability')
      
      // Convert date strings to Timestamps
      const blockedDatesTimestamps = trialBlockedDates.map(dateStr => {
        const date = new Date(dateStr)
        date.setHours(0, 0, 0, 0)
        return date
      })
      
      await setDoc(docRef, {
        ...trialAvailabilityForm,
        blockedDates: blockedDatesTimestamps,
        updatedAt: serverTimestamp(),
        updatedBy: user?.id || 'system',
      })
      
      setTrialAvailability({
        id: 'trialAvailability',
        ...trialAvailabilityForm,
        blockedDates: blockedDatesTimestamps as any,
        updatedAt: new Date() as any,
        updatedBy: user?.id || 'system',
      })
      
      alert('Trial availability settings saved successfully!')
    } catch (err) {
      console.error('Error saving trial availability:', err)
      alert('Failed to save settings. Please try again.')
    } finally {
      setSavingTrialAvailability(false)
    }
  }

  const handleTrialSlotToggle = (dayOfWeek: number) => {
    setTrialAvailabilityForm(prev => ({
      ...prev,
      slots: prev.slots.map(slot =>
        slot.dayOfWeek === dayOfWeek
          ? { ...slot, enabled: !slot.enabled }
          : slot
      ),
    }))
  }

  const handleTrialSlotTimeChange = (dayOfWeek: number, field: 'startTime' | 'endTime', value: string) => {
    setTrialAvailabilityForm(prev => ({
      ...prev,
      slots: prev.slots.map(slot =>
        slot.dayOfWeek === dayOfWeek
          ? { ...slot, [field]: value }
          : slot
      ),
    }))
  }

  const handleAddTrialBlockedDate = () => {
    if (!newTrialBlockedDate) return
    if (trialBlockedDates.includes(newTrialBlockedDate)) {
      alert('This date is already blocked')
      return
    }
    setTrialBlockedDates(prev => [...prev, newTrialBlockedDate].sort())
    setNewTrialBlockedDate('')
  }

  const handleRemoveTrialBlockedDate = (date: string) => {
    setTrialBlockedDates(prev => prev.filter(d => d !== date))
  }

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  // Group job titles by category
  const groupedJobTitles = jobTitles.reduce((acc, jt) => {
    if (!acc[jt.category]) acc[jt.category] = []
    acc[jt.category].push(jt)
    return acc
  }, {} as Record<string, JobTitle[]>)

  // Filter locations by search
  const filteredLocations = locations.filter(loc => {
    if (!locationSearch) return true
    const search = locationSearch.toLowerCase()
    return loc.name.toLowerCase().includes(search) ||
           loc.city?.toLowerCase().includes(search) ||
           loc.postcode?.toLowerCase().includes(search) ||
           loc.region?.toLowerCase().includes(search)
  })

  // Filter templates by category and search
  const filteredTemplates = templates.filter(t => {
    const matchesCategory = templateCategoryFilter === 'all' || t.category === templateCategoryFilter
    const matchesSearch = !templateSearch ||
      t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
      t.content.toLowerCase().includes(templateSearch.toLowerCase())
    return matchesCategory && matchesSearch
  })

  // Group templates by category for display
  const groupedTemplates = filteredTemplates.reduce((acc, t) => {
    if (!acc[t.category]) acc[t.category] = []
    acc[t.category].push(t)
    return acc
  }, {} as Record<string, WhatsAppTemplate[]>)

  // Day names for availability display
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  // ============================================================================
  // RENDER TABS
  // ============================================================================

  const renderBookingBlocksTab = () => (
    <div className="settings-section">
      <BookingBlocksSettings />
    </div>
  )

  const renderInterviewAvailabilityTab = () => (
    <div className="settings-section">
      <div className="settings-section-header">
        <div>
          <h2>Interview Availability</h2>
          <p>Configure when candidates can book interviews (typically 30-minute slots)</p>
        </div>
        <Button
          variant="primary"
          onClick={handleSaveInterviewAvailability}
          disabled={savingInterviewAvailability}
        >
          {savingInterviewAvailability ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      {loadingInterviewAvailability ? (
        <div className="settings-loading">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="availability-settings">
          {/* General Settings */}
          <Card className="availability-card">
            <h3>📅 General Settings</h3>
            <div className="availability-form-grid">
              <div className="form-group">
                <label>Slot Duration (minutes)</label>
                <Input
                  type="number"
                  value={interviewAvailabilityForm.slotDuration}
                  onChange={(e) => setInterviewAvailabilityForm(prev => ({
                    ...prev,
                    slotDuration: parseInt(e.target.value) || 30
                  }))}
                  min={15}
                  max={120}
                />
                <span className="form-help">Length of each interview slot</span>
              </div>
              <div className="form-group">
                <label>Buffer Time (minutes)</label>
                <Input
                  type="number"
                  value={interviewAvailabilityForm.bufferTime}
                  onChange={(e) => setInterviewAvailabilityForm(prev => ({
                    ...prev,
                    bufferTime: parseInt(e.target.value) || 0
                  }))}
                  min={0}
                  max={60}
                />
                <span className="form-help">Gap between interviews</span>
              </div>
              <div className="form-group">
                <label>Max Advance Booking (days)</label>
                <Input
                  type="number"
                  value={interviewAvailabilityForm.maxAdvanceBooking}
                  onChange={(e) => setInterviewAvailabilityForm(prev => ({
                    ...prev,
                    maxAdvanceBooking: parseInt(e.target.value) || 14
                  }))}
                  min={1}
                  max={90}
                />
                <span className="form-help">How far ahead candidates can book</span>
              </div>
              <div className="form-group">
                <label>Minimum Notice (hours)</label>
                <Input
                  type="number"
                  value={interviewAvailabilityForm.minNoticeHours}
                  onChange={(e) => setInterviewAvailabilityForm(prev => ({
                    ...prev,
                    minNoticeHours: parseInt(e.target.value) || 24
                  }))}
                  min={1}
                  max={168}
                />
                <span className="form-help">Minimum hours notice required</span>
              </div>
            </div>
          </Card>

          {/* Weekly Schedule */}
          <Card className="availability-card">
            <h3>🗓️ Weekly Schedule</h3>
            <p className="card-description">Set which days and times are available for interviews</p>
            <div className="schedule-grid">
              {interviewAvailabilityForm.slots.map(slot => (
                <div
                  key={slot.dayOfWeek}
                  className={`schedule-day ${slot.enabled ? 'enabled' : 'disabled'}`}
                >
                  <div className="day-header">
                    <label className="day-toggle">
                      <input
                        type="checkbox"
                        checked={slot.enabled}
                        onChange={() => handleInterviewSlotToggle(slot.dayOfWeek)}
                      />
                      <span className="day-name">{DAY_NAMES[slot.dayOfWeek]}</span>
                    </label>
                  </div>
                  {slot.enabled && (
                    <div className="time-inputs">
                      <Input
                        type="time"
                        value={slot.startTime}
                        onChange={(e) => handleInterviewSlotTimeChange(slot.dayOfWeek, 'startTime', e.target.value)}
                      />
                      <span className="time-separator">to</span>
                      <Input
                        type="time"
                        value={slot.endTime}
                        onChange={(e) => handleInterviewSlotTimeChange(slot.dayOfWeek, 'endTime', e.target.value)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Blocked Dates */}
          <Card className="availability-card">
            <h3>🚫 Blocked Dates</h3>
            <p className="card-description">Dates when interviews are not available (holidays, etc.)</p>
            <div className="blocked-dates-input">
              <Input
                type="date"
                value={newInterviewBlockedDate}
                onChange={(e) => setNewInterviewBlockedDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
              <Button variant="secondary" onClick={handleAddInterviewBlockedDate}>
                Add Date
              </Button>
            </div>
            {interviewBlockedDates.length > 0 && (
              <div className="blocked-dates-list">
                {interviewBlockedDates.map(date => (
                  <div key={date} className="blocked-date-item">
                    <span>{new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <button
                      className="remove-date-btn"
                      onClick={() => handleRemoveInterviewBlockedDate(date)}
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )

  const renderTrialAvailabilityTab = () => (
    <div className="settings-section">
      <div className="settings-section-header">
        <div>
          <h2>Trial Availability</h2>
          <p>Configure when candidates can book trial shifts (4-hour blocks)</p>
        </div>
        <Button
          variant="primary"
          onClick={handleSaveTrialAvailability}
          disabled={savingTrialAvailability}
        >
          {savingTrialAvailability ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      {loadingTrialAvailability ? (
        <div className="settings-loading">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="availability-settings">
          {/* General Settings */}
          <Card className="availability-card trial-card">
            <h3>🏥 Trial Settings</h3>
            <div className="trial-duration-notice">
              <span className="duration-badge">4 hours</span>
              <span>Trial shifts are fixed at 4 hours duration</span>
            </div>
            <div className="availability-form-grid">
              <div className="form-group">
                <label>Buffer Time (minutes)</label>
                <Input
                  type="number"
                  value={trialAvailabilityForm.bufferTime}
                  onChange={(e) => setTrialAvailabilityForm(prev => ({
                    ...prev,
                    bufferTime: parseInt(e.target.value) || 0
                  }))}
                  min={0}
                  max={120}
                />
                <span className="form-help">Gap between trials</span>
              </div>
              <div className="form-group">
                <label>Max Advance Booking (days)</label>
                <Input
                  type="number"
                  value={trialAvailabilityForm.maxAdvanceBooking}
                  onChange={(e) => setTrialAvailabilityForm(prev => ({
                    ...prev,
                    maxAdvanceBooking: parseInt(e.target.value) || 21
                  }))}
                  min={1}
                  max={90}
                />
                <span className="form-help">How far ahead candidates can book</span>
              </div>
              <div className="form-group">
                <label>Minimum Notice (hours)</label>
                <Input
                  type="number"
                  value={trialAvailabilityForm.minNoticeHours}
                  onChange={(e) => setTrialAvailabilityForm(prev => ({
                    ...prev,
                    minNoticeHours: parseInt(e.target.value) || 48
                  }))}
                  min={1}
                  max={336}
                />
                <span className="form-help">Minimum hours notice required</span>
              </div>
              <div className="form-group">
                <label>Max Trials Per Day</label>
                <Input
                  type="number"
                  value={trialAvailabilityForm.maxTrialsPerDay}
                  onChange={(e) => setTrialAvailabilityForm(prev => ({
                    ...prev,
                    maxTrialsPerDay: parseInt(e.target.value) || 2
                  }))}
                  min={1}
                  max={10}
                />
                <span className="form-help">Maximum trial shifts per day</span>
              </div>
            </div>
          </Card>

          {/* Weekly Schedule */}
          <Card className="availability-card trial-card">
            <h3>🗓️ Weekly Schedule</h3>
            <p className="card-description">Set which days and times are available for 4-hour trial shifts</p>
            <div className="schedule-grid">
              {trialAvailabilityForm.slots.map(slot => (
                <div
                  key={slot.dayOfWeek}
                  className={`schedule-day ${slot.enabled ? 'enabled' : 'disabled'}`}
                >
                  <div className="day-header">
                    <label className="day-toggle">
                      <input
                        type="checkbox"
                        checked={slot.enabled}
                        onChange={() => handleTrialSlotToggle(slot.dayOfWeek)}
                      />
                      <span className="day-name">{DAY_NAMES[slot.dayOfWeek]}</span>
                    </label>
                  </div>
                  {slot.enabled && (
                    <div className="time-inputs">
                      <Input
                        type="time"
                        value={slot.startTime}
                        onChange={(e) => handleTrialSlotTimeChange(slot.dayOfWeek, 'startTime', e.target.value)}
                      />
                      <span className="time-separator">to</span>
                      <Input
                        type="time"
                        value={slot.endTime}
                        onChange={(e) => handleTrialSlotTimeChange(slot.dayOfWeek, 'endTime', e.target.value)}
                      />
                    </div>
                  )}
                  {slot.enabled && (
                    <div className="trial-slot-info">
                      {(() => {
                        const [startH, startM] = slot.startTime.split(':').map(Number)
                        const [endH, endM] = slot.endTime.split(':').map(Number)
                        const totalMinutes = (endH * 60 + endM) - (startH * 60 + startM)
                        const possibleSlots = Math.floor(totalMinutes / (240 + trialAvailabilityForm.bufferTime))
                        return possibleSlots > 0
                          ? `${possibleSlots} possible trial slot${possibleSlots !== 1 ? 's' : ''}`
                          : 'Not enough time for trials'
                      })()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Blocked Dates */}
          <Card className="availability-card trial-card">
            <h3>🚫 Blocked Dates</h3>
            <p className="card-description">Dates when trials are not available (holidays, etc.)</p>
            <div className="blocked-dates-input">
              <Input
                type="date"
                value={newTrialBlockedDate}
                onChange={(e) => setNewTrialBlockedDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
              <Button variant="secondary" onClick={handleAddTrialBlockedDate}>
                Add Date
              </Button>
            </div>
            {trialBlockedDates.length > 0 && (
              <div className="blocked-dates-list">
                {trialBlockedDates.map(date => (
                  <div key={date} className="blocked-date-item">
                    <span>{new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <button
                      className="remove-date-btn"
                      onClick={() => handleRemoveTrialBlockedDate(date)}
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )

  // ============================================================================
  // RENDER ENTITIES TAB
  // ============================================================================

  const renderEntitiesTab = () => (
    <div className="settings-section">
      <div className="settings-section-header">
        <div>
          <h2>Entities</h2>
          <p>Manage the business entities/companies in your organization</p>
        </div>
        <Button variant="primary" onClick={() => {
          setEditingEntity(null)
          setEntityForm({ name: '', shortCode: '', isDefault: false })
          setEntityFormError('')
          setShowEntityModal(true)
        }}>
          + Add Entity
        </Button>
      </div>

      {loadingEntities ? (
        <div className="settings-loading">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="entities-list">
          {entities.length === 0 ? (
            <Card className="empty-state-card">
              <p>No entities configured. Add your first entity to get started.</p>
            </Card>
          ) : (
            <Card>
              <table className="entities-table">
                <thead>
                  <tr>
                    <th>Entity Name</th>
                    <th>Short Code</th>
                    <th>Status</th>
                    <th>Default</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entities.map(entity => (
                    <tr key={entity.id} className={!entity.isActive ? 'inactive' : ''}>
                      <td className="entity-name">
                        <span className="entity-icon">🏢</span>
                        {entity.name}
                      </td>
                      <td>
                        <code className="entity-code">{entity.shortCode}</code>
                      </td>
                      <td>
                        <span className={`status-badge ${entity.isActive ? 'active' : 'inactive'}`}>
                          {entity.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        {entity.isDefault && (
                          <span className="default-badge">✓ Default</span>
                        )}
                      </td>
                      <td className="entity-actions">
                        <button
                          className={`toggle-btn ${entity.isActive ? 'active' : ''}`}
                          onClick={() => handleToggleEntityActive(entity)}
                          title={entity.isActive ? 'Deactivate' : 'Activate'}
                          disabled={entity.isDefault && entity.isActive}
                        >
                          {entity.isActive ? '✓' : '○'}
                        </button>
                        <button
                          className="edit-btn"
                          onClick={() => {
                            setEditingEntity(entity)
                            setEntityForm({
                              name: entity.name,
                              shortCode: entity.shortCode,
                              isDefault: entity.isDefault
                            })
                            setEntityFormError('')
                            setShowEntityModal(true)
                          }}
                          title="Edit"
                        >
                          ✎
                        </button>
                        <button
                          className="delete-btn"
                          onClick={() => {
                            setDeletingEntity(entity)
                            setShowDeleteEntityModal(true)
                          }}
                          title="Delete"
                          disabled={entity.isDefault}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}
    </div>
  )

  const renderJobTitlesTab = () => (
    <div className="settings-section">
      <div className="settings-section-header">
        <div>
          <h2>Job Titles</h2>
          <p>Manage job categories and titles with template descriptions</p>
        </div>
        <div className="header-actions">
          <Button variant="secondary" onClick={handleAddJobCategory}>
            + Add Category
          </Button>
          <Button variant="primary" onClick={handleAddJobTitle}>
            + Add Job Title
          </Button>
        </div>
      </div>

      {/* Categories Management */}
      {!loadingJobCategories && jobCategories.length > 0 && (
        <div className="categories-management">
          <h3>Categories</h3>
          <div className="categories-list">
            {jobCategories.map(cat => (
              <div key={cat.id} className={`category-chip ${!cat.isActive ? 'inactive' : ''}`}>
                <span className="category-dot" style={{ backgroundColor: cat.color }} />
                <span className="category-label">{cat.label}</span>
                <button
                  className="category-edit-btn"
                  onClick={() => handleEditJobCategory(cat)}
                  title="Edit"
                >
                  ✎
                </button>
                <button
                  className="category-delete-btn"
                  onClick={() => handleConfirmDeleteJobCategory(cat)}
                  title="Delete"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loadingJobTitles || loadingJobCategories ? (
        <div className="settings-loading">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="job-titles-grid">
          {jobCategories.filter(c => c.isActive).map(category => {
            const titles = groupedJobTitles[category.value] || []
            return (
              <Card key={category.value} className="job-category-card">
                <div className="category-header">
                  <span
                    className="category-dot"
                    style={{ backgroundColor: category.color }}
                  />
                  <h3>{category.label}</h3>
                  <span className="category-count">{titles.length}</span>
                </div>
                
                <div className="job-titles-list">
                  {titles.length === 0 ? (
                    <p className="no-titles">No job titles in this category</p>
                  ) : (
                    titles.map(jt => (
                      <div
                        key={jt.id}
                        className={`job-title-item ${!jt.isActive ? 'inactive' : ''}`}
                      >
                        <div className="job-title-info">
                          <span className="job-title-name">{jt.title}</span>
                          {jt.descriptionTemplate && (
                            <span className="has-template-badge" title="Has description template">📝</span>
                          )}
                        </div>
                        <div className="job-title-actions">
                          <button
                            className={`toggle-btn ${jt.isActive ? 'active' : ''}`}
                            onClick={() => handleToggleJobTitleActive(jt)}
                            title={jt.isActive ? 'Deactivate' : 'Activate'}
                          >
                            {jt.isActive ? '✓' : '○'}
                          </button>
                          <button
                            className="edit-btn"
                            onClick={() => handleEditJobTitle(jt)}
                            title="Edit"
                          >
                            ✎
                          </button>
                          <button
                            className="delete-btn"
                            onClick={() => handleConfirmDeleteJobTitle(jt)}
                            title="Delete"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )

  const renderLocationsTab = () => (
    <div className="settings-section">
      <div className="settings-section-header">
        <div>
          <h2>Locations</h2>
          <p>Manage pharmacy branch locations for candidate assignments</p>
        </div>
        <Button variant="primary" onClick={handleAddLocation}>
          + Add Location
        </Button>
      </div>

      {loadingLocations ? (
        <div className="settings-loading">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          {/* Search */}
          {locations.length > 5 && (
            <div className="locations-search">
              <Input
                placeholder="Search locations..."
                value={locationSearch}
                onChange={(e) => setLocationSearch(e.target.value)}
              />
            </div>
          )}

          {/* Locations list */}
          <div className="locations-list">
            {filteredLocations.length === 0 ? (
              <Card className="empty-locations">
                <p>{locations.length === 0 ? 'No locations added yet. Add your first location.' : 'No locations match your search.'}</p>
              </Card>
            ) : (
              filteredLocations.map(location => (
                <Card key={location.id} className={`location-card ${!location.isActive ? 'inactive' : ''}`}>
                  <div className="location-info">
                    <div className="location-name">
                      <span className="location-icon">📍</span>
                      {location.name}
                      {!location.isActive && <span className="inactive-badge">Inactive</span>}
                    </div>
                    {(location.address || location.city || location.postcode) && (
                      <div className="location-address">
                        {[location.address, location.city, location.postcode].filter(Boolean).join(', ')}
                      </div>
                    )}
                    {location.region && (
                      <div className="location-region">{location.region}</div>
                    )}
                  </div>
                  <div className="location-actions">
                    <button
                      className={`toggle-btn ${location.isActive ? 'active' : ''}`}
                      onClick={() => handleToggleLocationActive(location)}
                      title={location.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {location.isActive ? '✓' : '○'}
                    </button>
                    <button
                      className="edit-btn"
                      onClick={() => handleEditLocation(location)}
                      title="Edit"
                    >
                      ✎
                    </button>
                    <button
                      className="delete-btn"
                      onClick={() => handleConfirmDeleteLocation(location)}
                      title="Delete"
                    >
                      ×
                    </button>
                  </div>
                </Card>
              ))
            )}
          </div>

          {/* Summary */}
          {locations.length > 0 && (
            <div className="locations-summary">
              {locations.length} location{locations.length !== 1 ? 's' : ''} • {locations.filter(l => l.isActive).length} active
            </div>
          )}
        </>
      )}
    </div>
  )

  const renderWhatsAppTemplatesTab = () => (
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
  )

  const renderGeneralTab = () => (
    <div className="settings-section">
      <div className="settings-section-header">
        <div>
          <h2>General Settings</h2>
          <p>Configure general application settings</p>
        </div>
      </div>
      <Card className="coming-soon-card">
        <p>General settings will be available in a future update.</p>
      </Card>
    </div>
  )

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <div className="settings-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-description">Configure job titles, WhatsApp templates and system preferences</p>
        </div>
      </div>

      <div className="settings-layout">
        {/* Sidebar tabs */}
        <div className="settings-sidebar">
          {SETTINGS_TABS.map(tab => (
            <button
              key={tab.id}
              className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="settings-content">
          {activeTab === 'entities' && renderEntitiesTab()}
          {activeTab === 'job-titles' && renderJobTitlesTab()}
          {activeTab === 'interview-availability' && renderInterviewAvailabilityTab()}
          {activeTab === 'trial-availability' && renderTrialAvailabilityTab()}
          {activeTab === 'booking-blocks' && renderBookingBlocksTab()}
          {activeTab === 'whatsapp-templates' && renderWhatsAppTemplatesTab()}
          {activeTab === 'locations' && renderLocationsTab()}
          {activeTab === 'general' && renderGeneralTab()}
        </div>
      </div>

      {/* Add/Edit Entity Modal */}
      <Modal
        isOpen={showEntityModal}
        onClose={() => setShowEntityModal(false)}
        title={editingEntity ? 'Edit Entity' : 'Add Entity'}
        size="sm"
      >
        <div className="entity-form">
          <div className="form-group">
            <label>Entity Name *</label>
            <Input
              value={entityForm.name}
              onChange={(e) => {
                setEntityForm(prev => ({ ...prev, name: e.target.value }))
                setEntityFormError('')
              }}
              placeholder="e.g., Allied Pharmacies"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Short Code *</label>
            <Input
              value={entityForm.shortCode}
              onChange={(e) => {
                setEntityForm(prev => ({ ...prev, shortCode: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))
                setEntityFormError('')
              }}
              placeholder="e.g., allied"
            />
            <p className="form-hint">Used internally for identification. Lowercase letters, numbers, and hyphens only.</p>
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={entityForm.isDefault}
                onChange={(e) => setEntityForm(prev => ({ ...prev, isDefault: e.target.checked }))}
              />
              <span>Set as default entity</span>
            </label>
            <p className="form-hint">The default entity will be pre-selected when creating jobs and candidates.</p>
          </div>

          {entityFormError && (
            <p className="form-error">{entityFormError}</p>
          )}

          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setShowEntityModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveEntity} disabled={savingEntity}>
              {savingEntity ? 'Saving...' : editingEntity ? 'Update' : 'Add'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Entity Modal */}
      <Modal
        isOpen={showDeleteEntityModal}
        onClose={() => setShowDeleteEntityModal(false)}
        title="Delete Entity"
        size="sm"
      >
        <div className="delete-confirmation">
          <p>Are you sure you want to delete <strong>{deletingEntity?.name}</strong>?</p>
          <p className="warning-text">This action cannot be undone. Jobs and candidates associated with this entity will need to be reassigned.</p>
          
          {deletingEntity?.isDefault && (
            <p className="error-text">Cannot delete the default entity. Set another entity as default first.</p>
          )}

          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setShowDeleteEntityModal(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteEntity}
              disabled={deletingEntityLoading || deletingEntity?.isDefault}
            >
              {deletingEntityLoading ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add/Edit Job Title Modal */}
      <Modal
        isOpen={showJobTitleModal}
        onClose={() => setShowJobTitleModal(false)}
        title={editingJobTitle ? 'Edit Job Title' : 'Add Job Title'}
        size="lg"
      >
        <div className="job-title-form">
          <div className="form-group">
            <label>Job Title *</label>
            <Input
              value={jobTitleForm.title}
              onChange={(e) => {
                setJobTitleForm(prev => ({ ...prev, title: e.target.value }))
                setJobTitleFormError('')
              }}
              placeholder="e.g., Pharmacist, Dispenser"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Category *</label>
            <div className="category-options">
              {jobCategories.filter(c => c.isActive).map(cat => (
                <button
                  key={cat.value}
                  type="button"
                  className={`category-option ${jobTitleForm.category === cat.value ? 'selected' : ''}`}
                  onClick={() => setJobTitleForm(prev => ({ ...prev, category: cat.value }))}
                  style={{
                    '--cat-color': cat.color,
                    borderColor: jobTitleForm.category === cat.value ? cat.color : undefined,
                    backgroundColor: jobTitleForm.category === cat.value ? `${cat.color}15` : undefined,
                  } as React.CSSProperties}
                >
                  <span className="cat-dot" style={{ backgroundColor: cat.color }} />
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Description Template</label>
            <Textarea
              value={jobTitleForm.descriptionTemplate}
              onChange={(e) => setJobTitleForm(prev => ({ ...prev, descriptionTemplate: e.target.value }))}
              placeholder="Enter a default job description template that will be pre-filled when creating jobs with this title..."
              rows={12}
            />
            <p className="form-hint">This description will be automatically filled when creating a new job posting with this title.</p>
          </div>

          {jobTitleFormError && (
            <p className="form-error">{jobTitleFormError}</p>
          )}

          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setShowJobTitleModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveJobTitle} disabled={savingJobTitle}>
              {savingJobTitle ? 'Saving...' : editingJobTitle ? 'Update' : 'Add'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Job Title Modal */}
      <Modal
        isOpen={showDeleteJobTitleModal}
        onClose={() => setShowDeleteJobTitleModal(false)}
        title="Delete Job Title"
        size="sm"
      >
        <div className="delete-confirmation">
          <p>Are you sure you want to delete <strong>"{deletingJobTitle?.title}"</strong>?</p>
          <p className="delete-warning">
            This action cannot be undone. Existing candidates with this job title will not be affected.
          </p>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setShowDeleteJobTitleModal(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteJobTitle}
              disabled={deletingJobTitleLoading}
            >
              {deletingJobTitleLoading ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add/Edit Job Category Modal */}
      <Modal
        isOpen={showJobCategoryModal}
        onClose={() => setShowJobCategoryModal(false)}
        title={editingJobCategory ? 'Edit Category' : 'Add Category'}
        size="sm"
      >
        <div className="job-category-form">
          <div className="form-group">
            <label>Category Name *</label>
            <Input
              value={jobCategoryForm.label}
              onChange={(e) => {
                setJobCategoryForm(prev => ({ ...prev, label: e.target.value }))
                setJobCategoryFormError('')
              }}
              placeholder="e.g., Clinical, Management"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Color</label>
            <div className="color-picker">
              {['#8b5cf6', '#06b6d4', '#f59e0b', '#3b82f6', '#6b7280', '#10b981', '#ef4444', '#ec4899'].map(color => (
                <button
                  key={color}
                  type="button"
                  className={`color-option ${jobCategoryForm.color === color ? 'selected' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setJobCategoryForm(prev => ({ ...prev, color }))}
                />
              ))}
            </div>
          </div>

          {jobCategoryFormError && (
            <p className="form-error">{jobCategoryFormError}</p>
          )}

          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setShowJobCategoryModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveJobCategory} disabled={savingJobCategory}>
              {savingJobCategory ? 'Saving...' : editingJobCategory ? 'Update' : 'Add'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Job Category Modal */}
      <Modal
        isOpen={showDeleteJobCategoryModal}
        onClose={() => setShowDeleteJobCategoryModal(false)}
        title="Delete Category"
        size="sm"
      >
        <div className="delete-confirmation">
          <p>Are you sure you want to delete the <strong>"{deletingJobCategory?.label}"</strong> category?</p>
          <p className="delete-warning">
            This action cannot be undone. Make sure no job titles are using this category.
          </p>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setShowDeleteJobCategoryModal(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteJobCategory}
              disabled={deletingJobCategoryLoading}
            >
              {deletingJobCategoryLoading ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add/Edit Location Modal */}
      <Modal
        isOpen={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        title={editingLocation ? 'Edit Location' : 'Add Location'}
        size="md"
      >
        <div className="location-form">
          <div className="form-group">
            <label>Location Name *</label>
            <Input
              value={locationForm.name}
              onChange={(e) => {
                setLocationForm(prev => ({ ...prev, name: e.target.value }))
                setLocationFormError('')
              }}
              placeholder="e.g., Allied Pharmacy Croydon"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Address</label>
            <Input
              value={locationForm.address}
              onChange={(e) => setLocationForm(prev => ({ ...prev, address: e.target.value }))}
              placeholder="e.g., 123 High Street"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>City</label>
              <Input
                value={locationForm.city}
                onChange={(e) => setLocationForm(prev => ({ ...prev, city: e.target.value }))}
                placeholder="e.g., Croydon"
              />
            </div>
            <div className="form-group">
              <label>Postcode</label>
              <Input
                value={locationForm.postcode}
                onChange={(e) => setLocationForm(prev => ({ ...prev, postcode: e.target.value }))}
                placeholder="e.g., CR0 1AB"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Region</label>
            <Select
              value={locationForm.region}
              onChange={(e) => setLocationForm(prev => ({ ...prev, region: e.target.value }))}
              options={[
                { value: '', label: 'Select region...' },
                ...UK_REGIONS.map(r => ({ value: r, label: r }))
              ]}
            />
          </div>

          {locationFormError && (
            <p className="form-error">{locationFormError}</p>
          )}

          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setShowLocationModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveLocation} disabled={savingLocation}>
              {savingLocation ? 'Saving...' : editingLocation ? 'Update' : 'Add'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Location Modal */}
      <Modal
        isOpen={showDeleteLocationModal}
        onClose={() => setShowDeleteLocationModal(false)}
        title="Delete Location"
        size="sm"
      >
        <div className="delete-confirmation">
          <p>Are you sure you want to delete <strong>"{deletingLocation?.name}"</strong>?</p>
          <p className="delete-warning">
            This action cannot be undone. Existing candidates assigned to this location will not be affected.
          </p>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setShowDeleteLocationModal(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteLocation}
              disabled={deletingLocationLoading}
            >
              {deletingLocationLoading ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>

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
    </div>
  )
}

export default Settings

// ============================================================================
// Job Titles Tab - Extracted from Settings.tsx
// Manages job categories and job titles with description templates
// ============================================================================

import { useEffect, useState } from 'react'
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { getFirebaseDb } from '@allied/shared-lib'
import { Card, Button, Input, Spinner, Modal, Textarea } from '@allied/shared-ui'

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
  category: string  // References JobCategory.value
  descriptionTemplate?: string  // Template job description
  isActive: boolean
  createdAt: any
  createdBy: string
}

interface JobTitlesTabProps {
  userId?: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

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
• Good knowledge of local area
• Excellent time management
• Friendly and professional manner
• Clean driving record`
  },
]

// ============================================================================
// COMPONENT
// ============================================================================

export function JobTitlesTab({ userId }: JobTitlesTabProps) {
  const db = getFirebaseDb()

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

  // ============================================================================
  // INITIALIZE DEFAULTS
  // ============================================================================

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
          createdBy: userId || 'system',
        })
        newTitles.push({
          id: docRef.id,
          title: defaultTitle.title,
          category: defaultTitle.category,
          descriptionTemplate: defaultTitle.descriptionTemplate || '',
          isActive: true,
          createdAt: new Date(),
          createdBy: userId || 'system',
        })
      }

      setJobTitles(newTitles)
    } catch (err) {
      console.error('Error initializing defaults:', err)
    }
  }

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
          createdBy: userId || 'system',
        })
        newCategories.push({
          id: docRef.id,
          value: defaultCat.value,
          label: defaultCat.label,
          color: defaultCat.color,
          order: defaultCat.order,
          isActive: true,
          createdAt: new Date(),
          createdBy: userId || 'system',
        })
      }

      newCategories.sort((a, b) => a.order - b.order)
      setJobCategories(newCategories)
    } catch (err) {
      console.error('Error initializing job categories:', err)
    }
  }

  // ============================================================================
  // FETCH DATA
  // ============================================================================

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
          createdBy: userId || 'system',
        })
        setJobTitles(prev => [...prev, {
          id: docRef.id,
          title: jobTitleForm.title.trim(),
          category: jobTitleForm.category,
          descriptionTemplate: jobTitleForm.descriptionTemplate.trim(),
          isActive: true,
          createdAt: new Date(),
          createdBy: userId || 'system',
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
          createdBy: userId || 'system',
        })
        setJobCategories(prev => [...prev, {
          id: docRef.id,
          value,
          label: jobCategoryForm.label.trim(),
          color: jobCategoryForm.color,
          order: maxOrder + 1,
          isActive: true,
          createdAt: new Date(),
          createdBy: userId || 'system',
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
  // COMPUTED VALUES
  // ============================================================================

  // Group job titles by category
  const groupedJobTitles = jobTitles.reduce((acc, jt) => {
    if (!acc[jt.category]) acc[jt.category] = []
    acc[jt.category].push(jt)
    return acc
  }, {} as Record<string, JobTitle[]>)

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <>
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
    </>
  )
}

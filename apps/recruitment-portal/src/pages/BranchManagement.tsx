// ============================================================================
// Allied Recruitment Portal - Branch Management Page (R9.5)
// Location: apps/recruitment-portal/src/pages/BranchManagement.tsx
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react'
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy,
  where,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore'
import { getFirebaseDb } from '@allied/shared-lib'
import type { Branch, EntityType, User } from '@allied/shared-lib'
import { Card, Button, Input, Spinner, Modal, Badge } from '@allied/shared-ui'
import { useAuth } from '../contexts/AuthContext'
import './BranchManagement.css'

// ============================================================================
// TYPES
// ============================================================================

interface BranchFormData {
  name: string
  code: string
  address: string
  city: string
  postcode: string
  phone: string
  email: string
  entity: EntityType
  regionId: string
  regionName: string
  managerId: string
  managerName: string
  acceptingTrials: boolean
  maxTrialsPerDay: number
  active: boolean
}

interface BulkImportRow {
  name: string
  code?: string
  address: string
  city: string
  postcode: string
  phone?: string
  email?: string
  entity: string
  region?: string
}

const EMPTY_FORM: BranchFormData = {
  name: '',
  code: '',
  address: '',
  city: '',
  postcode: '',
  phone: '',
  email: '',
  entity: 'allied',
  regionId: '',
  regionName: '',
  managerId: '',
  managerName: '',
  acceptingTrials: true,
  maxTrialsPerDay: 2,
  active: true,
}

const ENTITIES: { value: EntityType; label: string }[] = [
  { value: 'allied', label: 'Allied Pharmacies' },
  { value: 'sharief', label: 'Sharief Healthcare' },
  { value: 'core', label: 'Core Pharmaceuticals' },
]

// ============================================================================
// COMPONENT
// ============================================================================

export function BranchManagement() {
  const { user } = useAuth()
  const [branches, setBranches] = useState<Branch[]>([])
  const [managers, setManagers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null)
  
  // Form state
  const [formData, setFormData] = useState<BranchFormData>(EMPTY_FORM)
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [filterEntity, setFilterEntity] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('active')
  
  // Bulk import
  const [bulkData, setBulkData] = useState('')
  const [bulkPreview, setBulkPreview] = useState<BulkImportRow[]>([])
  const [bulkErrors, setBulkErrors] = useState<string[]>([])

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const db = getFirebaseDb()
      
      // Load branches
      const branchesQuery = query(
        collection(db, 'branches'),
        orderBy('name', 'asc')
      )
      const branchesSnap = await getDocs(branchesQuery)
      const branchesData = branchesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Branch[]
      setBranches(branchesData)
      
      // Load potential managers (branch_manager role)
      const usersQuery = query(
        collection(db, 'users'),
        where('role', 'in', ['branch_manager', 'super_admin', 'recruiter']),
        where('active', '==', true)
      )
      const usersSnap = await getDocs(usersQuery)
      const usersData = usersSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as User[]
      setManagers(usersData)
      
    } catch (err) {
      console.error('Error loading branches:', err)
      setError('Failed to load branches')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ============================================================================
  // FILTERED DATA
  // ============================================================================

  const filteredBranches = useMemo(() => {
    return branches.filter(branch => {
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase()
        const matchesSearch = 
          branch.name.toLowerCase().includes(search) ||
          branch.code?.toLowerCase().includes(search) ||
          branch.city.toLowerCase().includes(search) ||
          branch.postcode.toLowerCase().includes(search) ||
          branch.managerName?.toLowerCase().includes(search)
        if (!matchesSearch) return false
      }
      
      // Entity filter
      if (filterEntity !== 'all' && branch.entity !== filterEntity) {
        return false
      }
      
      // Status filter
      if (filterStatus === 'active' && !branch.active) return false
      if (filterStatus === 'inactive' && branch.active) return false
      
      return true
    })
  }, [branches, searchTerm, filterEntity, filterStatus])

  // ============================================================================
  // CRUD OPERATIONS
  // ============================================================================

  const handleAdd = async () => {
    try {
      setSaving(true)
      setError(null)
      
      const db = getFirebaseDb()
      const branchData = {
        ...formData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
      
      await addDoc(collection(db, 'branches'), branchData)
      
      setShowAddModal(false)
      setFormData(EMPTY_FORM)
      await loadData()
    } catch (err) {
      console.error('Error adding branch:', err)
      setError('Failed to add branch')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async () => {
    if (!selectedBranch) return
    
    try {
      setSaving(true)
      setError(null)
      
      const db = getFirebaseDb()
      await updateDoc(doc(db, 'branches', selectedBranch.id), {
        ...formData,
        updatedAt: serverTimestamp(),
      })
      
      setShowEditModal(false)
      setSelectedBranch(null)
      setFormData(EMPTY_FORM)
      await loadData()
    } catch (err) {
      console.error('Error updating branch:', err)
      setError('Failed to update branch')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedBranch) return
    
    try {
      setSaving(true)
      setError(null)
      
      const db = getFirebaseDb()
      await deleteDoc(doc(db, 'branches', selectedBranch.id))
      
      setShowDeleteModal(false)
      setSelectedBranch(null)
      await loadData()
    } catch (err) {
      console.error('Error deleting branch:', err)
      setError('Failed to delete branch')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (branch: Branch) => {
    try {
      const db = getFirebaseDb()
      await updateDoc(doc(db, 'branches', branch.id), {
        active: !branch.active,
        updatedAt: serverTimestamp(),
      })
      await loadData()
    } catch (err) {
      console.error('Error toggling branch status:', err)
      setError('Failed to update branch status')
    }
  }

  // ============================================================================
  // BULK IMPORT
  // ============================================================================

  const parseBulkData = (data: string) => {
    const lines = data.trim().split('\n')
    const rows: BulkImportRow[] = []
    const errors: string[] = []
    
    // Skip header if present
    const startIndex = lines[0]?.toLowerCase().includes('name') ? 1 : 0
    
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      
      const parts = line.split('\t').length > 1 
        ? line.split('\t') 
        : line.split(',').map(p => p.trim().replace(/^"|"$/g, ''))
      
      if (parts.length < 5) {
        errors.push(`Line ${i + 1}: Not enough columns (need at least: name, address, city, postcode, entity)`)
        continue
      }
      
      const [name, address, city, postcode, entity, region, phone, email, code] = parts
      
      // Validate entity
      const validEntity = ['allied', 'sharief', 'core'].includes(entity?.toLowerCase())
      if (!validEntity) {
        errors.push(`Line ${i + 1}: Invalid entity "${entity}" (must be allied, sharief, or core)`)
        continue
      }
      
      rows.push({
        name: name?.trim() || '',
        address: address?.trim() || '',
        city: city?.trim() || '',
        postcode: postcode?.trim() || '',
        entity: entity?.toLowerCase() || 'allied',
        region: region?.trim(),
        phone: phone?.trim(),
        email: email?.trim(),
        code: code?.trim(),
      })
    }
    
    setBulkPreview(rows)
    setBulkErrors(errors)
  }

  const handleBulkImport = async () => {
    if (bulkPreview.length === 0) return
    
    try {
      setSaving(true)
      setError(null)
      
      const db = getFirebaseDb()
      const batch = writeBatch(db)
      
      for (const row of bulkPreview) {
        const branchRef = doc(collection(db, 'branches'))
        batch.set(branchRef, {
          name: row.name,
          code: row.code || '',
          address: row.address,
          city: row.city,
          postcode: row.postcode,
          phone: row.phone || '',
          email: row.email || '',
          entity: row.entity as EntityType,
          regionName: row.region || '',
          regionId: '',
          managerId: '',
          managerName: '',
          acceptingTrials: true,
          maxTrialsPerDay: 2,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      }
      
      await batch.commit()
      
      setShowBulkModal(false)
      setBulkData('')
      setBulkPreview([])
      setBulkErrors([])
      await loadData()
    } catch (err) {
      console.error('Error bulk importing:', err)
      setError('Failed to import branches')
    } finally {
      setSaving(false)
    }
  }

  // ============================================================================
  // MODAL HANDLERS
  // ============================================================================

  const openEditModal = (branch: Branch) => {
    setSelectedBranch(branch)
    setFormData({
      name: branch.name,
      code: branch.code || '',
      address: branch.address,
      city: branch.city,
      postcode: branch.postcode,
      phone: branch.phone || '',
      email: branch.email || '',
      entity: branch.entity,
      regionId: branch.regionId || '',
      regionName: branch.regionName || '',
      managerId: branch.managerId || '',
      managerName: branch.managerName || '',
      acceptingTrials: branch.acceptingTrials,
      maxTrialsPerDay: (branch as any).maxTrialsPerDay || 2,
      active: branch.active,
    })
    setShowEditModal(true)
  }

  const openDeleteModal = (branch: Branch) => {
    setSelectedBranch(branch)
    setShowDeleteModal(true)
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div className="page">
        <div className="loading-container">
          <Spinner size="lg" />
          <p>Loading branches...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page branch-management">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Branch Management</h1>
          <p className="page-description">
            Manage {branches.length} pharmacy branches across all entities
          </p>
        </div>
        <div className="page-actions">
          <Button variant="secondary" onClick={() => setShowBulkModal(true)}>
            📥 Bulk Import
          </Button>
          <Button variant="primary" onClick={() => setShowAddModal(true)}>
            + Add Branch
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Filters */}
      <Card className="filters-card">
        <div className="filters-row">
          <Input
            placeholder="Search branches..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <select
            value={filterEntity}
            onChange={(e) => setFilterEntity(e.target.value)}
          >
            <option value="all">All Entities</option>
            {ENTITIES.map(e => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
        <div className="filters-summary">
          Showing {filteredBranches.length} of {branches.length} branches
        </div>
      </Card>

      {/* Branches Table */}
      <Card className="table-card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Branch Name</th>
                <th>Location</th>
                <th>Entity</th>
                <th>Manager</th>
                <th>Status</th>
                <th>Trials</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBranches.map(branch => (
                <tr key={branch.id} className={!branch.active ? 'inactive-row' : ''}>
                  <td>
                    <div className="branch-name">
                      <strong>{branch.name}</strong>
                      {branch.code && <span className="branch-code">{branch.code}</span>}
                    </div>
                  </td>
                  <td>
                    <div className="branch-location">
                      <span>{branch.city}</span>
                      <span className="postcode">{branch.postcode}</span>
                    </div>
                  </td>
                  <td>
                    <Badge variant={
                      branch.entity === 'allied' ? 'primary' :
                      branch.entity === 'sharief' ? 'success' : 'warning'
                    }>
                      {branch.entity}
                    </Badge>
                  </td>
                  <td>
                    {branch.managerName ? (
                      <span>{branch.managerName}</span>
                    ) : (
                      <span className="no-manager">Not assigned</span>
                    )}
                  </td>
                  <td>
                    <Badge variant={branch.active ? 'success' : 'gray'}>
                      {branch.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td>
                    <Badge variant={branch.acceptingTrials ? 'success' : 'gray'}>
                      {branch.acceptingTrials ? '✓ Yes' : '✗ No'}
                    </Badge>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button 
                        className="btn-icon" 
                        title="Edit"
                        onClick={() => openEditModal(branch)}
                      >
                        ✏️
                      </button>
                      <button 
                        className="btn-icon" 
                        title={branch.active ? 'Deactivate' : 'Activate'}
                        onClick={() => handleToggleActive(branch)}
                      >
                        {branch.active ? '🔴' : '🟢'}
                      </button>
                      <button 
                        className="btn-icon btn-danger" 
                        title="Delete"
                        onClick={() => openDeleteModal(branch)}
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredBranches.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-state">
                    No branches found matching your filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Branch Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); setFormData(EMPTY_FORM); }}
        title="Add New Branch"
        size="lg"
      >
        <BranchForm
          formData={formData}
          setFormData={setFormData}
          managers={managers}
          onSubmit={handleAdd}
          onCancel={() => { setShowAddModal(false); setFormData(EMPTY_FORM); }}
          saving={saving}
          submitLabel="Add Branch"
        />
      </Modal>

      {/* Edit Branch Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setSelectedBranch(null); setFormData(EMPTY_FORM); }}
        title={`Edit Branch: ${selectedBranch?.name}`}
        size="lg"
      >
        <BranchForm
          formData={formData}
          setFormData={setFormData}
          managers={managers}
          onSubmit={handleEdit}
          onCancel={() => { setShowEditModal(false); setSelectedBranch(null); setFormData(EMPTY_FORM); }}
          saving={saving}
          submitLabel="Save Changes"
        />
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setSelectedBranch(null); }}
        title="Delete Branch"
        size="sm"
      >
        <div className="delete-confirmation">
          <p>
            Are you sure you want to delete <strong>{selectedBranch?.name}</strong>?
          </p>
          <p className="warning-text">
            This action cannot be undone. Any jobs and candidates linked to this branch will need to be reassigned.
          </p>
          <div className="modal-actions">
            <Button 
              variant="secondary" 
              onClick={() => { setShowDeleteModal(false); setSelectedBranch(null); }}
            >
              Cancel
            </Button>
            <Button 
              variant="danger" 
              onClick={handleDelete}
              disabled={saving}
            >
              {saving ? 'Deleting...' : 'Delete Branch'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Import Modal */}
      <Modal
        isOpen={showBulkModal}
        onClose={() => { setShowBulkModal(false); setBulkData(''); setBulkPreview([]); setBulkErrors([]); }}
        title="Bulk Import Branches"
        size="xl"
      >
        <div className="bulk-import">
          <div className="bulk-instructions">
            <h4>Instructions</h4>
            <p>Paste tab-separated or comma-separated data with these columns:</p>
            <code>Name, Address, City, Postcode, Entity, Region (optional), Phone (optional), Email (optional), Code (optional)</code>
            <p>Entity must be: <strong>allied</strong>, <strong>sharief</strong>, or <strong>core</strong></p>
          </div>
          
          <textarea
            className="bulk-textarea"
            placeholder="Paste your data here..."
            value={bulkData}
            onChange={(e) => {
              setBulkData(e.target.value)
              parseBulkData(e.target.value)
            }}
            rows={10}
          />
          
          {bulkErrors.length > 0 && (
            <div className="bulk-errors">
              <h4>⚠️ Errors</h4>
              <ul>
                {bulkErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
          
          {bulkPreview.length > 0 && (
            <div className="bulk-preview">
              <h4>Preview ({bulkPreview.length} branches to import)</h4>
              <div className="preview-table-wrapper">
                <table className="preview-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>City</th>
                      <th>Postcode</th>
                      <th>Entity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkPreview.slice(0, 10).map((row, i) => (
                      <tr key={i}>
                        <td>{row.name}</td>
                        <td>{row.city}</td>
                        <td>{row.postcode}</td>
                        <td>{row.entity}</td>
                      </tr>
                    ))}
                    {bulkPreview.length > 10 && (
                      <tr>
                        <td colSpan={4} className="more-rows">
                          ...and {bulkPreview.length - 10} more
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          <div className="modal-actions">
            <Button 
              variant="secondary" 
              onClick={() => { setShowBulkModal(false); setBulkData(''); setBulkPreview([]); setBulkErrors([]); }}
            >
              Cancel
            </Button>
            <Button 
              variant="primary" 
              onClick={handleBulkImport}
              disabled={saving || bulkPreview.length === 0 || bulkErrors.length > 0}
            >
              {saving ? 'Importing...' : `Import ${bulkPreview.length} Branches`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ============================================================================
// BRANCH FORM COMPONENT
// ============================================================================

interface BranchFormProps {
  formData: BranchFormData
  setFormData: (data: BranchFormData) => void
  managers: User[]
  onSubmit: () => void
  onCancel: () => void
  saving: boolean
  submitLabel: string
}

function BranchForm({ 
  formData, 
  setFormData, 
  managers, 
  onSubmit, 
  onCancel, 
  saving, 
  submitLabel 
}: BranchFormProps) {
  const handleChange = (field: keyof BranchFormData, value: any) => {
    setFormData({ ...formData, [field]: value })
  }

  const handleManagerChange = (managerId: string) => {
    const manager = managers.find(m => m.id === managerId)
    setFormData({
      ...formData,
      managerId,
      managerName: manager?.displayName || '',
    })
  }

  const isValid = formData.name && formData.address && formData.city && formData.postcode

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <div className="form-grid">
        <div className="form-group">
          <label>Branch Name *</label>
          <Input
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="e.g., Manchester Piccadilly"
            required
          />
        </div>
        
        <div className="form-group">
          <label>Branch Code</label>
          <Input
            value={formData.code}
            onChange={(e) => handleChange('code', e.target.value)}
            placeholder="e.g., MAN001"
          />
        </div>
        
        <div className="form-group full-width">
          <label>Address *</label>
          <Input
            value={formData.address}
            onChange={(e) => handleChange('address', e.target.value)}
            placeholder="Street address"
            required
          />
        </div>
        
        <div className="form-group">
          <label>City *</label>
          <Input
            value={formData.city}
            onChange={(e) => handleChange('city', e.target.value)}
            placeholder="e.g., Manchester"
            required
          />
        </div>
        
        <div className="form-group">
          <label>Postcode *</label>
          <Input
            value={formData.postcode}
            onChange={(e) => handleChange('postcode', e.target.value.toUpperCase())}
            placeholder="e.g., M1 2AB"
            required
          />
        </div>
        
        <div className="form-group">
          <label>Phone</label>
          <Input
            type="tel"
            value={formData.phone}
            onChange={(e) => handleChange('phone', e.target.value)}
            placeholder="e.g., 0161 123 4567"
          />
        </div>
        
        <div className="form-group">
          <label>Email</label>
          <Input
            type="email"
            value={formData.email}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder="e.g., manchester@allied.com"
          />
        </div>
        
        <div className="form-group">
          <label>Entity *</label>
          <select
            value={formData.entity}
            onChange={(e) => handleChange('entity', e.target.value)}
          >
            {ENTITIES.map(e => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
        </div>
        
        <div className="form-group">
          <label>Region</label>
          <Input
            value={formData.regionName}
            onChange={(e) => handleChange('regionName', e.target.value)}
            placeholder="e.g., North West"
          />
        </div>
        
        <div className="form-group">
          <label>Branch Manager</label>
          <select
            value={formData.managerId}
            onChange={(e) => handleManagerChange(e.target.value)}
          >
            <option value="">-- Not assigned --</option>
            {managers.map(m => (
              <option key={m.id} value={m.id}>{m.displayName} ({m.email})</option>
            ))}
          </select>
        </div>
        
        <div className="form-group checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={formData.active}
              onChange={(e) => handleChange('active', e.target.checked)}
            />
            Branch is active
          </label>
        </div>
      </div>
      
      <div className="modal-actions">
        <Button variant="secondary" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={saving || !isValid}>
          {saving ? 'Saving...' : submitLabel}
        </Button>
      </div>
    </form>
  )
}

export default BranchManagement

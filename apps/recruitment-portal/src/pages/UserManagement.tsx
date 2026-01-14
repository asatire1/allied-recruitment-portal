// ============================================================================
// Allied Recruitment Portal - User Management Page (R9.6)
// Location: apps/recruitment-portal/src/pages/UserManagement.tsx
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  where,
  serverTimestamp
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getFirebaseDb, getFirebaseFunctions, COLLECTIONS } from '@allied/shared-lib'
// useEntities hook removed - using hardcoded values
import type { User, UserRole, EntityType, Branch } from '@allied/shared-lib'
import { Card, Button, Input, Spinner, Modal, Badge } from '@allied/shared-ui'
import { useAuth } from '../contexts/AuthContext'
import './UserManagement.css'

// ============================================================================
// TYPES
// ============================================================================

interface UserFormData {
  email: string
  displayName: string
  phone: string
  password: string
  role: UserRole
  entities: EntityType[]
  branchIds: string[]
  active: boolean
  emailNotifications: boolean
  pushNotifications: boolean
}

const EMPTY_FORM: UserFormData = {
  email: '',
  displayName: '',
  phone: '',
  password: '',
  role: 'viewer',
  entities: [],
  branchIds: [],
  active: true,
  emailNotifications: true,
  pushNotifications: true,
}

const ROLES: { value: UserRole; label: string; description: string; color: string }[] = [
  { 
    value: 'super_admin', 
    label: 'Super Admin', 
    description: 'Full system access including user management',
    color: '#dc2626'
  },
  { 
    value: 'recruiter', 
    label: 'Recruiter', 
    description: 'Full recruitment workflow access',
    color: '#3b82f6'
  },
  { 
    value: 'regional_manager', 
    label: 'Regional Manager', 
    description: 'View multiple branches in their region',
    color: '#8b5cf6'
  },
  { 
    value: 'branch_manager', 
    label: 'Branch Manager', 
    description: 'Limited view - their branch trials and feedback',
    color: '#10b981'
  },
  { 
    value: 'viewer', 
    label: 'Viewer', 
    description: 'Read-only dashboard and reports',
    color: '#6b7280'
  },
]

// Entity options hardcoded

// ============================================================================
// COMPONENT
// ============================================================================

// Hardcoded entity options - no hook dependency
const ENTITY_OPTIONS = [
  { value: 'allied', label: 'Allied Pharmacies' },
  { value: 'sharief', label: 'Sharief Healthcare' },
  { value: 'core', label: 'Core Pharmaceuticals' }
]

export function UserManagement() {
  const { user: currentUser } = useAuth()
  const entityOptions = ENTITY_OPTIONS
  const [users, setUsers] = useState<User[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  // Modal states
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  
  // Form state
  const [formData, setFormData] = useState<UserFormData>(EMPTY_FORM)
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [filterRole, setFilterRole] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('active')

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const db = getFirebaseDb()
      
      // Load users
      const usersQuery = query(
        collection(db, 'users'),
        orderBy('displayName', 'asc')
      )
      const usersSnap = await getDocs(usersQuery)
      const usersData = usersSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as User[]
      setUsers(usersData)
      
      // Load branches for assignment
      const branchesQuery = query(
        collection(db, 'branches'),
        where('active', '==', true)
      )
      const branchesSnap = await getDocs(branchesQuery)
      const branchesData = branchesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Branch[]
      // Sort by name in memory to avoid requiring a composite index
      branchesData.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      setBranches(branchesData)
      
    } catch (err) {
      console.error('Error loading users:', err)
      setError('Failed to load users')
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

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase()
        const matchesSearch = 
          user.displayName.toLowerCase().includes(search) ||
          user.email.toLowerCase().includes(search) ||
          user.phone?.toLowerCase().includes(search)
        if (!matchesSearch) return false
      }
      
      // Role filter
      if (filterRole !== 'all' && user.role !== filterRole) {
        return false
      }
      
      // Status filter
      if (filterStatus === 'active' && !user.active) return false
      if (filterStatus === 'inactive' && user.active) return false
      
      return true
    })
  }, [users, searchTerm, filterRole, filterStatus])

  // Stats
  const stats = useMemo(() => {
    return {
      total: users.length,
      active: users.filter(u => u.active).length,
      admins: users.filter(u => u.role === 'super_admin').length,
      recruiters: users.filter(u => u.role === 'recruiter').length,
      branchManagers: users.filter(u => u.role === 'branch_manager').length,
    }
  }, [users])

  // ============================================================================
  // CRUD OPERATIONS
  // ============================================================================

  const handleInvite = async () => {
    try {
      setSaving(true)
      setError(null)

      // Check if email already exists locally
      const existingUser = users.find(u => u.email.toLowerCase() === formData.email.toLowerCase())
      if (existingUser) {
        setError('A user with this email already exists')
        return
      }

      // Send invitation email via Cloud Function
      const functions = getFirebaseFunctions()
      const inviteFn = httpsCallable<{
        email: string
        role: string
        branchIds?: string[]
        entityIds?: string[]
      }, { success: boolean; message: string }>(functions, 'createUserInvite')

      const result = await inviteFn({
        email: formData.email.toLowerCase(),
        role: formData.role,
        branchIds: formData.branchIds,
        entityIds: formData.entities,
      })

      if (result.data.success) {
        setShowInviteModal(false)
        setFormData(EMPTY_FORM)
        setSuccess(`Invitation sent to ${formData.email}. They will receive an email to complete their registration.`)
      }
    } catch (err: any) {
      console.error('Error inviting user:', err)
      if (err.message?.includes('already exists')) {
        setError('A user with this email already exists')
      } else {
        setError(err.message || 'Failed to send invitation')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async () => {
    if (!selectedUser) return
    
    try {
      setSaving(true)
      setError(null)
      
      const db = getFirebaseDb()
      await updateDoc(doc(db, 'users', selectedUser.id), {
        displayName: formData.displayName,
        phone: formData.phone || null,
        role: formData.role,
        entities: formData.entities,
        branchIds: formData.branchIds,
        emailNotifications: formData.emailNotifications,
        pushNotifications: formData.pushNotifications,
        updatedAt: serverTimestamp(),
      })
      
      setShowEditModal(false)
      setSelectedUser(null)
      setFormData(EMPTY_FORM)
      setSuccess('User updated successfully')
      await loadData()
    } catch (err) {
      console.error('Error updating user:', err)
      setError('Failed to update user')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (user: User) => {
    // Don't allow deactivating yourself
    if (user.id === currentUser?.uid) {
      setError("You cannot deactivate your own account")
      return
    }
    
    try {
      const db = getFirebaseDb()
      await updateDoc(doc(db, 'users', user.id), {
        active: !user.active,
        updatedAt: serverTimestamp(),
      })
      setSuccess(user.active ? 'User deactivated' : 'User activated')
      await loadData()
    } catch (err) {
      console.error('Error toggling user status:', err)
      setError('Failed to update user status')
    }
  }

  const handleDelete = async () => {
    if (!selectedUser) return
    
    // Don't allow deleting yourself
    if (selectedUser.id === currentUser?.uid) {
      setError("You cannot delete your own account")
      return
    }
    
    try {
      setSaving(true)
      setError(null)
      
      const db = getFirebaseDb()
      await deleteDoc(doc(db, 'users', selectedUser.id))
      
      setShowDeleteModal(false)
      setSelectedUser(null)
      setSuccess('User deleted successfully')
      await loadData()
    } catch (err) {
      console.error('Error deleting user:', err)
      setError('Failed to delete user')
    } finally {
      setSaving(false)
    }
  }

  const handleAssignBranches = async () => {
    if (!selectedUser) return
    
    try {
      setSaving(true)
      setError(null)
      
      const db = getFirebaseDb()
      await updateDoc(doc(db, 'users', selectedUser.id), {
        branchIds: formData.branchIds,
        updatedAt: serverTimestamp(),
      })
      
      // Update branch manager assignments
      for (const branchId of formData.branchIds) {
        await updateDoc(doc(db, 'branches', branchId), {
          managerId: selectedUser.id,
          managerName: selectedUser.displayName,
          updatedAt: serverTimestamp(),
        })
      }
      
      setShowAssignModal(false)
      setSelectedUser(null)
      setFormData(EMPTY_FORM)
      setSuccess('Branches assigned successfully')
      await loadData()
    } catch (err) {
      console.error('Error assigning branches:', err)
      setError('Failed to assign branches')
    } finally {
      setSaving(false)
    }
  }

  // ============================================================================
  // MODAL HANDLERS
  // ============================================================================

  const openEditModal = (user: User) => {
    setSelectedUser(user)
    setFormData({
      email: user.email,
      displayName: user.displayName,
      phone: user.phone || '',
      role: user.role,
      entities: user.entities || [],
      branchIds: user.branchIds || [],
      active: user.active,
      emailNotifications: user.emailNotifications,
      pushNotifications: user.pushNotifications,
    })
    setShowEditModal(true)
  }

  const openAssignModal = (user: User) => {
    setSelectedUser(user)
    setFormData({
      ...EMPTY_FORM,
      branchIds: user.branchIds || [],
    })
    setShowAssignModal(true)
  }

  const openDeleteModal = (user: User) => {
    setSelectedUser(user)
    setShowDeleteModal(true)
  }

  // Clear messages after delay
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [success])

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const getRoleInfo = (role: UserRole) => {
    return ROLES.find(r => r.value === role) || ROLES[4]
  }

  const formatLastLogin = (timestamp: any) => {
    if (!timestamp) return 'Never'
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleDateString('en-GB', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div className="page">
        <div className="loading-container">
          <Spinner size="lg" />
          <p>Loading users...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page user-management">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-description">
            Manage system users and permissions
          </p>
        </div>
        <div className="page-actions">
          <Button variant="primary" onClick={() => setShowInviteModal(true)}>
            + Invite User
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
      {success && (
        <div className="alert alert-success">
          <span>{success}</span>
          <button onClick={() => setSuccess(null)}>×</button>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid">
        <Card className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total Users</div>
        </Card>
        <Card className="stat-card">
          <div className="stat-value">{stats.active}</div>
          <div className="stat-label">Active</div>
        </Card>
        <Card className="stat-card">
          <div className="stat-value">{stats.admins}</div>
          <div className="stat-label">Admins</div>
        </Card>
        <Card className="stat-card">
          <div className="stat-value">{stats.recruiters}</div>
          <div className="stat-label">Recruiters</div>
        </Card>
        <Card className="stat-card">
          <div className="stat-value">{stats.branchManagers}</div>
          <div className="stat-label">Branch Managers</div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="filters-card">
        <div className="filters-row">
          <Input
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
          >
            <option value="all">All Roles</option>
            {ROLES.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
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
      </Card>

      {/* Users Table */}
      <Card className="table-card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Entities</th>
                <th>Branches</th>
                <th>Last Login</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(user => {
                const roleInfo = getRoleInfo(user.role)
                const isCurrentUser = user.id === currentUser?.uid
                
                return (
                  <tr key={user.id} className={!user.active ? 'inactive-row' : ''}>
                    <td>
                      <div className="user-info">
                        <div className="user-avatar">
                          {user.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="user-details">
                          <strong>{user.displayName}</strong>
                          {isCurrentUser && <span className="you-badge">(You)</span>}
                          <span className="user-email">{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge 
                        style={{ backgroundColor: roleInfo.color, color: 'white' }}
                      >
                        {roleInfo.label}
                      </Badge>
                    </td>
                    <td>
                      {user.entities && user.entities.length > 0 ? (
                        <div className="entity-badges">
                          {user.entities.map(e => (
                            <Badge key={e} variant="secondary" size="sm">{e}</Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted">All</span>
                      )}
                    </td>
                    <td>
                      {user.branchIds && user.branchIds.length > 0 ? (
                        <span>{user.branchIds.length} branch{user.branchIds.length !== 1 ? 'es' : ''}</span>
                      ) : (
                        <span className="text-muted">None</span>
                      )}
                    </td>
                    <td>
                      <span className="last-login">{formatLastLogin(user.lastLoginAt)}</span>
                    </td>
                    <td>
                      <Badge variant={user.active ? 'success' : 'gray'}>
                        {user.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button 
                          className="btn-icon" 
                          title="Edit"
                          onClick={() => openEditModal(user)}
                        >
                          ✏️
                        </button>
                        {user.role === 'branch_manager' && (
                          <button 
                            className="btn-icon" 
                            title="Assign Branches"
                            onClick={() => openAssignModal(user)}
                          >
                            🏢
                          </button>
                        )}
                        <button 
                          className="btn-icon" 
                          title={user.active ? 'Deactivate' : 'Activate'}
                          onClick={() => handleToggleActive(user)}
                          disabled={isCurrentUser}
                        >
                          {user.active ? '🔴' : '🟢'}
                        </button>
                        <button 
                          className="btn-icon btn-danger" 
                          title="Delete"
                          onClick={() => openDeleteModal(user)}
                          disabled={isCurrentUser}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-state">
                    No users found matching your filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Invite User Modal */}
      <Modal
        isOpen={showInviteModal}
        onClose={() => { setShowInviteModal(false); setFormData(EMPTY_FORM); }}
        title="Invite New User"
        size="lg"
      >
        <UserForm
          formData={formData}
          setFormData={setFormData}
          branches={branches}
          onSubmit={handleInvite}
          onCancel={() => { setShowInviteModal(false); setFormData(EMPTY_FORM); }}
          saving={saving}
          submitLabel="Send Invitation"
          isNew={true}
          entityOptions={entityOptions}
        />
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setSelectedUser(null); setFormData(EMPTY_FORM); }}
        title={`Edit User: ${selectedUser?.displayName}`}
        size="lg"
      >
        <UserForm
          formData={formData}
          setFormData={setFormData}
          branches={branches}
          onSubmit={handleEdit}
          onCancel={() => { setShowEditModal(false); setSelectedUser(null); setFormData(EMPTY_FORM); }}
          saving={saving}
          submitLabel="Save Changes"
          isNew={false}
          entityOptions={entityOptions}
        />
      </Modal>

      {/* Assign Branches Modal (R9.7) */}
      <Modal
        isOpen={showAssignModal}
        onClose={() => { setShowAssignModal(false); setSelectedUser(null); setFormData(EMPTY_FORM); }}
        title={`Assign Branches to ${selectedUser?.displayName}`}
        size="lg"
      >
        <BranchAssignment
          branches={branches}
          selectedBranchIds={formData.branchIds}
          onSelect={(branchIds) => setFormData({ ...formData, branchIds })}
          onSubmit={handleAssignBranches}
          onCancel={() => { setShowAssignModal(false); setSelectedUser(null); setFormData(EMPTY_FORM); }}
          saving={saving}
        />
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setSelectedUser(null); }}
        title="Delete User"
        size="sm"
      >
        <div className="delete-confirmation">
          <p>
            Are you sure you want to delete <strong>{selectedUser?.displayName}</strong>?
          </p>
          <p className="warning-text">
            This action cannot be undone. The user will lose all access to the system.
          </p>
          <div className="modal-actions">
            <Button 
              variant="secondary" 
              onClick={() => { setShowDeleteModal(false); setSelectedUser(null); }}
            >
              Cancel
            </Button>
            <Button 
              variant="danger" 
              onClick={handleDelete}
              disabled={saving}
            >
              {saving ? 'Deleting...' : 'Delete User'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ============================================================================
// USER FORM COMPONENT
// ============================================================================

interface UserFormProps {
  formData: UserFormData
  setFormData: (data: UserFormData) => void
  branches: Branch[]
  onSubmit: () => void
  onCancel: () => void
  saving: boolean
  submitLabel: string
  isNew: boolean
  entityOptions: { value: string; label: string }[]
}

function UserForm({ 
  formData, 
  setFormData, 
  branches,
  onSubmit, 
  onCancel, 
  saving, 
  submitLabel,
  isNew,
  entityOptions
}: UserFormProps) {
  const handleChange = (field: keyof UserFormData, value: any) => {
    setFormData({ ...formData, [field]: value })
  }

  const handleEntityToggle = (entity: EntityType) => {
    const current = formData.entities || []
    if (current.includes(entity)) {
      handleChange('entities', current.filter(e => e !== entity))
    } else {
      handleChange('entities', [...current, entity])
    }
  }

  // For new users (invites), only require email and role
  // For editing, require email, displayName, and role
  const isValid = isNew
    ? formData.email && formData.role
    : formData.email && formData.displayName && formData.role

  const showBranchSelector = formData.role === 'branch_manager'

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <div className="form-grid">
        <div className="form-group">
          <label>Email Address *</label>
          <Input
            type="email"
            value={formData.email}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder="user@alliedpharmacies.com"
            required
            disabled={!isNew}
          />
          {isNew && (
            <p className="field-hint">An invitation email will be sent to this address</p>
          )}
        </div>

        {/* Only show name/phone fields when editing existing users */}
        {!isNew && (
          <>
            <div className="form-group">
              <label>Full Name *</label>
              <Input
                value={formData.displayName}
                onChange={(e) => handleChange('displayName', e.target.value)}
                placeholder="John Smith"
                required
              />
            </div>

            <div className="form-group">
              <label>Phone Number</label>
              <Input
                type="tel"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="07700 900000"
              />
            </div>
          </>
        )}

        <div className="form-group">
          <label>Role *</label>
          <select
            value={formData.role}
            onChange={(e) => handleChange('role', e.target.value)}
          >
            {ROLES.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <p className="field-hint">
            {ROLES.find(r => r.value === formData.role)?.description}
          </p>
        </div>
        
        <div className="form-group full-width">
          <label>Entity Access</label>
          <div className="entity-checkboxes">
            <label className="checkbox-label all-entities">
              <input
                type="checkbox"
                checked={!formData.entities || formData.entities.length === 0}
                onChange={() => {
                  if (formData.entities && formData.entities.length > 0) {
                    handleChange('entities', [])
                  }
                }}
              />
              <strong>All Entities</strong>
            </label>
            {(entityOptions || [
              { value: 'allied', label: 'Allied Pharmacies' },
              { value: 'sharief', label: 'Sharief Healthcare' },
              { value: 'core', label: 'Core Pharmaceuticals' }
            ]).map(entity => (
              <label key={entity.value} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.entities?.includes(entity.value as EntityType) || false}
                  onChange={() => handleEntityToggle(entity.value as EntityType)}
                  disabled={!formData.entities || formData.entities.length === 0}
                />
                {entity.label}
              </label>
            ))}
          </div>
          <p className="field-hint">
            Select "All Entities" for full access, or choose specific entities
          </p>
        </div>

        {showBranchSelector && (
          <div className="form-group full-width">
            <label>Assigned Branches</label>
            <select
              multiple
              value={formData.branchIds}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, opt => opt.value)
                handleChange('branchIds', selected)
              }}
              style={{ height: '120px' }}
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.city})
                </option>
              ))}
            </select>
            <p className="field-hint">
              Hold Ctrl/Cmd to select multiple branches
            </p>
          </div>
        )}
        
        <div className="form-group checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={formData.emailNotifications}
              onChange={(e) => handleChange('emailNotifications', e.target.checked)}
            />
            Email notifications
          </label>
        </div>
        
        <div className="form-group checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={formData.pushNotifications}
              onChange={(e) => handleChange('pushNotifications', e.target.checked)}
            />
            Push notifications
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

// ============================================================================
// BRANCH ASSIGNMENT COMPONENT (R9.7)
// ============================================================================

interface BranchAssignmentProps {
  branches: Branch[]
  selectedBranchIds: string[]
  onSelect: (branchIds: string[]) => void
  onSubmit: () => void
  onCancel: () => void
  saving: boolean
}

function BranchAssignment({
  branches,
  selectedBranchIds,
  onSelect,
  onSubmit,
  onCancel,
  saving
}: BranchAssignmentProps) {
  const [searchTerm, setSearchTerm] = useState('')
  
  const filteredBranches = useMemo(() => {
    if (!searchTerm) return branches
    const search = searchTerm.toLowerCase()
    return branches.filter(b => 
      b.name.toLowerCase().includes(search) ||
      b.city.toLowerCase().includes(search) ||
      b.postcode.toLowerCase().includes(search)
    )
  }, [branches, searchTerm])

  const handleToggle = (branchId: string) => {
    if (selectedBranchIds.includes(branchId)) {
      onSelect(selectedBranchIds.filter(id => id !== branchId))
    } else {
      onSelect([...selectedBranchIds, branchId])
    }
  }

  const handleSelectAll = () => {
    onSelect(filteredBranches.map(b => b.id))
  }

  const handleClearAll = () => {
    onSelect([])
  }

  return (
    <div className="branch-assignment">
      <div className="assignment-header">
        <Input
          placeholder="Search branches..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <div className="assignment-actions">
          <Button variant="secondary" size="sm" onClick={handleSelectAll}>
            Select All
          </Button>
          <Button variant="secondary" size="sm" onClick={handleClearAll}>
            Clear
          </Button>
        </div>
      </div>
      
      <div className="branch-list">
        {filteredBranches.map(branch => (
          <label 
            key={branch.id} 
            className={`branch-item ${selectedBranchIds.includes(branch.id) ? 'selected' : ''}`}
          >
            <input
              type="checkbox"
              checked={selectedBranchIds.includes(branch.id)}
              onChange={() => handleToggle(branch.id)}
            />
            <div className="branch-item-info">
              <strong>{branch.name}</strong>
              <span>{branch.city}, {branch.postcode}</span>
            </div>
            <Badge variant="secondary" size="sm">{branch.entity}</Badge>
          </label>
        ))}
        {filteredBranches.length === 0 && (
          <p className="empty-message">No branches found</p>
        )}
      </div>
      
      <div className="assignment-summary">
        {selectedBranchIds.length} branch{selectedBranchIds.length !== 1 ? 'es' : ''} selected
      </div>
      
      <div className="modal-actions">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onSubmit} disabled={saving}>
          {saving ? 'Saving...' : 'Assign Branches'}
        </Button>
      </div>
    </div>
  )
}

export default UserManagement

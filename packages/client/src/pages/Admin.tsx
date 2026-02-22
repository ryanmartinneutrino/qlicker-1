import { useEffect, useState } from 'react'
import { useApi } from '../hooks/useApi'
import { apiClient } from '../api/client'
import type { User } from '@qlicker/shared'

type AdminTab = 'main' | 'users' | 'images' | 'sso' | 'video'

const TABS: { key: AdminTab; label: string }[] = [
  { key: 'main', label: 'Main Settings' },
  { key: 'users', label: 'Users' },
  { key: 'images', label: 'Images' },
  { key: 'sso', label: 'SSO' },
  { key: 'video', label: 'Video Chat' },
]

function UsersPanel() {
  const { data: users, loading, execute: fetchUsers } = useApi<User[]>('GET', '/users')
  const [roleUpdating, setRoleUpdating] = useState<string | null>(null)

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleRoleChange = async (userId: string, role: string) => {
    setRoleUpdating(userId)
    try {
      await apiClient.put(`/users/${userId}/role`, { role })
      fetchUsers()
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setRoleUpdating(null)
    }
  }

  const handleDelete = async (userId: string, name: string) => {
    if (!window.confirm(`Delete user "${name}"? This cannot be undone.`)) return
    try {
      await apiClient.delete(`/users/${userId}`)
      fetchUsers()
    } catch (err) {
      alert((err as Error).message)
    }
  }

  if (loading && !users) return <div>Loading users...</div>

  return (
    <div>
      <h3>Users</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {(users || []).map((u) => {
            const email = u.emails?.[0]?.address || '—'
            const name = `${u.profile.firstname} ${u.profile.lastname}`
            const role = u.profile.roles?.[0] || 'student'
            return (
              <tr key={u._id}>
                <td>{name}</td>
                <td>{email}</td>
                <td>
                  <select
                    className="form-control"
                    value={role}
                    disabled={roleUpdating === u._id}
                    onChange={(e) => handleRoleChange(u._id!, e.target.value)}
                  >
                    <option value="student">Student</option>
                    <option value="professor">Professor</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u._id!, name)}>Delete</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function Admin() {
  const [activeTab, setActiveTab] = useState<AdminTab>('main')

  return (
    <div className="ql-admin-page page">
      <div className="ql-admin-toolbar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`btn ${activeTab === tab.key ? 'btn-primary' : 'btn-default'}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="ql-admin-settings">
        {activeTab === 'main' && <p>Main settings coming soon.</p>}
        {activeTab === 'users' && <UsersPanel />}
        {activeTab === 'images' && <p>Image settings coming soon.</p>}
        {activeTab === 'sso' && <p>SSO settings coming soon.</p>}
        {activeTab === 'video' && <p>Video chat settings coming soon.</p>}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import type { User } from '@qlicker/shared'
import { useApi } from '../../hooks/useApi'
import { apiClient } from '../../api/client'

export default function ManageUsers() {
  const { data: users, loading, execute: fetchUsers } = useApi<User[]>('GET', '/users')
  const [busyUserId, setBusyUserId] = useState<string | null>(null)

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const changeRole = async (userId: string, role: string) => {
    setBusyUserId(userId)
    try {
      await apiClient.put(`/users/${userId}/role`, { role })
      await fetchUsers()
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setBusyUserId(null)
    }
  }

  const removeUser = async (userId: string, name: string) => {
    if (!window.confirm(`Delete user \"${name}\"? This cannot be undone.`)) return
    setBusyUserId(userId)
    try {
      await apiClient.delete(`/users/${userId}`)
      await fetchUsers()
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setBusyUserId(null)
    }
  }

  const promoteUser = async (userId: string) => {
    setBusyUserId(userId)
    try {
      await apiClient.post(`/users/${userId}/promote`, {})
      await fetchUsers()
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setBusyUserId(null)
    }
  }

  const changeCanPromote = async (userId: string, canPromote: boolean) => {
    setBusyUserId(userId)
    try {
      await apiClient.patch(`/users/${userId}/can-promote`, { canPromote })
      await fetchUsers()
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setBusyUserId(null)
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
            <th>Can Promote</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {(users || []).map((user) => {
            const email = user.emails?.[0]?.address || '—'
            const name = `${user.profile.firstname} ${user.profile.lastname}`
            const role = user.profile.roles?.[0] || 'student'
            const canPromote = Boolean(user.profile.canPromote)
            const disableActions = busyUserId === user._id
            return (
              <tr key={user._id}>
                <td>{name}</td>
                <td>{email}</td>
                <td>
                  <select
                    className="form-control"
                    value={role}
                    disabled={disableActions}
                    onChange={(e) => changeRole(user._id!, e.target.value)}
                  >
                    <option value="student">Student</option>
                    <option value="professor">Professor</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={canPromote}
                    disabled={disableActions}
                    onChange={(e) => changeCanPromote(user._id!, e.target.checked)}
                  />
                </td>
                <td>
                  <button
                    className="btn btn-default btn-sm"
                    disabled={disableActions || role === 'admin' || role === 'professor'}
                    onClick={() => promoteUser(user._id!)}
                    style={{ marginRight: '0.5rem' }}
                  >
                    Promote
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    disabled={disableActions}
                    onClick={() => removeUser(user._id!, name)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

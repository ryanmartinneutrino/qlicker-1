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
          {(users || []).map((user) => {
            const email = user.emails?.[0]?.address || '—'
            const name = `${user.profile.firstname} ${user.profile.lastname}`
            const role = user.profile.roles?.[0] || 'student'
            return (
              <tr key={user._id}>
                <td>{name}</td>
                <td>{email}</td>
                <td>
                  <select
                    className="form-control"
                    value={role}
                    disabled={busyUserId === user._id}
                    onChange={(e) => changeRole(user._id!, e.target.value)}
                  >
                    <option value="student">Student</option>
                    <option value="professor">Professor</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td>
                  <button
                    className="btn btn-danger btn-sm"
                    disabled={busyUserId === user._id}
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

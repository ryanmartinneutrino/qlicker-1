import { useState } from 'react'
import { apiClient } from '../../api/client'

interface ChangePasswordModalProps {
  userId: string
  done: () => void
}

export function ChangePasswordModal({ userId, done }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [verifyPassword, setVerifyPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPassword || !verifyPassword) {
      setError('Please enter and verify a password.')
      return
    }
    if (newPassword !== verifyPassword) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await apiClient.put(`/users/${userId}/password`, { currentPassword, newPassword })
      done()
      alert('Password changed')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="ql-modal-container" onClick={done}>
      <div className="ql-modal ql-modal-newemail ql-card" onClick={(e) => e.stopPropagation()}>
        <div className="ql-modal-header ql-header-bar"><h3>Change Password</h3></div>
        <form className="ql-card-content" onSubmit={onSubmit}>
          <label>Current Password:</label>
          <input type="password" className="form-control" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          <br />
          <label>New Password:</label>
          <input type="password" className="form-control" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <br />
          <label>Verify Password:</label>
          <input type="password" className="form-control" value={verifyPassword} onChange={(e) => setVerifyPassword(e.target.value)} />
          <br />
          {error && <div className="alert alert-danger">{error}</div>}
          <div className="ql-buttongroup">
            <button type="button" className="btn btn-default" onClick={done}>Cancel</button>
            <button type="submit" className="btn btn-default" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { apiClient } from '../../api/client'

interface ChangeEmailModalProps {
  userId: string
  oldEmail: string
  done: () => void
}

export function ChangeEmailModal({ userId, oldEmail, done }: ChangeEmailModalProps) {
  const [newEmail, setNewEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await apiClient.put(`/users/${userId}/email`, { email: newEmail })
      await apiClient.post('/users/verify-email', {})
      done()
      window.location.reload()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="ql-modal-container" onClick={done}>
      <div className="ql-modal ql-modal-newemail ql-card" onClick={(e) => e.stopPropagation()}>
        <div className="ql-modal-header ql-header-bar"><h3>Change Email</h3></div>
        <form className="ql-card-content" onSubmit={onSubmit}>
          <div className="text">Old email: {oldEmail}</div>
          <label>New Email Address:</label>
          <input type="email" className="form-control" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
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

import { useState } from 'react'
import { apiClient } from '../../api/client'

interface PromoteAccountModalProps {
  done: () => void
}

export function PromoteAccountModal({ done }: PromoteAccountModalProps) {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const normalized = email.trim().toLowerCase()
    if (!normalized) return
    setSubmitting(true)
    setError(null)
    setSuccess(null)
    try {
      await apiClient.post('/users/promote', { email: normalized })
      setSuccess('Account promoted to professor.')
      setEmail('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="ql-modal-container" onClick={done}>
      <div className="ql-modal ql-card" onClick={(e) => e.stopPropagation()}>
        <div className="ql-modal-header ql-header-bar"><h3>Promote Account</h3></div>
        <form className="ql-card-content" onSubmit={handleSubmit}>
          <p className="text">Promote an existing account to professor by email.</p>
          <label htmlFor="promote-email">Email:</label>
          <input
            id="promote-email"
            className="form-control"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            autoFocus
          />

          {error && <div className="alert alert-danger" style={{ marginTop: '12px' }}>{error}</div>}
          {success && <div className="alert alert-success" style={{ marginTop: '12px' }}>{success}</div>}

          <div className="ql-buttongroup">
            <button type="button" className="btn btn-default" onClick={done} disabled={submitting}>Close</button>
            <button type="submit" className="btn btn-default" disabled={submitting || !email.trim()}>
              {submitting ? 'Promoting...' : 'Promote'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

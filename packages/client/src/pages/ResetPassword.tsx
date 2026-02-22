import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiClient } from '../api/client'

export default function ResetPassword() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      await apiClient.post('/auth/forgot-password', { email })
      setMessage('If an account exists with that email, a reset link has been sent.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      await apiClient.post('/auth/reset-password', { token, password })
      setMessage('Password has been reset successfully.')
      setTimeout(() => navigate('/login'), 2000)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (token) {
    return (
      <div className="page">
        <div className="ql-header-bar">
          <h1>Reset Password</h1>
        </div>
        <div className="container">
          <div className="row">
            <div className="col-md-4 col-md-offset-4">
              <form onSubmit={handleResetPassword}>
                <div className="form-group">
                  <label htmlFor="password">New Password</label>
                  <input
                    id="password"
                    type="password"
                    className="form-control"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="confirmPassword">Confirm Password</label>
                  <input
                    id="confirmPassword"
                    type="password"
                    className="form-control"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                {error && <div className="ql-error">{error}</div>}
                {message && <div className="ql-success">{message}</div>}
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Resetting...' : 'Reset Password'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="ql-header-bar">
        <h1>Forgot Password</h1>
      </div>
      <div className="container">
        <div className="row">
          <div className="col-md-4 col-md-offset-4">
            <form onSubmit={handleForgotPassword}>
              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <input
                  id="email"
                  type="email"
                  className="form-control"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              {error && <div className="ql-error">{error}</div>}
              {message && <div className="ql-success">{message}</div>}
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
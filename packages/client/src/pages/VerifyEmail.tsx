import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

type VerifyStatus = 'verifying' | 'verified' | 'expired' | 'invalid' | 'error'

export default function VerifyEmail() {
  const { token } = useParams<{ token: string }>()
  const [status, setStatus] = useState<VerifyStatus>('verifying')

  useEffect(() => {
    if (!token) {
      setStatus('invalid')
      return
    }

    let active = true
    const run = async () => {
      try {
        const response = await fetch(`/api/users/verify-email/${encodeURIComponent(token)}`, {
          method: 'GET',
          credentials: 'include',
        })

        if (!active) return
        if (response.ok) {
          setStatus('verified')
          return
        }
        if (response.status === 410) {
          setStatus('expired')
          return
        }
        if (response.status === 404) {
          setStatus('invalid')
          return
        }
        setStatus('error')
      } catch {
        if (active) setStatus('error')
      }
    }

    void run()
    return () => {
      active = false
    }
  }, [token])

  const message = useMemo(() => {
    if (status === 'verifying') return 'Verifying email...'
    if (status === 'verified') return 'Email verified successfully. You can now sign in.'
    if (status === 'expired') return 'This verification link has expired. Request a new verification email from your profile.'
    if (status === 'invalid') return 'This verification link is invalid.'
    return 'Unable to verify this email right now. Please try again.'
  }, [status])

  return (
    <div className="page">
      <div className="ql-header-bar">
        <h1>Email Verification</h1>
      </div>
      <div className="container">
        <div className="ql-card">
          <div className="ql-card-content">
            <p>{message}</p>
            <p>
              <Link to="/login">Go to Login</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

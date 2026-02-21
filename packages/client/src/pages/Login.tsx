import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '../api/client'
import { useAuth } from '../hooks/useAuth'

interface LoginOptions {
  ssoEnabled: boolean
  ssoInstitution: string | null
}

export function isEmailLoginAllowed(allowEmailRoute: boolean, ssoEnabled: boolean): boolean {
  return allowEmailRoute || !ssoEnabled
}

export default function Login({ allowEmail }: { allowEmail?: boolean }) {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [options, setOptions] = useState<LoginOptions>({ ssoEnabled: false, ssoInstitution: null })

  useEffect(() => {
    let mounted = true
    const fetchLoginOptions = async () => {
      try {
        const result = await apiClient.get<LoginOptions>('/auth/login-options')
        if (mounted) setOptions(result)
      } catch {
        if (mounted) setOptions({ ssoEnabled: false, ssoInstitution: null })
      }
    }

    fetchLoginOptions()
    const interval = window.setInterval(fetchLoginOptions, 15000)
    return () => {
      mounted = false
      window.clearInterval(interval)
    }
  }, [])

  const allowEmailLogin = useMemo(
    () => isEmailLoginAllowed(Boolean(allowEmail), options.ssoEnabled),
    [allowEmail, options.ssoEnabled]
  )

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!allowEmailLogin) return
    setError(null)
    setLoading(true)
    try {
      await login(email.trim(), password)
      window.location.assign('/')
    } catch (err) {
      setError((err as Error).message || 'Login failed.')
    } finally {
      setLoading(false)
    }
  }

  const onSsoLogin = () => {
    window.location.assign('/api/auth/saml')
  }

  return (
    <div className="ql-login-page">
      <form className="ql-login-card" onSubmit={onSubmit}>
        <h1 className="ql-login-header">Login to Qlicker</h1>
        <div className="ql-login-content">
          {error ? <div className="ql-login-error">{error}</div> : null}

          {allowEmailLogin ? (
            <>
              <input
                className="ql-login-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                autoComplete="username"
              />
              <input
                className="ql-login-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
              />
              <button className="ql-login-btn ql-login-btn-primary" type="submit" disabled={loading}>
                {loading ? 'Logging in…' : 'Login'}
              </button>
            </>
          ) : null}

          {options.ssoEnabled ? (
            <button className="ql-login-btn ql-login-btn-secondary" type="button" onClick={onSsoLogin}>
              Login through {options.ssoInstitution || 'SSO'}
            </button>
          ) : null}

          <div className="ql-login-meta">
            {allowEmailLogin ? (
              <Link to="/reset/token">Forgot your password?</Link>
            ) : (
              <Link to="/login/email">Have an email based account?</Link>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}

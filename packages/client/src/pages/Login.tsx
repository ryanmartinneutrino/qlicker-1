import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { User } from '@qlicker/shared'
import { apiClient } from '../api/client'
import { useAuth } from '../hooks/useAuth'

interface LoginOptions {
  ssoEnabled: boolean
  ssoInstitution: string | null
}

export function isEmailLoginAllowed(allowEmailRoute: boolean, ssoEnabled: boolean): boolean {
  return allowEmailRoute || !ssoEnabled
}

export function navigateByRole(user: User): string {
  const roles = user.profile?.roles ?? []
  if (roles.includes('admin')) return '/admin'
  if (roles.includes('professor')) return '/manage'
  return '/student'
}

export default function Login({ allowEmail }: { allowEmail?: boolean }) {
  const { login, register, user } = useAuth()
  const navigate = useNavigate()
  const [loginMode, setLoginMode] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVerify, setPasswordVerify] = useState('')
  const [firstname, setFirstname] = useState('')
  const [lastname, setLastname] = useState('')
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

    if (loginMode) {
      if (!email || !password) {
        setError('Email and password cannot be empty')
        return
      }
      setLoading(true)
      try {
        await login(email.trim(), password)
      } catch (err) {
        setError((err as Error).message || 'Login failed.')
        setLoading(false)
        return
      }
    } else {
      if (!email || !password) {
        setError('Email and password cannot be empty')
        return
      }
      if (!firstname || !lastname) {
        setError('First and last name cannot be empty')
        return
      }
      if (password !== passwordVerify) {
        setError("Passwords don't match")
        return
      }
      setLoading(true)
      try {
        await register(email.trim(), password, firstname, lastname)
      } catch (err) {
        setError((err as Error).message || 'Registration failed.')
        setLoading(false)
        return
      }
    }
    setLoading(false)
  }

  // Navigate after user is set (login or register both update user in context)
  useEffect(() => {
    if (user) {
      navigate(navigateByRole(user))
    }
  }, [user, navigate])

  const onSsoLogin = () => {
    window.location.assign('/api/auth/saml')
  }

  const switchFormString = loginMode ? 'Create an Account' : 'Login'
  const submitButtonString = loginMode ? 'Login' : 'Sign Up'
  const topMessage = loginMode ? 'Login to Qlicker' : 'Register for Qlicker'
  const haveAccountMessage = loginMode ? "Don't have an account?" : 'Already have an account?'

  return (
    <div className="ql-login-page">
      <form className="ql-login-box ql-card" onSubmit={onSubmit}>
        <div className="header-container ql-header-bar">
          <h4 className="header">{topMessage}</h4>
        </div>
        <div className="ql-card-content inputs-container">
          {error ? <div className="ql-login-box-error-msg">{error}</div> : null}

          {!loginMode ? (
            <div className="input-group">
              <input
                className="form-control"
                type="text"
                value={firstname}
                onChange={(e) => setFirstname(e.target.value)}
                placeholder="First Name"
              />
              <input
                className="form-control"
                type="text"
                value={lastname}
                onChange={(e) => setLastname(e.target.value)}
                placeholder="Last Name"
              />
            </div>
          ) : null}

          {allowEmailLogin ? (
            <div>
              <input
                className="form-control"
                id="emailField"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                autoComplete="username"
              />
              <br />
              <input
                className="form-control"
                id="passwordField"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete={loginMode ? 'current-password' : 'new-password'}
              />
              <br />
              {!loginMode ? (
                <div>
                  <input
                    className="form-control"
                    type="password"
                    value={passwordVerify}
                    onChange={(e) => setPasswordVerify(e.target.value)}
                    placeholder="Retype Password"
                    autoComplete="new-password"
                  />
                  <br />
                </div>
              ) : null}
              <div className="spacer1">&nbsp;</div>
              <input
                type="submit"
                id="submitButton"
                className="btn btn-primary btn-block"
                value={loading ? 'Please wait…' : submitButtonString}
                disabled={loading}
              />
            </div>
          ) : null}

          {!options.ssoEnabled ? (
            <div>
              <div className="bottom-account-message">{haveAccountMessage}</div>
              <button
                className="ql-switch-form-button btn btn-default btn-block"
                type="button"
                onClick={() => setLoginMode(!loginMode)}
              >
                {switchFormString}
              </button>
            </div>
          ) : null}

          {options.ssoEnabled ? (
            <button
              className="ql-switch-form-button btn btn-default btn-block"
              type="button"
              onClick={onSsoLogin}
            >
              Login through {options.ssoInstitution || 'SSO'}
            </button>
          ) : null}

          <div className="ql-login-meta">
            {allowEmailLogin ? (
              <Link to="/reset">Forgot your password?</Link>
            ) : (
              <Link to="/login/email">Have an email based account?</Link>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}

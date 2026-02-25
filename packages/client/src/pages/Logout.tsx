import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Logout() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    let active = true

    const performLogout = async () => {
      try {
        await logout()
      } catch {
        // Route should still send users to login even when server session is already missing.
      } finally {
        if (active) {
          navigate('/login', { replace: true })
        }
      }
    }

    void performLogout()
    return () => {
      active = false
    }
  }, [logout, navigate])

  return <div className="page">Signing out...</div>
}

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { navigateByRole } from './Login'

export default function Home() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && user) {
      navigate(navigateByRole(user), { replace: true })
    }
  }, [user, loading, navigate])

  return <div className="page">Redirecting…</div>
}

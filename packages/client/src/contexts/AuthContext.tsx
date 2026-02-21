import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { apiClient } from '../api/client'
import type { User } from '@qlicker/shared'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  register: (email: string, password: string, firstname: string, lastname: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Restore session on mount
  useEffect(() => {
    apiClient
      .get<{ user: User }>('/auth/me')
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { user } = await apiClient.post<{ user: User }>('/auth/login', { email, password })
    setUser(user)
  }, [])

  const logout = useCallback(async () => {
    await apiClient.post('/auth/logout', {})
    setUser(null)
  }, [])

  const register = useCallback(
    async (email: string, password: string, firstname: string, lastname: string) => {
      const { user } = await apiClient.post<{ user: User }>('/auth/register', {
        email,
        password,
        firstname,
        lastname,
      })
      setUser(user)
    },
    []
  )

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider')
  return ctx
}

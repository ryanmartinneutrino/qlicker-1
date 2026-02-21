import { useState, useCallback } from 'react'
import { apiClient } from '../api/client'

interface UseApiResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  execute: (...args: unknown[]) => Promise<T | null>
}

/**
 * Generic API fetch hook with loading/error states.
 * Use for one-off API calls that are not real-time subscriptions.
 */
export function useApi<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string
): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const execute = useCallback(
    async (body?: unknown): Promise<T | null> => {
      setLoading(true)
      setError(null)
      try {
        let result: T
        if (method === 'GET') {
          result = await apiClient.get<T>(path)
        } else if (method === 'POST') {
          result = await apiClient.post<T>(path, body)
        } else if (method === 'PUT') {
          result = await apiClient.put<T>(path, body)
        } else {
          result = await apiClient.delete<T>(path)
        }
        setData(result)
        return result
      } catch (err) {
        setError((err as Error).message)
        return null
      } finally {
        setLoading(false)
      }
    },
    [method, path]
  )

  return { data, loading, error, execute }
}

import { useState, useEffect, useCallback } from 'react'
import { useRealtimeContext } from '../contexts/RealtimeContext'
import { apiClient } from '../api/client'

interface UseRealtimeCollectionOptions {
  /** API path to fetch initial data, e.g. '/questions?sessionId=xxx' */
  fetchPath: string
  /** Socket.IO event name to subscribe with */
  subscribeEvent: string
  /** Payload to send with the subscribe event */
  subscribePayload: Record<string, string>
  /** Socket.IO event name to listen for changes */
  changeEvent: string
}

interface UseRealtimeCollectionResult<T> {
  data: T[]
  loading: boolean
  error: string | null
  refetch: () => void
}

/**
 * Generic real-time subscription hook.
 * Replaces the withTracker pattern from Meteor.
 * 1. Fetches initial data via REST API.
 * 2. Subscribes via Socket.IO.
 * 3. Updates state on change stream events.
 */
export function useRealtimeCollection<T extends { _id?: string }>(
  options: UseRealtimeCollectionOptions
): UseRealtimeCollectionResult<T> {
  const { fetchPath, subscribeEvent, subscribePayload, changeEvent } = options
  const { socket } = useRealtimeContext()
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiClient.get<T[]>(fetchPath)
      setData(result)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [fetchPath])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!socket) return

    socket.emit(subscribeEvent, subscribePayload)

    const handler = (event: { operationType: string; fullDocument?: T; documentKey?: { _id: string } }) => {
      if (event.operationType === 'insert' && event.fullDocument) {
        setData((prev) => [...prev, event.fullDocument as T])
      } else if (event.operationType === 'update' && event.fullDocument) {
        setData((prev) =>
          prev.map((item) => (item._id === event.fullDocument?._id ? (event.fullDocument as T) : item))
        )
      } else if (event.operationType === 'delete' && event.documentKey) {
        setData((prev) => prev.filter((item) => item._id !== event.documentKey?._id))
      }
    }

    socket.on(changeEvent, handler)
    return () => {
      socket.off(changeEvent, handler)
    }
  }, [socket, subscribeEvent, subscribePayload, changeEvent])

  return { data, loading, error, refetch: fetchData }
}

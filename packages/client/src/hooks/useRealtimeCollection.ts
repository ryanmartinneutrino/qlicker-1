import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRealtimeContext } from '../contexts/RealtimeContext'
import { apiClient } from '../api/client'

interface UseRealtimeCollectionOptions {
  /** API path to fetch initial data, e.g. '/questions?sessionId=xxx' */
  fetchPath: string
  /** Socket.IO event name to subscribe with */
  subscribeEvent: string
  /** Socket.IO event name to unsubscribe with (defaults to subscribeEvent with `subscribe:` => `unsubscribe:`) */
  unsubscribeEvent?: string
  /** Payload to send with the subscribe event */
  subscribePayload: Record<string, string | number | boolean | null | undefined>
  /** Socket.IO event name to listen for changes */
  changeEvent: string
  /** Whether the hook should fetch/subscribe (default true) */
  enabled?: boolean
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
  const { fetchPath, subscribeEvent, unsubscribeEvent, subscribePayload, changeEvent, enabled = true } = options
  const { socket } = useRealtimeContext()
  const payloadKey = JSON.stringify(subscribePayload)
  const payload = useMemo(() => JSON.parse(payloadKey) as Record<string, unknown>, [payloadKey])
  const computedUnsubscribeEvent = useMemo(() => {
    if (unsubscribeEvent) return unsubscribeEvent
    if (subscribeEvent.startsWith('subscribe:')) {
      return subscribeEvent.replace('subscribe:', 'unsubscribe:')
    }
    return null
  }, [subscribeEvent, unsubscribeEvent])
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!enabled) {
      setLoading(false)
      setError(null)
      setData([])
      return
    }
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
  }, [enabled, fetchPath])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!socket) return
    if (!enabled) return

    socket.emit(subscribeEvent, payload)

    const upsertById = (rows: T[], next: T): T[] => {
      const nextId = next._id
      if (!nextId) return [...rows, next]
      const index = rows.findIndex((entry) => entry._id === nextId)
      if (index < 0) return [...rows, next]
      const copy = [...rows]
      copy[index] = next
      return copy
    }

    const handler = (event: { operationType: string; fullDocument?: T; documentKey?: { _id: string } }) => {
      if ((event.operationType === 'insert' || event.operationType === 'update' || event.operationType === 'replace') && event.fullDocument) {
        setData((prev) => upsertById(prev, event.fullDocument as T))
      } else if (event.operationType === 'delete' && event.documentKey) {
        setData((prev) => prev.filter((item) => item._id !== event.documentKey?._id))
      }
    }

    socket.on(changeEvent, handler)
    return () => {
      socket.off(changeEvent, handler)
      if (computedUnsubscribeEvent) {
        socket.emit(computedUnsubscribeEvent, payload)
      }
    }
  }, [socket, enabled, subscribeEvent, computedUnsubscribeEvent, payload, changeEvent])

  return { data, loading, error, refetch: fetchData }
}

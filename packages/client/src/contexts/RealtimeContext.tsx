import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'

interface RealtimeContextValue {
  socket: Socket | null
  connected: boolean
}

const RealtimeContext = createContext<RealtimeContextValue>({ socket: null, connected: false })

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const socket = io('/', {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    })

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socketRef.current = socket

    return () => {
      socket.disconnect()
    }
  }, [])

  return (
    <RealtimeContext.Provider value={{ socket: socketRef.current, connected }}>
      {children}
    </RealtimeContext.Provider>
  )
}

export function useRealtimeContext(): RealtimeContextValue {
  return useContext(RealtimeContext)
}

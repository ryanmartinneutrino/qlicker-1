import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiClient } from '../api/client'
import { useAuth } from '../hooks/useAuth'

interface ConnectionPayload {
  domain: string
  whiteboardDomain: string
  etherpadDomain: string
  connectionInfo: {
    options: {
      roomName: string
      userInfo?: { displayName?: string }
      interfaceConfigOverwrite?: Record<string, unknown>
      configOverwrite?: Record<string, unknown>
    }
    apiOptions: {
      startAudioMuted?: boolean
      startVideoMuted?: boolean
      startTileView?: boolean
      subjectTitle?: string
    }
    courseId: string
    categoryNumber?: number
    groupNumber?: number
    helpVideoChat?: boolean
  }
}

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: Record<string, unknown>) => any
  }
}

function ensureJitsiScript(domain: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) {
      resolve()
      return
    }

    const existing = document.querySelector('script[data-jitsi-api="true"]') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Unable to load Jitsi API script.')))
      return
    }

    const script = document.createElement('script')
    script.src = `https://${domain}/external_api.js`
    script.async = true
    script.dataset.jitsiApi = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Unable to load Jitsi API script.'))
    document.body.appendChild(script)
  })
}

export default function JitsiWindow() {
  const { courseId, catNumber, gNumber } = useParams<{ courseId: string; catNumber?: string; gNumber?: string }>()
  const { user } = useAuth()
  const [payload, setPayload] = useState<ConnectionPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [helpActive, setHelpActive] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const isGroupWindow = useMemo(() => Boolean(catNumber), [catNumber])
  const isInstructor = useMemo(() => Boolean(user?.profile.roles.includes('admin') || user?.profile.roles.includes('professor')), [user])

  useEffect(() => {
    const loadConnection = async () => {
      if (!courseId) return
      setLoading(true)
      setError(null)
      try {
        const data = isGroupWindow
          ? await apiClient.get<ConnectionPayload>(`/courses/${courseId}/video-chat/categories/${catNumber}/connection?groupNumber=${gNumber || ''}`)
          : await apiClient.get<ConnectionPayload>(`/courses/${courseId}/video-chat/connection`)
        setPayload(data)
        setHelpActive(Boolean(data.connectionInfo.helpVideoChat))
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setLoading(false)
      }
    }

    void loadConnection()
  }, [catNumber, courseId, gNumber, isGroupWindow])

  useEffect(() => {
    if (!payload || !courseId || !containerRef.current) return

    let api: any | null = null
    const { connectionInfo, domain, etherpadDomain, whiteboardDomain } = payload

    const join = async () => {
      try {
        if (isGroupWindow) {
          await apiClient.post(`/courses/${courseId}/video-chat/categories/${connectionInfo.categoryNumber}/groups/${connectionInfo.groupNumber}/join`, {})
        } else {
          await apiClient.post(`/courses/${courseId}/video-chat/join`, {})
        }
      } catch {
        // best-effort parity: room should still open even if join tracking fails
      }
    }

    const leave = async () => {
      try {
        if (isGroupWindow) {
          await apiClient.post(`/courses/${courseId}/video-chat/categories/${connectionInfo.categoryNumber}/groups/${connectionInfo.groupNumber}/leave`, {})
        } else {
          await apiClient.post(`/courses/${courseId}/video-chat/leave`, {})
        }
      } catch {
        // no-op
      }
    }

    const beforeUnload = () => {
      void leave()
    }

    const boot = async () => {
      await ensureJitsiScript(domain)
      if (!window.JitsiMeetExternalAPI) throw new Error('Jitsi API unavailable after script load.')

      const options = {
        ...connectionInfo.options,
        parentNode: containerRef.current,
      } as Record<string, unknown>

      const etherpadBase = whiteboardDomain || etherpadDomain
      if (etherpadBase) {
        options.etherpad_base = etherpadBase
      }

      api = new window.JitsiMeetExternalAPI(domain, options)
      api.addListener('videoConferenceJoined', () => void join())
      api.addListener('videoConferenceLeft', () => {
        void leave()
        if (window.opener) window.close()
      })

      if (connectionInfo.apiOptions?.subjectTitle) {
        api.executeCommand('subject', connectionInfo.apiOptions.subjectTitle)
      }

      if (connectionInfo.apiOptions?.startTileView === true) {
        api.addListener('videoConferenceJoined', () => {
          const listener = ({ enabled }: { enabled: boolean }) => {
            if (!enabled) api.executeCommand('toggleTileView')
            api.removeListener('tileViewChanged', listener)
          }
          api.addEventListener('tileViewChanged', listener)
          api.executeCommand('toggleTileView')
        })
      }

      if (connectionInfo.apiOptions?.startTileView === false) {
        api.addListener('videoConferenceJoined', () => {
          const listener = ({ enabled }: { enabled: boolean }) => {
            if (enabled) api.executeCommand('toggleTileView')
            api.removeListener('tileViewChanged', listener)
          }
          api.addEventListener('tileViewChanged', listener)
          api.executeCommand('toggleTileView')
        })
      }

      window.addEventListener('beforeunload', beforeUnload)
    }

    void boot().catch((err: unknown) => {
      setError((err as Error).message)
    })

    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      void leave()
      if (api) {
        api.dispose()
      }
    }
  }, [courseId, isGroupWindow, payload])

  const toggleHelp = async () => {
    if (!courseId || !payload?.connectionInfo.categoryNumber || !payload.connectionInfo.groupNumber) return
    await apiClient.post(
      `/courses/${courseId}/video-chat/categories/${payload.connectionInfo.categoryNumber}/groups/${payload.connectionInfo.groupNumber}/help/toggle`,
      {}
    )
    setHelpActive((value) => !value)
  }

  const clearGroup = async () => {
    if (!courseId || !payload?.connectionInfo.categoryNumber || !payload.connectionInfo.groupNumber) return
    await apiClient.post(
      `/courses/${courseId}/video-chat/categories/${payload.connectionInfo.categoryNumber}/groups/${payload.connectionInfo.groupNumber}/clear`,
      {}
    )
  }

  if (loading) return <div className="page">Loading video room...</div>
  if (error) return <div className="page">Error: {error}</div>
  if (!payload) return <div className="page">No connection info.</div>

  const directLink = `https://${payload.domain}/${encodeURIComponent(payload.connectionInfo.options.roomName)}`
  const showStudentHelp = isGroupWindow && !isInstructor
  const showInstructorClear = isGroupWindow && isInstructor

  return (
    <div className="ql-jitsi-outer">
      <div className="ql-jitsi-inner" id="ql-jitsi-inner" ref={containerRef} />
      <div className="ql-jitsi-toolbar">
        <div className="ql-jitsi-toolbar-info">
          Chat room direct link: <a href={directLink}>{directLink}</a>
        </div>
        {showStudentHelp && (
          <button className={`btn${helpActive ? ' ql-blinking' : ''}`} onClick={() => void toggleHelp()}>
            {helpActive ? 'Calling instructor...' : 'Call instructor for help'}
          </button>
        )}
        {showInstructorClear && (
          <button className="btn" onClick={() => void clearGroup()}>
            Clear room of participants
          </button>
        )}
      </div>
    </div>
  )
}

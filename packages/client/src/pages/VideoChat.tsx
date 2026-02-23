import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Course as CourseType, GroupCategory } from '@qlicker/shared'
import { apiClient } from '../api/client'
import { useAuth } from '../hooks/useAuth'

interface VideoChatConfig {
  enabled: boolean
  domain: string
  whiteboardDomain: string
  etherpadDomain: string
  courseVideoChatOptions: { urlId?: string; joined?: string[] } | null
  groupCategories: GroupCategory[]
}

function buildCourseRoom(course: CourseType, urlId?: string): string {
  return `Ql_C_${course._id}_${urlId || 'room'}`
}

export default function VideoChat() {
  const { courseId } = useParams<{ courseId: string }>()
  const { user } = useAuth()
  const [course, setCourse] = useState<CourseType | null>(null)
  const [config, setConfig] = useState<VideoChatConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isInstructor = useMemo(
    () =>
      Boolean(
        user &&
          course &&
          ((course.instructors || []).includes(user._id || '') || user.profile.roles.includes('admin'))
      ),
    [course, user]
  )

  const load = async () => {
    if (!courseId) return
    setLoading(true)
    setError(null)
    try {
      const [courseDoc, configDoc] = await Promise.all([
        apiClient.get<CourseType>(`/courses/${courseId}`),
        apiClient.get<VideoChatConfig>(`/courses/${courseId}/video-chat-config`),
      ])
      setCourse(courseDoc)
      setConfig(configDoc)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId])

  const joinCourseChat = async () => {
    if (!courseId) return
    await apiClient.post(`/courses/${courseId}/video-chat/join`, {})
    await load()
  }

  const leaveCourseChat = async () => {
    if (!courseId) return
    await apiClient.post(`/courses/${courseId}/video-chat/leave`, {})
    await load()
  }

  const toggleCourseChat = async (enabled: boolean) => {
    if (!courseId) return
    await apiClient.post(`/courses/${courseId}/video-chat/toggle`, { enabled })
    await load()
  }

  if (loading) return <div className="page">Loading...</div>
  if (error) return <div className="page">Error: {error}</div>
  if (!course || !config) return <div className="page">Course not found</div>

  const roomName = buildCourseRoom(course, config.courseVideoChatOptions?.urlId)
  const courseRoomUrl = config.domain ? `https://${config.domain}/${encodeURIComponent(roomName)}` : ''
  const participants = config.courseVideoChatOptions?.joined || []
  const isInRoom = Boolean(user?._id && participants.includes(user._id))

  return (
    <div className="page">
      <div className="ql-header-bar">
        <h1>Video Chat: {course.name}</h1>
      </div>
      <div className="container">
        <Link className="btn btn-secondary" to={`/course/${courseId}`} style={{ marginBottom: '1rem', display: 'inline-block' }}>
          Back to Course
        </Link>

        {!config.enabled ? (
          <div className="alert alert-warning">
            Video chat is disabled in admin settings for this course.
          </div>
        ) : (
          <div className="ql-card" style={{ marginBottom: '1rem' }}>
            <div className="ql-card-content">
              <h3>Course Room</h3>
              <p>Participants connected: <strong>{participants.length}</strong></p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {!isInRoom ? (
                  <button className="btn btn-primary" onClick={() => void joinCourseChat()}>Join Room</button>
                ) : (
                  <button className="btn btn-default" onClick={() => void leaveCourseChat()}>Leave Room</button>
                )}
                {courseRoomUrl && (
                  <a className="btn btn-secondary" href={courseRoomUrl} target="_blank" rel="noreferrer">
                    Open Jitsi Room
                  </a>
                )}
                {isInstructor && (
                  <button className="btn btn-default" onClick={() => void toggleCourseChat(!config.courseVideoChatOptions)}>
                    {config.courseVideoChatOptions ? 'Disable Course Chat' : 'Enable Course Chat'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {config.groupCategories.length > 0 && (
          <div className="ql-card">
            <div className="ql-card-content">
              <h3>Group Rooms</h3>
              {config.groupCategories.map((category) => (
                <div key={category.categoryNumber} style={{ marginBottom: '0.75rem' }}>
                  <strong>{category.categoryName || `Category ${category.categoryNumber}`}</strong>
                  <div style={{ marginTop: '0.25rem' }}>
                    {(category.groups || []).map((group) => {
                      const groupRoom = `Ql_C_${course._id}_cat_${category.categoryNumber}_grp_${group.groupNumber}`
                      const groupUrl = config.domain ? `https://${config.domain}/${encodeURIComponent(groupRoom)}` : '#'
                      return (
                        <a
                          key={`${category.categoryNumber}-${group.groupNumber}`}
                          className="btn btn-default btn-sm"
                          href={groupUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ marginRight: '0.4rem', marginBottom: '0.4rem' }}
                        >
                          {group.groupName || `Group ${group.groupNumber}`}
                        </a>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

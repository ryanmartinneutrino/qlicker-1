import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Course as CourseType, GroupCategory } from '@qlicker/shared'
import { apiClient } from '../api/client'
import { useAuth } from '../hooks/useAuth'

interface UserSummary {
  _id?: string
  firstname: string
  lastname: string
}

interface ApiOptions {
  startAudioMuted?: boolean
  startVideoMuted?: boolean
  startTileView?: boolean
}

interface VideoChatConfig {
  enabled: boolean
  domain: string
  whiteboardDomain: string
  etherpadDomain: string
  courseVideoChatOptions: { urlId?: string; joined?: string[]; apiOptions?: ApiOptions } | null
  courseParticipants: UserSummary[]
  groupCategories: GroupCategory[]
  isInstructor: boolean
}

function buildCourseRoom(course: CourseType, urlId?: string): string {
  return `${course._id}Qlicker${urlId || 'room'}all`
}

function buildGroupRoom(course: CourseType, category: GroupCategory, groupName: string): string {
  return `Ql_C_${course._id}cat_${category.categoryName || `category_${category.categoryNumber}`}${category.catVideoChatOptions?.urlId || 'room'}grp_${groupName}`
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

  const clearCourseChat = async () => {
    if (!courseId) return
    await apiClient.post(`/courses/${courseId}/video-chat/clear`, {})
    await load()
  }

  const setCourseApiOption = async (key: keyof ApiOptions, value: boolean) => {
    if (!courseId || !config?.courseVideoChatOptions?.apiOptions) return
    const apiOptions = { ...config.courseVideoChatOptions.apiOptions, [key]: value }
    await apiClient.post(`/courses/${courseId}/video-chat/options`, { apiOptions })
    await load()
  }

  const toggleCategoryChat = async (categoryNumber: number, enabled: boolean) => {
    if (!courseId) return
    await apiClient.post(`/courses/${courseId}/video-chat/categories/${categoryNumber}/toggle`, { enabled })
    await load()
  }

  const setCategoryApiOption = async (
    categoryNumber: number,
    apiOptions: ApiOptions,
    key: keyof ApiOptions,
    value: boolean
  ) => {
    if (!courseId) return
    await apiClient.post(`/courses/${courseId}/video-chat/categories/${categoryNumber}/options`, {
      apiOptions: { ...apiOptions, [key]: value },
    })
    await load()
  }

  const clearCategoryRooms = async (categoryNumber: number) => {
    if (!courseId) return
    await apiClient.post(`/courses/${courseId}/video-chat/categories/${categoryNumber}/clear`, {})
    await load()
  }

  const openCourseWindow = () => {
    if (!courseId) return
    window.open(`/course/${courseId}/videochatwindow`, 'Qlicker Video Chat', 'height=768,width=1024')
  }

  const openGroupWindow = (categoryNumber: number, groupNumber: number) => {
    if (!courseId) return
    window.open(
      `/course/${courseId}/categoryvideochatwindow/${categoryNumber}/${groupNumber}`,
      'Qlicker Group Video Chat',
      'height=768,width=1024'
    )
  }

  if (loading) return <div className="page">Loading...</div>
  if (error) return <div className="page">Error: {error}</div>
  if (!course || !config) return <div className="page">Course not found</div>

  const roomName = buildCourseRoom(course, config.courseVideoChatOptions?.urlId)
  const courseRoomUrl = config.domain ? `https://${config.domain}/${encodeURIComponent(roomName)}` : ''
  const participants = config.courseVideoChatOptions?.joined || []
  const courseApi = config.courseVideoChatOptions?.apiOptions
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
          <>
            <div className="ql-card" style={{ marginBottom: '1rem' }}>
              <div className="ql-card-content">
                <h3>Course Room</h3>
                <p>Participants connected: <strong>{participants.length}</strong></p>
                {config.courseParticipants.length > 0 && (
                  <p style={{ marginTop: 0 }}>
                    {config.courseParticipants
                      .map((participant) => `${participant.lastname}, ${participant.firstname}`)
                      .join(' | ')}
                  </p>
                )}
                {isInstructor && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <button className="btn btn-default" onClick={() => void toggleCourseChat(!config.courseVideoChatOptions)}>
                      {config.courseVideoChatOptions ? 'Disable Course Chat' : 'Enable Course Chat'}
                    </button>
                    {' '}
                    <button className="btn btn-default" onClick={() => void clearCourseChat()}>
                      Clear participants
                    </button>
                    {config.courseVideoChatOptions && courseApi && (
                      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <label><input type="checkbox" checked={Boolean(courseApi.startVideoMuted)} onChange={(e) => void setCourseApiOption('startVideoMuted', e.target.checked)} /> Mute video</label>
                        <label><input type="checkbox" checked={Boolean(courseApi.startAudioMuted)} onChange={(e) => void setCourseApiOption('startAudioMuted', e.target.checked)} /> Mute audio</label>
                        <label><input type="checkbox" checked={Boolean(courseApi.startTileView)} onChange={(e) => void setCourseApiOption('startTileView', e.target.checked)} /> Tile view</label>
                      </div>
                    )}
                  </div>
                )}
                {config.courseVideoChatOptions ? (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {!isInRoom ? (
                      <button className="btn btn-primary" onClick={() => void joinCourseChat()}>Join Room</button>
                    ) : (
                      <button className="btn btn-default" onClick={() => void leaveCourseChat()}>Leave Room</button>
                    )}
                    <button className="btn btn-secondary" onClick={openCourseWindow}>Open Course Window</button>
                    {courseRoomUrl && (
                      <a className="btn btn-default" href={courseRoomUrl} target="_blank" rel="noreferrer">
                        Open Direct Jitsi Link
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="text-muted">Course video chat is currently disabled.</p>
                )}
              </div>
            </div>

            {config.groupCategories.length > 0 && (
              <div className="ql-card">
                <div className="ql-card-content">
                  <h3>Group Rooms</h3>
                  {config.groupCategories.map((category) => {
                    const categoryEnabled = Boolean(category.catVideoChatOptions)
                    const categoryApi = category.catVideoChatOptions?.apiOptions
                    return (
                      <div key={category.categoryNumber} style={{ marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '0.75rem' }}>
                        <strong>{category.categoryName || `Category ${category.categoryNumber}`}</strong>
                        {isInstructor && (
                          <div style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                            <button className="btn btn-default btn-sm" onClick={() => void toggleCategoryChat(Number(category.categoryNumber), !categoryEnabled)}>
                              {categoryEnabled ? 'Disable Category Chat' : 'Enable Category Chat'}
                            </button>
                            {' '}
                            <button className="btn btn-default btn-sm" onClick={() => void clearCategoryRooms(Number(category.categoryNumber))}>
                              Clear rooms
                            </button>
                            {categoryEnabled && categoryApi && (
                              <span style={{ marginLeft: '1rem' }}>
                                <label><input type="checkbox" checked={Boolean(categoryApi.startVideoMuted)} onChange={(e) => void setCategoryApiOption(Number(category.categoryNumber), categoryApi, 'startVideoMuted', e.target.checked)} /> Mute video</label>
                                {' '}
                                <label><input type="checkbox" checked={Boolean(categoryApi.startAudioMuted)} onChange={(e) => void setCategoryApiOption(Number(category.categoryNumber), categoryApi, 'startAudioMuted', e.target.checked)} /> Mute audio</label>
                                {' '}
                                <label><input type="checkbox" checked={Boolean(categoryApi.startTileView)} onChange={(e) => void setCategoryApiOption(Number(category.categoryNumber), categoryApi, 'startTileView', e.target.checked)} /> Tile view</label>
                              </span>
                            )}
                          </div>
                        )}
                        <div style={{ marginTop: '0.25rem' }}>
                          {(category.groups || []).map((group) => {
                            const groupName = group.groupName || `Group ${group.groupNumber}`
                            const groupRoom = buildGroupRoom(course, category, groupName)
                            const groupUrl = config.domain ? `https://${config.domain}/${encodeURIComponent(groupRoom)}` : '#'
                            return (
                              <div key={`${category.categoryNumber}-${group.groupNumber}`} style={{ marginBottom: '0.4rem' }}>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  disabled={!categoryEnabled}
                                  onClick={() => void openGroupWindow(Number(category.categoryNumber), Number(group.groupNumber))}
                                >
                                  Open {groupName}
                                </button>
                                {' '}
                                <a
                                  className="btn btn-default btn-sm"
                                  href={groupUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Direct Link
                                </a>
                                {' '}
                                <span className="text-muted">
                                  joined: {(group.joinedVideoChat || []).length}
                                  {group.helpVideoChat ? ' | calling instructor' : ''}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

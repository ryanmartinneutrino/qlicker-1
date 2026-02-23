import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import type { Course as CourseType, Session } from '@qlicker/shared'
import { apiClient } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { SessionListItem } from '../components/SessionListItem'
import { CreateSessionModal } from '../components/modals/CreateSessionModal'
import { useRealtimeCollection } from '../hooks/useRealtimeCollection'

export default function Course() {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [course, setCourse] = useState<CourseType | null>(null)
  const [courseLoading, setCourseLoading] = useState(true)
  const [courseError, setCourseError] = useState<string | null>(null)
  const [creatingSessionType, setCreatingSessionType] = useState<'interactive' | 'quiz' | null>(null)
  const {
    data: sessions,
    loading: sessionsLoading,
    error: sessionsError,
  } = useRealtimeCollection<Session>({
    fetchPath: `/sessions?courseId=${courseId}`,
    subscribeEvent: 'subscribe:sessions',
    subscribePayload: { courseId: courseId || '' },
    changeEvent: 'sessions:change',
    enabled: Boolean(courseId),
  })

  useEffect(() => {
    if (!courseId) return
    setCourseLoading(true)
    apiClient
      .get<CourseType>(`/courses/${courseId}`)
      .then((c) => setCourse(c))
      .catch((err) => setCourseError((err as Error).message))
      .finally(() => setCourseLoading(false))
  }, [courseId])

  const error = courseError || sessionsError
  if (courseLoading || sessionsLoading) return <div className="page">Loading...</div>
  if (error) return <div className="page">Error: {error}</div>
  if (!course) return <div className="page">Course not found</div>

  const isInstructor =
    user &&
    ((course.instructors && course.instructors.includes(user._id ?? '')) ||
      user.profile?.roles?.includes('admin'))

  const interactiveSessions = useMemo(() => sessions.filter((s) => !s.quiz), [sessions])
  const quizSessions = useMemo(() => sessions.filter((s) => s.quiz), [sessions])

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await apiClient.delete(`/sessions/${sessionId}`)
    } catch (err) {
      setCourseError((err as Error).message)
    }
  }

  const courseCode = `${course.deptCode} ${course.courseNumber}-${course.section}`.toUpperCase()

  return (
    <div className="page">
      <div className="ql-header-bar">
        <h1>{courseCode}: {course.name}</h1>
      </div>

      {isInstructor ? (
        <div className="container">
          <div className="row">
            <div className="col-md-4">
              <Link className="btn btn-secondary" to={`/course/${courseId}/questions`}>Question Library</Link>
              {' '}
              <Link className="btn btn-secondary" to={`/course/${courseId}/grades`}>Grades</Link>
              {' '}
              <Link className="btn btn-secondary" to={`/course/${courseId}/groups`}>Groups</Link>
              {' '}
              <Link className="btn btn-secondary" to={`/course/${courseId}/video`}>Video Chat</Link>
            </div>
          </div>

          <h2>Interactive Sessions</h2>
          <button className="btn btn-primary" onClick={() => setCreatingSessionType('interactive')}>Create Session</button>
          {interactiveSessions.map((s) => (
            <SessionListItem
              key={s._id}
              session={s}
              click={() => navigate(`/course/${courseId}/session/run/${s._id}`)}
              controls={[
                { label: 'Edit', click: () => navigate(`/course/${courseId}/session/edit/${s._id}`) },
                { label: 'Run', click: () => navigate(`/course/${courseId}/session/run/${s._id}`) },
                { label: 'Grade', click: () => navigate(`/course/${courseId}/session/${s._id}/grade`) },
                { label: 'Results', click: () => navigate(`/course/${courseId}/session/${s._id}/results`) },
                { label: 'Delete', click: () => handleDeleteSession(s._id!) },
              ]}
            />
          ))}

          <h2>Quizzes</h2>
          <button className="btn btn-primary" onClick={() => setCreatingSessionType('quiz')}>Create Quiz</button>
          {quizSessions.map((s) => (
            <SessionListItem
              key={s._id}
              session={s}
              click={() => navigate(`/course/${courseId}/session/run/${s._id}`)}
              controls={[
                { label: 'Edit', click: () => navigate(`/course/${courseId}/session/edit/${s._id}`) },
                { label: 'Run', click: () => navigate(`/course/${courseId}/session/run/${s._id}`) },
                { label: 'Grade', click: () => navigate(`/course/${courseId}/session/${s._id}/grade`) },
                { label: 'Results', click: () => navigate(`/course/${courseId}/session/${s._id}/results`) },
                { label: 'Delete', click: () => handleDeleteSession(s._id!) },
              ]}
            />
          ))}


          {creatingSessionType && (
            <CreateSessionModal
              courseId={courseId!}
              done={() => setCreatingSessionType(null)}
              onCreated={(created) => {
                navigate(`/course/${courseId}/session/edit/${created._id}`)
              }}
            />
          )}
        </div>
      ) : (
        <div className="container">
          <Link className="btn btn-secondary" to={`/course/${courseId}/video`} style={{ marginBottom: '1rem' }}>
            Video Chat
          </Link>
          <h2>Interactive Sessions</h2>
          {interactiveSessions.map((s) => (
            <SessionListItem
              key={s._id}
              session={s}
              click={() => navigate(`/course/${courseId}/session/present/${s._id}`)}
            />
          ))}

          <h2>Quizzes</h2>
          {quizSessions.map((s) => (
            <SessionListItem
              key={s._id}
              session={s}
              click={() => navigate(`/course/${courseId}/session/present/${s._id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

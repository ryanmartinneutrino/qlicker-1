import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import type { Course as CourseType, Session } from '@qlicker/shared'
import { apiClient } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { SessionListItem } from '../components/SessionListItem'

export default function Course() {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [course, setCourse] = useState<CourseType | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!courseId) return
    setLoading(true)
    Promise.all([
      apiClient.get<CourseType>(`/courses/${courseId}`),
      apiClient.get<Session[]>(`/sessions?courseId=${courseId}`),
    ])
      .then(([c, s]) => {
        setCourse(c)
        setSessions(s)
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [courseId])

  if (loading) return <div className="page">Loading...</div>
  if (error) return <div className="page">Error: {error}</div>
  if (!course) return <div className="page">Course not found</div>

  const isInstructor =
    user &&
    ((course.instructors && course.instructors.includes(user._id ?? '')) ||
      user.profile?.roles?.includes('admin'))

  const interactiveSessions = sessions.filter((s) => !s.quiz)
  const quizSessions = sessions.filter((s) => s.quiz)

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await apiClient.delete(`/sessions/${sessionId}`)
      setSessions((prev) => prev.filter((s) => s._id !== sessionId))
    } catch (err) {
      setError((err as Error).message)
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
            </div>
          </div>

          <h2>Interactive Sessions</h2>
          <button
            className="btn btn-primary"
            onClick={() => {
              apiClient
                .post<Session>('/sessions', { courseId, name: 'New Session', quiz: false })
                .then((s) => {
                  setSessions((prev) => [...prev, s])
                  navigate(`/course/${courseId}/session/edit/${s._id}`)
                })
                .catch((err) => setError((err as Error).message))
            }}
          >
            Create Session
          </button>
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
          <button
            className="btn btn-primary"
            onClick={() => {
              apiClient
                .post<Session>('/sessions', { courseId, name: 'New Quiz', quiz: true })
                .then((s) => {
                  setSessions((prev) => [...prev, s])
                  navigate(`/course/${courseId}/session/edit/${s._id}`)
                })
                .catch((err) => setError((err as Error).message))
            }}
          >
            Create Quiz
          </button>
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
        </div>
      ) : (
        <div className="container">
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

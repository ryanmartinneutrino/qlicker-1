import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Course, Session } from '@qlicker/shared'
import { useRealtimeCollection } from '../hooks/useRealtimeCollection'
import { apiClient } from '../api/client'
import { SessionListItem } from '../components/SessionListItem'

function toMillis(value: unknown): number {
  if (!value) return 0
  const date = value instanceof Date ? value : new Date(value as string)
  const millis = date.getTime()
  return Number.isFinite(millis) ? millis : 0
}

export default function CourseResults() {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()

  const [course, setCourse] = useState<Course | null>(null)
  const [courseLoading, setCourseLoading] = useState(true)
  const [courseError, setCourseError] = useState<string | null>(null)
  const {
    data: sessions,
    loading: sessionsLoading,
    error: sessionsError,
  } = useRealtimeCollection<Session>({
    fetchPath: `/sessions?courseId=${courseId || ''}`,
    subscribeEvent: 'subscribe:sessions',
    subscribePayload: { courseId: courseId || '' },
    changeEvent: 'sessions:change',
    enabled: Boolean(courseId),
    refetchOnChange: true,
  })

  useEffect(() => {
    if (!courseId) return
    setCourseLoading(true)
    setCourseError(null)
    apiClient
      .get<Course>(`/courses/${courseId}`)
      .then((row) => setCourse(row))
      .catch((err) => setCourseError((err as Error).message))
      .finally(() => setCourseLoading(false))
  }, [courseId])

  const orderedSessions = useMemo(() => {
    return [...sessions].sort((left, right) => {
      return toMillis(right.date || right.quizEnd || right.quizStart || right.createdAt) - toMillis(left.date || left.quizEnd || left.quizStart || left.createdAt)
    })
  }, [sessions])

  if (courseLoading || sessionsLoading) return <div className="page">Loading...</div>
  if (courseError || sessionsError) return <div className="page">Error: {courseError || sessionsError}</div>
  if (!course) return <div className="page">Course not found</div>

  const courseCode = `${course.deptCode} ${course.courseNumber}-${course.section}`.toUpperCase()

  return (
    <div className="page">
      <div className="ql-header-bar">
        <h1>Response Results: {courseCode}</h1>
      </div>
      <div className="container">
        <Link className="btn btn-secondary" to="/courses/results" style={{ marginBottom: '0.75rem', display: 'inline-block' }}>
          Back to Results Overview
        </Link>
        {orderedSessions.length < 1 ? (
          <p>No sessions available for this course.</p>
        ) : (
          <div className="ql-courselist">
            {orderedSessions.map((session) => (
              <SessionListItem
                key={session._id}
                session={session}
                click={() => navigate(`/course/${courseId}/session/${session._id}/results`)}
                controls={[
                  { label: 'Results', click: () => navigate(`/course/${courseId}/session/${session._id}/results`) },
                  { label: 'Replay', click: () => navigate(`/course/${courseId}/session/replay/${session._id}`) },
                  { label: 'Grade', click: () => navigate(`/course/${courseId}/session/${session._id}/grade`) },
                ]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

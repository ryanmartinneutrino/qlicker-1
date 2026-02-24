import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { CourseListItem } from '../components/CourseListItem'
import { SessionListItem } from '../components/SessionListItem'
import { CreateCourseModal } from '../components/CreateCourseModal'
import type { Course, Session } from '@qlicker/shared'

function toMillis(value: unknown): number {
  if (!value) return 0
  const date = value instanceof Date ? value : new Date(value as string)
  const millis = date.getTime()
  return Number.isFinite(millis) ? millis : 0
}

function sortSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((left, right) => {
    return toMillis(right.date || right.quizEnd || right.quizStart || right.createdAt) - toMillis(left.date || left.quizEnd || left.quizStart || left.createdAt)
  })
}

export default function Professor() {
  const navigate = useNavigate()
  const { data: courses, loading, execute: fetchCourses } = useApi<Course[]>('GET', '/courses')
  const { data: sessions, execute: fetchSessions } = useApi<Session[]>('GET', '/sessions')
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    fetchCourses()
    fetchSessions()
  }, [fetchCourses, fetchSessions])

  const activeCourses = (courses || []).filter((entry) => !entry.inactive)
  const sessionsByCourse = useMemo(() => {
    const map = new Map<string, Session[]>()
    ;(sessions || []).forEach((session) => {
      if (!session.courseId) return
      const list = map.get(session.courseId) || []
      list.push(session)
      map.set(session.courseId, list)
    })
    map.forEach((list, key) => {
      map.set(
        key,
        sortSessions(list).filter((session) => {
          if (session.quiz) return session.status !== 'hidden'
          return session.status === 'visible' || session.status === 'running'
        })
      )
    })
    return map
  }, [sessions])

  if (loading && !courses) return <div className="page">Loading...</div>

  return (
    <div className="ql-professor-page page">
      <h2>Active Courses</h2>
      <div className="btn-group">
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>Create Course</button>
        <button className="btn btn-default" onClick={() => navigate('/courses')}>Manage All Courses</button>
      </div>

      <div className="ql-courselist">
        {activeCourses.length === 0 && <p>No active courses.</p>}
        {activeCourses.map((course) => (
          <div key={course._id} className="ql-student-course-component">
            <CourseListItem
              course={course}
              click={() => navigate(`/course/${course._id}`)}
            />
            {(sessionsByCourse.get(course._id || '') || []).map((session) => (
              <SessionListItem
                key={session._id}
                session={session}
                click={() => navigate(`/course/${course._id}/session/edit/${session._id}`)}
              />
            ))}
          </div>
        ))}
      </div>

      {showModal && (
        <CreateCourseModal
          done={() => {
            setShowModal(false)
            fetchCourses()
          }}
        />
      )}
    </div>
  )
}

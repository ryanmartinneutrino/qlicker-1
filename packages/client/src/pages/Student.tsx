import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { CourseListItem } from '../components/CourseListItem'
import { SessionListItem } from '../components/SessionListItem'
import { EnrollCourseModal } from '../components/modals/EnrollCourseModal'
import type { Course, Session } from '@qlicker/shared'
import { apiClient } from '../api/client'
import { useAuth } from '../hooks/useAuth'

function toMillis(value: unknown): number | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value as string)
  const millis = date.getTime()
  return Number.isFinite(millis) ? millis : null
}

function hasActiveQuizExtension(session: Session, userId: string): boolean {
  if (!Array.isArray(session.quizExtensions)) return false
  const extension = session.quizExtensions.find((entry) => entry.userId === userId)
  if (!extension) return false
  const start = toMillis(extension.quizStart)
  const end = toMillis(extension.quizEnd)
  if (start === null || end === null) return false
  const now = Date.now()
  return now > start && now < end
}

function isQuizOpenForStudent(session: Session, userId: string): boolean {
  if (!session.quiz) return false
  if (session.status === 'running') return true
  if (session.status === 'hidden' || session.status === 'done') return false
  if (hasActiveQuizExtension(session, userId)) return true
  const start = toMillis(session.quizStart)
  const end = toMillis(session.quizEnd)
  if (start === null || end === null) return false
  const now = Date.now()
  return now > start && now < end
}

function sortSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((left, right) => {
    const leftTime = toMillis(left.date || left.quizEnd || left.quizStart || left.createdAt) || 0
    const rightTime = toMillis(right.date || right.quizEnd || right.quizStart || right.createdAt) || 0
    return rightTime - leftTime
  })
}

export default function Student() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: courses, loading, execute: fetchCourses } = useApi<Course[]>('GET', '/courses')
  const { data: sessions, execute: fetchSessions } = useApi<Session[]>('GET', '/sessions')
  const [showEnrollModal, setShowEnrollModal] = useState(false)
  const [sendingVerification, setSendingVerification] = useState(false)
  const [verificationInfo, setVerificationInfo] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [unenrollingCourseId, setUnenrollingCourseId] = useState<string | null>(null)

  useEffect(() => {
    fetchCourses()
    fetchSessions()
  }, [fetchCourses, fetchSessions])

  const userId = user?._id || ''
  const needsEmailVerification = Boolean(user?.emails?.[0] && !user.emails[0].verified)

  const sessionsByCourseId = useMemo(() => {
    const allSessions = sessions || []
    const map = new Map<string, Session[]>()
    allSessions.forEach((session) => {
      if (!session.courseId) return
      const list = map.get(session.courseId) || []
      list.push(session)
      map.set(session.courseId, list)
    })
    map.forEach((list, key) => {
      map.set(key, sortSessions(list))
    })
    return map
  }, [sessions])

  const activeCourses = (courses || []).filter((c) => !c.inactive)
  const inactiveCourses = (courses || []).filter((c) => c.inactive)

  const sendVerificationEmail = async () => {
    setSendingVerification(true)
    setActionError(null)
    setVerificationInfo(null)
    try {
      const result = await apiClient.post<{ delivered?: boolean; alreadyVerified?: boolean }>('/users/verify-email', {})
      if (result.alreadyVerified) {
        setVerificationInfo('Your email is already verified.')
      } else if (result.delivered) {
        setVerificationInfo('Verification email sent. Please check your inbox.')
      } else {
        setVerificationInfo('Verification token created. Email delivery is not configured in this environment.')
      }
    } catch (err) {
      setActionError((err as Error).message)
    } finally {
      setSendingVerification(false)
    }
  }

  const unEnroll = async (course: Course) => {
    if (!course._id) return
    if (!window.confirm(`Un-enroll from "${course.name}"?`)) return
    setUnenrollingCourseId(course._id)
    setActionError(null)
    try {
      await apiClient.post(`/courses/${course._id}/unenroll`, {})
      await fetchCourses()
      await fetchSessions()
    } catch (err) {
      setActionError((err as Error).message)
    } finally {
      setUnenrollingCourseId(null)
    }
  }

  const renderCourseSessions = (course: Course) => {
    const isInstructorForCourse = Boolean(
      userId && (course.owner === userId || (course.instructors || []).includes(userId))
    )
    const visibleSessions = (sessionsByCourseId.get(course._id || '') || []).filter((session) => {
      if (!session.quiz) return session.status === 'visible' || session.status === 'running'
      if (!userId) return false
      if ((session.submittedQuiz || []).includes(userId)) return false
      return isQuizOpenForStudent(session, userId)
    })

    return (
      <div className="ql-student-course-component" key={course._id}>
        <CourseListItem
          course={course}
          click={() => navigate(`/course/${course._id}`)}
          controls={
            isInstructorForCourse
              ? []
              : [
                  {
                    label: unenrollingCourseId === course._id ? 'Un-enrolling...' : 'Un-enroll',
                    click: () => void unEnroll(course),
                  },
                ]
          }
        />
        {visibleSessions.map((session) => (
          <SessionListItem
            key={session._id}
            session={session}
            click={() => navigate(`/course/${course._id}/session/present/${session._id}`)}
          />
        ))}
      </div>
    )
  }

  if (loading && !courses) return <div className="page">Loading...</div>

  return (
    <div className="ql-student-page page">
      {needsEmailVerification && (
        <div className="alert alert-warning" role="alert" style={{ marginBottom: '0.75rem' }}>
          To enroll in some courses, you may need to verify your email.
          {' '}
          <button className="btn btn-default btn-sm" onClick={() => void sendVerificationEmail()} disabled={sendingVerification}>
            {sendingVerification ? 'Sending...' : 'Resend verification email'}
          </button>
          {verificationInfo && <span style={{ marginLeft: '0.5rem' }}>{verificationInfo}</span>}
        </div>
      )}

      <button type="button" className="btn btn-primary" onClick={() => setShowEnrollModal(true)}>
        Enroll in Course
      </button>

      {actionError && <div className="ql-error" style={{ marginTop: '0.6rem' }}>{actionError}</div>}

      <h2>Active Courses</h2>
      <div className="ql-courselist">
        {activeCourses.length === 0 && <p>No active courses. Use an enrollment code to join a course.</p>}
        {activeCourses.map((course) => renderCourseSessions(course))}
      </div>

      {inactiveCourses.length > 0 && (
        <>
          <h2>Inactive Courses</h2>
          <div className="ql-courselist">
            {inactiveCourses.map((course) => (
              <CourseListItem
                key={course._id}
                course={course}
                click={() => navigate(`/course/${course._id}`)}
                inactive
              />
            ))}
          </div>
        </>
      )}

      {showEnrollModal && (
        <EnrollCourseModal
          onEnrolled={() => {
            fetchCourses()
            fetchSessions()
          }}
          done={() => setShowEnrollModal(false)}
        />
      )}
    </div>
  )
}

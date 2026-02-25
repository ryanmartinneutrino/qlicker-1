import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import type { Course as CourseType, Session } from '@qlicker/shared'
import { apiClient } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { SessionListItem } from '../components/SessionListItem'
import { CreateSessionModal } from '../components/modals/CreateSessionModal'
import { useRealtimeCollection } from '../hooks/useRealtimeCollection'

interface RosterUser {
  _id: string
  firstname: string
  lastname: string
  email: string
}

interface CourseRoster {
  courseId: string
  owner: string
  instructors: RosterUser[]
  students: RosterUser[]
}

function toMillis(value: unknown): number {
  if (!value) return 0
  const date = value instanceof Date ? value : new Date(value as string)
  const millis = date.getTime()
  return Number.isFinite(millis) ? millis : 0
}

function sessionSortValue(session: Session): number {
  if (session.quiz) {
    return toMillis(session.quizEnd || session.quizStart || session.date || session.createdAt)
  }
  return toMillis(session.date || session.createdAt)
}

export default function Course() {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [course, setCourse] = useState<CourseType | null>(null)
  const [courseLoading, setCourseLoading] = useState(true)
  const [courseError, setCourseError] = useState<string | null>(null)
  const [creatingSessionType, setCreatingSessionType] = useState<'interactive' | 'quiz' | null>(null)
  const [busySessionId, setBusySessionId] = useState<string | null>(null)
  const [copyTargetCourseId, setCopyTargetCourseId] = useState('')
  const [copyingAllSessions, setCopyingAllSessions] = useState(false)
  const [showAllInteractive, setShowAllInteractive] = useState(false)
  const [showAllQuizzes, setShowAllQuizzes] = useState(false)
  const [roster, setRoster] = useState<CourseRoster | null>(null)
  const [rosterSearch, setRosterSearch] = useState('')
  const [optionsSaving, setOptionsSaving] = useState(false)
  const [manageableCourses, setManageableCourses] = useState<CourseType[]>([])
  const [unenrolling, setUnenrolling] = useState(false)
  const {
    data: sessions,
    loading: sessionsLoading,
    error: sessionsError,
    refetch: refetchSessions,
  } = useRealtimeCollection<Session>({
    fetchPath: `/sessions?courseId=${courseId}`,
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
      .get<CourseType>(`/courses/${courseId}`)
      .then((doc) => setCourse(doc))
      .catch((err) => setCourseError((err as Error).message))
      .finally(() => setCourseLoading(false))
  }, [courseId])

  const isInstructor = Boolean(
    user &&
      course &&
      (((course.instructors || []).includes(user._id || '') || course.owner === user._id) ||
        user.profile?.roles?.includes('admin'))
  )

  useEffect(() => {
    if (!courseId || !isInstructor) {
      setRoster(null)
      return
    }
    apiClient
      .get<CourseRoster>(`/courses/${courseId}/roster`)
      .then((doc) => setRoster(doc))
      .catch((err) => setCourseError((err as Error).message))
  }, [courseId, isInstructor])

  useEffect(() => {
    if (!isInstructor) {
      setManageableCourses([])
      return
    }
    apiClient
      .get<CourseType[]>('/courses')
      .then((rows) => {
        const managed = rows.filter((entry) => {
          if (!user?._id) return false
          const admin = user.profile.roles.includes('admin')
          if (admin) return true
          return entry.owner === user._id || (entry.instructors || []).includes(user._id)
        })
        setManageableCourses(managed)
      })
      .catch(() => {
        setManageableCourses([])
      })
  }, [isInstructor, user?._id, user?.profile.roles])

  const interactiveSessions = useMemo(
    () => [...sessions].filter((entry) => !entry.quiz).sort((left, right) => sessionSortValue(right) - sessionSortValue(left)),
    [sessions]
  )
  const quizSessions = useMemo(
    () => [...sessions].filter((entry) => entry.quiz).sort((left, right) => sessionSortValue(right) - sessionSortValue(left)),
    [sessions]
  )

  const visibleInteractive = showAllInteractive ? interactiveSessions : interactiveSessions.slice(0, 6)
  const visibleQuizzes = showAllQuizzes ? quizSessions : quizSessions.slice(0, 6)

  const rosterStudents = useMemo(() => {
    if (!roster) return [] as RosterUser[]
    const query = rosterSearch.trim().toLowerCase()
    if (!query) return roster.students
    return roster.students.filter((student) => {
      const fullName = `${student.firstname} ${student.lastname}`.toLowerCase()
      return fullName.includes(query) || student.email.toLowerCase().includes(query)
    })
  }, [roster, rosterSearch])

  const error = courseError || sessionsError
  if (courseLoading || sessionsLoading) return <div className="page">Loading...</div>
  if (error) return <div className="page">Error: {error}</div>
  if (!course) return <div className="page">Course not found</div>

  const courseCode = `${course.deptCode} ${course.courseNumber}-${course.section}`.toUpperCase()
  const copyTargets = manageableCourses.filter((entry) => entry._id && entry._id !== courseId)

  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm('Delete this session and all attached questions/responses/grades?')) return
    setBusySessionId(sessionId)
    try {
      await apiClient.delete(`/sessions/${sessionId}`)
      await refetchSessions()
    } catch (err) {
      setCourseError((err as Error).message)
    } finally {
      setBusySessionId(null)
    }
  }

  const duplicateSession = async (sessionId: string, targetCourseId?: string) => {
    setBusySessionId(sessionId)
    try {
      await apiClient.post(`/sessions/${sessionId}/copy`, targetCourseId ? { courseId: targetCourseId } : {})
      await refetchSessions()
    } catch (err) {
      setCourseError((err as Error).message)
    } finally {
      setBusySessionId(null)
    }
  }

  const copyAllSessions = async () => {
    if (!copyTargetCourseId) return
    if (!window.confirm('Copy all sessions in this course to the selected target course?')) return
    setCopyingAllSessions(true)
    setCourseError(null)
    try {
      for (const session of [...interactiveSessions, ...quizSessions]) {
        if (!session._id) continue
        // Keep calls sequential so any server-side ordering and error handling remain deterministic.
        // eslint-disable-next-line no-await-in-loop
        await apiClient.post(`/sessions/${session._id}/copy`, { courseId: copyTargetCourseId })
      }
    } catch (err) {
      setCourseError((err as Error).message)
    } finally {
      setCopyingAllSessions(false)
    }
  }

  const toggleCourseOption = async (key: 'requireVerified' | 'allowStudentQuestions', value: boolean) => {
    if (!courseId) return
    setOptionsSaving(true)
    setCourseError(null)
    try {
      const updated = await apiClient.put<CourseType>(`/courses/${courseId}`, {
        [key]: value,
      })
      setCourse(updated)
    } catch (err) {
      setCourseError((err as Error).message)
    } finally {
      setOptionsSaving(false)
    }
  }

  const regenerateEnrollmentCode = async () => {
    if (!courseId) return
    if (!window.confirm('Generate a new enrollment code for this course?')) return
    setOptionsSaving(true)
    setCourseError(null)
    try {
      const updated = await apiClient.post<CourseType>(`/courses/${courseId}/enrollment-code/regenerate`, {})
      setCourse(updated)
    } catch (err) {
      setCourseError((err as Error).message)
    } finally {
      setOptionsSaving(false)
    }
  }

  const removeStudent = async (studentId: string) => {
    if (!courseId) return
    if (!window.confirm('Remove this student from the course?')) return
    setOptionsSaving(true)
    setCourseError(null)
    try {
      await apiClient.delete(`/courses/${courseId}/students/${studentId}`)
      const [updatedCourse, updatedRoster] = await Promise.all([
        apiClient.get<CourseType>(`/courses/${courseId}`),
        apiClient.get<CourseRoster>(`/courses/${courseId}/roster`),
      ])
      setCourse(updatedCourse)
      setRoster(updatedRoster)
    } catch (err) {
      setCourseError((err as Error).message)
    } finally {
      setOptionsSaving(false)
    }
  }

  const unenroll = async () => {
    if (!courseId) return
    if (!window.confirm('Are you sure you want to un-enroll from this course?')) return
    setUnenrolling(true)
    setCourseError(null)
    try {
      await apiClient.post(`/courses/${courseId}/unenroll`, {})
      navigate('/student')
    } catch (err) {
      setCourseError((err as Error).message)
    } finally {
      setUnenrolling(false)
    }
  }

  const renderSessionBlock = (session: Session) => {
    const sessionId = session._id || ''
    if (!sessionId) return null

    const controls = [
      { label: 'Edit', click: () => navigate(`/course/${courseId}/session/edit/${sessionId}`) },
      { label: 'Run', click: () => navigate(`/course/${courseId}/session/run/${sessionId}`) },
      { label: 'Grade', click: () => navigate(`/course/${courseId}/session/${sessionId}/grade`) },
      { label: 'Results', click: () => navigate(`/course/${courseId}/session/${sessionId}/results`) },
      { label: 'Replay', click: () => navigate(`/course/${courseId}/session/replay/${sessionId}`) },
      { label: busySessionId === sessionId ? 'Duplicating...' : 'Duplicate', click: () => void duplicateSession(sessionId) },
      ...(copyTargetCourseId
        ? [
            {
              label: busySessionId === sessionId ? 'Copying...' : 'Copy to Selected Course',
              click: () => void duplicateSession(sessionId, copyTargetCourseId),
            },
          ]
        : []),
      { label: busySessionId === sessionId ? 'Deleting...' : 'Delete', click: () => void handleDeleteSession(sessionId) },
    ]

    return (
      <SessionListItem
        key={sessionId}
        session={session}
        click={() => navigate(`/course/${courseId}/session/edit/${sessionId}`)}
        controls={controls}
      />
    )
  }

  if (isInstructor) {
    return (
      <div className="page">
        <div className="ql-header-bar">
          <h1>{courseCode}: {course.name}</h1>
        </div>

        <div className="container">
          <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link className="btn btn-secondary" to={`/course/${courseId}/questions`}>Question Library</Link>
            <Link className="btn btn-secondary" to={`/course/${courseId}/results`}>Response Results</Link>
            <Link className="btn btn-secondary" to={`/course/${courseId}/grades`}>Grades</Link>
            <Link className="btn btn-secondary" to={`/course/${courseId}/groups`}>Groups</Link>
            <Link className="btn btn-secondary" to={`/course/${courseId}/video`}>Video Chat</Link>
          </div>

          <div className="ql-card" style={{ marginBottom: '0.75rem' }}>
            <div className="ql-card-content">
              <h3>Course Options</h3>
              <p>
                Enrollment Code: <strong className="uppercase">{course.enrollmentCode}</strong>
                {' '}
                <button className="btn btn-default btn-sm" onClick={() => void regenerateEnrollmentCode()} disabled={optionsSaving}>
                  Regenerate
                </button>
              </p>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(course.requireVerified)}
                    onChange={(e) => void toggleCourseOption('requireVerified', e.target.checked)}
                    disabled={optionsSaving}
                  />
                  {' '}
                  Require verified email for enrollment
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(course.allowStudentQuestions)}
                    onChange={(e) => void toggleCourseOption('allowStudentQuestions', e.target.checked)}
                    disabled={optionsSaving}
                  />
                  {' '}
                  Allow students to submit questions
                </label>
              </div>
            </div>
          </div>

          {copyTargets.length > 0 && (
            <div className="ql-card" style={{ marginBottom: '0.75rem' }}>
              <div className="ql-card-content">
                <h3>Copy Sessions</h3>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    className="form-control"
                    style={{ maxWidth: 360 }}
                    value={copyTargetCourseId}
                    onChange={(e) => setCopyTargetCourseId(e.target.value)}
                  >
                    <option value="">Select target course…</option>
                    {copyTargets.map((target) => (
                      <option key={target._id} value={target._id}>
                        {`${target.deptCode} ${target.courseNumber}-${target.section}`.toUpperCase()} - {target.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-secondary"
                    onClick={() => void copyAllSessions()}
                    disabled={!copyTargetCourseId || copyingAllSessions}
                  >
                    {copyingAllSessions ? 'Copying...' : 'Copy All Sessions'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <h2>Interactive Sessions</h2>
          <button className="btn btn-primary" onClick={() => setCreatingSessionType('interactive')}>Create Session</button>
          {visibleInteractive.map((entry) => renderSessionBlock(entry))}
          {interactiveSessions.length > 6 && (
            <button className="btn btn-default" onClick={() => setShowAllInteractive((value) => !value)}>
              {showAllInteractive ? 'Show Less' : `Show All (${interactiveSessions.length})`}
            </button>
          )}

          <h2 style={{ marginTop: '1rem' }}>Quizzes</h2>
          <button className="btn btn-primary" onClick={() => setCreatingSessionType('quiz')}>Create Quiz</button>
          {visibleQuizzes.map((entry) => renderSessionBlock(entry))}
          {quizSessions.length > 6 && (
            <button className="btn btn-default" onClick={() => setShowAllQuizzes((value) => !value)}>
              {showAllQuizzes ? 'Show Less' : `Show All (${quizSessions.length})`}
            </button>
          )}

          <div className="ql-card" style={{ marginTop: '1rem' }}>
            <div className="ql-card-content">
              <h3>Class Roster</h3>
              <input
                type="text"
                className="form-control"
                placeholder="Search students by name or email"
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                style={{ marginBottom: '0.6rem' }}
              />
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>Instructors ({roster?.instructors.length || 0})</strong>
                <div>
                  {(roster?.instructors || []).map((instructor) => (
                    <div key={instructor._id}>
                      {`${instructor.lastname}, ${instructor.firstname}`.replace(/^,\s*/, '')} ({instructor.email})
                      {roster?.owner === instructor._id ? ' [Owner]' : ''}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <strong>Students ({rosterStudents.length})</strong>
                <div>
                  {rosterStudents.map((student) => (
                    <div key={student._id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span>{`${student.lastname}, ${student.firstname}`.replace(/^,\s*/, '')} ({student.email})</span>
                      <button
                        className="btn btn-default btn-sm"
                        onClick={() => void removeStudent(student._id)}
                        disabled={optionsSaving}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {courseError && <div className="ql-error" style={{ marginTop: '0.75rem' }}>{courseError}</div>}

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
      </div>
    )
  }

  return (
    <div className="page">
      <div className="ql-header-bar">
        <h1>{courseCode}: {course.name}</h1>
      </div>
      <div className="container">
        <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link className="btn btn-secondary" to={`/course/${courseId}/video`}>Video Chat</Link>
          <button className="btn btn-default" onClick={() => void unenroll()} disabled={unenrolling}>
            {unenrolling ? 'Un-enrolling...' : 'Un-enroll'}
          </button>
        </div>
        <h2>Interactive Sessions</h2>
        {interactiveSessions.map((session) => (
          <SessionListItem
            key={session._id}
            session={session}
            click={() => navigate(`/course/${courseId}/session/present/${session._id}`)}
          />
        ))}

        <h2>Quizzes</h2>
        {quizSessions.map((session) => (
          <SessionListItem
            key={session._id}
            session={session}
            click={() => navigate(`/course/${courseId}/session/present/${session._id}`)}
          />
        ))}
      </div>
    </div>
  )
}

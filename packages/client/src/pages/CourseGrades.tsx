import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { Course, Grade, Session } from '@qlicker/shared'
import { apiClient } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { downloadCsvFile } from '../utils/csv'

interface ManagedStudent {
  _id: string
  firstname: string
  lastname: string
  email: string
}

interface GroupManagementPayload {
  students: ManagedStudent[]
}

interface StudentGradeRow {
  userId: string
  firstname: string
  lastname: string
  email: string
  totalPoints: number
  totalOutOf: number
  totalAnswered: number
  totalQuestions: number
  bySessionId: Record<string, Grade>
}

function toMillis(value: unknown): number {
  if (!value) return 0
  const date = value instanceof Date ? value : new Date(value as string)
  const time = date.getTime()
  return Number.isFinite(time) ? time : 0
}

function sessionLabel(session: Session): string {
  const name = (session.name || 'Untitled Session').toUpperCase()
  const stamp = session.date || session.quizEnd || session.quizStart || session.createdAt
  if (!stamp) return name
  const parsed = new Date(stamp)
  if (Number.isNaN(parsed.getTime())) return name
  return `${name} (${parsed.toLocaleDateString()})`
}

export default function CourseGrades() {
  const { courseId } = useParams<{ courseId: string }>()
  const { user } = useAuth()

  const [course, setCourse] = useState<Course | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [studentsById, setStudentsById] = useState<Record<string, ManagedStudent>>({})
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([])
  const [allSelected, setAllSelected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isInstructor = Boolean(
    user?.profile.roles.includes('professor') || user?.profile.roles.includes('admin')
  )

  useEffect(() => {
    if (!courseId) return
    setLoading(true)
    setError(null)
    Promise.all([
      apiClient.get<Course>(`/courses/${courseId}`),
      apiClient.get<Session[]>(`/sessions?courseId=${courseId}`),
      apiClient.get<Grade[]>(`/grades?courseId=${courseId}`),
    ])
      .then(async ([courseDoc, sessionDocs, gradeDocs]) => {
        const orderedSessions = [...sessionDocs].sort(
          (left, right) => toMillis(right.date || right.createdAt) - toMillis(left.date || left.createdAt)
        )
        setCourse(courseDoc)
        setSessions(orderedSessions)
        setGrades(gradeDocs)

        if (isInstructor) {
          try {
            const manage = await apiClient.get<GroupManagementPayload>(`/courses/${courseId}/groups/manage`)
            const byId = (manage.students || []).reduce<Record<string, ManagedStudent>>((acc, student) => {
              acc[student._id] = student
              return acc
            }, {})
            setStudentsById(byId)
          } catch {
            setStudentsById({})
          }
          setAllSelected(false)
          setSelectedSessionIds([])
        } else {
          const selfId = user?._id || ''
          if (selfId) {
            setStudentsById({
              [selfId]: {
                _id: selfId,
                firstname: user?.profile.firstname || '',
                lastname: user?.profile.lastname || '',
                email: user?.emails?.[0]?.address || '',
              },
            })
          } else {
            setStudentsById({})
          }
          setAllSelected(true)
          setSelectedSessionIds(
            orderedSessions
              .map((session) => session._id)
              .filter((id): id is string => typeof id === 'string' && id.length > 0)
          )
        }
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [courseId, isInstructor, user?._id, user?.emails, user?.profile.firstname, user?.profile.lastname])

  useEffect(() => {
    if (allSelected) return
    if (sessions.length < 1) return
    const valid = new Set(
      sessions
        .map((session) => session._id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
    setSelectedSessionIds((prev) => prev.filter((id) => valid.has(id)))
  }, [allSelected, sessions])

  const selectedSessions = useMemo(() => {
    if (allSelected) return sessions
    const selected = new Set(selectedSessionIds)
    return sessions.filter((session) => session._id && selected.has(session._id))
  }, [allSelected, selectedSessionIds, sessions])

  const selectedSessionIdSet = useMemo(() => {
    return new Set(
      selectedSessions
        .map((session) => session._id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  }, [selectedSessions])

  const gradeRows = useMemo(() => {
    if (selectedSessionIdSet.size < 1) return [] as StudentGradeRow[]

    const rowsByUserId = new Map<string, StudentGradeRow>()
    grades.forEach((grade) => {
      if (!grade.userId || !grade.sessionId || !selectedSessionIdSet.has(grade.sessionId)) return
      const known = studentsById[grade.userId]
      const current = rowsByUserId.get(grade.userId) || {
        userId: grade.userId,
        firstname: known?.firstname || '',
        lastname: known?.lastname || '',
        email: known?.email || '',
        totalPoints: 0,
        totalOutOf: 0,
        totalAnswered: 0,
        totalQuestions: 0,
        bySessionId: {},
      }

      current.bySessionId[grade.sessionId] = grade
      current.totalPoints += Number(grade.points ?? 0)
      current.totalOutOf += Number(grade.outOf ?? 0)
      current.totalAnswered += Number(grade.numAnswered ?? 0)
      current.totalQuestions += Number(grade.numQuestions ?? 0)
      rowsByUserId.set(grade.userId, current)
    })

    return [...rowsByUserId.values()].sort((left, right) => {
      const byLast = left.lastname.localeCompare(right.lastname)
      if (byLast !== 0) return byLast
      const byFirst = left.firstname.localeCompare(right.firstname)
      if (byFirst !== 0) return byFirst
      return left.userId.localeCompare(right.userId)
    })
  }, [grades, selectedSessionIdSet, studentsById])

  const totalSelectedSessions = selectedSessions.length
  const csvRows = useMemo(() => {
    const header: Array<unknown> = ['LastName', 'FirstName', 'Email', 'UserId']
    selectedSessions.forEach((session) => {
      const label = sessionLabel(session)
      header.push(`${label} (%)`)
      header.push(`${label} (Points)`)
      header.push(`${label} (OutOf)`)
    })
    header.push('Total (%)')
    header.push('TotalPoints')
    header.push('TotalOutOf')
    header.push('Answered')
    header.push('Questions')

    const rows: Array<Array<unknown>> = [header]
    gradeRows.forEach((row) => {
      const totalPercent = row.totalOutOf > 0 ? Math.round((1000 * row.totalPoints) / row.totalOutOf) / 10 : 0
      const values: Array<unknown> = [row.lastname, row.firstname, row.email, row.userId]
      selectedSessions.forEach((session, index) => {
        const sessionId = session._id || `session-${index}`
        const grade = row.bySessionId[sessionId]
        if (!grade) {
          values.push('', '', '')
          return
        }
        const points = Number(grade.points ?? 0)
        const outOf = Number(grade.outOf ?? 0)
        const pct = outOf > 0 ? Math.round((1000 * points) / outOf) / 10 : 0
        values.push(pct, points.toFixed(1), outOf.toFixed(1))
      })
      values.push(totalPercent, row.totalPoints.toFixed(1), row.totalOutOf.toFixed(1), row.totalAnswered, row.totalQuestions)
      rows.push(values)
    })
    return rows
  }, [gradeRows, selectedSessions])

  if (loading) return <div className="page">Loading...</div>
  if (error) return <div className="page">Error: {error}</div>

  const isStudentOnly = Boolean(user && !isInstructor)
  const title = course ? `${course.deptCode} ${course.courseNumber}-${course.section}`.toUpperCase() : 'Course Grades'

  return (
    <div className="page">
      <div className="ql-header-bar">
        <h1>{title}: Grades</h1>
      </div>

      <div className="container">
        <Link className="btn btn-secondary" to={`/course/${courseId}`} style={{ marginBottom: '1rem', display: 'inline-block' }}>
          Back to Course
        </Link>

        <div className="ql-card" style={{ marginBottom: '0.75rem' }}>
          <div className="ql-card-content">
            <div style={{ marginBottom: '0.5rem', fontWeight: 600 }}>
              {isStudentOnly ? 'Displayed sessions' : 'Session(s) to display'}
            </div>
            {sessions.length < 1 ? (
              <p>No sessions found for this course.</p>
            ) : (
              <>
                <select
                  className="form-control"
                  multiple
                  size={Math.min(10, Math.max(4, sessions.length))}
                  value={allSelected ? [] : selectedSessionIds}
                  onChange={(event) => {
                    const selected = Array.from(event.target.selectedOptions).map((option) => option.value)
                    setSelectedSessionIds(selected)
                    if (selected.length > 0) setAllSelected(false)
                  }}
                >
                  {sessions.map((session, index) => {
                    const sessionId = session._id || `session-${index}`
                    return (
                      <option key={sessionId} value={sessionId}>
                        {sessionLabel(session)}
                      </option>
                    )
                  })}
                </select>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setAllSelected(true)
                      setSelectedSessionIds([])
                    }}
                  >
                    Show all sessions
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setAllSelected(false)
                      setSelectedSessionIds([])
                    }}
                  >
                    Clear selection
                  </button>
                  <span style={{ alignSelf: 'center' }}>
                    Displaying <strong>{totalSelectedSessions}</strong> session{totalSelectedSessions === 1 ? '' : 's'}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {totalSelectedSessions < 1 ? (
          <p>Select session(s) to display.</p>
        ) : gradeRows.length < 1 ? (
          <p>No grades found for the selected sessions.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ marginBottom: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-default"
                onClick={() => downloadCsvFile(`course-grades-${courseId || 'course'}.csv`, csvRows)}
              >
                Download Grades CSV
              </button>
            </div>
            <table className="ql-grade-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '2px solid #ddd', minWidth: 220 }}>
                    Student
                  </th>
                  {selectedSessions.map((session, index) => {
                    const sessionId = session._id || `session-${index}`
                    return (
                    <th
                      key={sessionId}
                      style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '2px solid #ddd', minWidth: 160 }}
                    >
                      {session.name}
                    </th>
                    )
                  })}
                  <th style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '2px solid #ddd' }}>
                    Total
                  </th>
                  <th style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '2px solid #ddd' }}>
                    Answered
                  </th>
                </tr>
              </thead>
              <tbody>
                {gradeRows.map((row) => {
                  const totalPercent =
                    row.totalOutOf > 0 ? Math.round((1000 * row.totalPoints) / row.totalOutOf) / 10 : 0
                  return (
                    <tr key={row.userId}>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #eee', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 600 }}>
                          {row.lastname || row.firstname
                            ? `${row.lastname}, ${row.firstname}`.replace(/^,\s*/, '')
                            : row.userId}
                        </div>
                        <div style={{ fontSize: '0.85em', opacity: 0.85 }}>{row.email || row.userId}</div>
                      </td>

                      {selectedSessions.map((session, index) => {
                        const sessionId = session._id || `session-${index}`
                        const grade = row.bySessionId[sessionId]
                        if (!grade) {
                          return (
                            <td key={sessionId} style={{ padding: '0.75rem', borderBottom: '1px solid #eee' }}>
                              -
                            </td>
                          )
                        }
                        const points = Number(grade.points ?? 0)
                        const outOf = Number(grade.outOf ?? 0)
                        const pct = outOf > 0 ? Math.round((1000 * points) / outOf) / 10 : 0
                        return (
                          <td key={sessionId} style={{ padding: '0.75rem', borderBottom: '1px solid #eee' }}>
                            <div>{pct}%</div>
                            <div style={{ fontSize: '0.85em', opacity: 0.85 }}>
                              {points.toFixed(1)}/{outOf.toFixed(1)}
                            </div>
                            {grade.needsGrading && (
                              <div style={{ fontSize: '0.8em', color: '#b34700' }}>Needs grading</div>
                            )}
                          </td>
                        )
                      })}

                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #eee' }}>
                        <div>{totalPercent}%</div>
                        <div style={{ fontSize: '0.85em', opacity: 0.85 }}>
                          {row.totalPoints.toFixed(1)}/{row.totalOutOf.toFixed(1)}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #eee' }}>
                        {row.totalAnswered}/{row.totalQuestions}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

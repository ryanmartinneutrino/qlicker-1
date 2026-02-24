import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { Course, Grade, Mark, Question, Response, Session } from '@qlicker/shared'
import { apiClient } from '../api/client'
import { QuestionDisplay } from '../components/QuestionDisplay'
import { ResponseList, type ResponseListStudent } from '../components/ResponseList'

interface ExtensionCandidate {
  userId: string
  name: string
  email: string
}

interface DraftMark {
  points?: number
  feedback?: string
}

function parseCandidateName(name: string): { firstname: string; lastname: string } {
  const trimmed = name.trim()
  if (!trimmed) return { firstname: '', lastname: '' }
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return { firstname: parts[0], lastname: '' }
  const lastname = parts.pop() || ''
  return { firstname: parts.join(' '), lastname }
}

function optionValue(option: { answer?: string; plainText?: string; content?: string }, index: number): string {
  return option.answer || option.plainText || option.content || String.fromCharCode(65 + index)
}

function markKey(questionId: string): string {
  return questionId
}

export default function GradeSession() {
  const { courseId, sessionId } = useParams<{ courseId: string; sessionId: string }>()

  const [course, setCourse] = useState<Course | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [students, setStudents] = useState<ResponseListStudent[]>([])
  const [responses, setResponses] = useState<Response[]>([])
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0)
  const [questionPoints, setQuestionPoints] = useState(0)
  const [studentSearch, setStudentSearch] = useState('')
  const [answerSearch, setAnswerSearch] = useState('')
  const [groupCategoryNumber, setGroupCategoryNumber] = useState('')
  const [groupNumber, setGroupNumber] = useState('')
  const [drafts, setDrafts] = useState<Record<string, DraftMark>>({})
  const [visibleToStudents, setVisibleToStudents] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [savingStudentId, setSavingStudentId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)
    Promise.all([
      apiClient.get<Session>(`/sessions/${sessionId}`),
      apiClient.get<Question[]>(`/questions?sessionId=${sessionId}`),
      apiClient.get<Grade[]>(`/grades?sessionId=${sessionId}`),
      apiClient.get<ExtensionCandidate[]>(`/sessions/${sessionId}/extension-candidates`),
      courseId ? apiClient.get<Course>(`/courses/${courseId}`) : Promise.resolve(null),
    ])
      .then(([loadedSession, loadedQuestions, loadedGrades, roster, loadedCourse]) => {
        setCourse(loadedCourse)
        setSession(loadedSession)
        const orderedQuestions = loadedSession.questions?.length
          ? [...loadedQuestions].sort(
              (a, b) =>
                (loadedSession.questions?.indexOf(a._id || '') ?? Number.MAX_SAFE_INTEGER) -
                (loadedSession.questions?.indexOf(b._id || '') ?? Number.MAX_SAFE_INTEGER)
            )
          : loadedQuestions
        setQuestions(orderedQuestions)
        setQuestionPoints(Number(orderedQuestions[0]?.sessionOptions?.points ?? 1))
        setGrades(loadedGrades)
        setVisibleToStudents(loadedGrades.some((entry) => entry.visibleToStudents))
        const studentRows: ResponseListStudent[] = roster.map((candidate) => {
          const parsed = parseCandidateName(candidate.name)
          return {
            userId: candidate.userId,
            firstname: parsed.firstname,
            lastname: parsed.lastname,
            email: candidate.email,
          }
        })
        setStudents(studentRows)
        setSelectedQuestionIndex(0)
        setGroupCategoryNumber('')
        setGroupNumber('')
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [courseId, sessionId])

  const selectedQuestion = questions[selectedQuestionIndex] || null

  useEffect(() => {
    setQuestionPoints(Number(selectedQuestion?.sessionOptions?.points ?? 1))
  }, [selectedQuestion?._id])

  useEffect(() => {
    if (!selectedQuestion?._id) {
      setResponses([])
      return
    }
    apiClient
      .get<Response[]>(`/responses?questionId=${selectedQuestion._id}`)
      .then((rows) => {
        setResponses(rows)
        setDrafts({})
      })
      .catch(() => {
        setResponses([])
      })
  }, [selectedQuestion?._id])

  const reloadGrades = async () => {
    if (!sessionId) return
    const rows = await apiClient.get<Grade[]>(`/grades?sessionId=${sessionId}`)
    setGrades(rows)
    setVisibleToStudents(rows.some((entry) => entry.visibleToStudents))
  }

  const calculateGrades = async () => {
    if (!sessionId) return
    setBusy(true)
    setError(null)
    try {
      await apiClient.post<{ success: boolean }>(`/grades/calc-session/${sessionId}`, {})
      await reloadGrades()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const toggleVisibility = async () => {
    if (!sessionId) return
    const nextVisible = !visibleToStudents
    setBusy(true)
    setError(null)
    try {
      await apiClient.put<{ success: boolean }>(`/grades/session/${sessionId}/visible`, {
        visible: nextVisible,
      })
      setVisibleToStudents(nextVisible)
      await reloadGrades()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const responsesByStudentId = useMemo(() => {
    const map: Record<string, Response[]> = {}
    responses.forEach((response) => {
      if (!map[response.studentUserId]) map[response.studentUserId] = []
      map[response.studentUserId].push(response)
    })
    return map
  }, [responses])

  const gradeByStudentId = useMemo(() => {
    const map: Record<string, Grade | null> = {}
    grades.forEach((grade) => {
      map[grade.userId] = grade
    })
    return map
  }, [grades])

  const markByStudentId = useMemo(() => {
    const map: Record<string, Mark | null> = {}
    const qid = selectedQuestion?._id
    students.forEach((student) => {
      const grade = gradeByStudentId[student.userId]
      if (!qid || !grade) {
        map[student.userId] = null
        return
      }
      map[student.userId] = grade.marks?.find((mark) => mark.questionId === qid) || null
    })
    return map
  }, [students, selectedQuestion?._id, gradeByStudentId])

  const selectedGroupCategory = useMemo(() => {
    const categories = course?.groupCategories || []
    if (!groupCategoryNumber) return null
    return (
      categories.find((category) => String(category.categoryNumber ?? '') === groupCategoryNumber) || null
    )
  }, [course?.groupCategories, groupCategoryNumber])

  const selectedGroup = useMemo(() => {
    if (!selectedGroupCategory || !groupNumber) return null
    return (
      (selectedGroupCategory.groups || []).find(
        (group) => String(group.groupNumber ?? '') === groupNumber
      ) || null
    )
  }, [selectedGroupCategory, groupNumber])

  useEffect(() => {
    if (!selectedGroupCategory) {
      if (groupNumber) setGroupNumber('')
      return
    }
    if (!groupNumber) return
    const exists = (selectedGroupCategory.groups || []).some(
      (group) => String(group.groupNumber ?? '') === groupNumber
    )
    if (!exists) setGroupNumber('')
  }, [selectedGroupCategory, groupNumber])

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase()
    const answerQ = answerSearch.trim().toLowerCase()
    const basePool =
      selectedGroup && Array.isArray(selectedGroup.students)
        ? students.filter((student) => selectedGroup.students?.includes(student.userId))
        : students

    return basePool.filter((student) => {
      const fullName = `${student.firstname} ${student.lastname}`.trim().toLowerCase()
      const idMatch = student.userId.toLowerCase().includes(q)
      const nameMatch = fullName.includes(q)
      const emailMatch = student.email.toLowerCase().includes(q)
      const matchesStudent = q.length === 0 || idMatch || nameMatch || emailMatch

      if (!matchesStudent) return false
      if (!answerQ) return true

      const joinedAnswers = (responsesByStudentId[student.userId] || [])
        .map((response) => (Array.isArray(response.answer) ? response.answer.join(' ') : String(response.answer)))
        .join(' ')
        .toLowerCase()
      return joinedAnswers.includes(answerQ)
    })
  }, [students, selectedGroup, studentSearch, answerSearch, responsesByStudentId])

  const responseStats = useMemo(() => {
    if (!selectedQuestion || !selectedQuestion.options?.length) return []
    return selectedQuestion.options.map((option, index) => {
      const answer = optionValue(option, index)
      const selected = responses.filter((response) => {
        const normalized = answer.toLowerCase()
        if (Array.isArray(response.answer)) {
          return response.answer.map((entry) => String(entry).toLowerCase()).includes(normalized)
        }
        return String(response.answer).toLowerCase() === normalized
      }).length
      const pct = responses.length > 0 ? (selected / responses.length) * 100 : 0
      return { answer, pct }
    })
  }, [selectedQuestion, responses])

  const setDraftPoints = (studentId: string, points: number) => {
    setDrafts((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        points,
      },
    }))
  }

  const setDraftFeedback = (studentId: string, feedback: string) => {
    setDrafts((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        feedback,
      },
    }))
  }

  const clearDraft = (studentId: string) => {
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[studentId]
      return next
    })
  }

  const persistStudentMark = async (studentId: string, overrideDraft?: DraftMark) => {
    if (!selectedQuestion?._id) return
    const grade = gradeByStudentId[studentId]
    if (!grade?._id) {
      setError('No grade record found. Click "Create Grade Items" first.')
      return
    }

    const existingMark = markByStudentId[studentId]
    const draft = overrideDraft || drafts[studentId]
    if (!draft) return

    const outOf = existingMark?.outOf ?? selectedQuestion.sessionOptions?.points ?? 1
    const nextPoints = draft.points ?? existingMark?.points ?? 0
    const nextFeedback = draft.feedback ?? existingMark?.feedback ?? ''

    if (nextPoints < 0) {
      setError('Points cannot be negative.')
      return
    }

    const updatedMark: Mark = {
      ...(existingMark || {}),
      questionId: selectedQuestion._id,
      outOf,
      points: nextPoints,
      feedback: nextFeedback,
      needsGrading: false,
      automatic: false,
    }

    const currentMarks = grade.marks || []
    const byQuestion = new Map<string, Mark>()
    currentMarks.forEach((mark) => {
      if (mark.questionId) byQuestion.set(markKey(mark.questionId), mark)
    })
    byQuestion.set(markKey(selectedQuestion._id), updatedMark)
    const marks = Array.from(byQuestion.values())

    const points = marks.reduce((sum, mark) => sum + (mark.points || 0), 0)
    const outOfTotal = marks.reduce((sum, mark) => sum + (mark.outOf || 0), 0)
    const value = outOfTotal > 0 ? Math.round((1000 * points) / outOfTotal) / 10 : 0
    const needsGrading = marks.some((mark) => Boolean(mark.needsGrading))

    setSavingStudentId(studentId)
    setError(null)
    try {
      const updated = await apiClient.put<Grade>(`/grades/${grade._id}`, {
        marks,
        points,
        outOf: outOfTotal,
        value,
        needsGrading,
      })
      setGrades((prev) => prev.map((row) => (row._id === updated._id ? updated : row)))
      clearDraft(studentId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSavingStudentId(null)
    }
  }

  const saveStudent = async (studentId: string) => {
    await persistStudentMark(studentId)
  }

  const saveAll = async () => {
    const toSave = Object.keys(drafts)
    for (const studentId of toSave) {
      // Keep saves sequential to avoid clobbering grade updates for same question.
      // eslint-disable-next-line no-await-in-loop
      await persistStudentMark(studentId)
    }
  }

  const assignPointsToFiltered = async () => {
    if (!selectedQuestion || filteredStudents.length < 1) return
    if (!window.confirm('Assign this grade to all currently filtered students?')) return

    if (questionPoints < 0) {
      setError('Points cannot be negative.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      for (const student of filteredStudents) {
        // Keep updates sequential to avoid overwriting stale marks arrays.
        // eslint-disable-next-line no-await-in-loop
        await persistStudentMark(student.userId, { points: questionPoints })
      }
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="page">Loading...</div>
  if (error && !session) return <div className="page">Error: {error}</div>
  if (!session) return <div className="page">Session not found</div>

  return (
    <div className="page">
      <div className="ql-header-bar">
        <h1>Session Grades: {session.name}</h1>
      </div>

      <div className="container">
        <Link className="btn btn-secondary" to={`/course/${courseId}`} style={{ marginBottom: '1rem', display: 'inline-block' }}>
          Back to Course
        </Link>

        <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={calculateGrades} disabled={busy}>
            {busy ? 'Working...' : grades.length === 0 ? 'Create Grade Items' : 'Re-calculate Grades'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={toggleVisibility} disabled={busy || grades.length === 0}>
            {visibleToStudents ? 'Hide From Students' : 'Show To Students'}
          </button>
        </div>

        {error && <div className="ql-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}

        {questions.length === 0 ? (
          <p>No questions available for this session yet.</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={selectedQuestionIndex <= 0 || Object.keys(drafts).length > 0}
                onClick={() => setSelectedQuestionIndex((index) => Math.max(0, index - 1))}
              >
                Previous Question
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={selectedQuestionIndex >= questions.length - 1 || Object.keys(drafts).length > 0}
                onClick={() => setSelectedQuestionIndex((index) => Math.min(questions.length - 1, index + 1))}
              >
                Next Question
              </button>
              <span>
                Question {selectedQuestionIndex + 1} of {questions.length}
              </span>
              {Object.keys(drafts).length > 0 && <span className="ql-error">Save or discard changes before switching questions.</span>}
            </div>

            {selectedQuestion && (
              <div
                style={{
                  marginBottom: '0.75rem',
                  display: 'flex',
                  gap: '0.5rem',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <span>Assign points for this question:</span>
                <input
                  type="number"
                  className="form-control"
                  style={{ width: 120 }}
                  min={0}
                  step={0.5}
                  value={Number.isFinite(questionPoints) ? questionPoints : 0}
                  onChange={(e) => setQuestionPoints(Number(e.target.value))}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy || filteredStudents.length < 1}
                  onClick={assignPointsToFiltered}
                >
                  Assign to Filtered Students ({filteredStudents.length})
                </button>
              </div>
            )}

            {selectedQuestion && (
              <div className="ql-card" style={{ marginBottom: '0.75rem' }}>
                <div className="ql-card-content">
                  <QuestionDisplay
                    question={selectedQuestion}
                    readonly
                    prof
                    forReview
                    showCorrect
                    showStatsOverride
                    responseStats={responseStats}
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.75rem' }}>
              {course && (course.groupCategories || []).length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem' }}>
                  <select
                    className="form-control"
                    value={groupCategoryNumber}
                    onChange={(e) => {
                      const nextCategory = e.target.value
                      setGroupCategoryNumber(nextCategory)
                      const category = (course.groupCategories || []).find(
                        (entry) => String(entry.categoryNumber ?? '') === nextCategory
                      )
                      const firstGroup = category?.groups?.[0]
                      setGroupNumber(firstGroup?.groupNumber ? String(firstGroup.groupNumber) : '')
                    }}
                  >
                    <option value="">All Categories</option>
                    {(course.groupCategories || []).map((category) => (
                      <option key={String(category.categoryNumber)} value={String(category.categoryNumber)}>
                        {category.categoryName || `Category ${category.categoryNumber}`}
                      </option>
                    ))}
                  </select>
                  <select
                    className="form-control"
                    value={groupNumber}
                    disabled={!selectedGroupCategory}
                    onChange={(e) => setGroupNumber(e.target.value)}
                  >
                    <option value="">All Groups</option>
                    {(selectedGroupCategory?.groups || []).map((group) => (
                      <option key={String(group.groupNumber)} value={String(group.groupNumber)}>
                        {group.groupName || `Group ${group.groupNumber}`}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setGroupCategoryNumber('')
                      setGroupNumber('')
                    }}
                  >
                    Clear
                  </button>
                </div>
              )}
              <input
                type="text"
                className="form-control"
                placeholder="Search by student name, email, or id"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
              />
              <input
                type="text"
                className="form-control"
                placeholder="Search by response content"
                value={answerSearch}
                onChange={(e) => setAnswerSearch(e.target.value)}
              />
            </div>

            {selectedQuestion && (
              <ResponseList
                question={selectedQuestion}
                students={filteredStudents}
                responsesByStudentId={responsesByStudentId}
                markByStudentId={markByStudentId}
                drafts={drafts}
                onDraftPoints={setDraftPoints}
                onDraftFeedback={setDraftFeedback}
                onSave={saveStudent}
                onCancel={clearDraft}
                onSaveAll={saveAll}
                onCancelAll={() => setDrafts({})}
                savingStudentId={savingStudentId}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

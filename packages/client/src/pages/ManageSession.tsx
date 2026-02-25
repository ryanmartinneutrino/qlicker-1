import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { Question, QuizExtension, Session } from '@qlicker/shared'
import { apiClient } from '../api/client'
import QuizExtensionsModal from '../components/modals/QuizExtensionsModal'
import { QUESTION_TYPE_LABELS } from '../constants/questionTypes'

type ExtensionRow = QuizExtension & { quizStartInput: string; quizEndInput: string }
type ExtensionCandidate = { userId: string; name: string; email: string }

function orderSessionQuestions(questions: Question[], sessionDoc: Session | null): Question[] {
  const ids = (sessionDoc?.questions || []).filter((id): id is string => typeof id === 'string')
  if (ids.length < 1) return questions
  const position = new Map(ids.map((id, index) => [id, index]))
  return [...questions].sort((left, right) => {
    const leftIndex = position.get(left._id || '') ?? Number.MAX_SAFE_INTEGER
    const rightIndex = position.get(right._id || '') ?? Number.MAX_SAFE_INTEGER
    return leftIndex - rightIndex
  })
}

export default function ManageSession() {
  const { courseId, sessionId } = useParams<{ courseId: string; sessionId: string }>()
  const navigate = useNavigate()

  const [session, setSession] = useState<Session | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [quiz, setQuiz] = useState(false)
  const [quizStart, setQuizStart] = useState('')
  const [quizEnd, setQuizEnd] = useState('')
  const [quizExtensions, setQuizExtensions] = useState<ExtensionRow[]>([])
  const [extensionCandidates, setExtensionCandidates] = useState<ExtensionCandidate[]>([])
  const [courseQuestions, setCourseQuestions] = useState<Question[]>([])
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>([])
  const [questionSearch, setQuestionSearch] = useState('')
  const [questionLoading, setQuestionLoading] = useState(false)
  const [questionBusyId, setQuestionBusyId] = useState<string | null>(null)
  const [showExtensionModal, setShowExtensionModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const refreshQuestionLists = async (sessionDoc?: Session | null) => {
    if (!sessionId) return
    const activeSession = sessionDoc || session
    const effectiveCourseId = courseId || activeSession?.courseId
    if (!effectiveCourseId) return

    setQuestionLoading(true)
    try {
      const [library, attached] = await Promise.all([
        apiClient.get<Question[]>(`/questions?courseId=${effectiveCourseId}&library=library`),
        apiClient.get<Question[]>(`/questions?sessionId=${sessionId}`),
      ])
      setCourseQuestions(
        [...library]
          .filter((question) => !question.sessionId)
          .sort((left, right) => (left.plainText || '').localeCompare(right.plainText || ''))
      )
      setSessionQuestions(orderSessionQuestions(attached, activeSession || null))
    } catch (err) {
      setError((err as Error).message)
      setCourseQuestions([])
      setSessionQuestions([])
    } finally {
      setQuestionLoading(false)
    }
  }

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)
    apiClient
      .get<Session>(`/sessions/${sessionId}`)
      .then((s) => {
        setSession(s)
        setName(s.name)
        setDescription(s.description || '')
        setQuiz(!!s.quiz)
        setQuizStart(s.quizStart ? new Date(s.quizStart).toISOString().slice(0, 16) : '')
        setQuizEnd(s.quizEnd ? new Date(s.quizEnd).toISOString().slice(0, 16) : '')
        setQuizExtensions(
          (s.quizExtensions || []).map((entry) => ({
            ...entry,
            quizStartInput: entry.quizStart ? new Date(entry.quizStart).toISOString().slice(0, 16) : '',
            quizEndInput: entry.quizEnd ? new Date(entry.quizEnd).toISOString().slice(0, 16) : '',
          }))
        )
        void refreshQuestionLists(s)
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    apiClient
      .get<ExtensionCandidate[]>(`/sessions/${sessionId}/extension-candidates`)
      .then(setExtensionCandidates)
      .catch(() => {
        setExtensionCandidates([])
      })
  }, [sessionId])

  useEffect(() => {
    if (!session?._id) return
    setSessionQuestions((prev) => orderSessionQuestions(prev, session))
  }, [session?.questions])

  const setQuizStartWithParity = (nextValue: string) => {
    setQuizStart(nextValue)
    if (quizEnd && nextValue && nextValue > quizEnd) {
      const shifted = new Date(new Date(nextValue).getTime() + 60 * 60 * 1000)
      setQuizEnd(shifted.toISOString().slice(0, 16))
    }
  }

  const setQuizEndWithParity = (nextValue: string) => {
    if (quizStart && nextValue && nextValue < quizStart) {
      setError('Cannot set end time before start time.')
      return
    }
    setError(null)
    setQuizEnd(nextValue)
  }

  const toggleQuizMode = (enabled: boolean) => {
    setQuiz(enabled)
    if (!enabled) return
    const now = new Date(Date.now() + 60 * 60 * 1000)
    const fallbackStart = now.toISOString().slice(0, 16)
    const fallbackEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16)
    setQuizStart((prev) => prev || fallbackStart)
    setQuizEnd((prev) => prev || fallbackEnd)
  }

  const filteredCourseQuestions = useMemo(() => {
    const q = questionSearch.trim().toLowerCase()
    if (!q) return courseQuestions
    return courseQuestions.filter((question) => {
      const text = `${question.plainText || ''} ${question.content || ''}`.toLowerCase()
      return text.includes(q)
    })
  }, [courseQuestions, questionSearch])

  const addQuestionToSession = async (questionId: string) => {
    if (!sessionId) return
    setQuestionBusyId(questionId)
    setError(null)
    setMessage(null)
    try {
      await apiClient.post<Question>(`/sessions/${sessionId}/questions/${questionId}/copy`, {})
      const updatedSession = await apiClient.get<Session>(`/sessions/${sessionId}`)
      setSession(updatedSession)
      await refreshQuestionLists(updatedSession)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setQuestionBusyId(null)
    }
  }

  const removeSessionQuestion = async (questionId: string) => {
    if (!sessionId) return
    if (!window.confirm('Remove this question from the session?')) return
    setQuestionBusyId(questionId)
    setError(null)
    setMessage(null)
    try {
      const updated = await apiClient.delete<Session>(`/sessions/${sessionId}/questions/${questionId}`)
      setSession(updated)
      await refreshQuestionLists(updated)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setQuestionBusyId(null)
    }
  }

  const moveSessionQuestion = async (questionId: string, direction: -1 | 1) => {
    if (!sessionId || !session) return
    const orderedIds = (session.questions || []).filter((id): id is string => typeof id === 'string')
    const currentIndex = orderedIds.indexOf(questionId)
    const targetIndex = currentIndex + direction
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedIds.length) return

    const nextOrder = [...orderedIds]
    const [moved] = nextOrder.splice(currentIndex, 1)
    nextOrder.splice(targetIndex, 0, moved)

    setQuestionBusyId(questionId)
    setError(null)
    setMessage(null)
    try {
      const updated = await apiClient.put<Session>(`/sessions/${sessionId}/questions`, {
        questionIds: nextOrder,
      })
      setSession(updated)
      await refreshQuestionLists(updated)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setQuestionBusyId(null)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sessionId) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const body: Partial<Session> = {
        name,
        description,
        quiz,
        quizStart: quizStart ? new Date(quizStart) : undefined,
        quizEnd: quizEnd ? new Date(quizEnd) : undefined,
        quizExtensions: quiz
          ? quizExtensions
              .filter((entry) => entry.userId.trim())
              .map((entry) => ({
                userId: entry.userId.trim(),
                quizStart: entry.quizStartInput ? new Date(entry.quizStartInput) : null,
                quizEnd: entry.quizEndInput ? new Date(entry.quizEndInput) : null,
              }))
          : [],
      }
      const updated = await apiClient.put<Session>(`/sessions/${sessionId}`, body)
      setSession(updated)
      setMessage('Session saved successfully.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="page">Loading...</div>
  if (!session) return <div className="page">Session not found</div>

  return (
    <div className="page">
      <div className="ql-header-bar">
        <h1>Edit Session</h1>
      </div>

      <div className="container">
        <form onSubmit={handleSave}>
          <div className="form-group">
            <label htmlFor="sessionName">Session Name</label>
            <input
              id="sessionName"
              type="text"
              className="form-control"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="sessionDescription">Description</label>
            <textarea
              id="sessionDescription"
              className="form-control"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={quiz}
                onChange={(e) => toggleQuizMode(e.target.checked)}
              />{' '}
              Quiz Mode
            </label>
          </div>

          {quiz && (
            <>
              <div className="form-group">
                <label htmlFor="quizStart">Start Date</label>
                <input
                  id="quizStart"
                  type="datetime-local"
                  className="form-control"
                  value={quizStart}
                  onChange={(e) => setQuizStartWithParity(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="quizEnd">End Date</label>
                <input
                  id="quizEnd"
                  type="datetime-local"
                  className="form-control"
                  value={quizEnd}
                  onChange={(e) => setQuizEndWithParity(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Quiz Extensions</label>
                <button type="button" className="btn btn-default btn-sm" onClick={() => setShowExtensionModal(true)}>
                  Manage Extensions
                </button>
                {quizExtensions.length > 0 && <div style={{ marginTop: '0.5rem' }}>{quizExtensions.length} active extension(s)</div>}
              </div>
            </>
          )}

          {error && <div className="ql-error">{error}</div>}
          {message && <div className="ql-success">{message}</div>}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate(`/course/${courseId}`)}
            >
              Back to Course
            </button>
          </div>
        </form>

        <hr style={{ margin: '1.5rem 0' }} />

        <div className="row">
          <div className="col-md-6">
            <h3>Course Library</h3>
            <input
              type="text"
              className="form-control"
              placeholder="Search questions..."
              value={questionSearch}
              onChange={(e) => setQuestionSearch(e.target.value)}
              style={{ marginBottom: '0.5rem' }}
            />
            {questionLoading ? (
              <p>Loading questions...</p>
            ) : filteredCourseQuestions.length < 1 ? (
              <p>No library questions found.</p>
            ) : (
              <div style={{ display: 'grid', gap: '0.5rem', maxHeight: 360, overflowY: 'auto' }}>
                {filteredCourseQuestions.map((question) => (
                  <div key={question._id} className="ql-card" style={{ marginBottom: 0 }}>
                    <div className="ql-card-content" style={{ padding: '0.6rem 0.75rem' }}>
                      <div style={{ fontWeight: 600 }}>
                        {question.plainText || 'Untitled question'}
                      </div>
                      <div style={{ fontSize: '0.85em', opacity: 0.8 }}>
                        {QUESTION_TYPE_LABELS[question.type] ?? `Type ${question.type}`}
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ marginTop: '0.5rem' }}
                        disabled={!question._id || questionBusyId === question._id}
                        onClick={() => addQuestionToSession(question._id || '')}
                      >
                        {questionBusyId === question._id ? 'Adding...' : 'Add to Session'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="col-md-6">
            <h3>Session Questions ({sessionQuestions.length})</h3>
            {questionLoading ? (
              <p>Loading questions...</p>
            ) : sessionQuestions.length < 1 ? (
              <p>No questions attached to this session yet.</p>
            ) : (
              <div style={{ display: 'grid', gap: '0.5rem', maxHeight: 360, overflowY: 'auto' }}>
                {sessionQuestions.map((question, index) => (
                  <div key={question._id} className="ql-card" style={{ marginBottom: 0 }}>
                    <div className="ql-card-content" style={{ padding: '0.6rem 0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>
                            {index + 1}. {question.plainText || 'Untitled question'}
                          </div>
                          <div style={{ fontSize: '0.85em', opacity: 0.8 }}>
                            {QUESTION_TYPE_LABELS[question.type] ?? `Type ${question.type}`}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={!question._id || index === 0 || questionBusyId === question._id}
                            onClick={() => moveSessionQuestion(question._id || '', -1)}
                          >
                            Up
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={!question._id || index === sessionQuestions.length - 1 || questionBusyId === question._id}
                            onClick={() => moveSessionQuestion(question._id || '', 1)}
                          >
                            Down
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={!question._id || questionBusyId === question._id}
                            onClick={() => removeSessionQuestion(question._id || '')}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <QuizExtensionsModal
        open={showExtensionModal}
        onClose={() => setShowExtensionModal(false)}
        sessionQuizStart={quizStart}
        sessionQuizEnd={quizEnd}
        candidates={extensionCandidates}
        value={quizExtensions}
        onChange={setQuizExtensions}
      />
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Question, Response as QuestionResponse, Session } from '@qlicker/shared'
import { apiClient } from '../api/client'
import { useRealtimeCollection } from '../hooks/useRealtimeCollection'
import { useRealtimeContext } from '../contexts/RealtimeContext'
import { QuestionDisplay } from '../components/QuestionDisplay'
import { QuestionSidebar } from '../components/QuestionSidebar'
import { ShortAnswerList } from '../components/ShortAnswerList'
import { Histogram } from '../components/Histogram'
import { QUESTION_TYPE } from '../constants/questionTypes'

interface SessionOptionsShape {
  hidden: boolean
  stats: boolean
  correct: boolean
  points?: number
  maxAttempts?: number
  attemptWeights: number[]
  attempts: Array<{ number: number; closed: boolean }>
}

function optionValue(option: { answer?: string; plainText?: string; content?: string }, index: number): string {
  return option.answer || option.plainText || option.content || String.fromCharCode(65 + index)
}

function currentAttempt(question: Question | null): { number: number; closed: boolean } {
  if (!question) return { number: 1, closed: false }
  const attempts = question.sessionOptions?.attempts || []
  if (attempts.length < 1) return { number: 1, closed: false }
  const latest = attempts[attempts.length - 1]
  return {
    number: Number(latest.number || attempts.length || 1),
    closed: Boolean(latest.closed),
  }
}

function ensureSessionOptions(question: Question): SessionOptionsShape {
  const attempts = question.sessionOptions?.attempts || []
  const normalizedAttempts =
    attempts.length > 0
      ? attempts.map((entry, index) => ({
          number: Number(entry.number || index + 1),
          closed: Boolean(entry.closed),
        }))
      : [{ number: 1, closed: false }]

  return {
    hidden: Boolean(question.sessionOptions?.hidden),
    stats: Boolean(question.sessionOptions?.stats),
    correct: Boolean(question.sessionOptions?.correct),
    points: Number(question.sessionOptions?.points ?? 1),
    maxAttempts: Number(question.sessionOptions?.maxAttempts ?? 1),
    attemptWeights:
      Array.isArray(question.sessionOptions?.attemptWeights) && question.sessionOptions?.attemptWeights.length > 0
        ? question.sessionOptions?.attemptWeights.map((entry) => Number(entry))
        : [1],
    attempts: normalizedAttempts,
  }
}

export default function RunSession() {
  const { courseId, sessionId } = useParams<{ courseId: string; sessionId: string }>()
  const navigate = useNavigate()
  const { socket } = useRealtimeContext()

  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const normalizedQuestions = useRef<Set<string>>(new Set())

  const {
    data: questions,
    loading: questionsLoading,
    error: questionsError,
    refetch: refetchQuestions,
  } = useRealtimeCollection<Question>({
    fetchPath: `/questions?sessionId=${sessionId || ''}`,
    subscribeEvent: 'subscribe:questions',
    subscribePayload: { sessionId: sessionId || '' },
    changeEvent: 'questions:change',
    enabled: Boolean(sessionId),
    refetchOnChange: true,
  })

  const orderedQuestions = useMemo(() => {
    if (!session) return questions
    if (!(session.questions || []).length) return questions
    return [...questions].sort(
      (a, b) =>
        (session.questions?.indexOf(a._id || '') ?? Number.MAX_SAFE_INTEGER) -
        (session.questions?.indexOf(b._id || '') ?? Number.MAX_SAFE_INTEGER)
    )
  }, [questions, session])

  const currentQuestion = orderedQuestions[currentIndex] || null

  const {
    data: responses,
    loading: responsesLoading,
    error: responsesError,
  } = useRealtimeCollection<QuestionResponse>({
    fetchPath: `/responses?questionId=${currentQuestion?._id || ''}`,
    subscribeEvent: 'subscribe:responses',
    subscribePayload: { questionId: currentQuestion?._id || '' },
    changeEvent: 'responses:change',
    enabled: Boolean(currentQuestion?._id),
  })

  const loadSession = useCallback(async () => {
    if (!sessionId) return
    setSessionLoading(true)
    setSessionError(null)
    try {
      const loaded = await apiClient.get<Session>(`/sessions/${sessionId}`)
      setSession(loaded)
    } catch (err) {
      setSessionError((err as Error).message)
    } finally {
      setSessionLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void loadSession()
  }, [loadSession])

  useEffect(() => {
    if (!sessionId || !socket) return

    socket.emit('subscribe:session', { sessionId })

    const handler = (event: {
      operationType?: string
      fullDocument?: Session
      documentKey?: { _id?: string }
    }) => {
      if (event.fullDocument && event.fullDocument._id === sessionId) {
        setSession(event.fullDocument)
      }
      if (event.operationType === 'delete' && event.documentKey?._id === sessionId) {
        setSession(null)
      }
    }

    socket.on('session:change', handler)
    return () => {
      socket.off('session:change', handler)
    }
  }, [sessionId, socket])

  useEffect(() => {
    if (!session?.currentQuestion || orderedQuestions.length < 1) return
    const index = orderedQuestions.findIndex((question) => question._id === session.currentQuestion)
    if (index >= 0) setCurrentIndex(index)
  }, [session?.currentQuestion, orderedQuestions])

  useEffect(() => {
    if (session?.status !== 'running') return
    if (session.currentQuestion) return
    const first = orderedQuestions[0]
    if (!first?._id) return
    void setCurrentQuestion(first._id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status, session?.currentQuestion, orderedQuestions])

  const updateStatus = async (status: string) => {
    if (!sessionId) return
    setBusy(true)
    setSessionError(null)
    try {
      const updated = await apiClient.put<Session>(`/sessions/${sessionId}/status`, { status })
      setSession(updated)
      if (status === 'done') {
        navigate(`/course/${courseId}`)
      }
    } catch (err) {
      setSessionError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const setCurrentQuestion = async (questionId: string | undefined) => {
    if (!sessionId || !questionId) return
    setBusy(true)
    setSessionError(null)
    try {
      const updated = await apiClient.put<Session>(`/sessions/${sessionId}/current`, { questionId })
      setSession(updated)
    } catch (err) {
      setSessionError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const updateCurrentQuestionOptions = async (
    transform: (options: SessionOptionsShape) => SessionOptionsShape
  ) => {
    if (!currentQuestion?._id) return
    setBusy(true)
    setSessionError(null)
    try {
      const currentOptions = ensureSessionOptions(currentQuestion)
      const nextOptions = transform(currentOptions)
      await apiClient.put<Question>(`/questions/${currentQuestion._id}`, {
        sessionOptions: nextOptions,
      })
      refetchQuestions()
    } catch (err) {
      setSessionError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!currentQuestion?._id) return
    if (normalizedQuestions.current.has(currentQuestion._id)) return

    const options = currentQuestion.sessionOptions
    const needsNormalization =
      !options ||
      !Array.isArray(options.attempts) ||
      options.attempts.length < 1 ||
      !Array.isArray(options.attemptWeights) ||
      options.attemptWeights.length < 1

    if (!needsNormalization) return

    normalizedQuestions.current.add(currentQuestion._id)
    void updateCurrentQuestionOptions((current) => current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion?._id])

  const toggleHidden = async () => {
    await updateCurrentQuestionOptions((options) => ({
      ...options,
      hidden: !options.hidden,
    }))
  }

  const toggleCorrect = async () => {
    await updateCurrentQuestionOptions((options) => ({
      ...options,
      correct: !options.correct,
    }))
  }

  const toggleStats = async () => {
    await updateCurrentQuestionOptions((options) => ({
      ...options,
      stats: !options.stats,
    }))
  }

  const toggleAttemptStatus = async () => {
    await updateCurrentQuestionOptions((options) => {
      const attempts = [...options.attempts]
      if (attempts.length < 1) attempts.push({ number: 1, closed: false })
      const latest = attempts[attempts.length - 1]
      attempts[attempts.length - 1] = {
        ...latest,
        closed: !latest.closed,
      }
      return {
        ...options,
        attempts,
      }
    })
  }

  const createNewAttempt = async () => {
    await updateCurrentQuestionOptions((options) => {
      const attempts = [...options.attempts]
      const latest = attempts.length > 0 ? attempts[attempts.length - 1] : { number: 1, closed: false }
      if (attempts.length > 0) {
        attempts[attempts.length - 1] = {
          ...latest,
          closed: true,
        }
      }
      attempts.push({ number: Number(latest.number || attempts.length || 1) + 1, closed: false })

      return {
        ...options,
        attempts,
        correct: false,
        stats: false,
      }
    })
  }

  const gotoPreviousQuestion = async () => {
    if (currentIndex <= 0) return
    const previous = orderedQuestions[currentIndex - 1]
    if (!previous?._id) return
    setCurrentIndex((value) => value - 1)
    await setCurrentQuestion(previous._id)
  }

  const gotoNextQuestion = async () => {
    if (currentIndex >= orderedQuestions.length - 1) return
    const next = orderedQuestions[currentIndex + 1]
    if (!next?._id) return
    setCurrentIndex((value) => value + 1)
    await setCurrentQuestion(next._id)
  }

  const openSecondDisplay = () => {
    if (!courseId || !session?._id) return
    window.open(
      `/course/${courseId}/session/present/${session._id}`,
      'Qlicker Session Display',
      'height=768,width=1024'
    )
  }

  const activeAttempt = currentAttempt(currentQuestion)
  const attemptResponses = responses.filter(
    (response) => Number(response.attempt) === activeAttempt.number
  )
  const responseStats =
    currentQuestion && (currentQuestion.options || []).length > 0
      ? (currentQuestion.options || []).map((option, index) => {
          const answer = optionValue(option, index)
          const selected = attemptResponses.filter((response) => {
            if (Array.isArray(response.answer)) {
              return response.answer.map((entry) => String(entry).toLowerCase()).includes(answer.toLowerCase())
            }
            return String(response.answer).toLowerCase() === answer.toLowerCase()
          }).length
          const pct = attemptResponses.length > 0 ? (selected / attemptResponses.length) * 100 : 0
          return { answer, pct }
        })
      : []

  const shortAnswers =
    currentQuestion?.type === QUESTION_TYPE.SA
      ? attemptResponses.map((response) => {
          if (response.answerWysiwyg) return response.answerWysiwyg
          if (Array.isArray(response.answer)) return response.answer.join(', ')
          return String(response.answer)
        })
      : []

  const numericalAnswers =
    currentQuestion?.type === QUESTION_TYPE.NU
      ? attemptResponses
          .map((response) => {
            const raw = Array.isArray(response.answer) ? response.answer[0] : response.answer
            return Number(raw)
          })
          .filter((value) => Number.isFinite(value))
      : []

  const error = sessionError || questionsError || responsesError
  if (sessionLoading || questionsLoading || responsesLoading) return <div className="page">Loading...</div>
  if (error && !session) return <div className="page">Error: {error}</div>
  if (!session) return <div className="page">Session not found</div>

  const joinedCount = (session.joined || []).length
  const statusActionLabel =
    session.status === 'hidden'
      ? 'Make Visible'
      : session.status === 'visible'
        ? 'Start Session'
        : session.status === 'running'
          ? 'Finish Session'
          : ''

  return (
    <div className="page">
      <div className="ql-header-bar">
        <h1>{session.name}</h1>
        <span className={`ql-session-status ql-${session.status}`}>{session.status}</span>
      </div>

      <div className="container">
        <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => navigate(`/course/${courseId}`)}>
            Back to Course
          </button>
          {session.status === 'hidden' && (
            <button className="btn btn-primary" disabled={busy} onClick={() => void updateStatus('visible')}>
              {statusActionLabel}
            </button>
          )}
          {session.status === 'visible' && (
            <button className="btn btn-primary" disabled={busy} onClick={() => void updateStatus('running')}>
              {statusActionLabel}
            </button>
          )}
          {session.status === 'running' && (
            <button className="btn btn-primary" disabled={busy} onClick={() => void updateStatus('done')}>
              {statusActionLabel}
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => setPresenting((value) => !value)}>
            {presenting ? 'Instructor Mode' : 'Presentation Mode'}
          </button>
          <button className="btn btn-secondary" onClick={openSecondDisplay}>Open 2nd Display</button>
        </div>

        {error && <div className="ql-error" style={{ marginBottom: '0.6rem' }}>{error}</div>}

        {session.status !== 'running' ? (
          <div className="ql-card">
            <div className="ql-card-content">
              <p>
                Session is currently <strong>{session.status}</strong>.
              </p>
              <p>Set status to running to access live controls.</p>
            </div>
          </div>
        ) : orderedQuestions.length === 0 ? (
          <p>No questions in this session.</p>
        ) : !currentQuestion ? (
          <p>Select a current question to start.</p>
        ) : (
          <>
            <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span>
                Question <strong>{currentIndex + 1}</strong> / {orderedQuestions.length}
              </span>
              <span>
                Joined <strong>{joinedCount}</strong>
              </span>
              <span>
                Responses <strong>{attemptResponses.length}</strong>
              </span>
              <span>
                Attempt <strong>{activeAttempt.number}</strong>
              </span>
            </div>

            <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" disabled={busy || currentIndex === 0} onClick={() => void gotoPreviousQuestion()}>
                Previous
              </button>
              <button
                className="btn btn-secondary"
                disabled={busy || currentIndex === orderedQuestions.length - 1}
                onClick={() => void gotoNextQuestion()}
              >
                Next
              </button>
              <button className="btn btn-secondary" disabled={busy} onClick={() => void toggleHidden()}>
                {currentQuestion.sessionOptions?.hidden ? 'Show Question' : 'Hide Question'}
              </button>
              <button className="btn btn-secondary" disabled={busy} onClick={() => void toggleCorrect()}>
                {currentQuestion.sessionOptions?.correct ? 'Hide Correct' : 'Show Correct'}
              </button>
              <button className="btn btn-secondary" disabled={busy} onClick={() => void toggleStats()}>
                {currentQuestion.sessionOptions?.stats ? 'Hide Stats' : 'Show Stats'}
              </button>
              <button className="btn btn-secondary" disabled={busy} onClick={() => void toggleAttemptStatus()}>
                {activeAttempt.closed ? 'Allow Responses' : 'Disallow Responses'}
              </button>
              <button className="btn btn-secondary" disabled={busy} onClick={() => void createNewAttempt()}>
                New Attempt
              </button>
            </div>

            <div className="row">
              {!presenting && (
                <div className="col-md-3">
                  <QuestionSidebar
                    questions={orderedQuestions}
                    currentIndex={currentIndex}
                    onSelect={(nextIndex) => {
                      const selected = orderedQuestions[nextIndex]
                      setCurrentIndex(nextIndex)
                      if (selected?._id) {
                        void setCurrentQuestion(selected._id)
                      }
                    }}
                  />
                </div>
              )}

              <div className={presenting ? 'col-md-12' : 'col-md-9'}>
                <QuestionDisplay
                  question={currentQuestion}
                  readonly
                  prof={!presenting}
                  forReview={!presenting}
                  responseStats={responseStats}
                  showStatsOverride={!presenting || Boolean(currentQuestion.sessionOptions?.stats)}
                />

                {!presenting && currentQuestion.type === QUESTION_TYPE.SA && (
                  <ShortAnswerList answers={shortAnswers} />
                )}
                {!presenting && currentQuestion.type === QUESTION_TYPE.NU && (
                  <Histogram values={numericalAnswers} />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

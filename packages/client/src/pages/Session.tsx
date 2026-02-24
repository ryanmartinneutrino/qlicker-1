import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Question, Response as QuestionResponse, Session as SessionType } from '@qlicker/shared'
import { apiClient } from '../api/client'
import { useRealtimeCollection } from '../hooks/useRealtimeCollection'
import { useRealtimeContext } from '../contexts/RealtimeContext'
import { useAuth } from '../hooks/useAuth'
import { QuestionDisplay } from '../components/QuestionDisplay'
import { ShortAnswerList } from '../components/ShortAnswerList'
import { Histogram } from '../components/Histogram'
import { QUESTION_TYPE } from '../constants/questionTypes'

function toMillis(value: unknown): number | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value as string)
  const millis = date.getTime()
  return Number.isFinite(millis) ? millis : null
}

function hasActiveQuizExtension(session: SessionType, userId: string): boolean {
  if (!Array.isArray(session.quizExtensions)) return false
  const extension = session.quizExtensions.find((entry) => entry.userId === userId)
  if (!extension) return false
  const start = toMillis(extension.quizStart)
  const end = toMillis(extension.quizEnd)
  if (start === null || end === null) return false
  const now = Date.now()
  return now > start && now < end
}

function isQuizActiveForUser(session: SessionType, userId: string): boolean {
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

function currentAttemptNumber(question: Question | null): number {
  if (!question) return 1
  const attempts = question.sessionOptions?.attempts || []
  if (attempts.length < 1) return 1
  const latest = attempts[attempts.length - 1]
  return Number(latest.number || attempts.length || 1)
}

function optionValue(option: { answer?: string; plainText?: string; content?: string }, index: number): string {
  return option.answer || option.plainText || option.content || String.fromCharCode(65 + index)
}

function normalizeAnswerInput(question: Question, answer: string | string[]): string | string[] {
  if (question.type === QUESTION_TYPE.MS) {
    return Array.isArray(answer) ? [...answer].sort() : [String(answer)]
  }
  if (Array.isArray(answer)) {
    return answer[0] || ''
  }
  return answer
}

function latestResponseForAttempt(
  responses: QuestionResponse[],
  attempt: number
): QuestionResponse | null {
  const candidates = responses
    .filter((response) => Number(response.attempt) === attempt)
    .sort((left, right) => {
      const leftTime = toMillis(left.updatedAt || left.createdAt) || 0
      const rightTime = toMillis(right.updatedAt || right.createdAt) || 0
      return leftTime - rightTime
    })
  return candidates.length > 0 ? candidates[candidates.length - 1] : null
}

export default function Session() {
  const { courseId, sessionId } = useParams<{ courseId: string; sessionId: string }>()
  const { user } = useAuth()
  const { socket } = useRealtimeContext()

  const [session, setSession] = useState<SessionType | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [quizResponses, setQuizResponses] = useState<QuestionResponse[]>([])
  const [questionsToTryAgain, setQuestionsToTryAgain] = useState<Record<string, boolean>>({})
  const [submittingQuestionId, setSubmittingQuestionId] = useState<string | null>(null)
  const [submittingQuiz, setSubmittingQuiz] = useState(false)
  const {
    data: questions,
    loading: questionsLoading,
    error: questionsError,
  } = useRealtimeCollection<Question>({
    fetchPath: `/questions?sessionId=${sessionId || ''}`,
    subscribeEvent: 'subscribe:questions',
    subscribePayload: { sessionId: sessionId || '' },
    changeEvent: 'questions:change',
    enabled: Boolean(sessionId),
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

  const currentQuestion = useMemo(() => {
    if (orderedQuestions.length < 1) return null
    if (session?.currentQuestion) {
      const matched = orderedQuestions.find((question) => question._id === session.currentQuestion)
      if (matched) return matched
    }
    return orderedQuestions[0]
  }, [orderedQuestions, session?.currentQuestion])

  const isInstructorView = Boolean(
    user?.profile.roles.includes('professor') || user?.profile.roles.includes('admin')
  )
  const userId = user?._id || ''
  const quizSubmitted = Boolean(userId && session?.submittedQuiz?.includes(userId))
  const quizActive = Boolean(session && userId && isQuizActiveForUser(session, userId))

  const currentQuestionAttempt = currentAttemptNumber(currentQuestion)

  const {
    data: currentQuestionResponses,
    loading: responsesLoading,
    error: responsesError,
    refetch: refetchResponses,
  } = useRealtimeCollection<QuestionResponse>({
    fetchPath: `/responses?questionId=${currentQuestion?._id || ''}`,
    subscribeEvent: 'subscribe:responses',
    subscribePayload: { questionId: currentQuestion?._id || '' },
    changeEvent: 'responses:change',
    enabled: Boolean(currentQuestion?._id && !session?.quiz),
  })

  const loadSession = useCallback(async () => {
    if (!sessionId) return
    setSessionLoading(true)
    setSessionError(null)
    try {
      const loaded = await apiClient.get<SessionType>(`/sessions/${sessionId}`)
      setSession(loaded)
    } catch (err) {
      setSessionError((err as Error).message)
    } finally {
      setSessionLoading(false)
    }
  }, [sessionId])

  const loadQuizResponses = useCallback(async () => {
    if (!sessionId || !session?.quiz || !userId) {
      setQuizResponses([])
      return
    }

    try {
      const rows = await apiClient.get<QuestionResponse[]>(`/responses/session/${sessionId}/me`)
      setQuizResponses(rows)
    } catch {
      setQuizResponses([])
    }
  }, [session?.quiz, sessionId, userId])

  useEffect(() => {
    void loadSession()
  }, [loadSession])

  useEffect(() => {
    if (!sessionId || !socket) return

    socket.emit('subscribe:session', { sessionId })

    const handler = (event: {
      operationType?: string
      fullDocument?: SessionType
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
    if (!sessionId || !session || !userId || isInstructorView) return
    apiClient.post(`/sessions/${sessionId}/join`, {}).catch(() => {})
  }, [session?._id, sessionId, userId, isInstructorView])

  useEffect(() => {
    if (!session?.quiz) {
      setQuizResponses([])
      return
    }
    void loadQuizResponses()
  }, [session?.quiz, loadQuizResponses])

  const ownCurrentResponse = useMemo(() => {
    if (!currentQuestion || !userId) return null
    const ownResponses = currentQuestionResponses.filter(
      (response) => response.studentUserId === userId
    )
    return latestResponseForAttempt(ownResponses, currentQuestionAttempt)
  }, [currentQuestion, currentQuestionAttempt, currentQuestionResponses, userId])

  const responseStats = useMemo(() => {
    if (!currentQuestion || !(currentQuestion.options || []).length) return [] as Array<{ answer: string; pct: number }>
    const attemptResponses = currentQuestionResponses.filter(
      (response) => Number(response.attempt) === currentQuestionAttempt
    )
    return (currentQuestion.options || []).map((option, index) => {
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
  }, [currentQuestion, currentQuestionAttempt, currentQuestionResponses])

  const shortAnswers = useMemo(() => {
    if (!currentQuestion || currentQuestion.type !== QUESTION_TYPE.SA) return [] as string[]
    return currentQuestionResponses
      .filter((response) => Number(response.attempt) === currentQuestionAttempt)
      .map((response) => {
        if (response.answerWysiwyg) return response.answerWysiwyg
        if (Array.isArray(response.answer)) return response.answer.join(', ')
        return String(response.answer)
      })
  }, [currentQuestion, currentQuestionAttempt, currentQuestionResponses])

  const numericalAnswers = useMemo(() => {
    if (!currentQuestion || currentQuestion.type !== QUESTION_TYPE.NU) return [] as number[]
    return currentQuestionResponses
      .filter((response) => Number(response.attempt) === currentQuestionAttempt)
      .map((response) => {
        const raw = Array.isArray(response.answer) ? response.answer[0] : response.answer
        return Number(raw)
      })
      .filter((value) => Number.isFinite(value))
  }, [currentQuestion, currentQuestionAttempt, currentQuestionResponses])

  const responsesByQuestion = useMemo(() => {
    const map = new Map<string, QuestionResponse[]>()
    quizResponses.forEach((response) => {
      const list = map.get(response.questionId) || []
      list.push(response)
      map.set(response.questionId, list)
    })
    return map
  }, [quizResponses])

  const submitResponse = async (
    question: Question,
    answer: string | string[],
    answerWysiwyg: string | undefined,
    attempt: number
  ) => {
    if (!question._id) return

    setSubmittingQuestionId(question._id)
    try {
      await apiClient.post('/responses', {
        attempt,
        questionId: question._id,
        answer: normalizeAnswerInput(question, answer),
        answerWysiwyg,
      })
      if (session?.quiz) {
        await loadQuizResponses()
      } else {
        refetchResponses()
      }
    } finally {
      setSubmittingQuestionId(null)
    }
  }

  const submitQuiz = async () => {
    if (!sessionId) return

    setSubmittingQuiz(true)
    setSessionError(null)
    try {
      await apiClient.post(`/sessions/${sessionId}/submit`, {})
      await loadSession()
      await loadQuizResponses()
    } catch (err) {
      setSessionError((err as Error).message)
    } finally {
      setSubmittingQuiz(false)
    }
  }

  const error = sessionError || questionsError || responsesError
  if (sessionLoading || questionsLoading || (!session?.quiz && responsesLoading)) {
    return <div className="page">Loading...</div>
  }
  if (error && !session) return <div className="page">Error: {error}</div>
  if (!session) return <div className="page">Session not found</div>

  if (!session.quiz) {
    if (session.status === 'visible') {
      return (
        <div className="page">
          <div className="ql-header-bar"><h1>{session.name}</h1></div>
          <div className="container">
            <p>This session has not started yet. Keep this page open until your instructor starts it.</p>
            <Link className="btn btn-secondary" to={`/course/${courseId}`}>Back to Course</Link>
          </div>
        </div>
      )
    }

    if (session.status === 'done') {
      return (
        <div className="page">
          <div className="ql-header-bar"><h1>{session.name}</h1></div>
          <div className="container">
            <p>This session has finished.</p>
            <Link className="btn btn-secondary" to={`/course/${courseId}`}>Back to Course</Link>
          </div>
        </div>
      )
    }

    if (!currentQuestion) {
      return (
        <div className="page">
          <div className="ql-header-bar"><h1>{session.name}</h1></div>
          <div className="container"><p>Waiting for a question...</p></div>
        </div>
      )
    }

    const attemptResponses = currentQuestionResponses.filter(
      (response) => Number(response.attempt) === currentQuestionAttempt
    )
    const answeredCount = attemptResponses.length
    const joinedCount = (session.joined || []).length

    return (
      <div className="page">
        <div className="ql-header-bar">
          <h1>{session.name}</h1>
          <span className={`ql-session-status ql-${session.status}`}>{session.status}</span>
        </div>

        <div className="container">
          <Link className="btn btn-secondary" to={`/course/${courseId}`} style={{ marginBottom: '1rem', display: 'inline-block' }}>
            Back to Course
          </Link>

          {error && <div className="ql-error" style={{ marginBottom: '0.6rem' }}>{error}</div>}

          <div style={{ marginBottom: '0.6rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span>Attempt: <strong>{currentQuestionAttempt}</strong></span>
            <span>Responses: <strong>{answeredCount}</strong>{joinedCount > 0 && <> / {joinedCount} joined</>}</span>
          </div>

          <QuestionDisplay
            question={currentQuestion}
            response={ownCurrentResponse}
            readonly={isInstructorView || session.status !== 'running'}
            prof={isInstructorView}
            forReview={isInstructorView}
            responseStats={responseStats}
            showStatsOverride={Boolean(currentQuestion.sessionOptions?.stats)}
            onSubmit={
              isInstructorView || session.status !== 'running'
                ? undefined
                : async (answer, answerWysiwyg) => {
                    await submitResponse(currentQuestion, answer, answerWysiwyg, currentQuestionAttempt)
                  }
            }
          />

          {Boolean(currentQuestion.sessionOptions?.stats) && currentQuestion.type === QUESTION_TYPE.SA && (
            <ShortAnswerList answers={shortAnswers} />
          )}
          {Boolean(currentQuestion.sessionOptions?.stats) && currentQuestion.type === QUESTION_TYPE.NU && (
            <Histogram values={numericalAnswers} />
          )}
        </div>
      </div>
    )
  }

  if (!isInstructorView && !quizActive && !quizSubmitted) {
    return (
      <div className="page">
        <div className="ql-header-bar"><h1>{session.name}</h1></div>
        <div className="container">
          <p>This quiz is currently closed.</p>
          <Link className="btn btn-secondary" to={`/course/${courseId}`}>Back to Course</Link>
        </div>
      </div>
    )
  }

  const answeredCount = orderedQuestions.filter((question) => {
    const questionId = question._id || ''
    return (responsesByQuestion.get(questionId) || []).length > 0
  }).length
  const answeredFirstAttemptCount = orderedQuestions.filter((question) => {
    const questionId = question._id || ''
    return (responsesByQuestion.get(questionId) || []).some((response) => Number(response.attempt) === 1)
  }).length
  const canSubmitQuiz =
    !isInstructorView &&
    !quizSubmitted &&
    quizActive &&
    answeredFirstAttemptCount === orderedQuestions.length &&
    orderedQuestions.length > 0

  return (
    <div className="page">
      <div className="ql-header-bar">
        <h1>{session.name}</h1>
        <span className={`ql-session-status ql-${session.status}`}>{session.status}</span>
      </div>

      <div className="container">
        <Link className="btn btn-secondary" to={`/course/${courseId}`} style={{ marginBottom: '1rem', display: 'inline-block' }}>
          Back to Course
        </Link>

        {error && <div className="ql-error" style={{ marginBottom: '0.6rem' }}>{error}</div>}

        {quizSubmitted && (
          <div className="alert alert-success" style={{ marginBottom: '0.6rem' }}>
            Quiz submitted. Your responses are locked.
          </div>
        )}

        {orderedQuestions.length === 0 ? (
          <p>No questions in this quiz yet.</p>
        ) : (
          <>
            {orderedQuestions.map((question, index) => {
              const questionId = question._id || ''
              const questionResponses = responsesByQuestion.get(questionId) || []
              const latestResponse = questionResponses
                .slice()
                .sort((left, right) => Number(left.attempt) - Number(right.attempt))
                .slice(-1)[0] || null

              const maxAttempts = Number(question.sessionOptions?.maxAttempts ?? 1)
              const latestAttempt = latestResponse ? Number(latestResponse.attempt) : 0
              const canTryAgain =
                Boolean(latestResponse) &&
                latestResponse?.correct === false &&
                latestAttempt > 0 &&
                latestAttempt < maxAttempts

              const questionTryAgain = Boolean(questionsToTryAgain[questionId])
              const displayAttempt =
                canTryAgain && questionTryAgain ? latestAttempt + 1 : latestAttempt > 0 ? latestAttempt : 1
              const displayResponse = latestResponseForAttempt(questionResponses, displayAttempt)
              const points = Number(question.sessionOptions?.points ?? 1)

              return (
                <div key={questionId || index} className="ql-card" style={{ marginBottom: '0.75rem' }}>
                  <div className="ql-card-content">
                    <h3>
                      Question {index + 1} of {orderedQuestions.length}
                      {' '}
                      <small>
                        (worth {points} point{points === 1 ? '' : 's'}, attempt {displayAttempt} of {maxAttempts})
                      </small>
                    </h3>

                    <QuestionDisplay
                      question={question}
                      response={displayResponse}
                      readonly={isInstructorView || quizSubmitted || !quizActive || submittingQuestionId === questionId}
                      prof={isInstructorView}
                      forReview={isInstructorView}
                      showCorrect={isInstructorView}
                      onSubmit={
                        isInstructorView || quizSubmitted || !quizActive
                          ? undefined
                          : async (answer, answerWysiwyg) => {
                              await submitResponse(question, answer, answerWysiwyg, displayAttempt)
                              setQuestionsToTryAgain((previous) => ({ ...previous, [questionId]: false }))
                            }
                      }
                    />

                    {!isInstructorView && canTryAgain && !questionTryAgain && !quizSubmitted && quizActive && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setQuestionsToTryAgain((previous) => ({ ...previous, [questionId]: true }))}
                        >
                          Try Again
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {!isInstructorView && (
              <div className={`ql-card ${canSubmitQuiz ? '' : 'ql-card-muted'}`}>
                <div className="ql-card-content">
                  <p>
                    Answered {answeredCount} out of {orderedQuestions.length} questions.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!canSubmitQuiz || submittingQuiz}
                    onClick={() => void submitQuiz()}
                  >
                    {submittingQuiz ? 'Submitting...' : quizSubmitted ? 'Quiz Submitted' : 'Submit Quiz'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

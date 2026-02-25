import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { Session as SessionType, Question, Response as ResponseType } from '@qlicker/shared'
import { apiClient } from '../api/client'
import { useRealtimeCollection } from '../hooks/useRealtimeCollection'
import { QuestionDisplay } from '../components/QuestionDisplay'
import { QuestionSidebar } from '../components/QuestionSidebar'
import { useRealtimeContext } from '../contexts/RealtimeContext'
import { useAuth } from '../hooks/useAuth'

export default function Session() {
  const { sessionId } = useParams<{ courseId: string; sessionId: string }>()
  const { socket } = useRealtimeContext()
  const { user } = useAuth()

  const [session, setSession] = useState<SessionType | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [currentResponse, setCurrentResponse] = useState<ResponseType | null>(null)
  const [responseLoading, setResponseLoading] = useState(false)
  const [submittingQuiz, setSubmittingQuiz] = useState(false)
  const [quizSubmitMessage, setQuizSubmitMessage] = useState<string | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionError, setSessionError] = useState<string | null>(null)
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

  useEffect(() => {
    if (!sessionId) return
    setSessionLoading(true)
    apiClient
      .get<SessionType>(`/sessions/${sessionId}`)
      .then((s) => setSession(s))
      .catch((err) => setSessionError((err as Error).message))
      .finally(() => setSessionLoading(false))
  }, [sessionId])

  useEffect(() => {
    if (!sessionId || !session) return
    apiClient.post(`/sessions/${sessionId}/join`, {}).catch(() => {})
  }, [sessionId, session?._id])

  useEffect(() => {
    if (!socket || !sessionId) return
    socket.emit('subscribe:session', { sessionId })
    const handler = (event: {
      operationType?: string
      fullDocument?: SessionType
      documentKey?: { _id?: string }
    }) => {
      if (event.operationType === 'delete' && event.documentKey?._id === sessionId) {
        setSession(null)
        return
      }
      if (event.fullDocument?._id === sessionId) {
        setSession(event.fullDocument)
      }
    }
    socket.on('session:change', handler)
    return () => {
      socket.off('session:change', handler)
    }
  }, [socket, sessionId])

  useEffect(() => {
    if (!session?.currentQuestion || questions.length < 1) return
    const idx = questions.findIndex((q) => q._id === session.currentQuestion)
    if (idx >= 0) setCurrentIndex(idx)
  }, [session?.currentQuestion, questions])

  const orderedQuestions = session
    ? session.questions?.length
      ? [...questions].sort(
          (a, b) =>
            (session.questions?.indexOf(a._id || '') ?? Number.MAX_SAFE_INTEGER) -
            (session.questions?.indexOf(b._id || '') ?? Number.MAX_SAFE_INTEGER)
        )
      : questions
    : []
  const currentQuestion = orderedQuestions[currentIndex] || null
  const canAnswer = Boolean(user?.profile.roles.includes('student'))
  const canNavigateAllQuestions = Boolean(session?.quiz || !canAnswer)
  const sidebarQuestions =
    canNavigateAllQuestions ? orderedQuestions : currentQuestion ? [currentQuestion] : []

  useEffect(() => {
    if (!currentQuestion?._id || !user?._id) {
      setCurrentResponse(null)
      return
    }
    setResponseLoading(true)
    apiClient
      .get<ResponseType[]>(`/responses?questionId=${currentQuestion._id}`)
      .then((items) => {
        const own = items.find((item) => item.studentUserId === user._id) || null
        setCurrentResponse(own)
      })
      .catch(() => setCurrentResponse(null))
      .finally(() => setResponseLoading(false))
  }, [currentQuestion?._id, user?._id])

  const error = sessionError || questionsError
  if (sessionLoading || questionsLoading) return <div className="page">Loading...</div>
  if (error) return <div className="page">Error: {error}</div>
  if (!session) return <div className="page">Session not found</div>

  const currentAttempt = (question: Question): number => {
    const attempts = question.sessionOptions?.attempts || []
    if (attempts.length < 1) return 1
    const latest = attempts[attempts.length - 1]
    return Number(latest?.number || 1)
  }

  const handleSubmitResponse = async (answer: string | string[], answerWysiwyg?: string) => {
    if (!currentQuestion?._id) return
    const payload: {
      attempt: number
      questionId: string
      answer: string | string[]
      answerWysiwyg?: string
    } = {
      attempt: currentAttempt(currentQuestion),
      questionId: currentQuestion._id,
      answer,
    }
    if (answerWysiwyg && answerWysiwyg.trim()) payload.answerWysiwyg = answerWysiwyg
    const saved = await apiClient.post<ResponseType>('/responses', payload)
    setCurrentResponse(saved)
  }

  const handleSubmitQuiz = async () => {
    if (!sessionId) return
    setSubmittingQuiz(true)
    setQuizSubmitMessage(null)
    try {
      await apiClient.post(`/sessions/${sessionId}/submit`, {})
      setQuizSubmitMessage('Quiz submitted.')
    } catch (err) {
      setQuizSubmitMessage((err as Error).message)
    } finally {
      setSubmittingQuiz(false)
    }
  }

  return (
    <div className="page">
      <div className="ql-header-bar">
        <h1>{session.name}</h1>
        <span className={`ql-session-status ql-${session.status}`}>
          {session.status}
        </span>
      </div>

      <div className="container">
        {orderedQuestions.length === 0 ? (
          <p>No questions in this session.</p>
        ) : (
          <>
            <div className="row" style={{ marginBottom: '1rem' }}>
              {canNavigateAllQuestions && (
                <div className="col-md-3">
                  <QuestionSidebar
                    questions={sidebarQuestions}
                    currentIndex={currentIndex}
                    onSelect={setCurrentIndex}
                  />
                </div>
              )}

              <div className={canNavigateAllQuestions ? 'col-md-9' : 'col-md-12'}>
                {currentQuestion && (
                  <div className="ql-card">
                    <div className="ql-card-content">
                      <h3>Question {currentIndex + 1} of {orderedQuestions.length}</h3>
                      {responseLoading && <div>Loading response...</div>}
                      <QuestionDisplay
                        question={currentQuestion}
                        response={currentResponse}
                        readonly={!canAnswer}
                        onSubmit={canAnswer ? handleSubmitResponse : undefined}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {canNavigateAllQuestions && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-secondary"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((i) => i - 1)}
                >
                  Previous
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={currentIndex === orderedQuestions.length - 1}
                  onClick={() => setCurrentIndex((i) => i + 1)}
                >
                  Next
                </button>
              </div>
            )}

            {canAnswer && session.quiz && (
              <div style={{ marginTop: '1rem' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={submittingQuiz}
                  onClick={handleSubmitQuiz}
                >
                  {submittingQuiz ? 'Submitting...' : 'Submit Quiz'}
                </button>
                {quizSubmitMessage && <div style={{ marginTop: '0.5rem' }}>{quizSubmitMessage}</div>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

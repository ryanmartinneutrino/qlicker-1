import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { Session as SessionType, Question, Response } from '@qlicker/shared'
import { apiClient } from '../api/client'
import { useRealtimeCollection } from '../hooks/useRealtimeCollection'
import { QuestionDisplay } from '../components/QuestionDisplay'
import { QuestionSidebar } from '../components/QuestionSidebar'

export default function ReplaySession() {
  const { courseId, sessionId } = useParams<{ courseId: string; sessionId: string }>()

  const [session, setSession] = useState<SessionType | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [showStats, setShowStats] = useState(false)
  const [responses, setResponses] = useState<Response[]>([])
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
    refetchOnChange: true,
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
    const questionId = questions[currentIndex]?._id
    if (!questionId) {
      setResponses([])
      return
    }
    apiClient
      .get<Response[]>(`/responses?questionId=${questionId}`)
      .then((rows) => setResponses(rows))
      .catch(() => setResponses([]))
  }, [currentIndex, questions])

  const error = sessionError || questionsError
  if (sessionLoading || questionsLoading) return <div className="page">Loading...</div>
  if (error) return <div className="page">Error: {error}</div>
  if (!session) return <div className="page">Session not found</div>

  const orderedQuestions = session.questions?.length
    ? [...questions].sort(
        (a, b) =>
          (session.questions?.indexOf(a._id || '') ?? Number.MAX_SAFE_INTEGER) -
          (session.questions?.indexOf(b._id || '') ?? Number.MAX_SAFE_INTEGER)
      )
    : questions
  const currentQuestion = orderedQuestions[currentIndex] || null
  const currentAttempt = currentQuestion?.sessionOptions?.attempts?.slice(-1)[0]?.number || 1
  const attemptResponses = responses.filter((row) => Number(row.attempt) === currentAttempt)
  const responseStats =
    currentQuestion && currentQuestion.options?.length
      ? currentQuestion.options.map((opt, index) => {
          const answer = opt.answer || opt.plainText || opt.content || String.fromCharCode(65 + index)
          const selected = attemptResponses.filter((row) => {
            const normalized = String(answer).toLowerCase()
            if (Array.isArray(row.answer)) {
              return row.answer.map((value) => String(value).toLowerCase()).includes(normalized)
            }
            return String(row.answer).toLowerCase() === normalized
          }).length
          const pct = attemptResponses.length > 0 ? (selected / attemptResponses.length) * 100 : 0
          return { answer, pct }
        })
      : []

  return (
    <div className="page">
      <div className="ql-header-bar">
        <h1>Replay: {session.name}</h1>
      </div>

      <div className="container">
        <Link className="btn btn-secondary" to={`/course/${courseId}`} style={{ marginBottom: '1rem', display: 'inline-block' }}>
          Back to Course
        </Link>

        {orderedQuestions.length === 0 ? (
          <p>No questions in this session to replay.</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowStats((prev) => !prev)}>
                {showStats ? 'Hide Stats' : 'Show Stats'}
              </button>
              <div style={{ alignSelf: 'center' }}>Responses in attempt {currentAttempt}: {attemptResponses.length}</div>
            </div>
            <div className="row">
              <div className="col-md-3">
                <QuestionSidebar
                  questions={orderedQuestions}
                  currentIndex={currentIndex}
                  onSelect={(nextIndex) => {
                    setCurrentIndex(nextIndex)
                    setShowStats(false)
                  }}
                />
              </div>
              <div className="col-md-9">
                <div className="ql-card">
                  <div className="ql-card-content">
                    <h3>
                      Question {currentIndex + 1} of {orderedQuestions.length}
                    </h3>
                    {currentQuestion && (
                      <QuestionDisplay
                        question={currentQuestion}
                        readonly
                        showCorrect
                        forReview
                        responseStats={responseStats}
                        showStatsOverride={showStats}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                className="btn btn-secondary"
                disabled={currentIndex === 0}
                onClick={() => {
                  setCurrentIndex((i) => i - 1)
                  setShowStats(false)
                }}
              >
                Previous
              </button>
              <button
                className="btn btn-secondary"
                disabled={currentIndex === orderedQuestions.length - 1}
                onClick={() => {
                  setCurrentIndex((i) => i + 1)
                  setShowStats(false)
                }}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { Session as SessionType, Question } from '@qlicker/shared'
import { apiClient } from '../api/client'
import { useRealtimeCollection } from '../hooks/useRealtimeCollection'
import { QuestionDisplay } from '../components/QuestionDisplay'
import { QuestionSidebar } from '../components/QuestionSidebar'

export default function Session() {
  const { sessionId } = useParams<{ courseId: string; sessionId: string }>()

  const [session, setSession] = useState<SessionType | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
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
    if (!session?.currentQuestion || questions.length < 1) return
    const idx = questions.findIndex((q) => q._id === session.currentQuestion)
    if (idx >= 0) setCurrentIndex(idx)
  }, [session?.currentQuestion, questions])

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
              <div className="col-md-3">
                <QuestionSidebar
                  questions={orderedQuestions}
                  currentIndex={currentIndex}
                  onSelect={setCurrentIndex}
                />
              </div>

              <div className="col-md-9">
                {currentQuestion && (
                  <div className="ql-card">
                    <div className="ql-card-content">
                      <h3>Question {currentIndex + 1} of {orderedQuestions.length}</h3>
                      <QuestionDisplay question={currentQuestion} readonly />
                    </div>
                  </div>
                )}
              </div>
            </div>

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
          </>
        )}
      </div>
    </div>
  )
}

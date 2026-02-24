import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { Session, Question } from '@qlicker/shared'
import { apiClient } from '../api/client'
import { useRealtimeCollection } from '../hooks/useRealtimeCollection'
import { QuestionDisplay } from '../components/QuestionDisplay'
import { QuestionSidebar } from '../components/QuestionSidebar'
import { SessionDetails } from '../components/SessionDetails'

export default function RunSession() {
  const { courseId, sessionId } = useParams<{ courseId: string; sessionId: string }>()
  const navigate = useNavigate()

  const [session, setSession] = useState<Session | null>(null)
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
      .get<Session>(`/sessions/${sessionId}`)
      .then((s) => setSession(s))
      .catch((err) => setSessionError((err as Error).message))
      .finally(() => setSessionLoading(false))
  }, [sessionId])

  useEffect(() => {
    if (!session?.currentQuestion || questions.length < 1) return
    const idx = questions.findIndex((q) => q._id === session.currentQuestion)
    if (idx >= 0) setCurrentIndex(idx)
  }, [session?.currentQuestion, questions])

  const updateStatus = async (status: string) => {
    if (!sessionId) return
    try {
      const updated = await apiClient.put<Session>(`/sessions/${sessionId}/status`, { status })
      setSession(updated)
    } catch (err) {
      setSessionError((err as Error).message)
    }
  }

  const setCurrentQuestion = async (questionId: string | undefined) => {
    if (!sessionId || !questionId) return
    try {
      const updated = await apiClient.put<Session>(`/sessions/${sessionId}/current`, { questionId })
      setSession(updated)
    } catch (err) {
      setSessionError((err as Error).message)
    }
  }

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
        <h1>Run: {session.name}</h1>
        <span className={`ql-session-status ql-${session.status}`}>
          {session.status}
        </span>
      </div>

      <div className="container">
        <div className="row" style={{ marginBottom: '1rem' }}>
          <div className="col-md-12">
            <SessionDetails
              session={session}
              onUpdateStatus={updateStatus}
              onBack={() => navigate(`/course/${courseId}`)}
            />
          </div>
        </div>

        {orderedQuestions.length === 0 ? (
          <p>No questions in this session.</p>
        ) : (
          <>
            <div className="row">
              <div className="col-md-3">
                <QuestionSidebar
                  questions={orderedQuestions}
                  currentIndex={currentIndex}
                  onSelect={(nextIndex) => {
                    const question = orderedQuestions[nextIndex]
                    if (question?._id) {
                      setCurrentQuestion(question._id)
                      setCurrentIndex(nextIndex)
                    }
                  }}
                />
              </div>
              <div className="col-md-9">
                <div className="ql-card">
                  <div className="ql-card-content">
                    <h3>
                      Question {currentIndex + 1} of {orderedQuestions.length}
                    </h3>
                    {currentQuestion && <QuestionDisplay question={currentQuestion} readonly />}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                className="btn btn-secondary"
                disabled={currentIndex === 0}
                onClick={() => {
                  const previous = orderedQuestions[currentIndex - 1]
                  if (previous?._id) {
                    setCurrentQuestion(previous._id)
                    setCurrentIndex((i) => i - 1)
                  }
                }}
              >
                Previous
              </button>
              <button
                className="btn btn-secondary"
                disabled={currentIndex === orderedQuestions.length - 1}
                onClick={() => {
                  const next = orderedQuestions[currentIndex + 1]
                  if (next?._id) {
                    setCurrentQuestion(next._id)
                    setCurrentIndex((i) => i + 1)
                  }
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

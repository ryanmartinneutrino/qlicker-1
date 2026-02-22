import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { Session, Question } from '@qlicker/shared'
import { apiClient } from '../api/client'

export default function RunSession() {
  const { courseId, sessionId } = useParams<{ courseId: string; sessionId: string }>()
  const navigate = useNavigate()

  const [session, setSession] = useState<Session | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)
    Promise.all([
      apiClient.get<Session>(`/sessions/${sessionId}`),
      apiClient.get<Question[]>(`/questions?sessionId=${sessionId}`),
    ])
      .then(([s, q]) => {
        setSession(s)
        setQuestions(q)
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [sessionId])

  const updateStatus = async (status: string) => {
    if (!sessionId) return
    try {
      const updated = await apiClient.put<Session>(`/sessions/${sessionId}/status`, { status })
      setSession(updated)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (loading) return <div className="page">Loading...</div>
  if (error) return <div className="page">Error: {error}</div>
  if (!session) return <div className="page">Session not found</div>

  const currentQuestion = questions[currentIndex] || null

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
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              {session.status === 'hidden' && (
                <button className="btn btn-primary" onClick={() => updateStatus('visible')}>
                  Make Visible
                </button>
              )}
              {(session.status === 'visible' || session.status === 'hidden') && (
                <button className="btn btn-primary" onClick={() => updateStatus('running')}>
                  Start Session
                </button>
              )}
              {session.status === 'running' && (
                <button className="btn btn-secondary" onClick={() => updateStatus('done')}>
                  Stop Session
                </button>
              )}
              <button
                className="btn btn-secondary"
                onClick={() => navigate(`/course/${courseId}`)}
              >
                Back to Course
              </button>
            </div>
          </div>
        </div>

        {questions.length === 0 ? (
          <p>No questions in this session.</p>
        ) : (
          <>
            <div className="ql-card">
              <div className="ql-card-content">
                <h3>
                  Question {currentIndex + 1} of {questions.length}
                </h3>
                {currentQuestion && (
                  <>
                    <div
                      className="ql-question-content"
                      dangerouslySetInnerHTML={{
                        __html: currentQuestion.content || currentQuestion.plainText || '',
                      }}
                    />
                    {currentQuestion.options && currentQuestion.options.length > 0 && (
                      <div style={{ marginTop: '1rem' }}>
                        {currentQuestion.options.map((opt, oi) => (
                          <div
                            key={oi}
                            style={{
                              padding: '0.75rem',
                              margin: '0.5rem 0',
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                            }}
                          >
                            <strong>{String.fromCharCode(65 + oi)}.</strong>{' '}
                            {opt.plainText || opt.content || opt.answer || `Option ${oi + 1}`}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                className="btn btn-secondary"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((i) => i - 1)}
              >
                Previous
              </button>
              <button
                className="btn btn-secondary"
                disabled={currentIndex === questions.length - 1}
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

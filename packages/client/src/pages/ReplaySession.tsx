import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { Session as SessionType, Question } from '@qlicker/shared'
import { apiClient } from '../api/client'

export default function ReplaySession() {
  const { courseId, sessionId } = useParams<{ courseId: string; sessionId: string }>()

  const [session, setSession] = useState<SessionType | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)
    Promise.all([
      apiClient.get<SessionType>(`/sessions/${sessionId}`),
      apiClient.get<Question[]>(`/questions?sessionId=${sessionId}`),
    ])
      .then(([s, q]) => {
        setSession(s)
        setQuestions(q)
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [sessionId])

  if (loading) return <div className="page">Loading...</div>
  if (error) return <div className="page">Error: {error}</div>
  if (!session) return <div className="page">Session not found</div>

  const currentQuestion = questions[currentIndex] || null

  return (
    <div className="page">
      <div className="ql-header-bar">
        <h1>Replay: {session.name}</h1>
      </div>

      <div className="container">
        <Link className="btn btn-secondary" to={`/course/${courseId}`} style={{ marginBottom: '1rem', display: 'inline-block' }}>
          Back to Course
        </Link>

        {questions.length === 0 ? (
          <p>No questions in this session to replay.</p>
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
                              backgroundColor: opt.correct ? '#e8f5e9' : 'transparent',
                            }}
                          >
                            <strong>{String.fromCharCode(65 + oi)}.</strong>{' '}
                            {opt.plainText || opt.content || opt.answer || `Option ${oi + 1}`}
                            {opt.correct && <span style={{ color: '#5ACE5F', marginLeft: '0.5rem' }}>✓ Correct</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {currentQuestion.solution && (
                      <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
                        <strong>Solution:</strong>
                        <div dangerouslySetInnerHTML={{ __html: currentQuestion.solution }} />
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

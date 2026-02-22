import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { Session as SessionType, Question } from '@qlicker/shared'
import { apiClient } from '../api/client'

export default function Session() {
  const { sessionId } = useParams<{ courseId: string; sessionId: string }>()

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
        <h1>{session.name}</h1>
        <span className={`ql-session-status ql-${session.status}`}>
          {session.status}
        </span>
      </div>

      <div className="container">
        {questions.length === 0 ? (
          <p>No questions in this session.</p>
        ) : (
          <>
            <div className="row" style={{ marginBottom: '1rem' }}>
              <div className="col-md-3">
                <h3>Questions</h3>
                <ul className="ql-question-nav" style={{ listStyle: 'none', padding: 0 }}>
                  {questions.map((q, i) => (
                    <li
                      key={q._id}
                      style={{
                        padding: '0.5rem',
                        cursor: 'pointer',
                        backgroundColor: i === currentIndex ? '#30B0E7' : 'transparent',
                        color: i === currentIndex ? '#fff' : 'inherit',
                        borderRadius: '4px',
                        marginBottom: '2px',
                      }}
                      onClick={() => setCurrentIndex(i)}
                    >
                      Q{i + 1}: {q.plainText ? q.plainText.substring(0, 40) : 'Question'}
                      {q.plainText && q.plainText.length > 40 ? '...' : ''}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="col-md-9">
                {currentQuestion && (
                  <div className="ql-card">
                    <div className="ql-card-content">
                      <h3>Question {currentIndex + 1} of {questions.length}</h3>
                      <div
                        className="ql-question-content"
                        dangerouslySetInnerHTML={{
                          __html: currentQuestion.content || currentQuestion.plainText || '',
                        }}
                      />
                      {currentQuestion.options && currentQuestion.options.length > 0 && (
                        <div className="ql-answer-options" style={{ marginTop: '1rem' }}>
                          {currentQuestion.options.map((opt, oi) => (
                            <div
                              key={oi}
                              className="ql-answer-option"
                              style={{
                                padding: '0.75rem',
                                margin: '0.5rem 0',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                cursor: 'pointer',
                              }}
                            >
                              <strong>{String.fromCharCode(65 + oi)}.</strong>{' '}
                              {opt.plainText || opt.content || opt.answer || `Option ${oi + 1}`}
                            </div>
                          ))}
                        </div>
                      )}
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

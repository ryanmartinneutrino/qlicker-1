import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { Session as SessionType, Question } from '@qlicker/shared'
import { apiClient } from '../api/client'
import { useRealtimeCollection } from '../hooks/useRealtimeCollection'
import { sanitizeHtml } from '../utils/sanitizeHtml'

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

  const error = sessionError || questionsError
  if (sessionLoading || questionsLoading) return <div className="page">Loading...</div>
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
                          __html: sanitizeHtml(currentQuestion.content || currentQuestion.plainText || ''),
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

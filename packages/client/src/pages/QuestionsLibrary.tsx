import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { Question } from '@qlicker/shared'
import { apiClient } from '../api/client'

const QUESTION_TYPES: Record<number, string> = {
  0: 'Multiple Choice',
  1: 'Multi-Select',
  2: 'True/False',
  3: 'Short Answer',
  4: 'Numerical',
}

export default function QuestionsLibrary() {
  const { courseId } = useParams<{ courseId: string }>()

  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!courseId) return
    setLoading(true)
    apiClient
      .get<Question[]>(`/questions?courseId=${courseId}`)
      .then(setQuestions)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [courseId])

  if (loading) return <div className="page">Loading...</div>
  if (error) return <div className="page">Error: {error}</div>

  return (
    <div className="page">
      <div className="ql-header-bar">
        <h1>Question Library</h1>
      </div>

      <div className="container">
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
          <Link className="btn btn-secondary" to={`/course/${courseId}`}>
            Back to Course
          </Link>
          <button className="btn btn-primary" onClick={() => { /* TODO: create question modal */ }}>
            Create Question
          </button>
        </div>

        {questions.length === 0 ? (
          <p>No questions in this course library.</p>
        ) : (
          <div>
            {questions.map((q, i) => (
              <div
                key={q._id}
                className="ql-list-item"
                style={{
                  padding: '0.75rem',
                  borderBottom: '1px solid #eee',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <strong>Q{i + 1}.</strong>{' '}
                  {q.plainText
                    ? q.plainText.substring(0, 80) + (q.plainText.length > 80 ? '...' : '')
                    : 'Untitled Question'}
                </div>
                <div>
                  <span
                    style={{
                      padding: '0.25rem 0.5rem',
                      backgroundColor: '#f0f0f0',
                      borderRadius: '4px',
                      fontSize: '0.85em',
                    }}
                  >
                    {QUESTION_TYPES[q.type] ?? `Type ${q.type}`}
                  </span>
                  {q.public && (
                    <span
                      style={{
                        marginLeft: '0.5rem',
                        padding: '0.25rem 0.5rem',
                        backgroundColor: '#30B0E7',
                        color: '#fff',
                        borderRadius: '4px',
                        fontSize: '0.85em',
                      }}
                    >
                      Public
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

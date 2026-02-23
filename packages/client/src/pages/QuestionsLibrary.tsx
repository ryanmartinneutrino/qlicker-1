import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { Question } from '@qlicker/shared'
import { apiClient } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { CreateQuestionModal } from '../components/modals/CreateQuestionModal'

const QUESTION_TYPES: Record<number, string> = {
  0: 'Multiple Choice',
  1: 'Multi-Select',
  2: 'True/False',
  3: 'Short Answer',
  4: 'Numerical',
}

export default function QuestionsLibrary() {
  const { courseId } = useParams<{ courseId: string }>()
  const { user } = useAuth()

  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creatingQuestion, setCreatingQuestion] = useState(false)

  useEffect(() => {
    if (!courseId) return
    setLoading(true)
    setError(null)
    apiClient
      .get<Question[]>(`/questions?courseId=${courseId}`)
      .then(setQuestions)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [courseId])

  const patchLocalQuestion = (questionId: string, partial: Partial<Question>) => {
    setQuestions((prev) => prev.map((q) => (q._id === questionId ? { ...q, ...partial } : q)))
  }

  const handleDelete = async (questionId: string) => {
    if (!window.confirm('Delete this question?')) return
    try {
      await apiClient.delete(`/questions/${questionId}`)
      setQuestions((prev) => prev.filter((q) => q._id !== questionId))
      if (editingId === questionId) setEditingId(null)
    } catch (err) {
      alert((err as Error).message)
    }
  }

  const handleSaveQuestion = async (question: Question) => {
    try {
      const updated = await apiClient.put<Question>(`/questions/${question._id}`, {
        plainText: question.plainText,
        type: question.type,
        public: question.public,
      })
      setQuestions((prev) => prev.map((q) => (q._id === updated._id ? { ...q, ...updated } : q)))
      setEditingId(null)
    } catch (err) {
      alert((err as Error).message)
    }
  }

  if (loading) return <div className="page">Loading...</div>
  if (error) return <div className="page">Error: {error}</div>

  return (
    <div className="page">
      <div className="ql-header-bar">
        <h1>Question Library</h1>
      </div>

      <div className="container">
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Link className="btn btn-secondary" to={`/course/${courseId}`}>
            Back to Course
          </Link>
          <button className="btn btn-primary" onClick={() => setCreatingQuestion(true)}>
            Create Question
          </button>
        </div>

        {creatingQuestion && user?._id && (
          <CreateQuestionModal
            courseId={courseId!}
            userId={user._id}
            done={() => setCreatingQuestion(false)}
            onCreated={(created) => {
              setQuestions((prev) => [created, ...prev])
              setEditingId(created._id || null)
            }}
          />
        )}

        {questions.length === 0 ? (
          <p>No questions in this course library.</p>
        ) : (
          <div>
            {questions.map((q, i) => {
              const isEditing = editingId === q._id
              return (
                <div
                  key={q._id}
                  className="ql-list-item"
                  style={{
                    padding: '0.75rem',
                    borderBottom: '1px solid #eee',
                  }}
                >
                  {isEditing ? (
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      <input
                        className="form-control"
                        value={q.plainText}
                        onChange={(e) => patchLocalQuestion(q._id || '', { plainText: e.target.value })}
                      />
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <select
                          className="form-control"
                          style={{ maxWidth: 220 }}
                          value={q.type}
                          onChange={(e) => patchLocalQuestion(q._id || '', { type: Number(e.target.value) })}
                        >
                          {Object.entries(QUESTION_TYPES).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                        <label>
                          <input
                            type="checkbox"
                            checked={Boolean(q.public)}
                            onChange={(e) => patchLocalQuestion(q._id || '', { public: e.target.checked })}
                          />
                          {' '}Public
                        </label>
                        <button className="btn btn-primary btn-sm" onClick={() => handleSaveQuestion(q)}>Save</button>
                        <button className="btn btn-default btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                      <div>
                        <strong>Q{i + 1}.</strong>{' '}
                        {q.plainText
                          ? q.plainText.substring(0, 120) + (q.plainText.length > 120 ? '...' : '')
                          : 'Untitled Question'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                        <button className="btn btn-default btn-sm" onClick={() => setEditingId(q._id || null)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(q._id || '')}>Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

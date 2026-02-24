import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { Question } from '@qlicker/shared'
import { QUESTION_TYPE, QUESTION_TYPE_LABELS } from '../constants/questionTypes'
import { apiClient } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { CreateQuestionModal } from '../components/modals/CreateQuestionModal'
import { useRealtimeCollection } from '../hooks/useRealtimeCollection'
import { QuestionEditItem } from '../components/QuestionEditItem'

const DEFAULT_OPTIONS = [{ plainText: 'Option A' }, { plainText: 'Option B' }]

export default function QuestionsLibrary() {
  const { courseId } = useParams<{ courseId: string }>()
  const { user } = useAuth()
  const { data, loading, error } = useRealtimeCollection<Question>({
    fetchPath: `/questions?courseId=${courseId || ''}`,
    subscribeEvent: 'subscribe:questions-course',
    subscribePayload: { courseId: courseId || '' },
    changeEvent: 'questions:change',
    enabled: Boolean(courseId),
  })

  const [questions, setQuestions] = useState<Question[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creatingQuestion, setCreatingQuestion] = useState(false)

  useEffect(() => {
    setQuestions(data)
  }, [data])

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
      const isChoiceType =
        question.type === QUESTION_TYPE.MC || question.type === QUESTION_TYPE.MS || question.type === QUESTION_TYPE.TF

      const payload: Partial<Question> = {
        plainText: question.plainText,
        content: question.content || question.plainText,
        type: question.type,
        public: question.public,
        solution: question.solution || '',
        solution_plainText: question.solution_plainText || question.solution || '',
        options: isChoiceType
          ? (question.options || DEFAULT_OPTIONS).map((option) => ({
              ...option,
              plainText: option.plainText || option.answer || '',
              answer: option.answer || option.plainText || '',
              content: option.content || option.plainText || option.answer || '',
            }))
          : [],
        correctNumerical: question.type === QUESTION_TYPE.NU ? Number(question.correctNumerical || 0) : 0,
        toleranceNumerical: question.type === QUESTION_TYPE.NU ? Number(question.toleranceNumerical || 0) : 0,
      }

      const updated = await apiClient.put<Question>(`/questions/${question._id}`, payload)
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
            {questions.map((question, index) => (
              <div
                key={question._id}
                className="ql-list-item"
                style={{
                  padding: '0.75rem',
                  borderBottom: '1px solid #eee',
                }}
              >
                <QuestionEditItem
                  question={{
                    ...question,
                    options: question.options || [],
                    type: question.type,
                  }}
                  index={index}
                  isEditing={editingId === question._id}
                  onStartEdit={() => setEditingId(question._id || null)}
                  onCancelEdit={() => setEditingId(null)}
                  onDelete={() => handleDelete(question._id || '')}
                  onSave={handleSaveQuestion}
                />
                {editingId !== question._id && (
                  <div style={{ marginTop: '0.35rem', fontSize: '0.85em', opacity: 0.8 }}>
                    {QUESTION_TYPE_LABELS[question.type] ?? `Type ${question.type}`}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

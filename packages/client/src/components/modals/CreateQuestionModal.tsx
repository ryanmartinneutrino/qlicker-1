import { useState } from 'react'
import { apiClient } from '../../api/client'
import type { Question, SessionOptions } from '@qlicker/shared'

const defaultSessionOptions: SessionOptions = {
  hidden: false,
  stats: false,
  correct: false,
  points: 1,
  maxAttempts: 1,
  attemptWeights: [1],
  attempts: [{ number: 1, closed: false }],
}

interface CreateQuestionModalProps {
  courseId: string
  userId: string
  onCreated: (question: Question) => void
  done: () => void
}

export function CreateQuestionModal({ courseId, userId, onCreated, done }: CreateQuestionModalProps) {
  const [plainText, setPlainText] = useState('')
  const [type, setType] = useState(3)
  const [isPublic, setIsPublic] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const created = await apiClient.post<Question>('/questions', {
        plainText: plainText || 'New Question',
        content: plainText || 'New Question',
        type,
        options: [],
        toleranceNumerical: 0,
        correctNumerical: 0,
        creator: userId,
        owner: userId,
        courseId,
        public: isPublic,
        solution: '',
        solution_plainText: '',
        approved: false,
        tags: [],
        sessionOptions: defaultSessionOptions,
      })
      onCreated(created)
      done()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="ql-modal-container" onClick={done}>
      <div className="ql-modal ql-modal-createquestion ql-card" onClick={(e) => e.stopPropagation()}>
        <div className="ql-modal-header ql-header-bar"><h2>Add a Question</h2></div>
        <form className="ql-card-content" onSubmit={handleSubmit}>
          <label>Question text</label>
          <input className="form-control" value={plainText} onChange={(e) => setPlainText(e.target.value)} />
          <br />

          <label>Type</label>
          <select className="form-control" value={type} onChange={(e) => setType(Number(e.target.value))}>
            <option value={0}>Multiple Choice</option>
            <option value={1}>Multi-Select</option>
            <option value={2}>True/False</option>
            <option value={3}>Short Answer</option>
            <option value={4}>Numerical</option>
          </select>
          <br />

          <label>
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /> Public question
          </label>

          {error && <div className="alert alert-danger" style={{ marginTop: '12px' }}>{error}</div>}

          <div className="ql-buttongroup">
            <button type="button" className="btn btn-default" onClick={done} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-default" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit Question'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

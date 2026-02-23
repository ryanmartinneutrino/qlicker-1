import { useState } from 'react'
import { apiClient } from '../../api/client'
import type { Session } from '@qlicker/shared'

interface CreateSessionModalProps {
  courseId: string
  onCreated: (session: Session) => void
  done: () => void
}

export function CreateSessionModal({ courseId, onCreated, done }: CreateSessionModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [quiz, setQuiz] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const created = await apiClient.post<Session>('/sessions', {
        courseId,
        name: name || (quiz ? 'New Quiz' : 'New Session'),
        description,
        quiz,
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
      <div className="ql-modal ql-card" onClick={(e) => e.stopPropagation()}>
        <div className="ql-modal-header ql-header-bar"><h3>Create Session</h3></div>
        <form className="ql-card-content" onSubmit={handleSubmit}>
          <label>Quiz (students answer all questions at once):</label>
          <input type="checkbox" checked={quiz} onChange={(e) => setQuiz(e.target.checked)} />
          <br /><br />

          <label>Name:</label>
          <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} placeholder="Week 2 Lecture 3" />
          <br />

          <label>Description:</label>
          <textarea className="form-control" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Quiz on topic 3" />

          {error && <div className="alert alert-danger" style={{ marginTop: '12px' }}>{error}</div>}

          <div className="ql-buttongroup">
            <button type="button" className="btn btn-default" onClick={done} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-default" disabled={submitting}>{submitting ? 'Creating...' : 'Submit'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

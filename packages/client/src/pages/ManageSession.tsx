import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { Session } from '@qlicker/shared'
import { apiClient } from '../api/client'

export default function ManageSession() {
  const { courseId, sessionId } = useParams<{ courseId: string; sessionId: string }>()
  const navigate = useNavigate()

  const [session, setSession] = useState<Session | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [quiz, setQuiz] = useState(false)
  const [quizStart, setQuizStart] = useState('')
  const [quizEnd, setQuizEnd] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)
    apiClient
      .get<Session>(`/sessions/${sessionId}`)
      .then((s) => {
        setSession(s)
        setName(s.name)
        setDescription(s.description || '')
        setQuiz(!!s.quiz)
        setQuizStart(s.quizStart ? new Date(s.quizStart).toISOString().slice(0, 16) : '')
        setQuizEnd(s.quizEnd ? new Date(s.quizEnd).toISOString().slice(0, 16) : '')
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [sessionId])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sessionId) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const body: Partial<Session> = {
        name,
        description,
        quiz,
        quizStart: quizStart ? new Date(quizStart) : undefined,
        quizEnd: quizEnd ? new Date(quizEnd) : undefined,
      }
      const updated = await apiClient.put<Session>(`/sessions/${sessionId}`, body)
      setSession(updated)
      setMessage('Session saved successfully.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="page">Loading...</div>
  if (!session) return <div className="page">Session not found</div>

  return (
    <div className="page">
      <div className="ql-header-bar">
        <h1>Edit Session</h1>
      </div>

      <div className="container">
        <form onSubmit={handleSave}>
          <div className="form-group">
            <label htmlFor="sessionName">Session Name</label>
            <input
              id="sessionName"
              type="text"
              className="form-control"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="sessionDescription">Description</label>
            <textarea
              id="sessionDescription"
              className="form-control"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={quiz}
                onChange={(e) => setQuiz(e.target.checked)}
              />{' '}
              Quiz Mode
            </label>
          </div>

          {quiz && (
            <>
              <div className="form-group">
                <label htmlFor="quizStart">Start Date</label>
                <input
                  id="quizStart"
                  type="datetime-local"
                  className="form-control"
                  value={quizStart}
                  onChange={(e) => setQuizStart(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="quizEnd">End Date</label>
                <input
                  id="quizEnd"
                  type="datetime-local"
                  className="form-control"
                  value={quizEnd}
                  onChange={(e) => setQuizEnd(e.target.value)}
                />
              </div>
            </>
          )}

          {error && <div className="ql-error">{error}</div>}
          {message && <div className="ql-success">{message}</div>}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate(`/course/${courseId}`)}
            >
              Back to Course
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

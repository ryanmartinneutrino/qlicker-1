import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { QuizExtension, Session } from '@qlicker/shared'
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
  const [quizExtensions, setQuizExtensions] = useState<Array<QuizExtension & { quizStartInput: string; quizEndInput: string }>>([])
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
        setQuizExtensions(
          (s.quizExtensions || []).map((entry) => ({
            ...entry,
            quizStartInput: entry.quizStart ? new Date(entry.quizStart).toISOString().slice(0, 16) : '',
            quizEndInput: entry.quizEnd ? new Date(entry.quizEnd).toISOString().slice(0, 16) : '',
          }))
        )
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
        quizExtensions: quiz
          ? quizExtensions
              .filter((entry) => entry.userId.trim())
              .map((entry) => ({
                userId: entry.userId.trim(),
                quizStart: entry.quizStartInput ? new Date(entry.quizStartInput) : null,
                quizEnd: entry.quizEndInput ? new Date(entry.quizEndInput) : null,
              }))
          : [],
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

  const addExtensionRow = () => {
    setQuizExtensions((prev) => [...prev, { userId: '', quizStart: null, quizEnd: null, quizStartInput: '', quizEndInput: '' }])
  }

  const updateExtension = (index: number, key: 'userId' | 'quizStartInput' | 'quizEndInput', value: string) => {
    setQuizExtensions((prev) => prev.map((entry, i) => (i === index ? { ...entry, [key]: value } : entry)))
  }

  const removeExtension = (index: number) => {
    setQuizExtensions((prev) => prev.filter((_, i) => i !== index))
  }

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
              <div className="form-group">
                <label>Quiz Extensions</label>
                {quizExtensions.map((entry, index) => (
                  <div key={index} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr auto', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <input
                      className="form-control"
                      placeholder="Student userId"
                      value={entry.userId}
                      onChange={(e) => updateExtension(index, 'userId', e.target.value)}
                    />
                    <input
                      type="datetime-local"
                      className="form-control"
                      value={entry.quizStartInput}
                      onChange={(e) => updateExtension(index, 'quizStartInput', e.target.value)}
                    />
                    <input
                      type="datetime-local"
                      className="form-control"
                      value={entry.quizEndInput}
                      onChange={(e) => updateExtension(index, 'quizEndInput', e.target.value)}
                    />
                    <button type="button" className="btn btn-default" onClick={() => removeExtension(index)}>Remove</button>
                  </div>
                ))}
                <button type="button" className="btn btn-default btn-sm" onClick={addExtensionRow}>
                  Add Extension
                </button>
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

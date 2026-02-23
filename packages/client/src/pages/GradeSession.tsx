import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { Grade } from '@qlicker/shared'
import { apiClient } from '../api/client'

export default function GradeSession() {
  const { courseId, sessionId } = useParams<{ courseId: string; sessionId: string }>()

  const [grades, setGrades] = useState<Grade[]>([])
  const [visibleToStudents, setVisibleToStudents] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)
    apiClient
      .get<Grade[]>(`/grades?sessionId=${sessionId}`)
      .then((rows) => {
        setGrades(rows)
        setVisibleToStudents(rows.some((entry) => entry.visibleToStudents))
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [sessionId])

  const reload = async () => {
    if (!sessionId) return
    const rows = await apiClient.get<Grade[]>(`/grades?sessionId=${sessionId}`)
    setGrades(rows)
    setVisibleToStudents(rows.some((entry) => entry.visibleToStudents))
  }

  const calculateGrades = async () => {
    if (!sessionId) return
    setBusy(true)
    setError(null)
    try {
      await apiClient.post<{ success: boolean }>(`/grades/calc-session/${sessionId}`, {})
      await reload()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const toggleVisibility = async () => {
    if (!sessionId) return
    const nextVisible = !visibleToStudents
    setBusy(true)
    setError(null)
    try {
      await apiClient.put<{ success: boolean }>(`/grades/session/${sessionId}/visible`, {
        visible: nextVisible,
      })
      setVisibleToStudents(nextVisible)
      await reload()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="page">Loading...</div>
  if (error) return <div className="page">Error: {error}</div>

  return (
    <div className="page">
      <div className="ql-header-bar">
        <h1>Session Grades</h1>
      </div>

      <div className="container">
        <Link className="btn btn-secondary" to={`/course/${courseId}`} style={{ marginBottom: '1rem', display: 'inline-block' }}>
          Back to Course
        </Link>
        <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={calculateGrades} disabled={busy}>
            {busy ? 'Working...' : grades.length === 0 ? 'Create Grade Items' : 'Re-calculate Grades'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={toggleVisibility} disabled={busy || grades.length === 0}>
            {visibleToStudents ? 'Hide From Students' : 'Show To Students'}
          </button>
        </div>
        {error && <div className="ql-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}

        {grades.length === 0 ? (
          <p>No grades available for this session yet.</p>
        ) : (
          <table className="ql-grade-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '2px solid #ddd' }}>Student</th>
                <th style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '2px solid #ddd' }}>Points</th>
                <th style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '2px solid #ddd' }}>Out Of</th>
                <th style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '2px solid #ddd' }}>Grade</th>
                <th style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '2px solid #ddd' }}>Participation</th>
              </tr>
            </thead>
            <tbody>
              {grades.map((g) => (
                <tr key={g._id || g.userId}>
                  <td style={{ padding: '0.75rem', borderBottom: '1px solid #eee' }}>{g.userId}</td>
                  <td style={{ padding: '0.75rem', borderBottom: '1px solid #eee' }}>{g.points ?? '-'}</td>
                  <td style={{ padding: '0.75rem', borderBottom: '1px solid #eee' }}>{g.outOf ?? '-'}</td>
                  <td style={{ padding: '0.75rem', borderBottom: '1px solid #eee' }}>
                    {g.points != null && g.outOf ? `${Math.round((g.points / g.outOf) * 100)}%` : '-'}
                  </td>
                  <td style={{ padding: '0.75rem', borderBottom: '1px solid #eee' }}>
                    {g.participation != null ? `${Math.round(g.participation * 100)}%` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

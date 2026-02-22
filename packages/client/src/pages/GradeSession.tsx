import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { Grade } from '@qlicker/shared'
import { apiClient } from '../api/client'

export default function GradeSession() {
  const { courseId, sessionId } = useParams<{ courseId: string; sessionId: string }>()

  const [grades, setGrades] = useState<Grade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)
    apiClient
      .get<Grade[]>(`/grades?sessionId=${sessionId}`)
      .then(setGrades)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [sessionId])

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

        {grades.length === 0 ? (
          <p>No grades available for this session.</p>
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

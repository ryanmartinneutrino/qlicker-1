import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { Grade } from '@qlicker/shared'
import { apiClient } from '../api/client'

export default function CourseGrades() {
  const { courseId } = useParams<{ courseId: string }>()

  const [grades, setGrades] = useState<Grade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!courseId) return
    setLoading(true)
    apiClient
      .get<Grade[]>(`/grades?courseId=${courseId}`)
      .then(setGrades)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [courseId])

  if (loading) return <div className="page">Loading...</div>
  if (error) return <div className="page">Error: {error}</div>

  return (
    <div className="page">
      <div className="ql-header-bar">
        <h1>Course Grades</h1>
      </div>

      <div className="container">
        <Link className="btn btn-secondary" to={`/course/${courseId}`} style={{ marginBottom: '1rem', display: 'inline-block' }}>
          Back to Course
        </Link>

        {grades.length === 0 ? (
          <p>No grades available for this course.</p>
        ) : (
          <table className="ql-grade-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '2px solid #ddd' }}>Student</th>
                <th style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '2px solid #ddd' }}>Session</th>
                <th style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '2px solid #ddd' }}>Points</th>
                <th style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '2px solid #ddd' }}>Out Of</th>
                <th style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '2px solid #ddd' }}>Grade</th>
                <th style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '2px solid #ddd' }}>Answered</th>
              </tr>
            </thead>
            <tbody>
              {grades.map((g) => (
                <tr key={g._id || `${g.userId}-${g.sessionId}`}>
                  <td style={{ padding: '0.75rem', borderBottom: '1px solid #eee' }}>{g.userId}</td>
                  <td style={{ padding: '0.75rem', borderBottom: '1px solid #eee' }}>{g.sessionId ?? '-'}</td>
                  <td style={{ padding: '0.75rem', borderBottom: '1px solid #eee' }}>{g.points ?? '-'}</td>
                  <td style={{ padding: '0.75rem', borderBottom: '1px solid #eee' }}>{g.outOf ?? '-'}</td>
                  <td style={{ padding: '0.75rem', borderBottom: '1px solid #eee' }}>
                    {g.points != null && g.outOf ? `${Math.round((g.points / g.outOf) * 100)}%` : '-'}
                  </td>
                  <td style={{ padding: '0.75rem', borderBottom: '1px solid #eee' }}>
                    {g.numAnswered != null && g.numQuestions != null
                      ? `${g.numAnswered}/${g.numQuestions}`
                      : '-'}
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

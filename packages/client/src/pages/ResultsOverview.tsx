import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Course } from '@qlicker/shared'
import { apiClient } from '../api/client'

export default function ResultsOverview() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    apiClient
      .get<Course[]>('/courses')
      .then(setCourses)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="page">Loading...</div>
  if (error) return <div className="page">Error: {error}</div>

  const activeCourses = courses.filter((c) => !c.inactive)

  return (
    <div className="page">
      <div className="ql-header-bar">
        <h1>Results Overview</h1>
      </div>

      <div className="container">
        {activeCourses.length === 0 ? (
          <p>No courses available.</p>
        ) : (
          <div>
            {activeCourses.map((c) => {
              const courseCode = `${c.deptCode} ${c.courseNumber}-${c.section}`.toUpperCase()
              return (
                <div
                  key={c._id}
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
                    <strong>{courseCode}</strong> — {c.name}
                    <span style={{ marginLeft: '0.5rem', color: '#888' }}>{c.semester}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Link className="btn btn-secondary" to={`/course/${c._id}/grades`}>
                      Grades
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

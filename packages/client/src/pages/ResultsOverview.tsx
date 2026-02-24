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
  const inactiveCourses = courses.filter((c) => c.inactive)

  return (
    <div className="page">
      <div className="ql-header-bar">
        <h1>Response Results</h1>
      </div>

      <div className="container">
        <h2>Active Courses</h2>
        {activeCourses.length === 0 ? (
          <p>No active courses available.</p>
        ) : (
          <div className="ql-courselist">
            {activeCourses.map((course) => {
              const courseCode = `${course.deptCode} ${course.courseNumber}-${course.section}`.toUpperCase()
              return (
                <div key={course._id} className="ql-list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{courseCode}</strong> — {course.name}
                    <span style={{ marginLeft: '0.5rem', color: '#888' }}>{course.semester}</span>
                  </div>
                  <Link className="btn btn-secondary" to={`/course/${course._id}/results`}>
                    View Results
                  </Link>
                </div>
              )
            })}
          </div>
        )}

        <h2 className="m-margin-top">Inactive Courses</h2>
        {inactiveCourses.length === 0 ? (
          <p>No inactive courses.</p>
        ) : (
          <div className="ql-courselist">
            {inactiveCourses.map((course) => {
              const courseCode = `${course.deptCode} ${course.courseNumber}-${course.section}`.toUpperCase()
              return (
                <div key={course._id} className="ql-list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{courseCode}</strong> — {course.name}
                    <span style={{ marginLeft: '0.5rem', color: '#888' }}>{course.semester}</span>
                  </div>
                  <Link className="btn btn-secondary" to={`/course/${course._id}/results`}>
                    View Results
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

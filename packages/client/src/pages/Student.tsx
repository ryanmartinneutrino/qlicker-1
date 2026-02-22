import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { apiClient } from '../api/client'
import { CourseListItem } from '../components/CourseListItem'
import type { Course } from '@qlicker/shared'

export default function Student() {
  const navigate = useNavigate()
  const { data: courses, loading, execute: fetchCourses } = useApi<Course[]>('GET', '/courses')
  const [enrollmentCode, setEnrollmentCode] = useState('')
  const [enrollError, setEnrollError] = useState<string | null>(null)
  const [enrolling, setEnrolling] = useState(false)

  useEffect(() => {
    fetchCourses()
  }, [fetchCourses])

  const activeCourses = (courses || []).filter((c) => !c.inactive)
  const inactiveCourses = (courses || []).filter((c) => c.inactive)

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!enrollmentCode.trim()) return
    setEnrolling(true)
    setEnrollError(null)
    try {
      await apiClient.post('/courses/enroll', { enrollmentCode: enrollmentCode.trim() })
      setEnrollmentCode('')
      fetchCourses()
    } catch (err) {
      setEnrollError((err as Error).message)
    } finally {
      setEnrolling(false)
    }
  }

  if (loading && !courses) return <div className="page">Loading...</div>

  return (
    <div className="ql-student-page page">
      <form className="form-flex" onSubmit={handleEnroll}>
        <input
          type="text"
          className="form-control"
          placeholder="Enter enrollment code"
          value={enrollmentCode}
          onChange={(e) => setEnrollmentCode(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={enrolling}>
          {enrolling ? 'Enrolling...' : 'Enroll in Course'}
        </button>
      </form>
      {enrollError && <div className="alert alert-danger">{enrollError}</div>}

      <h2>Active Courses</h2>
      <div className="ql-courselist">
        {activeCourses.length === 0 && <p>No active courses. Use an enrollment code to join a course.</p>}
        {activeCourses.map((course) => (
          <CourseListItem
            key={course._id}
            course={course}
            click={() => navigate(`/course/${course._id}`)}
          />
        ))}
      </div>

      {inactiveCourses.length > 0 && (
        <>
          <h2>Inactive Courses</h2>
          <div className="ql-courselist">
            {inactiveCourses.map((course) => (
              <CourseListItem
                key={course._id}
                course={course}
                click={() => navigate(`/course/${course._id}`)}
                inactive
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

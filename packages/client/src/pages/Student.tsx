import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { CourseListItem } from '../components/CourseListItem'
import { EnrollCourseModal } from '../components/modals/EnrollCourseModal'
import type { Course } from '@qlicker/shared'

export default function Student() {
  const navigate = useNavigate()
  const { data: courses, loading, execute: fetchCourses } = useApi<Course[]>('GET', '/courses')
  const [showEnrollModal, setShowEnrollModal] = useState(false)

  useEffect(() => {
    fetchCourses()
  }, [fetchCourses])

  const activeCourses = (courses || []).filter((c) => !c.inactive)
  const inactiveCourses = (courses || []).filter((c) => c.inactive)

  if (loading && !courses) return <div className="page">Loading...</div>

  return (
    <div className="ql-student-page page">
      <button type="button" className="btn btn-primary" onClick={() => setShowEnrollModal(true)}>
        Enroll in Course
      </button>

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

      {showEnrollModal && (
        <EnrollCourseModal
          onEnrolled={() => { fetchCourses() }}
          done={() => setShowEnrollModal(false)}
        />
      )}
    </div>
  )
}

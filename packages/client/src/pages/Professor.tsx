import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { CourseListItem } from '../components/CourseListItem'
import { CreateCourseModal } from '../components/CreateCourseModal'
import type { Course } from '@qlicker/shared'

export default function Professor() {
  const navigate = useNavigate()
  const { data: courses, loading, execute: fetchCourses } = useApi<Course[]>('GET', '/courses')
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    fetchCourses()
  }, [fetchCourses])

  const activeCourses = (courses || []).filter((c) => !c.inactive)

  if (loading && !courses) return <div className="page">Loading...</div>

  return (
    <div className="ql-professor-page page">
      <h2>Active Courses</h2>
      <div className="btn-group">
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>Create Course</button>
        <button className="btn btn-default" onClick={() => navigate('/courses')}>Manage All Courses</button>
      </div>

      <div className="ql-courselist">
        {activeCourses.length === 0 && <p>No active courses.</p>}
        {activeCourses.map((course) => (
          <CourseListItem
            key={course._id}
            course={course}
            click={() => navigate(`/course/${course._id}`)}
          />
        ))}
      </div>

      {showModal && (
        <CreateCourseModal
          done={() => {
            setShowModal(false)
            fetchCourses()
          }}
        />
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { apiClient } from '../api/client'
import { CourseListItem } from '../components/CourseListItem'
import { CreateCourseModal } from '../components/CreateCourseModal'
import type { Course } from '@qlicker/shared'

export default function ManageCourses() {
  const navigate = useNavigate()
  const { data: courses, loading, execute: fetchCourses } = useApi<Course[]>('GET', '/courses')
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    fetchCourses()
  }, [fetchCourses])

  const activeCourses = (courses || []).filter((c) => !c.inactive)
  const inactiveCourses = (courses || []).filter((c) => c.inactive)

  const toggleActive = async (course: Course) => {
    try {
      await apiClient.put(`/courses/${course._id}`, { inactive: !course.inactive })
      fetchCourses()
    } catch (err) {
      alert((err as Error).message)
    }
  }

  const deleteCourse = async (course: Course) => {
    if (!window.confirm(`Delete "${course.name}"? This cannot be undone.`)) return
    try {
      await apiClient.delete(`/courses/${course._id}`)
      fetchCourses()
    } catch (err) {
      alert((err as Error).message)
    }
  }

  if (loading && !courses) return <div className="page">Loading...</div>

  return (
    <div className="ql-professor-page page">
      <h2>Courses</h2>
      <button className="btn btn-primary" onClick={() => setShowModal(true)}>Create New Course</button>

      <h3>Active Courses</h3>
      <div className="ql-courselist">
        {activeCourses.length === 0 && <p>No active courses.</p>}
        {activeCourses.map((course) => (
          <CourseListItem
            key={course._id}
            course={course}
            click={() => navigate(`/course/${course._id}`)}
            controls={[
              { label: 'Make Inactive', click: () => toggleActive(course) },
              { label: 'Delete', click: () => deleteCourse(course) },
            ]}
          />
        ))}
      </div>

      <h3>Inactive Courses</h3>
      <div className="ql-courselist">
        {inactiveCourses.length === 0 && <p>No inactive courses.</p>}
        {inactiveCourses.map((course) => (
          <CourseListItem
            key={course._id}
            course={course}
            click={() => navigate(`/course/${course._id}`)}
            inactive
            controls={[
              { label: 'Make Active', click: () => toggleActive(course) },
              { label: 'Delete', click: () => deleteCourse(course) },
            ]}
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

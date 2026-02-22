import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { Course as CourseType } from '@qlicker/shared'
import { apiClient } from '../api/client'

interface GroupDisplay {
  name: string
  groupCount: number
}

export default function ManageCourseGroups() {
  const { courseId } = useParams<{ courseId: string }>()

  const [course, setCourse] = useState<CourseType | null>(null)
  const [categories, setCategories] = useState<GroupDisplay[]>([])
  const [newGroupName, setNewGroupName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!courseId) return
    setLoading(true)
    apiClient
      .get<CourseType>(`/courses/${courseId}`)
      .then((c) => {
        setCourse(c)
        if (c.groupCategories && Array.isArray(c.groupCategories)) {
          setCategories(
            c.groupCategories.map((gc) => ({
              name: gc.categoryName || 'Unnamed Category',
              groupCount: gc.groups?.length ?? 0,
            }))
          )
        }
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [courseId])

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return
    setCategories((prev) => [...prev, { name: newGroupName.trim(), groupCount: 0 }])
    setNewGroupName('')
  }

  const handleRemoveGroup = (index: number) => {
    setCategories((prev) => prev.filter((_, i) => i !== index))
  }

  if (loading) return <div className="page">Loading...</div>
  if (error) return <div className="page">Error: {error}</div>
  if (!course) return <div className="page">Course not found</div>

  const courseCode = `${course.deptCode} ${course.courseNumber}-${course.section}`.toUpperCase()

  return (
    <div className="page">
      <div className="ql-header-bar">
        <h1>Groups: {courseCode}</h1>
      </div>

      <div className="container">
        <Link className="btn btn-secondary" to={`/course/${courseId}`} style={{ marginBottom: '1rem', display: 'inline-block' }}>
          Back to Course
        </Link>

        <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            className="form-control"
            placeholder="New group name"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            style={{ maxWidth: '300px' }}
          />
          <button className="btn btn-primary" onClick={handleCreateGroup}>
            Add Group
          </button>
        </div>

        {categories.length === 0 ? (
          <p>No groups configured for this course.</p>
        ) : (
          <div>
            {categories.map((g, i) => (
              <div
                key={i}
                className="ql-card"
                style={{ marginBottom: '0.5rem' }}
              >
                <div className="ql-card-content" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{g.name}</strong>
                    <span style={{ marginLeft: '0.5rem', color: '#888' }}>
                      {g.groupCount} group{g.groupCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleRemoveGroup(i)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

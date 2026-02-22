import React, { useState } from 'react'
import { apiClient } from '../api/client'
import type { Course } from '@qlicker/shared'

interface CreateCourseModalProps {
  done: () => void
}

export function CreateCourseModal({ done }: CreateCourseModalProps) {
  const [name, setName] = useState('')
  const [deptCode, setDeptCode] = useState('')
  const [courseNumber, setCourseNumber] = useState('')
  const [section, setSection] = useState('')
  const [semester, setSemester] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await apiClient.post<Course>('/courses', { name, deptCode, courseNumber, section, semester })
      done()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="ql-modal-container" onClick={done}>
      <div className="ql-modal ql-card" onClick={(e) => e.stopPropagation()}>
        <div className="ql-header-bar">
          <h4>Create Course</h4>
        </div>
        <div className="ql-card-content">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="courseName">Course Name</label>
              <input id="courseName" className="form-control" type="text" placeholder="Course Name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="deptCode">Department Code</label>
              <input id="deptCode" className="form-control" type="text" placeholder="e.g. CISC" value={deptCode} onChange={(e) => setDeptCode(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="courseNumber">Course Number</label>
              <input id="courseNumber" className="form-control" type="text" placeholder="e.g. 101" value={courseNumber} onChange={(e) => setCourseNumber(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="section">Section</label>
              <input id="section" className="form-control" type="text" placeholder="e.g. 001" value={section} onChange={(e) => setSection(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="semester">Semester</label>
              <input id="semester" className="form-control" type="text" placeholder="e.g. Fall 2024" value={semester} onChange={(e) => setSemester(e.target.value)} required />
            </div>
            {error && <div className="alert alert-danger">{error}</div>}
            <div className="btn-group">
              <button type="button" className="btn btn-default" onClick={done} disabled={submitting}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Creating...' : 'Submit'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import type { Course } from '@qlicker/shared'
import { apiClient } from '../../api/client'

interface EnrollCourseModalProps {
  onEnrolled: (course: Course) => void
  done: () => void
}

export function EnrollCourseModal({ onEnrolled, done }: EnrollCourseModalProps) {
  const [enrollmentCode, setEnrollmentCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = enrollmentCode.trim()
    if (!code) return

    setSubmitting(true)
    setError(null)
    try {
      const course = await apiClient.post<Course>('/courses/enroll', { enrollmentCode: code })
      onEnrolled(course)
      done()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="ql-modal-container" onClick={done}>
      <div className="ql-modal ql-modal-enrollcourse ql-card" onClick={(e) => e.stopPropagation()}>
        <div className="ql-modal-header ql-header-bar"><h3>Enroll In Course</h3></div>
        <form className="ql-card-content ql-form-enrollcourse" onSubmit={handleSubmit}>
          <label htmlFor="enrollmentCode">Enrollment Code:</label>
          <input
            id="enrollmentCode"
            type="text"
            className="form-control"
            value={enrollmentCode}
            onChange={(e) => setEnrollmentCode(e.target.value)}
            placeholder="TCDHLZ"
            autoFocus
          />
          {error && <div className="alert alert-danger" style={{ marginTop: '12px' }}>{error}</div>}
          <div className="ql-buttongroup">
            <button type="button" className="btn btn-default" onClick={done} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-default" disabled={submitting || !enrollmentCode.trim()}>
              {submitting ? 'Enrolling...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

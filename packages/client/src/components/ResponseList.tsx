import { useMemo } from 'react'
import type { Mark, Question, Response } from '@qlicker/shared'
import { ResponseDisplay } from './ResponseDisplay'

export interface ResponseListStudent {
  userId: string
  firstname: string
  lastname: string
  email: string
}

interface DraftMark {
  points?: number
  feedback?: string
}

interface ResponseListProps {
  question: Question
  students: ResponseListStudent[]
  responsesByStudentId: Record<string, Response[]>
  markByStudentId: Record<string, Mark | null>
  drafts: Record<string, DraftMark>
  onDraftPoints: (studentId: string, points: number) => void
  onDraftFeedback: (studentId: string, feedback: string) => void
  onSave: (studentId: string) => void
  onCancel: (studentId: string) => void
  onSaveAll: () => void
  onCancelAll: () => void
  savingStudentId?: string | null
}

function hasDraftChanges(draft: DraftMark | undefined, mark: Mark | null): boolean {
  if (!draft) return false
  if (draft.points !== undefined && draft.points !== (mark?.points ?? 0)) return true
  if (draft.feedback !== undefined && draft.feedback !== (mark?.feedback || '')) return true
  return false
}

export function ResponseList({
  question,
  students,
  responsesByStudentId,
  markByStudentId,
  drafts,
  onDraftPoints,
  onDraftFeedback,
  onSave,
  onCancel,
  onSaveAll,
  onCancelAll,
  savingStudentId = null,
}: ResponseListProps) {
  const rows = useMemo(
    () =>
      [...students].sort((a, b) => {
        const ln = a.lastname.localeCompare(b.lastname, undefined, { sensitivity: 'base' })
        return ln !== 0 ? ln : a.firstname.localeCompare(b.firstname, undefined, { sensitivity: 'base' })
      }),
    [students]
  )

  const dirtyStudents = rows.filter((student) => hasDraftChanges(drafts[student.userId], markByStudentId[student.userId] || null))

  if (rows.length === 0) {
    return <div className="ql-subs-loading">No students match the current filter.</div>
  }

  return (
    <div className="ql-response-list">
      <div className="ql-response-table-headers" style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr 0.8fr 1.4fr 0.8fr', gap: '10px', marginBottom: '0.75rem', fontWeight: 600 }}>
        <div>Student Name</div>
        <div>Response</div>
        <div>Grade</div>
        <div>Feedback</div>
        <div>
          {dirtyStudents.length > 0 && (
            <div className="btn-group-vertical" style={{ display: 'flex', gap: '0.25rem' }}>
              <button className="btn btn-secondary" type="button" onClick={onSaveAll}>Save all</button>
              <button className="btn btn-secondary" type="button" onClick={onCancelAll}>Cancel all</button>
            </div>
          )}
        </div>
      </div>

      <div className="ql-response-display-list" style={{ display: 'grid', gap: '0.75rem' }}>
        {rows.map((student, index) => {
          const studentId = student.userId
          const mark = markByStudentId[studentId] || null
          const draft = drafts[studentId]
          const points = draft?.points ?? mark?.points ?? 0
          const feedback = draft?.feedback ?? mark?.feedback ?? ''
          const hasChanges = hasDraftChanges(draft, mark)
          const studentName = `${student.lastname}, ${student.firstname}`.trim().replace(/^,\s*/, '') || student.email || student.userId

          return (
            <div
              key={studentId}
              className={`ql-response-display-container ${index % 2 !== 0 ? 'highlight' : ''}`}
              style={{ border: '1px solid #eee', borderRadius: 4, padding: '0.5rem' }}
            >
              <ResponseDisplay
                question={question}
                responses={responsesByStudentId[studentId] || []}
                mark={{ ...mark, outOf: mark?.outOf ?? question.sessionOptions?.points ?? 1 }}
                studentName={studentName}
                points={points}
                feedback={feedback}
                onPointsChange={(value) => onDraftPoints(studentId, value)}
                onFeedbackChange={(value) => onDraftFeedback(studentId, value)}
              />
              {hasChanges && (
                <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={savingStudentId === studentId}
                    onClick={() => onSave(studentId)}
                  >
                    {savingStudentId === studentId ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={savingStudentId === studentId}
                    onClick={() => onCancel(studentId)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

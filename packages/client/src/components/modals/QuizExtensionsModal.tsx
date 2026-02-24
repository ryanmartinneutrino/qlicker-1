import { useMemo, useState } from 'react'
import type { QuizExtension } from '@qlicker/shared'

type ExtensionCandidate = {
  userId: string
  name: string
  email: string
}

type ExtensionRow = QuizExtension & {
  quizStartInput: string
  quizEndInput: string
}

type Props = {
  open: boolean
  onClose: () => void
  sessionQuizStart: string
  sessionQuizEnd: string
  candidates: ExtensionCandidate[]
  value: ExtensionRow[]
  onChange: (next: ExtensionRow[]) => void
}

function toInputValue(value: Date | string | null | undefined): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 16)
}

function addHour(inputValue: string): string {
  if (!inputValue) return ''
  const date = new Date(inputValue)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() + 60 * 60 * 1000).toISOString().slice(0, 16)
}

function subtractHour(inputValue: string): string {
  if (!inputValue) return ''
  const date = new Date(inputValue)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - 60 * 60 * 1000).toISOString().slice(0, 16)
}

export default function QuizExtensionsModal(props: Props) {
  const { open, onClose, sessionQuizStart, sessionQuizEnd, candidates, value, onChange } = props
  const [selectedUserId, setSelectedUserId] = useState('')

  const activeIds = useMemo(() => new Set(value.map((entry) => entry.userId)), [value])
  const availableCandidates = useMemo(
    () => candidates.filter((entry) => !activeIds.has(entry.userId)),
    [candidates, activeIds]
  )

  if (!open) return null

  const addSelectedStudent = () => {
    if (!selectedUserId) return
    const next = [
      ...value,
      {
        userId: selectedUserId,
        quizStart: sessionQuizStart ? new Date(sessionQuizStart) : null,
        quizEnd: sessionQuizEnd ? new Date(sessionQuizEnd) : null,
        quizStartInput: sessionQuizStart,
        quizEndInput: sessionQuizEnd,
      },
    ]
    onChange(next)
    setSelectedUserId('')
  }

  const removeStudent = (userId: string) => {
    onChange(value.filter((entry) => entry.userId !== userId))
  }

  const updateRow = (index: number, key: 'quizStartInput' | 'quizEndInput', nextValue: string) => {
    const nextRows = value.map((entry, i) => (i === index ? { ...entry, [key]: nextValue } : entry))
    const row = nextRows[index]
    if (!row) return
    if (key === 'quizStartInput' && row.quizEndInput && nextValue && nextValue > row.quizEndInput) {
      row.quizEndInput = addHour(nextValue)
    }
    if (key === 'quizEndInput' && row.quizStartInput && nextValue && nextValue < row.quizStartInput) {
      row.quizStartInput = subtractHour(nextValue)
    }
    onChange(nextRows)
  }

  return (
    <div className="ql-modal-container" role="dialog" aria-modal="true">
      <div className="ql-modal ql-card" style={{ maxWidth: '980px', width: '95%' }}>
        <div className="ql-modal-header ql-header-bar">
          <h3>Quiz extensions</h3>
        </div>
        <div className="ql-modal-content" style={{ padding: '1rem' }}>
          <div className="form-group" style={{ display: 'flex', gap: '0.5rem', alignItems: 'end' }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="extensionCandidate">Add an extension for a student</label>
              <select
                id="extensionCandidate"
                className="form-control"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                <option value="">Select a student</option>
                {availableCandidates.map((entry) => (
                  <option key={entry.userId} value={entry.userId}>
                    {entry.name}{entry.email ? ` (${entry.email})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="btn btn-default" onClick={addSelectedStudent} disabled={!selectedUserId}>
              Add
            </button>
          </div>

          {value.length < 1 ? (
            <div className="ql-qExtension-list-title">No students with extensions</div>
          ) : (
            <div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.4fr 1fr 1fr auto',
                  gap: '0.5rem',
                  fontWeight: 600,
                  marginBottom: '0.5rem',
                }}
              >
                <div>Name</div>
                <div>Quiz start</div>
                <div>Quiz end</div>
                <div />
              </div>
              {value.map((entry, index) => {
                const candidate = candidates.find((c) => c.userId === entry.userId)
                const label = candidate
                  ? `${candidate.name}${candidate.email ? ` (${candidate.email})` : ''}`
                  : entry.userId
                return (
                  <div
                    key={`${entry.userId}-${index}`}
                    style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr auto', gap: '0.5rem', marginBottom: '0.5rem' }}
                  >
                    <div>{label}</div>
                    <input
                      type="datetime-local"
                      className="form-control"
                      value={toInputValue(entry.quizStartInput)}
                      onChange={(e) => updateRow(index, 'quizStartInput', e.target.value)}
                    />
                    <input
                      type="datetime-local"
                      className="form-control"
                      value={toInputValue(entry.quizEndInput)}
                      onChange={(e) => updateRow(index, 'quizEndInput', e.target.value)}
                    />
                    <button type="button" className="btn btn-default" onClick={() => removeStudent(entry.userId)}>
                      Remove
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div className="ql-qExtension-button" style={{ padding: '1rem' }}>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

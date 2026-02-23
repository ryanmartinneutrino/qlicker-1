import { useMemo, useState } from 'react'
import type { Question, Response as QuestionResponse } from '@qlicker/shared'
import { QuestionType } from '@qlicker/shared'
import { sanitizeHtml } from '../utils/sanitizeHtml'

interface QuestionDisplayProps {
  question: Question
  response?: QuestionResponse | null
  readonly?: boolean
  showCorrect?: boolean
  onSubmit?: (answer: string | string[]) => Promise<void> | void
}

function optionLabel(option: Question['options'][number]): string {
  return option.answer || option.plainText || option.content || ''
}

function normalizedAnswer(answer: QuestionResponse['answer'] | undefined): string | string[] {
  if (Array.isArray(answer)) return answer
  return answer || ''
}

export function QuestionDisplay({
  question,
  response = null,
  readonly = false,
  showCorrect = false,
  onSubmit,
}: QuestionDisplayProps) {
  const initialAnswer = normalizedAnswer(response?.answer)
  const [answer, setAnswer] = useState<string | string[]>(initialAnswer)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const correctAnswers = useMemo(() => {
    return (question.options || []).filter((opt) => opt.correct).map((opt) => optionLabel(opt))
  }, [question.options])

  const submit = async () => {
    if (!onSubmit || readonly) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(answer)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const toggleMs = (value: string) => {
    const current = Array.isArray(answer) ? answer : []
    if (current.includes(value)) {
      setAnswer(current.filter((entry) => entry !== value))
    } else {
      setAnswer([...current, value].sort())
    }
  }

  const optionTypes = question.type === QuestionType.MC || question.type === QuestionType.TF || question.type === QuestionType.MS
  const isShortAnswer = question.type === QuestionType.SA
  const isNumerical = question.type === QuestionType.NU

  return (
    <div className="ql-card">
      <div className="ql-card-content">
        <div
          className="ql-question-content"
          dangerouslySetInnerHTML={{
            __html: sanitizeHtml(question.content || question.plainText || ''),
          }}
        />

        {optionTypes && (
          <div className="ql-question-options">
            {(question.options || []).map((opt, index) => {
              const label = optionLabel(opt)
              const value = label || `Option ${index + 1}`
              const checked = Array.isArray(answer) ? answer.includes(value) : answer === value
              return (
                <label key={`${value}-${index}`} style={{ display: 'block', marginBottom: '8px' }}>
                  <input
                    type={question.type === QuestionType.MS ? 'checkbox' : 'radio'}
                    name={`question-${question._id}`}
                    checked={checked}
                    disabled={readonly || submitting}
                    onChange={() => {
                      if (question.type === QuestionType.MS) toggleMs(value)
                      else setAnswer(value)
                    }}
                  />
                  <span style={{ marginLeft: '8px' }}>{value}</span>
                  {showCorrect && opt.correct && <strong style={{ marginLeft: '8px' }}>(Correct)</strong>}
                </label>
              )
            })}
          </div>
        )}

        {isShortAnswer && (
          <textarea
            className="form-control"
            value={Array.isArray(answer) ? answer.join(', ') : answer}
            disabled={readonly || submitting}
            onChange={(e) => setAnswer(e.target.value)}
          />
        )}

        {isNumerical && (
          <input
            className="form-control"
            type="number"
            value={Array.isArray(answer) ? answer[0] || '' : answer}
            disabled={readonly || submitting}
            onChange={(e) => setAnswer(e.target.value)}
          />
        )}

        {error && <div className="alert alert-danger" style={{ marginTop: '10px' }}>{error}</div>}
        {!readonly && onSubmit && (
          <button type="button" className="btn btn-primary" style={{ marginTop: '10px' }} disabled={submitting} onClick={submit}>
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        )}
        {showCorrect && correctAnswers.length > 0 && (
          <div style={{ marginTop: '10px' }}>
            <strong>Correct answer:</strong> {correctAnswers.join(', ')}
          </div>
        )}
      </div>
    </div>
  )
}

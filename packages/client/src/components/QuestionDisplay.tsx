import { useEffect, useMemo, useState } from 'react'
import type { Question, Response as QuestionResponse } from '@qlicker/shared'
import { QUESTION_TYPE } from '../constants/questionTypes'
import { sanitizeHtml } from '../utils/sanitizeHtml'

interface ResponseStat {
  answer: string
  pct: number
}

interface QuestionDisplayProps {
  question: Question
  response?: QuestionResponse | null
  readonly?: boolean
  showCorrect?: boolean
  forReview?: boolean
  prof?: boolean
  responseStats?: ResponseStat[]
  showStatsOverride?: boolean
  onSubmit?: (answer: string | string[], answerWysiwyg?: string) => Promise<void> | void
}

function optionLabel(option: Question['options'][number]): string {
  return option.answer || option.plainText || option.content || ''
}

function normalizedAnswer(answer: QuestionResponse['answer'] | undefined): string | string[] {
  if (Array.isArray(answer)) return answer
  return answer || ''
}

function isAttemptClosed(question: Question): boolean {
  const attempts = question.sessionOptions?.attempts
  if (!attempts || attempts.length === 0) return false
  return Boolean(attempts[attempts.length - 1]?.closed)
}

export function toggleMultiSelectAnswer(current: string | string[], value: string): string[] {
  const normalized = Array.isArray(current) ? current : []
  if (normalized.includes(value)) {
    return normalized.filter((entry) => entry !== value)
  }
  return [...normalized, value].sort()
}

export function shouldShowCorrectMarkers(params: {
  showCorrect: boolean
  forReview: boolean
  prof: boolean
  sessionCorrect?: boolean
}): boolean {
  const { showCorrect, forReview, prof, sessionCorrect } = params
  if (prof) return true
  if (forReview) return showCorrect
  return showCorrect || Boolean(sessionCorrect)
}

export function QuestionDisplay({
  question,
  response = null,
  readonly = false,
  showCorrect = false,
  forReview = false,
  prof = false,
  responseStats,
  showStatsOverride = false,
  onSubmit,
}: QuestionDisplayProps) {
  const [answer, setAnswer] = useState<string | string[]>(normalizedAnswer(response?.answer))
  const [answerWysiwyg, setAnswerWysiwyg] = useState(response?.answerWysiwyg || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setAnswer(normalizedAnswer(response?.answer))
    setAnswerWysiwyg(response?.answerWysiwyg || '')
  }, [question._id, response?._id, response?.answer, response?.answerWysiwyg])

  const correctAnswers = useMemo(() => {
    return (question.options || []).filter((opt) => opt.correct).map((opt) => optionLabel(opt))
  }, [question.options])

  const submit = async () => {
    if (!onSubmit || readonly || isAttemptClosed(question)) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(answer, answerWysiwyg)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const optionTypes = question.type === QUESTION_TYPE.MC || question.type === QUESTION_TYPE.TF || question.type === QUESTION_TYPE.MS
  const isShortAnswer = question.type === QUESTION_TYPE.SA
  const isNumerical = question.type === QUESTION_TYPE.NU
  const showCorrectMarkers = shouldShowCorrectMarkers({
    showCorrect,
    forReview,
    prof,
    sessionCorrect: question.sessionOptions?.correct,
  })
  const showStats = showStatsOverride || Boolean(question.sessionOptions?.stats)

  if (question.sessionOptions?.hidden && !forReview && !prof) {
    return <div className="ql-subs-loading">Waiting for a Question...</div>
  }

  return (
    <div className={`ql-card ${readonly || isAttemptClosed(question) ? '' : 'interactive'}`}>
      <div className="ql-card-content">
        <div
          className="ql-question-content"
          dangerouslySetInnerHTML={{
            __html: sanitizeHtml(question.content || question.plainText || ''),
          }}
        />

        {isAttemptClosed(question) && <div className="ql-subs-loading" style={{ marginTop: '8px' }}>Answering Disabled</div>}

        {optionTypes && (
          <div className="ql-question-options" style={{ marginTop: '0.5rem' }}>
            {question.options.map((opt, index) => {
              const label = optionLabel(opt)
              const value = label || `Option ${index + 1}`
              const checked = Array.isArray(answer) ? answer.includes(value) : answer === value
              const statPct = responseStats?.find((entry) => entry.answer === (opt.answer || value))?.pct || 0
              const showResponseMarker = checked && (!forReview || showCorrect)

              return (
                <label
                  key={`${value}-${index}`}
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    padding: '0.4rem 0.5rem',
                    borderRadius: 4,
                    border: '1px solid #eee',
                    backgroundColor: showResponseMarker ? '#f4fbff' : 'transparent',
                  }}
                >
                  <input
                    type={question.type === QUESTION_TYPE.MS ? 'checkbox' : 'radio'}
                    name={`question-${question._id}`}
                    checked={checked}
                    disabled={readonly || submitting || isAttemptClosed(question)}
                    onChange={() => {
                      if (question.type === QUESTION_TYPE.MS) setAnswer((prev) => toggleMultiSelectAnswer(prev, value))
                      else setAnswer(value)
                    }}
                  />
                  <span style={{ marginLeft: '8px' }}>
                    {(question.type === QUESTION_TYPE.MC || question.type === QUESTION_TYPE.MS) && (
                      <strong>{String.fromCharCode(65 + index)}. </strong>
                    )}
                    {value}
                  </span>
                  {showCorrectMarkers && opt.correct && <strong style={{ marginLeft: '8px' }}>✓</strong>}
                  {showStats && <span style={{ marginLeft: '8px' }}>({Math.round(statPct)}%)</span>}
                </label>
              )
            })}
            {question.type === QUESTION_TYPE.MS && <div style={{ fontSize: '0.9em', opacity: 0.8 }}>Select all that apply</div>}
          </div>
        )}

        {isShortAnswer && (
          <textarea
            className="form-control"
            value={answerWysiwyg || (Array.isArray(answer) ? answer.join(', ') : answer)}
            disabled={readonly || submitting || isAttemptClosed(question)}
            onChange={(e) => {
              const value = e.target.value
              setAnswer(value)
              setAnswerWysiwyg(value)
            }}
            placeholder="Type your answer here"
            style={{ marginTop: '0.5rem', minHeight: '90px' }}
          />
        )}

        {isNumerical && (
          <input
            className="form-control"
            type="number"
            step="any"
            value={Array.isArray(answer) ? answer[0] || '' : answer}
            disabled={readonly || submitting || isAttemptClosed(question)}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Answer"
            style={{ marginTop: '0.5rem' }}
          />
        )}

        {error && <div className="alert alert-danger" style={{ marginTop: '10px' }}>{error}</div>}

        {!readonly && onSubmit && (
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: '10px' }}
            disabled={submitting || isAttemptClosed(question) || (!answer && !answerWysiwyg)}
            onClick={submit}
          >
            {submitting ? 'Submitting...' : response ? 'Update' : 'Submit'}
          </button>
        )}

        {showCorrectMarkers && correctAnswers.length > 0 && (
          <div style={{ marginTop: '10px' }}>
            <strong>Correct answer:</strong> {correctAnswers.join(', ')}
          </div>
        )}

        {(showCorrectMarkers || (!forReview && question.sessionOptions?.correct)) && question.solution && (
          <div style={{ marginTop: '12px', padding: '0.75rem', borderRadius: 4, backgroundColor: '#f9f9f9' }}>
            <strong>Solution:</strong>
            <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(question.solution) }} />
          </div>
        )}
      </div>
    </div>
  )
}

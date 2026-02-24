import { useEffect, useMemo, useState } from 'react'
import { apiClient } from '../../api/client'
import type { Question, QuestionOption, SessionOptions } from '@qlicker/shared'
import { QUESTION_TYPE, type QuestionTypeValue } from '../../constants/questionTypes'
import { Editor } from '../Editor'

const defaultSessionOptions: SessionOptions = {
  hidden: false,
  stats: false,
  correct: false,
  points: 1,
  maxAttempts: 1,
  attemptWeights: [1],
  attempts: [{ number: 1, closed: false }],
}

interface CreateQuestionModalProps {
  courseId: string
  userId: string
  onCreated: (question: Question) => void
  done: () => void
  canSetPublic?: boolean
}

const defaultMcOptions: QuestionOption[] = [
  { plainText: 'Option A', content: 'Option A', answer: 'Option A', correct: true },
  { plainText: 'Option B', content: 'Option B', answer: 'Option B', correct: false },
]

const trueFalseOptions: QuestionOption[] = [
  { plainText: 'True', content: 'True', answer: 'True', correct: true },
  { plainText: 'False', content: 'False', answer: 'False', correct: false },
]

function normalizeChoiceOptions(options: QuestionOption[]): QuestionOption[] {
  return options.map((option, index) => {
    const text = (option.plainText || option.answer || option.content || '').trim()
    const fallback = text || `Option ${String.fromCharCode(65 + index)}`
    return {
      ...option,
      plainText: fallback,
      answer: fallback,
      content: option.content?.trim() ? option.content : fallback,
      correct: Boolean(option.correct),
    }
  })
}

function validateQuestionDraft({
  plainText,
  type,
  options,
  correctNumerical,
  toleranceNumerical,
}: {
  plainText: string
  type: QuestionTypeValue
  options: QuestionOption[]
  correctNumerical: number
  toleranceNumerical: number
}): string | null {
  if (!plainText.trim()) return 'Question text is required.'

  if (type === QUESTION_TYPE.MC || type === QUESTION_TYPE.MS || type === QUESTION_TYPE.TF) {
    const nonEmpty = options.filter((option) => (option.plainText || option.answer || '').trim().length > 0)
    if (nonEmpty.length < 2) return 'Choice questions require at least two options.'
    const nCorrect = nonEmpty.filter((option) => option.correct).length
    if (type === QUESTION_TYPE.MS && nCorrect < 1) return 'Multi-select questions require at least one correct option.'
    if ((type === QUESTION_TYPE.MC || type === QUESTION_TYPE.TF) && nCorrect !== 1) {
      return 'Multiple-choice and true/false questions require exactly one correct option.'
    }
  }

  if (type === QUESTION_TYPE.NU) {
    if (!Number.isFinite(correctNumerical)) return 'Numerical questions require a valid correct value.'
    if (!Number.isFinite(toleranceNumerical) || toleranceNumerical < 0) {
      return 'Numerical tolerance must be a non-negative number.'
    }
  }

  return null
}

export function CreateQuestionModal({
  courseId,
  userId,
  onCreated,
  done,
  canSetPublic = true,
}: CreateQuestionModalProps) {
  const [plainText, setPlainText] = useState('')
  const [content, setContent] = useState('')
  const [solution, setSolution] = useState('')
  const [solutionPlain, setSolutionPlain] = useState('')
  const [type, setType] = useState<QuestionTypeValue>(QUESTION_TYPE.SA)
  const [options, setOptions] = useState<QuestionOption[]>([])
  const [correctNumerical, setCorrectNumerical] = useState(0)
  const [toleranceNumerical, setToleranceNumerical] = useState(0)
  const [isPublic, setIsPublic] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isChoiceType = type === QUESTION_TYPE.MC || type === QUESTION_TYPE.MS || type === QUESTION_TYPE.TF

  useEffect(() => {
    if (type === QUESTION_TYPE.TF) {
      setOptions(trueFalseOptions)
      return
    }
    if ((type === QUESTION_TYPE.MC || type === QUESTION_TYPE.MS) && options.length < 2) {
      setOptions(defaultMcOptions)
      return
    }
    if (!isChoiceType) {
      setOptions([])
    }
  }, [type, isChoiceType, options.length])

  const sanitizedOptions = useMemo(() => {
    if (!isChoiceType) return []
    return normalizeChoiceOptions(options)
  }, [isChoiceType, options])

  const validationError = useMemo(
    () =>
      validateQuestionDraft({
        plainText,
        type,
        options: sanitizedOptions,
        correctNumerical,
        toleranceNumerical,
      }),
    [plainText, type, sanitizedOptions, correctNumerical, toleranceNumerical]
  )

  const updateOption = (index: number, value: string) => {
    setOptions((prev) =>
      prev.map((opt, i) =>
        i === index
          ? { ...opt, plainText: value, content: value, answer: value }
          : opt
      )
    )
  }

  const setCorrectOption = (index: number) => {
    if (type === QUESTION_TYPE.MS) {
      setOptions((prev) => prev.map((opt, i) => (i === index ? { ...opt, correct: !opt.correct } : opt)))
      return
    }
    setOptions((prev) => prev.map((opt, i) => ({ ...opt, correct: i === index })))
  }

  const addOption = () => {
    setOptions((prev) => [
      ...prev,
      {
        plainText: `Option ${String.fromCharCode(65 + prev.length)}`,
        answer: `Option ${String.fromCharCode(65 + prev.length)}`,
        content: `Option ${String.fromCharCode(65 + prev.length)}`,
        correct: false,
      },
    ])
  }

  const removeOption = (index: number) => {
    setOptions((prev) => {
      const next = prev.filter((_, i) => i !== index)
      if (type === QUESTION_TYPE.MC || type === QUESTION_TYPE.TF) {
        if (!next.some((option) => option.correct) && next.length > 0) {
          next[0] = { ...next[0], correct: true }
        }
      }
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (validationError) {
      setError(validationError)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const created = await apiClient.post<Question>('/questions', {
        plainText: plainText || 'New Question',
        content: content || plainText || 'New Question',
        type,
        options: sanitizedOptions,
        toleranceNumerical: type === QUESTION_TYPE.NU ? toleranceNumerical : 0,
        correctNumerical: type === QUESTION_TYPE.NU ? correctNumerical : 0,
        creator: userId,
        owner: userId,
        courseId,
        public: canSetPublic ? isPublic : false,
        solution,
        solution_plainText: solutionPlain || solution,
        tags: [],
        sessionOptions: defaultSessionOptions,
      })
      onCreated(created)
      done()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="ql-modal-container" onClick={done}>
      <div className="ql-modal ql-modal-createquestion ql-card" onClick={(e) => e.stopPropagation()}>
        <div className="ql-modal-header ql-header-bar"><h2>Add a Question</h2></div>
        <form className="ql-card-content" onSubmit={handleSubmit}>
          <label>Question text</label>
          <Editor
            value={content}
            placeholder="Type your question..."
            minHeight={120}
            onChange={(html, plain) => {
              setContent(html)
              setPlainText(plain)
            }}
          />
          <br />

          <label>Type</label>
          <select className="form-control" value={type} onChange={(e) => setType(Number(e.target.value) as QuestionTypeValue)}>
            <option value={QUESTION_TYPE.MC}>Multiple Choice</option>
            <option value={QUESTION_TYPE.TF}>True/False</option>
            <option value={QUESTION_TYPE.SA}>Short Answer</option>
            <option value={QUESTION_TYPE.MS}>Multi-Select</option>
            <option value={QUESTION_TYPE.NU}>Numerical</option>
          </select>
          <br />

          {isChoiceType && (
            <div style={{ marginBottom: 12 }}>
              <label>Options</label>
              {options.map((option, index) => (
                <div key={index} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                  <input
                    type={type === QUESTION_TYPE.MS ? 'checkbox' : 'radio'}
                    checked={Boolean(option.correct)}
                    onChange={() => setCorrectOption(index)}
                  />
                  <input
                    className="form-control"
                    value={option.plainText || option.answer || ''}
                    onChange={(e) => updateOption(index, e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-default btn-sm"
                    disabled={type === QUESTION_TYPE.TF}
                    onClick={() => removeOption(index)}
                  >
                    Remove
                  </button>
                </div>
              ))}
              {type !== QUESTION_TYPE.TF && (
                <button type="button" className="btn btn-default btn-sm" onClick={addOption}>Add Option</button>
              )}
            </div>
          )}

          {type === QUESTION_TYPE.NU && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <div>
                <label>Correct value</label>
                <input className="form-control" type="number" value={correctNumerical} onChange={(e) => setCorrectNumerical(Number(e.target.value))} />
              </div>
              <div>
                <label>Tolerance</label>
                <input className="form-control" type="number" value={toleranceNumerical} onChange={(e) => setToleranceNumerical(Number(e.target.value))} />
              </div>
            </div>
          )}

          <label>Solution</label>
          <Editor
            value={solution}
            placeholder="Optional solution text..."
            minHeight={90}
            onChange={(html, plain) => {
              setSolution(html)
              setSolutionPlain(plain)
            }}
          />
          <br />

          {canSetPublic && (
            <label>
              <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /> Public question
            </label>
          )}

          {error && <div className="alert alert-danger" style={{ marginTop: '12px' }}>{error}</div>}
          {!error && validationError && (
            <div className="alert alert-warning" style={{ marginTop: '12px' }}>
              {validationError}
            </div>
          )}

          <div className="ql-buttongroup">
            <button type="button" className="btn btn-default" onClick={done} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-default" disabled={submitting || Boolean(validationError)}>
              {submitting ? 'Submitting...' : 'Submit Question'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

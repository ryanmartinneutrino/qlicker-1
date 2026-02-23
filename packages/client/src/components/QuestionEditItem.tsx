import { useEffect, useMemo, useState } from 'react'
import type { Question, QuestionOption } from '@qlicker/shared'
import { QUESTION_TYPE, QUESTION_TYPE_LABELS, type QuestionTypeValue } from '../constants/questionTypes'
import { Editor } from './Editor'

const MIN_CHOICE_OPTIONS = 2

function optionText(option: QuestionOption): string {
  return option.plainText || option.answer || option.content || ''
}

function normalizeChoiceOptions(options: QuestionOption[], type: QuestionTypeValue): QuestionOption[] {
  const withText = options
    .map((option) => {
      const text = optionText(option)
      return {
        ...option,
        plainText: text,
        answer: text,
        content: text,
      }
    })
    .filter((option) => option.plainText)

  if (type === QUESTION_TYPE.TF) {
    return [
      { plainText: 'True', answer: 'True', content: 'True', correct: Boolean(withText[0]?.correct) || withText.length === 0 },
      { plainText: 'False', answer: 'False', content: 'False', correct: Boolean(withText[1]?.correct) },
    ]
  }

  const fallback = withText.length > 0 ? withText : [{ plainText: 'Option A', answer: 'Option A', content: 'Option A', correct: true }]
  while (fallback.length < MIN_CHOICE_OPTIONS) {
    const label = String.fromCharCode(65 + fallback.length)
    fallback.push({ plainText: `Option ${label}`, answer: `Option ${label}`, content: `Option ${label}`, correct: false })
  }

  if (type === QUESTION_TYPE.MS) {
    return fallback
  }

  let seenCorrect = false
  return fallback.map((option, index) => {
    if (!seenCorrect && option.correct) {
      seenCorrect = true
      return { ...option, correct: true }
    }
    return { ...option, correct: !seenCorrect && index === 0 }
  })
}

export function transitionQuestionType(question: Question, nextType: QuestionTypeValue): Question {
  const next: Question = { ...question, type: nextType }

  if (nextType === QUESTION_TYPE.MC || nextType === QUESTION_TYPE.MS || nextType === QUESTION_TYPE.TF) {
    const fromCompatible =
      (question.type === QUESTION_TYPE.MC && nextType === QUESTION_TYPE.MS) ||
      (question.type === QUESTION_TYPE.MS && nextType === QUESTION_TYPE.MC)

    const baseOptions = fromCompatible ? question.options || [] : []
    next.options = normalizeChoiceOptions(baseOptions, nextType)
    return next
  }

  next.options = []
  return next
}

interface QuestionEditItemProps {
  question: Question
  index: number
  isEditing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onDelete: () => void
  onSave: (updated: Question) => Promise<void> | void
}

export function QuestionEditItem({
  question,
  index,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onDelete,
  onSave,
}: QuestionEditItemProps) {
  const [draft, setDraft] = useState<Question>(question)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(question)
  }, [question])

  const isChoiceType = draft.type === QUESTION_TYPE.MC || draft.type === QUESTION_TYPE.MS || draft.type === QUESTION_TYPE.TF

  const options = useMemo(() => {
    if (!isChoiceType) return []
    return normalizeChoiceOptions(draft.options || [], draft.type as QuestionTypeValue)
  }, [draft.options, draft.type, isChoiceType])

  const updateOptionText = (optionIndex: number, value: string) => {
    setDraft((prev) => {
      const prevOptions = normalizeChoiceOptions(prev.options || [], prev.type as QuestionTypeValue)
      prevOptions[optionIndex] = {
        ...prevOptions[optionIndex],
        plainText: value,
        answer: value,
        content: value,
      }
      return { ...prev, options: prevOptions }
    })
  }

  const toggleCorrect = (optionIndex: number) => {
    setDraft((prev) => {
      const prevOptions = normalizeChoiceOptions(prev.options || [], prev.type as QuestionTypeValue)
      const nextOptions = prevOptions.map((option, index) => {
        if (prev.type === QUESTION_TYPE.MS) {
          if (index !== optionIndex) return option
          return { ...option, correct: !option.correct }
        }
        return { ...option, correct: index === optionIndex }
      })
      return { ...prev, options: nextOptions }
    })
  }

  const addOption = () => {
    setDraft((prev) => {
      const prevOptions = normalizeChoiceOptions(prev.options || [], prev.type as QuestionTypeValue)
      const label = String.fromCharCode(65 + prevOptions.length)
      const nextOptions = [
        ...prevOptions,
        { plainText: `Option ${label}`, answer: `Option ${label}`, content: `Option ${label}`, correct: false },
      ]
      return { ...prev, options: nextOptions }
    })
  }

  const removeOption = (optionIndex: number) => {
    setDraft((prev) => {
      const prevOptions = normalizeChoiceOptions(prev.options || [], prev.type as QuestionTypeValue)
      if (prevOptions.length <= MIN_CHOICE_OPTIONS) return prev
      const nextOptions = prevOptions.filter((_, index) => index !== optionIndex)
      return { ...prev, options: normalizeChoiceOptions(nextOptions, prev.type as QuestionTypeValue) }
    })
  }

  const save = async () => {
    setSaving(true)
    try {
      await onSave({ ...draft, options })
    } finally {
      setSaving(false)
    }
  }

  if (!isEditing) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
        <div>
          <strong>Q{index + 1}.</strong>{' '}
          {question.plainText
            ? question.plainText.substring(0, 120) + (question.plainText.length > 120 ? '...' : '')
            : 'Untitled Question'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            style={{
              padding: '0.25rem 0.5rem',
              backgroundColor: '#f0f0f0',
              borderRadius: '4px',
              fontSize: '0.85em',
            }}
          >
            {QUESTION_TYPE_LABELS[question.type] ?? `Type ${question.type}`}
          </span>
          {question.public && (
            <span
              style={{
                padding: '0.25rem 0.5rem',
                backgroundColor: '#30B0E7',
                color: '#fff',
                borderRadius: '4px',
                fontSize: '0.85em',
              }}
            >
              Public
            </span>
          )}
          <button className="btn btn-default btn-sm" onClick={onStartEdit}>Edit</button>
          <button className="btn btn-danger btn-sm" onClick={onDelete}>Delete</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      <Editor
        value={draft.content || draft.plainText || ''}
        minHeight={110}
        onChange={(html, plain) => setDraft((prev) => ({ ...prev, content: html, plainText: plain }))}
      />

      <select
        className="form-control"
        style={{ maxWidth: 260 }}
        value={draft.type}
        onChange={(e) => setDraft((prev) => transitionQuestionType(prev, Number(e.target.value) as QuestionTypeValue))}
      >
        <option value={QUESTION_TYPE.MC}>Multiple Choice</option>
        <option value={QUESTION_TYPE.TF}>True/False</option>
        <option value={QUESTION_TYPE.SA}>Short Answer</option>
        <option value={QUESTION_TYPE.MS}>Multi-Select</option>
        <option value={QUESTION_TYPE.NU}>Numerical</option>
      </select>

      {isChoiceType && (
        <div style={{ display: 'grid', gap: '0.4rem' }}>
          {options.map((option, optionIndex) => (
            <div key={optionIndex} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type={draft.type === QUESTION_TYPE.MS ? 'checkbox' : 'radio'}
                name={`correct-${draft._id}`}
                checked={Boolean(option.correct)}
                onChange={() => toggleCorrect(optionIndex)}
              />
              <input
                className="form-control"
                placeholder={`Option ${optionIndex + 1}`}
                value={optionText(option)}
                onChange={(e) => updateOptionText(optionIndex, e.target.value)}
              />
              {draft.type !== QUESTION_TYPE.TF && (
                <button
                  type="button"
                  className="btn btn-default btn-sm"
                  disabled={options.length <= MIN_CHOICE_OPTIONS}
                  onClick={() => removeOption(optionIndex)}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          {draft.type !== QUESTION_TYPE.TF && (
            <button type="button" className="btn btn-default btn-sm" style={{ justifySelf: 'start' }} onClick={addOption}>
              Add Option
            </button>
          )}
        </div>
      )}

      {draft.type === QUESTION_TYPE.NU && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label>Correct value</label>
            <input
              className="form-control"
              type="number"
              value={draft.correctNumerical ?? 0}
              onChange={(e) => setDraft((prev) => ({ ...prev, correctNumerical: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label>Tolerance</label>
            <input
              className="form-control"
              type="number"
              value={draft.toleranceNumerical ?? 0}
              onChange={(e) => setDraft((prev) => ({ ...prev, toleranceNumerical: Number(e.target.value) }))}
            />
          </div>
        </div>
      )}

      <Editor
        value={draft.solution || ''}
        minHeight={80}
        placeholder="Solution (optional)"
        onChange={(html, plain) => setDraft((prev) => ({ ...prev, solution: html, solution_plainText: plain }))}
      />

      <label>
        <input
          type="checkbox"
          checked={Boolean(draft.public)}
          onChange={(e) => setDraft((prev) => ({ ...prev, public: e.target.checked }))}
        />
        {' '}Public
      </label>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save'}</button>
        <button className="btn btn-default btn-sm" disabled={saving} onClick={onCancelEdit}>Cancel</button>
      </div>
    </div>
  )
}

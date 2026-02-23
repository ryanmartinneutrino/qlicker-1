import { useMemo } from 'react'
import type { Question, Response as QuestionResponse, Mark } from '@qlicker/shared'

interface ResponseDisplayProps {
  question: Question
  responses: QuestionResponse[]
  mark?: Mark
  studentName: string
  points?: number
  feedback?: string
  onPointsChange?: (points: number) => void
  onFeedbackChange?: (feedback: string) => void
}

function stringifyAnswer(answer: QuestionResponse['answer']): string {
  if (Array.isArray(answer)) return answer.join(', ')
  return String(answer ?? '')
}

export function ResponseDisplay({
  question,
  responses,
  mark,
  studentName,
  points = 0,
  feedback = '',
  onPointsChange,
  onFeedbackChange,
}: ResponseDisplayProps) {
  const latest = useMemo(() => {
    if (responses.length === 0) return null
    return [...responses].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
  }, [responses])

  return (
    <div className="ql-response-display">
      <div className="ql-response-display-flex" style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr 0.8fr 1.4fr', gap: '10px', alignItems: 'start' }}>
        <div>
          <strong>{studentName}</strong>
          <div style={{ fontSize: '0.9em', opacity: 0.8 }}>{question.plainText || 'Question'}</div>
        </div>
        <div>
          {latest ? (
            <div>
              <div>{stringifyAnswer(latest.answer)}</div>
              {latest.answerWysiwyg && <div style={{ marginTop: '6px', opacity: 0.8 }}>WYSIWYG response captured</div>}
            </div>
          ) : (
            <em>no response</em>
          )}
        </div>
        <div>
          <input
            type="number"
            className="numberField"
            min={0}
            max={100}
            step={0.5}
            value={Number.isFinite(points) ? points : 0}
            onChange={(e) => onPointsChange?.(Number(e.target.value))}
          />
          <span style={{ marginLeft: '6px' }}>/ {mark?.outOf ?? '-'}</span>
        </div>
        <div>
          <textarea
            className="textField"
            value={feedback}
            onChange={(e) => onFeedbackChange?.(e.target.value)}
            placeholder="Feedback"
            style={{ width: '100%', minHeight: '64px' }}
          />
        </div>
      </div>
    </div>
  )
}

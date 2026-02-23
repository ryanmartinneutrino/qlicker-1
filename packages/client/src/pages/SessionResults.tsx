import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { Session, Question, Response as QResponse } from '@qlicker/shared'
import { apiClient } from '../api/client'
import { AnswerDistribution } from '../components/AnswerDistribution'
import { ShortAnswerList } from '../components/ShortAnswerList'
import { Histogram } from '../components/Histogram'
import { sanitizeHtml } from '../utils/sanitizeHtml'

interface QuestionStats {
  questionId: string
  plainText: string
  content: string
  type: number
  totalResponses: number
  correctCount: number
  optionCounts: Record<string, number>
  options: { answer?: string; plainText?: string; content?: string; correct?: boolean }[]
  shortAnswers: string[]
  numericalAnswers: number[]
}

export default function SessionResults() {
  const { courseId, sessionId } = useParams<{ courseId: string; sessionId: string }>()

  const [session, setSession] = useState<Session | null>(null)
  const [stats, setStats] = useState<QuestionStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)

    Promise.all([
      apiClient.get<Session>(`/sessions/${sessionId}`),
      apiClient.get<Question[]>(`/questions?sessionId=${sessionId}`),
    ])
      .then(async ([s, questions]) => {
        setSession(s)

        const questionStats: QuestionStats[] = []
        for (const q of questions) {
          let responses: QResponse[] = []
          try {
            responses = await apiClient.get<QResponse[]>(`/responses?questionId=${q._id}`)
          } catch {
            responses = []
          }

          const optionCounts: Record<string, number> = {}
          let correctCount = 0
          const shortAnswers: string[] = []
          const numericalAnswers: number[] = []

          for (const r of responses) {
            if (r.correct) correctCount += 1
            if (q.type <= 2) {
              const answer = Array.isArray(r.answer) ? r.answer.join(',') : String(r.answer)
              optionCounts[answer] = (optionCounts[answer] || 0) + 1
            } else if (q.type === 3) {
              shortAnswers.push(Array.isArray(r.answer) ? r.answer.join(', ') : String(r.answer))
            } else if (q.type === 4) {
              const parsed = Number(Array.isArray(r.answer) ? r.answer[0] : r.answer)
              if (!Number.isNaN(parsed)) numericalAnswers.push(parsed)
            }
          }

          questionStats.push({
            questionId: q._id!,
            plainText: q.plainText || 'Question',
            content: q.content || q.plainText || '',
            type: q.type,
            totalResponses: responses.length,
            correctCount,
            optionCounts,
            options: q.options || [],
            shortAnswers,
            numericalAnswers,
          })
        }
        setStats(questionStats)
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [sessionId])

  if (loading) return <div className="page">Loading...</div>
  if (error) return <div className="page">Error: {error}</div>
  if (!session) return <div className="page">Session not found</div>

  return (
    <div className="page">
      <div className="ql-header-bar">
        <h1>Results: {session.name}</h1>
      </div>

      <div className="container">
        <Link className="btn btn-secondary" to={`/course/${courseId}`} style={{ marginBottom: '1rem', display: 'inline-block' }}>
          Back to Course
        </Link>

        {stats.length === 0 ? (
          <p>No questions or responses for this session.</p>
        ) : (
          stats.map((qs, i) => (
            <div key={qs.questionId} className="ql-card" style={{ marginBottom: '1rem' }}>
              <div className="ql-card-content">
                <h3>Q{i + 1}: {qs.plainText}</h3>
                <div
                  className="ql-question-content"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(qs.content) }}
                />
                <p>
                  Total responses: <strong>{qs.totalResponses}</strong> |
                  Correct: <strong>{qs.correctCount}</strong>
                  {qs.totalResponses > 0 && (
                    <> ({Math.round((qs.correctCount / qs.totalResponses) * 100)}%)</>
                  )}
                </p>

                {qs.type <= 2 && (
                  <AnswerDistribution
                    options={qs.options}
                    optionCounts={qs.optionCounts}
                    totalResponses={qs.totalResponses}
                  />
                )}
                {qs.type === 3 && <ShortAnswerList answers={qs.shortAnswers} />}
                {qs.type === 4 && <Histogram values={qs.numericalAnswers} />}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

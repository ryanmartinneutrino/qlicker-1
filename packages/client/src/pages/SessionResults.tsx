import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { Session, Question, Response as QResponse } from '@qlicker/shared'
import { apiClient } from '../api/client'

interface QuestionStats {
  questionId: string
  plainText: string
  totalResponses: number
  correctCount: number
  optionCounts: Record<string, number>
  options: { answer?: string; plainText?: string; content?: string; correct?: boolean }[]
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
            // responses may not be available
          }
          const optionCounts: Record<string, number> = {}
          let correctCount = 0
          for (const r of responses) {
            const ans = Array.isArray(r.answer) ? r.answer.join(',') : r.answer
            optionCounts[ans] = (optionCounts[ans] || 0) + 1
            if (r.correct) correctCount++
          }
          questionStats.push({
            questionId: q._id!,
            plainText: q.plainText || 'Question',
            totalResponses: responses.length,
            correctCount,
            optionCounts,
            options: q.options || [],
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
                <p>
                  Total responses: <strong>{qs.totalResponses}</strong> |
                  Correct: <strong>{qs.correctCount}</strong>
                  {qs.totalResponses > 0 && (
                    <> ({Math.round((qs.correctCount / qs.totalResponses) * 100)}%)</>
                  )}
                </p>
                {qs.options.length > 0 && (
                  <div style={{ marginTop: '0.5rem' }}>
                    {qs.options.map((opt, oi) => {
                      const label = String.fromCharCode(65 + oi)
                      const count = qs.optionCounts[label] || qs.optionCounts[String(oi)] || 0
                      const pct = qs.totalResponses > 0 ? Math.round((count / qs.totalResponses) * 100) : 0
                      return (
                        <div key={oi} style={{ marginBottom: '0.25rem' }}>
                          <strong>{label}.</strong> {opt.plainText || opt.answer || opt.content || `Option ${oi + 1}`}
                          {' — '}
                          <span style={{ color: opt.correct ? '#5ACE5F' : 'inherit' }}>
                            {count} ({pct}%)
                          </span>
                          <div
                            style={{
                              height: '8px',
                              width: `${pct}%`,
                              backgroundColor: opt.correct ? '#5ACE5F' : '#30B0E7',
                              borderRadius: '4px',
                              marginTop: '2px',
                            }}
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

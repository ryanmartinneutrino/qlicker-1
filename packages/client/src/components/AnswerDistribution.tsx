interface AnswerDistributionProps {
  options: Array<{ answer?: string; plainText?: string; content?: string; correct?: boolean }>
  optionCounts: Record<string, number>
  totalResponses: number
}

export function AnswerDistribution({ options, optionCounts, totalResponses }: AnswerDistributionProps) {
  return (
    <div style={{ marginTop: '0.5rem' }}>
      {options.map((opt, index) => {
        const label = String.fromCharCode(65 + index)
        const count = optionCounts[label] || optionCounts[String(index)] || 0
        const pct = totalResponses > 0 ? Math.round((count / totalResponses) * 100) : 0
        return (
          <div key={index} style={{ marginBottom: '0.4rem' }}>
            <strong>{label}.</strong> {opt.plainText || opt.answer || opt.content || `Option ${index + 1}`}
            {' — '}
            <span style={{ color: opt.correct ? '#2f8f44' : 'inherit' }}>
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
  )
}

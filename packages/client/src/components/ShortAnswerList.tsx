interface ShortAnswerListProps {
  answers: string[]
}

export function ShortAnswerList({ answers }: ShortAnswerListProps) {
  if (answers.length === 0) return <p style={{ marginTop: '0.5rem' }}>No short answers submitted.</p>
  return (
    <div style={{ marginTop: '0.5rem', maxHeight: 220, overflowY: 'auto', border: '1px solid #eee', borderRadius: 4 }}>
      {answers.map((answer, index) => (
        <div key={`${answer}-${index}`} style={{ padding: '0.4rem 0.6rem', borderBottom: '1px solid #f3f3f3' }}>
          {answer}
        </div>
      ))}
    </div>
  )
}

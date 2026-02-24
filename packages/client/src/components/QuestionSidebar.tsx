import type { Question } from '@qlicker/shared'

interface QuestionSidebarProps {
  questions: Question[]
  currentIndex: number
  onSelect: (index: number) => void
  title?: string
}

function preview(text: string | undefined): string {
  if (!text) return 'Question'
  return text.length > 40 ? `${text.slice(0, 40)}...` : text
}

export function QuestionSidebar({ questions, currentIndex, onSelect, title = 'Questions' }: QuestionSidebarProps) {
  return (
    <div>
      <h3>{title}</h3>
      <ul className="ql-question-nav" style={{ listStyle: 'none', padding: 0 }}>
        {questions.map((q, index) => (
          <li
            key={q._id || `${index}`}
            style={{
              padding: '0.5rem',
              cursor: 'pointer',
              backgroundColor: index === currentIndex ? '#30B0E7' : 'transparent',
              color: index === currentIndex ? '#fff' : 'inherit',
              borderRadius: '4px',
              marginBottom: '2px',
            }}
            onClick={() => onSelect(index)}
          >
            Q{index + 1}: {preview(q.plainText)}
          </li>
        ))}
      </ul>
    </div>
  )
}

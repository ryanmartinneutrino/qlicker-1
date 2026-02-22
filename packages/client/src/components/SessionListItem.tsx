import type { Session } from '@qlicker/shared'

const SESSION_STATUS_STRINGS: Record<string, string> = {
  hidden: 'Draft',
  visible: 'Upcoming',
  running: '• Live',
  done: 'Ended',
  submitted: 'Submitted',
}

interface ControlAction {
  label: string
  click: () => void
}

interface SessionListItemProps {
  session: Session
  click?: () => void
  controls?: ControlAction[]
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = new Date(d)
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function SessionListItem({ session, click, controls }: SessionListItemProps) {
  const status = session.status
  const strStatus = SESSION_STATUS_STRINGS[status] || status
  const statusClassName = `ql-session-status ql-${status}`

  const showTime = session.date || session.quizStart || session.quizEnd
  let timeString = ''
  if (session.date) {
    timeString = formatDate(session.date)
  } else if (session.quizEnd && status === 'done') {
    timeString = `Closed ${formatDate(session.quizEnd)}`
  } else if (session.quizStart) {
    timeString = formatDate(session.quizStart)
  } else if (session.quizEnd) {
    timeString = formatDate(session.quizEnd)
  }

  return (
    <div className="ql-session-list-item ql-list-item" onClick={click}>
      <div className="row">
        <div className="col-md-2 col-xs-4 col-sm-3 status-col">
          <span className={statusClassName}>{strStatus}</span>
        </div>
        <div className={controls ? 'col-md-6 col-sm-5 col-xs-8' : 'col-md-7 col-sm-6 col-xs-8'}>
          <span className="ql-session-name">{session.name}</span>
          {showTime && (
            <span>
              <span className="active-time">{timeString}</span>
            </span>
          )}
        </div>
      </div>
      {controls && controls.length > 0 && (
        <div className="controls">
          {controls.map((action) => (
            <a
              key={action.label}
              href="#"
              className="toolbar-button"
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                action.click()
              }}
            >
              {action.label}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

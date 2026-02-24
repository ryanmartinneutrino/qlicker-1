import type { Session } from '@qlicker/shared'

interface SessionDetailsProps {
  session: Session
  onUpdateStatus: (status: string) => void
  onBack: () => void
  backLabel?: string
}

export function SessionDetails({ session, onUpdateStatus, onBack, backLabel = 'Back to Course' }: SessionDetailsProps) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
      {session.status === 'hidden' && (
        <button className="btn btn-primary" onClick={() => onUpdateStatus('visible')}>
          Make Visible
        </button>
      )}
      {(session.status === 'visible' || session.status === 'hidden') && (
        <button className="btn btn-primary" onClick={() => onUpdateStatus('running')}>
          Start Session
        </button>
      )}
      {session.status === 'running' && (
        <button className="btn btn-secondary" onClick={() => onUpdateStatus('done')}>
          Stop Session
        </button>
      )}
      <button className="btn btn-secondary" onClick={onBack}>
        {backLabel}
      </button>
    </div>
  )
}

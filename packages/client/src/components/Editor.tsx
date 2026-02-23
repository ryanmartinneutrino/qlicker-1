import { useEffect, useMemo, useRef } from 'react'

interface EditorProps {
  value: string
  placeholder?: string
  minHeight?: number
  onChange: (html: string, plainText: string) => void
}

export function Editor({ value, placeholder, minHeight = 120, onChange }: EditorProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const lastValueRef = useRef<string>(value)
  const toolbarActions = useMemo(
    () => [
      { label: 'B', command: 'bold' },
      { label: 'I', command: 'italic' },
      { label: 'U', command: 'underline' },
      { label: 'UL', command: 'insertUnorderedList' },
      { label: 'OL', command: 'insertOrderedList' },
    ],
    []
  )

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (value !== lastValueRef.current) {
      root.innerHTML = value || ''
      lastValueRef.current = value || ''
    }
  }, [value])

  const emitChange = () => {
    const root = rootRef.current
    if (!root) return
    const html = root.innerHTML
    const plainText = root.innerText
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    lastValueRef.current = html
    onChange(html, plainText)
  }

  const applyCommand = (command: string) => {
    if (command === 'createLink') {
      const url = window.prompt('Enter URL')
      if (!url) return
      document.execCommand('createLink', false, url)
    } else {
      document.execCommand(command, false)
    }
    emitChange()
    rootRef.current?.focus()
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
        {toolbarActions.map((action) => (
          <button
            key={action.command}
            type="button"
            className="btn btn-default btn-sm"
            onClick={() => applyCommand(action.command)}
          >
            {action.label}
          </button>
        ))}
        <button type="button" className="btn btn-default btn-sm" onClick={() => applyCommand('createLink')}>
          Link
        </button>
        <button type="button" className="btn btn-default btn-sm" onClick={() => applyCommand('removeFormat')}>
          Clear
        </button>
      </div>
      <div
        ref={rootRef}
        contentEditable
        suppressContentEditableWarning
        className="form-control"
        onInput={emitChange}
        data-placeholder={placeholder || ''}
        style={{ minHeight, height: 'auto', overflowY: 'auto' }}
      />
    </div>
  )
}

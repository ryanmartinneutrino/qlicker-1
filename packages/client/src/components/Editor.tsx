import { useEffect, useMemo, useRef } from 'react'
import { sanitizeHtml } from '../utils/sanitizeHtml'

interface EditorProps {
  value: string
  placeholder?: string
  minHeight?: number
  onChange: (html: string, plainText: string) => void
}

export function normalizeEditorPlainText(input: string): string {
  return input
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function sanitizeEditorLink(url: string): string | null {
  const value = url.trim()
  if (!value) return null
  if (value.startsWith('/')) return value
  const lower = value.toLowerCase()
  if (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('tel:')
  ) {
    return value
  }
  return null
}

export function extractEditorChange(root: HTMLElement): { html: string; plainText: string } {
  const html = sanitizeHtml(root.innerHTML)
  const plainText = normalizeEditorPlainText(root.innerText)
  return { html, plainText }
}

export function Editor({ value, placeholder, minHeight = 120, onChange }: EditorProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const lastValueRef = useRef<string>(value)
  type ToolbarAction = { label: string; command: string; value?: string }
  const toolbarActions = useMemo(
    (): ToolbarAction[] => [
      { label: 'B', command: 'bold' },
      { label: 'I', command: 'italic' },
      { label: 'U', command: 'underline' },
      { label: 'S', command: 'strikeThrough' },
      { label: 'H3', command: 'formatBlock', value: 'h3' },
      { label: 'P', command: 'formatBlock', value: 'p' },
      { label: 'UL', command: 'insertUnorderedList' },
      { label: 'OL', command: 'insertOrderedList' },
    ],
    []
  )

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (value !== lastValueRef.current) {
      root.innerHTML = sanitizeHtml(value || '')
      lastValueRef.current = value || ''
    }
  }, [value])

  const emitChange = () => {
    const root = rootRef.current
    if (!root) return
    const { html, plainText } = extractEditorChange(root)
    if (root.innerHTML !== html) root.innerHTML = html
    lastValueRef.current = html
    onChange(html, plainText)
  }

  const applyCommand = (command: string, value?: string) => {
    if (command === 'createLink') {
      const url = window.prompt('Enter URL')
      if (!url) return
      const safeUrl = sanitizeEditorLink(url)
      if (!safeUrl) {
        window.alert('Please enter a valid link (http/https/mailto/tel or relative path).')
        return
      }
      document.execCommand('createLink', false, safeUrl)
    } else if (command === 'formatBlock' && value) {
      document.execCommand(command, false, value)
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
            onClick={() => applyCommand(action.command, action.value)}
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

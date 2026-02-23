import { describe, expect, it } from 'vitest'
import { extractEditorChange, normalizeEditorPlainText, sanitizeEditorLink } from './Editor'

describe('normalizeEditorPlainText', () => {
  it('normalizes repeated whitespace and non-breaking spaces', () => {
    expect(normalizeEditorPlainText('  Hello\u00a0\u00a0 world \n\n test  ')).toBe('Hello world test')
  })
})

describe('sanitizeEditorLink', () => {
  it('allows safe protocols and relative links', () => {
    expect(sanitizeEditorLink('https://example.com')).toBe('https://example.com')
    expect(sanitizeEditorLink('mailto:test@example.com')).toBe('mailto:test@example.com')
    expect(sanitizeEditorLink('/course/abc')).toBe('/course/abc')
  })

  it('rejects unsafe links', () => {
    expect(sanitizeEditorLink('javascript:alert(1)')).toBeNull()
    expect(sanitizeEditorLink('data:text/html;base64,abcd')).toBeNull()
  })
})

describe('extractEditorChange', () => {
  it('returns sanitized html and normalized plain text', () => {
    const root = {
      innerHTML: '<p onclick="evil()">Hi</p><script>alert(1)</script>',
      innerText: 'Hi   there',
    } as HTMLElement

    const change = extractEditorChange(root)
    expect(change.html).toContain('<p')
    expect(change.html).not.toContain('onclick=')
    expect(change.html).not.toContain('<script')
    expect(change.plainText).toBe('Hi there')
  })
})

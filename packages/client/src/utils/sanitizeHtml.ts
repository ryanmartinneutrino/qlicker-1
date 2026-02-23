/**
 * Lightweight HTML sanitizer for question content. Removes script/style/iframe
 * tags, inline event handlers, and javascript: URLs.
 */
export function sanitizeHtml(input: string): string {
  if (!input) return ''
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return input
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
  }

  const parser = new DOMParser()
  const document = parser.parseFromString(input, 'text/html')

  document.querySelectorAll('script, style, iframe, object, embed').forEach((node) => node.remove())

  document.querySelectorAll('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim().toLowerCase()
      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name)
        continue
      }
      if ((name === 'href' || name === 'src') && value.startsWith('javascript:')) {
        element.removeAttribute(attribute.name)
      }
    }
  })

  return document.body.innerHTML
}

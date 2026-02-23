const BASE_URL = '/api'

let csrfToken: string | null = null

async function parseResponseBody(res: Response): Promise<unknown> {
  const contentType = res.headers.get('content-type') || ''
  const raw = await res.text()
  if (!raw) return null
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(raw)
    } catch {
      throw new Error(`Invalid JSON response from ${res.url}`)
    }
  }
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/** Fetch and cache the CSRF token from the server */
async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken
  const res = await fetch(`${BASE_URL}/csrf-token`, { credentials: 'include' })
  const data = await parseResponseBody(res) as { csrfToken?: string } | string | null
  if (!data || typeof data === 'string' || !data.csrfToken) {
    throw new Error('Could not retrieve CSRF token from API.')
  }
  csrfToken = data.csrfToken
  return csrfToken
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // Include CSRF token for state-changing requests
  if (method !== 'GET') {
    headers['x-csrf-token'] = await getCsrfToken()
  }

  const options: RequestInit = {
    method,
    credentials: 'include',
    headers,
  }
  if (body !== undefined) {
    options.body = JSON.stringify(body)
  }

  const res = await fetch(`${BASE_URL}${path}`, options)
  const body = await parseResponseBody(res)

  if (!res.ok) {
    // If CSRF token is stale, clear cache and retry once
    if (res.status === 403 && method !== 'GET') {
      csrfToken = null
      headers['x-csrf-token'] = await getCsrfToken()
      const retry = await fetch(`${BASE_URL}${path}`, { ...options, headers })
      const retryBody = await parseResponseBody(retry)
      if (!retry.ok) {
        const retryMessage = typeof retryBody === 'object' && retryBody && 'error' in retryBody
          ? String((retryBody as { error?: string }).error)
          : `Request failed: ${retry.status}`
        throw new Error(retryMessage)
      }
      return retryBody as T
    }
    const message = typeof body === 'object' && body && 'error' in body
      ? String((body as { error?: string }).error)
      : typeof body === 'string'
        ? `Request failed: ${res.status} (${body.slice(0, 120)})`
        : `Request failed: ${res.status}`
    throw new Error(message)
  }

  return body as T
}

export const apiClient = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  upload: async <T>(path: string, formData: FormData) => {
    const token = await getCsrfToken()
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'x-csrf-token': token },
      body: formData,
    })
    const body = await parseResponseBody(res)
    if (!res.ok) {
      const message = typeof body === 'object' && body && 'error' in body
        ? String((body as { error?: string }).error)
        : `Request failed: ${res.status}`
      throw new Error(message)
    }
    return body as T
  },
}

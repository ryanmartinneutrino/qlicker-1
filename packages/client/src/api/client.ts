const BASE_URL = '/api'

let csrfToken: string | null = null

/** Fetch and cache the CSRF token from the server */
async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken
  const res = await fetch(`${BASE_URL}/csrf-token`, { credentials: 'include' })
  const data = await res.json() as { csrfToken: string }
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
  const json = await res.json()

  if (!res.ok) {
    // If CSRF token is stale, clear cache and retry once
    if (res.status === 403 && method !== 'GET') {
      csrfToken = null
      headers['x-csrf-token'] = await getCsrfToken()
      const retry = await fetch(`${BASE_URL}${path}`, { ...options, headers })
      const retryJson = await retry.json()
      if (!retry.ok) throw new Error(retryJson.error || `Request failed: ${retry.status}`)
      return retryJson as T
    }
    throw new Error((json as { error?: string }).error || `Request failed: ${res.status}`)
  }

  return json as T
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
    const json = await res.json()
    if (!res.ok) throw new Error((json as { error?: string }).error || `Request failed: ${res.status}`)
    return json as T
  },
}

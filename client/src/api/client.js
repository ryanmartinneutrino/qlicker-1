import axios from 'axios';

// In-memory token storage — not accessible to XSS like localStorage.
// On page reload the token is lost; the first 401 triggers a refresh via the
// httpOnly cookie, which transparently restores the access token.
let accessToken = null;
let refreshRequest = null;
const EXPLICIT_LOGOUT_KEY = 'qlicker_explicit_logout';

function safeStorage(action) {
  try {
    return action();
  } catch {
    return null;
  }
}

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function clearAccessToken() {
  accessToken = null;
}

export function markExplicitLogout() {
  safeStorage(() => localStorage.setItem(EXPLICIT_LOGOUT_KEY, '1'));
}

export function clearExplicitLogout() {
  safeStorage(() => localStorage.removeItem(EXPLICIT_LOGOUT_KEY));
}

export function hasExplicitLogout() {
  return safeStorage(() => localStorage.getItem(EXPLICIT_LOGOUT_KEY) === '1') === true;
}

export async function refreshAccessToken() {
  if (hasExplicitLogout()) {
    throw new Error('Refresh suppressed after explicit logout');
  }
  if (!refreshRequest) {
    refreshRequest = axios.post('/api/v1/auth/refresh', {}, {
      withCredentials: true,
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    }).then(({ data }) => {
      if (!data?.token) {
        throw new Error('Missing access token in refresh response');
      }
      setAccessToken(data.token);
      return data.token;
    }).finally(() => {
      refreshRequest = null;
    });
  }
  return refreshRequest;
}

const apiClient = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
  },
});

// Attach JWT token to every request
apiClient.interceptors.request.use((config) => {
  config.headers = config.headers || {};
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Handle 401 responses - attempt refresh or redirect to login
// Skip retry for auth endpoints (login/register) so error messages display properly
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isAuthEndpoint = originalRequest?.url?.startsWith('/auth/');
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;
      try {
        const refreshedToken = await refreshAccessToken();
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${refreshedToken}`;
        return apiClient(originalRequest);
      } catch {
        clearAccessToken();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;

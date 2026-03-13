import axios from 'axios';

// In-memory token storage — not accessible to XSS like localStorage.
// On page reload the token is lost; the first 401 triggers a refresh via the
// httpOnly cookie, which transparently restores the access token.
let accessToken = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function clearAccessToken() {
  accessToken = null;
}

const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
  },
});

// Attach JWT token to every request
apiClient.interceptors.request.use((config) => {
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
        const { data } = await axios.post('/api/v1/auth/refresh', {}, {
          withCredentials: true,
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
        setAccessToken(data.token);
        originalRequest.headers.Authorization = `Bearer ${data.token}`;
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

import axios, { AxiosError, AxiosRequestConfig } from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Helper to get auth data from localStorage (individual keys or Zustand persist)
function getStoredAuthData() {
  let refreshToken = localStorage.getItem('refreshToken');
  let userId = localStorage.getItem('userId');

  // Fallback: read from Zustand persist storage if individual keys are missing
  if (!refreshToken || !userId) {
    try {
      const authStorage = localStorage.getItem('auth-storage');
      if (authStorage) {
        const parsed = JSON.parse(authStorage);
        const state = parsed?.state;
        if (!refreshToken && state?.refreshToken) refreshToken = state.refreshToken;
        if (!userId && state?.user?.id) userId = state.user.id;
      }
    } catch {
      // ignore parse errors
    }
  }

  return { refreshToken, userId };
}

// Response interceptor for token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const { refreshToken, userId } = getStoredAuthData();

      if (!refreshToken || !userId) {
        // No refresh data available - clear everything and let AuthProvider redirect
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('userId');
        localStorage.removeItem('auth-storage');
        return Promise.reject(error);
      }

      try {
        const response = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {
          refreshToken,
          userId,
        });

        // Response is wrapped: { success, data: { accessToken, refreshToken } }
        const tokenData = response.data.data || response.data;
        const { accessToken, refreshToken: newRefreshToken } = tokenData;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', newRefreshToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        }

        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed - clear ALL auth state including Zustand persist
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('userId');
        localStorage.removeItem('auth-storage');
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

// API helper functions
export const apiGet = <T>(url: string, config?: AxiosRequestConfig) =>
  api.get<T>(url, config).then((res) => res.data);

export const apiPost = <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
  api.post<T>(url, data, config).then((res) => res.data);

export const apiPut = <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
  api.put<T>(url, data, config).then((res) => res.data);

export const apiDelete = <T>(url: string, config?: AxiosRequestConfig) =>
  api.delete<T>(url, config).then((res) => res.data);

// File upload helper
export const uploadFile = async (
  url: string,
  file: File,
  onProgress?: (progress: number) => void,
  extraFields?: Record<string, string>,
) => {
  const formData = new FormData();
  formData.append('file', file);
  if (extraFields) {
    Object.entries(extraFields).forEach(([key, value]) => formData.append(key, value));
  }

  const response = await api.post(url, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(progress);
      }
    },
  });

  return response.data;
};

/**
 * Extract a user-friendly error message from an API error response.
 * Maps HTTP status codes to descriptive messages with context-specific fallbacks.
 */
export function getApiErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  const axiosError = error as AxiosError<{
    message?: string | string[];
    error?: string;
    statusCode?: number;
  }>;

  const status = axiosError?.response?.status;
  const data = axiosError?.response?.data;
  const serverMessage = data?.message;

  // Use server-provided message if available
  if (serverMessage) {
    return Array.isArray(serverMessage) ? serverMessage.join('. ') : serverMessage;
  }

  // Map common HTTP status codes to user-friendly messages
  switch (status) {
    case 400:
      return data?.error || 'Invalid request. Please check your input and try again.';
    case 401:
      return 'Invalid credentials. Please check your email and password.';
    case 403:
      return 'You do not have permission to perform this action.';
    case 404:
      return 'The requested resource was not found.';
    case 409:
      return 'This record already exists. Please use different details.';
    case 413:
      return 'The file is too large. Please upload a smaller file.';
    case 422:
      return 'The submitted data is invalid. Please review and correct your input.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    case 500:
      return 'An internal server error occurred. Please try again later.';
    case 502:
    case 503:
    case 504:
      return 'The server is temporarily unavailable. Please try again later.';
    default:
      // Network error (no response)
      if (!axiosError?.response) {
        return 'Unable to connect to the server. Please check your internet connection.';
      }
      return fallback;
  }
}

export default api;

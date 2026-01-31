import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { InternalAxiosRequestConfig, AxiosResponse } from 'axios';

// ---------------------------------------------------------------------------
// vi.hoisted ensures these are available to the hoisted vi.mock factory
// ---------------------------------------------------------------------------
const {
  mockGet,
  mockPost,
  mockPut,
  mockDelete,
  mockRequestUse,
  mockResponseUse,
  standalonePost,
  requestFulfilled,
  requestRejected,
  responseFulfilled,
  responseRejected,
  createConfig,
  callableApi,
} = vi.hoisted(() => {
  const requestFulfilled: any[] = [];
  const requestRejected: any[] = [];
  const responseFulfilled: any[] = [];
  const responseRejected: any[] = [];
  const createConfig: { value: any } = { value: null };

  const mockGet = vi.fn();
  const mockPost = vi.fn();
  const mockPut = vi.fn();
  const mockDelete = vi.fn();
  const mockRequestUse = vi.fn((ful: any, rej: any) => {
    requestFulfilled.push(ful);
    requestRejected.push(rej);
  });
  const mockResponseUse = vi.fn((ful: any, rej: any) => {
    responseFulfilled.push(ful);
    responseRejected.push(rej);
  });
  const standalonePost = vi.fn();

  // callable mock that also has .get, .post, etc.
  const callableApi = vi.fn();
  (callableApi as any).defaults = { baseURL: '', headers: {}, withCredentials: false };
  (callableApi as any).interceptors = {
    request: { use: mockRequestUse },
    response: { use: mockResponseUse },
  };
  (callableApi as any).get = mockGet;
  (callableApi as any).post = mockPost;
  (callableApi as any).put = mockPut;
  (callableApi as any).delete = mockDelete;

  return {
    mockGet,
    mockPost,
    mockPut,
    mockDelete,
    mockRequestUse,
    mockResponseUse,
    standalonePost,
    requestFulfilled,
    requestRejected,
    responseFulfilled,
    responseRejected,
    createConfig,
    callableApi,
  };
});

vi.mock('axios', () => ({
  default: {
    create: vi.fn((config: any) => {
      createConfig.value = config;
      return callableApi;
    }),
    post: standalonePost,
  },
  AxiosError: class AxiosError extends Error {},
}));

// Import after mocking
import { api, apiGet, apiPost, apiPut, apiDelete, uploadFile, getApiErrorMessage } from './api';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('api module', () => {
  beforeEach(() => {
    localStorage.clear();
    mockGet.mockReset();
    mockPost.mockReset();
    mockPut.mockReset();
    mockDelete.mockReset();
    standalonePost.mockReset();
    callableApi.mockReset();
  });

  // -----------------------------------------------------------------------
  // axios.create configuration
  // -----------------------------------------------------------------------
  describe('axios instance configuration', () => {
    it('creates instance with baseURL ending in /api', () => {
      expect(createConfig.value.baseURL).toMatch(/\/api$/);
    });

    it('defaults to http://localhost:4000/api when env var is not set', () => {
      expect(createConfig.value.baseURL).toBe('http://localhost:4000/api');
    });

    it('sets Content-Type to application/json', () => {
      expect(createConfig.value.headers['Content-Type']).toBe('application/json');
    });

    it('enables withCredentials', () => {
      expect(createConfig.value.withCredentials).toBe(true);
    });

    it('exports the api instance', () => {
      expect(api).toBeDefined();
    });

    it('exports all helper functions', () => {
      expect(typeof apiGet).toBe('function');
      expect(typeof apiPost).toBe('function');
      expect(typeof apiPut).toBe('function');
      expect(typeof apiDelete).toBe('function');
      expect(typeof uploadFile).toBe('function');
      expect(typeof getApiErrorMessage).toBe('function');
    });
  });

  // -----------------------------------------------------------------------
  // Request interceptor
  // -----------------------------------------------------------------------
  describe('request interceptor', () => {
    it('registers a request interceptor', () => {
      expect(requestFulfilled.length).toBeGreaterThan(0);
    });

    it('adds Authorization header when accessToken exists in localStorage', () => {
      localStorage.setItem('accessToken', 'test-token-xyz');
      const config = { headers: {} } as InternalAxiosRequestConfig;

      const result = requestFulfilled[0](config);
      expect(result.headers.Authorization).toBe('Bearer test-token-xyz');
    });

    it('does not add Authorization header when no token in localStorage', () => {
      const config = { headers: {} } as InternalAxiosRequestConfig;

      const result = requestFulfilled[0](config);
      expect(result.headers.Authorization).toBeUndefined();
    });

    it('rejects errors in request interceptor', async () => {
      const error = new Error('Request setup failed');
      await expect(requestRejected[0](error)).rejects.toThrow('Request setup failed');
    });
  });

  // -----------------------------------------------------------------------
  // Response interceptor
  // -----------------------------------------------------------------------
  describe('response interceptor', () => {
    it('registers a response interceptor', () => {
      expect(responseFulfilled.length).toBeGreaterThan(0);
    });

    it('passes successful responses through unchanged', () => {
      const response = { data: { ok: true }, status: 200 } as AxiosResponse;
      expect(responseFulfilled[0](response)).toBe(response);
    });

    it('rejects non-401 errors without attempting refresh', async () => {
      const error = {
        response: { status: 403 },
        config: { _retry: false, headers: {} },
      };

      await expect(responseRejected[0](error)).rejects.toBe(error);
      expect(standalonePost).not.toHaveBeenCalled();
    });

    it('rejects 404 errors without refresh attempt', async () => {
      const error = { response: { status: 404 }, config: { headers: {} } };
      await expect(responseRejected[0](error)).rejects.toBe(error);
      expect(standalonePost).not.toHaveBeenCalled();
    });

    it('rejects 500 errors without refresh attempt', async () => {
      const error = { response: { status: 500 }, config: { headers: {} } };
      await expect(responseRejected[0](error)).rejects.toBe(error);
      expect(standalonePost).not.toHaveBeenCalled();
    });

    it('does not retry if _retry is already true', async () => {
      localStorage.setItem('refreshToken', 'rt');
      localStorage.setItem('userId', 'uid');

      const error = {
        response: { status: 401 },
        config: { _retry: true, headers: {} },
      };

      await expect(responseRejected[0](error)).rejects.toBe(error);
      expect(standalonePost).not.toHaveBeenCalled();
    });

    it('clears auth state on 401 when no refreshToken is available', async () => {
      localStorage.setItem('accessToken', 'old-at');

      const error = {
        response: { status: 401 },
        config: { _retry: false, headers: {} },
      };

      await expect(responseRejected[0](error)).rejects.toBe(error);

      expect(localStorage.getItem('accessToken')).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
      expect(localStorage.getItem('userId')).toBeNull();
    });

    it('clears auth-storage on 401 when no refreshToken is available', async () => {
      localStorage.setItem('auth-storage', '{"state":{}}');

      const error = {
        response: { status: 401 },
        config: { _retry: false, headers: {} },
      };

      await expect(responseRejected[0](error)).rejects.toBe(error);
      expect(localStorage.getItem('auth-storage')).toBeNull();
    });

    it('attempts token refresh on 401 when refreshToken and userId exist', async () => {
      localStorage.setItem('refreshToken', 'old-refresh');
      localStorage.setItem('userId', 'user-1');

      standalonePost.mockResolvedValueOnce({
        data: { data: { accessToken: 'new-access', refreshToken: 'new-refresh' } },
      });
      callableApi.mockResolvedValueOnce({ data: { retried: true } });

      const error = {
        response: { status: 401 },
        config: { _retry: false, headers: {} },
      };

      await responseRejected[0](error);

      expect(standalonePost).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/refresh'),
        { refreshToken: 'old-refresh', userId: 'user-1' },
      );
    });

    it('stores new tokens in localStorage after successful refresh', async () => {
      localStorage.setItem('refreshToken', 'old-rt');
      localStorage.setItem('userId', 'uid');

      standalonePost.mockResolvedValueOnce({
        data: { data: { accessToken: 'new-at', refreshToken: 'new-rt' } },
      });
      callableApi.mockResolvedValueOnce({ data: {} });

      const error = {
        response: { status: 401 },
        config: { _retry: false, headers: {} },
      };

      await responseRejected[0](error);

      expect(localStorage.getItem('accessToken')).toBe('new-at');
      expect(localStorage.getItem('refreshToken')).toBe('new-rt');
    });

    it('sets Authorization header on retried request', async () => {
      localStorage.setItem('refreshToken', 'rt');
      localStorage.setItem('userId', 'uid');

      standalonePost.mockResolvedValueOnce({
        data: { data: { accessToken: 'fresh-token', refreshToken: 'fresh-rt' } },
      });
      callableApi.mockResolvedValueOnce({ data: {} });

      const originalConfig = { _retry: false, headers: {} as Record<string, string> };
      const error = { response: { status: 401 }, config: originalConfig };

      await responseRejected[0](error);

      expect(originalConfig.headers.Authorization).toBe('Bearer fresh-token');
    });

    it('retries the original request after successful refresh', async () => {
      localStorage.setItem('refreshToken', 'rt');
      localStorage.setItem('userId', 'uid');

      standalonePost.mockResolvedValueOnce({
        data: { data: { accessToken: 'new-at', refreshToken: 'new-rt' } },
      });
      const retryResponse = { data: { retried: true } };
      callableApi.mockResolvedValueOnce(retryResponse);

      const originalConfig = { _retry: false, headers: {} };
      const error = { response: { status: 401 }, config: originalConfig };

      const result = await responseRejected[0](error);

      expect(callableApi).toHaveBeenCalledWith(originalConfig);
      expect(result).toBe(retryResponse);
    });

    it('clears all auth state when refresh request fails', async () => {
      localStorage.setItem('refreshToken', 'old-rt');
      localStorage.setItem('userId', 'uid');
      localStorage.setItem('accessToken', 'old-at');
      localStorage.setItem('auth-storage', '{"state":{}}');

      const refreshError = new Error('Refresh failed');
      standalonePost.mockRejectedValueOnce(refreshError);

      const error = {
        response: { status: 401 },
        config: { _retry: false, headers: {} },
      };

      await expect(responseRejected[0](error)).rejects.toBe(refreshError);

      expect(localStorage.getItem('accessToken')).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
      expect(localStorage.getItem('userId')).toBeNull();
      expect(localStorage.getItem('auth-storage')).toBeNull();
    });

    it('reads refreshToken from Zustand persist storage as fallback', async () => {
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          state: {
            refreshToken: 'zustand-refresh',
            user: { id: 'zustand-user' },
          },
        }),
      );

      standalonePost.mockResolvedValueOnce({
        data: { data: { accessToken: 'new-at', refreshToken: 'new-rt' } },
      });
      callableApi.mockResolvedValueOnce({ data: {} });

      const error = {
        response: { status: 401 },
        config: { _retry: false, headers: {} },
      };

      await responseRejected[0](error);

      expect(standalonePost).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/refresh'),
        { refreshToken: 'zustand-refresh', userId: 'zustand-user' },
      );
    });

    it('handles refresh response without nested data wrapper', async () => {
      localStorage.setItem('refreshToken', 'rt');
      localStorage.setItem('userId', 'uid');

      standalonePost.mockResolvedValueOnce({
        data: { accessToken: 'direct-at', refreshToken: 'direct-rt' },
      });
      callableApi.mockResolvedValueOnce({ data: {} });

      const error = {
        response: { status: 401 },
        config: { _retry: false, headers: {} },
      };

      await responseRejected[0](error);

      expect(localStorage.getItem('accessToken')).toBe('direct-at');
      expect(localStorage.getItem('refreshToken')).toBe('direct-rt');
    });

    it('handles malformed auth-storage JSON gracefully', async () => {
      localStorage.setItem('auth-storage', 'not valid json');

      const error = {
        response: { status: 401 },
        config: { _retry: false, headers: {} },
      };

      await expect(responseRejected[0](error)).rejects.toBe(error);
    });
  });

  // -----------------------------------------------------------------------
  // Helper functions: apiGet, apiPost, apiPut, apiDelete
  // -----------------------------------------------------------------------
  describe('apiGet', () => {
    it('calls api.get and unwraps response data', async () => {
      const mockData = { items: [1, 2, 3] };
      mockGet.mockResolvedValueOnce({ data: mockData });

      const result = await apiGet('/test-endpoint');

      expect(mockGet).toHaveBeenCalledWith('/test-endpoint', undefined);
      expect(result).toEqual(mockData);
    });

    it('passes config options to api.get', async () => {
      mockGet.mockResolvedValueOnce({ data: {} });
      const config = { params: { page: 1 } };

      await apiGet('/items', config);

      expect(mockGet).toHaveBeenCalledWith('/items', config);
    });

    it('propagates errors from api.get', async () => {
      mockGet.mockRejectedValueOnce(new Error('Network error'));

      await expect(apiGet('/fail')).rejects.toThrow('Network error');
    });
  });

  describe('apiPost', () => {
    it('calls api.post with data and unwraps response', async () => {
      const postData = { name: 'test' };
      const responseData = { id: '1', name: 'test' };
      mockPost.mockResolvedValueOnce({ data: responseData });

      const result = await apiPost('/create', postData);

      expect(mockPost).toHaveBeenCalledWith('/create', postData, undefined);
      expect(result).toEqual(responseData);
    });

    it('handles post without data', async () => {
      mockPost.mockResolvedValueOnce({ data: { ok: true } });

      const result = await apiPost('/trigger');

      expect(mockPost).toHaveBeenCalledWith('/trigger', undefined, undefined);
      expect(result).toEqual({ ok: true });
    });

    it('passes config options to api.post', async () => {
      mockPost.mockResolvedValueOnce({ data: {} });
      const config = { headers: { 'X-Custom': 'value' } };

      await apiPost('/endpoint', { foo: 'bar' }, config);

      expect(mockPost).toHaveBeenCalledWith('/endpoint', { foo: 'bar' }, config);
    });

    it('propagates errors from api.post', async () => {
      mockPost.mockRejectedValueOnce(new Error('Bad request'));

      await expect(apiPost('/fail', {})).rejects.toThrow('Bad request');
    });
  });

  describe('apiPut', () => {
    it('calls api.put with data and unwraps response', async () => {
      const responseData = { id: '1', name: 'updated' };
      mockPut.mockResolvedValueOnce({ data: responseData });

      const result = await apiPut('/update/1', { name: 'updated' });

      expect(mockPut).toHaveBeenCalledWith('/update/1', { name: 'updated' }, undefined);
      expect(result).toEqual(responseData);
    });

    it('handles put without data', async () => {
      mockPut.mockResolvedValueOnce({ data: { ok: true } });

      const result = await apiPut('/toggle/1');

      expect(mockPut).toHaveBeenCalledWith('/toggle/1', undefined, undefined);
      expect(result).toEqual({ ok: true });
    });

    it('propagates errors from api.put', async () => {
      mockPut.mockRejectedValueOnce(new Error('Not found'));

      await expect(apiPut('/fail/1', {})).rejects.toThrow('Not found');
    });
  });

  describe('apiDelete', () => {
    it('calls api.delete and unwraps response', async () => {
      mockDelete.mockResolvedValueOnce({ data: { deleted: true } });

      const result = await apiDelete('/remove/1');

      expect(mockDelete).toHaveBeenCalledWith('/remove/1', undefined);
      expect(result).toEqual({ deleted: true });
    });

    it('passes config options to api.delete', async () => {
      mockDelete.mockResolvedValueOnce({ data: {} });
      const config = { params: { force: true } };

      await apiDelete('/remove/1', config);

      expect(mockDelete).toHaveBeenCalledWith('/remove/1', config);
    });

    it('propagates errors from api.delete', async () => {
      mockDelete.mockRejectedValueOnce(new Error('Forbidden'));

      await expect(apiDelete('/fail/1')).rejects.toThrow('Forbidden');
    });
  });

  // -----------------------------------------------------------------------
  // uploadFile
  // -----------------------------------------------------------------------
  describe('uploadFile', () => {
    it('posts FormData with the file', async () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      mockPost.mockResolvedValueOnce({ data: { fileId: 'f1' } });

      const result = await uploadFile('/upload', file);

      expect(mockPost).toHaveBeenCalled();
      const [url, formData, config] = mockPost.mock.calls[0];
      expect(url).toBe('/upload');
      expect(formData).toBeInstanceOf(FormData);
      expect(config.headers['Content-Type']).toBe('multipart/form-data');
      expect(result).toEqual({ fileId: 'f1' });
    });

    it('appends extra fields to FormData', async () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      mockPost.mockResolvedValueOnce({ data: {} });

      await uploadFile('/upload', file, undefined, { category: 'doc', label: 'myfile' });

      const formData = mockPost.mock.calls[0][1] as FormData;
      expect(formData.get('category')).toBe('doc');
      expect(formData.get('label')).toBe('myfile');
    });

    it('passes onUploadProgress callback in config', async () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const onProgress = vi.fn();
      mockPost.mockResolvedValueOnce({ data: {} });

      await uploadFile('/upload', file, onProgress);

      const config = mockPost.mock.calls[0][2];
      expect(config.onUploadProgress).toBeDefined();

      // Simulate progress events
      config.onUploadProgress({ loaded: 50, total: 100 });
      expect(onProgress).toHaveBeenCalledWith(50);

      config.onUploadProgress({ loaded: 100, total: 100 });
      expect(onProgress).toHaveBeenCalledWith(100);
    });

    it('does not call onProgress when total is missing', async () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const onProgress = vi.fn();
      mockPost.mockResolvedValueOnce({ data: {} });

      await uploadFile('/upload', file, onProgress);

      const config = mockPost.mock.calls[0][2];
      config.onUploadProgress({ loaded: 50, total: undefined });
      expect(onProgress).not.toHaveBeenCalled();
    });

    it('does not call onProgress when callback is not provided', async () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      mockPost.mockResolvedValueOnce({ data: {} });

      await uploadFile('/upload', file);

      const config = mockPost.mock.calls[0][2];
      // Should not throw when invoking with no callback
      expect(() => config.onUploadProgress({ loaded: 50, total: 100 })).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // getApiErrorMessage
  // -----------------------------------------------------------------------
  describe('getApiErrorMessage', () => {
    it('returns server-provided string message', () => {
      const error = {
        response: { status: 400, data: { message: 'Email already taken' } },
      };
      expect(getApiErrorMessage(error)).toBe('Email already taken');
    });

    it('joins array messages from server', () => {
      const error = {
        response: {
          status: 400,
          data: { message: ['Field A is required', 'Field B is invalid'] },
        },
      };
      expect(getApiErrorMessage(error)).toBe('Field A is required. Field B is invalid');
    });

    it('returns specific message for 400 with error field', () => {
      const error = {
        response: { status: 400, data: { error: 'Bad input data' } },
      };
      expect(getApiErrorMessage(error)).toBe('Bad input data');
    });

    it('returns generic 400 message when no server details', () => {
      const error = { response: { status: 400, data: {} } };
      expect(getApiErrorMessage(error)).toBe(
        'Invalid request. Please check your input and try again.',
      );
    });

    it('returns 401 message', () => {
      const error = { response: { status: 401, data: {} } };
      expect(getApiErrorMessage(error)).toBe(
        'Invalid credentials. Please check your email and password.',
      );
    });

    it('returns 403 message', () => {
      const error = { response: { status: 403, data: {} } };
      expect(getApiErrorMessage(error)).toBe(
        'You do not have permission to perform this action.',
      );
    });

    it('returns 404 message', () => {
      const error = { response: { status: 404, data: {} } };
      expect(getApiErrorMessage(error)).toBe('The requested resource was not found.');
    });

    it('returns 409 message', () => {
      const error = { response: { status: 409, data: {} } };
      expect(getApiErrorMessage(error)).toBe(
        'This record already exists. Please use different details.',
      );
    });

    it('returns 413 message', () => {
      const error = { response: { status: 413, data: {} } };
      expect(getApiErrorMessage(error)).toBe(
        'The file is too large. Please upload a smaller file.',
      );
    });

    it('returns 422 message', () => {
      const error = { response: { status: 422, data: {} } };
      expect(getApiErrorMessage(error)).toBe(
        'The submitted data is invalid. Please review and correct your input.',
      );
    });

    it('returns 429 message', () => {
      const error = { response: { status: 429, data: {} } };
      expect(getApiErrorMessage(error)).toBe(
        'Too many requests. Please wait a moment and try again.',
      );
    });

    it('returns 500 message', () => {
      const error = { response: { status: 500, data: {} } };
      expect(getApiErrorMessage(error)).toBe(
        'An internal server error occurred. Please try again later.',
      );
    });

    it('returns server unavailable for 502', () => {
      const error = { response: { status: 502, data: {} } };
      expect(getApiErrorMessage(error)).toBe(
        'The server is temporarily unavailable. Please try again later.',
      );
    });

    it('returns server unavailable for 503', () => {
      const error = { response: { status: 503, data: {} } };
      expect(getApiErrorMessage(error)).toBe(
        'The server is temporarily unavailable. Please try again later.',
      );
    });

    it('returns server unavailable for 504', () => {
      const error = { response: { status: 504, data: {} } };
      expect(getApiErrorMessage(error)).toBe(
        'The server is temporarily unavailable. Please try again later.',
      );
    });

    it('returns network error message when no response exists', () => {
      const error = { message: 'Network Error' };
      expect(getApiErrorMessage(error)).toBe(
        'Unable to connect to the server. Please check your internet connection.',
      );
    });

    it('returns default fallback for unknown status codes', () => {
      const error = { response: { status: 418, data: {} } };
      expect(getApiErrorMessage(error)).toBe('Something went wrong. Please try again.');
    });

    it('returns custom fallback when provided', () => {
      const error = { response: { status: 418, data: {} } };
      expect(getApiErrorMessage(error, 'Custom fallback')).toBe('Custom fallback');
    });

    it('handles null error gracefully', () => {
      expect(getApiErrorMessage(null)).toBe(
        'Unable to connect to the server. Please check your internet connection.',
      );
    });

    it('handles undefined error gracefully', () => {
      expect(getApiErrorMessage(undefined)).toBe(
        'Unable to connect to the server. Please check your internet connection.',
      );
    });

    it('server message takes priority over status code mapping', () => {
      const error = {
        response: { status: 500, data: { message: 'Database connection lost' } },
      };
      expect(getApiErrorMessage(error)).toBe('Database connection lost');
    });

    it('single-element array message is returned as-is', () => {
      const error = {
        response: { status: 400, data: { message: ['Only one error'] } },
      };
      expect(getApiErrorMessage(error)).toBe('Only one error');
    });
  });
});

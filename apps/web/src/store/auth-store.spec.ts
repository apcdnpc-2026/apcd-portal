import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useAuthStore, type User } from './auth-store';

// Provide a minimal localStorage stub for Zustand persist
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

const mockUser: User = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'OEM',
};

describe('useAuthStore', () => {
  beforeEach(() => {
    // Reset the store to initial state before each test
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: true,
      _hasHydrated: false,
    });
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  it('has correct initial state', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(true);
    expect(state._hasHydrated).toBe(false);
  });

  it('setAuth sets user, tokens, and isAuthenticated', () => {
    useAuthStore.getState().setAuth(mockUser, 'access-123', 'refresh-456');

    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.accessToken).toBe('access-123');
    expect(state.refreshToken).toBe('refresh-456');
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  it('setAuth persists tokens and userId to localStorage', () => {
    useAuthStore.getState().setAuth(mockUser, 'access-123', 'refresh-456');

    expect(localStorageMock.setItem).toHaveBeenCalledWith('accessToken', 'access-123');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('refreshToken', 'refresh-456');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('userId', 'user-1');
  });

  it('logout clears all auth state', () => {
    // First set auth
    useAuthStore.getState().setAuth(mockUser, 'access-123', 'refresh-456');
    // Then logout
    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  it('logout removes tokens from localStorage', () => {
    useAuthStore.getState().setAuth(mockUser, 'access-123', 'refresh-456');
    vi.clearAllMocks();

    useAuthStore.getState().logout();

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('accessToken');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('refreshToken');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('userId');
  });

  it('setUser updates only the user field', () => {
    const updatedUser: User = { ...mockUser, name: 'Updated Name' };
    useAuthStore.getState().setUser(updatedUser);

    const state = useAuthStore.getState();
    expect(state.user).toEqual(updatedUser);
    // Other fields remain unchanged
    expect(state.isAuthenticated).toBe(false);
  });

  it('setLoading updates isLoading', () => {
    useAuthStore.getState().setLoading(false);
    expect(useAuthStore.getState().isLoading).toBe(false);

    useAuthStore.getState().setLoading(true);
    expect(useAuthStore.getState().isLoading).toBe(true);
  });

  it('setHasHydrated updates _hasHydrated', () => {
    useAuthStore.getState().setHasHydrated(true);
    expect(useAuthStore.getState()._hasHydrated).toBe(true);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';

import { useAuthStore, type User } from './auth-store';

// Provide a spy-able localStorage stub for Zustand persist
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

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const mockOemUser: User = {
  id: 'user-1',
  email: 'oem@example.com',
  name: 'OEM User',
  role: 'OEM',
};

const mockAdminUser: User = {
  id: 'admin-1',
  email: 'admin@example.com',
  name: 'Admin User',
  role: 'ADMIN',
  phone: '+91-9876543210',
};

const mockOfficerUser: User = {
  id: 'officer-1',
  email: 'officer@example.com',
  name: 'Officer User',
  role: 'OFFICER',
};

const mockSuperAdminUser: User = {
  id: 'sa-1',
  email: 'superadmin@example.com',
  name: 'Super Admin',
  role: 'SUPER_ADMIN',
};

const mockCommitteeUser: User = {
  id: 'comm-1',
  email: 'committee@example.com',
  name: 'Committee Member',
  role: 'COMMITTEE',
};

const mockFieldVerifierUser: User = {
  id: 'fv-1',
  email: 'fv@example.com',
  name: 'Field Verifier',
  role: 'FIELD_VERIFIER',
};

const mockDealingHandUser: User = {
  id: 'dh-1',
  email: 'dh@example.com',
  name: 'Dealing Hand',
  role: 'DEALING_HAND',
};

// ---------------------------------------------------------------------------
// Helper to reset store
// ---------------------------------------------------------------------------
function resetStore() {
  useAuthStore.setState({
    user: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
    isLoading: true,
    _hasHydrated: false,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('useAuthStore', () => {
  beforeEach(() => {
    resetStore();
    // Use mockClear (not clearAllMocks) to preserve vi.fn() implementations
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();
    localStorageMock.clear.mockClear();
    localStorageMock.clear();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------
  describe('initial state', () => {
    it('user is null', () => {
      expect(useAuthStore.getState().user).toBeNull();
    });

    it('accessToken is null', () => {
      expect(useAuthStore.getState().accessToken).toBeNull();
    });

    it('refreshToken is null', () => {
      expect(useAuthStore.getState().refreshToken).toBeNull();
    });

    it('isAuthenticated is false', () => {
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('isLoading is true', () => {
      expect(useAuthStore.getState().isLoading).toBe(true);
    });

    it('_hasHydrated is false', () => {
      expect(useAuthStore.getState()._hasHydrated).toBe(false);
    });

    it('all action functions are defined', () => {
      const state = useAuthStore.getState();
      expect(typeof state.setAuth).toBe('function');
      expect(typeof state.setUser).toBe('function');
      expect(typeof state.logout).toBe('function');
      expect(typeof state.setLoading).toBe('function');
      expect(typeof state.setHasHydrated).toBe('function');
    });
  });

  // -------------------------------------------------------------------------
  // setAuth (login action)
  // -------------------------------------------------------------------------
  describe('setAuth', () => {
    it('sets user, tokens, and isAuthenticated', () => {
      useAuthStore.getState().setAuth(mockOemUser, 'access-123', 'refresh-456');

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockOemUser);
      expect(state.accessToken).toBe('access-123');
      expect(state.refreshToken).toBe('refresh-456');
      expect(state.isAuthenticated).toBe(true);
    });

    it('sets isLoading to false after login', () => {
      useAuthStore.getState().setAuth(mockOemUser, 'at', 'rt');
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it('persists accessToken to localStorage', () => {
      useAuthStore.getState().setAuth(mockOemUser, 'access-abc', 'refresh-def');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('accessToken', 'access-abc');
    });

    it('persists refreshToken to localStorage', () => {
      useAuthStore.getState().setAuth(mockOemUser, 'access-abc', 'refresh-def');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('refreshToken', 'refresh-def');
    });

    it('persists userId to localStorage', () => {
      useAuthStore.getState().setAuth(mockOemUser, 'at', 'rt');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('userId', 'user-1');
    });

    it('works with admin user role', () => {
      useAuthStore.getState().setAuth(mockAdminUser, 'at', 'rt');

      const state = useAuthStore.getState();
      expect(state.user?.role).toBe('ADMIN');
      expect(state.user?.phone).toBe('+91-9876543210');
      expect(state.isAuthenticated).toBe(true);
    });

    it('works with all supported roles', () => {
      const allUsers = [
        mockOemUser,
        mockAdminUser,
        mockOfficerUser,
        mockSuperAdminUser,
        mockCommitteeUser,
        mockFieldVerifierUser,
        mockDealingHandUser,
      ];

      for (const user of allUsers) {
        useAuthStore.getState().setAuth(user, 'at', 'rt');
        expect(useAuthStore.getState().user?.role).toBe(user.role);
        resetStore();
      }
    });

    it('overwrites previous auth state on re-login', () => {
      useAuthStore.getState().setAuth(mockOemUser, 'at-1', 'rt-1');
      useAuthStore.getState().setAuth(mockAdminUser, 'at-2', 'rt-2');

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockAdminUser);
      expect(state.accessToken).toBe('at-2');
      expect(state.refreshToken).toBe('rt-2');
    });
  });

  // -------------------------------------------------------------------------
  // setUser
  // -------------------------------------------------------------------------
  describe('setUser', () => {
    it('updates only the user field', () => {
      const updatedUser: User = { ...mockOemUser, name: 'Updated Name' };
      useAuthStore.getState().setUser(updatedUser);

      const state = useAuthStore.getState();
      expect(state.user).toEqual(updatedUser);
      // Other fields remain at initial values
      expect(state.isAuthenticated).toBe(false);
      expect(state.accessToken).toBeNull();
    });

    it('can update user name', () => {
      useAuthStore.getState().setAuth(mockOemUser, 'at', 'rt');
      useAuthStore.getState().setUser({ ...mockOemUser, name: 'New Name' });

      expect(useAuthStore.getState().user?.name).toBe('New Name');
    });

    it('can update user email', () => {
      useAuthStore.getState().setAuth(mockOemUser, 'at', 'rt');
      useAuthStore.getState().setUser({ ...mockOemUser, email: 'new@example.com' });

      expect(useAuthStore.getState().user?.email).toBe('new@example.com');
    });

    it('preserves tokens and isAuthenticated when updating user', () => {
      useAuthStore.getState().setAuth(mockOemUser, 'at', 'rt');
      useAuthStore.getState().setUser({ ...mockOemUser, name: 'Changed' });

      const state = useAuthStore.getState();
      expect(state.accessToken).toBe('at');
      expect(state.refreshToken).toBe('rt');
      expect(state.isAuthenticated).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // logout
  // -------------------------------------------------------------------------
  describe('logout', () => {
    it('clears user to null', () => {
      useAuthStore.getState().setAuth(mockOemUser, 'at', 'rt');
      useAuthStore.getState().logout();

      expect(useAuthStore.getState().user).toBeNull();
    });

    it('clears accessToken to null', () => {
      useAuthStore.getState().setAuth(mockOemUser, 'at', 'rt');
      useAuthStore.getState().logout();

      expect(useAuthStore.getState().accessToken).toBeNull();
    });

    it('clears refreshToken to null', () => {
      useAuthStore.getState().setAuth(mockOemUser, 'at', 'rt');
      useAuthStore.getState().logout();

      expect(useAuthStore.getState().refreshToken).toBeNull();
    });

    it('sets isAuthenticated to false', () => {
      useAuthStore.getState().setAuth(mockOemUser, 'at', 'rt');
      useAuthStore.getState().logout();

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('sets isLoading to false', () => {
      useAuthStore.getState().setAuth(mockOemUser, 'at', 'rt');
      useAuthStore.getState().logout();

      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it('removes accessToken from localStorage', () => {
      useAuthStore.getState().setAuth(mockOemUser, 'at', 'rt');
      localStorageMock.removeItem.mockClear();
      useAuthStore.getState().logout();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('accessToken');
    });

    it('removes refreshToken from localStorage', () => {
      useAuthStore.getState().setAuth(mockOemUser, 'at', 'rt');
      vi.clearAllMocks();
      useAuthStore.getState().logout();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('refreshToken');
    });

    it('removes userId from localStorage', () => {
      useAuthStore.getState().setAuth(mockOemUser, 'at', 'rt');
      vi.clearAllMocks();
      useAuthStore.getState().logout();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('userId');
    });

    it('can logout when already logged out (idempotent)', () => {
      // Should not throw
      useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });

    it('allows re-login after logout', () => {
      useAuthStore.getState().setAuth(mockOemUser, 'at-1', 'rt-1');
      useAuthStore.getState().logout();
      useAuthStore.getState().setAuth(mockAdminUser, 'at-2', 'rt-2');

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockAdminUser);
      expect(state.accessToken).toBe('at-2');
      expect(state.isAuthenticated).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // setLoading
  // -------------------------------------------------------------------------
  describe('setLoading', () => {
    it('sets isLoading to false', () => {
      useAuthStore.getState().setLoading(false);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it('sets isLoading to true', () => {
      useAuthStore.getState().setLoading(false);
      useAuthStore.getState().setLoading(true);
      expect(useAuthStore.getState().isLoading).toBe(true);
    });

    it('does not affect other state fields', () => {
      useAuthStore.getState().setAuth(mockOemUser, 'at', 'rt');
      useAuthStore.getState().setLoading(true);

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockOemUser);
      expect(state.isAuthenticated).toBe(true);
      expect(state.accessToken).toBe('at');
    });

    it('can toggle loading state multiple times', () => {
      useAuthStore.getState().setLoading(false);
      expect(useAuthStore.getState().isLoading).toBe(false);

      useAuthStore.getState().setLoading(true);
      expect(useAuthStore.getState().isLoading).toBe(true);

      useAuthStore.getState().setLoading(false);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // setHasHydrated
  // -------------------------------------------------------------------------
  describe('setHasHydrated', () => {
    it('sets _hasHydrated to true', () => {
      useAuthStore.getState().setHasHydrated(true);
      expect(useAuthStore.getState()._hasHydrated).toBe(true);
    });

    it('sets _hasHydrated to false', () => {
      useAuthStore.getState().setHasHydrated(true);
      useAuthStore.getState().setHasHydrated(false);
      expect(useAuthStore.getState()._hasHydrated).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Role extraction from user
  // -------------------------------------------------------------------------
  describe('role extraction', () => {
    it('returns OEM role after login with OEM user', () => {
      useAuthStore.getState().setAuth(mockOemUser, 'at', 'rt');
      expect(useAuthStore.getState().user?.role).toBe('OEM');
    });

    it('returns ADMIN role after login with admin user', () => {
      useAuthStore.getState().setAuth(mockAdminUser, 'at', 'rt');
      expect(useAuthStore.getState().user?.role).toBe('ADMIN');
    });

    it('returns OFFICER role after login with officer user', () => {
      useAuthStore.getState().setAuth(mockOfficerUser, 'at', 'rt');
      expect(useAuthStore.getState().user?.role).toBe('OFFICER');
    });

    it('returns SUPER_ADMIN role after login with super admin', () => {
      useAuthStore.getState().setAuth(mockSuperAdminUser, 'at', 'rt');
      expect(useAuthStore.getState().user?.role).toBe('SUPER_ADMIN');
    });

    it('returns COMMITTEE role after login with committee user', () => {
      useAuthStore.getState().setAuth(mockCommitteeUser, 'at', 'rt');
      expect(useAuthStore.getState().user?.role).toBe('COMMITTEE');
    });

    it('returns FIELD_VERIFIER role after login with field verifier', () => {
      useAuthStore.getState().setAuth(mockFieldVerifierUser, 'at', 'rt');
      expect(useAuthStore.getState().user?.role).toBe('FIELD_VERIFIER');
    });

    it('returns DEALING_HAND role after login with dealing hand user', () => {
      useAuthStore.getState().setAuth(mockDealingHandUser, 'at', 'rt');
      expect(useAuthStore.getState().user?.role).toBe('DEALING_HAND');
    });

    it('role is undefined when user is null', () => {
      expect(useAuthStore.getState().user?.role).toBeUndefined();
    });

    it('role is cleared after logout', () => {
      useAuthStore.getState().setAuth(mockAdminUser, 'at', 'rt');
      useAuthStore.getState().logout();
      expect(useAuthStore.getState().user?.role).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Zustand persist (partialize)
  // -------------------------------------------------------------------------
  describe('persistence configuration', () => {
    it('persist middleware is configured on the store', () => {
      // Zustand persist adds a `persist` property to the store
      expect((useAuthStore as any).persist).toBeDefined();
      expect(typeof (useAuthStore as any).persist.getOptions).toBe('function');
    });

    it('uses "auth-storage" as the storage key name', () => {
      const options = (useAuthStore as any).persist.getOptions();
      expect(options.name).toBe('auth-storage');
    });

    it('partialize includes only user, tokens, and isAuthenticated', () => {
      const options = (useAuthStore as any).persist.getOptions();
      const fullState = {
        user: mockOemUser,
        accessToken: 'at',
        refreshToken: 'rt',
        isAuthenticated: true,
        isLoading: false,
        _hasHydrated: true,
        setAuth: vi.fn(),
        setUser: vi.fn(),
        logout: vi.fn(),
        setLoading: vi.fn(),
        setHasHydrated: vi.fn(),
      };

      const partialized = options.partialize(fullState);

      expect(partialized).toEqual({
        user: mockOemUser,
        accessToken: 'at',
        refreshToken: 'rt',
        isAuthenticated: true,
      });
    });

    it('partialize does NOT include isLoading', () => {
      const options = (useAuthStore as any).persist.getOptions();
      const partialized = options.partialize(useAuthStore.getState());

      expect(partialized).not.toHaveProperty('isLoading');
    });

    it('partialize does NOT include _hasHydrated', () => {
      const options = (useAuthStore as any).persist.getOptions();
      const partialized = options.partialize(useAuthStore.getState());

      expect(partialized).not.toHaveProperty('_hasHydrated');
    });

    it('partialize does NOT include action functions', () => {
      const options = (useAuthStore as any).persist.getOptions();
      const partialized = options.partialize(useAuthStore.getState());

      expect(partialized).not.toHaveProperty('setAuth');
      expect(partialized).not.toHaveProperty('setUser');
      expect(partialized).not.toHaveProperty('logout');
      expect(partialized).not.toHaveProperty('setLoading');
      expect(partialized).not.toHaveProperty('setHasHydrated');
    });
  });

  // -------------------------------------------------------------------------
  // State transitions
  // -------------------------------------------------------------------------
  describe('state transitions', () => {
    it('full login -> logout cycle', () => {
      // Initial
      expect(useAuthStore.getState().isAuthenticated).toBe(false);

      // Login
      useAuthStore.getState().setAuth(mockOemUser, 'at', 'rt');
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().isLoading).toBe(false);

      // Logout
      useAuthStore.getState().logout();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().user).toBeNull();
    });

    it('loading -> login transition', () => {
      // Initially loading is true
      expect(useAuthStore.getState().isLoading).toBe(true);

      // After setAuth, loading becomes false
      useAuthStore.getState().setAuth(mockOemUser, 'at', 'rt');
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it('setLoading(true) -> setAuth -> isLoading becomes false', () => {
      useAuthStore.getState().setLoading(true);
      expect(useAuthStore.getState().isLoading).toBe(true);

      useAuthStore.getState().setAuth(mockOemUser, 'at', 'rt');
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it('setAuth -> setLoading(true) -> logout -> isLoading is false', () => {
      useAuthStore.getState().setAuth(mockOemUser, 'at', 'rt');
      useAuthStore.getState().setLoading(true);
      expect(useAuthStore.getState().isLoading).toBe(true);

      useAuthStore.getState().logout();
      expect(useAuthStore.getState().isLoading).toBe(false);
    });
  });
});

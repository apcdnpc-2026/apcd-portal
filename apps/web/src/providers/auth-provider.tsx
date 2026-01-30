'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';

import { useAuthStore, useIsAuthenticated, useUserRole, useHasHydrated } from '@/store/auth-store';

// Routes accessible without authentication
const PUBLIC_ROUTES = [
  '/login',
  '/register',
  '/forgot-password',
  '/verify',
  '/check-eligibility',
  '/empaneled-oems',
];

// Routes accessible per role
const ROLE_ROUTES: Record<string, string[]> = {
  OEM: ['/dashboard/oem', '/applications', '/profile', '/payments', '/certificates'],
  OFFICER: [
    '/dashboard/officer',
    '/verification',
    '/field-verification',
    '/payments',
    '/queries',
    '/reports',
    '/profile',
  ],
  ADMIN: [
    '/dashboard/admin',
    '/admin',
    '/verification',
    '/field-verification',
    '/payments',
    '/profile',
  ],
  SUPER_ADMIN: [
    '/dashboard/admin',
    '/admin',
    '/verification',
    '/field-verification',
    '/payments',
    '/profile',
  ],
  COMMITTEE: ['/dashboard/committee', '/committee', '/profile'],
  FIELD_VERIFIER: ['/dashboard/field-verifier', '/field-verification', '/profile'],
};

function isPublicRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === '/') return true;
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
}

function getDashboardRoute(role: string): string {
  const routes: Record<string, string> = {
    OEM: '/dashboard/oem',
    OFFICER: '/dashboard/officer',
    ADMIN: '/dashboard/admin',
    SUPER_ADMIN: '/dashboard/admin',
    COMMITTEE: '/dashboard/committee',
    FIELD_VERIFIER: '/dashboard/field-verifier',
  };
  return routes[role] || '/dashboard';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useIsAuthenticated();
  const userRole = useUserRole();
  const hasHydrated = useHasHydrated();
  const { logout, setLoading, isLoading } = useAuthStore();
  const initRef = useRef(false);

  // On mount: sync Zustand persisted state with localStorage tokens
  useEffect(() => {
    if (!hasHydrated) return;
    if (initRef.current) return;
    initRef.current = true;

    // Check if localStorage token matches Zustand persisted state
    const accessToken = localStorage.getItem('accessToken');

    if (!accessToken && isAuthenticated) {
      // Zustand says authenticated but no token in localStorage - stale state
      logout();
    } else {
      // Either we have a valid token or we're not authenticated - both are fine
      setLoading(false);
    }
  }, [hasHydrated]);

  // Handle routing based on auth state
  useEffect(() => {
    if (!hasHydrated || isLoading) return;

    if (!isAuthenticated) {
      if (!isPublicRoute(pathname)) {
        router.replace('/login');
      }
      return;
    }

    if (userRole && pathname) {
      if (pathname === '/login' || pathname === '/register') {
        router.replace(getDashboardRoute(userRole));
        return;
      }

      if (pathname === '/') return;

      const allowedRoutes = ROLE_ROUTES[userRole] || [];
      const hasAccess = allowedRoutes.some((route) => pathname.startsWith(route));

      if (!hasAccess && pathname !== '/unauthorized') {
        router.replace('/unauthorized');
      }
    }
  }, [isAuthenticated, userRole, pathname, hasHydrated, isLoading]);

  // Show spinner until hydrated and initialized
  if (!hasHydrated || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return <>{children}</>;
}

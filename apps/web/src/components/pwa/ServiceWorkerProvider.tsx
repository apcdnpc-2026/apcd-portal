'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

import { registerServiceWorker } from '@/lib/pwa/sw-register';

interface ServiceWorkerContextValue {
  registration: ServiceWorkerRegistration | null;
  isReady: boolean;
  updateAvailable: boolean;
  applyUpdate: () => void;
}

const ServiceWorkerContext = createContext<ServiceWorkerContextValue>({
  registration: null,
  isReady: false,
  updateAvailable: false,
  applyUpdate: () => {},
});

export function useServiceWorker() {
  return useContext(ServiceWorkerContext);
}

interface ServiceWorkerProviderProps {
  children: ReactNode;
}

export function ServiceWorkerProvider({ children }: ServiceWorkerProviderProps) {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const applyUpdate = useCallback(() => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    }
  }, [registration]);

  useEffect(() => {
    // Only register in production or when explicitly enabled
    if (process.env.NODE_ENV === 'development' && !process.env.NEXT_PUBLIC_ENABLE_SW) {
      setIsReady(true);
      return;
    }

    let mounted = true;

    registerServiceWorker().then((reg) => {
      if (!mounted) return;
      if (!reg) {
        setIsReady(true);
        return;
      }

      setRegistration(reg);
      setIsReady(true);

      // Listen for new service worker waiting to activate
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version available
            if (mounted) setUpdateAvailable(true);
          }
        });
      });
    });

    // Listen for controller change (new SW activated)
    const onControllerChange = () => {
      window.location.reload();
    };
    navigator.serviceWorker?.addEventListener('controllerchange', onControllerChange);

    return () => {
      mounted = false;
      navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  return (
    <ServiceWorkerContext.Provider value={{ registration, isReady, updateAvailable, applyUpdate }}>
      {children}
    </ServiceWorkerContext.Provider>
  );
}

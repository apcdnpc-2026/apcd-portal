'use client';

import { useEffect, useState } from 'react';

function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Set initial state from browser
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export function NetworkIndicator() {
  const isOnline = useOnlineStatus();
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state when going back offline
  useEffect(() => {
    if (!isOnline) setDismissed(false);
  }, [isOnline]);

  if (isOnline || dismissed) return null;

  return (
    <div
      role="alert"
      data-testid="network-offline-banner"
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-2 bg-amber-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg"
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 animate-pulse rounded-full bg-white"
          aria-hidden="true"
        />
        <span>You are offline. Some features may be unavailable.</span>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded px-2 py-0.5 text-xs hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-white"
        aria-label="Dismiss offline notification"
      >
        Dismiss
      </button>
    </div>
  );
}

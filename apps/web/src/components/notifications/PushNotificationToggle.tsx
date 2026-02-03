'use client';

import { useEffect, useState, useCallback } from 'react';

import { Button } from '@/components/ui/button';
import {
  subscribeToNotifications,
  unsubscribeFromNotifications,
  getSubscriptionStatus,
} from '@/lib/push/push-subscription';

type SubscriptionStatus = 'subscribed' | 'unsubscribed' | 'denied' | 'unsupported' | 'loading';

interface PushNotificationToggleProps {
  userId: string;
}

export function PushNotificationToggle({ userId }: PushNotificationToggleProps) {
  const [status, setStatus] = useState<SubscriptionStatus>('loading');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    const currentStatus = await getSubscriptionStatus();
    setStatus(currentStatus);
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleToggle = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      if (status === 'subscribed') {
        await unsubscribeFromNotifications();
        setStatus('unsubscribed');
      } else {
        await subscribeToNotifications(userId);
        setStatus('subscribed');
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to update notification settings';
      setError(errorMessage);
      // Re-check status in case of partial failure
      await checkStatus();
    } finally {
      setIsProcessing(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-3 rounded-lg border p-4">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
        <span className="text-sm text-muted-foreground">Checking notification status...</span>
      </div>
    );
  }

  if (status === 'unsupported') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-800">
          Push notifications are not supported in your browser.
        </p>
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-800">
          Notification permission has been denied. Please enable notifications in your browser
          settings to receive push notifications.
        </p>
        <p className="mt-2 text-xs text-red-600">
          To enable: Click the lock icon in your browser address bar and allow notifications.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">Push Notifications</p>
          <p className="text-xs text-muted-foreground">
            {status === 'subscribed'
              ? 'You will receive notifications about your applications'
              : 'Enable to receive real-time updates'}
          </p>
        </div>
        <Button
          variant={status === 'subscribed' ? 'outline' : 'default'}
          size="sm"
          onClick={handleToggle}
          disabled={isProcessing}
          data-testid="push-notification-toggle"
        >
          {isProcessing ? (
            <>
              <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Processing...
            </>
          ) : status === 'subscribed' ? (
            'Disable'
          ) : (
            'Enable'
          )}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {status === 'subscribed' && (
        <p className="text-xs text-muted-foreground">
          Notifications are enabled. You will be notified about application status changes, queries,
          and important updates.
        </p>
      )}
    </div>
  );
}

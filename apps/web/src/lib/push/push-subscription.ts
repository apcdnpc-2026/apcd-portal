import { api } from '../api';

type SubscriptionStatus = 'subscribed' | 'unsubscribed' | 'denied' | 'unsupported';

interface VapidKeyResponse {
  publicKey: string;
}

/**
 * Convert a base64 string to a Uint8Array for the applicationServerKey
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Subscribe the current user to push notifications
 */
export async function subscribeToNotifications(userId: string): Promise<boolean> {
  // Check if push notifications are supported
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported in this browser');
  }

  // Request notification permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission denied');
  }

  try {
    // Get VAPID public key from server
    const response = await api.get<VapidKeyResponse>('/push/vapid-public-key');
    const vapidPublicKey = response.data.publicKey;

    if (!vapidPublicKey) {
      throw new Error('VAPID public key not available');
    }

    // Get service worker registration
    const registration = await navigator.serviceWorker.ready;

    // Create push subscription
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    // Extract subscription data
    const subscriptionJson = subscription.toJSON();
    const p256dh = subscriptionJson.keys?.p256dh;
    const auth = subscriptionJson.keys?.auth;

    if (!subscriptionJson.endpoint || !p256dh || !auth) {
      throw new Error('Invalid subscription data');
    }

    // Send subscription to server
    await api.post('/push/subscribe', {
      endpoint: subscriptionJson.endpoint,
      keys: {
        p256dh,
        auth,
      },
    });

    // Store user ID for reference
    localStorage.setItem('pushSubscriptionUserId', userId);

    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to subscribe to push notifications: ${errorMessage}`);
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromNotifications(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      return true; // Already unsubscribed
    }

    // Notify server about unsubscription
    await api.delete('/push/unsubscribe', {
      data: { endpoint: subscription.endpoint },
    });

    // Unsubscribe from push manager
    await subscription.unsubscribe();

    // Clear stored user ID
    localStorage.removeItem('pushSubscriptionUserId');

    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to unsubscribe from push notifications: ${errorMessage}`);
  }
}

/**
 * Get the current subscription status
 */
export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  // Check if push notifications are supported
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported';
  }

  // Check if permission is denied
  if (Notification.permission === 'denied') {
    return 'denied';
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    return subscription ? 'subscribed' : 'unsubscribed';
  } catch {
    return 'unsubscribed';
  }
}

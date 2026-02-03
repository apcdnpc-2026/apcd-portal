// ---------------------------------------------------------------------------
// Offline Infrastructure -- re-exports and factory
// ---------------------------------------------------------------------------

export { APCDDatabase } from './indexed-db';
export type { SyncQueueItem, DraftData, OfflinePhoto } from './indexed-db';

export { SyncQueueManager } from './sync-queue';
export type { QueueStatus } from './sync-queue';

export { NetworkMonitor } from './network-monitor';
export type { ConnectionQuality, NetworkStatus } from './network-monitor';

import { APCDDatabase } from './indexed-db';
import { NetworkMonitor } from './network-monitor';
import { SyncQueueManager } from './sync-queue';

/**
 * Factory function to initialize all offline infrastructure components
 */
export function createOfflineInfra() {
  const db = new APCDDatabase();
  const syncQueue = new SyncQueueManager(db);
  const networkMonitor = NetworkMonitor.getInstance();

  // Auto-process sync queue when coming back online
  networkMonitor.onStatusChange((status) => {
    if (status.online) {
      syncQueue.processQueue().catch((error: unknown) => {
        console.error('Failed to process sync queue:', error);
      });
    }
  });

  return {
    db,
    syncQueue,
    networkMonitor,
    start: () => networkMonitor.start(),
    stop: () => networkMonitor.stop(),
  };
}

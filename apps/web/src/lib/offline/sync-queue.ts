// ---------------------------------------------------------------------------
// SyncQueueManager -- processes queued offline requests when back online
// ---------------------------------------------------------------------------

import { APCDDatabase, SyncQueueItem } from './indexed-db';

export interface QueueStatus {
  pending: number;
  failed: number;
  processing: number;
  completed: number;
}

export class SyncQueueManager {
  private db: APCDDatabase;
  private isProcessing = false;

  constructor(db: APCDDatabase) {
    this.db = db;
  }

  /**
   * Add a request to the sync queue for later processing
   */
  async enqueue(
    type: string,
    url: string,
    method: string,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<string> {
    const item: Omit<SyncQueueItem, 'id'> & { id?: string } = {
      type,
      url,
      method,
      body: body ? JSON.stringify(body) : null,
      headers: headers || {},
      status: 'pending',
      retryCount: 0,
      maxRetries: 3,
      createdAt: Date.now(),
      lastAttempt: null,
      error: null,
    };

    const id = await this.db.addToSyncQueue(item as SyncQueueItem);

    // Request Background Sync if available
    if (
      'serviceWorker' in navigator &&
      'sync' in (window as unknown as { SyncManager?: unknown }).SyncManager!
    ) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await (
          registration as unknown as { sync: { register: (tag: string) => Promise<void> } }
        ).sync.register('apcd-sync-queue');
      } catch (error: unknown) {
        console.warn('Background Sync registration failed:', error);
      }
    }

    return id;
  }

  /**
   * Process all pending items in the queue
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const items = await this.db.getSyncQueue();
      const pendingItems = items.filter(
        (item) => item.status === 'pending' || item.status === 'failed',
      );

      for (const item of pendingItems) {
        await this.processItem(item);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async processItem(item: SyncQueueItem): Promise<void> {
    // Mark as processing
    await this.db.updateSyncStatus(item.id, 'processing');

    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
          ...item.headers,
        },
        body: item.body,
      });

      if (response.ok) {
        await this.db.removeSyncItem(item.id);
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const newRetryCount = item.retryCount + 1;

      if (newRetryCount >= item.maxRetries) {
        await this.db.updateSyncStatus(item.id, 'failed', errorMessage);
      } else {
        // Exponential backoff delay before retry
        const delay = Math.pow(2, newRetryCount) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        await this.db.updateSyncStatus(item.id, 'pending', errorMessage);
      }
    }
  }

  /**
   * Get current queue status counts
   */
  async getQueueStatus(): Promise<QueueStatus> {
    const items = await this.db.getSyncQueue();
    return {
      pending: items.filter((i) => i.status === 'pending').length,
      failed: items.filter((i) => i.status === 'failed').length,
      processing: items.filter((i) => i.status === 'processing').length,
      completed: items.filter((i) => i.status === 'completed').length,
    };
  }

  /**
   * Reset failed items to pending and reprocess
   */
  async retryFailed(): Promise<void> {
    const items = await this.db.getSyncQueue();
    const failedItems = items.filter((i) => i.status === 'failed');

    for (const item of failedItems) {
      await this.db.updateSyncStatus(item.id, 'pending');
    }

    await this.processQueue();
  }

  /**
   * Clear completed items from the queue
   */
  async clearCompleted(): Promise<void> {
    const items = await this.db.getSyncQueue();
    const completedItems = items.filter((i) => i.status === 'completed');

    for (const item of completedItems) {
      await this.db.removeSyncItem(item.id);
    }
  }
}

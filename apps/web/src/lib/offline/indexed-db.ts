// ---------------------------------------------------------------------------
// APCDDatabase -- IndexedDB wrapper (singleton) for offline-first features
// ---------------------------------------------------------------------------

export interface SyncQueueItem {
  id: string;
  type: string;
  url: string;
  method: string;
  body: string | null;
  headers: Record<string, string>;
  status: 'pending' | 'processing' | 'failed' | 'completed';
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  lastAttempt: number | null;
  error: string | null;
}

export interface DraftData {
  id: string;
  formData: Record<string, unknown>;
  updatedAt: number;
}

export interface OfflinePhoto {
  id: string;
  applicationId: string;
  documentType: string;
  blob: Blob;
  fileName: string;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  gpsTimestamp: number | null;
  status: 'pending' | 'uploaded' | 'failed';
  createdAt: number;
}

interface CachedReferenceEntry {
  key: string;
  data: unknown;
  expiresAt: number;
}

const DB_NAME = 'apcd-offline';
const DB_VERSION = 1;

const STORE_SYNC_QUEUE = 'sync-queue';
const STORE_DRAFTS = 'draft-applications';
const STORE_REFERENCE = 'cached-reference';
const STORE_PHOTOS = 'photo-uploads';

export class APCDDatabase {
  // ---- singleton ----
  private static instance: APCDDatabase | null = null;
  private db: IDBDatabase | null = null;

  private constructor() {
    // private – use APCDDatabase.getInstance()
  }

  static getInstance(): APCDDatabase {
    if (!APCDDatabase.instance) {
      APCDDatabase.instance = new APCDDatabase();
    }
    return APCDDatabase.instance;
  }

  // -------------------------------------------------------------------
  // Open / upgrade
  // -------------------------------------------------------------------

  open(): Promise<IDBDatabase> {
    if (this.db) {
      return Promise.resolve(this.db);
    }

    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // sync-queue
        if (!db.objectStoreNames.contains(STORE_SYNC_QUEUE)) {
          const syncStore = db.createObjectStore(STORE_SYNC_QUEUE, { keyPath: 'id' });
          syncStore.createIndex('status', 'status', { unique: false });
          syncStore.createIndex('createdAt', 'createdAt', { unique: false });
          syncStore.createIndex('type', 'type', { unique: false });
        }

        // draft-applications
        if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
          const draftStore = db.createObjectStore(STORE_DRAFTS, { keyPath: 'id' });
          draftStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // cached-reference
        if (!db.objectStoreNames.contains(STORE_REFERENCE)) {
          const refStore = db.createObjectStore(STORE_REFERENCE, { keyPath: 'key' });
          refStore.createIndex('expiresAt', 'expiresAt', { unique: false });
        }

        // photo-uploads
        if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
          const photoStore = db.createObjectStore(STORE_PHOTOS, { keyPath: 'id' });
          photoStore.createIndex('applicationId', 'applicationId', { unique: false });
          photoStore.createIndex('status', 'status', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve(this.db);
      };

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message ?? 'unknown'}`));
      };
    });
  }

  // -------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------

  private async getStore(storeName: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.open();
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  private wrapRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(new Error(`IDB request failed: ${request.error?.message ?? 'unknown'}`));
    });
  }

  // -------------------------------------------------------------------
  // Sync Queue
  // -------------------------------------------------------------------

  async addToSyncQueue(item: SyncQueueItem): Promise<string> {
    const store = await this.getStore(STORE_SYNC_QUEUE, 'readwrite');
    await this.wrapRequest(store.add(item));
    return item.id;
  }

  async getSyncQueue(): Promise<SyncQueueItem[]> {
    const store = await this.getStore(STORE_SYNC_QUEUE, 'readonly');
    const index = store.index('status');
    const items = await this.wrapRequest(index.getAll('pending'));
    return items as SyncQueueItem[];
  }

  async updateSyncStatus(
    id: string,
    status: SyncQueueItem['status'],
    error?: string,
  ): Promise<void> {
    const store = await this.getStore(STORE_SYNC_QUEUE, 'readwrite');
    const existing = await this.wrapRequest(store.get(id));
    if (!existing) return;

    const updated: SyncQueueItem = {
      ...(existing as SyncQueueItem),
      status,
      lastAttempt: Date.now(),
      error: error ?? null,
    };
    await this.wrapRequest(store.put(updated));
  }

  async removeSyncItem(id: string): Promise<void> {
    const store = await this.getStore(STORE_SYNC_QUEUE, 'readwrite');
    await this.wrapRequest(store.delete(id));
  }

  // -------------------------------------------------------------------
  // Drafts
  // -------------------------------------------------------------------

  async saveDraft(applicationId: string, data: Record<string, unknown>): Promise<void> {
    const store = await this.getStore(STORE_DRAFTS, 'readwrite');
    const draft: DraftData = {
      id: applicationId,
      formData: data,
      updatedAt: Date.now(),
    };
    await this.wrapRequest(store.put(draft));
  }

  async getDraft(applicationId: string): Promise<DraftData | null> {
    const store = await this.getStore(STORE_DRAFTS, 'readonly');
    const result = await this.wrapRequest(store.get(applicationId));
    return (result as DraftData) ?? null;
  }

  async deleteDraft(applicationId: string): Promise<void> {
    const store = await this.getStore(STORE_DRAFTS, 'readwrite');
    await this.wrapRequest(store.delete(applicationId));
  }

  // -------------------------------------------------------------------
  // Cached reference data
  // -------------------------------------------------------------------

  async cacheReference(key: string, data: unknown, ttlMs: number): Promise<void> {
    const store = await this.getStore(STORE_REFERENCE, 'readwrite');
    const entry: CachedReferenceEntry = {
      key,
      data,
      expiresAt: Date.now() + ttlMs,
    };
    await this.wrapRequest(store.put(entry));
  }

  async getCachedReference(key: string): Promise<unknown | null> {
    const store = await this.getStore(STORE_REFERENCE, 'readonly');
    const entry = (await this.wrapRequest(store.get(key))) as CachedReferenceEntry | undefined;

    if (!entry) return null;

    // Expired – remove asynchronously and return null
    if (entry.expiresAt < Date.now()) {
      this.getStore(STORE_REFERENCE, 'readwrite')
        .then((s) => s.delete(key))
        .catch(() => {
          /* best-effort cleanup */
        });
      return null;
    }

    return entry.data;
  }

  // -------------------------------------------------------------------
  // Photo uploads
  // -------------------------------------------------------------------

  async savePhoto(photo: OfflinePhoto): Promise<string> {
    const store = await this.getStore(STORE_PHOTOS, 'readwrite');
    await this.wrapRequest(store.put(photo));
    return photo.id;
  }

  async getPhotos(applicationId: string): Promise<OfflinePhoto[]> {
    const store = await this.getStore(STORE_PHOTOS, 'readonly');
    const index = store.index('applicationId');
    const items = await this.wrapRequest(index.getAll(applicationId));
    return items as OfflinePhoto[];
  }

  async deletePhoto(id: string): Promise<void> {
    const store = await this.getStore(STORE_PHOTOS, 'readwrite');
    await this.wrapRequest(store.delete(id));
  }
}

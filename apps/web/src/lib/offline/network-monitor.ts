// ---------------------------------------------------------------------------
// NetworkMonitor -- tracks online/offline status and connection quality
// ---------------------------------------------------------------------------

export type ConnectionQuality = 'good' | 'slow' | 'offline';

export interface NetworkStatus {
  online: boolean;
  quality: ConnectionQuality;
  lastChecked: Date;
}

type StatusChangeCallback = (status: NetworkStatus) => void;

export class NetworkMonitor {
  private static instance: NetworkMonitor | null = null;

  private _isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private _connectionQuality: ConnectionQuality = 'good';
  private _lastChecked = new Date();

  private listeners: StatusChangeCallback[] = [];
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private healthEndpoint = '/api/health';

  private constructor() {
    // Singleton
  }

  static getInstance(): NetworkMonitor {
    if (!NetworkMonitor.instance) {
      NetworkMonitor.instance = new NetworkMonitor();
    }
    return NetworkMonitor.instance;
  }

  get isOnline(): boolean {
    return this._isOnline;
  }

  get connectionQuality(): ConnectionQuality {
    return this._connectionQuality;
  }

  /**
   * Start monitoring network status
   */
  start(): void {
    if (typeof window === 'undefined') return;

    // Listen to browser online/offline events
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    // Start periodic ping
    this.pingInterval = setInterval(() => {
      this.checkConnection();
    }, 30000); // 30 seconds

    // Initial check
    this.checkConnection();
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (typeof window === 'undefined') return;

    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Register a callback for status changes
   */
  onStatusChange(callback: StatusChangeCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  /**
   * Get current status
   */
  getStatus(): NetworkStatus {
    return {
      online: this._isOnline,
      quality: this._connectionQuality,
      lastChecked: this._lastChecked,
    };
  }

  private handleOnline = (): void => {
    this._isOnline = true;
    this.checkConnection();
  };

  private handleOffline = (): void => {
    this._isOnline = false;
    this._connectionQuality = 'offline';
    this._lastChecked = new Date();
    this.notifyListeners();
  };

  private async checkConnection(): Promise<void> {
    if (!navigator.onLine) {
      this._isOnline = false;
      this._connectionQuality = 'offline';
      this._lastChecked = new Date();
      this.notifyListeners();
      return;
    }

    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(this.healthEndpoint, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
      });

      clearTimeout(timeoutId);

      const elapsed = Date.now() - startTime;

      this._isOnline = response.ok;
      this._lastChecked = new Date();

      // Determine quality based on response time
      if (elapsed < 1000) {
        this._connectionQuality = 'good';
      } else if (elapsed < 5000) {
        this._connectionQuality = 'slow';
      } else {
        this._connectionQuality = 'offline';
      }
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      this._isOnline = false;
      this._connectionQuality = 'offline';
      this._lastChecked = new Date();

      // Log only if it's not an abort error
      if (error instanceof Error && error.name !== 'AbortError') {
        console.warn('Network check failed:', error.message);
      }
    }

    this.notifyListeners();
  }

  private notifyListeners(): void {
    const status = this.getStatus();
    for (const callback of this.listeners) {
      try {
        callback(status);
      } catch (error: unknown) {
        console.error('Error in network status listener:', error);
      }
    }
  }
}

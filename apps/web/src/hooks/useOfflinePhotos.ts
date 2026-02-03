'use client';

import { useState, useEffect, useCallback } from 'react';

import { APCDDatabase, OfflinePhoto } from '@/lib/offline/indexed-db';
import { NetworkMonitor } from '@/lib/offline/network-monitor';

interface UseOfflinePhotosResult {
  pendingPhotos: OfflinePhoto[];
  failedPhotos: OfflinePhoto[];
  isLoading: boolean;
  uploadPending: () => Promise<void>;
  retryFailed: () => Promise<void>;
  removePending: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Hook for managing offline photos for an application
 */
export function useOfflinePhotos(applicationId: string): UseOfflinePhotosResult {
  const [pendingPhotos, setPendingPhotos] = useState<OfflinePhoto[]>([]);
  const [failedPhotos, setFailedPhotos] = useState<OfflinePhoto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [db] = useState(() => new APCDDatabase());

  const loadPhotos = useCallback(async () => {
    try {
      const photos = await db.getPhotos(applicationId);
      setPendingPhotos(photos.filter((p) => p.status === 'pending'));
      setFailedPhotos(photos.filter((p) => p.status === 'failed'));
    } catch (error: unknown) {
      console.error('Failed to load offline photos:', error);
    } finally {
      setIsLoading(false);
    }
  }, [applicationId, db]);

  // Load photos on mount and when applicationId changes
  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  // Auto-upload when coming back online
  useEffect(() => {
    const networkMonitor = NetworkMonitor.getInstance();

    const unsubscribe = networkMonitor.onStatusChange((status) => {
      if (status.online && pendingPhotos.length > 0) {
        uploadPendingPhotos();
      }
    });

    return unsubscribe;
  }, [pendingPhotos.length]);

  const uploadPendingPhotos = useCallback(async () => {
    for (const photo of pendingPhotos) {
      try {
        const formData = new FormData();
        formData.append('file', photo.blob, photo.fileName);
        formData.append('documentType', photo.documentType);
        formData.append('applicationId', photo.applicationId);

        if (photo.gpsLatitude !== null && photo.gpsLongitude !== null) {
          formData.append('gpsLatitude', photo.gpsLatitude.toString());
          formData.append('gpsLongitude', photo.gpsLongitude.toString());
        }

        const response = await fetch('/api/attachments/upload', {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          await db.deletePhoto(photo.id);
        } else {
          throw new Error(`Upload failed: ${response.status}`);
        }
      } catch (error: unknown) {
        console.error('Failed to upload photo:', error);
        // Mark as failed in IndexedDB
        const photos = await db.getPhotos(applicationId);
        const failedPhoto = photos.find((p) => p.id === photo.id);
        if (failedPhoto) {
          await db.savePhoto({ ...failedPhoto, status: 'failed' });
        }
      }
    }

    await loadPhotos();
  }, [pendingPhotos, db, applicationId, loadPhotos]);

  const retryFailed = useCallback(async () => {
    // Reset failed photos to pending
    for (const photo of failedPhotos) {
      await db.savePhoto({ ...photo, status: 'pending' });
    }

    await loadPhotos();

    // Trigger upload if online
    const networkMonitor = NetworkMonitor.getInstance();
    if (networkMonitor.isOnline) {
      await uploadPendingPhotos();
    }
  }, [failedPhotos, db, loadPhotos, uploadPendingPhotos]);

  const removePending = useCallback(
    async (id: string) => {
      await db.deletePhoto(id);
      await loadPhotos();
    },
    [db, loadPhotos],
  );

  return {
    pendingPhotos,
    failedPhotos,
    isLoading,
    uploadPending: uploadPendingPhotos,
    retryFailed,
    removePending,
    refresh: loadPhotos,
  };
}

'use client';

import { useState, useCallback, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { APCDDatabase, OfflinePhoto } from '@/lib/offline/indexed-db';
import { NetworkMonitor } from '@/lib/offline/network-monitor';
import { compressImage } from '@/lib/photos/compress-image';

export interface CapturedPhoto {
  id: string;
  blob: Blob;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  gpsTimestamp: number | null;
  fileName: string;
}

interface OfflinePhotoCaptureProps {
  applicationId: string;
  documentType: string;
  photoSlot?: string;
  onUploadComplete?: (photo: CapturedPhoto) => void;
}

type GpsStatus = 'idle' | 'acquiring' | 'acquired' | 'failed';

export function OfflinePhotoCapture({
  applicationId,
  documentType,
  photoSlot,
  onUploadComplete,
}: OfflinePhotoCaptureProps) {
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('idle');
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dbRef = useRef(new APCDDatabase());

  const acquireGps = useCallback((): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      setGpsStatus('acquiring');

      if (!navigator.geolocation) {
        setGpsStatus('failed');
        reject(new Error('Geolocation is not supported by this browser'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGpsStatus('acquired');
          setGpsCoords({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          resolve(position);
        },
        (geoError) => {
          setGpsStatus('failed');
          reject(new Error(`GPS error: ${geoError.message}`));
        },
        {
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 0,
        },
      );
    });
  }, []);

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setError(null);
      setIsUploading(true);
      setUploadProgress(10);

      try {
        // Acquire GPS
        let gpsPosition: GeolocationPosition | null = null;
        try {
          gpsPosition = await acquireGps();
        } catch (gpsError: unknown) {
          console.warn('GPS acquisition failed:', gpsError);
          // Continue without GPS - some document types may not require it
        }

        setUploadProgress(30);

        // Compress image
        const compressedBlob = await compressImage(file, 2048, 0.85);
        setUploadProgress(50);

        // Generate preview
        const previewUrl = URL.createObjectURL(compressedBlob);
        setPreview(previewUrl);

        const capturedPhoto: CapturedPhoto = {
          id: `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          blob: compressedBlob,
          gpsLatitude: gpsPosition?.coords.latitude ?? null,
          gpsLongitude: gpsPosition?.coords.longitude ?? null,
          gpsTimestamp: gpsPosition?.timestamp ?? null,
          fileName: file.name.replace(/\.[^/.]+$/, '.jpg'),
        };

        const networkMonitor = NetworkMonitor.getInstance();

        if (networkMonitor.isOnline) {
          // Upload immediately
          setUploadProgress(70);

          const formData = new FormData();
          formData.append('file', compressedBlob, capturedPhoto.fileName);
          formData.append('documentType', documentType);
          formData.append('applicationId', applicationId);

          if (photoSlot) {
            formData.append('photoSlot', photoSlot);
          }

          const response = await fetch('/api/attachments/upload', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Upload failed: ${response.status}`);
          }

          setUploadProgress(100);
          onUploadComplete?.(capturedPhoto);
        } else {
          // Save to IndexedDB for later sync
          setUploadProgress(70);

          const offlinePhoto: OfflinePhoto = {
            id: capturedPhoto.id,
            applicationId,
            documentType,
            blob: compressedBlob,
            fileName: capturedPhoto.fileName,
            gpsLatitude: capturedPhoto.gpsLatitude,
            gpsLongitude: capturedPhoto.gpsLongitude,
            gpsTimestamp: capturedPhoto.gpsTimestamp,
            status: 'pending',
            createdAt: Date.now(),
          };

          await dbRef.current.savePhoto(offlinePhoto);
          setUploadProgress(100);

          onUploadComplete?.(capturedPhoto);
        }
      } catch (uploadError: unknown) {
        const message =
          uploadError instanceof Error ? uploadError.message : 'Unknown error occurred';
        setError(message);
        console.error('Photo capture failed:', uploadError);
      } finally {
        setIsUploading(false);
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [applicationId, documentType, photoSlot, acquireGps, onUploadComplete],
  );

  const triggerCapture = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />

      <Button onClick={triggerCapture} disabled={isUploading} className="w-full">
        {isUploading ? 'Processing...' : 'Capture Photo'}
      </Button>

      {/* GPS Status Indicator */}
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`h-2 w-2 rounded-full ${
            gpsStatus === 'idle'
              ? 'bg-gray-400'
              : gpsStatus === 'acquiring'
                ? 'animate-pulse bg-yellow-400'
                : gpsStatus === 'acquired'
                  ? 'bg-green-500'
                  : 'bg-red-500'
          }`}
        />
        <span>
          {gpsStatus === 'idle' && 'GPS: Ready'}
          {gpsStatus === 'acquiring' && 'GPS: Acquiring...'}
          {gpsStatus === 'acquired' &&
            gpsCoords &&
            `GPS: ${gpsCoords.lat.toFixed(6)}, ${gpsCoords.lng.toFixed(6)}`}
          {gpsStatus === 'failed' && 'GPS: Failed'}
        </span>
      </div>

      {/* Upload Progress */}
      {isUploading && (
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">
          {error}
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="relative">
          <img
            src={preview}
            alt="Captured photo preview"
            className="w-full max-h-64 object-contain rounded border"
          />
          <button
            onClick={() => setPreview(null)}
            className="absolute top-2 right-2 bg-black bg-opacity-50 text-white rounded-full p-1"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

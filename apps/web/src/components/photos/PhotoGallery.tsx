'use client';

import { useState, useCallback, useMemo } from 'react';

import { Button } from '@/components/ui/button';

export interface PhotoItem {
  id: string;
  thumbnailUrl?: string;
  blob?: Blob;
  status: 'uploaded' | 'pending' | 'failed';
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  gpsTimestamp: number | null;
  fileName: string;
  documentType: string;
  photoSlot?: string;
}

interface PhotoGalleryProps {
  applicationId: string;
  photos: PhotoItem[];
  onDelete?: (id: string) => void;
  onRetry?: (id: string) => void;
}

export function PhotoGallery({ photos, onDelete, onRetry }: PhotoGalleryProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoItem | null>(null);

  const getStatusBadge = useCallback((status: PhotoItem['status']) => {
    switch (status) {
      case 'uploaded':
        return (
          <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">Uploaded</span>
        );
      case 'pending':
        return (
          <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">
            Pending Upload
          </span>
        );
      case 'failed':
        return (
          <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded">Upload Failed</span>
        );
    }
  }, []);

  const formatTimestamp = useCallback((timestamp: number | null) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString();
  }, []);

  const formatCoordinates = useCallback((lat: number | null, lng: number | null) => {
    if (lat === null || lng === null) return 'No GPS data';
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }, []);

  // Generate blob URLs for pending photos
  const photoUrls = useMemo(() => {
    const urls: Record<string, string> = {};
    photos.forEach((photo) => {
      if (photo.blob) {
        urls[photo.id] = URL.createObjectURL(photo.blob);
      }
    });
    return urls;
  }, [photos]);

  if (photos.length === 0) {
    return <div className="text-center py-8 text-gray-500">No photos uploaded yet</div>;
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {photos.map((photo) => (
          <div key={photo.id} className="border rounded-lg overflow-hidden bg-white shadow-sm">
            {/* Thumbnail */}
            <div
              className="aspect-square bg-gray-100 cursor-pointer relative"
              onClick={() => setSelectedPhoto(photo)}
            >
              {photo.thumbnailUrl || photoUrls[photo.id] ? (
                <img
                  src={photo.thumbnailUrl || photoUrls[photo.id]}
                  alt={photo.fileName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  No preview
                </div>
              )}

              {/* Status badge overlay */}
              <div className="absolute top-2 left-2">{getStatusBadge(photo.status)}</div>
            </div>

            {/* Photo info */}
            <div className="p-2 text-xs space-y-1">
              <div className="font-medium truncate" title={photo.fileName}>
                {photo.fileName}
              </div>
              <div className="text-gray-500">
                {formatCoordinates(photo.gpsLatitude, photo.gpsLongitude)}
              </div>
              <div className="text-gray-500">{formatTimestamp(photo.gpsTimestamp)}</div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                {photo.status === 'pending' && onDelete && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(photo.id);
                    }}
                    className="text-xs h-6"
                  >
                    Delete
                  </Button>
                )}
                {photo.status === 'failed' && onRetry && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRetry(photo.id);
                    }}
                    className="text-xs h-6"
                  >
                    Retry
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Full-size modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="bg-white rounded-lg max-w-4xl max-h-[90vh] overflow-auto m-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <img
                src={selectedPhoto.thumbnailUrl || photoUrls[selectedPhoto.id]}
                alt={selectedPhoto.fileName}
                className="max-w-full max-h-[70vh] object-contain"
              />
              <button
                onClick={() => setSelectedPhoto(null)}
                className="absolute top-2 right-2 bg-black bg-opacity-50 text-white rounded-full w-8 h-8 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-2">
              <h3 className="font-medium">{selectedPhoto.fileName}</h3>
              <div className="text-sm text-gray-600">
                <p>
                  <strong>Type:</strong> {selectedPhoto.documentType}
                </p>
                {selectedPhoto.photoSlot && (
                  <p>
                    <strong>Slot:</strong> {selectedPhoto.photoSlot}
                  </p>
                )}
                <p>
                  <strong>GPS:</strong>{' '}
                  {formatCoordinates(selectedPhoto.gpsLatitude, selectedPhoto.gpsLongitude)}
                </p>
                <p>
                  <strong>Timestamp:</strong> {formatTimestamp(selectedPhoto.gpsTimestamp)}
                </p>
                <p>
                  <strong>Status:</strong> {getStatusBadge(selectedPhoto.status)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

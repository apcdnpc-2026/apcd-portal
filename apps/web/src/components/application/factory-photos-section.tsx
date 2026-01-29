'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Camera,
  Smartphone,
  X,
  CheckCircle,
  AlertCircle,
  MapPin,
  Clock,
  Globe,
  Upload,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { uploadFile, apiDelete } from '@/lib/api';

const FACTORY_PHOTO_SLOTS = [
  { slot: 'FRONT_VIEW', label: 'Front View of Factory', order: 1 },
  { slot: 'MANUFACTURING_AREA', label: 'Manufacturing Area', order: 2 },
  { slot: 'TESTING_LAB', label: 'Testing Laboratory', order: 3 },
  { slot: 'QC_AREA', label: 'Quality Control Area', order: 4 },
  { slot: 'RAW_MATERIAL_STORAGE', label: 'Raw Material Storage', order: 5 },
  { slot: 'FINISHED_GOODS', label: 'Finished Goods Area', order: 6 },
] as const;

interface AttachmentData {
  id: string;
  documentType: string;
  originalName: string;
  fileSizeBytes: number | string;
  hasValidGeoTag?: boolean;
  geoLatitude?: number;
  geoLongitude?: number;
  geoTimestamp?: string;
  isWithinIndia?: boolean;
  photoSlot?: string;
}

interface FactoryPhotosSectionProps {
  applicationId: string;
  existingAttachments: AttachmentData[];
  onPhotoChanged: () => void;
}

interface SlotState {
  status: 'empty' | 'previewing' | 'uploading' | 'uploaded' | 'error';
  file?: File;
  previewUrl?: string;
  previewExif?: {
    hasGps: boolean;
    hasTimestamp: boolean;
    latitude?: number;
    longitude?: number;
    timestamp?: Date;
  };
  attachment?: AttachmentData;
  progress?: number;
  error?: string;
}

// Client-side EXIF extraction using exifr (already installed, works in browser)
async function extractExifPreview(file: File): Promise<{
  hasGps: boolean;
  hasTimestamp: boolean;
  latitude?: number;
  longitude?: number;
  timestamp?: Date;
}> {
  try {
    // Dynamic import to avoid SSR issues
    const exifr = await import('exifr');
    const parse = exifr.parse || exifr.default?.parse;
    const exif = await parse(file, {
      gps: true,
      pick: ['latitude', 'longitude', 'DateTimeOriginal'],
    });

    if (!exif) return { hasGps: false, hasTimestamp: false };

    return {
      hasGps: typeof exif.latitude === 'number' && typeof exif.longitude === 'number',
      hasTimestamp: !!exif.DateTimeOriginal,
      latitude: exif.latitude,
      longitude: exif.longitude,
      timestamp: exif.DateTimeOriginal ? new Date(exif.DateTimeOriginal) : undefined,
    };
  } catch {
    return { hasGps: false, hasTimestamp: false };
  }
}

export function FactoryPhotosSection({
  applicationId,
  existingAttachments,
  onPhotoChanged,
}: FactoryPhotosSectionProps) {
  const [slots, setSlots] = useState<Record<string, SlotState>>({});

  // Initialize slots from existing attachments
  useEffect(() => {
    const initial: Record<string, SlotState> = {};
    const geoPhotos = existingAttachments.filter(
      (a) => a.documentType === 'GEO_TAGGED_PHOTOS' && a.photoSlot,
    );
    for (const photo of geoPhotos) {
      initial[photo.photoSlot!] = {
        status: 'uploaded',
        attachment: photo,
      };
    }
    setSlots(initial);
  }, [existingAttachments]);

  const completedCount = Object.values(slots).filter(
    (s) => s.status === 'uploaded',
  ).length;

  const handleFileDrop = useCallback(
    async (slotId: string, file: File) => {
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);

      // Show previewing state
      setSlots((prev) => ({
        ...prev,
        [slotId]: { status: 'previewing', file, previewUrl },
      }));

      // Extract EXIF client-side for instant feedback
      const exifData = await extractExifPreview(file);

      if (!exifData.hasGps || !exifData.hasTimestamp) {
        setSlots((prev) => ({
          ...prev,
          [slotId]: {
            status: 'error',
            file,
            previewUrl,
            previewExif: exifData,
            error: !exifData.hasGps && !exifData.hasTimestamp
              ? 'Photo has no GPS or timestamp data. Use a Timestamp Camera app.'
              : !exifData.hasGps
                ? 'No GPS coordinates found in this photo.'
                : 'No timestamp found in this photo.',
          },
        }));
        return;
      }

      // EXIF looks good - upload to server
      setSlots((prev) => ({
        ...prev,
        [slotId]: {
          status: 'uploading',
          file,
          previewUrl,
          previewExif: exifData,
          progress: 0,
        },
      }));

      try {
        const result = await uploadFile(
          '/attachments/upload',
          file,
          (progress) => {
            setSlots((prev) => ({
              ...prev,
              [slotId]: { ...prev[slotId], progress } as SlotState,
            }));
          },
          {
            applicationId,
            documentType: 'GEO_TAGGED_PHOTOS',
            photoSlot: slotId,
          },
        );

        const attachment = result.data || result;

        setSlots((prev) => ({
          ...prev,
          [slotId]: {
            status: 'uploaded',
            previewUrl,
            attachment,
          },
        }));

        onPhotoChanged();
      } catch (err: any) {
        const message =
          err.response?.data?.message ||
          err.response?.data?.data?.message ||
          'Upload failed. Ensure photo has GPS and timestamp data.';
        setSlots((prev) => ({
          ...prev,
          [slotId]: {
            status: 'error',
            file,
            previewUrl,
            previewExif: exifData,
            error: message,
          },
        }));
      }
    },
    [applicationId, onPhotoChanged],
  );

  const handleDelete = useCallback(
    async (slotId: string) => {
      const slot = slots[slotId];
      if (slot?.attachment?.id) {
        try {
          await apiDelete(`/attachments/${slot.attachment.id}`);
          onPhotoChanged();
        } catch {
          // Continue with local removal even if server delete fails
        }
      }

      // Revoke object URL
      if (slot?.previewUrl) {
        URL.revokeObjectURL(slot.previewUrl);
      }

      setSlots((prev) => {
        const updated = { ...prev };
        delete updated[slotId];
        return updated;
      });
    },
    [slots, onPhotoChanged],
  );

  return (
    <div className="space-y-5">
      {/* Timestamp App CTA */}
      <TimestampAppCTA />

      {/* Progress Circle + Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Factory Photographs (Geo-tagged)</h3>
        <PhotoProgressCircle completed={completedCount} total={6} />
      </div>

      {/* Photo Slots Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {FACTORY_PHOTO_SLOTS.map(({ slot, label, order }) => (
          <FactoryPhotoSlot
            key={slot}
            slotId={slot}
            label={label}
            order={order}
            state={slots[slot] || { status: 'empty' }}
            onFileDrop={(file) => handleFileDrop(slot, file)}
            onDelete={() => handleDelete(slot)}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Timestamp App Download CTA
// ============================================================================

function TimestampAppCTA() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Camera className="h-8 w-8 text-amber-600 flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h4 className="font-semibold text-amber-900">
              Geo-Tagged Photos Required
            </h4>
            <p className="text-sm text-amber-800 mt-1">
              All 6 factory photos must include <strong>GPS coordinates</strong>{' '}
              and a <strong>timestamp</strong> in the image EXIF data. Use a
              &quot;Timestamp Camera&quot; app to capture photos with embedded
              location and time.
            </p>
            <div className="flex gap-3 mt-3">
              <a
                href="https://play.google.com/store/apps/details?id=com.jeyluta.timestampcamerafree"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-900 bg-amber-200 hover:bg-amber-300 rounded-md px-3 py-1.5 transition-colors"
              >
                <Smartphone className="h-4 w-4" /> Google Play
              </a>
              <a
                href="https://apps.apple.com/app/timestamp-camera-basic/id840110184"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-900 bg-amber-200 hover:bg-amber-300 rounded-md px-3 py-1.5 transition-colors"
              >
                <Smartphone className="h-4 w-4" /> App Store
              </a>
            </div>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-amber-600 hover:text-amber-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// SVG Circular Progress (X/6)
// ============================================================================

function PhotoProgressCircle({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? completed / total : 0;
  const offset = circumference - progress * circumference;
  const isComplete = completed === total;

  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <svg width="68" height="68" viewBox="0 0 68 68">
          {/* Background circle */}
          <circle
            cx="34"
            cy="34"
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-gray-200"
            strokeWidth="5"
          />
          {/* Progress arc */}
          <circle
            cx="34"
            cy="34"
            r={radius}
            fill="none"
            stroke="currentColor"
            className={isComplete ? 'text-green-500' : 'text-blue-500'}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 34 34)"
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`text-sm font-bold ${isComplete ? 'text-green-600' : 'text-gray-700'}`}
          >
            {completed}/{total}
          </span>
        </div>
      </div>
      <div className="hidden sm:block">
        <p className="text-sm font-medium">
          {isComplete ? 'All Photos Uploaded' : `${total - completed} remaining`}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Individual Photo Slot
// ============================================================================

interface FactoryPhotoSlotProps {
  slotId: string;
  label: string;
  order: number;
  state: SlotState;
  onFileDrop: (file: File) => void;
  onDelete: () => void;
}

function FactoryPhotoSlot({
  label,
  order,
  state,
  onFileDrop,
  onDelete,
}: FactoryPhotoSlotProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => files[0] && onFileDrop(files[0]),
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    accept: { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] },
    disabled: state.status === 'uploading' || state.status === 'uploaded',
  });

  const hasPreview = state.previewUrl && state.status !== 'empty';
  const attachment = state.attachment;

  return (
    <Card
      className={
        state.status === 'uploaded'
          ? 'border-green-300 bg-green-50/50'
          : state.status === 'error'
            ? 'border-red-300 bg-red-50/50'
            : ''
      }
    >
      <CardContent className="p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center h-6 w-6 rounded-full bg-gray-100 text-xs font-bold text-gray-600">
              {order}
            </span>
            <span className="text-sm font-medium">{label}</span>
          </div>
          {state.status === 'uploaded' && (
            <CheckCircle className="h-5 w-5 text-green-500" />
          )}
        </div>

        {/* Photo Preview / Dropzone */}
        {state.status === 'empty' ? (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              isDragActive
                ? 'border-primary bg-primary/5'
                : 'border-muted hover:border-primary/50'
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="text-xs text-muted-foreground mt-2">
              {isDragActive ? 'Drop photo here' : 'Click or drag photo'}
            </p>
            <p className="text-xs text-muted-foreground">JPEG/PNG, max 10MB</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Image thumbnail */}
            {hasPreview && (
              <div className="relative rounded-lg overflow-hidden bg-gray-100 aspect-video">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={state.previewUrl}
                  alt={label}
                  className="w-full h-full object-cover"
                />
                {state.status === 'uploading' && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <div className="text-white text-sm font-medium">
                      {state.progress}%
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Validation Badges */}
            {state.status === 'uploaded' && attachment && (
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="success" className="text-xs gap-1">
                  <MapPin className="h-3 w-3" />
                  {Number(attachment.geoLatitude).toFixed(4)},{' '}
                  {Number(attachment.geoLongitude).toFixed(4)}
                </Badge>
                {attachment.geoTimestamp && (
                  <Badge variant="success" className="text-xs gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(attachment.geoTimestamp).toLocaleDateString('en-IN')}
                  </Badge>
                )}
                <Badge
                  variant={attachment.isWithinIndia ? 'success' : 'warning'}
                  className="text-xs gap-1"
                >
                  <Globe className="h-3 w-3" />
                  {attachment.isWithinIndia ? 'Within India' : 'Outside India'}
                </Badge>
              </div>
            )}

            {/* Preview badges (before upload) */}
            {(state.status === 'previewing' || state.status === 'uploading') &&
              state.previewExif && (
                <div className="flex flex-wrap gap-1.5">
                  <Badge
                    variant={state.previewExif.hasGps ? 'success' : 'destructive'}
                    className="text-xs gap-1"
                  >
                    <MapPin className="h-3 w-3" />
                    {state.previewExif.hasGps
                      ? `${state.previewExif.latitude?.toFixed(4)}, ${state.previewExif.longitude?.toFixed(4)}`
                      : 'No GPS'}
                  </Badge>
                  <Badge
                    variant={state.previewExif.hasTimestamp ? 'success' : 'destructive'}
                    className="text-xs gap-1"
                  >
                    <Clock className="h-3 w-3" />
                    {state.previewExif.hasTimestamp
                      ? state.previewExif.timestamp?.toLocaleDateString('en-IN')
                      : 'No Timestamp'}
                  </Badge>
                </div>
              )}

            {/* Error message */}
            {state.status === 'error' && (
              <div className="flex items-start gap-2 text-red-600">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <p className="text-xs">{state.error}</p>
              </div>
            )}

            {/* Upload progress bar */}
            {state.status === 'uploading' && (
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${state.progress || 0}%` }}
                />
              </div>
            )}

            {/* Delete / Retry button */}
            {(state.status === 'uploaded' || state.status === 'error') && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs h-7"
                onClick={onDelete}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                {state.status === 'error' ? 'Remove & Retry' : 'Remove Photo'}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { Injectable } from '@nestjs/common';
import * as exifr from 'exifr';

export interface GeoTagResult {
  hasValidGeoTag: boolean;
  latitude?: number;
  longitude?: number;
  timestamp?: Date;
  error?: string;
}

export interface GeoValidationResult {
  hasGps: boolean;
  hasTimestamp: boolean;
  hasValidGeoTag: boolean;
  latitude?: number;
  longitude?: number;
  timestamp?: Date;
  isWithinIndia?: boolean;
  error?: string;
}

@Injectable()
export class GeoTagValidatorService {
  /**
   * Extract and validate GPS coordinates AND timestamp from image EXIF data.
   * Returns granular validation results for badge display.
   */
  async extractAndValidate(buffer: Buffer): Promise<GeoValidationResult> {
    try {
      const exif = await exifr.parse(buffer, {
        gps: true,
        pick: ['latitude', 'longitude', 'DateTimeOriginal', 'GPSDateStamp', 'GPSTimeStamp'],
      });

      if (!exif) {
        return {
          hasGps: false,
          hasTimestamp: false,
          hasValidGeoTag: false,
          error: 'No EXIF data found. Use a Timestamp Camera app to capture photos.',
        };
      }

      const hasGps =
        typeof exif.latitude === 'number' &&
        typeof exif.longitude === 'number' &&
        exif.latitude >= -90 && exif.latitude <= 90 &&
        exif.longitude >= -180 && exif.longitude <= 180;

      const hasTimestamp = !!exif.DateTimeOriginal;

      const result: GeoValidationResult = {
        hasGps,
        hasTimestamp,
        hasValidGeoTag: hasGps && hasTimestamp,
      };

      if (hasGps) {
        result.latitude = exif.latitude;
        result.longitude = exif.longitude;
        result.isWithinIndia = this.isWithinIndia(exif.latitude, exif.longitude);
      }

      if (hasTimestamp) {
        result.timestamp = new Date(exif.DateTimeOriginal);
      }

      if (!hasGps && !hasTimestamp) {
        result.error = 'Photo has no GPS coordinates or timestamp. Use a Timestamp Camera app.';
      } else if (!hasGps) {
        result.error = 'GPS coordinates not found in image EXIF data.';
      } else if (!hasTimestamp) {
        result.error = 'Timestamp not found in image EXIF data.';
      }

      return result;
    } catch (error) {
      return {
        hasGps: false,
        hasTimestamp: false,
        hasValidGeoTag: false,
        error: `Failed to parse EXIF data: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Extract GPS coordinates from image EXIF data (legacy method).
   */
  async extractGeoTag(buffer: Buffer): Promise<GeoTagResult> {
    const result = await this.extractAndValidate(buffer);
    return {
      hasValidGeoTag: result.hasValidGeoTag,
      latitude: result.latitude,
      longitude: result.longitude,
      timestamp: result.timestamp,
      error: result.error,
    };
  }

  /**
   * Validate that coordinates are within India bounds (approximately)
   */
  isWithinIndia(latitude: number, longitude: number): boolean {
    const INDIA_BOUNDS = {
      minLat: 6.5,
      maxLat: 35.5,
      minLng: 68.0,
      maxLng: 97.5,
    };

    return (
      latitude >= INDIA_BOUNDS.minLat &&
      latitude <= INDIA_BOUNDS.maxLat &&
      longitude >= INDIA_BOUNDS.minLng &&
      longitude <= INDIA_BOUNDS.maxLng
    );
  }
}

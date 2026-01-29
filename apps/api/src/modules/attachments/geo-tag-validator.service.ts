import { Injectable } from '@nestjs/common';
import * as exifr from 'exifr';

export interface GeoTagResult {
  hasValidGeoTag: boolean;
  latitude?: number;
  longitude?: number;
  timestamp?: Date;
  error?: string;
}

@Injectable()
export class GeoTagValidatorService {
  /**
   * Extract GPS coordinates from image EXIF data
   */
  async extractGeoTag(buffer: Buffer): Promise<GeoTagResult> {
    try {
      const exif = await exifr.parse(buffer, {
        gps: true,
        pick: ['latitude', 'longitude', 'DateTimeOriginal', 'GPSDateStamp', 'GPSTimeStamp'],
      });

      if (!exif) {
        return { hasValidGeoTag: false, error: 'No EXIF data found' };
      }

      const { latitude, longitude } = exif;

      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return { hasValidGeoTag: false, error: 'GPS coordinates not found in image' };
      }

      // Validate coordinates are within reasonable bounds
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return { hasValidGeoTag: false, error: 'Invalid GPS coordinates' };
      }

      // Extract timestamp
      let timestamp: Date | undefined;
      if (exif.DateTimeOriginal) {
        timestamp = new Date(exif.DateTimeOriginal);
      }

      return {
        hasValidGeoTag: true,
        latitude,
        longitude,
        timestamp,
      };
    } catch (error) {
      return {
        hasValidGeoTag: false,
        error: `Failed to parse EXIF data: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Validate that coordinates are within India bounds (approximately)
   */
  isWithinIndia(latitude: number, longitude: number): boolean {
    // India approximate bounds
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

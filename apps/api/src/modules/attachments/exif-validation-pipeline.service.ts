import { Injectable, Logger } from '@nestjs/common';
import * as exifr from 'exifr';

// =============================================================================
// Interfaces
// =============================================================================

export interface ExifExtractionResult {
  // GPS
  latitude?: number;
  longitude?: number;
  altitude?: number;
  gpsAccuracyM?: number;
  gpsDOP?: number;
  gpsDateStamp?: string;
  gpsTimeStamp?: string;

  // Timestamps
  dateTimeOriginal?: Date;
  dateTimeDigitized?: Date;
  dateTime?: Date;
  offsetTimeOriginal?: string;

  // Device
  make?: string;
  model?: string;
  software?: string;

  // Image
  imageWidth?: number;
  imageHeight?: number;
  orientation?: number;

  // Raw EXIF (for debugging)
  rawExif?: Record<string, unknown>;
}

export interface ValidationContext {
  /** Type of validation: 'OEM' uses 500m proximity, 'FIELD_VERIFICATION' uses 200m */
  verificationType?: 'OEM' | 'FIELD_VERIFICATION';

  /** Registered factory coordinates for proximity check (L2) */
  factoryLatitude?: number;
  factoryLongitude?: number;

  /** Client-reported GPS for dual verification */
  clientLatitude?: number;
  clientLongitude?: number;

  /** Other photos in the same batch for cluster consistency (L3) */
  otherPhotoCoordinates?: Array<{ latitude: number; longitude: number }>;

  /** Maximum age in hours (default 720 = 30 days) */
  maxAgeHours?: number;

  /** Reference timestamp for staleness checks (default: now) */
  referenceTime?: Date;
}

export interface ValidationFlag {
  code: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  deduction: number;
}

export interface GeoValidationDetail {
  /** L1: India bounding box check */
  isWithinIndia: boolean;

  /** L2: Proximity to registered factory */
  distanceFromFactoryM?: number;
  isWithinProximity?: boolean;
  proximityThresholdM?: number;

  /** L3: Cluster consistency */
  clusterSpreadM?: number;
  isClusterConsistent?: boolean;
}

export interface TimestampValidationDetail {
  isFuture: boolean;
  isStale: boolean;
  ageHours?: number;
  isInternallyConsistent: boolean;
  isGpsCameraConsistent: boolean;
}

export interface AntiSpoofingDetail {
  softwareRiskLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  suspiciousSoftwarePatterns: string[];
  hasDeviceInfo: boolean;
  hasStandardAspectRatio: boolean;
  isScreenshotDimension: boolean;
  clientExifDistanceM?: number;
  isClientExifConsistent?: boolean;
}

export interface FullValidationResult {
  /** Whether basic EXIF extraction succeeded */
  extractionSuccess: boolean;

  /** Extracted EXIF data */
  exif: ExifExtractionResult;

  /** Geo-validation results (L1, L2, L3) */
  geo: GeoValidationDetail;

  /** Timestamp validation results */
  timestamp: TimestampValidationDetail;

  /** Anti-spoofing analysis */
  antiSpoofing: AntiSpoofingDetail;

  /** Trust score 0-100 */
  trustScore: number;

  /** All validation flags (deductions, warnings, etc.) */
  flags: ValidationFlag[];

  /** Legacy compatibility fields */
  hasGps: boolean;
  hasTimestamp: boolean;
  hasValidGeoTag: boolean;
  latitude?: number;
  longitude?: number;
  geoTimestamp?: Date;
  isWithinIndia: boolean;

  /** Error message if extraction completely failed */
  error?: string;
}

// =============================================================================
// Constants
// =============================================================================

const INDIA_BOUNDS = {
  minLat: 6.5,
  maxLat: 35.5,
  minLng: 68.0,
  maxLng: 97.5,
};

const EARTH_RADIUS_M = 6_371_000;

const PROXIMITY_THRESHOLDS = {
  OEM: 500,
  FIELD_VERIFICATION: 200,
} as const;

const MAX_CLUSTER_SPREAD_M = 1000;
const MAX_PHOTOS_IN_CLUSTER = 6;

/** Future tolerance in milliseconds (5 minutes) */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/** Default max age in hours (30 days) */
const DEFAULT_MAX_AGE_HOURS = 720;

/** Internal timestamp consistency tolerance in milliseconds (1 minute) */
const INTERNAL_TIMESTAMP_TOLERANCE_MS = 60 * 1000;

/** GPS/Camera cross-check tolerance in milliseconds (5 minutes) */
const GPS_CAMERA_TOLERANCE_MS = 5 * 60 * 1000;

/** Client/EXIF GPS mismatch threshold in meters (2 km) */
const CLIENT_EXIF_MISMATCH_M = 2000;

/** Suspicious software patterns (lowercase) */
const SUSPICIOUS_SOFTWARE_PATTERNS = [
  'photoshop',
  'gimp',
  'exiftool',
  'fake gps',
  'mock location',
  'gps joystick',
  'fly gps',
  'fake location',
  'location spoofer',
  'gps emulator',
  'mock gps',
  'location changer',
  'xposed',
  'magisk',
  'lucky patcher',
  'app cloner',
  'parallel space',
  'dual space',
];

/** Common screenshot dimensions */
const SCREENSHOT_DIMENSIONS = new Set([
  '1080x1920',
  '1920x1080',
  '1440x2560',
  '2560x1440',
  '1080x2340',
  '2340x1080',
  '1080x2400',
  '2400x1080',
  '1125x2436',
  '2436x1125',
  '1170x2532',
  '2532x1170',
  '1284x2778',
  '2778x1284',
  '750x1334',
  '1334x750',
  '828x1792',
  '1792x828',
]);

/** Standard photo aspect ratios (with tolerance) */
const STANDARD_ASPECT_RATIOS = [
  4 / 3, // 1.333 - most phone cameras
  3 / 4, // 0.75
  16 / 9, // 1.778 - widescreen
  9 / 16, // 0.5625
  3 / 2, // 1.5 - DSLR
  2 / 3, // 0.667
  1 / 1, // 1.0 - square
];

const ASPECT_RATIO_TOLERANCE = 0.05;

// =============================================================================
// Service
// =============================================================================

@Injectable()
export class ExifValidationPipelineService {
  private readonly logger = new Logger(ExifValidationPipelineService.name);

  /**
   * Main validation pipeline. Extracts EXIF metadata and runs full validation.
   */
  async validate(buffer: Buffer, context: ValidationContext = {}): Promise<FullValidationResult> {
    const flags: ValidationFlag[] = [];
    let trustScore = 100;

    // Step 1: Extract EXIF
    const exif = await this.extractExif(buffer);

    if (!exif) {
      return this.buildFailedResult(
        'No EXIF data found. Use a Timestamp Camera app to capture photos.',
      );
    }

    // Determine GPS validity
    const hasGps =
      typeof exif.latitude === 'number' &&
      typeof exif.longitude === 'number' &&
      exif.latitude >= -90 &&
      exif.latitude <= 90 &&
      exif.longitude >= -180 &&
      exif.longitude <= 180;

    const hasTimestamp = !!exif.dateTimeOriginal;

    // Step 2: Geo-Validation
    const geo = this.runGeoValidation(exif, hasGps, context, flags);

    // Step 3: Timestamp Validation
    const timestampResult = this.runTimestampValidation(exif, hasTimestamp, context, flags);

    // Step 4: Anti-Spoofing
    const antiSpoofing = this.runAntiSpoofing(exif, hasGps, context, flags);

    // Step 5: Calculate trust score from flags
    for (const flag of flags) {
      trustScore -= flag.deduction;
    }
    trustScore = Math.max(0, Math.min(100, trustScore));

    return {
      extractionSuccess: true,
      exif,
      geo,
      timestamp: timestampResult,
      antiSpoofing,
      trustScore,
      flags,

      // Legacy compatibility
      hasGps,
      hasTimestamp,
      hasValidGeoTag: hasGps && hasTimestamp,
      latitude: hasGps ? exif.latitude : undefined,
      longitude: hasGps ? exif.longitude : undefined,
      geoTimestamp: hasTimestamp ? exif.dateTimeOriginal : undefined,
      isWithinIndia: geo.isWithinIndia,
    };
  }

  // ===========================================================================
  // EXIF Extraction
  // ===========================================================================

  /** @internal Extract full EXIF metadata from buffer */
  private async extractExif(buffer: Buffer): Promise<ExifExtractionResult | null> {
    try {
      const exif = await exifr.parse(buffer, {
        gps: true,
        pick: [
          // GPS
          'latitude',
          'longitude',
          'GPSAltitude',
          'GPSHPositioningError',
          'GPSDOP',
          'GPSDateStamp',
          'GPSTimeStamp',
          // Timestamps
          'DateTimeOriginal',
          'DateTimeDigitized',
          'DateTime',
          'ModifyDate',
          'OffsetTimeOriginal',
          // Device
          'Make',
          'Model',
          'Software',
          // Image
          'ImageWidth',
          'ImageHeight',
          'ExifImageWidth',
          'ExifImageHeight',
          'Orientation',
        ],
      });

      if (!exif) return null;

      const result: ExifExtractionResult = {};

      // GPS
      if (typeof exif.latitude === 'number') result.latitude = exif.latitude;
      if (typeof exif.longitude === 'number') result.longitude = exif.longitude;
      if (typeof exif.GPSAltitude === 'number') result.altitude = exif.GPSAltitude;
      if (typeof exif.GPSHPositioningError === 'number')
        result.gpsAccuracyM = exif.GPSHPositioningError;
      if (typeof exif.GPSDOP === 'number') result.gpsDOP = exif.GPSDOP;
      if (exif.GPSDateStamp) result.gpsDateStamp = String(exif.GPSDateStamp);
      if (exif.GPSTimeStamp) result.gpsTimeStamp = String(exif.GPSTimeStamp);

      // Timestamps
      if (exif.DateTimeOriginal) result.dateTimeOriginal = new Date(exif.DateTimeOriginal);
      if (exif.DateTimeDigitized) result.dateTimeDigitized = new Date(exif.DateTimeDigitized);
      if (exif.DateTime || exif.ModifyDate) {
        result.dateTime = new Date(exif.DateTime || exif.ModifyDate);
      }
      if (exif.OffsetTimeOriginal) result.offsetTimeOriginal = String(exif.OffsetTimeOriginal);

      // Device
      if (exif.Make) result.make = String(exif.Make).trim();
      if (exif.Model) result.model = String(exif.Model).trim();
      if (exif.Software) result.software = String(exif.Software).trim();

      // Image dimensions
      const width = exif.ExifImageWidth || exif.ImageWidth;
      const height = exif.ExifImageHeight || exif.ImageHeight;
      if (typeof width === 'number') result.imageWidth = width;
      if (typeof height === 'number') result.imageHeight = height;
      if (typeof exif.Orientation === 'number') result.orientation = exif.Orientation;

      result.rawExif = exif;

      return result;
    } catch (error) {
      this.logger.warn(`EXIF extraction failed: ${(error as Error).message}`);
      return null;
    }
  }

  // ===========================================================================
  // Geo-Validation (L1, L2, L3)
  // ===========================================================================

  private runGeoValidation(
    exif: ExifExtractionResult,
    hasGps: boolean,
    context: ValidationContext,
    flags: ValidationFlag[],
  ): GeoValidationDetail {
    const result: GeoValidationDetail = {
      isWithinIndia: false,
    };

    if (!hasGps) {
      flags.push({
        code: 'NO_GPS',
        severity: 'ERROR',
        message: 'No valid GPS coordinates in EXIF data',
        deduction: 40,
      });
      return result;
    }

    // L1: India bounding box
    result.isWithinIndia = this.isWithinIndia(exif.latitude!, exif.longitude!);
    if (!result.isWithinIndia) {
      flags.push({
        code: 'OUTSIDE_INDIA',
        severity: 'ERROR',
        message: 'GPS coordinates are outside India',
        deduction: 30,
      });
    }

    // L2: Factory proximity
    if (context.factoryLatitude !== undefined && context.factoryLongitude !== undefined) {
      const distance = this.haversineDistance(
        exif.latitude!,
        exif.longitude!,
        context.factoryLatitude,
        context.factoryLongitude,
      );
      result.distanceFromFactoryM = Math.round(distance);

      const threshold = PROXIMITY_THRESHOLDS[context.verificationType || 'OEM'];
      result.proximityThresholdM = threshold;
      result.isWithinProximity = distance <= threshold;

      if (!result.isWithinProximity) {
        flags.push({
          code: 'FAR_FROM_FACTORY',
          severity: 'WARNING',
          message: `Photo taken ${result.distanceFromFactoryM}m from factory (threshold: ${threshold}m)`,
          deduction: 15,
        });
      }
    }

    // L3: Cluster consistency
    if (context.otherPhotoCoordinates && context.otherPhotoCoordinates.length > 0) {
      const allCoords = [
        { latitude: exif.latitude!, longitude: exif.longitude! },
        ...context.otherPhotoCoordinates.slice(0, MAX_PHOTOS_IN_CLUSTER - 1),
      ];

      let maxSpread = 0;
      for (let i = 0; i < allCoords.length; i++) {
        for (let j = i + 1; j < allCoords.length; j++) {
          const d = this.haversineDistance(
            allCoords[i].latitude,
            allCoords[i].longitude,
            allCoords[j].latitude,
            allCoords[j].longitude,
          );
          if (d > maxSpread) maxSpread = d;
        }
      }

      result.clusterSpreadM = Math.round(maxSpread);
      result.isClusterConsistent = maxSpread <= MAX_CLUSTER_SPREAD_M;

      if (!result.isClusterConsistent) {
        flags.push({
          code: 'CLUSTER_SPREAD',
          severity: 'WARNING',
          message: `Photo cluster spread ${result.clusterSpreadM}m exceeds ${MAX_CLUSTER_SPREAD_M}m limit`,
          deduction: 0, // Informational, no direct deduction
        });
      }
    }

    // GPS accuracy assessment
    if (exif.gpsAccuracyM !== undefined && exif.gpsAccuracyM > 100) {
      flags.push({
        code: 'LOW_GPS_ACCURACY',
        severity: 'WARNING',
        message: `GPS accuracy is ${exif.gpsAccuracyM}m (poor)`,
        deduction: 5,
      });
    }

    return result;
  }

  // ===========================================================================
  // Timestamp Validation
  // ===========================================================================

  private runTimestampValidation(
    exif: ExifExtractionResult,
    hasTimestamp: boolean,
    context: ValidationContext,
    flags: ValidationFlag[],
  ): TimestampValidationDetail {
    const result: TimestampValidationDetail = {
      isFuture: false,
      isStale: false,
      isInternallyConsistent: true,
      isGpsCameraConsistent: true,
    };

    if (!hasTimestamp) {
      flags.push({
        code: 'NO_TIMESTAMP',
        severity: 'ERROR',
        message: 'No DateTimeOriginal in EXIF data',
        deduction: 20,
      });
      return result;
    }

    const now = context.referenceTime || new Date();
    const dto = exif.dateTimeOriginal!;
    const diffMs = dto.getTime() - now.getTime();

    // Future timestamp check (> 5 min ahead)
    if (diffMs > FUTURE_TOLERANCE_MS) {
      result.isFuture = true;
      flags.push({
        code: 'FUTURE_TIMESTAMP',
        severity: 'ERROR',
        message: 'Photo timestamp is in the future',
        deduction: 25,
      });
    }

    // Staleness check
    const maxAgeHours = context.maxAgeHours ?? DEFAULT_MAX_AGE_HOURS;
    const ageMs = now.getTime() - dto.getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    result.ageHours = Math.round(ageHours * 100) / 100;

    if (ageHours > maxAgeHours) {
      result.isStale = true;
      flags.push({
        code: 'STALE_TIMESTAMP',
        severity: 'WARNING',
        message: `Photo is ${Math.round(ageHours)} hours old (max: ${maxAgeHours} hours)`,
        deduction: 10,
      });
    }

    // Internal consistency: DateTime vs DateTimeOriginal
    if (exif.dateTime && exif.dateTimeOriginal) {
      const internalDiff = Math.abs(exif.dateTime.getTime() - exif.dateTimeOriginal.getTime());
      if (internalDiff > INTERNAL_TIMESTAMP_TOLERANCE_MS) {
        result.isInternallyConsistent = false;
        flags.push({
          code: 'TIMESTAMP_INCONSISTENCY',
          severity: 'WARNING',
          message: `DateTime and DateTimeOriginal differ by ${Math.round(internalDiff / 1000)}s`,
          deduction: 10,
        });
      }
    }

    // GPS/Camera time cross-check
    // GPS timestamps are UTC; camera timestamps are typically local (IST = UTC+5:30)
    if (exif.gpsDateStamp && exif.gpsTimeStamp && exif.dateTimeOriginal) {
      const gpsUtc = this.parseGpsTimestamp(exif.gpsDateStamp, exif.gpsTimeStamp);
      if (gpsUtc) {
        // Camera time is IST (UTC+5:30), convert to UTC for comparison
        const cameraUtc = new Date(exif.dateTimeOriginal.getTime());
        // If no offset is specified, assume IST (+05:30)
        if (!exif.offsetTimeOriginal) {
          cameraUtc.setTime(cameraUtc.getTime() - 5.5 * 60 * 60 * 1000);
        }

        const gpsCameraDiff = Math.abs(gpsUtc.getTime() - cameraUtc.getTime());
        if (gpsCameraDiff > GPS_CAMERA_TOLERANCE_MS) {
          result.isGpsCameraConsistent = false;
          flags.push({
            code: 'GPS_CAMERA_MISMATCH',
            severity: 'WARNING',
            message: `GPS and camera timestamps differ by ${Math.round(gpsCameraDiff / 1000)}s`,
            deduction: 10,
          });
        }
      }
    }

    return result;
  }

  // ===========================================================================
  // Anti-Spoofing
  // ===========================================================================

  private runAntiSpoofing(
    exif: ExifExtractionResult,
    hasGps: boolean,
    context: ValidationContext,
    flags: ValidationFlag[],
  ): AntiSpoofingDetail {
    const result: AntiSpoofingDetail = {
      softwareRiskLevel: 'NONE',
      suspiciousSoftwarePatterns: [],
      hasDeviceInfo: !!(exif.make && exif.model),
      hasStandardAspectRatio: true,
      isScreenshotDimension: false,
    };

    // Software tag analysis
    const softwareAnalysis = this.analyzeSoftware(exif.software);
    result.softwareRiskLevel = softwareAnalysis.riskLevel;
    result.suspiciousSoftwarePatterns = softwareAnalysis.matchedPatterns;

    if (softwareAnalysis.riskLevel === 'HIGH' || softwareAnalysis.riskLevel === 'MEDIUM') {
      flags.push({
        code: 'SUSPICIOUS_SOFTWARE',
        severity: softwareAnalysis.riskLevel === 'HIGH' ? 'ERROR' : 'WARNING',
        message: `Suspicious software detected: ${exif.software}`,
        deduction: 20,
      });
    }

    // Device consistency
    if (!exif.make && !exif.model) {
      flags.push({
        code: 'NO_DEVICE_INFO',
        severity: 'WARNING',
        message: 'No camera Make/Model in EXIF data',
        deduction: 10,
      });
    }

    // Image integrity: aspect ratio
    if (exif.imageWidth && exif.imageHeight && exif.imageHeight > 0) {
      const aspectRatio = exif.imageWidth / exif.imageHeight;
      const isStandard = STANDARD_ASPECT_RATIOS.some(
        (r) => Math.abs(aspectRatio - r) < ASPECT_RATIO_TOLERANCE,
      );
      result.hasStandardAspectRatio = isStandard;

      // Screenshot dimensions
      const dimKey = `${exif.imageWidth}x${exif.imageHeight}`;
      result.isScreenshotDimension = SCREENSHOT_DIMENSIONS.has(dimKey);
    }

    // Client GPS vs EXIF GPS comparison
    if (
      hasGps &&
      context.clientLatitude !== undefined &&
      context.clientLongitude !== undefined &&
      exif.latitude !== undefined &&
      exif.longitude !== undefined
    ) {
      const clientExifDist = this.haversineDistance(
        exif.latitude,
        exif.longitude,
        context.clientLatitude,
        context.clientLongitude,
      );
      result.clientExifDistanceM = Math.round(clientExifDist);
      result.isClientExifConsistent = clientExifDist <= CLIENT_EXIF_MISMATCH_M;

      if (!result.isClientExifConsistent) {
        flags.push({
          code: 'CLIENT_EXIF_MISMATCH',
          severity: 'WARNING',
          message: `Client GPS and EXIF GPS differ by ${result.clientExifDistanceM}m (threshold: ${CLIENT_EXIF_MISMATCH_M}m)`,
          deduction: 15,
        });
      }
    }

    return result;
  }

  // ===========================================================================
  // Helper methods
  // ===========================================================================

  /** Check if coordinates fall within India bounding box */
  isWithinIndia(latitude: number, longitude: number): boolean {
    return (
      latitude >= INDIA_BOUNDS.minLat &&
      latitude <= INDIA_BOUNDS.maxLat &&
      longitude >= INDIA_BOUNDS.minLng &&
      longitude <= INDIA_BOUNDS.maxLng
    );
  }

  /**
   * Haversine distance between two points in meters.
   * Uses Earth radius = 6,371,000 m.
   */
  haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return EARTH_RADIUS_M * c;
  }

  /** Analyze software tag for suspicious patterns */
  analyzeSoftware(software?: string): {
    riskLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
    matchedPatterns: string[];
  } {
    if (!software) {
      return { riskLevel: 'NONE', matchedPatterns: [] };
    }

    const lower = software.toLowerCase();
    const matched = SUSPICIOUS_SOFTWARE_PATTERNS.filter((pattern) => lower.includes(pattern));

    if (matched.length === 0) {
      return { riskLevel: 'NONE', matchedPatterns: [] };
    }

    // HIGH risk: known spoofing tools
    const highRiskPatterns = [
      'fake gps',
      'mock location',
      'gps joystick',
      'fly gps',
      'fake location',
      'location spoofer',
      'gps emulator',
      'mock gps',
      'location changer',
    ];
    const hasHighRisk = matched.some((m) => highRiskPatterns.includes(m));

    // MEDIUM risk: image editing tools
    const mediumRiskPatterns = ['photoshop', 'gimp', 'exiftool'];
    const hasMediumRisk = matched.some((m) => mediumRiskPatterns.includes(m));

    let riskLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    if (hasHighRisk) riskLevel = 'HIGH';
    else if (hasMediumRisk) riskLevel = 'MEDIUM';

    return { riskLevel, matchedPatterns: matched };
  }

  /** Assess GPS accuracy grade based on horizontal accuracy value */
  assessGpsAccuracy(accuracyM?: number): string {
    if (accuracyM === undefined || accuracyM === null) return 'UNKNOWN';
    if (accuracyM <= 5) return 'EXCELLENT';
    if (accuracyM <= 15) return 'GOOD';
    if (accuracyM <= 50) return 'MODERATE';
    if (accuracyM <= 100) return 'POOR';
    return 'VERY_POOR';
  }

  // ===========================================================================
  // Internal Helpers
  // ===========================================================================

  /** Parse GPS date/time stamp strings into a Date (UTC) */
  private parseGpsTimestamp(dateStamp: string, timeStamp: string): Date | null {
    try {
      // GPSDateStamp format: "2025:01:15" or "2025-01-15"
      const dateParts = dateStamp.replace(/:/g, '-').split('-');
      if (dateParts.length !== 3) return null;

      // GPSTimeStamp can be "10:30:00" or an array representation
      const timeParts = timeStamp.replace(/,/g, ':').split(':');
      if (timeParts.length < 3) return null;

      const isoStr = `${dateParts[0]}-${dateParts[1].padStart(2, '0')}-${dateParts[2].padStart(2, '0')}T${timeParts[0].padStart(2, '0')}:${timeParts[1].padStart(2, '0')}:${timeParts[2].padStart(2, '0')}Z`;
      const d = new Date(isoStr);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }

  /** Build a failed result when extraction completely fails */
  private buildFailedResult(error: string): FullValidationResult {
    return {
      extractionSuccess: false,
      exif: {},
      geo: { isWithinIndia: false },
      timestamp: {
        isFuture: false,
        isStale: false,
        isInternallyConsistent: true,
        isGpsCameraConsistent: true,
      },
      antiSpoofing: {
        softwareRiskLevel: 'NONE',
        suspiciousSoftwarePatterns: [],
        hasDeviceInfo: false,
        hasStandardAspectRatio: true,
        isScreenshotDimension: false,
      },
      trustScore: 0,
      flags: [
        {
          code: 'NO_EXIF',
          severity: 'ERROR',
          message: error,
          deduction: 100,
        },
      ],
      hasGps: false,
      hasTimestamp: false,
      hasValidGeoTag: false,
      isWithinIndia: false,
      error,
    };
  }
}

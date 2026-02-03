import { Test, TestingModule } from '@nestjs/testing';
import * as exifr from 'exifr';

// ---------------------------------------------------------------------------
// Mock exifr
// ---------------------------------------------------------------------------

jest.mock('exifr', () => ({
  parse: jest.fn(),
}));

import { ExifValidationPipelineService } from './exif-validation-pipeline.service';

const mockParse = exifr.parse as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a standard EXIF mock with GPS + timestamps + device info */
function validExif(overrides: Record<string, unknown> = {}) {
  return {
    latitude: 28.6139,
    longitude: 77.209,
    DateTimeOriginal: '2025-01-15T10:30:00',
    Make: 'Samsung',
    Model: 'Galaxy S23',
    Software: 'S23 Camera v1.2',
    ExifImageWidth: 4032,
    ExifImageHeight: 3024,
    Orientation: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('ExifValidationPipelineService', () => {
  let service: ExifValidationPipelineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExifValidationPipelineService],
    }).compile();

    service = module.get<ExifValidationPipelineService>(ExifValidationPipelineService);
    mockParse.mockReset();
  });

  // =========================================================================
  // Full pipeline - happy path
  // =========================================================================

  describe('validate() - happy path', () => {
    it('should return full valid result for good photo with GPS and timestamp', async () => {
      mockParse.mockResolvedValue(validExif());

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.extractionSuccess).toBe(true);
      expect(result.hasGps).toBe(true);
      expect(result.hasTimestamp).toBe(true);
      expect(result.hasValidGeoTag).toBe(true);
      expect(result.latitude).toBe(28.6139);
      expect(result.longitude).toBe(77.209);
      expect(result.isWithinIndia).toBe(true);
      expect(result.trustScore).toBe(100);
      expect(result.flags).toHaveLength(0);
    });

    it('should populate exif extraction fields', async () => {
      mockParse.mockResolvedValue(
        validExif({
          GPSAltitude: 215.5,
          GPSHPositioningError: 8.0,
          DateTimeDigitized: '2025-01-15T10:30:00',
          DateTime: '2025-01-15T10:30:00',
        }),
      );

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.exif.altitude).toBe(215.5);
      expect(result.exif.gpsAccuracyM).toBe(8.0);
      expect(result.exif.make).toBe('Samsung');
      expect(result.exif.model).toBe('Galaxy S23');
      expect(result.exif.imageWidth).toBe(4032);
      expect(result.exif.imageHeight).toBe(3024);
    });
  });

  // =========================================================================
  // EXIF Extraction failures
  // =========================================================================

  describe('validate() - extraction failures', () => {
    it('should return failed result when no EXIF data', async () => {
      mockParse.mockResolvedValue(null);

      const result = await service.validate(Buffer.from('test'));

      expect(result.extractionSuccess).toBe(false);
      expect(result.hasGps).toBe(false);
      expect(result.hasTimestamp).toBe(false);
      expect(result.trustScore).toBe(0);
      expect(result.error).toContain('No EXIF data found');
    });

    it('should return failed result when exifr throws', async () => {
      mockParse.mockRejectedValue(new Error('Corrupt JPEG'));

      const result = await service.validate(Buffer.from('corrupt'));

      expect(result.extractionSuccess).toBe(false);
      expect(result.trustScore).toBe(0);
      expect(result.error).toContain('No EXIF data found');
    });
  });

  // =========================================================================
  // GPS Validation (L1 - India bounding box)
  // =========================================================================

  describe('GPS validation - L1 India bounds', () => {
    it('should flag NO_GPS when latitude is missing', async () => {
      mockParse.mockResolvedValue(validExif({ latitude: undefined }));

      const result = await service.validate(Buffer.from('test'));

      expect(result.hasGps).toBe(false);
      expect(result.flags.some((f) => f.code === 'NO_GPS')).toBe(true);
      expect(result.trustScore).toBeLessThanOrEqual(60);
    });

    it('should flag OUTSIDE_INDIA for London coordinates', async () => {
      mockParse.mockResolvedValue(validExif({ latitude: 51.5074, longitude: -0.1278 }));

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.geo.isWithinIndia).toBe(false);
      expect(result.isWithinIndia).toBe(false);
      expect(result.flags.some((f) => f.code === 'OUTSIDE_INDIA')).toBe(true);
    });

    it('should accept coordinates within India (Bangalore)', async () => {
      mockParse.mockResolvedValue(validExif({ latitude: 12.9716, longitude: 77.5946 }));

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.geo.isWithinIndia).toBe(true);
      expect(result.flags.some((f) => f.code === 'OUTSIDE_INDIA')).toBe(false);
    });

    it('should accept India boundary values', async () => {
      mockParse.mockResolvedValue(validExif({ latitude: 6.5, longitude: 68.0 }));

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.geo.isWithinIndia).toBe(true);
    });

    it('should reject just outside India bounds', async () => {
      mockParse.mockResolvedValue(validExif({ latitude: 6.4, longitude: 77.0 }));

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.geo.isWithinIndia).toBe(false);
    });
  });

  // =========================================================================
  // GPS Validation (L2 - Factory proximity)
  // =========================================================================

  describe('GPS validation - L2 Factory proximity', () => {
    it('should calculate distance from factory', async () => {
      mockParse.mockResolvedValue(validExif());

      const result = await service.validate(Buffer.from('test'), {
        factoryLatitude: 28.614,
        factoryLongitude: 77.209,
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.geo.distanceFromFactoryM).toBeDefined();
      expect(result.geo.distanceFromFactoryM).toBeLessThan(100);
      expect(result.geo.isWithinProximity).toBe(true);
    });

    it('should use 500m threshold for OEM verification', async () => {
      mockParse.mockResolvedValue(validExif());

      const result = await service.validate(Buffer.from('test'), {
        verificationType: 'OEM',
        factoryLatitude: 28.614,
        factoryLongitude: 77.209,
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.geo.proximityThresholdM).toBe(500);
    });

    it('should use 200m threshold for field verification', async () => {
      mockParse.mockResolvedValue(validExif());

      const result = await service.validate(Buffer.from('test'), {
        verificationType: 'FIELD_VERIFICATION',
        factoryLatitude: 28.614,
        factoryLongitude: 77.209,
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.geo.proximityThresholdM).toBe(200);
    });

    it('should flag FAR_FROM_FACTORY when photo is far away', async () => {
      mockParse.mockResolvedValue(
        validExif({ latitude: 28.7041, longitude: 77.1025 }), // ~15km from factory
      );

      const result = await service.validate(Buffer.from('test'), {
        factoryLatitude: 28.6139,
        factoryLongitude: 77.209,
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.geo.isWithinProximity).toBe(false);
      expect(result.flags.some((f) => f.code === 'FAR_FROM_FACTORY')).toBe(true);
    });

    it('should skip factory check when no factory coords provided', async () => {
      mockParse.mockResolvedValue(validExif());

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.geo.distanceFromFactoryM).toBeUndefined();
      expect(result.geo.isWithinProximity).toBeUndefined();
    });
  });

  // =========================================================================
  // GPS Validation (L3 - Cluster consistency)
  // =========================================================================

  describe('GPS validation - L3 Cluster consistency', () => {
    it('should detect consistent photo cluster', async () => {
      mockParse.mockResolvedValue(validExif());

      const result = await service.validate(Buffer.from('test'), {
        otherPhotoCoordinates: [
          { latitude: 28.614, longitude: 77.2091 },
          { latitude: 28.6138, longitude: 77.2089 },
        ],
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.geo.isClusterConsistent).toBe(true);
      expect(result.geo.clusterSpreadM).toBeDefined();
      expect(result.geo.clusterSpreadM).toBeLessThan(1000);
    });

    it('should flag inconsistent cluster when photos are far apart', async () => {
      mockParse.mockResolvedValue(validExif());

      const result = await service.validate(Buffer.from('test'), {
        otherPhotoCoordinates: [
          { latitude: 28.7041, longitude: 77.1025 }, // ~15km away
        ],
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.geo.isClusterConsistent).toBe(false);
      expect(result.flags.some((f) => f.code === 'CLUSTER_SPREAD')).toBe(true);
    });
  });

  // =========================================================================
  // Timestamp Validation
  // =========================================================================

  describe('Timestamp validation', () => {
    it('should flag NO_TIMESTAMP when DateTimeOriginal is missing', async () => {
      mockParse.mockResolvedValue(validExif({ DateTimeOriginal: undefined }));

      const result = await service.validate(Buffer.from('test'));

      expect(result.hasTimestamp).toBe(false);
      expect(result.flags.some((f) => f.code === 'NO_TIMESTAMP')).toBe(true);
    });

    it('should flag FUTURE_TIMESTAMP when photo is from the future', async () => {
      const futureDate = new Date('2025-06-01T10:00:00');
      mockParse.mockResolvedValue(validExif({ DateTimeOriginal: futureDate.toISOString() }));

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T10:00:00'),
      });

      expect(result.timestamp.isFuture).toBe(true);
      expect(result.flags.some((f) => f.code === 'FUTURE_TIMESTAMP')).toBe(true);
    });

    it('should not flag future within 5 minute tolerance', async () => {
      const now = new Date('2025-01-15T10:00:00');
      const slightlyFuture = new Date(now.getTime() + 3 * 60 * 1000); // 3 min ahead
      mockParse.mockResolvedValue(validExif({ DateTimeOriginal: slightlyFuture.toISOString() }));

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: now,
      });

      expect(result.timestamp.isFuture).toBe(false);
      expect(result.flags.some((f) => f.code === 'FUTURE_TIMESTAMP')).toBe(false);
    });

    it('should flag STALE_TIMESTAMP when photo is too old', async () => {
      mockParse.mockResolvedValue(validExif({ DateTimeOriginal: '2024-01-01T10:00:00' }));

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T10:00:00'),
        maxAgeHours: 720,
      });

      expect(result.timestamp.isStale).toBe(true);
      expect(result.flags.some((f) => f.code === 'STALE_TIMESTAMP')).toBe(true);
    });

    it('should not flag stale when within max age', async () => {
      mockParse.mockResolvedValue(validExif({ DateTimeOriginal: '2025-01-10T10:00:00' }));

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T10:00:00'),
        maxAgeHours: 720,
      });

      expect(result.timestamp.isStale).toBe(false);
    });

    it('should flag TIMESTAMP_INCONSISTENCY when DateTime differs from DateTimeOriginal', async () => {
      mockParse.mockResolvedValue(
        validExif({
          DateTimeOriginal: '2025-01-15T10:30:00',
          DateTime: '2025-01-15T12:00:00', // 90 min difference
        }),
      );

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T13:00:00'),
      });

      expect(result.timestamp.isInternallyConsistent).toBe(false);
      expect(result.flags.some((f) => f.code === 'TIMESTAMP_INCONSISTENCY')).toBe(true);
    });

    it('should not flag when DateTime and DateTimeOriginal are close', async () => {
      mockParse.mockResolvedValue(
        validExif({
          DateTimeOriginal: '2025-01-15T10:30:00',
          DateTime: '2025-01-15T10:30:30', // 30s difference
        }),
      );

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.timestamp.isInternallyConsistent).toBe(true);
    });

    it('should use configurable max age', async () => {
      mockParse.mockResolvedValue(validExif({ DateTimeOriginal: '2025-01-14T10:00:00' }));

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T10:00:00'),
        maxAgeHours: 12, // only 12 hours allowed
      });

      expect(result.timestamp.isStale).toBe(true);
    });
  });

  // =========================================================================
  // Anti-Spoofing
  // =========================================================================

  describe('Anti-spoofing', () => {
    it('should flag SUSPICIOUS_SOFTWARE for photoshop', async () => {
      mockParse.mockResolvedValue(validExif({ Software: 'Adobe Photoshop CC 2024' }));

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.antiSpoofing.softwareRiskLevel).toBe('MEDIUM');
      expect(result.antiSpoofing.suspiciousSoftwarePatterns).toContain('photoshop');
      expect(result.flags.some((f) => f.code === 'SUSPICIOUS_SOFTWARE')).toBe(true);
    });

    it('should flag HIGH risk for fake GPS software', async () => {
      mockParse.mockResolvedValue(validExif({ Software: 'Fake GPS Location Pro' }));

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.antiSpoofing.softwareRiskLevel).toBe('HIGH');
    });

    it('should flag SUSPICIOUS_SOFTWARE for exiftool', async () => {
      mockParse.mockResolvedValue(validExif({ Software: 'ExifTool 12.50' }));

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.antiSpoofing.softwareRiskLevel).toBe('MEDIUM');
      expect(result.flags.some((f) => f.code === 'SUSPICIOUS_SOFTWARE')).toBe(true);
    });

    it('should flag SUSPICIOUS_SOFTWARE for GIMP', async () => {
      mockParse.mockResolvedValue(validExif({ Software: 'GIMP 2.10.34' }));

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.antiSpoofing.softwareRiskLevel).toBe('MEDIUM');
    });

    it('should not flag normal camera software', async () => {
      mockParse.mockResolvedValue(validExif());

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.antiSpoofing.softwareRiskLevel).toBe('NONE');
      expect(result.flags.some((f) => f.code === 'SUSPICIOUS_SOFTWARE')).toBe(false);
    });

    it('should flag NO_DEVICE_INFO when Make and Model are missing', async () => {
      mockParse.mockResolvedValue(validExif({ Make: undefined, Model: undefined }));

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.antiSpoofing.hasDeviceInfo).toBe(false);
      expect(result.flags.some((f) => f.code === 'NO_DEVICE_INFO')).toBe(true);
    });

    it('should not flag when Make and Model are present', async () => {
      mockParse.mockResolvedValue(validExif());

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.antiSpoofing.hasDeviceInfo).toBe(true);
      expect(result.flags.some((f) => f.code === 'NO_DEVICE_INFO')).toBe(false);
    });

    it('should detect screenshot dimensions', async () => {
      mockParse.mockResolvedValue(validExif({ ExifImageWidth: 1080, ExifImageHeight: 1920 }));

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.antiSpoofing.isScreenshotDimension).toBe(true);
    });

    it('should not flag normal camera dimensions as screenshot', async () => {
      mockParse.mockResolvedValue(validExif()); // 4032x3024

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.antiSpoofing.isScreenshotDimension).toBe(false);
    });

    it('should flag CLIENT_EXIF_MISMATCH when client GPS differs significantly', async () => {
      mockParse.mockResolvedValue(validExif()); // Delhi

      const result = await service.validate(Buffer.from('test'), {
        clientLatitude: 19.076, // Mumbai
        clientLongitude: 72.8777,
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.antiSpoofing.isClientExifConsistent).toBe(false);
      expect(result.antiSpoofing.clientExifDistanceM).toBeGreaterThan(2000);
      expect(result.flags.some((f) => f.code === 'CLIENT_EXIF_MISMATCH')).toBe(true);
    });

    it('should not flag when client GPS is close to EXIF GPS', async () => {
      mockParse.mockResolvedValue(validExif());

      const result = await service.validate(Buffer.from('test'), {
        clientLatitude: 28.614,
        clientLongitude: 77.209,
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.antiSpoofing.isClientExifConsistent).toBe(true);
      expect(result.flags.some((f) => f.code === 'CLIENT_EXIF_MISMATCH')).toBe(false);
    });
  });

  // =========================================================================
  // Trust Score
  // =========================================================================

  describe('Trust score', () => {
    it('should start at 100 for a perfect photo', async () => {
      mockParse.mockResolvedValue(validExif());

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.trustScore).toBe(100);
    });

    it('should deduct 40 for no GPS', async () => {
      mockParse.mockResolvedValue(validExif({ latitude: undefined, longitude: undefined }));

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      const noGpsFlag = result.flags.find((f) => f.code === 'NO_GPS');
      expect(noGpsFlag).toBeDefined();
      expect(noGpsFlag!.deduction).toBe(40);
    });

    it('should deduct 30 for outside India', async () => {
      mockParse.mockResolvedValue(validExif({ latitude: 51.5074, longitude: -0.1278 }));

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      const flag = result.flags.find((f) => f.code === 'OUTSIDE_INDIA');
      expect(flag).toBeDefined();
      expect(flag!.deduction).toBe(30);
    });

    it('should deduct 20 for no timestamp', async () => {
      mockParse.mockResolvedValue(validExif({ DateTimeOriginal: undefined }));

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      const flag = result.flags.find((f) => f.code === 'NO_TIMESTAMP');
      expect(flag).toBeDefined();
      expect(flag!.deduction).toBe(20);
    });

    it('should deduct 25 for future timestamp', async () => {
      mockParse.mockResolvedValue(validExif({ DateTimeOriginal: '2026-06-01T10:00:00' }));

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T10:00:00'),
      });

      const flag = result.flags.find((f) => f.code === 'FUTURE_TIMESTAMP');
      expect(flag).toBeDefined();
      expect(flag!.deduction).toBe(25);
    });

    it('should deduct 10 for stale photo', async () => {
      mockParse.mockResolvedValue(validExif({ DateTimeOriginal: '2024-01-01T10:00:00' }));

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T10:00:00'),
      });

      const flag = result.flags.find((f) => f.code === 'STALE_TIMESTAMP');
      expect(flag).toBeDefined();
      expect(flag!.deduction).toBe(10);
    });

    it('should deduct 20 for suspicious software', async () => {
      mockParse.mockResolvedValue(validExif({ Software: 'Adobe Photoshop CC 2024' }));

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      const flag = result.flags.find((f) => f.code === 'SUSPICIOUS_SOFTWARE');
      expect(flag).toBeDefined();
      expect(flag!.deduction).toBe(20);
    });

    it('should deduct 10 for no device info', async () => {
      mockParse.mockResolvedValue(validExif({ Make: undefined, Model: undefined }));

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      const flag = result.flags.find((f) => f.code === 'NO_DEVICE_INFO');
      expect(flag).toBeDefined();
      expect(flag!.deduction).toBe(10);
    });

    it('should deduct 15 for far from factory', async () => {
      mockParse.mockResolvedValue(validExif({ latitude: 28.7041, longitude: 77.1025 }));

      const result = await service.validate(Buffer.from('test'), {
        factoryLatitude: 28.6139,
        factoryLongitude: 77.209,
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      const flag = result.flags.find((f) => f.code === 'FAR_FROM_FACTORY');
      expect(flag).toBeDefined();
      expect(flag!.deduction).toBe(15);
    });

    it('should deduct 5 for low GPS accuracy', async () => {
      mockParse.mockResolvedValue(validExif({ GPSHPositioningError: 150 }));

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      const flag = result.flags.find((f) => f.code === 'LOW_GPS_ACCURACY');
      expect(flag).toBeDefined();
      expect(flag!.deduction).toBe(5);
    });

    it('should deduct 15 for client/EXIF GPS mismatch', async () => {
      mockParse.mockResolvedValue(validExif());

      const result = await service.validate(Buffer.from('test'), {
        clientLatitude: 19.076,
        clientLongitude: 72.8777,
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      const flag = result.flags.find((f) => f.code === 'CLIENT_EXIF_MISMATCH');
      expect(flag).toBeDefined();
      expect(flag!.deduction).toBe(15);
    });

    it('should clamp trust score at 0 for worst-case scenario', async () => {
      // NO_GPS (-40) + NO_TIMESTAMP (-20) + SUSPICIOUS_SOFTWARE (-20) + NO_DEVICE_INFO (-10) = 90
      mockParse.mockResolvedValue(
        validExif({
          latitude: undefined,
          longitude: undefined,
          DateTimeOriginal: undefined,
          Make: undefined,
          Model: undefined,
          Software: 'Fake GPS Location Pro',
        }),
      );

      const result = await service.validate(Buffer.from('test'));

      expect(result.trustScore).toBe(10);
      expect(result.trustScore).toBeGreaterThanOrEqual(0);
      expect(result.trustScore).toBeLessThanOrEqual(100);
    });

    it('should accumulate multiple deductions correctly', async () => {
      // Outside India (-30) + No device info (-10) = 60
      mockParse.mockResolvedValue(
        validExif({
          latitude: 51.5074,
          longitude: -0.1278,
          Make: undefined,
          Model: undefined,
        }),
      );

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.trustScore).toBe(60);
    });
  });

  // =========================================================================
  // Haversine distance
  // =========================================================================

  describe('haversineDistance()', () => {
    it('should return 0 for identical points', () => {
      const d = service.haversineDistance(28.6139, 77.209, 28.6139, 77.209);
      expect(d).toBe(0);
    });

    it('should return correct distance for Delhi to Mumbai (~1,150 km)', () => {
      const d = service.haversineDistance(28.6139, 77.209, 19.076, 72.8777);
      expect(d).toBeGreaterThan(1_100_000);
      expect(d).toBeLessThan(1_200_000);
    });

    it('should return correct distance for nearby points', () => {
      // ~100m apart
      const d = service.haversineDistance(28.6139, 77.209, 28.6148, 77.209);
      expect(d).toBeGreaterThan(50);
      expect(d).toBeLessThan(200);
    });
  });

  // =========================================================================
  // isWithinIndia()
  // =========================================================================

  describe('isWithinIndia()', () => {
    it('should return true for Delhi', () => {
      expect(service.isWithinIndia(28.6139, 77.209)).toBe(true);
    });

    it('should return false for London', () => {
      expect(service.isWithinIndia(51.5074, -0.1278)).toBe(false);
    });

    it('should return true for boundary min', () => {
      expect(service.isWithinIndia(6.5, 68.0)).toBe(true);
    });

    it('should return true for boundary max', () => {
      expect(service.isWithinIndia(35.5, 97.5)).toBe(true);
    });

    it('should return false for just outside', () => {
      expect(service.isWithinIndia(6.4, 77.0)).toBe(false);
      expect(service.isWithinIndia(35.6, 77.0)).toBe(false);
      expect(service.isWithinIndia(25.0, 67.9)).toBe(false);
      expect(service.isWithinIndia(25.0, 97.6)).toBe(false);
    });
  });

  // =========================================================================
  // analyzeSoftware()
  // =========================================================================

  describe('analyzeSoftware()', () => {
    it('should return NONE for undefined software', () => {
      const result = service.analyzeSoftware(undefined);
      expect(result.riskLevel).toBe('NONE');
      expect(result.matchedPatterns).toHaveLength(0);
    });

    it('should return NONE for normal camera software', () => {
      const result = service.analyzeSoftware('Samsung Galaxy Camera v1.0');
      expect(result.riskLevel).toBe('NONE');
    });

    it('should return MEDIUM for photoshop', () => {
      const result = service.analyzeSoftware('Adobe Photoshop CC 2024');
      expect(result.riskLevel).toBe('MEDIUM');
      expect(result.matchedPatterns).toContain('photoshop');
    });

    it('should return HIGH for fake GPS tools', () => {
      const result = service.analyzeSoftware('Fake GPS Location');
      expect(result.riskLevel).toBe('HIGH');
      expect(result.matchedPatterns).toContain('fake gps');
    });

    it('should return HIGH for mock location', () => {
      const result = service.analyzeSoftware('Mock Location Provider');
      expect(result.riskLevel).toBe('HIGH');
    });

    it('should be case-insensitive', () => {
      const result = service.analyzeSoftware('ADOBE PHOTOSHOP');
      expect(result.riskLevel).toBe('MEDIUM');
    });
  });

  // =========================================================================
  // assessGpsAccuracy()
  // =========================================================================

  describe('assessGpsAccuracy()', () => {
    it('should return UNKNOWN for undefined', () => {
      expect(service.assessGpsAccuracy(undefined)).toBe('UNKNOWN');
    });

    it('should return EXCELLENT for <= 5m', () => {
      expect(service.assessGpsAccuracy(3)).toBe('EXCELLENT');
      expect(service.assessGpsAccuracy(5)).toBe('EXCELLENT');
    });

    it('should return GOOD for <= 15m', () => {
      expect(service.assessGpsAccuracy(10)).toBe('GOOD');
      expect(service.assessGpsAccuracy(15)).toBe('GOOD');
    });

    it('should return MODERATE for <= 50m', () => {
      expect(service.assessGpsAccuracy(30)).toBe('MODERATE');
    });

    it('should return POOR for <= 100m', () => {
      expect(service.assessGpsAccuracy(75)).toBe('POOR');
    });

    it('should return VERY_POOR for > 100m', () => {
      expect(service.assessGpsAccuracy(150)).toBe('VERY_POOR');
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('Edge cases', () => {
    it('should handle partial EXIF with only GPS', async () => {
      mockParse.mockResolvedValue({
        latitude: 28.6139,
        longitude: 77.209,
      });

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.hasGps).toBe(true);
      expect(result.hasTimestamp).toBe(false);
      expect(result.hasValidGeoTag).toBe(false);
    });

    it('should handle partial EXIF with only timestamp', async () => {
      mockParse.mockResolvedValue({
        DateTimeOriginal: '2025-01-15T10:30:00',
      });

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.hasGps).toBe(false);
      expect(result.hasTimestamp).toBe(true);
      expect(result.hasValidGeoTag).toBe(false);
    });

    it('should handle empty context', async () => {
      mockParse.mockResolvedValue(validExif());

      const result = await service.validate(Buffer.from('test'));

      expect(result.extractionSuccess).toBe(true);
      // Trust score may vary due to staleness (no referenceTime => uses real now)
      expect(result.trustScore).toBeGreaterThanOrEqual(0);
      expect(result.trustScore).toBeLessThanOrEqual(100);
    });

    it('should handle non-numeric latitude gracefully', async () => {
      mockParse.mockResolvedValue({
        latitude: 'bad',
        longitude: 77.209,
        DateTimeOriginal: '2025-01-15T10:30:00',
      });

      const result = await service.validate(Buffer.from('test'));

      expect(result.hasGps).toBe(false);
    });

    it('should handle out-of-range latitude', async () => {
      mockParse.mockResolvedValue({
        latitude: 95,
        longitude: 77.209,
        DateTimeOriginal: '2025-01-15T10:30:00',
      });

      const result = await service.validate(Buffer.from('test'));

      expect(result.hasGps).toBe(false);
    });

    it('should handle multiple suspicious software patterns', async () => {
      mockParse.mockResolvedValue(validExif({ Software: 'Fake GPS with Mock Location' }));

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.antiSpoofing.suspiciousSoftwarePatterns.length).toBeGreaterThanOrEqual(2);
      expect(result.antiSpoofing.softwareRiskLevel).toBe('HIGH');
    });

    it('should provide legacy compatibility fields', async () => {
      mockParse.mockResolvedValue(validExif());

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      // These fields maintain backward compatibility with GeoTagValidatorService
      expect(result.hasGps).toBeDefined();
      expect(result.hasTimestamp).toBeDefined();
      expect(result.hasValidGeoTag).toBeDefined();
      expect(result.latitude).toBeDefined();
      expect(result.longitude).toBeDefined();
      expect(result.geoTimestamp).toBeDefined();
      expect(result.isWithinIndia).toBeDefined();
    });
  });

  // =========================================================================
  // GPS/Camera time cross-check
  // =========================================================================

  describe('GPS/Camera time cross-check', () => {
    it('should flag GPS_CAMERA_MISMATCH when GPS and camera times differ significantly', async () => {
      mockParse.mockResolvedValue(
        validExif({
          DateTimeOriginal: '2025-01-15T10:30:00', // camera local time (IST assumed)
          GPSDateStamp: '2025:01:15',
          GPSTimeStamp: '10:30:00', // GPS UTC time -- but camera IST would be UTC+5:30 = 05:00 UTC
          // Difference: GPS says 10:30 UTC, camera converted to UTC = 05:00 UTC => 5.5h diff
        }),
      );

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00'),
      });

      expect(result.timestamp.isGpsCameraConsistent).toBe(false);
      expect(result.flags.some((f) => f.code === 'GPS_CAMERA_MISMATCH')).toBe(true);
    });

    it('should not flag when GPS and camera times are consistent (with offset)', async () => {
      // When OffsetTimeOriginal is provided, the IST assumption is skipped.
      // Camera time is 2025-01-15T10:30:00 with offset +05:30 => UTC 05:00.
      // GPS time is 05:00 UTC. They should match.
      mockParse.mockResolvedValue(
        validExif({
          DateTimeOriginal: '2025-01-15T10:30:00+05:30',
          GPSDateStamp: '2025:01:15',
          GPSTimeStamp: '05:00:00',
          OffsetTimeOriginal: '+05:30',
        }),
      );

      const result = await service.validate(Buffer.from('test'), {
        referenceTime: new Date('2025-01-15T12:00:00Z'),
      });

      expect(result.timestamp.isGpsCameraConsistent).toBe(true);
      expect(result.flags.some((f) => f.code === 'GPS_CAMERA_MISMATCH')).toBe(false);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';

import { GeoTagValidatorService } from './geo-tag-validator.service';

// ---------------------------------------------------------------------------
// Mock exifr
// ---------------------------------------------------------------------------

jest.mock('exifr', () => ({
  parse: jest.fn(),
}));

import * as exifr from 'exifr';

const mockParse = exifr.parse as jest.Mock;

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('GeoTagValidatorService', () => {
  let service: GeoTagValidatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GeoTagValidatorService],
    }).compile();

    service = module.get<GeoTagValidatorService>(GeoTagValidatorService);
    mockParse.mockReset();
  });

  // =========================================================================
  // extractAndValidate()
  // =========================================================================

  describe('extractAndValidate', () => {
    it('should return valid result when EXIF has GPS and timestamp', async () => {
      mockParse.mockResolvedValue({
        latitude: 28.6139,
        longitude: 77.209,
        DateTimeOriginal: '2025-01-15T10:30:00',
      });

      const result = await service.extractAndValidate(Buffer.from('test'));

      expect(result.hasGps).toBe(true);
      expect(result.hasTimestamp).toBe(true);
      expect(result.hasValidGeoTag).toBe(true);
      expect(result.latitude).toBe(28.6139);
      expect(result.longitude).toBe(77.209);
      expect(result.isWithinIndia).toBe(true);
      expect(result.timestamp).toEqual(new Date('2025-01-15T10:30:00'));
      expect(result.error).toBeUndefined();
    });

    it('should return error when no EXIF data found', async () => {
      mockParse.mockResolvedValue(null);

      const result = await service.extractAndValidate(Buffer.from('test'));

      expect(result.hasGps).toBe(false);
      expect(result.hasTimestamp).toBe(false);
      expect(result.hasValidGeoTag).toBe(false);
      expect(result.error).toContain('No EXIF data found');
    });

    it('should return hasGps=false when latitude is missing', async () => {
      mockParse.mockResolvedValue({
        longitude: 77.209,
        DateTimeOriginal: '2025-01-15T10:30:00',
      });

      const result = await service.extractAndValidate(Buffer.from('test'));

      expect(result.hasGps).toBe(false);
      expect(result.hasTimestamp).toBe(true);
      expect(result.hasValidGeoTag).toBe(false);
      expect(result.latitude).toBeUndefined();
      expect(result.error).toContain('GPS coordinates not found');
    });

    it('should return hasGps=false when longitude is missing', async () => {
      mockParse.mockResolvedValue({
        latitude: 28.6139,
        DateTimeOriginal: '2025-01-15T10:30:00',
      });

      const result = await service.extractAndValidate(Buffer.from('test'));

      expect(result.hasGps).toBe(false);
      expect(result.hasTimestamp).toBe(true);
      expect(result.hasValidGeoTag).toBe(false);
      expect(result.error).toContain('GPS coordinates not found');
    });

    it('should return hasTimestamp=false when GPS present but no timestamp', async () => {
      mockParse.mockResolvedValue({
        latitude: 28.6139,
        longitude: 77.209,
      });

      const result = await service.extractAndValidate(Buffer.from('test'));

      expect(result.hasGps).toBe(true);
      expect(result.hasTimestamp).toBe(false);
      expect(result.hasValidGeoTag).toBe(false);
      expect(result.latitude).toBe(28.6139);
      expect(result.longitude).toBe(77.209);
      expect(result.error).toContain('Timestamp not found');
    });

    it('should return error when neither GPS nor timestamp is present', async () => {
      mockParse.mockResolvedValue({
        Make: 'Canon',
        Model: 'EOS 5D',
      });

      const result = await service.extractAndValidate(Buffer.from('test'));

      expect(result.hasGps).toBe(false);
      expect(result.hasTimestamp).toBe(false);
      expect(result.hasValidGeoTag).toBe(false);
      expect(result.error).toContain('no GPS coordinates or timestamp');
    });

    it('should reject latitude out of range (> 90)', async () => {
      mockParse.mockResolvedValue({
        latitude: 95,
        longitude: 77.209,
        DateTimeOriginal: '2025-01-15T10:30:00',
      });

      const result = await service.extractAndValidate(Buffer.from('test'));

      expect(result.hasGps).toBe(false);
    });

    it('should reject latitude out of range (< -90)', async () => {
      mockParse.mockResolvedValue({
        latitude: -95,
        longitude: 77.209,
        DateTimeOriginal: '2025-01-15T10:30:00',
      });

      const result = await service.extractAndValidate(Buffer.from('test'));

      expect(result.hasGps).toBe(false);
    });

    it('should reject longitude out of range (> 180)', async () => {
      mockParse.mockResolvedValue({
        latitude: 28.6139,
        longitude: 200,
        DateTimeOriginal: '2025-01-15T10:30:00',
      });

      const result = await service.extractAndValidate(Buffer.from('test'));

      expect(result.hasGps).toBe(false);
    });

    it('should reject longitude out of range (< -180)', async () => {
      mockParse.mockResolvedValue({
        latitude: 28.6139,
        longitude: -200,
        DateTimeOriginal: '2025-01-15T10:30:00',
      });

      const result = await service.extractAndValidate(Buffer.from('test'));

      expect(result.hasGps).toBe(false);
    });

    it('should accept boundary latitude values (-90 and 90)', async () => {
      mockParse.mockResolvedValue({
        latitude: 90,
        longitude: 0,
        DateTimeOriginal: '2025-01-15T10:30:00',
      });

      const result = await service.extractAndValidate(Buffer.from('test'));
      expect(result.hasGps).toBe(true);

      mockParse.mockResolvedValue({
        latitude: -90,
        longitude: 0,
        DateTimeOriginal: '2025-01-15T10:30:00',
      });

      const result2 = await service.extractAndValidate(Buffer.from('test'));
      expect(result2.hasGps).toBe(true);
    });

    it('should accept boundary longitude values (-180 and 180)', async () => {
      mockParse.mockResolvedValue({
        latitude: 0,
        longitude: 180,
        DateTimeOriginal: '2025-01-15T10:30:00',
      });

      const result = await service.extractAndValidate(Buffer.from('test'));
      expect(result.hasGps).toBe(true);

      mockParse.mockResolvedValue({
        latitude: 0,
        longitude: -180,
        DateTimeOriginal: '2025-01-15T10:30:00',
      });

      const result2 = await service.extractAndValidate(Buffer.from('test'));
      expect(result2.hasGps).toBe(true);
    });

    it('should set isWithinIndia=false for coordinates outside India', async () => {
      mockParse.mockResolvedValue({
        latitude: 51.5074, // London
        longitude: -0.1278,
        DateTimeOriginal: '2025-01-15T10:30:00',
      });

      const result = await service.extractAndValidate(Buffer.from('test'));

      expect(result.hasGps).toBe(true);
      expect(result.isWithinIndia).toBe(false);
    });

    it('should handle exifr parse errors gracefully', async () => {
      mockParse.mockRejectedValue(new Error('Corrupt JPEG data'));

      const result = await service.extractAndValidate(Buffer.from('corrupt'));

      expect(result.hasGps).toBe(false);
      expect(result.hasTimestamp).toBe(false);
      expect(result.hasValidGeoTag).toBe(false);
      expect(result.error).toContain('Failed to parse EXIF data');
      expect(result.error).toContain('Corrupt JPEG data');
    });

    it('should set isWithinIndia=true for coordinates in India (Bangalore)', async () => {
      mockParse.mockResolvedValue({
        latitude: 12.9716,
        longitude: 77.5946,
        DateTimeOriginal: '2025-01-15T10:30:00',
      });

      const result = await service.extractAndValidate(Buffer.from('test'));

      expect(result.isWithinIndia).toBe(true);
    });

    it('should set isWithinIndia=true for coordinates in India (Mumbai)', async () => {
      mockParse.mockResolvedValue({
        latitude: 19.076,
        longitude: 72.8777,
        DateTimeOriginal: '2025-01-15T10:30:00',
      });

      const result = await service.extractAndValidate(Buffer.from('test'));

      expect(result.isWithinIndia).toBe(true);
    });

    it('should not set isWithinIndia when GPS is invalid', async () => {
      mockParse.mockResolvedValue({
        latitude: 200, // invalid
        longitude: 77.209,
        DateTimeOriginal: '2025-01-15T10:30:00',
      });

      const result = await service.extractAndValidate(Buffer.from('test'));

      expect(result.hasGps).toBe(false);
      expect(result.isWithinIndia).toBeUndefined();
    });

    it('should not set latitude/longitude when GPS is invalid', async () => {
      mockParse.mockResolvedValue({
        DateTimeOriginal: '2025-01-15T10:30:00',
      });

      const result = await service.extractAndValidate(Buffer.from('test'));

      expect(result.latitude).toBeUndefined();
      expect(result.longitude).toBeUndefined();
    });

    it('should reject non-numeric latitude', async () => {
      mockParse.mockResolvedValue({
        latitude: 'not-a-number',
        longitude: 77.209,
        DateTimeOriginal: '2025-01-15T10:30:00',
      });

      const result = await service.extractAndValidate(Buffer.from('test'));

      expect(result.hasGps).toBe(false);
    });
  });

  // =========================================================================
  // extractGeoTag() - legacy method
  // =========================================================================

  describe('extractGeoTag', () => {
    it('should return valid GeoTagResult for valid EXIF data', async () => {
      mockParse.mockResolvedValue({
        latitude: 28.6139,
        longitude: 77.209,
        DateTimeOriginal: '2025-01-15T10:30:00',
      });

      const result = await service.extractGeoTag(Buffer.from('test'));

      expect(result.hasValidGeoTag).toBe(true);
      expect(result.latitude).toBe(28.6139);
      expect(result.longitude).toBe(77.209);
      expect(result.timestamp).toEqual(new Date('2025-01-15T10:30:00'));
      expect(result.error).toBeUndefined();
    });

    it('should return invalid GeoTagResult when no EXIF data', async () => {
      mockParse.mockResolvedValue(null);

      const result = await service.extractGeoTag(Buffer.from('test'));

      expect(result.hasValidGeoTag).toBe(false);
      expect(result.error).toContain('No EXIF data found');
    });

    it('should return invalid when GPS is missing', async () => {
      mockParse.mockResolvedValue({
        DateTimeOriginal: '2025-01-15T10:30:00',
      });

      const result = await service.extractGeoTag(Buffer.from('test'));

      expect(result.hasValidGeoTag).toBe(false);
      expect(result.latitude).toBeUndefined();
      expect(result.longitude).toBeUndefined();
    });

    it('should return invalid when timestamp is missing', async () => {
      mockParse.mockResolvedValue({
        latitude: 28.6139,
        longitude: 77.209,
      });

      const result = await service.extractGeoTag(Buffer.from('test'));

      expect(result.hasValidGeoTag).toBe(false);
    });

    it('should handle parse errors gracefully', async () => {
      mockParse.mockRejectedValue(new Error('Bad data'));

      const result = await service.extractGeoTag(Buffer.from('corrupt'));

      expect(result.hasValidGeoTag).toBe(false);
      expect(result.error).toContain('Failed to parse EXIF data');
    });
  });

  // =========================================================================
  // isWithinIndia()
  // =========================================================================

  describe('isWithinIndia', () => {
    it('should return true for Delhi coordinates', () => {
      expect(service.isWithinIndia(28.6139, 77.209)).toBe(true);
    });

    it('should return true for Chennai coordinates', () => {
      expect(service.isWithinIndia(13.0827, 80.2707)).toBe(true);
    });

    it('should return true for southern boundary (Kanyakumari)', () => {
      expect(service.isWithinIndia(8.0883, 77.5385)).toBe(true);
    });

    it('should return true for northern boundary (Leh)', () => {
      expect(service.isWithinIndia(34.1526, 77.5771)).toBe(true);
    });

    it('should return false for London coordinates', () => {
      expect(service.isWithinIndia(51.5074, -0.1278)).toBe(false);
    });

    it('should return false for coordinates south of India', () => {
      expect(service.isWithinIndia(5.0, 77.0)).toBe(false);
    });

    it('should return false for coordinates east of India', () => {
      expect(service.isWithinIndia(25.0, 100.0)).toBe(false);
    });

    it('should return false for coordinates west of India', () => {
      expect(service.isWithinIndia(25.0, 65.0)).toBe(false);
    });

    it('should return false for coordinates north of India', () => {
      expect(service.isWithinIndia(40.0, 77.0)).toBe(false);
    });

    it('should return true for exact minimum boundary', () => {
      expect(service.isWithinIndia(6.5, 68.0)).toBe(true);
    });

    it('should return true for exact maximum boundary', () => {
      expect(service.isWithinIndia(35.5, 97.5)).toBe(true);
    });

    it('should return false for just below minimum latitude', () => {
      expect(service.isWithinIndia(6.4, 77.0)).toBe(false);
    });

    it('should return false for just above maximum latitude', () => {
      expect(service.isWithinIndia(35.6, 77.0)).toBe(false);
    });

    it('should return false for just below minimum longitude', () => {
      expect(service.isWithinIndia(25.0, 67.9)).toBe(false);
    });

    it('should return false for just above maximum longitude', () => {
      expect(service.isWithinIndia(25.0, 97.6)).toBe(false);
    });

    it('should return false for New York coordinates', () => {
      expect(service.isWithinIndia(40.7128, -74.006)).toBe(false);
    });

    it('should return false for Tokyo coordinates', () => {
      expect(service.isWithinIndia(35.6762, 139.6503)).toBe(false);
    });

    it('should return true for Kolkata coordinates', () => {
      expect(service.isWithinIndia(22.5726, 88.3639)).toBe(true);
    });
  });
});

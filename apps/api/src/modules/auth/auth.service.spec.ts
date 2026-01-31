import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';

import { AuthService } from './auth.service';

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-refresh-token-uuid'),
}));

describe('AuthService', () => {
  let service: AuthService;
  let prisma: DeepMockProxy<PrismaClient>;
  let jwtService: JwtService;
  let configService: ConfigService;

  const mockUser = {
    id: 'user-id-1',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    role: 'OEM' as const,
    firstName: 'John',
    lastName: 'Doe',
    phone: '555-1234',
    isVerified: false,
    isActive: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    lastLoginAt: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockDeep<PrismaClient>() },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('mock-access-token') },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              if (key === 'JWT_SECRET') return 'test-jwt-secret';
              if (key === 'JWT_ACCESS_EXPIRY') return defaultValue ?? '15m';
              if (key === 'SEED_SECRET') return defaultValue ?? 'apcd-seed-2025';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);

    // Default bcrypt mocks
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    // Default prisma refreshToken.create mock for generateTokens
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({
      id: 'rt-id',
      token: 'mock-refresh-token-uuid',
      userId: mockUser.id,
      expiresAt: new Date(),
      revokedAt: null,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── REGISTER ──────────────────────────────────────────────────────

  describe('register', () => {
    const registerDto = {
      email: 'Test@Example.com',
      password: 'StrongP@ss1',
      firstName: 'John',
      lastName: 'Doe',
      phone: '555-1234',
    };

    it('should create a user with hashed password and return tokens + user', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.register(registerDto);

      expect(bcrypt.hash).toHaveBeenCalledWith('StrongP@ss1', 12);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'test@example.com',
          passwordHash: 'hashed-password',
          role: 'OEM',
          firstName: 'John',
          lastName: 'Doe',
          phone: '555-1234',
          isVerified: false,
        }),
      });
      expect(result).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token-uuid',
        expiresIn: 900,
        user: {
          id: mockUser.id,
          email: mockUser.email,
          role: mockUser.role,
          firstName: mockUser.firstName,
          lastName: mockUser.lastName,
        },
      });
    });

    it('should lowercase the email before checking and saving', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      await service.register(registerDto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ email: 'test@example.com' }),
      });
    });

    it('should assign the OEM role to new users', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      await service.register(registerDto);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ role: 'OEM' }),
      });
    });

    it('should throw ConflictException when email already exists', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      await expect(service.register(registerDto)).rejects.toThrow('Email already registered');
    });

    it('should not call user.create when email is duplicate', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  // ─── LOGIN ─────────────────────────────────────────────────────────

  describe('login', () => {
    const loginDto = { email: 'Test@Example.com', password: 'StrongP@ss1' };

    it('should return tokens and user data for valid credentials', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.login(loginDto);

      expect(result).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token-uuid',
        expiresIn: 900,
        user: {
          id: mockUser.id,
          email: mockUser.email,
          role: mockUser.role,
          firstName: mockUser.firstName,
          lastName: mockUser.lastName,
        },
      });
    });

    it('should lowercase the email before lookup', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);

      await service.login(loginDto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });

    it('should compare dto password against stored hash', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);

      await service.login(loginDto);

      expect(bcrypt.compare).toHaveBeenCalledWith('StrongP@ss1', 'hashed-password');
    });

    it('should update lastLoginAt on successful login', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);

      await service.login(loginDto);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { lastLoginAt: expect.any(Date) },
      });
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(loginDto)).rejects.toThrow('Invalid email or password');
    });

    it('should throw UnauthorizedException when account is deactivated', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(loginDto)).rejects.toThrow(
        'Account is deactivated. Contact administrator.',
      );
    });

    it('should not compare password when account is deactivated', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when password is wrong', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(loginDto)).rejects.toThrow('Invalid email or password');
    });

    it('should not update lastLoginAt when password is wrong', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  // ─── REFRESH TOKENS ────────────────────────────────────────────────

  describe('refreshTokens', () => {
    const storedTokenRecord = {
      id: 'rt-id',
      token: 'valid-refresh-token',
      userId: mockUser.id,
      expiresAt: new Date(Date.now() + 86_400_000), // 1 day from now
      revokedAt: null,
      user: mockUser,
    };

    it('should return a new token pair when refresh token is valid', async () => {
      (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue(storedTokenRecord);
      (prisma.refreshToken.update as jest.Mock).mockResolvedValue({
        ...storedTokenRecord,
        revokedAt: new Date(),
      });

      const result = await service.refreshTokens(mockUser.id, 'valid-refresh-token');

      expect(result).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token-uuid',
        expiresIn: 900,
      });
    });

    it('should revoke the old refresh token', async () => {
      (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue(storedTokenRecord);
      (prisma.refreshToken.update as jest.Mock).mockResolvedValue({
        ...storedTokenRecord,
        revokedAt: new Date(),
      });

      await service.refreshTokens(mockUser.id, 'valid-refresh-token');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: storedTokenRecord.id },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('should query for non-revoked, non-expired token matching userId and token', async () => {
      (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue(storedTokenRecord);
      (prisma.refreshToken.update as jest.Mock).mockResolvedValue({
        ...storedTokenRecord,
        revokedAt: new Date(),
      });

      await service.refreshTokens(mockUser.id, 'valid-refresh-token');

      expect(prisma.refreshToken.findFirst).toHaveBeenCalledWith({
        where: {
          userId: mockUser.id,
          token: 'valid-refresh-token',
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        include: { user: true },
      });
    });

    it('should throw UnauthorizedException when no valid token is found', async () => {
      (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.refreshTokens(mockUser.id, 'invalid-token'),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.refreshTokens(mockUser.id, 'invalid-token'),
      ).rejects.toThrow('Invalid refresh token');
    });

    it('should throw UnauthorizedException for an expired token (filtered by query)', async () => {
      // The Prisma query filters expiresAt > now, so an expired token returns null
      (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.refreshTokens(mockUser.id, 'expired-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for a revoked token (filtered by query)', async () => {
      // The Prisma query filters revokedAt: null, so a revoked token returns null
      (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.refreshTokens(mockUser.id, 'revoked-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should generate tokens using the user data from the stored token', async () => {
      (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue(storedTokenRecord);
      (prisma.refreshToken.update as jest.Mock).mockResolvedValue({
        ...storedTokenRecord,
        revokedAt: new Date(),
      });

      await service.refreshTokens(mockUser.id, 'valid-refresh-token');

      expect(jwtService.sign).toHaveBeenCalledWith(
        { sub: mockUser.id, email: mockUser.email, role: mockUser.role },
        expect.objectContaining({ secret: 'test-jwt-secret' }),
      );
    });
  });

  // ─── GET ME ────────────────────────────────────────────────────────

  describe('getMe', () => {
    const selectedUser = {
      id: mockUser.id,
      email: mockUser.email,
      role: mockUser.role,
      firstName: mockUser.firstName,
      lastName: mockUser.lastName,
      phone: mockUser.phone,
      isVerified: mockUser.isVerified,
      isActive: mockUser.isActive,
      createdAt: mockUser.createdAt,
    };

    it('should return user data with the correct select fields', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(selectedUser);

      const result = await service.getMe(mockUser.id);

      expect(result).toEqual(selectedUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        select: {
          id: true,
          email: true,
          role: true,
          firstName: true,
          lastName: true,
          phone: true,
          isVerified: true,
          isActive: true,
          createdAt: true,
        },
      });
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getMe('nonexistent-id')).rejects.toThrow(UnauthorizedException);
      await expect(service.getMe('nonexistent-id')).rejects.toThrow('User not found');
    });
  });

  // ─── LOGOUT ────────────────────────────────────────────────────────

  describe('logout', () => {
    it('should revoke all non-revoked refresh tokens for the user', async () => {
      (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 3 });

      await service.logout(mockUser.id);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('should succeed even when there are no tokens to revoke', async () => {
      (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(service.logout(mockUser.id)).resolves.toBeUndefined();
    });
  });

  // ─── RESET TEST PASSWORDS ─────────────────────────────────────────

  describe('resetTestPasswords', () => {
    const validSecret = 'apcd-seed-2025';
    const oemUserId = 'oem-user-id';

    beforeEach(() => {
      // Mock upsert for each test user call
      (prisma.user.upsert as jest.Mock).mockResolvedValue(mockUser);
      // Mock findUnique for OEM user lookup
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...mockUser,
        id: oemUserId,
        email: 'oem@testcompany.com',
      });
      // Mock oemProfile upsert
      (prisma.oemProfile.upsert as jest.Mock).mockResolvedValue({});
    });

    it('should throw ForbiddenException when secret is wrong', async () => {
      await expect(service.resetTestPasswords('wrong-secret')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.resetTestPasswords('wrong-secret')).rejects.toThrow(
        'Invalid seed secret',
      );
    });

    it('should not call any database operations when secret is wrong', async () => {
      await expect(service.resetTestPasswords('wrong-secret')).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.user.upsert).not.toHaveBeenCalled();
      expect(bcrypt.hash).not.toHaveBeenCalled();
    });

    it('should upsert all 7 test users with correct secret', async () => {
      const result = await service.resetTestPasswords(validSecret);

      expect(prisma.user.upsert).toHaveBeenCalledTimes(7);
      expect(result.count).toBe(7);
      expect(result.results).toHaveLength(7);
      expect(result.message).toBe('Test passwords reset');
    });

    it('should hash passwords with bcrypt salt rounds of 12 for each test user', async () => {
      await service.resetTestPasswords(validSecret);

      // bcrypt.hash called once per user (7 users)
      expect(bcrypt.hash).toHaveBeenCalledTimes(7);
      for (const call of (bcrypt.hash as jest.Mock).mock.calls) {
        expect(call[1]).toBe(12);
      }
    });

    it('should upsert all expected test user emails', async () => {
      await service.resetTestPasswords(validSecret);

      const expectedEmails = [
        'admin@npcindia.gov.in',
        'officer@npcindia.gov.in',
        'head@npcindia.gov.in',
        'committee@npcindia.gov.in',
        'fieldverifier@npcindia.gov.in',
        'dealinghand@npcindia.gov.in',
        'oem@testcompany.com',
      ];

      const upsertCalls = (prisma.user.upsert as jest.Mock).mock.calls;
      const upsertedEmails = upsertCalls.map(
        (call: [{ where: { email: string } }]) => call[0].where.email,
      );

      for (const email of expectedEmails) {
        expect(upsertedEmails).toContain(email);
      }
    });

    it('should upsert test users with correct roles', async () => {
      await service.resetTestPasswords(validSecret);

      const expectedRoles: Record<string, string> = {
        'admin@npcindia.gov.in': 'SUPER_ADMIN',
        'officer@npcindia.gov.in': 'OFFICER',
        'head@npcindia.gov.in': 'ADMIN',
        'committee@npcindia.gov.in': 'COMMITTEE',
        'fieldverifier@npcindia.gov.in': 'FIELD_VERIFIER',
        'dealinghand@npcindia.gov.in': 'DEALING_HAND',
        'oem@testcompany.com': 'OEM',
      };

      const upsertCalls = (prisma.user.upsert as jest.Mock).mock.calls;
      for (const call of upsertCalls) {
        const email = call[0].where.email as string;
        const createRole = call[0].create.role as string;
        expect(createRole).toBe(expectedRoles[email]);
      }
    });

    it('should set isActive and isVerified to true for created test users', async () => {
      await service.resetTestPasswords(validSecret);

      const upsertCalls = (prisma.user.upsert as jest.Mock).mock.calls;
      for (const call of upsertCalls) {
        expect(call[0].create.isActive).toBe(true);
        expect(call[0].create.isVerified).toBe(true);
      }
    });

    it('should only update passwordHash on existing users (not change role)', async () => {
      await service.resetTestPasswords(validSecret);

      const upsertCalls = (prisma.user.upsert as jest.Mock).mock.calls;
      for (const call of upsertCalls) {
        expect(call[0].update).toEqual({ passwordHash: 'hashed-password' });
      }
    });

    it('should upsert OEM profile for the test OEM user', async () => {
      await service.resetTestPasswords(validSecret);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'oem@testcompany.com' },
      });
      expect(prisma.oemProfile.upsert).toHaveBeenCalledWith({
        where: { userId: oemUserId },
        update: {},
        create: expect.objectContaining({
          userId: oemUserId,
          companyName: 'Test APCD Manufacturing Pvt Ltd',
          state: 'Delhi',
          pinCode: '110020',
          firmType: 'PRIVATE_LIMITED',
        }),
      });
    });

    it('should not upsert OEM profile if OEM user is not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await service.resetTestPasswords(validSecret);

      expect(prisma.oemProfile.upsert).not.toHaveBeenCalled();
    });

    it('should return results with action "upserted" for each user', async () => {
      const result = await service.resetTestPasswords(validSecret);

      for (const entry of result.results) {
        expect(entry.action).toBe('upserted');
      }
    });

    it('should use SEED_SECRET from ConfigService with correct default', async () => {
      await service.resetTestPasswords(validSecret);

      expect(configService.get).toHaveBeenCalledWith('SEED_SECRET', 'apcd-seed-2025');
    });
  });

  // ─── GENERATE TOKENS (tested indirectly via login) ─────────────────

  describe('generateTokens (indirect)', () => {
    it('should sign JWT with correct payload containing sub, email, and role', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);

      await service.login({ email: mockUser.email, password: 'StrongP@ss1' });

      expect(jwtService.sign).toHaveBeenCalledWith(
        { sub: mockUser.id, email: mockUser.email, role: mockUser.role },
        { secret: 'test-jwt-secret', expiresIn: '15m' },
      );
    });

    it('should store refresh token in the database with an expiry date', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);

      await service.login({ email: mockUser.email, password: 'StrongP@ss1' });

      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: {
          token: 'mock-refresh-token-uuid',
          userId: mockUser.id,
          expiresAt: expect.any(Date),
        },
      });
    });

    it('should set refresh token expiry to approximately 7 days from now', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);

      const before = Date.now();
      await service.login({ email: mockUser.email, password: 'StrongP@ss1' });
      const after = Date.now();

      const createCall = (prisma.refreshToken.create as jest.Mock).mock.calls[0][0];
      const expiresAt = createCall.data.expiresAt as Date;
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      // Expiry should be within a reasonable range of 7 days from now
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
    });

    it('should use JWT_SECRET from ConfigService', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);

      await service.login({ email: mockUser.email, password: 'StrongP@ss1' });

      expect(configService.get).toHaveBeenCalledWith('JWT_SECRET');
    });
  });
});

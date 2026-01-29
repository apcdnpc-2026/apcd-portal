import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';

import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }));
jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-refresh-token-uuid') }));

describe('AuthService', () => {
  let service: AuthService;
  let prisma: DeepMockProxy<PrismaClient>;
  let jwtService: JwtService;
  const mockUser = {
    id: 'user-id-1',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    role: 'OEM',
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
              if (key === 'JWT_SECRET') return 'test-secret';
              if (key === 'JWT_ACCESS_EXPIRY') return defaultValue ?? '15m';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
    module.get<ConfigService>(ConfigService);

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

    it('should create a user with hashed password', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      await service.register(registerDto);

      expect(bcrypt.hash).toHaveBeenCalledWith('StrongP@ss1', 12);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ passwordHash: 'hashed-password' }),
      });
    });

    it('should lowercase the email before saving', async () => {
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

    it('should return tokens and user data on successful registration', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.register(registerDto);

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

    it('should throw ConflictException when email already exists', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      await expect(service.register(registerDto)).rejects.toThrow('Email already registered');
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

    it('should throw UnauthorizedException for wrong password', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(loginDto)).rejects.toThrow('Invalid email or password');
    });

    it('should throw UnauthorizedException for nonexistent email', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(loginDto)).rejects.toThrow('Invalid email or password');
    });

    it('should throw UnauthorizedException for inactive account', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(loginDto)).rejects.toThrow(
        'Account is deactivated. Contact administrator.',
      );
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
  });

  // ─── REFRESH TOKENS ────────────────────────────────────────────────

  describe('refreshTokens', () => {
    const storedTokenRecord = {
      id: 'rt-id',
      token: 'valid-refresh-token',
      userId: mockUser.id,
      expiresAt: new Date(Date.now() + 86400000),
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

    it('should throw UnauthorizedException when token is not found (revoked/expired/wrong)', async () => {
      (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.refreshTokens(mockUser.id, 'invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.refreshTokens(mockUser.id, 'invalid-token')).rejects.toThrow(
        'Invalid refresh token',
      );
    });
  });

  // ─── GET ME ────────────────────────────────────────────────────────

  describe('getMe', () => {
    it('should return user data', async () => {
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
    it('should revoke all refresh tokens for the user', async () => {
      (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 3 });

      await service.logout(mockUser.id);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  // ─── GENERATE TOKENS (tested indirectly) ──────────────────────────

  describe('generateTokens (indirect)', () => {
    it('should sign JWT with correct payload containing sub, email, and role', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);

      await service.login({ email: mockUser.email, password: 'StrongP@ss1' });

      expect(jwtService.sign).toHaveBeenCalledWith(
        { sub: mockUser.id, email: mockUser.email, role: mockUser.role },
        { secret: 'test-secret', expiresIn: '15m' },
      );
    });

    it('should store refresh token in the database', async () => {
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
  });
});

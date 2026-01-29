import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';

import { AdminService } from './admin.service';

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password_123'),
}));

describe('AdminService', () => {
  let service: AdminService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService, { provide: PrismaService, useValue: mockDeep<PrismaClient>() }],
    }).compile();

    service = module.get<AdminService>(AdminService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── getUsers ───────────────────────────────────────────────

  describe('getUsers', () => {
    it('should return paginated users with defaults', async () => {
      const mockUsers = [
        {
          id: '1',
          email: 'a@test.com',
          firstName: 'A',
          lastName: 'B',
          role: 'ADMIN',
          isActive: true,
          isVerified: true,
          phone: null,
          lastLoginAt: null,
          createdAt: new Date(),
        },
      ];
      prisma.user.findMany.mockResolvedValue(mockUsers as any);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.getUsers();

      expect(result.users).toEqual(mockUsers);
      expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1, pages: 1 });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20, orderBy: { createdAt: 'desc' } }),
      );
    });

    it('should apply role filter when provided', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.getUsers(1, 10, 'ADMIN' as any);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ role: 'ADMIN' }) }),
      );
    });

    it('should apply search filter across email, firstName, lastName', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.getUsers(1, 10, undefined, 'john');

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { email: { contains: 'john', mode: 'insensitive' } },
              { firstName: { contains: 'john', mode: 'insensitive' } },
              { lastName: { contains: 'john', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('should calculate pagination correctly for page 3', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(55);

      const result = await service.getUsers(3, 20);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 40, take: 20 }),
      );
      expect(result.pagination).toEqual({ page: 3, limit: 20, total: 55, pages: 3 });
    });
  });

  // ─── getUserById ────────────────────────────────────────────

  describe('getUserById', () => {
    it('should return user with oemProfile when found', async () => {
      const mockUser = {
        id: 'u1',
        email: 'test@test.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'OEM',
        isActive: true,
        isVerified: true,
        phone: '1234567890',
        lastLoginAt: null,
        createdAt: new Date(),
        oemProfile: { companyName: 'Acme' },
      };
      prisma.user.findUnique.mockResolvedValue(mockUser as any);

      const result = await service.getUserById('u1');

      expect(result).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' } }),
      );
    });

    it('should throw NotFoundException when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getUserById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── createUser ─────────────────────────────────────────────

  describe('createUser', () => {
    const createDto = {
      email: 'new@test.com',
      password: 'Str0ngP@ss',
      firstName: 'New',
      lastName: 'User',
      role: 'OEM' as any,
      phone: '9999999999',
    };

    it('should hash password, set isVerified, and create user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const createdUser = {
        id: 'u2',
        email: createDto.email,
        firstName: 'New',
        lastName: 'User',
        role: 'OEM',
        isActive: true,
        createdAt: new Date(),
      };
      prisma.user.create.mockResolvedValue(createdUser as any);

      const result = await service.createUser(createDto);

      expect(bcrypt.hash).toHaveBeenCalledWith('Str0ngP@ss', 12);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'new@test.com',
            passwordHash: 'hashed_password_123',
            firstName: 'New',
            lastName: 'User',
            role: 'OEM',
            phone: '9999999999',
            isVerified: true,
          }),
        }),
      );
      expect(result).toEqual(createdUser);
    });

    it('should throw BadRequestException for duplicate email', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' } as any);

      await expect(service.createUser(createDto)).rejects.toThrow(BadRequestException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  // ─── updateUser ─────────────────────────────────────────────

  describe('updateUser', () => {
    it('should update and return user when found', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' } as any);
      const updated = {
        id: 'u1',
        email: 'a@b.com',
        firstName: 'Updated',
        lastName: 'Name',
        role: 'OEM',
        isActive: true,
        phone: null,
      };
      prisma.user.update.mockResolvedValue(updated as any);

      const result = await service.updateUser('u1', { firstName: 'Updated' });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' }, data: { firstName: 'Updated' } }),
      );
      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.updateUser('bad', { firstName: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── toggleUserStatus ──────────────────────────────────────

  describe('toggleUserStatus', () => {
    it('should toggle isActive from true to false', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', isActive: true } as any);
      prisma.user.update.mockResolvedValue({ id: 'u1', isActive: false } as any);

      const result = await service.toggleUserStatus('u1');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' }, data: { isActive: false } }),
      );
      expect(result.isActive).toBe(false);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.toggleUserStatus('bad')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getFeeConfigurations ──────────────────────────────────

  describe('getFeeConfigurations', () => {
    it('should return all fee configs ordered by paymentType', async () => {
      const configs = [{ id: '1', paymentType: 'APPLICATION_FEE', baseAmount: 500 }];
      prisma.feeConfiguration.findMany.mockResolvedValue(configs as any);

      const result = await service.getFeeConfigurations();

      expect(result).toEqual(configs);
      expect(prisma.feeConfiguration.findMany).toHaveBeenCalledWith({
        orderBy: { paymentType: 'asc' },
      });
    });
  });

  // ─── updateFeeConfiguration ────────────────────────────────

  describe('updateFeeConfiguration', () => {
    it('should upsert fee configuration with defaults for create', async () => {
      const upserted = {
        paymentType: 'APPLICATION_FEE',
        baseAmount: 1000,
        gstRate: 18,
        discountPercent: 15,
      };
      prisma.feeConfiguration.upsert.mockResolvedValue(upserted as any);

      const result = await service.updateFeeConfiguration('APPLICATION_FEE' as any, 1000);

      expect(prisma.feeConfiguration.upsert).toHaveBeenCalledWith({
        where: { paymentType: 'APPLICATION_FEE' },
        update: { baseAmount: 1000 },
        create: {
          paymentType: 'APPLICATION_FEE',
          baseAmount: 1000,
          gstRate: 18,
          discountPercent: 15,
        },
      });
      expect(result).toEqual(upserted);
    });
  });

  // ─── getApcdTypes ──────────────────────────────────────────

  describe('getApcdTypes', () => {
    it('should return APCD types ordered by category and sortOrder', async () => {
      const types = [{ id: '1', category: 'Cat A', sortOrder: 1, isActive: true }];
      prisma.aPCDType.findMany.mockResolvedValue(types as any);

      const result = await service.getApcdTypes();

      expect(result).toEqual(types);
      expect(prisma.aPCDType.findMany).toHaveBeenCalledWith({
        orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
      });
    });
  });

  // ─── toggleApcdTypeStatus ──────────────────────────────────

  describe('toggleApcdTypeStatus', () => {
    it('should toggle APCD type isActive from true to false', async () => {
      prisma.aPCDType.findUnique.mockResolvedValue({ id: 't1', isActive: true } as any);
      prisma.aPCDType.update.mockResolvedValue({ id: 't1', isActive: false } as any);

      const result = await service.toggleApcdTypeStatus('t1');

      expect(prisma.aPCDType.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { isActive: false },
      });
      expect(result.isActive).toBe(false);
    });

    it('should throw NotFoundException when APCD type not found', async () => {
      prisma.aPCDType.findUnique.mockResolvedValue(null);

      await expect(service.toggleApcdTypeStatus('bad')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getSystemStats ────────────────────────────────────────

  describe('getSystemStats', () => {
    it('should aggregate and return system statistics', async () => {
      prisma.user.count.mockResolvedValue(42);
      prisma.application.count.mockResolvedValue(150);
      prisma.payment.aggregate.mockResolvedValue({
        _sum: { totalAmount: 75000 },
        _count: 120,
        _avg: { totalAmount: null },
        _min: { totalAmount: null },
        _max: { totalAmount: null },
      } as any);
      prisma.attachment.aggregate.mockResolvedValue({
        _sum: { fileSizeBytes: BigInt(10485760) },
        _count: 300,
        _avg: { fileSizeBytes: null },
        _min: { fileSizeBytes: null },
        _max: { fileSizeBytes: null },
      } as any);

      const result = await service.getSystemStats();

      expect(result.users.total).toBe(42);
      expect(result.applications.total).toBe(150);
      expect(result.payments.total).toBe(120);
      expect(result.payments.totalAmount).toBe(75000);
      expect(result.storage.totalFiles).toBe(300);
      expect(result.storage.totalSizeMB).toBeCloseTo(10, 0);
    });

    it('should handle null sums gracefully (zero fallback)', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.application.count.mockResolvedValue(0);
      prisma.payment.aggregate.mockResolvedValue({
        _sum: { totalAmount: null },
        _count: 0,
        _avg: { totalAmount: null },
        _min: { totalAmount: null },
        _max: { totalAmount: null },
      } as any);
      prisma.attachment.aggregate.mockResolvedValue({
        _sum: { fileSizeBytes: null },
        _count: 0,
        _avg: { fileSizeBytes: null },
        _min: { fileSizeBytes: null },
        _max: { fileSizeBytes: null },
      } as any);

      const result = await service.getSystemStats();

      expect(result.payments.totalAmount).toBe(0);
      expect(result.storage.totalSize).toBe(0);
      expect(result.storage.totalSizeMB).toBe(0);
    });
  });
});

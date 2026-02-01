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

    it('should handle large limit without crashing', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const result = await service.getUsers(1, 10000);

      expect(result.pagination).toEqual({ page: 1, limit: 10000, total: 0, pages: 0 });
      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10000 }));
    });

    it('should apply both role and search filters simultaneously', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.getUsers(1, 10, 'OFFICER' as any, 'jane');

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: 'OFFICER',
            OR: expect.any(Array),
          }),
        }),
      );
    });

    it('should return empty users array and zero pagination when no users match', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const result = await service.getUsers(1, 20, 'FIELD_VERIFIER' as any);

      expect(result.users).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.pages).toBe(0);
    });

    it('should filter by every valid role value', async () => {
      const roles = [
        'OEM',
        'OFFICER',
        'COMMITTEE',
        'FIELD_VERIFIER',
        'DEALING_HAND',
        'ADMIN',
        'SUPER_ADMIN',
      ];
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      for (const role of roles) {
        await service.getUsers(1, 10, role as any);
        expect(prisma.user.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: expect.objectContaining({ role }) }),
        );
      }
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

    it('should throw BadRequestException with correct message for duplicate email', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' } as any);

      await expect(service.createUser(createDto)).rejects.toThrow(
        'User with this email already exists',
      );
    });

    it('should create user without optional phone field', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const dtoWithoutPhone = {
        email: 'nophone@test.com',
        password: 'Str0ngP@ss',
        firstName: 'No',
        lastName: 'Phone',
        role: 'OFFICER' as any,
      };
      prisma.user.create.mockResolvedValue({
        id: 'u3',
        email: 'nophone@test.com',
        firstName: 'No',
        lastName: 'Phone',
        role: 'OFFICER',
        isActive: true,
        createdAt: new Date(),
      } as any);

      await service.createUser(dtoWithoutPhone);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'nophone@test.com',
            phone: undefined,
          }),
        }),
      );
    });

    it('should create users with each valid role', async () => {
      const roles = [
        'OEM',
        'OFFICER',
        'COMMITTEE',
        'FIELD_VERIFIER',
        'DEALING_HAND',
        'ADMIN',
        'SUPER_ADMIN',
      ];

      for (const role of roles) {
        prisma.user.findUnique.mockResolvedValue(null);
        prisma.user.create.mockResolvedValue({
          id: `u-${role}`,
          email: `${role.toLowerCase()}@test.com`,
          firstName: 'Test',
          lastName: 'User',
          role,
          isActive: true,
          createdAt: new Date(),
        } as any);

        const result = await service.createUser({
          email: `${role.toLowerCase()}@test.com`,
          password: 'Password1!',
          firstName: 'Test',
          lastName: 'User',
          role: role as any,
        });

        expect(result.role).toBe(role);
      }
    });

    it('should not call bcrypt.hash when duplicate email is detected', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' } as any);
      (bcrypt.hash as jest.Mock).mockClear();

      await expect(service.createUser(createDto)).rejects.toThrow(BadRequestException);
      expect(bcrypt.hash).not.toHaveBeenCalled();
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

    it('should toggle isActive from false to true', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', isActive: false } as any);
      prisma.user.update.mockResolvedValue({ id: 'u2', isActive: true } as any);

      const result = await service.toggleUserStatus('u2');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u2' }, data: { isActive: true } }),
      );
      expect(result.isActive).toBe(true);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.toggleUserStatus('bad')).rejects.toThrow(NotFoundException);
    });

    it('should still toggle when called with the same userId (self-toggle edge case)', async () => {
      // First call: active -> inactive
      prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', isActive: true } as any);
      prisma.user.update.mockResolvedValue({ id: 'admin-1', isActive: false } as any);

      const first = await service.toggleUserStatus('admin-1');
      expect(first.isActive).toBe(false);

      // Second call: inactive -> active (re-mock as if DB state changed)
      prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', isActive: false } as any);
      prisma.user.update.mockResolvedValue({ id: 'admin-1', isActive: true } as any);

      const second = await service.toggleUserStatus('admin-1');
      expect(second.isActive).toBe(true);
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

    it('should return correct structure shape', async () => {
      prisma.user.count.mockResolvedValue(1);
      prisma.application.count.mockResolvedValue(2);
      prisma.payment.aggregate.mockResolvedValue({
        _sum: { totalAmount: 100 },
        _count: 3,
        _avg: { totalAmount: null },
        _min: { totalAmount: null },
        _max: { totalAmount: null },
      } as any);
      prisma.attachment.aggregate.mockResolvedValue({
        _sum: { fileSizeBytes: BigInt(0) },
        _count: 0,
        _avg: { fileSizeBytes: null },
        _min: { fileSizeBytes: null },
        _max: { fileSizeBytes: null },
      } as any);

      const result = await service.getSystemStats();

      expect(result).toHaveProperty('users.total');
      expect(result).toHaveProperty('applications.total');
      expect(result).toHaveProperty('payments.total');
      expect(result).toHaveProperty('payments.totalAmount');
      expect(result).toHaveProperty('storage.totalFiles');
      expect(result).toHaveProperty('storage.totalSize');
      expect(result).toHaveProperty('storage.totalSizeMB');
    });
  });

  // ─── getAuditLogs ──────────────────────────────────────────

  describe('getAuditLogs', () => {
    it('should return paginated audit logs with user info', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          action: 'USER_LOGIN',
          createdAt: new Date(),
          user: { id: 'u1', email: 'a@b.com', firstName: 'A', lastName: 'B' },
        },
      ];
      prisma.auditLog.findMany.mockResolvedValue(mockLogs as any);
      prisma.auditLog.count.mockResolvedValue(1);

      const result = await service.getAuditLogs();

      expect(result.logs).toEqual(mockLogs);
      expect(result.pagination).toEqual({ page: 1, limit: 50, total: 1, pages: 1 });
    });

    it('should calculate pagination correctly for page 2 with limit 50', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(120);

      const result = await service.getAuditLogs(2, 50);

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 50, take: 50 }),
      );
      expect(result.pagination).toEqual({ page: 2, limit: 50, total: 120, pages: 3 });
    });
  });

  // ─── getMisReport ──────────────────────────────────────────

  describe('getMisReport', () => {
    it('should return aggregated MIS report data', async () => {
      // Mock all groupBy calls with `as any` to avoid TS2615 circular type errors
      // @ts-expect-error Prisma groupBy circular type
      prisma.application.groupBy.mockResolvedValue([
        { status: 'SUBMITTED', _count: 10 },
        { status: 'APPROVED', _count: 5 },
      ] as any);
      // @ts-expect-error Prisma groupBy circular type
      prisma.payment.groupBy.mockResolvedValue([
        { status: 'VERIFIED', _count: 8, _sum: { totalAmount: 40000 } },
      ] as any);
      // @ts-expect-error Prisma groupBy circular type
      prisma.certificate.groupBy.mockResolvedValue([{ status: 'ACTIVE', _count: 3 }] as any);
      // @ts-expect-error Prisma groupBy circular type
      prisma.user.groupBy.mockResolvedValue([
        { role: 'OEM', _count: 20 },
        { role: 'OFFICER', _count: 5 },
      ] as any);
      // @ts-expect-error Prisma groupBy circular type
      prisma.oemProfile.groupBy.mockResolvedValue([
        { state: 'Maharashtra', _count: 15 },
        { state: 'Delhi', _count: 10 },
      ] as any);
      // @ts-expect-error Prisma groupBy circular type
      prisma.applicationApcd.groupBy.mockResolvedValue([
        { apcdTypeId: 'type-1', _count: 7 },
      ] as any);

      prisma.payment.aggregate.mockResolvedValue({
        _sum: { totalAmount: 50000 },
        _count: 10,
      } as any);

      prisma.application.count.mockResolvedValue(100);

      prisma.aPCDType.findMany.mockResolvedValue([
        { id: 'type-1', category: 'Dust Collector', subType: 'Bag Filter' },
      ] as any);

      const result = await service.getMisReport();

      expect(result.summary).toBeDefined();
      expect(result.summary.totalApplications).toBe(100);
      expect(result.applicationsByStatus).toBeDefined();
      expect(result.usersByRole).toHaveProperty('OEM', 20);
      expect(result.usersByRole).toHaveProperty('OFFICER', 5);
      expect(result.stateWiseApplications).toEqual(
        expect.arrayContaining([expect.objectContaining({ state: 'Maharashtra', count: 15 })]),
      );
      expect(result.apcdTypeWiseApplications).toEqual([
        { category: 'Dust Collector', subType: 'Bag Filter', count: 7 },
      ]);
    });

    it('should handle empty data for MIS report (all zeros)', async () => {
      prisma.application.groupBy.mockResolvedValue([] as any);
      prisma.payment.groupBy.mockResolvedValue([] as any);
      prisma.certificate.groupBy.mockResolvedValue([] as any);
      prisma.user.groupBy.mockResolvedValue([] as any);
      prisma.oemProfile.groupBy.mockResolvedValue([] as any);
      prisma.applicationApcd.groupBy.mockResolvedValue([] as any);
      prisma.payment.aggregate.mockResolvedValue({
        _sum: { totalAmount: null },
        _count: 0,
      } as any);
      prisma.application.count.mockResolvedValue(0);
      prisma.aPCDType.findMany.mockResolvedValue([]);

      const result = await service.getMisReport();

      expect(result.summary.totalApplications).toBe(0);
      expect(result.summary.revenueThisMonth).toBe(0);
      expect(result.summary.revenueLastMonth).toBe(0);
      expect(result.summary.revenueThisYear).toBe(0);
      expect(result.applicationsByStatus).toEqual({});
      expect(result.certificatesByStatus).toEqual({});
      expect(result.usersByRole).toEqual({});
      expect(result.stateWiseApplications).toEqual([]);
      expect(result.apcdTypeWiseApplications).toEqual([]);
    });

    it('should filter out null states from stateWiseApplications', async () => {
      prisma.application.groupBy.mockResolvedValue([] as any);
      prisma.payment.groupBy.mockResolvedValue([] as any);
      prisma.certificate.groupBy.mockResolvedValue([] as any);
      prisma.user.groupBy.mockResolvedValue([] as any);
      prisma.oemProfile.groupBy.mockResolvedValue([
        { state: null, _count: 5 },
        { state: 'Gujarat', _count: 10 },
      ] as any);
      prisma.applicationApcd.groupBy.mockResolvedValue([] as any);
      prisma.payment.aggregate.mockResolvedValue({
        _sum: { totalAmount: null },
        _count: 0,
      } as any);
      prisma.application.count.mockResolvedValue(0);
      prisma.aPCDType.findMany.mockResolvedValue([]);

      const result = await service.getMisReport();

      expect(result.stateWiseApplications).toHaveLength(1);
      expect(result.stateWiseApplications[0].state).toBe('Gujarat');
    });

    it('should label unknown APCD types when type ID is not found', async () => {
      prisma.application.groupBy.mockResolvedValue([] as any);
      prisma.payment.groupBy.mockResolvedValue([] as any);
      prisma.certificate.groupBy.mockResolvedValue([] as any);
      prisma.user.groupBy.mockResolvedValue([] as any);
      prisma.oemProfile.groupBy.mockResolvedValue([] as any);
      prisma.applicationApcd.groupBy.mockResolvedValue([
        { apcdTypeId: 'unknown-type', _count: 3 },
      ] as any);
      prisma.payment.aggregate.mockResolvedValue({
        _sum: { totalAmount: null },
        _count: 0,
      } as any);
      prisma.application.count.mockResolvedValue(0);
      // Return empty - the type ID won't be found in the map
      prisma.aPCDType.findMany.mockResolvedValue([]);

      const result = await service.getMisReport();

      expect(result.apcdTypeWiseApplications).toEqual([
        { category: 'Unknown', subType: 'Unknown', count: 3 },
      ]);
    });
  });
});

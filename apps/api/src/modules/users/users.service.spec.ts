import { NotFoundException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PaginationDto } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../infrastructure/database/prisma.service';

import { UsersService } from './users.service';

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password_123'),
}));

/**
 * Helper to build a PaginationDto-like object with the computed `skip` getter.
 */
function makePagination(overrides: Partial<PaginationDto> = {}): PaginationDto {
  const dto = new PaginationDto();
  if (overrides.page !== undefined) dto.page = overrides.page;
  if (overrides.limit !== undefined) dto.limit = overrides.limit;
  if (overrides.sortBy !== undefined) dto.sortBy = overrides.sortBy;
  if (overrides.sortOrder !== undefined) dto.sortOrder = overrides.sortOrder;
  return dto;
}

describe('UsersService', () => {
  let service: UsersService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockDeep<PrismaClient>() },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // findAll
  // =========================================================================

  describe('findAll', () => {
    it('should return paginated users with default pagination', async () => {
      const mockUsers = [
        {
          id: 'u1',
          email: 'a@test.com',
          role: 'OEM',
          firstName: 'A',
          lastName: 'B',
          phone: null,
          isActive: true,
          isVerified: true,
          lastLoginAt: null,
          createdAt: new Date(),
        },
      ];
      prisma.user.findMany.mockResolvedValue(mockUsers as any);
      prisma.user.count.mockResolvedValue(1);

      const pagination = makePagination();
      const result = await service.findAll(pagination);

      expect(result.data).toEqual(mockUsers);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          skip: 0,
          take: 20,
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('should filter by role when provided', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const pagination = makePagination({ limit: 10 });
      await service.findAll(pagination, Role.OFFICER);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { role: Role.OFFICER },
        }),
      );
      expect(prisma.user.count).toHaveBeenCalledWith({ where: { role: Role.OFFICER } });
    });

    it('should filter by each valid role value', async () => {
      const roles: Role[] = [
        Role.OEM,
        Role.OFFICER,
        Role.COMMITTEE,
        Role.FIELD_VERIFIER,
        Role.DEALING_HAND,
        Role.ADMIN,
        Role.SUPER_ADMIN,
      ];

      for (const role of roles) {
        prisma.user.findMany.mockResolvedValue([]);
        prisma.user.count.mockResolvedValue(0);

        await service.findAll(makePagination(), role);

        expect(prisma.user.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { role } }),
        );
      }
    });

    it('should return empty data with correct meta when no users match', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const result = await service.findAll(makePagination(), Role.FIELD_VERIFIER);

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(0);
    });

    it('should handle pagination correctly for page 3 with limit 10', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(45);

      const pagination = makePagination({ page: 3, limit: 10 });
      const result = await service.findAll(pagination);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
      expect(result.meta).toEqual({
        total: 45,
        page: 3,
        limit: 10,
        totalPages: 5,
      });
    });

    it('should not crash with a very large limit', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const pagination = makePagination({ page: 1, limit: 100000 });
      const result = await service.findAll(pagination);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100000 }),
      );
      expect(result.meta.limit).toBe(100000);
      expect(result.meta.totalPages).toBe(0);
    });

    it('should sort by specified field and order', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const pagination = makePagination({ sortBy: 'email', sortOrder: 'asc' });
      await service.findAll(pagination);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { email: 'asc' } }),
      );
    });

    it('should default sort to createdAt desc when not specified', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const pagination = makePagination();
      await service.findAll(pagination);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });

    it('should return correct totalPages when total is not evenly divisible', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(21);

      const pagination = makePagination({ limit: 10 });
      const result = await service.findAll(pagination);

      expect(result.meta.totalPages).toBe(3); // ceil(21/10) = 3
    });

    it('should pass no role filter when role is undefined', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAll(makePagination(), undefined);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });

  // =========================================================================
  // findById
  // =========================================================================

  describe('findById', () => {
    it('should return user when found', async () => {
      const mockUser = {
        id: 'u1',
        email: 'found@test.com',
        role: 'OEM',
        firstName: 'Found',
        lastName: 'User',
        phone: '1234567890',
        isActive: true,
        isVerified: true,
        lastLoginAt: null,
        createdAt: new Date(),
      };
      prisma.user.findUnique.mockResolvedValue(mockUser as any);

      const result = await service.findById('u1');

      expect(result).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' } }),
      );
    });

    it('should throw NotFoundException when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException with correct message', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findById('bad-id')).rejects.toThrow('User not found');
    });

    it('should select the expected fields', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' } as any);

      await service.findById('u1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'u1' },
        select: {
          id: true,
          email: true,
          role: true,
          firstName: true,
          lastName: true,
          phone: true,
          isActive: true,
          isVerified: true,
          lastLoginAt: true,
          createdAt: true,
        },
      });
    });
  });

  // =========================================================================
  // createInternalUser
  // =========================================================================

  describe('createInternalUser', () => {
    const createData = {
      email: 'New@Test.COM',
      password: 'SecureP@ss1',
      role: Role.OFFICER,
      firstName: 'New',
      lastName: 'Officer',
      phone: '9876543210',
    };

    it('should lowercase the email, hash password, and create user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const createdUser = {
        id: 'u-new',
        email: 'new@test.com',
        role: 'OFFICER',
        firstName: 'New',
        lastName: 'Officer',
      };
      prisma.user.create.mockResolvedValue(createdUser as any);

      const result = await service.createInternalUser(createData);

      expect(bcrypt.hash).toHaveBeenCalledWith('SecureP@ss1', 12);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'new@test.com' },
      });
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'new@test.com',
            passwordHash: 'hashed_password_123',
            role: Role.OFFICER,
            firstName: 'New',
            lastName: 'Officer',
            phone: '9876543210',
            isActive: true,
            isVerified: true,
          }),
        }),
      );
      expect(result).toEqual(createdUser);
    });

    it('should throw ConflictException for duplicate email', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' } as any);

      await expect(service.createInternalUser(createData)).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException with correct message', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' } as any);

      await expect(service.createInternalUser(createData)).rejects.toThrow(
        'Email already registered',
      );
    });

    it('should create user without optional phone field', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'u-nophone',
        email: 'nophone@test.com',
        role: 'COMMITTEE',
        firstName: 'No',
        lastName: 'Phone',
      } as any);

      const dataWithoutPhone = {
        email: 'nophone@test.com',
        password: 'Pass1234!',
        role: Role.COMMITTEE,
        firstName: 'No',
        lastName: 'Phone',
      };

      await service.createInternalUser(dataWithoutPhone);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phone: undefined,
          }),
        }),
      );
    });

    it('should create users with each valid role', async () => {
      const roles: Role[] = [
        Role.OEM,
        Role.OFFICER,
        Role.COMMITTEE,
        Role.FIELD_VERIFIER,
        Role.DEALING_HAND,
        Role.ADMIN,
        Role.SUPER_ADMIN,
      ];

      for (const role of roles) {
        prisma.user.findUnique.mockResolvedValue(null);
        prisma.user.create.mockResolvedValue({
          id: `u-${role}`,
          email: `${role.toLowerCase()}@test.com`,
          role,
          firstName: 'Test',
          lastName: 'User',
        } as any);

        const result = await service.createInternalUser({
          email: `${role}@Test.com`,
          password: 'Password1!',
          role,
          firstName: 'Test',
          lastName: 'User',
        });

        expect(result.role).toBe(role);
      }
    });

    it('should not call bcrypt.hash when duplicate email is detected', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' } as any);
      (bcrypt.hash as jest.Mock).mockClear();

      await expect(service.createInternalUser(createData)).rejects.toThrow(ConflictException);
      expect(bcrypt.hash).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // toggleActive
  // =========================================================================

  describe('toggleActive', () => {
    it('should deactivate a user', async () => {
      prisma.user.update.mockResolvedValue({
        id: 'u1',
        email: 'user@test.com',
        isActive: false,
      } as any);

      const result = await service.toggleActive('u1', false);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { isActive: false },
        select: { id: true, email: true, isActive: true },
      });
      expect(result.isActive).toBe(false);
    });

    it('should activate a user', async () => {
      prisma.user.update.mockResolvedValue({
        id: 'u2',
        email: 'user2@test.com',
        isActive: true,
      } as any);

      const result = await service.toggleActive('u2', true);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u2' },
        data: { isActive: true },
        select: { id: true, email: true, isActive: true },
      });
      expect(result.isActive).toBe(true);
    });

    it('should return the selected fields only', async () => {
      prisma.user.update.mockResolvedValue({
        id: 'u1',
        email: 'user@test.com',
        isActive: true,
      } as any);

      const result = await service.toggleActive('u1', true);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('isActive');
    });
  });
});

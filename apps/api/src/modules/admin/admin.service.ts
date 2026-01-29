import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Role, PaymentType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../../infrastructure/database/prisma.service';

interface CreateUserDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: Role;
  phone?: string;
}

interface UpdateUserDto {
  firstName?: string;
  lastName?: string;
  phone?: string;
  isActive?: boolean;
}

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get all users with pagination and filters
   */
  async getUsers(page = 1, limit = 20, role?: Role, search?: string) {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (role) where.role = role;
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          isVerified: true,
          phone: true,
          lastLoginAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        isVerified: true,
        phone: true,
        lastLoginAt: true,
        createdAt: true,
        oemProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Create new user (admin only)
   */
  async createUser(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new BadRequestException('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        phone: dto.phone,
        isVerified: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  /**
   * Update user
   */
  async updateUser(userId: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        phone: true,
      },
    });
  }

  /**
   * Toggle user active status
   */
  async toggleUserStatus(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive: !user.isActive },
      select: { id: true, isActive: true },
    });
  }

  /**
   * Get fee configurations
   */
  async getFeeConfigurations() {
    return this.prisma.feeConfiguration.findMany({
      orderBy: { paymentType: 'asc' },
    });
  }

  /**
   * Update fee configuration
   */
  async updateFeeConfiguration(paymentType: PaymentType, baseAmount: number) {
    return this.prisma.feeConfiguration.upsert({
      where: { paymentType },
      update: { baseAmount },
      create: {
        paymentType,
        baseAmount,
        gstRate: 18,
        discountPercent: 15,
      },
    });
  }

  /**
   * Get APCD types
   */
  async getApcdTypes() {
    return this.prisma.aPCDType.findMany({
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  /**
   * Toggle APCD type active status
   */
  async toggleApcdTypeStatus(id: string) {
    const apcdType = await this.prisma.aPCDType.findUnique({ where: { id } });

    if (!apcdType) {
      throw new NotFoundException('APCD type not found');
    }

    return this.prisma.aPCDType.update({
      where: { id },
      data: { isActive: !apcdType.isActive },
    });
  }

  /**
   * Get system statistics
   */
  async getSystemStats() {
    const [
      totalUsers,
      totalApplications,
      totalPayments,
      storageStats,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.application.count(),
      this.prisma.payment.aggregate({
        _sum: { totalAmount: true },
        _count: true,
      }),
      this.prisma.attachment.aggregate({
        _sum: { fileSizeBytes: true },
        _count: true,
      }),
    ]);

    return {
      users: { total: totalUsers },
      applications: { total: totalApplications },
      payments: {
        total: totalPayments._count,
        totalAmount: totalPayments._sum?.totalAmount || 0,
      },
      storage: {
        totalFiles: storageStats._count,
        totalSize: Number(storageStats._sum?.fileSizeBytes || 0),
        totalSizeMB: Math.round(Number(storageStats._sum?.fileSizeBytes || 0) / (1024 * 1024) * 100) / 100,
      },
    };
  }

  /**
   * Get audit logs
   */
  async getAuditLogs(page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count(),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }
}

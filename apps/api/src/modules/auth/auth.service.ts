import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../infrastructure/database/prisma.service';

import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  /**
   * Register a new OEM user
   */
  async register(dto: RegisterDto) {
    // Check existing
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        role: Role.OEM,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        isVerified: false,
      },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }

  /**
   * Login with email and password
   */
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated. Contact administrator.');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshTokens(userId: string, refreshToken: string) {
    const storedToken = await this.prisma.refreshToken.findFirst({
      where: {
        userId,
        token: refreshToken,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Revoke old refresh token
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    const { user } = storedToken;
    return this.generateTokens(user.id, user.email, user.role);
  }

  /**
   * Get current user info
   */
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
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

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  /**
   * Logout - revoke refresh token
   */
  async logout(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Reset test user passwords (for CI/CD integration testing).
   * Protected by SEED_SECRET environment variable.
   */
  async resetTestPasswords(secret: string) {
    const seedSecret = this.configService.get<string>('SEED_SECRET', 'apcd-seed-2025');
    if (secret !== seedSecret) {
      throw new ForbiddenException('Invalid seed secret');
    }

    const testUsers: {
      email: string;
      password: string;
      role: Role;
      firstName: string;
      lastName: string;
    }[] = [
      {
        email: 'admin@npcindia.gov.in',
        password: 'Admin@APCD2025!',
        role: Role.SUPER_ADMIN,
        firstName: 'System',
        lastName: 'Administrator',
      },
      {
        email: 'officer@npcindia.gov.in',
        password: 'Officer@APCD2025!',
        role: Role.OFFICER,
        firstName: 'Test',
        lastName: 'Officer',
      },
      {
        email: 'head@npcindia.gov.in',
        password: 'Head@APCD2025!',
        role: Role.ADMIN,
        firstName: 'Head',
        lastName: 'Officer',
      },
      {
        email: 'committee@npcindia.gov.in',
        password: 'Committee@APCD2025!',
        role: Role.COMMITTEE,
        firstName: 'Committee',
        lastName: 'Member',
      },
      {
        email: 'fieldverifier@npcindia.gov.in',
        password: 'Field@APCD2025!',
        role: Role.FIELD_VERIFIER,
        firstName: 'Field',
        lastName: 'Verifier',
      },
      {
        email: 'dealinghand@npcindia.gov.in',
        password: 'Dealing@APCD2025!',
        role: Role.DEALING_HAND,
        firstName: 'Dealing',
        lastName: 'Hand',
      },
      {
        email: 'oem@testcompany.com',
        password: 'Oem@APCD2025!',
        role: Role.OEM,
        firstName: 'Test',
        lastName: 'OEM',
      },
    ];

    const results: { email: string; action: string }[] = [];
    for (const u of testUsers) {
      const hash = await bcrypt.hash(u.password, 12);
      await this.prisma.user.upsert({
        where: { email: u.email },
        update: { passwordHash: hash },
        create: {
          email: u.email,
          passwordHash: hash,
          role: u.role,
          firstName: u.firstName,
          lastName: u.lastName,
          isActive: true,
          isVerified: true,
        },
      });
      results.push({ email: u.email, action: 'upserted' });
    }

    // Ensure OEM profile exists for test OEM
    const oemUser = await this.prisma.user.findUnique({
      where: { email: 'oem@testcompany.com' },
    });
    if (oemUser) {
      await this.prisma.oemProfile.upsert({
        where: { userId: oemUser.id },
        update: {},
        create: {
          userId: oemUser.id,
          companyName: 'Test APCD Manufacturing Pvt Ltd',
          fullAddress: '123, Industrial Area, Phase-II, New Delhi, Delhi - 110020',
          state: 'Delhi',
          pinCode: '110020',
          contactNo: '9876543210',
          gstRegistrationNo: '07AABCT1234F1ZP',
          panNo: 'AABCT1234F',
          firmType: 'PRIVATE_LIMITED',
        },
      });
    }

    return { message: 'Test passwords reset', count: results.length, results };
  }

  /**
   * Generate access + refresh token pair
   */
  private async generateTokens(userId: string, email: string, role: string) {
    const payload: JwtPayload = { sub: userId, email, role };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRY', '15m'),
    });

    const refreshTokenValue = uuidv4();
    const refreshExpiryDays = 7;
    const refreshExpiresAt = new Date();
    refreshExpiresAt.setDate(refreshExpiresAt.getDate() + refreshExpiryDays);

    await this.prisma.refreshToken.create({
      data: {
        token: refreshTokenValue,
        userId,
        expiresAt: refreshExpiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      expiresIn: 900, // 15 minutes in seconds
    };
  }
}

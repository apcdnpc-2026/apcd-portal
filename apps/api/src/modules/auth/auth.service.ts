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

    const testUsers = [
      { email: 'admin@npcindia.gov.in', password: 'Admin@APCD2025!' },
      { email: 'officer@npcindia.gov.in', password: 'Officer@APCD2025!' },
      { email: 'head@npcindia.gov.in', password: 'Head@APCD2025!' },
      { email: 'committee@npcindia.gov.in', password: 'Committee@APCD2025!' },
      { email: 'fieldverifier@npcindia.gov.in', password: 'Field@APCD2025!' },
      { email: 'dealinghand@npcindia.gov.in', password: 'Dealing@APCD2025!' },
      { email: 'oem@testcompany.com', password: 'Oem@APCD2025!' },
    ];

    const results: { email: string; updated: boolean }[] = [];
    for (const u of testUsers) {
      const user = await this.prisma.user.findUnique({ where: { email: u.email } });
      if (user) {
        const hash = await bcrypt.hash(u.password, 12);
        await this.prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: hash },
        });
        results.push({ email: u.email, updated: true });
      } else {
        results.push({ email: u.email, updated: false });
      }
    }
    return { message: 'Test passwords reset', results };
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

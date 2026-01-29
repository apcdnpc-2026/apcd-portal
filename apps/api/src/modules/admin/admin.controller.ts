import { Controller, Get, Post, Put, Param, Body, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role, PaymentType } from '@prisma/client';

import { AdminService } from './admin.service';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class AdminController {
  constructor(private service: AdminService) {}

  // User Management
  @Get('users')
  @ApiOperation({ summary: 'Get all users with pagination' })
  async getUsers(
    @Query('role') role?: Role,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getUsers(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      role,
      search,
    );
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get user by ID' })
  async getUserById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getUserById(id);
  }

  @Post('users')
  @ApiOperation({ summary: 'Create a new user' })
  async createUser(@Body() dto: any) {
    return this.service.createUser(dto);
  }

  @Put('users/:id')
  @ApiOperation({ summary: 'Update user' })
  async updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: any,
  ) {
    return this.service.updateUser(id, dto);
  }

  @Put('users/:id/toggle-status')
  @ApiOperation({ summary: 'Toggle user active status' })
  async toggleUserStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.toggleUserStatus(id);
  }

  // Fee Configuration
  @Get('fees')
  @ApiOperation({ summary: 'Get fee configurations' })
  async getFeeConfigurations() {
    return this.service.getFeeConfigurations();
  }

  @Put('fees/:paymentType')
  @ApiOperation({ summary: 'Update fee configuration' })
  async updateFeeConfiguration(
    @Param('paymentType') paymentType: PaymentType,
    @Body() dto: { baseAmount: number },
  ) {
    return this.service.updateFeeConfiguration(paymentType, dto.baseAmount);
  }

  // APCD Types Configuration
  @Get('apcd-types')
  @ApiOperation({ summary: 'Get APCD types configuration' })
  async getApcdTypes() {
    return this.service.getApcdTypes();
  }

  @Put('apcd-types/:id/toggle-status')
  @ApiOperation({ summary: 'Toggle APCD type active status' })
  async toggleApcdTypeStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.toggleApcdTypeStatus(id);
  }

  // System Stats
  @Get('stats')
  @ApiOperation({ summary: 'Get system statistics' })
  async getSystemStats() {
    return this.service.getSystemStats();
  }

  // Audit Logs
  @Get('audit-logs')
  @ApiOperation({ summary: 'Get audit logs' })
  async getAuditLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getAuditLogs(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  // MIS Reports
  @Get('reports/mis')
  @ApiOperation({ summary: 'Get MIS report data' })
  async getMisReport() {
    return this.service.getMisReport();
  }
}

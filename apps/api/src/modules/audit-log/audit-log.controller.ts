import { Controller, Get, Query, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { AuditLogService } from './audit-log.service';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditLogController {
  constructor(private service: AuditLogService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get audit logs with filters' })
  async findAll(
    @Query('userId') userId?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      userId,
      entityType,
      entityId,
      action,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Get('entity/:entityType/:entityId')
  @Roles(Role.ADMIN, Role.OFFICER)
  @ApiOperation({ summary: 'Get audit logs for a specific entity' })
  async findByEntity(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.service.findByEntity(entityType, entityId);
  }

  @Get('user/:userId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get audit logs for a specific user' })
  async findByUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.service.findByUser(userId);
  }

  @Get('summary')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get recent activity summary' })
  async getRecentActivitySummary() {
    return this.service.getRecentActivitySummary();
  }
}

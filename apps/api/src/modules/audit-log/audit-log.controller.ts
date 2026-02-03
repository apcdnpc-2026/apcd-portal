import { Controller, Get, Query, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { Roles } from '../../common/decorators/roles.decorator';

import { AuditLogService, AuditCategory, AuditSeverity } from './audit-log.service';

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

  @Get('search')
  @Roles(Role.ADMIN, Role.OFFICER)
  @ApiOperation({ summary: 'Advanced search with category, severity, date range, and more' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'entityType', required: false })
  @ApiQuery({ name: 'entityId', required: false })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: [
      'APPLICATION',
      'DOCUMENT',
      'PAYMENT',
      'USER',
      'EVALUATION',
      'FIELD_VERIFICATION',
      'CERTIFICATE',
      'QUERY',
      'NOTIFICATION',
      'SYSTEM',
      'GENERAL',
    ],
  })
  @ApiQuery({ name: 'severity', required: false, enum: ['INFO', 'WARNING', 'CRITICAL'] })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async search(
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('category') category?: string,
    @Query('severity') severity?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      userId,
      action,
      entityType,
      entityId,
      category: category as AuditCategory | undefined,
      severity: severity as AuditSeverity | undefined,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Get('entity/:entityType/:entityId')
  @Roles(Role.ADMIN, Role.OFFICER)
  @ApiOperation({ summary: 'Get audit logs for a specific entity' })
  async findByEntity(@Param('entityType') entityType: string, @Param('entityId') entityId: string) {
    return this.service.findByEntity(entityType, entityId);
  }

  @Get('timeline/:entityType/:entityId')
  @Roles(Role.ADMIN, Role.OFFICER)
  @ApiOperation({ summary: 'Get full chronological audit trail for an entity' })
  async getEntityTimeline(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.service.getEntityTimeline(entityType, entityId);
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

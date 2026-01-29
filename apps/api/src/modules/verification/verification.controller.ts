import { Controller, Get, Post, Put, Param, Body, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { VerificationService } from './verification.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Verification')
@ApiBearerAuth()
@Controller('verification')
export class VerificationController {
  constructor(private service: VerificationService) {}

  @Get('pending')
  @Roles(Role.OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Get applications pending verification' })
  async getPendingApplications() {
    return this.service.getPendingApplications();
  }

  @Get('application/:applicationId')
  @Roles(Role.OFFICER, Role.ADMIN, Role.COMMITTEE)
  @ApiOperation({ summary: 'Get application details for verification' })
  async getApplicationForVerification(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ) {
    return this.service.getApplicationForVerification(applicationId);
  }

  @Get('application/:applicationId/queries')
  @ApiOperation({ summary: 'Get queries for an application' })
  async getQueriesForApplication(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ) {
    return this.service.getQueriesForApplication(applicationId);
  }

  @Get('my-pending-queries')
  @Roles(Role.OEM)
  @ApiOperation({ summary: 'Get pending queries for current OEM' })
  async getPendingQueriesForUser(@CurrentUser() user: JwtPayload) {
    return this.service.getPendingQueriesForUser(user.sub);
  }

  @Post('application/:applicationId/query')
  @Roles(Role.OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Raise a query on an application' })
  async raiseQuery(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() dto: { subject: string; description: string; documentType?: string; deadline?: Date },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.raiseQuery(applicationId, user.sub, dto);
  }

  @Post('query/:queryId/respond')
  @Roles(Role.OEM)
  @ApiOperation({ summary: 'Respond to a query' })
  async respondToQuery(
    @Param('queryId', ParseUUIDPipe) queryId: string,
    @Body() dto: { message: string; attachmentPath?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.respondToQuery(queryId, user.sub, dto);
  }

  @Put('query/:queryId/resolve')
  @Roles(Role.OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Mark query as resolved' })
  async resolveQuery(
    @Param('queryId', ParseUUIDPipe) queryId: string,
    @Body() dto: { remarks?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.resolveQuery(queryId, user.sub, dto.remarks);
  }

  @Post('application/:applicationId/forward-to-committee')
  @Roles(Role.OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Forward application to committee for review' })
  async forwardToCommittee(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() dto: { remarks: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.forwardToCommittee(applicationId, user.sub, dto.remarks);
  }

  @Post('application/:applicationId/forward-to-field-verification')
  @Roles(Role.OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Forward application to field verification' })
  async forwardToFieldVerification(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() dto: { remarks: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.forwardToFieldVerification(applicationId, user.sub, dto.remarks);
  }
}

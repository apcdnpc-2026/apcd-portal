import { Controller, Get, Post, Put, Delete, Param, Body, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { FieldVerificationService } from './field-verification.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Field Verification')
@ApiBearerAuth()
@Controller('field-verification')
export class FieldVerificationController {
  constructor(private service: FieldVerificationService) {}

  @Get('pending')
  @Roles(Role.OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Get applications pending field verification' })
  async getApplicationsPendingFieldVerification() {
    return this.service.getApplicationsPendingFieldVerification();
  }

  @Get('verifiers')
  @Roles(Role.OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Get list of field verifiers' })
  async getFieldVerifiers() {
    return this.service.getFieldVerifiers();
  }

  @Get('my-assignments')
  @Roles(Role.FIELD_VERIFIER)
  @ApiOperation({ summary: 'Get verifications assigned to current verifier' })
  async getPendingForVerifier(@CurrentUser() user: JwtPayload) {
    return this.service.getPendingForVerifier(user.sub);
  }

  @Get('sites/:applicationId')
  @Roles(Role.OEM, Role.OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Get field verification sites for an application' })
  async getSitesForApplication(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ) {
    return this.service.getSitesForApplication(applicationId);
  }

  @Get('reports/:applicationId')
  @Roles(Role.OEM, Role.OFFICER, Role.ADMIN, Role.FIELD_VERIFIER)
  @ApiOperation({ summary: 'Get field reports for an application' })
  async getReportsForApplication(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ) {
    return this.service.getReportsForApplication(applicationId);
  }

  @Post('sites/:applicationId')
  @Roles(Role.OEM)
  @ApiOperation({ summary: 'Add field verification site' })
  async addSite(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() dto: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.addSite(applicationId, user.sub, dto);
  }

  @Put('sites/:siteId')
  @Roles(Role.OEM)
  @ApiOperation({ summary: 'Update field verification site' })
  async updateSite(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateSite(siteId, user.sub, dto);
  }

  @Delete('sites/:siteId')
  @Roles(Role.OEM)
  @ApiOperation({ summary: 'Delete field verification site' })
  async deleteSite(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.deleteSite(siteId, user.sub);
  }

  @Post('report/:applicationId')
  @Roles(Role.FIELD_VERIFIER)
  @ApiOperation({ summary: 'Submit field verification report' })
  async submitReport(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() dto: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.submitReport(applicationId, user.sub, dto);
  }
}

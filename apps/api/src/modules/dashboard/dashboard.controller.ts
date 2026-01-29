import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { DashboardService } from './dashboard.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private service: DashboardService) {}

  @Get('oem')
  @Roles(Role.OEM)
  @ApiOperation({ summary: 'Get OEM dashboard data' })
  async getOemDashboard(@CurrentUser() user: JwtPayload) {
    return this.service.getOemDashboard(user.sub);
  }

  @Get('officer')
  @Roles(Role.OFFICER)
  @ApiOperation({ summary: 'Get Officer dashboard data' })
  async getOfficerDashboard() {
    return this.service.getOfficerDashboard();
  }

  @Get('admin')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get Admin dashboard data' })
  async getAdminDashboard() {
    return this.service.getAdminDashboard();
  }

  @Get('field-verifier')
  @Roles(Role.FIELD_VERIFIER)
  @ApiOperation({ summary: 'Get Field Verifier dashboard data' })
  async getFieldVerifierDashboard(@CurrentUser() user: JwtPayload) {
    return this.service.getFieldVerifierDashboard(user.sub);
  }

  @Get('committee')
  @Roles(Role.COMMITTEE)
  @ApiOperation({ summary: 'Get Committee Member dashboard data' })
  async getCommitteeDashboard(@CurrentUser() user: JwtPayload) {
    return this.service.getCommitteeDashboard(user.sub);
  }

  @Get('dealing-hand')
  @Roles(Role.DEALING_HAND)
  @ApiOperation({ summary: 'Get Dealing Hand dashboard data' })
  async getDealingHandDashboard() {
    return this.service.getDealingHandDashboard();
  }
}

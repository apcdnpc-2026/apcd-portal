import { Controller, Get, Post, Put, Param, Body, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { CommitteeService } from './committee.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Committee')
@ApiBearerAuth()
@Controller('committee')
export class CommitteeController {
  constructor(private service: CommitteeService) {}

  @Get('criteria')
  @Roles(Role.COMMITTEE, Role.OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Get evaluation criteria and scoring rules' })
  async getEvaluationCriteria() {
    return this.service.getEvaluationCriteria();
  }

  @Get('members')
  @Roles(Role.OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Get list of committee members' })
  async getCommitteeMembers() {
    return this.service.getCommitteeMembers();
  }

  @Get('pending')
  @Roles(Role.COMMITTEE, Role.OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Get applications pending committee review' })
  async getPendingApplications() {
    return this.service.getPendingApplications();
  }

  @Get('application/:applicationId')
  @Roles(Role.COMMITTEE, Role.OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Get application details for evaluation' })
  async getApplicationForEvaluation(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ) {
    return this.service.getApplicationForEvaluation(applicationId);
  }

  @Get('application/:applicationId/summary')
  @Roles(Role.COMMITTEE, Role.OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Get evaluation summary for an application' })
  async getEvaluationSummary(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ) {
    return this.service.getEvaluationSummary(applicationId);
  }

  @Post('application/:applicationId/evaluate')
  @Roles(Role.COMMITTEE)
  @ApiOperation({ summary: 'Submit evaluation for an application' })
  async submitEvaluation(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() dto: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.submitEvaluation(applicationId, user.sub, dto);
  }

  @Put('evaluation/:evaluationId')
  @Roles(Role.COMMITTEE)
  @ApiOperation({ summary: 'Update an evaluation' })
  async updateEvaluation(
    @Param('evaluationId', ParseUUIDPipe) evaluationId: string,
    @Body() dto: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateEvaluation(evaluationId, user.sub, dto);
  }

  @Post('application/:applicationId/finalize')
  @Roles(Role.OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Finalize committee decision' })
  async finalizeDecision(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() dto: { decision: 'APPROVED' | 'REJECTED'; remarks: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.finalizeDecision(
      applicationId,
      user.sub,
      dto.decision,
      dto.remarks,
    );
  }
}

import { Role } from '@apcd/database';
import { Controller, Get, Post, Query, Logger } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';

import { Roles } from '../../common/decorators/roles.decorator';

import { AuditIntegrityService } from './audit-integrity.service';

@ApiTags('Audit Integrity')
@ApiBearerAuth()
@Controller('audit-integrity')
export class AuditIntegrityController {
  private readonly logger = new Logger(AuditIntegrityController.name);

  constructor(private auditIntegrityService: AuditIntegrityService) {}

  @Get('verify')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Run full hash chain verification on audit logs' })
  @ApiQuery({
    name: 'startSequence',
    required: false,
    description: 'Starting sequence number (inclusive)',
  })
  @ApiQuery({
    name: 'endSequence',
    required: false,
    description: 'Ending sequence number (inclusive)',
  })
  async verifyHashChain(
    @Query('startSequence') startSequence?: string,
    @Query('endSequence') endSequence?: string,
  ) {
    this.logger.log('Full hash chain verification requested');

    const start = startSequence ? BigInt(startSequence) : undefined;
    const end = endSequence ? BigInt(endSequence) : undefined;

    const result = await this.auditIntegrityService.verifyHashChain(start, end);

    return {
      success: true,
      data: {
        ...result,
        // Convert BigInt to string for JSON serialization
        firstSequence: result.firstSequence?.toString() ?? null,
        lastSequence: result.lastSequence?.toString() ?? null,
        invalidRecords: result.invalidRecords.map((r) => ({
          ...r,
          sequenceNumber: r.sequenceNumber.toString(),
        })),
      },
    };
  }

  @Get('verify-recent')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Verify hash chain for recent audit records' })
  @ApiQuery({
    name: 'hours',
    required: false,
    description: 'Number of hours to look back (default: 24)',
  })
  async verifyRecentRecords(@Query('hours') hours?: string) {
    const hoursBack = hours ? parseInt(hours, 10) : 24;
    this.logger.log(`Verifying records from last ${hoursBack} hours`);

    const result = await this.auditIntegrityService.verifyRecentRecords(hoursBack);

    return {
      success: true,
      data: {
        ...result,
        hoursVerified: hoursBack,
        firstSequence: result.firstSequence?.toString() ?? null,
        lastSequence: result.lastSequence?.toString() ?? null,
        invalidRecords: result.invalidRecords.map((r) => ({
          ...r,
          sequenceNumber: r.sequenceNumber.toString(),
        })),
      },
    };
  }

  @Get('status')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get current audit chain status and last verification result' })
  async getChainStatus() {
    const status = await this.auditIntegrityService.getChainStatus();

    return {
      success: true,
      data: {
        totalRecords: status.totalRecords,
        latestSequence: status.latestSequence?.toString() ?? null,
        lastVerifiedAt: status.lastVerifiedAt?.toISOString() ?? null,
        lastVerificationResult: status.lastVerificationResult
          ? {
              ...status.lastVerificationResult,
              firstSequence: status.lastVerificationResult.firstSequence?.toString() ?? null,
              lastSequence: status.lastVerificationResult.lastSequence?.toString() ?? null,
              invalidRecords: status.lastVerificationResult.invalidRecords.map((r) => ({
                ...r,
                sequenceNumber: r.sequenceNumber.toString(),
              })),
            }
          : null,
      },
    };
  }

  @Post('schedule')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Schedule periodic verification (placeholder)' })
  @ApiQuery({
    name: 'cronExpression',
    required: false,
    description: 'Cron expression for scheduling (e.g., "0 2 * * *" for daily at 2am)',
  })
  async scheduleVerification(@Query('cronExpression') cronExpression?: string) {
    // Placeholder for cron scheduling integration
    // In production, this would integrate with @nestjs/schedule or a task queue
    this.logger.log(
      `Schedule verification requested with cron: ${cronExpression || 'default (daily at 2am)'}`,
    );

    return {
      success: true,
      message: 'Verification scheduling is a placeholder. Integration with task scheduler pending.',
      data: {
        cronExpression: cronExpression || '0 2 * * *',
        nextRun: 'To be implemented with @nestjs/schedule',
        status: 'PLACEHOLDER',
      },
    };
  }
}

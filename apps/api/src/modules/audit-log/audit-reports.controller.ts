import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { AuditReportsService } from './audit-reports.service';

@Controller('audit-reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class AuditReportsController {
  constructor(private auditReportsService: AuditReportsService) {}

  /**
   * Generate RTI (Right to Information) report
   */
  @Get('rti')
  async getRTIReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('entityType') entityType?: string,
  ) {
    return this.auditReportsService.generateRTIReport(
      new Date(startDate),
      new Date(endDate),
      entityType,
    );
  }

  /**
   * Generate CAG (Comptroller and Auditor General) report
   */
  @Get('cag/:financialYear')
  async getCAGReport(@Param('financialYear') financialYear: string) {
    return this.auditReportsService.generateCAGReport(financialYear);
  }

  /**
   * Generate compliance report
   */
  @Get('compliance')
  async getComplianceReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.auditReportsService.generateComplianceReport(
      new Date(startDate),
      new Date(endDate),
    );
  }

  /**
   * Generate user activity report
   */
  @Get('user-activity/:userId')
  async getUserActivityReport(
    @Param('userId') userId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.auditReportsService.generateUserActivityReport(
      userId,
      new Date(startDate),
      new Date(endDate),
    );
  }

  /**
   * Export report (placeholder for CSV/PDF)
   */
  @Get('export/:type/:format')
  async exportReport(
    @Param('type') type: string,
    @Param('format') format: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('financialYear') financialYear?: string,
  ) {
    // Placeholder - returns JSON for now
    // TODO: Implement CSV and PDF export
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    switch (type) {
      case 'rti':
        return this.auditReportsService.generateRTIReport(start, end);
      case 'cag':
        if (!financialYear) {
          return { error: 'financialYear required for CAG report' };
        }
        return this.auditReportsService.generateCAGReport(financialYear);
      case 'compliance':
        return this.auditReportsService.generateComplianceReport(start, end);
      default:
        return {
          error: `Unknown report type: ${type}`,
          supportedTypes: ['rti', 'cag', 'compliance'],
        };
    }
  }
}

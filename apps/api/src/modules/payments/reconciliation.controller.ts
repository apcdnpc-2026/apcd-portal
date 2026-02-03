import { Controller, Get, Post, Param, Query, UseGuards, Req } from '@nestjs/common';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { ReconciliationService } from './reconciliation.service';

interface AuthenticatedRequest {
  user: { sub: string; role: string };
}

@Controller('payments/reconciliation')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReconciliationController {
  constructor(private reconciliationService: ReconciliationService) {}

  /**
   * Trigger a new reconciliation run
   */
  @Post('run')
  @Roles('ADMIN')
  async runReconciliation(@Req() req: AuthenticatedRequest) {
    return this.reconciliationService.runReconciliation(req.user.sub);
  }

  /**
   * Get paginated history of reconciliation runs
   */
  @Get('history')
  @Roles('ADMIN', 'DEALING_HAND')
  async getHistory(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.reconciliationService.getReconciliationHistory(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /**
   * Get a single reconciliation report
   */
  @Get(':id')
  @Roles('ADMIN', 'DEALING_HAND')
  async getReconciliation(@Param('id') id: string) {
    return this.reconciliationService.getReconciliation(id);
  }

  /**
   * Get discrepancies for a reconciliation
   */
  @Get(':id/discrepancies')
  @Roles('ADMIN', 'DEALING_HAND')
  async getDiscrepancies(@Param('id') id: string) {
    return this.reconciliationService.getDiscrepancies(id);
  }
}

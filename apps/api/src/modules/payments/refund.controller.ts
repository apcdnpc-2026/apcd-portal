import { Role } from '@apcd/database';
import { Controller, Get, Post, Param, Body, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { RefundService } from './refund.service';

@ApiTags('Payment Refunds')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments/refunds')
export class RefundController {
  constructor(private readonly refundService: RefundService) {}

  @Post('request')
  @Roles(Role.ADMIN, Role.DEALING_HAND)
  @ApiOperation({ summary: 'Request a payment refund' })
  async requestRefund(
    @Body() dto: { paymentId: string; amount: number; reason: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.refundService.requestRefund(dto.paymentId, dto.amount, dto.reason, user.sub);
  }

  @Post(':id/approve')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Approve a pending refund' })
  async approveRefund(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.refundService.approveRefund(id, user.sub);
  }

  @Post(':id/process')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Process an approved refund via payment gateway' })
  async processRefund(@Param('id', ParseUUIDPipe) id: string) {
    return this.refundService.processRefund(id);
  }

  @Post(':id/reject')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Reject a pending refund' })
  async rejectRefund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { reason: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.refundService.rejectRefund(id, user.sub, dto.reason);
  }

  @Get('pending')
  @Roles(Role.ADMIN, Role.DEALING_HAND)
  @ApiOperation({ summary: 'List all pending refunds' })
  async getPendingRefunds() {
    return this.refundService.getPendingRefunds();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get refund details by ID' })
  async getRefund(@Param('id', ParseUUIDPipe) id: string) {
    return this.refundService.getRefund(id);
  }
}

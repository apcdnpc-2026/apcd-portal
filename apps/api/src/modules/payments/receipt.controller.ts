import { Role } from '@apcd/database';
import { Controller, Get, Post, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { ReceiptService } from './receipt.service';

@ApiTags('Payment Receipts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments/receipts')
export class ReceiptController {
  constructor(private receiptService: ReceiptService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get receipt details by ID' })
  async getReceipt(@Param('id', ParseUUIDPipe) id: string) {
    return this.receiptService.getReceipt(id);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Get presigned PDF download URL for a receipt' })
  async getReceiptPdfUrl(@Param('id', ParseUUIDPipe) id: string) {
    return this.receiptService.getReceiptPdfUrl(id);
  }

  @Post('generate/:paymentId')
  @Roles(Role.ADMIN, Role.DEALING_HAND)
  @ApiOperation({ summary: 'Generate a receipt for a payment' })
  async generateReceipt(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.receiptService.generateReceipt(paymentId, user.sub);
  }
}

import { Controller, Get, Post, Put, Param, Body, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@apcd/database';

import { PaymentsService } from './payments.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private service: PaymentsService) {}

  @Get('bank-details')
  @ApiOperation({ summary: 'Get NPC bank details for NEFT/RTGS' })
  getBankDetails() {
    return this.service.getBankDetails();
  }

  @Get('calculate/:applicationId')
  @Roles(Role.OEM)
  @ApiOperation({ summary: 'Calculate fees for an application' })
  async calculateFees(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.calculateFees(applicationId, user.sub);
  }

  @Get('application/:applicationId')
  @ApiOperation({ summary: 'Get payments for an application' })
  async getPaymentsForApplication(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ) {
    return this.service.getPaymentsForApplication(applicationId);
  }

  @Get('pending-verification')
  @Roles(Role.OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Get payments pending verification' })
  async getPendingVerificationPayments() {
    return this.service.getPendingVerificationPayments();
  }

  @Get('stats')
  @Roles(Role.OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Get payment statistics' })
  async getPaymentStats() {
    return this.service.getPaymentStats();
  }

  @Get(':id')
  @Roles(Role.OEM, Role.OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Get payment by ID' })
  async getPaymentById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getPaymentById(id);
  }

  @Post('razorpay/create-order')
  @Roles(Role.OEM)
  @ApiOperation({ summary: 'Create Razorpay payment order' })
  async createRazorpayOrder(
    @Body() dto: { applicationId: string; paymentType: string; amount: number },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.createRazorpayOrder(user.sub, dto as any);
  }

  @Post('razorpay/verify')
  @Roles(Role.OEM)
  @ApiOperation({ summary: 'Verify Razorpay payment' })
  async verifyRazorpayPayment(
    @Body() dto: { orderId: string; paymentId: string; signature: string },
  ) {
    return this.service.verifyRazorpayPayment(dto);
  }

  @Post('manual')
  @Roles(Role.OEM)
  @ApiOperation({ summary: 'Record manual NEFT/RTGS payment' })
  async recordManualPayment(
    @Body() dto: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.recordManualPayment(user.sub, dto);
  }

  @Put(':id/verify')
  @Roles(Role.OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Verify manual payment' })
  async verifyManualPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { isVerified: boolean; remarks?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.verifyManualPayment(
      id,
      user.sub,
      dto.isVerified,
      dto.remarks,
    );
  }
}
